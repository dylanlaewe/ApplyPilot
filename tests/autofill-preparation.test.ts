import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkdayManualSectionFields } from "@/lib/autofillPreparation";

test("Workday My Experience section signals become manual-review placeholders", () => {
  const fields = buildWorkdayManualSectionFields({
    sectionLabels: ["My Experience", "Work Experience", "Education", "Resume / CV", "Add", "Upload"]
  });

  assert.deepEqual(
    fields.map((field) => field.label),
    ["Work Experience", "Education", "Resume / CV"]
  );
  assert.ok(fields.every((field) => field.status === "needs_review"));
  assert.ok(fields.every((field) => field.autoFillAllowed === false));
  assert.ok(fields.every((field) => field.reviewCategory === "required_missing"));
  assert.match(fields.find((field) => field.label === "Work Experience")?.reason || "", /repeatable work-history entries/i);
  assert.match(fields.find((field) => field.label === "Resume \/ CV")?.reason || "", /resume section is visible/i);
});

test("Workday manual section placeholders stay empty when no known sections are present", () => {
  const fields = buildWorkdayManualSectionFields({
    sectionLabels: ["My Information", "Contact Details"]
  });

  assert.equal(fields.length, 0);
});
