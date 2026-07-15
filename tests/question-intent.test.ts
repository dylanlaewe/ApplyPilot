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

test("greenhouse authorization comboboxes are classified for search-style controls", () => {
  const workAuthorizationField: RawScannedField = {
    label: "Are you authorized to work in the US? *",
    name: "question_58638387",
    domId: "question_58638387",
    type: "search",
    selector: "#question_58638387",
    detectedValue: "",
    controlType: "aria_combobox",
    role: "combobox",
    nearbyText: "Are you authorized to work in the US?",
    isRequired: true,
    isVisible: true,
    isDisabled: false
  };

  const sponsorshipField: RawScannedField = {
    label: "Will you now, or in the future, require sponsorship for employment visa status? *",
    name: "question_58638388",
    domId: "question_58638388",
    type: "search",
    selector: "#question_58638388",
    detectedValue: "",
    controlType: "aria_combobox",
    role: "combobox",
    nearbyText: "Will you now, or in the future, require sponsorship for employment visa status?",
    isRequired: true,
    isVisible: true,
    isDisabled: false
  };

  const workAuthorization = detectQuestionIntent(workAuthorizationField);
  const sponsorship = detectQuestionIntent(sponsorshipField);

  assert.equal(workAuthorization.intent, "work_authorization");
  assert.ok(workAuthorization.confidence >= 0.9);
  assert.equal(sponsorship.intent, "sponsorship");
  assert.ok(sponsorship.confidence >= 0.9);
});
