import { NextResponse } from "next/server";

import { getApplicantProfile, saveApplicantProfile } from "@/lib/profile";

export const runtime = "nodejs";

export async function GET() {
  const profile = await getApplicantProfile();
  return NextResponse.json({ profile });
}

export async function PUT(request: Request) {
  try {
    const profile = await request.json();
    const saved = await saveApplicantProfile(profile);
    return NextResponse.json({ profile: saved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save profile." }, { status: 500 });
  }
}
