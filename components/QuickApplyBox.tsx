"use client";

import { useRouter } from "next/navigation";
import React from "react";
import { useEffect, useState } from "react";

import { ApplicationSessionPanel } from "@/components/ApplicationSessionPanel";
import { ApplyWorkspaceView } from "@/components/ApplyWorkspaceView";
import {
  getApplyMode,
  getResumeDisplayName,
  getReviewFieldCount,
  getSessionProgress,
  getSessionStateTone,
  hasResumeOnFile,
  shouldPollSession,
  validateJobUrl
} from "@/lib/applyExperience";
import { ApplicantProfile, ApplicationSession } from "@/types";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { error?: string; message?: string; session?: ApplicationSession };

  if (!response.ok) {
    const error = payload.error ?? "Request failed.";
    throw Object.assign(new Error(error), { payload });
  }

  return payload;
}

export function QuickApplyBox({
  profile,
  initialSession,
  recentSessions
}: {
  profile: ApplicantProfile;
  initialSession: ApplicationSession | null;
  recentSessions: ApplicationSession[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialSession?.jobUrl ?? "");
  const [session, setSession] = useState<ApplicationSession | null>(initialSession);
  const [sessions, setSessions] = useState(recentSessions);
  const [error, setError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  const hasResume = hasResumeOnFile(profile);
  const resumeName = getResumeDisplayName(profile);

  useEffect(() => {
    setSession(initialSession);
    setSessions(recentSessions);
    if (initialSession?.jobUrl) {
      setUrl(initialSession.jobUrl);
    }
  }, [initialSession, recentSessions]);

  useEffect(() => {
    if (!session || !(isLaunching || shouldPollSession(session))) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const payload = await fetchJson<{ session: ApplicationSession }>(`/api/sessions/${session.id}`);
        setSession(payload.session);
      } catch {
        // Keep the last known state visible and let the active request surface any user-facing error.
      }
    }, 900);

    return () => window.clearInterval(interval);
  }, [isLaunching, session]);

  const refreshSessions = async (preferredSessionId?: string) => {
    try {
      const payload = await fetchJson<{ sessions: ApplicationSession[] }>("/api/sessions");
      setSessions(payload.sessions);
      if (preferredSessionId) {
        const refreshed = payload.sessions.find((entry) => entry.id === preferredSessionId) ?? null;
        if (refreshed) {
          setSession(refreshed);
        }
      }
    } catch {
      // Ignore background refresh failures and keep the current UI intact.
    }
  };

  const startApplication = async () => {
    setError(null);

    if (!hasResume) {
      setError("Upload your resume before starting a new application.");
      return;
    }

    const validationError = validateJobUrl(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLaunching(true);
    let createdSessionId: string | undefined;

    try {
      const created = await fetchJson<{ session: ApplicationSession }>("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobUrl: url.trim(),
          company: "",
          roleTitle: "",
          source: "",
          notes: ""
        })
      });

      createdSessionId = created.session.id;
      setSession(created.session);
      setSessions((current) => [created.session, ...current.filter((entry) => entry.id !== created.session.id)]);
      router.replace(`/?session=${created.session.id}`, { scroll: false });

      try {
        const started = await fetchJson<{ session: ApplicationSession; message?: string }>(`/api/sessions/${created.session.id}/start`, {
          method: "POST"
        });
        setSession(started.session);
      } catch (startError) {
        const payload = (startError as Error & { payload?: { session?: ApplicationSession } }).payload;
        if (payload?.session) {
          setSession(payload.session);
        }
        throw startError;
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start this application.");
    } finally {
      setIsLaunching(false);
      void refreshSessions(createdSessionId);
    }
  };

  const mode = getApplyMode(session, hasResume);
  const startLabel = !hasResume
    ? "Upload resume to start"
    : isLaunching
      ? "Opening application..."
      : session
        ? "Start another application"
        : "Start application";

  return (
    <ApplyWorkspaceView
      mode={mode}
      hasResume={hasResume}
      resumeName={resumeName}
      url={url}
      error={error}
      disabled={isLaunching || !hasResume}
      startLabel={startLabel}
      session={session}
      progressItems={getSessionProgress(session)}
      stateTone={getSessionStateTone(session)}
      reviewCount={getReviewFieldCount(session)}
      recentSessions={sessions}
      sessionPanel={session ? <ApplicationSessionPanel initialSession={session} /> : null}
      onUrlChange={setUrl}
      onStart={() => void startApplication()}
    />
  );
}
