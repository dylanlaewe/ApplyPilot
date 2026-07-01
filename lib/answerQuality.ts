import { AnswerQualityResult, CandidateEvidenceItem, GeneratedAnswerValidation, NormalizedJobContext } from "@/types";

import { normalizeText } from "@/lib/utils";

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function comparableTerms(text: string) {
  return normalizeText(text)
    .replace(/[+/]/g, " ")
    .split(" ")
    .map((term) => term.trim())
    .filter(Boolean);
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function deduplicateAnswerSentences(text: string) {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const sentence of splitSentences(text)) {
    const normalized = normalizeText(sentence);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    kept.push(sentence);
  }
  return kept.join(" ").trim();
}

function stripBrokenFragments(text: string) {
  return text
    .replace(/\b([a-z]+(?:\s+[a-z]+){0,2})\s+\1\b/gi, "$1")
    .replace(/\bproduct-minded software engineer\s+product-minded software engineer\b/gi, "product-minded software engineer")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanGeneratedAnswer(text: string) {
  const cleaned = stripBrokenFragments(deduplicateAnswerSentences(text))
    .replace(/\s*([,;:.!?])\s*/g, "$1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.replace(/[;,\s]+$/g, "").trim();
}

function repeatedPhraseCount(text: string) {
  const normalized = normalizeText(text);
  const tokens = normalized.split(" ").filter(Boolean);
  const phrases = new Map<string, number>();

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const phrase = `${tokens[index]} ${tokens[index + 1]}`;
    phrases.set(phrase, (phrases.get(phrase) ?? 0) + 1);
  }

  return Math.max(0, ...phrases.values());
}

export function detectKeywordStuffing(text: string) {
  const normalized = normalizeText(text);
  const tokens = normalized
    .split(" ")
    .filter((token) => token.length >= 4 && !["with", "that", "this", "have", "from", "into", "your", "role", "work"].includes(token));
  if (!tokens.length) return false;

  const frequency = new Map<string, number>();
  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }

  const highRepeat = Array.from(frequency.values()).some((count) => count >= 5);
  const commaList = /(?:\b\w+\b,\s*){4,}\b\w+\b/.test(text);
  return highRepeat || commaList;
}

export function detectBrokenTemplateAssembly(text: string) {
  return (
    repeatedPhraseCount(text) >= 3 ||
    /\b(?:ca_\d+|svgs not supported by this browser|start typing)\b/i.test(text)
  );
}

function collectCandidateTerms(evidenceItems: CandidateEvidenceItem[]) {
  return unique(
    evidenceItems
      .flatMap((item) => [item.title, item.summary, ...item.claims, ...item.keywords])
      .flatMap((value) => comparableTerms(value))
  );
}

function collectJobTerms(jobContext: NormalizedJobContext) {
  return unique(
    [
      jobContext.company,
      jobContext.roleTitle,
      jobContext.summary,
      jobContext.fieldQuestion || "",
      ...jobContext.focusTerms,
      ...jobContext.evidence.flatMap((item) => [item.title, item.summary, ...item.keywords])
    ]
      .flatMap((value) => comparableTerms(value))
      .filter(Boolean)
  );
}

function overlapScore(answer: string, terms: string[]) {
  if (!terms.length) return 1;
  const answerTerms = new Set(comparableTerms(answer));
  const matched = terms.filter((term) => term.length >= 4 && answerTerms.has(term));
  return Math.min(1, matched.length / Math.max(1, Math.min(terms.length, 4)));
}

function detectJobEvidenceContamination(answer: string, candidateTerms: string[], jobTerms: string[]) {
  const candidateSet = new Set(candidateTerms);
  const jobOnlyTerms = jobTerms.filter((term) => !candidateSet.has(term) && term.length >= 4);
  const phrases = Array.from(answer.matchAll(/\b(?:my background in|my experience in|with experience in)\s+([^.!?]+)/gi)).map((match) => match[1] || "");

  return phrases.some((phrase) => {
    const normalized = normalizeText(phrase).split(" ").filter(Boolean);
    return normalized.some((term) => jobOnlyTerms.includes(term));
  });
}

export function evaluateAnswerQuality(input: {
  answer: string;
  questionText: string;
  validation: GeneratedAnswerValidation;
  candidateEvidence: CandidateEvidenceItem[];
  jobContext: NormalizedJobContext;
}) {
  const candidateTerms = collectCandidateTerms(input.candidateEvidence);
  const jobTerms = collectJobTerms(input.jobContext);
  const questionTerms = unique(comparableTerms(input.questionText).filter((term) => term.length >= 4));
  const brokenAssembly = detectBrokenTemplateAssembly(input.answer);
  const repetition = repeatedPhraseCount(input.answer) >= 3 || deduplicateAnswerSentences(input.answer) !== input.answer.trim();
  const keywordStuffing = detectKeywordStuffing(input.answer);
  const contamination = detectJobEvidenceContamination(input.answer, candidateTerms, jobTerms);
  const wordCount = input.answer.trim().split(/\s+/).filter(Boolean).length;

  const factualGrounding = input.validation.valid && !contamination ? 1 : input.validation.valid ? 0.7 : 0.2;
  const questionRelevance = overlapScore(input.answer, questionTerms);
  const jobRelevance = overlapScore(input.answer, jobTerms);
  const candidateRelevance = overlapScore(input.answer, candidateTerms);
  const fluency = Math.max(0, 1 - (brokenAssembly ? 0.45 : 0) - (repetition ? 0.25 : 0) - (keywordStuffing ? 0.2 : 0));
  const specificity = Math.min(1, (candidateRelevance + jobRelevance) / 2);
  const concision = wordCount <= 95 ? 1 : wordCount <= 130 ? 0.85 : wordCount <= 170 ? 0.65 : 0.35;

  const reasons: string[] = [];
  if (!input.validation.valid) reasons.push(...input.validation.warnings);
  if (contamination) reasons.push("Job evidence leaked into a candidate-background claim.");
  if (questionRelevance < 0.8) reasons.push("The answer does not stay focused enough on the question.");
  if (candidateRelevance < 0.8) reasons.push("The answer does not use enough grounded candidate evidence.");
  if (fluency < 0.8) reasons.push("The answer reads as repetitive or awkward.");
  if (keywordStuffing) reasons.push("The answer reads like a keyword list instead of prose.");

  const result: AnswerQualityResult = {
    passed:
      factualGrounding >= 0.95 &&
      questionRelevance >= 0.8 &&
      candidateRelevance >= 0.8 &&
      fluency >= 0.8 &&
      !input.validation.unsupportedTerms.length &&
      !repetition &&
      !keywordStuffing &&
      !contamination,
    factualGrounding,
    questionRelevance,
    jobRelevance,
    candidateRelevance,
    fluency,
    specificity,
    concision,
    hasUnsupportedClaims: input.validation.unsupportedTerms.length > 0,
    hasRepetition: repetition,
    hasKeywordStuffing: keywordStuffing,
    hasJobEvidenceContamination: contamination,
    reasons
  };

  return result;
}
