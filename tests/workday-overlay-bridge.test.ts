import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";

import { chromium, type Browser, type Page } from "playwright";

import { ensureApplicationOverlay, registerApplicationOverlayBridge } from "@/lib/applicationOverlay";

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

test("universal overlay click path reaches the bridge handler and updates the local status summary", async () => {
  if (!browser) return test.skip(launchError?.message ?? "Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent("<html><body><main>Application form</main><input data-applypilot-field-id=\"field-1\" id=\"email\" aria-label=\"Email\" value=\"wrong@example.com\" /></body></html>");

  const actions: string[] = [];
  await registerApplicationOverlayBridge(page, async ({ sessionId, action, correction }) => {
    actions.push(`${sessionId}:${action}`);
    if (action === "report-wrong-answer") {
      assert.equal(correction?.fieldSelector, '[data-applypilot-field-id="field-1"]');
      assert.equal(correction?.visibleFieldQuestion, "Email");
      assert.equal(correction?.enteredValue, "wrong@example.com");
      assert.equal(correction?.correctedValue, "right@example.com");
      return {
        ok: true,
        status: "Finished",
        message: "Correction saved locally."
      };
    }

    return {
      ok: true,
      status: "Finished",
      message: "14 fields completed / 3 need your input / Ready for review",
      unresolved: [
        { label: "Country", reason: "Needs an exact dropdown mapping" },
        { label: "Work authorization", reason: "Sensitive question requires your review" }
      ]
    };
  });

  await ensureApplicationOverlay(page, "session-workday");
  await page.locator("#applypilot-overlay summary").click();
  await page.getByRole("button", { name: "Fill this page" }).click();

  await page.waitForFunction(() => {
    const status = document.querySelector("#applypilot-overlay .status");
    return status?.textContent === "Finished";
  });

  assert.deepEqual(actions, ["session-workday:fill-page"]);
  assert.equal((await page.locator("#applypilot-overlay .status").textContent()) ?? "", "Finished");
  assert.match((await page.locator("#applypilot-overlay .details").textContent()) ?? "", /Country: Needs an exact dropdown mapping/);
  assert.match((await page.locator("#applypilot-overlay .result").textContent()) ?? "", /14 fields completed/);

  await page.locator("#email").focus();
  await page.getByRole("button", { name: "Report a wrong answer" }).click();
  await page.getByLabel("Correct value").fill("right@example.com");
  await page.getByRole("button", { name: "Save correction" }).click();
  await page.waitForFunction(() => {
    const result = document.querySelector("#applypilot-overlay .result");
    return /Correction saved locally/.test(result?.textContent || "");
  });
  assert.deepEqual(actions, ["session-workday:fill-page", "session-workday:report-wrong-answer"]);
});

test("universal overlay does not duplicate itself and survives navigation", async () => {
  if (!browser) return test.skip(launchError?.message ?? "Playwright launch is unavailable in this sandboxed test environment.");
  await registerApplicationOverlayBridge(page, async () => ({
    ok: true,
    status: "Ready",
    message: "Ready"
  }));

  await page.setContent("<html><body><main>Page one</main></body></html>");
  await ensureApplicationOverlay(page, "session-universal");
  await ensureApplicationOverlay(page, "session-universal");

  assert.equal(await page.locator("#applypilot-overlay").count(), 1);

  await page.goto("data:text/html,<html><body><main>Page two</main></body></html>", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#applypilot-overlay").length === 1);
  assert.equal(await page.locator("#applypilot-overlay").count(), 1);
  assert.equal(await page.locator("#applypilot-overlay .summary-status").textContent(), "Ready");
});

test("overlay actions run on the page where the user clicked, not an older tab in the same context", async () => {
  if (!browser) return test.skip(launchError?.message ?? "Playwright launch is unavailable in this sandboxed test environment.");
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  try {
    await pageA.setContent("<html><body><main>Login barrier</main></body></html>");
    await pageB.setContent("<html><body><main>Application form</main><input id=\"city\" aria-label=\"City\" /></body></html>");

    const actions: string[] = [];
    await registerApplicationOverlayBridge(pageA, async ({ page: sourcePage, action }) => {
      const label = sourcePage === pageB ? "page-b" : sourcePage === pageA ? "page-a" : "unknown";
      actions.push(`${label}:${action}`);
      return {
        ok: true,
        status: "Finished",
        message: `Handled on ${label}`
      };
    });

    await ensureApplicationOverlay(pageA, "session-workday");
    await ensureApplicationOverlay(pageB, "session-workday");

    await pageB.locator("#applypilot-overlay summary").click();
    await pageB.getByRole("button", { name: "Fill this page" }).click();
    await pageB.waitForFunction(() => {
      const result = document.querySelector("#applypilot-overlay .result");
      return /Handled on page-b/.test(result?.textContent || "");
    });

    assert.deepEqual(actions, ["page-b:fill-page"]);
  } finally {
    await context.close();
  }
});
