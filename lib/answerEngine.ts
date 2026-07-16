import { existsSync } from "fs";

import { SAFE_AUTOFILL_THRESHOLD } from "@/lib/autofillRules";
import { deriveFieldAnswer } from "@/lib/answerDerivation";
import { matchAnswerBankItem } from "@/lib/questionMatching";
import { buildShortAnswerSuggestion } from "@/lib/shortAnswerGenerator";
import {
  matchAvailabilityOption,
  matchBooleanOption,
  matchEducationDegreeOption,
  matchEducationLevel,
  matchEeocVeteranOption,
  matchSecurityClearanceLevel,
  matchSecurityClearanceStatus,
  matchSalaryOption,
  matchStructuredLocationOption,
  matchStateOrCountryOption,
  matchTextOption,
  matchWorkAuthorizationCategory
} from "@/lib/optionMatcher";
import { isSensitiveIntent } from "@/lib/safety";
import { normalizeText } from "@/lib/utils";
import { formatAvailabilityText, formatHourlyRateText, formatSalaryText } from "@/lib/valueFormatter";
import { AnswerBankItem, AnswerSensitivity, ApplicantProfile, FieldIntent, RawScannedField, ShortAnswerSuggestion } from "@/types";

function combinedQuestion(field: RawScannedField) {
  return [field.label, field.name, field.domId, field.placeholder, field.ariaLabel, field.nearbyText].filter(Boolean).join(" ");
}

function isLeverCommittedLocationPicker(intent: FieldIntent, field: RawScannedField) {
  if (!["location", "full_location"].includes(intent)) return false;
  if (!field.frameUrl?.includes("lever.co")) return false;
  if (field.controlType && field.controlType !== "text") return false;

  const domId = normalizeText(field.domId || "");
  const name = normalizeText(field.name || "");
  const context = normalizeText([field.label, field.nearbyText, field.questionContainerText, field.placeholder].filter(Boolean).join(" "));

  return (domId === "location-input" || name === "location") && /no location found|try entering a different location|loading/.test(context);
}

function selectSensitivity(intent: FieldIntent, source: string) {
  if (source === "unknown") return "review" as const;
  if (isSensitiveIntent(intent)) return "sensitive" as const;
  return "safe" as const;
}

function resolveEeocValue(profile: ApplicantProfile, intent: FieldIntent) {
  switch (intent) {
    case "eeoc_gender":
      return profile.eeocDefaults.gender.value === "Another identity" ? profile.eeocDefaults.gender.customValue : profile.eeocDefaults.gender.value;
    case "eeoc_race":
      return profile.eeocDefaults.raceEthnicity.values.join(", ");
    case "eeoc_veteran":
      return profile.eeocDefaults.veteranStatus.value;
    case "eeoc_disability":
      return profile.eeocDefaults.disabilityStatus.value;
    default:
      return "";
  }
}

function isTypeCompatible(intent: FieldIntent, field: RawScannedField, suggestedValue: string) {
  if (!suggestedValue.trim()) return false;
  if (field.type === "email") return intent === "email";
  if (field.type === "tel") return ["phone", "phone_number", "full_phone_number"].includes(intent);
  if (field.type === "url") return ["linkedin", "github", "portfolio", "website"].includes(intent);
  if (field.type === "number") return /^-?\d+(\.\d+)?$/.test(suggestedValue.replace(/,/g, "").trim());
  if (field.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(suggestedValue.trim()) || /^\d{4}-\d{2}$/.test(suggestedValue.trim());
  if (field.type === "file") return existsSync(suggestedValue);
  return true;
}

function maybeMatchVisibleOption(intent: FieldIntent, field: RawScannedField, candidate: string, profile: ApplicantProfile, questionText: string) {
  const options = field.selectOptions ?? [];
  if (!options.length) return null;

  if (["work_authorization", "sponsorship", "sponsorship_now", "sponsorship_future", "work_without_sponsorship", "relocation", "remote_preference", "hybrid_preference", "onsite_preference", "graduated_question", "valid_drivers_license", "minimum_working_age", "background_check", "drug_screen", "weekend_availability", "overtime_availability", "travel_willingness"].includes(intent)) {
    if (candidate === "yes" || candidate === "no") {
      return matchBooleanOption({ questionText, options, answer: candidate, intent });
    }
  }

  if (intent === "work_authorization_category") {
    return matchWorkAuthorizationCategory(options, candidate as ApplicantProfile["knowledgeProfile"]["workAuthorization"]["usWorkAuthorizationCategory"]);
  }

  if (intent === "security_clearance_level") {
    return matchSecurityClearanceLevel(options, candidate as ApplicantProfile["securityProfile"]["clearanceLevel"]);
  }

  if (intent === "security_clearance_status" || intent === "security_clearance_active") {
    return matchSecurityClearanceStatus(options, candidate as ApplicantProfile["securityProfile"]["clearanceStatus"]);
  }

  if (intent === "education_highest_completed" || intent === "education_highest_attended") {
    if (!candidate) return null;
    return matchEducationLevel(
      options,
      candidate as Exclude<ApplicantProfile["knowledgeProfile"]["education"]["highestEducationLevel"], "">
    );
  }

  if (intent === "education_degree") {
    return matchEducationDegreeOption(options, profile.education[0] ?? null) ?? matchTextOption(options, candidate, "Matched degree dropdown option.");
  }

  if (intent === "availability") {
    return matchAvailabilityOption(options, profile.availabilityProfile.startTiming);
  }

  if (intent === "desired_salary") {
    return matchSalaryOption(options, profile.compensationProfile);
  }

  if (intent === "city" || intent === "location" || intent === "full_location") {
    return matchStructuredLocationOption(options, candidate);
  }

  if (intent === "phone_country_code") {
    return (
      matchTextOption(options, `${profile.identity.phoneCountry} (${profile.identity.phoneCountryCode})`, "Matched phone country option.") ??
      matchTextOption(options, `${profile.identity.phoneCountry} ${profile.identity.phoneCountryCode}`, "Matched phone country option.") ??
      matchTextOption(options, profile.identity.phoneCountry, "Matched phone country option.") ??
      matchTextOption(options, candidate, "Matched phone country option.")
    );
  }

  return matchStateOrCountryOption(options, candidate) ?? matchTextOption(options, candidate);
}

export { isTypeCompatible };

export type AnswerSuggestion = {
  suggestedValue: string;
  confidence: number;
  reason: string;
  autoFillAllowed: boolean;
  sensitivity: AnswerSensitivity;
  matchedOption?: string;
  answerSource: "explicit_profile" | "derived_profile" | "formatted_profile" | "answer_bank" | "generated_answer" | "approved_fallback" | "manual_user_answer" | "unknown";
  shortAnswer?: ShortAnswerSuggestion | null;
};

export function buildAnswerSuggestion({
  intent,
  field,
  profile,
  answerBank,
  sessionContext
}: {
  intent: FieldIntent;
  field: RawScannedField;
  profile: ApplicantProfile;
  answerBank: AnswerBankItem[];
  sessionContext?: {
    company?: string;
    roleTitle?: string;
    source?: string;
    notes?: string;
    metadataSource?: string;
  };
}): AnswerSuggestion {
  const questionText = combinedQuestion(field);
  const answerMatch = matchAnswerBankItem(questionText, answerBank);
  const shortAnswer = buildShortAnswerSuggestion({
    intent,
    field,
    profile,
    answerBank,
    sessionContext
  });

  if (shortAnswer) {
    return shortAnswer;
  }

  if (intent === "previous_employment" && answerMatch.bestItem && answerMatch.bestScore >= 0.92) {
    const normalizedAnswer = answerMatch.bestItem.answer.trim().toLowerCase();
    if (normalizedAnswer === "yes" || normalizedAnswer === "no") {
      const matched = field.selectOptions?.length
        ? matchBooleanOption({
            questionText,
            options: field.selectOptions,
            answer: normalizedAnswer as "yes" | "no",
            intent
          })
        : null;

      return {
        suggestedValue: matched?.option || normalizedAnswer,
        confidence: answerMatch.bestScore,
        reason: `Using your explicitly saved employer-specific answer for ${answerMatch.bestItem.label}.`,
        autoFillAllowed: answerMatch.bestItem.autoFillAllowed,
        sensitivity: answerMatch.bestItem.sensitivity,
        matchedOption: matched?.option,
        answerSource: "answer_bank",
        shortAnswer: null
      };
    }
  }

  if (intent === "why_interested" || intent === "tell_us_about_yourself" || intent === "unknown") {
    if (answerMatch.bestItem && answerMatch.bestScore >= 0.88) {
      const behavior = answerMatch.bestItem.autofillBehavior ?? (answerMatch.bestItem.autoFillAllowed ? "autofill" : "suggest");
      if (behavior === "ask") {
        return {
          suggestedValue: "",
          confidence: answerMatch.bestScore,
          reason: `A saved answer exists for ${answerMatch.bestItem.label}, but you chose to review it each time.`,
          autoFillAllowed: false,
          sensitivity: answerMatch.bestItem.sensitivity,
          matchedOption: undefined,
          answerSource: "answer_bank" as const
        };
      }

      return {
        suggestedValue: answerMatch.bestItem.answer,
        confidence: answerMatch.bestScore,
        reason: `Matched saved answer: ${answerMatch.bestItem.label}.`,
        autoFillAllowed: behavior === "autofill" && answerMatch.bestScore >= SAFE_AUTOFILL_THRESHOLD && answerMatch.bestItem.autoFillAllowed,
        sensitivity: answerMatch.bestItem.sensitivity,
        matchedOption: undefined,
        answerSource: "answer_bank" as const,
        shortAnswer: null
      };
    }

    return {
      suggestedValue: "",
      confidence: 0.4,
      reason: intent === "unknown" ? "Unknown question. No safe saved answer matched." : "This question needs a saved answer before it can be autofilled.",
      autoFillAllowed: false,
      sensitivity: "review" as const,
      matchedOption: undefined,
      answerSource: "unknown" as const,
      shortAnswer: null
    };
  }

  if (intent === "resume_upload") {
    const filePath = profile.resume.storedPath || profile.resumeStoredPath || profile.resumePath;
    if (!filePath) {
      return {
        suggestedValue: "",
        confidence: 0.3,
        reason: "No saved resume is available yet.",
        autoFillAllowed: false,
        sensitivity: "review" as const,
        matchedOption: undefined,
        answerSource: "unknown" as const,
        shortAnswer: null
      };
    }

    if (!existsSync(filePath)) {
      return {
        suggestedValue: "",
        confidence: 0.2,
        reason: "Your saved resume file could not be found. Please upload it again.",
        autoFillAllowed: false,
        sensitivity: "review" as const,
        matchedOption: undefined,
        answerSource: "unknown" as const,
        shortAnswer: null
      };
    }

    return {
      suggestedValue: filePath,
      confidence: 0.98,
      reason: "Using your saved resume file.",
      autoFillAllowed: true,
      sensitivity: "safe" as const,
      matchedOption: undefined,
      answerSource: "explicit_profile" as const,
      shortAnswer: null
    };
  }

  if (intent === "desired_salary") {
    const formatted = formatSalaryText(profile.compensationProfile, field);
    const matched = field.selectOptions?.length ? matchSalaryOption(field.selectOptions, profile.compensationProfile) : null;
    return {
      suggestedValue: matched?.option || formatted,
      confidence: matched?.confidence ?? (formatted ? 0.9 : 0.4),
      reason: matched?.reason ?? (formatted ? "Formatted from your saved compensation preferences." : "Compensation is set to ask each time or is incomplete."),
      autoFillAllowed: Boolean(formatted || matched),
      sensitivity: "review" as const,
      matchedOption: matched?.option,
      answerSource: formatted ? ("formatted_profile" as const) : ("unknown" as const),
      shortAnswer: null
    };
  }

  if (intent === "hourly_rate") {
    const formatted = formatHourlyRateText(profile.compensationProfile, field);
    return {
      suggestedValue: formatted,
      confidence: formatted ? 0.9 : 0.4,
      reason: formatted ? "Formatted from your saved hourly rate preferences." : "Hourly rate is set to ask each time or is incomplete.",
      autoFillAllowed: Boolean(formatted),
      sensitivity: "review" as const,
      matchedOption: undefined,
      answerSource: formatted ? ("formatted_profile" as const) : ("unknown" as const),
      shortAnswer: null
    };
  }

  if (intent === "availability") {
    const formatted = formatAvailabilityText(profile, field);
    const matched = field.selectOptions?.length ? matchAvailabilityOption(field.selectOptions, profile.availabilityProfile.startTiming) : null;
    return {
      suggestedValue: matched?.option || formatted,
      confidence: matched?.confidence ?? (formatted ? 0.9 : 0.4),
      reason: matched?.reason ?? (formatted ? "Using your saved availability timing." : "Availability is set to ask each time."),
      autoFillAllowed: Boolean(formatted || matched),
      sensitivity: "safe" as const,
      matchedOption: matched?.option,
      answerSource: formatted ? ("formatted_profile" as const) : ("unknown" as const),
      shortAnswer: null
    };
  }

  if (isLeverCommittedLocationPicker(intent, field)) {
    return {
      suggestedValue: "",
      confidence: 0.35,
      reason:
        "This Lever location picker requires choosing a visible exact match before the value will stick, so ApplyPilot left it for manual review instead of guessing.",
      autoFillAllowed: false,
      sensitivity: "review" as const,
      matchedOption: undefined,
      answerSource: "unknown" as const,
      shortAnswer: null
    };
  }

  if (intent === "eeoc_gender" || intent === "eeoc_race" || intent === "eeoc_veteran" || intent === "eeoc_disability") {
    let explicitValue = resolveEeocValue(profile, intent);
    const askEachTime =
      (intent === "eeoc_race" && profile.eeocDefaults.raceEthnicity.values.includes("Ask me every time")) ||
      (intent !== "eeoc_race" && explicitValue === "Ask me every time");

    if (askEachTime) {
      return {
        suggestedValue: "",
        confidence: 0.45,
        reason: "You asked ApplyPilot to leave this answer for manual review each time.",
        autoFillAllowed: false,
        sensitivity: "sensitive" as const,
        matchedOption: undefined,
        answerSource: "unknown" as const,
        shortAnswer: null
      };
    }

    if (intent === "eeoc_race" && /hispanic|latino/.test(questionText.toLowerCase())) {
      if (/prefer not to answer/.test(explicitValue.toLowerCase())) {
        explicitValue = "Prefer not to answer";
      } else {
        explicitValue = profile.eeocDefaults.raceEthnicity.values.includes("Hispanic or Latino") ? "yes" : "no";
      }
    }

    const matched = field.selectOptions?.length
      ? intent === "eeoc_disability" && (explicitValue === "yes" || explicitValue === "no")
        ? matchBooleanOption({
            questionText,
            options: field.selectOptions,
            answer: explicitValue,
            intent
          }) ?? matchTextOption(field.selectOptions, explicitValue, "Matched your saved EEOC answer.")
        : intent === "eeoc_race" && (explicitValue === "yes" || explicitValue === "no")
          ? matchBooleanOption({
              questionText,
              options: field.selectOptions,
              answer: explicitValue,
              intent
            }) ?? matchTextOption(field.selectOptions, explicitValue, "Matched your saved EEOC answer.")
          : intent === "eeoc_veteran"
            ? matchEeocVeteranOption(field.selectOptions, explicitValue)
          : matchTextOption(field.selectOptions, explicitValue, "Matched your saved EEOC answer.")
      : null;
    return {
      suggestedValue: matched?.option || explicitValue,
      confidence: matched?.confidence ?? (explicitValue ? 0.92 : 0.4),
      reason: matched?.reason ?? (explicitValue ? "Using your explicitly saved EEOC answer." : "No saved EEOC answer is available."),
      autoFillAllowed: Boolean(explicitValue),
      sensitivity: "sensitive" as const,
      matchedOption: matched?.option,
      answerSource: explicitValue ? ("explicit_profile" as const) : ("unknown" as const),
      shortAnswer: null
    };
  }

  const derived = deriveFieldAnswer(intent, profile, field);
  const matched = maybeMatchVisibleOption(intent, field, derived.value, profile, questionText);
  const suggestedValue = matched?.option || derived.value;
  const sensitivity = selectSensitivity(intent, derived.source);
  const autoFillAllowed =
    Boolean(suggestedValue) &&
    derived.source !== "unknown";

  return {
    suggestedValue,
    confidence: matched?.confidence ?? derived.confidence,
    reason: matched?.reason ?? derived.reason,
    autoFillAllowed,
    sensitivity: (isSensitiveIntent(intent) ? "sensitive" : sensitivity) as AnswerSensitivity,
    matchedOption: matched?.option,
    answerSource: derived.source,
    shortAnswer: null
  };
}
