"use client";

import { searchFieldsOfStudy } from "@/lib/fieldOfStudyCatalog";

import { AutocompleteCombobox } from "@/components/AutocompleteCombobox";

export function FieldOfStudyAutocomplete({
  value,
  onSelect
}: {
  value: string;
  onSelect: (next: { displayFieldOfStudy: string; normalizedFieldOfStudy: string }) => void;
}) {
  const options = searchFieldsOfStudy("");

  return (
    <AutocompleteCombobox
      value={value}
      options={options}
      placeholder="Search for a field of study"
      emptyMessage="No matching field of study found."
      allowCustom
      customLabel={(manual) => `Use "${manual}"`}
      onSelect={(option, manualValue) => {
        if (!option && manualValue) {
          onSelect({
            displayFieldOfStudy: manualValue,
            normalizedFieldOfStudy: manualValue.toLowerCase().trim()
          });
          return;
        }

        onSelect({
          displayFieldOfStudy: option?.label ?? "",
          normalizedFieldOfStudy: option?.normalizedName ?? ""
        });
      }}
    />
  );
}
