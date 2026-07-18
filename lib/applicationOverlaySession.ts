import type { Page } from "playwright";

import { appendAuditEntry, getApplicationSession, saveDetectedFields, updateApplicationSession } from "@/lib/applications";
import { ensureApplicationOverlay, registerApplicationOverlayBridge, type ApplicationOverlayActionResult } from "@/lib/applicationOverlay";
import { ensureApplicationTransitionCoordinator } from "@/lib/applicationTransitionCoordinator";
import { prepareDetectedFields } from "@/lib/autofillPreparation";
import { createAuditEntry } from "@/lib/auditLog";
import { bindSessionPage } from "@/lib/browserManager";
import { submitCorrectionReport } from "@/lib/corrections";
import { fillField, launchBrowserSession, waitForPageReadiness } from "@/lib/playwrightSession";
import { humanizeError } from "@/lib/safety";
import { getSettings } from "@/lib/settings";
import { stopApplicationRuntime } from "@/lib/applicationRuntimeState";
import { getWorkdayBarrierStatusLabel } from "@/lib/workdayBarrier";
import { resetWorkdayBarrierHistory } from "@/lib/workdaySafeMode";
import { ApplicationSession, DetectedField } from "@/types";

type OverlayFieldSummary = {
  label: string;
  status: string;
  intent?: string;
  target?: string;
  current?: string;
  source?: string;
  controlType?: string;
  reason?: string;
};

type OverlayUnresolvedSummary = OverlayFieldSummary & {
  reason: string;
};

const GENERIC_OVERLAY_LABELS = [/^items selected$/i, /^select one$/i, /^choose one$/i];
const OPTIONAL_DEBUG_ONLY_INTENTS = new Set(["phone_extension", "address_line_2"]);

function sourceLabel(field: DetectedField) {
  switch (field.answerSource) {
    case "explicit_profile":
      return field.sensitivity === "sensitive" ? "Explicit saved sensitive answer" : "Saved profile";
    case "derived_profile":
      return "Derived from saved profile";
    case "formatted_profile":
      return "Formatted from saved profile";
    case "answer_bank":
      return "Saved answer";
    case "generated_answer":
      return "Generated draft";
    case "approved_fallback":
      return "Approved fallback";
    case "manual_user_answer":
      return "Manual answer";
    default:
      return "Unknown source";
  }
}

function controlTypeLabel(field: DetectedField) {
  const value = field.controlType || field.type || "unknown";
  return value.replace(/_/g, " ");
}

function displayIntent(field: DetectedField) {
  return field.intent.replace(/_/g, " ");
}

function isGenericOverlayLabel(value: string) {
  const label = value.trim();
  return Boolean(label) && GENERIC_OVERLAY_LABELS.some((pattern) => pattern.test(label));
}

function bestOverlayLabel(field: DetectedField) {
  for (const candidate of [field.label, field.questionText, field.nearbyText, field.name]) {
    const cleaned = (candidate || "").trim();
    if (!cleaned) continue;
    if (isGenericOverlayLabel(cleaned)) continue;
    return cleaned;
  }
  return (field.label || field.questionText || field.name || "Field").trim() || "Field";
}

function recognizedStatusLabel(field: DetectedField) {
  if (field.status === "filled" && field.verificationStatus === "verified") {
    return "Filled and verified";
  }
  if (field.status === "filled") {
    return "Filled but unverified";
  }
  if (field.verificationStatus === "failed") {
    return "Attempt failed";
  }
  if (field.status === "sensitive") {
    return "Sensitive manual review";
  }
  if (field.status === "unknown") {
    return "Needs your answer";
  }
  if (field.status === "error") {
    return "Needs manual review";
  }
  if (field.autoFillAllowed && field.suggestedValue.trim()) {
    return "Recognized";
  }
  return "Detected";
}

function unresolvedStatusLabel(field: DetectedField) {
  if (field.status === "sensitive") return "Sensitive manual review";
  if (field.status === "unknown") return "Needs your answer";
  if (field.controlType === "repeatable_section" || field.controlType === "file_upload_section") return "Needs your input";
  if (field.verificationStatus === "failed" || field.status === "error") return "Attempt failed";
  return "Needs review";
}

function maskedTargetValue(field: DetectedField) {
  const target = field.matchedOption || field.suggestedValue || "";
  if (!target.trim()) {
    return field.answerSource === "unknown" ? "" : "No saved answer";
  }
  if (field.sensitivity === "sensitive") {
    return field.verificationStatus === "verified" ? "Sensitive answer verified" : "Sensitive answer available";
  }
  return target.length > 80 ? `${target.slice(0, 77)}...` : target;
}

function currentFieldValue(field: DetectedField) {
  const current = (field.detectedValue || "").trim();
  if (!current) return "";
  return current.length > 80 ? `${current.slice(0, 77)}...` : current;
}

function shouldHideOverlayField(field: DetectedField) {
  if (OPTIONAL_DEBUG_ONLY_INTENTS.has(field.intent) && !field.isRequired && !field.suggestedValue.trim() && !field.detectedValue.trim()) {
    return true;
  }

  return isGenericOverlayLabel((field.label || "").trim()) || isGenericOverlayLabel(bestOverlayLabel(field));
}

function unresolvedReason(field: DetectedField) {
  if (field.status === "sensitive") return "This is a sensitive question.";
  if (field.status === "error") return field.verificationMessage || "This control needs manual review.";
  return field.reason;
}

function buildOverlayFieldSummary(field: DetectedField): OverlayFieldSummary {
  return {
    label: bestOverlayLabel(field),
    status: recognizedStatusLabel(field),
    intent: displayIntent(field),
    target: maskedTargetValue(field) || undefined,
    current: currentFieldValue(field) || undefined,
    source: sourceLabel(field),
    controlType: controlTypeLabel(field),
    reason: unresolvedReason(field)
  };
}

export function buildOverlayFieldBuckets(fields: DetectedField[]) {
  const visibleFields = fields.filter((field) => !shouldHideOverlayField(field));
  const recognized: OverlayFieldSummary[] = [];
  const unresolved: OverlayUnresolvedSummary[] = [];

  for (const field of visibleFields) {
    const summary = buildOverlayFieldSummary(field);
    const needsManualReview =
      field.status === "needs_review" ||
      field.status === "sensitive" ||
      field.status === "unknown" ||
      field.status === "error";
    const attemptedButFailed = field.verificationStatus === "failed";

    if (needsManualReview && !attemptedButFailed) {
      unresolved.push({
        ...summary,
        status: unresolvedStatusLabel(field),
        reason: unresolvedReason(field) || "This field still needs your review."
      });
      continue;
    }

    if (
      field.status === "filled" ||
      field.verificationStatus === "verified" ||
      field.verificationStatus === "failed" ||
      Boolean(field.suggestedValue.trim()) ||
      field.answerSource !== "unknown"
    ) {
      recognized.push(summary);
    }
  }

  return { recognized, unresolved };
}

function overlayStatusLabel(session: ApplicationSession) {
  if (session.status === "waiting_for_user") {
    const normalized = session.statusMessage.toLowerCase();
    if (/login required/.test(normalized)) return getWorkdayBarrierStatusLabel("login_required");
    if (/create account required/.test(normalized)) return getWorkdayBarrierStatusLabel("account_creation_required");
    if (/email verification required/.test(normalized)) return getWorkdayBarrierStatusLabel("email_verification_required");
    if (/captcha required/.test(normalized)) return getWorkdayBarrierStatusLabel("captcha_required");
    if (/\bmfa required/.test(normalized)) return getWorkdayBarrierStatusLabel("mfa_required");
    if (/terms acknowledgement required/.test(normalized)) return getWorkdayBarrierStatusLabel("terms_required");
    if (/application start page detected/.test(normalized)) return getWorkdayBarrierStatusLabel("not_scorable");
    if (/job unavailable/.test(normalized)) return getWorkdayBarrierStatusLabel("site_unavailable");
    if (/application form detected/.test(normalized)) return getWorkdayBarrierStatusLabel("form_reached");
    return "Waiting for the page";
  }
  if (session.status === "scanning") return "Reading page";
  if (session.status === "filling") return "Filling safe fields";
  if (session.status === "verifying") return "Reading page";
  if (session.status === "needs_review") return "Needs your review";
  if (session.status === "ready_for_submission") return "Finished";
  if (session.status === "failed") return "Needs your review";
  return "Ready";
}

function summarizeSession(session: ApplicationSession, options?: { resumeUploaded?: boolean }) {
  if (session.status === "waiting_for_user") {
    const overlayFields = buildOverlayFieldBuckets(session.detectedFields);
    return {
      ok: true,
      status: overlayStatusLabel(session),
      message: session.nextAction || session.statusMessage || "ApplyPilot is waiting for the next safe step on this page.",
      recognized: overlayFields.recognized,
      unresolved: overlayFields.unresolved
    } satisfies ApplicationOverlayActionResult;
  }

  const summaryParts = [
    `${session.fieldsFilledAndVerified} field${session.fieldsFilledAndVerified === 1 ? "" : "s"} completed`,
    `${session.fieldsUnresolved} need${session.fieldsUnresolved === 1 ? "s" : ""} your input`
  ];
  if (options?.resumeUploaded) {
    summaryParts.push("Resume uploaded");
  }
  if (session.status === "ready_for_submission") {
    summaryParts.push("Ready for review");
  }

  const overlayFields = buildOverlayFieldBuckets(session.detectedFields);
  return {
    ok: true,
    status: overlayStatusLabel(session),
    message: summaryParts.join(" / "),
    recognized: overlayFields.recognized,
    unresolved: overlayFields.unresolved
  } satisfies ApplicationOverlayActionResult;
}

async function findDetectedFieldForCorrection(session: ApplicationSession, selector: string, question: string) {
  const normalizedQuestion = question.replace(/\s+/g, " ").trim().toLowerCase();

  return (
    session.detectedFields.find((field) => field.selector === selector) ??
    session.detectedFields.find((field) => {
      const text = [field.label, field.questionText, field.name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
      return Boolean(text) && text === normalizedQuestion;
    }) ??
    null
  );
}

async function reviewCurrentPage(sessionId: string, session: ApplicationSession, page: Page) {
  if (session.atsProvider === "workday") {
    resetWorkdayBarrierHistory(sessionId);
  }
  await waitForPageReadiness(page);
  const prepared = await prepareDetectedFields(sessionId, page, session);
  if (prepared.waiting) {
    const overlayFields = buildOverlayFieldBuckets(session.detectedFields);
    return {
      ok: true,
      status:
        prepared.workdayBarrier && !prepared.workdayBarrier.formReached
          ? getWorkdayBarrierStatusLabel(prepared.workdayBarrier.kind)
          : prepared.waiting.statusMessage.includes("Sign-in")
            ? "Login required"
            : "Waiting for the page",
      message: prepared.waiting.nextAction,
      recognized: overlayFields.recognized,
      unresolved: overlayFields.unresolved
    } satisfies ApplicationOverlayActionResult;
  }

  const nextSession: ApplicationSession = await saveDetectedFields(
    sessionId,
    prepared.detectedFields,
    prepared.pageSummary.warnings,
    prepared.pageSummary.finalSubmitButtons,
    page.url()
  );

  const overlayFields = buildOverlayFieldBuckets(nextSession.detectedFields);
  return {
    ok: true,
    status: overlayFields.unresolved.length ? "Needs your review" : "Ready",
    message: overlayFields.unresolved.length
      ? `${overlayFields.unresolved.length} field${overlayFields.unresolved.length === 1 ? "" : "s"} still need your attention.`
      : "No unresolved fields on this page right now.",
    recognized: overlayFields.recognized,
    unresolved: overlayFields.unresolved
  } satisfies ApplicationOverlayActionResult;
}

async function uploadResumeForCurrentPage(sessionId: string, session: ApplicationSession, page: Page) {
  await waitForPageReadiness(page);
  const prepared = await prepareDetectedFields(sessionId, page, session);
  if (prepared.waiting) {
    const overlayFields = buildOverlayFieldBuckets(session.detectedFields);
    return {
      ok: true,
      status:
        prepared.workdayBarrier && !prepared.workdayBarrier.formReached
          ? getWorkdayBarrierStatusLabel(prepared.workdayBarrier.kind)
          : "Waiting for the page",
      message: prepared.waiting.nextAction,
      recognized: overlayFields.recognized,
      unresolved: overlayFields.unresolved
    } satisfies ApplicationOverlayActionResult;
  }

  const resumeField = prepared.detectedFields.find((field) => field.intent === "resume_upload");
  if (!resumeField) {
    const overlayFields = buildOverlayFieldBuckets(prepared.detectedFields);
    return {
      ok: true,
      status: "Ready",
      message: "No resume upload is needed on this page.",
      recognized: overlayFields.recognized,
      unresolved: overlayFields.unresolved
    } satisfies ApplicationOverlayActionResult;
  }

  if (!resumeField.suggestedValue.trim()) {
    const overlayFields = buildOverlayFieldBuckets(prepared.detectedFields);
    return {
      ok: true,
      status: "Needs your review",
      message: "Resume needs your attention. ApplyPilot could not verify a local resume for this field.",
      recognized: overlayFields.recognized,
      unresolved: [{ label: resumeField.label || "Resume", reason: "Resume upload was not confirmed." }]
    } satisfies ApplicationOverlayActionResult;
  }

  try {
    const verification = await fillField(page, resumeField, resumeField.suggestedValue, {
      allowRetry: false
    });
    resumeField.detectedValue = verification.actualValue || resumeField.suggestedValue.split(/[\\/]/).pop() || "";
    resumeField.status = "filled";
    resumeField.reviewCategory = null;
    resumeField.verificationStatus = "verified";
    resumeField.verificationMessage = verification.message;
    resumeField.commitState = verification.commitState;
    resumeField.reason = "Resume uploaded and verified on the page.";

    const updated = await saveDetectedFields(
      sessionId,
      prepared.detectedFields,
      prepared.pageSummary.warnings,
      prepared.pageSummary.finalSubmitButtons,
      page.url()
    );
    await appendAuditEntry(
      sessionId,
      createAuditEntry(sessionId, "field_filled", `Uploaded ${resumeField.label || "resume"}.`, {
        fieldId: resumeField.id,
        reason: "ApplyPilot verified that the page accepted the local resume file."
      })
    );

    return summarizeSession(updated, { resumeUploaded: true });
  } catch (error) {
    resumeField.status = "needs_review";
    resumeField.reviewCategory = "error";
    resumeField.verificationStatus = "failed";
    resumeField.verificationMessage = humanizeError(error);
    resumeField.commitState = (error as { commitState?: DetectedField["commitState"] }).commitState ?? "unresolved";
    resumeField.reason = "Resume upload was not confirmed.";
    await saveDetectedFields(
      sessionId,
      prepared.detectedFields,
      prepared.pageSummary.warnings,
      prepared.pageSummary.finalSubmitButtons,
      page.url()
    );

    return {
      ok: true,
      status: "Needs your review",
      message: "Resume needs your attention. Try again or upload it manually.",
      recognized: buildOverlayFieldBuckets(prepared.detectedFields).recognized,
      unresolved: [{ label: resumeField.label || "Resume", reason: "Resume upload was not confirmed." }]
    } satisfies ApplicationOverlayActionResult;
  }
}

export async function ensureApplicationOverlayForSession(sessionId: string, page: Page) {
  const settings = await getSettings();
  bindSessionPage(sessionId, page);

  await registerApplicationOverlayBridge(page, async ({ sessionId: targetSessionId, action, correction }) => {
    bindSessionPage(targetSessionId, page);
    const currentSession = await getApplicationSession(targetSessionId);
    if (!currentSession) {
      return {
        ok: false,
        status: "Needs your review",
        message: "This application session is no longer available."
      } satisfies ApplicationOverlayActionResult;
    }

    if (action === "stop") {
      stopApplicationRuntime(targetSessionId);
      await updateApplicationSession(targetSessionId, (existing) => ({
        ...existing,
        status: "waiting_for_user",
        statusMessage: "ApplyPilot is stopped on this page.",
        nextAction: "Use Fill this page when you want ApplyPilot to continue."
      }));
      return {
        ok: true,
        status: "Stopped",
        message: "ApplyPilot paused and will wait for your next action."
      } satisfies ApplicationOverlayActionResult;
    }

    if (action === "show-unresolved") {
      return reviewCurrentPage(targetSessionId, currentSession, page);
    }

    if (action === "upload-resume") {
      return uploadResumeForCurrentPage(targetSessionId, currentSession, page);
    }

    if (action === "report-wrong-answer") {
      if (!correction?.fieldSelector && !correction?.visibleFieldQuestion) {
        return {
          ok: false,
          status: "Needs your review",
          message: "Select the incorrect field first, then save the correction."
        } satisfies ApplicationOverlayActionResult;
      }

      const matchedField = await findDetectedFieldForCorrection(
        currentSession,
        correction?.fieldSelector || "",
        correction?.visibleFieldQuestion || ""
      );
      if (!matchedField) {
        return {
          ok: false,
          status: "Needs your review",
          message: "ApplyPilot could not match that field to the current session."
        } satisfies ApplicationOverlayActionResult;
      }

      const result = await submitCorrectionReport({
        sessionId: targetSessionId,
        fieldId: matchedField.id,
        correctedValue: correction?.correctedValue || "",
        note: correction?.note,
        learningApproved: Boolean(correction?.learningApproved)
      });

      return {
        ok: true,
        status: "Finished",
        message:
          result.applied.profileUpdated || result.applied.answerSaved
            ? "Correction saved locally and reused when it is safe."
            : "Correction saved locally for review and regression tracking."
      } satisfies ApplicationOverlayActionResult;
    }

    const { runAutofillPass } = await import("@/lib/quickApply");
    if (currentSession.atsProvider === "workday") {
      resetWorkdayBarrierHistory(targetSessionId);
    }
    const updatedSession = await runAutofillPass(targetSessionId, {
      trigger: "manual",
      reuseOpenPage: settings.applicationBehavior.reuseBrowserWindow,
      preferredPage: page,
      focusPage: false
    });
    return summarizeSession(updatedSession);
  });

  await ensureApplicationOverlay(page, sessionId);
}

export async function prepareUniversalOverlayOnOpen(sessionId: string) {
  const session = await getApplicationSession(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const runtime = await launchBrowserSession(session.currentPageUrl || session.jobUrl, sessionId, {
    navigate: false,
    reuseOpenPage: true
  });
  await ensureApplicationTransitionCoordinator(sessionId, runtime.page);
  await ensureApplicationOverlayForSession(sessionId, runtime.page);
  return runtime;
}
