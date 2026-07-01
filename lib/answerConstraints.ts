import { AnswerConstraints } from "@/types";

const TOPIC_PATTERNS = [
  /experience with ([^.?;]+)/i,
  /background in ([^.?;]+)/i,
  /skills? (?:with|in) ([^.?;]+)/i,
  /knowledge of ([^.?;]+)/i,
  /familiarity with ([^.?;]+)/i,
  /using ([^.?;]+)/i
];

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function splitTopics(value: string) {
  return value
    .split(/,|\/| and | or /i)
    .map((topic) => topic.replace(/\b(the|a|an|your|our|their)\b/gi, "").trim())
    .filter((topic) => topic.length >= 2);
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

export function extractAnswerConstraints(questionText: string, nearbyText = ""): AnswerConstraints {
  const combined = [questionText, nearbyText].filter(Boolean).join(" ");
  const maxWords =
    Number(combined.match(/\b(?:maximum|max|up to|limit(?:ed)? to)\s+(\d{1,4})\s+words?\b/i)?.[1] ?? "") ||
    Number(combined.match(/\b(\d{1,4})\s+words?\s+(?:max|maximum)\b/i)?.[1] ?? "") ||
    null;
  const maxCharacters =
    Number(combined.match(/\b(?:maximum|max|up to|limit(?:ed)? to)\s+(\d{1,5})\s+(?:characters|chars?)\b/i)?.[1] ?? "") ||
    Number(combined.match(/\b(\d{1,5})\s+(?:characters|chars?)\s+(?:max|maximum)\b/i)?.[1] ?? "") ||
    null;
  const maxSentences =
    Number(combined.match(/\b(\d)\s+(?:sentence|sentences)\s+(?:max|maximum)\b/i)?.[1] ?? "") ||
    Number(combined.match(/\b(?:in|within|use)\s+(\d)\s+(?:sentence|sentences)\b/i)?.[1] ?? "") ||
    null;

  return {
    maxWords,
    maxCharacters,
    maxSentences,
    requiresConcise: /\bbrief|concise|short|few sentences?|keep it short\b/i.test(combined),
    requestedTopics: unique(splitTopics(firstMatch(combined, TOPIC_PATTERNS))),
    requestedEvidence: unique(
      splitTopics(
        firstMatch(combined, [
          /highlight ([^.?;]+)/i,
          /focus on ([^.?;]+)/i,
          /mention ([^.?;]+)/i
        ])
      )
    )
  };
}

