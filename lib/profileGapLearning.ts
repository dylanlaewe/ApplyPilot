import { getApplicantProfile, saveApplicantProfile } from "@/lib/profile";
import { DetectedField } from "@/types";

export async function rememberStructuredProfileFact(field: DetectedField, value: string) {
  const profile = await getApplicantProfile();
  let changed = false;

  switch (field.intent) {
    case "security_clearance_level":
      profile.securityProfile.clearanceLevel = value as typeof profile.securityProfile.clearanceLevel;
      changed = true;
      break;
    case "valid_drivers_license":
      profile.additionalApplicationFacts.validDriversLicense = value as typeof profile.additionalApplicationFacts.validDriversLicense;
      changed = true;
      break;
    case "minimum_working_age":
      profile.additionalApplicationFacts.meetsMinimumWorkingAge = value as typeof profile.additionalApplicationFacts.meetsMinimumWorkingAge;
      changed = true;
      break;
    case "work_authorization_category":
      profile.workAuthorizationProfile.usWorkAuthorizationCategory = value as typeof profile.workAuthorizationProfile.usWorkAuthorizationCategory;
      changed = true;
      break;
    default:
      break;
  }

  if (!changed) return null;
  return saveApplicantProfile(profile);
}
