"use client";

import React, { useState } from "react";

export function SaveAnswerPrompt({
  onSave,
  disabled
}: {
  onSave: (canonicalQuestion: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [checked, setChecked] = useState(false);
  const [canonicalQuestion, setCanonicalQuestion] = useState("");

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <label className="flex items-center gap-3 text-sm text-slate-700">
        <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        Save this answer for future applications
      </label>
      {checked ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            className="field-input flex-1"
            placeholder="Question name"
            value={canonicalQuestion}
            onChange={(event) => setCanonicalQuestion(event.target.value)}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={disabled || !canonicalQuestion.trim()}
            onClick={() => onSave(canonicalQuestion)}
          >
            Save answer
          </button>
        </div>
      ) : null}
    </div>
  );
}
