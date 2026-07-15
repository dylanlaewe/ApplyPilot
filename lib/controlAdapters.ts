import type { Frame } from "playwright";

import { HighestEducationLevel, SecurityClearanceLevel, WorkAuthorizationCategory, DetectedField } from "@/types";

import {
  matchBooleanOption,
  matchEducationLevel,
  matchSecurityClearanceLevel,
  matchStructuredLocationOption,
  matchTextOption,
  matchWorkAuthorizationCategory
} from "@/lib/optionMatcher";
import { dismissCookieConsentIfPresent } from "@/lib/consentBarrier";
import { normalizeText } from "@/lib/utils";

type ControlOption = {
  selector: string;
  text: string;
};

const PORTAL_OPTION_SELECTORS = [
  '[role="option"]',
  '[role="listitem"]',
  '[data-automation-id="menuItem"]',
  '[data-automation-id="promptOption"]',
  '[data-radix-collection-item]',
  '[cmdk-item]',
  'li[aria-selected]',
  'button[role="option"]'
].join(", ");

export async function fillNativeSelect(frame: Frame, selector: string, value: string) {
  const options = await frame.locator(selector).evaluate((element) => {
    if (!(element instanceof HTMLSelectElement)) return [];
    return Array.from(element.options).map((option) => ({
      label: option.textContent?.trim() ?? "",
      value: option.value
    }));
  });

  const exact =
    options.find((option) => normalizeText(option.label) === normalizeText(value) || normalizeText(option.value) === normalizeText(value)) ??
    (matchTextOption(options.map((option) => option.label), value)
      ? options.find((option) => option.label === matchTextOption(options.map((option) => option.label), value)?.option)
      : null);

  if (!exact) {
    throw new Error("No matching dropdown option found.");
  }

  await frame.locator(selector).selectOption(exact.value);
}

async function visiblePortalOptions(frame: Frame, field?: DetectedField) {
  const optionScopes: string[] = [];

  if (field) {
    const locator = frame.locator(field.selector).first();
    const [targetId, ariaControls, ariaOwns] = await Promise.all([
      locator.getAttribute("id").catch(() => ""),
      locator.getAttribute("aria-controls").catch(() => ""),
      locator.getAttribute("aria-owns").catch(() => "")
    ]);

    for (const relatedId of [ariaControls || "", ariaOwns || "", targetId ? `react-select-${targetId}-listbox` : ""]) {
      if (!relatedId) continue;
      optionScopes.push(`[id="${relatedId}"] ${PORTAL_OPTION_SELECTORS}`);
    }

    const nearbyMenuSelector = await locator
      .evaluate((element) => {
        const menu = element
          .closest(".select, .select__container, .field-wrapper, .form-field, .form-group")
          ?.querySelector(".select__menu, [role='listbox']");
        if (!(menu instanceof HTMLElement)) return "";
        const id = menu.getAttribute("data-applypilot-scope-id") || `applypilot-scope-${Math.random().toString(36).slice(2)}`;
        menu.setAttribute("data-applypilot-scope-id", id);
        return `[data-applypilot-scope-id="${id}"] ${PORTAL_OPTION_SELECTORS}`;
      })
      .catch(() => "");
    if (nearbyMenuSelector) {
      optionScopes.push(nearbyMenuSelector);
    }
  }

  const dedupe = new Map<string, ControlOption>();
  const selectorsToTry = [...optionScopes, PORTAL_OPTION_SELECTORS];
  const markerPrefix = `applypilot-option-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  for (const selector of selectorsToTry) {
    const locator = frame.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const visible = await candidate.isVisible().catch(() => false);
      if (!visible) continue;
      const marker = await candidate
        .evaluate((element, payload) => {
          const id = `${payload.prefix}-${payload.index}`;
          element.setAttribute("data-applypilot-option-id", id);
          return id;
        }, { prefix: markerPrefix, index })
        .catch(() => "");
      if (!marker) continue;
      const text = ((await candidate.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      dedupe.set(marker, {
        selector: `[data-applypilot-option-id="${marker}"]`,
        text
      });
    }
    if (dedupe.size) {
      return Array.from(dedupe.values());
    }
  }

  return [];
}

async function waitForVisiblePortalOptions(frame: Frame, field?: DetectedField, timeoutMs = 3_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const options = await visiblePortalOptions(frame, field);
    if (options.length) {
      return options;
    }
    await frame.waitForTimeout(100);
  }

  return [];
}

async function openControl(frame: Frame, field: DetectedField) {
  const locator = frame.locator(field.selector).first();
  try {
    await locator.click({ timeout: 10_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/intercepts pointer events/i.test(message)) {
      await dismissCookieConsentIfPresent(frame.page(), { waitForAppearanceMs: 1_500 }).catch(() => false);
      const retried = await locator
        .click({ timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (retried) {
        let options = await waitForVisiblePortalOptions(frame, field, 750);
        if (options.length) return options;
      }
    }

    await locator.click({ timeout: 10_000, force: true }).catch(async () => {
      await locator.evaluate((element) => {
        if (element instanceof HTMLElement) {
          element.click();
        }
      });
    });
  }

  let options = await waitForVisiblePortalOptions(frame, field, 750);
  if (options.length) return options;

  await locator.press("ArrowDown").catch(() => undefined);
  options = await waitForVisiblePortalOptions(frame, field, 750);
  if (options.length) return options;

  await locator.press(" ").catch(() => undefined);
  options = await waitForVisiblePortalOptions(frame, field, 750);
  if (options.length) return options;

  await locator.press("Enter").catch(() => undefined);
  return waitForVisiblePortalOptions(frame, field, 750);
}

async function typeSearchQuery(frame: Frame, field: DetectedField, value: string) {
  const searchValue =
    field.intent === "city" || field.intent === "location" || field.intent === "full_location"
      ? value.split(",")[0]?.trim() || value
      : value;
  const shouldTypeSequentially = ["city", "location", "full_location"].includes(field.intent);
  const locator = frame.locator(field.selector).first();

  const tagName = await locator.evaluate((element) => element.tagName.toLowerCase()).catch(() => "div");
  if (tagName === "input" || tagName === "textarea") {
    const currentValue = await locator.inputValue().catch(() => "");
    if (currentValue) {
      await locator.fill("");
    }
    if (shouldTypeSequentially) {
      await locator.pressSequentially(searchValue, { delay: 20 });
    } else {
      await locator.fill(searchValue);
    }
    return;
  }

  const nestedInput = locator.locator('input, textarea, [role="combobox"]').first();
  if ((await nestedInput.count()) > 0) {
    const currentValue = await nestedInput.inputValue().catch(() => "");
    if (currentValue) {
      await nestedInput.fill("");
    }
    if (shouldTypeSequentially) {
      await nestedInput.pressSequentially(searchValue, { delay: 20 });
    } else {
      await nestedInput.fill(searchValue);
    }
  }
}

async function finalizeSearchSelection(frame: Frame, field: DetectedField) {
  if (!(field.controlType === "aria_combobox" || field.controlType === "autocomplete" || field.role === "combobox")) {
    return;
  }

  const locator = frame.locator(field.selector).first();
  const [visibleOptions, commitState] = await Promise.all([
    visiblePortalOptions(frame, field).catch(() => []),
    locator
      .evaluate((element) => {
        const wrapper =
          element.closest(".select__container, .select-shell, .field, .form-field, .form-group, .application-question") ??
          element.parentElement;
        const selectedValue =
          (wrapper?.querySelector(".select__single-value")?.textContent || "").replace(/\s+/g, " ").trim() ||
          (wrapper?.querySelector("#aria-selection")?.textContent || "")
            .replace(/^option\s+/i, "")
            .replace(/,\s*selected\.?/i, "")
            .replace(/\s+/g, " ")
            .trim();
        const expanded = element.getAttribute("aria-expanded") === "true";
        const ariaInvalid = element.getAttribute("aria-invalid") === "true";

        if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) {
          return {
            selectedValue,
            expanded,
            ariaInvalid,
            controlInvalid: false
          };
        }

        return {
          selectedValue,
          expanded,
          ariaInvalid,
          controlInvalid: !element.checkValidity()
        };
      })
      .catch(() => ({
        selectedValue: "",
        expanded: false,
        ariaInvalid: false,
        controlInvalid: false
      }))
  ]);

  const needsEnterCommit =
    commitState.expanded ||
    visibleOptions.length > 0 ||
    commitState.ariaInvalid ||
    commitState.controlInvalid ||
    !commitState.selectedValue;

  if (!needsEnterCommit) {
    return;
  }

  await locator.press("Enter").catch(() => undefined);
  await frame.waitForTimeout(100);
}

function matchControlOption(field: DetectedField, options: ControlOption[], value: string) {
  const texts = options.map((option) => option.text);

  switch (field.intent) {
    case "work_authorization_category":
      return (
        matchWorkAuthorizationCategory(texts, normalizeText(value).replace(/\s+/g, "_") as WorkAuthorizationCategory) ??
        matchTextOption(texts, value, "Matched work authorization dropdown option.")
      );
    case "security_clearance_level":
      return (
        matchSecurityClearanceLevel(texts, normalizeText(value).replace(/\s+/g, "_") as SecurityClearanceLevel) ??
        matchTextOption(texts, value, "Matched security clearance dropdown option.")
      );
    case "education_highest_completed":
    case "education_highest_attended":
      return (
        matchEducationLevel(texts, value as HighestEducationLevel) ??
        matchTextOption(texts, value, "Matched education dropdown option.")
      );
    case "graduated_question":
    case "previous_employment":
    case "work_authorization":
    case "sponsorship":
    case "sponsorship_now":
    case "sponsorship_future":
    case "work_without_sponsorship":
    case "eeoc_disability":
      if (value === "yes" || value === "no") {
        return matchBooleanOption({
          questionText: field.questionText || field.label,
          options: texts,
          answer: value,
          intent: field.intent
        });
      }
      return matchTextOption(texts, value, "Matched dropdown option.");
    case "city":
    case "location":
    case "full_location":
      return matchStructuredLocationOption(texts, value);
    default:
      return matchTextOption(texts, value, "Matched custom dropdown option.");
  }
}

async function selectMatchedOption(frame: Frame, options: ControlOption[], matchedText: string) {
  const matchedOption = options.find((option) => option.text === matchedText);
  if (!matchedOption) {
    throw new Error("No matching dropdown option found.");
  }

  const locator = frame.locator(matchedOption.selector);
  try {
    await locator.click({ timeout: 10_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/intercepts pointer events/i.test(message)) {
      await dismissCookieConsentIfPresent(frame.page(), { waitForAppearanceMs: 1_500 }).catch(() => false);
      await locator.click({ timeout: 5_000 });
      return;
    }

    throw error;
  }
}

export async function fillCustomCombobox(frame: Frame, field: DetectedField, value: string) {
  let options = await openControl(frame, field);
  const isSearchableControl = field.controlType === "aria_combobox" || field.controlType === "autocomplete" || field.role === "combobox";
  const needsAutocompleteSettle = ["city", "location", "full_location", "education_school", "education_major", "employer"].includes(field.intent);

  if (options.length) {
    const immediateMatch = matchControlOption(field, options, value);
    if (immediateMatch) {
      await selectMatchedOption(frame, options, immediateMatch.option);
      await finalizeSearchSelection(frame, field);
      return;
    }
  }

  if (isSearchableControl) {
    await typeSearchQuery(frame, field, value);
    options = await waitForVisiblePortalOptions(frame, field, 2_000);
    if (options.length && needsAutocompleteSettle) {
      await frame.waitForTimeout(250);
      options = await waitForVisiblePortalOptions(frame, field, 500);
    }
  }

  if (!options.length) {
    throw new Error("The dropdown did not open, so ApplyPilot could not inspect the available options.");
  }

  const match = matchControlOption(field, options, value);
  if (!match) {
    throw new Error("No matching dropdown option found.");
  }

  await selectMatchedOption(frame, options, match.option);
  await finalizeSearchSelection(frame, field);
}

export async function fillAutocompleteControl(frame: Frame, field: DetectedField, value: string) {
  await fillCustomCombobox(frame, field, value);
}

export async function fillWorkdaySelect(frame: Frame, field: DetectedField, value: string) {
  await fillCustomCombobox(frame, field, value);
}
