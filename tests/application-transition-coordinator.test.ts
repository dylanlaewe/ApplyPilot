import assert from "node:assert/strict";
import http from "node:http";
import { readFile, rm, writeFile } from "node:fs/promises";
import { after, afterEach, before, beforeEach, test } from "node:test";

import { getApplicationSession } from "@/lib/applications";
import { resetApplicationTransitionCoordinator } from "@/lib/applicationTransitionCoordinator";
import { resetBrowserManagerForTests } from "@/lib/browserManager";
import { getBrowserSession } from "@/lib/playwrightSession";
import { createDefaultProfile, saveApplicantProfile } from "@/lib/profile";
import { runAutofillPass } from "@/lib/quickApply";
import { getDataDirPath, getStorageFilePath } from "@/lib/storage";

Object.assign(process.env, { NODE_ENV: "test" });

const storageFiles = ["application-sessions.json", "answer-bank.json", "profile.json"] as const;
const backups = new Map<string, string | null>();

let server: http.Server;
let baseUrl = "";

function renderTransitionFixture() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Fixture Application</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; }
      form { display: grid; gap: 16px; max-width: 560px; }
      label { display: grid; gap: 6px; font-weight: 600; }
      input { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; }
      button { width: fit-content; padding: 10px 14px; border: 0; border-radius: 999px; background: #0f172a; color: white; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>
      const root = document.getElementById("app");

      function renderStepOne() {
        root.innerHTML = \`
          <h1>Application Step 1</h1>
          <form>
            <label for="first_name">First Name<input id="first_name" name="first_name" autocomplete="given-name" required /></label>
            <label for="email">Email<input id="email" name="email" type="email" autocomplete="email" required /></label>
            <button type="button" id="next">Next</button>
          </form>
        \`;
        document.getElementById("next").addEventListener("click", () => {
          history.pushState({ step: 2 }, "", "/step-2");
          renderStepTwo();
        });
      }

      function renderStepTwo() {
        root.innerHTML = \`
          <h1>Application Step 2</h1>
          <form>
            <label for="city">City<input id="city" name="city" autocomplete="address-level2" required /></label>
            <label for="linkedin">LinkedIn Profile<input id="linkedin" name="linkedin" type="url" autocomplete="url" /></label>
            <button type="button" id="back">Back</button>
          </form>
        \`;
        document.getElementById("back").addEventListener("click", () => {
          history.pushState({ step: 1 }, "", "/");
          renderStepOne();
        });
      }

      window.addEventListener("popstate", () => {
        if (window.location.pathname === "/step-2") {
          renderStepTwo();
          return;
        }
        renderStepOne();
      });

      if (window.location.pathname === "/step-2") {
        renderStepTwo();
      } else {
        renderStepOne();
      }
    </script>
  </body>
</html>`;
}

function renderSameUrlTransitionFixture() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Same URL Fixture</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; }
      form { display: grid; gap: 16px; max-width: 560px; }
      label { display: grid; gap: 6px; font-weight: 600; }
      input { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; }
      button { width: fit-content; padding: 10px 14px; border: 0; border-radius: 999px; background: #0f172a; color: white; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>
      const root = document.getElementById("app");

      function renderProfileStep() {
        root.innerHTML = \`
          <section data-step="profile">
            <h1>Profile Step</h1>
            <form>
              <label for="full_name">Full Name<input id="full_name" name="full_name" autocomplete="name" required /></label>
              <label for="email">Email<input id="email" name="email" type="email" autocomplete="email" required /></label>
              <button type="button" id="next">Continue</button>
            </form>
          </section>
        \`;
        document.getElementById("next").addEventListener("click", () => {
          setTimeout(() => {
            renderDetailsStep();
          }, 50);
        });
      }

      function renderDetailsStep() {
        root.innerHTML = \`
          <section data-step="details">
            <h1>Details Step</h1>
            <form>
              <label for="city">City<input id="city" name="city" autocomplete="address-level2" required /></label>
              <label for="linkedin">LinkedIn<input id="linkedin" name="linkedin" type="url" autocomplete="url" /></label>
            </form>
          </section>
        \`;
      }

      renderProfileStep();
    </script>
  </body>
</html>`;
}

function renderFullNavigationFixture(step: "one" | "two") {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Full Navigation Fixture</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; }
      form { display: grid; gap: 16px; max-width: 560px; }
      label { display: grid; gap: 6px; font-weight: 600; }
      input { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; }
      a { width: fit-content; padding: 10px 14px; border-radius: 999px; background: #0f172a; color: white; text-decoration: none; }
    </style>
  </head>
  <body>
    ${
      step === "one"
        ? `<h1>Navigation Step 1</h1>
           <form>
             <label for="first_name">First Name<input id="first_name" name="first_name" autocomplete="given-name" required /></label>
             <label for="email">Email<input id="email" name="email" type="email" autocomplete="email" required /></label>
             <a id="next" href="/full-nav/step-2">Continue</a>
           </form>`
        : `<h1>Navigation Step 2</h1>
           <form>
             <label for="city">City<input id="city" name="city" autocomplete="address-level2" required /></label>
             <label for="linkedin">LinkedIn<input id="linkedin" name="linkedin" type="url" /></label>
           </form>`
    }
  </body>
</html>`;
}

async function backupStorage() {
  await Promise.all(
    storageFiles.map(async (fileName) => {
      const filePath = getStorageFilePath(fileName);
      try {
        backups.set(fileName, await readFile(filePath, "utf8"));
      } catch {
        backups.set(fileName, null);
      }
    })
  );
}

async function restoreStorage() {
  await Promise.all(
    storageFiles.map(async (fileName) => {
      const filePath = getStorageFilePath(fileName);
      const backup = backups.get(fileName);
      if (backup === null) {
        await rm(filePath, { force: true }).catch(() => undefined);
        return;
      }
      if (typeof backup === "string") {
        await writeFile(filePath, backup, "utf8");
      }
    })
  );
  backups.clear();
}

async function seedProfile() {
  const profile = createDefaultProfile();
  profile.identity.firstName = "Avery";
  profile.identity.lastName = "Example";
  profile.identity.fullName = "Avery Example";
  profile.identity.email = "avery@example.com";
  profile.identity.phone = "617-555-0117";
  profile.identity.city = "Boston";
  profile.identity.stateProvince = "MA";
  profile.identity.linkedin = "https://www.linkedin.com/in/avery-example";
  await saveApplicantProfile(profile);
}

async function waitFor(assertion: () => Promise<void>, timeoutMs = 7_500) {
  const startedAt = Date.now();
  let lastError: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  throw lastError;
}

before(async () => {
  server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/same-url") {
      response.end(renderSameUrlTransitionFixture());
      return;
    }
    if (url.pathname === "/full-nav") {
      response.end(renderFullNavigationFixture("one"));
      return;
    }
    if (url.pathname === "/full-nav/step-2") {
      response.end(renderFullNavigationFixture("two"));
      return;
    }
    response.end(renderTransitionFixture());
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine fixture server address.");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

beforeEach(async () => {
  await backupStorage();
  await seedProfile();
  await resetBrowserManagerForTests();
  resetApplicationTransitionCoordinator();
});

afterEach(async () => {
  await resetBrowserManagerForTests();
  resetApplicationTransitionCoordinator();
  await restoreStorage();
});

test("manual step navigation triggers exactly one automatic follow-up autofill pass", async () => {
  const { createApplicationSession } = await import("@/lib/applications");
  const session = await createApplicationSession({
    company: "Fixture Co",
    roleTitle: "Product Engineer",
    jobUrl: baseUrl,
    source: "deterministic-regression",
    notes: ""
  });

  const firstPass = await runAutofillPass(session.id, {
    trigger: "manual",
    reuseOpenPage: false
  });

  assert.equal(firstPass.detectedFields.some((field) => field.label === "First Name" && field.status === "filled"), true);
  assert.equal(firstPass.detectedFields.some((field) => field.label === "Email" && field.status === "filled"), true);

  const runtime = getBrowserSession(session.id);
  assert.ok(runtime, "Expected an open browser session.");
  await runtime?.page.locator("#next").click();

  await waitFor(async () => {
    const updated = await getApplicationSession(session.id);
    assert.ok(updated);
    assert.equal(updated.currentPageUrl.includes("/step-2"), true);
    assert.equal(updated.detectedFields.some((field) => field.label === "City" && field.status === "filled"), true);
    assert.equal(updated.detectedFields.some((field) => /linkedin/i.test(field.label) && field.status === "filled"), true);
  });

  await new Promise((resolve) => setTimeout(resolve, 1_400));

  const settled = await getApplicationSession(session.id);
  assert.ok(settled);
  const autofillRuns = settled.auditLog.filter((entry) => entry.action === "autofill_run_completed");
  assert.equal(autofillRuns.length, 2);
  assert.equal(settled.currentPageNumber >= 2, true);
  assert.equal(settled.dogfoodTelemetry?.autofillRetries, 1);
  assert.ok(getDataDirPath().includes("/data"));
});

test("same-url container replacement triggers one automatic follow-up pass", async () => {
  const { createApplicationSession } = await import("@/lib/applications");
  const session = await createApplicationSession({
    company: "Fixture Co",
    roleTitle: "Platform Engineer",
    jobUrl: `${baseUrl}/same-url`,
    source: "deterministic-regression",
    notes: ""
  });

  const firstPass = await runAutofillPass(session.id, {
    trigger: "manual",
    reuseOpenPage: false
  });

  assert.equal(firstPass.detectedFields.some((field) => field.label === "Full Name" && field.status === "filled"), true);
  assert.equal(firstPass.detectedFields.some((field) => field.label === "Email" && field.status === "filled"), true);

  const runtime = getBrowserSession(session.id);
  assert.ok(runtime, "Expected an open browser session.");
  await runtime?.page.locator("#next").click();

  await waitFor(async () => {
    const updated = await getApplicationSession(session.id);
    assert.ok(updated);
    assert.equal(updated.detectedFields.some((field) => field.label === "City" && field.status === "filled"), true);
    assert.equal(updated.detectedFields.some((field) => /linkedin/i.test(field.label) && field.status === "filled"), true);
  });

  await new Promise((resolve) => setTimeout(resolve, 1_400));

  const settled = await getApplicationSession(session.id);
  assert.ok(settled);
  const autofillRuns = settled.auditLog.filter((entry) => entry.action === "autofill_run_completed");
  assert.equal(autofillRuns.length, 2);
});

test("full navigation transitions continue automatically after a URL change", async () => {
  const { createApplicationSession } = await import("@/lib/applications");
  const session = await createApplicationSession({
    company: "Fixture Co",
    roleTitle: "Product Engineer",
    jobUrl: `${baseUrl}/full-nav`,
    source: "deterministic-regression",
    notes: ""
  });

  const firstPass = await runAutofillPass(session.id, {
    trigger: "manual",
    reuseOpenPage: false
  });

  assert.equal(firstPass.detectedFields.some((field) => field.label === "First Name" && field.status === "filled"), true);
  assert.equal(firstPass.detectedFields.some((field) => field.label === "Email" && field.status === "filled"), true);

  const runtime = getBrowserSession(session.id);
  assert.ok(runtime, "Expected an open browser session.");
  await runtime?.page.locator("#next").click();

  await waitFor(async () => {
    const updated = await getApplicationSession(session.id);
    assert.ok(updated);
    assert.equal(updated.currentPageUrl.includes("/full-nav/step-2"), true);
    assert.equal(updated.detectedFields.some((field) => field.label === "City" && field.status === "filled"), true);
    assert.equal(updated.detectedFields.some((field) => /linkedin/i.test(field.label) && field.status === "filled"), true);
  });
});
