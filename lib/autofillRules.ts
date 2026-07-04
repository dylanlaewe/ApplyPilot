import { FieldIntent } from "@/types";

export const SAFE_AUTOFILL_THRESHOLD = 0.85;
export const REVIEW_THRESHOLD = 0.6;

export const FINAL_SUBMIT_PATTERNS = [
  "submit",
  "apply",
  "send application",
  "confirm",
  "finish",
  "complete application"
];

export const CAPTCHA_PATTERNS = ["captcha", "recaptcha", "i am not a robot", "cloudflare"];

export const SENSITIVE_INTENTS = new Set<FieldIntent>([
  "work_authorization",
  "work_authorization_category",
  "sponsorship",
  "eeoc_veteran",
  "eeoc_disability",
  "eeoc_gender",
  "eeoc_race",
  "legal_attestation",
  "relocation",
  "security_clearance_level",
  "security_clearance_status",
  "security_clearance_active"
]);

export const NEVER_AUTOFILL_INTENTS = new Set<FieldIntent>([
  "legal_attestation",
  "unknown"
]);

export const HIGH_RISK_EXACT_INTENTS = new Set<FieldIntent>([
  "work_authorization",
  "work_authorization_category",
  "sponsorship",
  "sponsorship_now",
  "sponsorship_future",
  "work_without_sponsorship",
  "eeoc_gender",
  "eeoc_race",
  "eeoc_veteran",
  "eeoc_disability",
  "security_clearance_level",
  "security_clearance_status",
  "security_clearance_active",
  "previous_employment",
  "legal_attestation",
  "background_check",
  "drug_screen"
]);
