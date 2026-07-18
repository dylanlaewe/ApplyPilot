import type { Page } from "playwright";

type WorkdayRepeatableSectionKey = "work_experience" | "education";

type WorkdayRepeatableSectionConfig = {
  label: string;
  headingPhrases: string[];
  addPhrases: string[];
  fieldPhrases: string[];
};

type WorkdayRepeatableSectionInspection = {
  ready: boolean;
  selector: string;
  label: string;
  relevantControlCount: number;
};

export type WorkdayRepeatableSectionResult = {
  section: WorkdayRepeatableSectionKey;
  opened: boolean;
  alreadyVisible: boolean;
  reason: string;
};

const WORKDAY_REPEATABLE_SECTIONS: Record<WorkdayRepeatableSectionKey, WorkdayRepeatableSectionConfig> = {
  work_experience: {
    label: "Work Experience",
    headingPhrases: ["work experience", "experience"],
    addPhrases: ["add", "add work experience", "add another role", "add experience"],
    fieldPhrases: ["employer", "company", "job title", "title", "start date", "end date", "currently work here"]
  },
  education: {
    label: "Education",
    headingPhrases: ["education", "education history"],
    addPhrases: ["add", "add education", "add school"],
    fieldPhrases: ["school", "university", "degree", "field of study", "major", "graduation", "gpa"]
  }
};

function buildInspectScript(section: WorkdayRepeatableSectionConfig) {
  return `
    (() => {
      const config = ${JSON.stringify(section)};
      const cleanText = (value) => (value ?? "").replace(/\\s+/g, " ").trim().toLowerCase();
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const markSelector = (element) => {
        if (!(element instanceof HTMLElement)) return "";
        const marker = element.getAttribute("data-applypilot-repeatable-id") || \`applypilot-repeatable-\${Math.random().toString(36).slice(2)}\`;
        element.setAttribute("data-applypilot-repeatable-id", marker);
        return \`[data-applypilot-repeatable-id="\${marker}"]\`;
      };
      const includesPhrase = (text, phrases) => phrases.some((phrase) => text.includes(phrase));
      const ancestorTexts = (element) => {
        const texts = [];
        let current = element?.parentElement ?? null;
        let depth = 0;
        while (current && current !== document.body && depth < 8) {
          const text = cleanText(current.textContent);
          if (text) texts.push(text);
          current = current.parentElement;
          depth += 1;
        }
        return texts;
      };

      const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, legend, [role='heading'], label, span, div"))
        .filter((element) => visible(element) && includesPhrase(cleanText(element.textContent), config.headingPhrases));

      const relevantControls = Array.from(
        document.querySelectorAll("input, textarea, select, [role='combobox'], button[aria-haspopup='listbox'], button[aria-expanded]")
      ).filter((element) => {
        if (!visible(element)) return false;
        const controlText = cleanText(
          [
            element.getAttribute("aria-label"),
            element.getAttribute("placeholder"),
            element.getAttribute("name"),
            element.getAttribute("id"),
            element.closest("label")?.textContent,
            element.parentElement?.textContent
          ]
            .filter(Boolean)
            .join(" ")
        );
        if (!includesPhrase(controlText, config.fieldPhrases)) return false;
        return ancestorTexts(element).some((text) => includesPhrase(text, config.headingPhrases));
      });

      if (relevantControls.length > 0) {
        return {
          ready: true,
          selector: "",
          label: "",
          relevantControlCount: relevantControls.length
        };
      }

      const buttons = Array.from(document.querySelectorAll("button, [role='button'], a"))
        .filter((element) => visible(element) && includesPhrase(cleanText(element.textContent), config.addPhrases));

      let bestButton = null;
      let bestScore = -Infinity;

      for (const button of buttons) {
        const buttonText = cleanText(button.textContent);
        const buttonRect = button.getBoundingClientRect();
        let score = buttonText === "add" ? 10 : 25;

        const surroundingText = ancestorTexts(button);
        if (surroundingText.some((text) => includesPhrase(text, config.headingPhrases))) {
          score += 60;
        }

        for (const heading of headings) {
          const headingRect = heading.getBoundingClientRect();
          const verticalDistance = Math.abs(buttonRect.top - headingRect.top);
          if (verticalDistance <= 220) {
            score += 30 - verticalDistance / 10;
          }
          if (buttonRect.top >= headingRect.top - 24) {
            score += 5;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestButton = button;
        }
      }

      return {
        ready: false,
        selector: markSelector(bestButton),
        label: bestButton ? (bestButton.textContent || "").replace(/\\s+/g, " ").trim() : "",
        relevantControlCount: 0
      };
    })()
  `;
}

function buildOpenedScript(section: WorkdayRepeatableSectionConfig) {
  return `
    (() => {
      const config = ${JSON.stringify(section)};
      const cleanText = (value) => (value ?? "").replace(/\\s+/g, " ").trim().toLowerCase();
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const includesPhrase = (text, phrases) => phrases.some((phrase) => text.includes(phrase));
      const ancestorTexts = (element) => {
        const texts = [];
        let current = element?.parentElement ?? null;
        let depth = 0;
        while (current && current !== document.body && depth < 8) {
          const text = cleanText(current.textContent);
          if (text) texts.push(text);
          current = current.parentElement;
          depth += 1;
        }
        return texts;
      };

      return Array.from(
        document.querySelectorAll("input, textarea, select, [role='combobox'], button[aria-haspopup='listbox'], button[aria-expanded]")
      ).some((element) => {
        if (!visible(element)) return false;
        const controlText = cleanText(
          [
            element.getAttribute("aria-label"),
            element.getAttribute("placeholder"),
            element.getAttribute("name"),
            element.getAttribute("id"),
            element.closest("label")?.textContent,
            element.parentElement?.textContent
          ]
            .filter(Boolean)
            .join(" ")
        );
        if (!includesPhrase(controlText, config.fieldPhrases)) return false;
        return ancestorTexts(element).some((text) => includesPhrase(text, config.headingPhrases));
      });
    })()
  `;
}

async function inspectWorkdayRepeatableSection(page: Page, section: WorkdayRepeatableSectionConfig) {
  return page.evaluate<WorkdayRepeatableSectionInspection>(buildInspectScript(section));
}

export async function ensureWorkdayRepeatableSectionReady(page: Page, sectionKey: WorkdayRepeatableSectionKey): Promise<WorkdayRepeatableSectionResult> {
  const section = WORKDAY_REPEATABLE_SECTIONS[sectionKey];
  const before = await inspectWorkdayRepeatableSection(page, section);

  if (before.ready) {
    return {
      section: sectionKey,
      opened: false,
      alreadyVisible: true,
      reason: `${section.label} form is already open`
    };
  }

  if (!before.selector) {
    return {
      section: sectionKey,
      opened: false,
      alreadyVisible: false,
      reason: "Add button not found"
    };
  }

  const trigger = page.locator(before.selector).first();
  try {
    await trigger.click({ timeout: 10_000 });
  } catch {
    await trigger.click({ timeout: 10_000, force: true }).catch(async () => {
      await trigger.evaluate((element) => {
        if (element instanceof HTMLElement) {
          element.click();
        }
      });
    });
  }

  const opened = await page
    .waitForFunction(buildOpenedScript(section), undefined, { timeout: 3_000 })
    .then(() => true)
    .catch(() => false);

  if (!opened) {
    return {
      section: sectionKey,
      opened: false,
      alreadyVisible: false,
      reason: `${section.label} form did not open`
    };
  }

  return {
    section: sectionKey,
    opened: true,
    alreadyVisible: false,
    reason: `${section.label} form opened`
  };
}
