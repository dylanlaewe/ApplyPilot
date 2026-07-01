import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, LoaderCircle, Sparkles } from "lucide-react";
import React, { ReactNode } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { buildSessionHeading } from "@/lib/jobMetadata";
import { ApplicationSession } from "@/types";

type ProgressItem = {
  label: string;
  state: "complete" | "current" | "upcoming";
};

function toneStyles(tone: "idle" | "active" | "review" | "ready" | "attention" | "error") {
  switch (tone) {
    case "active":
      return "border-sky-200 bg-sky-50/80";
    case "review":
      return "border-amber-200 bg-amber-50/80";
    case "ready":
      return "border-emerald-200 bg-emerald-50/80";
    case "attention":
      return "border-amber-200 bg-amber-50/80";
    case "error":
      return "border-rose-200 bg-rose-50/80";
    default:
      return "border-slate-200 bg-white/92";
  }
}

function modeCopy(mode: "initial" | "missing_resume" | "active" | "needs_input" | "ready" | "recovery") {
  switch (mode) {
    case "missing_resume":
      return {
        eyebrow: "Prepare once",
        title: "Add your resume before you start applying.",
        description: "ApplyPilot can fill basic fields without guessing, but it works best when your resume is already on file."
      };
    case "active":
      return {
        eyebrow: "Working",
        title: "ApplyPilot is moving through the page now.",
        description: "It will fill only the basics it can match with confidence, then pause anywhere your judgment is needed."
      };
    case "needs_input":
      return {
        eyebrow: "Needs your input",
        title: "A few answers still need you.",
        description: "Work through them one at a time, adjust anything you want, and keep control of the final application."
      };
    case "ready":
      return {
        eyebrow: "Ready for review",
        title: "The safe parts are done.",
        description: "Give the page one final look in the browser window, then submit on the job site yourself when you are ready."
      };
    case "recovery":
      return {
        eyebrow: "Needs attention",
        title: "This application needs a quick manual step.",
        description: "ApplyPilot paused instead of guessing. Finish the blocked step in the browser, then continue from here."
      };
    default:
      return {
        eyebrow: "Apply",
        title: "Start a job application without giving up control.",
        description: "Paste a job link, let ApplyPilot fill the basics it already knows, and review every uncertain answer before anything is submitted."
      };
  }
}

export function ApplyWorkspaceView({
  mode,
  hasResume,
  resumeName,
  url,
  error,
  disabled,
  startLabel,
  session,
  progressItems,
  stateTone,
  reviewCount,
  recentSessions,
  sessionPanel,
  onUrlChange,
  onStart
}: {
  mode: "initial" | "missing_resume" | "active" | "needs_input" | "ready" | "recovery";
  hasResume: boolean;
  resumeName: string;
  url: string;
  error: string | null;
  disabled: boolean;
  startLabel: string;
  session: ApplicationSession | null;
  progressItems: ReadonlyArray<ProgressItem>;
  stateTone: "idle" | "active" | "review" | "ready" | "attention" | "error";
  reviewCount: number;
  recentSessions: ApplicationSession[];
  sessionPanel?: ReactNode;
  onUrlChange: (value: string) => void;
  onStart: () => void;
}) {
  const copy = modeCopy(mode);
  const recent = recentSessions.filter((entry) => entry.id !== session?.id).slice(0, 4);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <section className="rounded-[32px] border border-slate-200 bg-white/92 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{copy.eyebrow}</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">{copy.title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">{copy.description}</p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4 lg:min-w-[260px]">
            <p className="field-label">Resume</p>
            {hasResume ? (
              <>
                <p className="mt-2 text-sm font-medium text-slate-950">Ready to upload</p>
                <p className="mt-1 text-sm text-slate-600">{resumeName}</p>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm font-medium text-slate-950">Missing</p>
                <p className="mt-1 text-sm text-slate-600">Upload the resume you want ApplyPilot to use.</p>
              </>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/onboarding" className="secondary-button px-3 py-2 text-xs">
                {hasResume ? "Replace resume" : "Upload resume"}
              </Link>
              <Link href="/profile" className="secondary-button px-3 py-2 text-xs">
                Edit profile
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 xl:flex-row">
          <input
            className="field-input h-14 flex-1 rounded-[22px] px-5 text-base"
            placeholder="Paste a job application link"
            value={url}
            disabled={disabled}
            onChange={(event) => onUrlChange(event.target.value)}
            aria-label="Job application URL"
          />
          <button type="button" className="primary-button h-14 rounded-[22px] px-6 text-base" disabled={disabled} onClick={onStart}>
            {disabled && hasResume ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
            {startLabel}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            {error}
          </div>
        ) : null}

        {session ? (
          <div className={`mt-6 rounded-[24px] border px-5 py-5 ${toneStyles(stateTone)}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={session.status} />
                  <p className="text-sm font-medium text-slate-950">{buildSessionHeading(session.roleTitle, session.company)}</p>
                </div>
                <p className="mt-3 text-lg font-medium text-slate-950">{session.statusMessage}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{session.nextAction}</p>
              </div>

              <details className="rounded-[20px] border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 lg:w-[280px]">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-950">
                  More actions
                  <ChevronDown className="h-4 w-4" />
                </summary>
                <div className="mt-3 space-y-2">
                  <Link href="/applications" className="block rounded-2xl border border-slate-200 bg-white px-3 py-2 hover:border-slate-300">
                    View application history
                  </Link>
                  <Link href="/answer-bank" className="block rounded-2xl border border-slate-200 bg-white px-3 py-2 hover:border-slate-300">
                    Open saved answers
                  </Link>
                  <Link href="/settings" className="block rounded-2xl border border-slate-200 bg-white px-3 py-2 hover:border-slate-300">
                    Open advanced settings
                  </Link>
                </div>
              </details>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-4">
              {progressItems.map((item) => (
                <div key={item.label} className="rounded-[20px] border border-white/70 bg-white/80 px-4 py-4">
                  <div className="flex items-center gap-3">
                    {item.state === "complete" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : item.state === "current" ? (
                      <Sparkles className="h-4 w-4 text-sky-600" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-slate-300" />
                    )}
                    <span className="text-sm font-medium text-slate-900">{item.label}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <div className="rounded-[20px] border border-white/70 bg-white/80 px-4 py-4">
                <p className="field-label">Last pass</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{session.fieldsDetected}</p>
                <p className="mt-1 text-sm text-slate-600">fields found on the current page</p>
              </div>
              <div className="rounded-[20px] border border-white/70 bg-white/80 px-4 py-4">
                <p className="field-label">Filled safely</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{session.fieldsFilledAndVerified}</p>
                <p className="mt-1 text-sm text-slate-600">answers placed and confirmed</p>
              </div>
              <div className="rounded-[20px] border border-white/70 bg-white/80 px-4 py-4">
                <p className="field-label">Still needs you</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{reviewCount}</p>
                <p className="mt-1 text-sm text-slate-600">answers to review or finish manually</p>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>{sessionPanel}</div>

        <aside className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white/88 p-5 shadow-sm">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-950">Before you submit</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>ApplyPilot never presses the final submit button for you.</p>
              <p>Use the browser window to confirm every answer, move between pages, and submit only when you decide the application is ready.</p>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white/88 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-950">Recent applications</h2>
              <Link href="/applications" className="text-sm font-medium text-slate-600 underline underline-offset-4">
                View all
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {recent.length ? (
                recent.map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/?session=${entry.id}`}
                    className="block rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 transition hover:border-slate-300"
                  >
                    <p className="text-sm font-medium text-slate-950">{buildSessionHeading(entry.roleTitle, entry.company)}</p>
                    <p className="mt-1 text-sm text-slate-600">{entry.statusMessage}</p>
                  </Link>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/60 px-4 py-4 text-sm text-slate-600">
                  No applications started yet.
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
