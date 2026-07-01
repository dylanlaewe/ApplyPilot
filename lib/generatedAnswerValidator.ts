import { checkEvidenceClaims } from "@/lib/evidenceClaimChecker";
import { cleanGeneratedAnswer } from "@/lib/answerQuality";
import { AnswerConstraints, CandidateEvidenceItem, GeneratedAnswerValidation, NormalizedJobContext } from "@/types";

function trimWords(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return { text: text.trim(), clipped: false };
  return {
    text: `${words.slice(0, maxWords).join(" ").replace(/[,\s]+$/g, "")}.`,
    clipped: true
  };
}

function trimCharacters(text: string, maxCharacters: number) {
  if (text.length <= maxCharacters) return { text, clipped: false };
  return {
    text: `${text.slice(0, Math.max(maxCharacters - 1, 0)).replace(/[,\s.]+$/g, "")}.`,
    clipped: true
  };
}

function trimSentences(text: string, maxSentences: number) {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length <= maxSentences) return { text: text.trim(), clipped: false };
  return {
    text: parts.slice(0, maxSentences).join(" ").trim(),
    clipped: true
  };
}

export function validateGeneratedAnswer(input: {
  answer: string;
  constraints: AnswerConstraints;
  evidenceItems: CandidateEvidenceItem[];
  jobContext: NormalizedJobContext;
}) {
  let nextAnswer = cleanGeneratedAnswer(input.answer.trim());
  let clipped = false;

  if (input.constraints.maxSentences) {
    const result = trimSentences(nextAnswer, input.constraints.maxSentences);
    nextAnswer = result.text;
    clipped = clipped || result.clipped;
  }

  if (input.constraints.maxWords) {
    const result = trimWords(nextAnswer, input.constraints.maxWords);
    nextAnswer = result.text;
    clipped = clipped || result.clipped;
  }

  if (input.constraints.maxCharacters) {
    const result = trimCharacters(nextAnswer, input.constraints.maxCharacters);
    nextAnswer = result.text;
    clipped = clipped || result.clipped;
  }

  const claimCheck = checkEvidenceClaims(nextAnswer, input.evidenceItems, input.jobContext);
  const validation: GeneratedAnswerValidation = {
    valid: Boolean(nextAnswer) && claimCheck.valid,
    clipped,
    warnings: [...claimCheck.warnings, ...(clipped ? ["ApplyPilot shortened this answer to fit the visible limit."] : [])],
    unsupportedTerms: claimCheck.unsupportedTerms
  };

  return { answer: nextAnswer, validation };
}
