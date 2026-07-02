import { NextResponse } from "next/server";

import { exportLocalDataBundle } from "@/lib/localData";

export const runtime = "nodejs";

export async function GET() {
  try {
    const bundle = await exportLocalDataBundle();
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="applypilot-local-data-${new Date().toISOString().slice(0, 10)}.json"`
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not export local data." }, { status: 500 });
  }
}
