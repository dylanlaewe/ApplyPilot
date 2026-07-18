import type { Frame, Page } from "playwright";

import { appendAuditEntry, getApplicationSession, saveDetectedFields, updateApplicationSession } from "@/lib/applications";
import { ensureApplicationOverlayForSession } from "@/lib/applicationOverlaySession";
import { getApplicationTransitionDiagnostics, recordApplicationTransitionEvent } from "@/lib/applicationTransitionCoordinator";
import { createAuditEntry } from "@/lib/auditLog";
import { applyWaitingUpdate, prepareDetectedFields, type PreparedDetectedFields } from "@/lib/autofillPreparation";
import { writeWorkdayOverlayDiagnostic } from "@/lib/autofillDiagnostics";
import { fillField, launchBrowserSession, recoverFieldSelector, type BrowserRuntime, waitForPageReadiness } from "@/lib/playwrightSession";
import { ensureWorkdayRepeatableSectionReady } from "@/lib/workdayRepeatableSections";
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
import { detectWorkdayBarrier, prepareWorkdayAccountAssistFields } from "@/lib/workdayBarrier";

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
  mode: "application_form" | "account_assist";
  barrierKind: string;
  tenant: string;
  resumedAfterBarrier: boolean;
};

const WORKDAY_FIELD_RESOLUTION_TIMEOUT_MS = 1_500;
const WORKDAY_FIELD_FILL_TIMEOUT_MS = 12_000;
const WORKDAY_PASS_TIMEOUT_MS = 45_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

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

async function resolveWorkdayFieldHandle(page: Page, field: DetectedField) {
  const frame = resolveFieldFrame(page, field);
  let locator = frame.locator(field.selector).first();
  let count = await locator.count().catch(() => 0);

  if (!count) {
    const recoveredSelector = await recoverFieldSelector(frame, field).catch(() => "");
    if (recoveredSelector) {
      locator = frame.locator(recoveredSelector).first();
      count = await locator.count().catch(() => 0);
    }
  }

  if (!count) {
    return {
      frame,
      handle: null as Awaited<ReturnType<typeof locator.elementHandle>> | null
    };
  }

  const handle = await locator.elementHandle({ timeout: WORKDAY_FIELD_RESOLUTION_TIMEOUT_MS }).catch(() => null);
  return {
    frame,
    handle
  };
}

async function readWorkdayFieldMetrics(page: Page, fields: DetectedField[]) {
  return Promise.all(
    fields.map(async (field) => {
      const { handle } = await resolveWorkdayFieldHandle(page, field);
      if (!handle) {
        return {
          fieldId: field.id,
          top: Number.MAX_SAFE_INTEGER,
          bottom: Number.MAX_SAFE_INTEGER,
          inViewport: false,
          sectionKey: "page"
        };
      }

      const metrics = await handle
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

      await handle.dispose().catch(() => undefined);
      return metrics;
    })
  );
}

async function scrollWorkdayFieldIntoView(page: Page, field: DetectedField) {
  const { handle } = await resolveWorkdayFieldHandle(page, field);
  if (!handle) {
    return;
  }

  await handle
    .evaluate((element) => {
      if (!(element instanceof HTMLElement)) return;
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    })
    .catch(() => undefined);
  await handle.dispose().catch(() => undefined);
}

async function prepareWorkdaySafeFields(
  sessionId: string,
  session: ApplicationSession,
  isRetry: boolean,
  runtime: BrowserRuntime,
  recordDiagnostic?: (event: string, detail?: string) => void
): Promise<PreparedWorkdayWaitingState | PreparedWorkdaySafeState> {
  recordApplicationTransitionEvent(sessionId, "readiness_wait_started", runtime.page.url());
  await waitForWorkdayStablePage(runtime.page);
  recordApplicationTransitionEvent(sessionId, "readiness_wait_completed", runtime.page.url());
  await ensureWorkdayOverlayForSession(sessionId, runtime.page);
  recordApplicationTransitionEvent(sessionId, "overlay_confirmed", runtime.page.url());
  recordDiagnostic?.("page_resolved", runtime.page.url());

  const prepared = await prepareDetectedFields(sessionId, runtime.page, session);
  const workdayBarrier =
    prepared.workdayBarrier ?? (await detectWorkdayBarrier(runtime.page, { captchaDetection: prepared.captchaDetection }));
  const state = resumeWorkdaySafeMode(sessionId);
  const resumedAfterBarrier = workdayBarrier.formReached && Boolean(state.lastBarrierKind && state.lastBarrierKind !== "form_reached");
  state.lastBarrierKind = workdayBarrier.kind;
  recordDiagnostic?.("barrier_kind", workdayBarrier.kind);

  let preparedResult = prepared;
  if (!prepared.waiting && workdayBarrier.formReached) {
    const hasWorkExperiencePlaceholder = preparedResult.detectedFields.some(
      (field) => field.controlType === "repeatable_section" && /work experience/i.test(field.label || field.questionText || "")
    );

    if (hasWorkExperiencePlaceholder) {
      const sectionResult = await ensureWorkdayRepeatableSectionReady(runtime.page, "work_experience");
      recordDiagnostic?.("work_experience_section", sectionResult.reason);

      if (sectionResult.opened) {
        recordApplicationTransitionEvent(sessionId, "workday_work_experience_opened", sectionResult.reason);
        preparedResult = await prepareDetectedFields(sessionId, runtime.page, session);
      } else if (!sectionResult.alreadyVisible) {
        preparedResult = {
          ...preparedResult,
          detectedFields: preparedResult.detectedFields.map((field) =>
            field.controlType === "repeatable_section" && /work experience/i.test(field.label || field.questionText || "")
              ? {
                  ...field,
                  reason: sectionResult.reason
                }
              : field
          )
        };
      }
    }
  }

  const activePrepared = preparedResult;
  await writeWorkdayOverlayDiagnostic({
    sessionId,
    eventLog: getApplicationTransitionDiagnostics(sessionId).eventLog.map((item) => ({ event: item.event, detail: item.detail })),
    safeFieldsPlanned: 0,
    committed: 0,
    unresolved: 0,
    barrierType: workdayBarrier.kind,
    barrierReason: workdayBarrier.reason,
    barrierEvidence: workdayBarrier.evidence,
    tenant: workdayBarrier.tenant,
    formReached: workdayBarrier.formReached,
    resumedAfterBarrier,
    detectedAt: new Date().toISOString()
  }).catch(() => undefined);

    if (activePrepared.waiting) {
    if (workdayBarrier.kind === "account_creation_required") {
      const accountFields = prepareWorkdayAccountAssistFields(activePrepared.detectedFields);
      const assistFields = accountFields.filter(
        (field) =>
          field.autoFillAllowed &&
          field.suggestedValue.trim() &&
          field.type !== "password" &&
          !field.isDisabled
      );
      if (assistFields.length > 0) {
        const pageIdentity = await readWorkdayPageIdentity(runtime.page);
        const metrics = await readWorkdayFieldMetrics(runtime.page, assistFields);
        const plan = buildWorkdayExecutionPlan(assistFields, metrics);
        await updateApplicationSession(sessionId, (current) => ({
          ...current,
          atsProvider: "workday",
          status: "waiting_for_user",
          statusMessage: workdayBarrier.message,
          nextAction: workdayBarrier.nextAction,
          detectedFields: accountFields,
          warnings: activePrepared.pageSummary.warnings,
          finalSubmitButtons: activePrepared.pageSummary.finalSubmitButtons,
          captchaDetection: activePrepared.captchaDetection,
          currentPageUrl: runtime.page.url(),
          browserStatus: "open",
          jobContext: activePrepared.jobContext,
          generatorHealth: activePrepared.generatorHealth
        }));
        return {
          runtime,
          prepared: {
            ...activePrepared,
            detectedFields: accountFields
          },
          pageIdentity: pageIdentity.identity,
          safeFields: accountFields,
          plan,
          mode: "account_assist",
          barrierKind: workdayBarrier.kind,
          tenant: workdayBarrier.tenant,
          resumedAfterBarrier
        };
      }
    }

    return {
      runtime,
      prepared: activePrepared,
      waitingSession: await applyWaitingUpdate(
        sessionId,
        activePrepared.waiting,
        activePrepared.pageSummary,
        activePrepared.captchaDetection,
        runtime.page.url(),
        isRetry,
        activePrepared.generatorRuntimeHealth
      )
    };
  }

  const pageIdentity = await readWorkdayPageIdentity(runtime.page);
  const safeFields = applyWorkdaySafeModeRules(activePrepared.detectedFields, {
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
    warnings: activePrepared.pageSummary.warnings,
    finalSubmitButtons: activePrepared.pageSummary.finalSubmitButtons,
    captchaDetection: activePrepared.captchaDetection,
    currentPageUrl: runtime.page.url(),
    browserStatus: "open",
    jobContext: activePrepared.jobContext,
    generatorHealth: activePrepared.generatorHealth
  }));

  return {
    runtime,
    prepared: activePrepared,
    pageIdentity: pageIdentity.identity,
    safeFields,
    plan,
    mode: "application_form",
    barrierKind: workdayBarrier.kind,
    tenant: workdayBarrier.tenant,
    resumedAfterBarrier
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
  runtime: BrowserRuntime,
  recordDiagnostic?: (event: string, detail?: string) => void
): Promise<ApplicationSession> {
  const prepared = await prepareWorkdaySafeFields(sessionId, session, isRetry, runtime, recordDiagnostic);
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
      statusMessage: prepared.mode === "account_assist" ? "Filling safe account fields." : "Filling the safe basics.",
      nextAction:
        prepared.mode === "account_assist"
          ? "ApplyPilot is filling only safe name and email fields on this Workday account page."
          : "ApplyPilot is doing one careful Workday pass from top to bottom."
    }));

    const auditEntries: AuditLogEntry[] = [];
    await withTimeout(
      executeWorkdayFillPlan({
      plan: prepared.plan,
      isAlreadyVerified: (fieldKey) => getWorkdaySafeModeState(sessionId).verifiedFieldKeys.has(fieldKey),
      getLatestMetrics: async (field) => {
        const [metric] = await withTimeout(
          readWorkdayFieldMetrics(prepared.runtime.page, [field]),
          WORKDAY_FIELD_RESOLUTION_TIMEOUT_MS * 2,
          `Timed out locating ${field.label || field.name || "field"} on the Workday page.`
        );
        return {
          top: metric?.top ?? Number.MAX_SAFE_INTEGER,
          inViewport: metric?.inViewport ?? false,
          sectionKey: metric?.sectionKey || "page"
        };
      },
      scrollToField: async (field) => {
        await withTimeout(
          scrollWorkdayFieldIntoView(prepared.runtime.page, field),
          WORKDAY_FIELD_RESOLUTION_TIMEOUT_MS * 2,
          `Timed out scrolling ${field.label || field.name || "field"} into view.`
        );
      },
      fillOneField: async (field) => {
        try {
          const verification = await withTimeout(
            fillField(prepared.runtime.page, field, field.suggestedValue, {
              allowRetry: false,
              highlight: false,
              preferDirectInput: true
            }),
            WORKDAY_FIELD_FILL_TIMEOUT_MS,
            `Timed out filling ${field.label || field.name || "field"} on the Workday page.`
          );
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
    }),
      WORKDAY_PASS_TIMEOUT_MS,
      "Workday safe pass timed out before the page settled."
    );

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
      status:
        prepared.mode === "account_assist"
          ? "waiting_for_user"
          : current.detectedFields.some((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status))
            ? "needs_review"
            : "ready_for_submission",
      statusMessage:
        prepared.mode === "account_assist"
          ? "Create account required."
          : current.fieldsFilledAndVerified > 0
            ? "Finished a controlled Workday pass."
            : "Nothing safe was filled on this page.",
      nextAction:
        prepared.mode === "account_assist"
          ? "Finish the password, verification, and any legal steps in the browser. ApplyPilot will continue after the application form opens."
          : "Review the remaining fields in the browser. ApplyPilot did not select any uncertain answers.",
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
    await writeWorkdayOverlayDiagnostic({
      sessionId,
      eventLog: getApplicationTransitionDiagnostics(sessionId).eventLog.map((item) => ({ event: item.event, detail: item.detail })),
      safeFieldsPlanned: prepared.plan.length,
      committed,
      unresolved,
      barrierType: prepared.barrierKind,
      tenant: prepared.tenant,
      formReached: prepared.mode === "application_form",
      resumedAfterBarrier: prepared.resumedAfterBarrier,
      detectedAt: new Date().toISOString()
    }).catch(() => undefined);

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
