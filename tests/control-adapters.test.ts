import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";

import { chromium, type Browser, type Page } from "playwright";

import { fillField } from "@/lib/playwrightSession";
import { DetectedField } from "@/types";

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

function detectedField(overrides: Partial<DetectedField>): DetectedField {
  return {
    id: "field-1",
    label: "Field",
    name: "field",
    domId: "field",
    type: "text",
    selector: "#field",
    detectedValue: "",
    suggestedValue: "",
    confidence: 0.95,
    confidenceLevel: "high",
    status: "needs_review",
    reason: "",
    sensitivity: "safe",
    autoFillAllowed: true,
    intent: "unknown",
    reviewCategory: null,
    answerSource: "explicit_profile",
    verificationStatus: "not_attempted",
    ...overrides
  };
}

test("native selects work and are verified", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <label for="country_code">Country code</label>
    <select id="country_code">
      <option value="">Select</option>
      <option>United States (+1)</option>
      <option>United Kingdom (+44)</option>
    </select>
  `);

  const result = await fillField(
    page,
    detectedField({
      label: "Country code",
      type: "select-one",
      selector: "#country_code",
      controlType: "native_select",
      intent: "phone_country_code"
    }),
    "United States (+1)"
  );

  assert.equal(result.success, true);
  assert.match(result.actualValue, /United States/);
});

test("native selects verify correctly when option values differ from labels", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <label for="work_auth_status">Work authorization</label>
    <select id="work_auth_status">
      <option value="">Select</option>
      <option value="us_citizen">US Citizen</option>
      <option value="permanent_resident">Permanent Resident</option>
    </select>
  `);

  const result = await fillField(
    page,
    detectedField({
      label: "Current work authorization status",
      type: "select-one",
      selector: "#work_auth_status",
      controlType: "native_select",
      intent: "work_authorization_category"
    }),
    "US Citizen"
  );

  assert.equal(result.success, true);
  assert.equal(result.actualValue, "US Citizen");
});

test("ARIA comboboxes work and are verified", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <label for="city_combo">City</label>
    <input id="city_combo" role="combobox" aria-controls="city_listbox" />
    <div id="city_listbox" role="listbox" style="display:none;border:1px solid #ccc">
      <div role="option" data-value="Boston, Massachusetts, United States">Boston, Massachusetts, United States</div>
      <div role="option" data-value="Berlin, Berlin, Germany">Berlin, Berlin, Germany</div>
    </div>
    <script>
      const input = document.getElementById('city_combo');
      const list = document.getElementById('city_listbox');
      input.addEventListener('click', () => { list.style.display = 'block'; });
      input.addEventListener('input', () => { list.style.display = 'block'; });
      for (const option of list.querySelectorAll('[role="option"]')) {
        option.addEventListener('click', () => {
          input.value = option.getAttribute('data-value');
          list.style.display = 'none';
        });
      }
    </script>
  `);

  const result = await fillField(
    page,
    detectedField({
      label: "City",
      selector: "#city_combo",
      type: "search",
      controlType: "aria_combobox",
      role: "combobox",
      intent: "city"
    }),
    "Boston, Massachusetts, United States"
  );

  assert.equal(result.success, true);
  assert.match(result.actualValue, /Boston/);
});

test("custom menu-button dropdowns work through the custom adapter", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <button id="clearance_button" aria-haspopup="listbox" type="button">Select clearance</button>
    <div id="clearance_menu" role="listbox" style="display:none;border:1px solid #ccc">
      <div role="option">None</div>
      <div role="option">Secret</div>
      <div role="option">Top Secret</div>
    </div>
    <script>
      const button = document.getElementById('clearance_button');
      const menu = document.getElementById('clearance_menu');
      button.addEventListener('click', () => { menu.style.display = 'block'; });
      for (const option of menu.querySelectorAll('[role="option"]')) {
        option.addEventListener('click', () => {
          button.textContent = option.textContent;
          menu.style.display = 'none';
        });
      }
    </script>
  `);

  const result = await fillField(
    page,
    detectedField({
      label: "Security clearance",
      selector: "#clearance_button",
      type: "text",
      controlType: "menu_button",
      intent: "security_clearance_level"
    }),
    "Secret"
  );

  assert.equal(result.success, true);
  assert.equal(result.actualValue.trim(), "Secret");
});

test("radio groups verify the selected option instead of the first input in the group", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <fieldset>
      <legend>Work authorization</legend>
      <label><input type="radio" name="work_auth" id="work_auth_no" value="no" /> No</label>
      <label><input type="radio" name="work_auth" id="work_auth_yes" value="yes" /> Yes</label>
    </fieldset>
  `);

  const result = await fillField(
    page,
    detectedField({
      label: "Are you authorized to work in the U.S.?",
      name: "work_auth",
      type: "radio",
      selector: "#work_auth_no",
      controlType: "radio",
      intent: "work_authorization",
      selectOptions: ["No", "Yes"],
      questionText: "Are you authorized to work in the U.S.?"
    }),
    "yes"
  );

  assert.equal(result.success, true);
  assert.match(result.actualValue, /yes/i);
  assert.equal(await page.locator("#work_auth_yes").isChecked(), true);
  assert.equal(await page.locator("#work_auth_no").isChecked(), false);
});

test("radio groups without a name attribute still fill and verify through their local container", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <div class="application-question">
      <div>Are you authorized to work in the U.S.?</div>
      <label><input type="radio" id="work_auth_custom_no" value="no" /> No</label>
      <label><input type="radio" id="work_auth_custom_yes" value="yes" /> Yes</label>
    </div>
  `);

  const result = await fillField(
    page,
    detectedField({
      label: "Are you authorized to work in the U.S.?",
      name: "",
      type: "radio",
      selector: "#work_auth_custom_no",
      controlType: "radio",
      intent: "work_authorization",
      selectOptions: ["No", "Yes"],
      questionText: "Are you authorized to work in the U.S.?"
    }),
    "yes"
  );

  assert.equal(result.success, true);
  assert.match(result.actualValue, /yes/i);
  assert.equal(await page.locator("#work_auth_custom_yes").isChecked(), true);
  assert.equal(await page.locator("#work_auth_custom_no").isChecked(), false);
});

test("grouped checkbox questions select the matching option and uncheck the rest", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <fieldset>
      <legend>What gender do you identify as?</legend>
      <label><input type="checkbox" name="gender_identity" id="gender_female" /> Female</label>
      <label><input type="checkbox" name="gender_identity" id="gender_male" /> Male</label>
      <label><input type="checkbox" name="gender_identity" id="gender_nonbinary" /> Non-binary</label>
      <label><input type="checkbox" name="gender_identity" id="gender_decline" /> Prefer not to answer</label>
    </fieldset>
  `);

  const result = await fillField(
    page,
    detectedField({
      label: "What gender do you identify as?",
      name: "gender_identity",
      type: "checkbox",
      selector: "#gender_female",
      controlType: "checkbox",
      intent: "eeoc_gender",
      selectOptions: ["Female", "Male", "Non-binary", "Prefer not to answer"],
      questionText: "What gender do you identify as?"
    }),
    "Man / Male"
  );

  assert.equal(result.success, true);
  assert.match(result.actualValue, /male/i);
  assert.equal(await page.locator("#gender_male").isChecked(), true);
  assert.equal(await page.locator("#gender_female").isChecked(), false);
  assert.equal(await page.locator("#gender_nonbinary").isChecked(), false);
  assert.equal(await page.locator("#gender_decline").isChecked(), false);
});

test("failed selections are not reported as successful", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <label for="state_field">State</label>
    <select id="state_field">
      <option value="">Select</option>
      <option>NY</option>
      <option>CA</option>
    </select>
  `);

  await assert.rejects(
    fillField(
      page,
      detectedField({
        label: "State",
        type: "select-one",
        selector: "#state_field",
        controlType: "native_select",
        intent: "state"
      }),
      "MA"
    )
  );
});

test("file uploads stay verified even when the input re-renders", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  const tempDir = mkdtempSync(path.join(tmpdir(), "applypilot-upload-"));
  const resumePath = path.join(tempDir, "resume.txt");
  writeFileSync(resumePath, "resume");

  await page.setContent(`
    <div id="resume-field">
      <label for="resume_upload">Resume</label>
      <input id="resume_upload" type="file" />
    </div>
    <script>
      const field = document.getElementById('resume-field');
      const input = document.getElementById('resume_upload');
      input.addEventListener('change', () => {
        field.innerHTML = '<label>Resume</label><div class=\"uploaded-file\">resume.txt</div>';
      });
    </script>
  `);

  const result = await fillField(
    page,
    detectedField({
      label: "Resume",
      type: "file",
      selector: "#resume_upload",
      controlType: "file",
      intent: "resume_upload"
    }),
    resumePath
  );

  assert.equal(result.success, true);
  assert.equal(result.actualValue, "resume.txt");
});

test("stale selectors recover by rescanning the current page before fill", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <div id="field-shell">
      <label for="school_field">School</label>
      <input id="school_field" type="text" />
    </div>
  `);

  const selector = '[data-applypilot-field-id="stale_school"]';
  await page.locator("#school_field").evaluate((element) => {
    element.setAttribute("data-applypilot-field-id", "stale_school");
  });

  await page.locator("#field-shell").evaluate((container) => {
    container.innerHTML = '<label for="school_field_rerendered">School</label><input id="school_field_rerendered" type="text" />';
  });

  const result = await fillField(
    page,
    detectedField({
      label: "School",
      name: "",
      domId: "",
      type: "text",
      selector,
      controlType: "text",
      intent: "education_school",
      questionText: "School"
    }),
    "Marist College"
  );

  assert.equal(result.success, true);
  assert.equal(await page.locator("#school_field_rerendered").inputValue(), "Marist College");
});
