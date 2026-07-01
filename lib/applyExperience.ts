import { ApplicationSession, ApplicantProfile, SessionStatus } from "@/types";

export const primaryNavigation = [
  { href: "/", label: "Apply" },
  { href: "/applications", label: "Applications" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" }
] as const;

const progressStatuses: SessionStatus[] = ["opening_browser", "navigating", "scanning", "filling", "verifying"];
const terminalStatuses: SessionStatus[] = ["submitted", "rejected", "offer", "archived", "abandoned"];

export function hasResumeOnFile(profile: ApplicantProfile) {
  return Boolean(
    profile.resume?.fileExists ||
      profile.resume?.storedPath?.trim() ||
      profile.resumeStoredPath?.trim() ||
      profile.resumePath?.trim()
  );
}

export function getResumeDisplayName(profile: ApplicantProfile) {
  return profile.resume?.originalFilename || profile.resumeOriginalFilename || "Resume on file";
}

export function validateJobUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Paste a job application link to begin.";
  }

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Use a full http or https link.";
    }
    return null;
  } catch {
    return "Enter a valid job application link.";
  }
}

export function shouldPollSession(session: ApplicationSession | null) {
  return Boolean(session && progressStatuses.includes(session.status));
}

export function getActiveSession(sessions: ApplicationSession[], requestedId?: string | null) {
  if (requestedId) {
    return sessions.find((session) => session.id === requestedId) ?? null;
  }

  return sessions.find((session) => !terminalStatuses.includes(session.status)) ?? null;
}

export function getSessionProgress(session: ApplicationSession | null) {
  const currentStatus = session?.status;
  const currentStep =
    currentStatus === "opening_browser" || currentStatus === "navigating"
      ? 0
      : currentStatus === "scanning"
        ? 1
        : currentStatus === "filling" || currentStatus === "verifying"
          ? 2
          : currentStatus === "needs_review" || currentStatus === "ready_for_submission"
            ? 3
            : -1;

  return [
    { label: "Open the application", state: currentStep > 0 ? "complete" : currentStep === 0 ? "current" : "upcoming" },
    { label: "Read the page", state: currentStep > 1 ? "complete" : currentStep === 1 ? "current" : "upcoming" },
    { label: "Fill the safe basics", state: currentStep > 2 ? "complete" : currentStep === 2 ? "current" : "upcoming" },
    { label: "Pause for your review", state: currentStep >= 3 ? "current" : "upcoming" }
  ] as const;
}

export function getSessionStateTone(session: ApplicationSession | null) {
  if (!session) return "idle" as const;
  if (progressStatuses.includes(session.status)) return "active" as const;
  if (session.status === "needs_review") return "review" as const;
  if (session.status === "ready_for_submission") return "ready" as const;
  if (session.status === "waiting_for_user") return "attention" as const;
  if (session.status === "failed") return "error" as const;
  return "idle" as const;
}

export function getApplyMode(session: ApplicationSession | null, hasResume: boolean) {
  if (!hasResume && !session) return "missing_resume" as const;
  if (!session) return "initial" as const;
  if (progressStatuses.includes(session.status)) return "active" as const;
  if (session.status === "needs_review") return "needs_input" as const;
  if (session.status === "ready_for_submission") return "ready" as const;
  if (session.status === "waiting_for_user" || session.status === "failed") return "recovery" as const;
  return "active" as const;
}

export function getReviewFieldCount(session: ApplicationSession | null) {
  if (!session) return 0;
  return session.detectedFields.filter((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status)).length;
}
