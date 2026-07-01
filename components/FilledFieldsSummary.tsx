import React from "react";

import { DetectedField } from "@/types";

export function FilledFieldsSummary({ fields }: { fields: DetectedField[] }) {
  const filledFields = fields.filter((field) => field.status === "filled");

  if (!filledFields.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/60 p-5 text-sm text-slate-600">
        Nothing has been filled yet.
      </div>
    );
  }

  return (
    <details className="rounded-[24px] border border-slate-200 bg-white/90 p-4">
      <summary className="cursor-pointer text-sm font-medium text-slate-900">
        Filled successfully ({filledFields.length})
      </summary>
      <div className="mt-4 space-y-3">
        {filledFields.map((field) => (
          <div key={field.id} className="rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">{field.label}</p>
            <p className="mt-1">{field.suggestedValue}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
