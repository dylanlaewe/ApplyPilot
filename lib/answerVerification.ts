import type { Frame, Page } from "playwright";

import { DetectedField, HighestEducationLevel, SecurityClearanceLevel, WorkAuthorizationCategory } from "@/types";

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

function valuesEquivalent(actual: string, expected: string) {
  const digitsOnly = (value: string) => value.replace(/\D/g, "");
  if (digitsOnly(actual) && digitsOnly(actual) === digitsOnly(expected)) {
    return true;
  }
  return normalizeText(actual) === normalizeText(expected);
}

function escapeAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function readGroupedChoiceState(pageOrFrame: Page | Frame, field: DetectedField, type: "checkbox" | "radio") {
  if (!field.name) return [];

  const locator = pageOrFrame.locator(`${type === "checkbox" ? 'input[type="checkbox"]' : 'input[type="radio"]'}[name="${escapeAttributeValue(field.name)}"]`);
  const count = await locator.count().catch(() => 0);
  const states: Array<{ label: string; checked: boolean }> = [];

  for (let index = 0; index < count; index += 1) {
    const option = locator.nth(index);
    const checked = await option.isChecked().catch(() => false);
    const label = normalizeText(
      await option.evaluate((element) => {
        const linkedLabel =
          (element.getAttribute("id") && document.querySelector(`label[for="${element.getAttribute("id")}"]`)?.textContent) ||
          element.closest("label")?.textContent ||
          "";
        return linkedLabel;
      })
    );
    states.push({ label, checked });
  }

  return states;
}

async function readNamelessRadioState(pageOrFrame: Page | Frame, field: DetectedField) {
  return pageOrFrame.locator(field.selector).first().evaluate((element) => {
    const container =
      element.closest("[data-applypilot-group-id], fieldset, [role='radiogroup'], [role='group'], .application-question, .form-field, .form-group") ??
      element.parentElement;
    if (!container) return [];

    return Array.from(container.querySelectorAll("input[type='radio'], [role='radio']")).map((option) => {
      const linkedLabel =
        (option.getAttribute("id") && document.querySelector(`label[for="${option.getAttribute("id")}"]`)?.textContent) ||
        option.closest("label")?.textContent ||
        option.parentElement?.textContent ||
        "";
      const checked =
        option instanceof HTMLInputElement
          ? option.checked
          : option.getAttribute("aria-checked") === "true" || option.getAttribute("aria-selected") === "true";

      return {
        label: linkedLabel.replace(/\s+/g, " ").trim(),
        checked
      };
    });
  }).catch(() => []);
}

export async function verifyFilledValue(pageOrFrame: Page | Frame, field: DetectedField, expectedValue: string) {
  const locator = pageOrFrame.locator(field.selector).first();
  const type = field.type;

  if (type === "checkbox") {
    if (field.name && (field.selectOptions?.length ?? 0) > 1) {
      const states = await readGroupedChoiceState(pageOrFrame, field, "checkbox");
      const checkedLabels = states.filter((state) => state.checked).map((state) => state.label);
      const expectedParts = expectedValue
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      const options = states.map((state) => state.label);
      const matchedExpected = expectedParts
        .map((part) =>
          (part === "yes" || part === "no"
            ? matchBooleanOption({
                questionText: field.questionText || field.label,
                options,
                answer: part as "yes" | "no",
                intent: field.intent
              })
            : null) ?? matchTextOption(options, part, "Matched checkbox option.")
        )
        .map((match) => match?.option || "")
        .filter(Boolean);

      const success = Boolean(matchedExpected.length) && matchedExpected.every((label) => checkedLabels.some((checked) => valuesEquivalent(checked, label)));
      return {
        success,
        actualValue: checkedLabels.join(", "),
        message: success ? "Checkbox group verified." : "Checkbox group did not match the intended answer."
      };
    }

    const checked = await locator.isChecked().catch(() => false);
    const shouldBeChecked = ["yes", "true", "1", "checked"].includes(normalizeText(expectedValue));
    return {
      success: checked === shouldBeChecked,
      actualValue: checked ? "checked" : "unchecked",
      message: checked === shouldBeChecked ? "Checkbox state verified." : "Checkbox state did not match the intended answer."
    };
  }

  if (type === "radio") {
    if ((field.selectOptions?.length ?? 0) > 1) {
      const states = field.name ? await readGroupedChoiceState(pageOrFrame, field, "radio") : await readNamelessRadioState(pageOrFrame, field);
      const options = states.map((state) => state.label);
      const matchedExpected =
        (expectedValue === "yes" || expectedValue === "no"
          ? matchBooleanOption({
              questionText: field.questionText || field.label,
              options,
              answer: expectedValue as "yes" | "no",
              intent: field.intent
            })
          : null) ?? matchTextOption(options, expectedValue, "Matched radio option.");
      const selected = states.find((state) => state.checked)?.label || "";
      const matchedOption = matchedExpected?.option || "";
      const success = Boolean(matchedOption) && valuesEquivalent(selected, matchedOption);
      return {
        success,
        actualValue: selected,
        message: success ? "Radio selection verified." : "Radio selection could not be verified."
      };
    }

    const checked = await locator.isChecked().catch(() => false);
    return {
      success: checked,
      actualValue: checked ? expectedValue : "",
      message: checked ? "Radio selection verified." : "Radio selection could not be verified."
    };
  }

  if (type === "file") {
    const fileName = await locator
      .evaluate((element) => {
        if (!(element instanceof HTMLInputElement)) return "";
        return element.files?.[0]?.name ?? element.value;
      })
      .catch(() => "");
    const expectedFileName = expectedValue.split("/").pop() || expectedValue.split("\\").pop() || expectedValue;
    const bodyText = await pageOrFrame.locator("body").innerText().catch(() => "");
    const localErrorText = await locator
      .evaluate((element) => {
        const container =
          element.closest("[data-automation-id='formField'], [data-automation-id='formSection'], .application-question, .form-field, .form-group, .field-wrapper") ??
          element.parentElement;
        return (container?.textContent || "").replace(/\s+/g, " ").trim();
      })
      .catch(() => "");
    const fileNameVisibleOnPage = normalizeText(bodyText).includes(normalizeText(expectedFileName));
    const errorVisible = /upload failed|unable to upload|invalid file|error/i.test(localErrorText);
    return {
      success: !errorVisible && (normalizeText(fileName).includes(normalizeText(expectedFileName)) || fileNameVisibleOnPage),
      actualValue: fileName || (fileNameVisibleOnPage ? expectedFileName : ""),
      message: errorVisible
        ? "The page showed an upload error."
        : fileName || fileNameVisibleOnPage
          ? "File upload verified."
          : "File upload could not be verified."
    };
  }

  const actual = await locator.evaluate((element) => {
    if (element instanceof HTMLSelectElement) {
      const selectedOption = element.selectedOptions?.[0];
      return {
        value: element.value ?? "",
        label: selectedOption?.textContent?.trim() ?? "",
        wrapperText: ""
      };
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const wrapper =
        element.closest(".select__container, .select-shell, .field, .form-field, .form-group, .application-question") ?? element.parentElement;
      const selectedText =
        (wrapper?.querySelector(".select__single-value")?.textContent || "").trim() ||
        (wrapper?.querySelector("#aria-selection")?.textContent || "").replace(/^option\s+/i, "").replace(/,\s*selected\.?/i, "").trim();
      return {
        value: element.value ?? "",
        label: selectedText,
        wrapperText: (wrapper?.textContent || "").replace(/\s+/g, " ").trim()
      };
    }
    if (element instanceof HTMLElement) {
      return {
        value: element.innerText || element.textContent || "",
        label: "",
        wrapperText: ""
      };
    }
    return {
      value: "",
      label: "",
      wrapperText: ""
    };
  });

  const actualValue = actual.value;
  const actualLabel = actual.label;
  const actualWrapper = actual.wrapperText || "";
  const actualDisplay = actualLabel || actualValue || actualWrapper;
  const actualOptions = [actualDisplay].filter(Boolean);
  const exactMatchRequired = requiresExactOptionMatch(field.intent);
  const exactDisplayMatch =
    valuesEquivalent(actualValue, expectedValue) || valuesEquivalent(actualLabel, expectedValue) || valuesEquivalent(actualWrapper, expectedValue);
  const semanticMatch =
    (field.intent === "work_authorization_category"
      ? Boolean(matchWorkAuthorizationCategory(actualOptions, normalizeText(expectedValue).replace(/\s+/g, "_") as WorkAuthorizationCategory))
      : false) ||
    (field.intent === "security_clearance_level"
      ? Boolean(matchSecurityClearanceLevel(actualOptions, normalizeText(expectedValue).replace(/\s+/g, "_") as SecurityClearanceLevel))
      : false) ||
    (field.intent === "education_highest_completed" || field.intent === "education_highest_attended"
      ? Boolean(matchEducationLevel(actualOptions, expectedValue as HighestEducationLevel))
      : false) ||
    (field.intent === "education_degree"
      ? Boolean(matchEducationDegreeOption(actualOptions, expectedValue))
      : false) ||
    (field.intent === "education_major"
      ? Boolean(matchFieldOfStudyOption(actualOptions, expectedValue))
      : false) ||
    (field.intent === "graduated_question" || field.intent === "previous_employment" || field.intent === "eeoc_race" || field.intent === "eeoc_disability"
      ? (expectedValue === "yes" || expectedValue === "no")
        ? Boolean(matchBooleanOption({ questionText: field.questionText || field.label, options: actualOptions, answer: expectedValue as "yes" | "no", intent: field.intent }))
        : false
      : false) ||
    (field.intent === "phone_country_code"
      ? normalizeText(actualDisplay).includes(normalizeText(expectedValue)) || normalizeText(actualDisplay).includes("+1")
      : false) ||
    (field.intent === "eeoc_gender"
      ? Boolean(matchTextOption(actualOptions, expectedValue))
      : false) ||
    (field.intent === "eeoc_veteran"
      ? Boolean(matchEeocVeteranOption(actualOptions, expectedValue))
      : false);

  const success = exactMatchRequired
    ? exactDisplayMatch
    : (
    (["city", "location", "full_location"].includes(field.intent)
      ? Boolean(matchStructuredLocationOption([actualDisplay], expectedValue))
      : false) ||
    semanticMatch ||
    exactDisplayMatch ||
    (normalizeText(actualValue).includes(normalizeText(expectedValue)) ||
      normalizeText(actualLabel).includes(normalizeText(expectedValue)) ||
      normalizeText(actualWrapper).includes(normalizeText(expectedValue))));

  return {
    success,
    actualValue: actualDisplay,
    message: success ? "Value verified." : "The page did not display the intended value."
  };
}
