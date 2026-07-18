import { normalizeText } from "@/lib/utils";
import { AnswerBankItem } from "@/types";

export function scoreQuestionPatternMatch(text: string, patterns: string[]) {
  const normalizedText = normalizeText(text);
  let best = 0;

  for (const pattern of patterns) {
    const normalizedPattern = normalizeText(pattern);
    if (!normalizedPattern) continue;

    try {
      const regex = new RegExp(pattern, "i");
      if (regex.test(text)) {
        best = Math.max(best, 0.94);
        continue;
      }
    } catch {
      // Ignore invalid regex patterns and use deterministic string matching.
    }

    if (normalizedText === normalizedPattern) {
      best = Math.max(best, 0.96);
    } else if (normalizedText.includes(normalizedPattern) || normalizedPattern.includes(normalizedText)) {
      best = Math.max(best, 0.88);
    }
  }

  return best;
}

function uniqueQuestionCandidates(text: string | string[]) {
  const values = Array.isArray(text) ? text : [text];
  const unique: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const normalized = normalizeText(trimmed);
    if (!normalized) continue;
    if (unique.some((candidate) => normalizeText(candidate) === normalized)) continue;
    unique.push(trimmed);
  }

  return unique;
}

export function matchAnswerBankItem(text: string | string[], answerBank: AnswerBankItem[]) {
  const candidates = uniqueQuestionCandidates(text);
  let bestItem: AnswerBankItem | null = null;
  let bestScore = 0;
  let matchedText = "";

  for (const item of answerBank) {
    if (!item.answer.trim()) continue;

    for (const candidate of candidates) {
      const score = scoreQuestionPatternMatch(candidate, [item.canonicalQuestion, item.normalizedQuestion, ...item.questionPatterns]);
      if (score > bestScore) {
        bestItem = item;
        bestScore = score;
        matchedText = candidate;
      }
    }
  }

  return { bestItem, bestScore, matchedText };
}
