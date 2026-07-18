import assert from "node:assert/strict";
import test from "node:test";

import { prepareLogicalFields, sanitizeFieldLabel } from "@/lib/fieldLabeling";
import { RawScannedField } from "@/types";

function field(overrides: Partial<RawScannedField>): RawScannedField {
  return {
    label: "",
    name: "",
    domId: "",
    type: "text",
    selector: "#field",
    detectedValue: "",
    ...overrides
  };
}

test("sanitizeFieldLabel removes DOM noise and internal ids", () => {
  assert.equal(sanitizeFieldLabel("*AddressSVGs not supported by this browser. CA_39338"), "Address");
  assert.equal(sanitizeFieldLabel("186f789a-5e96-4b41-98e6-d188176fd3cf"), "");
});

test("prepareLogicalFields prefers semantic question text over placeholder noise", () => {
  const result = prepareLogicalFields([
    field({
      type: "search",
      controlType: "aria_combobox",
      label: "",
      placeholder: "Start typing...",
      questionContainerText: "What brought you to this job posting Start typing...",
      nearbyText: "start typing... start typing... combobox"
    })
  ]);

  assert.equal(result.fields.length, 1);
  assert.equal(result.fields[0].label, "What brought you to this job posting");
  assert.equal(result.stats.noiseRejected, 0);
});

test("prepareLogicalFields groups yes no controls under one logical question", () => {
  const result = prepareLogicalFields([
    field({
      type: "radio",
      controlType: "radio",
      label: "Yes",
      optionLabel: "Yes",
      groupKey: "workable_group_1",
      groupLabel: "Have you previously worked for this company?",
      questionContainerText: "SVGs not supported by this browser. Have you previously worked for this company? Yes No"
    }),
    field({
      type: "radio",
      controlType: "radio",
      label: "No",
      optionLabel: "No",
      groupKey: "workable_group_1",
      groupLabel: "Have you previously worked for this company?",
      questionContainerText: "SVGs not supported by this browser. Have you previously worked for this company? Yes No"
    })
  ]);

  assert.equal(result.fields.length, 1);
  assert.equal(result.fields[0].label, "Have you previously worked for this company?");
  assert.deepEqual(result.fields[0].selectOptions, ["Yes", "No"]);
  assert.equal(result.stats.groupedControls, 1);
});

test("prepareLogicalFields ignores utility share buttons on listing pages", () => {
  const result = prepareLogicalFields([
    field({
      type: "text",
      controlType: "menu_button",
      label: "Share this job",
      nearbyText: "Share this job"
    })
  ]);

  assert.equal(result.fields.length, 0);
});

test("prepareLogicalFields drops helper listbox labels like items selected", () => {
  const result = prepareLogicalFields([
    field({
      type: "text",
      controlType: "listbox",
      role: "listbox",
      label: "items selected",
      nearbyText: "Country Phone Code Phone Number",
      selectOptions: ["Canada (+1)", "United States of America (+1)", "United Kingdom (+44)"]
    })
  ]);

  assert.equal(result.fields.length, 0);
});

test("prepareLogicalFields ignores value-only required labels and uses the real Workday question text", () => {
  const result = prepareLogicalFields([
    field({
      type: "button",
      controlType: "menu_button",
      role: "button",
      label: "No Required",
      detectedValue: "No",
      questionContainerText: "Do you have any affiliation with Brown University?",
      nearbyText: "Do you have any affiliation with Brown University? No Required",
      selectOptions: ["Yes", "No"]
    })
  ]);

  assert.equal(result.fields.length, 1);
  assert.equal(result.fields[0].label, "Do you have any affiliation with Brown University?");
});
