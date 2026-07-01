import { AlertTriangle, CheckCircle2, SkipForward } from "lucide-react";

import { SaveAnswerPrompt } from "@/components/SaveAnswerPrompt";
import { StatusBadge } from "@/components/StatusBadge";
import { DetectedField } from "@/types";

export function ReviewFieldCard({
  field,
  draftValue,
  onChange,
  onApprove,
  onSkip,
  onSaveAnswer,
  disabled
}: {
  field: DetectedField;
  draftValue: string;
  onChange: (value: string) => void;
  onApprove: () => void;
  onSkip: () => void;
  onSaveAnswer: (canonicalQuestion: string) => Promise<void>;
  disabled?: boolean;
}) {
  const useTextarea = draftValue.length > 90 || field.type === "textarea";

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{field.label || "Untitled field"}</p>
          <p className="mt-1 text-xs text-slate-500 capitalize">
            Intent: {field.intent.replaceAll("_", " ")} • Confidence {Math.round(field.confidence * 100)}%
          </p>
        </div>
        <StatusBadge status={field.status} />
      </div>
      <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <AlertTriangle className="mr-2 inline h-4 w-4" />
        {field.reason}
      </div>
      <div className="mt-3">
        <label className="field-label">Suggested answer</label>
        {useTextarea ? (
          <textarea className="subtle-textarea mt-2" value={draftValue} onChange={(event) => onChange(event.target.value)} />
        ) : (
          <input className="field-input mt-2" value={draftValue} onChange={(event) => onChange(event.target.value)} />
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="primary-button" disabled={disabled} onClick={onApprove}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Fill
        </button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={onApprove}>
          Edit & Fill
        </button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={onSkip}>
          <SkipForward className="mr-2 h-4 w-4" />
          Skip
        </button>
      </div>
      <SaveAnswerPrompt onSave={onSaveAnswer} disabled={disabled} />
    </div>
  );
}
