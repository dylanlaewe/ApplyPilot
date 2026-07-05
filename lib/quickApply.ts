import type { Frame, Page } from "playwright";

import { getAnswerBank } from "@/lib/answerBank";
import { appendAuditEntry, getApplicationSession, saveDetectedFields, updateApplicationSession } from "@/lib/applications";
import { createAuditEntry } from "@/lib/auditLog";
import { SAFE_AUTOFILL_THRESHOLD } from "@/lib/autofillRules";
import { hydrateAlreadySatisfiedFields } from "@/lib/detectedFieldState";
import { buildSuggestedFields } from "@/lib/fieldMapping";
import { extractJobMetadata } from "@/lib/jobMetadata";
import {
  detectCaptcha,
  detectAtsProvider,
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
import { saveWorkdayCapture } from "@/lib/workdayCapture";
import { ensureWorkdayOverlay, registerWorkdayOverlayBridge } from "@/lib/workdayOverlay";
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
  shouldUseWorkdaySafeMode,
  stopWorkdaySafeMode,
  summarizeWorkdayPassResult
} from "@/lib/workdaySafeMode";
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

async function prepareDetectedFields(sessionId: string, runtimePage: Page, session: ApplicationSession) {
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

  const waiting = waitingState({
    pageWarnings: pageSummary.warnings,
    hasFields: rawFields.length > 0,
    loginRequired,
    captchaStatus: captchaDetection.status
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
    waiting,
    jobContext,
    detectedFields,
    generatorHealth: summarizeShortAnswerGeneratorHealth(detectedFields, generatorRuntimeHealth)
  };
}

function applyWaitingUpdate(
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

type PreparedDetectedFields = Awaited<ReturnType<typeof prepareDetectedFields>>;

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

async function prepareWorkdaySafeFields(
  sessionId: string,
  session: ApplicationSession,
  isRetry: boolean
): Promise<PreparedWorkdayWaitingState | PreparedWorkdaySafeState> {
  const runtime = await launchBrowserSession(session.currentPageUrl || session.jobUrl, sessionId, { navigate: false });
  await waitForWorkdayStablePage(runtime.page);
  await ensureWorkdayOverlayForSession(sessionId, runtime.page);

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

async function runWorkdaySafePass(sessionId: string, session: ApplicationSession, isRetry: boolean): Promise<ApplicationSession> {
  const prepared = await prepareWorkdaySafeFields(sessionId, session, isRetry);
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

    return updated;
  } catch (error) {
    failWorkdayPass(sessionId);
    throw error;
  }
}

function unresolvedWorkdayFields(fields: DetectedField[]) {
  return fields
    .filter((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status))
    .map((field) => ({
      label: field.label || field.name || "Field",
      reason: field.reason
    }));
}

export async function ensureWorkdayOverlayForSession(sessionId: string, page: Page) {
  await registerWorkdayOverlayBridge(page, async ({ sessionId: targetSessionId, action }) => {
    const currentSession = await getApplicationSession(targetSessionId);
    if (!currentSession) {
      return {
        ok: false,
        status: "Needs review",
        message: "This application session is no longer available."
      };
    }

    if (action === "stop") {
      stopWorkdaySafeMode(targetSessionId);
      await updateApplicationSession(targetSessionId, (existing) => ({
        ...existing,
        status: "waiting_for_user",
        statusMessage: "ApplyPilot is stopped on this page.",
        nextAction: "Use the browser control again if you want to restart a safe pass."
      }));
      return {
        ok: true,
        status: "Stopped",
        message: "ApplyPilot stopped and will not run another pass until you ask."
      };
    }

    if (action === "capture-page") {
      const runtime = await launchBrowserSession(currentSession.currentPageUrl || currentSession.jobUrl, targetSessionId, { navigate: false });
      const capture = await saveWorkdayCapture(runtime.page);
      return {
        ok: true,
        status: "Finished",
        message: `Saved a sanitized capture for the ${capture.capture.pageType} page.`
      };
    }

    if (action === "show-unresolved") {
      const updated = await prepareWorkdaySafeFields(targetSessionId, currentSession, true);
      const fields = "waitingSession" in updated ? updated.waitingSession.detectedFields : updated.safeFields;
      return {
        ok: true,
        status: fields.length ? "Needs review" : "Ready",
        message: `${unresolvedWorkdayFields(fields).length} field${unresolvedWorkdayFields(fields).length === 1 ? "" : "s"} still need your review.`,
        unresolved: unresolvedWorkdayFields(fields)
      };
    }

    const updatedSession: ApplicationSession = await runWorkdaySafePass(targetSessionId, currentSession, true);
    return {
      ok: true,
      status: updatedSession.fieldsFilledAndVerified > 0 ? "Finished" : "Needs review",
      message: summarizeWorkdayPassResult(updatedSession.detectedFields),
      unresolved: unresolvedWorkdayFields(updatedSession.detectedFields)
    };
  });

  await ensureWorkdayOverlay(page, sessionId);
}

export async function runAutofillPass(sessionId: string): Promise<ApplicationSession> {
  const session = await getApplicationSession(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }
  const isRetry = session.detectedFields.length > 0 || ["needs_review", "ready_for_submission", "waiting_for_user", "failed"].includes(session.status);
  const atsProvider = detectAtsProvider(session.currentPageUrl || session.jobUrl);
  if (shouldUseWorkdaySafeMode({ ...session, atsProvider })) {
    return await runWorkdaySafePass(sessionId, { ...session, atsProvider }, isRetry);
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
