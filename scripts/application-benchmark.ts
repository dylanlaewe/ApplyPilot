import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import benchmarkCases from "@/scripts/fixtures/application-benchmark-cases.json";
import { createDefaultAnswerBank, saveAnswerBank } from "@/lib/answerBank";
import { createApplicationSession, updateApplicationSession } from "@/lib/applications";
import { evaluateVisibleFieldCandidates } from "@/lib/browserFieldScanner";
import { closeSessionPage, getOrCreateBrowserContext, resetBrowserManagerForTests } from "@/lib/browserManager";
import { dismissCookieConsentIfPresent } from "@/lib/consentBarrier";
import { preferDetectedFieldAttempt } from "@/lib/detectedFieldState";
import { prepareLogicalFields, type LogicalFieldPreparationStats } from "@/lib/fieldLabeling";
import { buildSuggestedFields } from "@/lib/fieldMapping";
import { extractJobMetadata } from "@/lib/jobMetadata";
import {
  detectCaptcha,
  detectLoginRequirement,
  launchBrowserSession,
  scanVisibleFields,
  waitForPageReadiness
} from "@/lib/playwrightSession";
import { createDefaultProfile, normalizeProfile, saveApplicantProfile } from "@/lib/profile";
import { runAutofillPass } from "@/lib/quickApply";
import { isFinalSubmitLabel } from "@/lib/safety";
import { detectUnavailableText } from "@/lib/siteAvailability";
import { normalizeText } from "@/lib/utils";
import { AnswerBankItem, ApplicantProfile, ApplicationSession, DetectedField, RawScannedField } from "@/types";

type AtsName = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters" | "workday" | "jobvite" | "icims";
type FailureCategory =
  | "FIELD_NOT_DETECTED"
  | "LABEL_ASSOCIATION_FAILED"
  | "INTENT_CLASSIFICATION_FAILED"
  | "PROFILE_FACT_MISSING"
  | "ANSWER_DERIVATION_FAILED"
  | "FORMAT_ADAPTATION_FAILED"
  | "CONTROL_ADAPTER_FAILED"
  | "OPTION_MATCHING_FAILED"
  | "VERIFICATION_FAILED"
  | "NAVIGATION_FAILED"
  | "METADATA_EXTRACTION_FAILED"
  | "PAGE_NOT_READY"
  | "SITE_UNAVAILABLE"
  | "INTENTIONALLY_UNRESOLVED";

type ExpectedAnswerSource =
  | "explicit_profile"
  | "derived_profile"
  | "formatted_profile"
  | "answer_bank"
  | "approved_fallback"
  | "generatable_from_profile"
  | "generatable_from_job_and_profile"
  | "reusable_saved_answer"
  | "requires_saved_story"
  | "requires_one_user_fact"
  | "legal_or_sensitive_manual"
  | "optional_no_value"
  | "unsupported_control"
  | "intentionally_unresolved"
  | "unsupported";

type CoverageClassification =
  | "ANSWERABLE_NOW"
  | "ANSWERABLE_WITH_DERIVATION"
  | "ANSWERABLE_WITH_SAVED_RESPONSE"
  | "ANSWERABLE_WITH_ONE_USER_FACT"
  | "REQUIRES_BEHAVIORAL_STORY"
  | "LEGAL_OR_SENSITIVE_MANUAL"
  | "OPTIONAL_SAFE_TO_SKIP"
  | "UNSUPPORTED_CONTROL"
  | "CONDITIONAL_NOT_APPLICABLE";

type BenchmarkCase = {
  id: string;
  phase: number;
  ats: AtsName;
  company: string;
  roleTitle: string;
  url: string;
  active?: boolean;
  lastVerifiedAt?: string;
  disabledReason?: string;
  availabilityRegression?: boolean;
  tags?: string[];
  expectedFieldTypes?: string[];
};

type VisibleAction = {
  id: string;
  label: string;
  tagName: string;
  type: string;
  role: string;
  href: string;
  disabled: boolean;
  containerText: string;
};

type ManualEffort = {
  manualClicksRequired: number;
  manualFieldsRequired: number;
  unexpectedPageSwitches: number;
  retriesRequired: number;
  incorrectFieldsRequiringCorrection: number;
};

type BenchmarkFieldRecord = {
  applicationId: string;
  ats: AtsName;
  company: string;
  roleTitle: string;
  pageNumber: number;
  pageUrl: string;
  pageHeading: string;
  fieldLabel: string;
  nearbyQuestionText: string;
  required: boolean;
  domControlType: string;
  selectedAdapter: string;
  detectedIntent: string;
  expectedAnswerSource: ExpectedAnswerSource;
  expectedNormalizedAnswer: string;
  availableOptions: string[];
  attemptedValue: string;
  actualValueAfterFill: string;
  browserVerified: boolean;
  verified: boolean;
  outcome: "filled" | "needs_review" | "skipped" | "error" | "not_detected";
  failureCategory: FailureCategory | null;
  failureReason: string;
  answerable: boolean;
  coverageClassification: CoverageClassification;
  safeAnswerableNow: boolean;
  userExpectedAnswerable: boolean;
  profileEvidenceAvailable: "yes" | "partial" | "no" | "not_applicable";
  excludedFromAnswerableDenominatorReason: string;
  reasonableUserWouldExpectApplyPilotToAnswer: boolean;
  oneAdditionalProfileFactCouldAnswer: boolean;
  genuinelyUnsafeToAnswer: boolean;
  severe: boolean;
  detected: boolean;
  attempted: boolean;
  shortAnswerKind: string;
  generatedProvider: string;
  generatedEvidenceTitles: string[];
  generatedJobEvidenceTitles: string[];
  generatedWarnings: string[];
  generatedRegenerationNotes: string[];
  qualityPassed: boolean;
  qualityReasons: string[];
  qualityFactualGrounding: number;
  qualityQuestionRelevance: number;
  qualityJobRelevance: number;
  qualityCandidateRelevance: number;
  qualityFluency: number;
  qualitySpecificity: number;
  qualityConcision: number;
};

type StageResult = {
  pageNumber: number;
  pageUrl: string;
  pageHeading: string;
  actionsTaken: string[];
  initialRawFieldCount: number;
  noiseRejectedCount: number;
  groupedControlCount: number;
  deduplicatedFieldCount: number;
  logicalFieldCount: number;
  answerableFieldCount: number;
  intentionallyUnresolvedCount: number;
  finalDetectedFieldCount: number;
  inventory: BenchmarkFieldRecord[];
};

type BenchmarkCaseStatus = "completed" | "failed_runtime" | "manual_barrier" | "site_unavailable" | "not_scorable" | "timeout";

type MetricSummary = {
  numerator: number;
  denominator: number;
  rate: number;
  notMeasured: boolean;
};

type BenchmarkCaseResult = {
  suiteRunId: string;
  suiteStartedAt: string;
  caseStartedAt: string;
  caseFinishedAt: string;
  id: string;
  ats: AtsName;
  phase: number;
  company: string;
  roleTitle: string;
  url: string;
  status: BenchmarkCaseStatus;
  metadata: {
    expectedCompany: string;
    expectedRoleTitle: string;
    actualCompany: string;
    actualRoleTitle: string;
    success: boolean;
    source: string;
  };
  pagesReached: number;
  pagesFilled: number;
  transitionsAttempted: number;
  transitionsContinued: number;
  finalReviewPageReached: boolean;
  rawDomCandidateCount: number;
  noiseRejectedCount: number;
  logicalFieldCount: number;
  answerableFieldCount: number;
  intentionallyUnresolvedCount: number;
  detectedCount: number;
  attemptedCount: number;
  verifiedCount: number;
  safeAnswerableFieldCount: number;
  safeVerifiedCount: number;
  safeAnswerCoverage: number;
  userExpectedFieldCount: number;
  userExpectedVerifiedCount: number;
  userExpectedCoverage: number;
  dropdownCount: number;
  dropdownVerifiedCount: number;
  autocompleteCount: number;
  autocompleteVerifiedCount: number;
  fileUploadCount: number;
  fileUploadVerifiedCount: number;
  fieldDetectionRecall: number;
  fillCoverage: number;
  fillPrecision: number;
  dropdownSuccess: number;
  autocompleteSuccess: number;
  fileUploadSuccess: number;
  severeIncorrectAnswers: number;
  severeFieldFailures: number;
  generatableQuestionCount: number;
  generatableShortAnswersDetected: number;
  generatedAnswerCount: number;
  generatedAnswersInserted: number;
  generatedAnswersBrowserVerified: number;
  generatedAnswersPassingQuality: number;
  generatedAnswersRejectedForQuality: number;
  generatableShortAnswersFilled: number;
  rawShortAnswerCoverage: number;
  qualityApprovedShortAnswerCoverage: number;
  humanReadyShortAnswerCoverage: number;
  generatableShortAnswerCoverage: number;
  reusableAnswersFilled: number;
  missingEvidenceQuestions: number;
  generatedAnswersRequiringCorrection: number;
  generatedAnswersAcceptedWithoutEdit: number;
  manualEffort: ManualEffort;
  manualBarriers: string[];
  warnings: string[];
  failureCategories: Record<FailureCategory, number>;
  stageResults: StageResult[];
  tracePath: string;
  screenshotPaths: string[];
  fieldInventoryPath: string;
  reportPath: string;
  submitted: boolean;
};

type CaseExecutionProgress = {
  stage: string;
};

function formatTimeoutBarrier(startedAt: string, stage: string) {
  return `Case timed out after the configured limit during ${stage}. Started ${startedAt}.`;
}

function formatTimeoutWarning(stage: string) {
  return `Timed out before the benchmark case completed. Last recorded stage: ${stage}.`;
}

type BenchmarkSummary = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  selectedCaseIds: string[];
  overall: Record<string, unknown>;
  byAts: Record<string, Record<string, unknown>>;
  byApplication: BenchmarkCaseResult[];
  failedCaseIds: string[];
  failedRuntimeCaseIds: string[];
  timeoutCaseIds: string[];
  notScorableCaseIds: string[];
  unavailableCaseIds: string[];
  manualBarrierCaseIds: string[];
  severeIncorrectAnswers: number;
  severeFieldFailures: number;
  noFinalSubmissions: boolean;
};

type SavedState = {
  profileRaw: string | null;
  answerBankRaw: string | null;
};

type SyntheticFixtures = {
  profile: ApplicantProfile;
  answerBank: AnswerBankItem[];
};

const CASES = benchmarkCases as BenchmarkCase[];
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const DEBUG_DIR = path.join(ROOT_DIR, "debug", "application-benchmark");
const SCREENSHOT_DIR = path.join(DEBUG_DIR, "screenshots");
const TRACE_DIR = path.join(DEBUG_DIR, "traces");
const FIELD_INVENTORY_DIR = path.join(DEBUG_DIR, "field-inventories");
const ATS_REPORT_DIR = path.join(DEBUG_DIR, "ats-reports");
const PROFILE_STORAGE_PATH = path.join(DATA_DIR, "profile.json");
const ANSWER_BANK_STORAGE_PATH = path.join(DATA_DIR, "answer-bank.json");
const SYNTHETIC_RESUME_PATH = path.join(DATA_DIR, "benchmark.synthetic-resume.pdf");
const SUMMARY_PATH = path.join(DEBUG_DIR, "summary.json");
const FAILURES_PATH = path.join(DEBUG_DIR, "failures.json");
const BENCHMARK_REPORT_PATH = path.join(DEBUG_DIR, "benchmark-report.md");
const GENERATED_ANSWERS_PATH = path.join(DEBUG_DIR, "generated-answers.md");
const NON_ANSWERABLE_AUDIT_PATH = path.join(DEBUG_DIR, "non-answerable-field-audit.md");
const COVERAGE_AUDIT_PATH = path.join(DEBUG_DIR, "coverage-audit.md");
const AUTOCOMPLETE_AUDIT_PATH = path.join(DEBUG_DIR, "autocomplete-audit.md");
const FILE_UPLOAD_AUDIT_PATH = path.join(DEBUG_DIR, "file-upload-audit.md");
const SUITE_OUTPUT_PATHS = [
  SUMMARY_PATH,
  FAILURES_PATH,
  BENCHMARK_REPORT_PATH,
  GENERATED_ANSWERS_PATH,
  NON_ANSWERABLE_AUDIT_PATH,
  COVERAGE_AUDIT_PATH,
  AUTOCOMPLETE_AUDIT_PATH,
  FILE_UPLOAD_AUDIT_PATH
] as const;

const ENTRY_ACTION_PATTERNS = [
  /^apply$/i,
  /^apply now$/i,
  /apply for this job/i,
  /start application/i,
  /begin application/i,
  /continue application/i,
  /start your application/i,
  /^continue$/i
];

const CONTINUE_ACTION_PATTERNS = [
  /^continue$/i,
  /^next$/i,
  /save and continue/i,
  /continue to next/i,
  /review application/i,
  /review$/i
];

const SOCIAL_LOGIN_PATTERNS = [/google/i, /linkedin/i, /mygreenhouse/i, /microsoft/i, /apple/i];
const SEVERE_INTENTS = new Set([
  "email",
  "phone",
  "phone_country_code",
  "phone_number",
  "full_phone_number",
  "street_address",
  "address_line_1",
  "city",
  "state",
  "postal_code",
  "work_authorization",
  "work_authorization_category",
  "sponsorship",
  "sponsorship_now",
  "sponsorship_future",
  "security_clearance_level",
  "education_highest_completed",
  "education_highest_attended",
  "graduated_question",
  "desired_salary",
  "eeoc_gender",
  "eeoc_race",
  "eeoc_veteran",
  "eeoc_disability",
  "legal_attestation"
]);

function nowStamp() {
  return new Date().toISOString();
}

function buildSuiteRunId(startedAt: string) {
  return `live-${startedAt.replace(/[:.]/g, "-")}`;
}

function resultBelongsToSuiteRun(result: Pick<BenchmarkCaseResult, "suiteRunId"> | null, suiteRunId: string) {
  return Boolean(result && result.suiteRunId === suiteRunId);
}

async function clearSuiteArtifactsForCases(testCases: BenchmarkCase[]) {
  await Promise.all(SUITE_OUTPUT_PATHS.map((filePath) => rm(filePath, { force: true }).catch(() => undefined)));
  await Promise.all(
    testCases.flatMap((testCase) => [
      rm(path.join(DEBUG_DIR, testCase.id), { recursive: true, force: true }).catch(() => undefined),
      rm(path.join(TRACE_DIR, `${testCase.id}.zip`), { force: true }).catch(() => undefined),
      rm(path.join(FIELD_INVENTORY_DIR, `${testCase.id}.json`), { force: true }).catch(() => undefined),
      rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-1-before.png`), { force: true }).catch(() => undefined),
      rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-1-after.png`), { force: true }).catch(() => undefined),
      rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-2-before.png`), { force: true }).catch(() => undefined),
      rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-2-after.png`), { force: true }).catch(() => undefined),
      rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-3-before.png`), { force: true }).catch(() => undefined),
      rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-3-after.png`), { force: true }).catch(() => undefined),
      rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-4-before.png`), { force: true }).catch(() => undefined),
      rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-4-after.png`), { force: true }).catch(() => undefined)
    ])
  );
}

function roundRatio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function buildMetric(numerator: number, denominator: number): MetricSummary {
  return {
    numerator,
    denominator,
    rate: roundRatio(numerator, denominator),
    notMeasured: denominator === 0
  };
}

function formatRatioWithCounts(numerator: number, denominator: number) {
  return `${roundRatio(numerator, denominator).toFixed(3)} (${numerator}/${denominator})`;
}

function formatMetric(metric: MetricSummary) {
  return metric.notMeasured ? `not measured (${metric.numerator}/${metric.denominator})` : `${metric.rate.toFixed(3)} (${metric.numerator}/${metric.denominator})`;
}

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
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

function readArgValue(flag: string, args: string[]) {
  const index = args.indexOf(flag);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

function readArgValues(flag: string, args: string[]) {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) continue;
    const next = args[index + 1];
    if (next) {
      values.push(next);
    }
  }
  return values;
}

function parseArgs(args: string[]) {
  const ats = readArgValue("--ats", args);
  const caseIds = readArgValues("--case", args)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const phaseValue = readArgValue("--phase", args);
  const fromCase = readArgValue("--from-case", args);
  const caseTimeoutValue = readArgValue("--case-timeout", args);
  const skipCases = readArgValues("--skip-case", args)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const failedOnly = args.includes("--failed-only");
  const resume = args.includes("--resume");
  const phase = phaseValue ? Number(phaseValue) : null;
  const caseTimeoutMs = caseTimeoutValue ? Math.max(Number(caseTimeoutValue), 0) * 1000 : 0;

  return {
    ats: ats ? ats.toLowerCase() : "",
    caseIds,
    fromCase: fromCase ? fromCase.toLowerCase() : "",
    phase: Number.isFinite(phase) ? phase : null,
    failedOnly,
    resume,
    skipCases,
    caseTimeoutMs: Number.isFinite(caseTimeoutMs) ? caseTimeoutMs : 0
  };
}

async function ensureDirs() {
  await Promise.all([
    mkdir(DEBUG_DIR, { recursive: true }),
    mkdir(SCREENSHOT_DIR, { recursive: true }),
    mkdir(TRACE_DIR, { recursive: true }),
    mkdir(FIELD_INVENTORY_DIR, { recursive: true }),
    mkdir(ATS_REPORT_DIR, { recursive: true }),
    mkdir(DATA_DIR, { recursive: true })
  ]);
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
(Synthetic benchmark document for local autofill testing only.) Tj
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
0000000385 00000 n 
trailer
<< /Root 1 0 R /Size 6 >>
startxref
455
%%EOF`;

  await writeFile(SYNTHETIC_RESUME_PATH, pdf, "utf8");
  return SYNTHETIC_RESUME_PATH;
}

function createSyntheticProfile(resumePath: string) {
  const base = createDefaultProfile();
  const profile = normalizeProfile({
    ...base,
    identity: {
      ...base.identity,
      firstName: "Avery",
      middleName: "",
      lastName: "Benchmark",
      preferredName: "Avery",
      fullName: "Avery Benchmark",
      email: "applypilot-benchmark@example.com",
      phone: "+1 6178338317",
      phoneCountry: "United States",
      phoneCountryCode: "+1",
      phoneNationalNumber: "6178338317",
      phoneExtension: null,
      addressLine1: "100 Innovation Way",
      addressLine2: "",
      city: "Boston",
      stateProvince: "MA",
      postalCode: "02110",
      country: "United States",
      locationLabel: "Boston, Massachusetts, United States",
      locationKey: "boston-ma-united-states",
      linkedin: "https://www.linkedin.com/in/avery-benchmark",
      github: "https://github.com/applypilot-benchmark",
      portfolio: "https://portfolio.applypilot.local",
      website: "https://portfolio.applypilot.local",
      otherLink: "",
      genericWebsiteFallback: "portfolio"
    },
    workAuthorizationProfile: {
      ...base.workAuthorizationProfile,
      authorizedInUS: "yes",
      usWorkAuthorizationCategory: "us_citizen",
      requiresSponsorshipNow: "no",
      requiresSponsorshipFuture: "no",
      openToRelocation: "yes",
      openToRemote: "yes",
      openToHybrid: "yes",
      openToOnsite: "yes"
    },
    securityProfile: {
      ...base.securityProfile,
      clearanceLevel: "none",
      clearanceStatus: "never_held"
    },
    availabilityProfile: {
      ...base.availabilityProfile,
      startTiming: "2_weeks"
    },
    compensationProfile: {
      ...base.compensationProfile,
      minimumSalary: 120000,
      targetSalary: 135000,
      highSalary: 150000,
      hourlyMinimum: 55,
      hourlyTarget: 70,
      answerStyle: "range"
    },
    skillsProfile: {
      skills: ["TypeScript", "React", "Next.js", "Playwright", "SQL", "Python"]
    },
    preferencesProfile: {
      ...base.preferencesProfile,
      jobTypes: ["full_time"],
      locationsOpenTo: [
        {
          type: "city",
          label: "Boston, Massachusetts, United States",
          city: "Boston",
          stateProvince: "MA",
          country: "United States",
          normalizedKey: "boston-ma-united-states"
        }
      ]
    },
    professionalBackground: {
      professionalSummary:
        "Product-minded software engineer with hands-on experience building internal tools, frontend workflows, and reliable automation for everyday operational work.",
      currentIdentity: "product-minded software engineer",
      targetRoleCategories: ["software engineering", "product engineering", "workflow automation"],
      industriesOfInterest: ["B2B SaaS", "developer tools", "education technology"],
      careerDirection: "I am looking for roles where I can build useful user-facing systems and make complex workflows feel simpler and more dependable.",
      keyStrengths: [
        "turning messy workflows into clear, reliable product experiences",
        "shipping practical automation without losing sight of user experience",
        "learning unfamiliar systems quickly and making them easier for others to use"
      ],
      keyAccomplishments: [
        "Built local automation tools that reduced repetitive application setup work.",
        "Delivered frontend and data workflow improvements for internal systems."
      ],
      importantProjects: [
        "Built a standalone local job application autofill assistant in Next.js and Playwright.",
        "Worked on internal tooling that connected frontend workflows with structured data."
      ],
      reasonsForSeeking: [
        "I want to work on products where thoughtful UX and dependable execution both matter.",
        "I am looking for opportunities to apply engineering skills to workflows that save people real time."
      ]
    },
    stories: [
      {
        id: crypto.randomUUID(),
        title: "Improved an inefficient workflow",
        tags: ["workflow", "process improvement", "learning quickly", "prioritization"],
        situation:
          "I noticed that repetitive application and data-entry steps were slowing work down and creating avoidable errors.",
        action:
          "I mapped the repeated steps, built a local workflow tool to automate the safe reusable parts, and kept the sensitive decisions in a human review step.",
        result:
          "The process became faster, more consistent, and easier to review without removing human control."
      }
    ],
    eeocDefaults: {
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
    additionalApplicationFacts: {
      ...base.additionalApplicationFacts,
      validDriversLicense: "yes",
      reliableTransportation: "yes",
      meetsMinimumWorkingAge: "yes",
      willingBackgroundCheck: "yes",
      willingDrugScreen: "yes",
      relatedFamilyAtCompany: "no",
      boundByNonCompete: "no",
      governmentEmploymentHistory: "no",
      willingToTravel: "yes",
      weekendAvailability: "yes",
      overtimeAvailability: "yes"
    },
    workHistoryComplete: false,
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
        summary: "Builds internal tooling and application workflows.",
        bullets: ["Built local automation tools.", "Worked on data and frontend systems."]
      }
    ]
  });

  profile.resume.fileSize = existsSync(resumePath) ? 0 : 0;
  return profile;
}

function createSyntheticAnswerBank() {
  const items = createDefaultAnswerBank();
  return items.map((item) => {
    if (item.label === "Why are you interested in this position?") {
      return {
        ...item,
        answer:
          "I am interested in roles where I can build reliable user-facing tools, improve workflows, and help teams move faster without sacrificing quality.",
        autoFillAllowed: false,
        autofillBehavior: "suggest" as const
      };
    }

    if (item.label === "Tell us about yourself.") {
      return {
        ...item,
        answer:
          "I am a product-minded engineer with experience building frontend workflows, automation tooling, and data-backed internal systems.",
        autoFillAllowed: false,
        autofillBehavior: "suggest" as const
      };
    }

    if (item.label === "Why this company?") {
      return {
        ...item,
        answer:
          "I am drawn to teams that care about thoughtful execution, strong collaboration, and building products that materially help customers.",
        autoFillAllowed: false,
        autofillBehavior: "suggest" as const
      };
    }

    return item;
  });
}

async function ensureSyntheticFixtures() {
  const resumePath = await ensureSyntheticResume();
  const profile = createSyntheticProfile(resumePath);
  const answerBank = createSyntheticAnswerBank();

  return {
    profile: normalizeProfile(profile),
    answerBank
  };
}

async function installSyntheticData(profile: ApplicantProfile, answerBank: AnswerBankItem[]) {
  await saveApplicantProfile(normalizeProfile(profile));
  await saveAnswerBank(answerBank);
}

async function saveCurrentState(): Promise<SavedState> {
  return {
    profileRaw: await readOptionalFile(PROFILE_STORAGE_PATH),
    answerBankRaw: await readOptionalFile(ANSWER_BANK_STORAGE_PATH)
  };
}

async function restoreCurrentState(state: SavedState) {
  await restoreFile(PROFILE_STORAGE_PATH, state.profileRaw);
  await restoreFile(ANSWER_BANK_STORAGE_PATH, state.answerBankRaw);
}

function loadCasesFromArgs(args: ReturnType<typeof parseArgs>) {
  let selected = CASES.slice();

  if (!args.caseIds.length && !args.ats && args.phase === null && !args.failedOnly && !args.fromCase && !args.resume && !args.skipCases.length) {
    selected = selected.filter((testCase) => testCase.active !== false && !testCase.availabilityRegression);
  }

  if (args.ats) {
    selected = selected.filter((testCase) => testCase.ats === args.ats);
  }

  if (args.caseIds.length) {
    const selectedIds = new Set(args.caseIds);
    selected = selected.filter((testCase) => selectedIds.has(testCase.id));
  }

  if (args.phase !== null) {
    selected = selected.filter((testCase) => testCase.phase === args.phase);
  }

  if (args.failedOnly && existsSync(SUMMARY_PATH)) {
    const previous = JSON.parse(readFileSync(SUMMARY_PATH, "utf8")) as BenchmarkSummary;
    const failedIds = new Set(previous.failedCaseIds ?? []);
    selected = selected.filter((testCase) => failedIds.has(testCase.id));
  }

  if (args.fromCase) {
    const startIndex = selected.findIndex((testCase) => testCase.id === args.fromCase);
    if (startIndex !== -1) {
      selected = selected.slice(startIndex);
    }
  }

  if (args.skipCases.length) {
    const skipped = new Set(args.skipCases);
    selected = selected.filter((testCase) => !skipped.has(testCase.id));
  }

  return selected;
}

function metadataMatches(expected: string, actual: string) {
  const normalizedExpected = normalizeText(expected);
  const normalizedActual = normalizeText(actual);
  if (!normalizedExpected) return true;
  if (!normalizedActual) return false;
  return normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual);
}

function fieldIdentityKey(field: Pick<RawScannedField, "domId" | "label" | "type" | "name"> & { intent?: string }) {
  return [
    normalizeText(field.domId || ""),
    normalizeText(field.label || ""),
    normalizeText(field.name || ""),
    normalizeText(field.type || ""),
    normalizeText(field.intent || "")
  ].join("::");
}

function isResumeUploadRecord(record: Pick<BenchmarkFieldRecord, "fieldLabel" | "nearbyQuestionText" | "detectedIntent" | "domControlType">) {
  if (record.detectedIntent === "resume_upload") return true;
  const combined = normalizeText([record.fieldLabel, record.nearbyQuestionText, record.detectedIntent].filter(Boolean).join(" "));
  return /\bresume\b|\bcv\b/.test(combined) && record.domControlType !== "textarea";
}

function mergeDetectedFields(...fieldLists: DetectedField[][]) {
  const merged = new Map<string, DetectedField>();
  for (const fieldList of fieldLists) {
    for (const field of fieldList) {
      const identity = fieldIdentityKey(field);
      const existing = merged.get(identity);
      merged.set(identity, existing ? preferDetectedFieldAttempt(existing, field) : field);
    }
  }
  return Array.from(merged.values());
}

function classifyExpectedAnswerSource(field: DetectedField): ExpectedAnswerSource {
  if (field.shortAnswer?.answerability === "generatable_from_profile") return "generatable_from_profile";
  if (field.shortAnswer?.answerability === "generatable_from_job_and_profile") return "generatable_from_job_and_profile";
  if (field.shortAnswer?.answerability === "reusable_saved_answer") return "reusable_saved_answer";
  if (field.shortAnswer?.answerability === "requires_saved_story") return "requires_saved_story";
  if (field.shortAnswer?.answerability === "requires_one_user_fact") return "requires_one_user_fact";
  if (field.shortAnswer?.answerability === "legal_or_sensitive_manual") return "legal_or_sensitive_manual";
  if (field.shortAnswer?.answerability === "optional_no_value") return "optional_no_value";
  if (field.shortAnswer?.answerability === "unsupported_control") return "unsupported_control";
  if (field.answerSource !== "unknown" && field.suggestedValue.trim()) {
    return field.answerSource as ExpectedAnswerSource;
  }

  if (field.intent === "unknown") {
    return "unsupported_control";
  }

  return "intentionally_unresolved";
}

function isAnswerableField(field: DetectedField) {
  return ![
    "unsupported",
    "unsupported_control",
    "intentionally_unresolved",
    "requires_saved_story",
    "requires_one_user_fact",
    "legal_or_sensitive_manual",
    "optional_no_value"
  ].includes(
    classifyExpectedAnswerSource(field)
  );
}

function looksConditional(field: Pick<DetectedField, "label" | "questionText" | "nearbyText">) {
  const text = normalizeText([field.label, field.questionText, field.nearbyText].filter(Boolean).join(" "));
  return (
    /^if\b/.test(text) ||
    /if yes\b/.test(text) ||
    /if no\b/.test(text) ||
    /if your institution/.test(text) ||
    /if you responded ["']?other/.test(text) ||
    /if applicable/.test(text) ||
    /please specify if other/.test(text)
  );
}

function looksBehavioralStoryPrompt(field: Pick<DetectedField, "label" | "questionText" | "nearbyText">) {
  const text = normalizeText([field.label, field.questionText, field.nearbyText].filter(Boolean).join(" "));
  return (
    /tell us about a time/.test(text) ||
    /describe a time/.test(text) ||
    /give an example/.test(text) ||
    /walk us through/.test(text) ||
    /challenge you faced/.test(text) ||
    /conflict you handled/.test(text) ||
    /failure you learned/.test(text)
  );
}

function looksOptionalOpenText(field: Pick<DetectedField, "label" | "questionText" | "nearbyText" | "isRequired">) {
  const text = normalizeText([field.label, field.questionText, field.nearbyText].filter(Boolean).join(" "));
  return (
    !field.isRequired &&
    (/additional information/.test(text) ||
      /anything else/.test(text) ||
      /summary/.test(text) ||
      /headline/.test(text) ||
      /cover letter/.test(text) ||
      /optional/.test(text))
  );
}

function classifyCoverage(field: DetectedField, expectedSource: ExpectedAnswerSource) {
  const conditional = looksConditional(field);
  const behavioral = looksBehavioralStoryPrompt(field);
  const optionalOpenText = looksOptionalOpenText(field);

  let coverageClassification: CoverageClassification;
  if (conditional && !field.suggestedValue.trim()) {
    coverageClassification = "CONDITIONAL_NOT_APPLICABLE";
  } else if (expectedSource === "explicit_profile") {
    coverageClassification = "ANSWERABLE_NOW";
  } else if (
    [
      "derived_profile",
      "formatted_profile",
      "approved_fallback",
      "generatable_from_profile",
      "generatable_from_job_and_profile"
    ].includes(expectedSource)
  ) {
    coverageClassification = "ANSWERABLE_WITH_DERIVATION";
  } else if (["answer_bank", "reusable_saved_answer"].includes(expectedSource)) {
    coverageClassification = "ANSWERABLE_WITH_SAVED_RESPONSE";
  } else if (expectedSource === "requires_saved_story" || behavioral) {
    coverageClassification = "REQUIRES_BEHAVIORAL_STORY";
  } else if (expectedSource === "requires_one_user_fact") {
    coverageClassification = "ANSWERABLE_WITH_ONE_USER_FACT";
  } else if (expectedSource === "legal_or_sensitive_manual") {
    coverageClassification = "LEGAL_OR_SENSITIVE_MANUAL";
  } else if (expectedSource === "optional_no_value" || optionalOpenText) {
    coverageClassification = "OPTIONAL_SAFE_TO_SKIP";
  } else if (expectedSource === "unsupported_control" || expectedSource === "unsupported") {
    coverageClassification = "UNSUPPORTED_CONTROL";
  } else if (expectedSource === "intentionally_unresolved") {
    if (conditional) {
      coverageClassification = "CONDITIONAL_NOT_APPLICABLE";
    } else if (optionalOpenText) {
      coverageClassification = "OPTIONAL_SAFE_TO_SKIP";
    } else if (
      /accommodate|accommodation|disability|gender|ethnicity|veteran|background check|consent|attest|legal/i.test(
        normalizeText([field.label, field.questionText, field.nearbyText].filter(Boolean).join(" "))
      )
    ) {
      coverageClassification = "LEGAL_OR_SENSITIVE_MANUAL";
    } else {
      coverageClassification = "ANSWERABLE_WITH_ONE_USER_FACT";
    }
  } else {
    coverageClassification = "UNSUPPORTED_CONTROL";
  }

  const safeAnswerableNow = [
    "ANSWERABLE_NOW",
    "ANSWERABLE_WITH_DERIVATION",
    "ANSWERABLE_WITH_SAVED_RESPONSE"
  ].includes(coverageClassification);
  const userExpectedAnswerable = safeAnswerableNow || coverageClassification === "ANSWERABLE_WITH_ONE_USER_FACT";
  const profileEvidenceAvailable: BenchmarkFieldRecord["profileEvidenceAvailable"] =
    coverageClassification === "ANSWERABLE_NOW" ||
    coverageClassification === "ANSWERABLE_WITH_DERIVATION" ||
    coverageClassification === "ANSWERABLE_WITH_SAVED_RESPONSE"
      ? "yes"
      : coverageClassification === "ANSWERABLE_WITH_ONE_USER_FACT" || coverageClassification === "REQUIRES_BEHAVIORAL_STORY"
        ? "partial"
        : coverageClassification === "OPTIONAL_SAFE_TO_SKIP" || coverageClassification === "CONDITIONAL_NOT_APPLICABLE"
          ? "not_applicable"
          : "no";
  const excludedFromAnswerableDenominatorReason =
    coverageClassification === "ANSWERABLE_WITH_ONE_USER_FACT"
      ? "Excluded because ApplyPilot still needs one reusable user fact before it can answer this safely."
      : coverageClassification === "REQUIRES_BEHAVIORAL_STORY"
        ? "Excluded because this prompt needs a saved behavioral story rather than a generic generated answer."
        : coverageClassification === "LEGAL_OR_SENSITIVE_MANUAL"
          ? "Excluded because this prompt is legally sensitive or requires explicit human judgment."
          : coverageClassification === "OPTIONAL_SAFE_TO_SKIP"
            ? "Excluded because leaving this optional prompt blank is currently safer than improvising."
            : coverageClassification === "UNSUPPORTED_CONTROL"
              ? "Excluded because the current classifier or control adapter does not safely support this control yet."
              : coverageClassification === "CONDITIONAL_NOT_APPLICABLE"
                ? "Excluded because this conditional prompt is not currently applicable from the surrounding answers."
                : "Included in the current safe-answer denominator.";

  return {
    coverageClassification,
    safeAnswerableNow,
    userExpectedAnswerable,
    profileEvidenceAvailable,
    excludedFromAnswerableDenominatorReason,
    reasonableUserWouldExpectApplyPilotToAnswer: userExpectedAnswerable,
    oneAdditionalProfileFactCouldAnswer: coverageClassification === "ANSWERABLE_WITH_ONE_USER_FACT",
    genuinelyUnsafeToAnswer: coverageClassification === "LEGAL_OR_SENSITIVE_MANUAL"
  };
}

function isDropdownField(field: Pick<DetectedField, "controlType">) {
  return ["native_select", "aria_combobox", "autocomplete", "listbox", "menu_button", "custom_select"].includes(field.controlType || "");
}

function isAutocompleteField(field: Pick<DetectedField, "controlType" | "intent">) {
  if (!["aria_combobox", "autocomplete"].includes(field.controlType || "")) return false;
  return ["city", "location", "full_location", "education_school", "education_major", "employer"].includes(field.intent || "");
}

function isFileUploadField(field: Pick<DetectedField, "type" | "controlType">) {
  return field.type === "file" || field.controlType === "file";
}

function selectedAdapterForField(field: Pick<DetectedField, "type" | "controlType" | "role">) {
  if (field.type === "file") return "handleFileUpload";
  if (field.type === "radio") return "handleRadioGroup";
  if (field.type === "checkbox") return "handleCheckbox";
  if (field.controlType === "native_select") return "fillNativeSelect";
  if (field.controlType === "aria_combobox" || field.controlType === "autocomplete" || field.role === "combobox") return "fillAutocompleteControl";
  if (field.controlType === "listbox" || field.controlType === "menu_button" || field.controlType === "custom_select") return "fillCustomCombobox";
  return "fillTextControl";
}

function isClearlyFinalAction(label: string) {
  const normalized = normalizeText(label);
  return (
    /submit\b/.test(normalized) ||
    /send application/.test(normalized) ||
    /finish and submit/.test(normalized) ||
    /complete application/.test(normalized) ||
    /review and submit/.test(normalized) ||
    /^confirm$/.test(normalized)
  );
}

function isVisibleActionAllowed(label: string) {
  return !SOCIAL_LOGIN_PATTERNS.some((pattern) => pattern.test(label));
}

async function listVisibleActions(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"]) {
  return page.evaluate(() => {
    const overlaySelector = "#applypilot-overlay, #applypilot-workday-overlay";
    const candidates = Array.from(
      document.querySelectorAll(
        [
          "button",
          "a[href]",
          '[role="button"]',
          'input[type="button"]',
          'input[type="submit"]'
        ].join(", ")
      )
    );

    return candidates
      .map((element, index) => {
        const el = element as HTMLElement;
        if (el.closest(overlaySelector)) {
          return null;
        }
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || rect.width <= 0 || rect.height <= 0) {
          return null;
        }

        const id = el.getAttribute("data-applypilot-action-id") || `applypilot-action-${index}`;
        el.setAttribute("data-applypilot-action-id", id);
        const container = el.closest("form, section, article, div") as HTMLElement | null;
        const label =
          element instanceof HTMLInputElement
            ? (element.value || "").trim()
            : (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();

        return {
          id,
          label,
          tagName: el.tagName.toLowerCase(),
          type: element instanceof HTMLInputElement || element instanceof HTMLButtonElement ? element.getAttribute("type") || "" : "",
          role: el.getAttribute("role") || "",
          href: element instanceof HTMLAnchorElement ? element.href : "",
          disabled:
            element instanceof HTMLButtonElement || element instanceof HTMLInputElement
              ? element.disabled
              : el.getAttribute("aria-disabled") === "true",
          containerText: (container?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 220)
        };
      })
      .filter((item): item is VisibleAction => Boolean(item?.label));
  });
}

function chooseEntryAction(actions: VisibleAction[], visibleFieldCount: number) {
  if (visibleFieldCount > 0) return null;

  return (
    actions.find(
      (action) =>
        !action.disabled &&
        isVisibleActionAllowed(action.label) &&
        ENTRY_ACTION_PATTERNS.some((pattern) => pattern.test(action.label)) &&
        !isClearlyFinalAction(action.label)
    ) ?? null
  );
}

function chooseContinueAction(actions: VisibleAction[]) {
  return (
    actions.find(
      (action) =>
        !action.disabled &&
        isVisibleActionAllowed(action.label) &&
        CONTINUE_ACTION_PATTERNS.some((pattern) => pattern.test(action.label)) &&
        !isClearlyFinalAction(action.label) &&
        !isFinalSubmitLabel(action.label)
    ) ?? null
  );
}

async function clickVisibleAction(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"], action: VisibleAction) {
  const locator = page.locator(`[data-applypilot-action-id="${action.id}"]`).first();
  try {
    await locator.click({ timeout: 15_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/intercepts pointer events/i.test(message)) {
      await dismissCookieConsentIfPresent(page, { waitForAppearanceMs: 2_500 });
      const clicked = await locator
        .click({ timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        await locator.evaluate((element) => {
          (element as HTMLElement).click();
        });
      }
    } else {
      throw error;
    }
  }
  await waitForPageReadiness(page);
}

async function detectSiteUnavailable(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"]) {
  const text = cleanText(await page.locator("body").innerText().catch(() => ""));
  return detectUnavailableText(text);
}

async function collectVisibleFieldInventory(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"]): Promise<{
  fields: RawScannedField[];
  stats: LogicalFieldPreparationStats;
}> {
  const frames = page.frames();
  const fields: RawScannedField[] = [];

  for (const frame of frames) {
    const scanned: RawScannedField[] = await evaluateVisibleFieldCandidates(frame, {
        prefix: `bench_${Date.now()}_${fields.length}`,
        selectorAttribute: "data-applypilot-benchmark-id",
        groupAttribute: "data-applypilot-benchmark-group-id",
        url: frame.url(),
        name: frame.name() || ""
      }).catch(() => []);

    fields.push(...scanned);
  }

  return prepareLogicalFields(fields);
}

async function readDisplayedValue(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"], field: DetectedField) {
  const locator = page.locator(field.selector).first();
  const attached = await locator
    .waitFor({
      state: "attached",
      timeout: 1_500
    })
    .then(() => true)
    .catch(() => false);

  if (!attached) {
    return "";
  }

  return locator.evaluate((element) => {
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

async function readDisplayedValues(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"], fields: DetectedField[]) {
  const values = new Map<string, string>();
  for (const field of fields) {
    const key = fieldIdentityKey(field);
    const value = await readDisplayedValue(page, field).catch(() => "");
    values.set(key, value);
  }
  return values;
}

function shouldRunSecondPass(session: ApplicationSession) {
  return (
    session.fieldsDetected > 0 &&
    session.detectedFields.some((field) => isDropdownField(field) || isFileUploadField(field) || field.status === "error" || field.status === "needs_review")
  );
}

function classifyFailureCategory(field: DetectedField, expectedSource: ExpectedAnswerSource): FailureCategory | null {
  if (field.verificationStatus === "verified" && (field.status === "filled" || Boolean(field.shortAnswer?.generated && field.suggestedValue.trim()))) {
    return null;
  }

  const reason = normalizeText(field.reason || field.verificationMessage || "");

  if (expectedSource === "intentionally_unresolved") return "INTENTIONALLY_UNRESOLVED";
  if (
    ["requires_saved_story", "requires_one_user_fact", "legal_or_sensitive_manual", "optional_no_value"].includes(
      expectedSource
    )
  ) {
    return "INTENTIONALLY_UNRESOLVED";
  }
  if (field.intent === "unknown" && !field.label.trim()) return "LABEL_ASSOCIATION_FAILED";
  if (field.intent === "unknown") return "INTENT_CLASSIFICATION_FAILED";
  if (reason.includes("no saved") || reason.includes("set to ask each time")) return "PROFILE_FACT_MISSING";
  if (reason.includes("cannot safely answer") || reason.includes("left this answer for manual review") || reason.includes("not marked complete")) {
    return "INTENTIONALLY_UNRESOLVED";
  }
  if (reason.includes("not compatible with this field format")) return "FORMAT_ADAPTATION_FAILED";
  if (reason.includes("no matching dropdown option found")) return "OPTION_MATCHING_FAILED";
  if (reason.includes("dropdown did not open")) return "CONTROL_ADAPTER_FAILED";
  if (reason.includes("could not be found on the page")) return "NAVIGATION_FAILED";
  if (field.verificationStatus === "failed") return "VERIFICATION_FAILED";
  if (field.status === "error") return "CONTROL_ADAPTER_FAILED";
  if (field.status === "needs_review" && !field.suggestedValue.trim()) return "PROFILE_FACT_MISSING";
  if (field.status === "needs_review") return "ANSWER_DERIVATION_FAILED";
  return "CONTROL_ADAPTER_FAILED";
}

function summarizeFailureCategories(records: BenchmarkFieldRecord[]) {
  const summary = {
    FIELD_NOT_DETECTED: 0,
    LABEL_ASSOCIATION_FAILED: 0,
    INTENT_CLASSIFICATION_FAILED: 0,
    PROFILE_FACT_MISSING: 0,
    ANSWER_DERIVATION_FAILED: 0,
    FORMAT_ADAPTATION_FAILED: 0,
    CONTROL_ADAPTER_FAILED: 0,
    OPTION_MATCHING_FAILED: 0,
    VERIFICATION_FAILED: 0,
    NAVIGATION_FAILED: 0,
    METADATA_EXTRACTION_FAILED: 0,
    PAGE_NOT_READY: 0,
    SITE_UNAVAILABLE: 0,
    INTENTIONALLY_UNRESOLVED: 0
  } satisfies Record<FailureCategory, number>;

  for (const record of records) {
    if (record.failureCategory) {
      summary[record.failureCategory] += 1;
    }
  }

  return summary;
}

function buildStageInventory({
  testCase,
  pageNumber,
  pageUrl,
  pageHeading,
  expectedFields,
  detectedFields,
  displayedValues
}: {
  testCase: BenchmarkCase;
  pageNumber: number;
  pageUrl: string;
  pageHeading: string;
  expectedFields: DetectedField[];
  detectedFields: DetectedField[];
  displayedValues: Map<string, string>;
}) {
  const detectedMap = new Map(detectedFields.map((field) => [fieldIdentityKey(field), field]));

  return expectedFields.map<BenchmarkFieldRecord>((expectedField) => {
    const identity = fieldIdentityKey(expectedField);
    const detected = detectedMap.get(identity) ?? null;
    const generatedShortAnswer = detected?.shortAnswer ?? expectedField.shortAnswer ?? null;
    const expectedSource = classifyExpectedAnswerSource(expectedField);
    const answerable = isAnswerableField(expectedField);
    const coverage = classifyCoverage(expectedField, expectedSource);
    const actualValue = displayedValues.get(identity) || detected?.detectedValue || "";
    const attempted = Boolean(detected && detected.verificationStatus !== "not_attempted");
    const browserVerified = Boolean(
      detected &&
        detected.verificationStatus === "verified" &&
        (detected.status === "filled" || Boolean(detected.shortAnswer?.generated && actualValue.trim()))
    );
    const qualityPassed = generatedShortAnswer?.generated ? Boolean(generatedShortAnswer.quality?.passed) : true;
    const verified = browserVerified && qualityPassed;
    const outcome =
      !detected
        ? "not_detected"
        : detected.status === "filled"
          ? "filled"
          : detected.status === "error"
            ? "error"
            : detected.status === "skipped"
              ? "skipped"
              : "needs_review";

    const failureCategory = !detected ? "FIELD_NOT_DETECTED" : classifyFailureCategory(detected, expectedSource);

    return {
      applicationId: testCase.id,
      ats: testCase.ats,
      company: testCase.company,
      roleTitle: testCase.roleTitle,
      pageNumber,
      pageUrl,
      pageHeading,
      fieldLabel: expectedField.label,
      nearbyQuestionText: expectedField.nearbyText || expectedField.questionText || "",
      required: Boolean(expectedField.isRequired),
      domControlType: expectedField.controlType || expectedField.type,
      selectedAdapter: selectedAdapterForField(expectedField),
      detectedIntent: expectedField.intent,
      expectedAnswerSource: expectedSource,
      expectedNormalizedAnswer: cleanText(expectedField.suggestedValue),
      availableOptions: expectedField.selectOptions ?? [],
      attemptedValue: detected?.suggestedValue || expectedField.suggestedValue,
      actualValueAfterFill: actualValue,
      browserVerified,
      verified,
      outcome,
      failureCategory,
      failureReason: !detected ? "Visible control was present in the benchmark inventory but not discovered by ApplyPilot." : detected.reason || detected.verificationMessage || "",
      answerable,
      coverageClassification: coverage.coverageClassification,
      safeAnswerableNow: coverage.safeAnswerableNow,
      userExpectedAnswerable: coverage.userExpectedAnswerable,
      profileEvidenceAvailable: coverage.profileEvidenceAvailable,
      excludedFromAnswerableDenominatorReason: coverage.excludedFromAnswerableDenominatorReason,
      reasonableUserWouldExpectApplyPilotToAnswer: coverage.reasonableUserWouldExpectApplyPilotToAnswer,
      oneAdditionalProfileFactCouldAnswer: coverage.oneAdditionalProfileFactCouldAnswer,
      genuinelyUnsafeToAnswer: coverage.genuinelyUnsafeToAnswer,
      severe: SEVERE_INTENTS.has(expectedField.intent),
      detected: Boolean(detected),
      attempted,
      shortAnswerKind: expectedField.shortAnswer?.kind || "",
      generatedProvider: generatedShortAnswer?.provider || "",
      generatedEvidenceTitles: generatedShortAnswer?.evidenceTitles || [],
      generatedJobEvidenceTitles: generatedShortAnswer?.jobEvidenceTitles || [],
      generatedWarnings: generatedShortAnswer?.warnings || [],
      generatedRegenerationNotes: generatedShortAnswer?.regenerationNotes || [],
      qualityPassed,
      qualityReasons: generatedShortAnswer?.quality?.reasons || [],
      qualityFactualGrounding: generatedShortAnswer?.quality?.factualGrounding ?? 0,
      qualityQuestionRelevance: generatedShortAnswer?.quality?.questionRelevance ?? 0,
      qualityJobRelevance: generatedShortAnswer?.quality?.jobRelevance ?? 0,
      qualityCandidateRelevance: generatedShortAnswer?.quality?.candidateRelevance ?? 0,
      qualityFluency: generatedShortAnswer?.quality?.fluency ?? 0,
      qualitySpecificity: generatedShortAnswer?.quality?.specificity ?? 0,
      qualityConcision: generatedShortAnswer?.quality?.concision ?? 0
    };
  });
}

async function getPageHeading(page: Awaited<ReturnType<typeof launchBrowserSession>>["page"]) {
  const heading = await page.locator("h1, h2").first().textContent().catch(() => "");
  return cleanText(heading);
}

async function preparePageForBenchmark(
  page: Awaited<ReturnType<typeof launchBrowserSession>>["page"],
  manualBarriers: string[],
  actionsTaken: string[]
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitForPageReadiness(page);
    const dismissedConsent = await dismissCookieConsentIfPresent(page, { waitForAppearanceMs: 1_500 });
    if (dismissedConsent) {
      actionsTaken.push("Dismissed cookie or consent dialog before scanning the application page.");
      await waitForPageReadiness(page);
    }

    const unavailable = await detectSiteUnavailable(page);
    if (unavailable) {
      manualBarriers.push("Job posting appears unavailable.");
      return { status: "site_unavailable" as const };
    }

    const loginRequired = await detectLoginRequirement(page);
    if (loginRequired) {
      manualBarriers.push("Login or account verification is required before the application form is available.");
      return { status: "manual_barrier" as const };
    }

    const visibleFieldInventory = await collectVisibleFieldInventory(page);
    if (visibleFieldInventory.fields.length > 0) {
      return { status: "ready" as const };
    }

    const actions = await listVisibleActions(page);
    const entryAction = chooseEntryAction(actions, visibleFieldInventory.fields.length);
    if (!entryAction) {
      const captcha = await detectCaptcha(page);
      if (captcha.status === "confirmed_visible_challenge") {
        manualBarriers.push("Visible human-verification challenge is present before the form becomes available.");
        return { status: "manual_barrier" as const };
      }

      manualBarriers.push("No visible application fields and no safe entry action were available.");
      return { status: "manual_barrier" as const };
    }

    actionsTaken.push(`Clicked entry action: ${entryAction.label}`);
    await clickVisibleAction(page, entryAction);
  }

  manualBarriers.push("ApplyPilot could not reach a visible application form after safe entry attempts.");
  return { status: "failed_runtime" as const };
}

async function maybeAdvanceToNextPage(
  page: Awaited<ReturnType<typeof launchBrowserSession>>["page"],
  stageRecords: BenchmarkFieldRecord[],
  actionsTaken: string[]
) {
  const requiredBlocking = stageRecords.some(
    (record) =>
      record.required &&
      record.answerable &&
      ["needs_review", "error", "not_detected"].includes(record.outcome) &&
      record.failureCategory !== "INTENTIONALLY_UNRESOLVED"
  );

  if (requiredBlocking) {
    return false;
  }

  const actions = await listVisibleActions(page);
  const continueAction = chooseContinueAction(actions);
  if (!continueAction) {
    return false;
  }

  actionsTaken.push(`Clicked navigation action: ${continueAction.label}`);
  await clickVisibleAction(page, continueAction);
  return true;
}

async function captureBenchmarkScreenshot(
  page: Awaited<ReturnType<typeof launchBrowserSession>>["page"],
  screenshotPath: string,
  warnings: string[]
) {
  try {
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      timeout: 12_000
    });
    return true;
  } catch (error) {
    warnings.push(`Screenshot capture skipped: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function metricsFromInventory(records: BenchmarkFieldRecord[]) {
  const answerable = records.filter((record) => record.answerable);
  const safeAnswerable = records.filter((record) => record.safeAnswerableNow);
  const userExpected = records.filter((record) => record.userExpectedAnswerable);
  const detected = answerable.filter((record) => record.detected);
  const attempted = answerable.filter((record) => record.attempted);
  const verified = answerable.filter((record) => record.verified);
  const safeVerified = safeAnswerable.filter((record) => record.verified);
  const userExpectedVerified = userExpected.filter((record) => record.verified);
  const dropdowns = answerable.filter((record) => isDropdownField({ controlType: record.domControlType as DetectedField["controlType"] }));
  const dropdownVerified = dropdowns.filter((record) => record.verified);
  const autocompletes = answerable.filter((record) =>
    isAutocompleteField({ controlType: record.domControlType as DetectedField["controlType"], intent: record.detectedIntent as DetectedField["intent"] })
  );
  const autocompleteVerified = autocompletes.filter((record) => record.verified);
  const fileUploads = answerable.filter((record) => isResumeUploadRecord(record) || record.domControlType === "file");
  const fileUploadVerified = fileUploads.filter((record) => record.verified);
  const severeFieldFailures = answerable.filter((record) => record.severe && record.attempted && !record.verified).length;
  const severeIncorrectAnswers = answerable.filter((record) => record.severe && record.verified && record.failureCategory !== null).length;
  const generatableShortAnswers = records.filter((record) =>
    ["generatable_from_profile", "generatable_from_job_and_profile"].includes(record.expectedAnswerSource)
  );
  const reusableShortAnswers = records.filter((record) => record.expectedAnswerSource === "reusable_saved_answer");
  const generatableDetected = generatableShortAnswers.filter((record) => record.detected);
  const generatedAnswers = generatableShortAnswers.filter((record) => Boolean(record.generatedProvider));
  const generatedInserted = generatedAnswers.filter((record) => Boolean(cleanText(record.attemptedValue || record.actualValueAfterFill)));
  const generatedBrowserVerified = generatedAnswers.filter((record) => record.browserVerified);
  const generatedQualityPassed = generatedAnswers.filter((record) => record.browserVerified && record.qualityPassed);
  const generatedQualityRejected = generatedAnswers.filter((record) => !record.qualityPassed);
  const generatableFilled = generatedQualityPassed;

  return {
    answerableCount: answerable.length,
    detectedCount: detected.length,
    attemptedCount: attempted.length,
    verifiedCount: verified.length,
    safeAnswerableCount: safeAnswerable.length,
    safeVerifiedCount: safeVerified.length,
    safeAnswerCoverage: roundRatio(safeVerified.length, safeAnswerable.length),
    userExpectedCount: userExpected.length,
    userExpectedVerifiedCount: userExpectedVerified.length,
    userExpectedCoverage: roundRatio(userExpectedVerified.length, userExpected.length),
    dropdownCount: dropdowns.length,
    dropdownVerifiedCount: dropdownVerified.length,
    autocompleteCount: autocompletes.length,
    autocompleteVerifiedCount: autocompleteVerified.length,
    fileUploadCount: fileUploads.length,
    fileUploadVerifiedCount: fileUploadVerified.length,
    fieldDetectionRecall: roundRatio(detected.length, answerable.length),
    fillCoverage: roundRatio(verified.length, answerable.length),
    fillPrecision: roundRatio(verified.length, attempted.length),
    dropdownSuccess: roundRatio(dropdownVerified.length, dropdowns.length),
    autocompleteSuccess: roundRatio(autocompleteVerified.length, autocompletes.length),
    fileUploadSuccess: roundRatio(fileUploadVerified.length, fileUploads.length),
    severeFieldFailures,
    severeIncorrectAnswers,
    generatableQuestionCount: generatableShortAnswers.length,
    generatableShortAnswersDetected: generatableDetected.length,
    generatedAnswerCount: generatedAnswers.length,
    generatedAnswersInserted: generatedInserted.length,
    generatedAnswersBrowserVerified: generatedBrowserVerified.length,
    generatedAnswersPassingQuality: generatedQualityPassed.length,
    generatedAnswersRejectedForQuality: generatedQualityRejected.length,
    generatableShortAnswersFilled: generatableFilled.length,
    rawShortAnswerCoverage: roundRatio(generatedInserted.length, generatableShortAnswers.length),
    qualityApprovedShortAnswerCoverage: roundRatio(generatedQualityPassed.length, generatableShortAnswers.length),
    humanReadyShortAnswerCoverage: roundRatio(generatedQualityPassed.length, generatableShortAnswers.length),
    generatableShortAnswerCoverage: roundRatio(generatableFilled.length, generatableShortAnswers.length),
    reusableAnswersFilled: reusableShortAnswers.filter((record) => record.verified).length,
    missingEvidenceQuestions: records.filter((record) =>
      ["requires_saved_story", "requires_one_user_fact"].includes(record.expectedAnswerSource)
    ).length,
    generatedAnswersRequiringCorrection: generatedAnswers.filter((record) => !record.browserVerified || !record.qualityPassed).length,
    generatedAnswersAcceptedWithoutEdit: generatedQualityPassed.length
  };
}

function manualEffortFromInventory(records: BenchmarkFieldRecord[], retriesRequired: number, unexpectedPageSwitches: number): ManualEffort {
  return {
    manualClicksRequired: records.filter((record) => record.failureCategory === "PAGE_NOT_READY" || record.failureCategory === "NAVIGATION_FAILED").length,
    manualFieldsRequired: records.filter((record) => record.required && ["needs_review", "error", "not_detected"].includes(record.outcome)).length,
    unexpectedPageSwitches,
    retriesRequired,
    incorrectFieldsRequiringCorrection: records.filter((record) => record.attempted && !record.verified).length
  };
}

function shouldPreserveCompletedStatusAfterLateFailure(
  currentStatus: BenchmarkCaseStatus,
  failureMessage: string,
  records: BenchmarkFieldRecord[]
) {
  const normalizedFailure = normalizeText(failureMessage);
  const lateArtifactFailure =
    /target page, context or browser has been closed|page has been closed|browser has been closed|context has been closed/i.test(
      normalizedFailure
    );
  const answerableRecords = records.filter((record) => record.answerable);
  const fullyVerified = answerableRecords.length > 0 && answerableRecords.every((record) => record.verified);

  return currentStatus === "completed" && lateArtifactFailure && fullyVerified;
}

function buildCaseResultFromProgress({
  testCase,
  suiteRunId,
  suiteStartedAt,
  caseStartedAt,
  finalStatus,
  metadata,
  stageResults,
  allFieldRecords,
  transitionsAttempted,
  retriesRequired,
  unexpectedPageSwitches,
  manualBarriers,
  warnings,
  tracePath,
  screenshotPaths,
  fieldInventoryPath,
  reportPath
}: {
  testCase: BenchmarkCase;
  suiteRunId: string;
  suiteStartedAt: string;
  caseStartedAt: string;
  finalStatus: BenchmarkCaseStatus;
  metadata: { company: string; roleTitle: string; source: string };
  stageResults: StageResult[];
  allFieldRecords: BenchmarkFieldRecord[];
  transitionsAttempted: number;
  retriesRequired: number;
  unexpectedPageSwitches: number;
  manualBarriers: string[];
  warnings: string[];
  tracePath: string;
  screenshotPaths: string[];
  fieldInventoryPath: string;
  reportPath: string;
}): BenchmarkCaseResult {
  const metrics = metricsFromInventory(allFieldRecords);
  const metadataSuccess = metadataMatches(testCase.company, metadata.company) && metadataMatches(testCase.roleTitle, metadata.roleTitle);

  return {
    suiteRunId,
    suiteStartedAt,
    caseStartedAt,
    caseFinishedAt: nowStamp(),
    id: testCase.id,
    ats: testCase.ats,
    phase: testCase.phase,
    company: testCase.company,
    roleTitle: testCase.roleTitle,
    url: testCase.url,
    status: finalStatus,
    metadata: {
      expectedCompany: testCase.company,
      expectedRoleTitle: testCase.roleTitle,
      actualCompany: metadata.company,
      actualRoleTitle: metadata.roleTitle,
      success: metadataSuccess,
      source: metadata.source
    },
    pagesReached: stageResults.length,
    pagesFilled: stageResults.filter((stage) => stage.inventory.some((record) => record.verified)).length,
    transitionsAttempted,
    transitionsContinued: Math.min(transitionsAttempted, Math.max(stageResults.length - 1, 0)),
    finalReviewPageReached: false,
    rawDomCandidateCount: stageResults.reduce((sum, stage) => sum + stage.initialRawFieldCount, 0),
    noiseRejectedCount: stageResults.reduce((sum, stage) => sum + stage.noiseRejectedCount, 0),
    logicalFieldCount: stageResults.reduce((sum, stage) => sum + stage.logicalFieldCount, 0),
    answerableFieldCount: metrics.answerableCount,
    intentionallyUnresolvedCount: stageResults.reduce((sum, stage) => sum + stage.intentionallyUnresolvedCount, 0),
    detectedCount: metrics.detectedCount,
    attemptedCount: metrics.attemptedCount,
    verifiedCount: metrics.verifiedCount,
    safeAnswerableFieldCount: metrics.safeAnswerableCount,
    safeVerifiedCount: metrics.safeVerifiedCount,
    safeAnswerCoverage: metrics.safeAnswerCoverage,
    userExpectedFieldCount: metrics.userExpectedCount,
    userExpectedVerifiedCount: metrics.userExpectedVerifiedCount,
    userExpectedCoverage: metrics.userExpectedCoverage,
    dropdownCount: metrics.dropdownCount,
    dropdownVerifiedCount: metrics.dropdownVerifiedCount,
    autocompleteCount: metrics.autocompleteCount,
    autocompleteVerifiedCount: metrics.autocompleteVerifiedCount,
    fileUploadCount: metrics.fileUploadCount,
    fileUploadVerifiedCount: metrics.fileUploadVerifiedCount,
    fieldDetectionRecall: metrics.fieldDetectionRecall,
    fillCoverage: metrics.fillCoverage,
    fillPrecision: metrics.fillPrecision,
    dropdownSuccess: metrics.dropdownSuccess,
    autocompleteSuccess: metrics.autocompleteSuccess,
    fileUploadSuccess: metrics.fileUploadSuccess,
    severeIncorrectAnswers: metrics.severeIncorrectAnswers,
    severeFieldFailures: metrics.severeFieldFailures,
    generatableQuestionCount: metrics.generatableQuestionCount,
    generatableShortAnswersDetected: metrics.generatableShortAnswersDetected,
    generatedAnswerCount: metrics.generatedAnswerCount,
    generatedAnswersInserted: metrics.generatedAnswersInserted,
    generatedAnswersBrowserVerified: metrics.generatedAnswersBrowserVerified,
    generatedAnswersPassingQuality: metrics.generatedAnswersPassingQuality,
    generatedAnswersRejectedForQuality: metrics.generatedAnswersRejectedForQuality,
    generatableShortAnswersFilled: metrics.generatableShortAnswersFilled,
    rawShortAnswerCoverage: metrics.rawShortAnswerCoverage,
    qualityApprovedShortAnswerCoverage: metrics.qualityApprovedShortAnswerCoverage,
    humanReadyShortAnswerCoverage: metrics.humanReadyShortAnswerCoverage,
    generatableShortAnswerCoverage: metrics.generatableShortAnswerCoverage,
    reusableAnswersFilled: metrics.reusableAnswersFilled,
    missingEvidenceQuestions: metrics.missingEvidenceQuestions,
    generatedAnswersRequiringCorrection: metrics.generatedAnswersRequiringCorrection,
    generatedAnswersAcceptedWithoutEdit: metrics.generatedAnswersAcceptedWithoutEdit,
    manualEffort: manualEffortFromInventory(allFieldRecords, retriesRequired, unexpectedPageSwitches),
    manualBarriers,
    warnings: Array.from(new Set(warnings)),
    failureCategories: summarizeFailureCategories(allFieldRecords),
    stageResults,
    tracePath,
    screenshotPaths,
    fieldInventoryPath,
    reportPath,
    submitted: false
  };
}

async function runCase(
  testCase: BenchmarkCase,
  fixtures: SyntheticFixtures,
  suiteRunId: string,
  suiteStartedAt: string,
  progress: CaseExecutionProgress = { stage: "initializing_case" }
) {
  const caseDir = path.join(DEBUG_DIR, testCase.id);
  await rm(caseDir, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(caseDir, { recursive: true });
  const caseStartedAt = nowStamp();

  const screenshotPaths: string[] = [];
  const manualBarriers: string[] = [];
  const warnings: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: Array<ReturnType<typeof serializeError>> = [];
  const failedRequests: Array<{ url: string; failure: string | null }> = [];
  const stageResults: StageResult[] = [];
  const allFieldRecords: BenchmarkFieldRecord[] = [];
  const actionsTaken: string[] = [];

  const session = await createApplicationSession({
    company: testCase.company,
    roleTitle: testCase.roleTitle,
    jobUrl: testCase.url,
    source: "application-benchmark",
    notes: `Application benchmark run started ${nowStamp()}`
  });

  const tracePath = path.join(TRACE_DIR, `${testCase.id}.zip`);
  const fieldInventoryPath = path.join(FIELD_INVENTORY_DIR, `${testCase.id}.json`);
  const reportPath = path.join(caseDir, "report.json");
  await Promise.all([
    rm(tracePath, { force: true }).catch(() => undefined),
    rm(fieldInventoryPath, { force: true }).catch(() => undefined),
    rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-1-before.png`), { force: true }).catch(() => undefined),
    rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-1-after.png`), { force: true }).catch(() => undefined),
    rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-2-before.png`), { force: true }).catch(() => undefined),
    rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-2-after.png`), { force: true }).catch(() => undefined),
    rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-3-before.png`), { force: true }).catch(() => undefined),
    rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-3-after.png`), { force: true }).catch(() => undefined),
    rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-4-before.png`), { force: true }).catch(() => undefined),
    rm(path.join(SCREENSHOT_DIR, `${testCase.id}-page-4-after.png`), { force: true }).catch(() => undefined)
  ]);
  let finalStatus: BenchmarkCaseResult["status"] = "completed";
  let metadata = {
    company: testCase.company,
    roleTitle: testCase.roleTitle,
    source: "none"
  };
  let retriesRequired = 0;
  let unexpectedPageSwitches = 0;
  let transitionsAttempted = 0;

  const context = await getOrCreateBrowserContext();
  progress.stage = "starting_trace_capture";
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  try {
    progress.stage = "launching_browser_session";
    const runtime = await launchBrowserSession(testCase.url, session.id);
    const page = runtime.page;
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        consoleErrors.push(`[${message.type()}] ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(serializeError(error));
    });
    page.on("requestfailed", (request) => {
      failedRequests.push({
        url: request.url(),
        failure: request.failure()?.errorText ?? null
      });
    });

    progress.stage = "preflight_page_preparation";
    const preflight = await preparePageForBenchmark(page, manualBarriers, actionsTaken);
    if (preflight.status !== "ready") {
      finalStatus = preflight.status;
    } else {
      let currentPageNumber = 1;

      while (currentPageNumber <= 4) {
        progress.stage = `page_${currentPageNumber}_waiting_for_readiness`;
        await waitForPageReadiness(page);
        const pageUrl = page.url();
        progress.stage = `page_${currentPageNumber}_reading_heading`;
        const pageHeading = await getPageHeading(page);
        const screenshotBefore = path.join(SCREENSHOT_DIR, `${testCase.id}-page-${currentPageNumber}-before.png`);
        progress.stage = `page_${currentPageNumber}_capturing_before_screenshot`;
        if (await captureBenchmarkScreenshot(page, screenshotBefore, warnings)) {
          screenshotPaths.push(screenshotBefore);
        }

        progress.stage = `page_${currentPageNumber}_collecting_inventory`;
        const rawInventory = await collectVisibleFieldInventory(page);
        progress.stage = `page_${currentPageNumber}_building_expected_fields`;
        const expectedFields = buildSuggestedFields(rawInventory.fields, fixtures.profile, fixtures.answerBank, {
          company: testCase.company,
          roleTitle: testCase.roleTitle,
          source: "application-benchmark",
          notes: ""
        });
        progress.stage = `page_${currentPageNumber}_extracting_metadata`;
        const extractedMetadata = await extractJobMetadata(page);
        if (extractedMetadata.company || extractedMetadata.roleTitle) {
          metadata = extractedMetadata;
        }

        progress.stage = `page_${currentPageNumber}_autofill_pass_1`;
        let firstPass = await runAutofillPass(session.id);
        let secondPass = firstPass;
        if (shouldRunSecondPass(firstPass)) {
          retriesRequired += 1;
          progress.stage = `page_${currentPageNumber}_autofill_pass_2`;
          secondPass = await runAutofillPass(session.id);
        }

        const mergedDetected = mergeDetectedFields(firstPass.detectedFields, secondPass.detectedFields);
        progress.stage = `page_${currentPageNumber}_reading_displayed_values`;
        const displayedValues = await readDisplayedValues(page, mergedDetected);
        warnings.push(...secondPass.warnings);

        progress.stage = `page_${currentPageNumber}_building_stage_inventory`;
        const inventory = buildStageInventory({
          testCase,
          pageNumber: currentPageNumber,
          pageUrl,
          pageHeading,
          expectedFields,
          detectedFields: mergedDetected,
          displayedValues
        });

        stageResults.push({
          pageNumber: currentPageNumber,
          pageUrl,
          pageHeading,
          actionsTaken: actionsTaken.slice(),
          initialRawFieldCount: rawInventory.stats.rawCandidates,
          noiseRejectedCount: rawInventory.stats.noiseRejected,
          groupedControlCount: rawInventory.stats.groupedControls,
          deduplicatedFieldCount: rawInventory.stats.deduplicatedFields,
          logicalFieldCount: rawInventory.stats.logicalFields,
          answerableFieldCount: inventory.filter((record) => record.answerable).length,
          intentionallyUnresolvedCount: inventory.filter((record) => record.failureCategory === "INTENTIONALLY_UNRESOLVED").length,
          finalDetectedFieldCount: mergedDetected.length,
          inventory
        });
        allFieldRecords.push(...inventory);

        const screenshotAfter = path.join(SCREENSHOT_DIR, `${testCase.id}-page-${currentPageNumber}-after.png`);
        progress.stage = `page_${currentPageNumber}_capturing_after_screenshot`;
        if (await captureBenchmarkScreenshot(page, screenshotAfter, warnings)) {
          screenshotPaths.push(screenshotAfter);
        }

        progress.stage = `page_${currentPageNumber}_checking_for_next_step`;
        const movedForward = await maybeAdvanceToNextPage(page, inventory, actionsTaken);
        if (!movedForward) {
          break;
        }
        transitionsAttempted += 1;

        const newUrl = page.url();
        if (newUrl !== pageUrl) {
          unexpectedPageSwitches += 1;
        }
        currentPageNumber += 1;
      }

      progress.stage = "computing_case_metrics";
      const metrics = metricsFromInventory(allFieldRecords);
      if (finalStatus === "completed" && metrics.answerableCount === 0) {
        finalStatus = "not_scorable";
      }
      const metadataSuccess = metadataMatches(testCase.company, metadata.company) && metadataMatches(testCase.roleTitle, metadata.roleTitle);
      if (!metadataSuccess) {
        warnings.push("Metadata extraction did not fully match the expected company and role.");
      }

      progress.stage = "writing_case_artifacts";
      const result = {
        ...buildCaseResultFromProgress({
          testCase,
          suiteRunId,
          suiteStartedAt,
          caseStartedAt,
          finalStatus,
          metadata,
          stageResults,
          allFieldRecords,
          transitionsAttempted,
          retriesRequired,
          unexpectedPageSwitches,
          manualBarriers,
          warnings,
          tracePath,
          screenshotPaths,
          fieldInventoryPath,
          reportPath
        }),
        finalReviewPageReached: actionsTaken.some((entry) => /review/i.test(entry))
      } satisfies BenchmarkCaseResult;

      await writeFile(fieldInventoryPath, JSON.stringify(stageResults, null, 2), "utf8");
      await writeFile(reportPath, JSON.stringify(result, null, 2), "utf8");
      await writeFile(path.join(caseDir, "console-errors.log"), consoleErrors.join("\n"), "utf8");
      await writeFile(path.join(caseDir, "page-errors.json"), JSON.stringify(pageErrors, null, 2), "utf8");
      await writeFile(path.join(caseDir, "failed-requests.json"), JSON.stringify(failedRequests, null, 2), "utf8");

      await updateApplicationSession(session.id, (current) => ({
        ...current,
        notes: `${current.notes}\nBenchmark run completed ${nowStamp()}`
      })).catch(() => undefined);

      progress.stage = "case_completed";
      return result;
    }
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);
    if (shouldPreserveCompletedStatusAfterLateFailure(finalStatus, failureMessage, allFieldRecords)) {
      warnings.push(`Late benchmark artifact warning after successful autofill: ${failureMessage}`);
    } else {
      finalStatus = "failed_runtime";
      manualBarriers.push(failureMessage);
    }
  } finally {
    progress.stage = "closing_trace_and_browser";
    await context.tracing.stop({ path: tracePath }).catch(() => undefined);
    await closeSessionPage(session.id).catch(() => undefined);
  }

  progress.stage = "writing_fallback_case_artifacts";
  const fallbackResult = buildCaseResultFromProgress({
    testCase,
    suiteRunId,
    suiteStartedAt,
    caseStartedAt,
    finalStatus,
    metadata,
    stageResults,
    allFieldRecords,
    transitionsAttempted,
    retriesRequired,
    unexpectedPageSwitches,
    manualBarriers,
    warnings,
    tracePath,
    screenshotPaths,
    fieldInventoryPath,
    reportPath
  });

  await writeFile(fieldInventoryPath, JSON.stringify(stageResults, null, 2), "utf8").catch(() => undefined);
  await writeFile(reportPath, JSON.stringify(fallbackResult, null, 2), "utf8").catch(() => undefined);
  return fallbackResult;
}

async function readPersistedCaseReport(reportPath: string, suiteRunId: string) {
  try {
    const raw = await readFile(reportPath, "utf8");
    const parsed = JSON.parse(raw) as BenchmarkCaseResult;
    return resultBelongsToSuiteRun(parsed, suiteRunId) ? parsed : null;
  } catch {
    return null;
  }
}

function timedOutCaseResult(
  testCase: BenchmarkCase,
  startedAt: string,
  suiteRunId: string,
  suiteStartedAt: string,
  stage = "unknown_stage"
): BenchmarkCaseResult {
  const caseDir = path.join(DEBUG_DIR, testCase.id);
  const tracePath = path.join(TRACE_DIR, `${testCase.id}.zip`);
  const fieldInventoryPath = path.join(FIELD_INVENTORY_DIR, `${testCase.id}.json`);
  const reportPath = path.join(caseDir, "report.json");

  return {
    suiteRunId,
    suiteStartedAt,
    caseStartedAt: startedAt,
    caseFinishedAt: nowStamp(),
    id: testCase.id,
    ats: testCase.ats,
    phase: testCase.phase,
    company: testCase.company,
    roleTitle: testCase.roleTitle,
    url: testCase.url,
    status: "timeout",
    metadata: {
      expectedCompany: testCase.company,
      expectedRoleTitle: testCase.roleTitle,
      actualCompany: testCase.company,
      actualRoleTitle: testCase.roleTitle,
      success: false,
      source: "none"
    },
    pagesReached: 0,
    pagesFilled: 0,
    transitionsAttempted: 0,
    transitionsContinued: 0,
    finalReviewPageReached: false,
    rawDomCandidateCount: 0,
    noiseRejectedCount: 0,
    logicalFieldCount: 0,
    answerableFieldCount: 0,
    intentionallyUnresolvedCount: 0,
    detectedCount: 0,
    attemptedCount: 0,
    verifiedCount: 0,
    safeAnswerableFieldCount: 0,
    safeVerifiedCount: 0,
    safeAnswerCoverage: 0,
    userExpectedFieldCount: 0,
    userExpectedVerifiedCount: 0,
    userExpectedCoverage: 0,
    dropdownCount: 0,
    dropdownVerifiedCount: 0,
    autocompleteCount: 0,
    autocompleteVerifiedCount: 0,
    fileUploadCount: 0,
    fileUploadVerifiedCount: 0,
    fieldDetectionRecall: 0,
    fillCoverage: 0,
    fillPrecision: 0,
    dropdownSuccess: 0,
    autocompleteSuccess: 0,
    fileUploadSuccess: 0,
    severeIncorrectAnswers: 0,
    severeFieldFailures: 0,
    generatableQuestionCount: 0,
    generatableShortAnswersDetected: 0,
    generatedAnswerCount: 0,
    generatedAnswersInserted: 0,
    generatedAnswersBrowserVerified: 0,
    generatedAnswersPassingQuality: 0,
    generatedAnswersRejectedForQuality: 0,
    generatableShortAnswersFilled: 0,
    rawShortAnswerCoverage: 0,
    qualityApprovedShortAnswerCoverage: 0,
    humanReadyShortAnswerCoverage: 0,
    generatableShortAnswerCoverage: 0,
    reusableAnswersFilled: 0,
    missingEvidenceQuestions: 0,
    generatedAnswersRequiringCorrection: 0,
    generatedAnswersAcceptedWithoutEdit: 0,
    manualEffort: {
      manualClicksRequired: 0,
      manualFieldsRequired: 0,
      unexpectedPageSwitches: 0,
      retriesRequired: 0,
      incorrectFieldsRequiringCorrection: 0
    },
    manualBarriers: [formatTimeoutBarrier(startedAt, stage)],
    warnings: [formatTimeoutWarning(stage)],
    failureCategories: {
      FIELD_NOT_DETECTED: 0,
      LABEL_ASSOCIATION_FAILED: 0,
      INTENT_CLASSIFICATION_FAILED: 0,
      PROFILE_FACT_MISSING: 0,
      ANSWER_DERIVATION_FAILED: 0,
      FORMAT_ADAPTATION_FAILED: 0,
      CONTROL_ADAPTER_FAILED: 0,
      OPTION_MATCHING_FAILED: 0,
      VERIFICATION_FAILED: 0,
      NAVIGATION_FAILED: 0,
      METADATA_EXTRACTION_FAILED: 0,
      PAGE_NOT_READY: 1,
      SITE_UNAVAILABLE: 0,
      INTENTIONALLY_UNRESOLVED: 0
    },
    stageResults: [],
    tracePath,
    screenshotPaths: [],
    fieldInventoryPath,
    reportPath,
    submitted: false
  };
}

function mergeTimedOutCaseResult(
  testCase: BenchmarkCase,
  startedAt: string,
  suiteRunId: string,
  suiteStartedAt: string,
  partial: BenchmarkCaseResult | null,
  stage = "unknown_stage"
): BenchmarkCaseResult {
  if (!partial) {
    return timedOutCaseResult(testCase, startedAt, suiteRunId, suiteStartedAt, stage);
  }

  if (partial.status === "completed" || partial.status === "manual_barrier" || partial.status === "site_unavailable" || partial.status === "not_scorable") {
    return partial;
  }

  return {
    ...partial,
    status: "timeout",
    suiteRunId,
    suiteStartedAt,
    caseFinishedAt: nowStamp(),
    manualBarriers: Array.from(
      new Set([formatTimeoutBarrier(startedAt, partial.warnings[0]?.match(/Last recorded stage:\s(.+?)\.$/i)?.[1] || "unknown_stage"), ...partial.manualBarriers])
    ),
    warnings: Array.from(new Set([formatTimeoutWarning(partial.warnings[0]?.match(/Last recorded stage:\s(.+?)\.$/i)?.[1] || "unknown_stage"), ...partial.warnings])),
    submitted: false
  };
}

async function runCaseWithTimeout(
  testCase: BenchmarkCase,
  fixtures: SyntheticFixtures,
  caseTimeoutMs: number,
  suiteRunId: string,
  suiteStartedAt: string
) {
  if (!caseTimeoutMs) {
    return runCase(testCase, fixtures, suiteRunId, suiteStartedAt);
  }

  const startedAt = nowStamp();
  const progress: CaseExecutionProgress = {
    stage: "initializing_case"
  };
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let settledResult: BenchmarkCaseResult | null = null;
  const casePromise = runCase(testCase, fixtures, suiteRunId, suiteStartedAt, progress)
    .then((result) => {
      settledResult = result;
      return result;
    })
    .finally(() => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
  })
    .catch((error) => {
    if (timedOut) {
      return timedOutCaseResult(testCase, startedAt, suiteRunId, suiteStartedAt, progress.stage);
    }
    throw error;
  });

  const timeoutPromise = new Promise<BenchmarkCaseResult>((resolve) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      resolve(timedOutCaseResult(testCase, startedAt, suiteRunId, suiteStartedAt, progress.stage));
    }, caseTimeoutMs);
  });

  const winner = await Promise.race([casePromise, timeoutPromise]);
  if (!timedOut) {
    return winner;
  }

  const graceSettled = await Promise.race([
    casePromise.then((result) => ({ settled: true as const, result })).catch(() => ({ settled: true as const, result: null })),
    new Promise<{ settled: false }>((resolve) => setTimeout(() => resolve({ settled: false }), 15_000))
  ]);

  if (graceSettled.settled && graceSettled.result) {
    return graceSettled.result;
  }

  const persistedResult = await readPersistedCaseReport(
    timedOutCaseResult(testCase, startedAt, suiteRunId, suiteStartedAt, progress.stage).reportPath,
    suiteRunId
  );
  if (persistedResult && persistedResult.status !== "timeout") {
    return persistedResult;
  }

  await resetBrowserManagerForTests().catch(() => undefined);

  const timedOutResult = mergeTimedOutCaseResult(
    testCase,
    startedAt,
    suiteRunId,
    suiteStartedAt,
    persistedResult ?? settledResult,
    progress.stage
  );
  await writeFile(timedOutResult.fieldInventoryPath, JSON.stringify(timedOutResult.stageResults, null, 2), "utf8").catch(() => undefined);
  await writeFile(timedOutResult.reportPath, JSON.stringify(timedOutResult, null, 2), "utf8").catch(() => undefined);
  return timedOutResult;
}

function summarizeByAts(results: BenchmarkCaseResult[]) {
  const grouped = new Map<string, BenchmarkCaseResult[]>();
  for (const result of results) {
    const list = grouped.get(result.ats) ?? [];
    list.push(result);
    grouped.set(result.ats, list);
  }

  const summary: Record<string, Record<string, unknown>> = {};
  for (const [ats, atsResults] of grouped.entries()) {
    const scorableResults = atsResults.filter((result) => result.status !== "site_unavailable");
    const metadataAvailable = scorableResults.filter((result) => result.metadata.source !== "none");
    const detectedCount = atsResults.reduce((sum, item) => sum + item.detectedCount, 0);
    const answerableCount = atsResults.reduce((sum, item) => sum + item.answerableFieldCount, 0);
    const verifiedCount = atsResults.reduce((sum, item) => sum + item.verifiedCount, 0);
    const attemptedCount = atsResults.reduce((sum, item) => sum + item.attemptedCount, 0);
    const safeVerifiedCount = atsResults.reduce((sum, item) => sum + item.safeVerifiedCount, 0);
    const safeAnswerableCount = atsResults.reduce((sum, item) => sum + item.safeAnswerableFieldCount, 0);
    const userExpectedVerifiedCount = atsResults.reduce((sum, item) => sum + item.userExpectedVerifiedCount, 0);
    const userExpectedCount = atsResults.reduce((sum, item) => sum + item.userExpectedFieldCount, 0);
    const dropdownVerifiedCount = atsResults.reduce((sum, item) => sum + item.dropdownVerifiedCount, 0);
    const dropdownCount = atsResults.reduce((sum, item) => sum + item.dropdownCount, 0);
    const autocompleteVerifiedCount = atsResults.reduce((sum, item) => sum + item.autocompleteVerifiedCount, 0);
    const autocompleteCount = atsResults.reduce((sum, item) => sum + item.autocompleteCount, 0);
    const fileUploadVerifiedCount = atsResults.reduce((sum, item) => sum + item.fileUploadVerifiedCount, 0);
    const fileUploadCount = atsResults.reduce((sum, item) => sum + item.fileUploadCount, 0);
    const metadataMetric = buildMetric(metadataAvailable.filter((result) => result.metadata.success).length, metadataAvailable.length);

    summary[ats] = {
      cases: atsResults.length,
      completed: atsResults.filter((result) => result.status === "completed").length,
      manualBarrier: atsResults.filter((result) => result.status === "manual_barrier").length,
      siteUnavailable: atsResults.filter((result) => result.status === "site_unavailable").length,
      failedRuntime: atsResults.filter((result) => result.status === "failed_runtime").length,
      notScorable: atsResults.filter((result) => result.status === "not_scorable").length,
      timeout: atsResults.filter((result) => result.status === "timeout").length,
      rawDomCandidateCount: atsResults.reduce((sum, item) => sum + item.rawDomCandidateCount, 0),
      noiseRejectedCount: atsResults.reduce((sum, item) => sum + item.noiseRejectedCount, 0),
      logicalFieldCount: atsResults.reduce((sum, item) => sum + item.logicalFieldCount, 0),
      answerableFieldCount: atsResults.reduce((sum, item) => sum + item.answerableFieldCount, 0),
      intentionallyUnresolvedCount: atsResults.reduce((sum, item) => sum + item.intentionallyUnresolvedCount, 0),
      detectedCount,
      attemptedCount,
      verifiedCount,
      safeAnswerableFieldCount: safeAnswerableCount,
      safeVerifiedCount,
      userExpectedFieldCount: userExpectedCount,
      userExpectedVerifiedCount,
      dropdownCount,
      dropdownVerifiedCount,
      autocompleteCount,
      autocompleteVerifiedCount,
      fileUploadCount,
      fileUploadVerifiedCount,
      fieldDetectionRecall: buildMetric(detectedCount, answerableCount).rate,
      fieldDetectionRecallMetric: buildMetric(detectedCount, answerableCount),
      fillCoverage: buildMetric(verifiedCount, answerableCount).rate,
      fillCoverageMetric: buildMetric(verifiedCount, answerableCount),
      fillPrecision: buildMetric(verifiedCount, attemptedCount).rate,
      fillPrecisionMetric: buildMetric(verifiedCount, attemptedCount),
      dropdownSuccess: buildMetric(dropdownVerifiedCount, dropdownCount).rate,
      dropdownSuccessMetric: buildMetric(dropdownVerifiedCount, dropdownCount),
      safeAnswerCoverage: buildMetric(safeVerifiedCount, safeAnswerableCount).rate,
      safeAnswerCoverageMetric: buildMetric(safeVerifiedCount, safeAnswerableCount),
      userExpectedCoverage: buildMetric(userExpectedVerifiedCount, userExpectedCount).rate,
      userExpectedCoverageMetric: buildMetric(userExpectedVerifiedCount, userExpectedCount),
      autocompleteSuccess: buildMetric(autocompleteVerifiedCount, autocompleteCount).rate,
      autocompleteSuccessMetric: buildMetric(autocompleteVerifiedCount, autocompleteCount),
      fileUploadSuccess: buildMetric(fileUploadVerifiedCount, fileUploadCount).rate,
      fileUploadSuccessMetric: buildMetric(fileUploadVerifiedCount, fileUploadCount),
      severeIncorrectAnswers: atsResults.reduce((sum, item) => sum + item.severeIncorrectAnswers, 0),
      severeFieldFailures: atsResults.reduce((sum, item) => sum + item.severeFieldFailures, 0),
      generatableQuestionCount: atsResults.reduce((sum, item) => sum + item.generatableQuestionCount, 0),
      generatableShortAnswersDetected: atsResults.reduce((sum, item) => sum + item.generatableShortAnswersDetected, 0),
      generatedAnswerCount: atsResults.reduce((sum, item) => sum + item.generatedAnswerCount, 0),
      generatedAnswersInserted: atsResults.reduce((sum, item) => sum + item.generatedAnswersInserted, 0),
      generatedAnswersBrowserVerified: atsResults.reduce((sum, item) => sum + item.generatedAnswersBrowserVerified, 0),
      generatedAnswersPassingQuality: atsResults.reduce((sum, item) => sum + item.generatedAnswersPassingQuality, 0),
      generatedAnswersRejectedForQuality: atsResults.reduce((sum, item) => sum + item.generatedAnswersRejectedForQuality, 0),
      generatableShortAnswersFilled: atsResults.reduce((sum, item) => sum + item.generatableShortAnswersFilled, 0),
      rawShortAnswerCoverage: roundRatio(
        atsResults.reduce((sum, item) => sum + item.generatedAnswersInserted, 0),
        atsResults.reduce((sum, item) => sum + item.generatableQuestionCount, 0)
      ),
      qualityApprovedShortAnswerCoverage: roundRatio(
        atsResults.reduce((sum, item) => sum + item.generatedAnswersPassingQuality, 0),
        atsResults.reduce((sum, item) => sum + item.generatableQuestionCount, 0)
      ),
      humanReadyShortAnswerCoverage: roundRatio(
        atsResults.reduce((sum, item) => sum + item.generatedAnswersPassingQuality, 0),
        atsResults.reduce((sum, item) => sum + item.generatableQuestionCount, 0)
      ),
      generatableShortAnswerCoverage: roundRatio(
        atsResults.reduce((sum, item) => sum + item.generatedAnswersPassingQuality, 0),
        atsResults.reduce((sum, item) => sum + item.generatableQuestionCount, 0)
      ),
      reusableAnswersFilled: atsResults.reduce((sum, item) => sum + item.reusableAnswersFilled, 0),
      missingEvidenceQuestions: atsResults.reduce((sum, item) => sum + item.missingEvidenceQuestions, 0),
      generatedAnswersRequiringCorrection: atsResults.reduce((sum, item) => sum + item.generatedAnswersRequiringCorrection, 0),
      generatedAnswersAcceptedWithoutEdit: atsResults.reduce((sum, item) => sum + item.generatedAnswersAcceptedWithoutEdit, 0),
      metadataSuccess: metadataMetric.rate,
      metadataSuccessMetric: metadataMetric
    };
  }

  return summary;
}

function buildOverallSummary(results: BenchmarkCaseResult[]) {
  const scorableResults = results.filter((result) => result.status !== "site_unavailable");
  const metadataAvailable = scorableResults.filter((result) => result.metadata.source !== "none");
  const transitionAttempts = scorableResults.reduce((sum, item) => sum + item.transitionsAttempted, 0);
  const transitionContinued = scorableResults.reduce((sum, item) => sum + item.transitionsContinued, 0);
  const detectedCount = results.reduce((sum, item) => sum + item.detectedCount, 0);
  const answerableCount = results.reduce((sum, item) => sum + item.answerableFieldCount, 0);
  const verifiedCount = results.reduce((sum, item) => sum + item.verifiedCount, 0);
  const attemptedCount = results.reduce((sum, item) => sum + item.attemptedCount, 0);
  const safeVerifiedCount = results.reduce((sum, item) => sum + item.safeVerifiedCount, 0);
  const safeAnswerableCount = results.reduce((sum, item) => sum + item.safeAnswerableFieldCount, 0);
  const userExpectedVerifiedCount = results.reduce((sum, item) => sum + item.userExpectedVerifiedCount, 0);
  const userExpectedCount = results.reduce((sum, item) => sum + item.userExpectedFieldCount, 0);
  const dropdownVerifiedCount = results.reduce((sum, item) => sum + item.dropdownVerifiedCount, 0);
  const dropdownCount = results.reduce((sum, item) => sum + item.dropdownCount, 0);
  const autocompleteVerifiedCount = results.reduce((sum, item) => sum + item.autocompleteVerifiedCount, 0);
  const autocompleteCount = results.reduce((sum, item) => sum + item.autocompleteCount, 0);
  const fileUploadVerifiedCount = results.reduce((sum, item) => sum + item.fileUploadVerifiedCount, 0);
  const fileUploadCount = results.reduce((sum, item) => sum + item.fileUploadCount, 0);
  const metadataMetric = buildMetric(metadataAvailable.filter((result) => result.metadata.success).length, metadataAvailable.length);
  const transitionMetric = buildMetric(transitionContinued, transitionAttempts);

  return {
    cases: results.length,
    completed: results.filter((result) => result.status === "completed").length,
    manualBarrier: results.filter((result) => result.status === "manual_barrier").length,
    siteUnavailable: results.filter((result) => result.status === "site_unavailable").length,
    failedRuntime: results.filter((result) => result.status === "failed_runtime").length,
    notScorable: results.filter((result) => result.status === "not_scorable").length,
    timeout: results.filter((result) => result.status === "timeout").length,
    rawDomCandidateCount: results.reduce((sum, item) => sum + item.rawDomCandidateCount, 0),
    noiseRejectedCount: results.reduce((sum, item) => sum + item.noiseRejectedCount, 0),
    logicalFieldCount: results.reduce((sum, item) => sum + item.logicalFieldCount, 0),
    answerableFieldCount: results.reduce((sum, item) => sum + item.answerableFieldCount, 0),
    intentionallyUnresolvedCount: results.reduce((sum, item) => sum + item.intentionallyUnresolvedCount, 0),
    detectedCount,
    attemptedCount,
    verifiedCount,
    safeAnswerableFieldCount: results.reduce((sum, item) => sum + item.safeAnswerableFieldCount, 0),
    safeVerifiedCount,
    userExpectedFieldCount: userExpectedCount,
    userExpectedVerifiedCount,
    dropdownCount,
    dropdownVerifiedCount,
    autocompleteCount,
    autocompleteVerifiedCount,
    fileUploadCount,
    fileUploadVerifiedCount,
    fieldDetectionRecall: buildMetric(detectedCount, answerableCount).rate,
    fieldDetectionRecallMetric: buildMetric(detectedCount, answerableCount),
    fillCoverage: buildMetric(verifiedCount, answerableCount).rate,
    fillCoverageMetric: buildMetric(verifiedCount, answerableCount),
    fillPrecision: buildMetric(verifiedCount, attemptedCount).rate,
    fillPrecisionMetric: buildMetric(verifiedCount, attemptedCount),
    dropdownSuccess: buildMetric(dropdownVerifiedCount, dropdownCount).rate,
    dropdownSuccessMetric: buildMetric(dropdownVerifiedCount, dropdownCount),
    safeAnswerCoverage: buildMetric(safeVerifiedCount, safeAnswerableCount).rate,
    safeAnswerCoverageMetric: buildMetric(safeVerifiedCount, safeAnswerableCount),
    userExpectedCoverage: buildMetric(userExpectedVerifiedCount, userExpectedCount).rate,
    userExpectedCoverageMetric: buildMetric(userExpectedVerifiedCount, userExpectedCount),
    autocompleteSuccess: buildMetric(autocompleteVerifiedCount, autocompleteCount).rate,
    autocompleteSuccessMetric: buildMetric(autocompleteVerifiedCount, autocompleteCount),
    fileUploadSuccess: buildMetric(fileUploadVerifiedCount, fileUploadCount).rate,
    fileUploadSuccessMetric: buildMetric(fileUploadVerifiedCount, fileUploadCount),
    metadataSuccess: metadataMetric.rate,
    metadataSuccessMetric: metadataMetric,
    transitionAttempts,
    transitionContinued,
    multiPageContinuity: transitionMetric.rate,
    multiPageContinuityMetric: transitionMetric,
    severeIncorrectAnswers: results.reduce((sum, item) => sum + item.severeIncorrectAnswers, 0),
    severeFieldFailures: results.reduce((sum, item) => sum + item.severeFieldFailures, 0),
    generatableQuestionCount: results.reduce((sum, item) => sum + item.generatableQuestionCount, 0),
    generatableShortAnswersDetected: results.reduce((sum, item) => sum + item.generatableShortAnswersDetected, 0),
    generatedAnswerCount: results.reduce((sum, item) => sum + item.generatedAnswerCount, 0),
    generatedAnswersInserted: results.reduce((sum, item) => sum + item.generatedAnswersInserted, 0),
    generatedAnswersBrowserVerified: results.reduce((sum, item) => sum + item.generatedAnswersBrowserVerified, 0),
    generatedAnswersPassingQuality: results.reduce((sum, item) => sum + item.generatedAnswersPassingQuality, 0),
    generatedAnswersRejectedForQuality: results.reduce((sum, item) => sum + item.generatedAnswersRejectedForQuality, 0),
    generatableShortAnswersFilled: results.reduce((sum, item) => sum + item.generatableShortAnswersFilled, 0),
    rawShortAnswerCoverage: buildMetric(
      results.reduce((sum, item) => sum + item.generatedAnswersInserted, 0),
      results.reduce((sum, item) => sum + item.generatableQuestionCount, 0)
    ).rate,
    rawShortAnswerCoverageMetric: buildMetric(
      results.reduce((sum, item) => sum + item.generatedAnswersInserted, 0),
      results.reduce((sum, item) => sum + item.generatableQuestionCount, 0)
    ),
    qualityApprovedShortAnswerCoverage: buildMetric(
      results.reduce((sum, item) => sum + item.generatedAnswersPassingQuality, 0),
      results.reduce((sum, item) => sum + item.generatableQuestionCount, 0)
    ).rate,
    qualityApprovedShortAnswerCoverageMetric: buildMetric(
      results.reduce((sum, item) => sum + item.generatedAnswersPassingQuality, 0),
      results.reduce((sum, item) => sum + item.generatableQuestionCount, 0)
    ),
    humanReadyShortAnswerCoverage: buildMetric(
      results.reduce((sum, item) => sum + item.generatedAnswersPassingQuality, 0),
      results.reduce((sum, item) => sum + item.generatableQuestionCount, 0)
    ).rate,
    humanReadyShortAnswerCoverageMetric: buildMetric(
      results.reduce((sum, item) => sum + item.generatedAnswersPassingQuality, 0),
      results.reduce((sum, item) => sum + item.generatableQuestionCount, 0)
    ),
    generatableShortAnswerCoverage: buildMetric(
      results.reduce((sum, item) => sum + item.generatedAnswersPassingQuality, 0),
      results.reduce((sum, item) => sum + item.generatableQuestionCount, 0)
    ).rate,
    generatableShortAnswerCoverageMetric: buildMetric(
      results.reduce((sum, item) => sum + item.generatedAnswersPassingQuality, 0),
      results.reduce((sum, item) => sum + item.generatableQuestionCount, 0)
    ),
    reusableAnswersFilled: results.reduce((sum, item) => sum + item.reusableAnswersFilled, 0),
    missingEvidenceQuestions: results.reduce((sum, item) => sum + item.missingEvidenceQuestions, 0),
    generatedAnswersRequiringCorrection: results.reduce((sum, item) => sum + item.generatedAnswersRequiringCorrection, 0),
    generatedAnswersAcceptedWithoutEdit: results.reduce((sum, item) => sum + item.generatedAnswersAcceptedWithoutEdit, 0),
    submittedApplications: results.filter((result) => result.submitted).length
  };
}

function buildMarkdownReport(summary: BenchmarkSummary) {
  const overall = summary.overall as Record<string, unknown>;
  const lines = [
    "# Application benchmark",
    "",
    `- Started: ${summary.startedAt}`,
    `- Finished: ${summary.finishedAt}`,
    `- Cases run: ${overall.cases}`,
    `- Completed: ${overall.completed}`,
    `- Manual barriers: ${overall.manualBarrier}`,
    `- Site unavailable: ${overall.siteUnavailable}`,
    `- Failed runtime: ${overall.failedRuntime}`,
    `- Not scorable: ${overall.notScorable}`,
    `- Timeout: ${overall.timeout}`,
    `- Raw DOM candidates: ${overall.rawDomCandidateCount}`,
    `- Noise rejected: ${overall.noiseRejectedCount}`,
    `- Logical fields: ${overall.logicalFieldCount}`,
    `- Answerable fields: ${overall.answerableFieldCount}`,
    `- Intentionally unresolved: ${overall.intentionallyUnresolvedCount}`,
    `- Field detection recall: ${formatMetric(overall.fieldDetectionRecallMetric as MetricSummary)}`,
    `- Fill coverage: ${formatMetric(overall.fillCoverageMetric as MetricSummary)}`,
    `- Fill precision: ${formatMetric(overall.fillPrecisionMetric as MetricSummary)}`,
    `- Safe-answer coverage: ${formatMetric(overall.safeAnswerCoverageMetric as MetricSummary)}`,
    `- User-expected coverage: ${formatMetric(overall.userExpectedCoverageMetric as MetricSummary)}`,
    `- Dropdown success: ${formatMetric(overall.dropdownSuccessMetric as MetricSummary)}`,
    `- Autocomplete success: ${formatMetric(overall.autocompleteSuccessMetric as MetricSummary)}`,
    `- File upload success: ${formatMetric(overall.fileUploadSuccessMetric as MetricSummary)}`,
    `- Generatable questions: ${overall.generatableQuestionCount}`,
    `- Generatable short answers detected: ${overall.generatableShortAnswersDetected}`,
    `- Generated answers: ${overall.generatedAnswerCount}`,
    `- Inserted answers: ${overall.generatedAnswersInserted}`,
    `- Browser-verified generated answers: ${overall.generatedAnswersBrowserVerified}`,
    `- Quality-approved generated answers: ${overall.generatedAnswersPassingQuality}`,
    `- Quality-rejected generated answers: ${overall.generatedAnswersRejectedForQuality}`,
    `- Raw short-answer coverage: ${formatMetric(overall.rawShortAnswerCoverageMetric as MetricSummary)}`,
    `- Quality-approved short-answer coverage: ${formatMetric(overall.qualityApprovedShortAnswerCoverageMetric as MetricSummary)}`,
    `- Human-ready short-answer coverage: ${formatMetric(overall.humanReadyShortAnswerCoverageMetric as MetricSummary)}`,
    `- Reusable answers filled: ${overall.reusableAnswersFilled}`,
    `- Missing evidence questions: ${overall.missingEvidenceQuestions}`,
    `- Generated answers requiring correction: ${overall.generatedAnswersRequiringCorrection}`,
    `- Generated answers accepted without edit: ${overall.generatedAnswersAcceptedWithoutEdit}`,
    `- Metadata success: ${formatMetric(overall.metadataSuccessMetric as MetricSummary)}`,
    `- Multi-page continuity: ${formatMetric(overall.multiPageContinuityMetric as MetricSummary)}`,
    `- Severe incorrect answers: ${summary.severeIncorrectAnswers}`,
    `- Severe field failures: ${summary.severeFieldFailures}`,
    `- No application submitted: ${summary.noFinalSubmissions ? "yes" : "no"}`,
    "",
    "## ATS metrics",
    "",
    ...Object.entries(summary.byAts).flatMap(([ats, metrics]) => {
      const atsMetrics = metrics as Record<string, unknown>;
      return [
        `### ${ats}`,
        "",
        `- Cases: ${atsMetrics.cases}`,
        `- Completed: ${atsMetrics.completed}`,
        `- Manual barriers: ${atsMetrics.manualBarrier}`,
        `- Site unavailable: ${atsMetrics.siteUnavailable}`,
        `- Failed runtime: ${atsMetrics.failedRuntime}`,
        `- Not scorable: ${atsMetrics.notScorable}`,
        `- Timeout: ${atsMetrics.timeout}`,
        `- Raw DOM candidates: ${atsMetrics.rawDomCandidateCount}`,
        `- Noise rejected: ${atsMetrics.noiseRejectedCount}`,
        `- Logical fields: ${atsMetrics.logicalFieldCount}`,
        `- Answerable fields: ${atsMetrics.answerableFieldCount}`,
        `- Field detection recall: ${formatMetric(atsMetrics.fieldDetectionRecallMetric as MetricSummary)}`,
        `- Fill coverage: ${formatMetric(atsMetrics.fillCoverageMetric as MetricSummary)}`,
        `- Fill precision: ${formatMetric(atsMetrics.fillPrecisionMetric as MetricSummary)}`,
        `- Safe-answer coverage: ${formatMetric(atsMetrics.safeAnswerCoverageMetric as MetricSummary)}`,
        `- User-expected coverage: ${formatMetric(atsMetrics.userExpectedCoverageMetric as MetricSummary)}`,
        `- Dropdown success: ${formatMetric(atsMetrics.dropdownSuccessMetric as MetricSummary)}`,
        `- Autocomplete success: ${formatMetric(atsMetrics.autocompleteSuccessMetric as MetricSummary)}`,
        `- File upload success: ${formatMetric(atsMetrics.fileUploadSuccessMetric as MetricSummary)}`,
        `- Generatable questions: ${atsMetrics.generatableQuestionCount}`,
        `- Generated answers: ${atsMetrics.generatedAnswerCount}`,
        `- Inserted answers: ${atsMetrics.generatedAnswersInserted}`,
        `- Browser-verified generated answers: ${atsMetrics.generatedAnswersBrowserVerified}`,
        `- Quality-approved generated answers: ${atsMetrics.generatedAnswersPassingQuality}`,
        `- Quality-rejected generated answers: ${atsMetrics.generatedAnswersRejectedForQuality}`,
        `- Raw short-answer coverage: ${formatRatioWithCounts(atsMetrics.generatedAnswersInserted as number, atsMetrics.generatableQuestionCount as number)}`,
        `- Quality-approved short-answer coverage: ${formatRatioWithCounts(atsMetrics.generatedAnswersPassingQuality as number, atsMetrics.generatableQuestionCount as number)}`,
        `- Human-ready short-answer coverage: ${formatRatioWithCounts(atsMetrics.generatedAnswersAcceptedWithoutEdit as number, atsMetrics.generatableQuestionCount as number)}`,
        `- Reusable answers filled: ${atsMetrics.reusableAnswersFilled}`,
        `- Missing evidence questions: ${atsMetrics.missingEvidenceQuestions}`,
        `- Severe incorrect answers: ${atsMetrics.severeIncorrectAnswers}`,
        `- Severe field failures: ${atsMetrics.severeFieldFailures}`,
        ""
      ];
    }),
    "## Applications",
    "",
    ...summary.byApplication.flatMap((result) => [
      `### ${result.id}`,
      "",
      `- Status: ${result.status}`,
      `- Metadata: ${result.metadata.actualCompany} / ${result.metadata.actualRoleTitle} (${result.metadata.success ? "matched" : "did not match"})`,
      `- Pages reached: ${result.pagesReached}`,
      `- Pages filled: ${result.pagesFilled}`,
      `- Raw DOM candidates: ${result.rawDomCandidateCount}`,
      `- Noise rejected: ${result.noiseRejectedCount}`,
      `- Logical fields: ${result.logicalFieldCount}`,
      `- Answerable fields: ${result.answerableFieldCount}`,
      `- Intentionally unresolved: ${result.intentionallyUnresolvedCount}`,
      `- Field detection recall: ${formatRatioWithCounts(result.detectedCount, result.answerableFieldCount)}`,
      `- Fill coverage: ${formatRatioWithCounts(result.verifiedCount, result.answerableFieldCount)}`,
      `- Fill precision: ${formatRatioWithCounts(result.verifiedCount, result.attemptedCount)}`,
      `- Safe-answer coverage: ${formatRatioWithCounts(result.safeVerifiedCount, result.safeAnswerableFieldCount)}`,
      `- User-expected coverage: ${formatRatioWithCounts(result.userExpectedVerifiedCount, result.userExpectedFieldCount)}`,
      `- Dropdown success: ${formatRatioWithCounts(result.dropdownVerifiedCount, result.dropdownCount)}`,
      `- Autocomplete success: ${formatRatioWithCounts(result.autocompleteVerifiedCount, result.autocompleteCount)}`,
      `- File upload success: ${formatRatioWithCounts(result.fileUploadVerifiedCount, result.fileUploadCount)}`,
      `- Generatable questions: ${result.generatableQuestionCount}`,
      `- Generated answers: ${result.generatedAnswerCount}`,
      `- Inserted answers: ${result.generatedAnswersInserted}`,
      `- Browser-verified generated answers: ${result.generatedAnswersBrowserVerified}`,
      `- Quality-approved generated answers: ${result.generatedAnswersPassingQuality}`,
      `- Quality-rejected generated answers: ${result.generatedAnswersRejectedForQuality}`,
      `- Raw short-answer coverage: ${formatRatioWithCounts(result.generatedAnswersInserted, result.generatableQuestionCount)}`,
      `- Quality-approved short-answer coverage: ${formatRatioWithCounts(result.generatedAnswersPassingQuality, result.generatableQuestionCount)}`,
      `- Human-ready short-answer coverage: ${formatRatioWithCounts(result.generatedAnswersAcceptedWithoutEdit, result.generatableQuestionCount)}`,
      `- Reusable answers filled: ${result.reusableAnswersFilled}`,
      `- Missing evidence questions: ${result.missingEvidenceQuestions}`,
      `- Manual barriers: ${result.manualBarriers.length ? result.manualBarriers.join("; ") : "none"}`,
      `- Warnings: ${result.warnings.length ? result.warnings.join("; ") : "none"}`,
      `- Trace: ${result.tracePath}`,
      `- Inventory: ${result.fieldInventoryPath}`,
      ""
    ])
  ];

  return lines.join("\n");
}

function buildGeneratedAnswersReport(results: BenchmarkCaseResult[]) {
  const lines = ["# Generated answers", ""];

  for (const result of results) {
    const records = result.stageResults.flatMap((stage) =>
      stage.inventory.filter((record) =>
        [
          "generatable_from_profile",
          "generatable_from_job_and_profile"
        ].includes(record.expectedAnswerSource)
      )
    );

    if (!records.length) continue;

    lines.push(`## ${result.id}`);
    lines.push("");
    lines.push(`- Generatable questions: ${records.length}`);
    lines.push(`- Answers generated: ${records.filter((record) => Boolean(record.generatedProvider)).length}`);
    lines.push(`- Answers inserted: ${records.filter((record) => Boolean(cleanText(record.attemptedValue || record.actualValueAfterFill))).length}`);
    lines.push(`- Browser verified: ${records.filter((record) => record.browserVerified).length}`);
    lines.push(`- Quality approved: ${records.filter((record) => record.browserVerified && record.qualityPassed).length}`);
    lines.push(`- Rejected: ${records.filter((record) => !record.qualityPassed).length}`);
    lines.push("");

    for (const record of records) {
      lines.push(`### ${record.fieldLabel || record.shortAnswerKind || "Short answer"}`);
      lines.push("");
      lines.push(`- Company: ${record.company}`);
      lines.push(`- Role: ${record.roleTitle}`);
      lines.push(`- Expected source: ${record.expectedAnswerSource}`);
      lines.push(`- Kind: ${record.shortAnswerKind || "n/a"}`);
      lines.push(`- Provider: ${record.generatedProvider || "n/a"}`);
      lines.push(`- Outcome: ${record.outcome}`);
      lines.push(`- Browser verified: ${record.browserVerified ? "yes" : "no"}`);
      lines.push(`- Quality passed: ${record.qualityPassed ? "yes" : "no"}`);
      lines.push(`- Final success: ${record.verified ? "yes" : "no"}`);
      lines.push(`- Question: ${record.nearbyQuestionText || "n/a"}`);
      lines.push(`- Generated answer: ${record.attemptedValue || "n/a"}`);
      lines.push(`- Candidate evidence: ${record.generatedEvidenceTitles.length ? record.generatedEvidenceTitles.join("; ") : "n/a"}`);
      lines.push(`- Job evidence: ${record.generatedJobEvidenceTitles.length ? record.generatedJobEvidenceTitles.join("; ") : "n/a"}`);
      lines.push(
        `- Quality scores: factual=${record.qualityFactualGrounding.toFixed(3)}, question=${record.qualityQuestionRelevance.toFixed(3)}, job=${record.qualityJobRelevance.toFixed(3)}, candidate=${record.qualityCandidateRelevance.toFixed(3)}, fluency=${record.qualityFluency.toFixed(3)}, specificity=${record.qualitySpecificity.toFixed(3)}, concision=${record.qualityConcision.toFixed(3)}`
      );
      lines.push(`- Quality reasons: ${record.qualityReasons.length ? record.qualityReasons.join("; ") : "none"}`);
      lines.push(`- Regeneration history: ${record.generatedRegenerationNotes.length ? record.generatedRegenerationNotes.join("; ") : "none"}`);
      lines.push(`- Warnings: ${record.generatedWarnings.length ? record.generatedWarnings.join("; ") : "none"}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function buildNonAnswerableFieldAudit(results: BenchmarkCaseResult[]) {
  const lines = ["# Non-answerable field audit", ""];
  const records = results.flatMap((result) =>
    result.stageResults.flatMap((stage) => stage.inventory.filter((record) => !record.answerable))
  );

  const counts = records.reduce<Record<CoverageClassification, number>>(
    (accumulator, record) => {
      accumulator[record.coverageClassification] += 1;
      return accumulator;
    },
    {
      ANSWERABLE_NOW: 0,
      ANSWERABLE_WITH_DERIVATION: 0,
      ANSWERABLE_WITH_SAVED_RESPONSE: 0,
      ANSWERABLE_WITH_ONE_USER_FACT: 0,
      REQUIRES_BEHAVIORAL_STORY: 0,
      LEGAL_OR_SENSITIVE_MANUAL: 0,
      OPTIONAL_SAFE_TO_SKIP: 0,
      UNSUPPORTED_CONTROL: 0,
      CONDITIONAL_NOT_APPLICABLE: 0
    }
  );

  lines.push(`- Non-answerable logical fields audited: ${records.length}`);
  lines.push("");
  for (const [classification, count] of Object.entries(counts)) {
    lines.push(`- ${classification}: ${count}`);
  }
  lines.push("");

  for (const result of results) {
    const caseRecords = result.stageResults.flatMap((stage) => stage.inventory.filter((record) => !record.answerable));
    if (!caseRecords.length) continue;
    lines.push(`## ${result.id}`);
    lines.push("");

    for (const record of caseRecords) {
      lines.push(`### ${record.fieldLabel || "Untitled field"}`);
      lines.push("");
      lines.push(`- ATS: ${record.ats}`);
      lines.push(`- Application: ${record.company} / ${record.roleTitle}`);
      lines.push(`- Exact question: ${record.nearbyQuestionText || record.fieldLabel || "n/a"}`);
      lines.push(`- Field type: ${record.domControlType}`);
      lines.push(`- Required: ${record.required ? "yes" : "no"}`);
      lines.push(`- Classification: ${record.coverageClassification}`);
      lines.push(`- Profile evidence available: ${record.profileEvidenceAvailable}`);
      lines.push(`- Why excluded from answerable denominator: ${record.excludedFromAnswerableDenominatorReason}`);
      lines.push(`- Reasonable user would expect ApplyPilot to answer it: ${record.reasonableUserWouldExpectApplyPilotToAnswer ? "yes" : "no"}`);
      lines.push(`- One additional profile fact could answer it: ${record.oneAdditionalProfileFactCouldAnswer ? "yes" : "no"}`);
      lines.push(`- Genuinely unsafe to answer: ${record.genuinelyUnsafeToAnswer ? "yes" : "no"}`);
      lines.push(`- Failure category: ${record.failureCategory || "none"}`);
      lines.push(`- Failure reason: ${record.failureReason || "none"}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function buildCoverageAudit(summary: BenchmarkSummary, results: BenchmarkCaseResult[]) {
  const overall = summary.overall as Record<string, number>;
  const lines = [
    "# Coverage audit",
    "",
    `- Safe-answer coverage: ${formatRatioWithCounts(overall.safeVerifiedCount, overall.safeAnswerableFieldCount)}`,
    `- User-expected coverage: ${formatRatioWithCounts(overall.userExpectedVerifiedCount, overall.userExpectedFieldCount)}`,
    `- Original benchmark fill coverage: ${formatRatioWithCounts(overall.verifiedCount, overall.answerableFieldCount)}`,
    ""
  ];

  for (const result of results) {
    lines.push(`## ${result.id}`);
    lines.push("");
    lines.push(`- Safe-answer coverage: ${formatRatioWithCounts(result.safeVerifiedCount, result.safeAnswerableFieldCount)}`);
    lines.push(`- User-expected coverage: ${formatRatioWithCounts(result.userExpectedVerifiedCount, result.userExpectedFieldCount)}`);
    lines.push(`- Original fill coverage: ${formatRatioWithCounts(result.verifiedCount, result.answerableFieldCount)}`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildAutocompleteAudit(results: BenchmarkCaseResult[]) {
  const lines = ["# Autocomplete audit", ""];
  const records = results.flatMap((result) =>
    result.stageResults.flatMap((stage) =>
      stage.inventory.filter(
        (record) =>
          record.answerable &&
          isAutocompleteField({
            controlType: record.domControlType as DetectedField["controlType"],
            intent: record.detectedIntent as DetectedField["intent"]
          })
      )
    )
  );

  lines.push(`- Autocomplete success: ${records.filter((record) => record.verified).length}/${records.length}`);
  lines.push(
    records.length
      ? "- Scope: Only answerable autocomplete controls that ApplyPilot was expected to complete are included below."
      : "- Scope: No answerable autocomplete controls were exercised in this benchmark selection."
  );
  lines.push("");

  for (const record of records) {
    lines.push(`## ${record.applicationId}`);
    lines.push("");
    lines.push(`- Question: ${record.fieldLabel}`);
    lines.push(`- Expected value: ${record.expectedNormalizedAnswer || "n/a"}`);
    lines.push(`- Options found: ${record.availableOptions.length ? record.availableOptions.join("; ") : "not captured in benchmark record"}`);
    lines.push(`- Option selected: ${record.actualValueAfterFill || "none"}`);
    lines.push(`- Verification result: ${record.verified ? "verified" : "not verified"}`);
    lines.push(`- Failure reason: ${record.failureReason || "none"}`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildFileUploadAudit(results: BenchmarkCaseResult[]) {
  const lines = ["# File upload audit", ""];
  const records = results.flatMap((result) =>
    result.stageResults.flatMap((stage) =>
      stage.inventory.filter(
        (record) =>
          record.answerable &&
          isFileUploadField({
            type: record.domControlType as DetectedField["type"],
            controlType: record.domControlType as DetectedField["controlType"]
          })
      )
    )
  );

  lines.push(`- File upload success: ${records.filter((record) => record.verified).length}/${records.length}`);
  lines.push(
    records.length
      ? "- Scope: Only answerable file uploads that ApplyPilot was expected to complete are included below."
      : "- Scope: No answerable file uploads were exercised in this benchmark selection."
  );
  lines.push("");

  for (const record of records) {
    lines.push(`## ${record.applicationId}`);
    lines.push("");
    lines.push(`- Question: ${record.fieldLabel}`);
    lines.push(`- Required: ${record.required ? "yes" : "no"}`);
    lines.push(`- Expected file: ${record.expectedNormalizedAnswer || "n/a"}`);
    lines.push(`- Attempted value: ${record.attemptedValue || "n/a"}`);
    lines.push(`- Browser value: ${record.actualValueAfterFill || "n/a"}`);
    lines.push(`- Verified: ${record.verified ? "yes" : "no"}`);
    lines.push(`- Failure reason: ${record.failureReason || "none"}`);
    lines.push("");
  }

  return lines.join("\n");
}

async function writeAtsReports(results: BenchmarkCaseResult[]) {
  const grouped = new Map<string, BenchmarkCaseResult[]>();
  for (const result of results) {
    const list = grouped.get(result.ats) ?? [];
    list.push(result);
    grouped.set(result.ats, list);
  }

  for (const [ats, atsResults] of grouped.entries()) {
    await writeFile(path.join(ATS_REPORT_DIR, `${ats}.json`), JSON.stringify(atsResults, null, 2), "utf8");
  }
}

async function main() {
  await ensureDirs();
  const freshStartedAt = nowStamp();
  const args = parseArgs(process.argv.slice(2));
  const previouslySaved = args.resume && existsSync(SUMMARY_PATH) ? (JSON.parse(readFileSync(SUMMARY_PATH, "utf8")) as BenchmarkSummary) : null;
  const runId = args.resume && previouslySaved?.runId ? previouslySaved.runId : buildSuiteRunId(freshStartedAt);
  const startedAt = args.resume && previouslySaved?.startedAt ? previouslySaved.startedAt : freshStartedAt;
  const resumableSummary = args.resume ? previouslySaved : null;
  const selectedCases = loadCasesFromArgs(args);
  if (!args.resume) {
    await clearSuiteArtifactsForCases(selectedCases);
  }
  const previousResults = resumableSummary?.byApplication ?? [];
  const completedIds = new Set(previousResults.map((result) => result.id));
  const casesToRun = selectedCases.filter((testCase) => !completedIds.has(testCase.id));

  if (!casesToRun.length && !previousResults.length) {
    throw new Error("No benchmark cases matched the provided filters.");
  }

  const savedState = await saveCurrentState();
  const fixtures = await ensureSyntheticFixtures();

  try {
    await installSyntheticData(fixtures.profile, fixtures.answerBank);

    const results: BenchmarkCaseResult[] = [...previousResults];
    for (const testCase of casesToRun) {
      try {
        results.push(await runCaseWithTimeout(testCase, fixtures, args.caseTimeoutMs, runId, startedAt));
      } finally {
        await resetBrowserManagerForTests().catch(() => undefined);
      }
    }

    const failures = results.flatMap((result) =>
      result.stageResults.flatMap((stage) =>
        stage.inventory.filter((record) => record.failureCategory !== null)
      )
    );

    const summary: BenchmarkSummary = {
      runId,
      startedAt,
      finishedAt: nowStamp(),
      selectedCaseIds: results.map((result) => result.id),
      overall: buildOverallSummary(results),
      byAts: summarizeByAts(results),
      byApplication: results,
      failedCaseIds: results.filter((result) => result.status === "failed_runtime" || result.status === "timeout").map((result) => result.id),
      failedRuntimeCaseIds: results.filter((result) => result.status === "failed_runtime").map((result) => result.id),
      timeoutCaseIds: results.filter((result) => result.status === "timeout").map((result) => result.id),
      notScorableCaseIds: results.filter((result) => result.status === "not_scorable").map((result) => result.id),
      unavailableCaseIds: results.filter((result) => result.status === "site_unavailable").map((result) => result.id),
      manualBarrierCaseIds: results.filter((result) => result.status === "manual_barrier").map((result) => result.id),
      severeIncorrectAnswers: results.reduce((sum, result) => sum + result.severeIncorrectAnswers, 0),
      severeFieldFailures: results.reduce((sum, result) => sum + result.severeFieldFailures, 0),
      noFinalSubmissions: results.every((result) => !result.submitted)
    };

    await writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf8");
    await writeFile(FAILURES_PATH, JSON.stringify(failures, null, 2), "utf8");
    await writeFile(BENCHMARK_REPORT_PATH, buildMarkdownReport(summary), "utf8");
    await writeFile(GENERATED_ANSWERS_PATH, buildGeneratedAnswersReport(results), "utf8");
    await writeFile(NON_ANSWERABLE_AUDIT_PATH, buildNonAnswerableFieldAudit(results), "utf8");
    await writeFile(COVERAGE_AUDIT_PATH, buildCoverageAudit(summary, results), "utf8");
    await writeFile(AUTOCOMPLETE_AUDIT_PATH, buildAutocompleteAudit(results), "utf8");
    await writeFile(FILE_UPLOAD_AUDIT_PATH, buildFileUploadAudit(results), "utf8");
    await writeAtsReports(results);
  } finally {
    await restoreCurrentState(savedState);
    await resetBrowserManagerForTests().catch(() => undefined);
  }
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectRun) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export {
  buildCaseResultFromProgress,
  buildMetric,
  buildOverallSummary,
  mergeTimedOutCaseResult,
  resultBelongsToSuiteRun,
  shouldPreserveCompletedStatusAfterLateFailure,
  timedOutCaseResult
};
