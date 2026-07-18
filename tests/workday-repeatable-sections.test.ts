import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";

import { chromium, type Browser, type Page } from "playwright";

import { scanVisibleFields } from "@/lib/playwrightSession";
import { ensureWorkdayRepeatableSectionReady } from "@/lib/workdayRepeatableSections";

let browser: Browser;
let page: Page;

before(async () => {
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  if (browser) {
    await browser.close();
  }
});

beforeEach(async () => {
  page = await browser.newPage();
});

afterEach(async () => {
  if (page && !page.isClosed()) {
    await page.close();
  }
});

test("Workday repeatable-section helper opens Work Experience without clicking Education", async () => {
  await page.setContent(`
    <main>
      <section id="experience-section">
        <h2>Work Experience</h2>
        <button id="add-experience" type="button">Add</button>
        <div id="experience-fields" style="display:none">
          <label for="company">Company</label>
          <input id="company" name="company" type="text" />
          <label for="job_title">Job Title</label>
          <input id="job_title" name="job_title" type="text" />
        </div>
      </section>

      <section id="education-section">
        <h2>Education</h2>
        <button id="add-education" type="button">Add</button>
        <div id="education-fields" style="display:none">
          <label for="school">School</label>
          <input id="school" name="school" type="text" />
        </div>
      </section>
    </main>
    <script>
      window.__applyPilotClicks = { experience: 0, education: 0 };
      document.getElementById("add-experience").addEventListener("click", () => {
        window.__applyPilotClicks.experience += 1;
        document.getElementById("experience-fields").style.display = "block";
      });
      document.getElementById("add-education").addEventListener("click", () => {
        window.__applyPilotClicks.education += 1;
        document.getElementById("education-fields").style.display = "block";
      });
    </script>
  `);

  const result = await ensureWorkdayRepeatableSectionReady(page, "work_experience");
  const fields = await scanVisibleFields(page);
  const clicks = await page.evaluate(
    () => ((window as unknown as Window & { __applyPilotClicks: { experience: number; education: number } }).__applyPilotClicks)
  );

  assert.equal(result.opened, true);
  assert.equal(result.reason, "Work Experience form opened");
  assert.equal(clicks.experience, 1);
  assert.equal(clicks.education, 0);
  assert.ok(fields.some((field) => field.domId === "company"));
  assert.ok(fields.some((field) => field.domId === "job_title"));
  assert.ok(!fields.some((field) => field.domId === "school"));
});

test("Workday repeatable-section helper reports when the Add button is missing", async () => {
  await page.setContent(`
    <main>
      <section>
        <h2>Work Experience</h2>
        <p>No add control is available on this page yet.</p>
      </section>
    </main>
  `);

  const result = await ensureWorkdayRepeatableSectionReady(page, "work_experience");

  assert.equal(result.opened, false);
  assert.equal(result.alreadyVisible, false);
  assert.equal(result.reason, "Add button not found");
});

test("Workday repeatable-section helper opens Education without clicking Work Experience", async () => {
  await page.setContent(`
    <main>
      <section id="experience-section">
        <h2>Work Experience</h2>
        <button id="add-experience" type="button">Add</button>
        <div id="experience-fields" style="display:none">
          <label for="company">Company</label>
          <input id="company" name="company" type="text" />
        </div>
      </section>

      <section id="education-section">
        <h2>Education</h2>
        <button id="add-education" type="button">Add</button>
        <div id="education-fields" style="display:none">
          <label for="school">School</label>
          <input id="school" name="school" type="text" />
          <label for="degree">Degree</label>
          <input id="degree" name="degree" type="text" />
        </div>
      </section>
    </main>
    <script>
      window.__applyPilotClicks = { experience: 0, education: 0 };
      document.getElementById("add-experience").addEventListener("click", () => {
        window.__applyPilotClicks.experience += 1;
        document.getElementById("experience-fields").style.display = "block";
      });
      document.getElementById("add-education").addEventListener("click", () => {
        window.__applyPilotClicks.education += 1;
        document.getElementById("education-fields").style.display = "block";
      });
    </script>
  `);

  const result = await ensureWorkdayRepeatableSectionReady(page, "education");
  const fields = await scanVisibleFields(page);
  const clicks = await page.evaluate(
    () => ((window as unknown as Window & { __applyPilotClicks: { experience: number; education: number } }).__applyPilotClicks)
  );

  assert.equal(result.opened, true);
  assert.equal(result.reason, "Education form opened");
  assert.equal(clicks.education, 1);
  assert.equal(clicks.experience, 0);
  assert.ok(fields.some((field) => field.domId === "school"));
  assert.ok(fields.some((field) => field.domId === "degree"));
  assert.ok(!fields.some((field) => field.domId === "company"));
});

test("Workday repeatable-section helper opens Resume / CV without clicking other sections", async () => {
  await page.setContent(`
    <main>
      <section id="experience-section">
        <h2>Work Experience</h2>
        <button id="add-experience" type="button">Add</button>
      </section>

      <section id="resume-section">
        <h2>Resume / CV</h2>
        <button id="upload-resume" type="button">Upload</button>
        <div id="resume-fields" style="display:none">
          <button id="resume_button" type="button">Add Resume*</button>
          <input id="resume_upload" type="file" style="display:none" />
        </div>
      </section>
    </main>
    <script>
      window.__applyPilotClicks = { experience: 0, resume: 0 };
      document.getElementById("add-experience").addEventListener("click", () => {
        window.__applyPilotClicks.experience += 1;
      });
      document.getElementById("upload-resume").addEventListener("click", () => {
        window.__applyPilotClicks.resume += 1;
        document.getElementById("resume-fields").style.display = "block";
      });
    </script>
  `);

  const result = await ensureWorkdayRepeatableSectionReady(page, "resume_upload");
  const fields = await scanVisibleFields(page);
  const clicks = await page.evaluate(
    () => ((window as unknown as Window & { __applyPilotClicks: { experience: number; resume: number } }).__applyPilotClicks)
  );

  assert.equal(result.opened, true);
  assert.equal(result.reason, "Resume / CV form opened");
  assert.equal(clicks.resume, 1);
  assert.equal(clicks.experience, 0);
  assert.equal(await page.locator("#resume_button").isVisible(), true);
});
