import type { Frame, Page } from "playwright";

import {
  DetectedField,
  FieldCommitState,
  HighestEducationLevel,
  SecurityClearanceLevel,
  WorkAuthorizationCategory
} from "@/types";

import {
  matchBooleanOption,
  matchEducationLevel,
  matchEeocVeteranOption,
  matchSecurityClearanceLevel,
  matchStructuredLocationOption,
  matchTextOption,
  matchWorkAuthorizationCategory
} from "@/lib/optionMatcher";
import { normalizeText } from "@/lib/utils";

type VerificationResult = {
  success: boolean;
  actualValue: string;
  message: string;
  commitState: FieldCommitState;
};

type ValidationSnapshot = {
  actualValue: string;
  actualLabel: string;
  actualWrapper: string;
  displayedValue: string;
  errorMessages: string[];
  ariaInvalid: boolean;
  controlInvalid: boolean;
  descriptorText: string[];
};

function valuesEquivalent(actual: string, expected: string) {
  const digitsOnly = (value: string) => value.replace(/\D/g, "");
  const actualDigits = digitsOnly(actual);
  const expectedDigits = digitsOnly(expected);
  if (actualDigits) {
    if (actualDigits === expectedDigits) {
      return true;
    }

    if (actualDigits.length === 10 && expectedDigits.length === 11 && expectedDigits.startsWith("1") && expectedDigits.slice(1) === actualDigits) {
      return true;
    }

    if (expectedDigits.length === 10 && actualDigits.length === 11 && actualDigits.startsWith("1") && actualDigits.slice(1) === expectedDigits) {
      return true;
    }
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
    const checked = await option
      .evaluate((element) => {
        const inputChecked = element instanceof HTMLInputElement ? element.checked : false;
        const wrapper = element.closest("[role='radio'], [role='checkbox']");
        const wrapperChecked =
          wrapper?.getAttribute("aria-checked") === "true" || wrapper?.getAttribute("aria-selected") === "true";
        return inputChecked || wrapperChecked;
      })
      .catch(() => false);
    const label = normalizeText(
      await option.evaluate((element) => {
        const explicitLabel =
          (element.getAttribute("id") && document.querySelector(`label[for="${element.getAttribute("id")}"]`)?.textContent) || "";
        const ownLabel = element.closest("label")?.textContent || "";
        const optionContainer =
          element.closest("[role='radio'], [role='checkbox']") ??
          element.closest("label") ??
          element.parentElement ??
          element;
        return (
          (explicitLabel || "").replace(/\s+/g, " ").trim() ||
          (ownLabel || "").replace(/\s+/g, " ").trim() ||
          ((optionContainer.textContent || "") as string).replace(/\s+/g, " ").trim()
        );
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
      const explicitLabel =
        (option.getAttribute("id") && document.querySelector(`label[for="${option.getAttribute("id")}"]`)?.textContent) || "";
      const ownLabel = option.closest("label")?.textContent || "";
      const optionContainer =
        option.closest("[role='radio']") ??
        option.closest("label") ??
        option.parentElement ??
        option;
      const checked =
        option instanceof HTMLInputElement
          ? option.checked
          : option.getAttribute("aria-checked") === "true" || option.getAttribute("aria-selected") === "true";

      return {
        label:
          (explicitLabel || "").replace(/\s+/g, " ").trim() ||
          (ownLabel || "").replace(/\s+/g, " ").trim() ||
          (((optionContainer.textContent || "") as string).replace(/\s+/g, " ").trim()),
        checked
      };
    });
  }).catch(() => []);
}

function buildFailureResult(actualValue: string, commitState: FieldCommitState, message: string): VerificationResult {
  return {
    success: false,
    actualValue,
    commitState,
    message
  };
}

function doesActualMatchExpected(field: DetectedField, snapshot: Pick<ValidationSnapshot, "actualValue" | "actualLabel" | "actualWrapper" | "displayedValue">, expectedValue: string) {
  const actualOptions = [snapshot.displayedValue].filter(Boolean);
  const semanticMatch =
    (field.intent === "work_authorization_category"
      ? Boolean(
          matchWorkAuthorizationCategory(
            actualOptions,
            normalizeText(expectedValue).replace(/\s+/g, "_") as WorkAuthorizationCategory
          )
        )
      : false) ||
    (field.intent === "security_clearance_level"
      ? Boolean(
          matchSecurityClearanceLevel(
            actualOptions,
            normalizeText(expectedValue).replace(/\s+/g, "_") as SecurityClearanceLevel
          )
        )
      : false) ||
    (field.intent === "education_highest_completed" || field.intent === "education_highest_attended"
      ? Boolean(matchEducationLevel(actualOptions, expectedValue as HighestEducationLevel))
      : false) ||
    (field.intent === "graduated_question" ||
    field.intent === "previous_employment" ||
    field.intent === "eeoc_race" ||
    field.intent === "eeoc_disability"
      ? expectedValue === "yes" || expectedValue === "no"
        ? Boolean(
            matchBooleanOption({
              questionText: field.questionText || field.label,
              options: actualOptions,
              answer: expectedValue as "yes" | "no",
              intent: field.intent
            })
          )
        : false
      : false) ||
    (field.intent === "phone_country_code"
      ? normalizeText(snapshot.displayedValue).includes(normalizeText(expectedValue)) ||
        normalizeText(snapshot.displayedValue).includes("+1")
      : false) ||
    (field.intent === "eeoc_gender" ? Boolean(matchTextOption(actualOptions, expectedValue)) : false) ||
    (field.intent === "eeoc_veteran" ? Boolean(matchEeocVeteranOption(actualOptions, expectedValue)) : false);

  return (
    (["city", "location", "full_location"].includes(field.intent)
      ? Boolean(matchStructuredLocationOption([snapshot.displayedValue], expectedValue))
      : false) ||
    semanticMatch ||
    valuesEquivalent(snapshot.actualValue, expectedValue) ||
    valuesEquivalent(snapshot.actualLabel, expectedValue) ||
    valuesEquivalent(snapshot.actualWrapper, expectedValue) ||
    normalizeText(snapshot.actualValue).includes(normalizeText(expectedValue)) ||
    normalizeText(snapshot.actualLabel).includes(normalizeText(expectedValue)) ||
    normalizeText(snapshot.actualWrapper).includes(normalizeText(expectedValue))
  );
}

async function readValidationSnapshot(pageOrFrame: Page | Frame, field: DetectedField): Promise<ValidationSnapshot> {
  const locator = pageOrFrame.locator(field.selector).first();
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

  const actualValue = await locator.inputValue().catch(async () => normalize((await locator.textContent().catch(() => "")) || ""));
  const actualLabel = await locator
    .evaluate((element) => {
      const wrapper =
        element.closest(".select__container, .select-shell, .field, .form-field, .form-group, .application-question") ??
        element.parentElement;
      if (element instanceof HTMLSelectElement) {
        return element.selectedOptions?.[0]?.textContent?.trim() ?? "";
      }
      return (
        (wrapper?.querySelector(".select__single-value")?.textContent || "").trim() ||
        (wrapper?.querySelector("#aria-selection")?.textContent || "")
          .replace(/^option\s+/i, "")
          .replace(/,\s*selected\.?/i, "")
          .trim()
      );
    })
    .catch(() => "");
  const actualWrapper = await locator
    .evaluate((element) => {
      const wrapper =
        element.closest(
          [
            "[data-applypilot-group-id]",
            "fieldset",
            ".application-question",
            ".form-field",
            ".form-group",
            ".field",
            "[role='group']",
            "[data-testid*='field']"
          ].join(", ")
        ) ?? element.parentElement;
      return (wrapper?.textContent || "").replace(/\s+/g, " ").trim();
    })
    .catch(() => "");
  const ariaInvalid = ((await locator.getAttribute("aria-invalid").catch(() => null)) ?? "") === "true";
  const controlValidation = await locator
    .evaluate((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) {
        return {
          controlInvalid: false,
          validationMessage: ""
        };
      }

      return {
        controlInvalid: !element.checkValidity(),
        validationMessage: element.validationMessage || ""
      };
    })
    .catch(() => ({
      controlInvalid: false,
      validationMessage: ""
    }));
  const describedByIds = (((await locator.getAttribute("aria-describedby").catch(() => null)) ?? "") as string)
    .split(/\s+/)
    .map((id) => id.trim())
    .filter(Boolean);
  const descriptorText = (
    await Promise.all(
      describedByIds.map((id) =>
        locator
          .evaluate((element, describedById) => {
            const candidate = document.getElementById(describedById);
            if (!candidate) return "";
            const style = candidate instanceof HTMLElement ? window.getComputedStyle(candidate) : null;
            const rect = candidate instanceof HTMLElement ? candidate.getBoundingClientRect() : null;
            if (style && rect && (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0)) {
              return "";
            }
            return candidate.textContent || "";
          }, id)
          .catch(() => "")
      )
    )
  )
    .map(normalize)
    .filter(Boolean);
  const wrapperErrors = await locator
    .evaluate((element) => {
      const normalizeInner = (value: string) => value.replace(/\s+/g, " ").trim();
      const wrapper =
        element.closest(
          [
            "[data-applypilot-group-id]",
            "fieldset",
            ".application-question",
            ".form-field",
            ".form-group",
            ".field",
            "[role='group']",
            "[data-testid*='field']"
          ].join(", ")
        ) ?? element.parentElement;
      if (!wrapper) return [];

      return Array.from(
        wrapper.querySelectorAll(
          [
            "[role='alert']",
            "[aria-live='polite']",
            "[aria-live='assertive']",
            ".error",
            ".errors",
            ".field-error",
            ".validation-error",
            ".input-error",
            ".invalid-feedback",
            "[data-testid*='error']",
            "[data-qa*='error']"
          ].join(", ")
        )
      )
        .filter((candidate) => {
          if (!(candidate instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(candidate);
          const rect = candidate.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((candidate) => normalizeInner(candidate.textContent || ""))
        .filter(Boolean);
    })
    .catch(() => []);
  const errorMessages = Array.from(
    new Set(
      [...descriptorText, ...wrapperErrors, normalize(controlValidation.validationMessage || "")]
        .map(normalize)
        .filter(Boolean)
    )
  );

  return {
    actualValue: normalize(actualValue || ""),
    actualLabel: normalize(actualLabel || ""),
    actualWrapper: normalize(actualWrapper || ""),
    displayedValue: normalize(actualLabel || actualValue || actualWrapper || ""),
    errorMessages,
    ariaInvalid,
    controlInvalid: controlValidation.controlInvalid,
    descriptorText
  };
}

async function settleFieldCommitState(pageOrFrame: Page | Frame, selector: string) {
  const locator = pageOrFrame.locator(selector).first();

  await locator
    .evaluate((element) => {
      if (!(element instanceof HTMLElement)) return;
      element.blur();
      const form =
        element.closest("form") ??
        element.closest(".application-question, .form-field, .form-group, .fieldset, fieldset");
      if (form instanceof HTMLElement) {
        form.dispatchEvent(new Event("change", { bubbles: true }));
      }
    })
    .catch(() => undefined);

  await pageOrFrame.waitForTimeout(120);
}

async function verifyUploadValue(pageOrFrame: Page | Frame, field: DetectedField, expectedValue: string): Promise<VerificationResult> {
  const locator = pageOrFrame.locator(field.selector).first();
  const expectedFileName = expectedValue.split("/").pop() || expectedValue.split("\\").pop() || expectedValue;
  const normalizedExpected = normalizeText(expectedFileName);
  const locatedUploadState = await locator
    .evaluate((element) => {
      const normalizeInner = (value: string) => value.replace(/\s+/g, " ").trim();
      const isVisible = (candidate: Element | null) => {
        if (!(candidate instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(candidate);
        const rect = candidate.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const wrapper =
        element.closest(
          [
            "[data-applypilot-group-id]",
            "fieldset",
            ".application-question",
            ".form-field",
            ".form-group",
            ".field",
            "[role='group']",
            "[data-testid*='field']"
          ].join(", ")
        ) ?? element.parentElement;
      const localInputs = Array.from((wrapper ?? document).querySelectorAll("input[type='file']"));
      const pageInputs = localInputs.length ? localInputs : Array.from(document.querySelectorAll("input[type='file']"));
      const fileNames = pageInputs
        .map((input) => Array.from((input as HTMLInputElement).files ?? []).map((file) => file.name))
        .flat()
        .filter(Boolean);
      const visibleText = [
        normalizeInner((element.textContent || "").trim()),
        normalizeInner((wrapper?.textContent || "").trim()),
        ...Array.from(document.querySelectorAll("label[for], [role='alert'], .uploaded-file, .file-name, .attachment-name"))
          .filter((candidate) => isVisible(candidate))
          .map((candidate) => normalizeInner(candidate.textContent || ""))
      ]
        .filter(Boolean)
        .join(" ");

      return {
        fileNames,
        visibleText
      };
    })
    .catch(() => ({
      fileNames: [] as string[],
      visibleText: ""
    }));
  const bodyText = await pageOrFrame.locator("body").innerText().catch(() => "");
  const matchedFile = locatedUploadState.fileNames.find((name) => normalizeText(name).includes(normalizedExpected)) || "";
  const pageShowsFileName =
    normalizeText(locatedUploadState.visibleText).includes(normalizedExpected) || normalizeText(bodyText).includes(normalizedExpected);

  return {
    success: Boolean(matchedFile || pageShowsFileName),
    actualValue: matchedFile || (pageShowsFileName ? expectedFileName : ""),
    commitState: matchedFile || pageShowsFileName ? "committed" : "unresolved",
    message: matchedFile || pageShowsFileName ? "File upload verified and committed." : "File upload could not be verified."
  };
}

export async function verifyFilledValue(pageOrFrame: Page | Frame, field: DetectedField, expectedValue: string): Promise<VerificationResult> {
  const locator = pageOrFrame.locator(field.selector).first();
  const type = field.type;

  if (field.intent === "resume_upload" || field.intent === "cover_letter_upload") {
    if (type === "file") {
      const fileName = await locator
        .evaluate((element) => {
          if (!(element instanceof HTMLInputElement)) return "";
          return element.files?.[0]?.name ?? element.value;
        })
        .catch(() => "");
      const expectedFileName = expectedValue.split("/").pop() || expectedValue.split("\\").pop() || expectedValue;
      const bodyText = await pageOrFrame.locator("body").innerText().catch(() => "");
      const fileNameVisibleOnPage = normalizeText(bodyText).includes(normalizeText(expectedFileName));
      return {
        success: normalizeText(fileName).includes(normalizeText(expectedFileName)) || fileNameVisibleOnPage,
        actualValue: fileName || (fileNameVisibleOnPage ? expectedFileName : ""),
        commitState: fileName || fileNameVisibleOnPage ? "committed" : "unresolved",
        message: fileName || fileNameVisibleOnPage ? "File upload verified and committed." : "File upload could not be verified."
      };
    }

    return verifyUploadValue(pageOrFrame, field, expectedValue);
  }

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
        commitState: success ? "committed" : "unresolved",
        message: success ? "Checkbox group verified and committed." : "Checkbox group did not match the intended answer."
      };
    }

    const checked = await locator.isChecked().catch(() => false);
    const shouldBeChecked = ["yes", "true", "1", "checked"].includes(normalizeText(expectedValue));
    return {
      success: checked === shouldBeChecked,
      actualValue: checked ? "checked" : "unchecked",
      commitState: checked === shouldBeChecked ? "committed" : "unresolved",
      message: checked === shouldBeChecked ? "Checkbox state verified and committed." : "Checkbox state did not match the intended answer."
    };
  }

  if (type === "radio") {
    if ((field.selectOptions?.length ?? 0) > 1) {
      let states = field.name ? await readGroupedChoiceState(pageOrFrame, field, "radio") : await readNamelessRadioState(pageOrFrame, field);
      if (!states.some((state) => state.checked)) {
        const wrapperStates = await readNamelessRadioState(pageOrFrame, field);
        if (wrapperStates.length) {
          states = wrapperStates;
        }
      }
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
        commitState: success ? "committed" : "unresolved",
        message: success ? "Radio selection verified and committed." : "Radio selection could not be verified."
      };
    }

    const checked = await locator.isChecked().catch(() => false);
    return {
      success: checked,
      actualValue: checked ? expectedValue : "",
      commitState: checked ? "committed" : "unresolved",
      message: checked ? "Radio selection verified and committed." : "Radio selection could not be verified."
    };
  }

  const firstSnapshot = await readValidationSnapshot(pageOrFrame, field);
  await settleFieldCommitState(pageOrFrame, field.selector);
  const secondSnapshot = await readValidationSnapshot(pageOrFrame, field);
  await pageOrFrame.waitForTimeout(120);
  const thirdSnapshot = await readValidationSnapshot(pageOrFrame, field);

  const initiallyMatched = doesActualMatchExpected(field, firstSnapshot, expectedValue);
  const matchedAfterBlur = doesActualMatchExpected(field, secondSnapshot, expectedValue);
  const matchedAfterRescan = doesActualMatchExpected(field, thirdSnapshot, expectedValue);
  const hasValidationError =
    secondSnapshot.ariaInvalid ||
    secondSnapshot.controlInvalid ||
    thirdSnapshot.ariaInvalid ||
    thirdSnapshot.controlInvalid ||
    secondSnapshot.errorMessages.some((message) => /required|select|enter|valid|invalid|complete/i.test(message)) ||
    thirdSnapshot.errorMessages.some((message) => /required|select|enter|valid|invalid|complete/i.test(message));

  if (matchedAfterRescan && !hasValidationError) {
    return {
      success: true,
      actualValue: thirdSnapshot.displayedValue,
      commitState: "committed",
      message: "Value verified and committed."
    };
  }

  if ((initiallyMatched || matchedAfterBlur) && !matchedAfterRescan) {
    return buildFailureResult(
      thirdSnapshot.displayedValue || secondSnapshot.displayedValue || firstSnapshot.displayedValue,
      "value_reverted",
      "The field showed the intended value briefly, but it reverted before the form accepted it."
    );
  }

  if ((matchedAfterBlur || matchedAfterRescan) && hasValidationError) {
    return buildFailureResult(
      thirdSnapshot.displayedValue || secondSnapshot.displayedValue || firstSnapshot.displayedValue,
      "validation_error_remains",
      "The field still showed a validation error after ApplyPilot filled it."
    );
  }

  if (initiallyMatched || matchedAfterBlur || matchedAfterRescan) {
    return buildFailureResult(
      thirdSnapshot.displayedValue || secondSnapshot.displayedValue || firstSnapshot.displayedValue,
      "visually_present_but_uncommitted",
      "The value appeared on the page, but the form did not commit it."
    );
  }

  return buildFailureResult(
    thirdSnapshot.displayedValue || secondSnapshot.displayedValue || firstSnapshot.displayedValue,
    "unresolved",
    "The page did not display the intended value."
  );
}
