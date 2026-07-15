import { execFile as execFileCallback } from "node:child_process";
import { lstat, mkdir, readlink, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { Browser, BrowserContext, Page } from "playwright";

type BrowserManagerState = {
  browser: Browser | null;
  context: BrowserContext | null;
  pages: Map<string, Page>;
};

const store = globalThis as typeof globalThis & {
  __applyPilotBrowserManager?: BrowserManagerState;
};

const state =
  store.__applyPilotBrowserManager ??
  {
    browser: null,
    context: null,
    pages: new Map<string, Page>()
  };

store.__applyPilotBrowserManager = state;

const BROWSER_PROFILE_DIR = path.join(process.cwd(), "data", "browser-profile");
const execFile = promisify(execFileCallback);
const PERSISTENT_PROFILE_LOCK_FILES = ["SingletonLock", "SingletonCookie", "SingletonSocket", "RunningChromeVersion"] as const;

async function getPlaywright() {
  return import("playwright");
}

function isContextAlive(context: BrowserContext | null) {
  return Boolean(context && context.pages);
}

function isBrowserAlive(browser: Browser | null) {
  return Boolean(browser?.isConnected());
}

export function isPersistentProfileLockError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Opening in existing browser session|SingletonLock|process_singleton_posix/i.test(message);
}

async function readProcessCommands() {
  try {
    const { stdout } = await execFile("ps", ["ax", "-o", "command="]);
    return stdout;
  } catch {
    return "";
  }
}

async function pathHasOpenHandle(filePath: string) {
  if (!filePath) return false;

  try {
    const { stdout } = await execFile("lsof", [filePath]);
    return Boolean(stdout.trim());
  } catch {
    return false;
  }
}

export async function clearPersistentProfileSingletonArtifacts(
  profileDir = BROWSER_PROFILE_DIR,
  processCommands?: string
) {
  let removed = false;
  const singletonSocketPath = path.join(profileDir, "SingletonSocket");
  let socketTarget = "";

  try {
    const socketStats = await lstat(singletonSocketPath);
    if (socketStats.isSymbolicLink()) {
      socketTarget = path.resolve(profileDir, await readlink(singletonSocketPath));
    }
  } catch {
    socketTarget = "";
  }

  if (socketTarget && (await pathHasOpenHandle(socketTarget))) {
    return false;
  }

  const commands = processCommands ?? (await readProcessCommands());
  if (!socketTarget && commands.includes(`--user-data-dir=${profileDir}`)) {
    return false;
  }

  for (const fileName of PERSISTENT_PROFILE_LOCK_FILES) {
    const filePath = path.join(profileDir, fileName);
    try {
      await unlink(filePath);
      removed = true;
    } catch {
      try {
        await rm(filePath, { force: true, recursive: true });
        removed = true;
      } catch {
        // Ignore files that are already gone or not removable.
      }
    }
  }

  if (socketTarget) {
    await rm(socketTarget, { force: true }).catch(() => undefined);
  }

  return removed;
}

async function disposeClosedPages() {
  for (const [sessionId, page] of state.pages.entries()) {
    if (page.isClosed()) {
      state.pages.delete(sessionId);
    }
  }
}

export async function getOrCreateBrowserContext() {
  await disposeClosedPages();

  if (isBrowserAlive(state.browser) && isContextAlive(state.context)) {
    return state.context as BrowserContext;
  }

  const { chromium } = await getPlaywright();
  const useEphemeralTestContext = process.env.NODE_ENV === "test" || process.env.APPLYPILOT_HEADLESS === "1";

  if (useEphemeralTestContext) {
    state.browser = await chromium.launch({
      headless: true,
      slowMo: 0
    });
    state.browser.on("disconnected", () => {
      state.browser = null;
      state.context = null;
      state.pages.clear();
    });
    state.context = await state.browser.newContext();
    return state.context;
  }

  await mkdir(BROWSER_PROFILE_DIR, { recursive: true });
  const launchPersistentContext = () =>
    chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      headless: false,
      slowMo: 50
    });

  try {
    state.context = await launchPersistentContext();
  } catch (error) {
    if (!isPersistentProfileLockError(error)) {
      throw error;
    }

    const cleared = await clearPersistentProfileSingletonArtifacts(BROWSER_PROFILE_DIR);
    if (!cleared) {
      throw error;
    }

    state.context = await launchPersistentContext();
  }
  state.browser = state.context.browser();
  state.browser?.on("disconnected", () => {
    state.browser = null;
    state.context = null;
    state.pages.clear();
  });
  state.context.on("close", () => {
    if (state.context) {
      state.context = null;
      state.browser = null;
      state.pages.clear();
    }
  });
  return state.context;
}

export async function getOrCreateSessionPage(
  sessionId: string,
  options: {
    url?: string;
    navigate?: boolean;
    reuseOpenPage?: boolean;
  } = {}
) {
  const context = await getOrCreateBrowserContext();
  const existing = state.pages.get(sessionId);
  const targetUrl = options.url;
  const shouldNavigate = options.navigate ?? true;

  if (existing && !existing.isClosed()) {
    await existing.bringToFront().catch(() => undefined);
    if (targetUrl && shouldNavigate && existing.url() !== targetUrl) {
      await existing.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    }
    return existing;
  }

  if (options.reuseOpenPage) {
    for (const [trackedSessionId, candidatePage] of state.pages.entries()) {
      if (trackedSessionId === sessionId || candidatePage.isClosed()) {
        continue;
      }

      state.pages.delete(trackedSessionId);
      state.pages.set(sessionId, candidatePage);
      await candidatePage.bringToFront().catch(() => undefined);
      if (targetUrl && shouldNavigate && candidatePage.url() !== targetUrl) {
        await candidatePage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      }
      return candidatePage;
    }
  }

  const page = await context.newPage();
  page.on("close", () => {
    for (const [trackedSessionId, trackedPage] of state.pages.entries()) {
      if (trackedPage === page) {
        state.pages.delete(trackedSessionId);
        break;
      }
    }
  });

  state.pages.set(sessionId, page);
  await page.bringToFront().catch(() => undefined);
  if (targetUrl && (shouldNavigate || page.url() === "about:blank")) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  }

  return page;
}

export function getSessionPage(sessionId: string) {
  const page = state.pages.get(sessionId) ?? null;
  if (!page || page.isClosed()) {
    state.pages.delete(sessionId);
    return null;
  }
  return page;
}

export async function focusSessionPage(sessionId: string) {
  const page = getSessionPage(sessionId);
  if (!page) return null;
  await page.bringToFront().catch(() => undefined);
  return page;
}

export async function closeSessionPage(sessionId: string) {
  const page = state.pages.get(sessionId);
  if (!page) return;
  state.pages.delete(sessionId);
  if (!page.isClosed()) {
    await page.close().catch(() => undefined);
  }
}

export async function recoverClosedContext() {
  if (isBrowserAlive(state.browser) && isContextAlive(state.context)) {
    return state.context as BrowserContext;
  }

  state.browser = null;
  state.context = null;
  state.pages.clear();
  return getOrCreateBrowserContext();
}

export function getOpenSessionCount() {
  return Array.from(state.pages.values()).filter((page) => !page.isClosed()).length;
}

export function getBrowserDiagnostics() {
  const openSessions = Array.from(state.pages.entries())
    .filter(([, page]) => !page.isClosed())
    .map(([sessionId]) => sessionId);

  return {
    browserConnected: isBrowserAlive(state.browser),
    openSessionCount: openSessions.length,
    openSessionIds: openSessions
  };
}

export async function clearBrowserManagerState() {
  for (const page of state.pages.values()) {
    if (!page.isClosed()) {
      await page.close().catch(() => undefined);
    }
  }
  state.pages.clear();
  await state.context?.close().catch(() => undefined);
  await state.browser?.close().catch(() => undefined);
  state.context = null;
  state.browser = null;
}

export async function resetBrowserManagerForTests() {
  await clearBrowserManagerState();
}
