import { extractFocusTerms } from "@/lib/jobContext";
import { normalizeText } from "@/lib/utils";
import {
  AnswerBankItem,
  ApplicantProfile,
  CandidateEvidenceItem,
  CandidateEvidencePack,
  NormalizedJobContext,
  ShortAnswerQuestionKind,
  StoryBankItem
} from "@/types";

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function makeSentence(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim().replace(/[.;,\s]+$/g, "");
  if (!cleaned) return "";
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function joinSkills(skills: string[], max = 4) {
  return skills.filter(Boolean).slice(0, max).join(", ");
}

function itemKeywords(...values: string[]) {
  return unique(values.flatMap((value) => extractFocusTerms(value)));
}

function hasMeaningfulText(...values: Array<string | undefined>) {
  return values.some((value) => Boolean(value?.trim()));
}

function mergeDistinctPhrases(...values: string[]) {
  const parts: string[] = [];
  for (const value of values.map((entry) => entry.trim()).filter(Boolean)) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    if (parts.some((existing) => {
      const existingNormalized = normalizeText(existing);
      return existingNormalized === normalized || existingNormalized.includes(normalized) || normalized.includes(existingNormalized);
    })) {
      continue;
    }
    parts.push(value);
  }
  return parts.join(" ");
}

function matchesFocusTerm(keywords: string[], term: string) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;

  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return (
      normalizedKeyword === normalizedTerm ||
      (normalizedKeyword.length >= 5 && normalizedKeyword.includes(normalizedTerm)) ||
      (normalizedTerm.length >= 5 && normalizedTerm.includes(normalizedKeyword))
    );
  });
}

export function buildCandidateEvidencePack(profile: ApplicantProfile, answerBank: AnswerBankItem[] = []): CandidateEvidencePack {
  const items: CandidateEvidenceItem[] = [];
  const stories: StoryBankItem[] = [];
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
  const savedStories = profile.stories ?? [];

  const location = [profile.identity.city, profile.identity.stateProvince].filter(Boolean).join(", ");
  const headlineSkills = joinSkills(profile.skillsProfile.skills.length ? profile.skillsProfile.skills : profile.skills);
  items.push({
    id: "profile-summary",
    kind: "profile",
    title: "Profile summary",
    summary: makeSentence(
      [profile.experience.find((entry) => entry.currentRole)?.title || "Software professional", location ? `based in ${location}` : "", headlineSkills ? `with experience in ${headlineSkills}` : ""]
        .filter(Boolean)
        .join(" ")
    ),
    claims: [
      makeSentence(profile.experience.find((entry) => entry.currentRole)?.title ? `Current title: ${profile.experience.find((entry) => entry.currentRole)?.title}` : ""),
      makeSentence(headlineSkills ? `Saved skills include ${headlineSkills}` : "")
    ].filter(Boolean),
    keywords: itemKeywords(headlineSkills, location, profile.experience.find((entry) => entry.currentRole)?.title || ""),
    sourceLabel: "Applicant profile",
    provenance: "candidate"
  });

  if (professionalBackground.currentIdentity || professionalBackground.professionalSummary || professionalBackground.careerDirection) {
    items.push({
      id: "professional-background",
      kind: "profile",
      title: "Professional background",
      summary: makeSentence(
        mergeDistinctPhrases(
          professionalBackground.currentIdentity,
          professionalBackground.professionalSummary,
          professionalBackground.careerDirection
        )
      ),
      claims: [
        ...professionalBackground.keyStrengths.map((value) => makeSentence(value)),
        ...professionalBackground.keyAccomplishments.map((value) => makeSentence(value)),
        ...professionalBackground.importantProjects.map((value) => makeSentence(value)),
        ...professionalBackground.reasonsForSeeking.map((value) => makeSentence(value))
      ].filter(Boolean),
      keywords: itemKeywords(
        professionalBackground.currentIdentity,
        professionalBackground.professionalSummary,
        professionalBackground.careerDirection,
        professionalBackground.targetRoleCategories.join(" "),
        professionalBackground.industriesOfInterest.join(" "),
        professionalBackground.keyStrengths.join(" "),
        professionalBackground.keyAccomplishments.join(" ")
      ),
      sourceLabel: "Professional background",
      provenance: "candidate"
    });
  }

  for (const experience of profile.experience) {
    const fallbackSummary =
      experience.summary ||
      [experience.title ? `${experience.title} at ${experience.company}` : "", experience.location ? `in ${experience.location}` : ""].filter(Boolean).join(" ");
    const claims = [fallbackSummary, ...experience.bullets].map(makeSentence).filter(Boolean);
    const id = `experience-${experience.id}`;
    items.push({
      id,
      kind: "experience",
      title: `${experience.title || "Role"} at ${experience.company || "company"}`,
      summary: makeSentence(fallbackSummary),
      claims,
      keywords: itemKeywords(experience.title, experience.company, experience.summary, experience.location, experience.bullets.join(" ")),
      sourceLabel: "Work experience",
      provenance: "candidate"
    });
    stories.push({
      id: `story-${experience.id}`,
      title: `${experience.title || "Role"} story`,
      summary: makeSentence(experience.bullets[0] || fallbackSummary),
      evidenceIds: [id],
      keywords: itemKeywords(experience.title, experience.company, experience.summary, experience.bullets.join(" "))
    });
  }

  for (const project of profile.projects) {
    if (!hasMeaningfulText(project.name, project.summary, project.technologies.join(" "), project.url)) {
      continue;
    }
    const id = `project-${project.id}`;
    const summary = makeSentence(project.summary || `${project.name} project using ${project.technologies.join(", ")}`);
    items.push({
      id,
      kind: "project",
      title: project.name || "Project",
      summary,
      claims: [summary, ...project.technologies.map((tech) => makeSentence(`Used ${tech}`))].filter(Boolean),
      keywords: itemKeywords(project.name, project.summary, project.technologies.join(" ")),
      sourceLabel: "Project history",
      provenance: "candidate"
    });
    stories.push({
      id: `story-${project.id}`,
      title: `${project.name || "Project"} story`,
      summary,
      evidenceIds: [id],
      keywords: itemKeywords(project.name, project.summary, project.technologies.join(" "))
    });
  }

  const topEducation = profile.education[0];
  if (topEducation) {
    items.push({
      id: `education-${topEducation.id}`,
      kind: "education",
      title: topEducation.school || "Education",
      summary: makeSentence(
        [topEducation.degree, topEducation.displayFieldOfStudy || topEducation.fieldOfStudy, topEducation.school].filter(Boolean).join(" in ")
      ),
      claims: [
        makeSentence(topEducation.degree),
        makeSentence(topEducation.displayFieldOfStudy || topEducation.fieldOfStudy),
        makeSentence(topEducation.school)
      ].filter(Boolean),
      keywords: itemKeywords(topEducation.degree, topEducation.fieldOfStudy, topEducation.school),
      sourceLabel: "Education",
      provenance: "candidate"
    });
  }

  if (headlineSkills) {
    items.push({
      id: "skills-summary",
      kind: "skill",
      title: "Skills",
      summary: makeSentence(`Saved skills include ${headlineSkills}`),
      claims: profile.skillsProfile.skills.slice(0, 8).map((skill) => makeSentence(skill)).filter(Boolean),
      keywords: itemKeywords(headlineSkills),
      sourceLabel: "Skills",
      provenance: "candidate"
    });
  }

  for (const story of savedStories.filter((entry) => entry.title || entry.action || entry.result || entry.situation)) {
    const storyId = `saved-story-${story.id}`;
    const summary = makeSentence([story.situation, story.action, story.result].filter(Boolean).join(" "));
    items.push({
      id: storyId,
      kind: "story",
      title: story.title || "Saved story",
      summary,
      claims: [makeSentence(story.situation), makeSentence(story.action), makeSentence(story.result)].filter(Boolean),
      keywords: itemKeywords(story.title, story.tags.join(" "), story.situation, story.action, story.result),
      sourceLabel: "Saved story",
      provenance: "saved_story"
    });
    stories.push({
      id: `story-${story.id}`,
      title: story.title || "Saved story",
      summary,
      evidenceIds: [storyId],
      keywords: itemKeywords(story.title, story.tags.join(" "), story.situation, story.action, story.result)
    });
  }

  for (const item of answerBank) {
    if (!hasMeaningfulText(item.label, item.answer)) continue;
    items.push({
      id: `answer-bank-${item.id}`,
      kind: "answer_bank",
      title: item.label || "Saved answer",
      summary: makeSentence(item.answer),
      claims: [makeSentence(item.answer)].filter(Boolean),
      keywords: itemKeywords(item.label, item.canonicalQuestion, item.questionPatterns.join(" "), item.answer),
      sourceLabel: "Saved answer",
      provenance: "saved_answer"
    });
  }

  return { items, stories };
}

function scoreEvidenceKind(kind: ShortAnswerQuestionKind, item: CandidateEvidenceItem) {
  switch (kind) {
    case "about_me":
      return item.kind === "profile" ? 6 : item.kind === "experience" ? 4 : item.kind === "skill" ? 3 : item.kind === "answer_bank" ? 2 : 1;
    case "why_role":
    case "why_company":
      return item.kind === "experience" ? 7 : item.kind === "project" ? 5 : item.kind === "skill" ? 4 : item.kind === "answer_bank" ? 2 : 1;
    case "experience_relevance":
      return item.kind === "experience" || item.kind === "project" ? 6 : item.kind === "skill" ? 2 : item.kind === "answer_bank" ? 1 : 0;
    case "behavioral_story":
      return item.kind === "story" ? 7 : item.kind === "experience" ? 2 : 0;
    case "why_hire_me":
      return item.kind === "profile" ? 6 : item.kind === "experience" ? 5 : item.kind === "skill" ? 4 : item.kind === "answer_bank" ? 2 : 2;
    case "skills_summary":
      return item.kind === "skill" ? 6 : item.kind === "experience" || item.kind === "project" ? 4 : item.kind === "answer_bank" ? 2 : 1;
    case "additional_info":
    case "motivation":
    case "general":
    default:
      return item.kind === "experience" ? 4 : item.kind === "project" ? 3 : item.kind === "profile" ? 3 : item.kind === "answer_bank" ? 2 : 1;
  }
}

export function selectEvidenceForQuestion(
  pack: CandidateEvidencePack,
  options: {
    kind: ShortAnswerQuestionKind;
    focusTerms: string[];
    questionText: string;
    jobContext: NormalizedJobContext;
  }
) {
  const focusTerms = unique([...options.focusTerms, ...options.jobContext.focusTerms]);
  const ranked = pack.items
    .map((item) => {
      const overlap = focusTerms.filter((term) => matchesFocusTerm(item.keywords, term)).length;
      return {
        item,
        score: scoreEvidenceKind(options.kind, item) + overlap * 4 + (item.summary ? 1 : 0)
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const selectedItems = ranked.slice(0, 3).map((entry) => entry.item);
  const selectedStories = pack.stories
    .filter(
      (story) =>
        story.evidenceIds.some((id) => selectedItems.some((item) => item.id === id)) ||
        focusTerms.some((term) => matchesFocusTerm(story.keywords, term))
    )
    .slice(0, 2);
  const missingEvidence = options.focusTerms.filter(
    (term) =>
      !pack.items.some((item) => matchesFocusTerm(item.keywords, term)) &&
      !pack.stories.some((story) => matchesFocusTerm(story.keywords, term))
  );

  return {
    selectedItems,
    selectedStories,
    missingEvidence
  };
}
