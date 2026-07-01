import { createAuditEntry } from "@/lib/auditLog";
import { buildJobContext } from "@/lib/jobContext";
import { readStorageFile, writeStorageFile } from "@/lib/storage";
import { ApplicationSession, DashboardStats, DetectedField, NewSessionInput } from "@/types";

const SESSIONS_FILE = "application-sessions.json";

function summarizeCounts(fields: DetectedField[]) {
  const verifiedFields = fields.filter(
    (field) => field.verificationStatus === "verified" && (field.status === "filled" || Boolean(field.suggestedValue.trim()))
  );

  return {
    fieldsDetected: fields.length,
    fieldsAttempted: fields.filter((field) => field.verificationStatus !== "not_attempted").length,
    fieldsFilledAndVerified: verifiedFields.length,
    fieldsUnresolved: fields.filter((field) => ["needs_review", "sensitive", "unknown"].includes(field.status)).length,
    fieldsFailed: fields.filter((field) => field.status === "error" || field.verificationStatus === "failed").length,
    numberOfFieldsFilled: verifiedFields.length,
    numberOfFieldsReviewed: fields.filter((field) => field.status === "needs_review" || field.status === "sensitive").length,
    numberOfFieldsSkipped: fields.filter((field) => field.status === "skipped").length
  };
}

function buildDefaultSession(input: NewSessionInput): ApplicationSession {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    company: input.company,
    roleTitle: input.roleTitle,
    jobUrl: input.jobUrl,
    source: input.source,
    notes: input.notes,
    status: "created",
    statusMessage: "Ready to open the application.",
    nextAction: "Open the application page, then let ApplyPilot read the form when it becomes visible.",
    detectedFields: [],
    createdAt: now,
    updatedAt: now,
    auditLog: [],
    warnings: [],
    browserStatus: "not_started",
    atsProvider: "generic",
    finalSubmitButtons: [],
    resumeUsed: "",
    captchaDetection: undefined,
    captchaOverridePageUrl: "",
    currentPageUrl: input.jobUrl,
    visitedPageUrls: input.jobUrl ? [input.jobUrl] : [],
    currentPageNumber: 1,
    timeSpentSeconds: 0,
    numberOfFieldsFilled: 0,
    numberOfFieldsReviewed: 0,
    numberOfFieldsSkipped: 0,
    fieldsDetected: 0,
    fieldsAttempted: 0,
    fieldsFilledAndVerified: 0,
    fieldsUnresolved: 0,
    fieldsFailed: 0,
    jobContext: buildJobContext({
      company: input.company,
      roleTitle: input.roleTitle,
      source: input.source,
      notes: input.notes
    }),
    dogfoodTelemetry: {
      sessionStartedAt: now,
      applicationFormReachedAt: "",
      initialAutofillCompletedAt: "",
      userReviewCompletedAt: "",
      readyForSubmissionAt: "",
      fieldsDetectedAtLastPass: 0,
      fieldsFilledVerifiedAtLastPass: 0,
      fieldsUnresolvedAtLastPass: 0,
      userCorrections: 0,
      manualAnswers: 0,
      autofillRetries: 0
    }
  };
}

export async function getApplicationSessions() {
  const sessions = await readStorageFile<ApplicationSession[]>(SESSIONS_FILE, []);
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getApplicationSession(id: string) {
  const sessions = await getApplicationSessions();
  return sessions.find((session) => session.id === id) ?? null;
}

export async function createApplicationSession(input: NewSessionInput) {
  const sessions = await getApplicationSessions();
  const session = buildDefaultSession(input);
  session.auditLog.push(createAuditEntry(session.id, "session_created", "Application session created."));
  await writeStorageFile(SESSIONS_FILE, [session, ...sessions]);
  return session;
}

export async function updateApplicationSession(
  id: string,
  updater: (session: ApplicationSession) => ApplicationSession
) {
  const sessions = await getApplicationSessions();
  let updatedSession: ApplicationSession | null = null;

  const nextSessions = sessions.map((session) => {
    if (session.id !== id) return session;
    const next = updater(session);
    updatedSession = {
      ...next,
      ...summarizeCounts(next.detectedFields),
      updatedAt: new Date().toISOString()
    };
    return updatedSession;
  });

  if (!updatedSession) {
    throw new Error("Session not found.");
  }

  await writeStorageFile(SESSIONS_FILE, nextSessions);
  return updatedSession;
}

export async function appendAuditEntry(id: string, entry: ApplicationSession["auditLog"][number]) {
  return updateApplicationSession(id, (session) => ({
    ...session,
    auditLog: [entry, ...session.auditLog]
  }));
}

export async function saveDetectedFields(
  id: string,
  detectedFields: DetectedField[],
  warnings: string[],
  finalSubmitButtons: string[],
  currentPageUrl: string
) {
  const requiresReview = detectedFields.some((field) =>
    ["needs_review", "sensitive", "unknown", "error"].includes(field.status)
  );
  const hasVisibleFields = detectedFields.length > 0;

  return updateApplicationSession(id, (session) => {
    const visitedPageUrls = currentPageUrl
      ? Array.from(new Set([...(session.visitedPageUrls ?? []), currentPageUrl]))
      : session.visitedPageUrls ?? [];

    return {
      ...session,
      detectedFields,
      warnings,
      finalSubmitButtons,
      captchaDetection: session.captchaDetection,
      currentPageUrl: currentPageUrl || session.currentPageUrl,
      visitedPageUrls,
      currentPageNumber: Math.max(visitedPageUrls.length, 1),
      status: !hasVisibleFields ? "waiting_for_user" : requiresReview ? "needs_review" : "ready_for_submission",
      statusMessage: !hasVisibleFields
        ? "The application form is not visible yet."
        : requiresReview
          ? "A few answers still need you."
          : "Ready for final review.",
      nextAction: !hasVisibleFields
        ? "Finish any login, cookie, or navigation steps in the browser, then continue autofill."
        : requiresReview
          ? "Review the remaining questions before you continue in the browser."
          : "Review the page once more in the browser, then submit on the job site when you are ready.",
      lastError: undefined
    };
  });
}

export async function setSessionError(id: string, message: string) {
  return updateApplicationSession(id, (session) => ({
    ...session,
    lastError: message,
    warnings: Array.from(new Set([message, ...session.warnings])),
    status: session.status === "submitted" ? session.status : "failed",
    statusMessage: "Unable to continue.",
    nextAction: "Review the issue, fix anything needed in the browser, and try again when you are ready.",
    browserStatus: session.browserStatus === "open" ? "open" : "error"
  }));
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const sessions = await getApplicationSessions();
  const submittedSessions = sessions.filter((session) => session.status === "submitted");
  const avgTimeSeconds =
    submittedSessions.reduce((total, session) => total + (session.timeSpentSeconds || 0), 0) /
    (submittedSessions.length || 1);

  return {
    applicationsStarted: sessions.filter((session) => !["archived", "abandoned"].includes(session.status)).length,
    readyForReview: sessions.filter((session) => ["needs_review", "ready_for_submission"].includes(session.status)).length,
    submittedManually: submittedSessions.length,
    needsAttention: sessions.filter(
      (session) =>
        Boolean(session.lastError) ||
        session.detectedFields.some((field) => ["needs_review", "sensitive", "error", "unknown"].includes(field.status))
    ).length,
    interviews: sessions.filter((session) => session.status === "interview").length,
    averageTimeMinutes: Math.round((avgTimeSeconds / 60) * 10) / 10
  };
}
