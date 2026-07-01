import { ApplicantProfile, CandidateEvidenceItem, NormalizedJobContext, ShortAnswerQuestionKind, StoryBankItem } from "@/types";
import { normalizeText } from "@/lib/utils";

function cleanSentence(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim().replace(/[,\s.;]+$/g, "");
  if (!cleaned) return "";
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function toPhrase(values: string[]) {
  if (!values.length) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function topSkills(profile: ApplicantProfile, count = 3) {
  return (profile.skillsProfile.skills.length ? profile.skillsProfile.skills : profile.skills).filter(Boolean).slice(0, count);
}

function evidenceSentence(item?: CandidateEvidenceItem) {
  if (!item) return "";
  return cleanSentence(item.summary || item.claims[0] || item.title);
}

function evidenceFragment(item?: CandidateEvidenceItem) {
  const base =
    item?.kind === "profile"
      ? item.claims[0] || item.summary || item.title || ""
      : item?.summary || item?.claims[0] || item?.title || "";
  return cleanSentence(base).replace(/[.!?]$/g, "");
}

function experienceByTopic(topicList: string[]) {
  if (!topicList.length) return "relevant tooling";
  return toPhrase(topicList.slice(0, 3));
}

function deduplicatedPhrase(...values: string[]) {
  const parts: string[] = [];
  for (const value of values.map((entry) => entry.trim()).filter(Boolean)) {
    const normalized = value.toLowerCase();
    if (parts.some((existing) => existing.toLowerCase() === normalized || existing.toLowerCase().includes(normalized) || normalized.includes(existing.toLowerCase()))) {
      continue;
    }
    parts.push(value);
  }
  return parts.join(" ");
}

function lowerFirst(value: string) {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : "";
}

function summarizeCandidateFit(profile: ApplicantProfile, primary?: CandidateEvidenceItem) {
  const professionalBackground = profile.professionalBackground ?? {
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
  const identity = professionalBackground.currentIdentity;
  const summary = professionalBackground.professionalSummary;
  const primarySummary = evidenceFragment(primary);

  return cleanSentence(
    deduplicatedPhrase(
      identity ? `I'm a ${identity}` : "",
      summary,
      primarySummary
    )
  );
}

function extractJobDetail(jobContext: NormalizedJobContext) {
  const question = jobContext.fieldQuestion || "";
  const extractedRole =
    question.match(/\b(?:this|the)\s+([A-Z][A-Za-z/& -]{2,80}\srole)\b/)?.[1] ??
    question.match(/\b([A-Z][A-Za-z/&-]{2,40}\sEngineer\srole)\b/)?.[1];
  const committedTo = question.match(/(?:committed to|focus(?:ed)? on|built around|centered on)\s+([^.!?]+)/i)?.[1];
  const genericInterestQuestion = /why are you interested in this role|tell us why this .* role interests you/i.test(question);

  if (genericInterestQuestion) {
    if (jobContext.roleTitle) {
      return `${jobContext.roleTitle} work`;
    }
    if (extractedRole && !/^this role$/i.test(extractedRole)) {
      return extractedRole;
    }
    return "the problems this role is focused on";
  }

  if (committedTo) {
    return `focus on ${committedTo.trim()}`;
  }

  const mission = question.match(/mission|values|student success|educational equity|academic excellence/i);
  if (mission) {
    return "mission and values";
  }

  const topEvidence = jobContext.evidence.find((item) => item.id !== "job-company" && item.id !== "job-role");
  if (topEvidence?.summary) {
    return topEvidence.summary.replace(/[.!?]$/g, "");
  }

  if (jobContext.roleTitle) {
    return `${jobContext.roleTitle} work`;
  }

  return "the work your team is doing";
}

function whyCompanyInterestSentence(jobContext: NormalizedJobContext) {
  const companyLabel = jobContext.company || "your organization";
  const detail = extractJobDetail(jobContext);
  return cleanSentence(`I'm drawn to ${companyLabel}'s ${detail}`);
}

function whyRoleInterestSentence(roleLabel: string, careerDirection: string, reasonSeeking: string) {
  if (careerDirection) {
    const normalizedDirection = careerDirection
      .replace(/^I am looking for roles where I can\s+/i, "I can ")
      .replace(/^I want to\s+/i, "I can ");
    return cleanSentence(`I'm interested in ${roleLabel} because it fits the direction I want to keep growing in, especially work where ${normalizedDirection}`);
  }
  if (reasonSeeking) {
    return cleanSentence(`I'm interested in ${roleLabel} because ${reasonSeeking.replace(/^[A-Z]/, (letter) => letter.toLowerCase())}`);
  }
  return cleanSentence(`I'm interested in ${roleLabel} because it lines up with the kind of practical, reliable work I want to keep doing`);
}

function candidateContributionSentence(profile: ApplicantProfile, primary?: CandidateEvidenceItem, keyStrength?: string) {
  const professionalBackground = profile.professionalBackground ?? {
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
  const strength = keyStrength || professionalBackground.keyStrengths[0] || "";
  const primarySummary = evidenceFragment(primary);
  const inlinePrimary = primarySummary.replace(/^[A-Z]/, (letter) => letter.toLowerCase());
  const firstPersonPrimary = inlinePrimary
    .replace(/^builds\b/i, "I build")
    .replace(/^built\b/i, "I built")
    .replace(/^works\b/i, "I work")
    .replace(/^worked\b/i, "I worked")
    .replace(/^improves\b/i, "I improve")
    .replace(/^improved\b/i, "I improved")
    .replace(/^develops\b/i, "I develop")
    .replace(/^developed\b/i, "I developed")
    .replace(/^creates\b/i, "I create")
    .replace(/^created\b/i, "I created")
    .replace(/^delivers\b/i, "I deliver")
    .replace(/^delivered\b/i, "I delivered");
  const experienceTitleParts = primary?.kind === "experience" ? primary.title.match(/^(.*?)\s+at\s+(.+)$/i) : null;
  const experienceRole = experienceTitleParts?.[1]?.trim() || "";
  const experienceCompany = experienceTitleParts?.[2]?.trim() || "";
  const article = /^[aeiou]/i.test(experienceRole) ? "an" : "a";
  const titleClause =
    primary?.kind === "experience" && experienceRole
      ? `I've worked as ${article} ${experienceRole.toLowerCase()}${experienceCompany ? ` at ${experienceCompany}` : ""}`
      : "";
  const summaryDiffersFromTitle =
    Boolean(primarySummary) &&
    normalizeText(primarySummary) !== normalizeText(primary?.title || "") &&
    !normalizeText(primarySummary).includes(normalizeText(primary?.title || ""));
  const experienceDetail =
    primary?.kind === "experience"
      ? summaryDiffersFromTitle
        ? `${titleClause}, where ${firstPersonPrimary.replace(/^i\b/i, "I")}`
        : titleClause
      : "";

  if (primary?.kind === "experience" && experienceDetail && strength) {
    return cleanSentence(`${experienceDetail}, and one of the strengths I would bring is ${strength}`);
  }
  if (primary?.kind === "experience" && experienceDetail) {
    return cleanSentence(experienceDetail);
  }
  if (strength && primarySummary) {
    if (primary?.kind === "experience" || primary?.kind === "project") {
      return cleanSentence(`In my recent work, ${firstPersonPrimary}, and one of the strengths I would bring is ${strength}`);
    }
    return cleanSentence(`One of the strengths I would bring is ${strength}`);
  }
  if (primarySummary) {
    if (primary?.kind === "experience" || primary?.kind === "project") {
      return cleanSentence(`In my recent work, ${firstPersonPrimary}`);
    }
    return cleanSentence(`My background includes ${inlinePrimary}`);
  }
  if (strength) {
    return cleanSentence(`One of the strengths I would bring is ${strength}`);
  }
  return "";
}

export function buildGroundedShortAnswer(input: {
  kind: ShortAnswerQuestionKind;
  profile: ApplicantProfile;
  evidenceItems: CandidateEvidenceItem[];
  stories: StoryBankItem[];
  focusTerms: string[];
  jobContext: NormalizedJobContext;
  regenerationNotes?: string[];
}) {
  const professionalBackground = input.profile.professionalBackground ?? {
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
  const primary = input.evidenceItems[0];
  const secondary = input.evidenceItems[1];
  const skillPhrase = toPhrase(topSkills(input.profile));
  const evidenceIds = input.evidenceItems.map((item) => item.id);
  const evidenceTitles = input.evidenceItems.map((item) => item.title);
  const storyIds = input.stories.map((story) => story.id);
  const roleLabel = input.jobContext.roleTitle ? `the ${input.jobContext.roleTitle} role` : "this role";
  const topicPhrase = experienceByTopic(input.focusTerms.length ? input.focusTerms : input.jobContext.focusTerms);
  const careerDirection = professionalBackground.careerDirection;
  const keyStrength = professionalBackground.keyStrengths[0] || "";
  const reasonSeeking = professionalBackground.reasonsForSeeking[0] || "";
  const importantProject = professionalBackground.importantProjects[0] || "";
  const primaryStory = input.stories[0];
  const regenerationNotes = input.regenerationNotes ?? [];
  const conservative = regenerationNotes.length > 0;

  let sentences: string[] = [];

  switch (input.kind) {
    case "why_company":
      sentences = [
        whyCompanyInterestSentence(input.jobContext),
        candidateContributionSentence(input.profile, primary, keyStrength),
        cleanSentence(reasonSeeking || careerDirection || "That combination is why this opportunity stands out to me.")
      ];
      break;
    case "why_role":
    case "motivation":
      sentences = [
        whyRoleInterestSentence(roleLabel, careerDirection, reasonSeeking),
        candidateContributionSentence(input.profile, primary, keyStrength),
        cleanSentence(extractJobDetail(input.jobContext) ? `The chance to contribute to ${extractJobDetail(input.jobContext)} is especially appealing to me.` : "")
      ];
      break;
    case "about_me":
      sentences = [
        summarizeCandidateFit(input.profile, primary),
        cleanSentence(skillPhrase ? `My strongest saved skills include ${skillPhrase}` : ""),
        cleanSentence(keyStrength ? `One of my core strengths is ${keyStrength}` : careerDirection)
      ];
      break;
    case "skills_summary":
      sentences = [
        cleanSentence(skillPhrase ? `My strongest saved skills include ${skillPhrase}` : "My saved profile highlights technical and product work"),
        candidateContributionSentence(input.profile, primary),
        conservative ? "" : evidenceSentence(secondary)
      ];
      break;
    case "why_hire_me":
      sentences = [
        cleanSentence(`I would bring a grounded background in ${topicPhrase || skillPhrase || "reliable engineering work"} to ${roleLabel}`),
        cleanSentence(keyStrength ? `One of my strengths is ${keyStrength}` : ""),
        candidateContributionSentence(input.profile, primary)
      ];
      break;
    case "behavioral_story":
      sentences = [cleanSentence(primaryStory?.summary || ""), cleanSentence(primaryStory?.title || "")];
      break;
    case "additional_info":
      sentences = [
        cleanSentence(reasonSeeking || careerDirection || importantProject || ""),
        evidenceSentence(primary),
        primaryStory?.summary ? cleanSentence(primaryStory.summary) : evidenceSentence(secondary)
      ];
      break;
    case "experience_relevance":
      {
        const primaryFragment = evidenceFragment(primary);
        const secondaryFragment = evidenceFragment(secondary);
        const positionLabel = input.jobContext.roleTitle ? `the ${input.jobContext.roleTitle} position` : "this position";
        const relevantExperienceDetail = primaryFragment
          ? `${lowerFirst(primaryFragment)}`
          : skillPhrase
            ? `hands-on work with ${skillPhrase}`
            : topicPhrase
              ? `hands-on work related to ${topicPhrase}`
              : "practical product and engineering work";

        sentences = [
          cleanSentence(`My relevant experience for ${positionLabel} includes ${relevantExperienceDetail}`),
          cleanSentence(skillPhrase ? `The skills I use most are ${skillPhrase}` : ""),
          conservative
            ? ""
            : cleanSentence(
                keyStrength
                  ? `One of the strengths I would bring is ${keyStrength}`
                  : secondaryFragment
                    ? `I have also worked on ${lowerFirst(secondaryFragment)}`
                    : ""
              )
        ];
      }
      break;
    case "general":
    default:
      sentences = [
        cleanSentence(skillPhrase ? `My background includes ${skillPhrase}` : "My background includes relevant engineering and product work"),
        candidateContributionSentence(input.profile, primary),
        conservative ? "" : evidenceSentence(secondary)
      ];
      break;
  }

  return {
    answer: sentences.filter(Boolean).slice(0, 3).join(" "),
    evidenceIds,
    evidenceTitles,
    storyIds,
    warnings: [],
    missingEvidence: []
  };
}
