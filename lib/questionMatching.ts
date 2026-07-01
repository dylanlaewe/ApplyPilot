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

export function matchAnswerBankItem(text: string, answerBank: AnswerBankItem[]) {
  let bestItem: AnswerBankItem | null = null;
  let bestScore = 0;

  for (const item of answerBank) {
    if (!item.answer.trim()) continue;
    const score = scoreQuestionPatternMatch(text, [item.canonicalQuestion, item.normalizedQuestion, ...item.questionPatterns]);
    if (score > bestScore) {
      bestItem = item;
      bestScore = score;
    }
  }

  return { bestItem, bestScore };
}
