import type { Page } from "playwright";

import { getAnswerBank } from "@/lib/answerBank";
import { getApplicationSession, updateApplicationSession } from "@/lib/applications";
import { hydrateAlreadySatisfiedFields } from "@/lib/detectedFieldState";
import { buildSuggestedFields } from "@/lib/fieldMapping";
import { extractJobMetadata } from "@/lib/jobMetadata";
import {
  detectCaptcha,
  detectLoginRequirement,
  launchBrowserSession,
  scanVisibleFields,
  summarizePageWarnings
} from "@/lib/playwrightSession";
import { getApplicantProfile } from "@/lib/profile";
import { getShortAnswerGeneratorRuntimeHealth, summarizeShortAnswerGeneratorHealth } from "@/lib/shortAnswerGenerator";
import { buildJobContext } from "@/lib/jobContext";
import { ApplicationSession, CaptchaDetectionStatus } from "@/types";
import { detectWorkdayBarrier } from "@/lib/workdayBarrier";

export async function syncMetadata(sessionId: string, url?: string, navigate = false) {
  const session = await getApplicationSession(sessionId);
  if (!session) return null;

  const runtime = await launchBrowserSession(url || session.currentPageUrl || session.jobUrl, sessionId, { navigate });
  const extracted = await extractJobMetadata(runtime.page);

  return updateApplicationSession(sessionId, (current) => ({
    ...current,
    company: extracted.company || current.company,
    roleTitle: extracted.roleTitle || current.roleTitle,
    metadataSource: extracted.source || current.metadataSource
  }));
}

export function waitingState({
  pageWarnings,
  hasFields,
  loginRequired,
  captchaStatus,
  formReachedOverride = false
}: {
  pageWarnings: string[];
  hasFields: boolean;
  loginRequired: boolean;
  captchaStatus: CaptchaDetectionStatus | undefined;
  formReachedOverride?: boolean;
}) {
  if (formReachedOverride) {
    return null;
  }

  if (loginRequired || pageWarnings.some((warning) => warning.toLowerCase().includes("login"))) {
    return {
      statusMessage: "Sign-in needed.",
      nextAction: "Log in in the browser, then try this page again."
    };
  }

  if (!hasFields) {
    return {
      statusMessage: "The application form is not visible yet.",
      nextAction:
        captchaStatus === "confirmed_visible_challenge"
          ? "A verification step may need to be completed in the browser. Finish it, then try this page again."
          : "Complete any cookie, redirect, or navigation steps in the browser, then try this page again."
    };
  }

  return null;
}

export async function prepareDetectedFields(sessionId: string, runtimePage: Page, session: ApplicationSession) {
  const generatorRuntimeHealth = getShortAnswerGeneratorRuntimeHealth();
  await syncMetadata(sessionId, runtimePage.url(), false);
  const refreshedSession = (await getApplicationSession(sessionId)) ?? session;

  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    status: "scanning",
    statusMessage: "Reading the application form.",
    nextAction: "ApplyPilot is inspecting visible fields on the current page.",
    browserStatus: "open",
    currentPageUrl: runtimePage.url()
  }));

  const [rawFields, profile, answerBank, pageSummary, captchaDetection, loginRequired] = await Promise.all([
    scanVisibleFields(runtimePage),
    getApplicantProfile(),
    getAnswerBank(),
    summarizePageWarnings(runtimePage),
    detectCaptcha(runtimePage),
    detectLoginRequirement(runtimePage)
  ]);
  const workdayBarrier =
    refreshedSession.atsProvider === "workday"
      ? await detectWorkdayBarrier(runtimePage, { captchaDetection })
      : null;

  const waiting =
    workdayBarrier && !workdayBarrier.formReached
      ? {
          statusMessage: workdayBarrier.message,
          nextAction: workdayBarrier.nextAction
        }
      : waitingState({
          pageWarnings: pageSummary.warnings,
          hasFields: rawFields.length > 0,
          loginRequired,
          captchaStatus: captchaDetection.status,
          formReachedOverride: Boolean(workdayBarrier?.formReached)
        });

  const jobContext = buildJobContext({
    company: refreshedSession.company,
    roleTitle: refreshedSession.roleTitle,
    source: refreshedSession.source,
    notes: refreshedSession.notes,
    metadataSource: refreshedSession.metadataSource
  });

  const detectedFields = hydrateAlreadySatisfiedFields(
    buildSuggestedFields(rawFields, profile, answerBank, {
      company: refreshedSession.company,
      roleTitle: refreshedSession.roleTitle,
      source: refreshedSession.source,
      notes: refreshedSession.notes,
      metadataSource: refreshedSession.metadataSource
    })
  );

  return {
    generatorRuntimeHealth,
    refreshedSession,
    pageSummary,
    captchaDetection,
    workdayBarrier,
    waiting,
    jobContext,
    detectedFields,
    generatorHealth: summarizeShortAnswerGeneratorHealth(detectedFields, generatorRuntimeHealth)
  };
}

export type PreparedDetectedFields = Awaited<ReturnType<typeof prepareDetectedFields>>;

export function applyWaitingUpdate(
  sessionId: string,
  waiting: NonNullable<ReturnType<typeof waitingState>>,
  pageSummary: Awaited<ReturnType<typeof summarizePageWarnings>>,
  captchaDetection: Awaited<ReturnType<typeof detectCaptcha>>,
  currentPageUrl: string,
  isRetry: boolean,
  generatorRuntimeHealth: ReturnType<typeof getShortAnswerGeneratorRuntimeHealth>
) {
  return updateApplicationSession(sessionId, (current) => ({
    ...current,
    detectedFields: [],
    warnings: pageSummary.warnings,
    captchaDetection,
    finalSubmitButtons: pageSummary.finalSubmitButtons,
    currentPageUrl,
    status: "waiting_for_user",
    statusMessage: waiting.statusMessage,
    nextAction: waiting.nextAction,
    browserStatus: "open",
    generatorHealth: generatorRuntimeHealth,
    dogfoodTelemetry: {
      ...(current.dogfoodTelemetry ?? {
        fieldsDetectedAtLastPass: 0,
        fieldsFilledVerifiedAtLastPass: 0,
        fieldsUnresolvedAtLastPass: 0,
        userCorrections: 0,
        manualAnswers: 0,
        autofillRetries: 0
      }),
      fieldsDetectedAtLastPass: 0,
      fieldsFilledVerifiedAtLastPass: 0,
      fieldsUnresolvedAtLastPass: 0,
      autofillRetries: (current.dogfoodTelemetry?.autofillRetries ?? 0) + (isRetry ? 1 : 0)
    }
  }));
}
