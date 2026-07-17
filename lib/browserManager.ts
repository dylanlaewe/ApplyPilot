import { execFile as execFileCallback } from "node:child_process";
import { lstat, mkdir, readlink, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { sanitizeWorkdayTenant } from "@/lib/workdayCapture";
import type { Browser, BrowserContext, Page } from "playwright";

type BrowserManagerState = {
  browser: Browser | null;
  context: BrowserContext | null;
  pages: Map<string, Page>;
  diagnostics: Map<string, BrowserDiagnosticEntry[]>;
};

type BrowserDiagnosticEntry = {
  event: string;
  pageId: string;
  host: string;
  path: string;
  title: string;
  detail?: string;
  at: string;
};

const store = globalThis as typeof globalThis & {
  __applyPilotBrowserManager?: BrowserManagerState;
};

const state =
  store.__applyPilotBrowserManager ??
  {
    browser: null,
    context: null,
    pages: new Map<string, Page>(),
    diagnostics: new Map<string, BrowserDiagnosticEntry[]>()
  };

store.__applyPilotBrowserManager = state;

const BROWSER_PROFILE_DIR = path.join(process.cwd(), "data", "browser-profile");
const execFile = promisify(execFileCallback);
const PERSISTENT_PROFILE_LOCK_FILES = ["SingletonLock", "SingletonCookie", "SingletonSocket", "RunningChromeVersion"] as const;
const pageIdStore = new WeakMap<Page, string>();
const pageLifecycleStore = new WeakSet<Page>();
const contextLifecycleStore = new WeakSet<BrowserContext>();

type CanonicalPageCandidate = {
  page: Page;
  pageId: string;
  host: string;
  path: string;
  title: string;
  barrierKind: string;
  formReached: boolean;
  score: number;
  reason: string;
};

async function getPlaywright() {
  return import("playwright");
}

function isContextAlive(context: BrowserContext | null) {
  return Boolean(context && context.pages);
}

function isBrowserAlive(browser: Browser | null) {
  return Boolean(browser?.isConnected());
}

function getPageId(page: Page) {
  const existing = pageIdStore.get(page);
  if (existing) return existing;

  const next = `page_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  pageIdStore.set(page, next);
  return next;
}

function isWorkdayHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized.includes("myworkdayjobs.com") || normalized.includes("workday");
}

function safeUrlParts(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      path: `${parsed.pathname}${parsed.search}`
    };
  } catch {
    return {
      host: "",
      path: url
    };
  }
}

function pushBrowserDiagnostic(sessionId: string, entry: BrowserDiagnosticEntry) {
  const existing = state.diagnostics.get(sessionId) ?? [];
  existing.push(entry);
  if (existing.length > 120) {
    existing.splice(0, existing.length - 120);
  }
  state.diagnostics.set(sessionId, existing);
}

function recordBrowserEvent(sessionId: string, page: Page, event: string, detail?: string) {
  const url = safeUrlParts(page.url());
  pushBrowserDiagnostic(sessionId, {
    event,
    pageId: getPageId(page),
    host: url.host,
    path: url.path,
    title: "",
    detail,
    at: new Date().toISOString()
  });
}

function installPageLifecycleDiagnostics(page: Page) {
  if (pageLifecycleStore.has(page)) {
    return;
  }

  page.on("close", () => {
    for (const [sessionId, trackedPage] of state.pages.entries()) {
      if (trackedPage === page) {
        recordBrowserEvent(sessionId, page, "page_closed");
      }
    }
  });
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    for (const [sessionId, trackedPage] of state.pages.entries()) {
      if (trackedPage === page) {
        recordBrowserEvent(sessionId, page, "navigation");
      }
    }
  });
  pageLifecycleStore.add(page);
}

async function captureWorkdayCandidate(page: Page) {
  const url = page.url();
  if (!url || page.isClosed()) return null;

  const parsed = safeUrlParts(url);
  if (!isWorkdayHost(parsed.host)) return null;
  const title = (await page.title().catch(() => "")).replace(/\s+/g, " ").trim();
  const heading = (
    (await page
      .locator("h1, [data-automation-id='pageHeader'], [data-automation-id='formTitle'], [data-automation-id='titleText']")
      .first()
      .textContent()
      .catch(() => "")) || ""
  )
    .replace(/\s+/g, " ")
    .trim();
  const combined = `${title} ${heading}`.toLowerCase();
  const tenant = sanitizeWorkdayTenant(parsed.host);
  const applyManually = /\/apply\/applymanually(?:\/|$)?/i.test(url);
  const applyPath = /\/apply(?:\/|$)/i.test(url);
  const jobPostingPath = /\/job\//i.test(url) && !applyPath;
  const formReached = /my information|my experience|application questions|voluntary disclosures|self identify|review/i.test(combined);
  const barrierKind = /sign in|log in/i.test(combined)
    ? "login_required"
    : /create account|sign up|register/i.test(combined)
      ? "account_creation_required"
      : formReached
        ? "form_reached"
        : applyPath
          ? "not_scorable"
          : "unknown_barrier";

  let score = 0;
  let reason = "workday page";

  if (jobPostingPath) {
    score += 120;
    reason = "job posting page";
  }
  if (applyPath) {
    score += 320;
    reason = "apply flow page";
  }
  if (applyManually) {
    score += 120;
    reason = "manual apply flow";
  }
  if (barrierKind === "login_required" || barrierKind === "account_creation_required" || barrierKind === "not_scorable") {
    score += 160;
    reason = `${barrierKind} page`;
  }
  if (formReached) {
    score += 420;
    reason = "visible application form";
  }

  return {
    page,
    pageId: getPageId(page),
    host: parsed.host,
    path: parsed.path,
    title,
    barrierKind,
    formReached,
    score,
    reason: `${reason} (${tenant})`
  } satisfies CanonicalPageCandidate;
}

async function resolveCanonicalWorkdayPage(
  sessionId: string,
  context: BrowserContext,
  options: {
    targetUrl?: string;
    preferredPage?: Page;
    preferExplicitPage?: boolean;
  } = {}
) {
  const pages = context.pages().filter((page) => !page.isClosed());
  const targetHost = safeUrlParts(options.targetUrl || options.preferredPage?.url() || state.pages.get(sessionId)?.url() || "").host;
  const targetTenant = sanitizeWorkdayTenant(targetHost);
  const rawCandidates = await Promise.all(pages.map((page) => captureWorkdayCandidate(page)));
  const candidates: CanonicalPageCandidate[] = rawCandidates.filter((candidate) => candidate !== null);

  let best: CanonicalPageCandidate | null = null;
  for (const candidate of candidates) {
    let score = candidate.score;
    let detail = candidate.reason;
    const candidateTenant = sanitizeWorkdayTenant(candidate.host);

    if (targetHost && candidate.host === targetHost) {
      score += 40;
      detail = `${detail}; same host`;
    } else if (targetTenant && candidateTenant === targetTenant) {
      score += 25;
      detail = `${detail}; same tenant`;
    } else if (targetTenant) {
      score -= 120;
      detail = `${detail}; different tenant`;
    }

    if (options.preferredPage === candidate.page) {
      score += options.preferExplicitPage ? 1000 : 60;
      detail = `${detail}; preferred page`;
    }

    if (!best || score > best.score) {
      best = {
        ...candidate,
        score,
        reason: detail
      };
    }
  }

  if (!best || best.score <= 0) {
    return null;
  }

  bindSessionPage(sessionId, best.page, {
    reason: best.reason,
    barrierKind: best.barrierKind,
    formReached: best.formReached
  });
  return best.page;
}

function shouldResolveWorkdayCanonicalPage(
  sessionId: string,
  options: {
    url?: string;
    preferredPage?: Page;
  }
) {
  const current = state.pages.get(sessionId);
  const urls = [options.url, options.preferredPage?.url(), current?.url()].filter(Boolean) as string[];
  return urls.some((url) => isWorkdayHost(safeUrlParts(url).host));
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

function dropPageFromOtherSessions(sessionId: string, page: Page) {
  for (const [trackedSessionId, trackedPage] of state.pages.entries()) {
    if (trackedSessionId !== sessionId && trackedPage === page) {
      state.pages.delete(trackedSessionId);
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
    state.diagnostics.clear();
  });
  state.context.on("close", () => {
    if (state.context) {
      state.context = null;
      state.browser = null;
      state.pages.clear();
      state.diagnostics.clear();
    }
  });
  if (!contextLifecycleStore.has(state.context)) {
    state.context.on("page", (page) => {
      installPageLifecycleDiagnostics(page);
    });
    contextLifecycleStore.add(state.context);
  }
  return state.context;
}

export async function getOrCreateSessionPage(
  sessionId: string,
  options: {
    url?: string;
    navigate?: boolean;
    reuseOpenPage?: boolean;
    preferredPage?: Page;
    preferExplicitPage?: boolean;
    focus?: boolean;
  } = {}
) {
  const context = await getOrCreateBrowserContext();
  const focus = options.focus ?? true;
  let existing = state.pages.get(sessionId);
  const targetUrl = options.url;
  const shouldNavigate = options.navigate ?? true;

  if (shouldResolveWorkdayCanonicalPage(sessionId, { url: targetUrl, preferredPage: options.preferredPage })) {
    const canonical = await resolveCanonicalWorkdayPage(sessionId, context, {
      targetUrl,
      preferredPage: options.preferredPage,
      preferExplicitPage: options.preferExplicitPage
    });
    if (canonical) {
      existing = canonical;
    }
  } else if (options.preferredPage && !options.preferredPage.isClosed()) {
    existing = bindSessionPage(sessionId, options.preferredPage) ?? existing;
  }

  if (existing && !existing.isClosed()) {
    installPageLifecycleDiagnostics(existing);
    if (focus) {
      await existing.bringToFront().catch(() => undefined);
      recordBrowserEvent(sessionId, existing, "page_focused", "existing_session_page");
    }
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
      installPageLifecycleDiagnostics(candidatePage);
      if (focus) {
        await candidatePage.bringToFront().catch(() => undefined);
        recordBrowserEvent(sessionId, candidatePage, "page_focused", "reused_open_page");
      }
      if (targetUrl && shouldNavigate && candidatePage.url() !== targetUrl) {
        await candidatePage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      }
      return candidatePage;
    }
  }

  const page = await context.newPage();
  installPageLifecycleDiagnostics(page);
  page.on("close", () => {
    for (const [trackedSessionId, trackedPage] of state.pages.entries()) {
      if (trackedPage === page) {
        state.pages.delete(trackedSessionId);
        break;
      }
    }
  });

  state.pages.set(sessionId, page);
  recordBrowserEvent(sessionId, page, "page_created");
  if (focus) {
    await page.bringToFront().catch(() => undefined);
    recordBrowserEvent(sessionId, page, "page_focused", "new_page");
  }
  if (targetUrl && (shouldNavigate || page.url() === "about:blank")) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  }

  return page;
}

export function bindSessionPage(
  sessionId: string,
  page: Page,
  options: {
    reason?: string;
    barrierKind?: string;
    formReached?: boolean;
  } = {}
) {
  if (page.isClosed()) {
    state.pages.delete(sessionId);
    return null;
  }

  const previous = state.pages.get(sessionId) ?? null;
  dropPageFromOtherSessions(sessionId, page);
  state.pages.set(sessionId, page);
  installPageLifecycleDiagnostics(page);
  if (previous !== page) {
    recordBrowserEvent(sessionId, page, "session_rebound", options.reason || "bound_to_page");
  }
  if (options.formReached) {
    recordBrowserEvent(sessionId, page, "form_detected", options.barrierKind || "form_reached");
  } else if (options.barrierKind) {
    recordBrowserEvent(sessionId, page, "barrier_detected", options.barrierKind);
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
  recordBrowserEvent(sessionId, page, "page_focused", "manual_focus");
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

export function getSessionBrowserDiagnostics(sessionId: string) {
  return (state.diagnostics.get(sessionId) ?? []).slice();
}

export async function clearBrowserManagerState() {
  for (const page of state.pages.values()) {
    if (!page.isClosed()) {
      await page.close().catch(() => undefined);
    }
  }
  state.pages.clear();
  state.diagnostics.clear();
  await state.context?.close().catch(() => undefined);
  await state.browser?.close().catch(() => undefined);
  state.context = null;
  state.browser = null;
}

export async function resetBrowserManagerForTests() {
  await clearBrowserManagerState();
}
