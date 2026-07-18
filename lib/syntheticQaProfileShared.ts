import { ApplicantProfile } from "@/types";

export const SYNTHETIC_QA_PROFILE_NAME = "Avery Example — Synthetic QA Profile — DO NOT SUBMIT";
export const SYNTHETIC_QA_PROFILE_EMAIL = "avery.example.test@example.com";
export const SYNTHETIC_QA_PROFILE_LABEL = "Synthetic QA profile loaded";
export const SYNTHETIC_QA_RESUME_FILENAME = "avery-example-synthetic-resume.pdf";

export function isSyntheticQaProfile(profile: ApplicantProfile | null | undefined) {
  if (!profile) return false;
  const fullName = profile.identity.fullName || profile.fullName || "";
  const email = profile.identity.email || profile.email || "";
  return fullName === SYNTHETIC_QA_PROFILE_NAME || email === SYNTHETIC_QA_PROFILE_EMAIL;
}
