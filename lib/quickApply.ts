import { getAnswerBank } from "@/lib/answerBank";
import { appendAuditEntry, getApplicationSession, saveDetectedFields, updateApplicationSession } from "@/lib/applications";
import { createAuditEntry } from "@/lib/auditLog";
import { SAFE_AUTOFILL_THRESHOLD } from "@/lib/autofillRules";
import { hydrateAlreadySatisfiedFields, mergeDetectedFieldAttempts } from "@/lib/detectedFieldState";
import { buildSuggestedFields } from "@/lib/fieldMapping";
import { buildJobContext } from "@/lib/jobContext";
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
import { setBrowserOverlayState } from "@/lib/browserOverlay";
import { ensureSessionAutomation } from "@/lib/sessionAutomation";
import { getShortAnswerGeneratorRuntimeHealth, summarizeShortAnswerGeneratorHealth } from "@/lib/shortAnswerGenerator";
import { getSettings } from "@/lib/settings";
import { humanizeError, requiresExactOptionMatch } from "@/lib/safety";
import { ApplicationSession, AuditLogEntry, CaptchaDetectionStatus, DetectedField } from "@/types";
import { ensureWorkdayRepeatableSections, isWorkdayPage } from "@/lib/workday";
import {
  appendWorkdayDiagnostic,
  isWorkdayDiagnosticsEnabled,
  recordWorkdayFillAttempt,
  recordWorkdayFillResult,
  recordWorkdayNavigationEvent,
  recordWorkdayPageSnapshot
} from "@/lib/workdayDiagnostics";

type AutofillPassOptions = {
  trigger?: string;
  automatic?: boolean;
};

type FillPassRuntime = {
  attemptedKeys: Set<string>;
  duplicateAttemptCount: number;
  focusChangeCount: number;
  scrollCount: number;
  dropdownOpenAttempts: number;
};

function shouldAutofill(field: DetectedField) {
  return (
    field.autoFillAllowed &&
    field.confidence >= SAFE_AUTOFILL_THRESHOLD &&
    field.suggestedValue.trim() &&
    !["filled", "sensitive", "unknown", "error"].includes(field.status)
  );
}

function buildTelemetry(current?: ApplicationSession["dogfoodTelemetry"]) {
  return {
    sessionStartedAt: current?.sessionStartedAt ?? "",
    applicationFormReachedAt: current?.applicationFormReachedAt ?? "",
    initialAutofillCompletedAt: current?.initialAutofillCompletedAt ?? "",
    userReviewCompletedAt: current?.userReviewCompletedAt ?? "",
    readyForSubmissionAt: current?.readyForSubmissionAt ?? "",
    fieldsDetectedAtLastPass: current?.fieldsDetectedAtLastPass ?? 0,
    fieldsFilledVerifiedAtLastPass: current?.fieldsFilledVerifiedAtLastPass ?? 0,
    fieldsUnresolvedAtLastPass: current?.fieldsUnresolvedAtLastPass ?? 0,
    userCorrections: current?.userCorrections ?? 0,
    manualAnswers: current?.manualAnswers ?? 0,
    autofillRetries: current?.autofillRetries ?? 0,
    fillPassCount: current?.fillPassCount ?? 0,
    scrollCount: current?.scrollCount ?? 0,
    focusChangeCount: current?.focusChangeCount ?? 0,
    duplicateAttemptCount: current?.duplicateAttemptCount ?? 0,
    rescanCount: current?.rescanCount ?? 0,
    automaticPageTransitions: current?.automaticPageTransitions ?? 0,
    dropdownOpenAttempts: current?.dropdownOpenAttempts ?? 0,
    fieldsVerifiedAtLastPass: current?.fieldsVerifiedAtLastPass ?? 0,
    fieldsStalledAtLastPass: current?.fieldsStalledAtLastPass ?? 0,
    fieldsSkippedAtLastPass: current?.fieldsSkippedAtLastPass ?? 0
  };
}

function fieldPassKey(field: Pick<DetectedField, "intent" | "label" | "name" | "domId" | "entryIndex">) {
  return [field.intent, field.label, field.name, field.domId, String(field.entryIndex ?? 0)].join("::").toLowerCase();
}

function fieldSectionKey(field: Pick<DetectedField, "sectionLabel" | "sectionKind" | "entryIndex">) {
  return `${field.sectionKind || "other"}::${field.sectionLabel || ""}::${field.entryIndex ?? 0}`;
}

function sortDetectedFields(fields: DetectedField[]) {
  return [...fields].sort((left, right) => {
    const topDelta = (left.controlTop ?? Number.MAX_SAFE_INTEGER) - (right.controlTop ?? Number.MAX_SAFE_INTEGER);
    if (topDelta !== 0) return topDelta;
    const sectionDelta = fieldSectionKey(left).localeCompare(fieldSectionKey(right));
    if (sectionDelta !== 0) return sectionDelta;
    return left.label.localeCompare(right.label);
  });
}

async function isFieldNearViewport(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"], field: DetectedField) {
  return page
    .locator(field.selector)
    .first()
    .evaluate((element) => {
      if (!(element instanceof HTMLElement)) return true;
      const rect = element.getBoundingClientRect();
      return rect.top >= -80 && rect.bottom <= window.innerHeight + 120;
    })
    .catch(() => true);
}

async function scrollFieldSectionIntoView(
  page: Awaited<ReturnType<typeof launchBrowserSession>>["page"],
  field: DetectedField,
  runtime: FillPassRuntime
) {
  const isNearViewport = await isFieldNearViewport(page, field);
  if (isNearViewport) return;

  await page
    .locator(field.selector)
    .first()
    .evaluate((element) => {
      const container =
        element.closest("[data-automation-id='formSection'], section, fieldset, [role='group'], [data-applypilot-repeatable-entry]") ?? element;
      if (!(container instanceof HTMLElement)) return;
      container.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    })
    .catch(() => undefined);
  runtime.scrollCount += 1;
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
      nextAction: "Log in in the browser, then ApplyPilot will try this page again."
    };
  }

  if (!hasFields) {
    return {
      statusMessage: "The application form is not visible yet.",
      nextAction:
        captchaStatus === "confirmed_visible_challenge"
          ? "Finish the verification step in the browser, then ApplyPilot can continue."
          : "Complete any cookie, redirect, or navigation steps in the browser and wait for the form to appear."
    };
  }

  return null;
}

export async function runAutofillPass(sessionId: string, options: AutofillPassOptions = {}): Promise<ApplicationSession> {
  const session = await getApplicationSession(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const isRetry = session.detectedFields.length > 0 || ["needs_review", "ready_for_submission", "waiting_for_user", "failed"].includes(session.status);
  const runtime = await launchBrowserSession(session.currentPageUrl || session.jobUrl, sessionId, {
    navigate: false
  });
  await setBrowserOverlayState(runtime.page, "waiting");
  await waitForPageReadiness(runtime.page);
  await setBrowserOverlayState(runtime.page, "reading");

  const currentPageUrl = runtime.page.url();
  const pageChanged = Boolean(session.currentPageUrl && currentPageUrl && session.currentPageUrl !== currentPageUrl);
  const workdaySession = isWorkdayPage(currentPageUrl || session.jobUrl);
  const settings = await getSettings();
  const diagnosticsEnabled = workdaySession && isWorkdayDiagnosticsEnabled(settings, sessionId);

  if (diagnosticsEnabled) {
    await appendWorkdayDiagnostic(sessionId, {
      event: "page_readiness",
      phase: "ready",
      detail: {
        trigger: options.trigger || "manual",
        automatic: Boolean(options.automatic)
      }
    });
    await recordWorkdayPageSnapshot(sessionId, runtime.page, "ready", {
      trigger: options.trigger || "manual",
      automatic: Boolean(options.automatic)
    });
  }

  await syncMetadata(sessionId, currentPageUrl, false);
  const refreshedSession = (await getApplicationSession(sessionId)) ?? session;
  const generatorRuntimeHealth = getShortAnswerGeneratorRuntimeHealth();

  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    status: "scanning",
    statusMessage: pageChanged && options.automatic ? "New page detected." : "Reading the application form.",
    nextAction: pageChanged && options.automatic ? "ApplyPilot noticed a page change and is preparing the next visible form." : "ApplyPilot is inspecting visible fields on the current page.",
    browserStatus: "open",
    currentPageUrl,
    atsProvider: workdaySession ? "workday" : current.atsProvider
  }));

  const profile = await getApplicantProfile();
  if (workdaySession) {
    await ensureWorkdayRepeatableSections(runtime.page, profile);
    await waitForPageReadiness(runtime.page);
    if (diagnosticsEnabled) {
      await recordWorkdayPageSnapshot(sessionId, runtime.page, "post-repeatable-sections");
    }
  }

  const [rawFields, answerBank, pageSummary, captchaDetection, loginRequired] = await Promise.all([
    scanVisibleFields(runtime.page),
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

  if (diagnosticsEnabled) {
    await recordWorkdayPageSnapshot(sessionId, runtime.page, "post-scan", {
      fieldCount: rawFields.length,
      warningCount: pageSummary.warnings.length,
      loginRequired
    });
  }

  if (waiting) {
    await setBrowserOverlayState(runtime.page, "review", waiting.statusMessage);
    return updateApplicationSession(sessionId, (current) => {
      const dogfoodTelemetry = buildTelemetry(current.dogfoodTelemetry);
      return {
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
          ...dogfoodTelemetry,
          fieldsDetectedAtLastPass: 0,
          fieldsFilledVerifiedAtLastPass: 0,
          fieldsUnresolvedAtLastPass: 0,
          autofillRetries: dogfoodTelemetry.autofillRetries + (isRetry ? 1 : 0),
          fillPassCount: dogfoodTelemetry.fillPassCount + 1,
          rescanCount: dogfoodTelemetry.rescanCount + 1,
          automaticPageTransitions: dogfoodTelemetry.automaticPageTransitions + (options.automatic && pageChanged ? 1 : 0)
        }
      };
    });
  }

  const jobContext = buildJobContext({
    company: refreshedSession.company,
    roleTitle: refreshedSession.roleTitle,
    source: refreshedSession.source,
    notes: refreshedSession.notes,
    metadataSource: refreshedSession.metadataSource
  });

  const builtFields = buildSuggestedFields(rawFields, profile, answerBank, {
    company: refreshedSession.company,
    roleTitle: refreshedSession.roleTitle,
    source: refreshedSession.source,
    notes: refreshedSession.notes,
    metadataSource: refreshedSession.metadataSource
  });
  const detectedFields = sortDetectedFields(
    hydrateAlreadySatisfiedFields(mergeDetectedFieldAttempts(session.detectedFields, builtFields))
  );
  const sessionGeneratorHealth = summarizeShortAnswerGeneratorHealth(detectedFields, generatorRuntimeHealth);

  if (diagnosticsEnabled) {
    for (const field of detectedFields) {
      if (shouldAutofill(field)) continue;
      await recordWorkdayFillAttempt(sessionId, {
        phase: "skipped_before_fill",
        label: field.label || field.name || "field",
        intent: field.intent,
        controlType: field.controlType,
        sectionLabel: field.sectionLabel,
        entryIndex: field.entryIndex,
        exactMatchRequired: requiresExactOptionMatch(field.intent),
        skipReason: field.reason
      });
    }
  }

  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    status: "filling",
    statusMessage: "Filling the safe basics.",
    nextAction: options.automatic
      ? "ApplyPilot is quietly filling the safe fields it can verify on this page."
      : "ApplyPilot is filling only the basics it can match with confidence.",
    detectedFields,
    captchaDetection,
    jobContext,
    generatorHealth: sessionGeneratorHealth
  }));
  await setBrowserOverlayState(runtime.page, "filling");

  const auditEntries: AuditLogEntry[] = [];
  const fillRuntime: FillPassRuntime = {
    attemptedKeys: new Set<string>(),
    duplicateAttemptCount: 0,
    focusChangeCount: 0,
    scrollCount: 0,
    dropdownOpenAttempts: 0
  };

  let lastScrolledSection = "";
  let severeRegressionDetected = false;
  for (const field of detectedFields) {
    if (!shouldAutofill(field)) continue;

    const passKey = fieldPassKey(field);
    if (fillRuntime.attemptedKeys.has(passKey)) {
      fillRuntime.duplicateAttemptCount += 1;
      continue;
    }
    fillRuntime.attemptedKeys.add(passKey);

    const sectionKey = fieldSectionKey(field);
    if (sectionKey !== lastScrolledSection) {
      await scrollFieldSectionIntoView(runtime.page, field, fillRuntime);
      lastScrolledSection = sectionKey;
    }

    if (diagnosticsEnabled) {
      await recordWorkdayFillAttempt(sessionId, {
        phase: "fill_attempt",
        label: field.label || field.name || "field",
        intent: field.intent,
        controlType: field.controlType,
        sectionLabel: field.sectionLabel,
        entryIndex: field.entryIndex,
        exactMatchRequired: requiresExactOptionMatch(field.intent)
      });
    }

    try {
      const verification = await fillField(runtime.page, field, field.suggestedValue, fillRuntime);
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
            ? "A reviewed short-answer draft was inserted and verified on the page."
            : `Intent ${field.intent} matched with ${Math.round(field.confidence * 100)}% confidence and was verified on the page.`
        })
      );
      if (diagnosticsEnabled) {
        await recordWorkdayFillResult(sessionId, {
          phase: "fill_result",
          label: field.label || field.name || "field",
          intent: field.intent,
          success: true,
          verificationMessage: verification.message
        });
      }
    } catch (error) {
      field.status = "error";
      field.reviewCategory = "error";
      field.reason = `Autofill failed: ${humanizeError(error)}`;
      field.verificationStatus = "failed";
      field.verificationMessage = humanizeError(error);
      const severe = requiresExactOptionMatch(field.intent);
      auditEntries.push(
        createAuditEntry(sessionId, "error", `Autofill failed for ${field.label || field.name || "field"}.`, {
          fieldId: field.id,
          reason: field.reason
        })
      );
      if (diagnosticsEnabled) {
        await recordWorkdayFillResult(sessionId, {
          phase: "fill_result",
          label: field.label || field.name || "field",
          intent: field.intent,
          success: false,
          verificationMessage: field.verificationMessage,
          severe
        });
      }
      if (severe) {
        severeRegressionDetected = true;
        break;
      }
    }
  }

  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    status: "verifying",
    statusMessage: "Checking the filled answers.",
    nextAction: "ApplyPilot is checking that the page shows the answers it just placed."
  }));

  let updated = await saveDetectedFields(sessionId, detectedFields, pageSummary.warnings, pageSummary.finalSubmitButtons, currentPageUrl);
  updated = await updateApplicationSession(sessionId, (current) => ({
    ...current,
    captchaDetection
  }));

  if (pageChanged) {
    if (diagnosticsEnabled) {
      await recordWorkdayNavigationEvent(sessionId, runtime.page, {
        reason: options.automatic ? "automatic_page_change" : "page_changed",
        pageIdentity: currentPageUrl
      });
    }
    updated = await appendAuditEntry(
      sessionId,
      createAuditEntry(sessionId, "page_changed", "ApplyPilot detected a new application page.", {
        reason: options.automatic ? "The browser advanced to a new page and ApplyPilot continued automatically." : "The visible application page changed."
      })
    );
  }

  updated = await appendAuditEntry(
    sessionId,
    createAuditEntry(sessionId, "autofill_run_completed", "Quick Apply scanned, filled, and verified the current page.", {
      reason: "ApplyPilot only reported completion after reading the resulting values back from the page."
    })
  );

  for (const entry of auditEntries) {
    updated = await appendAuditEntry(sessionId, entry);
  }

  const finalized: ApplicationSession = await updateApplicationSession(sessionId, (current) => {
    const needsReview = current.detectedFields.some((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status));
    const nextStatus =
      current.fieldsDetected === 0
        ? "waiting_for_user"
        : needsReview
          ? "needs_review"
          : "ready_for_submission";
    const dogfoodTelemetry = buildTelemetry(current.dogfoodTelemetry);
    const now = new Date().toISOString();
    const verifiedCount = current.detectedFields.filter((field) => field.verificationStatus === "verified").length;
    const stalledCount = current.detectedFields.filter((field) => field.verificationStatus === "failed").length;
    const skippedCount = current.detectedFields.filter((field) => field.status === "skipped").length;

    return {
      ...current,
      status: nextStatus,
      statusMessage:
        current.fieldsDetected === 0
          ? "No form fields found."
          : severeRegressionDetected
            ? "A sensitive answer could not be verified."
          : current.fieldsFilledAndVerified === 0
            ? "Nothing safe was filled on this pass."
            : needsReview
              ? "A few answers still need you."
              : "Ready for final review.",
      nextAction: needsReview
        ? severeRegressionDetected
          ? "ApplyPilot paused because a sensitive answer could not be proven safe. Review that page manually before continuing."
          : "Review the remaining questions, then continue in the browser."
        : current.fieldsDetected === 0
          ? "Make sure the application form is visible, then use Fill this page if needed."
          : current.fieldsFilledAndVerified === 0
            ? "ApplyPilot scanned the page but could not verify any fills. Review the unresolved fields or try Fill this page after the page settles."
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
        autofillRetries: dogfoodTelemetry.autofillRetries + (isRetry ? 1 : 0),
        fillPassCount: dogfoodTelemetry.fillPassCount + 1,
        scrollCount: dogfoodTelemetry.scrollCount + fillRuntime.scrollCount,
        focusChangeCount: dogfoodTelemetry.focusChangeCount + fillRuntime.focusChangeCount,
        duplicateAttemptCount: dogfoodTelemetry.duplicateAttemptCount + fillRuntime.duplicateAttemptCount,
        rescanCount: dogfoodTelemetry.rescanCount + 1,
        automaticPageTransitions: dogfoodTelemetry.automaticPageTransitions + (options.automatic && pageChanged ? 1 : 0),
        dropdownOpenAttempts: dogfoodTelemetry.dropdownOpenAttempts + fillRuntime.dropdownOpenAttempts,
        fieldsVerifiedAtLastPass: verifiedCount,
        fieldsStalledAtLastPass: stalledCount,
        fieldsSkippedAtLastPass: skippedCount
      }
    };
  });

  await setBrowserOverlayState(
    runtime.page,
    finalized.status === "ready_for_submission" ? "finished" : "review",
    finalized.status === "ready_for_submission" ? "Finished" : "Needs your review"
  );
  if (diagnosticsEnabled) {
    await recordWorkdayPageSnapshot(sessionId, runtime.page, "final", {
      status: finalized.status,
      statusMessage: finalized.statusMessage
    });
  }

  return finalized;
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

  const runtime = await launchBrowserSession(session.jobUrl, sessionId);
  await setBrowserOverlayState(runtime.page, "waiting");
  await ensureSessionAutomation(sessionId, runtime.page, async (reason) => {
    await runAutofillPass(sessionId, { trigger: reason, automatic: true });
  });

  await updateApplicationSession(sessionId, (current) => ({
    ...current,
    status: "navigating",
    statusMessage: "Waiting for page.",
    nextAction: "ApplyPilot is waiting for the application page to finish loading.",
    browserStatus: "open"
  }));

  return runAutofillPass(sessionId, { trigger: "initial", automatic: false });
}
