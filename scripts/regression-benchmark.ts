process.env.APPLYPILOT_HEADLESS = process.env.APPLYPILOT_HEADLESS || "1";

import http from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Frame, Page } from "playwright";

import { regressionCases, renderRegressionFixture, type RegressionCase, type RegressionFieldExpectation } from "@/scripts/benchmark/regressionCases";

type FieldObservation = {
  label: string;
  step: number;
  detected: boolean;
  status: string;
  verificationStatus: string;
  commitState: string;
  expected: string;
  actual: string;
  verified: boolean;
  required: boolean;
  requiredErrorCleared: boolean;
  tags: string[];
};

type CaseResult = {
  id: string;
  ats: RegressionCase["ats"];
  status: "completed" | "failed";
  pagesReached: number;
  transitionExpected: boolean;
  transitionTriggered: boolean;
  overlayDuplicates: number;
  autofillRuns: number;
  expectedFields: number;
  detectedFields: number;
  verifiedFields: number;
  requiredFields: number;
  requiredValidationCleared: number;
  dropdownCount: number;
  dropdownVerified: number;
  autocompleteCount: number;
  autocompleteVerified: number;
  fileUploadCount: number;
  fileUploadVerified: number;
  repeaterCount: number;
  repeaterVerified: number;
  visibleButUncommitted: number;
  incorrectAnswers: number;
  severeIncorrectAnswers: number;
  countryMisSelections: number;
  duplicateEntries: number;
  observations: FieldObservation[];
  notes: string[];
};

type Summary = {
  startedAt: string;
  finishedAt: string;
  suite: "regression";
  cases: number;
  completed: number;
  failed: number;
  fieldDetection: number;
  committedValueCoverage: number;
  fillPrecision: number;
  requiredErrorClearing: number;
  dropdownSuccess: number;
  autocompleteSuccess: number;
  fileUploadVerification: number;
  repeatableSectionSuccess: number;
  pageTransitionContinuation: number;
  severeIncorrectAnswers: number;
  incorrectAnswers: number;
  countryMisSelections: number;
  visibleButUncommitted: number;
  duplicateEntries: number;
  overlayDuplicates: number;
  results: CaseResult[];
};

type SavedState = {
  profileRaw: string | null;
  answerBankRaw: string | null;
  sessionsRaw: string | null;
};

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const DEBUG_DIR = path.join(ROOT_DIR, "debug", "application-benchmark", "regression");
const SUMMARY_PATH = path.join(DEBUG_DIR, "summary.json");
const REPORT_PATH = path.join(DEBUG_DIR, "report.md");
const PROFILE_STORAGE_PATH = path.join(DATA_DIR, "profile.json");
const ANSWER_BANK_STORAGE_PATH = path.join(DATA_DIR, "answer-bank.json");
const SESSIONS_STORAGE_PATH = path.join(DATA_DIR, "application-sessions.json");
const SYNTHETIC_RESUME_PATH = path.join(DATA_DIR, "benchmark.synthetic-resume.pdf");

function nowStamp() {
  return new Date().toISOString();
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function roundRatio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

async function ensureDirs() {
  await Promise.all([mkdir(DEBUG_DIR, { recursive: true }), mkdir(DATA_DIR, { recursive: true })]);
}

async function readOptionalFile(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function restoreFile(filePath: string, raw: string | null) {
  if (raw === null) {
    await rm(filePath, { force: true }).catch(() => undefined);
    return;
  }
  await writeFile(filePath, raw, "utf8");
}

async function saveCurrentState(): Promise<SavedState> {
  return {
    profileRaw: await readOptionalFile(PROFILE_STORAGE_PATH),
    answerBankRaw: await readOptionalFile(ANSWER_BANK_STORAGE_PATH),
    sessionsRaw: await readOptionalFile(SESSIONS_STORAGE_PATH)
  };
}

async function restoreCurrentState(state: SavedState) {
  await restoreFile(PROFILE_STORAGE_PATH, state.profileRaw);
  await restoreFile(ANSWER_BANK_STORAGE_PATH, state.answerBankRaw);
  await restoreFile(SESSIONS_STORAGE_PATH, state.sessionsRaw);
}

async function ensureSyntheticResume() {
  if (existsSync(SYNTHETIC_RESUME_PATH)) return SYNTHETIC_RESUME_PATH;

  const pdf = `%PDF-1.1
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 86 >>
stream
BT
/F1 16 Tf
72 720 Td
(ApplyPilot Synthetic Resume) Tj
0 -24 Td
/F1 11 Tf
(Synthetic regression document for local fixture testing only.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000063 00000 n 
0000000122 00000 n 
0000000248 00000 n 
0000000380 00000 n 
trailer
<< /Root 1 0 R /Size 6 >>
startxref
450
%%EOF`;

  await writeFile(SYNTHETIC_RESUME_PATH, pdf, "utf8");
  return SYNTHETIC_RESUME_PATH;
}

async function installSyntheticData() {
  const resumePath = await ensureSyntheticResume();
  const { createDefaultAnswerBank, saveAnswerBank } = await import("@/lib/answerBank");
  const { createDefaultProfile, normalizeProfile, saveApplicantProfile } = await import("@/lib/profile");

  const base = createDefaultProfile();
  const profile = normalizeProfile({
    ...base,
    identity: {
      ...base.identity,
      firstName: "Avery",
      lastName: "Benchmark",
      fullName: "Avery Benchmark",
      email: "avery@example.com",
      phone: "+1 6175550117",
      phoneCountry: "United States",
      phoneCountryCode: "+1",
      phoneNationalNumber: "6175550117",
      city: "Boston",
      stateProvince: "MA",
      country: "United States",
      locationLabel: "Boston, Massachusetts, United States",
      locationKey: "boston-ma-united-states",
      linkedin: "https://www.linkedin.com/in/avery-benchmark",
      github: "https://github.com/applypilot-benchmark",
      portfolio: "https://portfolio.applypilot.local",
      website: "https://portfolio.applypilot.local"
    },
    workAuthorizationProfile: {
      ...base.workAuthorizationProfile,
      authorizedInUS: "yes",
      usWorkAuthorizationCategory: "us_citizen",
      requiresSponsorshipNow: "no",
      requiresSponsorshipFuture: "no"
    },
    availabilityProfile: {
      ...base.availabilityProfile,
      startTiming: "2_weeks"
    },
    compensationProfile: {
      ...base.compensationProfile,
      minimumSalary: 120000,
      targetSalary: 135000,
      highSalary: 140000,
      answerStyle: "range"
    },
    resume: {
      originalFilename: "applypilot-benchmark-resume.pdf",
      storedPath: resumePath,
      mimeType: "application/pdf",
      fileSize: 0,
      uploadedAt: nowStamp(),
      fileExists: true
    },
    education: [
      {
        id: crypto.randomUUID(),
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
        graduationDate: "2026",
        graduationDateType: "actual",
        gpa: "",
        startDate: "2022",
        endDate: "2026",
        location: "Boston, MA"
      }
    ],
    experience: [
      {
        id: crypto.randomUUID(),
        company: "Benchmark Systems",
        normalizedCompanyName: "benchmark systems",
        aliases: [],
        title: "Software Engineer",
        location: "Boston, MA",
        startDate: "2024-01",
        endDate: "",
        currentRole: true,
        summary: "Builds internal tools.",
        bullets: ["Built local automation tools."]
      }
    ]
  });

  const answerBank = createDefaultAnswerBank();
  await saveApplicantProfile(profile);
  await saveAnswerBank(answerBank);
}

async function startFixtureServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const address = server.address();
    const origin = address && typeof address !== "string" ? `http://127.0.0.1:${address.port}` : "http://127.0.0.1";
    const html = renderRegressionFixture(url.pathname, origin);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine regression fixture server address.");
  }

  return {
    server,
    origin: `http://127.0.0.1:${address.port}`
  };
}

async function stopFixtureServer(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function waitFor(assertion: () => Promise<void>, timeoutMs = 7_500) {
  const startedAt = Date.now();
  let lastError: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError;
}

function findFieldByLabel(
  fields: Array<{
    label: string;
    status: string;
    verificationStatus: string;
    commitState?: string;
    detectedValue?: string;
    suggestedValue?: string;
  }>,
  label: string
) {
  const target = normalizeText(label);
  return (
    fields.find((field) => normalizeText(field.label) === target) ??
    fields.find((field) => normalizeText(field.label).includes(target) || target.includes(normalizeText(field.label)))
  );
}

function findObservedValue(
  field:
    | {
        detectedValue?: string;
        suggestedValue?: string;
      }
    | undefined,
  actualValue: string
) {
  return actualValue || field?.detectedValue || field?.suggestedValue || "";
}

async function resolveFrame(page: Page, framePath?: string) {
  if (!framePath) return page.mainFrame();
  await waitFor(async () => {
    const matched = page.frames().find((frame) => {
      try {
        return new URL(frame.url()).pathname === framePath;
      } catch {
        return false;
      }
    });
    assertFrame(matched, framePath);
  });
  const matched = page.frames().find((frame) => {
    try {
      return new URL(frame.url()).pathname === framePath;
    } catch {
      return false;
    }
  });
  assertFrame(matched, framePath);
  return matched as Frame;
}

function assertFrame(frame: unknown, framePath: string): asserts frame {
  if (!frame) {
    throw new Error(`Frame ${framePath} was not available.`);
  }
}

async function readActualValue(page: Page, expectation: RegressionFieldExpectation) {
  const frame = await resolveFrame(page, expectation.framePath);
  return frame
    .locator(expectation.selector)
    .first()
    .evaluate((element) => {
      const clean = (value: string) => value.replace(/\s+/g, " ").trim();
      if (element instanceof HTMLSelectElement) {
        return clean(element.selectedOptions?.[0]?.textContent || element.value || "");
      }
      if (element instanceof HTMLInputElement) {
        if (element.type === "radio") {
          const wrapper = element.closest("label");
          return element.checked ? clean(wrapper?.textContent || element.value || "selected") : "";
        }
        if (element.type === "file") {
          return clean(element.files?.[0]?.name || element.closest("label, .field, .card")?.textContent || "");
        }
        return clean(element.value || "");
      }
      if (element instanceof HTMLTextAreaElement) {
        return clean(element.value || "");
      }
      return clean(
        element.getAttribute("data-selected-value") || element.textContent || (element as HTMLElement).innerText || ""
      );
    })
    .catch(() => "");
}

async function readValidationCleared(
  page: Page,
  expectation: RegressionFieldExpectation
) {
  if (!expectation.required) return true;
  const frame = await resolveFrame(page, expectation.framePath);
  return frame
    .locator(expectation.selector)
    .first()
    .evaluate((element) => {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        return element.checkValidity() && element.getAttribute("aria-invalid") !== "true";
      }
      return element.getAttribute("aria-invalid") !== "true";
    })
    .catch(() => false);
}

function valuesMatch(expected: string, actual: string, control: RegressionFieldExpectation["control"]) {
  const normalizedExpected = normalizeText(expected);
  const normalizedActual = normalizeText(actual);
  if (!normalizedExpected) return true;
  const digitsOnly = (value: string) => value.replace(/\D/g, "");
  const expectedDigits = digitsOnly(expected);
  const actualDigits = digitsOnly(actual);
  if (expectedDigits && actualDigits) {
    if (expectedDigits === actualDigits) {
      return true;
    }
    if (expectedDigits.length === 11 && expectedDigits.startsWith("1") && expectedDigits.slice(1) === actualDigits) {
      return true;
    }
    if (actualDigits.length === 11 && actualDigits.startsWith("1") && actualDigits.slice(1) === expectedDigits) {
      return true;
    }
  }
  if (control === "file") {
    return normalizedActual.includes(normalizedExpected);
  }
  return normalizedActual === normalizedExpected || normalizedActual.includes(normalizedExpected);
}

async function observeFields(
  page: Page,
  session:
    | {
        detectedFields: Array<{
          label: string;
          status: string;
          verificationStatus: string;
          commitState?: string;
          detectedValue?: string;
          suggestedValue?: string;
        }>;
      }
    | null,
  expectations: RegressionFieldExpectation[]
) {
  const observations: FieldObservation[] = [];
  for (const expectation of expectations) {
    const matched = findFieldByLabel(session?.detectedFields ?? [], expectation.label);
    const actual = findObservedValue(matched, await readActualValue(page, expectation));
    const requiredErrorCleared = await readValidationCleared(page, expectation);
    const verified = matched?.verificationStatus === "verified" && valuesMatch(expectation.expected, actual, expectation.control);
    observations.push({
      label: expectation.label,
      step: expectation.step,
      detected: Boolean(matched),
      status: matched?.status ?? "not_detected",
      verificationStatus: matched?.verificationStatus ?? "not_attempted",
      commitState: matched?.commitState ?? "",
      expected: expectation.expected,
      actual,
      verified,
      required: expectation.required,
      requiredErrorCleared,
      tags: expectation.tags ?? []
    });
  }
  return observations;
}

async function runCase(
  testCase: RegressionCase,
  origin: string,
  deps: Awaited<ReturnType<typeof loadDependencies>>
): Promise<CaseResult> {
  const notes: string[] = [];
  const session = await deps.createApplicationSession({
    company: testCase.title,
    roleTitle: `${testCase.ats} regression`,
    jobUrl: `${origin}${testCase.entryPath}`,
    source: "regression-benchmark",
    notes: "Deterministic local fixture run."
  });

  const firstPass = await deps.runAutofillPass(session.id, {
    trigger: "manual",
    reuseOpenPage: false
  });
  const runtime = deps.getBrowserSession(session.id);
  if (!runtime) {
    throw new Error(`No browser page was available for ${testCase.id}.`);
  }

  let overlayDuplicates = Math.max((await runtime.page.locator("#applypilot-overlay").count()) - 1, 0);
  let observations = await observeFields(runtime.page, firstPass, testCase.steps[0].expectations);
  let pagesReached = 1;
  let transitionTriggered = false;

  if (testCase.steps.length > 1) {
    const initialRuns = firstPass.auditLog.filter((entry) => entry.action === "autofill_run_completed").length;
    const continueSelector = testCase.steps[0].continueSelector;
    if (!continueSelector) {
      notes.push("Transition was expected but no continue selector was configured.");
    } else {
      await runtime.page.locator(continueSelector).click();
      await waitFor(async () => {
        const updated = await deps.getApplicationSession(session.id);
        if (!updated) {
          throw new Error("Session disappeared before the transition completed.");
        }
        const currentRuns = updated.auditLog.filter((entry) => entry.action === "autofill_run_completed").length;
        if (currentRuns < initialRuns + 1) {
          throw new Error("Automatic continuation has not completed yet.");
        }
        const currentPath = new URL(updated.currentPageUrl || origin).pathname;
        if (currentPath !== testCase.steps[1].path) {
          throw new Error(`Expected ${testCase.steps[1].path} but saw ${currentPath}.`);
        }
      }, 8_500);

      await new Promise((resolve) => setTimeout(resolve, 1_200));
      const updated = await deps.getApplicationSession(session.id);
      if (!updated) {
        throw new Error(`No updated session was available for ${testCase.id}.`);
      }
      transitionTriggered = true;
      pagesReached = 2;
      overlayDuplicates += Math.max((await runtime.page.locator("#applypilot-overlay").count()) - 1, 0);
      observations = observations.concat(await observeFields(runtime.page, updated, testCase.steps[1].expectations));
    }
  }

  const detectedFields = observations.filter((item) => item.detected).length;
  const verifiedFields = observations.filter((item) => item.verified).length;
  const requiredFields = observations.filter((item) => item.required).length;
  const requiredValidationCleared = observations.filter((item) => item.required && item.requiredErrorCleared).length;
  const dropdowns = observations.filter((item) => item.tags.includes("dropdown"));
  const autocompletes = observations.filter((item) => item.tags.includes("autocomplete"));
  const uploads = observations.filter((item) => item.tags.includes("file_upload"));
  const repeaters = observations.filter((item) => item.tags.includes("repeater_education") || item.tags.includes("repeater_employment"));
  const severe = observations.filter(
    (item) => item.tags.includes("sensitive") && item.verificationStatus === "verified" && !item.verified
  );
  const countryMisSelections = observations.filter(
    (item) => normalizeText(item.label) === "country" && item.verificationStatus === "verified" && item.actual && !item.verified
  ).length;
  const incorrectAnswers = observations.filter((item) => item.verificationStatus === "verified" && item.actual && !item.verified).length;
  const duplicateEntries = 0;
  const latestSession = (await deps.getApplicationSession(session.id)) ?? firstPass;
  const autofillRuns = latestSession.auditLog.filter((entry) => entry.action === "autofill_run_completed").length;
  const visibleButUncommitted = observations.filter((item) => item.commitState === "visually_present_but_uncommitted").length;

  return {
    id: testCase.id,
    ats: testCase.ats,
    status: severe.length || countryMisSelections || overlayDuplicates > 0 ? "failed" : "completed",
    pagesReached,
    transitionExpected: testCase.steps.length > 1,
    transitionTriggered,
    overlayDuplicates,
    autofillRuns,
    expectedFields: observations.length,
    detectedFields,
    verifiedFields,
    requiredFields,
    requiredValidationCleared,
    dropdownCount: dropdowns.length,
    dropdownVerified: dropdowns.filter((item) => item.verified).length,
    autocompleteCount: autocompletes.length,
    autocompleteVerified: autocompletes.filter((item) => item.verified).length,
    fileUploadCount: uploads.length,
    fileUploadVerified: uploads.filter((item) => item.verified).length,
    repeaterCount: repeaters.length,
    repeaterVerified: repeaters.filter((item) => item.verified).length,
    visibleButUncommitted,
    incorrectAnswers,
    severeIncorrectAnswers: severe.length,
    countryMisSelections,
    duplicateEntries,
    observations,
    notes
  };
}

async function loadDependencies() {
  const applications = await import("@/lib/applications");
  const browserManager = await import("@/lib/browserManager");
  const playwrightSession = await import("@/lib/playwrightSession");
  const quickApply = await import("@/lib/quickApply");
  const coordinator = await import("@/lib/applicationTransitionCoordinator");

  return {
    ...applications,
    ...browserManager,
    ...playwrightSession,
    ...quickApply,
    ...coordinator
  };
}

function buildSummary(results: CaseResult[]): Summary {
  const totals = results.reduce(
    (current, item) => ({
      expectedFields: current.expectedFields + item.expectedFields,
      detectedFields: current.detectedFields + item.detectedFields,
      verifiedFields: current.verifiedFields + item.verifiedFields,
      requiredFields: current.requiredFields + item.requiredFields,
      requiredValidationCleared: current.requiredValidationCleared + item.requiredValidationCleared,
      dropdownCount: current.dropdownCount + item.dropdownCount,
      dropdownVerified: current.dropdownVerified + item.dropdownVerified,
      autocompleteCount: current.autocompleteCount + item.autocompleteCount,
      autocompleteVerified: current.autocompleteVerified + item.autocompleteVerified,
      fileUploadCount: current.fileUploadCount + item.fileUploadCount,
      fileUploadVerified: current.fileUploadVerified + item.fileUploadVerified,
      repeaterCount: current.repeaterCount + item.repeaterCount,
      repeaterVerified: current.repeaterVerified + item.repeaterVerified,
      transitionsExpected: current.transitionsExpected + (item.transitionExpected ? 1 : 0),
      transitionsTriggered: current.transitionsTriggered + (item.transitionTriggered ? 1 : 0),
      severeIncorrectAnswers: current.severeIncorrectAnswers + item.severeIncorrectAnswers,
      incorrectAnswers: current.incorrectAnswers + item.incorrectAnswers,
      countryMisSelections: current.countryMisSelections + item.countryMisSelections,
      visibleButUncommitted: current.visibleButUncommitted + item.visibleButUncommitted,
      duplicateEntries: current.duplicateEntries + item.duplicateEntries,
      overlayDuplicates: current.overlayDuplicates + item.overlayDuplicates
    }),
    {
      expectedFields: 0,
      detectedFields: 0,
      verifiedFields: 0,
      requiredFields: 0,
      requiredValidationCleared: 0,
      dropdownCount: 0,
      dropdownVerified: 0,
      autocompleteCount: 0,
      autocompleteVerified: 0,
      fileUploadCount: 0,
      fileUploadVerified: 0,
      repeaterCount: 0,
      repeaterVerified: 0,
      transitionsExpected: 0,
      transitionsTriggered: 0,
      severeIncorrectAnswers: 0,
      incorrectAnswers: 0,
      countryMisSelections: 0,
      visibleButUncommitted: 0,
      duplicateEntries: 0,
      overlayDuplicates: 0
    }
  );

  return {
    startedAt: "",
    finishedAt: "",
    suite: "regression",
    cases: results.length,
    completed: results.filter((item) => item.status === "completed").length,
    failed: results.filter((item) => item.status === "failed").length,
    fieldDetection: roundRatio(totals.detectedFields, totals.expectedFields),
    committedValueCoverage: roundRatio(totals.verifiedFields, totals.expectedFields),
    fillPrecision: roundRatio(totals.verifiedFields, totals.detectedFields),
    requiredErrorClearing: roundRatio(totals.requiredValidationCleared, totals.requiredFields),
    dropdownSuccess: roundRatio(totals.dropdownVerified, totals.dropdownCount),
    autocompleteSuccess: roundRatio(totals.autocompleteVerified, totals.autocompleteCount),
    fileUploadVerification: roundRatio(totals.fileUploadVerified, totals.fileUploadCount),
    repeatableSectionSuccess: roundRatio(totals.repeaterVerified, totals.repeaterCount),
    pageTransitionContinuation: roundRatio(totals.transitionsTriggered, totals.transitionsExpected),
    severeIncorrectAnswers: totals.severeIncorrectAnswers,
    incorrectAnswers: totals.incorrectAnswers,
    countryMisSelections: totals.countryMisSelections,
    visibleButUncommitted: totals.visibleButUncommitted,
    duplicateEntries: totals.duplicateEntries,
    overlayDuplicates: totals.overlayDuplicates,
    results
  };
}

function renderReport(summary: Summary) {
  const lines = [
    "# Deterministic Regression Benchmark",
    "",
    `- Cases: ${summary.cases}`,
    `- Completed: ${summary.completed}`,
    `- Failed: ${summary.failed}`,
    `- Field detection: ${summary.fieldDetection.toFixed(3)}`,
    `- Committed-value coverage: ${summary.committedValueCoverage.toFixed(3)}`,
    `- Fill precision: ${summary.fillPrecision.toFixed(3)}`,
    `- Required-error clearing: ${summary.requiredErrorClearing.toFixed(3)}`,
    `- Dropdown success: ${summary.dropdownSuccess.toFixed(3)}`,
    `- Autocomplete success: ${summary.autocompleteSuccess.toFixed(3)}`,
    `- File-upload verification: ${summary.fileUploadVerification.toFixed(3)}`,
    `- Repeatable-section success: ${summary.repeatableSectionSuccess.toFixed(3)}`,
    `- Page-transition continuation: ${summary.pageTransitionContinuation.toFixed(3)}`,
    `- Severe incorrect answers: ${summary.severeIncorrectAnswers}`,
    `- Country mis-selections: ${summary.countryMisSelections}`,
    `- Visible-but-uncommitted: ${summary.visibleButUncommitted}`,
    `- Overlay duplicates: ${summary.overlayDuplicates}`,
    "",
    "## Cases"
  ];

  for (const result of summary.results) {
    lines.push(
      `- ${result.id}: ${result.status} | coverage ${result.verifiedFields}/${result.expectedFields} | dropdown ${result.dropdownVerified}/${result.dropdownCount} | autocomplete ${result.autocompleteVerified}/${result.autocompleteCount} | upload ${result.fileUploadVerified}/${result.fileUploadCount} | transition ${result.transitionTriggered ? "ok" : result.transitionExpected ? "missed" : "n/a"}`
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  await ensureDirs();
  const savedState = await saveCurrentState();
  const fixtureServer = await startFixtureServer();
  const deps = await loadDependencies();
  const startedAt = nowStamp();

  try {
    await installSyntheticData();
    deps.resetApplicationTransitionCoordinator();
    await deps.resetBrowserManagerForTests();

    const results: CaseResult[] = [];
    for (const testCase of regressionCases) {
      const result = await runCase(testCase, fixtureServer.origin, deps);
      results.push(result);
      await deps.resetBrowserManagerForTests();
      deps.resetApplicationTransitionCoordinator();
    }

    const summary = buildSummary(results);
    summary.startedAt = startedAt;
    summary.finishedAt = nowStamp();

    await writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf8");
    await writeFile(REPORT_PATH, renderReport(summary), "utf8");

    console.log(JSON.stringify(summary, null, 2));

    const failed =
      summary.failed > 0 ||
      summary.severeIncorrectAnswers > 0 ||
      summary.countryMisSelections > 0 ||
      summary.overlayDuplicates > 0 ||
      summary.pageTransitionContinuation < 1;

    if (failed) {
      process.exit(1);
      return;
    }

    process.exit(0);
  } finally {
    await deps.resetBrowserManagerForTests().catch(() => undefined);
    deps.resetApplicationTransitionCoordinator();
    await stopFixtureServer(fixtureServer.server).catch(() => undefined);
    await restoreCurrentState(savedState);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
