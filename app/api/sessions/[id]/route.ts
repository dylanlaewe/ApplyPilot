import { NextResponse } from "next/server";

import { appendAuditEntry, getApplicationSession, updateApplicationSession } from "@/lib/applications";
import { createAuditEntry } from "@/lib/auditLog";

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
    const body = (await request.json()) as Partial<{ notes: string }>;
    const session = await updateApplicationSession(id, (current) => ({
      ...current,
      notes: body.notes ?? current.notes
    }));
    const saved = await appendAuditEntry(id, createAuditEntry(id, "session_saved", "Session notes saved."));
    return NextResponse.json({ session: saved, message: "Session saved." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save session." }, { status: 500 });
  }
}
