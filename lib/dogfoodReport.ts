import { getApplicationSessions } from "@/lib/applications";
import { getCorrectionReports } from "@/lib/corrections";
import { mapSessionStatusToApplicationStatus } from "@/lib/applicationsExperience";
import { ApplicationDisplayStatus, ApplicationSession, CorrectionReport, DogfoodReport } from "@/types";

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

function countShortAnswers(session: ApplicationSession) {
  return session.detectedFields.filter(
    (field) =>
      field.status === "filled" &&
      (Boolean(field.shortAnswer) || ["generated_answer", "answer_bank"].includes(field.answerSource))
  ).length;
}

export function buildDogfoodReportFromData(
  sessions: ApplicationSession[],
  correctionReports: CorrectionReport[]
): DogfoodReport {
  const preparedSessions = sessions.filter((session) => session.fieldsDetected > 0 || (session.preparationSummary?.fieldsCompleted ?? 0) > 0);
  const durationValues = preparedSessions
    .map((session) => session.preparationSummary?.durationSeconds ?? null)
    .filter((value): value is number => typeof value === "number" && value > 0);

  const autoCompletionRates = preparedSessions
    .map((session) => {
      const denominator = session.fieldsDetected || session.detectedFields.length || 0;
      if (!denominator) return null;
      return (session.fieldsFilledAndVerified / denominator) * 100;
    })
    .filter((value): value is number => value !== null);

  const applicationsByAts = ["greenhouse", "lever", "ashby", "workable", "workday", "generic"].map((atsProvider) => ({
    atsProvider: atsProvider as ApplicationSession["atsProvider"],
    count: preparedSessions.filter((session) => session.atsProvider === atsProvider).length
  }));

  const finalStates = (["in_progress", "ready_to_review", "submitted", "interview", "offer", "rejected", "archived"] as ApplicationDisplayStatus[]).map(
    (status) => ({
      status,
      count: preparedSessions.filter(
        (session) => (session.applicationStatus ?? mapSessionStatusToApplicationStatus(session.status)) === status
      ).length
    })
  );

  const shortAnswersInserted = preparedSessions.reduce((total, session) => total + countShortAnswers(session), 0);
  const shortAnswersEdited = correctionReports.filter((report) => ["answer_memory_correction", "generated_answer_issue"].includes(report.classification)).length;

  return {
    generatedAt: new Date().toISOString(),
    applicationsPrepared: preparedSessions.length,
    medianPreparationTimeSeconds: median(durationValues),
    averageAutomaticCompletionRate: autoCompletionRates.length ? round(autoCompletionRates.reduce((sum, value) => sum + value, 0) / autoCompletionRates.length) : 0,
    averageUserInputFields: preparedSessions.length
      ? round(
          preparedSessions.reduce((sum, session) => sum + (session.preparationSummary?.questionsAnsweredByUser ?? 0), 0) / preparedSessions.length
        )
      : 0,
    averageCorrections: preparedSessions.length
      ? round(preparedSessions.reduce((sum, session) => sum + (session.preparationSummary?.correctionsMade ?? 0), 0) / preparedSessions.length)
      : 0,
    retryCount: preparedSessions.reduce((sum, session) => sum + (session.preparationSummary?.retryCount ?? 0), 0),
    severeCorrections: correctionReports.filter((report) => report.severe).length,
    applicationsByAts,
    shortAnswersInserted,
    shortAnswersEdited,
    shortAnswersAcceptedUnchanged: Math.max(shortAnswersInserted - shortAnswersEdited, 0),
    finalStates
  };
}

export async function buildDogfoodReport() {
  const [sessions, correctionReports] = await Promise.all([getApplicationSessions(), getCorrectionReports()]);
  return buildDogfoodReportFromData(sessions, correctionReports);
}

export function buildDogfoodReportExport(report: DogfoodReport) {
  return {
    exportedAt: report.generatedAt,
    localOnly: true,
    redactions: [
      "No resume contents",
      "No street address",
      "No phone number",
      "No personal email",
      "No demographic responses",
      "No browser cookies",
      "No authentication data",
      "No raw application field values"
    ],
    report
  };
}

export function buildDogfoodMarkdownReport(report: DogfoodReport) {
  const lines = [
    "# ApplyPilot Dogfood Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    `- Applications prepared: ${report.applicationsPrepared}`,
    `- Median preparation time: ${report.medianPreparationTimeSeconds ? `${report.medianPreparationTimeSeconds}s` : "Unavailable"}`,
    `- Average automatic completion rate: ${report.averageAutomaticCompletionRate}%`,
    `- Average user-input fields: ${report.averageUserInputFields}`,
    `- Average corrections: ${report.averageCorrections}`,
    `- Retry count: ${report.retryCount}`,
    `- Severe corrections: ${report.severeCorrections}`,
    `- Short answers inserted: ${report.shortAnswersInserted}`,
    `- Short answers edited: ${report.shortAnswersEdited}`,
    `- Short answers accepted unchanged: ${report.shortAnswersAcceptedUnchanged}`,
    "",
    "## Applications by ATS",
    ...report.applicationsByAts.map((entry) => `- ${entry.atsProvider}: ${entry.count}`),
    "",
    "## Final states",
    ...report.finalStates.map((entry) => `- ${entry.status}: ${entry.count}`),
    "",
    "## Redaction defaults",
    "- Resume contents are excluded.",
    "- Street address, phone number, email, demographics, cookies, and raw field values are excluded."
  ];

  return lines.join("\n");
}
