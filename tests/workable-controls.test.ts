import assert from "node:assert/strict";
import test from "node:test";

import { getOrCreateBrowserContext, resetBrowserManagerForTests } from "@/lib/browserManager";
import { fillField } from "@/lib/playwrightSession";
import { DetectedField } from "@/types";

Object.assign(process.env, { NODE_ENV: "test" });

function createField(overrides: Partial<DetectedField>): DetectedField {
  return {
    id: "field-1",
    label: "Field",
    name: "",
    domId: "",
    type: "text",
    selector: "#field",
    detectedValue: "",
    suggestedValue: "",
    confidence: 0.99,
    confidenceLevel: "high",
    status: "needs_review",
    reason: "Detected for testing.",
    sensitivity: "safe",
    autoFillAllowed: true,
    intent: "first_name",
    reviewCategory: null,
    answerSource: "explicit_profile",
    verificationStatus: "not_attempted",
    ...overrides
  };
}

test("fillField commits Workable-like text inputs even when click interception would force the old fallback path", async () => {
  await resetBrowserManagerForTests();
  const context = await getOrCreateBrowserContext();
  const page = await context.newPage();

  await page.setContent(`
    <div data-ui="backdrop" style="position:fixed;inset:0;z-index:20;"></div>
    <div data-ui="cookie-consent" role="dialog" aria-label="Cookie Consent" style="position:fixed;inset:0;z-index:21;">
      <button data-ui="cookie-consent-decline">Decline all</button>
    </div>
    <label for="firstname">First name</label>
    <input id="firstname" type="text" data-error="true" />
    <script>
      const input = document.getElementById('firstname');
      const decline = document.querySelector('[data-ui="cookie-consent-decline"]');
      decline?.addEventListener('click', () => {
        document.querySelector('[data-ui="cookie-consent"]')?.remove();
        document.querySelector('[data-ui="backdrop"]')?.remove();
      });
      input?.addEventListener('input', (event) => {
        input.dataset.trusted = String(event.isTrusted);
      });
      input?.addEventListener('change', () => {
        if (input.dataset.trusted !== 'true') {
          input.value = '';
          return;
        }
        input.removeAttribute('data-error');
      });
      input?.addEventListener('blur', () => {
        if (input.dataset.trusted !== 'true') {
          input.value = '';
          return;
        }
        input.removeAttribute('data-error');
      });
    </script>
  `);

  const verification = await fillField(
    page,
    createField({
      label: "First name",
      name: "firstname",
      domId: "firstname",
      selector: "#firstname",
      intent: "first_name"
    }),
    "Avery"
  );

  assert.equal(verification.success, true);
  assert.equal(await page.locator("#firstname").inputValue(), "Avery");
  assert.equal(await page.locator("#firstname").getAttribute("data-error"), null);

  await page.close();
  await resetBrowserManagerForTests();
});

test("fillField selects Workable-style wrapper radios instead of relying on the hidden input state", async () => {
  await resetBrowserManagerForTests();
  const context = await getOrCreateBrowserContext();
  const page = await context.newPage();

  await page.setContent(`
    <fieldset role="radiogroup" aria-labelledby="auth_label">
      <div id="auth_yes_wrapper" role="radio" aria-checked="false" tabindex="0">
        <label>
          <input id="auth_yes" type="radio" name="work_auth" value="yes" tabindex="-1" aria-hidden="true" />
          <span>Yes</span>
        </label>
      </div>
      <div id="auth_no_wrapper" role="radio" aria-checked="false" tabindex="0">
        <label>
          <input id="auth_no" type="radio" name="work_auth" value="no" tabindex="-1" aria-hidden="true" />
          <span>No</span>
        </label>
      </div>
    </fieldset>
    <div id="status" data-error="true"></div>
    <script>
      const wrappers = Array.from(document.querySelectorAll('[role="radio"]'));
      const sync = (selectedId) => {
        wrappers.forEach((wrapper) => {
          const input = wrapper.querySelector('input[type="radio"]');
          const isSelected = input?.id === selectedId;
          if (input) input.checked = Boolean(isSelected);
          wrapper.setAttribute('aria-checked', isSelected ? 'true' : 'false');
        });
        document.getElementById('status')?.removeAttribute('data-error');
      };
      wrappers.forEach((wrapper) => {
        wrapper.addEventListener('click', () => {
          const input = wrapper.querySelector('input[type="radio"]');
          if (input) sync(input.id);
        });
      });
      document.querySelectorAll('input[type="radio"]').forEach((input) => {
        input.addEventListener('click', (event) => event.preventDefault());
      });
    </script>
  `);

  const verification = await fillField(
    page,
    createField({
      label: "Are you authorized to work in the United States?",
      name: "work_auth",
      domId: "auth_yes",
      selector: "#auth_yes",
      type: "radio",
      controlType: "radio",
      intent: "work_authorization",
      selectOptions: ["Yes", "No"]
    }),
    "yes"
  );

  assert.equal(verification.success, true);
  assert.equal(await page.locator("#auth_yes").isChecked(), true);
  assert.equal(await page.locator("#auth_yes_wrapper").getAttribute("aria-checked"), "true");
  assert.equal(await page.locator("#status").getAttribute("data-error"), null);

  await page.close();
  await resetBrowserManagerForTests();
});

test("fillField commits Workable sponsorship radios to an exact NO choice when wrapper text is noisy", async () => {
  await resetBrowserManagerForTests();
  const context = await getOrCreateBrowserContext();
  const page = await context.newPage();

  await page.setContent(`
    <fieldset id="sponsorship_group" role="radiogroup" aria-labelledby="sponsorship_label">
      <legend id="sponsorship_label">Do you currently require work visa sponsorship?</legend>
      <div id="sponsorship_yes_wrapper" role="radio" aria-checked="true" tabindex="0">
        <div class="group-copy">Do you currently require work visa sponsorship? YES NO</div>
        <label>
          <input id="sponsorship_yes" type="radio" name="sponsorship" value="" checked tabindex="-1" aria-hidden="true" />
          <span>YES</span>
        </label>
      </div>
      <div id="sponsorship_no_wrapper" role="radio" aria-checked="false" tabindex="0">
        <div class="group-copy">Do you currently require work visa sponsorship? YES NO</div>
        <label>
          <input id="sponsorship_no" type="radio" name="sponsorship" value="" tabindex="-1" aria-hidden="true" />
          <span>NO</span>
        </label>
      </div>
    </fieldset>
    <script>
      const wrappers = Array.from(document.querySelectorAll('[role="radio"]'));
      const sync = (selectedId) => {
        wrappers.forEach((wrapper) => {
          const input = wrapper.querySelector('input[type="radio"]');
          const isSelected = input?.id === selectedId;
          if (input) input.checked = Boolean(isSelected);
          wrapper.setAttribute('aria-checked', isSelected ? 'true' : 'false');
        });
      };
      wrappers.forEach((wrapper) => {
        wrapper.addEventListener('click', () => {
          const input = wrapper.querySelector('input[type="radio"]');
          if (input) sync(input.id);
        });
      });
      document.querySelectorAll('input[type="radio"]').forEach((input) => {
        input.addEventListener('click', (event) => event.preventDefault());
      });
    </script>
  `);

  const verification = await fillField(
    page,
    createField({
      label: "Do you currently require work visa sponsorship?",
      name: "sponsorship",
      domId: "sponsorship_yes",
      selector: "#sponsorship_yes",
      type: "radio",
      controlType: "radio",
      intent: "sponsorship",
      selectOptions: ["YES", "NO"]
    }),
    "no"
  );

  assert.equal(verification.success, true);
  assert.equal(await page.locator("#sponsorship_no").isChecked(), true);
  assert.equal(await page.locator("#sponsorship_no_wrapper").getAttribute("aria-checked"), "true");
  assert.equal(await page.locator("#sponsorship_yes").isChecked(), false);

  await page.close();
  await resetBrowserManagerForTests();
});
