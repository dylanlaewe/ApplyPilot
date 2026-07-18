import { NextResponse } from "next/server";

import { loadSyntheticQaData, restoreSyntheticQaBackup, syntheticQaBackupAvailable } from "@/lib/syntheticQaProfile";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ backupAvailable: await syntheticQaBackupAvailable() });
}

export async function POST() {
  try {
    const payload = await loadSyntheticQaData();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load the synthetic QA profile." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const payload = await restoreSyntheticQaBackup();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to restore the previous local profile." },
      { status: 500 }
    );
  }
}
