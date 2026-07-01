"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { SectionCard } from "@/components/SectionCard";

export function NewApplicationForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    jobUrl: "",
    company: "",
    roleTitle: "",
    source: "",
    notes: ""
  });

  const launchSession = () => {
    startTransition(async () => {
      setError(null);
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Could not create the application session.");
        return;
      }

      const startResponse = await fetch(`/api/sessions/${payload.session.id}/start`, {
        method: "POST"
      });
      const startPayload = await startResponse.json();
      if (!startResponse.ok) {
        setError(startPayload.error ?? "Could not open the application.");
        return;
      }

      router.push(`/session/${payload.session.id}`);
      router.refresh();
    });
  };

  return (
    <SectionCard
      title="Start a New Application"
      description="Create the session, open it in the application window, and run the first scan automatically when the form is visible."
      className="max-w-4xl"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="field-label">Job URL</label>
          <input
            className="field-input mt-2"
            placeholder="https://boards.greenhouse.io/company/jobs/123"
            value={form.jobUrl}
            onChange={(event) => setForm((current) => ({ ...current, jobUrl: event.target.value }))}
          />
        </div>
        <div>
          <label className="field-label">Company</label>
          <input className="field-input mt-2" value={form.company} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} />
        </div>
        <div>
          <label className="field-label">Role title</label>
          <input
            className="field-input mt-2"
            value={form.roleTitle}
            onChange={(event) => setForm((current) => ({ ...current, roleTitle: event.target.value }))}
          />
        </div>
        <div>
          <label className="field-label">Source</label>
          <input className="field-input mt-2" placeholder="LinkedIn, YC, company site" value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} />
        </div>
        <div>
          <label className="field-label">Notes</label>
          <textarea className="subtle-textarea mt-2" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button type="button" className="primary-button" onClick={launchSession} disabled={isPending}>
          {isPending ? "Creating session..." : "Launch Autofill Session"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </button>
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </div>
    </SectionCard>
  );
}
