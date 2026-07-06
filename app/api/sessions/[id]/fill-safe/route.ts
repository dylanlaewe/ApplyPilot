import { NextResponse } from "next/server";

import { SAFE_AUTOFILL_THRESHOLD } from "@/lib/autofillRules";
import { appendAuditEntry, getApplicationSession, updateApplicationSession } from "@/lib/applications";
import { createAuditEntry } from "@/lib/auditLog";
import { fillField, getBrowserSession } from "@/lib/playwrightSession";
import { humanizeError } from "@/lib/safety";
import { AuditLogEntry } from "@/types";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getApplicationSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  try {
    const runtime = getBrowserSession(id);
    if (!runtime || runtime.page.isClosed()) {
      throw new Error("Open the application window before filling fields.");
    }

    const fields = [...session.detectedFields];
    const nextAuditEntries: AuditLogEntry[] = [];

    for (const field of fields) {
      const eligible =
        field.autoFillAllowed &&
        field.confidence >= SAFE_AUTOFILL_THRESHOLD &&
        field.suggestedValue.trim() &&
        field.status !== "filled";

      if (!eligible) {
        continue;
      }

      try {
        const verification = await fillField(runtime.page, field, field.suggestedValue);
        field.status = "filled";
        field.reviewCategory = null;
        field.reason = `${field.reason} Filled by ApplyPilot after passing safe autofill checks.`;
        field.verificationStatus = "verified";
        field.verificationMessage = verification.message;
        field.commitState = verification.commitState;
        nextAuditEntries.push(
          createAuditEntry(id, "field_filled", `Filled ${field.label || field.name || "field"}.`, {
            fieldId: field.id,
            reason: `Autofill allowed at ${Math.round(field.confidence * 100)}% confidence for ${field.intent}.`
          })
        );
      } catch (error) {
        field.status = "error";
        field.reviewCategory = "error";
        field.reason = `Fill failed: ${humanizeError(error)}`;
        field.verificationStatus = "failed";
        field.verificationMessage = humanizeError(error);
        field.commitState = (error as { commitState?: (typeof field)["commitState"] }).commitState ?? "unresolved";
        nextAuditEntries.push(
          createAuditEntry(id, "error", `Could not fill ${field.label || field.name || "field"}.`, {
            fieldId: field.id,
            reason: field.reason
          })
        );
      }
    }

    let updated = await updateApplicationSession(id, (current) => ({
      ...current,
      detectedFields: fields,
      status: current.status === "submitted" ? current.status : "needs_review",
      lastError: undefined
    }));

    for (const entry of nextAuditEntries) {
      updated = await appendAuditEntry(id, entry);
    }

    return NextResponse.json({ session: updated, message: "Safe fields filled where possible." });
  } catch (error) {
    return NextResponse.json({ error: humanizeError(error) }, { status: 500 });
  }
}
