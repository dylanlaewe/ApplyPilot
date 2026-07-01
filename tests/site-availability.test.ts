import assert from "node:assert/strict";
import test from "node:test";

import { detectUnavailableText } from "@/lib/siteAvailability";

test("detectUnavailableText recognizes closed Lever-style 404 pages", () => {
  const text =
    "Sorry, we couldn't find anything here. The job posting you're looking for might have closed, or it has been removed. (404 error).";

  assert.match(detectUnavailableText(text), /404 error|couldn't find anything here|might have closed/i);
});

test("detectUnavailableText recognizes Jobvite job-listing tombstones", () => {
  const text = "The job listing no longer exists. Open Positions";
  assert.match(detectUnavailableText(text), /job listing no longer exists/i);
});

test("detectUnavailableText ignores ordinary application pages", () => {
  const text = "Submit your application. Full name. Email. Phone. LinkedIn URL.";
  assert.equal(detectUnavailableText(text), "");
});
