import type { Page } from "playwright";

type PageStabilitySnapshot = {
  url: string;
  path: string;
  heading: string;
  sectionHeadings: string[];
  visibleControlCount: number;
  formVisible: boolean;
  blockingLoaderVisible: boolean;
  mutationCount: number;
  routeChangeCount: number;
  pageIdentity: string;
};

const runtimeStore = globalThis as typeof globalThis & {
  __applyPilotPageActivityInstalled?: WeakSet<Page>;
};

const monitoredPages = runtimeStore.__applyPilotPageActivityInstalled ?? new WeakSet<Page>();
runtimeStore.__applyPilotPageActivityInstalled = monitoredPages;

const PAGE_ACTIVITY_MONITOR = () => {
  const win = window as Window & {
    __applyPilotPageActivityInstalled?: boolean;
    __applyPilotPageActivity?: {
      mutationCount: number;
      routeChangeCount: number;
    };
  };

  if (win.__applyPilotPageActivityInstalled) return;
  win.__applyPilotPageActivityInstalled = true;
  win.__applyPilotPageActivity = {
    mutationCount: 0,
    routeChangeCount: 0
  };

  const bumpRoute = () => {
    if (win.__applyPilotPageActivity) {
      win.__applyPilotPageActivity.routeChangeCount += 1;
    }
  };

  const originalPushState = history.pushState.bind(history);
  history.pushState = ((...args: Parameters<typeof history.pushState>) => {
    const result = originalPushState(...args);
    bumpRoute();
    return result;
  }) as typeof history.pushState;

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = ((...args: Parameters<typeof history.replaceState>) => {
    const result = originalReplaceState(...args);
    bumpRoute();
    return result;
  }) as typeof history.replaceState;

  window.addEventListener("popstate", bumpRoute);
  window.addEventListener("hashchange", bumpRoute);

  const observer = new MutationObserver((entries) => {
    if (win.__applyPilotPageActivity) {
      win.__applyPilotPageActivity.mutationCount += entries.length || 1;
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: false
  });
};

async function captureSnapshot(page: Page): Promise<PageStabilitySnapshot> {
  return page.evaluate(() => {
    const controls = Array.from(
      document.querySelectorAll(
        [
          "input:not([type='hidden'])",
          "textarea",
          "select",
          "button[aria-haspopup='listbox']",
          "button[aria-expanded]",
          "[role='combobox']",
          "[role='listbox']",
          "[role='radio']",
          "[role='checkbox']",
          "[data-automation-id='fieldControl']"
        ].join(", ")
      )
    ).filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || rect.width <= 0 || rect.height <= 0) {
        return false;
      }
      if (element.matches("[role='option'], [role='menuitem'], [data-automation-id='promptOption']")) return false;
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      return !/^share(?: this job)?$/i.test(text) && !/^copy link$/i.test(text);
    });

    const headings = Array.from(document.querySelectorAll("h1, h2, [data-automation-id='pageHeader'], [data-automation-id='formSectionHeading']"))
      .filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const sectionHeadings = headings.slice(1, 8);

    const formVisible = Boolean(
      document.querySelector("form") ||
        document.querySelector("[data-automation-id='applicationForm']") ||
        document.querySelector("[data-automation-id='formSection']") ||
        controls.length
    );

    const blockingLoaderVisible = Array.from(
      document.querySelectorAll(
        [
          "[aria-busy='true']",
          "[role='progressbar']",
          "[data-automation-id='loadingIndicator']",
          "[data-automation-id='spinner']",
          ".wd-spinner",
          ".loading",
          ".spinner"
        ].join(", ")
      )
    ).some((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && rect.width > 0 && rect.height > 0;
    });

    const activity = (window as Window & { __applyPilotPageActivity?: { mutationCount: number; routeChangeCount: number } })
      .__applyPilotPageActivity ?? { mutationCount: 0, routeChangeCount: 0 };

    return {
      url: window.location.href,
      path: `${window.location.origin}${window.location.pathname}`,
      heading: headings[0] || "",
      sectionHeadings,
      visibleControlCount: controls.length,
      formVisible,
      blockingLoaderVisible,
      mutationCount: activity.mutationCount,
      routeChangeCount: activity.routeChangeCount,
      pageIdentity: [
        `${window.location.origin}${window.location.pathname}`,
        headings[0] || "",
        sectionHeadings.join("|"),
        String(controls.length)
      ].join("::")
    };
  });
}

export async function installPageActivityMonitor(page: Page) {
  if (monitoredPages.has(page)) return;
  await page.addInitScript(PAGE_ACTIVITY_MONITOR);
  await page.evaluate(PAGE_ACTIVITY_MONITOR).catch(() => undefined);
  monitoredPages.add(page);
}

export async function samplePageFingerprint(page: Page) {
  await installPageActivityMonitor(page);
  const snapshot = await captureSnapshot(page);
  return snapshot.pageIdentity;
}

export async function waitForPageReadiness(
  page: Page,
  options: {
    timeoutMs?: number;
    stableChecks?: number;
    intervalMs?: number;
  } = {}
) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const stableChecks = options.stableChecks ?? 3;
  const intervalMs = options.intervalMs ?? 200;

  await installPageActivityMonitor(page);
  await page.waitForLoadState("domcontentloaded", { timeout: 45_000 }).catch(() => undefined);

  const startedAt = Date.now();
  let stableCount = 0;
  let previous: PageStabilitySnapshot | null = null;
  let latest: PageStabilitySnapshot | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    latest = await captureSnapshot(page).catch(() => null);

    if (latest) {
      const previousSnapshot = previous;
      const isStableComparedToPrevious = previousSnapshot
        ? previousSnapshot.url === latest.url &&
          previousSnapshot.heading === latest.heading &&
          previousSnapshot.visibleControlCount === latest.visibleControlCount &&
          previousSnapshot.routeChangeCount === latest.routeChangeCount &&
          latest.mutationCount - previousSnapshot.mutationCount <= 2
        : false;

      if (latest.formVisible && !latest.blockingLoaderVisible && isStableComparedToPrevious) {
        stableCount += 1;
        if (stableCount >= stableChecks) {
          return latest;
        }
      } else {
        stableCount = latest.formVisible && !latest.blockingLoaderVisible ? 1 : 0;
      }
    }

    previous = latest;
    await page.waitForTimeout(intervalMs);
  }

  return latest;
}
