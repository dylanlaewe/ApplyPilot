"use client";

import React from "react";
import { useMemo, useState } from "react";

import { ReviewFieldCard } from "@/components/ReviewFieldCard";
import { DetectedField } from "@/types";

const reviewSections = [
  { key: "required_missing", title: "Required missing fields" },
  { key: "sensitive", title: "Sensitive questions" },
  { key: "unknown_custom", title: "Unknown custom questions" },
  { key: "optional_skipped", title: "Optional skipped fields" },
  { key: "error", title: "Needs recovery" }
] as const;

export function ReviewQueue({
  fields,
  onApprove,
  onSkip,
  onSaveAnswer,
  disabled
}: {
  fields: DetectedField[];
  onApprove: (fieldId: string, value: string) => Promise<void>;
  onSkip: (fieldId: string) => Promise<void>;
  onSaveAnswer: (fieldId: string, value: string, canonicalQuestion: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const reviewFields = useMemo(
    () => fields.filter((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status)),
    [fields]
  );

  if (!reviewFields.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-emerald-200 bg-emerald-50/70 p-5 text-sm text-emerald-900">
        No unresolved fields right now. ApplyPilot either filled them or safely skipped them.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {reviewSections.map((section) => {
        const sectionFields = reviewFields.filter((field) => field.reviewCategory === section.key);
        if (!sectionFields.length) return null;

        return (
          <div key={section.key} className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{section.title}</p>
            </div>
            {sectionFields.map((field) => {
              const draft = draftValues[field.id] ?? field.suggestedValue ?? "";
              return (
                <ReviewFieldCard
                  key={field.id}
                  field={field}
                  draftValue={draft}
                  disabled={disabled}
                  onChange={(value) => setDraftValues((current) => ({ ...current, [field.id]: value }))}
                  onApprove={() => onApprove(field.id, draft)}
                  onSkip={() => onSkip(field.id)}
                  onSaveAnswer={(canonicalQuestion) => onSaveAnswer(field.id, draft, canonicalQuestion)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
