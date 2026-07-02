import { NextResponse } from "next/server";

import { submitCorrectionReport } from "@/lib/corrections";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      fieldId?: string;
      correctedValue?: string;
      note?: string;
      learningApproved?: boolean;
    };

    if (!body.fieldId?.trim()) {
      return NextResponse.json({ error: "Field is required." }, { status: 400 });
    }

    if (!body.correctedValue?.trim()) {
      return NextResponse.json({ error: "Add the correct value before saving this correction." }, { status: 400 });
    }

    const result = await submitCorrectionReport({
      sessionId: id,
      fieldId: body.fieldId,
      correctedValue: body.correctedValue,
      note: body.note,
      learningApproved: Boolean(body.learningApproved)
    });

    return NextResponse.json({
      session: result.session,
      report: result.report,
      message: result.applied.profileUpdated || result.applied.answerSaved
        ? "Correction saved locally and reused for similar applications when it is safe."
        : "Correction saved locally for dogfooding."
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save this correction." }, { status: 500 });
  }
}
