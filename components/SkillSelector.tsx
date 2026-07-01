"use client";

import { useMemo } from "react";

import { SKILL_OPTIONS } from "@/lib/skillCatalog";
import { normalizeText } from "@/lib/utils";

import { MultiSelectAutocomplete } from "@/components/MultiSelectAutocomplete";

export function SkillSelector({
  value,
  onChange
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const selected = useMemo(
    () =>
      value.map((skill) => ({
        id: normalizeText(skill).replace(/\s+/g, "-"),
        label: skill
      })),
    [value]
  );

  return (
    <MultiSelectAutocomplete
      options={SKILL_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
      selected={selected}
      placeholder="Search or add a skill..."
      emptyMessage="No matching skills found."
      createLabel={(manual) => `Add "${manual}"`}
      onCreate={(manual) => {
        if (!manual.trim()) return;
        if (value.some((entry) => normalizeText(entry) === normalizeText(manual))) return;
        onChange([...value, manual.trim()]);
      }}
      onAdd={(option) => {
        if (value.some((entry) => normalizeText(entry) === normalizeText(option.label))) return;
        onChange([...value, option.label]);
      }}
      onRemove={(optionId) => onChange(value.filter((item) => normalizeText(item).replace(/\s+/g, "-") !== optionId))}
    />
  );
}
