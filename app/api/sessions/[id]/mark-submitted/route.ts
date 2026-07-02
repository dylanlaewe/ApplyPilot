import { NextResponse } from "next/server";

import { appendAuditEntry, getApplicationSession, updateApplicationSession } from "@/lib/applications";
import { applyUserFacingStatus } from "@/lib/applicationsExperience";
import { createAuditEntry } from "@/lib/auditLog";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getApplicationSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  try {
    const now = new Date().toISOString();
    const updated = await updateApplicationSession(id, (current) => ({
      ...applyUserFacingStatus(current, "submitted", now),
      statusMessage: "Submitted manually.",
      nextAction: "Track the outcome or archive the session when you are ready.",
      timeSpentSeconds: current.timeSpentSeconds || Math.max(60, Math.round((Date.now() - new Date(current.createdAt).getTime()) / 1000))
    }));
    const withAudit = await appendAuditEntry(
      id,
      createAuditEntry(id, "status_changed", "Marked as submitted manually.", {
        reason: "Submission confirmation is always a human-owned step."
      })
    );
    return NextResponse.json({ session: withAudit, message: "Session marked submitted." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update session." }, { status: 500 });
  }
}
