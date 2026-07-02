"use client";

import Link from "next/link";
import { Download, ExternalLink, FileWarning, FolderCog, LifeBuoy, LoaderCircle, Save, ShieldCheck, Trash2 } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { SectionCard } from "@/components/SectionCard";
import type { ApplyPilotSettings } from "@/lib/settings";
import type { ApplicationSession } from "@/types";

type LocalDataClearAction = "applications" | "saved_answers" | "behavioral_stories" | "profile" | "browser_sessions";

type GeneratorHealth = {
  status: string;
  provider: string;
  detail: string;
};

type LocalDataSummary = {
  dataDirectoryPath: string;
  profile: {
    identity: {
      fullName: string;
      email: string;
    };
    resume: {
      originalFilename: string;
      uploadedAt: string;
    };
  };
  counts: {
    savedAnswers: number;
    applicationHistory: number;
    behavioralStories: number;
  };
  browserDiagnostics: {
    browserConnected: boolean;
    openSessionCount: number;
    openSessionIds: string[];
  };
};

type PendingClearAction = {
  action: LocalDataClearAction;
  title: string;
  description: string;
  confirmLabel: string;
};

const healthTone: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  missing_configuration: "bg-amber-50 text-amber-700 border-amber-200",
  provider_error: "bg-rose-50 text-rose-700 border-rose-200",
  rate_limited: "bg-amber-50 text-amber-700 border-amber-200",
  validation_failure: "bg-amber-50 text-amber-700 border-amber-200",
  deterministic_fallback_only: "bg-slate-100 text-slate-700 border-slate-200"
};

const sectionLinks = [
  { href: "#general", label: "General" },
  { href: "#application-behavior", label: "Application behavior" },
  { href: "#answer-preferences", label: "Answer preferences" },
  { href: "#privacy", label: "Privacy and local data" },
  { href: "#help", label: "Help" },
  { href: "#advanced", label: "Advanced" }
] as const;

const troubleshootingItems = [
  {
    title: "Application form not detected",
    body: "Finish any login, cookie, or navigation step in the browser first, then scan the visible form again."
  },
  {
    title: "Browser window closed",
    body: "Open the application again from the session page or start the controlled browser from ApplyPilot."
  },
  {
    title: "Login required",
    body: "Sign in yourself in the controlled browser, then return to scanning once the actual form is visible."
  },
  {
    title: "CAPTCHA visible",
    body: "Complete it manually. ApplyPilot will pause and will not try to bypass human verification."
  },
  {
    title: "Resume missing",
    body: "Upload or replace your resume from Profile or Settings before starting another application."
  },
  {
    title: "Job posting unavailable",
    body: "The role may have moved or expired. Open the source link manually to confirm before continuing."
  },
  {
    title: "A field was filled incorrectly",
    body: "Edit it directly in the browser form, then save the application notes or update your profile if the source data should change."
  },
  {
    title: "Generated answer needs editing",
    body: "Treat generated wording as a draft. Rewrite it, save a better reusable answer if you want, and keep final review human."
  }
] as const;

const safetyNotes = [
  "ApplyPilot never submits applications automatically.",
  "It does not bypass CAPTCHA or other human verification.",
  "It does not invent unsupported experience or legal answers.",
  "Sensitive and legal questions may still need manual review.",
  "Saved answers can be reused when you want them to be.",
  "Application forms change often, so occasional manual correction is expected."
] as const;

function formatSavedState(state: "saved" | "saving" | "error") {
  if (state === "saving") {
    return "Saving";
  }

  if (state === "error") {
    return "Save issue";
  }

  return "Saved";
}

function buildClearAction(action: LocalDataClearAction): PendingClearAction {
  switch (action) {
    case "applications":
      return {
        action,
        title: "Clear application history?",
        description:
          "This removes local application records, notes, statuses, and session summaries. It keeps your profile, resume, saved answers, and behavioral stories.",
        confirmLabel: "Clear application history"
      };
    case "saved_answers":
      return {
        action,
        title: "Clear saved answers?",
        description:
          "This removes reusable answers from your local answer bank. It keeps your profile, resume, and application history.",
        confirmLabel: "Clear saved answers"
      };
    case "behavioral_stories":
      return {
        action,
        title: "Clear behavioral stories?",
        description:
          "This removes saved story examples from your profile. It keeps your personal info, work history, resume, and saved answers.",
        confirmLabel: "Clear behavioral stories"
      };
    case "profile":
      return {
        action,
        title: "Reset your profile?",
        description:
          "This clears your local profile details and removes the stored resume file from ApplyPilot. It does not clear saved answers or application history.",
        confirmLabel: "Reset profile"
      };
    case "browser_sessions":
      return {
        action,
        title: "Clear browser session data?",
        description:
          "This closes open controlled browser windows and removes in-memory browser session state. It does not delete profile data, resumes, saved answers, or application history.",
        confirmLabel: "Clear browser session data"
      };
    default:
      action satisfies never;
      return {
        action,
        title: "Clear local data?",
        description: "This removes selected local data only.",
        confirmLabel: "Clear local data"
      };
  }
}

function getClearActionDescription(action: LocalDataClearAction) {
  switch (action) {
    case "applications":
      return "Local application records, notes, statuses, and session summaries";
    case "saved_answers":
      return "Saved reusable answers";
    case "behavioral_stories":
      return "Saved behavioral stories only";
    case "profile":
      return "Profile details and the stored resume file";
    case "browser_sessions":
      return "Open controlled browser windows and in-memory browser session state";
    default:
      action satisfies never;
      return "Selected local data";
  }
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }
  return payload;
}

export function SettingsWorkspace({
  initialSettings,
  initialSummary,
  generatorHealth,
  recentSessions,
  focusSessionId = null
}: {
  initialSettings: ApplyPilotSettings;
  initialSummary: LocalDataSummary;
  generatorHealth: GeneratorHealth;
  recentSessions: ApplicationSession[];
  focusSessionId?: string | null;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [summary, setSummary] = useState(initialSummary);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<LocalDataClearAction | "export" | null>(null);
  const [pendingClearAction, setPendingClearAction] = useState<PendingClearAction | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(focusSessionId));
  const lastSavedRef = useRef(JSON.stringify(initialSettings));

  useEffect(() => {
    const serialized = JSON.stringify(settings);
    if (serialized === lastSavedRef.current) {
      return;
    }

    setSaveState("saving");
    setSaveError(null);
    const timeoutId = window.setTimeout(async () => {
      try {
        const payload = await fetchJson<{ settings: ApplyPilotSettings }>("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: serialized
        });
        setSettings(payload.settings);
        lastSavedRef.current = JSON.stringify(payload.settings);
        setSaveState("saved");
      } catch (error) {
        setSaveState("error");
        setSaveError(error instanceof Error ? error.message : "Could not save settings.");
      }
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [settings]);

  const highlightedSessions = useMemo(() => {
    const focusSession = recentSessions.find((session) => session.id === focusSessionId) ?? null;
    const others = recentSessions.filter((session) => session.id !== focusSessionId);
    return focusSession ? [focusSession, ...others] : recentSessions;
  }, [focusSessionId, recentSessions]);

  const resumeName = summary.profile.resume.originalFilename;
  const hasResume = Boolean(resumeName);

  const handleExport = async () => {
    setBusyAction("export");
    setMessage(null);
    try {
      const response = await fetch("/api/local-data/export");
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not export local data.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `applypilot-local-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage("Local data export downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export local data.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmedClear = async () => {
    if (!pendingClearAction) {
      return;
    }

    setBusyAction(pendingClearAction.action);
    setMessage(null);
    try {
      const payload = await fetchJson<{ summary: LocalDataSummary; message: string }>("/api/local-data/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pendingClearAction.action })
      });
      setSummary(payload.summary);
      setMessage(payload.message);
      setPendingClearAction(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update local data.");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="settings-workspace">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Settings</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-slate-950">Keep ApplyPilot careful, local, and easy to trust.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Manage your default resume, review local-data controls, and keep help close by without surfacing technical clutter in the normal application flow.
          </p>
          <span className="mt-4 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-600">
            Private alpha
          </span>
        </div>

        <div className="flex items-center gap-3 self-start rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200/80 lg:self-auto">
          {saveState === "saving" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>{formatSavedState(saveState)}</span>
        </div>
      </div>

      {saveError ? (
        <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{saveError}</div>
      ) : null}

      {message ? <div className="rounded-[22px] bg-slate-100 px-4 py-3 text-sm text-slate-700">{message}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <SectionCard title="General" description="Keep the most-used setup details close at hand." className="scroll-mt-24" >
            <div id="general" className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] bg-slate-50/80 p-5">
                <p className="field-label">Default resume</p>
                <p className="mt-3 text-lg font-semibold text-slate-950">{hasResume ? resumeName : "No resume selected yet"}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {hasResume
                    ? "Stored locally on this device and ready when a visible resume field appears."
                    : "Upload a PDF or DOCX before starting another application so ApplyPilot can attach it when asked."}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/profile" className="primary-button">
                    {hasResume ? "Replace resume" : "Upload resume"}
                  </Link>
                  <Link href="/onboarding" className="secondary-button">
                    Open resume setup
                  </Link>
                </div>
              </div>

              <div className="rounded-[24px] bg-slate-50/80 p-5">
                <p className="field-label">Profile owner</p>
                <p className="mt-3 text-lg font-semibold text-slate-950">{summary.profile.identity.fullName || "Profile not filled out yet"}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {summary.profile.identity.email
                    ? `${summary.profile.identity.email} is the current primary contact email in your local profile.`
                    : "Complete your profile so ApplyPilot can fill the basics without guessing."}
                </p>
                <div className="mt-4">
                  <Link href="/profile" className="secondary-button">
                    Edit profile
                  </Link>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Application behavior"
            description="Only show controls that affect the way ApplyPilot behaves during a real application."
            className="scroll-mt-24"
          >
            <div id="application-behavior" className="space-y-4">
              <label className="flex items-start gap-4 rounded-[24px] bg-slate-50/80 p-5">
                <input
                  type="checkbox"
                  checked={settings.applicationBehavior.reuseBrowserWindow}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      applicationBehavior: {
                        ...current.applicationBehavior,
                        reuseBrowserWindow: event.target.checked
                      }
                    }))
                  }
                />
                <span className="block">
                  <span className="text-sm font-medium text-slate-950">Reuse the current controlled browser window when possible</span>
                  <span className="mt-2 block text-sm leading-6 text-slate-600">
                    When you start another application, ApplyPilot can continue in the same controlled browser window instead of opening a second one.
                  </span>
                </span>
              </label>
            </div>
          </SectionCard>

          <SectionCard
            title="Answer preferences"
            description="Keep reusable answers in plain language without exposing matching internals."
            className="scroll-mt-24"
          >
            <div id="answer-preferences" className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] bg-slate-50/80 p-5">
                <p className="field-label">Saved answers</p>
                <p className="mt-3 text-lg font-semibold text-slate-950">{summary.counts.savedAnswers}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Reusable answers stay editable in human terms: the question, your answer, and where ApplyPilot may reuse it.
                </p>
                <div className="mt-4">
                  <Link href="/answer-bank" className="secondary-button">
                    Open saved answers
                  </Link>
                </div>
              </div>
              <div className="rounded-[24px] bg-slate-50/80 p-5">
                <p className="field-label">Behavioral stories</p>
                <p className="mt-3 text-lg font-semibold text-slate-950">{summary.counts.behavioralStories}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Stories live in your profile so you can keep examples concise, factual, and ready to review when a form asks.
                </p>
                <div className="mt-4">
                  <Link href="/profile" className="secondary-button">
                    Edit profile stories
                  </Link>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Privacy and local data"
            description="Explain what stays on this device, what can be cleared, and what still requires your judgment."
            className="scroll-mt-24"
          >
            <div id="privacy" className="space-y-5">
              <div className="rounded-[24px] bg-slate-50/80 p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-slate-700" />
                  <div className="space-y-3 text-sm leading-6 text-slate-600">
                    <p>
                      ApplyPilot stores your profile, saved answers, application history, settings, and any uploaded resume in the local <span className="font-medium text-slate-900">data folder</span> for this app on this device.
                    </p>
                    <p>
                      When a generated-answer provider is configured, ApplyPilot may send limited question text plus selected profile evidence needed to draft a response. Final submission still remains fully manual.
                    </p>
                    <p>
                      Optional demographic answers stay optional. ApplyPilot should not reuse sensitive demographic information unless you explicitly saved an exact answer and the application asks for it.
                    </p>
                    <p className="rounded-2xl bg-white px-4 py-3 text-slate-700 ring-1 ring-slate-200">
                      Stored locally in <span className="font-mono text-xs text-slate-900">{summary.dataDirectoryPath}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <button type="button" className="secondary-button justify-center" onClick={handleExport} disabled={busyAction === "export"}>
                  {busyAction === "export" ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export local data
                </button>
                <button
                  type="button"
                  className="secondary-button justify-center"
                  onClick={() => setPendingClearAction(buildClearAction("browser_sessions"))}
                  disabled={Boolean(busyAction)}
                >
                  <FolderCog className="mr-2 h-4 w-4" />
                  Clear browser session data
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {(["applications", "saved_answers", "behavioral_stories", "profile"] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    className="flex min-h-[120px] flex-col items-start justify-between rounded-[24px] border border-slate-200 bg-white p-5 text-left transition hover:border-slate-300"
                    onClick={() => setPendingClearAction(buildClearAction(action))}
                    disabled={Boolean(busyAction)}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-950">
                        {action === "applications"
                          ? "Clear application history"
                          : action === "saved_answers"
                            ? "Clear saved answers"
                            : action === "behavioral_stories"
                              ? "Clear behavioral stories"
                              : "Reset profile"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{getClearActionDescription(action)}</p>
                    </div>
                    <span className="mt-4 inline-flex items-center text-sm font-medium text-slate-700">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Review before clearing
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Help" description="Keep the workflow simple, honest, and easy to recover when a form changes." className="scroll-mt-24">
            <div id="help" className="space-y-5">
              <div className="rounded-[24px] bg-slate-50/80 p-5">
                <p className="field-label">How it works</p>
                <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                  <li>1. Add your profile and resume.</li>
                  <li>2. Paste an application link.</li>
                  <li>3. ApplyPilot fills safe answers it can match confidently.</li>
                  <li>4. ApplyPilot asks for missing or sensitive information instead of guessing.</li>
                  <li>5. You review the browser form and make any edits you want.</li>
                  <li>6. You submit the application yourself.</li>
                </ol>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="rounded-[24px] bg-slate-50/80 p-5">
                  <p className="field-label">What ApplyPilot will not do</p>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                    {safetyNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[24px] bg-slate-50/80 p-5">
                  <p className="field-label">Quick links</p>
                  <div className="mt-4 space-y-3">
                    <Link href="/applications" className="secondary-button w-full justify-between">
                      Open application history
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                    <Link href="/profile" className="secondary-button w-full justify-between">
                      Review profile and resume
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                    <Link href="/answer-bank" className="secondary-button w-full justify-between">
                      Refine saved answers
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] bg-slate-50/80 p-5">
                <div className="flex items-center gap-3">
                  <LifeBuoy className="h-5 w-5 text-slate-700" />
                  <p className="field-label">Troubleshooting</p>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {troubleshootingItems.map((item) => (
                    <div key={item.title} className="rounded-[20px] bg-white px-4 py-4 ring-1 ring-slate-200">
                      <p className="text-sm font-medium text-slate-950">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Advanced" description="Technical details stay collapsed until you intentionally open them." className="scroll-mt-24">
            <details id="advanced" open={advancedOpen} onToggle={(event) => setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)} className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-900">Advanced diagnostics</summary>
              {advancedOpen ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-[20px] bg-white px-4 py-4 ring-1 ring-slate-200">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-medium text-slate-900">Generator health</p>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${healthTone[generatorHealth.status] ?? healthTone.deterministic_fallback_only}`}>
                        {generatorHealth.status.replaceAll("_", " ")}
                      </span>
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{generatorHealth.provider}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{generatorHealth.detail}</p>
                  </div>

                  <div className="rounded-[20px] bg-white px-4 py-4 ring-1 ring-slate-200">
                    <p className="font-medium text-slate-900">Browser-session diagnostics</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                        <p className="field-label">Window state</p>
                        <p className="mt-2 text-sm font-medium text-slate-950">{summary.browserDiagnostics.browserConnected ? "Connected" : "No controlled browser open"}</p>
                      </div>
                      <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                        <p className="field-label">Open sessions</p>
                        <p className="mt-2 text-sm font-medium text-slate-950">{summary.browserDiagnostics.openSessionCount}</p>
                      </div>
                      <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                        <p className="field-label">Window reuse</p>
                        <p className="mt-2 text-sm font-medium text-slate-950">
                          {settings.applicationBehavior.reuseBrowserWindow ? "Reuse is on" : "Reuse is off"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[20px] bg-white px-4 py-4 ring-1 ring-slate-200">
                    <div className="flex items-center gap-3">
                      <FileWarning className="h-4 w-4 text-slate-700" />
                      <p className="font-medium text-slate-900">Technical logs</p>
                    </div>
                    <div className="mt-4 space-y-3">
                      {highlightedSessions.length ? (
                        highlightedSessions.slice(0, 5).map((session) => (
                          <div
                            key={session.id}
                            className={`rounded-[18px] px-4 py-4 ${session.id === focusSessionId ? "bg-sky-50 ring-1 ring-sky-200" : "bg-slate-50"}`}
                          >
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="text-sm font-medium text-slate-950">{session.roleTitle || session.company || session.jobUrl}</p>
                              {session.id === focusSessionId ? (
                                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-900">Troubleshooting this application</span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm text-slate-600">
                              {session.detectedFields.length} fields detected, {session.warnings.length} warnings, {session.auditLog.length} audit events.
                            </p>
                            {session.warnings[0] ? <p className="mt-2 text-sm leading-6 text-slate-700">{session.warnings[0]}</p> : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[18px] bg-slate-50 px-4 py-4 text-sm text-slate-600">No diagnostics yet.</div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[20px] bg-white px-4 py-4 ring-1 ring-slate-200">
                      <p className="font-medium text-slate-900">Data export</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Download a local snapshot of your profile, saved answers, settings, and application history for your own records.
                      </p>
                      <button type="button" className="secondary-button mt-4" onClick={handleExport} disabled={busyAction === "export"}>
                        <Download className="mr-2 h-4 w-4" />
                        Export local data
                      </button>
                    </div>

                    <div className="rounded-[20px] bg-white px-4 py-4 ring-1 ring-slate-200">
                      <p className="font-medium text-slate-900">Benchmark tools</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Live benchmark runs remain a manual local tool. Use them only when you intentionally want to test autofill behavior against the controlled fixtures.
                      </p>
                      <code className="mt-4 block rounded-2xl bg-slate-950 px-4 py-3 text-xs text-slate-100">npm run benchmark:applications</code>
                    </div>
                  </div>
                </div>
              ) : null}
            </details>
          </SectionCard>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[28px] bg-white/92 p-5 shadow-sm ring-1 ring-slate-200/80">
            <p className="field-label">Settings navigation</p>
            <nav className="mt-4 flex flex-col gap-2">
              {sectionLinks.map((item) => (
                <a key={item.href} href={item.href} className="secondary-button justify-start">
                  {item.label}
                </a>
              ))}
            </nav>
          </section>

          <section className="rounded-[28px] bg-white/92 p-5 shadow-sm ring-1 ring-slate-200/80">
            <p className="field-label">Local data snapshot</p>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="flex items-center justify-between rounded-[18px] bg-slate-50 px-4 py-3">
                <span>Applications</span>
                <span className="font-medium text-slate-950">{summary.counts.applicationHistory}</span>
              </div>
              <div className="flex items-center justify-between rounded-[18px] bg-slate-50 px-4 py-3">
                <span>Saved answers</span>
                <span className="font-medium text-slate-950">{summary.counts.savedAnswers}</span>
              </div>
              <div className="flex items-center justify-between rounded-[18px] bg-slate-50 px-4 py-3">
                <span>Behavioral stories</span>
                <span className="font-medium text-slate-950">{summary.counts.behavioralStories}</span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <ConfirmationDialog
        open={Boolean(pendingClearAction)}
        title={pendingClearAction?.title ?? "Clear local data?"}
        description={pendingClearAction?.description ?? "Review what will be removed before continuing."}
        confirmLabel={pendingClearAction?.confirmLabel ?? "Clear local data"}
        tone="danger"
        busy={Boolean(pendingClearAction && busyAction === pendingClearAction.action)}
        onCancel={() => setPendingClearAction(null)}
        onConfirm={handleConfirmedClear}
      />
    </div>
  );
}
