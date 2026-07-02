import { createDefaultAnswerBank, saveAnswerBank, getAnswerBank } from "@/lib/answerBank";
import { getApplicationSessions } from "@/lib/applications";
import { clearBrowserManagerState, getBrowserDiagnostics } from "@/lib/browserManager";
import { createBlankStory, createDefaultProfile, getApplicantProfile, saveApplicantProfile } from "@/lib/profile";
import { removeResumeFile } from "@/lib/resumeStorage";
import { createDefaultSettings, getSettings, saveSettings } from "@/lib/settings";
import { getDataDirPath, writeStorageFile } from "@/lib/storage";

const APPLICATION_SESSIONS_FILE = "application-sessions.json";

export type LocalDataClearAction =
  | "applications"
  | "saved_answers"
  | "behavioral_stories"
  | "profile"
  | "browser_sessions";

export async function buildLocalDataSummary() {
  const [profile, answerBank, sessions, settings] = await Promise.all([
    getApplicantProfile(),
    getAnswerBank(),
    getApplicationSessions(),
    getSettings()
  ]);

  return {
    dataDirectoryPath: getDataDirPath(),
    profile,
    settings,
    counts: {
      savedAnswers: answerBank.length,
      applicationHistory: sessions.length,
      behavioralStories: profile.stories.filter((story) => story.title || story.situation || story.action || story.result).length
    },
    browserDiagnostics: getBrowserDiagnostics()
  };
}

export async function exportLocalDataBundle() {
  const [profile, answerBank, sessions, settings] = await Promise.all([
    getApplicantProfile(),
    getAnswerBank(),
    getApplicationSessions(),
    getSettings()
  ]);

  return {
    exportedAt: new Date().toISOString(),
    storage: {
      directory: getDataDirPath(),
      localOnly: true
    },
    profile,
    answerBank,
    applicationSessions: sessions,
    settings,
    browserDiagnostics: getBrowserDiagnostics()
  };
}

export async function clearLocalData(action: LocalDataClearAction) {
  switch (action) {
    case "applications":
      await writeStorageFile(APPLICATION_SESSIONS_FILE, []);
      break;
    case "saved_answers":
      await saveAnswerBank([]);
      break;
    case "behavioral_stories": {
      const profile = await getApplicantProfile();
      await saveApplicantProfile({
        ...profile,
        stories: [createBlankStory()]
      });
      break;
    }
    case "profile": {
      const profile = await getApplicantProfile();
      if (profile.resume.storedPath) {
        await removeResumeFile(profile.resume.storedPath);
      }
      await saveApplicantProfile(createDefaultProfile());
      break;
    }
    case "browser_sessions":
      await clearBrowserManagerState();
      break;
    default:
      action satisfies never;
  }

  return buildLocalDataSummary();
}

export async function resetSettings() {
  return saveSettings(createDefaultSettings());
}

export function getClearActionMessage(action: LocalDataClearAction) {
  switch (action) {
    case "applications":
      return "Application history cleared.";
    case "saved_answers":
      return "Saved answers cleared.";
    case "behavioral_stories":
      return "Behavioral stories cleared.";
    case "profile":
      return "Profile reset locally.";
    case "browser_sessions":
      return "Controlled browser session data cleared.";
    default:
      action satisfies never;
      return "Local data updated.";
  }
}

export function getClearActionDescription(action: LocalDataClearAction) {
  switch (action) {
    case "applications":
      return "Local application records, notes, statuses, and session summaries";
    case "saved_answers":
      return "Saved reusable answers";
    case "behavioral_stories":
      return "Saved behavioral stories only";
    case "profile":
      return "Profile details and the stored resume file";
    case "browser_sessions":
      return "Open controlled browser windows and in-memory browser session state";
    default:
      action satisfies never;
      return "Selected local data";
  }
}

export function getSavedAnswersDefaultCount() {
  return createDefaultAnswerBank().length;
}
