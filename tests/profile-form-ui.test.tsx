import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { ProfileForm } from "@/components/ProfileForm";
import { createDefaultProfile, normalizeProfile } from "@/lib/profile";
import { ApplicantProfile } from "@/types";

import { setupDom, wait } from "./test-helpers";

let teardownDom: (() => void) | null = null;

function getRequestUrl(input: string | URL | Request) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function createProfile(overrides: Partial<ApplicantProfile> = {}) {
  const base = createDefaultProfile();
  return normalizeProfile({
    ...base,
    identity: {
      ...base.identity,
      firstName: "Avery",
      lastName: "Example",
      fullName: "Avery Example",
      email: "avery@example.com",
      phoneCountryCode: "+1",
      phoneNationalNumber: "7815550101",
      linkedin: "https://linkedin.com/in/avery-example",
      github: "https://github.com/avery-example",
      ...overrides.identity
    },
    experience: overrides.experience ?? base.experience,
    education: overrides.education ?? base.education,
    stories: overrides.stories ?? base.stories,
    resume:
      overrides.resume ??
      ({
        originalFilename: "",
        storedPath: "",
        mimeType: "",
        fileSize: 0,
        uploadedAt: "",
        fileExists: false
      } satisfies ApplicantProfile["resume"]),
    ...overrides
  } as ApplicantProfile);
}

beforeEach(() => {
  teardownDom = setupDom();
  globalThis.fetch = undefined as unknown as typeof fetch;
  globalThis.confirm = () => true;
  window.confirm = () => true;
});

afterEach(() => {
  teardownDom?.();
  teardownDom = null;
});

test("profile shows a clear missing-resume state and never exposes a local path", async () => {
  const profile = createProfile({
    resume: {
      originalFilename: "",
      storedPath: "",
      mimeType: "application/pdf",
      fileSize: 1000,
      uploadedAt: "",
      fileExists: false
    }
  });

  const { container, rerender } = render(<ProfileForm initialProfile={profile} />);
  assert.match(container.textContent ?? "", /No resume selected yet/i);
  assert.match(container.textContent ?? "", /Upload resume/i);
  assert.doesNotMatch(container.textContent ?? "", /Users\//i);

  rerender(
    <ProfileForm
      initialProfile={createProfile({
        resume: {
          originalFilename: "avery-resume.pdf",
          storedPath: "/Users/example/Documents/private-resume.pdf",
          mimeType: "application/pdf",
          fileSize: 2048,
          uploadedAt: "2026-07-01T12:00:00.000Z",
          fileExists: true
        }
      })}
    />
  );

  assert.match(container.textContent ?? "", /avery-resume\.pdf/i);
  assert.doesNotMatch(container.textContent ?? "", /Users\//i);
});

test("resume upload and replacement update the displayed filename only", async () => {
  const fetchCalls: string[] = [];
  let uploadCount = 0;
  globalThis.fetch = async (input) => {
    const url = getRequestUrl(input);
    fetchCalls.push(url);
    if (url === "/api/profile/resume") {
      uploadCount += 1;
      return new Response(
        JSON.stringify({
          profile: createProfile({
            resume: {
              originalFilename: uploadCount === 1 ? "avery-resume.pdf" : "avery-resume-v2.docx",
              storedPath: `/tmp/${uploadCount === 1 ? "avery-resume.pdf" : "avery-resume-v2.docx"}`,
              mimeType: uploadCount === 1 ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              fileSize: 4096,
              uploadedAt: "2026-07-01T13:00:00.000Z",
              fileExists: true
            }
          })
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unexpected fetch to ${url}`);
  };

  const { container } = render(<ProfileForm initialProfile={createProfile()} />);
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

  fireEvent.change(fileInput, {
    target: {
      files: [new File(["resume"], "avery-resume.pdf", { type: "application/pdf" })]
    }
  });

  await waitFor(() => assert.match(container.textContent ?? "", /avery-resume\.pdf/i));

  fireEvent.change(fileInput, {
    target: {
      files: [new File(["resume-v2"], "avery-resume-v2.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })]
    }
  });

  await waitFor(() => assert.match(container.textContent ?? "", /avery-resume-v2\.docx/i));
  assert.equal(fetchCalls.filter((url) => url === "/api/profile/resume").length, 2);
  assert.doesNotMatch(container.textContent ?? "", /\/tmp\//i);
});

test("profile autosaves quietly and shows a saved state", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  const calls: Array<{ url: string; body?: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = getRequestUrl(input);
    calls.push({ url, body: init?.body as string | undefined });

    if (url === "/api/profile") {
      const body = JSON.parse(String(init?.body ?? "{}")) as ApplicantProfile;
      return new Response(JSON.stringify({ profile: normalizeProfile(body) }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    throw new Error(`Unexpected fetch to ${url}`);
  };

  const { container } = render(<ProfileForm initialProfile={createProfile()} />);
  const firstNameInput = container.querySelector('input[value="Avery"]') as HTMLInputElement;

  await user.clear(firstNameInput);
  await user.type(firstNameInput, "Averylyn");

  await waitFor(() => assert.equal(calls.some((call) => call.url === "/api/profile"), true), { timeout: 5000 });
  await waitFor(() => assert.match(container.textContent ?? "", /Saved locally/i));
  assert.match(calls.find((call) => call.url === "/api/profile")?.body ?? "", /Averylyn/);
});

test("save failures show a clear error", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Disk is full." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });

  const { container } = render(<ProfileForm initialProfile={createProfile()} />);
  const firstNameInput = container.querySelector('input[value="Avery"]') as HTMLInputElement;

  await user.clear(firstNameInput);
  await user.type(firstNameInput, "Averylyn");

  await waitFor(() => assert.match(container.textContent ?? "", /Disk is full\./i), { timeout: 5000 });
});

test("employment and education entries can be added and removed with confirmation", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  const view = render(<ProfileForm initialProfile={createProfile()} />);
  const sections = Array.from(view.container.querySelectorAll("section"));
  const employmentSection = sections.find((section) => section.textContent?.includes("Add employment entry")) as HTMLElement;
  const educationSection = sections.find((section) => section.textContent?.includes("Add education entry")) as HTMLElement;
  await user.click(within(employmentSection).getByRole("button", { name: /Add employment entry/i }));
  assert.equal(within(employmentSection).getAllByRole("button", { name: /Remove/i }).length, 2);

  await user.click(within(educationSection).getByRole("button", { name: /Add education entry/i }));
  assert.equal(within(educationSection).getAllByRole("button", { name: /Remove/i }).length, 2);

  await user.click(within(employmentSection).getAllByRole("button", { name: /Remove/i })[1]);
  await user.click(within(educationSection).getAllByRole("button", { name: /Remove/i })[1]);

  assert.equal(within(employmentSection).getAllByRole("button", { name: /Remove/i }).length, 1);
  assert.equal(within(educationSection).getAllByRole("button", { name: /Remove/i }).length, 1);
  assert.doesNotMatch(view.container.textContent ?? "", /private-resume/i);
});

test("skills chips and link validation work without exposing internal values", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  const view = render(<ProfileForm initialProfile={createProfile()} />);
  const skillsSection = view.getByRole("button", { name: /Skills and professional links/i }).closest("section") as HTMLElement;

  const skillCombobox = within(skillsSection).getAllByRole("combobox")[0];
  await user.click(skillCombobox);
  await user.type(skillCombobox, "GraphQL{enter}");

  assert.match(document.body.textContent ?? "", /GraphQL/i);

  const githubInput = within(skillsSection).getByPlaceholderText("github.com/your-name");
  await user.clear(githubInput);
  await user.type(githubInput, "https://gitlab.com/avery");

  await wait(900);
  await waitFor(() => assert.match(document.body.textContent ?? "", /Use your GitHub profile link\./i), { timeout: 2500 });
  assert.doesNotMatch(document.body.textContent ?? "", /normalized/i);
});

test("sections are collapsible, sensitive answers stay optional, and keyboard navigation works", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  const view = render(<ProfileForm initialProfile={createProfile()} />);

  const optionalToggle = view.getByRole("button", { name: /Optional demographic and additional answers/i });
  const contactToggle = view.getByRole("button", { name: /Contact and address/i });

  assert.equal(optionalToggle.getAttribute("aria-expanded"), "false");
  assert.match(document.body.textContent ?? "", /Optional/i);

  contactToggle.focus();
  await user.keyboard("{Enter}");
  assert.equal(contactToggle.getAttribute("aria-expanded"), "false");

  optionalToggle.focus();
  await user.keyboard("{Enter}");
  assert.equal(optionalToggle.getAttribute("aria-expanded"), "true");
  assert.match(document.body.textContent ?? "", /Leave this section blank unless you want ApplyPilot to reuse exact saved answers/i);
});

test("behavioral stories can be added, previewed, and removed", async () => {
  const user = userEvent.setup({ document: globalThis.document });
  const view = render(<ProfileForm initialProfile={createProfile()} />);

  await user.click(view.getByRole("button", { name: /Behavioral stories/i }));
  await user.click(view.getByRole("button", { name: /Add story/i }));

  const titleInput = view.getByPlaceholderText("Launching a feature under a tight deadline");
  await user.type(titleInput, "Cross-team launch");

  const resultArea = view.getByPlaceholderText("What changed or improved?");
  await user.type(resultArea, "Delivered the launch with zero rollback issues.");

  await waitFor(() => assert.match(document.body.textContent ?? "", /Cross-team launch/i));
  await waitFor(() => assert.match(document.body.textContent ?? "", /Delivered the launch with zero rollback issues\./i));

  const storySection = view.getByRole("button", { name: /Behavioral stories/i }).closest("section") as HTMLElement;
  await user.click(within(storySection).getAllByRole("button", { name: /Remove/i })[1]);
  await waitFor(() => assert.equal(within(storySection).getAllByRole("button", { name: /Remove/i }).length, 1));
});

test("profile layout keeps the narrow-window responsive classes in place", () => {
  const { container } = render(<ProfileForm initialProfile={createProfile()} />);
  assert.match(container.innerHTML, /lg:grid-cols-\[minmax\(0,1fr\)_320px\]/i);
  assert.match(container.innerHTML, /md:grid-cols-2/i);
});
