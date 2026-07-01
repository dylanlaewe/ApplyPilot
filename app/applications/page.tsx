import Link from "next/link";

import { SectionCard } from "@/components/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { getApplicationSessions } from "@/lib/applications";
import { buildSessionHeading, shouldDisplayCompanyOrRole } from "@/lib/jobMetadata";
import { formatDateTime } from "@/lib/utils";

const sections = [
  { key: "submitted", title: "Submitted" },
  { key: "interview", title: "Interview" },
  { key: "rejected", title: "Rejected" },
  { key: "offer", title: "Offer" },
  { key: "archived", title: "Archived" },
  { key: "needs_review", title: "Needs Review" },
  { key: "waiting_for_user", title: "Waiting for You" },
  { key: "ready_for_submission", title: "Ready for Submission" },
  { key: "opening_browser", title: "Opening Browser" },
  { key: "navigating", title: "Navigating" },
  { key: "scanning", title: "Scanning" },
  { key: "filling", title: "Filling" },
  { key: "verifying", title: "Verifying" },
  { key: "failed", title: "Failed" },
  { key: "created", title: "Created" },
  { key: "in_progress", title: "In Progress" }
] as const;

export default async function ApplicationsPage() {
  const sessions = await getApplicationSessions();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Career CRM</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-slate-950">Applications</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          Tracking lives here so Apply can stay focused on starting and finishing applications fast.
        </p>
      </div>

      <div className="space-y-5">
        {sections.map((section) => {
          const matches = sessions.filter((session) => session.status === section.key);
          if (!matches.length) return null;

          return (
            <SectionCard key={section.key} title={section.title}>
              <div className="space-y-3">
                {matches.map((session) => (
                  <Link
                    href={`/session/${session.id}`}
                    key={session.id}
                    className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white/90 px-5 py-4 transition hover:-translate-y-0.5 hover:border-slate-300"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{buildSessionHeading(session.roleTitle, session.company)}</p>
                        {shouldDisplayCompanyOrRole(session.company) && shouldDisplayCompanyOrRole(session.roleTitle) ? null : (
                          <p className="mt-1 text-sm text-slate-600">{session.statusMessage}</p>
                        )}
                      </div>
                      <StatusBadge status={session.status} />
                    </div>
                    <div className="grid gap-3 text-sm text-slate-500 lg:grid-cols-4">
                      <p>Started {formatDateTime(session.createdAt)}</p>
                      <p>{session.numberOfFieldsFilled} filled</p>
                      <p>{session.numberOfFieldsReviewed} reviewed</p>
                      <p>{session.timeSpentSeconds ? `${Math.round(session.timeSpentSeconds / 60)} min` : "No timing yet"}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </SectionCard>
          );
        })}

        {!sessions.length ? (
          <SectionCard title="No Applications Yet">
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/60 p-8 text-sm text-slate-600">
              Start from Apply when you find a job you want to apply to.
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
