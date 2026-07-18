import { AnswerSourceKind, ApplicantProfile, EducationEntry, FieldIntent, RawScannedField } from "@/types";

import { normalizeGraduationStatus } from "@/lib/education";
import {
  buildKnowledgeProfile,
  deriveDegreeCompletionAnswer,
  deriveExpectedGraduationDate,
  deriveGraduatedStatus,
  deriveHighestCompletedEducation,
  deriveHighestEducationIncludingInProgress,
  getFullPhoneNumber,
  getPrimaryExperience,
  getStructuredLocation
} from "@/lib/profileFacts";
import { detectQuestionPolarity } from "@/lib/questionPolarity";
import { normalizeText } from "@/lib/utils";

export type DerivedAnswer = {
  value: string;
  source: AnswerSourceKind;
  reason: string;
  confidence: number;
};

function normalizeCompanyName(value: string) {
  return normalizeText(value)
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findPrimaryEducation(profile: ApplicantProfile) {
  return (
    profile.education.find((entry) => entry.school.trim() && normalizeGraduationStatus(entry.graduationStatus, entry.graduationDateType, entry.graduationDate) === "completed") ??
    profile.education.find((entry) => entry.school.trim()) ??
    null
  );
}

function findRelevantCompanyFromQuestion(field: RawScannedField) {
  const text = normalizeText([field.label, field.nearbyText, field.ariaLabel, field.placeholder].filter(Boolean).join(" "));
  const match = text.match(/worked for ([a-z0-9 .&'-]+?)(?: in the past|\?|$)/i);
  if (!match) return "";
  return match[1].trim();
}

export function deriveFieldAnswer(intent: FieldIntent, profile: ApplicantProfile, field: RawScannedField): DerivedAnswer {
  const knowledge = profile.knowledgeProfile ?? buildKnowledgeProfile(profile);
  const primaryEducation = findPrimaryEducation(profile);
  const primaryExperience = getPrimaryExperience(profile);
  const questionText = [field.label, field.nearbyText, field.ariaLabel, field.placeholder].filter(Boolean).join(" ");

  switch (intent) {
    case "first_name":
      return { value: knowledge.identity.firstName, source: "explicit_profile", reason: "Using your saved first name.", confidence: 0.99 };
    case "middle_name":
      return { value: knowledge.identity.middleName, source: "explicit_profile", reason: "Using your saved middle name.", confidence: 0.99 };
    case "last_name":
      return { value: knowledge.identity.lastName, source: "explicit_profile", reason: "Using your saved last name.", confidence: 0.99 };
    case "preferred_name":
      return { value: knowledge.identity.preferredName, source: "explicit_profile", reason: "Using your saved preferred name.", confidence: 0.99 };
    case "full_name":
      return { value: profile.identity.fullName, source: "derived_profile", reason: "Using your full name from profile facts.", confidence: 0.99 };
    case "email":
      return { value: knowledge.identity.email, source: "explicit_profile", reason: "Using your saved email.", confidence: 0.99 };
    case "phone_country_code":
      return field.role === "combobox" || field.controlType === "aria_combobox"
        ? {
            value: profile.identity.phoneCountry || knowledge.identity.country,
            source: "explicit_profile",
            reason: "Using your saved phone country for the country selector.",
            confidence: 0.99
          }
        : { value: knowledge.identity.phoneCountryCode, source: "explicit_profile", reason: "Using your saved calling code.", confidence: 0.99 };
    case "phone_number":
      return { value: knowledge.identity.phoneNationalNumber, source: "explicit_profile", reason: "Using your saved national phone number.", confidence: 0.98 };
    case "phone_extension":
      return { value: knowledge.identity.phoneExtension ?? "", source: "explicit_profile", reason: "Using your saved phone extension.", confidence: 0.98 };
    case "phone_device_type":
      return {
        value: profile.additionalApplicationFacts.phoneDeviceType ?? "",
        source: profile.additionalApplicationFacts.phoneDeviceType ? "explicit_profile" : "unknown",
        reason: profile.additionalApplicationFacts.phoneDeviceType
          ? "Using your saved phone device type."
          : "No phone device type is saved yet.",
        confidence: profile.additionalApplicationFacts.phoneDeviceType ? 0.97 : 0.35
      };
    case "full_phone_number":
    case "phone":
      return field.type === "tel" && /country/.test(normalizeText(questionText))
        ? {
            value: knowledge.identity.phoneNationalNumber,
            source: "explicit_profile",
            reason: "Using your national phone number because this form has a separate country selector.",
            confidence: 0.98
          }
        : { value: getFullPhoneNumber(profile), source: "formatted_profile", reason: "Formatted from your saved phone facts.", confidence: 0.98 };
    case "address_line_1":
    case "street_address":
      return { value: knowledge.identity.addressLine1, source: "explicit_profile", reason: "Using your saved street address.", confidence: 0.97 };
    case "address_line_2":
      return { value: knowledge.identity.addressLine2, source: "explicit_profile", reason: "Using your saved address line 2.", confidence: 0.97 };
    case "city":
      if (!knowledge.identity.city) {
        return {
          value: "",
          source: "unknown",
          reason: "Your city is not saved yet, so ApplyPilot left this field unresolved instead of guessing from country or autocomplete results.",
          confidence: 0.35
        };
      }
      return field.controlType === "aria_combobox" || field.controlType === "autocomplete" || field.role === "combobox"
        ? {
            value: getStructuredLocation(profile),
            source: "formatted_profile",
            reason: "Using your saved city and state together so autocomplete selection can be verified precisely.",
            confidence: 0.96
          }
        : { value: knowledge.identity.city, source: "explicit_profile", reason: "Using your saved city.", confidence: 0.98 };
    case "state":
      return { value: knowledge.identity.stateProvince, source: "explicit_profile", reason: "Using your saved state or province.", confidence: 0.98 };
    case "postal_code":
      return { value: knowledge.identity.postalCode, source: "explicit_profile", reason: "Using your saved ZIP or postal code.", confidence: 0.98 };
    case "country":
      return { value: knowledge.identity.country, source: "explicit_profile", reason: "Using your saved country.", confidence: 0.98 };
    case "location":
    case "full_location":
      return { value: getStructuredLocation(profile), source: "formatted_profile", reason: "Formatted from your saved city, state, and country.", confidence: 0.94 };
    case "linkedin":
      return { value: knowledge.professionalLinks.linkedInUrl, source: "explicit_profile", reason: "Using your saved LinkedIn URL.", confidence: 0.99 };
    case "github":
      return { value: knowledge.professionalLinks.githubUrl, source: "explicit_profile", reason: "Using your saved GitHub URL.", confidence: 0.99 };
    case "portfolio":
      return {
        value: knowledge.professionalLinks.portfolioUrl || knowledge.professionalLinks.personalWebsiteUrl,
        source: knowledge.professionalLinks.portfolioUrl ? "explicit_profile" : "approved_fallback",
        reason: knowledge.professionalLinks.portfolioUrl
          ? "Using your saved portfolio URL."
          : "Using your personal website as the approved portfolio fallback.",
        confidence: knowledge.professionalLinks.portfolioUrl ? 0.99 : 0.9
      };
    case "website":
      return knowledge.professionalLinks.personalWebsiteUrl
        ? {
            value: knowledge.professionalLinks.personalWebsiteUrl,
            source: "explicit_profile",
            reason: "Using your saved personal website.",
            confidence: 0.99
          }
        : knowledge.professionalLinks.portfolioUrl
          ? {
              value: knowledge.professionalLinks.portfolioUrl,
              source: "approved_fallback",
              reason: "Using your portfolio as the approved website fallback.",
              confidence: 0.94
            }
          : {
              value: "",
              source: "unknown",
              reason: "No personal website or portfolio is saved, so ApplyPilot left the Website field blank.",
              confidence: 0.4
            };
    case "work_authorization":
      return {
        value:
          knowledge.workAuthorization.authorizedToWorkInUS === null
            ? ""
            : knowledge.workAuthorization.authorizedToWorkInUS
              ? "yes"
              : "no",
        source: "explicit_profile",
        reason: "Using your saved U.S. work authorization answer.",
        confidence: 0.96
      };
    case "work_authorization_category":
      if (knowledge.workAuthorization.usWorkAuthorizationCategory === "ask") {
        return { value: "", source: "unknown", reason: "Work authorization category is set to ask each time.", confidence: 0.4 };
      }
      return {
        value: knowledge.workAuthorization.usWorkAuthorizationCategory,
        source: "explicit_profile",
        reason: "Using your saved work authorization category.",
        confidence: 0.97
      };
    case "sponsorship":
    case "sponsorship_now":
    case "sponsorship_future":
    case "work_without_sponsorship": {
      const polarity = detectQuestionPolarity(questionText, intent);
      const requiresNow = knowledge.workAuthorization.requiresSponsorshipNow;
      const requiresFuture = knowledge.workAuthorization.requiresSponsorshipFuture;
      const combinedRequirement =
        requiresNow === null && requiresFuture === null ? null : Boolean(requiresNow || requiresFuture);
      const requirement =
        intent === "sponsorship_now"
          ? requiresNow
          : intent === "sponsorship_future"
            ? requiresFuture
            : combinedRequirement;

      if (requirement === null) {
        return { value: "", source: "unknown", reason: "Sponsorship is set to ask each time.", confidence: 0.4 };
      }
      const yesNo =
        polarity === "without_sponsorship"
          ? requirement
            ? "no"
            : "yes"
          : requirement
            ? "yes"
            : "no";
      return { value: yesNo, source: "explicit_profile", reason: "Using your saved sponsorship facts.", confidence: 0.96 };
    }
    case "education_school":
      return { value: primaryEducation?.school ?? "", source: "explicit_profile", reason: "Using your saved school.", confidence: 0.95 };
    case "education_degree":
      return { value: primaryEducation?.degree ?? "", source: "explicit_profile", reason: "Using your saved degree.", confidence: 0.95 };
    case "education_major":
      return {
        value: primaryEducation?.displayFieldOfStudy || primaryEducation?.fieldOfStudy || primaryEducation?.major || "",
        source: "explicit_profile",
        reason: "Using your saved field of study.",
        confidence: 0.95
      };
    case "education_highest_completed":
      return {
        value: deriveHighestCompletedEducation(profile),
        source: "derived_profile",
        reason: "Derived from your completed education history.",
        confidence: 0.93
      };
    case "education_highest_attended":
      return {
        value: deriveHighestEducationIncludingInProgress(profile),
        source: "derived_profile",
        reason: "Derived from your completed and in-progress education history.",
        confidence: 0.9
      };
    case "graduated_question":
      if (!primaryEducation) {
        return { value: "", source: "unknown", reason: "No education entry is saved yet.", confidence: 0.3 };
      }

      {
        const derivedValue = deriveDegreeCompletionAnswer(primaryEducation, questionText);
        return derivedValue
          ? {
              value: derivedValue,
              source: "derived_profile",
              reason: "Derived from the normalized graduation status saved on your education entry.",
              confidence: 0.93
            }
          : {
              value: "",
              source: "unknown",
              reason: "Graduation status is unknown, so ApplyPilot left this for review instead of guessing.",
              confidence: 0.35
            };
      }
    case "graduation_status":
      return primaryEducation
        ? {
            value: primaryEducation.graduationStatus,
            source: "explicit_profile",
            reason: "Using your saved graduation status.",
            confidence: 0.94
          }
        : { value: "", source: "unknown", reason: "No education entry is saved yet.", confidence: 0.3 };
    case "expected_graduation_date":
      return primaryEducation
        ? {
            value: deriveExpectedGraduationDate(primaryEducation),
            source: "derived_profile",
            reason: "Using the expected graduation date from your education entry.",
            confidence: 0.9
          }
        : { value: "", source: "unknown", reason: "No education entry is saved yet.", confidence: 0.3 };
    case "graduation_date":
      return primaryEducation
        ? {
            value: primaryEducation.graduationDate,
            source: deriveGraduatedStatus(primaryEducation) ? "explicit_profile" : "derived_profile",
            reason: "Using the graduation date saved on your education entry.",
            confidence: 0.92
          }
        : { value: "", source: "unknown", reason: "No education entry is saved yet.", confidence: 0.3 };
    case "employer":
      return primaryExperience
        ? {
            value: primaryExperience.company,
            source: "explicit_profile",
            reason: "Using your saved employer from the primary work-experience entry.",
            confidence: 0.94
          }
        : { value: "", source: "unknown", reason: "No work-experience entry is saved yet.", confidence: 0.3 };
    case "job_title":
      return primaryExperience
        ? {
            value: primaryExperience.title,
            source: "explicit_profile",
            reason: "Using your saved job title from the primary work-experience entry.",
            confidence: 0.94
          }
        : { value: "", source: "unknown", reason: "No work-experience entry is saved yet.", confidence: 0.3 };
    case "employment_start_date":
      return primaryExperience
        ? {
            value: primaryExperience.startDate,
            source: "explicit_profile",
            reason: "Using your saved start date from the primary work-experience entry.",
            confidence: 0.92
          }
        : { value: "", source: "unknown", reason: "No work-experience entry is saved yet.", confidence: 0.3 };
    case "employment_end_date":
      return primaryExperience
        ? {
            value: primaryExperience.currentRole ? "" : primaryExperience.endDate,
            source: primaryExperience.currentRole ? "approved_fallback" : "explicit_profile",
            reason: primaryExperience.currentRole
              ? "Your primary work-experience entry is marked current, so ApplyPilot left the end date blank."
              : "Using your saved end date from the primary work-experience entry.",
            confidence: primaryExperience.currentRole ? 0.9 : 0.92
          }
        : { value: "", source: "unknown", reason: "No work-experience entry is saved yet.", confidence: 0.3 };
    case "security_clearance_level":
      if (knowledge.security.securityClearanceLevel === "ask") {
        return { value: "", source: "unknown", reason: "Security clearance is set to ask each time.", confidence: 0.4 };
      }
      return {
        value: knowledge.security.securityClearanceLevel,
        source: "explicit_profile",
        reason: "Using your saved security clearance level.",
        confidence: 0.96
      };
    case "security_clearance_status":
    case "security_clearance_active":
      if (knowledge.security.clearanceStatus === "ask") {
        return { value: "", source: "unknown", reason: "Security clearance status is set to ask each time.", confidence: 0.4 };
      }
      return {
        value: knowledge.security.clearanceStatus,
        source: "explicit_profile",
        reason: "Using your saved security clearance status.",
        confidence: 0.96
      };
    case "previous_employment": {
      const company = findRelevantCompanyFromQuestion(field);
      if (!company) {
        return { value: "", source: "unknown", reason: "The company name was not clear enough to verify former employment safely.", confidence: 0.45 };
      }
      const target = normalizeCompanyName(company);
      const allKnownEmployers = new Set([
        ...knowledge.employment.employers.map(normalizeCompanyName),
        ...knowledge.employment.employerAliases.map(normalizeCompanyName)
      ]);
      if (allKnownEmployers.has(target)) {
        return { value: "yes", source: "derived_profile", reason: `Matched ${company} against your saved employment history.`, confidence: 0.94 };
      }
      return {
        value: "",
        source: "unknown",
        reason: `ApplyPilot needs an explicit saved answer or matching employment history before it can answer about ${company}.`,
        confidence: 0.45
      };
    }
    case "valid_drivers_license":
      return {
        value: profile.additionalApplicationFacts.validDriversLicense === "ask" ? "" : profile.additionalApplicationFacts.validDriversLicense,
        source: "explicit_profile",
        reason: "Using your saved driver's license answer.",
        confidence: 0.94
      };
    case "minimum_working_age":
      return {
        value: profile.additionalApplicationFacts.meetsMinimumWorkingAge === "ask" ? "" : profile.additionalApplicationFacts.meetsMinimumWorkingAge,
        source: "explicit_profile",
        reason: "Using your saved minimum working age answer.",
        confidence: 0.94
      };
    default:
      return { value: "", source: "unknown", reason: "No derived profile fact matched this field yet.", confidence: 0.35 };
  }
}
