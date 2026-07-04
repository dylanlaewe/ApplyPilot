import { promises as fs } from "fs";
import path from "path";
import type { Page } from "playwright";

import type { ApplyPilotSettings } from "@/lib/settings";

const WORKDAY_DIAGNOSTICS_DIR = path.join(process.cwd(), "debug", "workday-diagnostics");

type WorkdayDiagnosticEntry = {
  timestamp: string;
  sessionId: string;
  event:
    | "diagnostics_enabled"
    | "page_snapshot"
    | "page_readiness"
    | "navigation_event"
    | "fill_attempt"
    | "fill_result"
    | "skip_reason"
    | "severe_regression";
  phase?: string;
  detail?: Record<string, unknown>;
};

function sanitizeText(value: string, maxLength = 160) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeRoute(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split("?")[0] || url;
  }
}

function controlDescriptor(element: Element) {
  const parts = [
    element.getAttribute("data-automation-id"),
    element.getAttribute("role"),
    element.getAttribute("id"),
    element.getAttribute("name"),
    element.getAttribute("aria-controls")
  ]
    .filter(Boolean)
    .map((value) => sanitizeText(String(value), 80));

  return parts.join(" | ");
}

export function getWorkdayDiagnosticsDir() {
  return WORKDAY_DIAGNOSTICS_DIR;
}

export function isWorkdayDiagnosticsEnabled(settings: ApplyPilotSettings, sessionId: string) {
  return settings.diagnostics.workday.enabledSessionId === sessionId;
}

async function ensureDiagnosticsDir() {
  await fs.mkdir(WORKDAY_DIAGNOSTICS_DIR, { recursive: true });
}

function sessionTracePath(sessionId: string) {
  return path.join(WORKDAY_DIAGNOSTICS_DIR, `${sessionId}.ndjson`);
}

export async function appendWorkdayDiagnostic(sessionId: string, entry: Omit<WorkdayDiagnosticEntry, "sessionId" | "timestamp">) {
  await ensureDiagnosticsDir();
  const traceEntry: WorkdayDiagnosticEntry = {
    sessionId,
    timestamp: new Date().toISOString(),
    ...entry
  };
  await fs.appendFile(sessionTracePath(sessionId), `${JSON.stringify(traceEntry)}\n`, "utf8");
}

export async function captureWorkdayDiagnosticSnapshot(page: Page) {
  return page.evaluate(() => {
    const headings = Array.from(
      document.querySelectorAll("h1, h2, h3, legend, [data-automation-id='pageHeader'], [data-automation-id='formSectionHeading']")
    )
      .filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160))
      .filter(Boolean);

    const controls = Array.from(
      document.querySelectorAll(
        [
          "input:not([type='hidden'])",
          "textarea",
          "select",
          "[role='combobox']",
          "[role='listbox']",
          "[role='radio']",
          "[role='checkbox']",
          "button[aria-haspopup='listbox']",
          "[data-automation-id='fieldControl']"
        ].join(", ")
      )
    ).filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
    });

    const questionLabels = Array.from(
      document.querySelectorAll("label, legend, [data-automation-id='formLabel'], [data-automation-id='promptTitle']")
    )
      .filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, 80);

    const dropdownTriggers = Array.from(
      document.querySelectorAll("[aria-haspopup='listbox'], [role='combobox'], [data-automation-id='fieldControl']")
    )
      .filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
      })
      .map((element) =>
        [
          element.getAttribute("data-automation-id"),
          element.getAttribute("role"),
          element.getAttribute("id"),
          element.getAttribute("name"),
          element.getAttribute("aria-controls")
        ]
          .filter(Boolean)
          .map((value) => String(value).replace(/\s+/g, " ").trim().slice(0, 80))
          .join(" | ")
      )
      .filter(Boolean)
      .slice(0, 40);

    const listboxes = Array.from(
      document.querySelectorAll("[role='listbox'], [role='menu'], [data-automation-id='promptOption'], [data-automation-id='menuItem']")
    )
      .filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
      })
      .map((element) =>
        [
          element.getAttribute("data-automation-id"),
          element.getAttribute("role"),
          element.getAttribute("id"),
          element.getAttribute("name"),
          element.getAttribute("aria-controls")
        ]
          .filter(Boolean)
          .map((value) => String(value).replace(/\s+/g, " ").trim().slice(0, 80))
          .join(" | ")
      )
      .filter(Boolean)
      .slice(0, 40);

    const fileInputs = Array.from(document.querySelectorAll("input[type='file']"))
      .map((element) =>
        [
          element.getAttribute("data-automation-id"),
          element.getAttribute("role"),
          element.getAttribute("id"),
          element.getAttribute("name"),
          element.getAttribute("aria-controls")
        ]
          .filter(Boolean)
          .map((value) => String(value).replace(/\s+/g, " ").trim().slice(0, 80))
          .join(" | ")
      )
      .filter(Boolean)
      .slice(0, 20);

    const repeatableSections = Array.from(
      document.querySelectorAll("section, fieldset, [data-automation-id='formSection'], [data-automation-id='panelSet']")
    )
      .filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const heading = (element.querySelector("h1, h2, h3, legend, [data-automation-id='formSectionHeading'], [data-automation-id='panelHeader']")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160);
        if (!heading) return null;
        if (!/education|experience|employment|work history|certification/i.test(heading)) return null;

        const addButtons = Array.from(element.querySelectorAll("button, [role='button']"))
          .filter((button) => {
            if (!(button instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(button);
            const rect = button.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
          })
          .map((button) => ({
            ownerHeading: heading,
            selector: [
              button.getAttribute("data-automation-id"),
              button.getAttribute("role"),
              button.getAttribute("id"),
              button.getAttribute("name"),
              button.getAttribute("aria-controls")
            ]
              .filter(Boolean)
              .map((value) => String(value).replace(/\s+/g, " ").trim().slice(0, 80))
              .join(" | "),
            label: (button.textContent || button.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 60)
          }))
          .filter((button) => /add/i.test(button.label) || /add/i.test(button.selector));

        const entryCount = Array.from(
          element.querySelectorAll(
            "[data-applypilot-repeatable-entry], [data-automation-id='repeatableSectionItem'], [data-automation-id='education'], [data-automation-id='workExperience'], [data-automation-id='certification']"
          )
        ).filter((entry) => {
          if (!(entry instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(entry);
          const rect = entry.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
        }).length;

        return {
          heading,
          addButtons,
          entryCount
        };
      })
      .filter(Boolean)
      .slice(0, 20);

    const controlTypeCounts = controls.reduce<Record<string, number>>((accumulator, element) => {
      const key =
        (element instanceof HTMLInputElement && element.type) ||
        (element instanceof HTMLTextAreaElement ? "textarea" : "") ||
        (element instanceof HTMLSelectElement ? "select" : "") ||
        element.getAttribute("role") ||
        element.getAttribute("data-automation-id") ||
        element.tagName.toLowerCase();
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    }, {});

    return {
      currentUrl: window.location.href,
      route: `${window.location.origin}${window.location.pathname}`,
      heading: headings[0] || "",
      visibleSectionHeadings: headings.slice(1, 20),
      visibleControlCount: controls.length,
      controlTypeCounts,
      questionLabels,
      dropdownTriggers,
      listboxes,
      fileInputs,
      repeatableSections
    };
  });
}

export async function recordWorkdayPageSnapshot(sessionId: string, page: Page, phase: string, detail?: Record<string, unknown>) {
  const snapshot = await captureWorkdayDiagnosticSnapshot(page).catch(() => null);
  await appendWorkdayDiagnostic(sessionId, {
    event: "page_snapshot",
    phase,
    detail: snapshot
      ? {
          ...snapshot,
          currentUrl: sanitizeRoute(snapshot.currentUrl),
          route: sanitizeRoute(snapshot.route),
          heading: sanitizeText(snapshot.heading),
          visibleSectionHeadings: snapshot.visibleSectionHeadings.map((heading) => sanitizeText(String(heading))),
          questionLabels: snapshot.questionLabels.map((label) => sanitizeText(String(label), 120)),
          dropdownTriggers: snapshot.dropdownTriggers.map((selector) => sanitizeText(String(selector), 120)),
          listboxes: snapshot.listboxes.map((selector) => sanitizeText(String(selector), 120)),
          fileInputs: snapshot.fileInputs.map((selector) => sanitizeText(String(selector), 120)),
          repeatableSections: snapshot.repeatableSections,
          ...detail
        }
      : detail
  });
}

export async function recordWorkdayNavigationEvent(
  sessionId: string,
  page: Page,
  detail: {
    reason: string;
    pageIdentity?: string;
  }
) {
  await appendWorkdayDiagnostic(sessionId, {
    event: "navigation_event",
    detail: {
      route: sanitizeRoute(page.url()),
      reason: sanitizeText(detail.reason, 120),
      pageIdentity: sanitizeText(detail.pageIdentity || "", 200)
    }
  });
}

export async function recordWorkdayFillAttempt(
  sessionId: string,
  detail: {
    phase: string;
    label: string;
    intent: string;
    controlType?: string;
    sectionLabel?: string;
    entryIndex?: number;
    exactMatchRequired?: boolean;
    skipReason?: string;
  }
) {
  await appendWorkdayDiagnostic(sessionId, {
    event: detail.skipReason ? "skip_reason" : "fill_attempt",
    phase: detail.phase,
    detail: {
      label: sanitizeText(detail.label, 100),
      intent: detail.intent,
      controlType: detail.controlType || "",
      sectionLabel: sanitizeText(detail.sectionLabel || "", 100),
      entryIndex: detail.entryIndex ?? 0,
      exactMatchRequired: Boolean(detail.exactMatchRequired),
      reason: sanitizeText(detail.skipReason || "", 160)
    }
  });
}

export async function recordWorkdayFillResult(
  sessionId: string,
  detail: {
    phase: string;
    label: string;
    intent: string;
    success: boolean;
    verificationMessage: string;
    severe?: boolean;
  }
) {
  await appendWorkdayDiagnostic(sessionId, {
    event: detail.severe ? "severe_regression" : "fill_result",
    phase: detail.phase,
    detail: {
      label: sanitizeText(detail.label, 100),
      intent: detail.intent,
      success: detail.success,
      verificationMessage: sanitizeText(detail.verificationMessage, 160)
    }
  });
}

export function summarizeDiagnosticControl(element: Element) {
  return controlDescriptor(element);
}
