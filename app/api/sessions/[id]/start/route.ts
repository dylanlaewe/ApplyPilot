import { NextResponse } from "next/server";

import { getApplicationSession, setSessionError } from "@/lib/applications";
import { startQuickApply } from "@/lib/quickApply";
import { humanizeError } from "@/lib/safety";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getApplicationSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  try {
    const updated = await startQuickApply(id);
    return NextResponse.json({ session: updated, message: updated.statusMessage });
  } catch (error) {
    const message = humanizeError(error);
    const updated = await setSessionError(id, message);
    return NextResponse.json({ error: message, session: updated }, { status: 500 });
  }
}
