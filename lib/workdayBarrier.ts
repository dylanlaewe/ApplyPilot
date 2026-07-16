import type { Page } from "playwright";

import { detectUnavailableText } from "@/lib/siteAvailability";
import { sanitizeWorkdayTenant } from "@/lib/workdayCapture";
import { normalizeText } from "@/lib/utils";
import type { CaptchaDetectionResult, DetectedField } from "@/types";

export type WorkdayBarrierKind =
  | "form_reached"
  | "not_scorable"
  | "login_required"
  | "account_creation_required"
  | "email_verification_required"
  | "captcha_required"
  | "mfa_required"
  | "terms_required"
  | "site_unavailable"
  | "unknown_barrier";

type WorkdayBarrierSnapshot = {
  url: string;
  hostname: string;
  title: string;
  heading: string;
  bodyText: string;
  buttons: string[];
  visibleInputs: Array<{
    type: string;
    name: string;
    id: string;
    label: string;
    autocomplete: string;
  }>;
};

export type WorkdayBarrierDetection = {
  kind: WorkdayBarrierKind;
  tenant: string;
  host: string;
  currentUrl: string;
  title: string;
  heading: string;
  message: string;
  nextAction: string;
  manualBarrier: boolean;
  formReached: boolean;
  accountAssistAllowed: boolean;
  reason: string;
};

const LOGIN_PATTERNS = [/sign in/i, /log in/i, /already have an account/i];
const ACCOUNT_CREATION_PATTERNS = [/create account/i, /create your account/i, /sign up/i, /register/i];
const EMAIL_VERIFICATION_PATTERNS = [/verify email/i, /verification email/i, /confirm your email/i, /check your email/i];
const VERIFICATION_CODE_PATTERNS = [/verification code/i, /enter code/i, /one-?time code/i, /security code/i];
const MFA_PATTERNS = [/multi-?factor/i, /two-?factor/i, /authenticator/i, /authentication code/i];
const TERMS_PATTERNS = [/terms and conditions/i, /i agree/i, /acknowledge/i, /legal acknowledgement/i];
const APPLY_START_PATTERNS = [
  /current step 1 of \d+/i,
  /back to job posting/i,
  /autofill with resume/i,
  /apply manually/i,
  /use my last application/i,
  /create account\/sign in/i
];
const APPLICATION_FORM_PATTERNS = [
  /my information/i,
  /contact information/i,
  /application form/i,
  /work experience/i,
  /education/i,
  /resume/i,
  /candidate home/i,
  /work authorization/i,
  /sponsorship/i
];
const SEARCH_PAGE_PATTERNS = [/search for jobs/i, /careers home/i, /jobs found/i, /search filters/i, /introduce yourself/i];
const ACCOUNT_ASSIST_FIELD_PATTERNS = [
  /first name/i,
  /last name/i,
  /email/i,
  /confirm email/i,
  /email address/i,
  /username \(email\)/i,
  /username/i
];

function hasPattern(patterns: RegExp[], text: string) {
  return patterns.some((pattern) => pattern.test(text));
}

function buildBarrierMessage(kind: WorkdayBarrierKind, accountAssistAllowed: boolean) {
  switch (kind) {
    case "login_required":
      return {
        message: "Login required.",
        nextAction:
          "Sign in in the browser or use your password manager. ApplyPilot will wait for the application form and will not touch passwords or codes."
      };
    case "account_creation_required":
      return {
        message: "Create account required.",
        nextAction: accountAssistAllowed
          ? "Create your Workday account in the browser. Fill this page can place safe name and email fields, but passwords, codes, and legal steps stay manual."
          : "Create your Workday account in the browser. ApplyPilot will continue after the application form opens."
      };
    case "email_verification_required":
      return {
        message: "Email verification required.",
        nextAction: "Verify your email in the browser or inbox, then use Review unresolved or wait for the form to appear."
      };
    case "captcha_required":
      return {
        message: "CAPTCHA required.",
        nextAction: "Complete the CAPTCHA in the browser. ApplyPilot will not attempt to bypass it."
      };
    case "mfa_required":
      return {
        message: "MFA required.",
        nextAction: "Complete MFA in the browser. ApplyPilot will not read or enter verification codes."
      };
    case "terms_required":
      return {
        message: "Terms acknowledgement required.",
        nextAction: "Review and accept the required terms yourself in the browser before continuing."
      };
    case "not_scorable":
      return {
        message: "Application start page detected.",
        nextAction:
          "Continue through the Workday start step in the browser. ApplyPilot will wait until visible account fields or the application form appears."
      };
    case "site_unavailable":
      return {
        message: "Job unavailable.",
        nextAction: "This Workday job page is no longer available. Open a current posting or return to the job search results."
      };
    case "form_reached":
      return {
        message: "Application form detected — ready to fill.",
        nextAction: "Use Fill this page to run a controlled Workday pass on the visible application form."
      };
    default:
      return {
        message: "Workday page needs review.",
        nextAction: "ApplyPilot could not safely classify this Workday page yet. Review the browser page and continue manually if needed."
      };
  }
}

export function classifyWorkdayBarrierSnapshot(
  snapshot: WorkdayBarrierSnapshot,
  options: {
    captchaDetection?: Pick<CaptchaDetectionResult, "status">;
  } = {}
): WorkdayBarrierDetection {
  const combined = normalizeText([snapshot.title, snapshot.heading, snapshot.bodyText, snapshot.buttons.join(" ")].join(" "));
  const tenant = sanitizeWorkdayTenant(snapshot.hostname);
  const hasPasswordField = snapshot.visibleInputs.some((input) => normalizeText(input.type) === "password" || /password/i.test(input.label));
  const hasVerificationCodeField = snapshot.visibleInputs.some(
    (input) => /code/i.test(input.label) || /otp|verification|security/i.test(input.name)
  );
  const visibleApplicationInputs = snapshot.visibleInputs.filter((input) => {
    const combinedField = normalizeText([input.label, input.name, input.id, input.autocomplete].join(" "));
    if (!combinedField) return false;
    if (/search for jobs|keywords|job family|region\/state|location filter|search/i.test(combinedField)) return false;
    return !/cookie|consent/i.test(combinedField);
  });
  const accountAssistFields = visibleApplicationInputs.filter((input) =>
    ACCOUNT_ASSIST_FIELD_PATTERNS.some((pattern) => pattern.test(input.label))
  );
  const accountAssistAllowed = accountAssistFields.length > 0;
  const hasStructuredAccountSetupFields =
    accountAssistFields.length >= 3 ||
    accountAssistFields.some((input) => /first name/i.test(input.label)) ||
    accountAssistFields.some((input) => /last name/i.test(input.label)) ||
    accountAssistFields.some((input) => /confirm email/i.test(input.label));
  const hasApplyStartShell =
    hasPattern(APPLY_START_PATTERNS, combined) &&
    !hasPasswordField &&
    !hasVerificationCodeField &&
    !hasStructuredAccountSetupFields &&
    !visibleApplicationInputs.length;

  let kind: WorkdayBarrierKind = "unknown_barrier";
  let reason = "The page did not expose a safe, recognized application-form state yet.";

  const unavailable = detectUnavailableText(snapshot.bodyText);
  if (unavailable) {
    kind = "site_unavailable";
    reason = `Matched unavailable text: ${unavailable}`;
  } else if (options.captchaDetection?.status === "confirmed_visible_challenge" || /captcha|i'm not a robot|robot check/i.test(combined)) {
    kind = "captcha_required";
    reason = "A visible CAPTCHA or human-verification prompt is present.";
  } else if (hasPattern(MFA_PATTERNS, combined) || hasVerificationCodeField) {
    kind = "mfa_required";
    reason = "The page is requesting a verification code or MFA step.";
  } else if (hasPattern(EMAIL_VERIFICATION_PATTERNS, combined)) {
    kind = "email_verification_required";
    reason = "The page is asking the user to verify an email address before continuing.";
  } else if (hasApplyStartShell) {
    kind = "not_scorable";
    reason = "The page is still on a Workday apply-start step without visible account fields or application inputs.";
  } else if (hasPattern(ACCOUNT_CREATION_PATTERNS, combined) || (hasStructuredAccountSetupFields && hasPasswordField)) {
    kind = "account_creation_required";
    reason = "The page is asking the user to create a Workday account.";
  } else if ((hasPasswordField && hasPattern(LOGIN_PATTERNS, combined)) || (hasPattern(LOGIN_PATTERNS, combined) && !hasPattern(SEARCH_PAGE_PATTERNS, combined))) {
    kind = "login_required";
    reason = "The page is asking the user to sign in before the application form is available.";
  } else if (hasPattern(TERMS_PATTERNS, combined) && !visibleApplicationInputs.length) {
    kind = "terms_required";
    reason = "The page requires a legal acknowledgement before the application form is available.";
  } else if (visibleApplicationInputs.length >= 2 || hasPattern(APPLICATION_FORM_PATTERNS, combined)) {
    kind = "form_reached";
    reason = "The visible page looks like an application form instead of a login or search screen.";
  }

  const ui = buildBarrierMessage(kind, accountAssistAllowed);
  return {
    kind,
    tenant,
    host: snapshot.hostname,
    currentUrl: snapshot.url,
    title: snapshot.title,
    heading: snapshot.heading,
    message: ui.message,
    nextAction: ui.nextAction,
    manualBarrier: kind !== "form_reached" && kind !== "site_unavailable",
    formReached: kind === "form_reached",
    accountAssistAllowed: kind === "account_creation_required" && accountAssistAllowed,
    reason
  };
}

export async function detectWorkdayBarrier(
  page: Page,
  options: {
    captchaDetection?: Pick<CaptchaDetectionResult, "status">;
  } = {}
) {
  const snapshot = await page.evaluate(() => {
    return {
      url: window.location.href,
      hostname: window.location.hostname,
      title: (document.title || "").replace(/\s+/g, " ").trim(),
      heading: (
        document.querySelector("h1, [data-automation-id='pageHeader'], [data-automation-id='formTitle'], [data-automation-id='titleText']")?.textContent || ""
      )
        .replace(/\s+/g, " ")
        .trim(),
      bodyText: (document.body.innerText || "").replace(/\s+/g, " ").trim(),
      buttons: Array.from(document.querySelectorAll("button, a, [role='button']"))
        .filter((element) => {
          if (!(element instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 30),
      visibleInputs: Array.from(document.querySelectorAll("input, textarea, select"))
        .filter((element) => {
          if (!(element instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((element) => ({
          type: (element.getAttribute("type") || element.tagName.toLowerCase()).replace(/\s+/g, " ").trim(),
          name: (element.getAttribute("name") || "").replace(/\s+/g, " ").trim(),
          id: (element.getAttribute("id") || "").replace(/\s+/g, " ").trim(),
          label: (() => {
            const id = element.getAttribute("id");
            const explicit = id ? document.querySelector(`label[for="${id}"]`) : null;
            const wrapped = element.closest("label");
            const fieldset = element.closest("fieldset, [role='group'], [role='radiogroup']");
            const legend = fieldset?.querySelector("legend, h1, h2, h3, h4");
            return (
              explicit?.textContent ||
              wrapped?.textContent ||
              legend?.textContent ||
              element.getAttribute("aria-label") ||
              element.getAttribute("placeholder") ||
              ""
            )
              .replace(/\s+/g, " ")
              .trim();
          })(),
          autocomplete: (element.getAttribute("autocomplete") || "").replace(/\s+/g, " ").trim()
        }))
    } satisfies WorkdayBarrierSnapshot;
  });

  return classifyWorkdayBarrierSnapshot(snapshot, options);
}

function fieldText(field: Pick<DetectedField, "label" | "name" | "questionText" | "placeholder" | "ariaLabel">) {
  return normalizeText([field.label, field.name, field.questionText, field.placeholder, field.ariaLabel].filter(Boolean).join(" "));
}

function isPasswordOrSecurityField(field: DetectedField) {
  const text = fieldText(field);
  return field.type === "password" || /password|security question|verification code|authenticator|captcha|mfa|one time code|otp/i.test(text);
}

function isEmailLike(value: string) {
  return /\S+@\S+\.\S+/.test(value.trim());
}

export function prepareWorkdayAccountAssistFields(fields: DetectedField[]) {
  const primaryEmail =
    fields.find((field) => field.intent === "email" && isEmailLike(field.suggestedValue))?.suggestedValue.trim() || "";

  return fields.map((field) => {
    const next = { ...field };
    const text = fieldText(next);
    if (isPasswordOrSecurityField(next)) {
      next.status = "needs_review";
      next.reason = "Password and verification steps stay manual.";
      next.autoFillAllowed = false;
      next.suggestedValue = "";
      next.matchedOption = undefined;
      return next;
    }

    const isAllowedIntent = next.intent === "first_name" || next.intent === "last_name" || next.intent === "email";
    const isConfirmEmail = /confirm email|email again/.test(text);
    const isEmailBasedUsername = /username/.test(text) && /email/.test(text);
    if ((isConfirmEmail || isEmailBasedUsername) && !next.suggestedValue.trim() && primaryEmail) {
      next.suggestedValue = primaryEmail;
      next.autoFillAllowed = true;
      next.reason = next.reason ? `${next.reason} Using your saved email for this account field.` : "Using your saved email for this account field.";
    }

    if (isAllowedIntent || isConfirmEmail || (isEmailBasedUsername && isEmailLike(next.suggestedValue))) {
      next.status = "needs_review";
      next.autoFillAllowed = Boolean(next.suggestedValue.trim());
      next.reason = next.reason
        ? `${next.reason} Safe to fill during Workday account setup.`
        : "Safe to fill during Workday account setup.";
      return next;
    }

    next.status = "needs_review";
    next.autoFillAllowed = false;
    next.suggestedValue = "";
    next.matchedOption = undefined;
    next.reason = "Leave this Workday account step for manual review.";
    return next;
  });
}

export function getWorkdayBarrierStatusLabel(kind: WorkdayBarrierKind) {
  switch (kind) {
    case "not_scorable":
      return "Application start page";
    case "login_required":
      return "Login required";
    case "account_creation_required":
      return "Create account required";
    case "email_verification_required":
      return "Email verification required";
    case "captcha_required":
      return "CAPTCHA required";
    case "mfa_required":
      return "MFA required";
    case "terms_required":
      return "Terms required";
    case "site_unavailable":
      return "Job unavailable";
    case "form_reached":
      return "Application form detected";
    default:
      return "Waiting for the page";
  }
}
