import { NextResponse } from "next/server";

import { getApplicationSession, updateApplicationSession } from "@/lib/applications";
import { runAutofillPass } from "@/lib/quickApply";
import { humanizeError } from "@/lib/safety";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getApplicationSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { action?: "completed" | "override" };

    if (body.action === "override") {
      await updateApplicationSession(id, (current) => ({
        ...current,
        captchaOverridePageUrl: current.currentPageUrl || current.jobUrl,
        statusMessage: "Continuing despite the reported verification step.",
        nextAction: "ApplyPilot is rescanning the page with your one-page override."
      }));
    } else {
      await updateApplicationSession(id, (current) => ({
        ...current,
        statusMessage: "Checking whether human verification is now complete.",
        nextAction: "ApplyPilot is rescanning the page."
      }));
    }

    const updated = await runAutofillPass(id);
    return NextResponse.json({ session: updated, message: updated.statusMessage });
  } catch (error) {
    return NextResponse.json({ error: humanizeError(error) }, { status: 500 });
  }
}
