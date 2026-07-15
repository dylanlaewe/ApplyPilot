import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultAnswerBank } from "@/lib/answerBank";
import { buildSuggestedFields } from "@/lib/fieldMapping";
import { createDefaultProfile, normalizeProfile } from "@/lib/profile";
import { ApplicantProfile, RawScannedField } from "@/types";

function createProfile(): ApplicantProfile {
  const base = createDefaultProfile();
  return normalizeProfile({
    ...base,
    education: [
      {
        id: "edu-1",
        school: "Marist College",
        normalizedSchoolName: "marist college",
        degree: "Bachelor of Science",
        degreeType: "bachelor_of_science",
        degreeCustomValue: "",
        degreeLevel: "bachelors_degree",
        major: "Computer Science",
        fieldOfStudy: "Computer Science",
        normalizedFieldOfStudy: "computer science",
        displayFieldOfStudy: "Computer Science",
        graduationStatus: "completed",
        graduationDate: "2026",
        graduationDateType: "actual",
        gpa: "",
        startDate: "2022",
        endDate: "2026",
        location: "Poughkeepsie, NY"
      }
    ]
  });
}

function rawField(overrides: Partial<RawScannedField>): RawScannedField {
  return {
    label: "",
    name: "",
    domId: "",
    type: "text",
    selector: "#field",
    detectedValue: "",
    isVisible: true,
    isDisabled: false,
    ...overrides
  };
}

test("school dropdown uses Other when the form provides a separate not-listed fallback field", () => {
  const profile = createProfile();
  const answerBank = createDefaultAnswerBank();
  const fields = buildSuggestedFields(
    [
      rawField({
        label: "Which institution do you attend? If your institution is not listed, please 'Other' and skip to the next question",
        name: "institution_search",
        domId: "institution_search",
        type: "search",
        controlType: "aria_combobox",
        role: "combobox",
        selector: "#institution_search",
        nearbyText:
          "Which institution do you attend? If your institution is not listed, please 'Other' and skip to the next question"
      }),
      rawField({
        label: "If your institution was not listed in the previous question, please enter it here",
        name: "institution_other",
        domId: "institution_other",
        type: "text",
        selector: "#institution_other",
        nearbyText: "If your institution was not listed in the previous question, please enter it here"
      })
    ],
    profile,
    answerBank
  );

  const dropdown = fields[0];
  const fallback = fields[1];

  assert.equal(dropdown.intent, "education_school");
  assert.equal(dropdown.suggestedValue, "Other");
  assert.equal(dropdown.matchedOption, "Other");
  assert.match(dropdown.reason, /separate school fallback field/i);
  assert.equal(fallback.intent, "education_school");
  assert.equal(fallback.suggestedValue, "Marist College");
});

test("ordinary school fields keep the saved school value when there is no fallback pair", () => {
  const profile = createProfile();
  const answerBank = createDefaultAnswerBank();
  const [field] = buildSuggestedFields(
    [
      rawField({
        label: "School",
        name: "school",
        domId: "school",
        type: "text",
        selector: "#school"
      })
    ],
    profile,
    answerBank
  );

  assert.equal(field.intent, "education_school");
  assert.equal(field.suggestedValue, "Marist College");
});

test("duplicate helper resume upload controls are suppressed when a real resume field is present", () => {
  const profile = createProfile();
  const answerBank = createDefaultAnswerBank();
  const fields = buildSuggestedFields(
    [
      rawField({
        label: "Autofill from resume Upload your resume here to autofill key application fields",
        nearbyText: "Upload your resume here to autofill key application fields",
        type: "file",
        controlType: "file",
        selector: "#resume-helper"
      }),
      rawField({
        label: "Resume",
        name: "_systemfield_resume",
        domId: "_systemfield_resume",
        type: "file",
        controlType: "file",
        selector: "#resume"
      }),
      rawField({
        label: "LinkedIn URL",
        type: "text",
        selector: "#linkedin"
      })
    ],
    profile,
    answerBank
  );

  assert.equal(fields.filter((field) => field.intent === "resume_upload").length, 1);
  assert.equal(fields.find((field) => field.intent === "resume_upload")?.label, "Resume");
  assert.equal(fields.find((field) => field.intent === "linkedin")?.label, "LinkedIn URL");
});
