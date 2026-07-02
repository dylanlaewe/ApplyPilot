"use client";

import React from "react";

import { ApplicationDisplayStatus } from "@/types";

import { getApplicationStatusLabel } from "@/lib/applicationsExperience";
import { cn } from "@/lib/utils";

const badgeStyles: Record<ApplicationDisplayStatus, string> = {
  in_progress: "bg-slate-100 text-slate-700",
  ready_to_review: "bg-amber-100 text-amber-800",
  submitted: "bg-emerald-100 text-emerald-800",
  interview: "bg-sky-100 text-sky-700",
  offer: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-700",
  archived: "bg-slate-100 text-slate-600"
};

export function ApplicationStatusBadge({ status }: { status: ApplicationDisplayStatus }) {
  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", badgeStyles[status])}>
      {getApplicationStatusLabel(status)}
    </span>
  );
}
