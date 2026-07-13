import type { Frame, Page } from "playwright";

import { appendAuditEntry, getApplicationSession, saveDetectedFields, updateApplicationSession } from "@/lib/applications";
import { ensureApplicationOverlayForSession } from "@/lib/applicationOverlaySession";
import { recordApplicationTransitionEvent } from "@/lib/applicationTransitionCoordinator";
import { createAuditEntry } from "@/lib/auditLog";
import { applyWaitingUpdate, prepareDetectedFields, type PreparedDetectedFields } from "@/lib/autofillPreparation";
import { writeWorkdayOverlayDiagnostic } from "@/lib/autofillDiagnostics";
import { fillField, launchBrowserSession, waitForPageReadiness } from "@/lib/playwrightSession";
import { humanizeError } from "@/lib/safety";
import {
  applyWorkdaySafeModeRules,
  beginWorkdayPass,
  buildWorkdayExecutionPlan,
  buildWorkdayFieldKey,
  buildWorkdayPageIdentity,
  completeWorkdayPass,
  executeWorkdayFillPlan,
  failWorkdayPass,
  getWorkdaySafeModeState,
  resumeWorkdaySafeMode,
  stopWorkdaySafeMode,
  summarizeWorkdayPassResult
} from "@/lib/workdaySafeMode";
import { ApplicationSession, AuditLogEntry, DetectedField } from "@/types";

type PreparedWorkdayWaitingState = {
  runtime: Awaited<ReturnType<typeof launchBrowserSession>>;
  prepared: PreparedDetectedFields;
  waitingSession: ApplicationSession;
};

type PreparedWorkdaySafeState = {
  runtime: Awaited<ReturnType<typeof launchBrowserSession>>;
  prepared: PreparedDetectedFields;
  pageIdentity: string;
  safeFields: DetectedField[];
  plan: ReturnType<typeof buildWorkdayExecutionPlan>;
};

function resolveFieldFrame(page: Page, field: Pick<DetectedField, "frameUrl" | "frameName">): Frame {
  if (!field.frameUrl && !field.frameName) return page.mainFrame();

  return (
    page.frames().find((frame) => {
      if (field.frameUrl && frame.url() === field.frameUrl) return true;
      if (field.frameName && frame.name() === field.frameName) return true;
      return false;
    }) ?? page.mainFrame()
  );
}

async function waitForWorkdayStablePage(page: Page) {
  await waitForPageReadiness(page);
  const readSnapshot = async () =>
    page
      .evaluate(() => ({
        url: window.location.pathname,
        title: document.title,
        heading:
          (document.querySelector("h1, [data-automation-id='pageHeader'], [data-automation-id='formTitle']")?.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
      }))
      .catch(() => ({ url: "", title: "", heading: "" }));

  let previous = await readSnapshot();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForTimeout(350);
    const current = await readSnapshot();
    if (current.url === previous.url && current.title === previous.title && current.heading === previous.heading) {
      return current;
    }
    previous = current;
  }

  return previous;
}

async function readWorkdayPageIdentity(page: Page) {
  const details = await page
    .evaluate(() => ({
      hostname: window.location.hostname,
      pathname: window.location.pathname,
      title: document.title,
      heading:
        (document.querySelector("h1, [data-automation-id='pageHeader'], [data-automation-id='formTitle']")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
    }))
    .catch(() => ({
      hostname: "",
      pathname: "",
      title: "",
      heading: ""
    }));

  return {
    ...details,
    identity: buildWorkdayPageIdentity(details)
  };
}

async function readWorkdayFieldMetrics(page: Page, fields: DetectedField[]) {
  return Promise.all(
    fields.map(async (field) => {
      const frame = resolveFieldFrame(page, field);
      return frame
        .locator(field.selector)
        .first()
        .evaluate((element, fieldId) => {
          const rect = element.getBoundingClientRect();
          const inViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
          const section =
            element.closest("section, fieldset, [role='group'], [data-automation-id]")?.querySelector(
              "h1, h2, h3, h4, legend, [data-automation-id='sectionHeader']"
            ) ?? null;

          return {
            fieldId,
            top: rect.top + window.scrollY,
            bottom: rect.bottom + window.scrollY,
            inViewport,
            sectionKey: (section?.textContent || "").replace(/\s+/g, " ").trim() || "page"
          };
        }, field.id)
        .catch(() => ({
          fieldId: field.id,
          top: Number.MAX_SAFE_INTEGER,
          bottom: Number.MAX_SAFE_INTEGER,
          inViewport: false,
          sectionKey: "page"
        }));
    })
  );
}

async function scrollWorkdayFieldIntoView(page: Page, field: DetectedField) {
  const frame = resolveFieldFrame(page, field);
  await frame
    .locator(field.selector)
    .first()
    .evaluate((element) => {
      if (!(element instanceof HTMLElement)) return;
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    })
    .catch(() => undefined);
}

async function prepareWorkdaySafeFields(
  sessionId: string,
  session: ApplicationSession,
  isRetry: boolean,
  recordDiagnostic?: (event: string, detail?: string) => void
): Promise<PreparedWorkdayWaitingState | PreparedWorkdaySafeState> {
  const runtime = await launchBrowserSession(session.currentPageUrl || session.jobUrl, sessionId, { navigate: false });
  recordApplicationTransitionEvent(sessionId, "readiness_wait_started", runtime.page.url());
  await waitForWorkdayStablePage(runtime.page);
  recordApplicationTransitionEvent(sessionId, "readiness_wait_completed", runtime.page.url());
  await ensureWorkdayOverlayForSession(sessionId, runtime.page);
  recordApplicationTransitionEvent(sessionId, "overlay_confirmed", runtime.page.url());
  recordDiagnostic?.("page_resolved", runtime.page.url());

  const prepared = await prepareDetectedFields(sessionId, runtime.page, session);
  if (prepared.waiting) {
    return {
      runtime,
      prepared,
      waitingSession: await applyWaitingUpdate(
        sessionId,
        prepared.waiting,
        prepared.pageSummary,
        prepared.captchaDetection,
        runtime.page.url(),
        isRetry,
        prepared.generatorRuntimeHealth
      )
    };
  }

  const state = resumeWorkdaySafeMode(sessionId);
  const pageIdentity = await readWorkdayPageIdentity(runtime.page);
  const safeFields = applyWorkdaySafeModeRules(prepared.detectedFields, {
    verifiedFieldKeys: state.pageIdentity === pageIdentity.identity ? state.verifiedFieldKeys : new Set<string>()
  });
  const metrics = await readWorkdayFieldMetrics(runtime.page, safeFields);
  const plan = buildWorkdayExecutionPlan(safeFields, metrics);
  recordApplicationTransitionEvent(sessionId, "field_plan_created", `${plan.length} safe Workday field(s)`);
  recordDiagnostic?.("plan_created", `${plan.length} planned field(s)`);
  recordDiagnostic?.("safe_fields_count", String(safeFields.length));

  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    atsProvider: "workday",
    status: "waiting_for_user",
    statusMessage: "Ready for a controlled Workday pass.",
    nextAction: "Use the ApplyPilot control in the application window to fill safe fields or capture this page.",
    detectedFields: safeFields,
    warnings: prepared.pageSummary.warnings,
    finalSubmitButtons: prepared.pageSummary.finalSubmitButtons,
    captchaDetection: prepared.captchaDetection,
    currentPageUrl: runtime.page.url(),
    browserStatus: "open",
    jobContext: prepared.jobContext,
    generatorHealth: prepared.generatorHealth
  }));

  return {
    runtime,
    prepared,
    pageIdentity: pageIdentity.identity,
    safeFields,
    plan
  };
}

function unresolvedWorkdayFields(fields: DetectedField[]) {
  return fields
    .filter((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status))
    .map((field) => ({
      label: field.label || field.name || "Field",
      reason: field.reason
    }));
}

export async function runWorkdaySafePass(
  sessionId: string,
  session: ApplicationSession,
  isRetry: boolean,
  recordDiagnostic?: (event: string, detail?: string) => void
): Promise<ApplicationSession> {
  const prepared = await prepareWorkdaySafeFields(sessionId, session, isRetry, recordDiagnostic);
  if ("waitingSession" in prepared) {
    return prepared.waitingSession;
  }

  const start = beginWorkdayPass(sessionId, prepared.pageIdentity);
  if (!start.allowed) {
    return updateApplicationSession(sessionId, (current) => ({
      ...current,
      status: "waiting_for_user",
      statusMessage: start.reason === "Stopped" ? "ApplyPilot is stopped on this page." : "A safe pass is already running.",
      nextAction:
        start.reason === "Stopped"
          ? "Use the browser control if you want to re-enable ApplyPilot on this page."
          : "Wait for the current pass to finish before starting another one."
    }));
  }

  const verifiedFieldKeys: string[] = [];
  try {
    recordDiagnostic?.("pass_started");
    await updateApplicationSession(sessionId, (current) => ({
      ...current,
      status: "filling",
      statusMessage: "Filling the safe basics.",
      nextAction: "ApplyPilot is doing one careful Workday pass from top to bottom."
    }));

    const auditEntries: AuditLogEntry[] = [];
    await executeWorkdayFillPlan({
      plan: prepared.plan,
      isAlreadyVerified: (fieldKey) => getWorkdaySafeModeState(sessionId).verifiedFieldKeys.has(fieldKey),
      getLatestMetrics: async (field) => {
        const [metric] = await readWorkdayFieldMetrics(prepared.runtime.page, [field]);
        return {
          top: metric?.top ?? Number.MAX_SAFE_INTEGER,
          inViewport: metric?.inViewport ?? false,
          sectionKey: metric?.sectionKey || "page"
        };
      },
      scrollToField: async (field) => {
        await scrollWorkdayFieldIntoView(prepared.runtime.page, field);
      },
      fillOneField: async (field) => {
        try {
          const verification = await fillField(prepared.runtime.page, field, field.suggestedValue, {
            allowRetry: false,
            highlight: false,
            preferDirectInput: true
          });
          field.detectedValue = verification.actualValue || field.suggestedValue;
          field.status = "filled";
          field.verificationStatus = "verified";
          field.verificationMessage = verification.message;
          field.commitState = verification.commitState;
          field.reason = `${field.reason} Filled during Workday safe mode.`;
          const fieldKey = buildWorkdayFieldKey(field);
          verifiedFieldKeys.push(fieldKey);
          auditEntries.push(
            createAuditEntry(sessionId, "field_filled", `Filled ${field.label || field.name || "field"} in Workday safe mode.`, {
              fieldId: field.id,
              reason: "ApplyPilot filled this deterministic text field during a single controlled pass."
            })
          );
          return true;
        } catch (error) {
          field.status = "needs_review";
          field.verificationStatus = "failed";
          field.verificationMessage = humanizeError(error);
          field.commitState = (error as { commitState?: DetectedField["commitState"] }).commitState ?? "unresolved";
          field.reason = "ApplyPilot does not support this control yet";
          auditEntries.push(
            createAuditEntry(sessionId, "needs_review", `Left ${field.label || field.name || "field"} for manual review.`, {
              fieldId: field.id,
              reason: field.verificationMessage
            })
          );
          return false;
        }
      }
    });

    completeWorkdayPass(sessionId, verifiedFieldKeys);
    recordDiagnostic?.("pass_finished");
    recordApplicationTransitionEvent(sessionId, "overlay_updated", prepared.runtime.page.url());

    let updated = await saveDetectedFields(
      sessionId,
      prepared.safeFields,
      prepared.prepared.pageSummary.warnings,
      prepared.prepared.pageSummary.finalSubmitButtons,
      prepared.runtime.page.url()
    );
    for (const field of prepared.safeFields) {
      if (field.status === "filled" && field.verificationStatus === "verified") {
        updated = await appendAuditEntry(
          sessionId,
          createAuditEntry(sessionId, "field_filled", `Verified ${field.label || field.name || "field"} on the page.`, {
            fieldId: field.id,
            reason: "ApplyPilot verified the exact value shown after the Workday safe pass."
          })
        );
      }
    }

    updated = await updateApplicationSession(sessionId, (current) => ({
      ...current,
      atsProvider: "workday",
      status: current.detectedFields.some((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status))
        ? "needs_review"
        : "ready_for_submission",
      statusMessage:
        current.fieldsFilledAndVerified > 0 ? "Finished a controlled Workday pass." : "Nothing safe was filled on this page.",
      nextAction: "Review the remaining fields in the browser. ApplyPilot did not select any uncertain answers.",
      captchaDetection: prepared.prepared.captchaDetection
    }));

    await appendAuditEntry(
      sessionId,
      createAuditEntry(sessionId, "autofill_run_completed", "Completed a single Workday safe-mode pass.", {
        reason: summarizeWorkdayPassResult(prepared.safeFields)
      })
    );

    const committed = prepared.safeFields.filter((field) => field.status === "filled" && field.verificationStatus === "verified").length;
    const unresolved = prepared.safeFields.filter((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status)).length;
    recordDiagnostic?.("committed_count", String(committed));
    recordDiagnostic?.("unresolved_count", String(unresolved));

    return updated;
  } catch (error) {
    failWorkdayPass(sessionId);
    recordDiagnostic?.("failure_reason", humanizeError(error));
    throw error;
  }
}

export async function ensureWorkdayOverlayForSession(sessionId: string, page: Page) {
  await ensureApplicationOverlayForSession(sessionId, page);
}
