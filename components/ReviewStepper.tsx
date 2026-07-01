"use client";

import { CheckCircle2, Pencil, SkipForward } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { SaveAnswerPrompt } from "@/components/SaveAnswerPrompt";
import { DetectedField } from "@/types";

export function ReviewStepper({
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
  const reviewFields = useMemo(
    () => fields.filter((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status)),
    [fields]
  );
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(reviewFields.length - 1, 0)));
    setEditing(false);
  }, [reviewFields.length]);

  if (!reviewFields.length) {
    return (
      <div className="rounded-[28px] border border-emerald-200 bg-emerald-50/80 p-6 text-center">
        <p className="font-display text-2xl font-semibold tracking-tight text-emerald-950">Nothing else needs your input.</p>
        <p className="mt-2 text-sm leading-6 text-emerald-900">
          ApplyPilot has done everything safe it can do on this page. Review the browser page yourself, then submit manually when you’re ready.
        </p>
      </div>
    );
  }

  const currentField = reviewFields[index];
  const draftValue = draftValues[currentField.id] ?? currentField.suggestedValue ?? "";
  const canGoNext = index < reviewFields.length - 1;
  const canGoBack = index > 0;
  const useTextarea = editing || currentField.type === "textarea" || draftValue.length > 100;

  return (
    <div className="rounded-[30px] border border-slate-200 bg-white/92 p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
        Question {index + 1} of {reviewFields.length}
      </p>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-slate-950">{currentField.label || "Untitled question"}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{currentField.reason}</p>

      <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
        <p className="field-label">Suggested answer</p>
        {useTextarea ? (
          <textarea
            className="subtle-textarea mt-3"
            value={draftValue}
            onChange={(event) => setDraftValues((current) => ({ ...current, [currentField.id]: event.target.value }))}
          />
        ) : (
          <div className="mt-3 rounded-[18px] border border-slate-200 bg-white px-4 py-4 text-base text-slate-900">
            {draftValue || "No safe suggestion available yet."}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          className="primary-button"
          disabled={disabled}
          onClick={() => onApprove(currentField.id, draftValue)}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Use this answer
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={disabled}
          onClick={() => setEditing(true)}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit answer
        </button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => onSkip(currentField.id)}>
          <SkipForward className="mr-2 h-4 w-4" />
          Skip for now
        </button>
      </div>

      <SaveAnswerPrompt
        disabled={disabled}
        onSave={(canonicalQuestion) => onSaveAnswer(currentField.id, draftValue, canonicalQuestion)}
      />

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          className="secondary-button"
          disabled={!canGoBack}
          onClick={() => setIndex((current) => Math.max(current - 1, 0))}
        >
          Previous
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!canGoNext}
          onClick={() => setIndex((current) => Math.min(current + 1, reviewFields.length - 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
