import { RawScannedField } from "@/types";

import { isDomNoiseLabel, sanitizeFieldLabel } from "@/lib/fieldLabeling";

export function inferFieldMetadata(field: RawScannedField) {
  const type = field.type || "text";
  const controlType = field.controlType ?? "unknown";
  const labelCandidates = [
    field.explicitLabel,
    field.ariaLabelledByText,
    field.groupLabel || field.legendText,
    field.questionContainerText,
    field.ariaLabel,
    field.nearbyText,
    field.label,
    field.placeholder,
    field.name,
    field.domId
  ];
  const label =
    labelCandidates
      .map((value) => sanitizeFieldLabel(value))
      .find((value) => value && !isDomNoiseLabel(value)) || "Untitled field";

  return {
    label,
    type,
    controlType,
    isSelect: type === "select-one" || type === "select-multiple",
    isTextArea: type === "textarea",
    isUpload: type === "file",
    isChoice: type === "radio" || type === "checkbox",
    isEmail: type === "email",
    isTextLike:
      ["text", "search", "url", "email", "tel", "number", "date", "month"].includes(type) ||
      ["aria_combobox", "autocomplete", "chip_input"].includes(controlType)
  };
}
