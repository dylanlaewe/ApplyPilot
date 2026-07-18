import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import {
  createSyntheticQaAnswerBank,
  createSyntheticQaProfile,
  getSyntheticQaResumePath,
  isSyntheticQaProfile,
  SYNTHETIC_QA_PROFILE_EMAIL,
  SYNTHETIC_QA_PROFILE_NAME
} from "@/lib/syntheticQaProfile";

test("synthetic QA profile is clearly fake and points to a committed local resume fixture", () => {
  const profile = createSyntheticQaProfile();

  assert.equal(profile.identity.fullName, SYNTHETIC_QA_PROFILE_NAME);
  assert.equal(profile.identity.email, SYNTHETIC_QA_PROFILE_EMAIL);
  assert.equal(profile.identity.phoneNationalNumber, "6175550117");
  assert.equal(profile.identity.country, "United States of America");
  assert.equal(profile.resume.originalFilename, "avery-example-synthetic-resume.pdf");
  assert.equal(profile.resume.storedPath, getSyntheticQaResumePath());
  assert.equal(isSyntheticQaProfile(profile), true);
  assert.equal(existsSync(getSyntheticQaResumePath()), true);
});

test("synthetic QA answer bank includes the saved Workday regression answers", () => {
  const answerBank = createSyntheticQaAnswerBank();
  const byQuestion = new Map(answerBank.map((item) => [item.canonicalQuestion, item]));

  assert.equal(byQuestion.get("How did you hear about us?")?.answer, "Company Website");
  assert.equal(
    byQuestion.get("Do you have any affiliation with Brown University?")?.answer,
    "No"
  );
  assert.match(
    byQuestion.get("Please provide your reason for wanting to leave or leaving your current position.")?.answer || "",
    /full-time opportunity/i
  );
  assert.equal(byQuestion.get("Phone Device Type")?.answer, "Mobile");
  assert.equal(byQuestion.get("Phone Device Type")?.autoFillAllowed, true);
});
