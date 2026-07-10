import type { Frame } from "playwright";

import { RawScannedField } from "@/types";

type BrowserFieldScanArgs = {
  prefix: string;
  selectorAttribute: string;
  groupAttribute: string;
  url: string;
  name: string;
};

const BROWSER_FIELD_SCANNER_SOURCE = String.raw`
  const cleanText = (value) => (value ?? "").replace(/\s+/g, " ").trim();
  const OVERLAY_ROOT_SELECTOR = "#applypilot-overlay, #applypilot-workday-overlay";
  const FIELD_CONTAINER_SELECTORS = [
    "fieldset",
    "[role='radiogroup']",
    "[role='group']",
    "[data-automation-id='formField']",
    ".application-question",
    ".form-field",
    ".form-group",
    ".field-wrapper",
    ".field-wrapper--multiline",
    ".text-input-wrapper",
    ".input-wrapper",
    ".input-wrapper__multi-line",
    ".field",
    "[class*='question']"
  ].join(", ");
  const FIELD_CONTROL_SELECTORS = [
    "input",
    "textarea",
    "select",
    "[role='combobox']",
    "[role='listbox']",
    "[role='radio']",
    "[role='checkbox']",
    "button[aria-haspopup='listbox']",
    "button[aria-expanded]",
    "[data-automation-id='promptOption']",
    "[data-automation-id='fieldControl']",
    "[contenteditable='true']"
  ].join(", ");
  const FIELD_BOUNDARY_SELECTORS = [FIELD_CONTAINER_SELECTORS, FIELD_CONTROL_SELECTORS].join(", ");

  const isVisibleElement = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
  };

  const normalizeFragment = (value) =>
    cleanText(value)
      .replace(/\s*\*\s*/g, " ")
      .replace(/[|]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

  const looksLikeNoiseFragment = (value) => {
    const text = normalizeFragment(value).toLowerCase();
    if (!text) return true;
    if (/^(select|select\.\.\.|choose|start typing|type here|combobox|option|no results found|results found)$/i.test(text)) return true;
    if (/^(attach|dropbox|google drive|enter manually)$/i.test(text)) return true;
    if (/^accepted file types:/i.test(text)) return true;
    if (/^question[_-]?\d+$/i.test(text) || /^field[_-]?\d+$/i.test(text) || /^input[_-]?\d+$/i.test(text)) return true;
    if (/^ca[_-]?\d+$/i.test(text)) return true;
    return false;
  };

  const deduplicateQuestionFragments = (fragments) => {
    const unique = [];
    for (const fragment of fragments.map(normalizeFragment)) {
      if (!fragment || looksLikeNoiseFragment(fragment)) continue;
      const normalized = fragment.toLowerCase();
      if (
        unique.some(
          (existing) =>
            existing.toLowerCase() === normalized ||
            existing.toLowerCase().includes(normalized) ||
            normalized.includes(existing.toLowerCase())
        )
      ) {
        continue;
      }
      unique.push(fragment);
    }
    return unique;
  };

  const validateExtractedQuestion = (value, fallback = "") => {
    const cleaned = normalizeFragment(value);
    if (!cleaned) return normalizeFragment(fallback);

    const obviousBoundaryLeak =
      cleaned.length > 240 ||
      (cleaned.match(/\?/g) || []).length >= 2 ||
      /linkedin url.*github url|github url.*linkedin url|current company.*linkedin url|visa sponsorship.*salary expectations|salary expectations.*available to start/i.test(cleaned);

    if (obviousBoundaryLeak) {
      return normalizeFragment(fallback);
    }

    return cleaned;
  };

  const ensureGroupId = (element, index) => {
    const container =
      element.closest(
        "fieldset, [role='radiogroup'], [role='group'], [data-automation-id='formField'], .application-question, .form-field, .form-group, .field-wrapper, .text-input-wrapper, .input-wrapper, [class*='question']"
      ) ?? element.parentElement;
    if (!container) return "";

    const existing = container.getAttribute(frameInfo.groupAttribute);
    if (existing) return existing;

    const next = frameInfo.prefix + "_group_" + index;
    container.setAttribute(frameInfo.groupAttribute, next);
    return next;
  };

  const resolveExplicitLabel = (element) => {
    const wrapped = element.closest("label");
    if (wrapped) return cleanText(wrapped.textContent);

    const id = element.getAttribute("id");
    if (!id) return "";

    const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id.replace(/"/g, "\\\"");
    return cleanText(document.querySelector("label[for=\"" + escapedId + "\"]")?.textContent);
  };

  const resolveAriaLabelledBy = (element) => {
    const ariaLabelledBy = element.getAttribute("aria-labelledby");
    if (!ariaLabelledBy) return "";

    return cleanText(
      ariaLabelledBy
        .split(/\s+/)
        .map((labelId) => document.getElementById(labelId)?.textContent ?? "")
        .join(" ")
    );
  };

  const resolveLegend = (element) =>
    cleanText(
      element.closest("fieldset")?.querySelector("legend")?.textContent ||
        element.closest("[role='radiogroup'], [role='group']")?.querySelector("legend, [data-ui='question'], h1, h2, h3, h4, label")?.textContent ||
        ""
    );

  const findOwningFieldContainer = (element) => {
    const candidates = [];
    let current = element.parentElement;

    while (current && current !== document.body && candidates.length < 10) {
      if (current.matches(FIELD_CONTAINER_SELECTORS)) {
        candidates.push(current);
      }
      current = current.parentElement;
    }

    if (!candidates.length) {
      return element.parentElement;
    }

    let best = candidates[0];
    let bestScore = -Infinity;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const text = normalizeFragment(candidate.textContent || "");
      const otherControls = Array.from(candidate.querySelectorAll(FIELD_CONTROL_SELECTORS)).filter(
        (control) => control !== element && !control.contains(element) && !element.contains(control)
      );

      let score = 0;
      if (candidate.matches(".field-wrapper, .field-wrapper--multiline, .application-question, .form-field, .form-group, [data-automation-id='formField']")) {
        score += 5;
      }
      if (candidate.matches("fieldset, [role='group'], [role='radiogroup']")) {
        score += 4;
      }
      if (otherControls.length === 0) score += 4;
      else if (otherControls.length <= 2) score += 2;
      else score -= otherControls.length * 2;
      if (text.length > 0 && text.length <= 180) score += 2;
      if (text.length > 260) score -= 4;
      score -= index * 0.25;

      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  };

  const resolveNearestVisibleLabel = (element, container) => {
    const candidates = [
      ...(container ? Array.from(container.querySelectorAll("label, legend, [data-ui='question'], .label, [class*='label']")) : []),
      ...(element.labels ? Array.from(element.labels) : [])
    ];

    for (const candidate of candidates) {
      if (!isVisibleElement(candidate)) continue;
      const text = normalizeFragment(candidate.textContent || "");
      if (!looksLikeNoiseFragment(text)) {
        return text;
      }
    }

    return "";
  };

  const stopAtSiblingFieldBoundary = (node, target) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node === target || node.contains(target) || target.contains(node)) return false;
    if (node.matches("label, legend, [data-ui='question'], .label, [class*='label']")) return false;
    return node.matches(FIELD_BOUNDARY_SELECTORS);
  };

  const extractLocalQuestionContext = (element, container) => {
    const fallbackFragments = deduplicateQuestionFragments([
      resolveExplicitLabel(element),
      resolveAriaLabelledBy(element),
      element.getAttribute("aria-label") || "",
      resolveLegend(element),
      resolveNearestVisibleLabel(element, container),
      element.getAttribute("placeholder") || ""
    ]);

    if (!container) {
      return validateExtractedQuestion(fallbackFragments.join(" "), fallbackFragments[0] || "");
    }

    const fragments = [];
    const collect = (node) => {
      if (!node || fragments.length >= 16) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const text = normalizeFragment(node.textContent || "");
        if (!looksLikeNoiseFragment(text)) {
          fragments.push(text);
        }
        return;
      }

      if (!(node instanceof HTMLElement)) return;
      if (node !== container && stopAtSiblingFieldBoundary(node, element)) return;
      if (!isVisibleElement(node)) return;
      if (node.matches("script, style, noscript, template, option, [role='option'], [role='listbox'], [role='menu'], [aria-hidden='true']")) return;
      if (node !== container && node.matches("input, textarea, select, button, [contenteditable='true']")) return;

      for (const child of Array.from(node.childNodes)) {
        collect(child);
      }
    };

    collect(container);

    const deduped = deduplicateQuestionFragments([...fallbackFragments, ...fragments]);
    return validateExtractedQuestion(deduped.join(" "), fallbackFragments[0] || "");
  };

  const resolveOptionLabel = (element) =>
    cleanText(resolveExplicitLabel(element) || element.getAttribute("aria-label") || (element instanceof HTMLElement ? element.innerText : element.textContent) || "");

  const controls = Array.from(
    document.querySelectorAll(
      [
        "input",
        "textarea",
        "select",
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="radio"]',
        '[role="checkbox"]',
        'button[aria-haspopup="listbox"]',
        'button[aria-expanded]',
        '[data-automation-id="promptOption"]',
        '[data-automation-id="fieldControl"]',
        '[contenteditable="true"]'
      ].join(", ")
    )
  );

  const results = [];

  for (let index = 0; index < controls.length; index += 1) {
    const element = controls[index];

    try {
      if (!(element instanceof HTMLElement)) continue;
      if (element instanceof HTMLInputElement && element.type === "hidden") continue;
      if (element.closest(OVERLAY_ROOT_SELECTOR)) continue;

      if (!isVisibleElement(element)) continue;

      const selectorId = frameInfo.prefix + "_" + index;
      element.setAttribute(frameInfo.selectorAttribute, selectorId);

      const role = element.getAttribute("role") || "";
      const owningContainer = findOwningFieldContainer(element);
      const explicitLabel = resolveExplicitLabel(element);
      const ariaLabelledByText = resolveAriaLabelledBy(element);
      const legendText = resolveLegend(element);
      const nearestVisibleLabel = resolveNearestVisibleLabel(element, owningContainer);
      const questionContainerText = extractLocalQuestionContext(element, owningContainer);
      const optionLabel = resolveOptionLabel(element);
      const groupKey = ensureGroupId(element, index);

      const isBooleanControl =
        (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) || role === "checkbox" || role === "radio";

      let isChecked = false;
      if (element instanceof HTMLInputElement) {
        isChecked = element.checked;
      } else {
        isChecked =
          element.getAttribute("aria-checked") === "true" ||
          element.getAttribute("data-state") === "checked" ||
          element.getAttribute("aria-selected") === "true";
      }

      let detectedValue = "";
      if (isBooleanControl) {
        detectedValue = isChecked ? "checked" : "unchecked";
      } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        detectedValue = element.value ?? "";
      } else {
        detectedValue = cleanText(element.textContent);
      }

      const parent = owningContainer ?? element.parentElement;
      const nearbyText = validateExtractedQuestion(questionContainerText, nearestVisibleLabel || explicitLabel || ariaLabelledByText);

      let controlType = "custom_select";
      if (element instanceof HTMLTextAreaElement) {
        controlType = "textarea";
      } else if (element instanceof HTMLSelectElement) {
        controlType = "native_select";
      } else if (element instanceof HTMLInputElement) {
        if (element.type === "file") controlType = "file";
        else if (element.type === "checkbox") controlType = "checkbox";
        else if (element.type === "radio") controlType = "radio";
        else if (role === "combobox") controlType = "aria_combobox";
        else controlType = "text";
      } else if (role === "radio") {
        controlType = "radio";
      } else if (role === "checkbox") {
        controlType = "checkbox";
      } else if (role === "combobox") {
        controlType = "aria_combobox";
      } else if (role === "listbox") {
        controlType = "listbox";
      } else if (element instanceof HTMLButtonElement && element.getAttribute("aria-haspopup")) {
        controlType = "menu_button";
      } else if (element.getAttribute("contenteditable") === "true") {
        controlType = "text";
      }

      let elementType = "text";
      if (element instanceof HTMLTextAreaElement) {
        elementType = "textarea";
      } else if (element instanceof HTMLSelectElement) {
        elementType = element.multiple ? "select-multiple" : "select-one";
      } else if (element instanceof HTMLInputElement) {
        elementType = element.type || "text";
      } else if (role === "radio") {
        elementType = "radio";
      } else if (role === "checkbox") {
        elementType = "checkbox";
      } else if (role === "combobox") {
        elementType = "search";
      }

      const selectOptions =
        element instanceof HTMLSelectElement
          ? Array.from(element.options)
              .map((option) => cleanText(option.textContent))
              .filter(Boolean)
          : undefined;

      results.push({
        label: explicitLabel,
        name: element.getAttribute("name") ?? "",
        domId: element.getAttribute("id") ?? "",
        type: elementType,
        controlType,
        role,
        selector: "[" + frameInfo.selectorAttribute + "=\"" + selectorId + "\"]",
        detectedValue,
        placeholder: element.getAttribute("placeholder") ?? "",
        ariaLabel: element.getAttribute("aria-label") ?? "",
        nearbyText,
        selectOptions,
        frameUrl: frameInfo.url,
        frameName: frameInfo.name,
        isRequired: element.hasAttribute("required") || element.getAttribute("aria-required") === "true",
        isVisible: true,
        isDisabled:
          (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) &&
          element.disabled,
        autocomplete: element.getAttribute("autocomplete") ?? "",
        accept: element instanceof HTMLInputElement ? element.getAttribute("accept") ?? "" : "",
        explicitLabel,
        ariaLabelledByText,
        legendText,
        questionContainerText,
        optionLabel,
        groupKey,
        groupLabel: legendText || questionContainerText || nearestVisibleLabel
      });
    } catch {}
  }

  return results;
`;

export async function evaluateVisibleFieldCandidates(frame: Frame, frameInfo: BrowserFieldScanArgs): Promise<RawScannedField[]> {
  return frame.evaluate(
    ({ source, runtimeInfo }) => {
      const scanner = new Function("frameInfo", source);
      return scanner(runtimeInfo);
    },
    {
      source: `${BROWSER_FIELD_SCANNER_SOURCE}`,
      runtimeInfo: frameInfo
    }
  ) as Promise<RawScannedField[]>;
}
