import { createAuditEntry } from "@/lib/auditLog";
import {
  applyUserFacingStatus,
  derivePreparationSummary,
  mapSessionStatusToApplicationStatus,
  normalizeApplicationSession,
  normalizeApplicationSessions
} from "@/lib/applicationsExperience";
import { buildJobContext } from "@/lib/jobContext";
import { getApplicantProfile } from "@/lib/profile";
import { getResumeFilename } from "@/lib/profileExperience";
import { readStorageFile, updateStorageFile, writeStorageFile } from "@/lib/storage";
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

function buildDefaultSession(input: NewSessionInput, resumeDisplayLabel: string): ApplicationSession {
  const now = new Date().toISOString();
  const session: ApplicationSession = {
    id: crypto.randomUUID(),
    company: input.company,
    roleTitle: input.roleTitle,
    jobUrl: input.jobUrl,
    source: input.source,
    notes: input.notes,
    status: "created",
    statusMessage: "Ready to open the application.",
    nextAction: "Open the application page, then let ApplyPilot read the form when it becomes visible.",
    applicationStatus: "in_progress",
    statusHistory: [
      {
        id: crypto.randomUUID(),
        previousStatus: null,
        newStatus: "in_progress",
        timestamp: now
      }
    ],
    nextStep: null,
    detectedFields: [],
    createdAt: now,
    updatedAt: now,
    auditLog: [],
    warnings: [],
    browserStatus: "not_started",
    atsProvider: "generic",
    finalSubmitButtons: [],
    resumeUsed: resumeDisplayLabel,
    resumeDisplayLabel,
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

  session.preparationSummary = derivePreparationSummary(session);
  session.submissionConfirmationState = "unknown";
  session.submissionConfirmationUpdatedAt = "";

  return session;
}

export async function getApplicationSessions() {
  const sessions = await readStorageFile<unknown[]>(SESSIONS_FILE, []);
  return normalizeApplicationSessions(sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getApplicationSession(id: string) {
  const sessions = await getApplicationSessions();
  return sessions.find((session) => session.id === id) ?? null;
}

export async function createApplicationSession(input: NewSessionInput) {
  const profile = await getApplicantProfile();
  const session = buildDefaultSession(input, getResumeFilename(profile));
  session.auditLog.push(createAuditEntry(session.id, "session_created", "Application session created."));
  await updateStorageFile<ApplicationSession[]>(SESSIONS_FILE, [], (sessions) => [session, ...normalizeApplicationSessions(sessions)]);
  return session;
}

export async function updateApplicationSession(
  id: string,
  updater: (session: ApplicationSession) => ApplicationSession
) {
  let updatedSession: ApplicationSession | null = null;

  const nextSessions = await updateStorageFile<ApplicationSession[]>(SESSIONS_FILE, [], (storedSessions) => {
    const sessions = normalizeApplicationSessions(storedSessions);

    const updated = sessions.map((session) => {
      if (session.id !== id) return session;
      const next = normalizeApplicationSession(updater(session));
      const hydrated = {
        ...next,
        ...summarizeCounts(next.detectedFields),
        updatedAt: new Date().toISOString()
      };
      hydrated.preparationSummary = derivePreparationSummary(hydrated);
      if (!hydrated.applicationStatus) {
        hydrated.applicationStatus = mapSessionStatusToApplicationStatus(hydrated.status);
      }
      if (!hydrated.statusHistory?.length) {
        hydrated.statusHistory = normalizeApplicationSession(hydrated).statusHistory;
      }
      if (!hydrated.resumeDisplayLabel && hydrated.resumeUsed) {
        hydrated.resumeDisplayLabel = hydrated.resumeUsed;
      }
      if (!hydrated.submissionConfirmationState) {
        hydrated.submissionConfirmationState = hydrated.applicationStatus === "submitted" ? "submitted" : "unknown";
      }
      updatedSession = hydrated;
      return hydrated;
    });

    return updated;
  });

  if (!updatedSession) {
    throw new Error("Session not found.");
  }

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
  const submittedSessions = sessions.filter((session) => session.applicationStatus === "submitted");
  const avgTimeSeconds =
    submittedSessions.reduce((total, session) => total + (session.timeSpentSeconds || 0), 0) /
    (submittedSessions.length || 1);

  return {
    applicationsStarted: sessions.filter((session) => session.applicationStatus !== "archived").length,
    readyForReview: sessions.filter((session) => session.applicationStatus === "ready_to_review").length,
    submittedManually: submittedSessions.length,
    needsAttention: sessions.filter(
      (session) =>
        Boolean(session.lastError) ||
        session.detectedFields.some((field) => ["needs_review", "sensitive", "error", "unknown"].includes(field.status))
    ).length,
    interviews: sessions.filter((session) => session.applicationStatus === "interview").length,
    averageTimeMinutes: Math.round((avgTimeSeconds / 60) * 10) / 10
  };
}

export async function deleteApplicationSession(id: string) {
  let removed = false;
  await updateStorageFile<ApplicationSession[]>(SESSIONS_FILE, [], (storedSessions) => {
    const sessions = normalizeApplicationSessions(storedSessions);
    const nextSessions = sessions.filter((session) => session.id !== id);
    removed = nextSessions.length !== sessions.length;
    return nextSessions;
  });

  if (!removed) {
    throw new Error("Session not found.");
  }
}

export async function updateApplicationDisplayStatus(id: string, status: ApplicationSession["applicationStatus"]) {
  if (!status) {
    throw new Error("Status is required.");
  }

  return updateApplicationSession(id, (session) => applyUserFacingStatus(session, status));
}
