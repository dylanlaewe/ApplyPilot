import { NextResponse } from "next/server";

import { appendAuditEntry, getApplicationSession, updateApplicationSession } from "@/lib/applications";
import { ensureApplicationOverlayForSession } from "@/lib/applicationOverlaySession";
import { ensureApplicationTransitionCoordinator } from "@/lib/applicationTransitionCoordinator";
import { resolveAutomationStrategyForPage, toSessionAtsProvider } from "@/lib/atsStrategy";
import { createAuditEntry } from "@/lib/auditLog";
import { launchBrowserSession, summarizePageWarnings, waitForPageReadiness } from "@/lib/playwrightSession";
import { extractJobMetadata } from "@/lib/jobMetadata";
import { humanizeError } from "@/lib/safety";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getApplicationSession(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  try {
    const settings = await getSettings();
    const requestedUrl =
      session.currentPageUrl && session.currentPageUrl !== "about:blank"
        ? session.currentPageUrl
        : session.jobUrl;

    if (!requestedUrl.trim()) {
      return NextResponse.json({ error: "This application does not have a job URL yet." }, { status: 400 });
    }

    const runtime = await launchBrowserSession(requestedUrl, id, {
      navigate: true,
      reuseOpenPage: settings.applicationBehavior.reuseBrowserWindow
    });

    if (!runtime.page.url() || runtime.page.url() === "about:blank") {
      return NextResponse.json({ error: "ApplyPilot could not open the application URL." }, { status: 500 });
    }

    await waitForPageReadiness(runtime.page);
    const strategy = await resolveAutomationStrategyForPage({
      page: runtime.page,
      url: runtime.page.url() || requestedUrl,
      settings
    });
    await ensureApplicationTransitionCoordinator(id, runtime.page);
    await ensureApplicationOverlayForSession(id, runtime.page);
    const pageSummary = await summarizePageWarnings(runtime.page);
    const metadata = await extractJobMetadata(runtime.page);

    const updated = await updateApplicationSession(id, (current) => ({
      ...current,
      browserStatus: "open",
      status:
        current.status === "submitted"
          ? current.status
          : current.status === "ready_for_submission" || current.status === "needs_review"
            ? current.status
            : "waiting_for_user",
      statusMessage:
        current.status === "ready_for_submission" || current.status === "needs_review"
          ? current.statusMessage
          : "Browser ready.",
      nextAction:
        current.status === "ready_for_submission" || current.status === "needs_review"
          ? current.nextAction
          : "Use the ApplyPilot control in the application window when the form is visible.",
      atsProvider: toSessionAtsProvider(strategy.atsKind),
      company: metadata.company || current.company,
      roleTitle: metadata.roleTitle || current.roleTitle,
      metadataSource: metadata.source || current.metadataSource,
      captchaDetection: pageSummary.captcha,
      warnings: pageSummary.warnings,
      finalSubmitButtons: pageSummary.finalSubmitButtons,
      currentPageUrl: runtime.page.url(),
      lastError: undefined
    }));

    const withAudit = await appendAuditEntry(
      id,
      createAuditEntry(id, "browser_opened", "Controlled browser opened for this application.", {
        reason: "Playwright launched a headed session and installed a submit guard for scripted actions."
      })
    );

    return NextResponse.json({ session: withAudit, message: "Application window opened." });
  } catch (error) {
    return NextResponse.json({ error: humanizeError(error) }, { status: 500 });
  }
}
