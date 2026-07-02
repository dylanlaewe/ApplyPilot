import path from "path";

import { degreeTypeOptions } from "@/lib/profileSchema";
import { ApplicantProfile, BehavioralStory, EducationEntry, ExperienceEntry } from "@/types";

export type ProfileLinkField = "linkedin" | "github" | "portfolio" | "website" | "otherLink";

export type SaveState = "saved" | "saving" | "pending" | "error";

const linkDomains: Partial<Record<ProfileLinkField, string[]>> = {
  linkedin: ["linkedin.com"],
  github: ["github.com"]
};

export function getResumeFilename(profile: ApplicantProfile) {
  return profile.resume.originalFilename || path.basename(profile.resume.storedPath || "");
}

export function profileNeedsResume(profile: ApplicantProfile) {
  return !getResumeFilename(profile);
}

export function normalizeUrlValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function validateProfileLink(field: ProfileLinkField, value: string) {
  const normalized = normalizeUrlValue(value);
  if (!normalized) return "";

  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "Use an http or https link.";
    }

    const allowedDomains = linkDomains[field];
    if (allowedDomains && !allowedDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
      return `Use your ${field === "linkedin" ? "LinkedIn" : "GitHub"} profile link.`;
    }

    return "";
  } catch {
    return "Enter a valid URL.";
  }
}

export function validateProfileLinks(profile: ApplicantProfile) {
  return {
    linkedin: validateProfileLink("linkedin", profile.identity.linkedin),
    github: validateProfileLink("github", profile.identity.github),
    portfolio: validateProfileLink("portfolio", profile.identity.portfolio),
    website: validateProfileLink("website", profile.identity.website),
    otherLink: validateProfileLink("otherLink", profile.identity.otherLink)
  } satisfies Record<ProfileLinkField, string>;
}

export function prepareProfileForSave(profile: ApplicantProfile): ApplicantProfile {
  const fullName =
    profile.identity.fullName.trim() ||
    [profile.identity.firstName, profile.identity.middleName, profile.identity.lastName].filter(Boolean).join(" ").trim();
  const phone = [profile.identity.phoneCountryCode, profile.identity.phoneNationalNumber].filter(Boolean).join(" ").trim();

  return {
    ...profile,
    identity: {
      ...profile.identity,
      fullName,
      phone,
      linkedin: normalizeUrlValue(profile.identity.linkedin),
      github: normalizeUrlValue(profile.identity.github),
      portfolio: normalizeUrlValue(profile.identity.portfolio),
      website: normalizeUrlValue(profile.identity.website),
      otherLink: normalizeUrlValue(profile.identity.otherLink)
    }
  };
}

export function getSaveStateLabel(state: SaveState) {
  switch (state) {
    case "saving":
      return "Saving locally...";
    case "pending":
      return "Unsaved changes";
    case "error":
      return "Save issue";
    default:
      return "Saved locally";
  }
}

export function getSaveStateTone(state: SaveState) {
  switch (state) {
    case "saving":
      return "bg-sky-100 text-sky-800";
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "error":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-emerald-100 text-emerald-800";
  }
}

export function summarizeExperience(entry: ExperienceEntry) {
  const title = entry.title.trim() || "Role title";
  const company = entry.company.trim() || "Employer";
  if (!entry.title.trim() && !entry.company.trim()) {
    return "Add a role, company, and dates you may want reused on applications.";
  }

  return `${title} at ${company}`;
}

export function summarizeEducation(entry: EducationEntry) {
  const degreeLabel =
    degreeTypeOptions.find((option) => option.value === entry.degreeType)?.label ||
    entry.degreeCustomValue ||
    entry.degree ||
    "";

  if (!entry.school.trim() && !degreeLabel.trim()) {
    return "Add a school, degree, and graduation details only if you want them reused.";
  }

  return [degreeLabel, entry.school.trim()].filter(Boolean).join(", ");
}

export function summarizeStory(story: BehavioralStory, index: number) {
  return story.title.trim() || `Story ${index + 1}`;
}

export function getStoryPreview(story: BehavioralStory) {
  const parts = [story.situation.trim(), story.action.trim(), story.result.trim()].filter(Boolean);
  if (!parts.length) {
    return "Capture a real example you may want to reuse in behavioral prompts.";
  }

  return parts.join(" ").slice(0, 180);
}
