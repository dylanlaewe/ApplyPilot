import { RawScannedField } from "@/types";

export function inferFieldMetadata(field: RawScannedField) {
  const type = field.type || "text";
  const controlType = field.controlType ?? "unknown";

  return {
    label:
      field.label ||
      field.explicitLabel ||
      field.ariaLabelledByText ||
      field.ariaLabel ||
      field.legendText ||
      field.questionContainerText ||
      field.placeholder ||
      field.name ||
      field.domId ||
      "Untitled field",
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
