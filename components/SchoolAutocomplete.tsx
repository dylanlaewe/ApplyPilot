"use client";

import { searchSchools } from "@/lib/schoolCatalog";

import { AutocompleteCombobox } from "@/components/AutocompleteCombobox";

export function SchoolAutocomplete({
  value,
  onSelect
}: {
  value: string;
  onSelect: (next: { school: string; normalizedSchoolName: string }) => void;
}) {
  const options = searchSchools("");

  return (
    <AutocompleteCombobox
      value={value}
      options={options}
      placeholder="Search for a school"
      emptyMessage="No matching schools found."
      allowCustom
      customLabel={(manual) => `Other / Enter "${manual}"`}
      onSelect={(option, manualValue) => {
        if (!option && manualValue) {
          onSelect({
            school: manualValue,
            normalizedSchoolName: manualValue.toLowerCase().trim()
          });
          return;
        }

        onSelect({
          school: option?.label ?? "",
          normalizedSchoolName: option?.normalizedName ?? ""
        });
      }}
    />
  );
}
