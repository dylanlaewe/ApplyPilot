import type { Browser, BrowserContext, Frame, Page } from "playwright";

import { FINAL_SUBMIT_PATTERNS } from "@/lib/autofillRules";
import { verifyFilledValue } from "@/lib/answerVerification";
import { installBrowserOverlay } from "@/lib/browserOverlay";
import { evaluateVisibleFieldCandidates } from "@/lib/browserFieldScanner";
import { focusSessionPage, getOrCreateBrowserContext, getOrCreateSessionPage, getSessionPage } from "@/lib/browserManager";
import { fillAutocompleteControl, fillCustomCombobox, fillNativeSelect, fillWorkdaySelect, type FillInteractionTelemetry } from "@/lib/controlAdapters";
import { prepareLogicalFields } from "@/lib/fieldLabeling";
import { installPageActivityMonitor, waitForPageReadiness as waitForStablePage } from "@/lib/pageReadiness";
import { matchBooleanOption, matchTextOption } from "@/lib/optionMatcher";
import { isFinalSubmitLabel } from "@/lib/safety";
import { normalizeText } from "@/lib/utils";
import { CaptchaDetectionResult, CaptchaEvidence, DetectedField, RawScannedField } from "@/types";

type BrowserRuntime = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  sessionId: string;
};

const runtimeStore = globalThis as typeof globalThis & {
  __applyPilotGuardInstalledPages?: WeakSet<Page>;
};

const guardedPages = runtimeStore.__applyPilotGuardInstalledPages ?? new WeakSet<Page>();
runtimeStore.__applyPilotGuardInstalledPages = guardedPages;

async function getPlaywright() {
  return import("playwright");
}

function looksLikeInvisibleCaptchaFrame(descriptor: string, frameUrl: string) {
  return /size=invisible/i.test(frameUrl) || /invisible/i.test(descriptor) || /hcaptcha-enclave\.html#frame=enclave/i.test(frameUrl);
}

export function detectAtsProvider(url: string) {
  const normalized = url.toLowerCase();
  if (normalized.includes("greenhouse.io")) return "greenhouse";
  if (normalized.includes("lever.co")) return "lever";
  if (normalized.includes("ashbyhq.com")) return "ashby";
  if (normalized.includes("workable.com")) return "workable";
  if (normalized.includes("myworkdayjobs.com") || normalized.includes("workday")) return "workday";
  return "generic";
}

function escapeAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function installSubmissionGuard(page: Page) {
  if (guardedPages.has(page)) return;

  const guardScript = () => {
    const win = window as Window & { __applyPilotGuardInstalled?: boolean };
    if (win.__applyPilotGuardInstalled) return;
    win.__applyPilotGuardInstalled = true;

    document.addEventListener(
      "submit",
      (event) => {
        if (!event.isTrusted) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter") return;
        const target = event.target as HTMLElement | null;
        if (!target) return;
        const tag = target.tagName.toLowerCase();
        if (tag === "textarea") return;
        const form = target.closest("form");
        if (!form) return;
        event.stopPropagation();
      },
      true
    );
  };

  await page.addInitScript(guardScript);
  await page.evaluate(guardScript).catch(() => undefined);
  guardedPages.add(page);
}

export async function launchBrowserSession(
  url: string,
  sessionId: string,
  options: {
    navigate?: boolean;
    reuseOpenPage?: boolean;
  } = {}
) {
  const context = await getOrCreateBrowserContext();
  const page = await getOrCreateSessionPage(sessionId, {
    url,
    navigate: options.navigate,
    reuseOpenPage: options.reuseOpenPage
  });
  await installSubmissionGuard(page);
  await installPageActivityMonitor(page);
  await installBrowserOverlay(page);
  await focusSessionPage(sessionId);

  return { browser: context.browser() as Browser, context, page, sessionId };
}

export function getBrowserSession(sessionId: string) {
  const page = getSessionPage(sessionId);
  if (!page) return null;
  const context = page.context();
  return {
    browser: context.browser() as Browser,
    context,
    page,
    sessionId
  };
}

export async function detectCaptcha(page: Page): Promise<CaptchaDetectionResult> {
  const providerFromText = (value: string) => {
    const normalized = value.toLowerCase();
    if (normalized.includes("recaptcha") || normalized.includes("google.com/recaptcha")) return "recaptcha";
    if (normalized.includes("hcaptcha")) return "hcaptcha";
    if (normalized.includes("turnstile") || normalized.includes("cloudflare")) return "turnstile";
    if (normalized.includes("arkose") || normalized.includes("funcaptcha")) return "arkose";
    return "unknown";
  };

  const collectEvidence = async (
    selector: string,
    kind: CaptchaEvidence["kind"],
    reason: string,
    interactiveMode: "never" | "iframe" | "container" = "never"
  ): Promise<CaptchaEvidence[]> => {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    const evidence: CaptchaEvidence[] = [];

    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const descriptor = (
        await Promise.all([
          candidate.getAttribute("src").catch(() => ""),
          candidate.getAttribute("title").catch(() => ""),
          candidate.getAttribute("name").catch(() => ""),
          candidate.getAttribute("id").catch(() => ""),
          candidate.getAttribute("class").catch(() => ""),
          candidate.getAttribute("data-sitekey").catch(() => ""),
          candidate.getAttribute("aria-label").catch(() => ""),
          candidate.textContent().catch(() => "")
        ])
      )
        .filter(Boolean)
        .join(" ");

      const frameUrl = (await candidate.getAttribute("src").catch(() => "")) ?? "";
      const box = await candidate.boundingBox().catch(() => null);
      const visible = await candidate.isVisible().catch(() => false);
      const width = box?.width ?? 0;
      const height = box?.height ?? 0;
      const hasInteractiveChild =
        interactiveMode === "container"
          ? await candidate
              .evaluate((element) => {
                const looksLikeInvisibleFrame = (descriptor: string, frameUrl: string) =>
                  /size=invisible/i.test(frameUrl) || /invisible/i.test(descriptor);
                const isVisible = (candidateElement: Element) => {
                  const htmlElement = candidateElement as HTMLElement;
                  const style = window.getComputedStyle(htmlElement);
                  const rect = htmlElement.getBoundingClientRect();
                  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
                };

                return Array.from(
                  element.querySelectorAll('iframe, input[type="checkbox"], button, [role="checkbox"], [role="button"]')
                ).some((child) => {
                  if (!isVisible(child)) return false;
                  if (child instanceof HTMLIFrameElement) {
                    const descriptor = [
                      child.getAttribute("src") || "",
                      child.getAttribute("title") || "",
                      child.getAttribute("aria-label") || ""
                    ].join(" ");
                    return !looksLikeInvisibleFrame(descriptor, child.getAttribute("src") || "");
                  }
                  return true;
                });
              })
              .catch(() => false)
          : false;
      const interactive =
        visible &&
        (interactiveMode === "iframe"
          ? width >= 120 && height >= 30 && !/badge/i.test(descriptor) && !looksLikeInvisibleCaptchaFrame(descriptor, frameUrl)
          : interactiveMode === "container"
            ? hasInteractiveChild
            : false);

      evidence.push({
        kind,
        selector: (await candidate.getAttribute("id").catch(() => "")) ? `#${await candidate.getAttribute("id").catch(() => "")}` : `${kind}-${index}`,
        frameUrl: kind === "provider_iframe" ? frameUrl || undefined : undefined,
        visible,
        interactive,
        width,
        height,
        provider: providerFromText(descriptor),
        reason
      });
    }

    return evidence;
  };

  const [scripts, tokens, iframes, containers] = await Promise.all([
    collectEvidence(
      'script[src*="recaptcha" i], script[src*="hcaptcha" i], script[src*="turnstile" i], script[src*="cloudflare" i], script[src*="arkose" i], script[src*="funcaptcha" i]',
      "provider_script",
      "A CAPTCHA provider script is loaded, but scripts alone do not require user action."
    ),
    collectEvidence(
      'input[name*="captcha" i], textarea[name*="captcha" i], input[name*="g-recaptcha-response" i], textarea[name*="g-recaptcha-response" i], textarea[name*="h-captcha-response" i], input[name*="cf-turnstile-response" i], textarea[name*="cf-turnstile-response" i]',
      "token_field",
      "A hidden or passive CAPTCHA token field exists, which is only a background marker."
    ),
    collectEvidence(
      'iframe[src*="recaptcha" i], iframe[src*="hcaptcha" i], iframe[src*="turnstile" i], iframe[src*="cloudflare" i], iframe[src*="arkoselabs" i], iframe[src*="funcaptcha" i], iframe[title*="captcha" i], iframe[title*="robot" i]',
      "provider_iframe",
      "A CAPTCHA provider iframe is present.",
      "iframe"
    ),
    collectEvidence(
      '.g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey], [data-hcaptcha-widget-id], [data-turnstile-widget-id]',
      "provider_container",
      "A CAPTCHA-related container is present on the page.",
      "container"
    )
  ]);

  const evidence = [...scripts, ...tokens, ...iframes, ...containers];
  const visibleInteractiveEvidence = evidence.filter((item) => item.visible && item.interactive);

  if (visibleInteractiveEvidence.some((item) => item.kind === "provider_iframe" || item.kind === "provider_container")) {
    const primary = visibleInteractiveEvidence[0];
    return {
      status: "confirmed_visible_challenge",
      provider: primary?.provider ?? "unknown",
      evidence,
      blocking: true,
      userMessage: "Human verification appears to be visible in the application."
    };
  }

  if (evidence.length) {
    return {
      status: "background_marker",
      provider: evidence.find((item) => item.provider !== "unknown")?.provider ?? "unknown",
      evidence,
      blocking: false
    };
  }

  return {
    status: "none",
    evidence: [],
    blocking: false
  };
}

export async function detectFinalSubmitButtons(page: Page) {
  const buttons = await page.evaluate((patterns) => {
    return Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button']"))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element instanceof HTMLInputElement ? element.value : element.textContent || "").trim())
      .filter((label) => label)
      .filter((label) => {
        const normalized = label.toLowerCase();
        return patterns.some((pattern) => normalized.includes(pattern));
      });
  }, FINAL_SUBMIT_PATTERNS);

  return buttons;
}

function buildSelectorAttribute(index: number) {
  return `apf_${Date.now()}_${index}_${Math.floor(Math.random() * 10_000)}`;
}

export async function scanVisibleFields(page: Page): Promise<RawScannedField[]> {
  const frames = page.frames();
  const scannedFields: RawScannedField[] = [];

  for (const frame of frames) {
    const fields: RawScannedField[] = await evaluateVisibleFieldCandidates(frame, {
        prefix: buildSelectorAttribute(scannedFields.length),
        selectorAttribute: "data-applypilot-field-id",
        groupAttribute: "data-applypilot-group-id",
        url: frame.url(),
        name: frame.name() || ""
      }).catch(() => []);

    scannedFields.push(...fields);
  }

  return prepareLogicalFields(scannedFields).fields;
}

export async function waitForPageReadiness(page: Page) {
  await waitForStablePage(page);
}

function resolveFrame(page: Page, field: Pick<DetectedField, "frameUrl" | "frameName">): Frame {
  if (!field.frameUrl && !field.frameName) return page.mainFrame();

  const matched = page.frames().find((frame) => {
    if (field.frameUrl && frame.url() === field.frameUrl) return true;
    if (field.frameName && frame.name() === field.frameName) return true;
    return false;
  });

  return matched ?? page.mainFrame();
}

function fieldRecoveryKey(field: Pick<DetectedField, "domId" | "name" | "label" | "type" | "controlType">) {
  return [
    normalizeText(field.domId || ""),
    normalizeText(field.name || ""),
    normalizeText(field.label || ""),
    normalizeText(field.type || ""),
    normalizeText(field.controlType || "")
  ].join("::");
}

async function recoverFieldSelector(frame: Frame, field: DetectedField) {
  const rescanned = prepareLogicalFields(
    await evaluateVisibleFieldCandidates(frame, {
      prefix: buildSelectorAttribute(Date.now()),
      selectorAttribute: "data-applypilot-field-id",
      groupAttribute: "data-applypilot-group-id",
      url: frame.url(),
      name: frame.name() || ""
    }).catch(() => [])
  ).fields;

  const targetKey = fieldRecoveryKey(field);
  const exactMatch =
    rescanned.find((candidate) => fieldRecoveryKey({ ...candidate, controlType: candidate.controlType || "" } as DetectedField) === targetKey) ?? null;

  if (exactMatch) {
    field.selector = exactMatch.selector;
    return exactMatch.selector;
  }

  const labelMatch =
    rescanned.find(
      (candidate) =>
        normalizeText(candidate.label) === normalizeText(field.label) &&
        normalizeText(candidate.type) === normalizeText(field.type) &&
        normalizeText(candidate.controlType || "") === normalizeText(field.controlType || "")
    ) ?? null;

  if (labelMatch) {
    field.selector = labelMatch.selector;
    return labelMatch.selector;
  }

  return "";
}

async function highlightField(frame: Frame, selector: string) {
  await frame
    .evaluate((targetSelector) => {
      const element = document.querySelector(targetSelector);
      if (!(element instanceof HTMLElement)) return;
      element.style.outline = "2px solid #155eef";
      element.style.outlineOffset = "2px";
      element.style.backgroundColor = "rgba(21, 94, 239, 0.06)";
    }, selector)
    .catch(() => undefined);
}

export async function handleSelectDropdown(frame: Frame, selector: string, value: string) {
  return fillNativeSelect(frame, selector, value);
}

export async function handleRadioGroup(frame: Frame, field: DetectedField, value: string) {
  const normalizedTarget = normalizeText(value);
  const radioLocator = frame.locator(field.selector);
  const name = await radioLocator.getAttribute("name");

  if (name) {
    const group = frame.locator(`input[type="radio"][name="${name}"]`);
    const count = await group.count();

    for (let index = 0; index < count; index += 1) {
      const option = group.nth(index);
      const optionValue = normalizeText((await option.getAttribute("value")) ?? "");
      const optionLabel = normalizeText(
        await option.evaluate((element) => {
          const linkedLabel =
            (element.getAttribute("id") && document.querySelector(`label[for="${element.getAttribute("id")}"]`)?.textContent) ||
            element.closest("label")?.textContent ||
            "";
          return linkedLabel;
        })
      );

      if (optionValue === normalizedTarget || optionLabel === normalizedTarget || optionLabel.includes(normalizedTarget) || optionValue.includes(normalizedTarget)) {
        await option.check();
        return optionLabel || optionValue || value;
      }
    }
  }

  const radioOptions = await frame.evaluate(
    ({ selector }) => {
      const target = document.querySelector(selector);
      if (!target) return [];

      const container =
        target.closest("[data-applypilot-group-id], fieldset, [role='radiogroup'], [role='group'], .application-question, .form-field, .form-group") ??
        target.parentElement;
      if (!container) return [];

      return Array.from(container.querySelectorAll("input[type='radio'], [role='radio']")).map((element, index) => {
        const id = element.getAttribute("data-applypilot-radio-option-id") || `applypilot-radio-option-${index}`;
        element.setAttribute("data-applypilot-radio-option-id", id);
        const linkedLabel =
          (element.getAttribute("id") && document.querySelector(`label[for="${element.getAttribute("id")}"]`)?.textContent) ||
          element.closest("label")?.textContent ||
          (element.parentElement?.textContent ?? "") ||
          "";
        return {
          selector: `[data-applypilot-radio-option-id="${id}"]`,
          label: linkedLabel.replace(/\s+/g, " ").trim(),
          value: (element.getAttribute("value") || "").trim()
        };
      });
    },
    { selector: field.selector }
  );

  for (const option of radioOptions) {
    const optionValue = normalizeText(option.value);
    const optionLabel = normalizeText(option.label);
    if (optionValue === normalizedTarget || optionLabel === normalizedTarget || optionLabel.includes(normalizedTarget) || optionValue.includes(normalizedTarget)) {
      await frame.locator(option.selector).first().click({ timeout: 10_000, force: true });
      return option.label || option.value || value;
    }
  }

  throw new Error(name ? "No matching radio option found." : "Radio group is missing a usable selection target.");
}

export async function handleCheckbox(frame: Frame, selector: string, value: string) {
  const normalized = normalizeText(value);
  const shouldCheck = ["true", "yes", "1", "checked"].includes(normalized);
  const locator = frame.locator(selector);
  if (shouldCheck) {
    await locator.check();
  } else {
    await locator.uncheck();
  }
  return shouldCheck ? "checked" : "unchecked";
}

export async function handleCheckboxGroup(frame: Frame, field: DetectedField, value: string) {
  const name = field.name || (await frame.locator(field.selector).first().getAttribute("name")) || "";
  if (!name) {
    throw new Error("Checkbox group is missing a name attribute.");
  }

  const group = frame.locator(`input[type="checkbox"][name="${escapeAttributeValue(name)}"]`);
  const count = await group.count();
  if (!count) {
    throw new Error("Checkbox group options could not be found on the page.");
  }

  const options: Array<{ locatorIndex: number; label: string }> = [];
  for (let index = 0; index < count; index += 1) {
    const option = group.nth(index);
    const label = normalizeText(
      await option.evaluate((element) => {
        const linkedLabel =
          (element.getAttribute("id") && document.querySelector(`label[for="${element.getAttribute("id")}"]`)?.textContent) ||
          element.closest("label")?.textContent ||
          "";
        return linkedLabel;
      })
    );
    options.push({ locatorIndex: index, label });
  }

  const desiredValues = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const normalizedOptionLabels = options.map((option) => option.label);
  const matchedLabels = desiredValues
    .map((desiredValue) =>
      (desiredValue === "yes" || desiredValue === "no"
        ? matchBooleanOption({
            questionText: field.questionText || field.label,
            options: normalizedOptionLabels,
            answer: desiredValue as "yes" | "no",
            intent: field.intent
          })
        : null) ?? matchTextOption(normalizedOptionLabels, desiredValue, "Matched checkbox option.")
    )
    .map((match) => match?.option || "")
    .filter(Boolean);

  if (!matchedLabels.length) {
    throw new Error("No matching checkbox option found.");
  }

  const targetLabels = new Set(matchedLabels.map((label) => normalizeText(label)));
  for (const option of options) {
    const locator = group.nth(option.locatorIndex);
    if (targetLabels.has(normalizeText(option.label))) {
      await locator.check();
    } else if (await locator.isChecked().catch(() => false)) {
      await locator.uncheck().catch(() => undefined);
    }
  }
  return matchedLabels.join(", ");
}

async function resolveFileUploadLocator(frame: Frame, field: DetectedField) {
  const primary = frame.locator(field.selector).first();
  if ((await primary.count().catch(() => 0)) > 0) {
    return primary;
  }

  const candidate = frame.locator('input[type="file"]').first();
  if ((await candidate.count().catch(() => 0)) > 0) {
    return candidate;
  }

  return primary;
}

export async function handleFileUpload(frame: Frame, field: DetectedField, filePath: string) {
  const locator = await resolveFileUploadLocator(frame, field);
  await locator.setInputFiles(filePath);
  const expectedFileName = filePath.split("/").pop() || filePath.split("\\").pop() || filePath;

  await frame
    .waitForFunction(
      ({ selector, expected }) => {
        const target = document.querySelector(selector) as HTMLInputElement | null;
        const bodyText = (document.body.innerText || "").replace(/\s+/g, " ").trim().toLowerCase();
        const inputName = target?.files?.[0]?.name?.toLowerCase() || target?.value?.toLowerCase() || "";
        return inputName.includes(expected) || bodyText.includes(expected);
      },
      { selector: field.selector, expected: expectedFileName.toLowerCase() },
      { timeout: 4_000 }
    )
    .catch(() => undefined);

  return expectedFileName;
}

async function fillTextControl(frame: Frame, selector: string, value: string, telemetry?: FillInteractionTelemetry) {
  const locator = frame.locator(selector).first();
  try {
    await locator.evaluate((element, nextValue) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        throw new Error("The text field could not be updated directly.");
      }

      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      descriptor?.set?.call(element, nextValue);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
    }, value);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/intercepts pointer events|subtree intercepts pointer events/i.test(message)) {
      telemetry && (telemetry.focusChangeCount += 1);
      await locator.evaluate((element, nextValue) => {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
          throw new Error("The text field could not be focused for input.");
        }

        const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        descriptor?.set?.call(element, nextValue);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.focus();
      }, value);
      return;
    }
    try {
      telemetry && (telemetry.focusChangeCount += 1);
      await locator.fill(value);
      return;
    } catch {
      if (!(error instanceof Error)) {
        throw error;
      }
    }
    throw error;
  }
}

export async function fillField(page: Page, field: DetectedField, value: string, telemetry?: FillInteractionTelemetry) {
  if (!value.trim()) {
    throw new Error("No value provided for this field.");
  }

  const frame = resolveFrame(page, field);
  let locator = frame.locator(field.selector).first();

  if ((await locator.count()) === 0) {
    const recoveredSelector = await recoverFieldSelector(frame, field);
    if (recoveredSelector) {
      locator = frame.locator(recoveredSelector).first();
    }
  }

  if ((await locator.count()) === 0) {
    throw new Error("The field could not be found on the page. The form may have changed.");
  }

  const performFill = async () => {
    if (field.type === "select-one" || field.type === "select-multiple" || field.controlType === "native_select") {
      return handleSelectDropdown(frame, field.selector, value);
    } else if (field.type === "radio") {
      return handleRadioGroup(frame, field, value);
    } else if (field.type === "checkbox") {
      if ((field.selectOptions?.length ?? 0) > 1 && field.name) {
        return handleCheckboxGroup(frame, field, value);
      } else {
        return handleCheckbox(frame, field.selector, value);
      }
    } else if (field.type === "file") {
      return handleFileUpload(frame, field, value);
    } else if (field.controlType === "aria_combobox" || field.controlType === "autocomplete" || field.role === "combobox") {
      return fillAutocompleteControl(frame, field, value, telemetry);
    } else if (field.controlType === "listbox" || field.controlType === "custom_select" || field.controlType === "menu_button") {
      if (field.frameUrl?.includes("workday") || field.frameName?.toLowerCase().includes("workday")) {
        return fillWorkdaySelect(frame, field, value, telemetry);
      } else {
        return fillCustomCombobox(frame, field, value, telemetry);
      }
    } else {
      await fillTextControl(frame, field.selector, value, telemetry);
      return value;
    }
  };

  const expectedValue = (await performFill()) || value;
  let verification = await verifyFilledValue(frame, field, expectedValue);

  if (!verification.success && (field.controlType === "aria_combobox" || field.controlType === "autocomplete" || field.controlType === "listbox" || field.controlType === "custom_select" || field.controlType === "menu_button")) {
    const retryValue = (await performFill()) || expectedValue;
    verification = await verifyFilledValue(frame, field, retryValue);
  }

  if (!verification.success) {
    throw new Error(verification.message);
  }

  await highlightField(frame, field.selector);

  return verification;
}

export async function detectLoginRequirement(page: Page) {
  const url = page.url().toLowerCase();
  if (url.includes("login") || url.includes("signin")) {
    return true;
  }

  const visibleLoginText = await page.locator("text=/sign in|log in|continue with google|continue with linkedin/i").count();
  return visibleLoginText > 0;
}

export async function summarizePageWarnings(page: Page) {
  const warnings: string[] = [];
  const captcha = await detectCaptcha(page);

  if (captcha.status === "confirmed_visible_challenge") {
    warnings.push(captcha.userMessage ?? "Human verification appears to be visible in the application.");
  }

  if (await detectLoginRequirement(page)) {
    warnings.push("This page looks like it requires login before the form can be completed.");
  }

  const iframeCount = page.frames().length - 1;
  if (iframeCount > 0) {
    warnings.push(`Detected ${iframeCount} iframe${iframeCount === 1 ? "" : "s"}. Some ATS forms inside embedded frames may need extra review.`);
  }

  const finalButtons = (await detectFinalSubmitButtons(page)).filter((label) => isFinalSubmitLabel(label));
  if (finalButtons.length) {
    warnings.push(`Final submit controls detected: ${finalButtons.join(", ")}. ApplyPilot will not click them.`);
  }

  return {
    warnings: Array.from(new Set(warnings)),
    finalSubmitButtons: finalButtons,
    captcha
  };
}
