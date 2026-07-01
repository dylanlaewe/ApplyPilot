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
import { normalizeText } from "@/lib/utils";

type ControlOption = {
  selector: string;
  text: string;
};

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

async function visiblePortalOptions(frame: Frame) {
  return frame.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll(
        [
          '[role="option"]',
          '[role="listitem"]',
          '[data-automation-id="menuItem"]',
          '[data-automation-id="promptOption"]',
          '[data-radix-collection-item]',
          '[cmdk-item]',
          'li[aria-selected]',
          'button[role="option"]'
        ].join(", ")
      )
    );

    return candidates
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element, index) => {
        const id = element.getAttribute("data-applypilot-option-id") || `applypilot-option-${index}`;
        element.setAttribute("data-applypilot-option-id", id);
        return {
          selector: `[data-applypilot-option-id="${id}"]`,
          text: (element.textContent || "").replace(/\s+/g, " ").trim()
        };
      })
      .filter((item) => item.text);
  });
}

async function waitForVisiblePortalOptions(frame: Frame, timeoutMs = 3_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const options = await visiblePortalOptions(frame);
    if (options.length) {
      return options;
    }
    await frame.waitForTimeout(100);
  }

  return [];
}

async function openControl(frame: Frame, field: DetectedField) {
  const locator = frame.locator(field.selector).first();
  await locator.click({ timeout: 10_000 });

  let options = await waitForVisiblePortalOptions(frame, 750);
  if (options.length) return options;

  await locator.press("ArrowDown").catch(() => undefined);
  options = await waitForVisiblePortalOptions(frame, 750);
  if (options.length) return options;

  await locator.press(" ").catch(() => undefined);
  options = await waitForVisiblePortalOptions(frame, 750);
  if (options.length) return options;

  await locator.press("Enter").catch(() => undefined);
  return waitForVisiblePortalOptions(frame, 750);
}

async function typeSearchQuery(frame: Frame, field: DetectedField, value: string) {
  const searchValue =
    field.intent === "city" || field.intent === "location" || field.intent === "full_location"
      ? value.split(",")[0]?.trim() || value
      : value;
  const locator = frame.locator(field.selector).first();

  const tagName = await locator.evaluate((element) => element.tagName.toLowerCase()).catch(() => "div");
  if (tagName === "input" || tagName === "textarea") {
    await locator.fill("");
    await locator.fill(searchValue);
    return;
  }

  const nestedInput = locator.locator('input, textarea, [role="combobox"]').first();
  if ((await nestedInput.count()) > 0) {
    await nestedInput.fill("");
    await nestedInput.fill(searchValue);
  }
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
      return matchStructuredLocationOption(texts, value) ?? matchTextOption(texts, value, "Matched location autocomplete option.");
    default:
      return matchTextOption(texts, value, "Matched custom dropdown option.");
  }
}

async function selectMatchedOption(frame: Frame, options: ControlOption[], matchedText: string) {
  const matchedOption = options.find((option) => option.text === matchedText);
  if (!matchedOption) {
    throw new Error("No matching dropdown option found.");
  }

  await frame.locator(matchedOption.selector).click({ timeout: 10_000 });
}

export async function fillCustomCombobox(frame: Frame, field: DetectedField, value: string) {
  let options = await openControl(frame, field);

  if (options.length) {
    const immediateMatch = matchControlOption(field, options, value);
    if (immediateMatch) {
      await selectMatchedOption(frame, options, immediateMatch.option);
      return;
    }
  }

  if (!options.length && (field.controlType === "aria_combobox" || field.controlType === "autocomplete" || field.role === "combobox")) {
    await typeSearchQuery(frame, field, value);
    options = await waitForVisiblePortalOptions(frame, 2_000);
  }

  if (!options.length) {
    throw new Error("The dropdown did not open, so ApplyPilot could not inspect the available options.");
  }

  await typeSearchQuery(frame, field, value);
  options = await waitForVisiblePortalOptions(frame, 2_000);
  const match = matchControlOption(field, options, value);
  if (!match) {
    throw new Error("No matching dropdown option found.");
  }

  await selectMatchedOption(frame, options, match.option);
}

export async function fillAutocompleteControl(frame: Frame, field: DetectedField, value: string) {
  await fillCustomCombobox(frame, field, value);
}

export async function fillWorkdaySelect(frame: Frame, field: DetectedField, value: string) {
  await fillCustomCombobox(frame, field, value);
}
