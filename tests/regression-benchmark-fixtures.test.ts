import assert from "node:assert/strict";
import test from "node:test";

import { regressionCases } from "@/scripts/benchmark/regressionCases";

test("deterministic regression fixtures cover every supported ATS family with local-only paths", () => {
  const atsFamilies = new Set(regressionCases.map((testCase) => testCase.ats));

  assert.deepEqual(
    Array.from(atsFamilies).sort(),
    ["ashby", "generic", "greenhouse", "icims", "jobvite", "lever", "smartrecruiters", "workable", "workday"]
  );

  for (const testCase of regressionCases) {
    assert.match(testCase.entryPath, /^\//);
    for (const step of testCase.steps) {
      assert.match(step.path, /^\//);
      for (const expectation of step.expectations) {
        assert.match(expectation.selector, /^#/);
      }
    }
  }
});
