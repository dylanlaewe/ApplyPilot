import type { Browser, BrowserContext, Frame, Page } from "playwright";

import { detectAutomationAtsKind, toSessionAtsProvider } from "@/lib/atsStrategy";
import { FINAL_SUBMIT_PATTERNS } from "@/lib/autofillRules";
import { verifyFilledValue } from "@/lib/answerVerification";
import { evaluateVisibleFieldCandidates } from "@/lib/browserFieldScanner";
import { getOrCreateBrowserContext, getOrCreateSessionPage, getSessionPage } from "@/lib/browserManager";
import { fillAutocompleteControl, fillCustomCombobox, fillNativeSelect, fillWorkdaySelect } from "@/lib/controlAdapters";
import { prepareLogicalFields } from "@/lib/fieldLabeling";
import { matchBooleanOption, matchTextOption } from "@/lib/optionMatcher";
import { dismissCookieConsentIfPresent } from "@/lib/consentBarrier";
import { isFinalSubmitLabel } from "@/lib/safety";
import { normalizeText } from "@/lib/utils";
import { CaptchaDetectionResult, CaptchaEvidence, DetectedField, RawScannedField } from "@/types";

type FillVerificationError = Error & {
  commitState?: DetectedField["commitState"];
  actualValue?: string;
};

export type BrowserRuntime = {
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
  return toSessionAtsProvider(detectAutomationAtsKind(url));
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
    preferredPage?: Page;
    preferExplicitPage?: boolean;
    focusPage?: boolean;
  } = {}
) {
  const context = await getOrCreateBrowserContext();
  const page = await getOrCreateSessionPage(sessionId, {
    url,
    navigate: options.navigate,
    reuseOpenPage: options.reuseOpenPage,
    preferredPage: options.preferredPage,
    preferExplicitPage: options.preferExplicitPage,
    focus: options.focusPage
  });
  await installSubmissionGuard(page);

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
    const overlaySelector = "#applypilot-overlay, #applypilot-workday-overlay";
    return Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button']"))
      .filter((element) => {
        if ((element as HTMLElement).closest(overlaySelector)) {
          return false;
        }
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
  await page.waitForLoadState("domcontentloaded", { timeout: 45_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
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
  await fillNativeSelect(frame, selector, value);
}

type RadioOptionTarget = {
  inputSelector: string;
  clickSelector: string;
  label: string;
  value: string;
};

function findMatchingRadioOption(field: DetectedField, radioOptions: RadioOptionTarget[], value: string) {
  const normalizedTarget = normalizeText(value);
  const directMatch =
    radioOptions.find((option) => normalizeText(option.value) === normalizedTarget) ??
    radioOptions.find((option) => normalizeText(option.label) === normalizedTarget);
  if (directMatch) {
    return directMatch;
  }

  const optionLabels = radioOptions.map((option) => option.label).filter(Boolean);
  const semanticMatch =
    (value === "yes" || value === "no"
      ? matchBooleanOption({
          questionText: field.questionText || field.label,
          options: optionLabels,
          answer: value as "yes" | "no",
          intent: field.intent
        })
      : null) ?? matchTextOption(optionLabels, value, "Matched radio option.");

  if (semanticMatch) {
    return radioOptions.find((option) => normalizeText(option.label) === normalizeText(semanticMatch.option)) ?? null;
  }

  const substringMatches = radioOptions.filter(
    (option) =>
      normalizeText(option.label).includes(normalizedTarget) || normalizeText(option.value).includes(normalizedTarget)
  );
  return substringMatches.length === 1 ? substringMatches[0] : null;
}

async function resolveRadioOptions(frame: Frame, field: DetectedField): Promise<RadioOptionTarget[]> {
  return frame
    .evaluate(({ selector }) => {
      const target = document.querySelector(selector);
      if (!target) return [];

      const container =
        target.closest("[data-applypilot-group-id], fieldset, [role='radiogroup'], [role='group'], .application-question, .form-field, .form-group") ??
        target.parentElement;
      if (!container) return [];

      const setMarker = (element: Element | null, attribute: string, prefix: string) => {
        if (!(element instanceof HTMLElement)) return "";
        const existing = element.getAttribute(attribute);
        if (existing) {
          return `[${attribute}="${existing}"]`;
        }

        const id = `${prefix}-${Math.random().toString(36).slice(2)}`;
        element.setAttribute(attribute, id);
        return `[${attribute}="${id}"]`;
      };
      const options: Array<{ inputSelector: string; clickSelector: string; label: string; value: string }> = [];
      const visitedInputs = new Set<string>();
      const registerOption = (input: HTMLInputElement | null, wrapperCandidate: Element | null) => {
        if (!(input instanceof HTMLInputElement)) return;
        const inputKey = input.id || input.name || input.value || String(options.length);
        if (visitedInputs.has(inputKey)) return;
        visitedInputs.add(inputKey);

        const wrapper = wrapperCandidate ?? input.closest("label") ?? input.parentElement ?? input;
        const optionContainer =
          input.closest("[role='radio']") ??
          input.closest("label") ??
          input.parentElement ??
          wrapperCandidate ??
          input;
        const linkedLabel =
          (((input.getAttribute("id") && document.querySelector(`label[for="${input.getAttribute("id")}"]`)?.textContent) || "")
            .replace(/\s+/g, " ")
            .trim()) ||
          ((input.closest("label")?.textContent || "").replace(/\s+/g, " ").trim()) ||
          ((((optionContainer?.textContent as string | undefined) || "").replace(/\s+/g, " ").trim())) ||
          ((((wrapperCandidate?.textContent as string | undefined) || "").replace(/\s+/g, " ").trim()));

        options.push({
          inputSelector: setMarker(input, "data-applypilot-radio-input-id", "applypilot-radio-input"),
          clickSelector: setMarker(wrapper, "data-applypilot-radio-option-id", "applypilot-radio-option"),
          label: linkedLabel,
          value: (input.getAttribute("value") || "").trim()
        });
      };

      for (const input of Array.from(container.querySelectorAll("input[type='radio']"))) {
        registerOption(
          input instanceof HTMLInputElement ? input : null,
          input.closest("[role='radio']") ?? input.closest("label") ?? input.parentElement
        );
      }

      for (const wrapper of Array.from(container.querySelectorAll("[role='radio']"))) {
        registerOption(wrapper.querySelector("input[type='radio']"), wrapper);
      }

      return options.filter((option) => option.inputSelector && option.clickSelector);
    }, { selector: field.selector })
    .catch(() => []);
}

async function radioOptionSelected(frame: Frame, option: RadioOptionTarget) {
  return frame
    .evaluate(({ inputSelector, clickSelector }) => {
      const input = document.querySelector(inputSelector);
      const wrapper = document.querySelector(clickSelector);
      const inputChecked = input instanceof HTMLInputElement ? input.checked : false;
      const wrapperChecked =
        wrapper?.getAttribute("aria-checked") === "true" || wrapper?.getAttribute("aria-selected") === "true";
      return inputChecked || wrapperChecked;
    }, option)
    .catch(() => false);
}

export async function handleRadioGroup(frame: Frame, field: DetectedField, value: string) {
  const normalizedTarget = normalizeText(value);
  let radioOptions = await resolveRadioOptions(frame, field);

  if (!radioOptions.length) {
    const radioLocator = frame.locator(field.selector);
    const name = await radioLocator.getAttribute("name").catch(() => null);

    if (name) {
      const group = frame.locator(`input[type="radio"][name="${name}"]`);
      const count = await group.count().catch(() => 0);
      const fallbackOptions: RadioOptionTarget[] = [];
      for (let index = 0; index < count; index += 1) {
        const option = group.nth(index);
        const inputSelector = await option
          .evaluate((element) => {
            if (!(element instanceof HTMLElement)) return "";
            const id = element.getAttribute("data-applypilot-radio-input-id") || `applypilot-radio-input-${Math.random().toString(36).slice(2)}`;
            element.setAttribute("data-applypilot-radio-input-id", id);
            return `[data-applypilot-radio-input-id="${id}"]`;
          })
          .catch(() => "");
        const clickSelector = await option
          .evaluate((element) => {
            const wrapper = element.closest("[role='radio']") ?? element.closest("label") ?? element.parentElement ?? element;
            if (!(wrapper instanceof HTMLElement)) return "";
            const id = wrapper.getAttribute("data-applypilot-radio-option-id") || `applypilot-radio-option-${Math.random().toString(36).slice(2)}`;
            wrapper.setAttribute("data-applypilot-radio-option-id", id);
            return `[data-applypilot-radio-option-id="${id}"]`;
          })
          .catch(() => "");
        const optionValue = ((await option.getAttribute("value").catch(() => "")) || "").trim();
        const optionLabel = (
          await option.evaluate((element) => {
            const explicitLabel =
              (element.getAttribute("id") && document.querySelector(`label[for="${element.getAttribute("id")}"]`)?.textContent) || "";
            const ownLabel = element.closest("label")?.textContent || "";
            const optionContainer =
              element.closest("[role='radio']") ??
              element.closest("label") ??
              element.parentElement ??
              element;
            return (
              (explicitLabel || "").replace(/\s+/g, " ").trim() ||
              (ownLabel || "").replace(/\s+/g, " ").trim() ||
              (((optionContainer?.textContent as string | undefined) || "").replace(/\s+/g, " ").trim())
            );
          })
        )
          .trim();
        if (inputSelector && clickSelector) {
          fallbackOptions.push({
            inputSelector,
            clickSelector,
            label: optionLabel,
            value: optionValue
          });
        }
      }

      radioOptions = fallbackOptions;
    }
  }

  if (!radioOptions.length) {
    const fallbackOptions = await frame
      .evaluate(({ selector }) => {
        const target = document.querySelector(selector);
        if (!target) return [];

        const container =
          target.closest("[data-applypilot-group-id], fieldset, [role='radiogroup'], [role='group'], .application-question, .form-field, .form-group") ??
          target.parentElement;
        if (!container) return [];

        return Array.from(container.querySelectorAll("input[type='radio'], [role='radio']"))
          .map((element) => {
            const input =
              element instanceof HTMLInputElement && element.type === "radio"
                ? element
                : element.querySelector("input[type='radio']") ?? element.closest("label")?.querySelector("input[type='radio']");
            const wrapper =
              element.getAttribute("role") === "radio" ? element : element.closest("[role='radio']") ?? element.closest("label") ?? element.parentElement;
            if (!(input instanceof HTMLInputElement) || !(wrapper instanceof HTMLElement)) return null;

            const inputId = input.getAttribute("data-applypilot-radio-input-id") || `applypilot-radio-input-${Math.random().toString(36).slice(2)}`;
            input.setAttribute("data-applypilot-radio-input-id", inputId);
            const wrapperId = wrapper.getAttribute("data-applypilot-radio-option-id") || `applypilot-radio-option-${Math.random().toString(36).slice(2)}`;
            wrapper.setAttribute("data-applypilot-radio-option-id", wrapperId);
            const linkedLabel =
              (((input.getAttribute("id") && document.querySelector(`label[for="${input.getAttribute("id")}"]`)?.textContent) || "")
                .replace(/\s+/g, " ")
                .trim()) ||
              ((input.closest("label")?.textContent || "").replace(/\s+/g, " ").trim()) ||
              (((((input.closest("[role='radio']") ?? input.closest("label") ?? input.parentElement ?? wrapper).textContent as string | undefined) || "")
                .replace(/\s+/g, " ")
                .trim())) ||
              ((wrapper.textContent || "").replace(/\s+/g, " ").trim());

            return {
              inputSelector: `[data-applypilot-radio-input-id="${inputId}"]`,
              clickSelector: `[data-applypilot-radio-option-id="${wrapperId}"]`,
              label: linkedLabel,
              value: (input.getAttribute("value") || "").trim()
            };
          })
          .filter((option): option is { inputSelector: string; clickSelector: string; label: string; value: string } => Boolean(option));
      }, { selector: field.selector })
      .catch(() => []);

    radioOptions = fallbackOptions;
  }

  const matchedOption = findMatchingRadioOption(field, radioOptions, value);
  if (!matchedOption) {
    throw new Error(radioOptions.length ? "No matching radio option found." : "Radio group is missing a usable selection target.");
  }

  const clickLocator = frame.locator(matchedOption.clickSelector).first();

  try {
    await clickLocator.click({ timeout: 10_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/intercepts pointer events/i.test(message)) {
      await dismissCookieConsentIfPresent(frame.page(), { waitForAppearanceMs: 1_500 }).catch(() => false);
      await clickLocator.click({ timeout: 5_000, force: true }).catch(async () => {
        await clickLocator.evaluate((element) => {
          if (element instanceof HTMLElement) {
            element.click();
          }
        });
      });
    } else {
      throw error;
    }
  }

  if (await radioOptionSelected(frame, matchedOption)) {
    return;
  }

  await frame.locator(matchedOption.inputSelector).check({ force: true }).catch(() => undefined);
  if (await radioOptionSelected(frame, matchedOption)) {
    return;
  }

  throw new Error("Radio selection could not be verified.");
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
}

export async function handleFileUpload(frame: Frame, selector: string, filePath: string) {
  await frame.locator(selector).setInputFiles(filePath);
}

async function resolveTriggeredUploadInput(frame: Frame, field: DetectedField) {
  return frame
    .evaluate(({ selector, intent }) => {
      const isVisible = (candidate: Element | null) => {
        if (!(candidate instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(candidate);
        const rect = candidate.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const setSelectorId = (candidate: Element | null) => {
        if (!(candidate instanceof HTMLElement)) return "";
        const id = candidate.getAttribute("data-applypilot-upload-id") || `applypilot-upload-${Math.random().toString(36).slice(2)}`;
        candidate.setAttribute("data-applypilot-upload-id", id);
        return `[data-applypilot-upload-id="${id}"]`;
      };
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return "";
      const wrapper =
        element.closest(
          [
            "[data-applypilot-group-id]",
            "[role='dialog']",
            "[role='menu']",
            "[role='listbox']",
            ".application-question",
            ".form-field",
            ".form-group",
            ".field"
          ].join(", ")
        ) ?? element.parentElement;

      const linkedLabel = Array.from(document.querySelectorAll("label[for]")).find((label) => {
        if (!isVisible(label)) return false;
        const text = (label.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        const targetId = label.getAttribute("for");
        const target = targetId ? document.getElementById(targetId) : null;
        return (
          Boolean(target && target.matches('input[type="file"]')) &&
          /file|upload|resume|cv|cover letter/.test(text) &&
          (!wrapper || wrapper.contains(label) || wrapper.contains(target))
        );
      });
      if (linkedLabel) {
        const targetId = linkedLabel.getAttribute("for");
        const target = targetId ? document.getElementById(targetId) : null;
        if (target instanceof HTMLElement) {
          return setSelectorId(target);
        }
      }

      const localInput = wrapper?.querySelector('input[type="file"]') ?? null;
      if (localInput instanceof HTMLElement) {
        return setSelectorId(localInput);
      }

      const pageInputs = Array.from(document.querySelectorAll('input[type="file"]'));
      if (pageInputs.length === 1 && pageInputs[0] instanceof HTMLElement) {
        return setSelectorId(pageInputs[0]);
      }

      if (pageInputs.length) {
        const preferredIndex = intent === "cover_letter_upload" ? pageInputs.length - 1 : 0;
        const preferred = pageInputs[preferredIndex];
        if (preferred instanceof HTMLElement) {
          return setSelectorId(preferred);
        }
      }

      return "";
    }, { selector: field.selector, intent: field.intent })
    .catch(() => "");
}

async function triggerUploadControl(page: Page, field: DetectedField, filePath: string) {
  const frame = resolveFrame(page, field);
  const locator = frame.locator(field.selector).first();
  const fileChooserPromise = page
    .waitForEvent("filechooser", { timeout: 1_500 })
    .then(async (chooser) => {
      await chooser.setFiles(filePath);
      return true;
    })
    .catch(() => false);

  try {
    await locator.click({ timeout: 10_000 });
  } catch {
    await locator.click({ timeout: 10_000, force: true }).catch(async () => {
      await locator.evaluate((element) => {
        if (element instanceof HTMLElement) {
          element.click();
        }
      });
    });
  }

  if (await fileChooserPromise) {
    return;
  }

  const pageUploadInputs = frame.locator('input[type="file"]');
  const inputCount = await pageUploadInputs.count().catch(() => 0);
  if (inputCount > 0) {
    const preferredIndex = field.intent === "cover_letter_upload" ? inputCount - 1 : 0;
    const targetInput = pageUploadInputs.nth(preferredIndex);
    const selector = await targetInput
      .evaluate((element) => {
        if (!(element instanceof HTMLElement)) return "";
        const id = element.getAttribute("data-applypilot-upload-id") || `applypilot-upload-${Math.random().toString(36).slice(2)}`;
        element.setAttribute("data-applypilot-upload-id", id);
        return `[data-applypilot-upload-id="${id}"]`;
      })
      .catch(() => "");
    if (selector) {
      await handleFileUpload(frame, selector, filePath);
      return;
    }
  }

  const revealedInputSelector = await resolveTriggeredUploadInput(frame, field);
  if (!revealedInputSelector) {
    throw new Error("ApplyPilot could not find the file picker for this upload control.");
  }

  await handleFileUpload(frame, revealedInputSelector, filePath);
}

async function fillTextControl(
  frame: Frame,
  field: DetectedField,
  value: string,
  options: {
    preferDirectInput?: boolean;
  } = {}
) {
  const selector = field.selector;
  const locator = frame.locator(selector).first();

  const controlAttributes = await locator
    .evaluate((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        return {
          maxLength: -1,
          pattern: "",
          placeholder: "",
          type: "",
          inputMode: ""
        };
      }

      return {
        maxLength: element.maxLength,
        pattern: element instanceof HTMLInputElement ? element.pattern || "" : "",
        placeholder: element.placeholder || "",
        type: element.type || "",
        inputMode: element.inputMode || ""
      };
    })
    .catch(() => ({
      maxLength: -1,
      pattern: "",
      placeholder: "",
      type: "",
      inputMode: ""
    }));

  const adaptPhoneValue = (nextValue: string) => {
    const digits = nextValue.replace(/\D/g, "");
    if (!digits) return nextValue;

    const hasSeparateCountrySelector = ["phone_number"].includes(field.intent);
    const nationalDigits = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    const placeholder = normalizeText(controlAttributes.placeholder);
    const pattern = controlAttributes.pattern;
    const type = normalizeText(controlAttributes.type);
    const inputMode = normalizeText(controlAttributes.inputMode);

    const e164 = nationalDigits.length === 10 ? `+1${nationalDigits}` : nextValue.replace(/\s+/g, "");
    const spacedInternational = nationalDigits.length === 10 ? `+1 ${nationalDigits}` : nextValue;
    const nationalPlain = nationalDigits;
    const nationalDashed =
      nationalDigits.length === 10
        ? `${nationalDigits.slice(0, 3)}-${nationalDigits.slice(3, 6)}-${nationalDigits.slice(6)}`
        : nationalDigits;
    const nationalPretty =
      nationalDigits.length === 10
        ? `(${nationalDigits.slice(0, 3)}) ${nationalDigits.slice(3, 6)}-${nationalDigits.slice(6)}`
        : nationalDigits;

    const hintedCandidates = hasSeparateCountrySelector
      ? [nationalPlain, nationalDashed, nationalPretty, e164, spacedInternational]
      : /\+|international|e164/.test(placeholder) || /\+/.test(pattern)
        ? [e164, spacedInternational, nationalPlain, nationalDashed, nationalPretty]
        : /[\(\)-]/.test(controlAttributes.placeholder) || /\(\d{3}\)/.test(pattern)
          ? [nationalPretty, nationalDashed, nationalPlain, e164, spacedInternational]
          : type === "tel" || inputMode === "tel"
            ? [nationalPretty, nationalPlain, nationalDashed, e164, spacedInternational]
            : [nextValue, nationalPlain, nationalDashed, nationalPretty, e164, spacedInternational];

    const matchesPattern = (candidate: string) => {
      if (!pattern) return true;
      try {
        return new RegExp(`^(?:${pattern})$`).test(candidate);
      } catch {
        return true;
      }
    };

    const fitsLength = (candidate: string) => controlAttributes.maxLength < 0 || candidate.length <= controlAttributes.maxLength;
    return hintedCandidates.find((candidate) => fitsLength(candidate) && matchesPattern(candidate)) ??
      hintedCandidates.find((candidate) => fitsLength(candidate)) ??
      nextValue;
  };

  const nextValue =
    field.intent === "phone" || field.intent === "full_phone_number" || field.intent === "phone_number"
      ? adaptPhoneValue(value)
      : value;

  const commitTextValue = async () => {
    await locator.fill(nextValue);
    await locator.evaluate((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.blur();
    });
  };

  try {
    await commitTextValue();
    return nextValue;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/intercepts pointer events|subtree intercepts pointer events/i.test(message)) {
      const dismissed = await dismissCookieConsentIfPresent(frame.page(), { waitForAppearanceMs: 1_500 }).catch(() => false);
      if (dismissed) {
        await commitTextValue();
        return nextValue;
      }
    }

    if (!options.preferDirectInput) {
      throw error;
    }
  }

  if (options.preferDirectInput) {
    await locator
      .evaluate((element, nextValue) => {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
          throw new Error("The text field could not be updated directly.");
        }

        const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        descriptor?.set?.call(element, nextValue);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }, nextValue)
      .catch(() => undefined);

    const directValue = await locator.inputValue().catch(() => "");
    if (directValue === nextValue) {
      await locator.evaluate((element) => {
        if (element instanceof HTMLElement) {
          element.blur();
        }
      });
      return nextValue;
    }
  }

  await locator.evaluate((element, nextValue) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      throw new Error("The text field could not be focused for input.");
    }

    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, nextValue);
    element.focus();
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.blur();
  }, nextValue);

  return nextValue;
}

export async function fillField(
  page: Page,
  field: DetectedField,
  value: string,
  options: {
    allowRetry?: boolean;
    highlight?: boolean;
    preferDirectInput?: boolean;
  } = {}
) {
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
    if (field.intent === "resume_upload" || field.intent === "cover_letter_upload") {
      if (field.type === "file") {
        await handleFileUpload(frame, field.selector, value);
      } else {
        await triggerUploadControl(page, field, value);
      }
    } else if (field.type === "select-one" || field.type === "select-multiple" || field.controlType === "native_select") {
      await handleSelectDropdown(frame, field.selector, value);
    } else if (field.type === "radio") {
      await handleRadioGroup(frame, field, value);
    } else if (field.type === "checkbox") {
      if ((field.selectOptions?.length ?? 0) > 1 && field.name) {
        await handleCheckboxGroup(frame, field, value);
      } else {
        await handleCheckbox(frame, field.selector, value);
      }
    } else if (field.type === "file") {
      await handleFileUpload(frame, field.selector, value);
    } else if (field.controlType === "aria_combobox" || field.controlType === "autocomplete" || field.role === "combobox") {
      await fillAutocompleteControl(frame, field, value);
    } else if (field.controlType === "listbox" || field.controlType === "custom_select" || field.controlType === "menu_button") {
      if (field.frameUrl?.includes("workday") || field.frameName?.toLowerCase().includes("workday")) {
        await fillWorkdaySelect(frame, field, value);
      } else {
        await fillCustomCombobox(frame, field, value);
      }
    } else {
      await fillTextControl(frame, field, value, {
        preferDirectInput: options.preferDirectInput
      });
    }
  };

  await performFill();
  let verification = await verifyFilledValue(frame, field, value);

  if (
    options.allowRetry !== false &&
    !verification.success &&
    (field.controlType === "aria_combobox" ||
      field.controlType === "autocomplete" ||
      field.controlType === "listbox" ||
      field.controlType === "custom_select" ||
      field.controlType === "menu_button")
  ) {
    await performFill();
    verification = await verifyFilledValue(frame, field, value);
  }

  if (!verification.success) {
    const failure = new Error(verification.message) as FillVerificationError;
    failure.commitState = verification.commitState;
    failure.actualValue = verification.actualValue;
    throw failure;
  }

  if (options.highlight !== false) {
    await highlightField(frame, field.selector);
  }

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
