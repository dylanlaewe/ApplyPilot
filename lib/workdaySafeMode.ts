import { SAFE_AUTOFILL_THRESHOLD } from "@/lib/autofillRules";
import { US_STATE_OPTIONS } from "@/lib/locationCatalog";
import { normalizeText } from "@/lib/utils";
import { ApplicationSession, DetectedField, FieldIntent } from "@/types";

type WorkdaySafeModeState = {
  inProgress: boolean;
  stopped: boolean;
  pageIdentity: string;
  verifiedFieldKeys: Set<string>;
  lastBarrierKind: string;
};

export type WorkdayPageIdentityParts = {
  hostname: string;
  pathname: string;
  title: string;
  heading: string;
};

export type WorkdayFieldMetrics = {
  fieldId: string;
  top: number;
  bottom: number;
  inViewport: boolean;
  sectionKey: string;
};

export type WorkdayPlannedField = {
  field: DetectedField;
  fieldKey: string;
  top: number;
  bottom: number;
  inViewport: boolean;
  sectionKey: string;
};

export type WorkdayFillExecutionResult = {
  completedCount: number;
  attemptedCount: number;
  needsReviewCount: number;
  skippedVerifiedCount: number;
  scrolledSections: string[];
};

const WORKDAY_SAFE_TEXT_INTENTS = new Set<FieldIntent>([
  "first_name",
  "middle_name",
  "last_name",
  "preferred_name",
  "full_name",
  "email",
  "phone",
  "phone_number",
  "full_phone_number",
  "phone_extension",
  "address_line_1",
  "address_line_2",
  "street_address",
  "linkedin",
  "github",
  "portfolio",
  "website",
  "city",
  "state",
  "country",
  "postal_code",
  "education_school",
  "education_major",
  "employer",
  "job_title",
  "employment_start_date",
  "employment_end_date"
]);

const WORKDAY_REPEATABLE_SECTION_INTENTS = new Set<FieldIntent>([
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
  "previous_employment"
]);

const WORKDAY_SAFE_SELECT_INTENTS = new Set<FieldIntent>(["education_degree", "country", "state", "phone_country_code", "phone_device_type"]);

const WORKDAY_HIGH_RISK_INTENTS = new Set<FieldIntent>([
  "work_authorization",
  "work_authorization_category",
  "sponsorship",
  "sponsorship_now",
  "sponsorship_future",
  "work_without_sponsorship",
  "security_clearance_level",
  "security_clearance_status",
  "security_clearance_active",
  "background_check",
  "legal_attestation",
  "eeoc_gender",
  "eeoc_race",
  "eeoc_veteran",
  "eeoc_disability",
  "desired_salary",
  "hourly_rate",
  "full_location"
]);

const WORKDAY_UNSUPPORTED_CONTROL_TYPES = new Set([
  "aria_combobox",
  "autocomplete",
  "listbox",
  "menu_button",
  "custom_select",
  "chip_input"
]);

const WORKDAY_COUNTRY_ALIASES: Record<string, string[]> = {
  US: ["United States", "United States of America", "USA", "U.S.", "U.S.A.", "US"]
};

const WORKDAY_PHONE_COUNTRY_CODE_ALIASES: Record<string, string[]> = {
  US: ["+1", "United States (+1)", "United States +1", "USA (+1)", "USA +1", "US (+1)", "US +1"]
};

const WORKDAY_SAVED_TEXTAREA_SOURCES = new Set<string>([
  "explicit_profile",
  "derived_profile",
  "formatted_profile",
  "answer_bank",
  "manual_user_answer"
]);

const workdayStateStore = globalThis as typeof globalThis & {
  __applyPilotWorkdaySafeMode?: Map<string, WorkdaySafeModeState>;
};

const workdayStates = workdayStateStore.__applyPilotWorkdaySafeMode ?? new Map<string, WorkdaySafeModeState>();
workdayStateStore.__applyPilotWorkdaySafeMode = workdayStates;

function normalizeCountryAlias(value: string) {
  return normalizeText(value).replace(/[./]/g, " ").replace(/\s+/g, " ").trim();
}

function createState(): WorkdaySafeModeState {
  return {
    inProgress: false,
    stopped: false,
    pageIdentity: "",
    verifiedFieldKeys: new Set<string>(),
    lastBarrierKind: ""
  };
}

export function isWorkdayUrl(url: string) {
  const normalized = url.toLowerCase();
  return normalized.includes("myworkdayjobs.com") || normalized.includes("workday");
}

export function shouldUseWorkdaySafeMode(session: Pick<ApplicationSession, "atsProvider" | "jobUrl" | "currentPageUrl">) {
  return session.atsProvider === "workday" || isWorkdayUrl(session.currentPageUrl || session.jobUrl);
}

export function getWorkdaySafeModeState(sessionId: string) {
  if (!workdayStates.has(sessionId)) {
    workdayStates.set(sessionId, createState());
  }
  return workdayStates.get(sessionId) as WorkdaySafeModeState;
}

export function stopWorkdaySafeMode(sessionId: string) {
  const state = getWorkdaySafeModeState(sessionId);
  state.stopped = true;
  state.inProgress = false;
  return state;
}

export function resumeWorkdaySafeMode(sessionId: string) {
  const state = getWorkdaySafeModeState(sessionId);
  state.stopped = false;
  return state;
}

export function resetWorkdayBarrierHistory(sessionId: string) {
  const state = getWorkdaySafeModeState(sessionId);
  state.lastBarrierKind = "";
  return state;
}

export function beginWorkdayPass(sessionId: string, pageIdentity: string) {
  const state = getWorkdaySafeModeState(sessionId);
  if (state.stopped) {
    return { allowed: false as const, reason: "Stopped" };
  }
  if (state.inProgress) {
    return { allowed: false as const, reason: "Already running" };
  }

  if (state.pageIdentity !== pageIdentity) {
    state.pageIdentity = pageIdentity;
    state.verifiedFieldKeys = new Set<string>();
  }

  state.inProgress = true;
  return { allowed: true as const };
}

export function completeWorkdayPass(sessionId: string, verifiedFieldKeys: string[]) {
  const state = getWorkdaySafeModeState(sessionId);
  for (const fieldKey of verifiedFieldKeys) {
    state.verifiedFieldKeys.add(fieldKey);
  }
  state.inProgress = false;
}

export function failWorkdayPass(sessionId: string) {
  const state = getWorkdaySafeModeState(sessionId);
  state.inProgress = false;
}

export function buildWorkdayPageIdentity(parts: WorkdayPageIdentityParts) {
  return [
    normalizeText(parts.hostname),
    normalizeText(parts.pathname),
    normalizeText(parts.title),
    normalizeText(parts.heading)
  ].join("::");
}

export function buildWorkdayFieldKey(field: Pick<DetectedField, "intent" | "label" | "name" | "domId" | "type">) {
  return [
    normalizeText(field.intent),
    normalizeText(field.label || ""),
    normalizeText(field.name || ""),
    normalizeText(field.domId || ""),
    normalizeText(field.type || "")
  ].join("::");
}

export function matchExactCountryAliasOption(options: string[], candidate: string) {
  const normalizedCandidate = normalizeCountryAlias(candidate);
  const canonicalCode =
    Object.entries(WORKDAY_COUNTRY_ALIASES).find(([, aliases]) =>
      aliases.some((alias) => normalizeCountryAlias(alias) === normalizedCandidate)
    )?.[0] ?? "";

  if (!canonicalCode) {
    return null;
  }

  const approvedAliases = WORKDAY_COUNTRY_ALIASES[canonicalCode].map(normalizeCountryAlias);
  for (const option of options) {
    if (approvedAliases.includes(normalizeCountryAlias(option))) {
      return {
        option,
        confidence: 0.99,
        canonicalCode,
        reason: "Matched an approved country alias exactly."
      };
    }
  }

  return null;
}

function normalizeStateAlias(value: string) {
  return normalizeText(value).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

export function matchExactStateAliasOption(options: string[], candidate: string) {
  const normalizedCandidate = normalizeStateAlias(candidate);
  const state = US_STATE_OPTIONS.find(
    (option) => normalizeStateAlias(option.code) === normalizedCandidate || normalizeStateAlias(option.name) === normalizedCandidate
  );

  if (!state) {
    return null;
  }

  const approvedAliases = [state.code, state.name].map(normalizeStateAlias);
  for (const option of options) {
    if (approvedAliases.includes(normalizeStateAlias(option))) {
      return {
        option,
        confidence: 0.99,
        reason: "Matched an approved state alias exactly."
      };
    }
  }

  return null;
}

function normalizePhoneCountryCodeAlias(value: string) {
  return normalizeText(value).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
}

export function matchExactPhoneCountryCodeOption(options: string[], candidate: string) {
  const normalizedCandidate = normalizePhoneCountryCodeAlias(candidate);
  const canonicalCode =
    Object.entries(WORKDAY_PHONE_COUNTRY_CODE_ALIASES).find(([, aliases]) =>
      aliases.some((alias) => normalizePhoneCountryCodeAlias(alias) === normalizedCandidate)
    )?.[0] ?? "";

  if (!canonicalCode) {
    return null;
  }

  const approvedAliases = WORKDAY_PHONE_COUNTRY_CODE_ALIASES[canonicalCode].map(normalizePhoneCountryCodeAlias);
  for (const option of options) {
    if (approvedAliases.includes(normalizePhoneCountryCodeAlias(option))) {
      return {
        option,
        confidence: 0.99,
        canonicalCode,
        reason: "Matched an approved phone country code option exactly."
      };
    }
  }

  return null;
}

function clearFieldForManualReview(field: DetectedField, reason: string, status: DetectedField["status"] = "needs_review") {
  field.status = status;
  field.reason = reason;
  field.autoFillAllowed = false;
  field.suggestedValue = "";
  field.matchedOption = undefined;
  if (field.verificationStatus === "verified") {
    field.verificationStatus = "not_attempted";
    field.verificationMessage = undefined;
  }
}

function markOptionalWorkdayField(field: DetectedField, reason: string) {
  field.status = "skipped";
  field.reason = reason;
  field.autoFillAllowed = false;
  field.reviewCategory = "optional_skipped";
  field.suggestedValue = "";
  field.matchedOption = undefined;
  if (field.verificationStatus === "verified") {
    field.verificationStatus = "not_attempted";
    field.verificationMessage = undefined;
  }
}

export function isHighRiskWorkdayIntent(intent: FieldIntent) {
  return WORKDAY_HIGH_RISK_INTENTS.has(intent);
}

function isFillableWorkdayTextControl(field: DetectedField) {
  if (field.type === "textarea") return false;
  if (field.type === "file") return false;
  if (field.type === "select-one" || field.type === "select-multiple") return false;
  if (field.controlType === "native_select") return false;
  if (WORKDAY_UNSUPPORTED_CONTROL_TYPES.has(field.controlType || "")) return false;
  return true;
}

function isEligibleWorkdayTextareaControl(field: DetectedField) {
  return (
    field.type === "textarea" &&
    WORKDAY_SAVED_TEXTAREA_SOURCES.has(field.answerSource) &&
    Boolean(field.suggestedValue.trim()) &&
    field.autoFillAllowed &&
    field.confidence >= SAFE_AUTOFILL_THRESHOLD
  );
}

function isFillableWorkdaySelectControl(field: DetectedField) {
  return (
    ["native_select", "aria_combobox", "autocomplete", "listbox", "menu_button", "custom_select"].includes(field.controlType || "") ||
    field.type === "select-one" ||
    field.type === "select-multiple" ||
    field.role === "combobox"
  );
}

function isEligibleWorkdaySafeField(field: DetectedField) {
  if (!field.suggestedValue.trim() || !field.autoFillAllowed || field.confidence < SAFE_AUTOFILL_THRESHOLD) {
    return false;
  }

  if (WORKDAY_SAFE_TEXT_INTENTS.has(field.intent) && isFillableWorkdayTextControl(field)) {
    return true;
  }

  if (isEligibleWorkdayTextareaControl(field)) {
    return true;
  }

  return WORKDAY_SAFE_SELECT_INTENTS.has(field.intent) && isFillableWorkdaySelectControl(field) && Boolean(field.matchedOption || field.suggestedValue.trim());
}

export function applyWorkdaySafeModeRules(
  fields: DetectedField[],
  options: {
    verifiedFieldKeys?: Set<string>;
  } = {}
) {
  const verifiedFieldKeys = options.verifiedFieldKeys ?? new Set<string>();

  return fields.map((field) => {
    const next = { ...field };
    const fieldKey = buildWorkdayFieldKey(next);

    if (verifiedFieldKeys.has(fieldKey)) {
      next.status = "filled";
      next.reason = "Already verified on this page.";
      next.autoFillAllowed = false;
      next.verificationStatus = "verified";
      next.verificationMessage = next.verificationMessage || "This field was already verified during an earlier safe pass.";
      return next;
    }

    if (next.intent === "country") {
      const exactCountryMatch = matchExactCountryAliasOption(next.selectOptions ?? [], next.suggestedValue || next.detectedValue);
      if (isFillableWorkdaySelectControl(next)) {
        if (!exactCountryMatch) {
          clearFieldForManualReview(next, "Needs an exact dropdown mapping");
          return next;
        }
        next.matchedOption = exactCountryMatch.option;
      } else if (!isFillableWorkdayTextControl(next)) {
        clearFieldForManualReview(next, "Needs an exact dropdown mapping");
        if (exactCountryMatch) {
          next.matchedOption = exactCountryMatch.option;
        }
        return next;
      }
    }

    if (next.intent === "state") {
      const exactStateMatch = matchExactStateAliasOption(next.selectOptions ?? [], next.suggestedValue || next.detectedValue);
      if (isFillableWorkdaySelectControl(next)) {
        if (!exactStateMatch) {
          clearFieldForManualReview(next, "Needs an exact dropdown mapping");
          return next;
        }
        next.matchedOption = exactStateMatch.option;
      }
    }

    if (next.intent === "phone_country_code") {
      const exactPhoneCodeMatch = matchExactPhoneCountryCodeOption(next.selectOptions ?? [], next.suggestedValue || next.detectedValue);
      if (isFillableWorkdaySelectControl(next)) {
        if (!exactPhoneCodeMatch) {
          clearFieldForManualReview(next, "Needs an exact dropdown mapping");
          return next;
        }
        next.matchedOption = exactPhoneCodeMatch.option;
      }
    }

    if (next.intent === "phone_device_type") {
      if (!next.suggestedValue.trim()) {
        clearFieldForManualReview(next, "No saved answer yet");
        return next;
      }

      if (isFillableWorkdaySelectControl(next)) {
        if (!next.matchedOption) {
          clearFieldForManualReview(next, "Needs an exact dropdown mapping");
          return next;
        }
      }
    }

    if (next.intent === "phone_extension" && !next.suggestedValue.trim()) {
      markOptionalWorkdayField(next, "Optional field with no saved value");
      return next;
    }

    if (next.controlType === "repeatable_section" || next.controlType === "file_upload_section") {
      next.status = "needs_review";
      next.autoFillAllowed = false;
      next.reviewCategory = "required_missing";
      return next;
    }

    if (next.intent === "resume_upload" || next.type === "file") {
      clearFieldForManualReview(next, "Resume upload needs verification");
      return next;
    }

    if (isHighRiskWorkdayIntent(next.intent) || next.sensitivity === "sensitive") {
      clearFieldForManualReview(next, "Sensitive question requires your review", "sensitive");
      return next;
    }

    if (next.type === "textarea") {
      if (isEligibleWorkdayTextareaControl(next)) {
        next.status = "needs_review";
        next.reason = `${next.reason} Safe to autofill on this Workday page.`;
        return next;
      }
      clearFieldForManualReview(next, "No saved answer yet");
      return next;
    }

    if (WORKDAY_REPEATABLE_SECTION_INTENTS.has(next.intent) && !isEligibleWorkdaySafeField(next)) {
      clearFieldForManualReview(next, "This section requires manual setup");
      return next;
    }

    if (WORKDAY_SAFE_SELECT_INTENTS.has(next.intent) && isFillableWorkdaySelectControl(next)) {
      if (!next.matchedOption) {
        clearFieldForManualReview(next, "Needs an exact dropdown mapping");
        return next;
      }
      next.status = "needs_review";
      next.reason = `${next.reason} Safe to autofill on this Workday page.`;
      return next;
    }

    if (!isFillableWorkdayTextControl(next)) {
      clearFieldForManualReview(
        next,
        next.selectOptions?.length || WORKDAY_UNSUPPORTED_CONTROL_TYPES.has(next.controlType || "")
          ? "Needs an exact dropdown mapping"
          : "ApplyPilot does not support this control yet"
      );
      return next;
    }

    if (!WORKDAY_SAFE_TEXT_INTENTS.has(next.intent)) {
      clearFieldForManualReview(next, "ApplyPilot does not support this control yet");
      return next;
    }

    if (!next.suggestedValue.trim() || !next.autoFillAllowed || next.confidence < SAFE_AUTOFILL_THRESHOLD) {
      clearFieldForManualReview(next, "ApplyPilot does not support this control yet");
      return next;
    }

    next.status = "needs_review";
    next.reason = `${next.reason} Safe to autofill on this Workday page.`;
    return next;
  });
}

export function buildWorkdayExecutionPlan(fields: DetectedField[], metrics: WorkdayFieldMetrics[]) {
  const metricById = new Map(metrics.map((metric) => [metric.fieldId, metric]));

  return fields
    .filter(
      (field) =>
        field.status === "needs_review" &&
        field.autoFillAllowed &&
        field.suggestedValue.trim() &&
        isEligibleWorkdaySafeField(field)
    )
    .map((field) => {
      const metric = metricById.get(field.id);
      return {
        field,
        fieldKey: buildWorkdayFieldKey(field),
        top: metric?.top ?? Number.MAX_SAFE_INTEGER,
        bottom: metric?.bottom ?? Number.MAX_SAFE_INTEGER,
        inViewport: metric?.inViewport ?? false,
        sectionKey: metric?.sectionKey || "page"
      } satisfies WorkdayPlannedField;
    })
    .sort((left, right) => left.top - right.top);
}

export function summarizeWorkdayPassResult(fields: DetectedField[]) {
  const completed = fields.filter((field) => field.status === "filled" && field.verificationStatus === "verified").length;
  const needsReview = fields.filter((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status)).length;
  return `${completed} safe field${completed === 1 ? "" : "s"} completed / ${needsReview} field${needsReview === 1 ? "" : "s"} need review / No uncertain answers were selected`;
}

export async function executeWorkdayFillPlan({
  plan,
  isAlreadyVerified,
  getLatestMetrics,
  scrollToField,
  fillOneField
}: {
  plan: WorkdayPlannedField[];
  isAlreadyVerified: (fieldKey: string) => boolean;
  getLatestMetrics: (field: DetectedField) => Promise<Pick<WorkdayPlannedField, "top" | "inViewport" | "sectionKey">>;
  scrollToField: (field: DetectedField) => Promise<void>;
  fillOneField: (field: DetectedField) => Promise<boolean>;
}): Promise<WorkdayFillExecutionResult> {
  const scrolledSections = new Set<string>();
  let attemptedCount = 0;
  let completedCount = 0;
  let skippedVerifiedCount = 0;

  for (const item of plan) {
    if (isAlreadyVerified(item.fieldKey)) {
      skippedVerifiedCount += 1;
      continue;
    }

    const latestMetrics = await getLatestMetrics(item.field);
    const sectionKey = latestMetrics.sectionKey || item.sectionKey || "page";
    if (!latestMetrics.inViewport && !scrolledSections.has(sectionKey)) {
      await scrollToField(item.field);
      scrolledSections.add(sectionKey);
    }

    attemptedCount += 1;
    const verified = await fillOneField(item.field);
    if (verified) {
      completedCount += 1;
    }
  }

  return {
    completedCount,
    attemptedCount,
    needsReviewCount: 0,
    skippedVerifiedCount,
    scrolledSections: [...scrolledSections]
  };
}
