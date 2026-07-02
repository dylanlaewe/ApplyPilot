import {
  ApplicationDisplayStatus,
  ApplicationNextStep,
  ApplicationPreparationSummary,
  ApplicationSession,
  ApplicationStatusHistoryEntry,
  DetectedField,
  SessionStatus,
  SubmissionConfirmationState
} from "@/types";

import { normalizeText } from "@/lib/utils";

function randomId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `application-${Math.random().toString(36).slice(2, 10)}`;
}

export const applicationStatusOrder: ApplicationDisplayStatus[] = [
  "in_progress",
  "ready_to_review",
  "submitted",
  "interview",
  "offer",
  "rejected",
  "archived"
];

const statusLabels: Record<ApplicationDisplayStatus, string> = {
  in_progress: "In progress",
  ready_to_review: "Ready to review",
  submitted: "Submitted",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  archived: "Archived"
};

const statusDescriptions: Record<ApplicationDisplayStatus, string> = {
  in_progress: "Still being prepared or finished by you in the browser.",
  ready_to_review: "Prepared by ApplyPilot and waiting for your final review.",
  submitted: "You confirmed this application was submitted.",
  interview: "The company moved the process forward.",
  offer: "You received an offer.",
  rejected: "The company declined or closed the process.",
  archived: "Hidden from the default list but kept locally."
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asIsoTimestamp(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function normalizeSessionStatus(value: unknown): SessionStatus {
  const status = asString(value);
  const allowed: SessionStatus[] = [
    "created",
    "opening_browser",
    "navigating",
    "waiting_for_user",
    "scanning",
    "filling",
    "verifying",
    "needs_review",
    "ready_for_submission",
    "submitted",
    "failed",
    "draft",
    "started",
    "in_progress",
    "rejected",
    "interview",
    "offer",
    "archived",
    "abandoned"
  ];

  return allowed.includes(status as SessionStatus) ? (status as SessionStatus) : "created";
}

export function mapSessionStatusToApplicationStatus(status: SessionStatus): ApplicationDisplayStatus {
  switch (status) {
    case "needs_review":
    case "ready_for_submission":
      return "ready_to_review";
    case "submitted":
      return "submitted";
    case "interview":
      return "interview";
    case "offer":
      return "offer";
    case "rejected":
      return "rejected";
    case "archived":
    case "abandoned":
      return "archived";
    default:
      return "in_progress";
  }
}

export function getApplicationStatusLabel(status: ApplicationDisplayStatus) {
  return statusLabels[status];
}

export function getApplicationStatusDescription(status: ApplicationDisplayStatus) {
  return statusDescriptions[status];
}

function normalizeApplicationDisplayStatus(value: unknown, fallback: ApplicationDisplayStatus) {
  return applicationStatusOrder.includes(value as ApplicationDisplayStatus)
    ? (value as ApplicationDisplayStatus)
    : fallback;
}

function normalizeSubmissionConfirmationState(
  value: unknown,
  fallback: SubmissionConfirmationState
): SubmissionConfirmationState {
  return ["unknown", "dismissed", "not_yet", "submitted"].includes(asString(value))
    ? (value as SubmissionConfirmationState)
    : fallback;
}

function normalizeDetectedFields(value: unknown): DetectedField[] {
  return Array.isArray(value) ? (value as DetectedField[]) : [];
}

function buildDefaultStatusMessage(status: SessionStatus) {
  switch (status) {
    case "waiting_for_user":
      return "The application form is not visible yet.";
    case "needs_review":
      return "A few answers still need you.";
    case "ready_for_submission":
      return "Ready for final review.";
    case "submitted":
      return "Submitted manually.";
    case "failed":
      return "Unable to continue.";
    default:
      return "Ready to open the application.";
  }
}

function buildDefaultNextAction(status: SessionStatus) {
  switch (status) {
    case "waiting_for_user":
      return "Finish any login or navigation steps in the browser, then continue.";
    case "needs_review":
      return "Review the remaining questions before you continue in the browser.";
    case "ready_for_submission":
      return "Review the page once more in the browser, then submit on the job site when you are ready.";
    case "submitted":
      return "Track the outcome or archive the record when you are ready.";
    case "failed":
      return "Review the issue, fix anything needed, and try again when you are ready.";
    default:
      return "Open the application page, then let ApplyPilot read the form when it becomes visible.";
  }
}

function buildStatusHistoryEntry(
  previousStatus: ApplicationDisplayStatus | null,
  newStatus: ApplicationDisplayStatus,
  timestamp: string
): ApplicationStatusHistoryEntry {
  return {
    id: randomId(),
    previousStatus,
    newStatus,
    timestamp
  };
}

function normalizeStatusHistory(
  value: unknown,
  {
    createdAt,
    updatedAt,
    submittedAt,
    currentStatus
  }: {
    createdAt: string;
    updatedAt: string;
    submittedAt: string;
    currentStatus: ApplicationDisplayStatus;
  }
) {
  const history = Array.isArray(value)
    ? value
        .map((entry) => {
          const record = asObject(entry);
          const nextStatus = normalizeApplicationDisplayStatus(record.newStatus, "in_progress");
          const previousStatusValue = record.previousStatus;
          return {
            id: asString(record.id, crypto.randomUUID()),
            previousStatus:
            previousStatusValue === null
                ? null
                : normalizeApplicationDisplayStatus(previousStatusValue, nextStatus),
            newStatus: nextStatus,
            timestamp: asIsoTimestamp(record.timestamp, updatedAt)
          } satisfies ApplicationStatusHistoryEntry;
        })
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    : [];

  if (history.length) {
    return history;
  }

  const derived: ApplicationStatusHistoryEntry[] = [buildStatusHistoryEntry(null, "in_progress", createdAt)];

  if (currentStatus === "submitted" && submittedAt) {
    derived.push(buildStatusHistoryEntry("in_progress", "submitted", submittedAt));
  } else if (currentStatus !== "in_progress") {
    derived.push(buildStatusHistoryEntry("in_progress", currentStatus, updatedAt));
  }

  return derived;
}

function normalizeNextStep(value: unknown): ApplicationNextStep | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const description = asString(record.description).trim();
  const dueDate = asString(record.dueDate).trim();
  const completed = asBoolean(record.completed);

  if (!description && !dueDate && !completed) {
    return null;
  }

  return {
    description,
    dueDate,
    completed
  };
}

export function derivePreparationSummary(session: Pick<
  ApplicationSession,
  "timeSpentSeconds" | "dogfoodTelemetry" | "fieldsFilledAndVerified" | "detectedFields"
>): ApplicationPreparationSummary {
  const suggestedAnswersUsed = session.detectedFields.filter(
    (field) => field.status === "filled" && field.answerSource !== "manual_user_answer"
  ).length;

  return {
    durationSeconds: session.timeSpentSeconds > 0 ? session.timeSpentSeconds : null,
    fieldsCompleted: session.fieldsFilledAndVerified || 0,
    questionsAnsweredByUser: session.dogfoodTelemetry?.manualAnswers ?? 0,
    suggestedAnswersUsed,
    correctionsMade: session.dogfoodTelemetry?.userCorrections ?? 0,
    retryCount: session.dogfoodTelemetry?.autofillRetries ?? 0
  };
}

function normalizePreparationSummary(
  value: unknown,
  fallback: ApplicationPreparationSummary
): ApplicationPreparationSummary {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  return {
    durationSeconds:
      typeof record.durationSeconds === "number" && Number.isFinite(record.durationSeconds)
        ? record.durationSeconds
        : fallback.durationSeconds,
    fieldsCompleted: asNumber(record.fieldsCompleted, fallback.fieldsCompleted),
    questionsAnsweredByUser: asNumber(record.questionsAnsweredByUser, fallback.questionsAnsweredByUser),
    suggestedAnswersUsed: asNumber(record.suggestedAnswersUsed, fallback.suggestedAnswersUsed),
    correctionsMade: asNumber(record.correctionsMade, fallback.correctionsMade),
    retryCount: asNumber(record.retryCount, fallback.retryCount)
  };
}

function buildMigrationFallback(index: number, message: string): ApplicationSession {
  const now = new Date().toISOString();
  return {
    id: `migration-${index}`,
    company: "Application record",
    roleTitle: "Needs attention",
    jobUrl: "",
    source: "",
    status: "failed",
    statusMessage: "One saved application record could not be fully loaded.",
    nextAction: "Your local data is still on disk. Review this record before deleting anything.",
    applicationStatus: "in_progress",
    statusHistory: [buildStatusHistoryEntry(null, "in_progress", now)],
    nextStep: null,
    detectedFields: [],
    notes: "",
    createdAt: now,
    updatedAt: now,
    submittedAt: "",
    auditLog: [],
    lastError: message,
    warnings: [message],
    browserStatus: "error",
    atsProvider: "generic",
    finalSubmitButtons: [],
    resumeUsed: "",
    resumeDisplayLabel: "",
    currentPageUrl: "",
    visitedPageUrls: [],
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
    preparationSummary: {
      durationSeconds: null,
      fieldsCompleted: 0,
      questionsAnsweredByUser: 0,
      suggestedAnswersUsed: 0,
      correctionsMade: 0,
      retryCount: 0
    },
    submissionConfirmationState: "unknown",
    submissionConfirmationUpdatedAt: ""
  };
}

export function normalizeApplicationSession(record: unknown, index = 0): ApplicationSession {
  try {
    const value = asObject(record);
    const now = new Date().toISOString();
    const createdAt = asIsoTimestamp(value.createdAt, now);
    const updatedAt = asIsoTimestamp(value.updatedAt, createdAt);
    const submittedAt = asIsoTimestamp(value.submittedAt, "");
    const status = normalizeSessionStatus(value.status);
    const applicationStatus = normalizeApplicationDisplayStatus(
      value.applicationStatus,
      mapSessionStatusToApplicationStatus(status)
    );
    const detectedFields = normalizeDetectedFields(value.detectedFields);

    const session: ApplicationSession = {
      id: asString(value.id, randomId()),
      company: asString(value.company),
      roleTitle: asString(value.roleTitle),
      jobUrl: asString(value.jobUrl),
      source: asString(value.source),
      status,
      statusMessage: asString(value.statusMessage, buildDefaultStatusMessage(status)),
      nextAction: asString(value.nextAction, buildDefaultNextAction(status)),
      applicationStatus,
      statusHistory: [],
      nextStep: normalizeNextStep(value.nextStep),
      detectedFields,
      notes: asString(value.notes),
      createdAt,
      updatedAt,
      submittedAt,
      auditLog: Array.isArray(value.auditLog) ? (value.auditLog as ApplicationSession["auditLog"]) : [],
      lastError: asString(value.lastError),
      warnings: asStringArray(value.warnings),
      captchaDetection: value.captchaDetection as ApplicationSession["captchaDetection"],
      captchaOverridePageUrl: asString(value.captchaOverridePageUrl),
      browserStatus: ["not_started", "open", "closed", "error"].includes(asString(value.browserStatus))
        ? (value.browserStatus as ApplicationSession["browserStatus"])
        : "not_started",
      atsProvider: ["greenhouse", "lever", "ashby", "workable", "workday", "generic"].includes(asString(value.atsProvider))
        ? (value.atsProvider as ApplicationSession["atsProvider"])
        : "generic",
      finalSubmitButtons: asStringArray(value.finalSubmitButtons),
      resumeUsed: asString(value.resumeUsed),
      resumeDisplayLabel: asString(value.resumeDisplayLabel) || asString(value.resumeUsed),
      currentPageUrl: asString(value.currentPageUrl, asString(value.jobUrl)),
      visitedPageUrls: asStringArray(value.visitedPageUrls),
      currentPageNumber: Math.max(1, asNumber(value.currentPageNumber, 1)),
      timeSpentSeconds: asNumber(value.timeSpentSeconds),
      numberOfFieldsFilled: asNumber(value.numberOfFieldsFilled),
      numberOfFieldsReviewed: asNumber(value.numberOfFieldsReviewed),
      numberOfFieldsSkipped: asNumber(value.numberOfFieldsSkipped),
      fieldsDetected: asNumber(value.fieldsDetected, detectedFields.length),
      fieldsAttempted: asNumber(value.fieldsAttempted),
      fieldsFilledAndVerified: asNumber(value.fieldsFilledAndVerified, asNumber(value.numberOfFieldsFilled)),
      fieldsUnresolved: asNumber(value.fieldsUnresolved),
      fieldsFailed: asNumber(value.fieldsFailed),
      metadataSource: asString(value.metadataSource),
      jobContext: value.jobContext as ApplicationSession["jobContext"],
      generatorHealth: value.generatorHealth as ApplicationSession["generatorHealth"],
      preparationSummary: undefined,
      submissionConfirmationState: "unknown",
      submissionConfirmationUpdatedAt: asString(value.submissionConfirmationUpdatedAt),
      dogfoodTelemetry: asObject(value.dogfoodTelemetry) as ApplicationSession["dogfoodTelemetry"]
    };

    session.statusHistory = normalizeStatusHistory(value.statusHistory, {
      createdAt,
      updatedAt,
      submittedAt,
      currentStatus: applicationStatus
    });
    session.preparationSummary = normalizePreparationSummary(value.preparationSummary, derivePreparationSummary(session));
    session.submissionConfirmationState = normalizeSubmissionConfirmationState(
      value.submissionConfirmationState,
      applicationStatus === "submitted" ? "submitted" : "unknown"
    );

    return session;
  } catch (error) {
    return buildMigrationFallback(
      index,
      error instanceof Error ? error.message : "One saved application record could not be migrated."
    );
  }
}

export function normalizeApplicationSessions(records: unknown[]): ApplicationSession[] {
  return records.map((record, index) => normalizeApplicationSession(record, index));
}

export function updateApplicationStatusHistory(
  session: ApplicationSession,
  nextStatus: ApplicationDisplayStatus,
  timestamp = new Date().toISOString()
) {
  const previousStatus = session.applicationStatus ?? mapSessionStatusToApplicationStatus(session.status);
  if (previousStatus === nextStatus) {
    return session.statusHistory ?? normalizeStatusHistory([], {
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      submittedAt: session.submittedAt || "",
      currentStatus: nextStatus
    });
  }

  return [...(session.statusHistory ?? []), buildStatusHistoryEntry(previousStatus, nextStatus, timestamp)];
}

export function applyUserFacingStatus(
  session: ApplicationSession,
  nextStatus: ApplicationDisplayStatus,
  timestamp = new Date().toISOString()
) {
  const nextInternalStatus =
    nextStatus === "submitted" || nextStatus === "interview" || nextStatus === "offer" || nextStatus === "rejected" || nextStatus === "archived"
      ? (nextStatus === "archived" ? "archived" : nextStatus)
      : session.status === "submitted" || session.status === "interview" || session.status === "offer" || session.status === "rejected" || session.status === "archived"
        ? nextStatus === "ready_to_review"
          ? "ready_for_submission"
          : "in_progress"
        : nextStatus === "ready_to_review"
          ? "ready_for_submission"
          : session.status;

  return {
    ...session,
    status: nextInternalStatus,
    applicationStatus: nextStatus,
    submittedAt: nextStatus === "submitted" ? session.submittedAt || timestamp : session.submittedAt,
    statusHistory: updateApplicationStatusHistory(session, nextStatus, timestamp),
    submissionConfirmationState:
      nextStatus === "submitted"
        ? "submitted"
        : session.submissionConfirmationState === "submitted"
          ? "unknown"
          : session.submissionConfirmationState,
    submissionConfirmationUpdatedAt: timestamp
  } satisfies ApplicationSession;
}

export function shouldShowSubmissionConfirmation(session: ApplicationSession) {
  return (
    session.status === "ready_for_submission" &&
    (session.applicationStatus ?? mapSessionStatusToApplicationStatus(session.status)) !== "submitted" &&
    session.submissionConfirmationState === "unknown"
  );
}

export function getResumePresentation(
  session: Pick<ApplicationSession, "resumeDisplayLabel" | "resumeUsed">,
  currentResume: { filename: string; fileExists: boolean }
) {
  const filename = (session.resumeDisplayLabel || session.resumeUsed || "").trim();
  if (!filename) {
    return { label: "Resume not recorded", available: false, missing: false };
  }

  const available = currentResume.fileExists && currentResume.filename.trim() === filename;
  return {
    label: available ? filename : "Resume file no longer available",
    available,
    missing: !available
  };
}

export function formatApplicationDate(value: string) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

export function formatPreparationDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return "Preparation time unavailable";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (!minutes) return `${remainingSeconds}s`;
  if (!remainingSeconds) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
}

export function buildPreparationHeadline(summary: ApplicationPreparationSummary) {
  return summary.durationSeconds ? `Prepared in ${formatPreparationDuration(summary.durationSeconds)}` : "Preparation time unavailable";
}

export function getApplicationSearchText(session: ApplicationSession) {
  const displayStatus = session.applicationStatus ?? mapSessionStatusToApplicationStatus(session.status);
  return normalizeText(
    [
      session.company,
      session.roleTitle,
      session.notes,
      getApplicationStatusLabel(displayStatus),
      session.nextStep?.description || ""
    ].join(" ")
  );
}

export type ApplicationSortKey = "most_recent" | "oldest" | "company" | "status" | "preparation_time";

export function filterAndSortApplications(
  sessions: ApplicationSession[],
  {
    search,
    status,
    sort
  }: {
    search: string;
    status: "all" | ApplicationDisplayStatus;
    sort: ApplicationSortKey;
  }
) {
  const normalizedSearch = normalizeText(search);
  const filtered = sessions.filter((session) => {
    const displayStatus = session.applicationStatus ?? mapSessionStatusToApplicationStatus(session.status);
    if (status !== "all" && displayStatus !== status) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return getApplicationSearchText(session).includes(normalizedSearch);
  });

  return filtered.sort((left, right) => {
    switch (sort) {
      case "oldest":
        return left.createdAt.localeCompare(right.createdAt);
      case "company":
        return `${left.company} ${left.roleTitle}`.localeCompare(`${right.company} ${right.roleTitle}`);
      case "status": {
        const leftStatus = left.applicationStatus ?? mapSessionStatusToApplicationStatus(left.status);
        const rightStatus = right.applicationStatus ?? mapSessionStatusToApplicationStatus(right.status);
        return applicationStatusOrder.indexOf(leftStatus) - applicationStatusOrder.indexOf(rightStatus);
      }
      case "preparation_time":
        return (right.preparationSummary?.durationSeconds ?? -1) - (left.preparationSummary?.durationSeconds ?? -1);
      case "most_recent":
      default:
        return right.updatedAt.localeCompare(left.updatedAt);
    }
  });
}

export function getApplicationCountSummary(visibleCount: number, totalCount: number) {
  if (!totalCount) {
    return "No applications yet";
  }

  if (visibleCount === totalCount) {
    return `${totalCount} tracked application${totalCount === 1 ? "" : "s"}`;
  }

  return `${visibleCount} of ${totalCount} applications shown`;
}

export function getApplicationPrimaryAction(session: ApplicationSession) {
  const displayStatus = session.applicationStatus ?? mapSessionStatusToApplicationStatus(session.status);
  if (displayStatus === "ready_to_review") {
    return { label: "Review application", href: `/?session=${session.id}` };
  }

  if (displayStatus === "in_progress") {
    return { label: "Continue application", href: `/?session=${session.id}` };
  }

  if (session.jobUrl.trim()) {
    return { label: "Open job posting", href: session.jobUrl };
  }

  return { label: "View details", href: "" };
}

export function getApplicationNextActionText(session: ApplicationSession) {
  if (session.nextStep?.description) {
    if (session.nextStep.completed) {
      return "Next step completed";
    }
    if (session.nextStep.dueDate) {
      return `Next: ${session.nextStep.description}`;
    }
    return session.nextStep.description;
  }

  const displayStatus = session.applicationStatus ?? mapSessionStatusToApplicationStatus(session.status);
  switch (displayStatus) {
    case "ready_to_review":
      return "Review before you submit";
    case "submitted":
      return "Track the outcome";
    case "interview":
      return "Prepare for the interview";
    case "offer":
      return "Review the offer";
    case "rejected":
      return "Capture anything you learned";
    case "archived":
      return "Hidden from the main list";
    default:
      return "Continue in Apply";
  }
}

export function isNextStepOverdue(nextStep: ApplicationNextStep | null, today = new Date()) {
  if (!nextStep?.dueDate || nextStep.completed) return false;
  const due = new Date(nextStep.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return due.getTime() < startOfToday;
}

export function buildApplicationInsights(sessions: ApplicationSession[]) {
  const submitted = sessions.filter((session) => {
    const status = session.applicationStatus ?? mapSessionStatusToApplicationStatus(session.status);
    return ["submitted", "interview", "offer", "rejected"].includes(status) || Boolean(session.submittedAt);
  });
  const interviews = sessions.filter((session) => (session.applicationStatus ?? mapSessionStatusToApplicationStatus(session.status)) === "interview");
  const offers = sessions.filter((session) => (session.applicationStatus ?? mapSessionStatusToApplicationStatus(session.status)) === "offer");
  const thisWeek = sessions.filter((session) => {
    const createdAt = new Date(session.createdAt);
    return !Number.isNaN(createdAt.getTime()) && Date.now() - createdAt.getTime() <= 7 * 24 * 60 * 60 * 1000;
  });
  const durations = sessions
    .map((session) => session.preparationSummary?.durationSeconds ?? null)
    .filter((value): value is number => typeof value === "number" && value > 0)
    .sort((left, right) => left - right);
  const correctionCounts = sessions.map((session) => session.preparationSummary?.correctionsMade ?? 0);
  const submittedCount = submitted.length;
  const responseRate = submittedCount ? Math.round(((interviews.length + offers.length) / submittedCount) * 100) : null;
  const medianPreparationTime =
    durations.length === 0
      ? null
      : durations.length % 2 === 1
        ? durations[(durations.length - 1) / 2]
        : Math.round((durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2);
  const averageCorrections = correctionCounts.length
    ? Math.round((correctionCounts.reduce((sum, value) => sum + value, 0) / correctionCounts.length) * 10) / 10
    : 0;

  return {
    totalApplications: sessions.length,
    applicationsThisWeek: thisWeek.length,
    submittedApplications: submittedCount,
    interviews: interviews.length,
    offers: offers.length,
    responseRate,
    responseRateLabel:
      responseRate === null ? "No response rate yet" : `Response rate: ${responseRate}% (${interviews.length + offers.length} of ${submittedCount} submitted applications)`,
    medianPreparationTime,
    averageCorrections,
    applicationsByStatus: applicationStatusOrder.map((status) => ({
      status,
      label: getApplicationStatusLabel(status),
      count: sessions.filter((session) => (session.applicationStatus ?? mapSessionStatusToApplicationStatus(session.status)) === status).length
    })),
    hasSmallSample: submittedCount > 0 && submittedCount < 5
  };
}

export function getStatusTimelineLabel(entry: ApplicationStatusHistoryEntry) {
  if (entry.previousStatus === null && entry.newStatus === "in_progress") {
    return "Application started";
  }
  if (entry.newStatus === "submitted") {
    return "Marked submitted";
  }
  if (entry.newStatus === "interview") {
    return "Interview scheduled";
  }
  return getApplicationStatusLabel(entry.newStatus);
}
