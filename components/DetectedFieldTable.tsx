import { DetectedField } from "@/types";

import { StatusBadge } from "@/components/StatusBadge";

export function DetectedFieldTable({ fields }: { fields: DetectedField[] }) {
  if (!fields.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-600">
        No fields scanned yet. Open the browser, load the form, and click <span className="font-semibold">Scan Page</span>.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Field</th>
              <th className="px-4 py-3 font-medium">Suggested value</th>
              <th className="px-4 py-3 font-medium">Confidence</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fields.map((field) => (
              <tr key={field.id} className="align-top">
                <td className="px-4 py-4">
                  <p className="font-medium text-slate-900">{field.label || "Untitled field"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {field.type}
                    {field.name ? ` • ${field.name}` : ""}
                    {field.intent ? ` • ${field.intent.replaceAll("_", " ")}` : ""}
                  </p>
                </td>
                <td className="px-4 py-4 text-slate-700">
                  <p className="max-w-[280px] whitespace-pre-wrap break-words">{field.suggestedValue || "—"}</p>
                </td>
                <td className="px-4 py-4 text-slate-700">{Math.round(field.confidence * 100)}%</td>
                <td className="px-4 py-4">
                  <StatusBadge status={field.status} />
                </td>
                <td className="px-4 py-4 text-slate-600">{field.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
