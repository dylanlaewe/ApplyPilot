import { NextResponse } from "next/server";

import { getApplicationSession } from "@/lib/applications";
import { saveSettings } from "@/lib/settings";
import { appendWorkdayDiagnostic } from "@/lib/workdayDiagnostics";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getApplicationSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };
    const enabled = body.enabled !== false;
    const settings = await saveSettings({
      diagnostics: {
        workday: {
          enabledSessionId: enabled ? id : ""
        }
      }
    });

    if (enabled) {
      await appendWorkdayDiagnostic(id, {
        event: "diagnostics_enabled",
        detail: {
          route: session.currentPageUrl || session.jobUrl
        }
      });
    }

    return NextResponse.json({
      ok: true,
      settings,
      message: enabled
        ? "Workday diagnostics will be recorded for this application session."
        : "Workday diagnostics are off for this application session."
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update Workday diagnostics." },
      { status: 500 }
    );
  }
}
