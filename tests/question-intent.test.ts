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

test("greenhouse EEOC survey preambles are not misclassified as state fields", () => {
  const field: RawScannedField = {
    label:
      "Code for America takes transparency and fairness very seriously, and is taking steps to improve our hiring process to ensure it is fair for everyone. In order to achieve this goal and comply with federal and state Equal Employment Opportunity laws, we ask all candidates to complete the voluntary self-identification survey below",
    name: "question_eeoc_intro",
    domId: "question_eeoc_intro",
    type: "search",
    selector: "#question_eeoc_intro",
    detectedValue: "",
    controlType: "aria_combobox",
    role: "combobox",
    nearbyText:
      "Code for America takes transparency and fairness very seriously, and is taking steps to improve our hiring process to ensure it is fair for everyone. In order to achieve this goal and comply with federal and state Equal Employment Opportunity laws, we ask all candidates to complete the voluntary self-identification survey below",
    isRequired: false,
    isVisible: true,
    isDisabled: false
  };

  const result = detectQuestionIntent(field);
  assert.equal(result.intent, "unknown");
  assert.match(result.reason, /demographic|eeoc survey preamble/i);
});

test("workday phone country selectors stay classified as phone_country_code even with generic labels", () => {
  const countryField: RawScannedField = {
    label: "Country",
    name: "country",
    domId: "country",
    type: "search",
    selector: "#country",
    detectedValue: "Select One",
    controlType: "aria_combobox",
    role: "combobox",
    nearbyText: "Country Phone Code Phone Number",
    selectOptions: ["Canada (+1)", "United States of America (+1)", "United Kingdom (+44)"],
    isRequired: true,
    isVisible: true,
    isDisabled: false
  };

  const listboxField: RawScannedField = {
    label: "items selected",
    name: "",
    domId: "",
    type: "text",
    selector: "#phone_country_code_listbox",
    detectedValue: "United States of America (+1)",
    controlType: "listbox",
    role: "listbox",
    nearbyText: "Country Phone Code Phone Number",
    selectOptions: ["Canada (+1)", "United States of America (+1)", "United Kingdom (+44)"],
    isRequired: true,
    isVisible: true,
    isDisabled: false
  };

  const countryResult = detectQuestionIntent(countryField);
  const listboxResult = detectQuestionIntent(listboxField);

  assert.equal(countryResult.intent, "phone_country_code");
  assert.ok(countryResult.confidence >= 0.95);
  assert.equal(listboxResult.intent, "phone_country_code");
  assert.ok(listboxResult.confidence >= 0.95);
});

test("workday phone number inputs stay classified separately from country-code helpers", () => {
  const field: RawScannedField = {
    label: "Phone",
    name: "phone_number",
    domId: "phone_number",
    type: "tel",
    selector: "#phone_number",
    detectedValue: "",
    controlType: "text",
    nearbyText: "Country Phone Code Phone Number",
    isRequired: true,
    isVisible: true,
    isDisabled: false
  };

  const result = detectQuestionIntent(field);
  assert.equal(result.intent, "phone_number");
  assert.ok(result.confidence >= 0.95);
});

test("workday phone device type selectors are classified separately from phone number fields", () => {
  const field: RawScannedField = {
    label: "Phone Device Type",
    name: "phone_device_type",
    domId: "phone_device_type",
    type: "select-one",
    selector: "#phone_device_type",
    detectedValue: "Select One",
    controlType: "menu_button",
    role: "button",
    nearbyText: "Phone Device Type",
    selectOptions: ["Home", "Mobile", "Work"],
    isRequired: true,
    isVisible: true,
    isDisabled: false
  };

  const result = detectQuestionIntent(field);
  assert.equal(result.intent, "phone_device_type");
  assert.ok(result.confidence >= 0.9);
});

test("workday menu buttons do not derive intent from yes-required style current values", () => {
  const field: RawScannedField = {
    label: "Yes Required",
    name: "",
    domId: "",
    type: "button",
    selector: "#authorization_menu",
    detectedValue: "Yes",
    controlType: "menu_button",
    role: "button",
    questionContainerText: "Are you authorized to work in the United States?",
    nearbyText: "Are you authorized to work in the United States? Yes Required",
    selectOptions: ["Yes", "No"],
    isRequired: true,
    isVisible: true,
    isDisabled: false
  };

  const result = detectQuestionIntent(field);
  assert.equal(result.intent, "work_authorization");
  assert.ok(result.confidence >= 0.9);
});
