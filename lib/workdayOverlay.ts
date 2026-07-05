import type { BrowserContext, Page } from "playwright";

type OverlayAction = "fill-safe-fields" | "capture-page" | "show-unresolved" | "stop";

type OverlayActionResult = {
  ok: boolean;
  status: string;
  message: string;
  unresolved?: Array<{ label: string; reason: string }>;
};

type OverlayActionHandler = (args: { sessionId: string; action: OverlayAction; page: Page }) => Promise<OverlayActionResult>;

const overlayStore = globalThis as typeof globalThis & {
  __applyPilotWorkdayOverlayPages?: WeakSet<Page>;
  __applyPilotWorkdayOverlayContexts?: WeakSet<BrowserContext>;
  __applyPilotWorkdayOverlayHandler?: OverlayActionHandler;
};

const overlayPages = overlayStore.__applyPilotWorkdayOverlayPages ?? new WeakSet<Page>();
const overlayContexts = overlayStore.__applyPilotWorkdayOverlayContexts ?? new WeakSet<BrowserContext>();
overlayStore.__applyPilotWorkdayOverlayPages = overlayPages;
overlayStore.__applyPilotWorkdayOverlayContexts = overlayContexts;

const OVERLAY_BINDING = "applyPilotWorkdayAction";
export const WORKDAY_OVERLAY_ACTIONS = ["Fill safe fields", "Capture this page", "Show unresolved fields", "Stop ApplyPilot"] as const;

export function getWorkdayOverlayMarkup() {
  return `
      <style>
        #applypilot-workday-overlay {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 2147483647;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #0f172a;
        }
        #applypilot-workday-overlay details {
          width: 260px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);
          overflow: hidden;
          backdrop-filter: blur(14px);
        }
        #applypilot-workday-overlay summary {
          list-style: none;
          cursor: pointer;
          padding: 12px 14px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.01em;
          outline: none;
        }
        #applypilot-workday-overlay summary::-webkit-details-marker {
          display: none;
        }
        #applypilot-workday-overlay .panel {
          border-top: 1px solid rgba(15, 23, 42, 0.08);
          padding: 12px;
          display: grid;
          gap: 8px;
        }
        #applypilot-workday-overlay .status {
          font-size: 12px;
          color: #475569;
          line-height: 1.5;
        }
        #applypilot-workday-overlay button {
          width: 100%;
          border: 0;
          border-radius: 12px;
          background: #eff6ff;
          color: #0f172a;
          font-size: 13px;
          font-weight: 600;
          text-align: left;
          padding: 10px 12px;
          cursor: pointer;
        }
        #applypilot-workday-overlay button:focus-visible,
        #applypilot-workday-overlay summary:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 2px;
        }
        #applypilot-workday-overlay button[data-kind="stop"] {
          background: #fff1f2;
          color: #9f1239;
        }
        #applypilot-workday-overlay ul {
          margin: 4px 0 0;
          padding-left: 18px;
          display: grid;
          gap: 6px;
          font-size: 12px;
          color: #334155;
        }
      </style>
      <details>
        <summary aria-label="ApplyPilot controls">ApplyPilot</summary>
        <div class="panel">
          <div class="status" aria-live="polite">Ready</div>
          <button type="button" data-kind="fill-safe-fields">Fill safe fields</button>
          <button type="button" data-kind="capture-page">Capture this page</button>
          <button type="button" data-kind="show-unresolved">Show unresolved fields</button>
          <button type="button" data-kind="stop">Stop ApplyPilot</button>
          <div class="details" aria-live="polite"></div>
        </div>
      </details>
    `;
}

export async function registerWorkdayOverlayBridge(page: Page, handler: OverlayActionHandler) {
  overlayStore.__applyPilotWorkdayOverlayHandler = handler;
  const context = page.context();

  if (overlayContexts.has(context)) {
    return;
  }

  await context.exposeBinding(
    OVERLAY_BINDING,
    async ({ page: sourcePage }, payload: { sessionId: string; action: OverlayAction }) => {
      const actionHandler = overlayStore.__applyPilotWorkdayOverlayHandler;
      if (!actionHandler || !sourcePage) {
        return {
          ok: false,
          status: "Needs review",
          message: "ApplyPilot is not ready on this page yet."
        } satisfies OverlayActionResult;
      }

      return actionHandler({
        sessionId: payload.sessionId,
        action: payload.action,
        page: sourcePage
      });
    }
  );

  overlayContexts.add(context);
}

export async function ensureWorkdayOverlay(page: Page, sessionId: string) {
  if (overlayPages.has(page)) {
    await page.evaluate((id) => {
      const root = document.getElementById("applypilot-workday-overlay");
      if (root) {
        root.setAttribute("data-session-id", id);
      }
    }, sessionId).catch(() => undefined);
    return;
  }

  const installOverlay = ({ id, bindingName, markup }: { id: string; bindingName: string; markup: string }) => {
    const existing = document.getElementById("applypilot-workday-overlay");
    if (existing) {
      existing.setAttribute("data-session-id", id);
      return;
    }

    const root = document.createElement("div");
    root.id = "applypilot-workday-overlay";
    root.setAttribute("data-session-id", id);
    root.innerHTML = markup;

    const updateDetails = (items: Array<{ label: string; reason: string }> | undefined) => {
      const details = root.querySelector(".details");
      if (!(details instanceof HTMLElement)) return;

      if (!items?.length) {
        details.innerHTML = "";
        return;
      }

      const list = document.createElement("ul");
      for (const item of items.slice(0, 8)) {
        const entry = document.createElement("li");
        entry.textContent = `${item.label}: ${item.reason}`;
        list.appendChild(entry);
      }
      details.innerHTML = "";
      details.appendChild(list);
    };

    const setBusy = (busy: boolean) => {
      root.querySelectorAll("button").forEach((button) => {
        if (button instanceof HTMLButtonElement) {
          button.disabled = busy;
        }
      });
    };

    root.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", async () => {
        const status = root.querySelector(".status");
        if (!(status instanceof HTMLElement)) return;

        const kind = button.getAttribute("data-kind") as OverlayAction | null;
        const actionBinding = (window as unknown as Record<string, unknown>)[bindingName];
        if (!kind || typeof actionBinding !== "function") return;

        status.textContent =
          kind === "fill-safe-fields"
            ? "Filling safe fields"
            : kind === "capture-page"
              ? "Reading page"
              : kind === "show-unresolved"
                ? "Needs review"
                : "Stopped";

        setBusy(true);
        updateDetails(undefined);

        try {
          const result = await (actionBinding as (payload: {
            sessionId: string;
            action: OverlayAction;
          }) => Promise<OverlayActionResult>)({
            sessionId: id,
            action: kind
          });
          status.textContent = result.status;
          updateDetails(result.unresolved);
          const details = root.querySelector(".details");
          if (details instanceof HTMLElement && result.message) {
            if (!result.unresolved?.length) {
              details.textContent = result.message;
            }
          }
        } catch {
          status.textContent = "Needs review";
          const details = root.querySelector(".details");
          if (details instanceof HTMLElement) {
            details.textContent = "ApplyPilot could not finish that action on this page.";
          }
        } finally {
          setBusy(false);
        }
      });
    });

    document.body.appendChild(root);
  };

  const markup = getWorkdayOverlayMarkup();
  await page.addInitScript(installOverlay, { id: sessionId, bindingName: OVERLAY_BINDING, markup });
  await page.evaluate(installOverlay, { id: sessionId, bindingName: OVERLAY_BINDING, markup }).catch(() => undefined);
  overlayPages.add(page);
}
