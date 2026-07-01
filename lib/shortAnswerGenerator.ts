import { extractAnswerConstraints } from "@/lib/answerConstraints";
import { buildGroundedShortAnswer } from "@/lib/answerGrounding";
import { evaluateAnswerQuality } from "@/lib/answerQuality";
import { createDefaultAnswerBank } from "@/lib/answerBank";
import { buildCandidateEvidencePack, selectEvidenceForQuestion } from "@/lib/candidateEvidence";
import { validateGeneratedAnswer } from "@/lib/generatedAnswerValidator";
import { buildJobContext } from "@/lib/jobContext";
import { matchAnswerBankItem } from "@/lib/questionMatching";
import { buildFieldQuestionText, classifyShortAnswerQuestion } from "@/lib/shortAnswerQuestionClassifier";
import {
  AnswerBankItem,
  ApplicantProfile,
  DetectedField,
  FieldIntent,
  NormalizedJobContext,
  QuestionAnswerabilityKind,
  RawScannedField,
  ShortAnswerGeneratorHealthStatus,
  ShortAnswerSuggestion
} from "@/types";

export type ShortAnswerGeneratorProvider = {
  id: string;
  generate: (input: {
    classification: NonNullable<ReturnType<typeof classifyShortAnswerQuestion>>;
    profile: ApplicantProfile;
    jobContext: NormalizedJobContext;
    answerBank: AnswerBankItem[];
    regenerationNotes?: string[];
  }) => {
    answer: string;
    evidenceIds: string[];
    evidenceTitles: string[];
    storyIds: string[];
    warnings: string[];
    missingEvidence: string[];
  };
};

export type ShortAnswerGeneratorRuntimeHealth = {
  status: ShortAnswerGeneratorHealthStatus;
  provider: string;
  detail: string;
};

const deterministicProvider: ShortAnswerGeneratorProvider = {
  id: "deterministic-template",
  generate(input) {
    const pack = buildCandidateEvidencePack(input.profile, input.answerBank);
    const selected = selectEvidenceForQuestion(pack, {
      kind: input.classification.kind,
      focusTerms: input.classification.focusTerms,
      questionText: input.classification.questionText,
      jobContext: input.jobContext
    });

    const grounded = buildGroundedShortAnswer({
      kind: input.classification.kind,
      profile: input.profile,
      evidenceItems: selected.selectedItems,
      stories: selected.selectedStories,
      focusTerms: input.classification.focusTerms,
      jobContext: input.jobContext,
      regenerationNotes: input.regenerationNotes
    });

    return {
      ...grounded,
      missingEvidence: Array.from(new Set([...selected.missingEvidence, ...grounded.missingEvidence]))
    };
  }
};

function chooseProvider(): {
  provider: ShortAnswerGeneratorProvider;
  health: ShortAnswerGeneratorRuntimeHealth;
  warning: string;
} {
  const configured = process.env.APPLYPILOT_SHORT_ANSWER_PROVIDER?.trim().toLowerCase();

  if (!configured || configured === "deterministic") {
    return {
      provider: deterministicProvider,
      health: {
        status: "deterministic_fallback_only",
        provider: deterministicProvider.id,
        detail: "Using the built-in grounded template generator. No external short-answer provider is configured."
      },
      warning: ""
    };
  }

  return {
    provider: deterministicProvider,
    health: {
      status: "missing_configuration",
      provider: deterministicProvider.id,
      detail: `Configured short-answer provider "${configured}" is unavailable locally, so ApplyPilot is using the built-in grounded generator instead.`
    },
    warning: `Short-answer provider "${configured}" is not configured locally, so ApplyPilot used the deterministic grounded generator instead.`
  };
}

function answerabilityWhenGenerated(classification: NonNullable<ReturnType<typeof classifyShortAnswerQuestion>>): QuestionAnswerabilityKind {
  switch (classification.kind) {
    case "about_me":
    case "skills_summary":
    case "behavioral_story":
      return "generatable_from_profile";
    case "why_role":
    case "why_company":
    case "experience_relevance":
    case "why_hire_me":
    case "motivation":
      return "generatable_from_job_and_profile";
    case "additional_info":
      return "optional_no_value";
    default:
      return classification.answerability;
  }
}

function buildFollowUpQuestion(
  classification: NonNullable<ReturnType<typeof classifyShortAnswerQuestion>>,
  missingEvidence: string[]
) {
  if (classification.answerability === "requires_saved_story" || classification.kind === "behavioral_story") {
    return "Save one concrete STAR-style story for this type of question so ApplyPilot can draft it next time.";
  }

  const firstMissing = missingEvidence[0];
  if (firstMissing) {
    return `Add one concrete fact about ${firstMissing} to your profile, or answer this question manually for now.`;
  }

  return "Add one concrete fact to your profile, or answer this question manually for now.";
}

function unresolvedAnswerability(
  classification: NonNullable<ReturnType<typeof classifyShortAnswerQuestion>>,
  missingEvidence: string[]
): QuestionAnswerabilityKind {
  if (classification.answerability === "requires_saved_story") {
    return "requires_saved_story";
  }

  if (classification.answerability === "requires_one_user_fact") {
    return "requires_one_user_fact";
  }

  return "requires_one_user_fact";
}

function generatorHealthForValidationFailure(
  runtimeHealth: ShortAnswerGeneratorRuntimeHealth,
  warnings: string[]
): ShortAnswerGeneratorRuntimeHealth {
  return {
    status: "validation_failure",
    provider: runtimeHealth.provider,
    detail: warnings[0] || "The generated answer included details that could not be grounded in saved profile evidence."
  };
}

function isCertificationDetailsQuestion(questionText: string) {
  return /certified teacher|administrator|specialist|please list your certifications|if not please type [\"']?n\/a/i.test(questionText);
}

function hasSavedCertifications(profile: ApplicantProfile) {
  return profile.certifications.some((entry) => Boolean(entry.name.trim() || entry.issuer.trim() || entry.date.trim()));
}

function shouldUseCertificationNA(profile: ApplicantProfile, questionText: string) {
  return isCertificationDetailsQuestion(questionText) && !hasSavedCertifications(profile) && profile.workHistoryComplete;
}

type GeneratedAttempt = {
  generated: ReturnType<ShortAnswerGeneratorProvider["generate"]>;
  checked: ReturnType<typeof validateGeneratedAnswer>;
  quality: ReturnType<typeof evaluateAnswerQuality>;
  candidateEvidence: ReturnType<typeof buildCandidateEvidencePack>["items"];
};

export function getShortAnswerGeneratorRuntimeHealth(): ShortAnswerGeneratorRuntimeHealth {
  return chooseProvider().health;
}

export function summarizeShortAnswerGeneratorHealth(
  fields: Array<Pick<DetectedField, "shortAnswer">>,
  fallback = getShortAnswerGeneratorRuntimeHealth()
): ShortAnswerGeneratorRuntimeHealth {
  const priority: Record<ShortAnswerGeneratorHealthStatus, number> = {
    provider_error: 6,
    rate_limited: 5,
    validation_failure: 4,
    missing_configuration: 3,
    deterministic_fallback_only: 2,
    available: 1
  };

  let current = fallback;
  for (const field of fields) {
    const shortAnswer = field.shortAnswer;
    if (!shortAnswer) continue;

    const candidate: ShortAnswerGeneratorRuntimeHealth = {
      status: shortAnswer.generatorHealth,
      provider: shortAnswer.provider,
      detail:
        shortAnswer.warnings[0] ||
        shortAnswer.followUpQuestion ||
        shortAnswer.jobContextSummary ||
        current.detail
    };

    if (priority[candidate.status] > priority[current.status]) {
      current = candidate;
    }
  }

  return current;
}

type ShortAnswerSuggestionResult = {
  suggestedValue: string;
  confidence: number;
  reason: string;
  autoFillAllowed: boolean;
  sensitivity: "review";
  matchedOption: undefined;
  answerSource: "answer_bank" | "generated_answer" | "approved_fallback" | "unknown";
  shortAnswer: ShortAnswerSuggestion;
};

export function buildShortAnswerSuggestion(input: {
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
}): ShortAnswerSuggestionResult | null {
  const classification = classifyShortAnswerQuestion(input.field, input.intent);
  if (!classification) {
    return null;
  }

  const constraints = extractAnswerConstraints(classification.questionText, input.field.nearbyText);
  const jobContext = buildJobContext({
    company: input.sessionContext?.company,
    roleTitle: input.sessionContext?.roleTitle,
    source: input.sessionContext?.source,
    notes: input.sessionContext?.notes,
    metadataSource: input.sessionContext?.metadataSource,
    fieldQuestion: classification.questionText
  });
  const runtimeHealth = getShortAnswerGeneratorRuntimeHealth();
  const evidencePack = buildCandidateEvidencePack(input.profile, input.answerBank);
  const { bestItem, bestScore } = matchAnswerBankItem(classification.questionText, input.answerBank.length ? input.answerBank : createDefaultAnswerBank());

  if (classification.answerability === "legal_or_sensitive_manual") {
    const shortAnswer: ShortAnswerSuggestion = {
      kind: classification.kind,
      classificationConfidence: classification.confidence,
      answerability: classification.answerability,
      canonicalQuestion: classification.canonicalQuestion,
      questionText: classification.questionText,
      constraints,
      focusTerms: classification.focusTerms,
      evidenceIds: [],
      evidenceTitles: [],
      storyIds: [],
      provider: "manual-review",
      generatorHealth: runtimeHealth.status,
      generated: false,
      missingEvidence: [],
      warnings: [],
      validation: { valid: false, clipped: false, warnings: [], unsupportedTerms: [] },
      jobContextSummary: jobContext.summary
    };

    return {
      suggestedValue: "",
      confidence: classification.confidence,
      reason: classification.reason,
      autoFillAllowed: false,
      sensitivity: "review",
      matchedOption: undefined,
      answerSource: "unknown",
      shortAnswer
    };
  }

  if (classification.answerability === "optional_no_value") {
    const shortAnswer: ShortAnswerSuggestion = {
      kind: classification.kind,
      classificationConfidence: classification.confidence,
      answerability: "optional_no_value",
      canonicalQuestion: classification.canonicalQuestion,
      questionText: classification.questionText,
      constraints,
      focusTerms: classification.focusTerms,
      evidenceIds: [],
      evidenceTitles: [],
      storyIds: [],
      provider: "manual-review",
      generatorHealth: runtimeHealth.status,
      generated: false,
      missingEvidence: [],
      warnings: [],
      validation: { valid: true, clipped: false, warnings: [], unsupportedTerms: [] },
      jobContextSummary: jobContext.summary
    };

    return {
      suggestedValue: "",
      confidence: classification.confidence,
      reason: "This question is optional, so ApplyPilot left it blank unless you want to add something specific.",
      autoFillAllowed: false,
      sensitivity: "review",
      matchedOption: undefined,
      answerSource: "unknown",
      shortAnswer
    };
  }

  if (bestItem && bestScore >= 0.78) {
    const canPrefill = bestItem.autofillBehavior !== "ask";
    const shortAnswer: ShortAnswerSuggestion = {
      kind: classification.kind,
      classificationConfidence: Math.max(classification.confidence, bestScore),
      answerability: "reusable_saved_answer",
      canonicalQuestion: classification.canonicalQuestion,
      questionText: classification.questionText,
      constraints,
      focusTerms: classification.focusTerms,
      evidenceIds: [],
      evidenceTitles: [],
      storyIds: [],
      provider: "answer-bank",
      generatorHealth: runtimeHealth.status,
      generated: false,
      reusedAnswerBankItemId: bestItem.id,
      missingEvidence: [],
      warnings: canPrefill ? ["Saved short answers are prefilled for review before you continue."] : [],
      validation: { valid: Boolean(bestItem.answer.trim()), clipped: false, warnings: [], unsupportedTerms: [] },
      jobContextSummary: jobContext.summary
    };

    return {
      suggestedValue: bestItem.answer,
      confidence: Math.max(classification.confidence, bestScore),
      reason:
        bestItem.autofillBehavior === "ask"
          ? `A saved answer matched ${bestItem.label}, but you chose to review it manually each time.`
          : `Matched saved answer: ${bestItem.label}. Prefilled for review.`,
      autoFillAllowed: canPrefill && Boolean(bestItem.answer.trim()),
      sensitivity: "review",
      matchedOption: undefined,
      answerSource: "answer_bank",
      shortAnswer
    };
  }

  if (classification.answerability === "requires_saved_story" || classification.answerability === "requires_one_user_fact") {
    if (shouldUseCertificationNA(input.profile, classification.questionText)) {
      const shortAnswer: ShortAnswerSuggestion = {
        kind: classification.kind,
        classificationConfidence: classification.confidence,
        answerability: "requires_one_user_fact",
        canonicalQuestion: classification.canonicalQuestion,
        questionText: classification.questionText,
        constraints,
        focusTerms: classification.focusTerms,
        evidenceIds: [],
        evidenceTitles: [],
        storyIds: [],
        provider: "manual-review",
        generatorHealth: runtimeHealth.status,
        generated: false,
        missingEvidence: [],
        warnings: ['The question explicitly allows "N/A", and no saved certifications were found.'],
        validation: { valid: true, clipped: false, warnings: [], unsupportedTerms: [] },
        jobContextSummary: jobContext.summary
      };

      return {
        suggestedValue: "N/A",
        confidence: 0.9,
        reason: 'No saved certifications were found, and the question explicitly instructs applicants without certifications to enter "N/A".',
        autoFillAllowed: true,
        sensitivity: "review",
        matchedOption: undefined,
        answerSource: "approved_fallback",
        shortAnswer
      };
    }

    const shortAnswer: ShortAnswerSuggestion = {
      kind: classification.kind,
      classificationConfidence: classification.confidence,
      answerability: classification.answerability,
      canonicalQuestion: classification.canonicalQuestion,
      questionText: classification.questionText,
      constraints,
      focusTerms: classification.focusTerms,
      evidenceIds: [],
      evidenceTitles: [],
      storyIds: [],
      provider: "manual-review",
      generatorHealth: runtimeHealth.status,
      generated: false,
      missingEvidence: [],
      warnings: [],
      validation: { valid: false, clipped: false, warnings: [], unsupportedTerms: [] },
      jobContextSummary: jobContext.summary,
      followUpQuestion: buildFollowUpQuestion(classification, [])
    };

    return {
      suggestedValue: "",
      confidence: classification.confidence,
      reason:
        classification.answerability === "requires_saved_story"
          ? "This question needs a concrete saved example before ApplyPilot can draft it safely."
          : "This question needs one user-specific fact that is not saved in your profile yet, so ApplyPilot left it for manual review.",
      autoFillAllowed: false,
      sensitivity: "review",
      matchedOption: undefined,
      answerSource: "unknown",
      shortAnswer
    };
  }

  const { provider, health, warning } = chooseProvider();
  const runAttempt = (regenerationNotes: string[] = []): GeneratedAttempt => {
    const generated = provider.generate({
      classification,
      profile: input.profile,
      jobContext,
      answerBank: input.answerBank,
      regenerationNotes
    });

    const candidateEvidence = evidencePack.items.filter((item) => generated.evidenceIds.includes(item.id));
    const checked = validateGeneratedAnswer({
      answer: generated.answer,
      constraints,
      evidenceItems: candidateEvidence,
      jobContext
    });
    const quality = evaluateAnswerQuality({
      answer: checked.answer,
      questionText: classification.questionText,
      validation: checked.validation,
      candidateEvidence,
      jobContext
    });

    return {
      generated,
      checked,
      quality,
      candidateEvidence
    };
  };

  const firstAttempt = runAttempt();

  if (firstAttempt.generated.missingEvidence.length) {
    const answerability = unresolvedAnswerability(classification, firstAttempt.generated.missingEvidence);
    const shortAnswer: ShortAnswerSuggestion = {
      kind: classification.kind,
      classificationConfidence: classification.confidence,
      answerability,
      canonicalQuestion: classification.canonicalQuestion,
      questionText: classification.questionText,
      constraints,
      focusTerms: classification.focusTerms,
      evidenceIds: firstAttempt.generated.evidenceIds,
      evidenceTitles: firstAttempt.generated.evidenceTitles,
      storyIds: firstAttempt.generated.storyIds,
      provider: provider.id,
      generatorHealth: health.status,
      generated: true,
      missingEvidence: firstAttempt.generated.missingEvidence,
      warnings: [warning].filter(Boolean),
      validation: { valid: false, clipped: false, warnings: [], unsupportedTerms: [] },
      jobContextSummary: jobContext.summary,
      followUpQuestion: buildFollowUpQuestion(classification, firstAttempt.generated.missingEvidence)
    };

    return {
      suggestedValue: "",
      confidence: 0.46,
      reason: `ApplyPilot found this short-answer prompt but still needs one missing fact or story before it can safely draft it: ${firstAttempt.generated.missingEvidence.join(", ")}.`,
      autoFillAllowed: false,
      sensitivity: "review",
      matchedOption: undefined,
      answerSource: "unknown",
      shortAnswer
    };
  }

  const regenerationReasons = [
    ...firstAttempt.checked.validation.warnings,
    ...firstAttempt.quality.reasons
  ];
  const needsRetry = !firstAttempt.checked.validation.valid || !firstAttempt.quality.passed;
  const secondAttempt = needsRetry ? runAttempt(regenerationReasons) : null;
  const finalAttempt =
    secondAttempt && secondAttempt.generated.missingEvidence.length === 0 && secondAttempt.quality.passed && secondAttempt.checked.validation.valid
      ? secondAttempt
      : firstAttempt;
  const finalPassed = finalAttempt.checked.validation.valid && finalAttempt.quality.passed;
  const combinedWarnings = [
    warning,
    ...finalAttempt.generated.warnings,
    ...finalAttempt.checked.validation.warnings,
    ...(needsRetry ? [`ApplyPilot regenerated this draft once after quality checks flagged: ${regenerationReasons.join(" | ")}`] : [])
  ].filter(Boolean);
  const validGenerationHealth = finalPassed ? health : generatorHealthForValidationFailure(health, [...combinedWarnings, ...finalAttempt.quality.reasons]);
  const shortAnswer: ShortAnswerSuggestion = {
    kind: classification.kind,
    classificationConfidence: classification.confidence,
    answerability: answerabilityWhenGenerated(classification),
    canonicalQuestion: classification.canonicalQuestion,
    questionText: classification.questionText,
    constraints,
    focusTerms: classification.focusTerms,
    evidenceIds: finalAttempt.generated.evidenceIds,
    evidenceTitles: finalAttempt.generated.evidenceTitles,
    storyIds: finalAttempt.generated.storyIds,
    provider: provider.id,
    generatorHealth: validGenerationHealth.status,
    generated: true,
    missingEvidence: [],
    warnings: combinedWarnings,
    validation: finalAttempt.checked.validation,
    quality: finalAttempt.quality,
    jobEvidenceIds: jobContext.evidence.map((item) => item.id),
    jobEvidenceTitles: jobContext.evidence.map((item) => item.title),
    regenerationNotes: needsRetry ? regenerationReasons : [],
    jobContextSummary: jobContext.summary
  };

  if (!finalPassed) {
    return {
      suggestedValue: "",
      confidence: 0.42,
      reason: `ApplyPilot drafted an answer, but it did not clear the grounding and quality checks${finalAttempt.quality.reasons.length ? `: ${finalAttempt.quality.reasons[0]}` : ""}.`,
      autoFillAllowed: false,
      sensitivity: "review",
      matchedOption: undefined,
      answerSource: "unknown",
      shortAnswer
    };
  }

  return {
    suggestedValue: finalAttempt.checked.answer,
    confidence: Math.min(0.93, Math.max(classification.confidence, 0.88)),
    reason: `Generated a grounded draft from ${finalAttempt.generated.evidenceIds.length} saved profile evidence item${finalAttempt.generated.evidenceIds.length === 1 ? "" : "s"} and verified it against the browser-visible field.`,
    autoFillAllowed: true,
    sensitivity: "review",
    matchedOption: undefined,
    answerSource: "generated_answer",
    shortAnswer
  };
}

export function describeShortAnswerField(field: RawScannedField) {
  return buildFieldQuestionText(field);
}
