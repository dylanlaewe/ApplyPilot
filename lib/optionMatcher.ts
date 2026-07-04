import {
  ClearanceStatus,
  CompensationProfile,
  FieldIntent,
  HighestEducationLevel,
  SecurityClearanceLevel,
  WorkAuthorizationCategory
} from "@/types";

import { US_STATE_OPTIONS } from "@/lib/locationCatalog";
import { detectQuestionPolarity } from "@/lib/questionPolarity";
import { normalizeText } from "@/lib/utils";

type MatchResult = {
  option: string;
  confidence: number;
  reason: string;
};

const BOOLEAN_ALIASES: Record<string, string[]> = {
  yes: ["yes", "y", "true", "authorized", "able", "eligible", "graduated", "completed"],
  no: ["no", "n", "false", "not authorized", "not eligible", "did not graduate", "did not complete"]
};

const WORK_AUTHORIZATION_ALIASES: Record<WorkAuthorizationCategory, string[]> = {
  ask: [],
  us_citizen: ["us citizen", "u.s. citizen", "citizen", "citizen of the united states"],
  permanent_resident: ["permanent resident", "green card", "lawful permanent resident"],
  employment_authorization_document: ["employment authorization document", "ead", "work permit"],
  visa_holder: ["visa holder", "non resident", "non-resident", "visa"],
  refugee_or_asylee: ["refugee", "asylee", "refugee or asylee"],
  other_authorized: ["other authorized", "other work authorization"],
  not_authorized: ["not authorized", "unauthorized"],
  prefer_not_to_answer: ["prefer not to answer", "decline", "do not wish to answer"]
};

const CLEARANCE_LEVEL_ALIASES: Record<SecurityClearanceLevel, string[]> = {
  ask: [],
  none: ["none", "no clearance", "not cleared"],
  public_trust: ["public trust"],
  confidential: ["confidential"],
  secret: ["secret"],
  top_secret: ["top secret"],
  top_secret_sci: ["top secret sci", "ts/sci", "top secret / sci", "top secret sci eligible"],
  other: ["other"],
  unsure: ["unsure", "unknown"]
};

const CLEARANCE_STATUS_ALIASES: Record<ClearanceStatus, string[]> = {
  ask: [],
  active: ["active", "current"],
  inactive: ["inactive"],
  expired: ["expired", "lapsed"],
  eligible: ["eligible", "able to obtain", "can obtain"],
  never_held: ["never held", "none"],
  unsure: ["unsure", "unknown"]
};

const EEOC_VETERAN_ALIASES: Record<string, string[]> = {
  "not a veteran": ["i am not a veteran", "not a veteran"],
  "not a protected veteran": ["i am not a veteran", "not a veteran", "not a protected veteran"],
  "veteran, not protected": [
    "identify as a veteran, just not a protected veteran",
    "veteran just not a protected veteran",
    "veteran but not a protected veteran"
  ],
  "protected veteran": [
    "identify as one or more of the classifications of protected veterans",
    "protected veteran",
    "i am a protected veteran"
  ],
  "prefer not to answer": ["decline to self-identify", "prefer not to answer", "decline", "choose not to disclose"]
};

const FIELD_OF_STUDY_ALIASES: Record<string, string[]> = {
  "computer science": [
    "computer science",
    "computer sciences",
    "computer and information science",
    "computer and information sciences",
    "computer and information sciences general",
    "computer information systems"
  ],
  "information technology": ["information technology", "information systems", "information science"],
  cybersecurity: ["cybersecurity", "information assurance", "cyber security"],
  "data science": ["data science", "data analytics", "analytics"],
  mathematics: ["mathematics", "applied mathematics", "math"]
};

const DEGREE_OPTION_ALIASES: Record<string, string[]> = {
  "bachelor of science": ["bachelor of science", "bachelors degree", "bachelor's degree", "undergraduate degree"],
  "bachelor of arts": ["bachelor of arts", "bachelors degree", "bachelor's degree", "undergraduate degree"],
  "master of science": ["master of science", "masters degree", "master's degree", "graduate degree"],
  "master of arts": ["master of arts", "masters degree", "master's degree", "graduate degree"],
  "associate degree": ["associate degree", "associate"],
  "associate of science": ["associate of science", "associate degree", "associate"],
  "associate of arts": ["associate of arts", "associate degree", "associate"],
  "doctor of philosophy": ["doctor of philosophy", "doctoral degree", "doctorate", "phd"],
  "juris doctor": ["juris doctor", "professional degree"],
  "doctor of medicine": ["doctor of medicine", "professional degree"]
};

const EDUCATION_LEVEL_ALIASES: Record<HighestEducationLevel, string[]> = {
  no_formal_education: ["no formal education"],
  high_school: ["high school", "high school diploma", "ged"],
  certificate: ["certificate", "trade school", "vocational"],
  associate_degree: ["associate", "associate degree"],
  bachelors_degree: ["bachelor", "bachelors", "bachelor's degree"],
  masters_degree: ["master", "masters", "master's degree"],
  professional_degree: ["professional degree", "juris doctor", "doctor of medicine"],
  doctoral_degree: ["doctorate", "doctoral", "phd", "doctor of philosophy"]
};

function parseSalaryNumbers(text: string) {
  const matches = Array.from(text.matchAll(/\d[\d,]*/g)).map((match) => Number(match[0].replace(/,/g, "")));
  return matches.filter((value) => Number.isFinite(value));
}

function matchFromAliases<T extends string>(value: T, options: string[], aliasMap: Record<T, string[]>, reason: string) {
  const aliases = aliasMap[value] ?? [];
  let best: MatchResult | null = null;

  for (const option of options) {
    const normalized = normalizeText(option);
    if (aliases.some((alias) => normalized === normalizeText(alias))) {
      return { option, confidence: 0.99, reason };
    }
    if (aliases.some((alias) => normalized.includes(normalizeText(alias)))) {
      best = { option, confidence: 0.92, reason };
    }
  }

  return best;
}

function classifyBooleanMeaning(option: string) {
  const normalized = normalizeText(option);
  if (BOOLEAN_ALIASES.yes.some((alias) => normalized === alias || normalized.includes(alias))) return "yes";
  if (BOOLEAN_ALIASES.no.some((alias) => normalized === alias || normalized.includes(alias))) return "no";
  return null;
}

export function detectSponsorshipPolarity(questionText: string) {
  return detectQuestionPolarity(questionText, "sponsorship");
}

export function matchBooleanOption({
  questionText,
  options,
  answer,
  intent
}: {
  questionText: string;
  options: string[];
  answer: "yes" | "no";
  intent: FieldIntent;
}) {
  const polarity = detectQuestionPolarity(questionText, intent);
  const targetMeaning =
    polarity === "without_sponsorship" || polarity === "reverse"
      ? answer === "yes"
        ? "no"
        : "yes"
      : answer;

  let best: MatchResult | null = null;
  for (const option of options) {
    const meaning = classifyBooleanMeaning(option);
    if (meaning === targetMeaning) {
      const exact = normalizeText(option) === targetMeaning;
      const next: MatchResult = {
        option,
        confidence: exact ? 0.99 : 0.93,
        reason: "Matched question polarity and boolean meaning."
      };
      if (!best || next.confidence > best.confidence) best = next;
    }
  }

  return best;
}

const availabilityMap: Record<string, string[]> = {
  immediately: ["immediately", "available immediately", "asap", "now"],
  "1_week": ["1 week", "one week", "7 days"],
  "2_weeks": ["2 weeks", "two weeks", "14 days"],
  "3_weeks": ["3 weeks", "three weeks", "21 days"],
  "1_month": ["1 month", "one month", "30 days"]
};

export function matchAvailabilityOption(options: string[], timing: string) {
  const labels = availabilityMap[timing] ?? [];
  for (const option of options) {
    const normalized = normalizeText(option);
    if (labels.some((label) => normalized.includes(label))) {
      return { option, confidence: 0.94, reason: "Matched availability wording." };
    }
  }
  return null;
}

export function matchSalaryOption(options: string[], compensation: CompensationProfile) {
  const min = compensation.minimumSalary;
  const target = compensation.targetSalary;
  const high = compensation.highSalary;
  if (!min && !target) return null;

  let best: { option: string; confidence: number; score: number; reason: string } | null = null;

  for (const option of options) {
    const normalized = normalizeText(option);
    const numbers = parseSalaryNumbers(option);
    if (!numbers.length) continue;

    let score = 0;
    if (numbers.length >= 2) {
      const low = numbers[0];
      const top = numbers[1];
      if (target && target >= low && target <= top) score += 6;
      if (min && min >= low && min <= top) score += 4;
      if (high && high >= low && high <= top) score += 2;
    } else if (/\+/.test(normalized)) {
      if (target && target >= numbers[0]) score += 3;
      if (min && min >= numbers[0]) score += 2;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = {
        option,
        confidence: score >= 6 ? 0.94 : 0.82,
        score,
        reason: "Matched salary range option."
      };
    }
  }

  return best ? { option: best.option, confidence: best.confidence, reason: best.reason } : null;
}

export function matchWorkAuthorizationCategory(options: string[], value: WorkAuthorizationCategory) {
  return matchFromAliases(value, options, WORK_AUTHORIZATION_ALIASES, "Matched work authorization category.");
}

export function matchSecurityClearanceLevel(options: string[], value: SecurityClearanceLevel) {
  return matchFromAliases(value, options, CLEARANCE_LEVEL_ALIASES, "Matched security clearance level.");
}

export function matchSecurityClearanceStatus(options: string[], value: ClearanceStatus) {
  return matchFromAliases(value, options, CLEARANCE_STATUS_ALIASES, "Matched security clearance status.");
}

export function matchEducationLevel(options: string[], value: HighestEducationLevel) {
  return matchFromAliases(value, options, EDUCATION_LEVEL_ALIASES, "Matched education level.");
}

function stateVariants(value: string) {
  const normalized = normalizeText(value);
  const state = US_STATE_OPTIONS.find(
    (option) => normalizeText(option.code) === normalized || normalizeText(option.name) === normalized
  );

  return new Set(
    [normalized, state?.code, state?.name]
      .filter(Boolean)
      .map((item) => normalizeText(item as string))
  );
}

function parseStructuredLocation(value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    city: normalizeText(parts[0] ?? ""),
    state: parts[1] ?? "",
    country: parts[2] ?? ""
  };
}

export function matchStructuredLocationOption(options: string[], expectedLocation: string) {
  const expected = parseStructuredLocation(expectedLocation);
  if (!expected.city) return null;

  let best: MatchResult | null = null;
  const expectedStates = stateVariants(expected.state);
  const expectedCountry = normalizeText(expected.country);

  for (const option of options) {
    const parsed = parseStructuredLocation(option);
    if (!parsed.city || parsed.city !== expected.city) continue;

    const optionStates = stateVariants(parsed.state);
    const stateMatches = !expectedStates.size || Array.from(expectedStates).some((state) => optionStates.has(state));
    const countryMatches = !expectedCountry || !parsed.country || normalizeText(parsed.country) === expectedCountry;

    if (!stateMatches || !countryMatches) {
      continue;
    }

    const exactState = Boolean(expectedStates.size && Array.from(expectedStates).some((state) => optionStates.has(state)));
    const exactCountry = Boolean(expectedCountry && parsed.country && normalizeText(parsed.country) === expectedCountry);
    const confidence = exactState && exactCountry ? 0.99 : exactState ? 0.96 : 0.9;
    const result = {
      option,
      confidence,
      reason: "Matched city autocomplete with exact city and compatible state/country."
    };

    if (!best || result.confidence > best.confidence) {
      best = result;
    }
  }

  return best;
}

export function matchTextOption(options: string[], candidate: string, reason = "Matched visible option.") {
  const normalizedCandidate = normalizeText(candidate);
  const candidateTokens = normalizedCandidate.split(" ").filter(Boolean);
  let best: MatchResult | null = null;

  for (const option of options) {
    const normalizedOption = normalizeText(option);
    const optionTokens = normalizedOption.split(" ").filter(Boolean);
    if (normalizedOption === normalizedCandidate) {
      return { option, confidence: 0.99, reason };
    }

    if (candidateTokens.length === 1 && candidateTokens[0].length <= 3) {
      if (optionTokens.includes(candidateTokens[0])) {
        const confidence = optionTokens[0] === candidateTokens[0] ? 0.94 : 0.9;
        if (!best || confidence > best.confidence) {
          best = { option, confidence, reason };
        }
      }
      continue;
    }

    if (normalizedOption.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedOption)) {
      if (!best || best.confidence < 0.88) {
        best = { option, confidence: 0.88, reason };
      }
    } else {
      const candidateTokenSet = new Set(candidateTokens);
      const overlap = optionTokens.filter((token) => candidateTokenSet.has(token)).length;
      const ratio = optionTokens.length ? overlap / optionTokens.length : 0;
      if (ratio >= 0.7 && (!best || ratio > best.confidence)) {
        best = { option, confidence: Math.min(0.9, ratio), reason };
      }
    }
  }

  return best;
}

function exactTextMatch(options: string[], candidates: string[], reason: string) {
  const normalizedCandidates = candidates.map((candidate) => normalizeText(candidate)).filter(Boolean);
  for (const option of options) {
    const normalizedOption = normalizeText(option);
    if (normalizedCandidates.some((candidate) => normalizedOption === candidate)) {
      return { option, confidence: 0.99, reason };
    }
  }
  return null;
}

export function matchStateOrCountryOption(options: string[], value: string) {
  const normalizedValue = normalizeText(value);
  const state = US_STATE_OPTIONS.find(
    (option) => normalizeText(option.code) === normalizedValue || normalizeText(option.name) === normalizedValue
  );

  if (state) {
    return (
      matchTextOption(options, state.name, "Matched state option.") ??
      matchTextOption(options, state.code, "Matched state option.")
    );
  }

  return matchTextOption(options, value, "Matched location option.");
}

export function matchEeocVeteranOption(options: string[], value: string) {
  const normalizedValue = normalizeText(value);
  const exactAliases = EEOC_VETERAN_ALIASES[normalizedValue];
  if (exactAliases) {
    return exactTextMatch(options, exactAliases, "Matched veteran-status wording.");
  }

  return exactTextMatch(options, [value], "Matched veteran-status wording.");
}

export function matchFieldOfStudyOption(options: string[], value: string) {
  const normalizedValue = normalizeText(value);
  const aliases = FIELD_OF_STUDY_ALIASES[normalizedValue] ?? [value];
  const exact = exactTextMatch(options, aliases, "Matched field-of-study taxonomy.");
  if (exact) return exact;

  for (const option of options) {
    const normalizedOption = normalizeText(option);
    if (
      normalizedValue === "computer science" &&
      /computer/.test(normalizedOption) &&
      /(science|sciences|information)/.test(normalizedOption)
    ) {
      return {
        option,
        confidence: 0.94,
        reason: "Matched field-of-study taxonomy."
      };
    }
  }

  return null;
}

export function matchEducationDegreeOption(options: string[], value: string) {
  const normalizedValue = normalizeText(value);
  const aliases = DEGREE_OPTION_ALIASES[normalizedValue] ?? [value];
  const exact = exactTextMatch(options, aliases, "Matched degree taxonomy.");
  if (exact) return exact;

  if (/bachelor/.test(normalizedValue)) {
    return exactTextMatch(options, ["bachelors degree", "bachelor's degree"], "Matched degree taxonomy.");
  }
  if (/master/.test(normalizedValue)) {
    return exactTextMatch(options, ["masters degree", "master's degree"], "Matched degree taxonomy.");
  }
  if (/associate/.test(normalizedValue)) {
    return exactTextMatch(options, ["associate degree", "associate"], "Matched degree taxonomy.");
  }

  return null;
}
