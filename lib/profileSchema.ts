import {
  AdditionalApplicationFacts,
  ApplicantProfile,
  AnswerAutofillBehavior,
  AvailabilityTiming,
  BinaryChoice,
  ClearanceStatus,
  CompensationAnswerStyle,
  DegreeType,
  GraduationDateType,
  GraduationStatus,
  HighestEducationLevel,
  JobType,
  SecurityClearanceLevel,
  WebsiteFallbackKind,
  WorkAuthorizationCategory,
  YesNoNotApplicableChoice
} from "@/types";

import { buildKnowledgeProfile, getFullPhoneNumber } from "@/lib/profileFacts";

export const binaryChoiceOptions: Array<{ value: BinaryChoice; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "ask", label: "Ask me each time" }
];

export const yesNoNotApplicableOptions: Array<{ value: YesNoNotApplicableChoice; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "not_applicable", label: "Not applicable" },
  { value: "ask", label: "Ask me each time" }
];

export const availabilityTimingOptions: Array<{ value: AvailabilityTiming; label: string }> = [
  { value: "immediately", label: "Immediately" },
  { value: "1_week", label: "1 week" },
  { value: "2_weeks", label: "2 weeks" },
  { value: "3_weeks", label: "3 weeks" },
  { value: "1_month", label: "1 month" },
  { value: "custom_date", label: "Specific date" },
  { value: "ask", label: "Ask me each time" }
];

export const compensationAnswerStyleOptions: Array<{ value: CompensationAnswerStyle; label: string }> = [
  { value: "range", label: "Range" },
  { value: "target", label: "Target number" },
  { value: "negotiable", label: "Negotiable" },
  { value: "ask", label: "Ask me each time" }
];

export const jobTypeOptions: Array<{ value: JobType; label: string }> = [
  { value: "full_time", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "part_time", label: "Part-time" },
  { value: "temporary", label: "Temporary" },
  { value: "seasonal", label: "Seasonal" }
];

export const answerAutofillBehaviorOptions: Array<{ value: AnswerAutofillBehavior; label: string }> = [
  { value: "ask", label: "Always ask me" },
  { value: "suggest", label: "Suggest for review" },
  { value: "autofill", label: "Autofill when confidently matched" }
];

export const websiteFallbackOptions: Array<{ value: WebsiteFallbackKind; label: string }> = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "personal_website", label: "Personal website" },
  { value: "portfolio", label: "Portfolio" },
  { value: "github", label: "GitHub" },
  { value: "leave_blank", label: "Leave blank" }
];

export const workAuthorizationCategoryOptions: Array<{ value: WorkAuthorizationCategory; label: string }> = [
  { value: "ask", label: "Ask me each time" },
  { value: "us_citizen", label: "US Citizen" },
  { value: "permanent_resident", label: "Permanent Resident" },
  { value: "employment_authorization_document", label: "Employment Authorization Document" },
  { value: "visa_holder", label: "Visa holder" },
  { value: "refugee_or_asylee", label: "Refugee or asylee" },
  { value: "other_authorized", label: "Other authorized status" },
  { value: "not_authorized", label: "Not authorized" },
  { value: "prefer_not_to_answer", label: "Prefer not to answer" }
];

export const securityClearanceLevelOptions: Array<{ value: SecurityClearanceLevel; label: string }> = [
  { value: "ask", label: "Ask me each time" },
  { value: "none", label: "None" },
  { value: "public_trust", label: "Public Trust" },
  { value: "confidential", label: "Confidential" },
  { value: "secret", label: "Secret" },
  { value: "top_secret", label: "Top Secret" },
  { value: "top_secret_sci", label: "Top Secret / SCI" },
  { value: "other", label: "Other" },
  { value: "unsure", label: "Unsure" }
];

export const clearanceStatusOptions: Array<{ value: ClearanceStatus; label: string }> = [
  { value: "ask", label: "Ask me each time" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "expired", label: "Expired" },
  { value: "eligible", label: "Eligible" },
  { value: "never_held", label: "Never held" },
  { value: "unsure", label: "Unsure" }
];

export const highestEducationLevelOptions: Array<{ value: HighestEducationLevel; label: string }> = [
  { value: "no_formal_education", label: "No formal education" },
  { value: "high_school", label: "High school" },
  { value: "certificate", label: "Certificate" },
  { value: "associate_degree", label: "Associate degree" },
  { value: "bachelors_degree", label: "Bachelor's degree" },
  { value: "masters_degree", label: "Master's degree" },
  { value: "professional_degree", label: "Professional degree" },
  { value: "doctoral_degree", label: "Doctoral degree" }
];

export const degreeTypeOptions: Array<{ value: DegreeType; label: string; degreeLevel: HighestEducationLevel | "" }> = [
  { value: "high_school_diploma", label: "High School Diploma", degreeLevel: "high_school" },
  { value: "ged", label: "GED", degreeLevel: "high_school" },
  { value: "certificate", label: "Certificate", degreeLevel: "certificate" },
  { value: "trade_vocational_credential", label: "Trade/Vocational Credential", degreeLevel: "certificate" },
  { value: "associate_of_arts", label: "Associate of Arts", degreeLevel: "associate_degree" },
  { value: "associate_of_science", label: "Associate of Science", degreeLevel: "associate_degree" },
  { value: "associate_degree", label: "Associate Degree", degreeLevel: "associate_degree" },
  { value: "bachelor_of_arts", label: "Bachelor of Arts", degreeLevel: "bachelors_degree" },
  { value: "bachelor_of_science", label: "Bachelor of Science", degreeLevel: "bachelors_degree" },
  { value: "bachelor_of_engineering", label: "Bachelor of Engineering", degreeLevel: "bachelors_degree" },
  { value: "bachelors_degree", label: "Bachelor's Degree", degreeLevel: "bachelors_degree" },
  { value: "master_of_arts", label: "Master of Arts", degreeLevel: "masters_degree" },
  { value: "master_of_science", label: "Master of Science", degreeLevel: "masters_degree" },
  { value: "master_of_business_administration", label: "Master of Business Administration", degreeLevel: "masters_degree" },
  { value: "masters_degree", label: "Master's Degree", degreeLevel: "masters_degree" },
  { value: "juris_doctor", label: "Juris Doctor", degreeLevel: "professional_degree" },
  { value: "doctor_of_medicine", label: "Doctor of Medicine", degreeLevel: "professional_degree" },
  { value: "doctor_of_philosophy", label: "Doctor of Philosophy", degreeLevel: "doctoral_degree" },
  { value: "doctoral_degree", label: "Doctoral Degree", degreeLevel: "doctoral_degree" },
  { value: "other", label: "Other", degreeLevel: "" },
  { value: "no_degree", label: "No degree", degreeLevel: "no_formal_education" },
  { value: "prefer_not_to_answer", label: "Prefer not to answer", degreeLevel: "" }
];

export const graduationStatusOptions: Array<{ value: GraduationStatus; label: string }> = [
  { value: "completed", label: "Graduated / Completed" },
  { value: "currently_enrolled", label: "Currently enrolled" },
  { value: "expected", label: "Expected to graduate" },
  { value: "incomplete", label: "Did not complete" },
  { value: "not_applicable", label: "Not applicable" }
];

export const graduationDateTypeOptions: Array<{ value: GraduationDateType; label: string }> = [
  { value: "actual", label: "Actual graduation date" },
  { value: "expected", label: "Expected graduation date" },
  { value: "not_applicable", label: "Not applicable" }
];

export const eeocGenderOptions = [
  "Ask me every time",
  "Man / Male",
  "Woman / Female",
  "Non-binary",
  "Another identity",
  "Prefer not to answer"
] as const;

export const eeocRaceOptions = [
  "Hispanic or Latino",
  "White",
  "Black or African American",
  "Native Hawaiian or Other Pacific Islander",
  "Asian",
  "American Indian or Alaska Native",
  "Two or More Races",
  "Prefer not to answer",
  "Ask me every time"
] as const;

export const eeocVeteranOptions = [
  "Protected veteran",
  "Not a protected veteran",
  "Veteran but not protected",
  "Prefer not to answer",
  "Ask me every time"
] as const;

export const eeocDisabilityOptions = [
  "Yes",
  "No",
  "Prefer not to answer",
  "Ask me every time"
] as const;

export const additionalQuestionLabels: Record<keyof AdditionalApplicationFacts, string> = {
  validDriversLicense: "Valid driver's license",
  reliableTransportation: "Reliable transportation",
  meetsMinimumWorkingAge: "At least 18 years old",
  willingBackgroundCheck: "Willing to undergo a background check",
  willingDrugScreen: "Willing to undergo drug screening",
  relatedFamilyAtCompany: "Related family employed by the company",
  boundByNonCompete: "Bound by a non-compete agreement",
  governmentEmploymentHistory: "Government employment history",
  willingToTravel: "Willing to travel",
  willingToTravelPercentage: "Travel percentage",
  shiftAvailability: "Shift availability",
  weekendAvailability: "Weekend availability",
  overtimeAvailability: "Overtime availability",
  preferredEmploymentType: "Preferred employment type",
  referralSource: "Referral source",
  noticePeriod: "Current notice period"
};

export function deriveLegacyFields(profile: ApplicantProfile): ApplicantProfile {
  const city = profile.identity.city.trim();
  const stateProvince = profile.identity.stateProvince.trim();
  const country = profile.identity.country.trim();
  const location = [city, stateProvince, country].filter(Boolean).join(", ");

  const workAuthorization =
    profile.workAuthorizationProfile.authorizedInUS === "ask"
      ? ""
      : profile.workAuthorizationProfile.authorizedInUS === "yes"
        ? "Yes"
        : "No";

  const requiresSponsorshipFuture = profile.workAuthorizationProfile.requiresSponsorshipFuture;
  const requiresSponsorship =
    requiresSponsorshipFuture === "ask"
      ? ""
      : requiresSponsorshipFuture === "yes"
        ? "Yes"
        : "No";

  const desiredSalary =
    profile.compensationProfile.answerStyle === "ask"
      ? ""
      : profile.compensationProfile.targetSalary
        ? String(profile.compensationProfile.targetSalary)
        : "";

  const availability =
    profile.availabilityProfile.startTiming === "ask"
      ? ""
      : profile.availabilityProfile.startTiming === "custom_date"
        ? profile.availabilityProfile.customStartDate
        : profile.availabilityProfile.startTiming.replaceAll("_", " ");

  const knowledgeProfile = buildKnowledgeProfile(profile);

  return {
    ...profile,
    knowledgeProfile,
    fullName: profile.identity.fullName,
    email: profile.identity.email,
    phone: getFullPhoneNumber(profile),
    location,
    website: profile.identity.website,
    linkedin: profile.identity.linkedin,
    github: profile.identity.github,
    workAuthorization,
    requiresSponsorship,
    desiredSalary,
    availability,
    skills: profile.skillsProfile.skills,
    demographicDefaults: {
      gender: profile.eeocDefaults.gender.value,
      ethnicity: profile.eeocDefaults.raceEthnicity.values,
      veteranStatus: profile.eeocDefaults.veteranStatus.value,
      disabilityStatus: profile.eeocDefaults.disabilityStatus.value
    },
    resumePath: profile.resume.storedPath,
    resumeStoredPath: profile.resume.storedPath,
    resumeOriginalFilename: profile.resume.originalFilename,
    resumeMimeType: profile.resume.mimeType,
    resumeFileSize: profile.resume.fileSize,
    resumeUploadedAt: profile.resume.uploadedAt,
    resumeFileExists: profile.resume.fileExists
  };
}
