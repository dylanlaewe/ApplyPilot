import type { FieldIntent } from "@/types";

export type WorkdayTimingStageName =
  | "prepare_safe_fields"
  | "page_settle"
  | "overlay_ready"
  | "initial_scan"
  | "barrier_detection"
  | "repeatable_section_open"
  | "repeatable_section_rescan"
  | "page_identity"
  | "safe_mode_rules"
  | "field_metrics"
  | "plan_build"
  | "plan_execute"
  | "resume_upload"
  | "persist_fields"
  | "status_update"
  | "completion_audit";

export type WorkdayFieldTiming = {
  fieldId: string;
  label: string;
  intent: FieldIntent;
  locateMs: number;
  scrollMs: number;
  fillMs: number;
  totalMs: number;
  outcome: "verified" | "manual_review" | "skipped";
  reason?: string;
};

export type WorkdayTimingSnapshot = {
  totalPassMs: number;
  stages: Partial<Record<WorkdayTimingStageName, number>>;
  fieldTimings: WorkdayFieldTiming[];
  slowestFields: WorkdayFieldTiming[];
};

type MutableFieldTiming = WorkdayFieldTiming;

export function createWorkdayTimingTracker() {
  const startedAt = Date.now();
  const stages = new Map<WorkdayTimingStageName, number>();
  const fieldTimings = new Map<string, MutableFieldTiming>();

  function addStage(name: WorkdayTimingStageName, durationMs: number) {
    stages.set(name, (stages.get(name) ?? 0) + Math.max(0, Math.round(durationMs)));
  }

  function ensureField(fieldId: string, label: string, intent: FieldIntent): MutableFieldTiming {
    const existing = fieldTimings.get(fieldId);
    if (existing) return existing;

    const created: MutableFieldTiming = {
      fieldId,
      label,
      intent,
      locateMs: 0,
      scrollMs: 0,
      fillMs: 0,
      totalMs: 0,
      outcome: "skipped"
    };
    fieldTimings.set(fieldId, created);
    return created;
  }

  return {
    async measureStage<T>(name: WorkdayTimingStageName, action: () => Promise<T> | T) {
      const stageStartedAt = Date.now();
      try {
        return await action();
      } finally {
        addStage(name, Date.now() - stageStartedAt);
      }
    },
    recordFieldStep(field: { id: string; label: string; intent: FieldIntent }, step: "locateMs" | "scrollMs" | "fillMs", durationMs: number) {
      const entry = ensureField(field.id, field.label || field.intent, field.intent);
      entry[step] += Math.max(0, Math.round(durationMs));
      entry.totalMs = entry.locateMs + entry.scrollMs + entry.fillMs;
    },
    finishField(
      field: { id: string; label: string; intent: FieldIntent },
      outcome: WorkdayFieldTiming["outcome"],
      reason?: string
    ) {
      const entry = ensureField(field.id, field.label || field.intent, field.intent);
      entry.outcome = outcome;
      entry.reason = reason;
      entry.totalMs = entry.locateMs + entry.scrollMs + entry.fillMs;
    },
    snapshot(): WorkdayTimingSnapshot {
      const stageSummary = Object.fromEntries(stages.entries()) as Partial<Record<WorkdayTimingStageName, number>>;
      const fields = [...fieldTimings.values()]
        .map((entry) => ({ ...entry }))
        .sort((left, right) => right.totalMs - left.totalMs || left.label.localeCompare(right.label));

      return {
        totalPassMs: Math.max(0, Date.now() - startedAt),
        stages: stageSummary,
        fieldTimings: fields,
        slowestFields: fields.slice(0, 5)
      };
    }
  };
}
