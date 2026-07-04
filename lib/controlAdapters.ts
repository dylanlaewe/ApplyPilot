import type { Frame } from "playwright";

import { HighestEducationLevel, SecurityClearanceLevel, WorkAuthorizationCategory, DetectedField } from "@/types";

import {
  matchBooleanOption,
  matchEducationDegreeOption,
  matchEducationLevel,
  matchEeocVeteranOption,
  matchFieldOfStudyOption,
  matchSecurityClearanceLevel,
  matchStructuredLocationOption,
  matchTextOption,
  matchWorkAuthorizationCategory
} from "@/lib/optionMatcher";
import { requiresExactOptionMatch } from "@/lib/safety";
import { normalizeText } from "@/lib/utils";

type ControlOption = {
  selector: string;
  text: string;
};

export type FillInteractionTelemetry = {
  focusChangeCount: number;
  dropdownOpenAttempts: number;
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
  return exact.label || exact.value;
}

type DropdownContext = {
  triggerSelector: string;
  triggerControlsId: string;
  triggerLabelledBy: string;
  triggerAutomationId: string;
  triggerText: string;
  triggerTop: number;
};

async function buildDropdownContext(frame: Frame, field: DetectedField): Promise<DropdownContext> {
  return frame.evaluate((selector) => {
    const target = document.querySelector(selector);
    if (!(target instanceof HTMLElement)) {
      return {
        triggerSelector: selector,
        triggerControlsId: "",
        triggerLabelledBy: "",
        triggerAutomationId: "",
        triggerText: "",
        triggerTop: 0
      };
    }

    const trigger =
      target.matches("button, input, [role='combobox'], [aria-haspopup='listbox']")
        ? target
        : (target.querySelector("button, input, [role='combobox'], [aria-haspopup='listbox']") as HTMLElement | null) ?? target;

    if (!trigger.getAttribute("data-applypilot-trigger-id")) {
      trigger.setAttribute("data-applypilot-trigger-id", `applypilot-trigger-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`);
    }

    return {
      triggerSelector: `[data-applypilot-trigger-id="${trigger.getAttribute("data-applypilot-trigger-id")}"]`,
      triggerControlsId: trigger.getAttribute("aria-controls") || target.getAttribute("aria-controls") || "",
      triggerLabelledBy: trigger.getAttribute("aria-labelledby") || target.getAttribute("aria-labelledby") || "",
      triggerAutomationId: trigger.getAttribute("data-automation-id") || target.getAttribute("data-automation-id") || "",
      triggerText: (trigger.textContent || target.textContent || "").replace(/\s+/g, " ").trim(),
      triggerTop: Math.round(trigger.getBoundingClientRect().top + window.scrollY)
    };
  }, field.selector);
}

async function visiblePortalOptions(frame: Frame, context?: DropdownContext) {
  return frame.evaluate((dropdownContext) => {
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

    const visibleCandidates = candidates
      .filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element, index) => {
        const id = element.getAttribute("data-applypilot-option-id") || `applypilot-option-${index}`;
        element.setAttribute("data-applypilot-option-id", id);
        const owner =
          element.closest('[role="listbox"], [role="menu"], [data-automation-id="menu"], [data-automation-id="promptPopup"]') || element.parentElement;
        return {
          selector: `[data-applypilot-option-id="${id}"]`,
          text: (element.textContent || "").replace(/\s+/g, " ").trim(),
          ownerId: owner?.getAttribute("id") || "",
          ownerAutomationId: owner?.getAttribute("data-automation-id") || "",
          ownerLabelledBy: owner?.getAttribute("aria-labelledby") || "",
          ownerTop: owner instanceof HTMLElement ? Math.round(owner.getBoundingClientRect().top + window.scrollY) : 0
        };
      })
      .filter((item) => item.text);

    if (!dropdownContext) {
      return visibleCandidates;
    }

    const filtered = visibleCandidates.filter((option) => {
      if (dropdownContext.triggerControlsId && option.ownerId === dropdownContext.triggerControlsId) return true;
      if (dropdownContext.triggerAutomationId && option.ownerAutomationId === dropdownContext.triggerAutomationId) return true;
      if (dropdownContext.triggerLabelledBy && option.ownerLabelledBy.includes(dropdownContext.triggerLabelledBy)) return true;
      if (!dropdownContext.triggerControlsId && !dropdownContext.triggerAutomationId && !dropdownContext.triggerLabelledBy) {
        return Math.abs(option.ownerTop - dropdownContext.triggerTop) < 520;
      }
      return false;
    });

    return filtered.length ? filtered : visibleCandidates;
  }, context);
}

async function waitForVisiblePortalOptions(frame: Frame, context?: DropdownContext, timeoutMs = 3_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const options = await visiblePortalOptions(frame, context);
    if (options.length) {
      return options;
    }
    await frame.waitForTimeout(100);
  }

  return [];
}

async function openControl(frame: Frame, field: DetectedField, telemetry?: FillInteractionTelemetry) {
  const locator = frame.locator(field.selector).first();
  const context = await buildDropdownContext(frame, field);
  telemetry && (telemetry.dropdownOpenAttempts += 1);
  await locator.click({ timeout: 10_000 }).catch(async () => {
    const nestedTrigger = locator.locator("button, input, [role='combobox'], [aria-haspopup='listbox']").first();
    if ((await nestedTrigger.count().catch(() => 0)) > 0) {
      await nestedTrigger.click({ timeout: 10_000 });
      return;
    }
    throw new Error("The dropdown did not open, so ApplyPilot could not inspect the available options.");
  });

  let options = await waitForVisiblePortalOptions(frame, context, 1_000);
  if (options.length) return { options, context };

  await locator.press("ArrowDown").catch(() => undefined);
  options = await waitForVisiblePortalOptions(frame, context, 1_000);
  if (options.length) return { options, context };

  const nestedTrigger = locator.locator("button, input, [role='combobox'], [aria-haspopup='listbox']").first();
  if ((await nestedTrigger.count().catch(() => 0)) > 0) {
    telemetry && (telemetry.dropdownOpenAttempts += 1);
    await nestedTrigger.press("ArrowDown").catch(() => undefined);
    options = await waitForVisiblePortalOptions(frame, context, 1_000);
    if (options.length) return { options, context };
  }

  await locator.press(" ").catch(() => undefined);
  options = await waitForVisiblePortalOptions(frame, context, 1_000);
  if (options.length) return { options, context };

  await locator.press("Enter").catch(() => undefined);
  return { options: await waitForVisiblePortalOptions(frame, context, 1_000), context };
}

async function typeSearchQuery(frame: Frame, field: DetectedField, value: string, telemetry?: FillInteractionTelemetry) {
  const searchValue =
    field.intent === "city" || field.intent === "location" || field.intent === "full_location"
      ? value.split(",")[0]?.trim() || value
      : value;
  const locator = frame.locator(field.selector).first();

  const tagName = await locator.evaluate((element) => element.tagName.toLowerCase()).catch(() => "div");
  if (tagName === "input" || tagName === "textarea") {
    telemetry && (telemetry.focusChangeCount += 1);
    await locator.fill("");
    await locator.fill(searchValue);
    return;
  }

  const nestedInput = locator.locator('input, textarea, [role="combobox"]').first();
  if ((await nestedInput.count()) > 0) {
    telemetry && (telemetry.focusChangeCount += 1);
    await nestedInput.fill("");
    await nestedInput.fill(searchValue);
  }
}

function matchControlOption(field: DetectedField, options: ControlOption[], value: string) {
  const texts = options.map((option) => option.text);
  const exactRequired = requiresExactOptionMatch(field.intent);

  switch (field.intent) {
    case "work_authorization_category":
      return (
        matchWorkAuthorizationCategory(texts, normalizeText(value).replace(/\s+/g, "_") as WorkAuthorizationCategory) ??
        (!exactRequired ? matchTextOption(texts, value, "Matched work authorization dropdown option.") : null)
      );
    case "security_clearance_level":
      return (
        matchSecurityClearanceLevel(texts, normalizeText(value).replace(/\s+/g, "_") as SecurityClearanceLevel) ??
        (!exactRequired ? matchTextOption(texts, value, "Matched security clearance dropdown option.") : null)
      );
    case "security_clearance_status":
    case "security_clearance_active":
      return exactRequired ? matchTextOption(texts, value, "Matched security clearance dropdown option.") : matchTextOption(texts, value);
    case "education_highest_completed":
    case "education_highest_attended":
      return (
        matchEducationLevel(texts, value as HighestEducationLevel) ??
        matchTextOption(texts, value, "Matched education dropdown option.")
      );
    case "education_degree":
      return matchEducationDegreeOption(texts, value) ?? matchTextOption(texts, value, "Matched degree dropdown option.");
    case "education_major":
      return matchFieldOfStudyOption(texts, value) ?? matchTextOption(texts, value, "Matched field-of-study dropdown option.");
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
      return exactRequired ? null : matchTextOption(texts, value, "Matched dropdown option.");
    case "eeoc_veteran":
      return matchEeocVeteranOption(texts, value);
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
  return matchedOption.text;
}

export async function fillCustomCombobox(frame: Frame, field: DetectedField, value: string, telemetry?: FillInteractionTelemetry) {
  const { options: initialOptions, context } = await openControl(frame, field, telemetry);
  let options = initialOptions;

  if (options.length) {
    const immediateMatch = matchControlOption(field, options, value);
    if (immediateMatch) {
      const matchedOption = await selectMatchedOption(frame, options, immediateMatch.option);
      await frame.waitForTimeout(150);
      return matchedOption;
    }
  }

  if (!options.length && (field.controlType === "aria_combobox" || field.controlType === "autocomplete" || field.role === "combobox")) {
    await typeSearchQuery(frame, field, value, telemetry);
    options = await waitForVisiblePortalOptions(frame, context, 2_000);
  }

  if (!options.length) {
    throw new Error("The dropdown did not open, so ApplyPilot could not inspect the available options.");
  }

  await typeSearchQuery(frame, field, value, telemetry);
  options = await waitForVisiblePortalOptions(frame, context, 2_000);
  const match = matchControlOption(field, options, value);
  if (!match) {
    throw new Error("No matching dropdown option found.");
  }

  const matchedOption = await selectMatchedOption(frame, options, match.option);
  await frame.waitForFunction(
    ({ triggerSelector, controlsId }) => {
      const trigger = document.querySelector(triggerSelector);
      const owned = controlsId ? document.getElementById(controlsId) : null;
      const triggerExpanded = trigger?.getAttribute("aria-expanded");
      const ownedVisible =
        owned instanceof HTMLElement
          ? (() => {
              const style = window.getComputedStyle(owned);
              const rect = owned.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
            })()
          : false;
      return triggerExpanded === "false" || !ownedVisible;
    },
    { triggerSelector: context.triggerSelector, controlsId: context.triggerControlsId },
    { timeout: 2_000 }
  ).catch(() => undefined);
  await frame.locator(field.selector).first().press("Escape").catch(() => undefined);
  return matchedOption;
}

export async function fillAutocompleteControl(frame: Frame, field: DetectedField, value: string, telemetry?: FillInteractionTelemetry) {
  return fillCustomCombobox(frame, field, value, telemetry);
}

export async function fillWorkdaySelect(frame: Frame, field: DetectedField, value: string, telemetry?: FillInteractionTelemetry) {
  return fillCustomCombobox(frame, field, value, telemetry);
}
