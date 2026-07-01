import { DetectedField } from "@/types";

export function DetectedFieldSummary({ fields }: { fields: DetectedField[] }) {
  const summary = {
    total: fields.length,
    filled: fields.filter((field) => field.status === "filled").length,
    review: fields.filter((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status)).length,
    skipped: fields.filter((field) => field.status === "skipped").length
  };

  return (
    <div className="grid gap-3 md:grid-cols-4">
      {[
        ["Scanned", summary.total],
        ["Filled", summary.filled],
        ["Needs review", summary.review],
        ["Skipped", summary.skipped]
      ].map(([label, value]) => (
        <div key={String(label)} className="rounded-[22px] border border-slate-200 bg-white/85 px-4 py-4 text-center">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
      ))}
    </div>
  );
}
