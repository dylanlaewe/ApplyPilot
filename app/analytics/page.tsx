import { ApplicationStats } from "@/components/ApplicationStats";
import { SectionCard } from "@/components/SectionCard";
import { getApplicationSessions, getDashboardStats } from "@/lib/applications";

export default async function AnalyticsPage() {
  const [stats, sessions] = await Promise.all([getDashboardStats(), getApplicationSessions()]);

  const submitted = sessions.filter((session) => session.status === "submitted").length;
  const interviews = sessions.filter((session) => session.status === "interview").length;
  const offers = sessions.filter((session) => session.status === "offer").length;
  const interviewRate = submitted ? Math.round((interviews / submitted) * 100) : 0;
  const offerRate = submitted ? Math.round((offers / submitted) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Career CRM</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-slate-950">Analytics</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          Analytics belong here, away from the live application flow.
        </p>
      </div>

      <ApplicationStats stats={stats} />

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard title="Interview Rate">
          <p className="font-display text-4xl font-semibold tracking-tight text-slate-950">{interviewRate}%</p>
          <p className="mt-2 text-sm text-slate-600">Based on submitted applications that were moved to interview.</p>
        </SectionCard>
        <SectionCard title="Offer Rate">
          <p className="font-display text-4xl font-semibold tracking-tight text-slate-950">{offerRate}%</p>
          <p className="mt-2 text-sm text-slate-600">Based on submitted applications that reached offer.</p>
        </SectionCard>
        <SectionCard title="Applications This Session">
          <p className="font-display text-4xl font-semibold tracking-tight text-slate-950">{sessions.length}</p>
          <p className="mt-2 text-sm text-slate-600">Tracked locally in your current ApplyPilot workspace.</p>
        </SectionCard>
      </div>
    </div>
  );
}
