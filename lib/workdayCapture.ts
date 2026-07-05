import { promises as fs } from "fs";
import path from "path";

import type { Page } from "playwright";

import { ensureDataDir, getDataDirPath } from "@/lib/storage";
import { normalizeText, slugify } from "@/lib/utils";

type RawCapturedControl = {
  order: number;
  label: string;
  sectionHeading: string;
  role: string;
  inputType: string;
  tagName: string;
  dataAutomationId: string;
  ariaLabel: string;
  ariaLabelledBy: string;
  ariaDescribedBy: string;
  ariaControls: string;
  required: boolean;
  disabled: boolean;
  accept: string;
  optionLabels: string[];
};

type RawWorkdayCapture = {
  hostname: string;
  pathname: string;
  title: string;
  stepHeading: string;
  sectionHeadings: string[];
  controls: RawCapturedControl[];
  buttons: string[];
  navigationButtons: string[];
  iframes: { title: string; srcHost: string }[];
  repeatableSections: { heading: string; addButtons: string[] }[];
  formContainerIds: string[];
  pageIdentitySignals: string[];
};

export type WorkdaySanitizedCapture = {
  atsFamily: "workday";
  tenantSlug: string;
  capturedAt: string;
  hostname: string;
  pathname: string;
  pageType: string;
  pageTitle: string;
  stepHeading: string;
  sectionHeadings: string[];
  controls: RawCapturedControl[];
  buttons: string[];
  navigationButtons: string[];
  iframes: { title: string; srcHost: string }[];
  repeatableSections: { heading: string; addButtons: string[] }[];
  formContainerIds: string[];
  pageIdentitySignals: string[];
};

const WORKDAY_CAPTURE_DIR = "workday-captures";

function redactCapturedText(value: string) {
  return value
    .replace(/\bpassword\b/gi, "[redacted-secret]")
    .replace(/\b(token|cookie|session storage|local storage)\b/gi, "[redacted-secret]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/g, "[redacted-phone]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[redacted-id]")
    .replace(/\b(candidate|application|profile|worker|person)[-_ ]?(id)?[:=_ -]*[a-z0-9-]{4,}\b/gi, "[redacted-id]")
    .replace(/\b[a-z0-9._-]+\.(pdf|doc|docx|rtf|txt)\b/gi, "[redacted-file]")
    .trim();
}

function sanitizePathname(pathname: string) {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (/^[0-9]+$/.test(segment)) return "[redacted-id]";
      if (/^[0-9a-f-]{10,}$/i.test(segment)) return "[redacted-id]";
      return slugify(segment) || "segment";
    })
    .join("/");
}

export function sanitizeWorkdayTenant(hostname: string) {
  const parts = hostname.split(".").filter(Boolean);
  const tenant =
    parts.find(
      (part) =>
        !/^wd\d+$/i.test(part) &&
        !/^(com|net|org|io|co|us)$/i.test(part) &&
        !/myworkdayjobs|workdayjobs|workday/i.test(part)
    ) ??
    "tenant";
  return slugify(tenant) || "tenant";
}

export function inferWorkdayPageType(capture: Pick<WorkdaySanitizedCapture, "pageTitle" | "stepHeading" | "sectionHeadings" | "controls">) {
  const combined = normalizeText(
    [capture.pageTitle, capture.stepHeading, ...capture.sectionHeadings, ...capture.controls.map((control) => control.label)].join(" ")
  );

  if (/resume|cv/.test(combined)) return "resume";
  if (/work experience|employment history|experience/.test(combined)) return "work-experience";
  if (/education|school|degree/.test(combined)) return "education";
  if (/voluntary|demographic|eeoc|gender|ethnicity|veteran|disability/.test(combined)) return "demographic";
  if (/review|submit|certify|final/.test(combined)) return "final-review";
  if (/question|additional information|work authorization|sponsorship/.test(combined)) return "employer-questions";
  return "contact";
}

export function buildWorkdayCaptureFilename({
  tenantSlug,
  pageType,
  capturedAt
}: {
  tenantSlug: string;
  pageType: string;
  capturedAt: string;
}) {
  const compactTimestamp = capturedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `workday-${tenantSlug}-${pageType}-${compactTimestamp}.json`;
}

export function sanitizeWorkdayCapture(rawCapture: RawWorkdayCapture, capturedAt: string): WorkdaySanitizedCapture {
  const tenantSlug = sanitizeWorkdayTenant(rawCapture.hostname);
  const capture: WorkdaySanitizedCapture = {
    atsFamily: "workday",
    tenantSlug,
    capturedAt,
    hostname: redactCapturedText(rawCapture.hostname),
    pathname: sanitizePathname(rawCapture.pathname),
    pageType: "contact",
    pageTitle: redactCapturedText(rawCapture.title),
    stepHeading: redactCapturedText(rawCapture.stepHeading),
    sectionHeadings: rawCapture.sectionHeadings.map(redactCapturedText).filter(Boolean),
    controls: rawCapture.controls.map((control) => ({
      ...control,
      label: redactCapturedText(control.label),
      sectionHeading: redactCapturedText(control.sectionHeading),
      ariaLabel: redactCapturedText(control.ariaLabel),
      ariaLabelledBy: redactCapturedText(control.ariaLabelledBy),
      ariaDescribedBy: redactCapturedText(control.ariaDescribedBy),
      optionLabels: control.optionLabels.map(redactCapturedText).filter(Boolean)
    })),
    buttons: rawCapture.buttons.map(redactCapturedText).filter(Boolean),
    navigationButtons: rawCapture.navigationButtons.map(redactCapturedText).filter(Boolean),
    iframes: rawCapture.iframes.map((frame) => ({
      title: redactCapturedText(frame.title),
      srcHost: redactCapturedText(frame.srcHost)
    })),
    repeatableSections: rawCapture.repeatableSections.map((section) => ({
      heading: redactCapturedText(section.heading),
      addButtons: section.addButtons.map(redactCapturedText).filter(Boolean)
    })),
    formContainerIds: rawCapture.formContainerIds
      .map((value) => redactCapturedText(value))
      .filter((value) => value && !/[0-9]{4,}/.test(value)),
    pageIdentitySignals: rawCapture.pageIdentitySignals.map(redactCapturedText).filter(Boolean)
  };

  capture.pageType = inferWorkdayPageType(capture);
  return capture;
}

async function collectRawWorkdayCapture(page: Page): Promise<RawWorkdayCapture> {
  return page.evaluate(() => {
    const isVisible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };

    const textOf = (element: Element | null) => (element?.textContent || "").replace(/\s+/g, " ").trim();

    const sectionHeadingFor = (element: Element) => {
      const section = element.closest("section, [role='group'], fieldset, [data-automation-id]");
      if (!section) return "";
      const heading = section.querySelector("h1, h2, h3, h4, legend, [data-automation-id='sectionHeader']");
      return textOf(heading);
    };

    const collectLabel = (element: Element) => {
      if (!(element instanceof HTMLElement)) return "";
      const ariaLabel = element.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel.trim();

      const id = element.getAttribute("id");
      const explicitLabel = id ? document.querySelector(`label[for="${id}"]`) : null;
      if (explicitLabel) return textOf(explicitLabel);

      const wrappingLabel = element.closest("label");
      if (wrappingLabel) return textOf(wrappingLabel);

      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) {
        return labelledBy
          .split(/\s+/)
          .map((token) => textOf(document.getElementById(token)))
          .filter(Boolean)
          .join(" ");
      }

      return "";
    };

    const controls = Array.from(
      document.querySelectorAll("input, select, textarea, [role='combobox'], [role='listbox'], [role='textbox']")
    )
      .filter((element) => isVisible(element))
      .map((element, index) => {
        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute("role") || "";
        const optionLabels =
          element instanceof HTMLSelectElement
            ? Array.from(element.options).map((option) => textOf(option))
            : role === "listbox"
              ? Array.from(element.querySelectorAll("[role='option']")).map((option) => textOf(option))
              : [];

        return {
          order: index + 1,
          label: collectLabel(element),
          sectionHeading: sectionHeadingFor(element),
          role,
          inputType: element.getAttribute("type") || "",
          tagName,
          dataAutomationId: element.getAttribute("data-automation-id") || "",
          ariaLabel: element.getAttribute("aria-label") || "",
          ariaLabelledBy: element.getAttribute("aria-labelledby") || "",
          ariaDescribedBy: element.getAttribute("aria-describedby") || "",
          ariaControls: element.getAttribute("aria-controls") || "",
          required: element.hasAttribute("required") || element.getAttribute("aria-required") === "true",
          disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
          accept: element.getAttribute("accept") || "",
          optionLabels
        };
      });

    const buttons = Array.from(document.querySelectorAll("button, [role='button']"))
      .filter((element) => isVisible(element))
      .map((element) => textOf(element))
      .filter(Boolean);

    const navigationButtons = buttons.filter((label) => /next|continue|save|submit|review|back/i.test(label));
    const sectionHeadings = Array.from(document.querySelectorAll("h1, h2, h3, h4, legend, [data-automation-id='sectionHeader']"))
      .filter((element) => isVisible(element))
      .map((element) => textOf(element))
      .filter(Boolean);

    const repeatableSections = Array.from(document.querySelectorAll("section, [role='group'], fieldset"))
      .map((section) => {
        const heading = textOf(section.querySelector("h1, h2, h3, h4, legend, [data-automation-id='sectionHeader']"));
        const addButtons = Array.from(section.querySelectorAll("button, [role='button']"))
          .filter((button) => isVisible(button))
          .map((button) => textOf(button))
          .filter((label) => /^add\b/i.test(label));
        return { heading, addButtons };
      })
      .filter((section) => section.heading || section.addButtons.length);

    return {
      hostname: window.location.hostname,
      pathname: window.location.pathname,
      title: document.title,
      stepHeading: textOf(document.querySelector("h1, [data-automation-id='pageHeader'], [data-automation-id='formTitle']")),
      sectionHeadings,
      controls,
      buttons,
      navigationButtons,
      iframes: Array.from(document.querySelectorAll("iframe")).map((frame) => ({
        title: frame.getAttribute("title") || "",
        srcHost: (() => {
          try {
            return new URL(frame.getAttribute("src") || "", window.location.href).hostname;
          } catch {
            return "";
          }
        })()
      })),
      repeatableSections,
      formContainerIds: Array.from(document.querySelectorAll("form, [data-automation-id='formContainer'], [data-automation-id='applicationForm']"))
        .map((element) => element.getAttribute("data-automation-id") || element.getAttribute("id") || "")
        .filter(Boolean),
      pageIdentitySignals: [
        document.title,
        textOf(document.querySelector("h1, [data-automation-id='pageHeader'], [data-automation-id='formTitle']")),
        window.location.hostname,
        window.location.pathname
      ].filter(Boolean)
    };
  });
}

export async function saveWorkdayCapture(page: Page) {
  const capturedAt = new Date().toISOString();
  const rawCapture = await collectRawWorkdayCapture(page);
  const sanitizedCapture = sanitizeWorkdayCapture(rawCapture, capturedAt);
  const fileName = buildWorkdayCaptureFilename({
    tenantSlug: sanitizedCapture.tenantSlug,
    pageType: sanitizedCapture.pageType,
    capturedAt
  });

  await ensureDataDir();
  const captureDir = path.join(getDataDirPath(), WORKDAY_CAPTURE_DIR);
  await fs.mkdir(captureDir, { recursive: true });
  const filePath = path.join(captureDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(sanitizedCapture, null, 2), "utf8");

  return {
    fileName,
    filePath,
    capture: sanitizedCapture
  };
}
