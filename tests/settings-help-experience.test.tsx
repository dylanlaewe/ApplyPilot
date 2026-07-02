import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { ApplicationsWorkspace } from "@/components/ApplicationsWorkspace";
import { SettingsWorkspace } from "@/components/SettingsWorkspace";
import { normalizeApplicationSession } from "@/lib/applicationsExperience";
import { createDefaultSettings } from "@/lib/settings";
import { ApplicationSession, DetectedField } from "@/types";

import { setupDom } from "./test-helpers";

let teardownDom: (() => void) | null = null;

function getRequestUrl(input: string | URL | Request) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function makeField(overrides: Partial<DetectedField> = {}): DetectedField {
  return {
    id: overrides.id ?? "field-1",
    label: overrides.label ?? "Why this company?",
    name: overrides.name ?? "why_company",
    domId: overrides.domId ?? "why_company",
    type: overrides.type ?? "textarea",
    selector: overrides.selector ?? "#why_company",
    detectedValue: overrides.detectedValue ?? "",
    suggestedValue: overrides.suggestedValue ?? "Because of the mission.",
    confidence: overrides.confidence ?? 0.84,
    confidenceLevel: overrides.confidenceLevel ?? "medium",
    status: overrides.status ?? "needs_review",
    reason: overrides.reason ?? "Needs your review.",
    sensitivity: overrides.sensitivity ?? "review",
    autoFillAllowed: overrides.autoFillAllowed ?? false,
    intent: overrides.intent ?? "why_interested",
    reviewCategory: overrides.reviewCategory ?? "unknown_custom",
    answerSource: overrides.answerSource ?? "generated_answer",
    verificationStatus: overrides.verificationStatus ?? "not_attempted",
    shortAnswer: overrides.shortAnswer ?? null
  };
}

function makeSession(overrides: Partial<ApplicationSession> = {}) {
  return normalizeApplicationSession({
    id: overrides.id ?? "session-1",
    company: overrides.company ?? "Acme",
    roleTitle: overrides.roleTitle ?? "Product Designer",
    jobUrl: overrides.jobUrl ?? "https://jobs.example.com/acme",
    source: overrides.source ?? "LinkedIn",
    status: overrides.status ?? "ready_for_submission",
    statusMessage: overrides.statusMessage ?? "Ready for final review.",
    nextAction: overrides.nextAction ?? "Review the page once more in the browser, then submit on the job site when you are ready.",
    applicationStatus: overrides.applicationStatus ?? "ready_to_review",
    detectedFields: overrides.detectedFields ?? [makeField()],
    notes: overrides.notes ?? "Follow up Friday",
    createdAt: overrides.createdAt ?? "2026-07-01T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-02T12:00:00.000Z",
    submittedAt: overrides.submittedAt ?? "",
    auditLog: overrides.auditLog ?? [],
    warnings: overrides.warnings ?? ["Login required before the form appears."],
    browserStatus: overrides.browserStatus ?? "open",
    atsProvider: overrides.atsProvider ?? "greenhouse",
    finalSubmitButtons: overrides.finalSubmitButtons ?? ["Submit application"],
    resumeUsed: overrides.resumeUsed ?? "resume.pdf",
    resumeDisplayLabel: overrides.resumeDisplayLabel,
    currentPageUrl: overrides.currentPageUrl ?? "https://jobs.example.com/acme",
    visitedPageUrls: overrides.visitedPageUrls ?? ["https://jobs.example.com/acme"],
    currentPageNumber: overrides.currentPageNumber ?? 1,
    timeSpentSeconds: overrides.timeSpentSeconds ?? 138,
    numberOfFieldsFilled: overrides.numberOfFieldsFilled ?? 18,
    numberOfFieldsReviewed: overrides.numberOfFieldsReviewed ?? 3,
    numberOfFieldsSkipped: overrides.numberOfFieldsSkipped ?? 0,
    fieldsDetected: overrides.fieldsDetected ?? 21,
    fieldsAttempted: overrides.fieldsAttempted ?? 18,
    fieldsFilledAndVerified: overrides.fieldsFilledAndVerified ?? 18,
    fieldsUnresolved: overrides.fieldsUnresolved ?? 3,
    fieldsFailed: overrides.fieldsFailed ?? 0,
    statusHistory: overrides.statusHistory,
    nextStep: overrides.nextStep,
    preparationSummary: overrides.preparationSummary,
    submissionConfirmationState: overrides.submissionConfirmationState,
    dogfoodTelemetry:
      overrides.dogfoodTelemetry ?? {
        sessionStartedAt: "2026-07-01T12:00:00.000Z",
        applicationFormReachedAt: "2026-07-01T12:01:00.000Z",
        initialAutofillCompletedAt: "2026-07-01T12:02:18.000Z",
        userReviewCompletedAt: "2026-07-01T12:03:00.000Z",
        readyForSubmissionAt: "2026-07-01T12:03:15.000Z",
        fieldsDetectedAtLastPass: 21,
        fieldsFilledVerifiedAtLastPass: 18,
        fieldsUnresolvedAtLastPass: 3,
        userCorrections: 1,
        manualAnswers: 3,
        autofillRetries: 1
      }
  });
}

function createSettingsView() {
  const initialSettings = createDefaultSettings();
  const initialSummary = {
    dataDirectoryPath: "/Users/dylanlaewe/ApplyPilot/data",
    profile: {
      identity: {
        fullName: "Avery Example",
        email: "avery@example.com"
      },
      resume: {
        originalFilename: "avery-resume.pdf",
        uploadedAt: "2026-07-01T12:00:00.000Z"
      }
    },
    counts: {
      savedAnswers: 9,
      applicationHistory: 4,
      behavioralStories: 2
    },
    browserDiagnostics: {
      browserConnected: true,
      openSessionCount: 1,
      openSessionIds: ["session-1"]
    }
  };

  return render(
    <SettingsWorkspace
      initialSettings={initialSettings}
      initialSummary={initialSummary}
      generatorHealth={{
        status: "deterministic_fallback_only",
        provider: "deterministic-template",
        detail: "Using the built-in grounded template generator."
      }}
      recentSessions={[makeSession()]}
    />
  );
}

beforeEach(() => {
  teardownDom = setupDom();
  globalThis.fetch = undefined as unknown as typeof fetch;
  Object.defineProperty(globalThis.URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:applypilot-test"
  });
  Object.defineProperty(globalThis.URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined
  });
});

afterEach(() => {
  teardownDom?.();
  teardownDom = null;
});

test("github actions workflow validates main pushes and pull requests", () => {
  const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8");

  assert.match(workflow, /pull_request:/i);
  assert.match(workflow, /push:/i);
  assert.match(workflow, /node-version:\s*22/i);
  assert.match(workflow, /npm ci/i);
  assert.match(workflow, /npm test/i);
  assert.match(workflow, /npm run build/i);
  assert.match(workflow, /npx tsc --noEmit/i);
  assert.match(workflow, /cancel-in-progress:\s*true/i);
});

test("settings keeps advanced diagnostics collapsed by default and only shows supported sections", () => {
  const view = createSettingsView();

  assert.match(view.container.textContent ?? "", /General/i);
  assert.match(view.container.textContent ?? "", /Application behavior/i);
  assert.match(view.container.textContent ?? "", /Answer preferences/i);
  assert.match(view.container.textContent ?? "", /Privacy and local data/i);
  assert.match(view.container.textContent ?? "", /Help/i);
  assert.match(view.container.textContent ?? "", /Advanced/i);
  assert.doesNotMatch(view.container.textContent ?? "", /Appearance|Theme/i);
  assert.doesNotMatch(view.container.textContent ?? "", /Generator health/i);
});

test("settings autosaves the browser reuse preference quietly and shows save failures clearly", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  const calls: Array<{ url: string; body?: string }> = [];

  globalThis.fetch = async (input, init) => {
    const url = getRequestUrl(input);
    calls.push({ url, body: init?.body ? String(init.body) : undefined });

    if (url === "/api/settings") {
      const body = JSON.parse(String(init?.body ?? "{}")) as ReturnType<typeof createDefaultSettings>;
      return new Response(JSON.stringify({ settings: body }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    throw new Error(`Unexpected fetch to ${url}`);
  };

  const successView = createSettingsView();
  const reuseCheckbox = successView.getByRole("checkbox", { name: /Reuse the current controlled browser window when possible/i });

  await user.click(reuseCheckbox);
  await waitFor(() => assert.equal(calls.some((call) => call.url === "/api/settings"), true), { timeout: 4000 });
  await waitFor(() => assert.match(successView.container.textContent ?? "", /Saved/i));
  assert.match(calls.find((call) => call.url === "/api/settings")?.body ?? "", /"reuseBrowserWindow":false/i);

  successView.unmount();

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Could not save settings." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });

  const failureView = createSettingsView();
  const failingCheckbox = failureView.getByRole("checkbox", { name: /Reuse the current controlled browser window when possible/i });
  await user.click(failingCheckbox);
  await waitFor(() => assert.match(failureView.container.textContent ?? "", /Could not save settings\./i), { timeout: 4000 });
});

test("privacy controls explain local storage, export local data, and confirm selective clearing", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  const calls: Array<{ url: string; method: string; body?: string }> = [];

  globalThis.fetch = async (input, init) => {
    const url = getRequestUrl(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? String(init.body) : undefined });

    if (url === "/api/local-data/export") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url === "/api/local-data/clear") {
      return new Response(
        JSON.stringify({
          summary: {
            dataDirectoryPath: "/Users/dylanlaewe/ApplyPilot/data",
            profile: {
              identity: {
                fullName: "Avery Example",
                email: "avery@example.com"
              },
              resume: {
                originalFilename: "avery-resume.pdf",
                uploadedAt: "2026-07-01T12:00:00.000Z"
              }
            },
            counts: {
              savedAnswers: 0,
              applicationHistory: 4,
              behavioralStories: 2
            },
            browserDiagnostics: {
              browserConnected: true,
              openSessionCount: 1,
              openSessionIds: ["session-1"]
            }
          },
          message: "Saved answers cleared."
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    throw new Error(`Unexpected fetch to ${method} ${url}`);
  };

  const view = createSettingsView();
  assert.match(view.container.textContent ?? "", /stores your profile, saved answers, application history, settings, and any uploaded resume in the local data folder/i);
  assert.match(view.container.textContent ?? "", /Final submission still remains fully manual/i);

  await user.click(view.getByRole("button", { name: /Export local data/i }));
  await waitFor(() => assert.match(view.container.textContent ?? "", /Local data export downloaded\./i));

  const clearSavedAnswersButton = view.getAllByRole("button", { name: /Clear saved answers/i })[0];
  await user.click(clearSavedAnswersButton);

  const dialog = view.getByRole("dialog");
  assert.match(dialog.textContent ?? "", /This removes reusable answers from your local answer bank/i);
  await user.click(within(dialog).getByRole("button", { name: /Clear saved answers/i }));

  await waitFor(() => assert.match(view.container.textContent ?? "", /Saved answers cleared\./i));
  await waitFor(() => assert.match(view.container.textContent ?? "", /Saved answers[\s\S]*0/i));
  assert.match(calls.find((call) => call.url === "/api/local-data/clear")?.body ?? "", /"action":"saved_answers"/i);
});

test("help content covers the workflow and common troubleshooting states", () => {
  const view = createSettingsView();

  assert.match(view.container.textContent ?? "", /1\. Add your profile and resume\./i);
  assert.match(view.container.textContent ?? "", /ApplyPilot never submits applications automatically\./i);
  assert.match(view.container.textContent ?? "", /Application form not detected/i);
  assert.match(view.container.textContent ?? "", /CAPTCHA visible/i);
  assert.match(view.container.textContent ?? "", /Generated answer needs editing/i);
});

test("settings keeps keyboard-friendly controls and narrow-window layout classes", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  const view = createSettingsView();

  assert.match(view.container.innerHTML, /xl:grid-cols-\[minmax\(0,1fr\)_320px\]/i);
  assert.match(view.container.innerHTML, /md:grid-cols-2/i);

  await user.tab();
  assert.ok(document.activeElement instanceof HTMLElement);
  await user.tab();
  assert.ok(document.activeElement instanceof HTMLElement);
});

test("applications detail moves diagnostics out of the normal workflow and deep-links troubleshooting", async () => {
  const view = render(
    <ApplicationsWorkspace
      initialSessions={[makeSession()]}
      currentResume={{ filename: "resume.pdf", fileExists: true }}
    />
  );

  assert.doesNotMatch(view.container.textContent ?? "", /Advanced diagnostics/i);

  const troubleshootLink = view.getByRole("link", { name: /Troubleshoot this application/i });
  assert.equal(troubleshootLink.getAttribute("href"), "/settings?session=session-1#advanced");
});
