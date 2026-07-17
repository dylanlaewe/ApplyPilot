import assert from "node:assert/strict";
import { mkdtemp, mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  bindSessionPage,
  clearPersistentProfileSingletonArtifacts,
  getOpenSessionCount,
  getOrCreateBrowserContext,
  getOrCreateSessionPage,
  isPersistentProfileLockError,
  resetBrowserManagerForTests
} from "@/lib/browserManager";
import { extractJobMetadata } from "@/lib/jobMetadata";

Object.assign(process.env, { NODE_ENV: "test" });

test("browser manager reuses one controlled browser context across sessions", async () => {
  await resetBrowserManagerForTests();

  const pageOne = await getOrCreateSessionPage("session-one", { url: "data:text/html,<title>One</title><h1>One</h1>" });
  const pageTwo = await getOrCreateSessionPage("session-two", { url: "data:text/html,<title>Two</title><h1>Two</h1>" });

  assert.notEqual(pageOne, pageTwo);
  assert.equal(pageOne.context(), pageTwo.context());
  assert.equal(getOpenSessionCount(), 2);

  await resetBrowserManagerForTests();
});

test("browser manager reuses the same tab for the same session id", async () => {
  await resetBrowserManagerForTests();

  const firstPage = await getOrCreateSessionPage("session-reuse", { url: "data:text/html,<title>Reuse</title><h1>Reuse</h1>" });
  const secondPage = await getOrCreateSessionPage("session-reuse", { url: "data:text/html,<title>Reuse</title><h1>Reuse</h1>" });

  assert.equal(firstPage, secondPage);
  assert.equal(getOpenSessionCount(), 1);

  await resetBrowserManagerForTests();
});

test("browser manager can reuse an open page for a different session when requested", async () => {
  await resetBrowserManagerForTests();

  const firstPage = await getOrCreateSessionPage("session-one", { url: "data:text/html,<title>One</title><h1>One</h1>" });
  const reusedPage = await getOrCreateSessionPage("session-two", {
    url: "data:text/html,<title>Two</title><h1>Two</h1>",
    reuseOpenPage: true
  });

  assert.equal(firstPage, reusedPage);
  assert.equal(getOpenSessionCount(), 1);
  assert.match(await reusedPage.title(), /Two/i);

  await resetBrowserManagerForTests();
});

test("browser manager can rebind a session to the page the user is actively using", async () => {
  await resetBrowserManagerForTests();

  const originalPage = await getOrCreateSessionPage("session-rebind", {
    url: "data:text/html,<title>Original</title><h1>Original</h1>"
  });
  const context = await getOrCreateBrowserContext();
  const applicationPage = await context.newPage();
  await applicationPage.goto("data:text/html,<title>Application</title><h1>Application</h1>", { waitUntil: "domcontentloaded" });

  const reboundPage = bindSessionPage("session-rebind", applicationPage);
  const resolvedPage = await getOrCreateSessionPage("session-rebind", { navigate: false });

  assert.equal(reboundPage, applicationPage);
  assert.equal(resolvedPage, applicationPage);
  assert.notEqual(resolvedPage, originalPage);

  await resetBrowserManagerForTests();
});

test("browser manager opens a real Workday URL instead of leaving the session on about:blank", async () => {
  await resetBrowserManagerForTests();

  const context = await getOrCreateBrowserContext();
  await context.route("https://tenant.wd5.myworkdayjobs.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `
        <html>
          <head><title>Administrative Coordinator</title></head>
          <body><h1>Administrative Coordinator</h1></body>
        </html>
      `
    });
  });

  const page = await getOrCreateSessionPage("session-launch", {
    url: "https://tenant.wd5.myworkdayjobs.com/en-US/careers/job/123",
    navigate: false,
    reuseOpenPage: false,
    focus: false
  });

  assert.equal(page.url(), "https://tenant.wd5.myworkdayjobs.com/en-US/careers/job/123");

  await resetBrowserManagerForTests();
});

test("browser manager replaces a stale blank session page with a real Workday page", async () => {
  await resetBrowserManagerForTests();

  const context = await getOrCreateBrowserContext();
  await context.route("https://tenant.wd5.myworkdayjobs.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `
        <html>
          <head><title>Administrative Coordinator</title></head>
          <body>
            <h1>My Information</h1>
            <label for="country">Country</label>
            <select id="country" name="country"><option>United States</option></select>
          </body>
        </html>
      `
    });
  });

  const blankPage = await getOrCreateSessionPage("session-blank", {
    url: "about:blank",
    navigate: false,
    reuseOpenPage: false,
    focus: false
  });
  assert.equal(blankPage.url(), "about:blank");

  const livePage = await context.newPage();
  await livePage.goto("https://tenant.wd5.myworkdayjobs.com/en-US/careers/job/123/apply/applyManually", {
    waitUntil: "domcontentloaded"
  });

  const resolvedPage = await getOrCreateSessionPage("session-blank", {
    url: "https://tenant.wd5.myworkdayjobs.com/en-US/careers/job/123",
    navigate: false,
    focus: false
  });

  assert.equal(resolvedPage, livePage);
  assert.notEqual(resolvedPage, blankPage);

  await resetBrowserManagerForTests();
});

test("browser manager prefers the live Workday apply page over the older job listing tab", async () => {
  await resetBrowserManagerForTests();

  const context = await getOrCreateBrowserContext();
  await context.route("https://tenant.wd5.myworkdayjobs.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/apply/applyManually")) {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `
          <html>
            <head><title>Administrative Coordinator</title></head>
            <body>
              <h1>My Information</h1>
              <p>Back to Job Posting</p>
              <label for="country">Country</label>
              <select id="country" name="country">
                <option>United States</option>
              </select>
              <label for="source">How Did You Hear About Us?</label>
              <select id="source" name="source">
                <option>LinkedIn</option>
              </select>
            </body>
          </html>
        `
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `
        <html>
          <head><title>Administrative Coordinator</title></head>
          <body>
            <h1>Administrative Coordinator</h1>
            <a href="https://tenant.wd5.myworkdayjobs.com/en-US/careers/job/123/apply">Apply</a>
          </body>
        </html>
      `
    });
  });

  const listingPage = await getOrCreateSessionPage("session-workday", {
    url: "https://tenant.wd5.myworkdayjobs.com/en-US/careers/job/123",
    reuseOpenPage: false
  });
  const pageCountBefore = context.pages().length;

  const applyPage = await context.newPage();
  await applyPage.goto("https://tenant.wd5.myworkdayjobs.com/en-US/careers/job/123/apply/applyManually", {
    waitUntil: "domcontentloaded"
  });

  const resolvedPage = await getOrCreateSessionPage("session-workday", {
    url: "https://tenant.wd5.myworkdayjobs.com/en-US/careers/job/123",
    navigate: false,
    focus: false
  });

  assert.equal(resolvedPage, applyPage);
  assert.notEqual(resolvedPage, listingPage);
  assert.equal(context.pages().length, pageCountBefore + 1);

  await resetBrowserManagerForTests();
});

test("job metadata extraction prefers JSON-LD job posting metadata", async () => {
  await resetBrowserManagerForTests();

  const context = await getOrCreateBrowserContext();
  const page = await context.newPage();
  await page.setContent(`
    <html>
      <head>
        <title>Ignored Title</title>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Customer Support Representative I",
            "hiringOrganization": { "name": "Electrosoft" }
          }
        </script>
      </head>
      <body>
        <h1>Ignored Heading</h1>
      </body>
    </html>
  `);

  const metadata = await extractJobMetadata(page);
  assert.equal(metadata.roleTitle, "Customer Support Representative I");
  assert.equal(metadata.company, "Electrosoft");
  assert.equal(metadata.source, "json_ld");

  await page.close();
  await resetBrowserManagerForTests();
});

test("job metadata falls back to ATS company slug and rejects generic paths", async () => {
  await resetBrowserManagerForTests();

  const context = await getOrCreateBrowserContext();
  const page = await context.newPage();
  await page.route("https://jobs.lever.co/electrosoft/123/apply", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<title>Apply</title><h1>Apply Now</h1>"
    });
  });

  await page.goto("https://jobs.lever.co/electrosoft/123/apply");
  const metadata = await extractJobMetadata(page);
  assert.equal(metadata.company, "Electrosoft");
  assert.equal(metadata.roleTitle, "");

  await page.close();
  await resetBrowserManagerForTests();
});

test("job metadata rejects malformed role fragments when stronger evidence is absent", async () => {
  await resetBrowserManagerForTests();

  const context = await getOrCreateBrowserContext();
  const page = await context.newPage();
  await page.setContent(`
    <title>Engineer /</title>
    <h1>Engineer /</h1>
  `);

  const metadata = await extractJobMetadata(page);
  assert.equal(metadata.roleTitle, "");

  await page.close();
  await resetBrowserManagerForTests();
});

test("job metadata uses the page heading as role when the document title is company-first", async () => {
  await resetBrowserManagerForTests();

  const context = await getOrCreateBrowserContext();
  const page = await context.newPage();
  await page.setContent(`
    <html>
      <head>
        <title>Tevora - Consultant Development Program - CDP Federal</title>
        <meta property="og:title" content="Tevora - Consultant Development Program - CDP Federal" />
      </head>
      <body>
        <h2>Consultant Development Program - CDP Federal</h2>
      </body>
    </html>
  `);

  const metadata = await extractJobMetadata(page);
  assert.equal(metadata.company, "Tevora");
  assert.equal(metadata.roleTitle, "Consultant Development Program - CDP Federal");

  await page.close();
  await resetBrowserManagerForTests();
});

test("job metadata extracts company and role from apply-for titles without swapping them", async () => {
  await resetBrowserManagerForTests();

  const context = await getOrCreateBrowserContext();
  const page = await context.newPage();
  await page.route("https://jobs.jobvite.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `
        <html>
          <head>
            <title>iboss Careers - Apply for Java Software Engineer - Remote</title>
          </head>
          <body>
            <h1>iboss Careers</h1>
            <h2>Java Software Engineer - Remote</h2>
          </body>
        </html>
      `
    });
  });
  await page.goto("https://jobs.jobvite.com/iboss/job/oev5zfw7/apply");

  const metadata = await extractJobMetadata(page);
  assert.equal(metadata.company.toLowerCase(), "iboss");
  assert.equal(metadata.roleTitle, "Java Software Engineer - Remote");

  await page.close();
  await resetBrowserManagerForTests();
});

test("stale persistent browser profile singleton artifacts are cleared when the profile is not in use", async () => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "applypilot-browser-profile-"));
  const socketDir = await mkdtemp(path.join(os.tmpdir(), "applypilot-browser-socket-"));
  const socketPath = path.join(socketDir, "SingletonSocket");

  await mkdir(path.join(profileDir, "Default"), { recursive: true });
  await writeFile(socketPath, "");
  await symlink("MacBookPro-9920", path.join(profileDir, "SingletonLock"));
  await symlink("362092140875988174", path.join(profileDir, "SingletonCookie"));
  await symlink(socketPath, path.join(profileDir, "SingletonSocket"));
  await writeFile(path.join(profileDir, "RunningChromeVersion"), "149.0.7827.55:1");

  const cleared = await clearPersistentProfileSingletonArtifacts(profileDir, "");

  assert.equal(cleared, true);
  await assert.rejects(readlink(path.join(profileDir, "SingletonLock")));
  await assert.rejects(readlink(path.join(profileDir, "SingletonCookie")));
  await assert.rejects(readlink(path.join(profileDir, "SingletonSocket")));

  await rm(profileDir, { recursive: true, force: true });
  await rm(socketDir, { recursive: true, force: true });
});

test("stale singleton artifacts still clear when only a transient process command remains", async () => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "applypilot-browser-profile-live-"));
  const socketDir = await mkdtemp(path.join(os.tmpdir(), "applypilot-browser-socket-live-"));
  const socketPath = path.join(socketDir, "SingletonSocket");

  await writeFile(socketPath, "");
  await symlink("MacBookPro-9920", path.join(profileDir, "SingletonLock"));
  await symlink(socketPath, path.join(profileDir, "SingletonSocket"));

  const cleared = await clearPersistentProfileSingletonArtifacts(
    profileDir,
    `/Applications/Test.app --user-data-dir=${profileDir} --remote-debugging-pipe`
  );

  assert.equal(cleared, true);
  await assert.rejects(readlink(path.join(profileDir, "SingletonLock")));
  assert.equal(isPersistentProfileLockError(new Error("Opening in existing browser session.")), true);
  assert.equal(isPersistentProfileLockError(new Error("some other launch error")), false);

  await rm(profileDir, { recursive: true, force: true });
  await rm(socketDir, { recursive: true, force: true });
});

test("persistent profile singleton artifacts are left alone when no socket clue exists and the profile appears active", async () => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "applypilot-browser-profile-busy-"));

  await symlink("MacBookPro-9920", path.join(profileDir, "SingletonLock"));

  const cleared = await clearPersistentProfileSingletonArtifacts(
    profileDir,
    `/Applications/Test.app --user-data-dir=${profileDir} --remote-debugging-pipe`
  );

  assert.equal(cleared, false);
  assert.equal(await readlink(path.join(profileDir, "SingletonLock")), "MacBookPro-9920");

  await rm(profileDir, { recursive: true, force: true });
});
