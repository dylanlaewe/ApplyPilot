import { FieldIntent } from "@/types";

import { normalizeText } from "@/lib/utils";

export type QuestionPolarity =
  | "direct"
  | "reverse"
  | "requires_sponsorship"
  | "without_sponsorship"
  | "completed"
  | "attended"
  | "current_status";

export function detectQuestionPolarity(questionText: string, intent: FieldIntent): QuestionPolarity {
  const normalized = normalizeText(questionText);

  if (intent === "sponsorship" || intent === "sponsorship_future" || intent === "sponsorship_now") {
    if (/without sponsorship|work without sponsorship|able to work without sponsorship|can you work without sponsorship|able to work unsponsored/.test(normalized)) {
      return "without_sponsorship";
    }
    return "requires_sponsorship";
  }

  if (intent === "graduated_question" || intent === "education_highest_completed") {
    if (/attended|enrolled|in progress|currently studying/.test(normalized)) {
      return "attended";
    }
    return "completed";
  }

  if (intent === "work_authorization_category" || intent === "security_clearance_status") {
    return "current_status";
  }

  if (/without|free of|no need/.test(normalized)) {
    return "reverse";
  }

  return "direct";
}
