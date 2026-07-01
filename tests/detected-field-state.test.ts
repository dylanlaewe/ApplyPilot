import assert from "node:assert/strict";
import test from "node:test";

import { preferDetectedFieldAttempt } from "@/lib/detectedFieldState";
import { DetectedField } from "@/types";

function makeField(overrides: Partial<DetectedField>): DetectedField {
  return {
    id: "field-1",
    label: "Additional Information",
    name: "additional_information",
    domId: "additional_information",
    type: "textarea",
    selector: "#additional_information",
    detectedValue: "",
    suggestedValue: "Generated answer",
    confidence: 0.9,
    confidenceLevel: "high",
    status: "needs_review",
    reason: "Generated a grounded draft.",
    sensitivity: "review",
    autoFillAllowed: true,
    intent: "unknown",
    reviewCategory: "unknown_custom",
    answerSource: "generated_answer",
    verificationStatus: "verified",
    questionText: "Anything else you'd like us to know?",
    shortAnswer: null,
    ...overrides
  };
}

test("verified short-answer fills outrank later stale-selector errors", () => {
  const verifiedDraft = makeField({
    shortAnswer: {
      kind: "additional_info",
      classificationConfidence: 0.9,
      answerability: "generatable_from_profile",
      canonicalQuestion: "Anything else you'd like us to know?",
      questionText: "Anything else you'd like us to know?",
      constraints: {
        maxWords: null,
        maxCharacters: null,
        maxSentences: null,
        requiresConcise: false,
        requestedTopics: [],
        requestedEvidence: []
      },
      focusTerms: [],
      evidenceIds: [],
      evidenceTitles: [],
      storyIds: [],
      provider: "deterministic-template",
      generatorHealth: "deterministic_fallback_only",
      generated: true,
      missingEvidence: [],
      warnings: [],
      validation: {
        valid: true,
        clipped: false,
        warnings: [],
        unsupportedTerms: []
      }
    }
  });

  const laterError = makeField({
    status: "error",
    verificationStatus: "failed",
    verificationMessage: "The field could not be found on the page. The form may have changed."
  });

  const preferred = preferDetectedFieldAttempt(verifiedDraft, laterError);
  assert.equal(preferred.verificationStatus, "verified");
  assert.equal(preferred.status, "needs_review");
  assert.equal(preferred.selector, laterError.selector);
});
