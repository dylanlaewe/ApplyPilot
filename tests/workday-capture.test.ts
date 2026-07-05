import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkdayCaptureFilename, sanitizeWorkdayCapture, sanitizeWorkdayTenant } from "@/lib/workdayCapture";

test("capture filenames use only ATS family, tenant slug, page type, and timestamp", () => {
  const filename = buildWorkdayCaptureFilename({
    tenantSlug: "acme",
    pageType: "education",
    capturedAt: "2026-07-06T01:20:00.000Z"
  });

  assert.equal(filename, "workday-acme-education-20260706T012000Z.json");
});

test("tenant sanitization strips Workday infrastructure labels", () => {
  assert.equal(sanitizeWorkdayTenant("acme.wd5.myworkdayjobs.com"), "acme");
  assert.equal(sanitizeWorkdayTenant("wd1.myworkdayjobs.com"), "tenant");
});

test("sanitized captures exclude applicant data, credentials, and candidate identifiers while retaining safe option labels", () => {
  const capture = sanitizeWorkdayCapture(
    {
      hostname: "acme.wd5.myworkdayjobs.com",
      pathname: "/en-US/recruiting/candidate/1234567890/apply/2f1d2a36-98c2-4f0a-b600-34a5327b8711",
      title: "Application for Dylan Laewe candidate 1234567890",
      stepHeading: "Contact Details",
      sectionHeadings: ["Profile", "Upload resume dylan_resume.pdf"],
      controls: [
        {
          order: 1,
          label: "Email dylan@example.com",
          sectionHeading: "Profile",
          role: "textbox",
          inputType: "email",
          tagName: "input",
          dataAutomationId: "email",
          ariaLabel: "Password",
          ariaLabelledBy: "candidate-id-1234",
          ariaDescribedBy: "Session storage token",
          ariaControls: "country-listbox",
          required: true,
          disabled: false,
          accept: "",
          optionLabels: []
        },
        {
          order: 2,
          label: "Country",
          sectionHeading: "Profile",
          role: "listbox",
          inputType: "",
          tagName: "div",
          dataAutomationId: "country",
          ariaLabel: "",
          ariaLabelledBy: "",
          ariaDescribedBy: "",
          ariaControls: "country-listbox",
          required: true,
          disabled: false,
          accept: "",
          optionLabels: ["United States", "Canada"]
        }
      ],
      buttons: ["Continue", "Submit application"],
      navigationButtons: ["Continue"],
      iframes: [{ title: "candidate-iframe-12345", srcHost: "auth.workday.com" }],
      repeatableSections: [{ heading: "Experience", addButtons: ["Add another role"] }],
      formContainerIds: ["candidate-12345", "applicationForm"],
      pageIdentitySignals: ["application id 12345", "cookie token"]
    },
    "2026-07-06T01:20:00.000Z"
  );

  const json = JSON.stringify(capture);
  assert.doesNotMatch(json, /dylan@example\.com/i);
  assert.doesNotMatch(json, /dylan_resume\.pdf/i);
  assert.doesNotMatch(json, /1234567890/);
  assert.doesNotMatch(json, /2f1d2a36-98c2-4f0a-b600-34a5327b8711/i);
  assert.doesNotMatch(json, /password/i);
  assert.doesNotMatch(json, /token/i);
  assert.match(json, /United States/);
  assert.match(json, /Canada/);
  assert.equal(capture.pageType, "resume");
  assert.equal(capture.pathname, "en-us/recruiting/candidate/[redacted-id]/apply/[redacted-id]");
});
