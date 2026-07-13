import assert from "node:assert/strict";
import test from "node:test";

import { detectQuestionIntent } from "@/lib/questionIntent";
import { RawScannedField } from "@/types";

test("job source dropdowns are classified as referral_source instead of education", () => {
  const field: RawScannedField = {
    label: "How did you learn about this opportunity?",
    name: "source",
    domId: "job_source",
    type: "select-one",
    selector: "#job_source",
    detectedValue: "",
    controlType: "native_select",
    selectOptions: ["LinkedIn.com", "SchoolSpring.com", "Indeed", "Other"],
    nearbyText: "How did you learn about this opportunity?",
    isRequired: true,
    isVisible: true,
    isDisabled: false
  };

  const result = detectQuestionIntent(field);
  assert.equal(result.intent, "referral_source");
  assert.ok(result.confidence >= 0.9);
});

test("workday-style degree menu buttons are classified as education_degree", () => {
  const field: RawScannedField = {
    label: "Degree",
    name: "degree",
    domId: "wd_degree_button",
    type: "button",
    selector: "#wd_degree_button",
    detectedValue: "",
    controlType: "menu_button",
    role: "button",
    selectOptions: ["Associate Degree", "Bachelor of Science", "Master of Science"],
    nearbyText: "Education Degree",
    isRequired: true,
    isVisible: true,
    isDisabled: false
  };

  const result = detectQuestionIntent(field);
  assert.equal(result.intent, "education_degree");
  assert.ok(result.confidence >= 0.9);
});

test("custom resume buttons are classified as resume_upload", () => {
  const field: RawScannedField = {
    label: "Add Resume*",
    name: "",
    domId: "resume_button",
    type: "button",
    selector: "#resume_button",
    detectedValue: "Select",
    controlType: "menu_button",
    role: "button",
    nearbyText: "Add Resume",
    isRequired: true,
    isVisible: true,
    isDisabled: false
  };

  const result = detectQuestionIntent(field);
  assert.equal(result.intent, "resume_upload");
  assert.ok(result.confidence >= 0.9);
});
