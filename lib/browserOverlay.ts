import type { Page } from "playwright";

export type BrowserOverlayState = "waiting" | "reading" | "filling" | "finished" | "review";

const OVERLAY_SCRIPT = () => {
  const win = window as Window & {
    __applyPilotOverlay?: {
      root: HTMLDivElement;
      label: HTMLSpanElement;
      detail: HTMLSpanElement;
    };
  };

  if (win.__applyPilotOverlay?.root?.isConnected) {
    return;
  }

  const root = document.createElement("div");
  root.id = "applypilot-browser-overlay";
  root.setAttribute("aria-live", "polite");
  root.style.position = "fixed";
  root.style.right = "20px";
  root.style.bottom = "20px";
  root.style.zIndex = "2147483647";
  root.style.display = "flex";
  root.style.alignItems = "center";
  root.style.gap = "10px";
  root.style.padding = "10px 14px";
  root.style.borderRadius = "999px";
  root.style.background = "rgba(15, 23, 42, 0.92)";
  root.style.color = "#f8fafc";
  root.style.fontFamily = "ui-sans-serif, system-ui, sans-serif";
  root.style.fontSize = "12px";
  root.style.lineHeight = "16px";
  root.style.boxShadow = "0 14px 36px rgba(15, 23, 42, 0.22)";
  root.style.pointerEvents = "none";

  const dot = document.createElement("span");
  dot.style.width = "8px";
  dot.style.height = "8px";
  dot.style.borderRadius = "999px";
  dot.style.background = "#38bdf8";

  const copy = document.createElement("div");
  copy.style.display = "flex";
  copy.style.flexDirection = "column";
  copy.style.gap = "2px";

  const label = document.createElement("span");
  label.style.fontWeight = "600";
  label.textContent = "ApplyPilot";

  const detail = document.createElement("span");
  detail.style.color = "rgba(226, 232, 240, 0.92)";
  detail.textContent = "Waiting for page";

  copy.append(label, detail);
  root.append(dot, copy);
  document.body.append(root);

  win.__applyPilotOverlay = { root, label, detail };
};

const OVERLAY_COPY: Record<BrowserOverlayState, string> = {
  waiting: "Waiting for page",
  reading: "Reading this page",
  filling: "Filling safe fields",
  finished: "Finished",
  review: "Needs your review"
};

function overlayTone(state: BrowserOverlayState) {
  switch (state) {
    case "finished":
      return "#34d399";
    case "review":
      return "#f59e0b";
    case "filling":
      return "#38bdf8";
    case "reading":
      return "#60a5fa";
    default:
      return "#94a3b8";
  }
}

export async function installBrowserOverlay(page: Page) {
  await page.addInitScript(OVERLAY_SCRIPT);
  await page.evaluate(OVERLAY_SCRIPT).catch(() => undefined);
}

export async function setBrowserOverlayState(page: Page, state: BrowserOverlayState, detail?: string) {
  await installBrowserOverlay(page);
  await page
    .evaluate(
      ({ nextState, nextDetail, fallbackDetail }) => {
        const win = window as Window & {
          __applyPilotOverlay?: {
            root: HTMLDivElement;
            label: HTMLSpanElement;
            detail: HTMLSpanElement;
          };
        };

        const overlay = win.__applyPilotOverlay;
        if (!overlay?.root?.isConnected) return;

        overlay.detail.textContent = nextDetail || fallbackDetail;
        overlay.root.style.border = `1px solid ${nextState}`;
        const dot = overlay.root.firstElementChild as HTMLElement | null;
        if (dot) {
          dot.style.background = nextState;
        }
      },
      {
        nextState: overlayTone(state),
        nextDetail: detail,
        fallbackDetail: OVERLAY_COPY[state]
      }
    )
    .catch(() => undefined);
}
