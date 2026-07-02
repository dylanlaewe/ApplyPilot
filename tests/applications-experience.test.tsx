import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { ApplicationsWorkspace } from "@/components/ApplicationsWorkspace";
import { applyUserFacingStatus, normalizeApplicationSession } from "@/lib/applicationsExperience";
import { ApplicationSession, DetectedField, DogfoodReport } from "@/types";

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
    applicationStatus: overrides.applicationStatus,
    detectedFields: overrides.detectedFields ?? [makeField()],
    notes: overrides.notes ?? "Follow up with recruiter Friday",
    createdAt: overrides.createdAt ?? "2026-07-01T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-02T12:00:00.000Z",
    submittedAt: overrides.submittedAt ?? "",
    auditLog: overrides.auditLog ?? [],
    warnings: overrides.warnings ?? [],
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

function makeDogfoodReport(overrides: Partial<DogfoodReport> = {}): DogfoodReport {
  return {
    generatedAt: "2026-07-02T14:00:00.000Z",
    applicationsPrepared: 3,
    medianPreparationTimeSeconds: 138,
    averageAutomaticCompletionRate: 82.4,
    averageUserInputFields: 2.3,
    averageCorrections: 1,
    retryCount: 2,
    severeCorrections: 1,
    applicationsByAts: [
      { atsProvider: "greenhouse", count: 2 },
      { atsProvider: "lever", count: 1 },
      { atsProvider: "ashby", count: 0 },
      { atsProvider: "workable", count: 0 },
      { atsProvider: "workday", count: 0 },
      { atsProvider: "generic", count: 0 }
    ],
    shortAnswersInserted: 4,
    shortAnswersEdited: 1,
    shortAnswersAcceptedUnchanged: 3,
    finalStates: [
      { status: "in_progress", count: 1 },
      { status: "ready_to_review", count: 1 },
      { status: "submitted", count: 1 },
      { status: "interview", count: 0 },
      { status: "offer", count: 0 },
      { status: "rejected", count: 0 },
      { status: "archived", count: 0 }
    ],
    ...overrides
  };
}

function installSessionFetchMock(initialSessions: ApplicationSession[]) {
  let sessions = initialSessions.map((session) => normalizeApplicationSession(session));
  const calls: Array<{ url: string; method: string; body?: string }> = [];

  globalThis.fetch = async (input, init) => {
    const url = getRequestUrl(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? String(init.body) : undefined });

    const sessionId = url.match(/\/api\/sessions\/([^/]+)/)?.[1];
    const target = sessionId ? sessions.find((session) => session.id === sessionId) ?? null : null;

    if (method === "PATCH" && target && url === `/api/sessions/${sessionId}`) {
      const body = JSON.parse(String(init?.body ?? "{}")) as Partial<ApplicationSession> & {
        applicationStatus?: ApplicationSession["applicationStatus"];
        submissionConfirmationState?: ApplicationSession["submissionConfirmationState"];
      };
      let updated = target;
      let message = "Saved.";
      if (body.applicationStatus) {
        updated = normalizeApplicationSession(applyUserFacingStatus(updated, body.applicationStatus));
        message =
          body.applicationStatus === "archived"
            ? "Application archived."
            : `Status updated to ${String(body.applicationStatus).replaceAll("_", " ")}.`;
      }
      updated = normalizeApplicationSession({
        ...updated,
        notes: body.notes ?? updated.notes,
        nextStep: body.nextStep !== undefined ? body.nextStep : updated.nextStep,
        submissionConfirmationState: body.submissionConfirmationState ?? updated.submissionConfirmationState
      });
      sessions = sessions.map((session) => (session.id === updated.id ? updated : session));
      return new Response(JSON.stringify({ session: updated, message }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (method === "POST" && target && url === `/api/sessions/${sessionId}/mark-submitted`) {
      const updated = normalizeApplicationSession(
        applyUserFacingStatus(
          {
            ...target,
            status: "submitted",
            statusMessage: "Submitted manually.",
            nextAction: "Track the outcome or archive the record when you are ready.",
            submittedAt: target.submittedAt || "2026-07-02T13:00:00.000Z"
          },
          "submitted",
          target.submittedAt || "2026-07-02T13:00:00.000Z"
        )
      );
      sessions = sessions.map((session) => (session.id === updated.id ? updated : session));
      return new Response(JSON.stringify({ session: updated, message: "Session marked submitted." }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (method === "DELETE" && target && url === `/api/sessions/${sessionId}`) {
      sessions = sessions.filter((session) => session.id !== target.id);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    throw new Error(`Unexpected fetch to ${method} ${url}`);
  };

  return {
    getCalls: () => calls,
    getSessions: () => sessions
  };
}

beforeEach(() => {
  teardownDom = setupDom();
});

afterEach(() => {
  teardownDom?.();
  teardownDom = null;
});

test("applications shows a useful empty state", () => {
  const view = render(
    <ApplicationsWorkspace initialSessions={[]} currentResume={{ filename: "", fileExists: false }} initialDogfoodReport={makeDogfoodReport()} />
  );

  assert.match(view.container.textContent ?? "", /No applications yet/i);
  assert.match(view.container.textContent ?? "", /Start an application and it will appear here automatically\./i);
});

test("application list supports rendering, search, filtering, sorting, missing resume handling, and a clean detail view", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  const sessions = [
    makeSession({
      id: "session-1",
      company: "Acme",
      roleTitle: "Product Designer",
      status: "in_progress",
      applicationStatus: "in_progress",
      notes: "Portfolio sent",
      resumeUsed: "portfolio-resume.pdf",
      jobUrl: ""
    }),
    makeSession({
      id: "session-2",
      company: "Beacon",
      roleTitle: "Design Systems Lead",
      status: "ready_for_submission",
      applicationStatus: "ready_to_review",
      notes: "Needs final review"
    }),
    makeSession({
      id: "session-3",
      company: "Coda",
      roleTitle: "Product Designer",
      status: "submitted",
      applicationStatus: "submitted",
      submittedAt: "2026-07-02T13:00:00.000Z",
      notes: "Submitted last night"
    })
  ];

  const firstView = render(
    <ApplicationsWorkspace
      initialSessions={sessions}
      currentResume={{ filename: "resume.pdf", fileExists: true }}
      initialDogfoodReport={makeDogfoodReport()}
    />
  );

  const searchInput = document.getElementById("applications-search") as HTMLInputElement;
  await user.type(searchInput, "Beacon");
  await waitFor(() => assert.equal(screenListItems().length, 1));
  assert.match(firstView.container.textContent ?? "", /Design Systems Lead/i);

  firstView.unmount();

  render(
    <ApplicationsWorkspace
      initialSessions={sessions}
      currentResume={{ filename: "resume.pdf", fileExists: true }}
      initialDogfoodReport={makeDogfoodReport()}
    />
  );

  await user.selectOptions(document.getElementById("status-filter") as HTMLSelectElement, "submitted");
  await waitFor(() => assert.equal(screenListItems().length, 1));
  assert.match(screenListItems()[0].textContent ?? "", /Coda/i);

  await user.selectOptions(document.getElementById("status-filter") as HTMLSelectElement, "all");
  await user.selectOptions(document.getElementById("sort-control") as HTMLSelectElement, "company");
  const listItems = screenListItems();
  assert.match(listItems[0].textContent ?? "", /Acme/i);

  await user.click(within(listItems[0]).getAllByRole("button")[0]);
  await waitFor(() => assert.match(document.body.textContent ?? "", /Resume file no longer available/i));
  assert.match(document.body.textContent ?? "", /Source URL unavailable/i);
  assert.match(document.body.textContent ?? "", /18 fields completed/i);
  assert.doesNotMatch(document.body.textContent ?? "", /#why_company/i);
  assert.doesNotMatch(document.body.textContent ?? "", /confidence/i);
  assert.match((document.querySelector("[data-testid='applications-layout']") as HTMLElement).className, /xl:grid-cols/i);
});

test("applications supports status updates, submitted confirmation, notes saving, next-step saving, and keyboard navigation", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  const mock = installSessionFetchMock([
    makeSession({
      id: "session-1",
      company: "Beacon",
      roleTitle: "Design Systems Lead",
      status: "ready_for_submission",
      applicationStatus: "ready_to_review",
      submissionConfirmationState: "unknown"
    })
  ]);

  const view = render(
    <ApplicationsWorkspace
      initialSessions={mock.getSessions()}
      currentResume={{ filename: "resume.pdf", fileExists: true }}
      initialDogfoodReport={makeDogfoodReport()}
    />
  );

  await user.tab();
  assert.equal((document.activeElement as HTMLElement).textContent, "Applications");
  await user.tab();
  assert.equal((document.activeElement as HTMLElement).textContent, "Insights");
  await user.tab();
  assert.match((document.activeElement as HTMLElement).textContent ?? "", /Start an application/i);

  assert.match(view.container.textContent ?? "", /Did you submit this application\?/i);
  await user.click(view.getByRole("button", { name: /Not yet/i }));
  await waitFor(() => assert.match(view.container.textContent ?? "", /keep this application in progress/i));

  await user.selectOptions(view.getByLabelText(/Current status/i), "interview");
  await waitFor(() => assert.match(view.container.textContent ?? "", /Status updated to interview\./i));

  const notes = view.getByLabelText(/Notes/i);
  await user.clear(notes);
  await user.type(notes, "Interview scheduled");
  await user.type(view.getByLabelText(/Description/i), "Send portfolio deck");
  await user.type(view.getByLabelText(/Due date/i), "2026-07-08");
  await user.click(view.getByRole("button", { name: /Save changes/i }));

  await waitFor(() => assert.match(view.container.textContent ?? "", /Saved/));
  const patchBodies = mock
    .getCalls()
    .filter((call) => call.method === "PATCH" && call.body)
    .map((call) => call.body ?? "");
  assert.equal(patchBodies.some((body) => body.includes("Interview scheduled")), true);
  assert.equal(patchBodies.some((body) => body.includes("Send portfolio deck")), true);
});

test("applications supports archive and delete with accessible confirmation dialogs", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  installSessionFetchMock([
    makeSession({ id: "session-1", company: "Acme", applicationStatus: "in_progress", status: "in_progress" }),
    makeSession({ id: "session-2", company: "Beacon", applicationStatus: "submitted", status: "submitted", submittedAt: "2026-07-02T13:00:00.000Z" })
  ]);

  const view = render(
    <ApplicationsWorkspace
      initialSessions={[
        makeSession({ id: "session-1", company: "Acme", applicationStatus: "in_progress", status: "in_progress" }),
        makeSession({ id: "session-2", company: "Beacon", applicationStatus: "submitted", status: "submitted", submittedAt: "2026-07-02T13:00:00.000Z" })
      ]}
      currentResume={{ filename: "resume.pdf", fileExists: true }}
      initialDogfoodReport={makeDogfoodReport()}
    />
  );

  const firstMenu = view.container.querySelector("article details summary") as HTMLElement;
  await user.click(firstMenu);
  await user.click(within(screenListItems()[0]).getAllByRole("button", { name: /Archive/i })[0]);
  const archiveDialog = view.getByRole("dialog");
  assert.match(archiveDialog.textContent ?? "", /Archived applications are hidden from the default view/i);
  assert.equal(within(archiveDialog).getByRole("button", { name: /Cancel/i }), document.activeElement);
  await user.click(within(archiveDialog).getByRole("button", { name: /Archive application/i }));
  await waitFor(() => assert.match(view.container.textContent ?? "", /Application archived\./i));

  await user.selectOptions(view.getByLabelText(/Current status/i), "archived");
  await waitFor(() => assert.match(view.container.textContent ?? "", /Archived/i));

  const detailsMenus = view.container.querySelectorAll("article details summary");
  await user.click(detailsMenus[1] as HTMLElement);
  await user.click(within(screenListItems()[1]).getAllByRole("button", { name: /^Delete$/i })[0]);
  const deleteDialog = view.getByRole("dialog");
  assert.match(deleteDialog.textContent ?? "", /It does not remove your applicant profile, saved answers, or resume files/i);
  await user.click(within(deleteDialog).getByRole("button", { name: /Delete application/i }));
  await waitFor(() => assert.doesNotMatch(view.container.textContent ?? "", /Beacon/i));
});

test("insights shows counts, rates, and small-sample guidance", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  const view = render(
    <ApplicationsWorkspace
      initialSessions={[
        makeSession({ id: "session-1", applicationStatus: "submitted", status: "submitted", submittedAt: "2026-07-02T13:00:00.000Z" }),
        makeSession({ id: "session-2", applicationStatus: "interview", status: "interview", submittedAt: "2026-07-03T13:00:00.000Z" }),
        makeSession({ id: "session-3", applicationStatus: "offer", status: "offer", submittedAt: "2026-07-04T13:00:00.000Z" })
      ]}
      currentResume={{ filename: "resume.pdf", fileExists: true }}
      initialDogfoodReport={makeDogfoodReport()}
    />
  );

  await user.click(view.getByRole("button", { name: /Insights/i }));
  await waitFor(() => assert.match(view.container.textContent ?? "", /Response rate:/i));
  assert.match(view.container.textContent ?? "", /Based on a small sample/i);
  assert.match(view.container.textContent ?? "", /Applications by status/i);
  assert.match(view.container.textContent ?? "", /Dogfood report/i);
  assert.match(view.container.textContent ?? "", /Export JSON/i);
});

function screenListItems() {
  return Array.from(document.querySelectorAll("[role='listitem']")) as HTMLElement[];
}
