"use client";

import { AlertTriangle } from "lucide-react";
import React, { useMemo, useState } from "react";

export function WrongAnswerReporter({
  currentValue,
  disabled,
  onSubmit
}: {
  currentValue: string;
  disabled?: boolean;
  onSubmit: (input: { correctedValue: string; note: string; learningApproved: boolean }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [correctedValue, setCorrectedValue] = useState(currentValue);
  const [note, setNote] = useState("");
  const [learningApproved, setLearningApproved] = useState(true);

  const useTextarea = useMemo(() => Math.max(currentValue.length, correctedValue.length) > 120, [correctedValue.length, currentValue.length]);

  if (!open) {
    return (
      <button
        type="button"
        className="secondary-button"
        disabled={disabled}
        onClick={() => {
          setCorrectedValue(currentValue);
          setNote("");
          setLearningApproved(true);
          setOpen(true);
        }}
      >
        <AlertTriangle className="mr-2 h-4 w-4" />
        Report a wrong answer
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50/80 p-4">
      <p className="text-sm font-medium text-amber-950">This field was filled incorrectly</p>
      <p className="mt-2 text-sm text-amber-900">Store the correction locally and optionally reuse it for similar applications later.</p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="field-label">ApplyPilot entered</p>
          <div className="mt-2 rounded-[16px] border border-amber-200 bg-white px-3 py-3 text-sm text-slate-700">
            {currentValue || "No saved value was inserted."}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="wrong-answer-corrected-value">
            Correct value
          </label>
          {useTextarea ? (
            <textarea
              id="wrong-answer-corrected-value"
              className="subtle-textarea mt-2"
              value={correctedValue}
              onChange={(event) => setCorrectedValue(event.target.value)}
            />
          ) : (
            <input
              id="wrong-answer-corrected-value"
              className="field-input mt-2"
              value={correctedValue}
              onChange={(event) => setCorrectedValue(event.target.value)}
            />
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="wrong-answer-note">
            Short note (optional)
          </label>
          <textarea
            id="wrong-answer-note"
            className="subtle-textarea mt-2"
            placeholder="What was wrong, if anything else would help next time?"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <fieldset>
          <legend className="field-label">Use this correction for similar applications?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={learningApproved ? "primary-button px-4 py-2 text-sm" : "secondary-button px-4 py-2 text-sm"}
              onClick={() => setLearningApproved(true)}
            >
              Yes
            </button>
            <button
              type="button"
              className={!learningApproved ? "primary-button px-4 py-2 text-sm" : "secondary-button px-4 py-2 text-sm"}
              onClick={() => setLearningApproved(false)}
            >
              Not this time
            </button>
          </div>
        </fieldset>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="primary-button"
          disabled={disabled}
          onClick={async () => {
            await onSubmit({
              correctedValue,
              note,
              learningApproved
            });
            setOpen(false);
          }}
        >
          Save correction
        </button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
