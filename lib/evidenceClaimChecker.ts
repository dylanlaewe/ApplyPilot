import { CandidateEvidenceItem, NormalizedJobContext } from "@/types";

import { normalizeText } from "@/lib/utils";

const RISKY_PATTERNS = [
  /\b\d[\d,.%]*\b/g,
  /\b\d+\s+(?:years?|months?)\b/gi,
  /\b(?:increased|reduced|improved|grew|saved)\b[^.]*\b\d[\d,.%]*\b/gi,
  /\b(?:managed|led)\b[^.]*\bteam\b[^.]*\b\d[\d,.%]*\b/gi,
  /\b(?:certified|certification|license|licensed|clearance|security clearance|bachelor'?s|master'?s|phd|doctorate)\b[^.]*\b/gi,
  /\b(?:sponsorship|visa|authorized to work|work authorization)\b[^.]*\b/gi
];

function collectEvidenceText(evidenceItems: CandidateEvidenceItem[], jobContext: NormalizedJobContext) {
  void jobContext;
  return normalizeText(evidenceItems.flatMap((item) => [item.title, item.summary, ...item.claims, ...item.keywords]).join(" "));
}

export function checkEvidenceClaims(answer: string, evidenceItems: CandidateEvidenceItem[], jobContext: NormalizedJobContext) {
  const normalizedAllowed = collectEvidenceText(evidenceItems, jobContext);
  const riskyFragments = Array.from(
    new Set(
      RISKY_PATTERNS.flatMap((pattern) => Array.from(answer.match(pattern) ?? [])).map((fragment) => fragment.trim()).filter(Boolean)
    )
  );
  const unsupportedTerms = riskyFragments.filter((fragment) => !normalizedAllowed.includes(normalizeText(fragment)));

  return {
    valid: unsupportedTerms.length === 0,
    unsupportedTerms,
    warnings:
      unsupportedTerms.length
        ? [`Claim validation blocked unsupported factual details: ${unsupportedTerms.join("; ")}`]
        : []
  };
}
