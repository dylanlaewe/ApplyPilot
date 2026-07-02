import { NextResponse } from "next/server";

import { getSettings, saveSettings } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Partial<Awaited<ReturnType<typeof getSettings>>>;
    const settings = await saveSettings(body);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save settings." }, { status: 500 });
  }
}
