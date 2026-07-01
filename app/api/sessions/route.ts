import { NextResponse } from "next/server";

import { createApplicationSession, getApplicationSessions } from "@/lib/applications";
import { NewSessionInput } from "@/types";

export const runtime = "nodejs";

export async function GET() {
  const sessions = await getApplicationSessions();
  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NewSessionInput;
    if (!body.jobUrl?.trim()) {
      return NextResponse.json({ error: "Job URL is required." }, { status: 400 });
    }

    const session = await createApplicationSession({
      company: body.company?.trim() ?? "",
      roleTitle: body.roleTitle?.trim() ?? "",
      jobUrl: body.jobUrl.trim(),
      source: body.source?.trim() ?? "",
      notes: body.notes?.trim() ?? ""
    });

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create session." }, { status: 500 });
  }
}
