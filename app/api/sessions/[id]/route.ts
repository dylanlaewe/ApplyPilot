import { NextResponse } from "next/server";

import { appendAuditEntry, deleteApplicationSession, getApplicationSession, updateApplicationDisplayStatus, updateApplicationSession } from "@/lib/applications";
import { applyUserFacingStatus } from "@/lib/applicationsExperience";
import { createAuditEntry } from "@/lib/auditLog";
import { ApplicationDisplayStatus, ApplicationNextStep, SubmissionConfirmationState } from "@/types";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getApplicationSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({ session });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Partial<{
      notes: string;
      nextStep: ApplicationNextStep | null;
      applicationStatus: ApplicationDisplayStatus;
      submissionConfirmationState: SubmissionConfirmationState;
    }>;

    if (body.applicationStatus) {
      const updated = await updateApplicationDisplayStatus(id, body.applicationStatus);
      const message =
        body.applicationStatus === "archived" ? "Application archived." : `Status updated to ${body.applicationStatus.replaceAll("_", " ")}.`;
      const saved = await appendAuditEntry(
        id,
        createAuditEntry(id, "status_changed", message)
      );
      return NextResponse.json({ session: saved, message });
    }

    const session = await updateApplicationSession(id, (current) => {
      const base =
        body.submissionConfirmationState === "not_yet" ? applyUserFacingStatus(current, "in_progress") : current;

      return {
        ...base,
      notes: body.notes ?? current.notes,
        nextStep: body.nextStep !== undefined ? body.nextStep : current.nextStep,
      submissionConfirmationState: body.submissionConfirmationState ?? current.submissionConfirmationState,
      submissionConfirmationUpdatedAt:
        body.submissionConfirmationState !== undefined ? new Date().toISOString() : current.submissionConfirmationUpdatedAt,
      };
    });
    const saved = await appendAuditEntry(
      id,
      createAuditEntry(
        id,
        "session_saved",
        body.nextStep !== undefined ? "Application details saved." : "Session notes saved."
      )
    );
    return NextResponse.json({ session: saved, message: "Saved." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save session." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteApplicationSession(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete session." }, { status: 500 });
  }
}
