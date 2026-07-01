import assert from "node:assert/strict";
import test from "node:test";

import { getOrCreateBrowserContext, resetBrowserManagerForTests } from "@/lib/browserManager";
import { dismissCookieConsentIfPresent } from "@/lib/consentBarrier";

Object.assign(process.env, { NODE_ENV: "test" });

test("dismissCookieConsentIfPresent closes a visible cookie dialog", async () => {
  await resetBrowserManagerForTests();

  const context = await getOrCreateBrowserContext();
  const page = await context.newPage();
  await page.setContent(`
    <button id="apply">Apply for this job</button>
    <div role="dialog" aria-label="Cookie Consent">
      <button id="accept">Accept</button>
    </div>
    <script>
      document.getElementById('accept')?.addEventListener('click', () => {
        document.querySelector('[role="dialog"]')?.remove();
      });
    </script>
  `);

  const dismissed = await dismissCookieConsentIfPresent(page);
  assert.equal(dismissed, true);
  assert.equal(await page.locator('[role="dialog"]').count(), 0);

  await page.close();
  await resetBrowserManagerForTests();
});

test("dismissCookieConsentIfPresent waits briefly for delayed cookie dialogs", async () => {
  await resetBrowserManagerForTests();

  const context = await getOrCreateBrowserContext();
  const page = await context.newPage();
  await page.setContent(`
    <script>
      setTimeout(() => {
        const dialog = document.createElement('div');
        dialog.setAttribute('data-ui', 'cookie-consent');
        dialog.setAttribute('role', 'dialog');
        dialog.innerHTML = '<button id="accept-late">Accept all</button>';
        document.body.appendChild(dialog);
        document.getElementById('accept-late')?.addEventListener('click', () => dialog.remove());
      }, 250);
    </script>
  `);

  const dismissed = await dismissCookieConsentIfPresent(page, { waitForAppearanceMs: 1_000 });
  assert.equal(dismissed, true);
  assert.equal(await page.locator('[data-ui="cookie-consent"]').count(), 0);

  await page.close();
  await resetBrowserManagerForTests();
});

test("dismissCookieConsentIfPresent ignores cookie settings buttons and clicks an actual dismiss action", async () => {
  await resetBrowserManagerForTests();

  const context = await getOrCreateBrowserContext();
  const page = await context.newPage();
  await page.setContent(`
    <div data-ui="cookie-consent" role="dialog">
      <button id="settings">Cookies settings</button>
      <button id="accept">Accept all</button>
    </div>
    <script>
      document.getElementById('settings')?.addEventListener('click', () => {
        document.body.setAttribute('data-settings-opened', 'true');
      });
      document.getElementById('accept')?.addEventListener('click', () => {
        document.querySelector('[data-ui="cookie-consent"]')?.remove();
      });
    </script>
  `);

  const dismissed = await dismissCookieConsentIfPresent(page);
  assert.equal(dismissed, true);
  assert.equal(await page.locator('[data-ui="cookie-consent"]').count(), 0);
  assert.equal(await page.getAttribute('body', 'data-settings-opened'), null);

  await page.close();
  await resetBrowserManagerForTests();
});
