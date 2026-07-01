import { getAnswerBank } from "@/lib/answerBank";
import { appendAuditEntry, getApplicationSession, saveDetectedFields, updateApplicationSession } from "@/lib/applications";
import { createAuditEntry } from "@/lib/auditLog";
import { SAFE_AUTOFILL_THRESHOLD } from "@/lib/autofillRules";
import { hydrateAlreadySatisfiedFields } from "@/lib/detectedFieldState";
import { buildSuggestedFields } from "@/lib/fieldMapping";
import { extractJobMetadata } from "@/lib/jobMetadata";
import {
  detectCaptcha,
  detectLoginRequirement,
  fillField,
  launchBrowserSession,
  scanVisibleFields,
  summarizePageWarnings,
  waitForPageReadiness
} from "@/lib/playwrightSession";
import { getApplicantProfile } from "@/lib/profile";
import { getShortAnswerGeneratorRuntimeHealth, summarizeShortAnswerGeneratorHealth } from "@/lib/shortAnswerGenerator";
import { humanizeError } from "@/lib/safety";
import { buildJobContext } from "@/lib/jobContext";
import { ApplicationSession, AuditLogEntry, CaptchaDetectionStatus, DetectedField } from "@/types";

function shouldAutofill(field: DetectedField) {
  return (
    field.autoFillAllowed &&
    field.confidence >= SAFE_AUTOFILL_THRESHOLD &&
    field.suggestedValue.trim() &&
    !["filled", "sensitive", "unknown", "error"].includes(field.status)
  );
}

async function syncMetadata(sessionId: string, url?: string, navigate = false) {
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

function waitingState({
  pageWarnings,
  hasFields,
  loginRequired,
  captchaStatus
}: {
  pageWarnings: string[];
  hasFields: boolean;
  loginRequired: boolean;
  captchaStatus: CaptchaDetectionStatus | undefined;
}) {
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

export async function runAutofillPass(sessionId: string): Promise<ApplicationSession> {
  const session = await getApplicationSession(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }
  const isRetry = session.detectedFields.length > 0 || ["needs_review", "ready_for_submission", "waiting_for_user", "failed"].includes(session.status);

  const runtime = await launchBrowserSession(session.currentPageUrl || session.jobUrl, sessionId, {
    navigate: false
  });
  await waitForPageReadiness(runtime.page);
  await syncMetadata(sessionId, runtime.page.url(), false);
  const refreshedSession = (await getApplicationSession(sessionId)) ?? session;
  const generatorRuntimeHealth = getShortAnswerGeneratorRuntimeHealth();

  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    status: "scanning",
    statusMessage: "Reading the job page.",
    nextAction: "ApplyPilot is checking the page for company, role, and visible application fields.",
    browserStatus: "open",
    currentPageUrl: runtime.page.url()
  }));

  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    status: "scanning",
    statusMessage: "Reading the application form.",
    nextAction: "ApplyPilot is inspecting visible fields on the current page.",
    browserStatus: "open",
    currentPageUrl: runtime.page.url()
  }));

  const [rawFields, profile, answerBank, pageSummary, captchaDetection, loginRequired] = await Promise.all([
    scanVisibleFields(runtime.page),
    getApplicantProfile(),
    getAnswerBank(),
    summarizePageWarnings(runtime.page),
    detectCaptcha(runtime.page),
    detectLoginRequirement(runtime.page)
  ]);

  const waiting = waitingState({
    pageWarnings: pageSummary.warnings,
    hasFields: rawFields.length > 0,
    loginRequired,
    captchaStatus: captchaDetection.status
  });

  if (waiting) {
    return updateApplicationSession(sessionId, (current) => ({
      ...current,
      detectedFields: [],
      warnings: pageSummary.warnings,
      captchaDetection,
      finalSubmitButtons: pageSummary.finalSubmitButtons,
      currentPageUrl: runtime.page.url(),
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
  const sessionGeneratorHealth = summarizeShortAnswerGeneratorHealth(detectedFields, generatorRuntimeHealth);
  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    status: "filling",
    statusMessage: "Filling the safe basics.",
    nextAction: "ApplyPilot is filling only the basics it can match with confidence.",
    detectedFields,
    captchaDetection,
    jobContext,
    generatorHealth: sessionGeneratorHealth
  }));

  const auditEntries: AuditLogEntry[] = [];
  for (const field of detectedFields) {
    if (!shouldAutofill(field)) continue;

    try {
      const verification = await fillField(runtime.page, field, field.suggestedValue);
      const keepInReview = Boolean(field.shortAnswer);
      field.detectedValue = verification.actualValue || field.suggestedValue;
      field.status = keepInReview ? "needs_review" : "filled";
      field.reviewCategory = keepInReview ? "unknown_custom" : null;
      field.reason = keepInReview
        ? `${field.reason} Draft inserted during Quick Apply. Review this answer before continuing.`
        : `${field.reason} Filled during Quick Apply.`;
      field.verificationStatus = "verified";
      field.verificationMessage = verification.message;
      auditEntries.push(
        createAuditEntry(sessionId, "field_filled", `Autofilled ${field.label || field.name || "field"}.`, {
          fieldId: field.id,
          reason: keepInReview
            ? `A reviewed short-answer draft was inserted and verified on the page.`
            : `Intent ${field.intent} matched with ${Math.round(field.confidence * 100)}% confidence and was verified on the page.`
        })
      );
    } catch (error) {
      field.status = "error";
      field.reviewCategory = "error";
      field.reason = `Autofill failed: ${humanizeError(error)}`;
      field.verificationStatus = "failed";
      field.verificationMessage = humanizeError(error);
      auditEntries.push(
        createAuditEntry(sessionId, "error", `Autofill failed for ${field.label || field.name || "field"}.`, {
          fieldId: field.id,
          reason: field.reason
        })
      );
    }
  }

  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    status: "verifying",
    statusMessage: "Checking the filled answers.",
    nextAction: "ApplyPilot is checking that the page shows the answers it just placed."
  }));

  let updated = await saveDetectedFields(sessionId, detectedFields, pageSummary.warnings, pageSummary.finalSubmitButtons, runtime.page.url());
  updated = await updateApplicationSession(sessionId, (current) => ({
    ...current,
    captchaDetection
  }));
  updated = await appendAuditEntry(
    sessionId,
    createAuditEntry(sessionId, "autofill_run_completed", "Quick Apply scanned, filled, and verified the current page.", {
      reason: "ApplyPilot only reported completion after reading the resulting values back from the page."
    })
  );

  for (const entry of auditEntries) {
    updated = await appendAuditEntry(sessionId, entry);
  }

  return updateApplicationSession(sessionId, (current) => ({
    ...(() => {
      const needsReview = current.detectedFields.some((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status));
      const nextStatus =
        current.fieldsDetected === 0
          ? "waiting_for_user"
          : needsReview
            ? "needs_review"
            : "ready_for_submission";
      const dogfoodTelemetry = current.dogfoodTelemetry ?? {
        fieldsDetectedAtLastPass: 0,
        fieldsFilledVerifiedAtLastPass: 0,
        fieldsUnresolvedAtLastPass: 0,
        userCorrections: 0,
        manualAnswers: 0,
        autofillRetries: 0
      };
      const now = new Date().toISOString();
      return {
        ...current,
        status: nextStatus,
        statusMessage:
          current.fieldsDetected === 0
            ? "No form fields found."
            : current.fieldsFilledAndVerified === 0
              ? "Nothing safe was filled on this pass."
              : needsReview
                ? "A few answers still need you."
                : "Ready for final review.",
        nextAction: needsReview
          ? "Review the remaining questions, then continue in the browser."
          : current.fieldsDetected === 0
            ? "Make sure the application form is visible, then try this page again."
            : current.fieldsFilledAndVerified === 0
              ? "ApplyPilot scanned the page but could not verify any fills. Review the fields or retry after the page settles."
              : "Review the page in the browser and submit on the job site when you are ready.",
        browserStatus: "open",
        captchaDetection,
        dogfoodTelemetry: {
          ...dogfoodTelemetry,
          applicationFormReachedAt: dogfoodTelemetry.applicationFormReachedAt || (current.fieldsDetected > 0 ? now : ""),
          initialAutofillCompletedAt: current.fieldsDetected > 0 ? dogfoodTelemetry.initialAutofillCompletedAt || now : dogfoodTelemetry.initialAutofillCompletedAt,
          readyForSubmissionAt: nextStatus === "ready_for_submission" ? dogfoodTelemetry.readyForSubmissionAt || now : dogfoodTelemetry.readyForSubmissionAt,
          fieldsDetectedAtLastPass: current.fieldsDetected,
          fieldsFilledVerifiedAtLastPass: current.fieldsFilledAndVerified,
          fieldsUnresolvedAtLastPass: current.fieldsUnresolved,
          autofillRetries: dogfoodTelemetry.autofillRetries + (isRetry ? 1 : 0)
        }
      };
    })()
  }));
}

export async function startQuickApply(sessionId: string): Promise<ApplicationSession> {
  const session = await getApplicationSession(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    status: "opening_browser",
    statusMessage: "Opening application.",
    nextAction: "ApplyPilot is opening the application window."
  }));

  await launchBrowserSession(session.jobUrl, sessionId);
  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    status: "navigating",
    statusMessage: "Waiting for page.",
    nextAction: "ApplyPilot is waiting for the application page to finish loading.",
    browserStatus: "open"
  }));

  return runAutofillPass(sessionId);
}
