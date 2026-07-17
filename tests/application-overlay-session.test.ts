import assert from "node:assert/strict";
import test from "node:test";

import { buildOverlayFieldBuckets } from "@/lib/applicationOverlaySession";
import { DetectedField } from "@/types";

function field(overrides: Partial<DetectedField> = {}): DetectedField {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    label: "Field",
    name: "field",
    domId: "field",
    type: "text",
    selector: "#field",
    detectedValue: "",
    suggestedValue: "",
    confidence: 0.95,
    confidenceLevel: "high",
    status: "needs_review",
    reason: "Matched exactly.",
    sensitivity: "safe",
    autoFillAllowed: true,
    intent: "unknown",
    reviewCategory: null,
    answerSource: "explicit_profile",
    verificationStatus: "not_attempted",
    ...overrides
  };
}

test("overlay buckets keep manual-review fields out of recognized results and separate target from current", () => {
  const { recognized, unresolved } = buildOverlayFieldBuckets([
    field({
      label: "Country*",
      intent: "country",
      suggestedValue: "United States of America",
      detectedValue: "Select One",
      status: "needs_review",
      reason: "Needs an exact dropdown mapping",
      controlType: "menu_button"
    })
  ]);

  assert.equal(recognized.length, 0);
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0]?.label, "Country*");
  assert.equal(unresolved[0]?.target, "United States of America");
  assert.equal(unresolved[0]?.current, "Select One");
  assert.equal(unresolved[0]?.status, "Needs review");
});

test("overlay buckets show failed attempts once and hide generic helper controls", () => {
  const { recognized, unresolved } = buildOverlayFieldBuckets([
    field({
      label: "Country Phone Code*",
      intent: "phone",
      suggestedValue: "United States of America (+1)",
      detectedValue: "",
      status: "needs_review",
      verificationStatus: "failed",
      verificationMessage: "ApplyPilot does not support this control yet",
      answerSource: "formatted_profile",
      controlType: "text"
    }),
    field({
      label: "items selected",
      intent: "phone",
      suggestedValue: "United States of America (+1)",
      detectedValue: "United States of America (+1)",
      status: "needs_review",
      controlType: "listbox",
      answerSource: "formatted_profile"
    })
  ]);

  assert.equal(recognized.length, 1);
  assert.equal(unresolved.length, 0);
  assert.equal(recognized[0]?.label, "Country Phone Code*");
  assert.equal(recognized[0]?.status, "Attempt failed");
});

test("overlay buckets hide optional empty extension-style fields", () => {
  const { recognized, unresolved } = buildOverlayFieldBuckets([
    field({
      label: "Phone Extension",
      intent: "phone_extension",
      suggestedValue: "",
      detectedValue: "",
      status: "needs_review",
      isRequired: false,
      autoFillAllowed: false,
      answerSource: "unknown",
      reason: "ApplyPilot does not support this control yet"
    })
  ]);

  assert.equal(recognized.length, 0);
  assert.equal(unresolved.length, 0);
});
