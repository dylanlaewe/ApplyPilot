import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";

import { chromium, type Browser, type Page } from "playwright";

import { createDefaultAnswerBank } from "@/lib/answerBank";
import { buildSuggestedFields } from "@/lib/fieldMapping";
import { fillField } from "@/lib/playwrightSession";
import { scanVisibleFields } from "@/lib/playwrightSession";
import { createDefaultProfile, normalizeProfile } from "@/lib/profile";
import { applyWorkdaySafeModeRules } from "@/lib/workdaySafeMode";
import { DetectedField, ApplicantProfile } from "@/types";

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

function createWorkdayPhoneProfile(): ApplicantProfile {
  const base = createDefaultProfile();
  return normalizeProfile({
    ...base,
    identity: {
      ...base.identity,
      phoneCountry: "United States of America",
      phoneCountryCode: "+1",
      phoneNationalNumber: "6175550117",
      phoneExtension: null
    },
    additionalApplicationFacts: {
      ...base.additionalApplicationFacts,
      phoneDeviceType: "Mobile"
    }
  });
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

test("custom comboboxes prefer the active control's options over unrelated hidden lists", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <div style="display:none">
      <ul>
        <li role="option">Hidden wrong option</li>
      </ul>
    </div>
    <div class="select">
      <label for="candidate-location">Location</label>
      <input id="candidate-location" role="combobox" class="select__input" aria-autocomplete="list" />
      <div class="select__menu">
        <div id="react-select-candidate-location-listbox" role="listbox">
          <div role="option">Boston, Massachusetts, United States</div>
          <div role="option">Boston, Lincolnshire, United Kingdom</div>
        </div>
      </div>
    </div>
    <script>
      const input = document.getElementById('candidate-location');
      for (const option of document.querySelectorAll('#react-select-candidate-location-listbox [role="option"]')) {
        option.addEventListener('click', () => {
          input.value = option.textContent.trim();
          input.setAttribute('aria-invalid', 'false');
        });
      }
    </script>
  `);

  const result = await fillField(
    page,
    detectedField({
      label: "Location",
      selector: "#candidate-location",
      type: "text",
      controlType: "aria_combobox",
      role: "combobox",
      intent: "city"
    }),
    "Boston, Massachusetts, United States"
  );

  assert.equal(result.success, true);
  assert.equal(await page.locator("#candidate-location").inputValue(), "Boston, Massachusetts, United States");
});

test("searchable comboboxes do not retype once the correct options are visible", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <div class="application-question">
      <label for="candidate-location">Location</label>
      <div class="select__container">
        <input id="candidate-location" role="combobox" aria-autocomplete="list" aria-invalid="true" />
        <div class="select__single-value"></div>
      </div>
      <div id="react-select-candidate-location-listbox" role="listbox" style="display:none">
        <div role="option">Boston, Massachusetts, United States</div>
        <div role="option">Boston, Lincolnshire, United Kingdom</div>
      </div>
    </div>
    <script>
      const input = document.getElementById('candidate-location');
      const wrapper = document.querySelector('.select__container');
      const selected = document.querySelector('.select__single-value');
      const list = document.getElementById('react-select-candidate-location-listbox');
      let inputCount = 0;
      input.addEventListener('input', () => {
        inputCount += 1;
        list.style.display = 'block';
      });
      for (const option of list.querySelectorAll('[role="option"]')) {
        option.addEventListener('click', () => {
          selected.textContent = option.textContent.trim();
          input.value = '';
          list.style.display = 'none';
          input.setAttribute('aria-invalid', inputCount === 1 ? 'false' : 'true');
          wrapper.setAttribute('data-input-count', String(inputCount));
        });
      }
    </script>
  `);

  const result = await fillField(
    page,
    detectedField({
      label: "Location",
      selector: "#candidate-location",
      type: "text",
      controlType: "aria_combobox",
      role: "combobox",
      intent: "city"
    }),
    "Boston, Massachusetts, United States"
  );

  assert.equal(result.success, true);
  assert.equal(await page.locator(".select__container").getAttribute("data-input-count"), "1");
});

test("searchable comboboxes do not press enter after a click-committed selection", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <fieldset class="application-question">
      <legend>Phone</legend>
      <label for="country_combo">Country</label>
      <div class="select__container">
        <input id="country_combo" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-invalid="false" />
        <div class="select__single-value"></div>
      </div>
      <div id="country_listbox" role="listbox" style="display:none">
        <div role="option">United States (+1)</div>
        <div role="option">Canada (+1)</div>
      </div>

      <label for="phone_field">Phone</label>
      <input id="phone_field" type="tel" aria-invalid="false" />
      <div id="phone_error" role="alert" style="display:none">Phone is required.</div>
    </fieldset>
    <script>
      const countryInput = document.getElementById('country_combo');
      const countryList = document.getElementById('country_listbox');
      const selected = document.querySelector('.select__single-value');
      const phone = document.getElementById('phone_field');
      const phoneError = document.getElementById('phone_error');

      const openList = () => {
        countryList.style.display = 'block';
        countryInput.setAttribute('aria-expanded', 'true');
      };
      const closeList = () => {
        countryList.style.display = 'none';
        countryInput.setAttribute('aria-expanded', 'false');
      };

      countryInput.addEventListener('click', openList);
      countryInput.addEventListener('input', openList);

      for (const option of countryList.querySelectorAll('[role="option"]')) {
        option.addEventListener('click', () => {
          selected.textContent = option.textContent.trim();
          countryInput.value = '';
          closeList();
        });
      }

      countryInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || countryInput.getAttribute('aria-expanded') === 'true') return;
        phone.setAttribute('aria-invalid', 'true');
        phone.setAttribute('aria-describedby', 'phone_error');
        phoneError.style.display = 'block';
      });

      phone.addEventListener('input', () => {
        phone.setAttribute('aria-invalid', 'false');
        phone.removeAttribute('aria-describedby');
        phoneError.style.display = 'none';
      });
    </script>
  `);

  await fillField(
    page,
    detectedField({
      label: "Country",
      selector: "#country_combo",
      type: "text",
      controlType: "aria_combobox",
      role: "combobox",
      intent: "phone_country_code"
    }),
    "United States (+1)"
  );

  assert.equal(await page.locator(".select__single-value").textContent(), "United States (+1)");
  assert.equal(await page.locator("#phone_field").getAttribute("aria-invalid"), "false");
});

test("Brown-style Workday phone clusters scan, suppress helper surfaces, and fill exact country/device selections", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <fieldset class="application-question">
      <legend>Phone</legend>

      <div class="field-wrapper">
        <label for="country_phone_code">Country Phone Code</label>
        <button id="country_phone_code" type="button" aria-haspopup="listbox" aria-controls="country_phone_code_listbox">Select One</button>
      </div>
      <div id="country_phone_code_listbox" role="listbox" style="display:none">
        <div role="option">United States of America (+1)</div>
        <div role="option">U.S. Virgin Islands (+1)</div>
        <div role="option">Canada (+1)</div>
      </div>

      <div class="field-wrapper">
        <label for="phone_number">Phone Number</label>
        <input id="phone_number" name="phone_number" type="tel" />
      </div>

      <div class="field-wrapper">
        <label for="phone_extension">Phone Extension</label>
        <input id="phone_extension" name="phone_extension" type="text" />
      </div>

      <div class="field-wrapper">
        <label for="phone_device_type">Phone Device Type</label>
        <button id="phone_device_type" type="button" aria-haspopup="listbox" aria-controls="phone_device_type_listbox">Select One</button>
      </div>
      <div id="phone_device_type_listbox" role="listbox" style="display:none">
        <div role="option">Home</div>
        <div role="option">Mobile</div>
        <div role="option">Work</div>
      </div>
    </fieldset>
    <script>
      const wireMenu = (buttonId, listboxId) => {
        const button = document.getElementById(buttonId);
        const listbox = document.getElementById(listboxId);
        button.addEventListener('click', () => {
          listbox.style.display = 'block';
          button.setAttribute('aria-expanded', 'true');
          listbox.setAttribute('aria-label', 'items selected');
        });
        for (const option of listbox.querySelectorAll('[role="option"]')) {
          option.addEventListener('click', () => {
            button.textContent = option.textContent.trim();
            listbox.style.display = 'none';
            button.setAttribute('aria-expanded', 'false');
          });
        }
      };
      wireMenu('country_phone_code', 'country_phone_code_listbox');
      wireMenu('phone_device_type', 'phone_device_type_listbox');
      document.getElementById('country_phone_code').click();
      document.getElementById('phone_device_type').click();
    </script>
  `);

  const rawFields = await scanVisibleFields(page);
  const profile = createWorkdayPhoneProfile();
  const suggested = buildSuggestedFields(rawFields, profile, createDefaultAnswerBank());
  const workdayFields = applyWorkdaySafeModeRules(suggested);

  assert.equal(workdayFields.some((field) => field.controlType === "listbox" && field.intent === "phone_country_code"), false);

  const countryPhoneCode = workdayFields.find((field) => field.intent === "phone_country_code");
  const phoneNumber = workdayFields.find((field) => field.intent === "phone_number");
  const phoneExtension = workdayFields.find((field) => field.intent === "phone_extension");
  const phoneDeviceType = workdayFields.find((field) => field.intent === "phone_device_type");

  assert.equal(countryPhoneCode?.matchedOption, "United States of America (+1)");
  assert.equal(countryPhoneCode?.suggestedValue, "United States of America (+1)");
  assert.equal(phoneNumber?.suggestedValue, "6175550117");
  assert.equal(phoneExtension?.status, "skipped");
  assert.equal(phoneDeviceType?.matchedOption, "Mobile");

  const countryResult = await fillField(page, countryPhoneCode!, countryPhoneCode!.matchedOption || countryPhoneCode!.suggestedValue);
  const phoneResult = await fillField(page, phoneNumber!, phoneNumber!.suggestedValue);
  const deviceResult = await fillField(page, phoneDeviceType!, phoneDeviceType!.matchedOption || phoneDeviceType!.suggestedValue);

  assert.equal(countryResult.success, true);
  assert.equal(phoneResult.success, true);
  assert.equal(deviceResult.success, true);
  assert.equal(await page.locator("#country_phone_code").textContent(), "United States of America (+1)");
  assert.equal(await page.locator("#phone_number").inputValue(), "6175550117");
  assert.equal(await page.locator("#phone_device_type").textContent(), "Mobile");
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

test("custom resume buttons can upload through a revealed hidden file input", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  const tempDir = mkdtempSync(path.join(tmpdir(), "applypilot-custom-upload-"));
  const resumePath = path.join(tempDir, "resume.txt");
  writeFileSync(resumePath, "resume");

  await page.setContent(`
    <div data-applypilot-group-id="resume_group">
      <h3 id="resume_header">Add Resume*</h3>
      <button id="resume_button" type="button" aria-labelledby="resume_header" aria-haspopup="true">Select</button>
      <div id="resume_menu" hidden>
        <label for="resume_upload">File</label>
      </div>
      <input id="resume_upload" type="file" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;" />
      <div id="resume_result"></div>
    </div>
    <script>
      const button = document.getElementById('resume_button');
      const menu = document.getElementById('resume_menu');
      const input = document.getElementById('resume_upload');
      const result = document.getElementById('resume_result');
      button.addEventListener('click', () => {
        menu.hidden = false;
        button.setAttribute('aria-expanded', 'true');
      });
      input.addEventListener('change', () => {
        const name = input.files?.[0]?.name || '';
        button.textContent = name;
        menu.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        result.textContent = name;
      });
    </script>
  `);

  const result = await fillField(
    page,
    detectedField({
      label: "Add Resume*",
      type: "text",
      selector: "#resume_button",
      controlType: "menu_button",
      intent: "resume_upload",
      questionText: "Add Resume"
    }),
    resumePath
  );

  assert.equal(result.success, true);
  assert.equal(result.actualValue, "resume.txt");
  assert.equal(await page.locator("#resume_result").textContent(), "resume.txt");
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

test("phone formatting adapts to the target control before verification", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <label for="phone_field">Phone</label>
    <input id="phone_field" type="tel" placeholder="(555) 555-5555" />
  `);

  const result = await fillField(
    page,
    detectedField({
      label: "Phone",
      type: "tel",
      selector: "#phone_field",
      controlType: "text",
      intent: "full_phone_number"
    }),
    "+1 7815551234"
  );

  assert.equal(result.success, true);
  assert.equal(await page.locator("#phone_field").inputValue(), "(781) 555-1234");
});

test("visible values without a committed framework update are rejected", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <div class="form-field">
      <label for="street_address">Street address</label>
      <input id="street_address" aria-describedby="street_address_error" />
      <div id="street_address_error" class="field-error" role="alert">This field is required.</div>
    </div>
    <script>
      const input = document.getElementById('street_address');
      const error = document.getElementById('street_address_error');
      input.addEventListener('input', () => {
        input.setAttribute('data-visible-value', input.value);
      });
      input.addEventListener('change', () => {
        error.textContent = 'This field is required.';
        input.setAttribute('aria-invalid', 'true');
        input.setCustomValidity('This field is required.');
      });
      input.addEventListener('blur', () => {
        error.textContent = 'This field is required.';
        input.setAttribute('aria-invalid', 'true');
        input.setCustomValidity('This field is required.');
      });
    </script>
  `);

  await assert.rejects(
    fillField(
      page,
      detectedField({
        label: "Street address",
        type: "text",
        selector: "#street_address",
        controlType: "text",
        intent: "street_address"
      }),
      "123 Main St"
    ),
    /validation error|did not commit/i
  );
});

test("Greenhouse-style controlled fields only pass when the form state commits and required errors clear", async () => {
  if (!browser) return test.skip("Playwright launch is unavailable in this sandboxed test environment.");
  await page.setContent(`
    <form id="greenhouse-form">
      <div class="form-field" data-key="address">
        <label for="street_address">Street address</label>
        <input id="street_address" aria-describedby="street_address_error" />
        <div id="street_address_error" class="field-error" role="alert"></div>
      </div>
      <div class="form-field" data-key="city">
        <label for="city_field">City</label>
        <input id="city_field" aria-describedby="city_field_error" />
        <div id="city_field_error" class="field-error" role="alert"></div>
      </div>
      <div class="form-field" data-key="state">
        <label for="state_field">State</label>
        <select id="state_field" aria-describedby="state_field_error">
          <option value="">Select</option>
          <option value="MA">MA</option>
          <option value="PA">PA</option>
        </select>
        <div id="state_field_error" class="field-error" role="alert"></div>
      </div>
      <div class="form-field" data-key="zip">
        <label for="zip_field">ZIP code</label>
        <input id="zip_field" aria-describedby="zip_field_error" />
        <div id="zip_field_error" class="field-error" role="alert"></div>
      </div>
      <div class="form-field" data-key="workAuth">
        <label for="work_auth_field">Work authorization</label>
        <select id="work_auth_field" aria-describedby="work_auth_field_error">
          <option value="">Select</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
        <div id="work_auth_field_error" class="field-error" role="alert"></div>
      </div>
      <div class="form-field" data-key="clearance">
        <label for="clearance_field">Security clearance</label>
        <select id="clearance_field" aria-describedby="clearance_field_error">
          <option value="">Select</option>
          <option value="None">None</option>
          <option value="Secret">Secret</option>
        </select>
        <div id="clearance_field_error" class="field-error" role="alert"></div>
      </div>
      <div class="form-field" data-key="education">
        <label for="education_field">Highest education</label>
        <select id="education_field" aria-describedby="education_field_error">
          <option value="">Select</option>
          <option value="Bachelor's degree">Bachelor's degree</option>
          <option value="Master's degree">Master's degree</option>
        </select>
        <div id="education_field_error" class="field-error" role="alert"></div>
      </div>
      <div class="form-field" data-key="graduated">
        <label for="graduated_field">Did you graduate?</label>
        <select id="graduated_field" aria-describedby="graduated_field_error">
          <option value="">Select</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
        <div id="graduated_field_error" class="field-error" role="alert"></div>
      </div>
      <div class="form-field" data-key="linkedin">
        <label for="linkedin_field">LinkedIn URL</label>
        <input id="linkedin_field" aria-describedby="linkedin_field_error" />
        <div id="linkedin_field_error" class="field-error" role="alert"></div>
      </div>
      <div class="form-field" data-key="website">
        <label for="website_field">Website</label>
        <input id="website_field" aria-describedby="website_field_error" />
        <div id="website_field_error" class="field-error" role="alert"></div>
      </div>
    </form>
    <script>
      const state = {
        address: '',
        city: '',
        state: '',
        zip: '',
        workAuth: '',
        clearance: '',
        education: '',
        graduated: '',
        linkedin: '',
        website: ''
      };
      const mapping = {
        street_address: 'address',
        city_field: 'city',
        state_field: 'state',
        zip_field: 'zip',
        work_auth_field: 'workAuth',
        clearance_field: 'clearance',
        education_field: 'education',
        graduated_field: 'graduated',
        linkedin_field: 'linkedin',
        website_field: 'website'
      };

      const updateValidation = (element) => {
        const key = mapping[element.id];
        const error = document.getElementById(element.id + '_error');
        const committed = state[key];
        if (error) {
          error.textContent = committed ? '' : 'This field is required.';
        }
        element.setAttribute('aria-invalid', committed ? 'false' : 'true');
      };

      for (const element of document.querySelectorAll('input, select')) {
        updateValidation(element);
        if (element.tagName === 'SELECT') {
          element.addEventListener('change', () => {
            state[mapping[element.id]] = element.value;
            updateValidation(element);
          });
          element.addEventListener('blur', () => updateValidation(element));
          continue;
        }

        element.addEventListener('input', () => {
          element.setAttribute('data-visible-value', element.value);
        });
        element.addEventListener('change', () => {
          state[mapping[element.id]] = element.value.trim();
          updateValidation(element);
        });
        element.addEventListener('blur', () => {
          state[mapping[element.id]] = element.value.trim();
          updateValidation(element);
        });
      }

      window.__getGreenhouseState = () => ({ ...state });
    </script>
  `);

  const fields: Array<{ field: DetectedField; value: string }> = [
    {
      field: detectedField({ label: "Street address", type: "text", selector: "#street_address", controlType: "text", intent: "street_address" }),
      value: "123 Main St"
    },
    {
      field: detectedField({ label: "City", type: "text", selector: "#city_field", controlType: "text", intent: "city" }),
      value: "Boston"
    },
    {
      field: detectedField({ label: "State", type: "select-one", selector: "#state_field", controlType: "native_select", intent: "state" }),
      value: "MA"
    },
    {
      field: detectedField({ label: "ZIP code", type: "text", selector: "#zip_field", controlType: "text", intent: "postal_code" }),
      value: "02118"
    },
    {
      field: detectedField({
        label: "Work authorization",
        type: "select-one",
        selector: "#work_auth_field",
        controlType: "native_select",
        intent: "work_authorization"
      }),
      value: "Yes"
    },
    {
      field: detectedField({
        label: "Security clearance",
        type: "select-one",
        selector: "#clearance_field",
        controlType: "native_select",
        intent: "security_clearance_level"
      }),
      value: "Secret"
    },
    {
      field: detectedField({
        label: "Highest education",
        type: "select-one",
        selector: "#education_field",
        controlType: "native_select",
        intent: "education_highest_completed"
      }),
      value: "Bachelor's degree"
    },
    {
      field: detectedField({
        label: "Did you graduate?",
        type: "select-one",
        selector: "#graduated_field",
        controlType: "native_select",
        intent: "graduated_question",
        questionText: "Did you graduate?"
      }),
      value: "Yes"
    },
    {
      field: detectedField({ label: "LinkedIn URL", type: "text", selector: "#linkedin_field", controlType: "text", intent: "linkedin" }),
      value: "https://linkedin.com/in/avery-example"
    },
    {
      field: detectedField({ label: "Website", type: "text", selector: "#website_field", controlType: "text", intent: "website" }),
      value: "https://avery.example.com"
    }
  ];

  for (const current of fields) {
    const result = await fillField(page, current.field, current.value);
    assert.equal(result.commitState, "committed");
  }

  const committedState = await page.evaluate(() => (window as typeof window & { __getGreenhouseState: () => Record<string, string> }).__getGreenhouseState());
  assert.deepEqual(committedState, {
    address: "123 Main St",
    city: "Boston",
    state: "MA",
    zip: "02118",
    workAuth: "Yes",
    clearance: "Secret",
    education: "Bachelor's degree",
    graduated: "Yes",
    linkedin: "https://linkedin.com/in/avery-example",
    website: "https://avery.example.com"
  });

  for (const selector of [
    "#street_address_error",
    "#city_field_error",
    "#state_field_error",
    "#zip_field_error",
    "#work_auth_field_error",
    "#clearance_field_error",
    "#education_field_error",
    "#graduated_field_error",
    "#linkedin_field_error",
    "#website_field_error"
  ]) {
    assert.equal(await page.locator(selector).textContent(), "");
  }
});
