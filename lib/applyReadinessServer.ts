import { access, unlink, writeFile } from "node:fs/promises";

import { ensureDataDir, getDataDirPath } from "@/lib/storage";
import { getShortAnswerGeneratorRuntimeHealth } from "@/lib/shortAnswerGenerator";
import { ApplyReadinessEnvironment } from "@/types";

export async function collectApplyReadinessEnvironment(): Promise<ApplyReadinessEnvironment> {
  const generatorHealth = getShortAnswerGeneratorRuntimeHealth();
  const [browser, storage] = await Promise.all([probeBrowserAutomation(), probeLocalStorage()]);

  return {
    browserAutomationAvailable: browser.available,
    browserAutomationDetail: browser.detail,
    localStorageWritable: storage.available,
    localStorageDetail: storage.detail,
    generatorHealth
  };
}

async function probeBrowserAutomation() {
  try {
    const { chromium } = await import("playwright");
    const executablePath = chromium.executablePath();
    await access(executablePath);
    return {
      available: true,
      detail: "Chromium is installed locally and ready for controlled application sessions."
    };
  } catch (error) {
    return {
      available: false,
      detail: error instanceof Error ? error.message : "Playwright Chromium is not available locally."
    };
  }
}

async function probeLocalStorage() {
  const probePath = `${getDataDirPath()}/.applypilot-readiness-check.tmp`;

  try {
    await ensureDataDir();
    await writeFile(probePath, "ok", "utf8");
    await unlink(probePath);
    return {
      available: true,
      detail: "ApplyPilot can write to its local data folder on this device."
    };
  } catch (error) {
    return {
      available: false,
      detail: error instanceof Error ? error.message : "ApplyPilot could not write to its local data folder."
    };
  }
}
