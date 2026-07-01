import { ApplicantProfile, ProfileCompletenessBreakdown } from "@/types";

export function createProfileCompleteness(profile: ApplicantProfile, answerBankCount: number) {
  const breakdown: ProfileCompletenessBreakdown = {
    contactInfo: Boolean(
      profile.identity.firstName.trim() &&
        profile.identity.lastName.trim() &&
        profile.identity.email.trim() &&
        profile.identity.phone.trim() &&
        profile.identity.city.trim() &&
        profile.identity.postalCode.trim()
    ),
    resumeAttached: Boolean(profile.resume.storedPath.trim()),
    workAuthorization: profile.workAuthorizationProfile.authorizedInUS !== "ask",
    sponsorship:
      profile.workAuthorizationProfile.requiresSponsorshipNow !== "ask" ||
      profile.workAuthorizationProfile.requiresSponsorshipFuture !== "ask",
    desiredSalary:
      profile.compensationProfile.answerStyle !== "ask" &&
      Boolean(profile.compensationProfile.targetSalary || profile.compensationProfile.minimumSalary),
    links: Boolean(
      profile.identity.linkedin.trim() ||
        profile.identity.github.trim() ||
        profile.identity.website.trim() ||
        profile.identity.portfolio.trim() ||
        profile.identity.otherLink.trim()
    ),
    education: profile.education.some((entry) => entry.school.trim() || entry.degree.trim()),
    experience: profile.experience.some((entry) => entry.company.trim() || entry.title.trim()),
    skills: profile.skills.length > 0 || profile.skillsProfile.skills.length > 0,
    answerBank: answerBankCount > 0
  };

  const score = Math.round(
    (Object.values(breakdown).filter(Boolean).length / Object.keys(breakdown).length) * 100
  );

  const nudges = [
    !breakdown.workAuthorization ? "Add work authorization to speed up applications." : null,
    !breakdown.sponsorship ? "Add sponsorship answer." : null,
    !breakdown.desiredSalary ? "Add desired salary." : null,
    !breakdown.links ? "Add LinkedIn, GitHub, or a website." : null,
    !breakdown.answerBank ? "Add a reusable answer like “Why this role?”." : null
  ].filter(Boolean) as string[];

  return { breakdown, score, nudges };
}
