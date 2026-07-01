import { NextResponse } from "next/server";

import { getAnswerBank } from "@/lib/answerBank";
import { appendAuditEntry, getApplicationSession, saveDetectedFields, setSessionError, updateApplicationSession } from "@/lib/applications";
import { createAuditEntry } from "@/lib/auditLog";
import { buildSuggestedFields } from "@/lib/fieldMapping";
import { buildJobContext } from "@/lib/jobContext";
import { extractJobMetadata } from "@/lib/jobMetadata";
import { getBrowserSession, scanVisibleFields, summarizePageWarnings } from "@/lib/playwrightSession";
import { getApplicantProfile } from "@/lib/profile";
import { humanizeError } from "@/lib/safety";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getApplicationSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  try {
    const runtime = getBrowserSession(id);
    if (!runtime || runtime.page.isClosed()) {
      throw new Error("Open the application window before scanning the page.");
    }

    await updateApplicationSession(id, (current) => ({
      ...current,
      status: "scanning",
      statusMessage: "Scanning form.",
      nextAction: "ApplyPilot is inspecting visible fields on the current page."
    }));

    const [rawFields, profile, answerBank, pageSummary] = await Promise.all([
      scanVisibleFields(runtime.page),
      getApplicantProfile(),
      getAnswerBank(),
      summarizePageWarnings(runtime.page)
    ]);
    const metadata = await extractJobMetadata(runtime.page);

    const detectedFields = buildSuggestedFields(rawFields, profile, answerBank, {
      company: session.company,
      roleTitle: session.roleTitle,
      source: session.source,
      notes: session.notes,
      metadataSource: session.metadataSource
    });
    let updated = await saveDetectedFields(
      id,
      detectedFields,
      pageSummary.warnings,
      pageSummary.finalSubmitButtons,
      runtime.page.url()
    );
    updated = await updateApplicationSession(id, (current) => ({
      ...current,
      company: metadata.company || current.company,
      roleTitle: metadata.roleTitle || current.roleTitle,
      metadataSource: metadata.source || current.metadataSource,
      captchaDetection: pageSummary.captcha,
      jobContext: buildJobContext({
        company: metadata.company || current.company,
        roleTitle: metadata.roleTitle || current.roleTitle,
        source: current.source,
        notes: current.notes,
        metadataSource: metadata.source || current.metadataSource
      })
    }));
    const withAudit = await appendAuditEntry(
      id,
      createAuditEntry(id, "scan_completed", `Scanned ${detectedFields.length} visible field${detectedFields.length === 1 ? "" : "s"}.`, {
        reason: "Only visible form controls were inspected, including supported custom comboboxes. Hidden prompts and hidden inputs were ignored."
      })
    );

    return NextResponse.json({ session: withAudit, message: "Page scan complete." });
  } catch (error) {
    const message = humanizeError(error);
    const updated = await setSessionError(id, message);
    return NextResponse.json({ error: message, session: updated }, { status: 500 });
  }
}
