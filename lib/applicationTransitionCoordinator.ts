import type { BrowserContext, Page } from "playwright";

import { getApplicationRuntimeState } from "@/lib/applicationRuntimeState";
import { getApplicationSession } from "@/lib/applications";
import { scanVisibleFields } from "@/lib/playwrightSession";

type TransitionState = {
  page: Page | null;
  timer: ReturnType<typeof setTimeout> | null;
  baselineIdentity: string;
  lastObservedIdentity: string;
  lastTriggeredIdentity: string;
  armed: boolean;
  processing: boolean;
  pendingSignal: boolean;
  eventLog: Array<{ event: string; detail?: string; at: string }>;
};

type TransitionSignalPayload = {
  sessionId: string;
  reason: string;
};

type PageIdentitySnapshot = {
  url: string;
  heading: string;
  controlCount: number;
  controlLabels: string[];
  signature: string;
};

const coordinatorStore = globalThis as typeof globalThis & {
  __applyPilotTransitionStates?: Map<string, TransitionState>;
  __applyPilotTransitionContexts?: WeakSet<BrowserContext>;
  __applyPilotTransitionPages?: WeakSet<Page>;
};

const transitionStates = coordinatorStore.__applyPilotTransitionStates ?? new Map<string, TransitionState>();
const transitionContexts = coordinatorStore.__applyPilotTransitionContexts ?? new WeakSet<BrowserContext>();
const transitionPages = coordinatorStore.__applyPilotTransitionPages ?? new WeakSet<Page>();
coordinatorStore.__applyPilotTransitionStates = transitionStates;
coordinatorStore.__applyPilotTransitionContexts = transitionContexts;
coordinatorStore.__applyPilotTransitionPages = transitionPages;

const TRANSITION_BINDING = "applyPilotTransitionSignal";

const INSTALL_TRANSITION_SIGNAL_SOURCE = String.raw`({ bindingName, sessionId }) => {
  const transitionGlobal = window;
  if (transitionGlobal.__applyPilotTransitionSignalsInstalled) {
    return;
  }
  transitionGlobal.__applyPilotTransitionSignalsInstalled = true;

  const overlaySelector = "#applypilot-overlay, #applypilot-workday-overlay";
  const readText = (value) => (value || "").replace(/\s+/g, " ").trim();
  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.closest(overlaySelector)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
  };
  const describeControl = (element) => {
    if (!(element instanceof HTMLElement) || !isVisible(element)) return "";
    const id = element.getAttribute("id");
    const explicitLabel = id ? document.querySelector('label[for="' + id + '"]') : null;
    const wrappedLabel = element.closest("label");
    const label = readText(
      explicitLabel?.textContent ||
        wrappedLabel?.textContent ||
        element.getAttribute("aria-label") ||
        element.getAttribute("placeholder") ||
        element.textContent ||
        ""
    );
    return label;
  };
  const computeSignature = () => {
    const heading = readText(
      Array.from(document.querySelectorAll("h1, h2, legend, [data-automation-id='pageHeader'], [data-automation-id='titleText']"))
        .find((candidate) => isVisible(candidate))?.textContent || ""
    );
    const controls = Array.from(
      document.querySelectorAll(
        [
          "input:not([type='hidden'])",
          "select",
          "textarea",
          "[role='combobox']",
          "button",
          "[role='button']"
        ].join(", ")
      )
    )
      .map((candidate) => describeControl(candidate))
      .filter(Boolean)
      .slice(0, 14);

    return [window.location.pathname + window.location.search, heading, String(controls.length), controls.join("|")].join("::");
  };
  const notify = (reason) => {
    const binding = transitionGlobal[bindingName];
    if (typeof binding !== "function") return;
    binding({ sessionId, reason }).catch(() => undefined);
  };

  let lastSignature = computeSignature();
  let mutationTimer = null;
  const scheduleMutationCheck = () => {
    if (mutationTimer) {
      clearTimeout(mutationTimer);
    }
    mutationTimer = setTimeout(() => {
      const nextSignature = computeSignature();
      if (nextSignature && nextSignature !== lastSignature) {
        lastSignature = nextSignature;
        notify("structure-change");
      }
    }, 500);
  };

  const wrapHistoryMethod = (name) => {
    const original = history[name];
    if (typeof original !== "function") return;
    history[name] = function (...args) {
      const result = original.apply(this, args);
      setTimeout(() => {
        const nextSignature = computeSignature();
        if (nextSignature !== lastSignature) {
          lastSignature = nextSignature;
        }
        notify(name);
      }, 0);
      return result;
    };
  };

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
  window.addEventListener("popstate", () => notify("popstate"), true);
  window.addEventListener("hashchange", () => notify("hashchange"), true);
  window.addEventListener("pageshow", () => notify("pageshow"), true);

  const observer = new MutationObserver(() => {
    scheduleMutationCheck();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
};`;

function getOrCreateState(sessionId: string) {
  const existing = transitionStates.get(sessionId);
  if (existing) {
    return existing;
  }

  const next: TransitionState = {
    page: null,
    timer: null,
    baselineIdentity: "",
    lastObservedIdentity: "",
    lastTriggeredIdentity: "",
    armed: false,
    processing: false,
    pendingSignal: false,
    eventLog: []
  };
  transitionStates.set(sessionId, next);
  return next;
}

function pushTransitionEvent(sessionId: string, event: string, detail?: string) {
  const state = getOrCreateState(sessionId);
  state.eventLog.push({
    event,
    detail,
    at: new Date().toISOString()
  });
  if (state.eventLog.length > 80) {
    state.eventLog.splice(0, state.eventLog.length - 80);
  }
}

export function recordApplicationTransitionEvent(sessionId: string, event: string, detail?: string) {
  pushTransitionEvent(sessionId, event, detail);
}

async function readApplicationPageIdentity(page: Page): Promise<PageIdentitySnapshot> {
  const url = page.url();

  const headingLocator = page.locator("h1, h2, legend, [data-automation-id='pageHeader'], [data-automation-id='titleText']");
  const headingCount = await headingLocator.count().catch(() => 0);
  let heading = "";
  for (let index = 0; index < Math.min(headingCount, 12); index += 1) {
    const candidate = headingLocator.nth(index);
    const visible = await candidate.isVisible().catch(() => false);
    if (!visible) continue;
    heading = ((await candidate.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    if (heading) break;
  }

  const visibleFields = await scanVisibleFields(page).catch(() => []);
  const controlLabels = visibleFields
    .map((field) => field.label || field.ariaLabel || field.placeholder || field.name || "")
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 14);

  const formContainerFingerprint = await page
    .locator("form, section, fieldset, [role='group']")
    .evaluateAll((elements) => {
      const isVisible = (element: Element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
      };

      return elements
        .filter((element) => isVisible(element))
        .slice(0, 4)
        .map((element) => {
          const headingText =
            (
              element.querySelector("h1, h2, h3, legend, [data-automation-id='sectionHeader']")?.textContent || ""
            ).replace(/\s+/g, " ").trim();
          const controlCount = element.querySelectorAll("input:not([type='hidden']), select, textarea, [role='combobox']").length;
          return `${headingText}:${controlCount}`;
        })
        .filter(Boolean)
        .join("|");
    })
    .catch(() => "");

  const parsedUrl = (() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();

  const signature = [
    parsedUrl ? `${parsedUrl.pathname}${parsedUrl.search}` : url,
    heading,
    formContainerFingerprint,
    String(controlLabels.length),
    controlLabels.join("|")
  ].join("::");

  return {
    url,
    heading,
    controlCount: controlLabels.length,
    controlLabels,
    signature
  };
}

async function triggerAutomaticContinuation(sessionId: string, page: Page) {
  const state = getOrCreateState(sessionId);
  if (page.isClosed()) return;

  const session = await getApplicationSession(sessionId);
  if (!session) return;

  const runtime = getApplicationRuntimeState(sessionId);
  if (runtime.stopped) {
    pushTransitionEvent(sessionId, "pass_scheduled_but_cancelled", "runtime_stopped");
    return;
  }
  if (!state.armed) {
    pushTransitionEvent(sessionId, "pass_scheduled_but_cancelled", "coordinator_not_armed");
    return;
  }
  if (state.processing) {
    state.pendingSignal = true;
    pushTransitionEvent(sessionId, "pass_scheduled_but_cancelled", "pass_already_processing");
    return;
  }
  if (runtime.activePass) {
    state.pendingSignal = true;
    pushTransitionEvent(sessionId, "pass_scheduled_but_cancelled", "runtime_pass_active");
    return;
  }

  const identity = await readApplicationPageIdentity(page);
  pushTransitionEvent(sessionId, "new_page_identity_calculated", identity.signature);
  state.lastObservedIdentity = identity.signature;
  if (!identity.signature) {
    pushTransitionEvent(sessionId, "page_identity_unchanged", "empty_identity");
    return;
  }
  if (identity.signature === state.baselineIdentity) {
    pushTransitionEvent(sessionId, "page_identity_unchanged", "matches_baseline");
    return;
  }
  if (identity.signature === state.lastTriggeredIdentity) {
    pushTransitionEvent(sessionId, "page_identity_unchanged", "already_triggered");
    return;
  }

  state.processing = true;
  state.pendingSignal = false;
  state.lastTriggeredIdentity = identity.signature;
  try {
    pushTransitionEvent(sessionId, "fill_pass_started", identity.signature);
    const { runAutofillPass } = await import("@/lib/quickApply");
    await runAutofillPass(sessionId, {
      trigger: "automatic",
      reuseOpenPage: true,
      preferredPage: page,
      focusPage: false
    });
    pushTransitionEvent(sessionId, "pass_finished", identity.signature);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushTransitionEvent(sessionId, "pass_failed", message);
    if (!/session not found/i.test(message)) {
      throw error;
    }
  } finally {
    state.processing = false;
  }
}

function scheduleAutomaticContinuation(sessionId: string, page: Page) {
  const state = getOrCreateState(sessionId);
  state.page = page;
  state.pendingSignal = true;
  if (state.timer) {
    clearTimeout(state.timer);
  }

  pushTransitionEvent(sessionId, "fill_pass_scheduled", page.url());

  state.timer = setTimeout(() => {
    state.timer = null;
    void triggerAutomaticContinuation(sessionId, page);
  }, 900);
}

export async function ensureApplicationTransitionCoordinator(sessionId: string, page: Page) {
  const state = getOrCreateState(sessionId);
  state.page = page;

  const context = page.context();
  if (!transitionContexts.has(context)) {
    await context.exposeBinding(TRANSITION_BINDING, async ({ page: sourcePage }, payload: TransitionSignalPayload) => {
      if (!payload?.sessionId || !sourcePage || sourcePage.isClosed()) return;
      pushTransitionEvent(payload.sessionId, "navigation_signal_received", payload.reason);
      scheduleAutomaticContinuation(payload.sessionId, sourcePage);
    });
    transitionContexts.add(context);
  }

  if (!transitionPages.has(page)) {
    page.on("domcontentloaded", () => {
      pushTransitionEvent(sessionId, "navigation_signal_received", "domcontentloaded");
      scheduleAutomaticContinuation(sessionId, page);
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        pushTransitionEvent(sessionId, "navigation_signal_received", "framenavigated");
        scheduleAutomaticContinuation(sessionId, page);
      }
    });
    transitionPages.add(page);
  }

  const installer = new Function(`return ${INSTALL_TRANSITION_SIGNAL_SOURCE}`)() as (args: {
    bindingName: string;
    sessionId: string;
  }) => void;
  const args = {
    bindingName: TRANSITION_BINDING,
    sessionId
  };
  await context.addInitScript(installer, args);
  await page.evaluate(installer, args).catch(() => undefined);
}

export async function noteApplicationPassSettled(
  sessionId: string,
  page: Page,
  trigger: "manual" | "automatic"
) {
  const state = getOrCreateState(sessionId);
  state.page = page;
  const identity = await readApplicationPageIdentity(page);
  state.baselineIdentity = identity.signature;
  state.lastObservedIdentity = identity.signature;
  state.lastTriggeredIdentity = identity.signature;
  if (trigger === "manual" || trigger === "automatic") {
    state.armed = true;
  }
  pushTransitionEvent(sessionId, "overlay_updated", identity.signature);
  if (state.pendingSignal && state.page && !state.processing) {
    state.pendingSignal = false;
    scheduleAutomaticContinuation(sessionId, state.page);
  }
}

export function getApplicationTransitionDiagnostics(sessionId: string) {
  const state = getOrCreateState(sessionId);
  return {
    baselineIdentity: state.baselineIdentity,
    lastObservedIdentity: state.lastObservedIdentity,
    lastTriggeredIdentity: state.lastTriggeredIdentity,
    armed: state.armed,
    processing: state.processing,
    pendingSignal: state.pendingSignal,
    eventLog: state.eventLog.slice()
  };
}

export function resetApplicationTransitionCoordinator(sessionId?: string) {
  if (sessionId) {
    const state = transitionStates.get(sessionId);
    if (state?.timer) {
      clearTimeout(state.timer);
    }
    transitionStates.delete(sessionId);
    return;
  }

  for (const state of transitionStates.values()) {
    if (state.timer) {
      clearTimeout(state.timer);
    }
  }
  transitionStates.clear();
}
