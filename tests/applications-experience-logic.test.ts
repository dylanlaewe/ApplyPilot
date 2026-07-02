import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildApplicationInsights,
  normalizeApplicationSession,
  shouldShowSubmissionConfirmation
} from "@/lib/applicationsExperience";
import { ApplicationSession } from "@/types";

function makeSession(overrides: Partial<ApplicationSession> = {}): ApplicationSession {
  const base = normalizeApplicationSession({
    id: "session-1",
    company: "Acme",
    roleTitle: "Product Designer",
    jobUrl: "https://jobs.example.com/acme",
    source: "LinkedIn",
    status: "ready_for_submission",
    statusMessage: "Ready for final review.",
    nextAction: "Review the page once more in the browser, then submit on the job site when you are ready.",
    detectedFields: [],
    notes: "",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:20:00.000Z",
    auditLog: [],
    warnings: [],
    browserStatus: "open",
    atsProvider: "greenhouse",
    finalSubmitButtons: ["Submit application"],
    resumeUsed: "resume.pdf",
    currentPageUrl: "https://jobs.example.com/acme",
    visitedPageUrls: ["https://jobs.example.com/acme"],
    currentPageNumber: 1,
    timeSpentSeconds: 138,
    numberOfFieldsFilled: 18,
    numberOfFieldsReviewed: 3,
    numberOfFieldsSkipped: 0,
    fieldsDetected: 21,
    fieldsAttempted: 18,
    fieldsFilledAndVerified: 18,
    fieldsUnresolved: 3,
    fieldsFailed: 0,
    dogfoodTelemetry: {
      sessionStartedAt: "2026-07-01T12:00:00.000Z",
      applicationFormReachedAt: "2026-07-01T12:01:00.000Z",
      initialAutofillCompletedAt: "2026-07-01T12:02:18.000Z",
      userReviewCompletedAt: "2026-07-01T12:03:00.000Z",
      readyForSubmissionAt: "2026-07-01T12:03:15.000Z",
      fieldsDetectedAtLastPass: 21,
      fieldsFilledVerifiedAtLastPass: 18,
      fieldsUnresolvedAtLastPass: 3,
      userCorrections: 1,
      manualAnswers: 3,
      autofillRetries: 1
    }
  });

  return {
    ...base,
    ...overrides
  };
}

test("legacy application records normalize safely with user-facing defaults and status history", () => {
  const session = normalizeApplicationSession({
    id: "legacy-1",
    company: "Acme",
    roleTitle: "Designer",
    jobUrl: "https://jobs.example.com/designer",
    status: "submitted",
    submittedAt: "2026-07-03T12:10:00.000Z",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-03T12:10:00.000Z",
    detectedFields: [],
    auditLog: [],
    warnings: [],
    browserStatus: "closed",
    atsProvider: "generic",
    finalSubmitButtons: [],
    resumeUsed: "designer-resume.pdf",
    currentPageUrl: "https://jobs.example.com/designer",
    visitedPageUrls: ["https://jobs.example.com/designer"],
    currentPageNumber: 1,
    timeSpentSeconds: 240,
    numberOfFieldsFilled: 12,
    numberOfFieldsReviewed: 1,
    numberOfFieldsSkipped: 0,
    fieldsDetected: 13,
    fieldsAttempted: 12,
    fieldsFilledAndVerified: 12,
    fieldsUnresolved: 1,
    fieldsFailed: 0
  });

  assert.equal(session.applicationStatus, "submitted");
  assert.equal(session.resumeDisplayLabel, "designer-resume.pdf");
  assert.equal(session.statusHistory?.length, 2);
  assert.equal(session.statusHistory?.[0].newStatus, "in_progress");
  assert.equal(session.statusHistory?.[1].newStatus, "submitted");
  assert.equal(session.preparationSummary?.fieldsCompleted, 12);
  assert.equal(session.preparationSummary?.durationSeconds, 240);
});

test("submission confirmation only appears for likely final-review states until the user answers it", () => {
  const ready = makeSession();
  assert.equal(shouldShowSubmissionConfirmation(ready), true);

  const dismissed = makeSession({ submissionConfirmationState: "dismissed" });
  assert.equal(shouldShowSubmissionConfirmation(dismissed), false);

  const submitted = makeSession({ applicationStatus: "submitted", status: "submitted", submissionConfirmationState: "submitted" });
  assert.equal(shouldShowSubmissionConfirmation(submitted), false);
});

test("insights include counts, rates, and small-sample labeling without inventing missing values", () => {
  const sessions = [
    makeSession({ id: "1", applicationStatus: "submitted", status: "submitted" }),
    makeSession({ id: "2", applicationStatus: "interview", status: "interview" }),
    makeSession({ id: "3", applicationStatus: "offer", status: "offer" }),
    makeSession({ id: "4", applicationStatus: "in_progress", status: "in_progress", timeSpentSeconds: 0 })
  ];

  const insights = buildApplicationInsights(sessions);

  assert.equal(insights.totalApplications, 4);
  assert.equal(insights.submittedApplications, 3);
  assert.equal(insights.interviews, 1);
  assert.equal(insights.offers, 1);
  assert.equal(insights.responseRate, 67);
  assert.match(insights.responseRateLabel, /2 of 3 submitted applications/i);
  assert.equal(insights.hasSmallSample, true);
  assert.equal(insights.medianPreparationTime, 138);
});
