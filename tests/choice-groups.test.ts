import assert from "node:assert/strict";
import test from "node:test";

import { collapseChoiceFields } from "@/lib/choiceGroups";
import { RawScannedField } from "@/types";

function rawField(overrides: Partial<RawScannedField>): RawScannedField {
  return {
    label: "Field",
    name: "field",
    domId: "",
    type: "text",
    selector: "#field",
    detectedValue: "",
    controlType: "text",
    role: "",
    placeholder: "",
    ariaLabel: "",
    nearbyText: "",
    selectOptions: [],
    frameUrl: "",
    frameName: "",
    isRequired: false,
    isVisible: true,
    isDisabled: false,
    autocomplete: "",
    accept: "",
    ...overrides
  };
}

test("collapseChoiceFields merges repeated checkbox options into one grouped field", () => {
  const collapsed = collapseChoiceFields([
    rawField({
      label: "Female",
      name: "gender_identity",
      type: "checkbox",
      controlType: "checkbox",
      selector: "#gender_female",
      nearbyText: "What gender do you identify as? Female Male Non-binary Prefer not to answer"
    }),
    rawField({
      label: "Male",
      name: "gender_identity",
      type: "checkbox",
      controlType: "checkbox",
      selector: "#gender_male",
      nearbyText: "What gender do you identify as? Female Male Non-binary Prefer not to answer"
    }),
    rawField({
      label: "Non-binary",
      name: "gender_identity",
      type: "checkbox",
      controlType: "checkbox",
      selector: "#gender_nonbinary",
      nearbyText: "What gender do you identify as? Female Male Non-binary Prefer not to answer"
    })
  ]);

  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].selector, "#gender_female");
  assert.deepEqual(collapsed[0].selectOptions, ["Female", "Male", "Non-binary"]);
  assert.match(collapsed[0].label, /what gender do you identify as/i);
});

test("collapseChoiceFields merges Workable-style radios that only share an internal group key", () => {
  const collapsed = collapseChoiceFields([
    rawField({
      label: "Are you authorized to work in the U. S? If offered employment, you will be required to provide documentation to verify eligibility. YES",
      name: "",
      domId: "wrapper_yes",
      type: "radio",
      controlType: "radio",
      role: "radio",
      selector: "#auth_yes",
      detectedValue: "checked",
      nearbyText: "Are you authorized to work in the U. S? If offered employment, you will be required to provide documentation to verify eligibility. YES",
      ariaLabelledByText:
        "Are you authorized to work in the U. S? If offered employment, you will be required to provide documentation to verify eligibility. YES",
      questionContainerText:
        "Are you authorized to work in the U. S? If offered employment, you will be required to provide documentation to verify eligibility. YES",
      optionLabel: "YES",
      groupKey: "apf_workable_group_13",
      groupLabel: "YES"
    }),
    rawField({
      label: "Are you authorized to work in the U. S? If offered employment, you will be required to provide documentation to verify eligibility. NO",
      name: "",
      domId: "wrapper_no",
      type: "radio",
      controlType: "radio",
      role: "radio",
      selector: "#auth_no",
      detectedValue: "unchecked",
      nearbyText: "Are you authorized to work in the U. S? If offered employment, you will be required to provide documentation to verify eligibility. NO YES",
      ariaLabelledByText:
        "Are you authorized to work in the U. S? If offered employment, you will be required to provide documentation to verify eligibility. NO",
      questionContainerText:
        "Are you authorized to work in the U. S? If offered employment, you will be required to provide documentation to verify eligibility. NO YES",
      optionLabel: "NO",
      groupKey: "apf_workable_group_13",
      groupLabel: "YES"
    })
  ]);

  assert.equal(collapsed.length, 1);
  assert.match(collapsed[0].label, /are you authorized to work/i);
  assert.deepEqual(collapsed[0].selectOptions, ["YES", "NO"]);
  assert.equal(collapsed[0].detectedValue, "YES");
});
