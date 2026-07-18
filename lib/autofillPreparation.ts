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
import { ApplicationSession, CaptchaDetectionStatus, DetectedField } from "@/types";
import { detectWorkdayBarrier } from "@/lib/workdayBarrier";

type WorkdaySectionSignal = {
  sectionLabels: string[];
};

function createWorkdayManualField(
  label: string,
  reason: string,
  options: {
    intent?: DetectedField["intent"];
    controlType?: DetectedField["controlType"];
  } = {}
): DetectedField {
  return {
    id: crypto.randomUUID(),
    label,
    name: "",
    domId: "",
    type: "text",
    selector: "",
    detectedValue: "",
    suggestedValue: "",
    confidence: 0.45,
    confidenceLevel: "needs_review",
    status: "needs_review",
    reason,
    sensitivity: "review",
    autoFillAllowed: false,
    intent: options.intent ?? "unknown",
    reviewCategory: "required_missing",
    answerSource: "unknown",
    verificationStatus: "not_attempted",
    controlType: options.controlType ?? "text",
    questionText: label,
    nearbyText: label,
    isRequired: true,
    isVisible: true,
    isDisabled: false,
    shortAnswer: null
  };
}

export function buildWorkdayManualSectionFields(signals: WorkdaySectionSignal) {
  const normalizedLabels = signals.sectionLabels.map((label) => label.trim()).filter(Boolean);
  const fields: DetectedField[] = [];

  if (normalizedLabels.some((label) => /work experience/i.test(label))) {
    fields.push(
      createWorkdayManualField(
        "Work Experience",
        "Repeatable section not yet supported.",
        { intent: "employer", controlType: "repeatable_section" }
      )
    );
  }

  if (normalizedLabels.some((label) => /^education$/i.test(label) || /education history/i.test(label))) {
    fields.push(
      createWorkdayManualField(
        "Education",
        "Repeatable section not yet supported.",
        { intent: "education_school", controlType: "repeatable_section" }
      )
    );
  }

  if (normalizedLabels.some((label) => /resume|cv/i.test(label))) {
    fields.push(
      createWorkdayManualField(
        "Resume / CV",
        "Resume upload detected, but Workday upload for this control is not supported yet.",
        { intent: "resume_upload", controlType: "file_upload_section" }
      )
    );
  }

  return fields;
}

async function detectWorkdayManualSections(page: Page): Promise<WorkdaySectionSignal> {
  const sectionLabels = await page
    .evaluate(() => {
      const isVisible = (element: Element | null) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };

      const labels = new Set<string>();
      for (const element of Array.from(document.querySelectorAll("h1, h2, h3, h4, legend, label, button, [data-automation-id]"))) {
        if (!isVisible(element)) continue;
        const text = (element.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        if (/^my experience$/i.test(text)) continue;
        if (/work experience|education|resume\s*\/?\s*cv/i.test(text)) {
          labels.add(text);
        }
      }

      return Array.from(labels);
    })
    .catch(() => []);

  return { sectionLabels };
}

function workdaySectionText(field: Pick<DetectedField, "label" | "questionText" | "nearbyText" | "name">) {
  return [field.label, field.questionText, field.nearbyText, field.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesWorkdaySection(field: DetectedField, label: string) {
  const text = workdaySectionText(field);
  if (label === "Work Experience") return /work experience/.test(text);
  if (label === "Education") return /\beducation\b/.test(text);
  if (label === "Resume / CV") return /resume|cv/.test(text);
  return false;
}

function isGenericUnsupportedWorkdaySection(field: DetectedField) {
  return (
    !field.suggestedValue.trim() &&
    !field.autoFillAllowed &&
    (field.intent === "unknown" || field.answerSource === "unknown") &&
    (/applypilot does not support this control yet/i.test(field.reason) || /no saved answer yet/i.test(field.reason))
  );
}

export function applyWorkdaySectionSemantics(fields: DetectedField[], signals: WorkdaySectionSignal) {
  const placeholders = buildWorkdayManualSectionFields(signals);
  if (!placeholders.length) return fields;

  const nextFields = [...fields];
  const resumeControlIndex = nextFields.findIndex(
    (field) => field.intent === "resume_upload" && (field.type === "file" || field.controlType === "file")
  );

  for (const placeholder of placeholders) {
    if (placeholder.label === "Resume / CV" && resumeControlIndex >= 0) {
      continue;
    }

    const replaceIndex = nextFields.findIndex((field) => matchesWorkdaySection(field, placeholder.label) && isGenericUnsupportedWorkdaySection(field));
    if (replaceIndex >= 0) {
      const current = nextFields[replaceIndex];
      nextFields[replaceIndex] = {
        ...current,
        label: placeholder.label,
        type: placeholder.type,
        suggestedValue: "",
        confidence: placeholder.confidence,
        confidenceLevel: placeholder.confidenceLevel,
        status: placeholder.status,
        reason: placeholder.reason,
        sensitivity: placeholder.sensitivity,
        autoFillAllowed: false,
        intent: placeholder.intent,
        reviewCategory: placeholder.reviewCategory,
        answerSource: placeholder.answerSource,
        verificationStatus: "not_attempted",
        verificationMessage: undefined,
        controlType: placeholder.controlType,
        questionText: placeholder.questionText,
        nearbyText: placeholder.nearbyText,
        selectOptions: undefined
      };
      continue;
    }

    const alreadyRepresented = nextFields.some((field) => matchesWorkdaySection(field, placeholder.label));
    if (!alreadyRepresented) {
      nextFields.push(placeholder);
    }
  }

  return nextFields;
}

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
  const workdaySectionSignals =
    refreshedSession.atsProvider === "workday" && Boolean(workdayBarrier?.formReached) ? await detectWorkdayManualSections(runtimePage) : null;
  const workdayFallbackFields =
    refreshedSession.atsProvider === "workday" &&
    detectedFields.length === 0 &&
    workdaySectionSignals
      ? buildWorkdayManualSectionFields(workdaySectionSignals)
      : [];
  const finalDetectedFields =
    refreshedSession.atsProvider === "workday" && workdaySectionSignals
      ? applyWorkdaySectionSemantics(workdayFallbackFields.length ? workdayFallbackFields : detectedFields, workdaySectionSignals)
      : workdayFallbackFields.length
        ? workdayFallbackFields
        : detectedFields;

  return {
    generatorRuntimeHealth,
    refreshedSession,
    pageSummary,
    captchaDetection,
    workdayBarrier,
    waiting,
    jobContext,
    detectedFields: finalDetectedFields,
    generatorHealth: summarizeShortAnswerGeneratorHealth(finalDetectedFields, generatorRuntimeHealth)
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
