import React from "react";

import { FieldStatus, SessionStatus } from "@/types";

import { cn } from "@/lib/utils";

const badgeStyles: Record<FieldStatus | SessionStatus, string> = {
  created: "bg-slate-100 text-slate-700",
  opening_browser: "bg-sky-100 text-sky-700",
  navigating: "bg-sky-100 text-sky-700",
  waiting_for_user: "bg-amber-100 text-amber-800",
  scanning: "bg-sky-100 text-sky-700",
  filling: "bg-sky-100 text-sky-700",
  verifying: "bg-sky-100 text-sky-700",
  ready_for_submission: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-700",
  draft: "bg-slate-100 text-slate-700",
  started: "bg-slate-100 text-slate-700",
  in_progress: "bg-sky-100 text-sky-700",
  needs_review: "bg-amber-100 text-amber-800",
  submitted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-700",
  interview: "bg-violet-100 text-violet-700",
  offer: "bg-emerald-100 text-emerald-800",
  archived: "bg-slate-100 text-slate-700",
  abandoned: "bg-rose-100 text-rose-700",
  filled: "bg-emerald-100 text-emerald-800",
  skipped: "bg-slate-100 text-slate-700",
  error: "bg-rose-100 text-rose-700",
  sensitive: "bg-fuchsia-100 text-fuchsia-700",
  unknown: "bg-orange-100 text-orange-700"
};

export function StatusBadge({ status }: { status: FieldStatus | SessionStatus }) {
  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize", badgeStyles[status])}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
