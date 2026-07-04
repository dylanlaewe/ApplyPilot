import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";

import { chromium, type Browser, type Page } from "playwright";

import { scanVisibleFields } from "@/lib/playwrightSession";
import { createDefaultProfile, normalizeProfile } from "@/lib/profile";
import { ensureWorkdayRepeatableSections } from "@/lib/workday";

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

function createProfile() {
  const base = createDefaultProfile();
  return normalizeProfile({
    ...base,
    education: [
      {
        ...base.education[0],
        school: "Boston University",
        degree: "Bachelor of Science",
        degreeType: "bachelor_of_science",
        degreeLevel: "bachelors_degree",
        fieldOfStudy: "Computer Science",
        major: "Computer Science",
        displayFieldOfStudy: "Computer Science"
      }
    ],
    experience: [
      {
        ...base.experience[0],
        company: "Example Corp",
        title: "Software Engineer"
      }
    ]
  });
}

test("hidden resume inputs are scanned when they belong to a visible upload area", async () => {
  if (!browser) return test.skip(launchError?.message ?? "Playwright launch is unavailable.");

  await page.setContent(`
    <section data-automation-id="formSection">
      <h2>Resume</h2>
      <div data-automation-id="formField">
        <label for="resume_upload">Upload resume</label>
        <button type="button">Select files</button>
        <input id="resume_upload" name="resume_upload" type="file" style="display:none" />
      </div>
    </section>
  `);

  const fields = await scanVisibleFields(page);
  const resumeField = fields.find((field) => field.type === "file");

  assert.ok(resumeField);
  assert.equal(resumeField?.domId, "resume_upload");
  assert.match(resumeField?.label || "", /upload resume/i);
});

test("workday repeatable sections add visible entries before scanning", async () => {
  if (!browser) return test.skip(launchError?.message ?? "Playwright launch is unavailable.");

  await page.setContent(`
    <section data-automation-id="formSection" id="education-section">
      <h2>Education</h2>
      <button type="button" id="add-education">Add</button>
    </section>
    <script>
      const section = document.getElementById('education-section');
      document.getElementById('add-education').addEventListener('click', () => {
        const entry = document.createElement('div');
        entry.className = 'repeatable-entry';
        entry.innerHTML = '<label for="school_0">School</label><input id="school_0" type="text" />';
        section.appendChild(entry);
      });
    </script>
  `);

  const result = await ensureWorkdayRepeatableSections(page, createProfile());

  assert.equal(result.createdEntries, 1);
  assert.equal(await page.locator("#school_0").count(), 1);
});

test("workday repeatable sections use the section-owned Add action instead of the first Add button on the page", async () => {
  if (!browser) return test.skip(launchError?.message ?? "Playwright launch is unavailable.");

  await page.setContent(`
    <section data-automation-id="formSection" id="profile-section">
      <h2>Profile details</h2>
      <button type="button" id="add-profile">Add</button>
    </section>
    <section data-automation-id="formSection" id="experience-section">
      <h2>Work Experience</h2>
      <button type="button" id="add-experience">Add</button>
    </section>
    <script>
      document.getElementById('add-profile').addEventListener('click', () => {
        document.body.setAttribute('data-wrong-add-clicked', 'true');
      });
      const section = document.getElementById('experience-section');
      document.getElementById('add-experience').addEventListener('click', () => {
        const entry = document.createElement('div');
        entry.className = 'repeatable-entry';
        entry.innerHTML = '<label for="company_0">Company</label><input id="company_0" type="text" />';
        section.appendChild(entry);
      });
    </script>
  `);

  const result = await ensureWorkdayRepeatableSections(page, createProfile());

  assert.equal(result.createdEntries, 1);
  assert.equal(await page.locator("#company_0").count(), 1);
  assert.equal(await page.locator("body").getAttribute("data-wrong-add-clicked"), null);
});

test("workday repeatable sections only count an entry after the section entry count increases", async () => {
  if (!browser) return test.skip(launchError?.message ?? "Playwright launch is unavailable.");

  await page.setContent(`
    <section data-automation-id="formSection" id="education-section">
      <h2>Education</h2>
      <button type="button" id="add-education">Add</button>
    </section>
    <script>
      document.getElementById('add-education').addEventListener('click', () => {
        // Simulate a broken Workday Add action that never creates a visible entry.
      });
    </script>
  `);

  const result = await ensureWorkdayRepeatableSections(page, createProfile());

  assert.equal(result.createdEntries, 0);
  assert.equal(await page.locator(".repeatable-entry").count(), 0);
});
