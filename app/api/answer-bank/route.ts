import { NextResponse } from "next/server";

import { getAnswerBank, saveAnswerBank } from "@/lib/answerBank";

export const runtime = "nodejs";

export async function GET() {
  const items = await getAnswerBank();
  return NextResponse.json({ items });
}

export async function PUT(request: Request) {
  try {
    const items = await request.json();
    const saved = await saveAnswerBank(items);
    return NextResponse.json({ items: saved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save answer bank." }, { status: 500 });
  }
}
