import { extractAnswerConstraints } from "@/lib/answerConstraints";
import { isDomNoiseLabel, sanitizeFieldLabel } from "@/lib/fieldLabeling";
import { normalizeText } from "@/lib/utils";
import { FieldIntent, QuestionAnswerabilityKind, RawScannedField, ShortAnswerQuestionKind } from "@/types";

const STRUCTURED_INTENTS = new Set<FieldIntent>([
  "first_name",
  "middle_name",
  "last_name",
  "preferred_name",
  "full_name",
  "email",
  "phone",
  "phone_country_code",
  "phone_number",
  "phone_extension",
  "phone_device_type",
  "full_phone_number",
  "address_line_1",
  "address_line_2",
  "street_address",
  "city",
  "state",
  "country",
  "postal_code",
  "location",
  "full_location",
  "linkedin",
  "github",
  "portfolio",
  "website",
  "resume_upload",
  "cover_letter_upload",
  "work_authorization",
  "work_authorization_category",
  "sponsorship",
  "sponsorship_now",
  "sponsorship_future",
  "work_without_sponsorship",
  "relocation",
  "remote_preference",
  "onsite_preference",
  "hybrid_preference",
  "availability",
  "desired_salary",
  "hourly_rate",
  "education_school",
  "education_degree",
  "education_major",
  "education_highest_completed",
  "education_highest_attended",
  "graduation_date",
  "expected_graduation_date",
  "graduated_question",
  "graduation_status",
  "employer",
  "job_title",
  "employment_start_date",
  "employment_end_date",
  "previous_employment",
  "security_clearance_level",
  "security_clearance_status",
  "security_clearance_active",
  "security_clearance_eligible",
  "valid_drivers_license",
  "reliable_transportation",
  "minimum_working_age",
  "background_check",
  "drug_screen",
  "travel_willingness",
  "travel_percentage",
  "shift_availability",
  "weekend_availability",
  "overtime_availability",
  "notice_period",
  "referral_source",
  "eeoc_gender",
  "eeoc_race",
  "eeoc_veteran",
  "eeoc_disability",
  "legal_attestation"
]);

const SENSITIVE_PATTERNS = [
  /salary history/i,
  /social security/i,
  /\bssn\b/i,
  /date of birth/i,
  /\bdob\b/i,
  /race|ethnicity|gender|disability|veteran/i,
  /criminal history|background check consent|legal attestation/i,
  /street address|driver'?s license/i
];

const OPEN_FIELD_TYPES = new Set(["text", "textarea", "search"]);
const INTERNAL_FIELD_IDENTIFIER_PATTERNS = [
  /^question[_-]?\d+$/i,
  /^field[_-]?\d+$/i,
  /^input[_-]?\d+$/i,
  /^ca[_-]?\d+$/i,
  /^[a-f0-9]{8,}$/i
];
const GENERIC_PROMPT_FRAGMENTS = new Set(["please", "describe", "your", "this", "particular", "position", "question"]);

function cleanQuestionFragment(value: string | null | undefined) {
  return sanitizeFieldLabel((value ?? "").replace(/\s*\*\s*/g, " ")).replace(/\s{2,}/g, " ").trim();
}

function isInternalFieldIdentifier(value: string | null | undefined) {
  const cleaned = cleanQuestionFragment(value);
  if (!cleaned) return true;
  const normalized = normalizeText(cleaned).replace(/\s+/g, "_");
  return INTERNAL_FIELD_IDENTIFIER_PATTERNS.some((pattern) => pattern.test(cleaned) || pattern.test(normalized));
}

export function deduplicateQuestionFragments(fragments: Array<string | null | undefined>) {
  const unique: string[] = [];
  for (const fragment of fragments.map(cleanQuestionFragment)) {
    if (!fragment) continue;
    const normalized = normalizeText(fragment);
    if (
      !normalized ||
      isDomNoiseLabel(fragment) ||
      isInternalFieldIdentifier(fragment) ||
      GENERIC_PROMPT_FRAGMENTS.has(normalized) ||
      unique.some(
        (existing) =>
          normalizeText(existing) === normalized ||
          normalizeText(existing).includes(normalized) ||
          normalized.includes(normalizeText(existing))
      )
    ) {
      continue;
    }
    unique.push(fragment);
  }
  return unique;
}

export function validateExtractedQuestion(text: string) {
  const cleaned = cleanQuestionFragment(text);
  if (!cleaned) return "";
  if (cleaned.length > 240) return "";
  if ((cleaned.match(/\?/g) || []).length >= 2) return "";
  if (/linkedin url.*github url|github url.*linkedin url|current company.*linkedin url|visa sponsorship.*salary expectations/i.test(cleaned)) {
    return "";
  }
  return cleaned;
}

function splitTopics(value: string) {
  return value
    .split(/,|\/| and | or /i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function shouldIgnoreNearbyText(value: string) {
  const nearby = validateExtractedQuestion(value.replace(/\s+/g, " ").trim());
  if (!nearby) return true;
  if (nearby.length > 220) return true;
  if ((nearby.match(/\?/g) || []).length >= 2) return true;
  if (/linkedin url|github url|current companycurrent company|salary expectations|visa sponsorship/i.test(nearby)) return true;
  return false;
}

export function buildFieldQuestionText(field: RawScannedField) {
  const focusedFragments = deduplicateQuestionFragments([
    field.label,
    field.explicitLabel,
    field.ariaLabelledByText,
    field.legendText,
    field.ariaLabel,
    field.placeholder
  ]);
  const nearbyFragments = deduplicateQuestionFragments([
    field.questionContainerText,
    shouldIgnoreNearbyText(field.nearbyText || "") ? "" : field.nearbyText,
    isInternalFieldIdentifier(field.name) ? "" : field.name
  ]);

  return deduplicateQuestionFragments([...focusedFragments, ...nearbyFragments]).join(" ").trim();
}

function focusTermsFromText(text: string) {
  const constraints = extractAnswerConstraints(text, "");
  const directMatch =
    text.match(/(?:experience|background|skills?|knowledge|familiarity)\s+(?:with|in)\s+([^.?;]+)/i)?.[1] ??
    text.match(/(?:code|coded|work|worked|building|built|using|used)\s+(?:in|with)\s+([^.?;]+)/i)?.[1] ??
    text.match(/what experience do you have with\s+([^.?;]+)/i)?.[1] ??
    text.match(/how have you used\s+([^.?;]+)/i)?.[1] ??
    text.match(/describe your experience with\s+([^.?;]+)/i)?.[1] ??
    "";

  return Array.from(
    new Set(
      [...constraints.requestedTopics, ...splitTopics(directMatch)].filter(
        (term) => !GENERIC_PROMPT_FRAGMENTS.has(normalizeText(term)) && !isInternalFieldIdentifier(term)
      )
    )
  );
}

export type ShortAnswerQuestionClassification = {
  kind: ShortAnswerQuestionKind;
  confidence: number;
  reason: string;
  answerability: QuestionAnswerabilityKind;
  questionText: string;
  canonicalQuestion: string;
  focusTerms: string[];
};

export function classifyShortAnswerQuestion(field: RawScannedField, intent: FieldIntent): ShortAnswerQuestionClassification | null {
  const isTextareaLike = field.type === "textarea" || field.controlType === "textarea";
  const isPlainTextInput =
    OPEN_FIELD_TYPES.has(field.type) && (!field.controlType || field.controlType === "text" || field.controlType === "unknown");

  if (!isTextareaLike && !isPlainTextInput) {
    return null;
  }

  if (STRUCTURED_INTENTS.has(intent) && intent !== "skills") {
    return null;
  }

  const questionText = buildFieldQuestionText(field);
  const focusedQuestionText = deduplicateQuestionFragments([field.label, field.placeholder, field.ariaLabel]).join(" ");
  const normalized = normalizeText(questionText);
  const focusTerms = focusTermsFromText(questionText);
  if (!normalized) {
    return null;
  }

  if (/^(yes|no|n\/a|not applicable)$/i.test((field.label || "").trim())) {
    return null;
  }

  if ((field.placeholder || "").trim().toLowerCase() === "pick date...") {
    return null;
  }

  if (field.type === "url" || /(?:twitter|x formerly twitter|linkedin|github|portfolio|website)\s+url/i.test(focusedQuestionText)) {
    return null;
  }

  if (/how many years|years of experience/i.test(focusedQuestionText)) {
    return null;
  }

  if (/how did you hear|referr(?:ed|al)|if yes, who/i.test(focusedQuestionText)) {
    return null;
  }

  if (/pronouns?/i.test(focusedQuestionText)) {
    return null;
  }

  if (/^do you\b/i.test(focusedQuestionText) && !/describe|share|briefly|why/i.test(focusedQuestionText)) {
    return null;
  }

  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(questionText))) {
    return {
      kind: "general",
      confidence: 0.92,
      reason: "This open-ended question appears legally sensitive, so ApplyPilot left it for manual review.",
      answerability: "legal_or_sensitive_manual",
      questionText,
      canonicalQuestion: field.label || field.ariaLabel || "Sensitive question",
      focusTerms: []
    };
  }

  if (intent === "why_interested" || /why (?:are you interested|this role|this position|this opportunity|apply)/i.test(questionText)) {
    return {
      kind: "why_role",
      confidence: 0.96,
      reason: "This looks like a role-interest short-answer question.",
      answerability: "generatable_from_job_and_profile",
      questionText,
      canonicalQuestion: field.label || "Why are you interested in this role?",
      focusTerms
    };
  }

  if (/why (?:this company|do you want to work here|join us|join our team)/i.test(questionText)) {
    return {
      kind: "why_company",
      confidence: 0.95,
      reason: "This looks like a company-interest short-answer question.",
      answerability: "generatable_from_job_and_profile",
      questionText,
      canonicalQuestion: field.label || "Why this company?",
      focusTerms
    };
  }

  if (/mission|values|approach to education|resonates most with you|contributing to that vision/i.test(questionText)) {
    return {
      kind: "why_company",
      confidence: 0.93,
      reason: "This looks like a company mission or values alignment question.",
      answerability: "generatable_from_job_and_profile",
      questionText,
      canonicalQuestion: field.label || "Why this company?",
      focusTerms
    };
  }

  if (intent === "tell_us_about_yourself" || /tell us about yourself|introduce yourself|professional summary|about you/i.test(questionText)) {
    return {
      kind: "about_me",
      confidence: 0.97,
      reason: "This looks like a personal introduction prompt.",
      answerability: "generatable_from_profile",
      questionText,
      canonicalQuestion: field.label || "Tell us about yourself.",
      focusTerms
    };
  }

  if (/why should we hire you|what makes you a strong fit|best candidate|why are you the right/i.test(questionText)) {
    return {
      kind: "why_hire_me",
      confidence: 0.92,
      reason: "This looks like a role-fit or why-hire-you prompt.",
      answerability: "generatable_from_job_and_profile",
      questionText,
      canonicalQuestion: field.label || "Why should we hire you?",
      focusTerms
    };
  }

  if (/anything else|additional information|additional comments|anything you.?d like us to know/i.test(questionText)) {
    return {
      kind: "additional_info",
      confidence: 0.9,
      reason: "This looks like an additional-information prompt.",
      answerability: "optional_no_value",
      questionText,
      canonicalQuestion: field.label || "Anything else you'd like us to know?",
      focusTerms
    };
  }

  if (/describe a time|tell me about a time|tell us about a time|conflict you resolved|managed competing priorities|demonstrated leadership|difficult customer|failure/i.test(questionText)) {
    return {
      kind: "behavioral_story",
      confidence: 0.95,
      reason: "This looks like a behavioral story question that needs a saved example.",
      answerability: "requires_saved_story",
      questionText,
      canonicalQuestion: field.label || "Behavioral example",
      focusTerms
    };
  }

  if (focusTerms.some((term) => /^(rust|golang|go|embedded firmware|firmware|cryptography|cryptographic|crypto)$/.test(normalizeText(term)))) {
    return {
      kind: "experience_relevance",
      confidence: 0.91,
      reason: "This question asks about a specific technical area that needs an explicit saved fact before ApplyPilot can answer safely.",
      answerability: "requires_one_user_fact",
      questionText,
      canonicalQuestion: field.label || "Describe your relevant experience.",
      focusTerms
    };
  }

  if (/camp\b.*availability|availability.*camp|what weeks can you work|which weeks can you work|what dates are you available|which dates are you available/i.test(questionText)) {
    return {
      kind: "general",
      confidence: 0.9,
      reason: "This question asks for explicit date or schedule facts that are not safe to infer.",
      answerability: "requires_one_user_fact",
      questionText,
      canonicalQuestion: field.label || "Availability details",
      focusTerms
    };
  }

  if (/describe|share|summarize|what experience|background|how have you used|worked with|experience with/i.test(questionText)) {
    return {
      kind: "experience_relevance",
      confidence: 0.84,
      reason: "This looks like an experience-based short-answer question.",
      answerability: "generatable_from_job_and_profile",
      questionText,
      canonicalQuestion: field.label || "Describe your relevant experience.",
      focusTerms
    };
  }

  if (intent === "skills" || /skills|tooling|technologies|tech stack|strengths/i.test(questionText)) {
    return {
      kind: "skills_summary",
      confidence: 0.82,
      reason: "This looks like a skills summary question.",
      answerability: "generatable_from_profile",
      questionText,
      canonicalQuestion: field.label || "What skills are most relevant here?",
      focusTerms
    };
  }

  if (/certified teacher|administrator|specialist|please list your certifications|if not please type [\"']?n\/a/i.test(questionText)) {
    return {
      kind: "general",
      confidence: 0.9,
      reason: "This question needs a yes/no or certification fact that was not saved in the profile.",
      answerability: "requires_one_user_fact",
      questionText,
      canonicalQuestion: field.label || "Certification details",
      focusTerms
    };
  }

  if (field.type === "textarea" || normalized.split(" ").length >= 5) {
    return {
      kind: "general",
      confidence: 0.66,
      reason: "This appears to be an open-ended prompt, but the requested answer shape is broad.",
      answerability: "requires_one_user_fact",
      questionText,
      canonicalQuestion: field.label || field.ariaLabel || "Open-ended question",
      focusTerms
    };
  }

  return null;
}
