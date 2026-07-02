"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, LoaderCircle, RotateCcw, Send } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { FilledFieldsSummary } from "@/components/FilledFieldsSummary";
import { ReviewStepper } from "@/components/ReviewStepper";
import { buildPreparationHeadline, formatPreparationDuration } from "@/lib/applicationsExperience";
import { buildSessionHeading } from "@/lib/jobMetadata";
import { ApplicationSession } from "@/types";

async function postJson(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }
  return payload;
}

function summarizeFilledItems(session: ApplicationSession) {
  return session.detectedFields
    .filter((field) => field.status === "filled")
    .map((field) => field.label || field.name || "Field")
    .slice(0, 6);
}

function getPrimaryAction(session: ApplicationSession) {
  if (session.captchaDetection?.status === "confirmed_visible_challenge") {
    return {
      key: "captcha-complete",
      label: "I finished the verification step",
      task: () => postJson(`/api/sessions/${session.id}/captcha`, { action: "completed" })
    };
  }

  if (session.browserStatus !== "open") {
    return {
      key: "open-browser",
      label: "Open application window",
      task: () => postJson(`/api/sessions/${session.id}/open-browser`)
    };
  }

  return {
    key: "autofill",
    label:
      session.status === "waiting_for_user"
        ? "Try this page again"
        : session.status === "failed"
          ? "Try again"
          : session.status === "ready_for_submission"
            ? "Check this page again"
            : "Continue on this page",
    task: () => postJson(`/api/sessions/${session.id}/autofill`)
  };
}

export function ApplicationSessionPanel({ initialSession }: { initialSession: ApplicationSession }) {
  const [session, setSession] = useState(initialSession);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  const unresolvedCount = useMemo(
    () => session.detectedFields.filter((field) => ["needs_review", "sensitive", "unknown", "error"].includes(field.status)).length,
    [session.detectedFields]
  );
  const filledItems = useMemo(() => summarizeFilledItems(session), [session]);
  const primaryAction = getPrimaryAction(session);
  const preparationSummary = session.preparationSummary;

  const runAction = async (action: string, task: () => Promise<{ session: ApplicationSession; message?: string }>) => {
    setBusyAction(action);
    setMessage(null);
    try {
      const payload = await task();
      setSession(payload.session);
      setMessage(payload.message ?? "Updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current application</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-950">
              {buildSessionHeading(session.roleTitle, session.company)}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{session.nextAction}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="primary-button"
              disabled={busyAction !== null}
              onClick={() => runAction(primaryAction.key, primaryAction.task)}
            >
              {busyAction === primaryAction.key ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              {busyAction === primaryAction.key ? "Working..." : primaryAction.label}
            </button>

            <details className="rounded-2xl border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700">
                More actions
                <ChevronDown className="h-4 w-4" />
              </summary>
              <div className="space-y-2 border-t border-slate-200 p-3">
                <button
                  type="button"
                  className="secondary-button w-full justify-start"
                  disabled={busyAction !== null}
                  onClick={() => runAction("open-browser", () => postJson(`/api/sessions/${session.id}/open-browser`))}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open application window
                </button>
                {session.captchaDetection?.status === "confirmed_visible_challenge" ? (
                  <button
                    type="button"
                    className="secondary-button w-full justify-start"
                    disabled={busyAction !== null}
                    onClick={() => runAction("captcha-override", () => postJson(`/api/sessions/${session.id}/captcha`, { action: "override" }))}
                  >
                    Continue once without waiting
                  </button>
                ) : null}
                <button
                  type="button"
                  className="secondary-button w-full justify-start"
                  disabled={busyAction !== null || session.status === "submitted"}
                  onClick={() => runAction("mark-submitted", () => postJson(`/api/sessions/${session.id}/mark-submitted`))}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Mark as submitted
                </button>
              </div>
            </details>
          </div>
        </div>

        {message ? (
          <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">{message}</div>
        ) : null}

        {session.lastError ? (
          <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            {session.lastError}
          </div>
        ) : null}

        {session.captchaDetection?.status === "confirmed_visible_challenge" ? (
          <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
            <p className="font-medium">A verification step is in the way.</p>
            <p className="mt-2">
              Finish it in the browser window, then come back here and continue. ApplyPilot will not try to bypass it.
            </p>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
            <p className="field-label">Where things stand</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-slate-900">Status</p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{session.statusMessage}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Page progress</p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                  {session.currentPageNumber} page{session.currentPageNumber === 1 ? "" : "s"} visited
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Safe fills</p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{session.fieldsFilledAndVerified}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Still needs you</p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{unresolvedCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/80 p-5">
            <p className="text-sm font-medium text-emerald-950">Already filled</p>
            {filledItems.length ? (
              <div className="mt-4 space-y-3">
                {filledItems.map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-emerald-900">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-emerald-900">
                Nothing has been filled yet. Once the form is visible and ready, try this page again.
              </p>
            )}
          </div>
        </div>
      </section>

      {session.detectedFields.length ? (
        <ReviewStepper
          fields={session.detectedFields}
          disabled={busyAction !== null}
          onApprove={(fieldId, value) =>
            runAction(`review-${fieldId}`, () => postJson(`/api/sessions/${session.id}/review`, { fieldId, action: "approve", value }))
          }
          onSkip={(fieldId) =>
            runAction(`skip-${fieldId}`, () => postJson(`/api/sessions/${session.id}/review`, { fieldId, action: "skip" }))
          }
          onSaveAnswer={(fieldId, value, canonicalQuestion) =>
            runAction(`save-answer-${fieldId}`, () =>
              postJson(`/api/sessions/${session.id}/review`, {
                fieldId,
                action: "approve",
                value,
                saveAnswer: true,
                canonicalQuestion
              })
            )
          }
          onReportWrongAnswer={(fieldId, correctedValue, note, learningApproved) =>
            runAction(`correction-${fieldId}`, () =>
              postJson(`/api/sessions/${session.id}/corrections`, {
                fieldId,
                correctedValue,
                note,
                learningApproved
              })
            )
          }
        />
      ) : (
        <div className="rounded-[28px] border border-slate-200 bg-white/92 p-6 text-sm leading-7 text-slate-700 shadow-sm">
          ApplyPilot has not found a fillable form on this page yet. If the site needs login, consent, or an extra click before the form appears, do that in the browser window first and then continue here.
        </div>
      )}

      {preparationSummary ? (
        <section className="rounded-[28px] border border-slate-200 bg-white/92 p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Dogfood summary</p>
          <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-slate-950">
            {buildPreparationHeadline(preparationSummary)}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {session.status === "ready_for_submission"
              ? "Ready for browser review."
              : session.status === "needs_review"
                ? `${unresolvedCount} fields still need browser review.`
                : `Current preparation time: ${formatPreparationDuration(preparationSummary.durationSeconds)}.`}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-[20px] bg-slate-50 px-4 py-4">
              <p className="field-label">Fields completed</p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{preparationSummary.fieldsCompleted}</p>
            </div>
            <div className="rounded-[20px] bg-slate-50 px-4 py-4">
              <p className="field-label">Suggested answers inserted</p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{preparationSummary.suggestedAnswersUsed}</p>
            </div>
            <div className="rounded-[20px] bg-slate-50 px-4 py-4">
              <p className="field-label">Details provided by you</p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{preparationSummary.questionsAnsweredByUser}</p>
            </div>
            <div className="rounded-[20px] bg-slate-50 px-4 py-4">
              <p className="field-label">Corrections made</p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{preparationSummary.correctionsMade}</p>
            </div>
            <div className="rounded-[20px] bg-slate-50 px-4 py-4">
              <p className="field-label">Retry count</p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{preparationSummary.retryCount}</p>
            </div>
            <div className="rounded-[20px] bg-slate-50 px-4 py-4">
              <p className="field-label">Still requiring review</p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{unresolvedCount}</p>
            </div>
          </div>
        </section>
      ) : null}

      <FilledFieldsSummary
        fields={session.detectedFields}
        disabled={busyAction !== null}
        onReportWrongAnswer={(fieldId, correctedValue, note, learningApproved) =>
          runAction(`filled-correction-${fieldId}`, () =>
            postJson(`/api/sessions/${session.id}/corrections`, {
              fieldId,
              correctedValue,
              note,
              learningApproved
            })
          )
        }
      />
    </div>
  );
}
