import assert from "node:assert/strict";
import test from "node:test";

import { createWorkdayTimingTracker } from "@/lib/workdayTiming";

test("Workday timing tracker accumulates stages and exposes the slowest fields", async () => {
  const tracker = createWorkdayTimingTracker();

  await tracker.measureStage("initial_scan", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });

  tracker.recordFieldStep({ id: "field-a", label: "Country Phone Code", intent: "phone_country_code" }, "locateMs", 12.2);
  tracker.recordFieldStep({ id: "field-a", label: "Country Phone Code", intent: "phone_country_code" }, "fillMs", 31.6);
  tracker.finishField(
    { id: "field-a", label: "Country Phone Code", intent: "phone_country_code" },
    "verified",
    "Matched exact United States (+1) option."
  );

  tracker.recordFieldStep({ id: "field-b", label: "Resume / CV", intent: "resume_upload" }, "fillMs", 67.7);
  tracker.finishField({ id: "field-b", label: "Resume / CV", intent: "resume_upload" }, "manual_review", "Upload control timed out.");

  const snapshot = tracker.snapshot();

  assert.ok((snapshot.stages.initial_scan ?? 0) >= 1);
  assert.equal(snapshot.fieldTimings.length, 2);
  assert.equal(snapshot.slowestFields[0]?.label, "Resume / CV");
  assert.equal(snapshot.slowestFields[0]?.outcome, "manual_review");
  assert.equal(snapshot.fieldTimings.find((entry) => entry.fieldId === "field-a")?.totalMs, 44);
  assert.ok(snapshot.totalPassMs >= 0);
});
