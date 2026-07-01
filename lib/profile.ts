import { existsSync } from "fs";

import { buildKnowledgeProfile } from "@/lib/profileFacts";
import { normalizeGraduationDateType, normalizeGraduationStatus } from "@/lib/education";
import { deriveLegacyFields } from "@/lib/profileSchema";
import { createProfileCompleteness } from "@/lib/profileCompleteness";
import { normalizeText } from "@/lib/utils";
import { readStorageFile, writeStorageFile } from "@/lib/storage";
import {
  AdditionalApplicationFacts,
  ApplicantProfile,
  BehavioralStory,
  CertificationEntry,
  DegreeType,
  EducationEntry,
  EeocRaceAnswerSetting,
  ExperienceEntry,
  GraduationDateType,
  GraduationStatus,
  LocationPreference,
  ProjectEntry
} from "@/types";

const PROFILE_FILE = "profile.json";

function createBlankEducation(): EducationEntry {
  return {
    id: crypto.randomUUID(),
    school: "",
    normalizedSchoolName: "",
    degree: "",
    degreeType: "" as DegreeType | "",
    degreeCustomValue: "",
    degreeLevel: "",
    major: "",
    fieldOfStudy: "",
    normalizedFieldOfStudy: "",
    displayFieldOfStudy: "",
    graduationStatus: "not_applicable" as GraduationStatus,
    graduationDate: "",
    graduationDateType: "not_applicable" as GraduationDateType,
    gpa: "",
    startDate: "",
    endDate: "",
    location: ""
  };
}

function createBlankExperience(): ExperienceEntry {
  return {
    id: crypto.randomUUID(),
    company: "",
    normalizedCompanyName: "",
    aliases: [],
    title: "",
    location: "",
    startDate: "",
    endDate: "",
    currentRole: false,
    summary: "",
    bullets: []
  };
}

function createBlankProject(): ProjectEntry {
  return {
    id: crypto.randomUUID(),
    name: "",
    summary: "",
    technologies: [],
    url: ""
  };
}

function createBlankCertification(): CertificationEntry {
  return {
    id: crypto.randomUUID(),
    name: "",
    issuer: "",
    date: ""
  };
}

function createBlankLocationPreference(): LocationPreference {
  return {
    type: "city",
    label: "",
    city: "",
    stateProvince: "",
    country: "",
    normalizedKey: ""
  };
}

function createBlankEeocSingleAnswer() {
  return {
    value: "Ask me every time",
    customValue: ""
  };
}

function createBlankEeocRaceAnswer(): EeocRaceAnswerSetting {
  return {
    values: ["Ask me every time"],
    customValue: ""
  };
}

function createBlankAdditionalFacts(): AdditionalApplicationFacts {
  return {
    validDriversLicense: "ask",
    reliableTransportation: "ask",
    meetsMinimumWorkingAge: "ask",
    willingBackgroundCheck: "ask",
    willingDrugScreen: "ask",
    relatedFamilyAtCompany: "ask",
    boundByNonCompete: "ask",
    governmentEmploymentHistory: "ask",
    willingToTravel: "ask",
    willingToTravelPercentage: "",
    shiftAvailability: "",
    weekendAvailability: "ask",
    overtimeAvailability: "ask",
    preferredEmploymentType: "",
    referralSource: "",
    noticePeriod: ""
  };
}

export function createBlankProfessionalBackground() {
  return {
    professionalSummary: "",
    currentIdentity: "",
    targetRoleCategories: [],
    industriesOfInterest: [],
    careerDirection: "",
    keyStrengths: [],
    keyAccomplishments: [],
    importantProjects: [],
    reasonsForSeeking: []
  };
}

export function createBlankStory(): BehavioralStory {
  return {
    id: crypto.randomUUID(),
    title: "",
    tags: [],
    situation: "",
    action: "",
    result: ""
  };
}

export function createDefaultProfile(): ApplicantProfile {
  const now = new Date().toISOString();
  const base: ApplicantProfile = {
    id: "primary",
    identity: {
      firstName: "",
      middleName: "",
      lastName: "",
      preferredName: "",
      fullName: "",
      email: "",
      phone: "",
      phoneCountry: "United States",
      phoneCountryCode: "+1",
      phoneNationalNumber: "",
      phoneExtension: null,
      addressLine1: "",
      addressLine2: "",
      city: "",
      stateProvince: "",
      postalCode: "",
      country: "United States",
      locationLabel: "",
      locationKey: "",
      linkedin: "",
      github: "",
      portfolio: "",
      website: "",
      otherLink: "",
      genericWebsiteFallback: "linkedin"
    },
    workAuthorizationProfile: {
      authorizedInUS: "ask",
      usWorkAuthorizationCategory: "ask",
      requiresSponsorshipNow: "ask",
      requiresSponsorshipFuture: "ask",
      visaType: "",
      authorizationExpirationDate: "",
      openToRelocation: "ask",
      openToRemote: "ask",
      openToHybrid: "ask",
      openToOnsite: "ask"
    },
    securityProfile: {
      clearanceLevel: "ask",
      clearanceStatus: "ask",
      clearanceExpirationDate: "",
      issuingAuthority: ""
    },
    availabilityProfile: {
      startTiming: "ask",
      customStartDate: ""
    },
    compensationProfile: {
      minimumSalary: null,
      targetSalary: null,
      highSalary: null,
      hourlyMinimum: null,
      hourlyTarget: null,
      answerStyle: "ask"
    },
    skillsProfile: {
      skills: []
    },
    preferencesProfile: {
      jobTypes: [],
      locationsOpenTo: []
    },
    professionalBackground: createBlankProfessionalBackground(),
    stories: [createBlankStory()],
    eeocDefaults: {
      gender: createBlankEeocSingleAnswer(),
      raceEthnicity: createBlankEeocRaceAnswer(),
      veteranStatus: createBlankEeocSingleAnswer(),
      disabilityStatus: createBlankEeocSingleAnswer()
    },
    additionalApplicationFacts: createBlankAdditionalFacts(),
    workHistoryComplete: false,
    resume: {
      originalFilename: "",
      storedPath: "",
      mimeType: "",
      fileSize: 0,
      uploadedAt: "",
      fileExists: false
    },
    knowledgeProfile: {} as ApplicantProfile["knowledgeProfile"],
    fullName: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    linkedin: "",
    github: "",
    resumePath: "",
    resumeOriginalFilename: "",
    resumeStoredPath: "",
    resumeMimeType: "",
    resumeFileSize: 0,
    resumeUploadedAt: "",
    resumeFileExists: false,
    resumeExtractedTextHash: "",
    parsedFromResume: false,
    profileCompletenessScore: 0,
    lastParsedAt: "",
    education: [createBlankEducation()],
    experience: [createBlankExperience()],
    projects: [createBlankProject()],
    certifications: [createBlankCertification()],
    skills: [],
    workAuthorization: "",
    requiresSponsorship: "",
    desiredSalary: "",
    availability: "",
    demographicDefaults: {
      gender: "",
      ethnicity: "",
      veteranStatus: "",
      disabilityStatus: ""
    },
    createdAt: now,
    updatedAt: now
  };

  base.knowledgeProfile = buildKnowledgeProfile(base);
  return base;
}

function deriveIdentityFromLegacy(profile: ApplicantProfile) {
  const [legacyFirstName = "", ...rest] = (profile.fullName || "").trim().split(/\s+/);
  const legacyLastName = rest.join(" ");
  const locationParts = (profile.location || "").split(",").map((part) => part.trim());

  return {
    ...profile.identity,
    firstName: profile.identity.firstName || legacyFirstName,
    lastName: profile.identity.lastName || legacyLastName,
    fullName: profile.identity.fullName || profile.fullName,
    email: profile.identity.email || profile.email,
    phone: profile.identity.phone || profile.phone,
    phoneNationalNumber:
      profile.identity.phoneNationalNumber ||
      (profile.identity.phone || profile.phone).replace(/[^\d]/g, "").replace(/^1(?=\d{10}$)/, ""),
    phoneCountryCode: profile.identity.phoneCountryCode || "+1",
    stateProvince:
      profile.identity.stateProvince ||
      (profile.identity as ApplicantProfile["identity"] & { state?: string }).state ||
      locationParts[1] ||
      "",
    country: profile.identity.country || locationParts[2] || "United States",
    city: profile.identity.city || locationParts[0] || "",
    linkedin: profile.identity.linkedin || profile.linkedin,
    github: profile.identity.github || profile.github,
    portfolio: profile.identity.portfolio || profile.website,
    website: profile.identity.website || profile.website
  };
}

function parseLegacyNumber(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function sanitizePhoneExtension(extension: string | null | undefined, countryCode: string, nationalNumber: string) {
  const trimmed = (extension ?? "").trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/^(ext\.?|extension|x)\s*/i, "").trim();
  if (!cleaned) return null;

  const extensionDigits = cleaned.replace(/\D/g, "");
  const countryDigits = countryCode.replace(/\D/g, "");
  const nationalDigits = nationalNumber.replace(/\D/g, "");

  if (!extensionDigits) return null;
  if (countryDigits && extensionDigits === countryDigits) return null;
  if (nationalDigits && extensionDigits === nationalDigits) return null;

  return extensionDigits;
}

function normalizeResume(profile: ApplicantProfile) {
  const storedPath = profile.resume?.storedPath || profile.resumeStoredPath || profile.resumePath || "";
  return {
    originalFilename: profile.resume?.originalFilename || profile.resumeOriginalFilename || "",
    storedPath,
    mimeType: profile.resume?.mimeType || profile.resumeMimeType || "",
    fileSize: profile.resume?.fileSize || profile.resumeFileSize || 0,
    uploadedAt: profile.resume?.uploadedAt || profile.resumeUploadedAt || "",
    fileExists: storedPath ? existsSync(storedPath) : false
  };
}

function normalizeLocations(locations: Array<LocationPreference | string> | undefined) {
  return (locations ?? [])
    .map((location) => {
      if (typeof location === "string") {
        return {
          ...createBlankLocationPreference(),
          label: location,
          normalizedKey: normalizeText(location).replace(/\s+/g, "-")
        };
      }
      return {
        ...createBlankLocationPreference(),
        ...location
      };
    })
    .filter((location) => location.label.trim());
}

function normalizeRaceValues(value: ApplicantProfile["demographicDefaults"]["ethnicity"] | string[] | undefined) {
  if (Array.isArray(value)) return value.length ? value : ["Ask me every time"];
  if (typeof value === "string" && value.trim()) return [value];
  return ["Ask me every time"];
}

function normalizeEducationEntry(entry: Partial<EducationEntry>) {
  const base = createBlankEducation();
  const merged = {
    ...base,
    ...entry
  };

  const fieldOfStudy = merged.displayFieldOfStudy || merged.fieldOfStudy || merged.major || "";
  const graduationDate = merged.graduationDate || merged.endDate || "";

  return {
    ...merged,
    major: merged.major || fieldOfStudy,
    fieldOfStudy,
    displayFieldOfStudy: fieldOfStudy,
    normalizedFieldOfStudy: merged.normalizedFieldOfStudy || normalizeText(fieldOfStudy),
    graduationDate,
    graduationStatus: normalizeGraduationStatus(merged.graduationStatus, merged.graduationDateType, graduationDate) as GraduationStatus,
    graduationDateType: normalizeGraduationDateType(
      merged.graduationDateType || (graduationDate ? (normalizeGraduationStatus(merged.graduationStatus, merged.graduationDateType, graduationDate) === "expected" ? "expected" : "actual") : "not_applicable")
    ) as GraduationDateType
  };
}

function normalizeExperienceEntry(entry: Partial<ExperienceEntry>) {
  const base = createBlankExperience();
  const merged = {
    ...base,
    ...entry
  };

  return {
    ...merged,
    normalizedCompanyName: merged.normalizedCompanyName || normalizeText(merged.company).replace(/\b(inc|llc|ltd|corp|corporation|co)\b/g, "").trim(),
    aliases: Array.from(new Set((merged.aliases ?? []).filter(Boolean)))
  };
}

function normalizeTextList(values: string[] | undefined) {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
}

function normalizeStory(story: Partial<BehavioralStory>) {
  const base = createBlankStory();
  const merged = {
    ...base,
    ...story
  };

  return {
    ...merged,
    title: merged.title.trim(),
    tags: normalizeTextList(merged.tags),
    situation: merged.situation.trim(),
    action: merged.action.trim(),
    result: merged.result.trim()
  };
}

export function profileHasMeaningfulData(profile: ApplicantProfile) {
  return Boolean(
    profile.identity.fullName.trim() ||
      profile.identity.email.trim() ||
      profile.identity.phoneNationalNumber.trim() ||
      profile.resume.storedPath.trim() ||
      profile.skills.length ||
      profile.experience.some((entry) => [entry.company, entry.title, entry.summary].some((value) => value.trim())) ||
      profile.education.some((entry) => [entry.school, entry.degree, entry.fieldOfStudy].some((value) => value.trim()))
  );
}

export async function getApplicantProfile() {
  const stored = await readStorageFile(PROFILE_FILE, createDefaultProfile());
  return normalizeProfile(stored);
}

export async function saveApplicantProfile(profile: ApplicantProfile) {
  const existing = await getApplicantProfile();
  const nextProfile = normalizeProfile({
    ...existing,
    ...profile,
    updatedAt: new Date().toISOString()
  });
  await writeStorageFile(PROFILE_FILE, nextProfile);
  return nextProfile;
}

export function normalizeProfile(profile: ApplicantProfile): ApplicantProfile {
  const base = createDefaultProfile();
  const identity = deriveIdentityFromLegacy({
    ...base,
    ...profile,
    identity: { ...base.identity, ...(profile.identity ?? {}) }
  } as ApplicantProfile);

  const normalizedProfile = {
    ...base,
    ...profile,
    identity,
    workAuthorizationProfile: {
      ...base.workAuthorizationProfile,
      ...(profile.workAuthorizationProfile ?? {}),
      authorizedInUS:
        profile.workAuthorizationProfile?.authorizedInUS ??
        (profile.workAuthorization === "Yes" ? "yes" : profile.workAuthorization === "No" ? "no" : "ask"),
      requiresSponsorshipNow:
        profile.workAuthorizationProfile?.requiresSponsorshipNow ??
        (profile.requiresSponsorship === "Yes" ? "yes" : profile.requiresSponsorship === "No" ? "no" : "ask"),
      requiresSponsorshipFuture:
        profile.workAuthorizationProfile?.requiresSponsorshipFuture ??
        (profile.requiresSponsorship === "Yes" ? "yes" : profile.requiresSponsorship === "No" ? "no" : "ask")
    },
    securityProfile: {
      ...base.securityProfile,
      ...(profile.securityProfile ?? {})
    },
    availabilityProfile: {
      ...base.availabilityProfile,
      ...(profile.availabilityProfile ?? {})
    },
    compensationProfile: {
      ...base.compensationProfile,
      ...(profile.compensationProfile ?? {}),
      targetSalary: profile.compensationProfile?.targetSalary ?? parseLegacyNumber(profile.desiredSalary),
      minimumSalary: profile.compensationProfile?.minimumSalary ?? parseLegacyNumber(profile.desiredSalary),
      highSalary: profile.compensationProfile?.highSalary ?? parseLegacyNumber(profile.desiredSalary)
    },
    skillsProfile: {
      ...base.skillsProfile,
      ...(profile.skillsProfile ?? {}),
      skills: profile.skillsProfile?.skills?.length ? profile.skillsProfile.skills : profile.skills ?? []
    },
    preferencesProfile: {
      ...base.preferencesProfile,
      ...(profile.preferencesProfile ?? {}),
      locationsOpenTo: normalizeLocations(profile.preferencesProfile?.locationsOpenTo as Array<LocationPreference | string> | undefined)
    },
    professionalBackground: {
      ...createBlankProfessionalBackground(),
      ...(profile.professionalBackground ?? {}),
      targetRoleCategories: normalizeTextList(profile.professionalBackground?.targetRoleCategories),
      industriesOfInterest: normalizeTextList(profile.professionalBackground?.industriesOfInterest),
      keyStrengths: normalizeTextList(profile.professionalBackground?.keyStrengths),
      keyAccomplishments: normalizeTextList(profile.professionalBackground?.keyAccomplishments),
      importantProjects: normalizeTextList(profile.professionalBackground?.importantProjects),
      reasonsForSeeking: normalizeTextList(profile.professionalBackground?.reasonsForSeeking)
    },
    eeocDefaults: {
      gender: {
        ...createBlankEeocSingleAnswer(),
        ...(profile.eeocDefaults?.gender ?? {}),
        value: profile.eeocDefaults?.gender?.value || profile.demographicDefaults?.gender || "Ask me every time"
      },
      raceEthnicity: {
        ...createBlankEeocRaceAnswer(),
        ...(profile.eeocDefaults?.raceEthnicity ?? {}),
        values: profile.eeocDefaults?.raceEthnicity?.values?.length
          ? profile.eeocDefaults.raceEthnicity.values
          : normalizeRaceValues(profile.demographicDefaults?.ethnicity)
      },
      veteranStatus: {
        ...createBlankEeocSingleAnswer(),
        ...(profile.eeocDefaults?.veteranStatus ?? {}),
        value: profile.eeocDefaults?.veteranStatus?.value || profile.demographicDefaults?.veteranStatus || "Ask me every time"
      },
      disabilityStatus: {
        ...createBlankEeocSingleAnswer(),
        ...(profile.eeocDefaults?.disabilityStatus ?? {}),
        value: profile.eeocDefaults?.disabilityStatus?.value || profile.demographicDefaults?.disabilityStatus || "Ask me every time"
      }
    },
    additionalApplicationFacts: {
      ...createBlankAdditionalFacts(),
      ...(profile.additionalApplicationFacts ?? {})
    },
    workHistoryComplete: profile.workHistoryComplete ?? false,
    resume: normalizeResume({
      ...base,
      ...profile
    } as ApplicantProfile),
    stories: profile.stories?.length ? profile.stories.map(normalizeStory) : [createBlankStory()],
    projects: profile.projects?.length ? profile.projects : [createBlankProject()],
    certifications: profile.certifications?.length ? profile.certifications : [createBlankCertification()],
    education: profile.education?.length ? profile.education.map(normalizeEducationEntry) : [createBlankEducation()],
    experience: profile.experience?.length ? profile.experience.map(normalizeExperienceEntry) : [createBlankExperience()]
  } satisfies ApplicantProfile;

  normalizedProfile.identity.phoneExtension = sanitizePhoneExtension(
    normalizedProfile.identity.phoneExtension,
    normalizedProfile.identity.phoneCountryCode,
    normalizedProfile.identity.phoneNationalNumber
  );

  normalizedProfile.identity.fullName =
    normalizedProfile.identity.fullName.trim() ||
    [normalizedProfile.identity.firstName, normalizedProfile.identity.middleName, normalizedProfile.identity.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
  normalizedProfile.identity.phone =
    normalizedProfile.identity.phone.trim() ||
    [normalizedProfile.identity.phoneCountryCode, normalizedProfile.identity.phoneNationalNumber].filter(Boolean).join(" ").trim();
  normalizedProfile.knowledgeProfile = buildKnowledgeProfile(normalizedProfile);

  const derived = deriveLegacyFields(normalizedProfile);
  derived.knowledgeProfile = buildKnowledgeProfile(derived);
  const completeness = createProfileCompleteness(derived, 0);

  return {
    ...derived,
    profileCompletenessScore: completeness.score
  };
}
