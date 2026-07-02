"use client";

import React from "react";

import { searchCities } from "@/lib/locationCatalog";
import { LocationPreference } from "@/types";

import { AutocompleteCombobox } from "@/components/AutocompleteCombobox";

export function CityAutocomplete({
  city,
  stateProvince,
  country,
  locationLabel,
  onSelect,
  onClear
}: {
  city: string;
  stateProvince: string;
  country: string;
  locationLabel: string;
  onSelect: (location: LocationPreference | null, manualCity?: string) => void;
  onClear: () => void;
}) {
  const displayValue = locationLabel || [city, stateProvince, country].filter(Boolean).join(", ");
  const options = searchCities("");

  return (
    <AutocompleteCombobox
      value={displayValue}
      options={options.map((option) => ({ ...option, id: option.normalizedKey }))}
      placeholder="Search for a city"
      emptyMessage="No matching cities found."
      allowCustom
      customLabel={(value) => `Use "${value}"`}
      onClear={onClear}
      onSelect={(option, manualCity) => {
        if (!option && manualCity) {
          onSelect(
            {
              type: "city",
              label: manualCity,
              city: manualCity,
              stateProvince,
              country,
              normalizedKey: manualCity.toLowerCase().replace(/\s+/g, "-")
            },
            manualCity
          );
          return;
        }

        onSelect(option as unknown as LocationPreference);
      }}
    />
  );
}
