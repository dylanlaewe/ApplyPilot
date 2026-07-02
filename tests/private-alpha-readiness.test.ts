import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, test } from "node:test";

import { createApplicationSession, updateApplicationSession } from "@/lib/applications";
import { submitCorrectionReport } from "@/lib/corrections";
import { buildDogfoodReportExport, buildDogfoodReportFromData } from "@/lib/dogfoodReport";
import { getAnswerBank } from "@/lib/answerBank";
import { createDefaultProfile, saveApplicantProfile } from "@/lib/profile";
import { getDataDirPath, getStorageFilePath } from "@/lib/storage";
import { ApplicationSession, DetectedField } from "@/types";

const storageFiles = [
  "application-sessions.json",
  "answer-bank.json",
  "correction-reports.json",
  "dogfood-regressions.json",
  "profile.json"
] as const;

const backups = new Map<string, string | null>();

function makeField(overrides: Partial<DetectedField> = {}): DetectedField {
  return {
    id: overrides.id ?? "field-1",
    label: overrides.label ?? "Why this company?",
    name: overrides.name ?? "why_company",
    domId: overrides.domId ?? "why_company",
    type: overrides.type ?? "textarea",
    selector: overrides.selector ?? "#why_company",
    detectedValue: overrides.detectedValue ?? "Because of the mission.",
    suggestedValue: overrides.suggestedValue ?? "Because of the mission.",
    confidence: overrides.confidence ?? 0.92,
    confidenceLevel: overrides.confidenceLevel ?? "high",
    status: overrides.status ?? "filled",
    reason: overrides.reason ?? "Filled during Quick Apply.",
    sensitivity: overrides.sensitivity ?? "review",
    autoFillAllowed: overrides.autoFillAllowed ?? true,
    intent: overrides.intent ?? "why_interested",
    reviewCategory: overrides.reviewCategory ?? null,
    answerSource: overrides.answerSource ?? "generated_answer",
    verificationStatus: overrides.verificationStatus ?? "verified",
    controlType: overrides.controlType ?? "textarea",
    shortAnswer: overrides.shortAnswer ?? null
  };
}

async function backupStorage() {
  await mkdir(getDataDirPath(), { recursive: true }).catch(() => undefined);

  for (const fileName of storageFiles) {
    const filePath = getStorageFilePath(fileName);
    try {
      backups.set(fileName, await readFile(filePath, "utf8"));
    } catch {
      backups.set(fileName, null);
    }
  }
}

async function restoreStorage() {
  for (const fileName of storageFiles) {
    const filePath = getStorageFilePath(fileName);
    const backup = backups.get(fileName);
    if (backup === null) {
      await rm(filePath, { force: true }).catch(() => undefined);
      continue;
    }
    if (backup !== undefined) {
      await writeFile(filePath, backup, "utf8");
    }
  }
  backups.clear();
}

async function seedProfile() {
  const profile = createDefaultProfile();
  profile.identity.firstName = "Avery";
  profile.identity.lastName = "Example";
  profile.identity.fullName = "Avery Example";
  profile.identity.email = "avery@example.com";
  profile.identity.phone = "781-555-0101";
  profile.identity.city = "Boston";
  profile.identity.stateProvince = "MA";
  profile.resume.originalFilename = "resume.pdf";
  profile.resume.storedPath = "/tmp/resume.pdf";
  profile.resume.fileExists = true;
  await saveApplicantProfile(profile);
}

async function seedSession(field: DetectedField): Promise<ApplicationSession> {
  const session = await createApplicationSession({
    company: "Acme",
    roleTitle: "Product Designer",
    jobUrl: "https://jobs.example.com/acme",
    source: "LinkedIn",
    notes: ""
  });

  return updateApplicationSession(session.id, (current) => ({
    ...current,
    detectedFields: [field],
    status: field.status === "filled" ? "ready_for_submission" : "needs_review",
    statusMessage: field.status === "filled" ? "Ready for final review." : "A few answers still need you.",
    nextAction: "Review the page in the browser and submit on the job site when you are ready.",
    atsProvider: "greenhouse",
    fieldsDetected: 1,
    fieldsFilledAndVerified: field.status === "filled" ? 1 : 0,
    fieldsUnresolved: field.status === "filled" ? 0 : 1,
    dogfoodTelemetry: {
      sessionStartedAt: current.createdAt,
      applicationFormReachedAt: current.createdAt,
      initialAutofillCompletedAt: current.createdAt,
      userReviewCompletedAt: "",
      readyForSubmissionAt: current.createdAt,
      fieldsDetectedAtLastPass: 1,
      fieldsFilledVerifiedAtLastPass: field.status === "filled" ? 1 : 0,
      fieldsUnresolvedAtLastPass: field.status === "filled" ? 0 : 1,
      userCorrections: 0,
      manualAnswers: 0,
      autofillRetries: 0
    }
  }));
}

beforeEach(async () => {
  await backupStorage();
});

afterEach(async () => {
  await restoreStorage();
});

test("wrong-fill reports are created locally and can update saved answers for similar applications", async () => {
  await seedProfile();
  const session = await seedSession(
    makeField({
      label: "Why this company?",
      intent: "why_interested",
      answerSource: "generated_answer",
      suggestedValue: "Because of the mission."
    })
  );

  const result = await submitCorrectionReport({
    sessionId: session.id,
    fieldId: "field-1",
    correctedValue: "Because the team is building products for creative professionals.",
    note: "The original answer was too generic.",
    learningApproved: true
  });

  assert.equal(result.report.classification, "generated_answer_issue");
  assert.equal(result.report.learningApproved, true);
  assert.equal(result.applied.answerSaved, true);

  const reportsPath = getStorageFilePath("correction-reports.json");
  await access(reportsPath);
  const storedReports = await readFile(reportsPath, "utf8");
  assert.match(storedReports, /Because the team is building products for creative professionals\./i);
  assert.match(storedReports, /generated_answer_issue/i);

  const answerBank = await getAnswerBank();
  assert.equal(
    answerBank.some((item) => item.canonicalQuestion === "Why this company?" && /creative professionals/i.test(item.answer)),
    true
  );
});

test("sensitive corrections are marked severe and create local regression entries even without reusable learning", async () => {
  await seedProfile();
  const session = await seedSession(
    makeField({
      label: "Will you now or in the future require sponsorship?",
      intent: "sponsorship_future",
      type: "select-one",
      controlType: "native_select",
      sensitivity: "sensitive",
      suggestedValue: "No",
      detectedValue: "No"
    })
  );

  const result = await submitCorrectionReport({
    sessionId: session.id,
    fieldId: "field-1",
    correctedValue: "Yes",
    note: "This answer was incorrect.",
    learningApproved: false
  });

  assert.equal(result.report.severe, true);

  const regressionsPath = getStorageFilePath("dogfood-regressions.json");
  await access(regressionsPath);
  const regressions = await readFile(regressionsPath, "utf8");
  assert.match(regressions, /severe/i);
  assert.match(regressions, /require sponsorship/i);
  assert.ok(regressionsPath.includes("/data/"));
});

test("dogfood exports stay redacted and exclude raw personal fields by default", async () => {
  const report = buildDogfoodReportFromData(
    [
      {
        ...(await seedSession(makeField())),
        company: "Acme",
        roleTitle: "Product Designer"
      }
    ],
    [
      {
        id: "correction-1",
        sessionId: "session-1",
        fieldId: "field-1",
        company: "Acme",
        roleTitle: "Product Designer",
        atsProvider: "greenhouse",
        visibleFieldQuestion: "Why this company?",
        enteredValue: "Because of the mission.",
        correctedValue: "Because the product helps teams ship work faster.",
        note: "Too generic.",
        classification: "generated_answer_issue",
        learningApproved: true,
        learningTargets: ["saved_answer"],
        severe: false,
        answerSource: "generated_answer",
        intent: "why_interested",
        controlType: "textarea",
        createdAt: "2026-07-02T14:00:00.000Z",
        updatedAt: "2026-07-02T14:00:00.000Z"
      }
    ]
  );

  const exported = buildDogfoodReportExport(report);
  const serialized = JSON.stringify(exported);

  assert.equal(exported.localOnly, true);
  assert.doesNotMatch(serialized, /resume\.pdf/i);
  assert.doesNotMatch(serialized, /avery@example\.com/i);
  assert.doesNotMatch(serialized, /781-555-0101/i);
  assert.doesNotMatch(serialized, /Because the product helps teams ship work faster\./i);
});
