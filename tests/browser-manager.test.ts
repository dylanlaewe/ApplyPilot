import assert from "node:assert/strict";
import test from "node:test";

import { getOpenSessionCount, getOrCreateBrowserContext, getOrCreateSessionPage, resetBrowserManagerForTests } from "@/lib/browserManager";
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
