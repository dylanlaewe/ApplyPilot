import type { BrowserContext, Page } from "playwright";

export type ApplicationOverlayAction =
  | "fill-page"
  | "show-unresolved"
  | "upload-resume"
  | "report-wrong-answer"
  | "stop";

export type ApplicationOverlayActionResult = {
  ok: boolean;
  status: string;
  message: string;
  unresolved?: Array<{ label: string; reason: string }>;
};

export type ApplicationOverlayCorrectionPayload = {
  fieldSelector: string;
  visibleFieldQuestion: string;
  enteredValue: string;
  correctedValue: string;
  note?: string;
  learningApproved: boolean;
};

type OverlayActionPayload = {
  sessionId: string;
  action: ApplicationOverlayAction;
  correction?: ApplicationOverlayCorrectionPayload;
};

type OverlayActionHandler = (args: {
  sessionId: string;
  action: ApplicationOverlayAction;
  page: Page;
  correction?: ApplicationOverlayCorrectionPayload;
}) => Promise<ApplicationOverlayActionResult>;

const overlayStore = globalThis as typeof globalThis & {
  __applyPilotOverlayPages?: WeakSet<Page>;
  __applyPilotOverlayContexts?: WeakSet<BrowserContext>;
  __applyPilotOverlayLifecyclePages?: WeakSet<Page>;
  __applyPilotOverlayHandler?: OverlayActionHandler;
};

const overlayPages = overlayStore.__applyPilotOverlayPages ?? new WeakSet<Page>();
const overlayContexts = overlayStore.__applyPilotOverlayContexts ?? new WeakSet<BrowserContext>();
const overlayLifecyclePages = overlayStore.__applyPilotOverlayLifecyclePages ?? new WeakSet<Page>();
overlayStore.__applyPilotOverlayPages = overlayPages;
overlayStore.__applyPilotOverlayContexts = overlayContexts;
overlayStore.__applyPilotOverlayLifecyclePages = overlayLifecyclePages;

const OVERLAY_ID = "applypilot-overlay";
const OVERLAY_BINDING = "applyPilotOverlayAction";
export const APPLICATION_OVERLAY_ACTIONS = [
  "Fill this page",
  "Review unresolved",
  "Upload resume",
  "Report a wrong answer",
  "Stop ApplyPilot"
] as const;

export function getApplicationOverlayMarkup() {
  return `
      <style>
        #${OVERLAY_ID} {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 2147483647;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #0f172a;
          pointer-events: none;
        }
        #${OVERLAY_ID} * {
          box-sizing: border-box;
        }
        #${OVERLAY_ID} details {
          width: min(320px, calc(100vw - 28px));
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.97);
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.14);
          overflow: hidden;
          backdrop-filter: blur(14px);
          pointer-events: auto;
        }
        #${OVERLAY_ID} summary {
          list-style: none;
          cursor: pointer;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.01em;
          outline: none;
        }
        #${OVERLAY_ID} summary::-webkit-details-marker {
          display: none;
        }
        #${OVERLAY_ID} .summary-status {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
        }
        #${OVERLAY_ID} .panel {
          border-top: 1px solid rgba(15, 23, 42, 0.08);
          padding: 12px;
          display: grid;
          gap: 10px;
        }
        #${OVERLAY_ID} .status {
          font-size: 12px;
          font-weight: 600;
          color: #334155;
          line-height: 1.4;
        }
        #${OVERLAY_ID} .result {
          font-size: 12px;
          color: #475569;
          line-height: 1.5;
        }
        #${OVERLAY_ID} .actions {
          display: grid;
          gap: 8px;
        }
        #${OVERLAY_ID} button {
          width: 100%;
          border: 0;
          border-radius: 12px;
          background: #f8fafc;
          color: #0f172a;
          font-size: 13px;
          font-weight: 600;
          text-align: left;
          padding: 10px 12px;
          cursor: pointer;
        }
        #${OVERLAY_ID} button:focus-visible,
        #${OVERLAY_ID} summary:focus-visible,
        #${OVERLAY_ID} input:focus-visible,
        #${OVERLAY_ID} textarea:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 2px;
        }
        #${OVERLAY_ID} button[data-kind="primary"] {
          background: #eff6ff;
        }
        #${OVERLAY_ID} button[data-kind="stop"] {
          background: #fff1f2;
          color: #9f1239;
        }
        #${OVERLAY_ID} button[hidden],
        #${OVERLAY_ID} .correction-panel[hidden] {
          display: none !important;
        }
        #${OVERLAY_ID} ul {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 6px;
          font-size: 12px;
          color: #334155;
        }
        #${OVERLAY_ID} .correction-panel {
          border-top: 1px solid rgba(15, 23, 42, 0.08);
          padding-top: 10px;
          display: grid;
          gap: 10px;
        }
        #${OVERLAY_ID} .correction-label {
          font-size: 11px;
          font-weight: 700;
          color: #475569;
          letter-spacing: 0.01em;
          text-transform: uppercase;
        }
        #${OVERLAY_ID} .correction-value {
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 12px;
          background: #ffffff;
          padding: 9px 10px;
          font-size: 12px;
          color: #334155;
          line-height: 1.5;
        }
        #${OVERLAY_ID} input,
        #${OVERLAY_ID} textarea {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.5);
          border-radius: 12px;
          background: #ffffff;
          padding: 10px 11px;
          font: inherit;
          color: #0f172a;
        }
        #${OVERLAY_ID} textarea {
          min-height: 72px;
          resize: vertical;
        }
        #${OVERLAY_ID} .correction-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        #${OVERLAY_ID} .correction-actions button {
          flex: 1 1 120px;
        }
        #${OVERLAY_ID} .toggle-row {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        #${OVERLAY_ID} .toggle-row button {
          flex: 1 1 120px;
          text-align: center;
        }
      </style>
      <details>
        <summary aria-label="ApplyPilot controls">
          <span>ApplyPilot</span>
          <span class="summary-status">Ready</span>
        </summary>
        <div class="panel">
          <div class="status" aria-live="polite">Ready</div>
          <div class="result" aria-live="polite">Use Fill this page when the application form is visible.</div>
          <div class="actions">
            <button type="button" data-action="fill-page" data-kind="primary">Fill this page</button>
            <button type="button" data-action="show-unresolved">Review unresolved</button>
            <button type="button" data-action="upload-resume">Upload resume</button>
            <button type="button" data-action="report-wrong-answer">Report a wrong answer</button>
            <button type="button" data-action="stop" data-kind="stop">Stop ApplyPilot</button>
          </div>
          <div class="details" aria-live="polite"></div>
          <div class="correction-panel" hidden>
            <div>
              <div class="correction-label">Question</div>
              <div class="correction-value" data-role="question">Select the field in the application first.</div>
            </div>
            <div>
              <div class="correction-label">ApplyPilot entered</div>
              <div class="correction-value" data-role="entered-value">No field selected yet.</div>
            </div>
            <label>
              <span class="correction-label">Correct value</span>
              <input type="text" data-role="corrected-value" />
            </label>
            <label>
              <span class="correction-label">Note</span>
              <textarea data-role="note" placeholder="Anything that would help next time?"></textarea>
            </label>
            <div>
              <div class="correction-label">Reuse this correction later?</div>
              <div class="toggle-row">
                <button type="button" data-role="learning-yes" data-kind="primary">Yes</button>
                <button type="button" data-role="learning-no">Not this time</button>
              </div>
            </div>
            <div class="correction-actions">
              <button type="button" data-role="save-correction" data-kind="primary">Save correction</button>
              <button type="button" data-role="cancel-correction">Cancel</button>
            </div>
          </div>
        </div>
      </details>
    `;
}

type OverlayInstallArgs = {
  overlayId: string;
  sessionId: string;
  bindingName: string;
  markup: string;
};

const INSTALL_APPLICATION_OVERLAY_SOURCE = String.raw`({ overlayId, sessionId, bindingName, markup }) => {
  const overlayGlobal = window;
  const readText = (value) => (value || "").replace(/\s+/g, " ").trim();
  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const resolveQuestionText = (element) => {
    const wrappedLabel = element.closest("label");
    if (wrappedLabel) return readText(wrappedLabel.textContent || "");
    const id = element.getAttribute("id");
    if (id) {
      const explicit = document.querySelector('label[for="' + id + '"]');
      if (explicit) return readText(explicit.textContent || "");
    }
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((candidateId) => document.getElementById(candidateId)?.textContent || "")
        .join(" ");
      if (readText(text)) return readText(text);
    }
    const fieldset = element.closest("fieldset, [role='group'], [role='radiogroup']");
    const legend = fieldset?.querySelector("legend, h1, h2, h3, h4, label");
    if (legend) return readText(legend.textContent || "");
    return readText(element.getAttribute("aria-label") || element.getAttribute("placeholder") || "");
  };
  const resolveEnteredValue = (element) => {
    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox") return element.checked ? "checked" : "unchecked";
      if (element.type === "radio") return element.checked ? "selected" : "not selected";
      if (element.type === "file") return element.files?.[0]?.name || "";
      return element.value || "";
    }
    if (element instanceof HTMLTextAreaElement) return element.value || "";
    if (element instanceof HTMLSelectElement) return element.selectedOptions?.[0]?.textContent?.trim() || element.value || "";
    return readText(element.textContent || "");
  };
  const resolveFieldContext = (target) => {
    if (!(target instanceof HTMLElement) || !isVisible(target)) return null;
    const fieldId = target.getAttribute("data-applypilot-field-id");
    const selector = fieldId ? '[data-applypilot-field-id="' + fieldId + '"]' : "";
    const question = resolveQuestionText(target);
    const value = resolveEnteredValue(target);
    if (!question && !selector) return null;
    return { fieldSelector: selector, visibleFieldQuestion: question || "Selected field", enteredValue: value };
  };
  const resolveActiveField = () => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return overlayGlobal.__applyPilotLastFieldContext || null;
    if (active.closest("#" + overlayId)) return overlayGlobal.__applyPilotLastFieldContext || null;
    const target = active.closest([
      "[data-applypilot-field-id]",
      "input",
      "textarea",
      "select",
      "[role='combobox']",
      "[contenteditable='true']",
      "button[aria-haspopup='listbox']",
      "button[aria-expanded='true']"
    ].join(", "));
    return resolveFieldContext(target) || overlayGlobal.__applyPilotLastFieldContext || null;
  };
  const ensureOverlay = () => {
    const existing = document.getElementById(overlayId);
    if (existing) {
      existing.setAttribute("data-session-id", sessionId);
      return;
    }
    if (!document.body) return;
    const root = document.createElement("div");
    root.id = overlayId;
    root.setAttribute("data-session-id", sessionId);
    root.innerHTML = markup;
    const summaryStatus = root.querySelector(".summary-status");
    const status = root.querySelector(".status");
    const result = root.querySelector(".result");
    const details = root.querySelector(".details");
    const correctionPanel = root.querySelector(".correction-panel");
    const question = root.querySelector('[data-role="question"]');
    const enteredValue = root.querySelector('[data-role="entered-value"]');
    const correctedValue = root.querySelector('[data-role="corrected-value"]');
    const note = root.querySelector('[data-role="note"]');
    const learningYes = root.querySelector('[data-role="learning-yes"]');
    const learningNo = root.querySelector('[data-role="learning-no"]');
    const saveCorrection = root.querySelector('[data-role="save-correction"]');
    const cancelCorrection = root.querySelector('[data-role="cancel-correction"]');
    if (!(summaryStatus instanceof HTMLElement) || !(status instanceof HTMLElement) || !(result instanceof HTMLElement) || !(details instanceof HTMLElement) || !(correctionPanel instanceof HTMLElement) || !(question instanceof HTMLElement) || !(enteredValue instanceof HTMLElement) || !(correctedValue instanceof HTMLInputElement) || !(note instanceof HTMLTextAreaElement) || !(learningYes instanceof HTMLButtonElement) || !(learningNo instanceof HTMLButtonElement) || !(saveCorrection instanceof HTMLButtonElement) || !(cancelCorrection instanceof HTMLButtonElement)) return;
    const buttons = Array.from(root.querySelectorAll("button[data-action]"));
    let learningApproved = true;
    let selectedField = null;
    const setBusy = (busy) => {
      buttons.forEach((button) => {
        if (button instanceof HTMLButtonElement) button.disabled = busy;
      });
      saveCorrection.disabled = busy;
      cancelCorrection.disabled = busy;
      learningYes.disabled = busy;
      learningNo.disabled = busy;
    };
    const setLearningState = (approved) => {
      learningApproved = approved;
      learningYes.style.background = approved ? "#eff6ff" : "#f8fafc";
      learningNo.style.background = approved ? "#f8fafc" : "#eff6ff";
    };
    const hideCorrectionPanel = () => {
      correctionPanel.hidden = true;
      selectedField = null;
      correctedValue.value = "";
      note.value = "";
      setLearningState(true);
    };
    const showMessage = (nextStatus, nextMessage) => {
      status.textContent = nextStatus;
      summaryStatus.textContent = nextStatus;
      result.textContent = nextMessage;
      details.replaceChildren();
    };
    const renderResult = (payload) => {
      showMessage(payload.status, payload.message);
      if (payload.unresolved?.length) {
        const list = document.createElement("ul");
        payload.unresolved.slice(0, 6).forEach((item) => {
          const entry = document.createElement("li");
          entry.textContent = item.label + ": " + item.reason;
          list.appendChild(entry);
        });
        details.replaceChildren(list);
      }
    };
    const runAction = async (action) => {
      const binding = window[bindingName];
      if (typeof binding !== "function") {
        showMessage("Needs your review", "ApplyPilot is not ready on this page yet.");
        return;
      }
      setBusy(true);
      showMessage(
        action === "fill-page" ? "Filling safe fields" : action === "show-unresolved" ? "Needs your review" : action === "upload-resume" ? "Reading page" : "Stopped",
        ""
      );
      try {
        const overlayResult = await binding({ sessionId, action });
        renderResult(overlayResult);
      } catch {
        showMessage("Needs your review", "ApplyPilot could not finish that action on this page.");
      } finally {
        setBusy(false);
      }
    };
    buttons.forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      button.addEventListener("click", async () => {
        const action = button.getAttribute("data-action");
        if (!action) return;
        if (action === "report-wrong-answer") {
          const activeField = resolveActiveField();
          if (!activeField) {
            showMessage("Needs your review", "Select the incorrect field in the application first, then try again.");
            return;
          }
          selectedField = {
            fieldSelector: activeField.fieldSelector,
            visibleFieldQuestion: activeField.visibleFieldQuestion,
            enteredValue: activeField.enteredValue,
            correctedValue: activeField.enteredValue,
            note: "",
            learningApproved: true
          };
          question.textContent = activeField.visibleFieldQuestion || "Selected field";
          enteredValue.textContent = activeField.enteredValue || "No entered value found.";
          correctedValue.value = activeField.enteredValue || "";
          note.value = "";
          correctionPanel.hidden = false;
          setLearningState(true);
          showMessage("Needs your review", "Confirm the correction below, then save it locally.");
          correctedValue.focus();
          return;
        }
        hideCorrectionPanel();
        await runAction(action);
      });
    });
    learningYes.addEventListener("click", () => setLearningState(true));
    learningNo.addEventListener("click", () => setLearningState(false));
    cancelCorrection.addEventListener("click", () => hideCorrectionPanel());
    saveCorrection.addEventListener("click", async () => {
      const binding = window[bindingName];
      if (typeof binding !== "function" || !selectedField) {
        showMessage("Needs your review", "ApplyPilot could not save that correction on this page.");
        return;
      }
      if (!correctedValue.value.trim()) {
        showMessage("Needs your review", "Add the correct value before saving this correction.");
        correctedValue.focus();
        return;
      }
      setBusy(true);
      showMessage("Reading page", "");
      try {
        const overlayResult = await binding({
          sessionId,
          action: "report-wrong-answer",
          correction: {
            fieldSelector: selectedField.fieldSelector,
            visibleFieldQuestion: selectedField.visibleFieldQuestion,
            enteredValue: selectedField.enteredValue,
            correctedValue: correctedValue.value,
            note: note.value,
            learningApproved
          }
        });
        hideCorrectionPanel();
        renderResult(overlayResult);
      } catch {
        showMessage("Needs your review", "ApplyPilot could not save that correction on this page.");
      } finally {
        setBusy(false);
      }
    });
    document.body.appendChild(root);
  };
  overlayGlobal.__applyPilotOverlayBindingName = bindingName;
  if (!overlayGlobal.__applyPilotOverlayFocusListenerInstalled) {
    overlayGlobal.__applyPilotOverlayFocusListenerInstalled = true;
    document.addEventListener("focusin", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("#" + overlayId)) return;
      const candidate = target.closest([
        "[data-applypilot-field-id]",
        "input",
        "textarea",
        "select",
        "[role='combobox']",
        "[contenteditable='true']",
        "button[aria-haspopup='listbox']",
        "button[aria-expanded='true']"
      ].join(", "));
      const context = resolveFieldContext(candidate);
      if (context) {
        overlayGlobal.__applyPilotLastFieldContext = context;
      }
    }, true);
  }
  ensureOverlay();
  if (!overlayGlobal.__applyPilotOverlayObserver) {
    overlayGlobal.__applyPilotOverlayObserver = new MutationObserver(() => {
      ensureOverlay();
    });
    overlayGlobal.__applyPilotOverlayObserver.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => ensureOverlay(), { once: true });
    window.addEventListener("pageshow", () => ensureOverlay());
    window.addEventListener("popstate", () => ensureOverlay());
  }
}`;

export async function registerApplicationOverlayBridge(page: Page, handler: OverlayActionHandler) {
  overlayStore.__applyPilotOverlayHandler = handler;
  const context = page.context();

  if (overlayContexts.has(context)) {
    return;
  }

  await context.exposeBinding(OVERLAY_BINDING, async ({ page: sourcePage }, payload: OverlayActionPayload) => {
    const actionHandler = overlayStore.__applyPilotOverlayHandler;
    if (!actionHandler || !sourcePage) {
      return {
        ok: false,
        status: "Needs your review",
        message: "ApplyPilot is not ready on this page yet."
      } satisfies ApplicationOverlayActionResult;
    }

    return actionHandler({
      sessionId: payload.sessionId,
      action: payload.action,
      page: sourcePage,
      correction: payload.correction
    });
  });

  overlayContexts.add(context);
}

export async function ensureApplicationOverlay(page: Page, sessionId: string) {
  const markup = getApplicationOverlayMarkup();
  const args = { overlayId: OVERLAY_ID, sessionId, bindingName: OVERLAY_BINDING, markup };

  if (!overlayLifecyclePages.has(page)) {
    page.on("domcontentloaded", () => {
      if (page.isClosed()) return;
      ensureApplicationOverlay(page, sessionId).catch(() => undefined);
    });
    overlayLifecyclePages.add(page);
  }

  await page.addInitScript(
    ({ source, payload }) => {
      const install = new Function(`return ${source};`)();
      install(payload);
    },
    { source: INSTALL_APPLICATION_OVERLAY_SOURCE, payload: args }
  );
  await page.evaluate(
    ({ source, payload }) => {
      const install = new Function(`return ${source};`)();
      install(payload);
    },
    { source: INSTALL_APPLICATION_OVERLAY_SOURCE, payload: args }
  );
  overlayPages.add(page);
}
