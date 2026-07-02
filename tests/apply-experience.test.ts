import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppShellFrame } from "@/components/AppShellFrame";
import { ApplicationSessionPanel } from "@/components/ApplicationSessionPanel";
import { ApplyWorkspaceView } from "@/components/ApplyWorkspaceView";
import { ReviewStepper } from "@/components/ReviewStepper";
import { buildApplyReadinessReport } from "@/lib/applyReadiness";
import {
  getApplyMode,
  getReviewFieldCount,
  getSessionProgress,
  getSessionStateTone,
  hasResumeOnFile,
  primaryNavigation,
  validateJobUrl
} from "@/lib/applyExperience";
import { createDefaultProfile } from "@/lib/profile";
import { ApplicationSession, ApplyReadinessEnvironment, DetectedField } from "@/types";

const readyEnvironment: ApplyReadinessEnvironment = {
  browserAutomationAvailable: true,
  browserAutomationDetail: "Chromium is installed locally and ready for controlled application sessions.",
  localStorageWritable: true,
  localStorageDetail: "ApplyPilot can write to its local data folder on this device.",
  generatorHealth: {
    status: "deterministic_fallback_only",
    provider: "deterministic-template",
    detail: "Using the built-in grounded template generator."
  }
};

function makeField(overrides: Partial<DetectedField> = {}): DetectedField {
  return {
    id: "field-1",
    label: "Tell us about yourself",
    name: "about",
    domId: "about",
    type: "textarea",
    selector: "#about",
    detectedValue: "",
    suggestedValue: "I build reliable products and enjoy solving ambiguous workflow problems.",
    confidence: 0.82,
    confidenceLevel: "medium",
    status: "needs_review",
    reason: "This answer matches a saved response but still benefits from a quick review.",
    sensitivity: "review",
    autoFillAllowed: true,
    intent: "tell_us_about_yourself",
    reviewCategory: "unknown_custom",
    answerSource: "answer_bank",
    verificationStatus: "not_attempted",
    shortAnswer: null,
    ...overrides
  };
}

function makeSession(overrides: Partial<ApplicationSession> = {}): ApplicationSession {
  const now = "2026-07-01T12:00:00.000Z";
  const defaultField = makeField();

  return {
    id: "session-1",
    company: "Dataiku",
    roleTitle: "Fullstack Software Engineer",
    jobUrl: "https://example.com/apply",
    source: "",
    status: "needs_review",
    statusMessage: "A few answers still need you.",
    nextAction: "Review the remaining questions before you continue in the browser.",
    detectedFields: [defaultField],
    notes: "",
    createdAt: now,
    updatedAt: now,
    auditLog: [],
    warnings: [],
    browserStatus: "open",
    atsProvider: "greenhouse",
    finalSubmitButtons: ["Submit Application"],
    resumeUsed: "resume.pdf",
    currentPageUrl: "https://example.com/apply",
    visitedPageUrls: ["https://example.com/apply"],
    currentPageNumber: 1,
    timeSpentSeconds: 90,
    numberOfFieldsFilled: 2,
    numberOfFieldsReviewed: 1,
    numberOfFieldsSkipped: 0,
    fieldsDetected: 3,
    fieldsAttempted: 2,
    fieldsFilledAndVerified: 2,
    fieldsUnresolved: 1,
    fieldsFailed: 0,
    ...overrides
  };
}

function renderApplyView(props: Partial<Parameters<typeof ApplyWorkspaceView>[0]> = {}) {
  const session = props.session ?? null;
  return renderToStaticMarkup(
    createElement(ApplyWorkspaceView, {
      mode: props.mode ?? "initial",
      hasResume: props.hasResume ?? true,
      resumeName: props.resumeName ?? "resume.pdf",
      readinessReport:
        props.readinessReport ??
        buildApplyReadinessReport({
          profile: createDefaultProfile(),
          applicationUrl: props.url ?? "https://jobs.example.com/apply",
          environment: readyEnvironment
        }),
      url: props.url ?? "",
      error: props.error ?? null,
      disabled: props.disabled ?? false,
      resumeBusy: props.resumeBusy ?? false,
      startLabel: props.startLabel ?? "Start application",
      session,
      progressItems: props.progressItems ?? getSessionProgress(session),
      stateTone: props.stateTone ?? getSessionStateTone(session),
      reviewCount: props.reviewCount ?? getReviewFieldCount(session),
      recentSessions: props.recentSessions ?? [],
      sessionPanel: props.sessionPanel,
      onUrlChange: props.onUrlChange ?? (() => {}),
      onResumeUpload: props.onResumeUpload ?? (() => {}),
      onStart: props.onStart ?? (() => {})
    })
  );
}

test("Apply starts with a minimal initial state", () => {
  const html = renderApplyView();
  assert.match(html, /Start a job application without giving up control/i);
  assert.match(html, /Paste a job application link/i);
  assert.match(html, /Start application/i);
});

test("Apply shows a blocked missing-resume state until a resume exists", () => {
  const profile = createDefaultProfile();
  assert.equal(hasResumeOnFile(profile), false);

  const html = renderApplyView({
    mode: getApplyMode(null, false),
    hasResume: false,
    readinessReport: buildApplyReadinessReport({
      profile,
      applicationUrl: "",
      environment: readyEnvironment
    }),
    startLabel: "Upload resume to start"
  });

  assert.match(html, /Add your resume before you start applying/i);
  assert.match(html, /Upload resume/i);
  assert.match(html, /Resume required/i);
});

test("invalid application URLs are rejected before a session is created", () => {
  assert.equal(validateJobUrl("not a url"), "Enter a valid job application link.");
  assert.equal(validateJobUrl("ftp://example.com/apply"), "Use a full http or https link.");
  assert.equal(validateJobUrl("https://jobs.example.com/apply"), null);
});

test("active progress copy reflects opening, reading, and finishing stages", () => {
  const opening = getSessionProgress(makeSession({ status: "opening_browser" }));
  const scanning = getSessionProgress(makeSession({ status: "scanning" }));
  const finishing = getSessionProgress(makeSession({ status: "verifying" }));

  assert.deepEqual(opening.map((item) => item.state), ["current", "upcoming", "upcoming", "upcoming"]);
  assert.deepEqual(scanning.map((item) => item.state), ["complete", "current", "upcoming", "upcoming"]);
  assert.deepEqual(finishing.map((item) => item.state), ["complete", "complete", "current", "upcoming"]);
});

test("needs-input sessions render a sequential review flow", () => {
  const session = makeSession({
    detectedFields: [makeField({ id: "field-1" }), makeField({ id: "field-2", label: "Why this company?" })]
  });
  const html = renderToStaticMarkup(createElement(ApplicationSessionPanel, { initialSession: session }));

  assert.match(html, /Question 1 of 2/i);
  assert.match(html, /Use this answer/i);
  assert.match(html, /Edit answer/i);
  assert.match(html, /Skip for now/i);
});

test("review flow exposes editable suggested answers", () => {
  const html = renderToStaticMarkup(
    createElement(ReviewStepper, {
      fields: [makeField({ suggestedValue: "A".repeat(160) })],
      onApprove: async () => {},
      onSkip: async () => {},
      onSaveAnswer: async () => {},
      onReportWrongAnswer: async () => {}
    })
  );

  assert.match(html, /Suggested answer/i);
  assert.match(html, /textarea/i);
});

test("readiness marks missing optional details as recommended and browser issues as required", () => {
  const profile = createDefaultProfile();
  profile.identity.firstName = "Avery";
  profile.identity.lastName = "Example";
  profile.identity.email = "avery@example.com";
  profile.identity.phone = "781-555-0101";
  profile.phone = "781-555-0101";
  profile.identity.city = "Boston";
  profile.identity.stateProvince = "MA";
  profile.resume.originalFilename = "resume.pdf";
  profile.resume.storedPath = "/tmp/resume.pdf";
  profile.resume.fileExists = true;

  const recommended = buildApplyReadinessReport({
    profile,
    applicationUrl: "https://jobs.example.com/apply",
    environment: readyEnvironment
  });
  assert.equal(recommended.canStart, true);
  assert.equal(recommended.items.some((item) => item.label === "Experience or education recommended"), true);
  assert.equal(recommended.items.some((item) => item.label === "Answer drafts recommended"), true);

  const blocked = buildApplyReadinessReport({
    profile,
    applicationUrl: "not a url",
    environment: {
      ...readyEnvironment,
      browserAutomationAvailable: false,
      browserAutomationDetail: "Playwright Chromium is not available locally."
    }
  });
  assert.equal(blocked.canStart, false);
  assert.equal(blocked.items.some((item) => item.label === "Browser automation required"), true);
  assert.equal(blocked.items.some((item) => item.label === "Application link required"), true);
});

test("ready state clearly tells the user to do the final review themselves", () => {
  const readySession = makeSession({
    status: "ready_for_submission",
    statusMessage: "Ready for final review.",
    nextAction: "Review the page in the browser and submit on the job site when you are ready.",
    detectedFields: [makeField({ status: "filled", suggestedValue: "Avery", label: "First name", reason: "Matched exactly." })],
    fieldsUnresolved: 0,
    preparationSummary: {
      durationSeconds: 138,
      fieldsCompleted: 1,
      questionsAnsweredByUser: 0,
      suggestedAnswersUsed: 1,
      correctionsMade: 0,
      retryCount: 0
    }
  });
  const html = renderToStaticMarkup(createElement(ApplicationSessionPanel, { initialSession: readySession }));

  assert.match(html, /Ready for final review/i);
  assert.match(html, /Mark as submitted/i);
  assert.match(html, /ApplyPilot has done everything safe it can do on this page/i);
  assert.match(html, /Dogfood summary/i);
  assert.match(html, /Prepared in/i);
});

test("error and recovery states expose human recovery guidance", () => {
  const failedHtml = renderToStaticMarkup(
    createElement(ApplicationSessionPanel, {
      initialSession: makeSession({
        status: "failed",
        statusMessage: "Unable to continue.",
        nextAction: "Review the issue, fix anything needed in the browser, and try again when you are ready.",
        lastError: "The page took too long to respond. Try again or review the page manually."
      })
    })
  );
  assert.match(failedHtml, /Try again/i);
  assert.match(failedHtml, /The page took too long to respond/i);

  const captchaHtml = renderToStaticMarkup(
    createElement(ApplicationSessionPanel, {
      initialSession: makeSession({
        status: "waiting_for_user",
        statusMessage: "The application form is not visible yet.",
        nextAction: "A verification step may need to be completed in the browser. Finish it, then try this page again.",
        captchaDetection: {
          status: "confirmed_visible_challenge",
          blocking: true,
          userMessage: "Verification required",
          evidence: []
        }
      })
    })
  );

  assert.match(captchaHtml, /I finished the verification step/i);
  assert.match(captchaHtml, /Continue once without waiting/i);
});

test("overflow actions stay available without putting diagnostics in primary navigation", () => {
  const html = renderToStaticMarkup(createElement(ApplicationSessionPanel, { initialSession: makeSession() }));
  assert.match(html, /More actions/i);
  assert.match(html, /Open application window/i);
  assert.match(html, /Mark as submitted/i);

  assert.deepEqual(primaryNavigation.map((item) => item.label), ["Apply", "Applications", "Profile", "Settings"]);
  assert.equal(primaryNavigation.some((item) => /diagnostic/i.test(item.label)), false);
});

test("primary navigation remains keyboard-friendly and responsive", () => {
  const html = renderToStaticMarkup(createElement(AppShellFrame, { pathname: "/" }, createElement("div", null, "Body")));
  assert.match(html, /aria-label="Primary"/i);
  assert.match(html, /focus-visible:ring-2/i);
  assert.match(html, /flex-wrap/i);
});

test("readiness panel keeps its narrow-window layout and keyboard-friendly disclosure", () => {
  const html = renderApplyView();
  assert.match(html, /View readiness details/i);
  assert.match(html, /Readiness/i);
  assert.match(html, /xl:grid-cols-\[minmax\(0,1fr\)_320px\]/i);
});
