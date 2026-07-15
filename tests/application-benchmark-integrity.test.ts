import assert from "node:assert/strict";
import test from "node:test";

import { buildOverallSummary, mergeTimedOutCaseResult } from "@/scripts/application-benchmark";

function createResult(overrides: Record<string, unknown> = {}) {
  return {
    id: "case-1",
    ats: "greenhouse" as const,
    phase: 1,
    company: "Example",
    roleTitle: "Engineer",
    url: "https://example.com/apply",
    status: "completed" as const,
    metadata: {
      expectedCompany: "Example",
      expectedRoleTitle: "Engineer",
      actualCompany: "Example",
      actualRoleTitle: "Engineer",
      success: true,
      source: "page_heading"
    },
    pagesReached: 1,
    pagesFilled: 1,
    transitionsAttempted: 0,
    transitionsContinued: 0,
    finalReviewPageReached: false,
    rawDomCandidateCount: 0,
    noiseRejectedCount: 0,
    logicalFieldCount: 0,
    answerableFieldCount: 0,
    intentionallyUnresolvedCount: 0,
    detectedCount: 0,
    attemptedCount: 0,
    verifiedCount: 0,
    safeAnswerableFieldCount: 0,
    safeVerifiedCount: 0,
    safeAnswerCoverage: 0,
    userExpectedFieldCount: 0,
    userExpectedVerifiedCount: 0,
    userExpectedCoverage: 0,
    dropdownCount: 0,
    dropdownVerifiedCount: 0,
    autocompleteCount: 0,
    autocompleteVerifiedCount: 0,
    fileUploadCount: 0,
    fileUploadVerifiedCount: 0,
    fieldDetectionRecall: 0,
    fillCoverage: 0,
    fillPrecision: 0,
    dropdownSuccess: 0,
    autocompleteSuccess: 0,
    fileUploadSuccess: 0,
    severeIncorrectAnswers: 0,
    severeFieldFailures: 0,
    generatableQuestionCount: 0,
    generatableShortAnswersDetected: 0,
    generatedAnswerCount: 0,
    generatedAnswersInserted: 0,
    generatedAnswersBrowserVerified: 0,
    generatedAnswersPassingQuality: 0,
    generatedAnswersRejectedForQuality: 0,
    generatableShortAnswersFilled: 0,
    rawShortAnswerCoverage: 0,
    qualityApprovedShortAnswerCoverage: 0,
    humanReadyShortAnswerCoverage: 0,
    generatableShortAnswerCoverage: 0,
    reusableAnswersFilled: 0,
    missingEvidenceQuestions: 0,
    generatedAnswersRequiringCorrection: 0,
    generatedAnswersAcceptedWithoutEdit: 0,
    manualEffort: {
      manualClicksRequired: 0,
      manualFieldsRequired: 0,
      unexpectedPageSwitches: 0,
      retriesRequired: 0,
      incorrectFieldsRequiringCorrection: 0
    },
    manualBarriers: [],
    warnings: [],
    failureCategories: {
      FIELD_NOT_DETECTED: 0,
      LABEL_ASSOCIATION_FAILED: 0,
      INTENT_CLASSIFICATION_FAILED: 0,
      PROFILE_FACT_MISSING: 0,
      ANSWER_DERIVATION_FAILED: 0,
      FORMAT_ADAPTATION_FAILED: 0,
      CONTROL_ADAPTER_FAILED: 0,
      OPTION_MATCHING_FAILED: 0,
      VERIFICATION_FAILED: 0,
      NAVIGATION_FAILED: 0,
      METADATA_EXTRACTION_FAILED: 0,
      PAGE_NOT_READY: 0,
      SITE_UNAVAILABLE: 0,
      INTENTIONALLY_UNRESOLVED: 0
    },
    stageResults: [],
    tracePath: "",
    screenshotPaths: [],
    fieldInventoryPath: "",
    reportPath: "",
    submitted: false,
    ...overrides
  };
}

test("buildOverallSummary marks transition continuity as not measured when no live transitions were attempted", () => {
  const summary = buildOverallSummary([createResult()]);
  const transitionMetric = summary.multiPageContinuityMetric as { numerator: number; denominator: number; rate: number; notMeasured: boolean };

  assert.equal(transitionMetric.denominator, 0);
  assert.equal(transitionMetric.rate, 0);
  assert.equal(transitionMetric.notMeasured, true);
});

test("mergeTimedOutCaseResult preserves a persisted completed case instead of downgrading it to timeout", () => {
  const merged = mergeTimedOutCaseResult(
    {
      id: "case-2",
      ats: "ashby",
      phase: 1,
      company: "Example",
      roleTitle: "Engineer",
      url: "https://example.com/apply"
    },
    "2026-07-12T00:00:00.000Z",
    createResult({ status: "completed" })
  );

  assert.equal(merged.status, "completed");
  assert.deepEqual(merged.manualBarriers, []);
});
