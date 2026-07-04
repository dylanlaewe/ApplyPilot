import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";

import { chromium, type Browser, type Page } from "playwright";

import { samplePageFingerprint } from "@/lib/pageReadiness";
import { ensureSessionAutomation } from "@/lib/sessionAutomation";

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
  if (page && !page.isClosed()) {
    await page.close();
  }
});

async function waitFor(assertion: () => Promise<void> | void, timeoutMs = 5_000) {
  const startedAt = Date.now();
  let lastError: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Timed out waiting for assertion.");
}

test("page fingerprints change when Workday reuses a route but the step heading changes", async () => {
  if (!browser) return test.skip(launchError?.message ?? "Playwright launch is unavailable.");

  await page.setContent(`
    <section data-automation-id="formSection">
      <h1>Step 1</h1>
      <input aria-label="First name" />
    </section>
  `);

  const first = await samplePageFingerprint(page);
  await page.locator("h1").evaluate((element) => {
    element.textContent = "Step 2";
  });
  const second = await samplePageFingerprint(page);

  assert.notEqual(first, second);
});

test("session automation suppresses duplicate fill passes for the same page identity", async () => {
  if (!browser) return test.skip(launchError?.message ?? "Playwright launch is unavailable.");

  await page.setContent(`
    <section data-automation-id="formSection">
      <h1>Step 1</h1>
      <input aria-label="First name" />
    </section>
  `);

  let runCount = 0;
  await ensureSessionAutomation("session-automation-test", page, async () => {
    runCount += 1;
  });

  await page.locator("h1").evaluate((element) => {
    element.textContent = "Step 2";
  });

  await waitFor(() => {
    assert.equal(runCount, 1);
  });

  await page.locator("body").evaluate((element) => {
    const marker = document.createElement("div");
    marker.textContent = "non-structural mutation";
    element.appendChild(marker);
    marker.remove();
  });

  await new Promise((resolve) => setTimeout(resolve, 1_800));
  assert.equal(runCount, 1);
});
