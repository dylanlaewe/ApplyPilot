"use client";

import React from "react";
import { useMemo } from "react";

import { getLocationDisplay, searchLocationPreferences } from "@/lib/locationCatalog";
import { LocationPreference } from "@/types";
import { normalizeText } from "@/lib/utils";

import { MultiSelectAutocomplete } from "@/components/MultiSelectAutocomplete";

export function LocationPreferenceSelector({
  value,
  onChange
}: {
  value: LocationPreference[];
  onChange: (next: LocationPreference[]) => void;
}) {
  const selected = useMemo(
    () =>
      value.map((location) => ({
        id: location.normalizedKey,
        label: getLocationDisplay(location)
      })),
    [value]
  );

  return (
    <MultiSelectAutocomplete
      options={searchLocationPreferences("").map((option) => ({
        id: option.normalizedKey,
        label: option.label,
        option
      }))}
      selected={selected}
      placeholder="Search for a city or location..."
      emptyMessage="No matching locations found."
      onAdd={(item) => {
        const option = (item as typeof item & { option?: LocationPreference }).option;
        if (!option) return;

        if (option.type === "anywhere") {
          onChange([option]);
          return;
        }

        const current = value.filter((entry) => entry.type !== "anywhere");
        if (current.some((entry) => entry.normalizedKey === option.normalizedKey)) return;
        onChange([...current, option]);
      }}
      onRemove={(optionId) => onChange(value.filter((location) => location.normalizedKey !== optionId))}
      onCreate={(manual) => {
        const normalizedKey = normalizeText(manual).replace(/\s+/g, "-");
        if (!manual.trim() || value.some((entry) => entry.normalizedKey === normalizedKey)) return;
        onChange([
          ...value.filter((entry) => entry.type !== "anywhere"),
          {
            type: "city",
            label: manual.trim(),
            city: manual.trim(),
            stateProvince: "",
            country: "",
            normalizedKey
          }
        ]);
      }}
      createLabel={(manual) => `Add "${manual}"`}
    />
  );
}
