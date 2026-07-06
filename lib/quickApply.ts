import { appendAuditEntry, getApplicationSession, saveDetectedFields, updateApplicationSession } from "@/lib/applications";
import { prepareDetectedFields, applyWaitingUpdate } from "@/lib/autofillPreparation";
import { resolveAutomationStrategyForPage } from "@/lib/atsStrategy";
import { createAuditEntry } from "@/lib/auditLog";
import { writeGenericPassDiagnostic } from "@/lib/autofillDiagnostics";
import { SAFE_AUTOFILL_THRESHOLD } from "@/lib/autofillRules";
import { fillField, launchBrowserSession, waitForPageReadiness } from "@/lib/playwrightSession";
import { humanizeError } from "@/lib/safety";
import { getSettings } from "@/lib/settings";
import { runWorkdaySafePass } from "@/lib/workdayStrategy";
import { ApplicationSession, AuditLogEntry, DetectedField } from "@/types";

function shouldAutofill(field: DetectedField) {
  return (
    field.autoFillAllowed &&
    field.confidence >= SAFE_AUTOFILL_THRESHOLD &&
    field.suggestedValue.trim() &&
    !["filled", "sensitive", "unknown", "error"].includes(field.status)
  );
}

async function runGenericAutofillPass(sessionId: string, session: ApplicationSession, isRetry: boolean) {
  const runtime = await launchBrowserSession(session.currentPageUrl || session.jobUrl, sessionId, {
    navigate: false
  });
  await waitForPageReadiness(runtime.page);
  const prepared = await prepareDetectedFields(sessionId, runtime.page, session);

  if (prepared.waiting) {
    return applyWaitingUpdate(
      sessionId,
      prepared.waiting,
      prepared.pageSummary,
      prepared.captchaDetection,
      runtime.page.url(),
      isRetry,
      prepared.generatorRuntimeHealth
    );
  }

  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    status: "filling",
    statusMessage: "Filling the safe basics.",
    nextAction: "ApplyPilot is filling only the basics it can match with confidence.",
    detectedFields: prepared.detectedFields,
    captchaDetection: prepared.captchaDetection,
    jobContext: prepared.jobContext,
    generatorHealth: prepared.generatorHealth
  }));

  const auditEntries: AuditLogEntry[] = [];
  for (const field of prepared.detectedFields) {
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
      field.commitState = verification.commitState;
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
      field.commitState = (error as { commitState?: DetectedField["commitState"] }).commitState ?? "unresolved";
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

  let updated = await saveDetectedFields(
    sessionId,
    prepared.detectedFields,
    prepared.pageSummary.warnings,
    prepared.pageSummary.finalSubmitButtons,
    runtime.page.url()
  );
  updated = await updateApplicationSession(sessionId, (current) => ({
    ...current,
    captchaDetection: prepared.captchaDetection
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

  await writeGenericPassDiagnostic(sessionId, session.atsProvider, prepared.detectedFields).catch(() => undefined);

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
        captchaDetection: prepared.captchaDetection,
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

export async function runAutofillPass(sessionId: string): Promise<ApplicationSession> {
  const session = await getApplicationSession(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const isRetry = session.detectedFields.length > 0 || ["needs_review", "ready_for_submission", "waiting_for_user", "failed"].includes(session.status);
  const settings = await getSettings();
  const runtime = await launchBrowserSession(session.currentPageUrl || session.jobUrl, sessionId, {
    navigate: false
  });
  await waitForPageReadiness(runtime.page);

  const strategy = await resolveAutomationStrategyForPage({
    page: runtime.page,
    url: runtime.page.url() || session.currentPageUrl || session.jobUrl,
    settings
  });

  if (strategy.workdaySafeModeActive) {
    return runWorkdaySafePass(sessionId, session, isRetry);
  }

  return runGenericAutofillPass(sessionId, session, isRetry);
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
