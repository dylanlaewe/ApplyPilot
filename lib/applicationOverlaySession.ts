import type { Page } from "playwright";

import { appendAuditEntry, getApplicationSession, saveDetectedFields, updateApplicationSession } from "@/lib/applications";
import { ensureApplicationOverlay, registerApplicationOverlayBridge, type ApplicationOverlayActionResult } from "@/lib/applicationOverlay";
import { prepareDetectedFields } from "@/lib/autofillPreparation";
import { createAuditEntry } from "@/lib/auditLog";
import { submitCorrectionReport } from "@/lib/corrections";
import { fillField, launchBrowserSession, waitForPageReadiness } from "@/lib/playwrightSession";
import { humanizeError } from "@/lib/safety";
import { getSettings } from "@/lib/settings";
import { stopApplicationRuntime } from "@/lib/applicationRuntimeState";
import { ApplicationSession, DetectedField } from "@/types";

function unresolvedFields(fields: DetectedField[]) {
  return fields
    .filter((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status))
    .map((field) => ({
      label: field.label || field.questionText || field.name || "Field",
      reason:
        field.status === "sensitive"
          ? "This is a sensitive question."
          : field.status === "error"
            ? "This control needs manual review."
            : field.reason
    }));
}

function overlayStatusLabel(session: ApplicationSession) {
  if (session.status === "waiting_for_user") return "Waiting for the page";
  if (session.status === "scanning") return "Reading page";
  if (session.status === "filling") return "Filling safe fields";
  if (session.status === "verifying") return "Reading page";
  if (session.status === "needs_review") return "Needs your review";
  if (session.status === "ready_for_submission") return "Finished";
  if (session.status === "failed") return "Needs your review";
  return "Ready";
}

function summarizeSession(session: ApplicationSession, options?: { resumeUploaded?: boolean }) {
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

  return {
    ok: true,
    status: overlayStatusLabel(session),
    message: summaryParts.join(" / "),
    unresolved: unresolvedFields(session.detectedFields)
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
  await waitForPageReadiness(page);
  const prepared = await prepareDetectedFields(sessionId, page, session);
  if (prepared.waiting) {
    return {
      ok: true,
      status: prepared.waiting.statusMessage.includes("Sign-in") ? "Login required" : "Waiting for the page",
      message: prepared.waiting.nextAction,
      unresolved: []
    } satisfies ApplicationOverlayActionResult;
  }

  const nextSession: ApplicationSession = await saveDetectedFields(
    sessionId,
    prepared.detectedFields,
    prepared.pageSummary.warnings,
    prepared.pageSummary.finalSubmitButtons,
    page.url()
  );

  return {
    ok: true,
    status: unresolvedFields(nextSession.detectedFields).length ? "Needs your review" : "Ready",
    message: unresolvedFields(nextSession.detectedFields).length
      ? `${unresolvedFields(nextSession.detectedFields).length} field${unresolvedFields(nextSession.detectedFields).length === 1 ? "" : "s"} still need your attention.`
      : "No unresolved fields on this page right now.",
    unresolved: unresolvedFields(nextSession.detectedFields)
  } satisfies ApplicationOverlayActionResult;
}

async function uploadResumeForCurrentPage(sessionId: string, session: ApplicationSession, page: Page) {
  await waitForPageReadiness(page);
  const prepared = await prepareDetectedFields(sessionId, page, session);
  if (prepared.waiting) {
    return {
      ok: true,
      status: "Waiting for the page",
      message: prepared.waiting.nextAction,
      unresolved: []
    } satisfies ApplicationOverlayActionResult;
  }

  const resumeField = prepared.detectedFields.find((field) => field.intent === "resume_upload");
  if (!resumeField) {
    return {
      ok: true,
      status: "Ready",
      message: "No resume upload is needed on this page.",
      unresolved: unresolvedFields(prepared.detectedFields)
    } satisfies ApplicationOverlayActionResult;
  }

  if (!resumeField.suggestedValue.trim()) {
    return {
      ok: true,
      status: "Needs your review",
      message: "Resume needs your attention. ApplyPilot could not verify a local resume for this field.",
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
      unresolved: [{ label: resumeField.label || "Resume", reason: "Resume upload was not confirmed." }]
    } satisfies ApplicationOverlayActionResult;
  }
}

export async function ensureApplicationOverlayForSession(sessionId: string, page: Page) {
  const settings = await getSettings();

  await registerApplicationOverlayBridge(page, async ({ sessionId: targetSessionId, action, correction }) => {
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
    const updatedSession = await runAutofillPass(targetSessionId, {
      trigger: "manual",
      reuseOpenPage: settings.applicationBehavior.reuseBrowserWindow
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
  await ensureApplicationOverlayForSession(sessionId, runtime.page);
  return runtime;
}
