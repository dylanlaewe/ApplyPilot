import { readStorageFile, writeStorageFile } from "@/lib/storage";
import { normalizeText } from "@/lib/utils";
import { AnswerBankItem, AnswerSensitivity } from "@/types";

const ANSWER_BANK_FILE = "answer-bank.json";

function inferQuestionPatterns(question: string) {
  const normalized = normalizeText(question);
  const words = normalized
    .replace(/[^\w\s]/g, " ")
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length > 2);

  const withoutStopwords = words.filter(
    (word) => !["what", "when", "where", "which", "would", "could", "should", "about", "your", "this", "that", "with", "have", "will", "role", "position"].includes(word)
  );

  return Array.from(
    new Set([
      question.trim(),
      normalized,
      words.join(" "),
      withoutStopwords.join(" ")
    ].filter((pattern) => pattern.trim()))
  );
}

function buildSeedItem(
  label: string,
  canonicalQuestion: string,
  questionPatterns: string[],
  sensitivity: AnswerSensitivity,
  autoFillAllowed: boolean,
  answer = ""
): AnswerBankItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    label,
    canonicalQuestion,
    normalizedQuestion: normalizeText(canonicalQuestion),
    questionPatterns: Array.from(new Set([...questionPatterns, ...inferQuestionPatterns(canonicalQuestion)])),
    answer,
    sensitivity,
    autofillBehavior: autoFillAllowed ? "autofill" : "suggest",
    autoFillAllowed,
    usageCount: 0,
    lastUsedAt: "",
    createdAt: now,
    updatedAt: now
  };
}

export function createDefaultAnswerBank() {
  return [
    buildSeedItem(
      "Why are you interested in this position?",
      "Why are you interested in this position?",
      ["why are you interested", "why this position", "what interests you about this opportunity"],
      "review",
      false
    ),
    buildSeedItem(
      "Tell us about yourself.",
      "Tell us about yourself.",
      ["tell us about yourself", "about you", "introduce yourself"],
      "review",
      false
    ),
    buildSeedItem(
      "Why this company?",
      "Why this company?",
      ["why this company", "why do you want to work here"],
      "review",
      false
    ),
    buildSeedItem(
      "Are you authorized to work in the United States?",
      "Are you authorized to work in the United States?",
      ["authorized to work", "legally authorized", "employment authorization", "work authorization"],
      "sensitive",
      false
    ),
    buildSeedItem(
      "Will you now or in the future require sponsorship?",
      "Will you now or in the future require sponsorship?",
      ["require sponsorship", "need sponsorship", "future sponsorship", "h-1b", "visa sponsorship"],
      "sensitive",
      false
    ),
    buildSeedItem(
      "Desired salary",
      "What is your desired salary?",
      ["desired salary", "salary expectation", "compensation", "salary requirements"],
      "review",
      false
    ),
    buildSeedItem("LinkedIn URL", "LinkedIn URL", ["linkedin"], "safe", true),
    buildSeedItem("Professional website or portfolio", "Professional website or portfolio", ["portfolio", "website", "professional link"], "safe", true),
    buildSeedItem(
      "Anything else you'd like us to know?",
      "Anything else you'd like us to know?",
      ["anything else", "additional information"],
      "review",
      false
    )
  ];
}

export function normalizeAnswerBankItem(item: AnswerBankItem): AnswerBankItem {
  const now = new Date().toISOString();

  return {
    id: item.id || crypto.randomUUID(),
    label: item.label || item.canonicalQuestion || "Untitled answer",
    canonicalQuestion: item.canonicalQuestion || item.label || "Untitled answer",
    normalizedQuestion: item.normalizedQuestion || normalizeText(item.canonicalQuestion || item.label || ""),
    questionPatterns: Array.from(
      new Set([
        ...(item.questionPatterns ?? []),
        ...inferQuestionPatterns(item.canonicalQuestion || item.label || "")
      ])
    ),
    answer: item.answer ?? "",
    sensitivity: item.sensitivity ?? "review",
    autofillBehavior: item.autofillBehavior ?? (item.autoFillAllowed ? "autofill" : "suggest"),
    autoFillAllowed: item.autofillBehavior ? item.autofillBehavior === "autofill" : Boolean(item.autoFillAllowed),
    intent: item.intent,
    fieldType: item.fieldType ?? "",
    optionLabel: item.optionLabel ?? "",
    usageCount: item.usageCount ?? 0,
    lastUsedAt: item.lastUsedAt ?? "",
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now
  };
}

export async function getAnswerBank() {
  const items = await readStorageFile<AnswerBankItem[]>(ANSWER_BANK_FILE, createDefaultAnswerBank());
  return items.map(normalizeAnswerBankItem);
}

export async function saveAnswerBank(items: AnswerBankItem[]) {
  const now = new Date().toISOString();
  const normalized = items.map((item) => ({
    ...normalizeAnswerBankItem(item),
    updatedAt: now
  }));
  await writeStorageFile(ANSWER_BANK_FILE, normalized);
  return normalized;
}

export async function upsertAnswerBankItem(
  partial: Pick<AnswerBankItem, "canonicalQuestion" | "answer" | "questionPatterns" | "sensitivity" | "autoFillAllowed"> &
    Partial<Pick<AnswerBankItem, "label" | "intent" | "fieldType" | "optionLabel" | "autofillBehavior">>
) {
  const items = await getAnswerBank();
  const normalizedQuestion = partial.canonicalQuestion.trim().toLowerCase();
  const existing = items.find(
    (item) =>
      item.canonicalQuestion.trim().toLowerCase() === normalizedQuestion ||
      item.normalizedQuestion === normalizeText(partial.canonicalQuestion)
  );

  if (existing) {
    const merged = items.map((item) =>
      item.id === existing.id
        ? normalizeAnswerBankItem({
            ...item,
            ...partial,
            label: partial.label || item.label,
            normalizedQuestion: normalizeText(partial.canonicalQuestion),
            questionPatterns: Array.from(
              new Set([
                ...item.questionPatterns,
                ...partial.questionPatterns,
                ...inferQuestionPatterns(partial.canonicalQuestion)
              ])
            ),
            autofillBehavior: partial.autofillBehavior || item.autofillBehavior
          })
        : item
    );
    await saveAnswerBank(merged);
    return merged.find((item) => item.id === existing.id)!;
  }

  const now = new Date().toISOString();
  const nextItem = normalizeAnswerBankItem({
    id: crypto.randomUUID(),
    label: partial.label || partial.canonicalQuestion,
    canonicalQuestion: partial.canonicalQuestion,
    normalizedQuestion: normalizeText(partial.canonicalQuestion),
    questionPatterns: Array.from(new Set([...partial.questionPatterns, ...inferQuestionPatterns(partial.canonicalQuestion)])),
    answer: partial.answer,
    intent: partial.intent,
    fieldType: partial.fieldType ?? "",
    optionLabel: partial.optionLabel ?? "",
    sensitivity: partial.sensitivity,
    autofillBehavior: partial.autofillBehavior ?? (partial.autoFillAllowed ? "autofill" : "suggest"),
    autoFillAllowed: partial.autoFillAllowed,
    usageCount: 0,
    lastUsedAt: "",
    createdAt: now,
    updatedAt: now
  });
  await saveAnswerBank([nextItem, ...items]);
  return nextItem;
}

export async function markAnswerBankItemUsed(itemId: string) {
  const items = await getAnswerBank();
  const now = new Date().toISOString();
  const nextItems = items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          usageCount: item.usageCount + 1,
          lastUsedAt: now,
          updatedAt: now
        }
      : item
  );
  await saveAnswerBank(nextItems);
}
