import {
  ClearanceStatus,
  CompensationProfile,
  EducationEntry,
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
  "not a protected veteran": ["not a veteran", "i am not a veteran", "not protected veteran", "no veteran status"],
  "protected veteran": ["protected veteran", "i am a veteran", "veteran"],
  "prefer not to answer": ["decline to self-identify", "prefer not to answer", "decline", "choose not to disclose"]
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

function degreeFamilyOf(entry: Pick<EducationEntry, "degreeType" | "degreeLevel" | "degree">) {
  const normalizedDegree = normalizeText(entry.degree);
  const normalizedType = normalizeText(entry.degreeType);
  const normalizedLevel = normalizeText(entry.degreeLevel);

  if (normalizedDegree.includes("associate") || normalizedType.includes("associate") || normalizedLevel.includes("associate")) return "associate";
  if (normalizedDegree.includes("bachelor") || normalizedType.includes("bachelor") || normalizedLevel.includes("bachelor")) return "bachelor";
  if (normalizedDegree.includes("master") || normalizedType.includes("master") || normalizedLevel.includes("master")) return "master";
  if (normalizedDegree.includes("doctor") || normalizedDegree.includes("phd") || normalizedType.includes("doctor") || normalizedLevel.includes("doctoral")) return "doctorate";
  if (normalizedDegree.includes("certificate") || normalizedType.includes("certificate") || normalizedLevel.includes("certificate")) return "certificate";
  if (normalizedDegree.includes("high school") || normalizedDegree.includes("ged") || normalizedLevel.includes("high_school")) return "high_school";
  return "";
}

export function matchEducationDegreeOption(options: string[], entry: Pick<EducationEntry, "degree" | "degreeType" | "degreeLevel"> | null) {
  if (!entry) return null;

  const exactDegree = normalizeText(entry.degree);
  const family = degreeFamilyOf(entry);
  const mentionsScience = /\bscience\b/.test(exactDegree) || /bachelor_of_science|master_of_science/.test(normalizeText(entry.degreeType));
  const mentionsArts = /\barts?\b/.test(exactDegree) || /bachelor_of_arts|master_of_arts/.test(normalizeText(entry.degreeType));

  let best: MatchResult | null = null;
  for (const option of options) {
    const normalizedOption = normalizeText(option);
    if (!normalizedOption) continue;

    if (exactDegree && normalizedOption === exactDegree) {
      return { option, confidence: 0.99, reason: "Matched the saved degree exactly." };
    }

    if (exactDegree && (normalizedOption.includes(exactDegree) || exactDegree.includes(normalizedOption))) {
      best = best && best.confidence >= 0.96 ? best : { option, confidence: 0.96, reason: "Matched the saved degree wording closely." };
      continue;
    }

    if (family === "bachelor") {
      if (/associate|master|doctor/.test(normalizedOption)) continue;
      if (mentionsScience && /\barts?\b/.test(normalizedOption)) continue;
      if (mentionsArts && /\bscience\b/.test(normalizedOption)) continue;

      if (/bachelor/.test(normalizedOption)) {
        const confidence = /\bscience\b/.test(normalizedOption) === mentionsScience || /\barts?\b/.test(normalizedOption) === mentionsArts ? 0.95 : 0.92;
        if (!best || confidence > best.confidence) {
          best = { option, confidence, reason: "Matched the saved bachelor's degree family safely." };
        }
      }
      continue;
    }

    if (family === "associate") {
      if (/bachelor|master|doctor/.test(normalizedOption)) continue;
      if (/associate/.test(normalizedOption)) {
        best = best && best.confidence >= 0.94 ? best : { option, confidence: 0.94, reason: "Matched the saved associate-degree family safely." };
      }
      continue;
    }

    if (family === "master") {
      if (/associate|bachelor|doctor/.test(normalizedOption)) continue;
      if (/master/.test(normalizedOption)) {
        const confidence = /\bscience\b/.test(normalizedOption) === mentionsScience || /\barts?\b/.test(normalizedOption) === mentionsArts ? 0.95 : 0.92;
        if (!best || confidence > best.confidence) {
          best = { option, confidence, reason: "Matched the saved master's degree family safely." };
        }
      }
      continue;
    }

    if (family === "doctorate") {
      if (/associate|bachelor|master/.test(normalizedOption)) continue;
      if (/doctor|phd/.test(normalizedOption)) {
        best = best && best.confidence >= 0.94 ? best : { option, confidence: 0.94, reason: "Matched the saved doctoral-degree family safely." };
      }
      continue;
    }

    if (family === "certificate") {
      if (/certificate|vocational|trade/.test(normalizedOption)) {
        best = best && best.confidence >= 0.92 ? best : { option, confidence: 0.92, reason: "Matched the saved certificate-level education safely." };
      }
      continue;
    }

    if (family === "high_school") {
      if (/high school|ged/.test(normalizedOption)) {
        best = best && best.confidence >= 0.92 ? best : { option, confidence: 0.92, reason: "Matched the saved high-school education safely." };
      }
    }
  }

  return best;
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

function looksLikeUnsafeCityToken(city: string, country: string) {
  const normalizedCity = normalizeText(city);
  const normalizedCountry = normalizeText(country);
  if (!normalizedCity) return true;
  if (["united states", "us", "usa", "u s a", "u s", "country"].includes(normalizedCity)) return true;
  if (normalizedCountry && normalizedCountry.startsWith(normalizedCity) && normalizedCity.length <= 6) return true;
  return false;
}

export function matchStructuredLocationOption(options: string[], expectedLocation: string) {
  const expected = parseStructuredLocation(expectedLocation);
  if (!expected.city) return null;

  let best: MatchResult | null = null;
  const expectedStates = stateVariants(expected.state);
  const expectedCountry = normalizeText(expected.country);

  for (const option of options) {
    const parsed = parseStructuredLocation(option);
    if (!parsed.city) continue;
    if (looksLikeUnsafeCityToken(parsed.city, parsed.country)) continue;

    if (!parsed.state && !parsed.country) {
      if (parsed.city === expected.city) {
        return {
          option,
          confidence: 0.95,
          reason: "Matched the exact city label without accepting a broader autocomplete guess."
        };
      }
      continue;
    }

    if (parsed.city !== expected.city) continue;

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
    for (const option of options) {
      const normalizedOption = normalizeText(option);
      if (exactAliases.some((alias) => normalizedOption === normalizeText(alias) || normalizedOption.includes(normalizeText(alias)))) {
        return {
          option,
          confidence: 0.96,
          reason: "Matched veteran-status wording."
        };
      }
    }
  }

  return matchTextOption(options, value, "Matched veteran-status wording.");
}
