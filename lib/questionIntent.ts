import { FieldIntent, RawScannedField } from "@/types";

import { inferFieldMetadata } from "@/lib/fieldDetection";
import { normalizeText } from "@/lib/utils";

type IntentPattern = {
  intent: FieldIntent;
  patterns: RegExp[];
  allowedTypes?: string[];
};

const INTENT_PATTERNS: IntentPattern[] = [
  { intent: "email", patterns: [/\bemail\b/, /e-mail/, /email address/], allowedTypes: ["email", "text"] },
  { intent: "first_name", patterns: [/first name/, /given name/, /\bfname\b/, /first_name/], allowedTypes: ["text"] },
  { intent: "middle_name", patterns: [/middle name/, /middle initial/], allowedTypes: ["text"] },
  { intent: "last_name", patterns: [/last name/, /family name/, /surname/, /\blname\b/, /last_name/], allowedTypes: ["text"] },
  { intent: "preferred_name", patterns: [/preferred name/, /nickname/], allowedTypes: ["text"] },
  { intent: "full_name", patterns: [/full name/, /\bname\b/, /your name/], allowedTypes: ["text"] },
  { intent: "phone_country_code", patterns: [/country code/, /calling code/, /dialing code/, /phone prefix/, /mobile country code/, /\+1/, /united states \(\+1\)/], allowedTypes: ["text", "select-one", "search"] },
  { intent: "phone_extension", patterns: [/\bextension\b/, /\bext\b/], allowedTypes: ["text", "number", "tel"] },
  { intent: "phone_number", patterns: [/phone number/, /mobile number/, /cell number/], allowedTypes: ["tel", "text", "number"] },
  { intent: "phone", patterns: [/\bphone\b/, /\bmobile\b/, /\bcell\b/, /\btel\b/], allowedTypes: ["tel", "text", "number"] },
  { intent: "address_line_1", patterns: [/address line 1/, /address 1/, /street address/, /residential address/, /home address/, /mailing address/], allowedTypes: ["text"] },
  { intent: "address_line_2", patterns: [/address line 2/, /address 2/, /apartment/, /suite/, /unit/], allowedTypes: ["text"] },
  { intent: "postal_code", patterns: [/\bzip\b/, /zip code/, /postal code/, /postcode/, /pin code/], allowedTypes: ["text", "number"] },
  { intent: "city", patterns: [/\bcity\b/, /town/], allowedTypes: ["text", "search"] },
  { intent: "state", patterns: [/\bstate\b/, /province/, /region/], allowedTypes: ["text", "select-one", "search"] },
  { intent: "country", patterns: [/\bcountry\b/], allowedTypes: ["text", "select-one", "search"] },
  { intent: "location", patterns: [/\blocation\b/, /where are you based/, /current location/, /where are you located/], allowedTypes: ["text", "search"] },
  { intent: "linkedin", patterns: [/linkedin/, /linkedin profile/], allowedTypes: ["url", "text"] },
  { intent: "github", patterns: [/github/, /git hub/], allowedTypes: ["url", "text"] },
  { intent: "portfolio", patterns: [/portfolio/, /personal site/, /website or portfolio/], allowedTypes: ["url", "text"] },
  { intent: "website", patterns: [/\bwebsite\b/, /homepage/, /professional profile/], allowedTypes: ["url", "text"] },
  { intent: "resume_upload", patterns: [/resume/, /\bcv\b/], allowedTypes: ["file"] },
  { intent: "cover_letter_upload", patterns: [/cover letter/], allowedTypes: ["file"] },
  {
    intent: "work_authorization_category",
    patterns: [/current work authorization status/, /authorization status/, /what is your current work authorization/, /us citizen|permanent resident|non resident|visa holder/],
    allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text", "search"]
  },
  {
    intent: "work_authorization",
    patterns: [/authorized to work/, /legally eligible/, /employment authorization/, /work authorization/, /unrestricted work authorization/],
    allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text"]
  },
  {
    intent: "sponsorship",
    patterns: [/require sponsorship/, /need sponsorship/, /visa sponsorship/, /h-1b/, /without sponsorship/, /able to work without sponsorship/],
    allowedTypes: ["select-one", "select-multiple", "radio", "checkbox", "text"]
  },
  { intent: "relocation", patterns: [/relocation/, /willing to relocate/], allowedTypes: ["select-one", "radio", "checkbox", "text"] },
  { intent: "remote_preference", patterns: [/\bremote\b/], allowedTypes: ["select-one", "radio", "checkbox", "text"] },
  { intent: "hybrid_preference", patterns: [/\bhybrid\b/], allowedTypes: ["select-one", "radio", "checkbox", "text"] },
  { intent: "onsite_preference", patterns: [/\bonsite\b/, /\bon-site\b/, /in office/], allowedTypes: ["select-one", "radio", "checkbox", "text"] },
  { intent: "availability", patterns: [/availability/, /start date/, /when can you start/, /available to start/], allowedTypes: ["text", "date", "select-one"] },
  { intent: "desired_salary", patterns: [/desired salary/, /salary expectation/, /compensation/, /salary requirements/, /salary range/], allowedTypes: ["text", "number", "textarea", "select-one"] },
  { intent: "hourly_rate", patterns: [/hourly/, /hourly rate/, /hourly expectation/], allowedTypes: ["text", "number", "select-one"] },
  { intent: "education_school", patterns: [/school/, /university/, /college/, /institution/], allowedTypes: ["text", "select-one", "search"] },
  { intent: "education_degree", patterns: [/\bdegree\b/, /degree type/, /highest degree/], allowedTypes: ["text", "select-one"] },
  { intent: "education_highest_completed", patterns: [/highest completed level of education/, /highest level of education completed/, /highest degree completed/, /highest level of education/], allowedTypes: ["text", "select-one", "search"] },
  { intent: "education_highest_attended", patterns: [/highest level of education.*attended/, /highest education attended/, /level of education you have attended/], allowedTypes: ["text", "select-one", "search"] },
  { intent: "education_major", patterns: [/\bmajor\b/, /field of study/, /area of study/, /academic discipline/, /concentration/, /program/], allowedTypes: ["text", "select-one", "search"] },
  { intent: "graduated_question", patterns: [/did you graduate/, /degree earned/, /have you graduated/], allowedTypes: ["select-one", "radio", "checkbox", "text", "search"] },
  { intent: "graduation_status", patterns: [/graduation status/, /enrollment status/], allowedTypes: ["select-one", "radio", "text"] },
  { intent: "expected_graduation_date", patterns: [/expected graduation/, /anticipated graduation/], allowedTypes: ["text", "date", "month"] },
  { intent: "graduation_date", patterns: [/graduation/, /graduated/, /grad date/], allowedTypes: ["text", "date", "month"] },
  { intent: "previous_employment", patterns: [/previously worked for/, /ever worked for.*past/, /worked for .* in the past/, /former employee/], allowedTypes: ["select-one", "radio", "checkbox", "text", "search"] },
  { intent: "employer", patterns: [/employer/, /company/, /current company/], allowedTypes: ["text"] },
  { intent: "job_title", patterns: [/job title/, /title/, /position/], allowedTypes: ["text"] },
  { intent: "employment_start_date", patterns: [/employment start/, /start date/, /from date/], allowedTypes: ["text", "date", "month"] },
  { intent: "employment_end_date", patterns: [/employment end/, /end date/, /to date/], allowedTypes: ["text", "date", "month"] },
  { intent: "skills", patterns: [/\bskills\b/, /technologies/, /tech stack/], allowedTypes: ["text", "textarea", "search"] },
  { intent: "security_clearance_level", patterns: [/security clearance/, /clearance level/, /secret clearance/, /top secret/, /public trust/], allowedTypes: ["select-one", "radio", "checkbox", "text", "search"] },
  { intent: "security_clearance_status", patterns: [/hold an active clearance/, /clearance status/, /currently hold an active clearance/, /ever held a security clearance/], allowedTypes: ["select-one", "radio", "checkbox", "text", "search"] },
  { intent: "valid_drivers_license", patterns: [/driver'?s license/, /valid license/], allowedTypes: ["select-one", "radio", "checkbox", "text"] },
  { intent: "minimum_working_age", patterns: [/at least 18/, /minimum working age/], allowedTypes: ["select-one", "radio", "checkbox", "text"] },
  { intent: "background_check", patterns: [/background check/], allowedTypes: ["select-one", "radio", "checkbox", "text"] },
  { intent: "drug_screen", patterns: [/drug screen/, /drug test/], allowedTypes: ["select-one", "radio", "checkbox", "text"] },
  { intent: "travel_percentage", patterns: [/travel percentage/, /how much travel/, /percent travel/], allowedTypes: ["text", "number", "select-one"] },
  { intent: "travel_willingness", patterns: [/willing to travel/], allowedTypes: ["select-one", "radio", "checkbox", "text"] },
  { intent: "weekend_availability", patterns: [/weekend availability/, /available weekends/], allowedTypes: ["select-one", "radio", "checkbox", "text"] },
  { intent: "overtime_availability", patterns: [/overtime availability/, /available for overtime/], allowedTypes: ["select-one", "radio", "checkbox", "text"] },
  { intent: "notice_period", patterns: [/notice period/, /current notice/], allowedTypes: ["text", "select-one"] },
  {
    intent: "referral_source",
    patterns: [
      /referral source/,
      /how did you hear about/,
      /how did you learn about this (?:opportunity|position|role)/,
      /what brought you to this job posting/,
      /where did you hear about this (?:opportunity|position|role)/,
      /source/
    ],
    allowedTypes: ["text", "select-one"]
  },
  { intent: "why_interested", patterns: [/why are you interested/, /why this role/, /interested in this role/], allowedTypes: ["textarea", "text"] },
  { intent: "tell_us_about_yourself", patterns: [/tell us about yourself/, /introduce yourself/, /about yourself/], allowedTypes: ["textarea", "text"] },
  { intent: "years_experience", patterns: [/years of experience/, /years experience/], allowedTypes: ["number", "text", "select-one"] },
  { intent: "eeoc_gender", patterns: [/\bgender\b/, /\bsex\b/], allowedTypes: ["select-one", "radio", "checkbox", "text", "search"] },
  { intent: "eeoc_race", patterns: [/race/, /ethnicity/, /hispanic/, /latino/], allowedTypes: ["select-one", "radio", "checkbox", "text", "search"] },
  { intent: "eeoc_veteran", patterns: [/veteran/], allowedTypes: ["select-one", "radio", "checkbox", "text", "search"] },
  { intent: "eeoc_disability", patterns: [/disability/], allowedTypes: ["select-one", "radio", "checkbox", "text", "search"] },
  { intent: "legal_attestation", patterns: [/attest/, /certify/, /consent/, /agree/], allowedTypes: ["checkbox", "radio"] }
];

function mapAllowedType(metaType: string, controlType?: string) {
  if (controlType && ["aria_combobox", "autocomplete", "custom_select", "menu_button"].includes(controlType)) {
    return "search";
  }
  return metaType;
}

function looksLikeEducationLevelOptions(options: string[]) {
  const normalized = normalizeText(options.join(" "));
  const matches = [
    /high school/,
    /associate/,
    /bachelor/,
    /master/,
    /doctorate|phd/
  ].filter((pattern) => pattern.test(normalized));
  return matches.length >= 3;
}

export function detectQuestionIntent(field: RawScannedField) {
  const meta = inferFieldMetadata(field);
  const label = meta.label;
  const allowedType = mapAllowedType(meta.type, meta.controlType);
  const combined = normalizeText(
    [
      label,
      field.name,
      field.domId,
      field.placeholder,
      field.ariaLabel,
      field.nearbyText,
      field.autocomplete,
      field.role,
      (field.selectOptions ?? []).join(" ")
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (meta.isEmail) {
    return { intent: "email" as const, confidence: 0.99, reason: "The field type is email.", questionText: combined };
  }

  if ((field.domId === "country" || normalizeText(label) === "country") && /phone/.test(combined) && (field.role === "combobox" || field.controlType === "aria_combobox")) {
    return { intent: "phone_country_code" as const, confidence: 0.99, reason: "Country combobox appears to be part of the phone input.", questionText: combined };
  }

  if ((field.domId === "phone" || /\bphone\b/.test(normalizeText(label))) && meta.type === "tel" && /country/.test(combined)) {
    return { intent: "phone_number" as const, confidence: 0.98, reason: "Phone input appears next to a separate country selector.", questionText: combined };
  }

  if (meta.isSelect && looksLikeEducationLevelOptions(field.selectOptions ?? [])) {
    return {
      intent: "education_highest_completed" as const,
      confidence: 0.9,
      reason: "Visible dropdown options look like education levels rather than school names.",
      questionText: combined
    };
  }

  let best: { intent: FieldIntent; confidence: number; reason: string } = {
    intent: "unknown",
    confidence: 0.2,
    reason: "No strong intent match found."
  };

  for (const config of INTENT_PATTERNS) {
    if (config.allowedTypes?.length && !config.allowedTypes.includes(allowedType)) continue;
    if (meta.isUpload && !["resume_upload", "cover_letter_upload"].includes(config.intent)) continue;

    let score = 0;
    const reasons: string[] = [];
    for (const pattern of config.patterns) {
      if (pattern.test(normalizeText(label))) {
        score = Math.max(score, 0.96);
        reasons.push("Label matched.");
      }
      if (pattern.test(normalizeText(field.name)) || pattern.test(normalizeText(field.domId))) {
        score = Math.max(score, 0.95);
        reasons.push("Field name or id matched.");
      }
      if (pattern.test(normalizeText(field.placeholder ?? "")) || pattern.test(normalizeText(field.ariaLabel ?? ""))) {
        score = Math.max(score, 0.92);
        reasons.push("Placeholder or aria label matched.");
      }
      if (pattern.test(normalizeText(field.nearbyText ?? ""))) {
        score = Math.max(score, 0.85);
        reasons.push("Nearby text matched.");
      }
      if (pattern.test(normalizeText(field.autocomplete ?? ""))) {
        score = Math.max(score, 0.97);
        reasons.push("Autocomplete matched.");
      }
      if (pattern.test(normalizeText((field.selectOptions ?? []).join(" ")))) {
        score = Math.max(score, 0.76);
        reasons.push("Option text supported the match.");
      }
    }

    if (config.intent === "full_name" && /first|last|surname|family|middle|preferred/.test(combined)) score = 0;
    if (config.intent === "phone" && /country code|extension|ext/.test(combined)) score = 0;
    if (config.intent === "location" && /\bzip\b|postal|country/.test(combined)) score = Math.min(score, 0.74);
    if (config.intent === "email" && (meta.isTextArea || meta.isSelect || meta.isUpload)) score = 0;

    if (score > best.confidence) {
      best = {
        intent: config.intent,
        confidence: score,
        reason: Array.from(new Set(reasons)).join(" ") || "Matched known intent."
      };
    }
  }

  return {
    ...best,
    questionText: combined
  };
}
