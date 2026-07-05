import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultAutomationStrategy,
  detectAutomationAtsKind,
  resolveAutomationStrategy
} from "@/lib/atsStrategy";
import { createDefaultSettings } from "@/lib/settings";

test("non-Workday ATS families never select Workday Safe Mode", () => {
  const settings = createDefaultSettings();
  const cases = [
    { url: "https://job-boards.greenhouse.io/dataiku/jobs/5963977004", expected: "greenhouse" },
    { url: "https://jobs.lever.co/tevora/335ec3e2-c7ee-4e4c-b4a9-04428999e954/apply", expected: "lever" },
    { url: "https://jobs.ashbyhq.com/1password/8f8774dc-e400-48b1-8100-c6840b8eaed1/application", expected: "ashby" },
    { url: "https://apply.workable.com/jcc-greater-boston/j/388A8F957D/", expected: "workable" },
    { url: "https://jobs.jobvite.com/iboss/job/oev5zfw7/apply", expected: "jobvite" },
    { url: "https://jobs.example.com/apply", expected: "generic" }
  ] as const;

  for (const current of cases) {
    const strategy = resolveAutomationStrategy({ url: current.url, settings });
    assert.equal(detectAutomationAtsKind(current.url), current.expected);
    assert.equal(strategy.atsKind, current.expected);
    assert.equal(strategy.workdaySafeModeActive, false);
    assert.equal(strategy.shouldInjectWorkdayOverlay, false);
    assert.equal(strategy.shouldInitializeWorkdayCapture, false);
    assert.equal(strategy.shouldUseWorkdayOnePass, false);
  }
});

test("ordinary Workday text on a non-Workday page does not trigger Workday classification", () => {
  const settings = createDefaultSettings();
  const strategy = resolveAutomationStrategy({
    url: "https://jobs.example.com/apply",
    settings,
    domClues: {
      title: "Apply to Example",
      pageHeader: "Learn how our HR team used Workday last year",
      pathname: "/apply",
      automationIds: ["application-form", "resume-upload"],
      hasDataAutomationShell: true
    }
  });

  assert.equal(strategy.atsKind, "generic");
  assert.equal(strategy.workdaySafeModeActive, false);
});

test("verified Workday host and stable DOM clues select Workday Safe Mode", () => {
  const settings = createDefaultSettings();
  const strategy = resolveAutomationStrategy({
    url: "https://brown.wd5.myworkdayjobs.com/en-US/staff-careers-brown/jobs/details/Associate-Director_REQ207311",
    settings,
    domClues: {
      title: "Brown University Careers",
      pathname: "/en-US/staff-careers-brown/jobs/details/Associate-Director_REQ207311",
      pageHeader: "Brown University Careers",
      automationIds: ["pageHeader", "applicationForm", "workExperience"],
      hasDataAutomationShell: true
    }
  });

  assert.equal(strategy.atsKind, "workday");
  assert.equal(strategy.strategyId, "workday_safe_mode");
  assert.equal(strategy.workdaySafeModeActive, true);
  assert.equal(strategy.shouldInjectWorkdayOverlay, true);
  assert.equal(strategy.shouldInitializeWorkdayCapture, true);
  assert.equal(strategy.workdayClassificationConfidence, "confirmed");
});

test("uncertain Workday classification falls back to generic automation", () => {
  const settings = createDefaultSettings();
  const strategy = resolveAutomationStrategy({
    url: "https://example.workday.com/candidate/home",
    settings,
    domClues: {
      title: "Candidate Home",
      pathname: "/candidate/home",
      pageHeader: "Sign in",
      automationIds: [],
      hasDataAutomationShell: false
    }
  });

  assert.equal(strategy.atsKind, "workday");
  assert.equal(strategy.strategyId, "generic");
  assert.equal(strategy.workdaySafeModeActive, false);
  assert.equal(strategy.workdayClassificationConfidence, "uncertain");
});

test("disabling the Workday flag prevents Safe Mode without changing other ATS defaults", () => {
  const settings = createDefaultSettings();
  settings.applicationBehavior.workdaySafeModeEnabled = false;

  const workdayStrategy = resolveAutomationStrategy({
    url: "https://brown.wd5.myworkdayjobs.com/en-US/staff-careers-brown/jobs/details/Associate-Director_REQ207311",
    settings,
    domClues: {
      title: "Brown University Careers",
      pathname: "/en-US/staff-careers-brown/jobs/details/Associate-Director_REQ207311",
      pageHeader: "Brown University Careers",
      automationIds: ["pageHeader", "applicationForm"],
      hasDataAutomationShell: true
    }
  });
  const greenhouseStrategy = resolveAutomationStrategy({
    url: "https://job-boards.greenhouse.io/dataiku/jobs/5963977004",
    settings
  });

  assert.equal(workdayStrategy.workdaySafeModeActive, false);
  assert.equal(workdayStrategy.strategyId, "generic");
  assert.equal(greenhouseStrategy.strategyId, "greenhouse");
  assert.deepEqual(greenhouseStrategy, createDefaultAutomationStrategy("greenhouse"));
});
