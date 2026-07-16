import assert from "node:assert/strict";
import test from "node:test";

import { buildAnswerSuggestion } from "@/lib/answerEngine";
import { createDefaultAnswerBank } from "@/lib/answerBank";
import { searchFieldsOfStudy } from "@/lib/fieldOfStudyCatalog";
import { searchCities } from "@/lib/locationCatalog";
import { matchStateOrCountryOption, matchStructuredLocationOption } from "@/lib/optionMatcher";
import {
  deriveHighestCompletedEducation,
  deriveHighestEducationIncludingInProgress
} from "@/lib/profileFacts";
import { createDefaultProfile, normalizeProfile } from "@/lib/profile";
import { searchSchools } from "@/lib/schoolCatalog";
import { ApplicantProfile, FieldIntent, RawScannedField } from "@/types";

function createProfile(overrides?: Partial<ApplicantProfile>): ApplicantProfile {
  const base = createDefaultProfile();
  const profile: ApplicantProfile = {
    ...base,
    identity: {
      ...base.identity,
      firstName: "Avery",
      lastName: "Example",
      fullName: "Avery Example",
      email: "avery@example.com",
      phoneCountry: "United States",
      phoneCountryCode: "+1",
      phoneNationalNumber: "7815551234",
      addressLine1: "123 Main St",
      city: "Boston",
      stateProvince: "MA",
      postalCode: "02118",
      country: "United States",
      linkedin: "https://linkedin.com/in/avery-example",
      github: "https://github.com/avery-example",
      portfolio: "https://portfolio.example.com",
      website: "https://avery.example.com",
      ...overrides?.identity
    },
    workAuthorizationProfile: {
      ...base.workAuthorizationProfile,
      authorizedInUS: "yes",
      usWorkAuthorizationCategory: "us_citizen",
      requiresSponsorshipNow: "no",
      requiresSponsorshipFuture: "no",
      ...overrides?.workAuthorizationProfile
    },
    securityProfile: {
      ...base.securityProfile,
      clearanceLevel: "secret",
      clearanceStatus: "active",
      ...overrides?.securityProfile
    },
    compensationProfile: {
      ...base.compensationProfile,
      minimumSalary: 90000,
      targetSalary: 95000,
      highSalary: 105000,
      answerStyle: "range",
      ...overrides?.compensationProfile
    },
    eeocDefaults: {
      ...base.eeocDefaults,
      gender: { value: "Woman / Female", customValue: "" },
      raceEthnicity: { values: ["Asian"], customValue: "" },
      veteranStatus: { value: "Not a protected veteran", customValue: "" },
      disabilityStatus: { value: "No", customValue: "" },
      ...overrides?.eeocDefaults
    },
    additionalApplicationFacts: {
      ...base.additionalApplicationFacts,
      validDriversLicense: "yes",
      meetsMinimumWorkingAge: "yes",
      ...overrides?.additionalApplicationFacts
    },
    workHistoryComplete: true,
    education: [
      {
        id: "edu-1",
        school: "Boston University",
        normalizedSchoolName: "boston university",
        degree: "Bachelor of Science",
        degreeType: "bachelor_of_science",
        degreeCustomValue: "",
        degreeLevel: "bachelors_degree",
        major: "Computer Science",
        fieldOfStudy: "Computer Science",
        normalizedFieldOfStudy: "computer science",
        displayFieldOfStudy: "Computer Science",
        graduationStatus: "completed",
        graduationDate: "2022-05",
        graduationDateType: "actual",
        gpa: "",
        startDate: "2018-09",
        endDate: "2022-05",
        location: "Boston, MA"
      }
    ],
    experience: [
      {
        id: "exp-1",
        company: "International Business Machines",
        normalizedCompanyName: "international business machines",
        aliases: ["IBM"],
        title: "Software Engineer",
        location: "Boston, MA",
        startDate: "2022-06",
        endDate: "",
        currentRole: true,
        summary: "",
        bullets: []
      }
    ],
    ...overrides
  };

  return normalizeProfile(profile);
}

function field(intent: FieldIntent, partial: Partial<RawScannedField> = {}): RawScannedField {
  const labelMap: Record<FieldIntent, string> = {
    first_name: "First name",
    middle_name: "Middle name",
    last_name: "Last name",
    preferred_name: "Preferred name",
    full_name: "Full name",
    email: "Email",
    phone: "Phone",
    phone_country_code: "Country code",
    phone_number: "Phone number",
    phone_extension: "Extension",
    full_phone_number: "Phone",
    address_line_1: "Address Line 1",
    address_line_2: "Address Line 2",
    street_address: "Street address",
    city: "City",
    state: "State",
    country: "Country",
    postal_code: "ZIP code",
    location: "Location",
    full_location: "Location",
    linkedin: "LinkedIn",
    github: "GitHub",
    portfolio: "Portfolio",
    website: "Website",
    resume_upload: "Resume",
    cover_letter_upload: "Cover letter",
    work_authorization: "Are you legally authorized to work in the United States?",
    work_authorization_category: "What is your current work authorization status?",
    sponsorship: "Will you now or in the future require sponsorship?",
    sponsorship_now: "Do you require sponsorship now?",
    sponsorship_future: "Will you require sponsorship in the future?",
    work_without_sponsorship: "Can you work without sponsorship?",
    relocation: "Willing to relocate",
    remote_preference: "Open to remote work",
    onsite_preference: "Open to onsite work",
    hybrid_preference: "Open to hybrid work",
    availability: "When can you start?",
    desired_salary: "Desired salary",
    hourly_rate: "Hourly rate",
    education_school: "School",
    education_degree: "Degree",
    education_major: "Field of study",
    education_highest_completed: "What is your highest completed level of education?",
    education_highest_attended: "What is the highest level of education you have attended?",
    graduation_date: "Graduation date",
    expected_graduation_date: "Expected graduation date",
    graduated_question: "Did you graduate?",
    graduation_status: "Graduation status",
    employer: "Employer",
    job_title: "Title",
    employment_start_date: "Employment start date",
    employment_end_date: "Employment end date",
    previous_employment: "Have you ever worked for International Business Machines in the past?",
    skills: "Skills",
    security_clearance_level: "What level of security clearance do you have?",
    security_clearance_status: "Do you currently hold an active clearance?",
    security_clearance_active: "Do you currently hold an active clearance?",
    security_clearance_eligible: "Are you eligible to obtain a clearance?",
    valid_drivers_license: "Do you have a valid driver's license?",
    reliable_transportation: "Do you have reliable transportation?",
    minimum_working_age: "Are you at least 18 years old?",
    background_check: "Are you willing to undergo a background check?",
    drug_screen: "Are you willing to undergo drug screening?",
    travel_willingness: "Are you willing to travel?",
    travel_percentage: "Travel percentage",
    shift_availability: "Shift availability",
    weekend_availability: "Weekend availability",
    overtime_availability: "Overtime availability",
    notice_period: "Notice period",
    referral_source: "Referral source",
    why_interested: "Why are you interested in this role?",
    tell_us_about_yourself: "Tell us about yourself.",
    years_experience: "Years of experience",
    eeoc_gender: "Gender",
    eeoc_race: "Race / ethnicity",
    eeoc_veteran: "Veteran status",
    eeoc_disability: "Disability status",
    legal_attestation: "I certify the above is true",
    unknown: "Unknown"
  };

  return {
    label: labelMap[intent],
    name: intent,
    domId: intent,
    type: "text",
    selector: `#${intent}`,
    detectedValue: "",
    ...partial
  };
}

function suggestion(intent: FieldIntent, profile = createProfile(), partialField: Partial<RawScannedField> = {}) {
  return buildAnswerSuggestion({
    intent,
    field: field(intent, partialField),
    profile,
    answerBank: []
  });
}

test("phone country code dropdown is filled from profile", () => {
  const result = suggestion("phone_country_code", createProfile(), {
    type: "select-one",
    selectOptions: ["Canada (+1)", "United States (+1)", "United Kingdom (+44)"]
  });
  assert.equal(result.suggestedValue, "United States (+1)");
});

test("degree dropdown safely matches equivalent bachelor's options without crossing degree families", () => {
  const matched = suggestion("education_degree", createProfile(), {
    type: "select-one",
    selectOptions: ["Associate Degree", "Bachelor's Degree", "Master's Degree"]
  });
  assert.equal(matched.suggestedValue, "Bachelor's Degree");

  const exact = suggestion("education_degree", createProfile(), {
    controlType: "menu_button",
    role: "button",
    type: "button",
    selectOptions: ["Associate Degree", "Bachelor of Science", "Master of Science"]
  });
  assert.equal(exact.suggestedValue, "Bachelor of Science");
});

test("employment answers derive from the primary saved experience entry", () => {
  const profile = createProfile();
  assert.equal(suggestion("employer", profile).suggestedValue, "International Business Machines");
  assert.equal(suggestion("job_title", profile).suggestedValue, "Software Engineer");
  assert.equal(suggestion("employment_start_date", profile).suggestedValue, "2022-06");
  assert.equal(suggestion("employment_end_date", profile).suggestedValue, "");
});

test("phone country code is not confused with extension", () => {
  const profile = createProfile({ identity: { ...createProfile().identity, phoneExtension: "77" } });
  const code = suggestion("phone_country_code", profile);
  const ext = suggestion("phone_extension", profile);
  assert.equal(code.suggestedValue, "+1");
  assert.equal(ext.suggestedValue, "77");
});

test("separate phone field receives national number only when country is separate", () => {
  const result = suggestion("phone_number", createProfile(), {
    type: "tel",
    label: "Phone",
    nearbyText: "Country"
  });
  assert.equal(result.suggestedValue, "7815551234");
});

test("blank phone extension never autofills placeholder extension text", () => {
  const result = suggestion("phone_extension");
  assert.equal(result.suggestedValue, "");
});

test("full phone field receives the formatted value", () => {
  const result = suggestion("full_phone_number");
  assert.match(result.suggestedValue, /\+1 7815551234/);
  assert.doesNotMatch(result.suggestedValue, /x\+1/i);
});

test("open-text skills prompts are classified as short-answer questions instead of being dropped as structured fields", () => {
  const result = buildAnswerSuggestion({
    intent: "skills",
    field: field("skills", {
      type: "textarea",
      label: "Please describe your relevant experience/skills for this particular position",
      nearbyText: "Please describe your relevant experience/skills for this particular position",
      selector: "#skills-question"
    }),
    profile: createProfile(),
    answerBank: createDefaultAnswerBank(),
    sessionContext: {
      company: "Dataiku",
      roleTitle: "Fullstack Software Engineer - Business Solutions",
      source: "test"
    }
  });

  assert.equal(result.shortAnswer?.kind, "experience_relevance");
  assert.equal(result.shortAnswer?.answerability, "generatable_from_job_and_profile");
  assert.ok(result.shortAnswer);
});

test("street address fills", () => assert.equal(suggestion("street_address").suggestedValue, "123 Main St"));
test("postal code fills", () => assert.equal(suggestion("postal_code").suggestedValue, "02118"));
test("location fills from structured city, state, country", () => assert.match(suggestion("location").suggestedValue, /Boston, MA, United States/));

test("lever current location picker is left unresolved instead of attempting unverifiable free text", () => {
  const result = suggestion("location", createProfile(), {
    name: "location",
    domId: "location-input",
    controlType: "text",
    frameUrl: "https://jobs.lever.co/example/123/apply",
    nearbyText: "Current location No location found. Try entering a different locationLoading"
  });

  assert.equal(result.suggestedValue, "");
  assert.equal(result.answerSource, "unknown");
  assert.equal(result.autoFillAllowed, false);
  assert.match(result.reason, /lever location picker requires choosing a visible exact match/i);
});

test("state dropdown fills", () => {
  const result = suggestion("state", createProfile(), { type: "select-one", selectOptions: ["MA", "NY"] });
  assert.equal(result.suggestedValue, "MA");
});

test("country dropdown fills", () => {
  const result = suggestion("country", createProfile(), { type: "select-one", selectOptions: ["Canada", "United States"] });
  assert.equal(result.suggestedValue, "United States");
});

test("US citizen maps to US Citizen", () => {
  const result = suggestion("work_authorization_category", createProfile(), {
    type: "select-one",
    selectOptions: ["Permanent Resident", "US Citizen", "Non-resident"]
  });
  assert.equal(result.suggestedValue, "US Citizen");
});

test("permanent resident maps to Permanent Resident", () => {
  const profile = createProfile({
    workAuthorizationProfile: {
      ...createProfile().workAuthorizationProfile,
      usWorkAuthorizationCategory: "permanent_resident"
    }
  });
  const result = suggestion("work_authorization_category", profile, {
    type: "select-one",
    selectOptions: ["US Citizen", "Permanent Resident", "Non-resident"]
  });
  assert.equal(result.suggestedValue, "Permanent Resident");
});

test("authorization yes/no remains distinct from category", () => {
  const result = suggestion("work_authorization");
  assert.equal(result.suggestedValue, "yes");
});

test("sponsorship polarity is handled correctly", () => {
  const result = suggestion("work_without_sponsorship", createProfile(), {
    label: "Are you able to work without sponsorship?",
    type: "select-one",
    selectOptions: ["Yes", "No"]
  });
  assert.equal(result.suggestedValue, "Yes");
});

test("completed bachelor's degree maps to Bachelor's degree", () => {
  assert.equal(deriveHighestCompletedEducation(createProfile()), "bachelors_degree");
});

test("completed education maps Did you graduate to Yes", () => {
  assert.equal(suggestion("graduated_question").suggestedValue, "yes");
});

test("expected graduation maps to No for Have you graduated", () => {
  const profile = createProfile({
    education: [
      {
        ...createProfile().education[0],
        graduationStatus: "expected",
        graduationDateType: "expected",
        graduationDate: "2027-05"
      }
    ]
  });
  assert.equal(suggestion("graduated_question", profile).suggestedValue, "no");
});

test("expected graduation date is used for expected-date fields", () => {
  const profile = createProfile({
    education: [
      {
        ...createProfile().education[0],
        graduationStatus: "expected",
        graduationDateType: "expected",
        graduationDate: "2027-05"
      }
    ]
  });
  assert.equal(suggestion("expected_graduation_date", profile).suggestedValue, "2027-05");
});

test("actual graduation date is used for completed-degree fields", () => {
  assert.equal(suggestion("graduation_date").suggestedValue, "2022-05");
});

test("highest completed education excludes incomplete degrees", () => {
  const profile = createProfile({
    education: [
      createProfile().education[0],
      {
        ...createProfile().education[0],
        id: "edu-2",
        degree: "Master of Science",
        degreeType: "master_of_science",
        degreeLevel: "masters_degree",
        graduationStatus: "expected",
        graduationDateType: "expected",
        graduationDate: "2026-12"
      }
    ]
  });
  assert.equal(deriveHighestCompletedEducation(profile), "bachelors_degree");
  assert.equal(deriveHighestEducationIncludingInProgress(profile), "masters_degree");
});

test("field of study autocomplete supports broad disciplines", () => {
  const fields = searchFieldsOfStudy("computer");
  assert.ok(fields.some((entry) => entry.label === "Computer Science"));
});

test("security clearance none maps to no-clearance wording", () => {
  const profile = createProfile({
    securityProfile: {
      ...createProfile().securityProfile,
      clearanceLevel: "none"
    }
  });
  const result = suggestion("security_clearance_level", profile, {
    type: "select-one",
    selectOptions: ["No clearance", "Secret", "Top Secret"]
  });
  assert.equal(result.suggestedValue, "No clearance");
});

test("secret maps to Secret", () => {
  const result = suggestion("security_clearance_level", createProfile(), {
    type: "select-one",
    selectOptions: ["Confidential", "Secret", "Top Secret"]
  });
  assert.equal(result.suggestedValue, "Secret");
});

test("unknown clearance is not guessed", () => {
  const profile = createProfile({
    securityProfile: {
      ...createProfile().securityProfile,
      clearanceLevel: "ask"
    }
  });
  assert.equal(suggestion("security_clearance_level", profile).suggestedValue, "");
});

test("matching employer history maps to Yes", () => {
  assert.equal(suggestion("previous_employment").suggestedValue, "yes");
});

test("non-matching employer with complete history remains unresolved until explicitly answered", () => {
  const result = buildAnswerSuggestion({
    intent: "previous_employment",
    field: field("previous_employment", {
      label: "Have you ever worked for Electron Services in the past?"
    }),
    profile: createProfile(),
    answerBank: []
  });
  assert.equal(result.suggestedValue, "");
});

test("non-matching employer with incomplete history remains unresolved", () => {
  const profile = createProfile({ workHistoryComplete: false });
  const result = buildAnswerSuggestion({
    intent: "previous_employment",
    field: field("previous_employment", {
      label: "Have you ever worked for Electron Services in the past?"
    }),
    profile,
    answerBank: []
  });
  assert.equal(result.suggestedValue, "");
});

test("LinkedIn field only receives LinkedIn", () => {
  assert.equal(suggestion("linkedin").suggestedValue, "https://linkedin.com/in/avery-example");
});

test("GitHub field only receives GitHub", () => {
  assert.equal(suggestion("github").suggestedValue, "https://github.com/avery-example");
});

test("Website never falls back to LinkedIn when no personal site exists", () => {
  const profile = createProfile({
    identity: {
      ...createProfile().identity,
      website: "",
      portfolio: "",
      linkedin: "https://linkedin.com/in/avery-example"
    }
  });
  const result = suggestion("website", profile);
  assert.equal(result.suggestedValue, "");
});

test("Website uses a personal website or portfolio only", () => {
  const result = suggestion("website");
  assert.equal(result.suggestedValue, "https://avery.example.com");
});

test("optional Website stays blank when no fallback is configured", () => {
  const profile = createProfile({
    identity: {
      ...createProfile().identity,
      genericWebsiteFallback: "leave_blank",
      linkedin: "",
      portfolio: "",
      website: "",
      github: ""
    }
  });
  assert.equal(suggestion("website", profile).suggestedValue, "");
});

test("explicit saved EEOC answers autofill", () => {
  assert.equal(suggestion("eeoc_gender").suggestedValue, "Woman / Female");
});

test("Ask me every time does not autofill", () => {
  const profile = createProfile({
    eeocDefaults: {
      ...createProfile().eeocDefaults,
      gender: { value: "Ask me every time", customValue: "" }
    }
  });
  assert.equal(suggestion("eeoc_gender", profile).suggestedValue, "");
});

test("Prefer not to answer matches decline options", () => {
  const profile = createProfile({
    eeocDefaults: {
      ...createProfile().eeocDefaults,
      disabilityStatus: { value: "Prefer not to answer", customValue: "" }
    }
  });
  const result = suggestion("eeoc_disability", profile, {
    type: "select-one",
    selectOptions: ["Yes", "No", "Prefer not to answer"]
  });
  assert.equal(result.suggestedValue, "Prefer not to answer");
});

test("disability no does not collapse into prefer-not-to-answer", () => {
  const profile = createProfile({
    eeocDefaults: {
      ...createProfile().eeocDefaults,
      disabilityStatus: { value: "No", customValue: "" }
    }
  });
  const result = suggestion("eeoc_disability", profile, {
    type: "select-one",
    selectOptions: [
      "Yes, I have a disability, or have had one in the past",
      "No, I do not have a disability and have not had one in the past",
      "I do not want to answer"
    ]
  });
  assert.equal(result.suggestedValue, "No, I do not have a disability and have not had one in the past");
});

test("veteran status matches equivalent non-protected wording in dropdowns", () => {
  const result = suggestion("eeoc_veteran", createProfile(), {
    type: "select-one",
    selectOptions: ["Select ...", "I am a veteran", "I am not a veteran", "Decline to self-identify"]
  });

  assert.equal(result.suggestedValue, "I am not a veteran");
});

test("why interested prompts get a grounded generated draft", () => {
  const result = buildAnswerSuggestion({
    intent: "why_interested",
    field: field("why_interested", {
      type: "textarea",
      nearbyText: "Tell us why this Product Engineer role interests you."
    }),
    profile: createProfile(),
    answerBank: []
  });

  assert.equal(result.answerSource, "generated_answer");
  assert.equal(result.shortAnswer?.kind, "why_role");
  assert.equal(result.shortAnswer?.answerability, "generatable_from_job_and_profile");
  assert.equal(result.autoFillAllowed, true);
  assert.match(result.suggestedValue, /interested/i);
});

test("saved short answers are reused and prefilled for review", () => {
  const answerBank = createDefaultAnswerBank().map((item) =>
    item.label === "Tell us about yourself."
      ? {
          ...item,
          answer: "I build frontend workflows, automation tooling, and user-facing systems.",
          autofillBehavior: "suggest" as const,
          autoFillAllowed: false
        }
      : item
  );

  const result = buildAnswerSuggestion({
    intent: "tell_us_about_yourself",
    field: field("tell_us_about_yourself", { type: "textarea" }),
    profile: createProfile(),
    answerBank
  });

  assert.equal(result.answerSource, "answer_bank");
  assert.equal(result.shortAnswer?.answerability, "reusable_saved_answer");
  assert.equal(result.autoFillAllowed, true);
  assert.match(result.suggestedValue, /automation tooling/i);
});

test("unsupported experience topics stay in review instead of being invented", () => {
  const result = buildAnswerSuggestion({
    intent: "unknown",
    field: field("unknown", {
      type: "textarea",
      label: "Describe your experience with Rust and embedded firmware"
    }),
    profile: createProfile(),
    answerBank: []
  });

  assert.equal(result.answerSource, "unknown");
  assert.equal(result.shortAnswer?.answerability, "requires_one_user_fact");
  assert.equal(result.suggestedValue, "");
  assert.match(result.shortAnswer?.followUpQuestion || "", /add one concrete fact/i);
});

test("unsupported cryptography prompts stay unresolved instead of being invented", () => {
  const result = buildAnswerSuggestion({
    intent: "unknown",
    field: field("unknown", {
      type: "textarea",
      label: "Describe your experience with cryptography and secure protocol design"
    }),
    profile: createProfile(),
    answerBank: []
  });

  assert.equal(result.answerSource, "unknown");
  assert.equal(result.shortAnswer?.answerability, "requires_one_user_fact");
  assert.equal(result.shortAnswer?.generated, false);
  assert.equal(result.suggestedValue, "");
});

test("camp availability prompts require explicit saved dates instead of guesses", () => {
  const result = buildAnswerSuggestion({
    intent: "unknown",
    field: field("unknown", {
      type: "textarea",
      label: "What weeks are you available to work at camp this summer?"
    }),
    profile: createProfile(),
    answerBank: []
  });

  assert.equal(result.answerSource, "unknown");
  assert.equal(result.shortAnswer?.answerability, "requires_one_user_fact");
  assert.equal(result.suggestedValue, "");
  assert.match(result.shortAnswer?.followUpQuestion || "", /add one concrete fact/i);
});

test("requires_one_user_fact prompts never generate a draft answer", () => {
  const result = buildAnswerSuggestion({
    intent: "unknown",
    field: field("unknown", {
      type: "textarea",
      label: "What weeks are you available to work at camp this summer?"
    }),
    profile: createProfile(),
    answerBank: []
  });

  assert.equal(result.answerSource, "unknown");
  assert.equal(result.shortAnswer?.answerability, "requires_one_user_fact");
  assert.equal(result.shortAnswer?.generated, false);
  assert.equal(result.suggestedValue, "");
});

test('teacher certification prompts use "N/A" only when the profile is complete and no certifications are saved', () => {
  const result = buildAnswerSuggestion({
    intent: "unknown",
    field: field("unknown", {
      type: "textarea",
      label: 'Are you a certified teacher, administrator or specialist? Please list your certifications below. If not please type "N/A"'
    }),
    profile: createProfile({
      workHistoryComplete: true,
      certifications: [{ id: "cert-blank", name: "", issuer: "", date: "" }]
    }),
    answerBank: []
  });

  assert.equal(result.answerSource, "approved_fallback");
  assert.equal(result.suggestedValue, "N/A");
});

test("mission answers keep job context separate from candidate background and pass quality checks", () => {
  const result = buildAnswerSuggestion({
    intent: "unknown",
    field: field("unknown", {
      type: "textarea",
      label:
        "Excel is a mission-driven organization committed to educational equity, academic excellence, and student success. What about our mission, values, or approach to education resonates most with you? How do you see yourself contributing to that vision?"
    }),
    profile: createProfile({
      professionalBackground: {
        ...createProfile().professionalBackground,
        professionalSummary:
          "Product-minded software engineer with hands-on experience building internal tools, frontend workflows, and reliable automation for everyday operational work.",
        currentIdentity: "product-minded software engineer",
        careerDirection:
          "I am looking for roles where I can build useful user-facing systems and make complex workflows feel simpler and more dependable.",
        keyStrengths: ["turning messy workflows into clear, reliable product experiences"],
        reasonsForSeeking: ["I want to work on products where thoughtful UX and dependable execution both matter."]
      }
    }),
    answerBank: [],
    sessionContext: {
      company: "Excel Academy",
      roleTitle: "Teacher"
    }
  });

  assert.equal(result.answerSource, "generated_answer");
  assert.equal(result.shortAnswer?.quality?.passed, true);
  assert.doesNotMatch(result.suggestedValue, /background in excel|background in .*academy|background in .*charter/i);
  assert.doesNotMatch(result.suggestedValue, /product-minded software engineer.*product-minded software engineer/i);
});

test("legacy profiles missing professional background do not crash short-answer generation", () => {
  const legacyProfile = { ...createProfile() } as ApplicantProfile & Record<string, unknown>;

  Reflect.deleteProperty(legacyProfile, "professionalBackground");
  Reflect.deleteProperty(legacyProfile, "stories");

  const result = buildAnswerSuggestion({
    intent: "why_interested",
    field: field("why_interested", {
      type: "textarea",
      nearbyText: "Tell us why this Product Engineer role interests you."
    }),
    profile: legacyProfile as ApplicantProfile,
    answerBank: []
  });

  assert.ok(result.shortAnswer);
  assert.equal(result.answerSource, "generated_answer");
});

test("optional additional information prompts stay safely blank", () => {
  const result = buildAnswerSuggestion({
    intent: "unknown",
    field: field("unknown", {
      type: "textarea",
      label: "Anything else you'd like us to know?"
    }),
    profile: createProfile(),
    answerBank: []
  });

  assert.equal(result.answerSource, "unknown");
  assert.equal(result.shortAnswer?.answerability, "optional_no_value");
  assert.equal(result.suggestedValue, "");
});

test("city search covers far more than hard-coded examples", () => {
  assert.ok(searchCities("").length > 100);
  assert.ok(searchCities("boston").length >= 2);
});

test("structured location matching rejects wrong city and country options", () => {
  const match = matchStructuredLocationOption(
    [
      "Town of New Boston, New Hampshire, United States",
      "Weymouth, Massachusetts, United States",
      "Weymouth, Dorset, United Kingdom"
    ],
    "Weymouth, MA, United States"
  );
  assert.equal(match?.option, "Weymouth, Massachusetts, United States");
});

test("structured location matching rejects misleading United autocomplete results", () => {
  const match = matchStructuredLocationOption(
    [
      "United, Pennsylvania, United States",
      "United States",
      "United States Minor Outlying Islands"
    ],
    "Boston, MA, United States"
  );
  assert.equal(match, null);
});

test("state abbreviation matching resolves full state option labels", () => {
  const match = matchStateOrCountryOption(["Select an option...", "Massachusetts", "New York"], "MA");
  assert.equal(match?.option, "Massachusetts");
});

test("unknown graduation status stays unresolved", () => {
  const profile = createProfile({
    education: [
      {
        ...createProfile().education[0],
        graduationStatus: "not_applicable",
        graduationDateType: "not_applicable",
        graduationDate: ""
      }
    ]
  });
  assert.equal(suggestion("graduated_question", profile).suggestedValue, "");
});

test("persisted profile JSON normalizes legacy graduation values safely", () => {
  const persisted = createDefaultProfile();
  persisted.education = [
    {
      ...persisted.education[0],
      school: "Boston University",
      degree: "Bachelor of Science",
      degreeType: "bachelor_of_science",
      graduationStatus: "Graduated" as ApplicantProfile["education"][number]["graduationStatus"],
      graduationDateType: "Actual" as ApplicantProfile["education"][number]["graduationDateType"],
      graduationDate: "2022-05"
    }
  ];

  const normalized = normalizeProfile(persisted);
  assert.equal(deriveHighestCompletedEducation(normalized), "bachelors_degree");
  assert.equal(suggestion("graduated_question", normalized).suggestedValue, "yes");
});

test("school search covers far more than hard-coded examples", () => {
  assert.ok(searchSchools("").length > 100);
});

test("manual custom values remain possible through the autocomplete datasets", () => {
  assert.equal(searchFieldsOfStudy("robotics").length, 0);
});
