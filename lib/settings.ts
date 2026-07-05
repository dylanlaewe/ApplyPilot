import { readStorageFile, writeStorageFile } from "@/lib/storage";

export interface ApplyPilotSettings {
  applicationBehavior: {
    reuseBrowserWindow: boolean;
    workdaySafeModeEnabled: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

const SETTINGS_FILE = "settings.json";

export function createDefaultSettings(): ApplyPilotSettings {
  const now = new Date().toISOString();
  return {
    applicationBehavior: {
      reuseBrowserWindow: true,
      workdaySafeModeEnabled: true
    },
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeSettings(value: Partial<ApplyPilotSettings> | null | undefined): ApplyPilotSettings {
  const base = createDefaultSettings();

  return {
    applicationBehavior: {
      reuseBrowserWindow: value?.applicationBehavior?.reuseBrowserWindow ?? base.applicationBehavior.reuseBrowserWindow,
      workdaySafeModeEnabled:
        value?.applicationBehavior?.workdaySafeModeEnabled ?? base.applicationBehavior.workdaySafeModeEnabled
    },
    createdAt: value?.createdAt || base.createdAt,
    updatedAt: value?.updatedAt || base.updatedAt
  };
}

export async function getSettings() {
  const stored = await readStorageFile<ApplyPilotSettings>(SETTINGS_FILE, createDefaultSettings());
  return normalizeSettings(stored);
}

export async function saveSettings(partial: Partial<ApplyPilotSettings>) {
  const current = await getSettings();
  const next = normalizeSettings({
    ...current,
    ...partial,
    applicationBehavior: {
      ...current.applicationBehavior,
      ...partial.applicationBehavior
    },
    updatedAt: new Date().toISOString()
  });

  await writeStorageFile(SETTINGS_FILE, next);
  return next;
}
