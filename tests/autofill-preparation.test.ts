import assert from "node:assert/strict";
import test from "node:test";

import { applyWorkdaySectionSemantics, buildWorkdayManualSectionFields } from "@/lib/autofillPreparation";
import { DetectedField } from "@/types";

test("Workday My Experience section signals become manual-review placeholders", () => {
  const fields = buildWorkdayManualSectionFields({
    sectionLabels: ["My Experience", "Work Experience", "Education", "Resume / CV", "Add", "Upload"]
  });

  assert.deepEqual(
    fields.map((field) => field.label),
    ["Work Experience", "Education", "Resume / CV"]
  );
  assert.ok(fields.every((field) => field.status === "needs_review"));
  assert.ok(fields.every((field) => field.autoFillAllowed === false));
  assert.ok(fields.every((field) => field.reviewCategory === "required_missing"));
  assert.equal(fields.find((field) => field.label === "Work Experience")?.controlType, "repeatable_section");
  assert.equal(fields.find((field) => field.label === "Education")?.controlType, "repeatable_section");
  assert.equal(fields.find((field) => field.label === "Resume / CV")?.controlType, "file_upload_section");
  assert.equal(fields.find((field) => field.label === "Work Experience")?.reason, "Repeatable section not yet supported.");
  assert.equal(fields.find((field) => field.label === "Resume / CV")?.reason, "Resume upload detected, but Workday upload for this control is not supported yet.");
});

test("Workday manual section placeholders stay empty when no known sections are present", () => {
  const fields = buildWorkdayManualSectionFields({
    sectionLabels: ["My Information", "Contact Details"]
  });

  assert.equal(fields.length, 0);
});

function detectedField(overrides: Partial<DetectedField> = {}): DetectedField {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    label: "Field",
    name: "field",
    domId: "field",
    type: "text",
    selector: "#field",
    detectedValue: "",
    suggestedValue: "",
    confidence: 0.45,
    confidenceLevel: "needs_review",
    status: "needs_review",
    reason: "ApplyPilot does not support this control yet",
    sensitivity: "review",
    autoFillAllowed: false,
    intent: "unknown",
    reviewCategory: "required_missing",
    answerSource: "unknown",
    verificationStatus: "not_attempted",
    controlType: "text",
    questionText: overrides.label ?? "Field",
    nearbyText: overrides.label ?? "Field",
    isRequired: true,
    isVisible: true,
    isDisabled: false,
    ...overrides
  };
}

test("Workday section semantics replace generic unsupported placeholders with honest section states", () => {
  const fields = applyWorkdaySectionSemantics(
    [
      detectedField({ label: "Work Experience", nearbyText: "Work Experience", reason: "ApplyPilot does not support this control yet" }),
      detectedField({ label: "Education", nearbyText: "Education", reason: "ApplyPilot does not support this control yet" }),
      detectedField({ label: "Resume / CV", nearbyText: "Resume / CV", reason: "ApplyPilot does not support this control yet" })
    ],
    { sectionLabels: ["Work Experience", "Education", "Resume / CV"] }
  );

  assert.equal(fields.find((field) => field.label === "Work Experience")?.controlType, "repeatable_section");
  assert.equal(fields.find((field) => field.label === "Work Experience")?.intent, "employer");
  assert.equal(fields.find((field) => field.label === "Work Experience")?.reason, "Repeatable section not yet supported.");

  assert.equal(fields.find((field) => field.label === "Education")?.controlType, "repeatable_section");
  assert.equal(fields.find((field) => field.label === "Education")?.intent, "education_school");

  assert.equal(fields.find((field) => field.label === "Resume / CV")?.controlType, "file_upload_section");
  assert.equal(
    fields.find((field) => field.label === "Resume / CV")?.reason,
    "Resume upload detected, but Workday upload for this control is not supported yet."
  );
});
