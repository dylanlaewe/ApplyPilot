import type { Page } from "playwright";

import type { ApplyPilotSettings } from "@/lib/settings";

export type AutomationAtsKind =
  | "generic"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "jobvite"
  | "smartrecruiters"
  | "icims"
  | "workday";

export type AutomationStrategyId =
  | "generic"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "jobvite"
  | "smartrecruiters"
  | "icims"
  | "workday_safe_mode";

export type AutomationStrategy = {
  atsKind: AutomationAtsKind;
  strategyId: AutomationStrategyId;
  label: string;
  shouldInjectApplicationOverlay: boolean;
  workdaySafeModeActive: boolean;
  shouldInjectWorkdayOverlay: boolean;
  shouldInitializeWorkdayCapture: boolean;
  shouldUseWorkdayOnePass: boolean;
  workdayClassificationConfidence: "confirmed" | "uncertain" | "not_applicable";
  classificationReason: string;
};

export type StrategyDomClues = {
  title?: string;
  pathname?: string;
  pageHeader?: string;
  automationIds?: string[];
  hasDataAutomationShell?: boolean;
};

const WORKDAY_HOST_PATTERNS = [/\.myworkdayjobs\.com$/i, /\.wd\d+\.myworkdayjobs\.com$/i, /(^|\.)workday\.com$/i];
const WORKDAY_ROUTE_PATTERNS = [/\/jobs?\//i, /\/details\//i, /\/recruiting\//i, /\/apply\//i];
const STABLE_WORKDAY_AUTOMATION_IDS = new Set([
  "applicationForm",
  "formContainer",
  "pageHeader",
  "applyManually",
  "file-upload-input-ref",
  "workExperience",
  "education",
  "candidateHome"
]);

function parseUrl(url: string) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function hasVerifiedWorkdayHost(url: string) {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return WORKDAY_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname));
}

function hasKnownWorkdayRoute(url: string, pathname?: string) {
  const parsed = parseUrl(url);
  const targetPath = pathname || parsed?.pathname || "";
  return WORKDAY_ROUTE_PATTERNS.some((pattern) => pattern.test(targetPath));
}

function hasStableWorkdayDomClues(clues?: StrategyDomClues) {
  if (!clues) return false;
  const automationIds = clues.automationIds ?? [];
  return automationIds.some((automationId) => STABLE_WORKDAY_AUTOMATION_IDS.has(automationId)) || Boolean(clues.hasDataAutomationShell && clues.pageHeader);
}

export function detectAutomationAtsKind(url: string): AutomationAtsKind {
  const parsed = parseUrl(url);
  const hostname = parsed?.hostname.toLowerCase() ?? "";

  if (hostname.includes("greenhouse.io")) return "greenhouse";
  if (hostname.includes("lever.co")) return "lever";
  if (hostname.includes("ashbyhq.com")) return "ashby";
  if (hostname.includes("workable.com")) return "workable";
  if (hostname.includes("jobvite.com")) return "jobvite";
  if (hostname.includes("smartrecruiters.com")) return "smartrecruiters";
  if (hostname.includes("icims.com")) return "icims";
  if (hasVerifiedWorkdayHost(url)) return "workday";
  return "generic";
}

export function toSessionAtsProvider(kind: AutomationAtsKind): "greenhouse" | "lever" | "ashby" | "workable" | "workday" | "generic" {
  if (kind === "greenhouse" || kind === "lever" || kind === "ashby" || kind === "workable" || kind === "workday") {
    return kind;
  }
  return "generic";
}

export function createDefaultAutomationStrategy(kind: AutomationAtsKind): AutomationStrategy {
  return {
    atsKind: kind,
    strategyId: kind === "generic" || kind === "workday" ? "generic" : kind,
    label:
      kind === "generic"
        ? "Generic automation"
        : kind === "jobvite"
          ? "Jobvite automation"
          : kind === "smartrecruiters"
            ? "SmartRecruiters automation"
            : kind === "icims"
            ? "iCIMS automation"
            : `${kind[0].toUpperCase()}${kind.slice(1)} automation`,
    shouldInjectApplicationOverlay: true,
    workdaySafeModeActive: false,
    shouldInjectWorkdayOverlay: false,
    shouldInitializeWorkdayCapture: false,
    shouldUseWorkdayOnePass: false,
    workdayClassificationConfidence: "not_applicable",
    classificationReason: "This page is not classified as Workday."
  };
}

export function resolveAutomationStrategy({
  url,
  settings,
  domClues
}: {
  url: string;
  settings: ApplyPilotSettings;
  domClues?: StrategyDomClues;
}): AutomationStrategy {
  const kind = detectAutomationAtsKind(url);
  if (kind !== "workday") {
    return createDefaultAutomationStrategy(kind);
  }

  const workdaySafeModeEnabled = settings.applicationBehavior.workdaySafeModeEnabled;
  const hasVerifiedHost = hasVerifiedWorkdayHost(url);
  const hasKnownRoute = hasKnownWorkdayRoute(url, domClues?.pathname);
  const hasStableDom = hasStableWorkdayDomClues(domClues);
  const confirmedWorkday = hasVerifiedHost && (hasKnownRoute || hasStableDom);

  if (!workdaySafeModeEnabled) {
    return {
      ...createDefaultAutomationStrategy("generic"),
      atsKind: "workday",
      workdayClassificationConfidence: confirmedWorkday ? "confirmed" : "uncertain",
      classificationReason: "Workday Safe Mode is disabled in local settings."
    };
  }

  if (!confirmedWorkday) {
    return {
      ...createDefaultAutomationStrategy("generic"),
      atsKind: "workday",
      workdayClassificationConfidence: "uncertain",
      classificationReason: "Workday-specific signals were not strong enough, so ApplyPilot stayed on the generic path."
    };
  }

  return {
    atsKind: "workday",
    strategyId: "workday_safe_mode",
    label: "Workday Safe Mode",
    shouldInjectApplicationOverlay: true,
    workdaySafeModeActive: true,
    shouldInjectWorkdayOverlay: true,
    shouldInitializeWorkdayCapture: true,
    shouldUseWorkdayOnePass: true,
    workdayClassificationConfidence: "confirmed",
    classificationReason: hasStableDom
      ? "Verified Workday hostname plus stable Workday DOM attributes were found."
      : "Verified Workday hostname and route structure were found."
  };
}

export async function collectStrategyDomClues(page: Page): Promise<StrategyDomClues> {
  return page
    .evaluate(() => {
      const automationIds = Array.from(document.querySelectorAll("[data-automation-id]"))
        .map((element) => element.getAttribute("data-automation-id") || "")
        .filter(Boolean)
        .slice(0, 50);

      return {
        title: document.title,
        pathname: window.location.pathname,
        pageHeader:
          (document.querySelector("h1, [data-automation-id='pageHeader'], [data-automation-id='formTitle']")?.textContent || "")
            .replace(/\s+/g, " ")
            .trim(),
        automationIds,
        hasDataAutomationShell: Boolean(document.querySelector("[data-automation-id='applicationForm'], [data-automation-id='formContainer']"))
      } satisfies StrategyDomClues;
    })
    .catch(() => ({
      title: "",
      pathname: "",
      pageHeader: "",
      automationIds: [],
      hasDataAutomationShell: false
    }));
}

export async function resolveAutomationStrategyForPage({
  page,
  url,
  settings
}: {
  page: Page;
  url: string;
  settings: ApplyPilotSettings;
}) {
  const initialKind = detectAutomationAtsKind(url);
  if (initialKind !== "workday") {
    return resolveAutomationStrategy({ url, settings });
  }

  const domClues = await collectStrategyDomClues(page);
  return resolveAutomationStrategy({
    url: page.url() || url,
    settings,
    domClues
  });
}
