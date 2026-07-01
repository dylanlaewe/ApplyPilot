import assert from "node:assert/strict";
import test from "node:test";

import { detectQuestionIntent } from "@/lib/questionIntent";
import { RawScannedField } from "@/types";

test("job source dropdowns are classified as referral_source instead of education", () => {
  const field: RawScannedField = {
    label: "How did you learn about this opportunity?",
    name: "source",
    domId: "job_source",
    type: "select-one",
    selector: "#job_source",
    detectedValue: "",
    controlType: "native_select",
    selectOptions: ["LinkedIn.com", "SchoolSpring.com", "Indeed", "Other"],
    nearbyText: "How did you learn about this opportunity?",
    isRequired: true,
    isVisible: true,
    isDisabled: false
  };

  const result = detectQuestionIntent(field);
  assert.equal(result.intent, "referral_source");
  assert.ok(result.confidence >= 0.9);
});
