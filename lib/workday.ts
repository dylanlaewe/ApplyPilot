import type { Page } from "playwright";

import { ApplicantProfile } from "@/types";

type RepeatableSectionKind = "education" | "experience" | "certifications";

const SECTION_CONFIG: Record<
  RepeatableSectionKind,
  {
    patterns: RegExp[];
    recordCount: (profile: ApplicantProfile) => number;
  }
> = {
  education: {
    patterns: [/education/i],
    recordCount: (profile) => profile.education.filter((entry) => entry.school.trim() || entry.degree.trim() || entry.fieldOfStudy.trim()).length
  },
  experience: {
    patterns: [/work experience/i, /experience/i, /employment/i, /work history/i],
    recordCount: (profile) => profile.experience.filter((entry) => entry.company.trim() || entry.title.trim()).length
  },
  certifications: {
    patterns: [/certification/i, /license/i],
    recordCount: (profile) => profile.certifications.filter((entry) => entry.name.trim() || entry.issuer.trim()).length
  }
};

function matchesSection(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

async function locateRepeatableSection(page: Page, kind: RepeatableSectionKind) {
  const sections = page.locator("section, fieldset, [data-automation-id='formSection'], [data-automation-id='panelSet'], [role='group']");
  const count = await sections.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    const section = sections.nth(index);
    const heading = ((await section
      .locator("h1, h2, h3, h4, legend, [data-automation-id='formSectionHeading'], [data-automation-id='panelHeader']")
      .first()
      .textContent()
      .catch(() => "")) || "")
      .replace(/\s+/g, " ")
      .trim();

    if (!heading || !matchesSection(heading, SECTION_CONFIG[kind].patterns)) {
      continue;
    }

    const addButton = section
      .locator(
        [
          "button[data-automation-id*='Add']",
          "button[aria-label*='Add' i]",
          "[role='button'][aria-label*='Add' i]",
          "button"
        ].join(", ")
      )
      .filter({ hasText: /add/i })
      .first();
    const visibleControlCount = await section
      .locator("input:not([type='hidden']), textarea, select, [role='combobox'], [data-automation-id='fieldControl']")
      .count()
      .catch(() => 0);
    const visibleEntryCount = await section
      .locator(
        "[data-applypilot-repeatable-entry], [data-automation-id='repeatableSectionItem'], [data-automation-id='education'], [data-automation-id='workExperience'], [data-automation-id='certification'], .repeatable-entry"
      )
      .count()
      .catch(() => 0);

    return {
      sectionIndex: index,
      hasAddButton: (await addButton.count().catch(() => 0)) > 0,
      visibleControlCount,
      visibleEntryCount
    };
  }

  return {
    sectionIndex: -1,
    hasAddButton: false,
    visibleControlCount: 0,
    visibleEntryCount: 0
  };
}

export async function ensureWorkdayRepeatableSections(page: Page, profile: ApplicantProfile) {
  let createdEntries = 0;

  for (const kind of Object.keys(SECTION_CONFIG) as RepeatableSectionKind[]) {
    const desiredEntries = SECTION_CONFIG[kind].recordCount(profile);
    if (desiredEntries <= 0) continue;

    const section = await locateRepeatableSection(page, kind);
    if (section.sectionIndex < 0 || !section.hasAddButton) continue;

    let currentVisibleEntries = Math.max(section.visibleEntryCount, section.visibleControlCount > 0 ? 1 : 0);
    while (currentVisibleEntries < desiredEntries) {
      const sectionLocator = page
        .locator("section, fieldset, [data-automation-id='formSection'], [data-automation-id='panelSet'], [role='group']")
        .nth(section.sectionIndex);
      const button = sectionLocator
        .locator(
          [
            "button[data-automation-id*='Add']",
            "button[aria-label*='Add' i]",
            "[role='button'][aria-label*='Add' i]",
            "button"
          ].join(", ")
        )
        .filter({ hasText: /add/i })
        .first();
      if ((await button.count().catch(() => 0)) === 0) break;

      await button.click({ timeout: 10_000 });

      await page.waitForTimeout(250);
      await page.waitForFunction(
        ({ sectionIndex, previousEntries }) => {
          const sectionElement = Array.from(
            document.querySelectorAll("section, fieldset, [data-automation-id='formSection'], [data-automation-id='panelSet'], [role='group']")
          )[sectionIndex];
          if (!(sectionElement instanceof HTMLElement)) return false;
          const visibleEntries = Array.from(sectionElement.children).filter((child) => {
            if (!(child instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(child);
            const rect = child.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0 &&
              child.querySelector("input, textarea, select, [role='combobox']")
            );
          }).length;
          const visibleControls = Array.from(
            sectionElement.querySelectorAll("input:not([type='hidden']), textarea, select, [role='combobox'], [data-automation-id='fieldControl']")
          ).length;
          return visibleEntries > previousEntries || (previousEntries === 0 && visibleControls > 0);
        },
        { sectionIndex: section.sectionIndex, previousEntries: currentVisibleEntries },
        { timeout: 5_000 }
      ).catch(() => undefined);

      const refreshed = await locateRepeatableSection(page, kind);
      const nextVisibleEntries = Math.max(refreshed.visibleEntryCount, refreshed.visibleControlCount > 0 ? 1 : 0);
      if (nextVisibleEntries > currentVisibleEntries) {
        createdEntries += 1;
      }
      currentVisibleEntries = nextVisibleEntries;
      if (refreshed.sectionIndex < 0 || !refreshed.hasAddButton) break;
    }
  }

  return { createdEntries };
}

export function isWorkdayPage(url: string) {
  return /myworkdayjobs\.com|workday/i.test(url);
}
