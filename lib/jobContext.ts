import { JobEvidenceItem, NormalizedJobContext } from "@/types";

import { normalizeText } from "@/lib/utils";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "role",
  "position",
  "company",
  "team",
  "job",
  "apply",
  "application",
  "work",
  "your",
  "our",
  "you",
  "why",
  "tell",
  "interested",
  "interests",
  "about",
  "into",
  "will",
  "are",
  "have",
  "from"
]);

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function cleanSentence(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/[.;,\s]+$/g, "");
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => cleanSentence(sentence))
    .filter(Boolean);
}

function buildJobEvidence(input: BuildJobContextInput) {
  const evidence: JobEvidenceItem[] = [];
  const seen = new Set<string>();

  const pushEvidence = (id: string, title: string, summary: string) => {
    const cleanedTitle = cleanSentence(title);
    const cleanedSummary = cleanSentence(summary);
    const key = normalizeText(`${cleanedTitle} ${cleanedSummary}`);
    if (!key || seen.has(key)) return;
    seen.add(key);
    evidence.push({
      id,
      title: cleanedTitle,
      summary: cleanedSummary,
      keywords: extractFocusTerms([cleanedTitle, cleanedSummary].filter(Boolean).join(" ")),
      provenance: "job"
    });
  };

  if (input.company?.trim()) {
    pushEvidence("job-company", `${input.company.trim()} company context`, input.company.trim());
  }

  if (input.roleTitle?.trim()) {
    pushEvidence("job-role", `${input.roleTitle.trim()} role context`, input.roleTitle.trim());
  }

  if (input.fieldQuestion?.trim()) {
    const fieldQuestion = cleanSentence(input.fieldQuestion);
    const commitmentMatch = fieldQuestion.match(/(?:committed to|focus(?:ed)? on|built around|centered on)\s+([^.!?]+)/i)?.[1];
    const contributionMatch = fieldQuestion.match(/(?:how do you see yourself contributing to|what about .* resonates most with you)\s+([^.!?]+)/i)?.[1];

    pushEvidence("job-field-question", "Application question context", fieldQuestion);
    if (commitmentMatch) {
      pushEvidence("job-mission", "Mission or values detail", commitmentMatch);
    }
    if (contributionMatch) {
      pushEvidence("job-contribution", "Contribution detail", contributionMatch);
    }
  }

  const notes = (input.notes?.trim() ?? "").replace(/application benchmark run started .*$/i, "").trim();
  splitSentences(notes)
    .slice(0, 3)
    .forEach((sentence, index) => {
      pushEvidence(`job-notes-${index + 1}`, `Job detail ${index + 1}`, sentence);
    });

  return evidence;
}

export function extractFocusTerms(text: string) {
  return unique(
    normalizeText(text)
      .split(" ")
      .map((term) => term.trim())
      .filter((term) => term.length >= 3 && !STOPWORDS.has(term))
  );
}

type BuildJobContextInput = {
  company?: string;
  roleTitle?: string;
  source?: string;
  notes?: string;
  fieldQuestion?: string;
  metadataSource?: string;
};

export function buildJobContext(input: BuildJobContextInput): NormalizedJobContext {
  const company = input.company?.trim() ?? "";
  const roleTitle = input.roleTitle?.trim() ?? "";
  const notes = (input.notes?.trim() ?? "").replace(/application benchmark run started .*$/i, "").trim();
  const fieldQuestion = input.fieldQuestion?.trim() ?? "";
  const headline = [roleTitle, company].filter(Boolean).join(" at ");
  const summary = [roleTitle, notes, fieldQuestion].filter(Boolean).join(". ").trim();
  const normalizedText = normalizeText([company, roleTitle, notes, fieldQuestion].filter(Boolean).join(" "));
  const focusTerms = extractFocusTerms([roleTitle, notes, fieldQuestion].filter(Boolean).join(" "));
  const evidence = buildJobEvidence({ ...input, notes, fieldQuestion });

  return {
    company,
    roleTitle,
    source: input.metadataSource || input.source || "session",
    headline,
    summary,
    focusTerms,
    responsibilities: [],
    qualifications: [],
    normalizedText,
    fieldQuestion,
    evidence
  };
}
