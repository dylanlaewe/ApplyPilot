import { NextResponse } from "next/server";

import { clearLocalData, getClearActionMessage, LocalDataClearAction } from "@/lib/localData";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: LocalDataClearAction };
    const action = body.action;

    if (!action || !["applications", "saved_answers", "behavioral_stories", "profile", "browser_sessions"].includes(action)) {
      return NextResponse.json({ error: "Choose a valid local-data action." }, { status: 400 });
    }

    const summary = await clearLocalData(action);
    return NextResponse.json({
      ok: true,
      action,
      message: getClearActionMessage(action),
      summary
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update local data." }, { status: 500 });
  }
}
