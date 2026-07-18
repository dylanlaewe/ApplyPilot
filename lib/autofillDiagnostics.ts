import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { DetectedField } from "@/types";
import { WorkdayTimingSnapshot } from "@/lib/workdayTiming";

const DIAGNOSTIC_DIR = path.join(process.cwd(), "debug", "applypilot-diagnostics");

type GenericPassSummary = {
  sessionId: string;
  atsProvider: string;
  attempted: number;
  committed: number;
  visuallyPresentButUncommitted: number;
  validationErrorsRemaining: number;
  valueReverted: number;
  unresolved: number;
  incorrectMappingsPrevented: number;
};

type WorkdayOverlaySummary = {
  sessionId: string;
  eventLog: Array<{ event: string; detail?: string }>;
  safeFieldsPlanned: number;
  committed: number;
  unresolved: number;
  barrierType?: string;
  tenant?: string;
  formReached?: boolean;
  resumedAfterBarrier?: boolean;
  detectedAt?: string;
  failureReason?: string;
  barrierReason?: string;
  barrierEvidence?: Record<string, unknown>;
  timing?: WorkdayTimingSnapshot;
};

function summarizeGenericPass(sessionId: string, atsProvider: string, fields: DetectedField[]): GenericPassSummary {
  const attemptedFields = fields.filter((field) => field.verificationStatus !== "not_attempted");
  const unresolvedFields = fields.filter((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status));
  const preventedMappings = fields.filter(
    (field) =>
      !field.suggestedValue.trim() &&
      /(left .*blank|cannot safely|instead of guessing|needs an explicit saved answer|manual review|unresolved)/i.test(field.reason)
  );

  return {
    sessionId,
    atsProvider,
    attempted: attemptedFields.length,
    committed: attemptedFields.filter((field) => field.commitState === "committed").length,
    visuallyPresentButUncommitted: attemptedFields.filter((field) => field.commitState === "visually_present_but_uncommitted").length,
    validationErrorsRemaining: attemptedFields.filter((field) => field.commitState === "validation_error_remains").length,
    valueReverted: attemptedFields.filter((field) => field.commitState === "value_reverted").length,
    unresolved: unresolvedFields.length,
    incorrectMappingsPrevented: preventedMappings.length
  };
}

async function writeDiagnosticFile(name: string, payload: unknown) {
  await mkdir(DIAGNOSTIC_DIR, { recursive: true });
  await writeFile(path.join(DIAGNOSTIC_DIR, name), JSON.stringify(payload, null, 2));
}

export async function writeGenericPassDiagnostic(sessionId: string, atsProvider: string, fields: DetectedField[]) {
  const summary = summarizeGenericPass(sessionId, atsProvider, fields);
  await writeDiagnosticFile(`generic-pass-${sessionId}.json`, summary);
  return summary;
}

export async function writeWorkdayOverlayDiagnostic(summary: WorkdayOverlaySummary) {
  await writeDiagnosticFile(`workday-overlay-${summary.sessionId}.json`, summary);
  return summary;
}
