import assert from "node:assert/strict";
import test from "node:test";

import { getWorkdayOverlayMarkup, WORKDAY_OVERLAY_ACTIONS } from "@/lib/workdayOverlay";
import {
  applyWorkdaySafeModeRules,
  beginWorkdayPass,
  buildWorkdayExecutionPlan,
  buildWorkdayFieldKey,
  completeWorkdayPass,
  executeWorkdayFillPlan,
  getWorkdaySafeModeState,
  matchExactCountryAliasOption,
  resumeWorkdaySafeMode,
  shouldUseWorkdaySafeMode,
  stopWorkdaySafeMode
} from "@/lib/workdaySafeMode";
import { DetectedField } from "@/types";

function field(overrides: Partial<DetectedField> = {}): DetectedField {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    label: "Field",
    name: "field",
    domId: "field",
    type: "text",
    selector: "#field",
    detectedValue: "",
    suggestedValue: "Avery",
    confidence: 0.95,
    confidenceLevel: "high",
    status: "needs_review",
    reason: "Matched exactly.",
    sensitivity: "safe",
    autoFillAllowed: true,
    intent: "first_name",
    reviewCategory: null,
    answerSource: "explicit_profile",
    verificationStatus: "not_attempted",
    ...overrides
  };
}

test("Workday safe mode is enabled only for Workday pages", () => {
  assert.equal(
    shouldUseWorkdaySafeMode({
      atsProvider: "workday",
      jobUrl: "https://tenant.myworkdayjobs.com/job/123",
      currentPageUrl: "https://tenant.myworkdayjobs.com/job/123"
    }),
    true
  );

  assert.equal(
    shouldUseWorkdaySafeMode({
      atsProvider: "greenhouse",
      jobUrl: "https://boards.greenhouse.io/example/jobs/123",
      currentPageUrl: "https://boards.greenhouse.io/example/jobs/123"
    }),
    false
  );
});

test("Workday safe mode only runs on a user-triggered pass and blocks concurrent passes", () => {
  const sessionId = `workday-safe-${Date.now()}`;
  resumeWorkdaySafeMode(sessionId);
  const first = beginWorkdayPass(sessionId, "page-a");
  const second = beginWorkdayPass(sessionId, "page-a");

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.reason, "Already running");

  completeWorkdayPass(sessionId, []);
  stopWorkdaySafeMode(sessionId);
  const stopped = beginWorkdayPass(sessionId, "page-a");
  assert.equal(stopped.allowed, false);
  assert.equal(stopped.reason, "Stopped");
});

test("country matching uses only exact approved aliases", () => {
  const match = matchExactCountryAliasOption(
    ["Canada", "United States", "United States Minor Outlying Islands", "United States Virgin Islands"],
    "US"
  );
  assert.equal(match?.option, "United States");

  const aliasMatch = matchExactCountryAliasOption(["USA", "United States Minor Outlying Islands"], "U.S.A.");
  assert.equal(aliasMatch?.option, "USA");

  const rejected = matchExactCountryAliasOption(
    ["United States Minor Outlying Islands", "United States Virgin Islands"],
    "United States"
  );
  assert.equal(rejected, null);
});

test("high-risk Workday fields fail closed and are not guessed", () => {
  const [country, veteran, sponsorship, workAuthorization] = applyWorkdaySafeModeRules([
    field({
      label: "Country",
      type: "select-one",
      controlType: "native_select",
      intent: "country",
      suggestedValue: "US",
      selectOptions: ["United States", "United States Minor Outlying Islands"]
    }),
    field({
      label: "Veteran status",
      type: "select-one",
      controlType: "native_select",
      intent: "eeoc_veteran",
      suggestedValue: "I am not a veteran",
      sensitivity: "sensitive",
      selectOptions: ["I AM NOT A VETERAN", "Prefer not to identify"]
    }),
    field({
      label: "Will you require sponsorship?",
      type: "select-one",
      controlType: "native_select",
      intent: "sponsorship",
      suggestedValue: "No",
      sensitivity: "sensitive",
      selectOptions: ["Yes", "No"]
    }),
    field({
      label: "Work authorization",
      type: "select-one",
      controlType: "native_select",
      intent: "work_authorization",
      suggestedValue: "Yes",
      sensitivity: "sensitive",
      selectOptions: ["Yes", "No"]
    })
  ]);

  assert.equal(country.status, "needs_review");
  assert.equal(country.suggestedValue, "");
  assert.equal(country.reason, "Needs an exact dropdown mapping");
  assert.equal(country.matchedOption, "United States");

  assert.equal(veteran.status, "sensitive");
  assert.equal(veteran.suggestedValue, "");
  assert.equal(veteran.reason, "Sensitive question requires your review");

  assert.equal(sponsorship.status, "sensitive");
  assert.equal(sponsorship.suggestedValue, "");

  assert.equal(workAuthorization.status, "sensitive");
  assert.equal(workAuthorization.suggestedValue, "");
});

test("repeatable sections stay manual only when Workday cannot safely map the visible entry", () => {
  const [resume, education, experience, degree] = applyWorkdaySafeModeRules([
    field({ intent: "resume_upload", type: "file", suggestedValue: "/tmp/resume.pdf" }),
    field({ intent: "education_school", label: "School", suggestedValue: "" }),
    field({ intent: "employer", label: "Company", suggestedValue: "" }),
    field({
      intent: "education_degree",
      label: "Degree",
      type: "button",
      controlType: "menu_button",
      role: "button",
      suggestedValue: "Bachelor of Science",
      matchedOption: "Bachelor of Science",
      selectOptions: ["Associate Degree", "Bachelor of Science", "Master of Science"]
    })
  ]);

  assert.equal(resume.reason, "Resume upload needs verification");
  assert.equal(education.reason, "This section requires manual setup");
  assert.equal(experience.reason, "This section requires manual setup");
  assert.match(degree.reason, /Safe to autofill on this Workday page/i);
  assert.equal(degree.status, "needs_review");
});

test("visible repeatable text fields can stay eligible when ApplyPilot has an exact saved value", () => {
  const [school, employer, title] = applyWorkdaySafeModeRules([
    field({ intent: "education_school", label: "School", suggestedValue: "Commonwealth State University" }),
    field({ intent: "employer", label: "Company", suggestedValue: "Benchmark Systems" }),
    field({ intent: "job_title", label: "Job Title", suggestedValue: "Software Engineer" })
  ]);

  for (const current of [school, employer, title]) {
    assert.equal(current.status, "needs_review");
    assert.match(current.reason, /Safe to autofill on this Workday page/i);
  }
});

test("basic deterministic Workday text fields stay eligible for one safe pass", () => {
  const [address, city, state, postalCode, country] = applyWorkdaySafeModeRules([
    field({ intent: "street_address", label: "Street address", suggestedValue: "123 Main St" }),
    field({ intent: "city", label: "City", suggestedValue: "Boston" }),
    field({ intent: "state", label: "State", suggestedValue: "MA" }),
    field({ intent: "postal_code", label: "Postal code", suggestedValue: "02118" }),
    field({ intent: "country", label: "Country", suggestedValue: "United States" })
  ]);

  for (const current of [address, city, state, postalCode, country]) {
    assert.equal(current.status, "needs_review");
    assert.match(current.reason, /Safe to autofill on this Workday page/i);
  }
});

test("Workday execution plan runs top-to-bottom, scrolls once per section, and never retries a verified control", async () => {
  const first = field({ id: "first", label: "First name", selector: "#first", intent: "first_name" });
  const second = field({ id: "second", label: "Email", selector: "#email", intent: "email" });
  const third = field({ id: "third", label: "Website", selector: "#site", intent: "website", suggestedValue: "https://example.com" });

  const plan = buildWorkdayExecutionPlan(
    [first, second, third],
    [
      { fieldId: "third", top: 300, bottom: 340, inViewport: false, sectionKey: "contact" },
      { fieldId: "first", top: 100, bottom: 140, inViewport: true, sectionKey: "contact" },
      { fieldId: "second", top: 200, bottom: 240, inViewport: false, sectionKey: "contact" }
    ]
  );

  assert.deepEqual(
    plan.map((item) => item.field.id),
    ["first", "second", "third"]
  );

  const attempts = new Map<string, number>();
  const order: string[] = [];
  const scrolls: string[] = [];
  const verified = new Set<string>([buildWorkdayFieldKey(first)]);

  const result = await executeWorkdayFillPlan({
    plan,
    isAlreadyVerified: (fieldKey) => verified.has(fieldKey),
    getLatestMetrics: async (current) => {
      const metric = plan.find((item) => item.field.id === current.id);
      return {
        top: metric?.top ?? 0,
        inViewport: current.id === "first",
        sectionKey: "contact"
      };
    },
    scrollToField: async (current) => {
      scrolls.push(current.id);
    },
    fillOneField: async (current) => {
      order.push(current.id);
      attempts.set(current.id, (attempts.get(current.id) ?? 0) + 1);
      verified.add(buildWorkdayFieldKey(current));
      return true;
    }
  });

  assert.deepEqual(order, ["second", "third"]);
  assert.equal(attempts.get("second"), 1);
  assert.equal(attempts.get("third"), 1);
  assert.deepEqual(scrolls, ["second"]);
  assert.equal(result.skippedVerifiedCount, 1);
  assert.equal(result.completedCount, 2);
});

test("overlay exposes only restrained actions with keyboard-friendly markup", () => {
  assert.deepEqual(WORKDAY_OVERLAY_ACTIONS, [
    "Fill this page",
    "Review unresolved",
    "Upload resume",
    "Report a wrong answer",
    "Stop ApplyPilot"
  ]);

  const markup = getWorkdayOverlayMarkup();
  assert.match(markup, /summary aria-label="ApplyPilot controls"/i);
  assert.match(markup, /aria-live="polite"/i);
  assert.match(markup, /focus-visible/i);
  assert.doesNotMatch(markup, />Next</i);
  assert.doesNotMatch(markup, />Continue</i);
  assert.doesNotMatch(markup, />Submit</i);
  assert.doesNotMatch(markup, />Save and Continue</i);
});

test("verified Workday fields are left alone on the same page", () => {
  const sessionId = `workday-verified-${Date.now()}`;
  const state = getWorkdaySafeModeState(sessionId);
  state.pageIdentity = "page-a";
  state.verifiedFieldKeys = new Set([buildWorkdayFieldKey(field({ id: "verified-field", label: "First name" }))]);

  const [verifiedField] = applyWorkdaySafeModeRules(
    [field({ id: "verified-field", label: "First name" })],
    { verifiedFieldKeys: state.verifiedFieldKeys }
  );

  assert.equal(verifiedField.status, "filled");
  assert.equal(verifiedField.verificationStatus, "verified");
  assert.equal(verifiedField.reason, "Already verified on this page.");
});
