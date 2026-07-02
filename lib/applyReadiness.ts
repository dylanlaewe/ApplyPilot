import { hasResumeOnFile, validateJobUrl } from "@/lib/applyExperience";
import { ApplicantProfile, ApplyReadinessEnvironment, ApplyReadinessItem, ApplyReadinessReport } from "@/types";

function hasBasicIdentity(profile: ApplicantProfile) {
  return Boolean(profile.identity.firstName.trim() && profile.identity.lastName.trim());
}

function hasLocationCoverage(profile: ApplicantProfile) {
  return Boolean(
    profile.identity.city.trim() &&
      (profile.identity.stateProvince.trim() || profile.identity.country.trim() || profile.identity.locationLabel.trim())
  );
}

function hasHistory(profile: ApplicantProfile) {
  return (
    profile.experience.some((entry) => entry.company.trim() || entry.title.trim()) ||
    profile.education.some((entry) => entry.school.trim() || entry.degree.trim())
  );
}

function hasProfessionalSummary(profile: ApplicantProfile) {
  return Boolean(profile.professionalBackground.professionalSummary.trim());
}

function hasSkills(profile: ApplicantProfile) {
  return profile.skills.length > 0 || profile.skillsProfile.skills.length > 0;
}

function createItem(
  id: string,
  label: string,
  detail: string,
  state: ApplyReadinessItem["state"]
): ApplyReadinessItem {
  return {
    id,
    label,
    detail,
    state,
    blocking: state === "required"
  };
}

export function buildApplyReadinessReport({
  profile,
  applicationUrl,
  environment
}: {
  profile: ApplicantProfile;
  applicationUrl: string;
  environment: ApplyReadinessEnvironment;
}): ApplyReadinessReport {
  const urlError = validateJobUrl(applicationUrl);

  const items: ApplyReadinessItem[] = [
    hasResumeOnFile(profile) && profile.resume.fileExists
      ? createItem("resume", "Resume ready", "Your saved resume is available locally for visible upload fields.", "ready")
      : createItem("resume", "Resume required", "Add a resume to start. ApplyPilot keeps it local and never commits it to Git.", "required"),
    hasBasicIdentity(profile)
      ? createItem("identity", "Basic identity info ready", "Your first and last name are available for common application fields.", "ready")
      : createItem("identity", "Basic personal information required", "Add your first and last name before starting another application.", "required"),
    profile.identity.email.trim()
      ? createItem("email", "Email ready", "ApplyPilot can fill your email exactly as saved.", "ready")
      : createItem("email", "Email required", "Add an email address before starting another application.", "required"),
    profile.phone.trim()
      ? createItem("phone", "Phone ready", "Your saved phone number is available for common form fields.", "ready")
      : createItem("phone", "Phone required", "Add a phone number before starting another application.", "required"),
    hasLocationCoverage(profile)
      ? createItem("location", "Location ready", "City and region details are available for common location questions.", "ready")
      : createItem("location", "Location details required", "Add at least a city and state or country before starting another application.", "required"),
    hasHistory(profile)
      ? createItem("history", "Experience or education ready", "You have at least one work or education entry saved.", "ready")
      : createItem("history", "Experience or education recommended", "Add at least one work or education entry to improve autofill coverage.", "recommended"),
    environment.browserAutomationAvailable
      ? createItem("browser", "Browser automation ready", environment.browserAutomationDetail, "ready")
      : createItem("browser", "Browser automation required", environment.browserAutomationDetail, "required"),
    environment.localStorageWritable
      ? createItem("storage", "Local storage ready", environment.localStorageDetail, "ready")
      : createItem("storage", "Local storage required", environment.localStorageDetail, "required"),
    environment.generatorHealth.status === "available"
      ? createItem("generator", "Answer drafts ready", environment.generatorHealth.detail, "ready")
      : createItem("generator", "Answer drafts recommended", environment.generatorHealth.detail, "recommended"),
    urlError
      ? createItem("url", "Application link required", urlError, "required")
      : createItem("url", "Application link ready", "The application link is ready to open in the controlled browser window.", "ready"),
    hasProfessionalSummary(profile)
      ? createItem("summary", "Professional summary ready", "You have a short summary saved for broader professional prompts.", "ready")
      : createItem("summary", "Professional summary recommended", "Add a brief summary to help with profile-based drafting.", "recommended"),
    hasSkills(profile)
      ? createItem("skills", "Skills ready", "Your saved skills can help with targeted matching and answer reuse.", "ready")
      : createItem("skills", "Skills recommended", "Add a few core skills to improve coverage on common application forms.", "recommended")
  ];

  const requiredCount = items.filter((item) => item.state === "required").length;
  const recommendedCount = items.filter((item) => item.state === "recommended").length;

  return {
    status: requiredCount === 0 ? "ready" : "action_needed",
    canStart: requiredCount === 0,
    requiredCount,
    recommendedCount,
    items
  };
}
