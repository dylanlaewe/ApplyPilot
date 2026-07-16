import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyWorkdayBarrierSnapshot,
  getWorkdayBarrierStatusLabel,
  prepareWorkdayAccountAssistFields
} from "@/lib/workdayBarrier";
import type { DetectedField } from "@/types";

function snapshot(overrides: Partial<Parameters<typeof classifyWorkdayBarrierSnapshot>[0]> = {}) {
  return {
    url: "https://tenant.wd5.myworkdayjobs.com/en-US/careers/job/123",
    hostname: "tenant.wd5.myworkdayjobs.com",
    title: "Workday",
    heading: "",
    bodyText: "",
    buttons: [],
    visibleInputs: [],
    ...overrides
  };
}

function field(overrides: Partial<DetectedField> = {}): DetectedField {
  return {
    id: crypto.randomUUID(),
    label: "Field",
    name: "field",
    domId: "field",
    type: "text",
    selector: "#field",
    detectedValue: "",
    suggestedValue: "",
    confidence: 0.95,
    confidenceLevel: "high",
    status: "needs_review",
    reason: "Matched exactly.",
    sensitivity: "safe",
    autoFillAllowed: true,
    intent: "unknown",
    reviewCategory: null,
    answerSource: "explicit_profile",
    verificationStatus: "not_attempted",
    ...overrides
  };
}

test("Workday barrier classifier distinguishes unavailable search redirects from login pages", () => {
  const result = classifyWorkdayBarrierSnapshot(
    snapshot({
      title: "Search for Jobs",
      bodyText:
        "Sign In Search for Jobs 99 jobs found The page you are looking for doesn't exist. Search for Jobs",
      buttons: ["Sign In", "Search for Jobs"],
      visibleInputs: [{ type: "text", name: "", id: "search", label: "Search for jobs or keywords", autocomplete: "" }]
    })
  );

  assert.equal(result.kind, "site_unavailable");
  assert.equal(result.manualBarrier, false);
  assert.equal(result.formReached, false);
  assert.equal(getWorkdayBarrierStatusLabel(result.kind), "Job unavailable");
});

test("Workday barrier classifier detects sign-in pages without treating search pages as login", () => {
  const result = classifyWorkdayBarrierSnapshot(
    snapshot({
      title: "Sign In",
      heading: "Sign In",
      bodyText: "Sign in Email Address Password Forgot your password?",
      buttons: ["Sign In", "Forgot Password"],
      visibleInputs: [
        { type: "email", name: "email", id: "email", label: "Email Address", autocomplete: "email" },
        { type: "password", name: "password", id: "password", label: "Password", autocomplete: "current-password" }
      ]
    })
  );

  assert.equal(result.kind, "login_required");
  assert.equal(result.manualBarrier, true);
  assert.match(result.nextAction, /password manager/i);
});

test("Workday barrier classifier detects account creation pages and notes safe assist availability", () => {
  const result = classifyWorkdayBarrierSnapshot(
    snapshot({
      title: "Create Account",
      heading: "Create Account",
      bodyText: "Create Account First Name Last Name Email Confirm Email Password Already have an account?",
      buttons: ["Create Account"],
      visibleInputs: [
        { type: "text", name: "first_name", id: "first_name", label: "First Name", autocomplete: "given-name" },
        { type: "text", name: "last_name", id: "last_name", label: "Last Name", autocomplete: "family-name" },
        { type: "email", name: "email", id: "email", label: "Email", autocomplete: "email" },
        { type: "email", name: "confirm_email", id: "confirm_email", label: "Confirm Email", autocomplete: "email" },
        { type: "password", name: "password", id: "password", label: "Password", autocomplete: "new-password" }
      ]
    })
  );

  assert.equal(result.kind, "account_creation_required");
  assert.equal(result.accountAssistAllowed, true);
  assert.match(result.nextAction, /name and email/i);
});

test("Workday barrier classifier marks apply-start shells as not scorable until fields appear", () => {
  const result = classifyWorkdayBarrierSnapshot(
    snapshot({
      title: "Careers",
      bodyText:
        "Back to Job Posting Customer Success Manager current step 1 of 7 Create Account/Sign In step 2 of 7 My Information step 3 of 7 My Experience step 4 of 7 Application Questions step 5 of 7 Voluntary Disclosures step 6 of 7 Self Identify step 7 of 7 Review",
      buttons: ["Sign In", "Search for Jobs", "Back to Job Posting"],
      visibleInputs: []
    })
  );

  assert.equal(result.kind, "not_scorable");
  assert.equal(result.formReached, false);
  assert.equal(result.manualBarrier, true);
  assert.equal(getWorkdayBarrierStatusLabel(result.kind), "Application start page");
});

test("Workday barrier classifier detects verification, captcha, MFA, and form states", () => {
  const emailVerification = classifyWorkdayBarrierSnapshot(
    snapshot({
      heading: "Verify Email",
      bodyText: "Verify Email Check your email and confirm your address before continuing."
    })
  );
  assert.equal(emailVerification.kind, "email_verification_required");

  const captcha = classifyWorkdayBarrierSnapshot(
    snapshot({
      bodyText: "Please complete the CAPTCHA before continuing."
    }),
    { captchaDetection: { status: "confirmed_visible_challenge" } }
  );
  assert.equal(captcha.kind, "captcha_required");

  const mfa = classifyWorkdayBarrierSnapshot(
    snapshot({
      heading: "Security Check",
      bodyText: "Enter the verification code from your authenticator app to continue.",
      visibleInputs: [{ type: "text", name: "verification_code", id: "verification_code", label: "Verification Code", autocomplete: "" }]
    })
  );
  assert.equal(mfa.kind, "mfa_required");

  const formReached = classifyWorkdayBarrierSnapshot(
    snapshot({
      heading: "My Information",
      bodyText: "My Information First Name Last Name Email Address City Resume",
      visibleInputs: [
        { type: "text", name: "first_name", id: "first_name", label: "First Name", autocomplete: "given-name" },
        { type: "text", name: "last_name", id: "last_name", label: "Last Name", autocomplete: "family-name" },
        { type: "email", name: "email", id: "email", label: "Email Address", autocomplete: "email" }
      ]
    })
  );
  assert.equal(formReached.kind, "form_reached");
  assert.equal(formReached.formReached, true);
});

test("Workday account assist only keeps safe name and email fields and leaves passwords untouched", () => {
  const fields = prepareWorkdayAccountAssistFields([
    field({ label: "First Name", name: "first_name", intent: "first_name", suggestedValue: "Avery" }),
    field({ label: "Last Name", name: "last_name", intent: "last_name", suggestedValue: "Example" }),
    field({ label: "Email", name: "email", intent: "email", suggestedValue: "avery@example.com" }),
    field({ label: "Confirm Email", name: "confirm_email", intent: "unknown", suggestedValue: "" }),
    field({ label: "Username (email)", name: "username", intent: "unknown", suggestedValue: "" }),
    field({ label: "Password", name: "password", type: "password", intent: "unknown", suggestedValue: "should-not-fill" }),
    field({ label: "Security question", name: "security_question", intent: "unknown", suggestedValue: "nope" })
  ]);

  const confirmEmail = fields.find((current) => current.label === "Confirm Email");
  const username = fields.find((current) => current.label === "Username (email)");
  const password = fields.find((current) => current.label === "Password");
  const securityQuestion = fields.find((current) => current.label === "Security question");

  assert.equal(confirmEmail?.suggestedValue, "avery@example.com");
  assert.equal(confirmEmail?.autoFillAllowed, true);
  assert.equal(username?.suggestedValue, "avery@example.com");
  assert.equal(username?.autoFillAllowed, true);

  assert.equal(password?.suggestedValue, "");
  assert.equal(password?.autoFillAllowed, false);
  assert.match(password?.reason || "", /stay manual/i);

  assert.equal(securityQuestion?.suggestedValue, "");
  assert.equal(securityQuestion?.autoFillAllowed, false);
});
