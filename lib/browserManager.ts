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

async function getPlaywright() {
  return import("playwright");
}

function isContextAlive(context: BrowserContext | null) {
  return Boolean(context && context.pages);
}

function isBrowserAlive(browser: Browser | null) {
  return Boolean(browser?.isConnected());
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
  state.browser = await chromium.launch({
    headless: process.env.NODE_ENV === "test",
    slowMo: process.env.NODE_ENV === "test" ? 0 : 50
  });
  state.browser.on("disconnected", () => {
    state.browser = null;
    state.context = null;
    state.pages.clear();
  });
  state.context = await state.browser.newContext();
  return state.context;
}

export async function getOrCreateSessionPage(
  sessionId: string,
  options: {
    url?: string;
    navigate?: boolean;
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

  const page = await context.newPage();
  page.on("close", () => {
    if (state.pages.get(sessionId) === page) {
      state.pages.delete(sessionId);
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

export async function resetBrowserManagerForTests() {
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
