import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultProfile, normalizeProfile } from "@/lib/profile";
import { getFullPhoneNumber } from "@/lib/profileFacts";

test("normalizeProfile clears country code accidentally stored as phone extension", () => {
  const base = createDefaultProfile();
  const profile = normalizeProfile({
    ...base,
    identity: {
      ...base.identity,
      phoneCountryCode: "+1",
      phoneNationalNumber: "6178338317",
      phoneExtension: "+1"
    }
  });

  assert.equal(profile.identity.phoneExtension, null);
  assert.equal(getFullPhoneNumber(profile), "+1 6178338317");
});

test("normalizeProfile preserves a real phone extension", () => {
  const base = createDefaultProfile();
  const profile = normalizeProfile({
    ...base,
    identity: {
      ...base.identity,
      phoneCountryCode: "+1",
      phoneNationalNumber: "6178338317",
      phoneExtension: "x77"
    }
  });

  assert.equal(profile.identity.phoneExtension, "77");
  assert.equal(getFullPhoneNumber(profile), "+1 6178338317 x77");
});
