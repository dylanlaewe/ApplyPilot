import { buildAnswerSuggestion, isTypeCompatible } from "@/lib/answerEngine";
import { inferFieldMetadata } from "@/lib/fieldDetection";
import { detectQuestionIntent } from "@/lib/questionIntent";
import { normalizeText } from "@/lib/utils";
import { AnswerBankItem, ApplicantProfile, ApplicationSession, ConfidenceLevel, DetectedField, RawScannedField } from "@/types";

function toConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.6) return "medium";
  return "needs_review";
}

function suppressDuplicateResumeHelpers(fields: DetectedField[]) {
  const resumeFields = fields.filter((field) => field.intent === "resume_upload");
  if (resumeFields.length <= 1) {
    return fields;
  }

  const hasPrimaryResumeField = resumeFields.some((field) => {
    const text = normalizeText([field.label, field.questionText, field.nearbyText, field.name, field.domId].filter(Boolean).join(" "));
    return /\bresume\b/.test(text) && !/autofill from resume|upload your resume here to autofill/i.test(text);
  });

  if (!hasPrimaryResumeField) {
    return fields;
  }

  return fields.filter((field) => {
    if (field.intent !== "resume_upload") {
      return true;
    }

    const text = normalizeText([field.label, field.questionText, field.nearbyText, field.name, field.domId].filter(Boolean).join(" "));
    return !/autofill from resume|upload your resume here to autofill/i.test(text);
  });
}

function toReviewCategory(field: {
  status: DetectedField["status"];
  isRequired?: boolean;
  intent: DetectedField["intent"];
  suggestedValue: string;
  shortAnswer?: DetectedField["shortAnswer"];
}) {
  if (field.status === "error") return "error";
  if (field.status === "sensitive") return "sensitive";
  if (field.shortAnswer) return "unknown_custom";
  if (field.intent === "unknown") return "unknown_custom";
  if (field.status === "skipped") return field.isRequired ? "required_missing" : "optional_skipped";
  if (field.status === "needs_review" && !field.suggestedValue && field.isRequired) return "required_missing";
  if (field.status === "needs_review" && !field.suggestedValue) return "optional_skipped";
  return null;
}

export function suggestFieldValue(
  rawField: RawScannedField,
  profile: ApplicantProfile,
  answerBank: AnswerBankItem[],
  sessionContext?: Pick<ApplicationSession, "company" | "roleTitle" | "source" | "notes" | "metadataSource">
): DetectedField {
  const { label } = inferFieldMetadata(rawField);
  const intentResult = detectQuestionIntent(rawField);
  const answer = buildAnswerSuggestion({
    intent: intentResult.intent,
    field: rawField,
    profile,
    answerBank,
    sessionContext
  });

  let status: DetectedField["status"] = "unknown";
  let reason = intentResult.reason;
  let suggestedValue = answer.suggestedValue;

  if (rawField.isDisabled) {
    status = "skipped";
    reason = "This field is disabled on the page, so ApplyPilot left it alone.";
    suggestedValue = "";
  } else if (answer.shortAnswer?.answerability === "optional_no_value" && !answer.suggestedValue.trim()) {
    status = "skipped";
    reason = answer.reason;
  } else if (answer.shortAnswer) {
    status = "needs_review";
    reason = answer.reason;
  } else if (intentResult.intent === "unknown") {
    status = rawField.isRequired ? "needs_review" : "unknown";
    reason = answer.reason;
  } else if (!answer.suggestedValue) {
    status = answer.sensitivity === "sensitive" ? "sensitive" : rawField.isRequired ? "needs_review" : "skipped";
    reason = answer.reason;
  } else if (!isTypeCompatible(intentResult.intent, rawField, answer.suggestedValue)) {
    status = "needs_review";
    suggestedValue = "";
    reason = "A structured answer exists, but it was not compatible with this field format.";
  } else if (answer.sensitivity === "sensitive") {
    if (answer.autoFillAllowed && answer.answerSource === "explicit_profile" && answer.suggestedValue) {
      status = "needs_review";
      reason = `${answer.reason} Using your explicitly saved answer. Safe to autofill.`;
    } else {
      status = "sensitive";
      reason = answer.reason;
    }
  } else if (answer.autoFillAllowed && answer.confidence >= 0.85) {
    status = "needs_review";
    reason = `${answer.reason} Safe to autofill.`;
  } else {
    status = "needs_review";
    reason = answer.reason;
  }

  const confidence = answer.shortAnswer ? answer.confidence : Math.min(intentResult.confidence, answer.confidence);

  return {
    id: crypto.randomUUID(),
    label,
    name: rawField.name,
    domId: rawField.domId,
    type: rawField.type,
    selector: rawField.selector,
    detectedValue: rawField.detectedValue,
    suggestedValue,
    confidence,
    confidenceLevel: toConfidenceLevel(confidence),
    status,
    reason,
    sensitivity: answer.sensitivity,
    autoFillAllowed: answer.autoFillAllowed,
    intent: intentResult.intent,
    reviewCategory: toReviewCategory({
      status,
      isRequired: rawField.isRequired,
      intent: intentResult.intent,
      suggestedValue,
      shortAnswer: answer.shortAnswer
    }),
    matchedOption: answer.matchedOption,
    answerSource: answer.answerSource,
    verificationStatus: "not_attempted",
    controlType: rawField.controlType,
    questionText: answer.shortAnswer?.questionText || intentResult.questionText,
    placeholder: rawField.placeholder,
    ariaLabel: rawField.ariaLabel,
    nearbyText: rawField.nearbyText,
    selectOptions: rawField.selectOptions,
    frameUrl: rawField.frameUrl,
    frameName: rawField.frameName,
    isRequired: rawField.isRequired,
    isVisible: rawField.isVisible,
    isDisabled: rawField.isDisabled,
    autocomplete: rawField.autocomplete,
    accept: rawField.accept,
    role: rawField.role,
    shortAnswer: answer.shortAnswer ?? null
  };
}

export function buildSuggestedFields(
  rawFields: RawScannedField[],
  profile: ApplicantProfile,
  answerBank: AnswerBankItem[],
  sessionContext?: Pick<ApplicationSession, "company" | "roleTitle" | "source" | "notes" | "metadataSource">
) {
  const detectedFields = suppressDuplicateResumeHelpers(
    rawFields.map((field) => suggestFieldValue(field, profile, answerBank, sessionContext))
  );
  const hasSchoolFallbackTextField = detectedFields.some((field) => {
    if (field.intent !== "education_school") return false;
    const text = normalizeText([field.label, field.questionText, field.nearbyText].filter(Boolean).join(" "));
    return /if your institution was not listed/.test(text) || (/institution/.test(text) && /enter it here/.test(text));
  });

  if (!hasSchoolFallbackTextField) {
    return detectedFields;
  }

  for (const field of detectedFields) {
    if (field.intent !== "education_school" || !field.suggestedValue.trim()) continue;

    const text = normalizeText([field.label, field.questionText, field.nearbyText].filter(Boolean).join(" "));
    const canUseOtherFallback =
      /not listed/.test(text) &&
      /\bother\b/.test(text) &&
      ["aria_combobox", "autocomplete", "native_select", "listbox", "menu_button", "custom_select"].includes(field.controlType || "");

    if (!canUseOtherFallback) continue;

    field.suggestedValue = "Other";
    field.matchedOption = "Other";
    field.confidence = Math.max(field.confidence, 0.95);
    field.confidenceLevel = toConfidenceLevel(field.confidence);
    field.reason =
      "This form includes a separate school fallback field when the institution is not listed, so ApplyPilot will choose Other here and put your saved school in the follow-up field.";
  }

  return detectedFields;
}
