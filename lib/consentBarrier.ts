import type { Page } from "playwright";

const CONSENT_ACTION_PATTERNS = [
  /^accept\b/i,
  /^decline\b/i,
  /^agree\b/i,
  /^allow\b/i,
  /^continue\b/i,
  /^got it$/i,
  /^ok$/i,
  /^okay$/i,
  /^close$/i
];

export async function dismissCookieConsentIfPresent(
  page: Page,
  options: {
    waitForAppearanceMs?: number;
  } = {}
) {
  const scopedSelectors = [
    '[data-ui="cookie-consent"] button',
    '[data-ui="cookie-consent"] [role="button"]',
    '[aria-label*="cookie" i] button',
    '[aria-label*="cookie" i] [role="button"]',
    '[role="dialog"][aria-label*="cookie" i] button',
    '[role="dialog"][aria-label*="cookie" i] [role="button"]'
  ];

  const deadline = Date.now() + (options.waitForAppearanceMs ?? 0);

  do {
    for (const selector of scopedSelectors) {
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        const visible = await candidate.isVisible().catch(() => false);
        if (!visible) continue;
        const label = ((await candidate.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
        if (!CONSENT_ACTION_PATTERNS.some((pattern) => pattern.test(label))) {
          continue;
        }

        const clicked = await candidate
          .click({ timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
        if (!clicked) continue;

        await page.waitForTimeout(400).catch(() => undefined);
        return true;
      }
    }

    if (Date.now() >= deadline) {
      break;
    }
    await page.waitForTimeout(150).catch(() => undefined);
  } while (Date.now() <= deadline);

  return false;
}
