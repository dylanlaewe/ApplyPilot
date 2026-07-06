import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";

import { chromium, type Browser, type Page } from "playwright";

import { ensureWorkdayOverlay, registerWorkdayOverlayBridge } from "@/lib/workdayOverlay";

let browser: Browser;
let page: Page;
let launchError: Error | null = null;

before(async () => {
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    launchError = error instanceof Error ? error : new Error("Could not launch Playwright in this environment.");
  }
});

after(async () => {
  if (browser) {
    await browser.close();
  }
});

beforeEach(async () => {
  if (!browser) return;
  page = await browser.newPage();
});

afterEach(async () => {
  if (!page.isClosed()) {
    await page.close();
  }
});

test("Workday overlay click path reaches the bridge handler and updates the local status summary", async () => {
  if (!browser) return test.skip(launchError?.message ?? "Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent("<html><body><main>Workday form</main></body></html>");

  const actions: string[] = [];
  await registerWorkdayOverlayBridge(page, async ({ sessionId, action }) => {
    actions.push(`${sessionId}:${action}`);
    return {
      ok: true,
      status: "Finished",
      message: "3 safe fields completed / 2 fields need review / No uncertain answers were selected",
      unresolved: [
        { label: "Country", reason: "Needs an exact dropdown mapping" },
        { label: "Work authorization", reason: "Sensitive question requires your review" }
      ]
    };
  });

  await ensureWorkdayOverlay(page, "session-workday");
  await page.locator("#applypilot-workday-overlay summary").click();
  await page.getByRole("button", { name: "Fill safe fields" }).click();

  await page.waitForFunction(() => {
    const status = document.querySelector("#applypilot-workday-overlay .status");
    return status?.textContent === "Finished";
  });

  assert.deepEqual(actions, ["session-workday:fill-safe-fields"]);
  assert.equal((await page.locator("#applypilot-workday-overlay .status").textContent()) ?? "", "Finished");
  assert.match((await page.locator("#applypilot-workday-overlay .details").textContent()) ?? "", /Country: Needs an exact dropdown mapping/);
  assert.match((await page.locator("#applypilot-workday-overlay .details").textContent()) ?? "", /Work authorization: Sensitive question requires your review/);
});
