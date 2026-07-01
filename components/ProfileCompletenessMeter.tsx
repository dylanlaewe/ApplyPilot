import { getAnswerBank } from "@/lib/answerBank";
import { createProfileCompleteness } from "@/lib/profileCompleteness";
import { ApplicantProfile } from "@/types";

export async function ProfileCompletenessMeter({ profile }: { profile: ApplicantProfile }) {
  const answerBank = await getAnswerBank();
  const completeness = createProfileCompleteness(profile, answerBank.filter((item) => item.answer.trim()).length);

  return (
    <div className="rounded-[26px] border border-slate-200 bg-white/85 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Profile completeness</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-950">{completeness.score}%</p>
        </div>
        <div className="h-16 w-16 rounded-full bg-slate-100 p-1">
          <div
            className="flex h-full w-full items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white"
            style={{ clipPath: `inset(${100 - completeness.score}% 0 0 0 round 9999px)` }}
          >
            {completeness.score}
          </div>
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${completeness.score}%` }} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {Object.entries(completeness.breakdown).map(([key, done]) => (
          <span
            key={key}
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
          >
            {key.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`)}
          </span>
        ))}
      </div>
      {completeness.nudges.length ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
          {completeness.nudges[0]}
        </div>
      ) : null}
    </div>
  );
}
