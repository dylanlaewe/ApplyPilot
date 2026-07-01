import Link from "next/link";

import { SectionCard } from "@/components/SectionCard";
import { getApplicationSessions } from "@/lib/applications";
import { getShortAnswerGeneratorRuntimeHealth } from "@/lib/shortAnswerGenerator";

const healthTone: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  missing_configuration: "bg-amber-50 text-amber-700 border-amber-200",
  provider_error: "bg-rose-50 text-rose-700 border-rose-200",
  rate_limited: "bg-amber-50 text-amber-700 border-amber-200",
  validation_failure: "bg-amber-50 text-amber-700 border-amber-200",
  deterministic_fallback_only: "bg-slate-100 text-slate-700 border-slate-200"
};

export default async function SettingsPage() {
  const sessions = await getApplicationSessions();
  const recentDiagnostics = sessions.slice(0, 5);
  const generatorHealth = getShortAnswerGeneratorRuntimeHealth();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Settings</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-slate-950">Settings</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          Keep saved answers, resume setup, and advanced troubleshooting in one place.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Saved answers" description="Review and refine the reusable answers ApplyPilot can suggest on future applications.">
          <Link href="/answer-bank" className="primary-button">
            Open saved answers
          </Link>
        </SectionCard>

        <SectionCard title="Resume" description="Replace the resume ApplyPilot can upload when a form asks for it.">
          <Link href="/onboarding" className="secondary-button">
            Manage resume
          </Link>
        </SectionCard>
      </div>

      <SectionCard title="Advanced" description="Technical detail stays here, away from the main Apply flow.">
        <details className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-900">Diagnostics</summary>
          <div className="mt-4 space-y-3">
            <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-medium text-slate-900">Short-answer generator</p>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${healthTone[generatorHealth.status]}`}>
                  {generatorHealth.status.replaceAll("_", " ")}
                </span>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{generatorHealth.provider}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{generatorHealth.detail}</p>
            </div>

            {recentDiagnostics.length ? (
              recentDiagnostics.map((session) => (
                <div key={session.id} className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">{session.roleTitle || session.jobUrl}</p>
                  <p className="mt-1">
                    {session.detectedFields.length} fields detected · {session.warnings.length} warnings · {session.auditLog.length} audit events
                  </p>
                  <p className="mt-1 text-slate-500">
                    {session.detectedFields.filter((field) => field.shortAnswer).length} short-answer fields
                    {session.generatorHealth ? ` · generator ${session.generatorHealth.status.replaceAll("_", " ")}` : ""}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[18px] border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-600">
                No diagnostics yet.
              </div>
            )}
          </div>
        </details>
      </SectionCard>
    </div>
  );
}
