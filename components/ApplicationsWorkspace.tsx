"use client";

import Link from "next/link";
import { CalendarClock, ExternalLink, FolderArchive, LoaderCircle, MoreHorizontal, NotebookPen, Search, Trash2 } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { ApplicationStatusBadge } from "@/components/ApplicationStatusBadge";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import {
  ApplicationDisplayStatus,
  ApplicationNextStep,
  ApplicationSession,
  DogfoodReport,
  SubmissionConfirmationState
} from "@/types";

import {
  ApplicationSortKey,
  buildApplicationInsights,
  buildPreparationHeadline,
  filterAndSortApplications,
  formatApplicationDate,
  formatPreparationDuration,
  getApplicationCountSummary,
  getApplicationNextActionText,
  getApplicationPrimaryAction,
  getApplicationStatusDescription,
  getApplicationStatusLabel,
  getResumePresentation,
  getStatusTimelineLabel,
  isNextStepOverdue,
  mapSessionStatusToApplicationStatus,
  shouldShowSubmissionConfirmation
} from "@/lib/applicationsExperience";
import { buildSessionHeading } from "@/lib/jobMetadata";
import { cn } from "@/lib/utils";

type ApplicationsView = "applications" | "insights";

const statusOptions: Array<{ value: "all" | ApplicationDisplayStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "in_progress", label: "In progress" },
  { value: "ready_to_review", label: "Ready to review" },
  { value: "submitted", label: "Submitted" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" }
];

const sortOptions: Array<{ value: ApplicationSortKey; label: string }> = [
  { value: "most_recent", label: "Most recent" },
  { value: "oldest", label: "Oldest" },
  { value: "company", label: "Company" },
  { value: "status", label: "Status" },
  { value: "preparation_time", label: "Preparation time" }
];

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { error?: string; ok?: boolean };
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }
  return payload;
}

function ActionLink({ href, label }: { href: string; label: string }) {
  if (!href) {
    return <span className="text-sm font-medium text-slate-500">{label}</span>;
  }

  if (href.startsWith("http")) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="primary-button rounded-full px-4 py-2 text-sm"
      >
        {label}
      </a>
    );
  }

  return (
    <Link href={href} className="primary-button rounded-full px-4 py-2 text-sm">
      {label}
    </Link>
  );
}

interface ApplicationsWorkspaceProps {
  initialSessions: ApplicationSession[];
  currentResume: {
    filename: string;
    fileExists: boolean;
  };
  initialDogfoodReport: DogfoodReport;
  initialView?: ApplicationsView;
  initialSelectedId?: string | null;
}

export function ApplicationsWorkspace({
  initialSessions,
  currentResume,
  initialDogfoodReport,
  initialView = "applications",
  initialSelectedId = null
}: ApplicationsWorkspaceProps) {
  const [sessions, setSessions] = useState(initialSessions);
  const [view, setView] = useState<ApplicationsView>(initialView);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ApplicationDisplayStatus>("all");
  const [sort, setSort] = useState<ApplicationSortKey>("most_recent");
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? initialSessions[0]?.id ?? null);
  const [notesDraft, setNotesDraft] = useState("");
  const [nextStepDescription, setNextStepDescription] = useState("");
  const [nextStepDueDate, setNextStepDueDate] = useState("");
  const [nextStepCompleted, setNextStepCompleted] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [detailMessage, setDetailMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | { kind: "archive" | "delete"; sessionId: string }>(null);

  const visibleSessions = useMemo(
    () =>
      filterAndSortApplications(sessions, {
        search,
        status: statusFilter,
        sort
      }),
    [search, sessions, sort, statusFilter]
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? visibleSessions[0] ?? null,
    [selectedId, sessions, visibleSessions]
  );

  const insights = useMemo(() => buildApplicationInsights(sessions.filter((session) => session.applicationStatus !== "archived")), [sessions]);

  useEffect(() => {
    if (!selectedSession) {
      setNotesDraft("");
      setNextStepDescription("");
      setNextStepDueDate("");
      setNextStepCompleted(false);
      return;
    }

    setSelectedId(selectedSession.id);
    setNotesDraft(selectedSession.notes || "");
    setNextStepDescription(selectedSession.nextStep?.description || "");
    setNextStepDueDate(selectedSession.nextStep?.dueDate || "");
    setNextStepCompleted(Boolean(selectedSession.nextStep?.completed));
    setSaveState("idle");
    setDetailMessage(null);
  }, [selectedSession?.id]);

  const replaceSession = (updated: ApplicationSession) => {
    setSessions((current) => current.map((session) => (session.id === updated.id ? updated : session)));
  };

  const removeSession = (sessionId: string) => {
    setSessions((current) => current.filter((session) => session.id !== sessionId));
    setSelectedId((current) => (current === sessionId ? null : current));
  };

  const saveDetails = async () => {
    if (!selectedSession) return;
    const nextStep: ApplicationNextStep | null =
      nextStepDescription.trim() || nextStepDueDate.trim() || nextStepCompleted
        ? {
            description: nextStepDescription.trim(),
            dueDate: nextStepDueDate.trim(),
            completed: nextStepCompleted
          }
        : null;

    setSaveState("saving");
    setDetailMessage(null);
    try {
      const payload = await fetchJson<{ session: ApplicationSession; message: string }>(`/api/sessions/${selectedSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notesDraft,
          nextStep
        })
      });
      replaceSession(payload.session);
      setSaveState("saved");
      setDetailMessage(payload.message);
    } catch (error) {
      setSaveState("error");
      setDetailMessage(error instanceof Error ? error.message : "Could not save application details.");
    }
  };

  const updateStatus = async (session: ApplicationSession, nextStatus: ApplicationDisplayStatus) => {
    setBusyAction(`status-${session.id}`);
    setDetailMessage(null);
    try {
      if (nextStatus === "submitted") {
        const payload = await fetchJson<{ session: ApplicationSession; message: string }>(`/api/sessions/${session.id}/mark-submitted`, {
          method: "POST"
        });
        replaceSession(payload.session);
        setDetailMessage(payload.message);
      } else {
        const payload = await fetchJson<{ session: ApplicationSession; message: string }>(`/api/sessions/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationStatus: nextStatus })
        });
        replaceSession(payload.session);
        setDetailMessage(payload.message);
      }
    } catch (error) {
      setDetailMessage(error instanceof Error ? error.message : "Could not update status.");
    } finally {
      setBusyAction(null);
    }
  };

  const updateSubmissionConfirmation = async (session: ApplicationSession, state: SubmissionConfirmationState) => {
    setBusyAction(`submission-${session.id}-${state}`);
    setDetailMessage(null);
    try {
      if (state === "submitted") {
        const payload = await fetchJson<{ session: ApplicationSession; message: string }>(`/api/sessions/${session.id}/mark-submitted`, {
          method: "POST"
        });
        replaceSession(payload.session);
        setDetailMessage(payload.message);
      } else {
        const payload = await fetchJson<{ session: ApplicationSession; message: string }>(`/api/sessions/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionConfirmationState: state })
        });
        replaceSession(payload.session);
        setDetailMessage(
          state === "dismissed" ? "Submission reminder dismissed." : state === "not_yet" ? "We’ll keep this application in progress." : payload.message
        );
      }
    } catch (error) {
      setDetailMessage(error instanceof Error ? error.message : "Could not update this application.");
    } finally {
      setBusyAction(null);
    }
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    const target = sessions.find((session) => session.id === confirmAction.sessionId);
    if (!target) {
      setConfirmAction(null);
      return;
    }

    setBusyAction(`${confirmAction.kind}-${target.id}`);
    setDetailMessage(null);
    try {
      if (confirmAction.kind === "archive") {
        const payload = await fetchJson<{ session: ApplicationSession; message: string }>(`/api/sessions/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationStatus: "archived" })
        });
        replaceSession(payload.session);
        setDetailMessage(payload.message);
      } else {
        await fetchJson<{ ok: true }>(`/api/sessions/${target.id}`, { method: "DELETE" });
        removeSession(target.id);
        setDetailMessage("Application deleted.");
      }
    } catch (error) {
      setDetailMessage(error instanceof Error ? error.message : "Could not complete that action.");
    } finally {
      setBusyAction(null);
      setConfirmAction(null);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setSort("most_recent");
  };

  const renderEmptyState = () => {
    if (!sessions.length) {
      return (
        <div className="rounded-[30px] bg-white px-6 py-12 text-center shadow-sm">
          <p className="font-display text-2xl font-semibold tracking-tight text-slate-950">No applications yet</p>
          <p className="mt-3 text-sm leading-7 text-slate-600">Start an application and it will appear here automatically.</p>
          <div className="mt-6">
            <Link href="/" className="primary-button">
              Start an application
            </Link>
          </div>
        </div>
      );
    }

    if (statusFilter === "submitted") {
      return (
        <div className="rounded-[30px] bg-white px-6 py-12 text-center shadow-sm">
          <p className="font-display text-2xl font-semibold tracking-tight text-slate-950">You haven’t marked any applications as submitted yet.</p>
          <button type="button" className="secondary-button mt-6" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      );
    }

    return (
      <div className="rounded-[30px] bg-white px-6 py-12 text-center shadow-sm">
        <p className="font-display text-2xl font-semibold tracking-tight text-slate-950">No applications match these filters.</p>
        <button type="button" className="secondary-button mt-6" onClick={clearFilters}>
          Clear filters
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6" data-testid="applications-workspace">
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Career CRM</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-slate-950">Applications</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Keep track of what you applied to, what still needs attention, and what you want to follow up on next.
            </p>
          </div>

          <div className="inline-flex rounded-full bg-slate-100 p-1">
            <button
              type="button"
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                view === "applications" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"
              )}
              onClick={() => setView("applications")}
            >
              Applications
            </button>
            <button
              type="button"
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                view === "insights" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"
              )}
              onClick={() => setView("insights")}
            >
              Insights
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">{getApplicationCountSummary(visibleSessions.length, sessions.length)}</p>
          <Link href="/" className="secondary-button w-full sm:w-auto">
            Start an application
          </Link>
        </div>
      </div>

      {view === "insights" ? (
        <section className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-[28px] bg-white p-6 shadow-sm">
              <p className="field-label">Total applications</p>
              <p className="mt-3 font-display text-4xl font-semibold tracking-tight text-slate-950">{insights.totalApplications}</p>
              <p className="mt-2 text-sm text-slate-600">{insights.applicationsThisWeek} started in the last 7 days</p>
            </div>
            <div className="rounded-[28px] bg-white p-6 shadow-sm">
              <p className="field-label">Progress</p>
              <p className="mt-3 font-display text-4xl font-semibold tracking-tight text-slate-950">{insights.submittedApplications}</p>
              <p className="mt-2 text-sm text-slate-600">Submitted applications, with {insights.interviews} interviews and {insights.offers} offers tracked.</p>
            </div>
            <div className="rounded-[28px] bg-white p-6 shadow-sm">
              <p className="field-label">Preparation</p>
              <p className="mt-3 font-display text-4xl font-semibold tracking-tight text-slate-950">
                {insights.medianPreparationTime ? formatPreparationDuration(insights.medianPreparationTime) : "Unknown"}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Median preparation time. Average corrections per application: {insights.averageCorrections}.
              </p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_360px]">
            <div className="rounded-[28px] bg-white p-6 shadow-sm">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-950">Response signals</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {insights.responseRateLabel}
                {insights.hasSmallSample ? " Based on a small sample, so use the rate as a directional signal only." : ""}
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[22px] bg-slate-50 px-4 py-4">
                  <p className="field-label">Submitted</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{insights.submittedApplications}</p>
                </div>
                <div className="rounded-[22px] bg-slate-50 px-4 py-4">
                  <p className="field-label">Interviews</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{insights.interviews}</p>
                </div>
                <div className="rounded-[22px] bg-slate-50 px-4 py-4">
                  <p className="field-label">Offers</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{insights.offers}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] bg-white p-6 shadow-sm">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-950">Applications by status</h2>
              <div className="mt-5 space-y-3">
                {insights.applicationsByStatus.map((entry) => (
                  <div key={entry.status} className="flex items-center justify-between rounded-[20px] bg-slate-50 px-4 py-3">
                    <span className="text-sm font-medium text-slate-700">{entry.label}</span>
                    <span className="text-sm font-semibold text-slate-950">{entry.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-[28px] bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Private alpha</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-slate-950">Dogfood report</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                    A sanitized local summary of real ApplyPilot use. It excludes resumes, raw answers, contact details, demographics, cookies, and authentication data.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href="/api/dogfood-report" className="secondary-button px-4 py-2 text-sm">
                    Export JSON
                  </a>
                  <a href="/api/dogfood-report?format=markdown" className="secondary-button px-4 py-2 text-sm">
                    Export Markdown
                  </a>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[22px] bg-slate-50 px-4 py-4">
                  <p className="field-label">Prepared</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{initialDogfoodReport.applicationsPrepared}</p>
                </div>
                <div className="rounded-[22px] bg-slate-50 px-4 py-4">
                  <p className="field-label">Median prep time</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {initialDogfoodReport.medianPreparationTimeSeconds
                      ? formatPreparationDuration(initialDogfoodReport.medianPreparationTimeSeconds)
                      : "Unknown"}
                  </p>
                </div>
                <div className="rounded-[22px] bg-slate-50 px-4 py-4">
                  <p className="field-label">Auto completion</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{initialDogfoodReport.averageAutomaticCompletionRate}%</p>
                </div>
                <div className="rounded-[22px] bg-slate-50 px-4 py-4">
                  <p className="field-label">Severe corrections</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{initialDogfoodReport.severeCorrections}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] bg-white p-6 shadow-sm">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-950">Answer quality</h2>
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-[20px] bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">Average user input</span>
                  <span className="text-sm font-semibold text-slate-950">{initialDogfoodReport.averageUserInputFields}</span>
                </div>
                <div className="flex items-center justify-between rounded-[20px] bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">Average corrections</span>
                  <span className="text-sm font-semibold text-slate-950">{initialDogfoodReport.averageCorrections}</span>
                </div>
                <div className="flex items-center justify-between rounded-[20px] bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">Retries</span>
                  <span className="text-sm font-semibold text-slate-950">{initialDogfoodReport.retryCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-[20px] bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">Short answers inserted</span>
                  <span className="text-sm font-semibold text-slate-950">{initialDogfoodReport.shortAnswersInserted}</span>
                </div>
                <div className="flex items-center justify-between rounded-[20px] bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">Short answers edited</span>
                  <span className="text-sm font-semibold text-slate-950">{initialDogfoodReport.shortAnswersEdited}</span>
                </div>
                <div className="flex items-center justify-between rounded-[20px] bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">Accepted unchanged</span>
                  <span className="text-sm font-semibold text-slate-950">{initialDogfoodReport.shortAnswersAcceptedUnchanged}</span>
                </div>
              </div>
              <div className="mt-5 rounded-[22px] bg-slate-50 px-4 py-4">
                <p className="field-label">ATS mix</p>
                <div className="mt-3 space-y-2">
                  {initialDogfoodReport.applicationsByAts
                    .filter((entry) => entry.count > 0)
                    .map((entry) => (
                      <div key={entry.atsProvider} className="flex items-center justify-between text-sm text-slate-700">
                        <span>{entry.atsProvider}</span>
                        <span className="font-semibold text-slate-950">{entry.count}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="rounded-[28px] bg-white p-4 shadow-sm">
            <div className="hidden gap-3 md:grid md:grid-cols-[minmax(0,1fr)_180px_180px]">
              <div>
                <label htmlFor="applications-search" className="field-label">
                  Search applications
                </label>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="applications-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search company, role, notes, or status"
                    className="field-input pl-11"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="status-filter" className="field-label">
                  Status
                </label>
                <select id="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | ApplicationDisplayStatus)} className="field-input mt-2">
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sort-control" className="field-label">
                  Sort
                </label>
                <select id="sort-control" value={sort} onChange={(event) => setSort(event.target.value as ApplicationSortKey)} className="field-input mt-2">
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <details className="md:hidden">
              <summary className="secondary-button w-full justify-between">
                Filters and sort
                <MoreHorizontal className="h-4 w-4" />
              </summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="applications-search-mobile" className="field-label">
                    Search applications
                  </label>
                  <input
                    id="applications-search-mobile"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search company, role, notes, or status"
                    className="field-input mt-2"
                  />
                </div>
                <div>
                  <label htmlFor="status-filter-mobile" className="field-label">
                    Status
                  </label>
                  <select
                    id="status-filter-mobile"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as "all" | ApplicationDisplayStatus)}
                    className="field-input mt-2"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="sort-control-mobile" className="field-label">
                    Sort
                  </label>
                  <select id="sort-control-mobile" value={sort} onChange={(event) => setSort(event.target.value as ApplicationSortKey)} className="field-input mt-2">
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </details>
          </div>

          {!visibleSessions.length ? (
            renderEmptyState()
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,420px)]" data-testid="applications-layout">
              <div className="space-y-3" role="list" aria-label="Applications">
                {visibleSessions.map((session) => {
                  const displayStatus = session.applicationStatus ?? mapSessionStatusToApplicationStatus(session.status);
                  const primaryAction = getApplicationPrimaryAction(session);
                  const resumePresentation = getResumePresentation(session, currentResume);
                  return (
                    <article
                      key={session.id}
                      role="listitem"
                      className={cn(
                        "rounded-[28px] bg-white p-5 shadow-sm transition",
                        selectedSession?.id === session.id ? "ring-2 ring-sky-200" : "hover:-translate-y-0.5"
                      )}
                    >
                      <button type="button" className="w-full text-left" onClick={() => setSelectedId(session.id)}>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <p className="font-display text-2xl font-semibold tracking-tight text-slate-950">
                              {buildSessionHeading(session.roleTitle, session.company)}
                            </p>
                            <p className="mt-3 text-sm text-slate-600">{getApplicationNextActionText(session)}</p>
                          </div>
                          <ApplicationStatusBadge status={displayStatus} />
                        </div>
                      </button>

                      <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                        <p>
                          <span className="font-medium text-slate-700">Started:</span> {formatApplicationDate(session.createdAt)}
                        </p>
                        <p>
                          <span className="font-medium text-slate-700">Submitted:</span> {session.submittedAt ? formatApplicationDate(session.submittedAt) : "Not marked"}
                        </p>
                        <p>
                          <span className="font-medium text-slate-700">Resume:</span> {resumePresentation.label}
                        </p>
                        <p>
                          <span className="font-medium text-slate-700">Preparation:</span> {formatPreparationDuration(session.preparationSummary?.durationSeconds ?? null)}
                        </p>
                      </div>

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-slate-500">{session.nextStep?.description ? session.nextStep.description : session.statusMessage}</div>
                        <div className="flex items-center gap-2">
                          {primaryAction.href ? <ActionLink href={primaryAction.href} label={primaryAction.label} /> : null}
                          <details className="relative">
                            <summary className="secondary-button cursor-pointer rounded-full px-3 py-2">
                              <span className="sr-only">More actions</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </summary>
                            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 w-72 rounded-[24px] border border-slate-200 bg-white p-4 shadow-xl">
                              <div>
                                <label className="field-label" htmlFor={`status-${session.id}`}>
                                  Update status
                                </label>
                                <select
                                  id={`status-${session.id}`}
                                  className="field-input mt-2"
                                  value={displayStatus}
                                  onChange={(event) => updateStatus(session, event.target.value as ApplicationDisplayStatus)}
                                  disabled={busyAction === `status-${session.id}`}
                                >
                                  {statusOptions
                                    .filter((option): option is { value: ApplicationDisplayStatus; label: string } => option.value !== "all")
                                    .map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                </select>
                              </div>
                              <div className="mt-4 space-y-2">
                                <button type="button" className="secondary-button w-full justify-start" onClick={() => setSelectedId(session.id)}>
                                  <NotebookPen className="mr-2 h-4 w-4" />
                                  Add note
                                </button>
                                <button type="button" className="secondary-button w-full justify-start" onClick={() => setConfirmAction({ kind: "archive", sessionId: session.id })}>
                                  <FolderArchive className="mr-2 h-4 w-4" />
                                  Archive
                                </button>
                                <button type="button" className="secondary-button w-full justify-start" onClick={() => setConfirmAction({ kind: "delete", sessionId: session.id })}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </button>
                                {session.jobUrl ? (
                                  <a href={session.jobUrl} target="_blank" rel="noreferrer" className="secondary-button w-full justify-start">
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Open source link
                                  </a>
                                ) : null}
                                <button type="button" className="secondary-button w-full justify-start" onClick={() => setSelectedId(session.id)}>
                                  View session summary
                                </button>
                              </div>
                            </div>
                          </details>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <aside className="space-y-4">
                {selectedSession ? (
                  <div className="rounded-[30px] bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Application details</p>
                          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-950">
                            {buildSessionHeading(selectedSession.roleTitle, selectedSession.company)}
                          </h2>
                        </div>
                        <ApplicationStatusBadge
                          status={selectedSession.applicationStatus ?? mapSessionStatusToApplicationStatus(selectedSession.status)}
                        />
                      </div>

                      {detailMessage ? (
                        <div
                          className={cn(
                            "rounded-[22px] px-4 py-3 text-sm",
                            saveState === "error" ? "bg-rose-50 text-rose-800" : "bg-slate-50 text-slate-700"
                          )}
                        >
                          {detailMessage}
                        </div>
                      ) : null}

                      {shouldShowSubmissionConfirmation(selectedSession) ? (
                        <div className="rounded-[24px] bg-slate-50 px-5 py-5">
                          <p className="font-medium text-slate-950">Did you submit this application?</p>
                          <p className="mt-2 text-sm leading-7 text-slate-600">
                            ApplyPilot reached a likely final review step, but submission still belongs to you.
                          </p>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              type="button"
                              className="primary-button"
                              disabled={busyAction?.startsWith(`submission-${selectedSession.id}`)}
                              onClick={() => updateSubmissionConfirmation(selectedSession, "submitted")}
                            >
                              Yes, mark submitted
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={busyAction?.startsWith(`submission-${selectedSession.id}`)}
                              onClick={() => updateSubmissionConfirmation(selectedSession, "not_yet")}
                            >
                              Not yet
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={busyAction?.startsWith(`submission-${selectedSession.id}`)}
                              onClick={() => updateSubmissionConfirmation(selectedSession, "dismissed")}
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                          <p className="field-label">Source URL</p>
                          {selectedSession.jobUrl ? (
                            <a href={selectedSession.jobUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-slate-900 underline-offset-4 hover:underline">
                              Open job posting
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <p className="mt-2 text-sm text-slate-600">Source URL unavailable</p>
                          )}
                        </div>
                        <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                          <p className="field-label">Resume used</p>
                          <p className="mt-2 text-sm font-medium text-slate-950">{getResumePresentation(selectedSession, currentResume).label}</p>
                        </div>
                        <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                          <p className="field-label">Dates</p>
                          <p className="mt-2 text-sm text-slate-700">Started {formatApplicationDate(selectedSession.createdAt)}</p>
                          <p className="mt-1 text-sm text-slate-700">
                            Submitted {selectedSession.submittedAt ? formatApplicationDate(selectedSession.submittedAt) : "Not marked"}
                          </p>
                        </div>
                        <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                          <p className="field-label">Preparation</p>
                          <p className="mt-2 text-sm font-medium text-slate-950">{buildPreparationHeadline(selectedSession.preparationSummary!)}</p>
                        </div>
                      </div>

                      <div className="rounded-[24px] bg-slate-50 px-5 py-5">
                        <h3 className="font-medium text-slate-950">Session summary</h3>
                        <ul className="mt-4 space-y-3 text-sm text-slate-700">
                          <li>{selectedSession.preparationSummary?.fieldsCompleted ?? 0} fields completed</li>
                          <li>{selectedSession.preparationSummary?.questionsAnsweredByUser ?? 0} answers provided by you</li>
                          <li>{selectedSession.preparationSummary?.suggestedAnswersUsed ?? 0} suggested answers used</li>
                          <li>{selectedSession.preparationSummary?.correctionsMade ?? 0} corrections made</li>
                          <li>{selectedSession.preparationSummary?.retryCount ?? 0} retry count</li>
                        </ul>
                        <div className="mt-4">
                          <Link
                            href={`/settings?session=${selectedSession.id}#advanced`}
                            className="inline-flex items-center text-sm font-medium text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
                          >
                            Troubleshoot this application
                          </Link>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label htmlFor="application-status-detail" className="field-label">
                            Current status
                          </label>
                          <select
                            id="application-status-detail"
                            className="field-input mt-2"
                            value={selectedSession.applicationStatus ?? mapSessionStatusToApplicationStatus(selectedSession.status)}
                            onChange={(event) => updateStatus(selectedSession, event.target.value as ApplicationDisplayStatus)}
                            disabled={busyAction === `status-${selectedSession.id}`}
                          >
                            {statusOptions
                              .filter((option): option is { value: ApplicationDisplayStatus; label: string } => option.value !== "all")
                              .map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                          </select>
                          <p className="mt-2 text-sm text-slate-600">
                            {getApplicationStatusDescription(
                              selectedSession.applicationStatus ?? mapSessionStatusToApplicationStatus(selectedSession.status)
                            )}
                          </p>
                        </div>

                        <div>
                          <label htmlFor="application-notes" className="field-label">
                            Notes
                          </label>
                          <textarea
                            id="application-notes"
                            className="subtle-textarea mt-2"
                            value={notesDraft}
                            onChange={(event) => setNotesDraft(event.target.value)}
                            placeholder="Follow up with recruiter Friday"
                          />
                        </div>

                        <div className="rounded-[24px] bg-slate-50 px-5 py-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="field-label">Next step</p>
                              <p className="mt-2 text-sm text-slate-600">Keep follow-up light: description, due date, and whether it is done.</p>
                            </div>
                            {isNextStepOverdue(selectedSession.nextStep ?? null) ? (
                              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                                <CalendarClock className="h-3.5 w-3.5" />
                                Follow-up overdue
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-4 grid gap-4">
                            <div>
                              <label htmlFor="next-step-description" className="field-label">
                                Description
                              </label>
                              <input
                                id="next-step-description"
                                className="field-input mt-2"
                                value={nextStepDescription}
                                onChange={(event) => setNextStepDescription(event.target.value)}
                                placeholder="Hiring manager requested portfolio"
                              />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                              <div>
                                <label htmlFor="next-step-due-date" className="field-label">
                                  Due date
                                </label>
                                <input
                                  id="next-step-due-date"
                                  type="date"
                                  className="field-input mt-2"
                                  value={nextStepDueDate}
                                  onChange={(event) => setNextStepDueDate(event.target.value)}
                                />
                              </div>
                              <label className="mt-6 inline-flex items-center gap-3 text-sm text-slate-700 sm:mt-9">
                                <input
                                  type="checkbox"
                                  checked={nextStepCompleted}
                                  onChange={(event) => setNextStepCompleted(event.target.checked)}
                                />
                                Completed
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <button type="button" className="primary-button" onClick={saveDetails} disabled={saveState === "saving"}>
                            {saveState === "saving" ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {saveState === "saving" ? "Saving..." : "Save changes"}
                          </button>
                          {saveState === "saved" ? <p className="text-sm text-slate-500">Saved</p> : null}
                          {saveState === "error" ? <p className="text-sm text-rose-700">Could not save. Your local data is still safe.</p> : null}
                        </div>
                      </div>

                      <div className="rounded-[24px] bg-slate-50 px-5 py-5">
                        <h3 className="font-medium text-slate-950">Status history</h3>
                        <div className="mt-4 space-y-4">
                          {selectedSession.statusHistory?.map((entry) => (
                            <div key={entry.id} className="flex items-start gap-3">
                              <div className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-900" />
                              <div>
                                <p className="text-sm font-medium text-slate-900">{getStatusTimelineLabel(entry)}</p>
                                <p className="mt-1 text-sm text-slate-600">{formatApplicationDate(entry.timestamp)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>
                ) : (
                  <div className="rounded-[30px] bg-white p-6 text-sm leading-7 text-slate-600 shadow-sm">
                    Select an application to review its details, notes, and next steps.
                  </div>
                )}
              </aside>
            </div>
          )}
        </>
      )}

      <ConfirmationDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.kind === "delete" ? "Delete this application?" : "Archive this application?"}
        description={
          confirmAction?.kind === "delete"
            ? "Deleting removes the application record, notes, and local session summary. It does not remove your applicant profile, saved answers, or resume files."
            : "Archived applications are hidden from the default view but remain available through the Archived filter."
        }
        confirmLabel={confirmAction?.kind === "delete" ? "Delete application" : "Archive application"}
        tone={confirmAction?.kind === "delete" ? "danger" : "default"}
        busy={Boolean(confirmAction && busyAction === `${confirmAction.kind}-${confirmAction.sessionId}`)}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmAction}
      />
    </div>
  );
}
