import { BriefcaseBusiness, ClipboardList, Timer, Users } from "lucide-react";

import { DashboardStats } from "@/types";

import { StatCard } from "@/components/StatCard";

export function ApplicationStats({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <StatCard label="Applications Started" value={stats.applicationsStarted} hint="Sessions you’ve opened." icon={<BriefcaseBusiness className="h-5 w-5" />} />
      <StatCard label="Submitted" value={stats.submittedManually} hint="Manually confirmed submissions." icon={<ClipboardList className="h-5 w-5" />} />
      <StatCard label="Needs Review" value={stats.readyForReview} hint="Sessions with unresolved fields." icon={<Users className="h-5 w-5" />} />
      <StatCard label="Interviews" value={stats.interviews} hint="Sessions moved forward." icon={<Users className="h-5 w-5" />} />
      <StatCard label="Avg Minutes" value={Math.round(stats.averageTimeMinutes)} hint="Average time to submit, when tracked." icon={<Timer className="h-5 w-5" />} />
    </div>
  );
}
