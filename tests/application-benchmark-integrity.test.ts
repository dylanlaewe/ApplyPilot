import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCaseResultFromProgress,
  buildOverallSummary,
  mergeTimedOutCaseResult,
  resultBelongsToSuiteRun,
  shouldPreserveCompletedStatusAfterLateFailure,
  timedOutCaseResult
} from "@/scripts/application-benchmark";

function createResult(overrides: Record<string, unknown> = {}) {
  return {
    suiteRunId: "suite-1",
    suiteStartedAt: "2026-07-12T00:00:00.000Z",
    caseStartedAt: "2026-07-12T00:00:01.000Z",
    caseFinishedAt: "2026-07-12T00:00:02.000Z",
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
    "suite-1",
    "2026-07-12T00:00:00.000Z",
    createResult({ status: "completed" })
  );

  assert.equal(merged.status, "completed");
  assert.deepEqual(merged.manualBarriers, []);
});

test("mergeTimedOutCaseResult stamps the active suite metadata onto timeout results", () => {
  const merged = mergeTimedOutCaseResult(
    {
      id: "case-3",
      ats: "workable",
      phase: 1,
      company: "Example",
      roleTitle: "Engineer",
      url: "https://example.com/apply"
    },
    "2026-07-15T15:00:00.000Z",
    "suite-fresh",
    "2026-07-15T14:59:00.000Z",
    createResult({ status: "failed_runtime", suiteRunId: "suite-old" })
  );

  assert.equal(merged.status, "timeout");
  assert.equal(merged.suiteRunId, "suite-fresh");
  assert.equal(merged.suiteStartedAt, "2026-07-15T14:59:00.000Z");
});

test("resultBelongsToSuiteRun rejects stale case reports from an older suite run", () => {
  assert.equal(resultBelongsToSuiteRun(createResult({ suiteRunId: "suite-current" }), "suite-current"), true);
  assert.equal(resultBelongsToSuiteRun(createResult({ suiteRunId: "suite-older" }), "suite-current"), false);
  assert.equal(resultBelongsToSuiteRun(null, "suite-current"), false);
});

test("shouldPreserveCompletedStatusAfterLateFailure keeps completed status for late page-close errors after all answerable fields verified", () => {
  const preserve = shouldPreserveCompletedStatusAfterLateFailure("completed", "page.evaluate: Target page, context or browser has been closed", [
    {
      applicationId: "case-1",
      ats: "greenhouse",
      company: "Example",
      roleTitle: "Engineer",
      pageNumber: 1,
      pageUrl: "https://example.com/apply",
      pageHeading: "Engineer",
      fieldLabel: "Phone*",
      nearbyQuestionText: "Phone",
      required: true,
      domControlType: "text",
      selectedAdapter: "fillTextControl",
      detectedIntent: "phone",
      expectedAnswerSource: "formatted_profile",
      expectedNormalizedAnswer: "+1 6178338317",
      availableOptions: [],
      attemptedValue: "+1 6178338317",
      actualValueAfterFill: "(617) 833-8317",
      browserVerified: true,
      verified: true,
      outcome: "filled",
      failureCategory: null,
      failureReason: "Filled during benchmark.",
      answerable: true,
      coverageClassification: "ANSWERABLE_WITH_DERIVATION",
      safeAnswerableNow: true,
      userExpectedAnswerable: true,
      profileEvidenceAvailable: "yes",
      excludedFromAnswerableDenominatorReason: "Included in the safe-answer denominator.",
      reasonableUserWouldExpectApplyPilotToAnswer: true,
      oneAdditionalProfileFactCouldAnswer: false,
      genuinelyUnsafeToAnswer: false,
      severe: true,
      detected: true,
      attempted: true,
      shortAnswerKind: "",
      generatedProvider: "",
      generatedEvidenceTitles: [],
      generatedJobEvidenceTitles: [],
      generatedWarnings: [],
      generatedRegenerationNotes: [],
      qualityPassed: true,
      qualityReasons: [],
      qualityFactualGrounding: 0,
      qualityQuestionRelevance: 0,
      qualityJobRelevance: 0,
      qualityCandidateRelevance: 0,
      qualityFluency: 0,
      qualitySpecificity: 0,
      qualityConcision: 0
    }
  ]);

  assert.equal(preserve, true);
});

test("buildCaseResultFromProgress preserves populated stage metrics after a late failure", () => {
  const inventory: Parameters<typeof buildCaseResultFromProgress>[0]["allFieldRecords"] = [
    {
      applicationId: "case-1",
      ats: "greenhouse",
      company: "Example",
      roleTitle: "Engineer",
      pageNumber: 1,
      pageUrl: "https://example.com/apply",
      pageHeading: "Engineer",
      fieldLabel: "First Name*",
      nearbyQuestionText: "First Name",
      required: true,
      domControlType: "text",
      selectedAdapter: "fillTextControl",
      detectedIntent: "first_name",
      expectedAnswerSource: "explicit_profile",
      expectedNormalizedAnswer: "Avery",
      availableOptions: [],
      attemptedValue: "Avery",
      actualValueAfterFill: "Avery",
      browserVerified: true,
      verified: true,
      outcome: "filled",
      failureCategory: null,
      failureReason: "Filled during benchmark.",
      answerable: true,
      coverageClassification: "ANSWERABLE_NOW",
      safeAnswerableNow: true,
      userExpectedAnswerable: true,
      profileEvidenceAvailable: "yes",
      excludedFromAnswerableDenominatorReason: "Included in the safe-answer denominator.",
      reasonableUserWouldExpectApplyPilotToAnswer: true,
      oneAdditionalProfileFactCouldAnswer: false,
      genuinelyUnsafeToAnswer: false,
      severe: false,
      detected: true,
      attempted: true,
      shortAnswerKind: "",
      generatedProvider: "",
      generatedEvidenceTitles: [],
      generatedJobEvidenceTitles: [],
      generatedWarnings: [],
      generatedRegenerationNotes: [],
      qualityPassed: true,
      qualityReasons: [],
      qualityFactualGrounding: 0,
      qualityQuestionRelevance: 0,
      qualityJobRelevance: 0,
      qualityCandidateRelevance: 0,
      qualityFluency: 0,
      qualitySpecificity: 0,
      qualityConcision: 0
    },
    {
      applicationId: "case-1",
      ats: "greenhouse",
      company: "Example",
      roleTitle: "Engineer",
      pageNumber: 1,
      pageUrl: "https://example.com/apply",
      pageHeading: "Engineer",
      fieldLabel: "Phone*",
      nearbyQuestionText: "Phone",
      required: true,
      domControlType: "text",
      selectedAdapter: "fillTextControl",
      detectedIntent: "phone",
      expectedAnswerSource: "formatted_profile",
      expectedNormalizedAnswer: "+1 6178338317",
      availableOptions: [],
      attemptedValue: "+1 6178338317",
      actualValueAfterFill: "(617) 833-8317",
      browserVerified: true,
      verified: true,
      outcome: "filled",
      failureCategory: null,
      failureReason: "Filled during benchmark.",
      answerable: true,
      coverageClassification: "ANSWERABLE_WITH_DERIVATION",
      safeAnswerableNow: true,
      userExpectedAnswerable: true,
      profileEvidenceAvailable: "yes",
      excludedFromAnswerableDenominatorReason: "Included in the safe-answer denominator.",
      reasonableUserWouldExpectApplyPilotToAnswer: true,
      oneAdditionalProfileFactCouldAnswer: false,
      genuinelyUnsafeToAnswer: false,
      severe: true,
      detected: true,
      attempted: true,
      shortAnswerKind: "",
      generatedProvider: "",
      generatedEvidenceTitles: [],
      generatedJobEvidenceTitles: [],
      generatedWarnings: [],
      generatedRegenerationNotes: [],
      qualityPassed: true,
      qualityReasons: [],
      qualityFactualGrounding: 0,
      qualityQuestionRelevance: 0,
      qualityJobRelevance: 0,
      qualityCandidateRelevance: 0,
      qualityFluency: 0,
      qualitySpecificity: 0,
      qualityConcision: 0
    }
  ];

  const result = buildCaseResultFromProgress({
    testCase: {
      id: "case-1",
      ats: "greenhouse",
      phase: 1,
      company: "Example",
      roleTitle: "Engineer",
      url: "https://example.com/apply"
    },
    suiteRunId: "suite-1",
    suiteStartedAt: "2026-07-12T00:00:00.000Z",
    caseStartedAt: "2026-07-12T00:00:01.000Z",
    finalStatus: "failed_runtime",
    metadata: {
      company: "Example",
      roleTitle: "Engineer",
      source: "page_heading"
    },
    stageResults: [
      {
        pageNumber: 1,
        pageUrl: "https://example.com/apply",
        pageHeading: "Engineer",
        actionsTaken: [],
        initialRawFieldCount: 2,
        noiseRejectedCount: 0,
        groupedControlCount: 0,
        deduplicatedFieldCount: 0,
        logicalFieldCount: 2,
        answerableFieldCount: 2,
        intentionallyUnresolvedCount: 0,
        finalDetectedFieldCount: 2,
        inventory: [...inventory]
      }
    ],
    allFieldRecords: [...inventory],
    transitionsAttempted: 0,
    retriesRequired: 1,
    unexpectedPageSwitches: 0,
    manualBarriers: ["page.evaluate: Target page, context or browser has been closed"],
    warnings: [],
    tracePath: "/tmp/trace.zip",
    screenshotPaths: ["/tmp/before.png", "/tmp/after.png"],
    fieldInventoryPath: "/tmp/inventory.json",
    reportPath: "/tmp/report.json"
  });

  assert.equal(result.pagesReached, 1);
  assert.equal(result.pagesFilled, 1);
  assert.equal(result.answerableFieldCount, 2);
  assert.equal(result.verifiedCount, 2);
  assert.equal(result.fillCoverage, 1);
});

test("timedOutCaseResult records the last benchmark stage in its timeout message", () => {
  const result = timedOutCaseResult(
    {
      id: "case-4",
      ats: "greenhouse",
      phase: 1,
      company: "Example",
      roleTitle: "Engineer",
      url: "https://example.com/apply"
    },
    "2026-07-16T00:00:00.000Z",
    "suite-1",
    "2026-07-16T00:00:00.000Z",
    "page_1_autofill_pass_2"
  );

  assert.match(result.manualBarriers[0] ?? "", /during page_1_autofill_pass_2/i);
  assert.match(result.warnings[0] ?? "", /Last recorded stage: page_1_autofill_pass_2/i);
});

test("mergeTimedOutCaseResult preserves the tracked stage when no persisted partial result exists", () => {
  const result = mergeTimedOutCaseResult(
    {
      id: "case-5",
      ats: "greenhouse",
      phase: 1,
      company: "Example",
      roleTitle: "Engineer",
      url: "https://example.com/apply"
    },
    "2026-07-16T00:00:00.000Z",
    "suite-1",
    "2026-07-16T00:00:00.000Z",
    null,
    "page_1_collecting_inventory"
  );

  assert.match(result.manualBarriers[0] ?? "", /during page_1_collecting_inventory/i);
  assert.match(result.warnings[0] ?? "", /Last recorded stage: page_1_collecting_inventory/i);
});
