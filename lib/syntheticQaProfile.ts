import { promises as fs } from "fs";
import path from "path";

import { createDefaultAnswerBank, normalizeAnswerBankItem, saveAnswerBank, getAnswerBank } from "@/lib/answerBank";
import { createDefaultProfile, getApplicantProfile, normalizeProfile, saveApplicantProfile } from "@/lib/profile";
import { getStorageFilePath, writeStorageFile } from "@/lib/storage";
import {
  isSyntheticQaProfile,
  SYNTHETIC_QA_PROFILE_EMAIL,
  SYNTHETIC_QA_PROFILE_LABEL,
  SYNTHETIC_QA_PROFILE_NAME,
  SYNTHETIC_QA_RESUME_FILENAME
} from "@/lib/syntheticQaProfileShared";
import { AnswerBankItem, ApplicantProfile } from "@/types";

const PROFILE_BACKUP_FILE = "profile.before-synthetic-qa.json";
const ANSWER_BANK_BACKUP_FILE = "answer-bank.before-synthetic-qa.json";
export {
  isSyntheticQaProfile,
  SYNTHETIC_QA_PROFILE_EMAIL,
  SYNTHETIC_QA_PROFILE_LABEL,
  SYNTHETIC_QA_PROFILE_NAME,
  SYNTHETIC_QA_RESUME_FILENAME
} from "@/lib/syntheticQaProfileShared";

function nowIso() {
  return new Date().toISOString();
}

function buildSyntheticAnswerItem({
  label,
  canonicalQuestion,
  questionPatterns,
  answer,
  sensitivity,
  autoFillAllowed
}: {
  label: string;
  canonicalQuestion: string;
  questionPatterns: string[];
  answer: string;
  sensitivity: AnswerBankItem["sensitivity"];
  autoFillAllowed: boolean;
}) {
  const now = nowIso();
  return normalizeAnswerBankItem({
    id: crypto.randomUUID(),
    label,
    canonicalQuestion,
    normalizedQuestion: canonicalQuestion,
    questionPatterns,
    answer,
    sensitivity,
    autofillBehavior: autoFillAllowed ? "autofill" : "suggest",
    autoFillAllowed,
    usageCount: 0,
    lastUsedAt: "",
    createdAt: now,
    updatedAt: now
  });
}

export function getSyntheticQaResumePath() {
  return path.join(process.cwd(), "fixtures", "qa", SYNTHETIC_QA_RESUME_FILENAME);
}

export function createSyntheticQaProfile() {
  const base = createDefaultProfile();
  const resumePath = getSyntheticQaResumePath();

  return normalizeProfile({
    ...base,
    identity: {
      ...base.identity,
      firstName: "Avery",
      lastName: "Example",
      fullName: SYNTHETIC_QA_PROFILE_NAME,
      email: SYNTHETIC_QA_PROFILE_EMAIL,
      phoneCountry: "United States of America",
      phoneCountryCode: "+1",
      phoneNationalNumber: "6175550117",
      addressLine1: "895 Front St",
      city: "Boston",
      stateProvince: "Massachusetts",
      postalCode: "02190",
      country: "United States of America",
      linkedin: "https://linkedin.com/in/avery-example-qa",
      github: "https://github.com/avery-example-qa",
      portfolio: "https://avery-example-qa.dev/portfolio",
      website: "https://avery-example-qa.dev",
      genericWebsiteFallback: "portfolio"
    },
    workAuthorizationProfile: {
      ...base.workAuthorizationProfile,
      authorizedInUS: "yes",
      usWorkAuthorizationCategory: "us_citizen",
      requiresSponsorshipNow: "no",
      requiresSponsorshipFuture: "no",
      openToRemote: "yes",
      openToHybrid: "yes"
    },
    availabilityProfile: {
      ...base.availabilityProfile,
      startTiming: "2_weeks"
    },
    compensationProfile: {
      ...base.compensationProfile,
      minimumSalary: 90000,
      targetSalary: 100000,
      highSalary: 115000,
      answerStyle: "range"
    },
    skillsProfile: {
      ...base.skillsProfile,
      skills: ["SQL", "TypeScript", "Python", "Power BI", "CRM Integration", "Data Modeling", "Technical Support"]
    },
    preferencesProfile: {
      ...base.preferencesProfile,
      jobTypes: ["full_time", "internship"],
      locationsOpenTo: [
        {
          type: "city",
          label: "Boston, Massachusetts, United States",
          city: "Boston",
          stateProvince: "Massachusetts",
          country: "United States of America",
          normalizedKey: "boston-massachusetts-united-states-of-america"
        },
        {
          type: "remote",
          label: "Remote",
          city: "",
          stateProvince: "",
          country: "",
          normalizedKey: "remote"
        }
      ]
    },
    professionalBackground: {
      professionalSummary:
        "Synthetic QA candidate for local ApplyPilot testing only. Focused on analytics, data engineering, and support workflows. Do not submit real applications with this profile.",
      currentIdentity: "Computer Science student and business intelligence intern",
      targetRoleCategories: ["Data Engineering", "Business Intelligence", "Analytics Engineering"],
      industriesOfInterest: ["Software", "Broadband", "Education"],
      careerDirection: "Looking for a full-time technical role that combines analytics, data systems, and practical business impact.",
      keyStrengths: ["SQL reporting", "Workflow automation", "Stakeholder communication"],
      keyAccomplishments: ["Built reporting workflows", "Improved CRM data quality", "Documented repeatable support processes"],
      importantProjects: ["Broadband operations reporting", "Synthetic QA resume and profile workflow"],
      reasonsForSeeking: ["Full-time growth", "Stronger team environment", "Broader technical ownership"]
    },
    additionalApplicationFacts: {
      ...base.additionalApplicationFacts,
      referralSource: "Company Website",
      phoneDeviceType: "Mobile"
    },
    workHistoryComplete: true,
    experience: [
      {
        id: crypto.randomUUID(),
        company: "Bresco Broadband",
        normalizedCompanyName: "bresco broadband",
        aliases: [],
        title: "Business Intelligence / Data Engineering Intern",
        location: "Remote",
        startDate: "2025-05",
        endDate: "",
        currentRole: true,
        summary: "Built SQL, reporting, CRM, and data integration workflows for broadband operations.",
        bullets: [
          "Built SQL pipelines and reporting for broadband operations metrics.",
          "Improved CRM and internal data integration workflows.",
          "Partnered with business users on recurring reporting needs."
        ]
      },
      {
        id: crypto.randomUUID(),
        company: "Example IT Services",
        normalizedCompanyName: "example it services",
        aliases: [],
        title: "IT Support Intern",
        location: "Boston, MA",
        startDate: "2024-05",
        endDate: "2024-08",
        currentRole: false,
        summary: "Supported device setup, troubleshooting, documentation, and internal technical support.",
        bullets: [
          "Supported device setup and troubleshooting for internal teams.",
          "Improved support documentation and knowledge sharing.",
          "Handled routine technical support tasks and escalations."
        ]
      }
    ],
    education: [
      {
        id: crypto.randomUUID(),
        school: "Marist University",
        normalizedSchoolName: "marist university",
        degree: "Bachelor of Science",
        degreeType: "bachelor_of_science",
        degreeCustomValue: "",
        degreeLevel: "bachelors_degree",
        major: "Computer Science",
        fieldOfStudy: "Computer Science",
        normalizedFieldOfStudy: "computer science",
        displayFieldOfStudy: "Computer Science",
        graduationStatus: "expected",
        graduationDate: "2026-05",
        graduationDateType: "expected",
        gpa: "",
        startDate: "2022-08",
        endDate: "2026-05",
        location: "Poughkeepsie, NY"
      }
    ],
    stories: [
      {
        id: crypto.randomUUID(),
        title: "Reporting workflow cleanup",
        tags: ["analytics", "ownership", "communication"],
        situation: "A reporting process depended on inconsistent CRM exports and manual spreadsheet cleanup.",
        action: "I standardized the SQL extraction, documented the handoff steps, and built a repeatable reporting workflow for weekly operations reviews.",
        result: "Stakeholders got more reliable reporting with less manual cleanup and faster weekly turnaround."
      }
    ],
    resume: {
      originalFilename: SYNTHETIC_QA_RESUME_FILENAME,
      storedPath: resumePath,
      mimeType: "application/pdf",
      fileSize: 0,
      uploadedAt: nowIso(),
      fileExists: true
    }
  });
}

export function createSyntheticQaAnswerBank() {
  const defaults = createDefaultAnswerBank();
  const items = [
    ...defaults,
    buildSyntheticAnswerItem({
      label: "How did you hear about us?",
      canonicalQuestion: "How did you hear about us?",
      questionPatterns: ["how did you hear about us", "how did you learn about this opportunity", "referral source"],
      answer: "Company Website",
      sensitivity: "safe",
      autoFillAllowed: true
    }),
    buildSyntheticAnswerItem({
      label: "Do you have any affiliation with Brown University?",
      canonicalQuestion: "Do you have any affiliation with Brown University?",
      questionPatterns: ["affiliation with brown university", "prior affiliation with brown university", "brown university affiliation"],
      answer: "No",
      sensitivity: "review",
      autoFillAllowed: true
    }),
    buildSyntheticAnswerItem({
      label: "Reason for leaving current position",
      canonicalQuestion: "Please provide your reason for wanting to leave or leaving your current position.",
      questionPatterns: ["reason for leaving current position", "reason for wanting to leave", "why are you leaving your current position"],
      answer:
        "I am looking for a full-time opportunity where I can continue growing my technical skills and contribute to a strong team.",
      sensitivity: "review",
      autoFillAllowed: true
    }),
    buildSyntheticAnswerItem({
      label: "Additional education and affiliations",
      canonicalQuestion:
        "List any additional education, professional affiliations, training, licenses, and certificates with certification numbers, volunteer assignments or any other information you would like us to consider.",
      questionPatterns: ["additional education", "professional affiliations", "training licenses certificates", "other information you would like us to consider"],
      answer:
        "Completed coursework and project work in software development, databases, data analysis, and business intelligence.",
      sensitivity: "review",
      autoFillAllowed: true
    }),
    buildSyntheticAnswerItem({
      label: "Are you authorized to work in the United States?",
      canonicalQuestion: "Are you authorized to work in the United States?",
      questionPatterns: ["authorized to work in the united states", "work authorization", "authorized to work in the us"],
      answer: "Yes, authorized to work in the United States.",
      sensitivity: "sensitive",
      autoFillAllowed: true
    }),
    buildSyntheticAnswerItem({
      label: "Will you now require sponsorship?",
      canonicalQuestion: "Will you now require sponsorship?",
      questionPatterns: ["require sponsorship now", "need sponsorship now"],
      answer: "No.",
      sensitivity: "sensitive",
      autoFillAllowed: true
    }),
    buildSyntheticAnswerItem({
      label: "Will you in the future require sponsorship?",
      canonicalQuestion: "Will you in the future require sponsorship?",
      questionPatterns: ["require sponsorship in future", "future sponsorship", "require sponsorship later"],
      answer: "No.",
      sensitivity: "sensitive",
      autoFillAllowed: true
    }),
    buildSyntheticAnswerItem({
      label: "Prior employment with employer",
      canonicalQuestion: "Have you previously worked for this employer?",
      questionPatterns: ["previously worked for", "prior employment with employer", "former employee"],
      answer: "No.",
      sensitivity: "review",
      autoFillAllowed: true
    }),
    buildSyntheticAnswerItem({
      label: "Phone device type",
      canonicalQuestion: "Phone Device Type",
      questionPatterns: ["phone device type", "mobile or home phone", "device type"],
      answer: "Mobile",
      sensitivity: "safe",
      autoFillAllowed: true
    })
  ];

  return items.map(normalizeAnswerBankItem);
}

async function backupCurrentLocalDataIfNeeded() {
  const [profile, answerBank] = await Promise.all([getApplicantProfile(), getAnswerBank()]);
  if (!isSyntheticQaProfile(profile)) {
    await Promise.all([
      writeStorageFile(PROFILE_BACKUP_FILE, profile),
      writeStorageFile(ANSWER_BANK_BACKUP_FILE, answerBank)
    ]);
  }
}

export async function syntheticQaBackupAvailable() {
  const backupPath = getStorageFilePath(PROFILE_BACKUP_FILE);
  try {
    await fs.access(backupPath);
    return true;
  } catch {
    return false;
  }
}

async function readOptionalBackupFile<T>(fileName: string): Promise<T | null> {
  const filePath = getStorageFilePath(fileName);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function loadSyntheticQaData() {
  await backupCurrentLocalDataIfNeeded();
  const [profile, answerBank] = await Promise.all([
    saveApplicantProfile(createSyntheticQaProfile()),
    saveAnswerBank(createSyntheticQaAnswerBank())
  ]);

  return {
    profile,
    answerBank,
    backupAvailable: await syntheticQaBackupAvailable()
  };
}

export async function restoreSyntheticQaBackup() {
  const [backupProfile, backupAnswerBank] = await Promise.all([
    readOptionalBackupFile<ApplicantProfile>(PROFILE_BACKUP_FILE),
    readOptionalBackupFile<AnswerBankItem[]>(ANSWER_BANK_BACKUP_FILE)
  ]);

  if (!backupProfile || !backupAnswerBank) {
    throw new Error("No saved local profile backup is available to restore.");
  }

  const [profile, answerBank] = await Promise.all([
    saveApplicantProfile(backupProfile),
    saveAnswerBank(backupAnswerBank)
  ]);

  return {
    profile,
    answerBank,
    backupAvailable: true
  };
}
