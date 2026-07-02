import { getAnswerBank, upsertAnswerBankItem } from "@/lib/answerBank";
import { appendAuditEntry, getApplicationSession, updateApplicationSession } from "@/lib/applications";
import { createAuditEntry } from "@/lib/auditLog";
import { createDefaultProfile, getApplicantProfile, saveApplicantProfile } from "@/lib/profile";
import { readStorageFile, writeStorageFile } from "@/lib/storage";
import {
  ApplicantProfile,
  ControlType,
  CorrectionLearningTarget,
  CorrectionReport,
  CorrectionReportClassification,
  DetectedField,
  DogfoodRegressionEntry,
  FieldIntent
} from "@/types";

const CORRECTION_REPORTS_FILE = "correction-reports.json";
const DOGFOOD_REGRESSIONS_FILE = "dogfood-regressions.json";

const TECHNICAL_CONTROL_TYPES = new Set<ControlType>([
  "native_select",
  "radio",
  "checkbox",
  "aria_combobox",
  "autocomplete",
  "listbox",
  "menu_button",
  "custom_select"
]);

const PROFILE_UPDATE_INTENTS = new Set<FieldIntent>([
  "first_name",
  "last_name",
  "preferred_name",
  "full_name",
  "email",
  "phone",
  "full_phone_number",
  "phone_number",
  "address_line_1",
  "address_line_2",
  "street_address",
  "city",
  "state",
  "country",
  "postal_code",
  "location",
  "full_location",
  "linkedin",
  "github",
  "portfolio",
  "website",
  "work_authorization",
  "work_authorization_category",
  "sponsorship",
  "sponsorship_now",
  "sponsorship_future",
  "desired_salary",
  "education_school",
  "education_degree",
  "education_major",
  "graduation_date",
  "expected_graduation_date",
  "graduation_status",
  "employer",
  "job_title",
  "employment_start_date",
  "employment_end_date"
]);

const ANSWER_MEMORY_INTENTS = new Set<FieldIntent>([
  "why_interested",
  "tell_us_about_yourself",
  "availability",
  "unknown"
]);

const SEVERE_INTENTS = new Set<FieldIntent>([
  "work_authorization",
  "work_authorization_category",
  "sponsorship",
  "sponsorship_now",
  "sponsorship_future",
  "desired_salary",
  "education_school",
  "education_degree",
  "education_major",
  "graduation_date",
  "expected_graduation_date",
  "graduation_status",
  "city",
  "state",
  "country",
  "postal_code",
  "location",
  "full_location",
  "address_line_1",
  "address_line_2",
  "street_address",
  "eeoc_gender",
  "eeoc_race",
  "eeoc_veteran",
  "eeoc_disability",
  "legal_attestation",
  "employer",
  "job_title",
  "employment_start_date",
  "employment_end_date",
  "previous_employment",
  "security_clearance_level",
  "security_clearance_status"
]);

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeCorrectionReport(record: unknown): CorrectionReport | null {
  if (!record || typeof record !== "object") return null;
  const value = record as Record<string, unknown>;

  return {
    id: asString(value.id) || crypto.randomUUID(),
    sessionId: asString(value.sessionId),
    fieldId: asString(value.fieldId),
    company: asString(value.company),
    roleTitle: asString(value.roleTitle),
    atsProvider: (asString(value.atsProvider) as CorrectionReport["atsProvider"]) || "generic",
    visibleFieldQuestion: asString(value.visibleFieldQuestion),
    enteredValue: asString(value.enteredValue),
    correctedValue: asString(value.correctedValue),
    note: asString(value.note),
    classification:
      (asString(value.classification) as CorrectionReportClassification) || "one_time_job_specific_correction",
    learningApproved: Boolean(value.learningApproved),
    learningTargets: Array.isArray(value.learningTargets)
      ? value.learningTargets.filter((target): target is CorrectionLearningTarget => ["profile", "saved_answer", "regression"].includes(asString(target)))
      : [],
    severe: Boolean(value.severe),
    answerSource: (asString(value.answerSource) as CorrectionReport["answerSource"]) || "unknown",
    intent: (asString(value.intent) as FieldIntent) || "unknown",
    controlType: (asString(value.controlType) as ControlType) || "unknown",
    createdAt: asString(value.createdAt) || new Date().toISOString(),
    updatedAt: asString(value.updatedAt) || asString(value.createdAt) || new Date().toISOString()
  };
}

function normalizeRegressionEntry(record: unknown): DogfoodRegressionEntry | null {
  if (!record || typeof record !== "object") return null;
  const value = record as Record<string, unknown>;

  return {
    id: asString(value.id) || crypto.randomUUID(),
    correctionReportId: asString(value.correctionReportId),
    sessionId: asString(value.sessionId),
    atsProvider: (asString(value.atsProvider) as DogfoodRegressionEntry["atsProvider"]) || "generic",
    issueType:
      (asString(value.issueType) as DogfoodRegressionEntry["issueType"]) || "one_time_job_specific_correction",
    severity: asString(value.severity) === "severe" ? "severe" : "normal",
    fieldQuestion: asString(value.fieldQuestion),
    enteredValue: asString(value.enteredValue),
    correctedValue: asString(value.correctedValue),
    note: asString(value.note),
    createdAt: asString(value.createdAt) || new Date().toISOString()
  };
}

export async function getCorrectionReports() {
  const reports = await readStorageFile<unknown[]>(CORRECTION_REPORTS_FILE, []);
  return reports.map(normalizeCorrectionReport).filter((report): report is CorrectionReport => Boolean(report));
}

export async function getDogfoodRegressionEntries() {
  const entries = await readStorageFile<unknown[]>(DOGFOOD_REGRESSIONS_FILE, []);
  return entries.map(normalizeRegressionEntry).filter((entry): entry is DogfoodRegressionEntry => Boolean(entry));
}

function inferSeverity(field: DetectedField) {
  if (SEVERE_INTENTS.has(field.intent)) return true;

  const questionText = [field.label, field.questionText, field.placeholder, field.ariaLabel].join(" ").toLowerCase();
  return /eeoc|ethnicity|race|gender|disability|veteran|salary history|attest|legal|sponsor|visa|clearance|address|postal|zip code|home city|graduation/i.test(
    questionText
  );
}

function inferClassification(field: DetectedField): {
  classification: CorrectionReportClassification;
  learningTargets: CorrectionLearningTarget[];
} {
  const isTechnicalControl = TECHNICAL_CONTROL_TYPES.has(field.controlType ?? "unknown");

  if (isTechnicalControl && (field.matchedOption || field.selectOptions?.length)) {
    return {
      classification: "option_matching_issue",
      learningTargets: [
        ...(PROFILE_UPDATE_INTENTS.has(field.intent) ? (["profile"] as CorrectionLearningTarget[]) : []),
        "regression"
      ]
    };
  }

  if (PROFILE_UPDATE_INTENTS.has(field.intent)) {
    return {
      classification: "profile_data_correction",
      learningTargets: ["profile"]
    };
  }

  if (field.answerSource === "generated_answer") {
    return {
      classification: "generated_answer_issue",
      learningTargets: ["saved_answer"]
    };
  }

  if (field.answerSource === "answer_bank" || ANSWER_MEMORY_INTENTS.has(field.intent) || Boolean(field.shortAnswer)) {
    return {
      classification: "answer_memory_correction",
      learningTargets: ["saved_answer"]
    };
  }

  if (field.intent === "unknown") {
    return {
      classification: "field_intent_mapping_issue",
      learningTargets: ["regression"]
    };
  }

  if (isTechnicalControl) {
    return {
      classification: "ats_control_issue",
      learningTargets: ["regression"]
    };
  }

  return {
    classification: "one_time_job_specific_correction",
    learningTargets: []
  };
}

function updateEducationProfile(profile: ApplicantProfile, field: DetectedField, correctedValue: string) {
  const fallback = createDefaultProfile().education[0];
  const current = profile.education[0] ? { ...profile.education[0] } : { ...fallback };

  switch (field.intent) {
    case "education_school":
      current.school = correctedValue;
      break;
    case "education_degree":
      current.degree = correctedValue;
      break;
    case "education_major":
      current.major = correctedValue;
      current.fieldOfStudy = correctedValue;
      current.displayFieldOfStudy = correctedValue;
      break;
    case "graduation_date":
    case "expected_graduation_date":
      current.graduationDate = correctedValue;
      break;
    case "graduation_status":
      current.graduationStatus = correctedValue as typeof current.graduationStatus;
      break;
    default:
      return false;
  }

  profile.education = [current, ...profile.education.slice(1)];
  return true;
}

function updateExperienceProfile(profile: ApplicantProfile, field: DetectedField, correctedValue: string) {
  const fallback = createDefaultProfile().experience[0];
  const current = profile.experience[0] ? { ...profile.experience[0] } : { ...fallback };

  switch (field.intent) {
    case "employer":
      current.company = correctedValue;
      break;
    case "job_title":
      current.title = correctedValue;
      break;
    case "employment_start_date":
      current.startDate = correctedValue;
      break;
    case "employment_end_date":
      current.endDate = correctedValue;
      break;
    default:
      return false;
  }

  profile.experience = [current, ...profile.experience.slice(1)];
  return true;
}

function parseSalary(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function applyProfileLearning(field: DetectedField, correctedValue: string) {
  const profile = await getApplicantProfile();
  let changed = false;

  switch (field.intent) {
    case "first_name":
      profile.identity.firstName = correctedValue;
      changed = true;
      break;
    case "last_name":
      profile.identity.lastName = correctedValue;
      changed = true;
      break;
    case "preferred_name":
      profile.identity.preferredName = correctedValue;
      changed = true;
      break;
    case "full_name":
      profile.identity.fullName = correctedValue;
      changed = true;
      break;
    case "email":
      profile.identity.email = correctedValue;
      changed = true;
      break;
    case "phone":
    case "full_phone_number":
    case "phone_number":
      profile.identity.phone = correctedValue;
      profile.phone = correctedValue;
      changed = true;
      break;
    case "address_line_1":
    case "street_address":
      profile.identity.addressLine1 = correctedValue;
      changed = true;
      break;
    case "address_line_2":
      profile.identity.addressLine2 = correctedValue;
      changed = true;
      break;
    case "city":
      profile.identity.city = correctedValue;
      changed = true;
      break;
    case "state":
      profile.identity.stateProvince = correctedValue;
      changed = true;
      break;
    case "country":
      profile.identity.country = correctedValue;
      changed = true;
      break;
    case "postal_code":
      profile.identity.postalCode = correctedValue;
      changed = true;
      break;
    case "location":
    case "full_location":
      profile.identity.locationLabel = correctedValue;
      profile.location = correctedValue;
      changed = true;
      break;
    case "linkedin":
      profile.identity.linkedin = correctedValue;
      changed = true;
      break;
    case "github":
      profile.identity.github = correctedValue;
      changed = true;
      break;
    case "portfolio":
      profile.identity.portfolio = correctedValue;
      changed = true;
      break;
    case "website":
      profile.identity.website = correctedValue;
      changed = true;
      break;
    case "work_authorization":
      profile.workAuthorizationProfile.authorizedInUS = correctedValue.toLowerCase().startsWith("y") ? "yes" : correctedValue.toLowerCase().startsWith("n") ? "no" : "ask";
      changed = true;
      break;
    case "work_authorization_category":
      profile.workAuthorizationProfile.usWorkAuthorizationCategory = correctedValue as typeof profile.workAuthorizationProfile.usWorkAuthorizationCategory;
      changed = true;
      break;
    case "sponsorship":
    case "sponsorship_now":
      profile.workAuthorizationProfile.requiresSponsorshipNow =
        correctedValue.toLowerCase().startsWith("y") ? "yes" : correctedValue.toLowerCase().startsWith("n") ? "no" : "ask";
      changed = true;
      break;
    case "sponsorship_future":
      profile.workAuthorizationProfile.requiresSponsorshipFuture =
        correctedValue.toLowerCase().startsWith("y") ? "yes" : correctedValue.toLowerCase().startsWith("n") ? "no" : "ask";
      changed = true;
      break;
    case "desired_salary": {
      const parsed = parseSalary(correctedValue);
      profile.desiredSalary = correctedValue;
      profile.compensationProfile.targetSalary = parsed;
      if (parsed !== null) {
        profile.compensationProfile.answerStyle = "target";
      }
      changed = true;
      break;
    }
    default:
      changed = updateEducationProfile(profile, field, correctedValue) || updateExperienceProfile(profile, field, correctedValue);
      break;
  }

  if (!changed) return false;
  await saveApplicantProfile(profile);
  return true;
}

function inferSavedAnswerCanonicalQuestion(field: DetectedField) {
  return field.shortAnswer?.canonicalQuestion?.trim() || field.label.trim() || field.questionText?.trim() || "Saved answer";
}

async function applySavedAnswerLearning(field: DetectedField, correctedValue: string) {
  if (!correctedValue.trim()) return false;

  const canonicalQuestion = inferSavedAnswerCanonicalQuestion(field);
  const answerBank = await getAnswerBank();
  const matched = answerBank.find((item) => item.canonicalQuestion.trim().toLowerCase() === canonicalQuestion.trim().toLowerCase());

  await upsertAnswerBankItem({
    label: matched?.label || canonicalQuestion,
    canonicalQuestion,
    questionPatterns: [field.label, field.name, field.questionText, field.intent.replaceAll("_", " ")].filter(Boolean) as string[],
    answer: correctedValue.trim(),
    intent: field.intent,
    fieldType: field.type,
    optionLabel: field.matchedOption || "",
    sensitivity: field.sensitivity === "safe" ? "review" : field.sensitivity,
    autoFillAllowed: false,
    autofillBehavior: "suggest"
  });

  return true;
}

async function appendCorrectionReport(report: CorrectionReport) {
  const existing = await getCorrectionReports();
  await writeStorageFile(CORRECTION_REPORTS_FILE, [report, ...existing]);
}

async function appendRegressionEntry(entry: DogfoodRegressionEntry) {
  const existing = await getDogfoodRegressionEntries();
  await writeStorageFile(DOGFOOD_REGRESSIONS_FILE, [entry, ...existing]);
}

export async function submitCorrectionReport({
  sessionId,
  fieldId,
  correctedValue,
  note,
  learningApproved
}: {
  sessionId: string;
  fieldId: string;
  correctedValue: string;
  note?: string;
  learningApproved: boolean;
}) {
  const session = await getApplicationSession(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const field = session.detectedFields.find((entry) => entry.id === fieldId);
  if (!field) {
    throw new Error("Field not found.");
  }

  const corrected = correctedValue.trim();
  if (!corrected) {
    throw new Error("Add the correct value before saving this correction.");
  }

  const analysis = inferClassification(field);
  const severe = inferSeverity(field);

  const profileUpdated = learningApproved && analysis.learningTargets.includes("profile") ? await applyProfileLearning(field, corrected) : false;
  const answerSaved = learningApproved && analysis.learningTargets.includes("saved_answer") ? await applySavedAnswerLearning(field, corrected) : false;
  const regressionLogged = severe || (learningApproved && analysis.learningTargets.includes("regression"));

  const report: CorrectionReport = {
    id: crypto.randomUUID(),
    sessionId,
    fieldId: field.id,
    company: session.company,
    roleTitle: session.roleTitle,
    atsProvider: session.atsProvider,
    visibleFieldQuestion: field.label || field.questionText || field.name || "Field",
    enteredValue: field.detectedValue || field.suggestedValue,
    correctedValue: corrected,
    note: note?.trim() || "",
    classification: analysis.classification,
    learningApproved,
    learningTargets: Array.from(
      new Set([
        ...(analysis.learningTargets ?? []),
        ...(severe ? (["regression"] as CorrectionLearningTarget[]) : [])
      ])
    ),
    severe,
    answerSource: field.answerSource,
    intent: field.intent,
    controlType: field.controlType ?? "unknown",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await appendCorrectionReport(report);

  if (regressionLogged) {
    await appendRegressionEntry({
      id: crypto.randomUUID(),
      correctionReportId: report.id,
      sessionId,
      atsProvider: session.atsProvider,
      issueType: report.classification,
      severity: severe ? "severe" : "normal",
      fieldQuestion: report.visibleFieldQuestion,
      enteredValue: report.enteredValue,
      correctedValue: report.correctedValue,
      note: report.note,
      createdAt: report.createdAt
    });
  }

  const updatedSession = await updateApplicationSession(sessionId, (current) => {
    const telemetry = current.dogfoodTelemetry ?? {
      sessionStartedAt: current.createdAt,
      applicationFormReachedAt: "",
      initialAutofillCompletedAt: "",
      userReviewCompletedAt: "",
      readyForSubmissionAt: "",
      fieldsDetectedAtLastPass: current.fieldsDetected,
      fieldsFilledVerifiedAtLastPass: current.fieldsFilledAndVerified,
      fieldsUnresolvedAtLastPass: current.fieldsUnresolved,
      userCorrections: 0,
      manualAnswers: 0,
      autofillRetries: 0
    };

    return {
      ...current,
      detectedFields: current.detectedFields.map((entry) =>
        entry.id === fieldId
          ? {
              ...entry,
              suggestedValue: corrected,
              detectedValue: entry.status === "filled" ? corrected : entry.detectedValue,
              reason: "Corrected after dogfooding feedback.",
              verificationMessage:
                entry.status === "filled"
                  ? "This value was corrected manually after ApplyPilot filled it."
                  : entry.verificationMessage
            }
          : entry
      ),
      dogfoodTelemetry: {
        ...telemetry,
        userCorrections: telemetry.userCorrections + 1
      }
    };
  });

  let sessionWithAudit = await appendAuditEntry(
    sessionId,
    createAuditEntry(sessionId, "correction_reported", `Recorded a correction for ${report.visibleFieldQuestion}.`, {
      fieldId,
      reason: `Stored locally as ${report.classification.replaceAll("_", " ")}.`
    })
  );

  if (learningApproved && (profileUpdated || answerSaved || regressionLogged)) {
    sessionWithAudit = await appendAuditEntry(
      sessionId,
      createAuditEntry(sessionId, "correction_learned", `Saved reusable learning from ${report.visibleFieldQuestion}.`, {
        fieldId,
        reason: [
          profileUpdated ? "profile updated" : "",
          answerSaved ? "saved answer updated" : "",
          regressionLogged ? "regression logged" : ""
        ]
          .filter(Boolean)
          .join(", ")
      })
    );
  }

  return {
    session: sessionWithAudit || updatedSession,
    report,
    applied: {
      profileUpdated,
      answerSaved,
      regressionLogged
    }
  };
}
