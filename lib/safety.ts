import { CAPTCHA_PATTERNS, FINAL_SUBMIT_PATTERNS, HIGH_RISK_EXACT_INTENTS, NEVER_AUTOFILL_INTENTS, SENSITIVE_INTENTS } from "@/lib/autofillRules";
import { normalizeText } from "@/lib/utils";
import { FieldIntent } from "@/types";

export function isSensitiveIntent(intent: FieldIntent) {
  return SENSITIVE_INTENTS.has(intent);
}

export function shouldNeverAutofillIntent(intent: FieldIntent) {
  return NEVER_AUTOFILL_INTENTS.has(intent);
}

export function requiresExactOptionMatch(intent: FieldIntent) {
  return HIGH_RISK_EXACT_INTENTS.has(intent);
}

export function isLikelyCaptchaText(value: string) {
  const normalized = normalizeText(value);
  return CAPTCHA_PATTERNS.some((keyword) => normalized.includes(keyword));
}

export function isFinalSubmitLabel(value: string) {
  const normalized = normalizeText(value);
  return FINAL_SUBMIT_PATTERNS.some((keyword) => normalized.includes(keyword));
}

export function humanizeError(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("Target page, context or browser has been closed")) {
      return "The application window was closed. Open it again and try once more.";
    }

    if (error.message.includes("Timeout")) {
      return "The page took too long to respond. Try again or review the page manually.";
    }

    if (error.message.includes("No matching dropdown option found")) {
      return "This dropdown did not contain a matching option, so we left it for review.";
    }

    if (error.message.includes("No matching radio option found")) {
      return "This radio question did not have a safe matching choice, so we left it for review.";
    }

    return error.message;
  }

  return "Something went wrong. Please review the page manually and try again.";
}
