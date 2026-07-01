import assert from "node:assert/strict";
import { after, before, beforeEach, afterEach, test } from "node:test";

import { chromium, type Browser, type Page } from "playwright";

import { detectCaptcha, summarizePageWarnings } from "@/lib/playwrightSession";

let browser: Browser;
let page: Page;

before(async () => {
  browser = await chromium.launch({ headless: true });
});

beforeEach(async () => {
  page = await browser.newPage();
  await page.route("https://example.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body></body></html>"
    });
  });
});

afterEach(async () => {
  if (page && !page.isClosed()) {
    await page.close();
  }
});

after(async () => {
  await browser.close();
});

test("page without captcha markers is not blocked", async () => {
  await page.setContent(`
    <label for="email">Email</label>
    <input id="email" type="email" style="display:block;width:220px;height:32px" />
  `);

  const captcha = await detectCaptcha(page);
  assert.equal(captcha.status, "none");
  assert.equal(captcha.blocking, false);
});

test("provider script without visible widget is only a background marker", async () => {
  await page.setContent(`
    <script src="https://example.com/recaptcha/api.js" async defer></script>
    <label for="email">Email</label>
    <input id="email" type="email" style="display:block;width:220px;height:32px" />
  `);

  const captcha = await detectCaptcha(page);
  const summary = await summarizePageWarnings(page);
  assert.equal(captcha.status, "background_marker");
  assert.equal(captcha.blocking, false);
  assert.equal(summary.warnings.some((warning) => /human verification|captcha/i.test(warning)), false);
});

test("hidden recaptcha iframe is not treated as a visible challenge", async () => {
  await page.setContent(`
    <iframe src="https://example.com/recaptcha/api2/anchor" title="recaptcha" style="display:none;width:300px;height:78px"></iframe>
    <label for="name">Name</label>
    <input id="name" type="text" style="display:block;width:220px;height:32px" />
  `);

  const captcha = await detectCaptcha(page);
  assert.equal(captcha.status, "background_marker");
  assert.equal(captcha.blocking, false);
});

test("visible invisible-size recaptcha anchors stay background markers", async () => {
  await page.setContent(`
    <iframe
      src="https://example.com/recaptcha/enterprise/anchor?size=invisible"
      title="reCAPTCHA"
      style="display:block;width:256px;height:60px"
    ></iframe>
    <label for="email">Email</label>
    <input id="email" type="email" style="display:block;width:220px;height:32px" />
  `);

  const captcha = await detectCaptcha(page);
  const summary = await summarizePageWarnings(page);
  assert.equal(captcha.status, "background_marker");
  assert.equal(captcha.blocking, false);
  assert.equal(summary.warnings.some((warning) => /human verification|captcha/i.test(warning)), false);
});

test("visible captcha containers do not warn when their interactive children are hidden", async () => {
  await page.setContent(`
    <div class="h-captcha" style="display:block;width:320px;height:78px">
      <iframe
        src="https://example.com/hcaptcha?size=invisible"
        title="Widget containing checkbox for hCaptcha security challenge"
        style="display:block;width:304px;height:78px;visibility:hidden"
      ></iframe>
    </div>
    <label for="phone">Phone</label>
    <input id="phone" type="tel" style="display:block;width:220px;height:32px" />
  `);

  const captcha = await detectCaptcha(page);
  const summary = await summarizePageWarnings(page);
  assert.equal(captcha.status, "background_marker");
  assert.equal(captcha.blocking, false);
  assert.equal(summary.warnings.some((warning) => /human verification|captcha/i.test(warning)), false);
});

test("visible hcaptcha enclave iframes stay background markers", async () => {
  await page.setContent(`
    <iframe
      src="https://newassets.hcaptcha.com/captcha/v1/example/static/hcaptcha-enclave.html#frame=enclave"
      title="hCaptcha"
      style="display:block;width:1280px;height:720px"
    ></iframe>
    <label for="email">Email</label>
    <input id="email" type="email" style="display:block;width:220px;height:32px" />
  `);

  const captcha = await detectCaptcha(page);
  const summary = await summarizePageWarnings(page);
  assert.equal(captcha.status, "background_marker");
  assert.equal(captcha.blocking, false);
  assert.equal(summary.warnings.some((warning) => /human verification|captcha/i.test(warning)), false);
});

test("visible recaptcha challenge is confirmed and blocking", async () => {
  await page.setContent(`
    <div style="width:304px;height:78px;border:1px solid #ccc">
      <iframe src="https://example.com/recaptcha/api2/anchor" title="reCAPTCHA" style="display:block;width:304px;height:78px"></iframe>
    </div>
  `);

  const captcha = await detectCaptcha(page);
  const summary = await summarizePageWarnings(page);
  assert.equal(captcha.status, "confirmed_visible_challenge");
  assert.equal(captcha.blocking, true);
  assert.equal(summary.warnings.some((warning) => /human verification/i.test(warning)), true);
});

test("hidden informational text mentioning captcha does not confirm a challenge", async () => {
  await page.setContent(`
    <div style="display:none">captcha information</div>
    <label for="phone">Phone</label>
    <input id="phone" type="tel" style="display:block;width:220px;height:32px" />
  `);

  const captcha = await detectCaptcha(page);
  assert.equal(captcha.status, "none");
  assert.equal(captcha.blocking, false);
});
