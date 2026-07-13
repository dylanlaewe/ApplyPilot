import {
  ApplicantKnowledgeProfile,
  ApplicantProfile,
  DegreeType,
  EducationEntry,
  HighestEducationLevel,
  WebsiteFallbackKind
} from "@/types";

import { deriveGraduatedAnswer, isEducationCompleted, isEducationInProgress, normalizeGraduationStatus } from "@/lib/education";
import { formatLocation } from "@/lib/valueFormatter";

const DEGREE_LEVEL_BY_TYPE: Partial<Record<DegreeType, HighestEducationLevel>> = {
  high_school_diploma: "high_school",
  ged: "high_school",
  certificate: "certificate",
  trade_vocational_credential: "certificate",
  associate_of_arts: "associate_degree",
  associate_of_science: "associate_degree",
  associate_degree: "associate_degree",
  bachelor_of_arts: "bachelors_degree",
  bachelor_of_science: "bachelors_degree",
  bachelor_of_engineering: "bachelors_degree",
  bachelors_degree: "bachelors_degree",
  master_of_arts: "masters_degree",
  master_of_science: "masters_degree",
  master_of_business_administration: "masters_degree",
  masters_degree: "masters_degree",
  juris_doctor: "professional_degree",
  doctor_of_medicine: "professional_degree",
  doctor_of_philosophy: "doctoral_degree",
  doctoral_degree: "doctoral_degree"
};

const EDUCATION_RANKING: HighestEducationLevel[] = [
  "no_formal_education",
  "high_school",
  "certificate",
  "associate_degree",
  "bachelors_degree",
  "masters_degree",
  "professional_degree",
  "doctoral_degree"
];

function choiceToBoolean(value: "yes" | "no" | "ask") {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function normalizeEducationLevel(entry: EducationEntry): HighestEducationLevel | "" {
  if (entry.degreeLevel) return entry.degreeLevel;
  if (entry.degreeType) return DEGREE_LEVEL_BY_TYPE[entry.degreeType] ?? "";
  return "";
}

function educationRank(level: HighestEducationLevel | "") {
  if (!level) return -1;
  return EDUCATION_RANKING.indexOf(level);
}

export function deriveHighestCompletedEducation(profile: ApplicantProfile): HighestEducationLevel | "" {
  return profile.education.reduce<HighestEducationLevel | "">((best, entry) => {
    if (!isEducationCompleted(entry)) {
      return best;
    }

    const level = normalizeEducationLevel(entry);
    return educationRank(level) > educationRank(best) ? level : best;
  }, "");
}

export function deriveHighestEducationIncludingInProgress(profile: ApplicantProfile): HighestEducationLevel | "" {
  return profile.education.reduce<HighestEducationLevel | "">((best, entry) => {
    if (!(isEducationCompleted(entry) || isEducationInProgress(entry))) {
      return best;
    }

    const level = normalizeEducationLevel(entry);
    return educationRank(level) > educationRank(best) ? level : best;
  }, "");
}

export function deriveGraduatedStatus(entry: EducationEntry) {
  return isEducationCompleted(entry);
}

export function deriveExpectedGraduationDate(entry: EducationEntry) {
  if (entry.graduationDateType !== "expected") return "";
  return entry.graduationDate;
}

export function deriveDegreeCompletionAnswer(entry: EducationEntry, questionContext: string) {
  const normalized = questionContext.toLowerCase();
  if (/expected graduation|currently enrolled|still in school|attended/i.test(normalized)) {
    if (isEducationInProgress(entry)) return "yes";
  }
  return deriveGraduatedAnswer(entry);
}

function chooseGenericWebsiteFallback(profile: ApplicantProfile, fallback: WebsiteFallbackKind) {
  switch (fallback) {
    case "personal_website":
      return profile.identity.website || profile.identity.portfolio || profile.identity.linkedin || profile.identity.github;
    case "portfolio":
      return profile.identity.portfolio || profile.identity.website || profile.identity.linkedin || profile.identity.github;
    case "github":
      return profile.identity.github || profile.identity.linkedin || profile.identity.portfolio || profile.identity.website;
    case "leave_blank":
      return "";
    case "linkedin":
    default:
      return profile.identity.linkedin || profile.identity.portfolio || profile.identity.website || profile.identity.github;
  }
}

export function buildKnowledgeProfile(profile: ApplicantProfile): ApplicantKnowledgeProfile {
  const highestCompleted = deriveHighestCompletedEducation(profile);
  const highestIncludingInProgress = deriveHighestEducationIncludingInProgress(profile);
  const primaryEducation =
    profile.education.find((entry) => entry.school.trim() && normalizeEducationLevel(entry) === highestIncludingInProgress) ??
    profile.education.find((entry) => entry.school.trim()) ??
    profile.education[0];
  const currentEmployer = profile.experience.find((entry) => entry.currentRole)?.company || profile.experience.find((entry) => entry.company.trim())?.company || "";
  const currentTitle = profile.experience.find((entry) => entry.currentRole)?.title || profile.experience.find((entry) => entry.title.trim())?.title || "";

  return {
    identity: {
      firstName: profile.identity.firstName,
      middleName: profile.identity.middleName,
      lastName: profile.identity.lastName,
      preferredName: profile.identity.preferredName,
      email: profile.identity.email,
      phoneCountryCode: profile.identity.phoneCountryCode,
      phoneNationalNumber: profile.identity.phoneNationalNumber,
      phoneExtension: profile.identity.phoneExtension,
      country: profile.identity.country,
      addressLine1: profile.identity.addressLine1,
      addressLine2: profile.identity.addressLine2,
      city: profile.identity.city,
      stateProvince: profile.identity.stateProvince,
      postalCode: profile.identity.postalCode
    },
    professionalLinks: {
      linkedInUrl: profile.identity.linkedin,
      portfolioUrl: profile.identity.portfolio,
      githubUrl: profile.identity.github,
      personalWebsiteUrl: profile.identity.website,
      genericWebsiteFallback: profile.identity.genericWebsiteFallback,
      genericWebsiteFallbackValue: chooseGenericWebsiteFallback(profile, profile.identity.genericWebsiteFallback)
    },
    workAuthorization: {
      authorizedToWorkInUS: choiceToBoolean(profile.workAuthorizationProfile.authorizedInUS),
      usWorkAuthorizationCategory: profile.workAuthorizationProfile.usWorkAuthorizationCategory,
      requiresSponsorshipNow: choiceToBoolean(profile.workAuthorizationProfile.requiresSponsorshipNow),
      requiresSponsorshipFuture: choiceToBoolean(profile.workAuthorizationProfile.requiresSponsorshipFuture),
      visaType: profile.workAuthorizationProfile.visaType,
      authorizationExpirationDate: profile.workAuthorizationProfile.authorizationExpirationDate
    },
    security: {
      securityClearanceLevel: profile.securityProfile.clearanceLevel,
      clearanceStatus: profile.securityProfile.clearanceStatus,
      clearanceExpirationDate: profile.securityProfile.clearanceExpirationDate,
      issuingAuthority: profile.securityProfile.issuingAuthority
    },
    education: {
      institutions: profile.education,
      degreeLevel: normalizeEducationLevel(primaryEducation),
      degreeType: primaryEducation?.degreeType ?? "",
      fieldOfStudy: primaryEducation?.displayFieldOfStudy || primaryEducation?.fieldOfStudy || primaryEducation?.major || "",
      graduationStatus: primaryEducation ? normalizeGraduationStatus(primaryEducation.graduationStatus, primaryEducation.graduationDateType, primaryEducation.graduationDate) : "not_applicable",
      graduationDate: primaryEducation?.graduationDate ?? "",
      graduationDateType: primaryEducation?.graduationDateType ?? "not_applicable",
      highestEducationLevel: highestCompleted || highestIncludingInProgress
    },
    employment: {
      employers: profile.experience.map((entry) => entry.company).filter(Boolean),
      employerAliases: profile.experience.flatMap((entry) => entry.aliases ?? []).filter(Boolean),
      workHistoryComplete: profile.workHistoryComplete,
      currentEmployer,
      currentTitle
    },
    compensation: {
      minimumSalary: profile.compensationProfile.minimumSalary,
      targetSalary: profile.compensationProfile.targetSalary,
      maximumSalary: profile.compensationProfile.highSalary,
      minimumHourlyRate: profile.compensationProfile.hourlyMinimum,
      targetHourlyRate: profile.compensationProfile.hourlyTarget
    },
    availabilityAndPreferences: {
      availableStartType: profile.availabilityProfile.startTiming,
      availableStartDate:
        profile.availabilityProfile.startTiming === "custom_date"
          ? profile.availabilityProfile.customStartDate
          : profile.availabilityProfile.customStartDate,
      willingToRelocate: choiceToBoolean(profile.workAuthorizationProfile.openToRelocation),
      openToRemote: choiceToBoolean(profile.workAuthorizationProfile.openToRemote),
      openToHybrid: choiceToBoolean(profile.workAuthorizationProfile.openToHybrid),
      openToOnsite: choiceToBoolean(profile.workAuthorizationProfile.openToOnsite),
      preferredLocations: profile.preferencesProfile.locationsOpenTo
    },
    sensitive: {
      gender: profile.eeocDefaults.gender,
      raceEthnicity: profile.eeocDefaults.raceEthnicity,
      veteranStatus: profile.eeocDefaults.veteranStatus,
      disabilityStatus: profile.eeocDefaults.disabilityStatus
    },
    files: {
      defaultResume: profile.resume,
      additionalResumes: [],
      defaultCoverLetter: null
    },
    additionalQuestions: profile.additionalApplicationFacts
  };
}

export function getFullPhoneNumber(profile: ApplicantProfile) {
  const parts = [profile.identity.phoneCountryCode, profile.identity.phoneNationalNumber].filter(Boolean);
  if (!parts.length && profile.identity.phone.trim()) return profile.identity.phone.trim();
  const base = parts.join(" ").trim();
  return profile.identity.phoneExtension?.trim() ? `${base} x${profile.identity.phoneExtension}` : base;
}

export function getStructuredLocation(profile: ApplicantProfile) {
  return formatLocation(profile);
}

export function getPrimaryExperience(profile: ApplicantProfile) {
  return profile.experience.find((entry) => entry.currentRole && (entry.company.trim() || entry.title.trim())) ??
    profile.experience.find((entry) => entry.company.trim() || entry.title.trim()) ??
    null;
}
