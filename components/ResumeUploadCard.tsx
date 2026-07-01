"use client";

import { LoaderCircle, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { ApplicantProfile } from "@/types";
import { formatDateTime } from "@/lib/utils";

export function ResumeUploadCard({
  initialProfile
}: {
  initialProfile: ApplicantProfile;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [profile, setProfile] = useState(initialProfile);
  const [dragActive, setDragActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const uploadFile = (file: File) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const formData = new FormData();
      formData.append("resume", file);

      try {
        const response = await fetch("/api/profile/resume", {
          method: "POST",
          body: formData
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not upload resume.");
        }

        setProfile(payload.profile);
        setMessage("Resume saved locally.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not upload resume.");
      }
    });
  };

  const removeResume = () => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const response = await fetch("/api/profile/resume", { method: "DELETE" });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not remove resume.");
        }
        setProfile(payload.profile);
        setMessage("Resume removed.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove resume.");
      }
    });
  };

  return (
    <div className="space-y-5">
      <div
        className={`rounded-[30px] border-2 border-dashed p-8 text-center transition ${dragActive ? "border-sky-500 bg-sky-50/70" : "border-slate-200 bg-white/85"}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          const file = event.dataTransfer.files?.[0];
          if (file) uploadFile(file);
        }}
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-900 text-white">
          {isPending ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}
        </div>
        <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-slate-950">Upload your resume once.</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          PDF or DOCX only. ApplyPilot stores it locally and reuses it when an application asks for a resume file.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="primary-button" onClick={() => inputRef.current?.click()} disabled={isPending}>
            {profile.resume.originalFilename ? "Replace resume" : "Choose file"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={removeResume}
            disabled={isPending || !profile.resume.originalFilename}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadFile(file);
          }}
        />
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
        <p className="field-label">Resume</p>
        <p className="mt-3 text-base font-medium text-slate-950">
          {profile.resume.originalFilename || "No resume uploaded yet"}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {profile.resume.uploadedAt ? `Uploaded ${formatDateTime(profile.resume.uploadedAt)}` : "The user never needs to type a resume path manually."}
        </p>
      </div>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
