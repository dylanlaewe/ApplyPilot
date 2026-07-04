import type { Page } from "playwright";

import { samplePageFingerprint } from "@/lib/pageReadiness";

type AutofillRunner = (reason: string) => Promise<void>;

type SessionAutomationState = {
  page: Page;
  intervalId: NodeJS.Timeout | null;
  timeoutId: NodeJS.Timeout | null;
  running: boolean;
  queuedReason: string | null;
  lastObservedFingerprint: string;
  lastCompletedFingerprint: string;
  pendingFingerprint: string;
  runner: AutofillRunner;
};

const store = globalThis as typeof globalThis & {
  __applyPilotSessionAutomation?: Map<string, SessionAutomationState>;
};

const states = store.__applyPilotSessionAutomation ?? new Map<string, SessionAutomationState>();
store.__applyPilotSessionAutomation = states;

async function refreshFingerprint(state: SessionAutomationState) {
  const fingerprint = await samplePageFingerprint(state.page).catch(() => state.lastObservedFingerprint);
  state.lastObservedFingerprint = fingerprint;
  return fingerprint;
}

async function scheduleRun(sessionId: string, reason: string, debounceMs = 350, fingerprint?: string) {
  const state = states.get(sessionId);
  if (!state) return;

  const nextFingerprint = fingerprint || (await refreshFingerprint(state));
  if (!nextFingerprint) return;
  if (!state.running && (nextFingerprint === state.lastCompletedFingerprint || nextFingerprint === state.pendingFingerprint)) {
    return;
  }
  state.pendingFingerprint = nextFingerprint;

  if (state.running) {
    state.queuedReason = reason;
    return;
  }

  if (state.timeoutId) {
    clearTimeout(state.timeoutId);
  }

  state.timeoutId = setTimeout(async () => {
    const current = states.get(sessionId);
    if (!current || current.page.isClosed()) return;

    current.timeoutId = null;
    current.running = true;
    try {
      await current.runner(reason);
      const latestFingerprint = await refreshFingerprint(current);
      current.lastCompletedFingerprint = latestFingerprint;
    } catch {
      // Leave the last good fingerprint in place and let the caller surface any session error.
    } finally {
      current.running = false;
      current.pendingFingerprint = "";
      if (current.queuedReason) {
        const queuedReason = current.queuedReason;
        current.queuedReason = null;
        void scheduleRun(sessionId, queuedReason, 150);
      }
    }
  }, debounceMs);
}

export async function ensureSessionAutomation(sessionId: string, page: Page, runner: AutofillRunner) {
  const existing = states.get(sessionId);
  if (existing && existing.page === page && !page.isClosed()) {
    existing.runner = runner;
    await refreshFingerprint(existing);
    return existing;
  }

  if (existing?.intervalId) {
    clearInterval(existing.intervalId);
  }
  if (existing?.timeoutId) {
    clearTimeout(existing.timeoutId);
  }

  const state: SessionAutomationState = {
    page,
    intervalId: null,
    timeoutId: null,
    running: false,
    queuedReason: null,
    lastObservedFingerprint: await samplePageFingerprint(page).catch(() => ""),
    lastCompletedFingerprint: "",
    pendingFingerprint: "",
    runner
  };

  const onLikelyPageChange = async () => {
    const current = states.get(sessionId);
    if (!current || current.page.isClosed()) return;
    const fingerprint = await refreshFingerprint(current);
    if (!fingerprint || fingerprint === current.lastCompletedFingerprint || fingerprint === current.pendingFingerprint) {
      return;
    }
    void scheduleRun(sessionId, "automatic_page_change", 250, fingerprint);
  };

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      void onLikelyPageChange();
    }
  });
  page.on("load", () => {
    void onLikelyPageChange();
  });
  page.on("close", () => {
    const current = states.get(sessionId);
    if (!current) return;
    if (current.intervalId) clearInterval(current.intervalId);
    if (current.timeoutId) clearTimeout(current.timeoutId);
    states.delete(sessionId);
  });

  state.intervalId = setInterval(async () => {
    const current = states.get(sessionId);
    if (!current || current.running || current.page.isClosed()) return;

    const fingerprint = await samplePageFingerprint(current.page).catch(() => current.lastObservedFingerprint);
    if (fingerprint && fingerprint !== current.lastObservedFingerprint) {
      current.lastObservedFingerprint = fingerprint;
      if (fingerprint !== current.lastCompletedFingerprint && fingerprint !== current.pendingFingerprint) {
        void scheduleRun(sessionId, "automatic_page_change", 200, fingerprint);
      }
    }
  }, 1_200);

  states.set(sessionId, state);
  return state;
}

export function triggerSessionAutofill(sessionId: string, reason: string) {
  void scheduleRun(sessionId, reason, 0);
}
