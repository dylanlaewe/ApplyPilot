import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getAnswerBank } from "@/lib/answerBank";
import { createApplicationSession, getApplicationSession, updateApplicationSession } from "@/lib/applications";
import { closeSessionPage, getOrCreateBrowserContext, resetBrowserManagerForTests } from "@/lib/browserManager";
import { buildSuggestedFields } from "@/lib/fieldMapping";
import { getApplicantProfile, saveApplicantProfile } from "@/lib/profile";
import { runAutofillPass } from "@/lib/quickApply";
import { fillField, launchBrowserSession, scanVisibleFields, waitForPageReadiness } from "@/lib/playwrightSession";
import { ApplicantProfile, ApplicationSession, DetectedField, FieldIntent } from "@/types";

const GREENHOUSE_URL = "https://job-boards.greenhouse.io/electrosoft/jobs/4272628009?utm_source=chatgpt.com";
const DEBUG_DIR = path.join(process.cwd(), "debug", "greenhouse-electrosoft");
const PROFILE_PATH = path.join(process.cwd(), "data", "profile.json");

type SmokeArtifacts = {
  consoleErrors: string[];
  pageErrors: Array<ReturnType<typeof serializeError>>;
  failedRequests: Array<{ url: string; failure: string | null }>;
};

type ControlProbe = {
  key: string;
  label: string;
  intent: FieldIntent | "unresolved_check";
  expected: string;
  actual: string;
  success: boolean;
  controlType?: string;
  selector?: string;
  options?: string[];
  reason?: string;
  error?: string;
  metadata?: Record<string, unknown> | null;
};

function nowStamp() {
  return new Date().toISOString();
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? ""
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    stack: ""
  };
}

function sanitizeUrlLabel(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildControlledProfile(profile: ApplicantProfile): ApplicantProfile {
  const resume = profile.resume?.storedPath ? profile.resume : profile.resume;
  const educationEntry = profile.education[0] ?? {
    id: crypto.randomUUID(),
    school: "",
    normalizedSchoolName: "",
    degree: "",
    degreeType: "",
    degreeCustomValue: "",
    degreeLevel: "",
    major: "",
    fieldOfStudy: "",
    normalizedFieldOfStudy: "",
    displayFieldOfStudy: "",
    graduationStatus: "not_applicable",
    graduationDate: "",
    graduationDateType: "not_applicable",
    gpa: "",
    startDate: "",
    endDate: "",
    location: ""
  };

  return {
    ...profile,
    identity: {
      ...profile.identity,
      firstName: "Avery",
      lastName: "Example",
      preferredName: "",
      fullName: "Avery Example",
      email: "avery.smoke@example.com",
      phoneCountry: "United States",
      phoneCountryCode: "+1",
      phoneNationalNumber: "6178338317",
      phoneExtension: null,
      phone: "+1 6178338317",
      addressLine1: "895 Front St",
      addressLine2: "",
      city: "Boston",
      stateProvince: "MA",
      postalCode: "02190",
      country: "United States",
      locationLabel: "Boston, Massachusetts, United States",
      locationKey: "boston-ma-united-states",
      linkedin: "https://www.linkedin.com/in/avery-example",
      github: "https://github.com/avery-example",
      portfolio: "",
      website: "https://portfolio.example.com/avery-example"
    },
    workAuthorizationProfile: {
      ...profile.workAuthorizationProfile,
      authorizedInUS: "yes",
      usWorkAuthorizationCategory: "us_citizen",
      requiresSponsorshipNow: "no",
      requiresSponsorshipFuture: "no"
    },
    securityProfile: {
      ...profile.securityProfile,
      clearanceLevel: "none",
      clearanceStatus: "never_held"
    },
    eeocDefaults: {
      ...profile.eeocDefaults,
      gender: {
        value: "Man / Male",
        customValue: ""
      },
      raceEthnicity: {
        values: ["Black or African American"],
        customValue: ""
      },
      veteranStatus: {
        value: "Not a protected veteran",
        customValue: ""
      },
      disabilityStatus: {
        value: "No",
        customValue: ""
      }
    },
    workHistoryComplete: false,
    education: [
      {
        ...educationEntry,
        school: "Commonwealth State University",
        normalizedSchoolName: "commonwealth state university",
        degree: "Bachelor of Science",
        degreeType: "bachelor_of_science",
        degreeCustomValue: "",
        degreeLevel: "bachelors_degree",
        major: "Computer Science",
        fieldOfStudy: "Computer Science",
        normalizedFieldOfStudy: "computer science",
        displayFieldOfStudy: "Computer Science",
        graduationStatus: "completed",
        graduationDateType: "actual",
        graduationDate: "2026",
        startDate: "2022",
        endDate: "2026",
        location: "Poughkeepsie, NY"
      }
    ],
    resume
  };
}

function captureArtifacts(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"], artifacts: SmokeArtifacts) {
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      artifacts.consoleErrors.push(`[${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    artifacts.pageErrors.push(serializeError(error));
  });
  page.on("requestfailed", (request) => {
    artifacts.failedRequests.push({
      url: request.url(),
      failure: request.failure()?.errorText ?? null
    });
  });
}

function findField(fields: DetectedField[], intent: FieldIntent, labelPattern?: RegExp) {
  const byIntent = fields.filter((field) => field.intent === intent);
  if (labelPattern) {
    return byIntent.find((field) => labelPattern.test(field.label)) ?? null;
  }
  return byIntent[0] ?? null;
}

async function readDisplayedValue(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"], field: DetectedField) {
  return page.locator(field.selector).first().evaluate((element) => {
    const clean = (value: string) => value.replace(/\s+/g, " ").trim();

    if (element instanceof HTMLSelectElement) {
      return clean(element.selectedOptions?.[0]?.textContent || element.value || "");
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const wrapper =
        element.closest(".select__container, .field, .form-field, .form-group, .application-question") ?? element.parentElement;
      const selectedText =
        clean(wrapper?.querySelector(".select__single-value")?.textContent || "") ||
        clean((wrapper?.querySelector("#aria-selection")?.textContent || "").replace(/^option\s+/i, "").replace(/,\s*selected\.?/i, ""));
      return clean(selectedText || element.value || wrapper?.textContent || "");
    }

    return clean((element.textContent || "") as string);
  });
}

async function readFieldMetadata(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"], field: DetectedField) {
  return page.locator(field.selector).first().evaluate((element) => {
    const el = element as HTMLElement;
    const container = el.closest(".application-question, .field, .form-field, .form-group") as HTMLElement | null;
    return {
      tagName: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || "",
      type: (el as HTMLInputElement).type || "",
      ariaExpanded: el.getAttribute("aria-expanded") || "",
      ariaHaspopup: el.getAttribute("aria-haspopup") || "",
      ariaControls: el.getAttribute("aria-controls") || "",
      className: el.getAttribute("class") || "",
      containerText: container?.textContent?.replace(/\s+/g, " ").trim() || "",
      selectedValueText: container?.querySelector(".select__single-value")?.textContent?.replace(/\s+/g, " ").trim() || ""
    };
  });
}

async function collectVisibleOptions(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"]) {
  return page.evaluate(() => {
    return Array.from(
      document.querySelectorAll(
        [
          '[role="option"]',
          'li[role="option"]',
          '[aria-selected="true"]',
          '[aria-selected="false"]',
          '[data-automation-id="promptOption"]',
          '[data-radix-collection-item]'
        ].join(", ")
      )
    )
      .map((element) => {
        const el = element as HTMLElement;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          text: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(),
          visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
        };
      })
      .filter((item) => item.visible && item.text)
      .map((item) => item.text)
      .slice(0, 50);
  });
}

function buildSearchHint(field: DetectedField, expected: string) {
  if (["city", "location", "full_location"].includes(field.intent)) {
    return expected.split(",")[0]?.trim() || expected;
  }
  return expected;
}

async function openAndCaptureOptions(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"], field: DetectedField, expected: string) {
  if (field.controlType === "native_select") {
    return field.selectOptions ?? [];
  }

  const locator = page.locator(field.selector).first();
  await locator.click({ timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(250);

  let options = await collectVisibleOptions(page);
  if (!options.length && (field.role === "combobox" || field.controlType === "aria_combobox" || field.controlType === "autocomplete")) {
    const query = buildSearchHint(field, expected);
    await locator.fill("").catch(() => undefined);
    await locator.fill(query).catch(() => undefined);
    await page.waitForTimeout(400);
    options = await collectVisibleOptions(page);
  }

  await locator.press("Escape").catch(() => undefined);
  return options;
}

async function runControlProbe(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"], field: DetectedField, expected: string, key: string) {
  const metadata = await readFieldMetadata(page, field).catch(() => null);
  const options = await openAndCaptureOptions(page, field, expected).catch(() => []);

  try {
    const verification = await fillField(page, field, expected);
    const actual = await readDisplayedValue(page, field).catch(() => verification.actualValue);
    return {
      key,
      label: field.label,
      intent: field.intent,
      expected,
      actual,
      success: verification.success,
      controlType: field.controlType,
      selector: field.selector,
      options,
      reason: verification.message,
      metadata
    } satisfies ControlProbe;
  } catch (error) {
    const actual = await readDisplayedValue(page, field).catch(() => "");
    return {
      key,
      label: field.label,
      intent: field.intent,
      expected,
      actual,
      success: false,
      controlType: field.controlType,
      selector: field.selector,
      options,
      error: error instanceof Error ? error.message : String(error),
      metadata
    } satisfies ControlProbe;
  }
}

function summarizeField(session: ApplicationSession, intent: FieldIntent, labelPattern?: RegExp) {
  const field = findField(session.detectedFields, intent, labelPattern);
  if (!field) return null;
  return {
    label: field.label,
    intent: field.intent,
    status: field.status,
    controlType: field.controlType,
    suggestedValue: field.suggestedValue,
    actualValue: field.detectedValue,
    verificationStatus: field.verificationStatus,
    verificationMessage: field.verificationMessage,
    reason: field.reason
  };
}

function summarizeFieldFromRuns(
  primary: ApplicationSession,
  secondary: ApplicationSession,
  intent: FieldIntent,
  labelPattern?: RegExp
) {
  return summarizeField(primary, intent, labelPattern) ?? summarizeField(secondary, intent, labelPattern);
}

async function main() {
  await mkdir(DEBUG_DIR, { recursive: true });

  const originalProfileJson = await readFile(PROFILE_PATH, "utf8");
  const originalProfile = await getApplicantProfile();
  const controlledProfile = buildControlledProfile(originalProfile);
  await saveApplicantProfile(controlledProfile);

  const artifacts: SmokeArtifacts = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: []
  };

  let mainSessionId = "";
  let diagnosticSessionId = "";

  try {
    const session = await createApplicationSession({
      company: "",
      roleTitle: "",
      jobUrl: GREENHOUSE_URL,
      source: "smoke-greenhouse",
      notes: `Live smoke run started ${nowStamp()}`
    });
    mainSessionId = session.id;

    const context = await getOrCreateBrowserContext();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

    const runtime = await launchBrowserSession(GREENHOUSE_URL, session.id);
    const page = runtime.page;
    captureArtifacts(page, artifacts);

    await waitForPageReadiness(page);
    await page.screenshot({ path: path.join(DEBUG_DIR, "before-autofill.png"), fullPage: true });

    const rawFields = await scanVisibleFields(page);
    await writeFile(path.join(DEBUG_DIR, "field-scan.json"), JSON.stringify(rawFields, null, 2));

    const passOne = await runAutofillPass(session.id);
    await writeFile(path.join(DEBUG_DIR, "session-pass-1.json"), JSON.stringify(passOne, null, 2));
    await page.screenshot({ path: path.join(DEBUG_DIR, "after-autofill-pass-1.png"), fullPage: true });

    const passTwo = await runAutofillPass(session.id);
    await writeFile(path.join(DEBUG_DIR, "session-pass-2.json"), JSON.stringify(passTwo, null, 2));
    await writeFile(path.join(DEBUG_DIR, "session-after.json"), JSON.stringify(passTwo, null, 2));
    await page.screenshot({ path: path.join(DEBUG_DIR, "after-autofill-pass-2.png"), fullPage: true });
    await page.screenshot({ path: path.join(DEBUG_DIR, "after-autofill.png"), fullPage: true });

    const answerBank = await getAnswerBank();
    const diagnosticSession = await createApplicationSession({
      company: "",
      roleTitle: "",
      jobUrl: GREENHOUSE_URL,
      source: "smoke-greenhouse-diagnostics",
      notes: `Live control probe started ${nowStamp()}`
    });
    diagnosticSessionId = diagnosticSession.id;

    const diagnosticRuntime = await launchBrowserSession(GREENHOUSE_URL, diagnosticSession.id);
    const diagnosticPage = diagnosticRuntime.page;
    captureArtifacts(diagnosticPage, artifacts);
    await waitForPageReadiness(diagnosticPage);

    const diagnosticRawFields = await scanVisibleFields(diagnosticPage);
    const diagnosticFields = buildSuggestedFields(diagnosticRawFields, controlledProfile, answerBank, {
      company: "",
      roleTitle: "",
      source: "smoke-greenhouse-diagnostics",
      notes: ""
    });

    const probes: ControlProbe[] = [];
    const probeSpecs: Array<{
      key: string;
      intent: FieldIntent;
      expected: string;
      labelPattern?: RegExp;
    }> = [
      { key: "phone_country", intent: "phone_country_code", expected: "United States" },
      { key: "work_authorization", intent: "work_authorization_category", expected: "us_citizen" },
      { key: "security_clearance", intent: "security_clearance_level", expected: "none" },
      { key: "highest_education", intent: "education_highest_completed", expected: "bachelors_degree" },
      { key: "graduated", intent: "graduated_question", expected: "yes" },
      { key: "location", intent: "city", expected: "Boston, Massachusetts, United States", labelPattern: /location|city/i },
      { key: "gender", intent: "eeoc_gender", expected: "Man / Male" },
      { key: "veteran", intent: "eeoc_veteran", expected: "Not a protected veteran" },
      { key: "disability", intent: "eeoc_disability", expected: "No" }
    ];

    for (const spec of probeSpecs) {
      const field = findField(diagnosticFields, spec.intent, spec.labelPattern);
      if (!field) {
        probes.push({
          key: spec.key,
          label: spec.intent,
          intent: spec.intent,
          expected: spec.expected,
          actual: "",
          success: false,
          error: "Field not found during live diagnostic scan."
        });
        continue;
      }
      probes.push(await runControlProbe(diagnosticPage, field, spec.expected, spec.key));
    }

    const raceField = findField(diagnosticFields, "eeoc_race");
    if (raceField) {
      const expectedRace = /hispanic|latino/i.test(raceField.label) || /hispanic|latino/i.test(raceField.questionText || "")
        ? "no"
        : "Black or African American";
      probes.push(await runControlProbe(diagnosticPage, raceField, expectedRace, "race_or_ethnicity"));
    }

    const previousEmployment = findField(diagnosticFields, "previous_employment");
    if (previousEmployment) {
      probes.push({
        key: "previous_employment",
        label: previousEmployment.label,
        intent: "unresolved_check",
        expected: "unresolved",
        actual: previousEmployment.status,
        success: previousEmployment.status !== "filled" && !previousEmployment.suggestedValue,
        controlType: previousEmployment.controlType,
        selector: previousEmployment.selector,
        reason: previousEmployment.reason
      });
    }

    await writeFile(path.join(DEBUG_DIR, "dropdown-diagnostics.json"), JSON.stringify(probes, null, 2));
    await writeFile(path.join(DEBUG_DIR, "console-errors.log"), artifacts.consoleErrors.join("\n"));
    await writeFile(path.join(DEBUG_DIR, "page-errors.json"), JSON.stringify(artifacts.pageErrors, null, 2));
    await writeFile(path.join(DEBUG_DIR, "failed-requests.json"), JSON.stringify(artifacts.failedRequests, null, 2));

    const importantSessionFields = {
      firstName: summarizeFieldFromRuns(passTwo, passOne, "first_name"),
      lastName: summarizeFieldFromRuns(passTwo, passOne, "last_name"),
      email: summarizeFieldFromRuns(passTwo, passOne, "email"),
      phoneNumber: summarizeFieldFromRuns(passTwo, passOne, "phone_number") ?? summarizeFieldFromRuns(passTwo, passOne, "phone"),
      streetAddress: summarizeFieldFromRuns(passTwo, passOne, "street_address") ?? summarizeFieldFromRuns(passTwo, passOne, "address_line_1"),
      city: summarizeFieldFromRuns(passTwo, passOne, "city"),
      state: summarizeFieldFromRuns(passTwo, passOne, "state"),
      postalCode: summarizeFieldFromRuns(passTwo, passOne, "postal_code"),
      resume: summarizeFieldFromRuns(passTwo, passOne, "resume_upload"),
      workAuthorization: summarizeFieldFromRuns(passTwo, passOne, "work_authorization_category"),
      securityClearance: summarizeFieldFromRuns(passTwo, passOne, "security_clearance_level"),
      highestEducation: summarizeFieldFromRuns(passTwo, passOne, "education_highest_completed"),
      graduated: summarizeFieldFromRuns(passTwo, passOne, "graduated_question"),
      previousEmployment: summarizeFieldFromRuns(passTwo, passOne, "previous_employment"),
      gender: summarizeFieldFromRuns(passTwo, passOne, "eeoc_gender"),
      race: summarizeFieldFromRuns(passTwo, passOne, "eeoc_race"),
      veteran: summarizeFieldFromRuns(passTwo, passOne, "eeoc_veteran"),
      disability: summarizeFieldFromRuns(passTwo, passOne, "eeoc_disability")
    };

    await writeFile(path.join(DEBUG_DIR, "important-session-fields.json"), JSON.stringify(importantSessionFields, null, 2));
    await context.tracing.stop({ path: path.join(DEBUG_DIR, "trace.zip") });

    const probeSummaryLines = probes.map(
      (probe) =>
        `- ${probe.key}: expected=${JSON.stringify(probe.expected)} actual=${JSON.stringify(probe.actual)} success=${probe.success}${probe.error ? ` error=${probe.error}` : ""}`
    );

    const reportLines = [
      "# Greenhouse smoke test",
      "",
      `- Timestamp: ${nowStamp()}`,
      `- URL: ${GREENHOUSE_URL}`,
      `- Main session ID: ${session.id}`,
      `- Diagnostic session ID: ${diagnosticSession.id}`,
      `- Final URL after autofill: ${sanitizeUrlLabel(page.url())}`,
      `- Submit clicked: no`,
      `- Pass 1 status: ${passOne.status} (${passOne.statusMessage})`,
      `- Pass 2 status: ${passTwo.status} (${passTwo.statusMessage})`,
      `- CAPTCHA gating removed: yes`,
      `- Fields detected: ${passTwo.fieldsDetected}`,
      `- Fields filled and verified: ${passTwo.fieldsFilledAndVerified}`,
      `- Fields unresolved: ${passTwo.fieldsUnresolved}`,
      `- Fields failed: ${passTwo.fieldsFailed}`,
      "",
      "## Live control types",
      "",
      "- Greenhouse phone country, work authorization, security clearance, education, graduation, and EEOC controls are custom combobox/listbox widgets rather than native `<select>` elements.",
      "- The live page renders selected dropdown values in wrapper text such as `.select__single-value` and aria live regions, so plain input-value verification was insufficient.",
      "",
      "## Main autofill session",
      "",
      ...Object.entries(importantSessionFields).map(([key, value]) => `- ${key}: ${value ? JSON.stringify(value) : "not found"}`),
      "",
      "## Targeted live probes",
      "",
      ...probeSummaryLines,
      "",
      "## Artifacts",
      "",
      `- Screenshot before autofill: ${path.join(DEBUG_DIR, "before-autofill.png")}`,
      `- Screenshot after autofill: ${path.join(DEBUG_DIR, "after-autofill.png")}`,
      `- Trace: ${path.join(DEBUG_DIR, "trace.zip")}`,
      `- Raw field scan: ${path.join(DEBUG_DIR, "field-scan.json")}`,
      `- Dropdown diagnostics: ${path.join(DEBUG_DIR, "dropdown-diagnostics.json")}`,
      `- Console errors: ${path.join(DEBUG_DIR, "console-errors.log")}`,
      `- Page errors: ${path.join(DEBUG_DIR, "page-errors.json")}`,
      `- Failed requests: ${path.join(DEBUG_DIR, "failed-requests.json")}`
    ];

    await writeFile(path.join(DEBUG_DIR, "smoke-test-report.md"), reportLines.join("\n"));
  } finally {
    if (mainSessionId) {
      await closeSessionPage(mainSessionId).catch(() => undefined);
      await updateApplicationSession(mainSessionId, (session) => ({
        ...session,
        notes: `${session.notes}\nSmoke run completed ${nowStamp()}`
      })).catch(() => undefined);
    }

    if (diagnosticSessionId) {
      await closeSessionPage(diagnosticSessionId).catch(() => undefined);
      await updateApplicationSession(diagnosticSessionId, (session) => ({
        ...session,
        notes: `${session.notes}\nDiagnostic probe completed ${nowStamp()}`
      })).catch(() => undefined);
    }

    await writeFile(PROFILE_PATH, originalProfileJson);
    await saveApplicantProfile(originalProfile).catch(() => undefined);
    await resetBrowserManagerForTests().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
