"use client";

import Link from "next/link";
import { Check, ChevronDown, ChevronUp, FlaskConical, LoaderCircle, PencilLine, Plus, RotateCcw, Save, Trash2, Upload, X } from "lucide-react";
import React from "react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  additionalQuestionLabels,
  availabilityTimingOptions,
  binaryChoiceOptions,
  clearanceStatusOptions,
  compensationAnswerStyleOptions,
  degreeTypeOptions,
  eeocDisabilityOptions,
  eeocGenderOptions,
  eeocRaceOptions,
  eeocVeteranOptions,
  graduationStatusOptions,
  jobTypeOptions,
  securityClearanceLevelOptions,
  websiteFallbackOptions,
  workAuthorizationCategoryOptions,
  yesNoNotApplicableOptions
} from "@/lib/profileSchema";
import {
  getResumeFilename,
  getSaveStateLabel,
  getSaveStateTone,
  getStoryPreview,
  prepareProfileForSave,
  profileNeedsResume,
  type ProfileLinkField,
  summarizeEducation,
  summarizeExperience,
  summarizeStory,
  type SaveState,
  validateProfileLinks
} from "@/lib/profileExperience";
import { formatDateTime } from "@/lib/utils";
import { ApplicantProfile, BehavioralStory, EducationEntry, ExperienceEntry, JobType } from "@/types";
import { cn } from "@/lib/utils";
import { isSyntheticQaProfile, SYNTHETIC_QA_PROFILE_LABEL } from "@/lib/syntheticQaProfile";

import { CityAutocomplete } from "@/components/CityAutocomplete";
import { FieldOfStudyAutocomplete } from "@/components/FieldOfStudyAutocomplete";
import { LocationPreferenceSelector } from "@/components/LocationPreferenceSelector";
import { MultiSelectAutocomplete } from "@/components/MultiSelectAutocomplete";
import { SchoolAutocomplete } from "@/components/SchoolAutocomplete";
import { SkillSelector } from "@/components/SkillSelector";
import { US_STATE_OPTIONS } from "@/lib/locationCatalog";

function createEducationEntry(): EducationEntry {
  return {
    id: crypto.randomUUID(),
    school: "",
    normalizedSchoolName: "",
    degree: "",
    degreeType: "",
    degreeCustomValue: "",
    degreeLevel: "",
    major: "",
    fieldOfStudy: "",
    normalizedFieldOfStudy: "",
    displayFieldOfStudy: "",
    graduationStatus: "not_applicable",
    graduationDate: "",
    graduationDateType: "not_applicable",
    gpa: "",
    startDate: "",
    endDate: "",
    location: ""
  };
}

function createExperienceEntry(): ExperienceEntry {
  return {
    id: crypto.randomUUID(),
    company: "",
    normalizedCompanyName: "",
    aliases: [],
    title: "",
    location: "",
    startDate: "",
    endDate: "",
    currentRole: false,
    summary: "",
    bullets: []
  };
}

function createStory(): BehavioralStory {
  return {
    id: crypto.randomUUID(),
    title: "",
    tags: [],
    situation: "",
    action: "",
    result: ""
  };
}

function DisclosureSection({
  title,
  description,
  summary,
  optional,
  open,
  onToggle,
  children
}: {
  title: string;
  description: string;
  summary?: string;
  optional?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const regionId = useId();

  return (
    <section className="rounded-[30px] bg-white/92 p-5 shadow-sm ring-1 ring-slate-200/80">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 text-left"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={onToggle}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[1.35rem] font-semibold tracking-tight text-slate-950">{title}</h2>
            {optional ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Optional
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
          {summary ? <p className="mt-2 text-sm font-medium text-slate-500">{summary}</p> : null}
        </div>
        <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      <div id={regionId} className={cn("overflow-hidden transition-all", open ? "mt-5" : "mt-0 hidden")}>
        {children}
      </div>
    </section>
  );
}

function ManualChipEditor({
  label,
  helper,
  placeholder,
  values,
  onChange
}: {
  label: string;
  helper?: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const selected = useMemo(
    () =>
      values.map((value) => ({
        id: value.toLowerCase().replace(/[^\w]+/g, "-"),
        label: value
      })),
    [values]
  );

  return (
    <div>
      <label className="field-label">{label}</label>
      {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
      <div className="mt-3">
        <MultiSelectAutocomplete
          options={[]}
          selected={selected}
          placeholder={placeholder}
          emptyMessage="Press Enter to add this item."
          createLabel={(value) => `Add "${value}"`}
          onAdd={() => undefined}
          onCreate={(value) => {
            const trimmed = value.trim();
            if (!trimmed || values.some((entry) => entry.toLowerCase() === trimmed.toLowerCase())) return;
            onChange([...values, trimmed]);
          }}
          onRemove={(optionId) => onChange(values.filter((value) => value.toLowerCase().replace(/[^\w]+/g, "-") !== optionId))}
        />
      </div>
    </div>
  );
}

export function ProfileForm({ initialProfile }: { initialProfile: ApplicantProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [openSections, setOpenSections] = useState({
    personal: true,
    contact: true,
    authorization: true,
    experience: true,
    education: true,
    skills: true,
    preferences: false,
    background: false,
    stories: false,
    optional: false
  });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [qaBusy, setQaBusy] = useState<"loading" | "restoring" | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaMessage, setQaMessage] = useState<string | null>(null);
  const [qaBackupAvailable, setQaBackupAvailable] = useState(false);
  const [editingExperienceId, setEditingExperienceId] = useState<string | null>(initialProfile.experience[0]?.id ?? null);
  const [editingEducationId, setEditingEducationId] = useState<string | null>(initialProfile.education[0]?.id ?? null);
  const [editingStoryId, setEditingStoryId] = useState<string | null>(initialProfile.stories[0]?.id ?? null);
  const resumeInputRef = useRef<HTMLInputElement | null>(null);
  const lastSavedRef = useRef(JSON.stringify(prepareProfileForSave(initialProfile)));
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRequestRef = useRef(0);

  useEffect(() => {
    const prepared = prepareProfileForSave(initialProfile);
    setProfile(initialProfile);
    lastSavedRef.current = JSON.stringify(prepared);
    setSaveState("saved");
    setSaveError(null);
    setResumeError(null);
    setQaError(null);
    setEditingExperienceId(initialProfile.experience[0]?.id ?? null);
    setEditingEducationId(initialProfile.education[0]?.id ?? null);
    setEditingStoryId(initialProfile.stories[0]?.id ?? null);
  }, [initialProfile]);

  const preparedProfile = useMemo(() => prepareProfileForSave(profile), [profile]);
  const serializedProfile = useMemo(() => JSON.stringify(preparedProfile), [preparedProfile]);
  const linkErrors = useMemo(() => validateProfileLinks(preparedProfile), [preparedProfile]);
  const hasLinkErrors = Object.values(linkErrors).some(Boolean);
  const hasUnsavedChanges = serializedProfile !== lastSavedRef.current;
  const resumeName = getResumeFilename(profile);
  const syntheticProfileActive = isSyntheticQaProfile(profile);

  useEffect(() => {
    let cancelled = false;

    const loadBackupState = async () => {
      try {
        const response = await fetch("/api/profile/synthetic-qa");
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not read synthetic QA backup status.");
        }
        if (!cancelled) {
          setQaBackupAvailable(Boolean(payload.backupAvailable));
        }
      } catch {
        if (!cancelled) {
          setQaBackupAvailable(false);
        }
      }
    };

    void loadBackupState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      setSaveState("saved");
      return;
    }

    setSaveState((current) => (current === "error" ? current : "pending"));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      if (hasLinkErrors) {
        setSaveState("error");
        setSaveError("Check the highlighted links before ApplyPilot can save this profile.");
        return;
      }

      const requestId = ++saveRequestRef.current;
      setSaveState("saving");
      setSaveError(null);

      try {
        const response = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: serializedProfile
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not save profile.");
        }

        if (requestId !== saveRequestRef.current) return;

        const normalized = prepareProfileForSave(payload.profile);
        lastSavedRef.current = JSON.stringify(normalized);
        setProfile(payload.profile);
        setSaveState("saved");
        setSaveError(null);
      } catch (error) {
        if (requestId !== saveRequestRef.current) return;
        setSaveState("error");
        setSaveError(error instanceof Error ? error.message : "Could not save profile.");
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [hasLinkErrors, hasUnsavedChanges, serializedProfile]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  function setSectionOpen(section: keyof typeof openSections) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function setIdentityField<K extends keyof ApplicantProfile["identity"]>(key: K, value: ApplicantProfile["identity"][K]) {
    setProfile((current) => ({
      ...current,
      identity: {
        ...current.identity,
        [key]: value
      }
    }));
  }

  async function saveNow() {
    if (!hasUnsavedChanges) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    setSaveError(null);

    if (hasLinkErrors) {
      setSaveState("error");
      setSaveError("Check the highlighted links before ApplyPilot can save this profile.");
      return;
    }

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: serializedProfile
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save profile.");
      }

      const normalized = prepareProfileForSave(payload.profile);
      lastSavedRef.current = JSON.stringify(normalized);
      setProfile(payload.profile);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Could not save profile.");
    }
  }

  async function uploadResume(file: File) {
    setResumeBusy(true);
    setResumeError(null);
    try {
      const formData = new FormData();
      formData.append("resume", file);
      const response = await fetch("/api/profile/resume", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not upload resume.");
      }

      const normalized = prepareProfileForSave(payload.profile);
      lastSavedRef.current = JSON.stringify(normalized);
      setProfile(payload.profile);
      setSaveState("saved");
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : "Could not upload resume.");
    } finally {
      setResumeBusy(false);
    }
  }

  async function removeResume() {
    if (!resumeName) return;
    if (!window.confirm("Remove the saved resume from ApplyPilot's local storage?")) return;

    setResumeBusy(true);
    setResumeError(null);
    try {
      const response = await fetch("/api/profile/resume", { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not remove resume.");
      }

      const normalized = prepareProfileForSave(payload.profile);
      lastSavedRef.current = JSON.stringify(normalized);
      setProfile(payload.profile);
      setSaveState("saved");
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : "Could not remove resume.");
    } finally {
      setResumeBusy(false);
    }
  }

  async function loadSyntheticQaProfile() {
    if (
      !window.confirm(
        "Load the synthetic QA profile and saved answers for local testing? ApplyPilot will preserve your previous local profile so you can restore it later."
      )
    ) {
      return;
    }

    setQaBusy("loading");
    setQaError(null);
    setQaMessage(null);
    try {
      const response = await fetch("/api/profile/synthetic-qa", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load the synthetic QA profile.");
      }

      const normalized = prepareProfileForSave(payload.profile);
      lastSavedRef.current = JSON.stringify(normalized);
      setProfile(payload.profile);
      setSaveState("saved");
      setSaveError(null);
      setQaBackupAvailable(Boolean(payload.backupAvailable));
      setQaMessage("Synthetic QA profile and saved answers loaded locally.");
    } catch (error) {
      setQaError(error instanceof Error ? error.message : "Could not load the synthetic QA profile.");
    } finally {
      setQaBusy(null);
    }
  }

  async function restorePreviousProfile() {
    if (!window.confirm("Restore the previous local profile and saved answers?")) return;

    setQaBusy("restoring");
    setQaError(null);
    setQaMessage(null);
    try {
      const response = await fetch("/api/profile/synthetic-qa", { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not restore the previous local profile.");
      }

      const normalized = prepareProfileForSave(payload.profile);
      lastSavedRef.current = JSON.stringify(normalized);
      setProfile(payload.profile);
      setSaveState("saved");
      setSaveError(null);
      setQaBackupAvailable(Boolean(payload.backupAvailable));
      setQaMessage("Previous local profile restored.");
    } catch (error) {
      setQaError(error instanceof Error ? error.message : "Could not restore the previous local profile.");
    } finally {
      setQaBusy(null);
    }
  }

  const additionalQuestionEntries = Object.entries(additionalQuestionLabels) as Array<
    [keyof ApplicantProfile["additionalApplicationFacts"], string]
  >;
  const isUnitedStates = profile.identity.country === "United States";

  return (
    <div className="space-y-5 pb-24">
      <section className="overflow-hidden rounded-[34px] bg-slate-950 text-white shadow-xl">
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
          <div className="space-y-4">
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-slate-300">Local Profile</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">Set up your application profile once, then keep it honest and easy to review.</h2>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-slate-300">
              ApplyPilot stores this information locally on this device. It does not claim encryption here, and it will not use optional demographic answers unless a form explicitly asks for them.
            </p>
            {syntheticProfileActive ? (
              <div className="rounded-[26px] border border-amber-300/40 bg-amber-300/10 px-4 py-4 text-sm leading-6 text-amber-50">
                <div className="flex items-center gap-2 font-semibold">
                  <FlaskConical className="h-4 w-4" />
                  <span>{SYNTHETIC_QA_PROFILE_LABEL}</span>
                </div>
                <p className="mt-2">
                  This fake profile is for local QA only. It should never be used to submit a real application.
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn("inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium", getSaveStateTone(saveState))}>
                {saveState === "saved" ? <Check className="mr-2 h-4 w-4" /> : saveState === "saving" ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                {getSaveStateLabel(saveState)}
              </span>
              {saveError ? <p className="text-sm text-rose-300">{saveError}</p> : <p className="text-sm text-slate-300">Autosave keeps quiet unless something needs your attention.</p>}
              {qaMessage ? <p className="text-sm text-emerald-200">{qaMessage}</p> : null}
              {qaError ? <p className="text-sm text-rose-300">{qaError}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="secondary-button" disabled={qaBusy !== null || hasUnsavedChanges} onClick={loadSyntheticQaProfile}>
                {qaBusy === "loading" ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
                Load synthetic QA profile
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={qaBusy !== null || !qaBackupAvailable || !syntheticProfileActive}
                onClick={restorePreviousProfile}
              >
                {qaBusy === "restoring" ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                Restore previous local profile
              </button>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                QA data stays local and only loads when you choose it.
              </p>
            </div>
          </div>

          <div className="rounded-[28px] bg-white/10 p-5 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.16em] text-slate-300">Resume</p>
                <p className="mt-3 text-xl font-semibold">{resumeName || "No resume selected yet"}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {resumeName
                    ? `Last updated ${profile.resume.uploadedAt ? formatDateTime(profile.resume.uploadedAt) : "recently"}.`
                    : "Upload a PDF or DOCX so ApplyPilot can attach it when a visible resume field appears."}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
                  profileNeedsResume(profile) ? "bg-amber-200 text-amber-950" : "bg-emerald-200 text-emerald-950"
                )}
              >
                {profileNeedsResume(profile) ? "Needed" : "Ready"}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" className="primary-button" disabled={resumeBusy} onClick={() => resumeInputRef.current?.click()}>
                {resumeBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {resumeName ? "Replace resume" : "Upload resume"}
              </button>
              <button type="button" className="secondary-button" disabled={!resumeName || resumeBusy} onClick={removeResume}>
                <X className="mr-2 h-4 w-4" />
                Remove
              </button>
              <button type="button" className="secondary-button" disabled={!hasUnsavedChanges || saveState === "saving"} onClick={saveNow}>
                <Save className="mr-2 h-4 w-4" />
                Save now
              </button>
            </div>
            <input
              ref={resumeInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void uploadResume(file);
                  event.currentTarget.value = "";
                }
              }}
            />
            {resumeError ? <p className="mt-4 text-sm text-rose-300">{resumeError}</p> : null}
            <p className="mt-4 text-xs uppercase tracking-[0.14em] text-slate-400">The resume file stays local and is ignored by Git.</p>
          </div>
        </div>
      </section>

      <DisclosureSection
        title="Personal information"
        description="Start with the details that appear on almost every application."
        summary="Name, preferred name, and your main email and phone."
        open={openSections.personal}
        onToggle={() => setSectionOpen("personal")}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["firstName", "First name"],
            ["middleName", "Middle name"],
            ["lastName", "Last name"],
            ["preferredName", "Preferred name"],
            ["email", "Email"],
            ["phoneCountryCode", "Calling code"],
            ["phoneNationalNumber", "Phone number"],
            ["phoneExtension", "Extension"]
          ].map(([key, label]) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <input
                className="field-input mt-2"
                value={String(profile.identity[key as keyof ApplicantProfile["identity"]] ?? "")}
                onChange={(event) => setIdentityField(key as keyof ApplicantProfile["identity"], event.target.value)}
              />
            </div>
          ))}
        </div>
      </DisclosureSection>

      <DisclosureSection
        title="Contact and address"
        description="Keep address details close at hand, but only store the ones you want reused."
        summary="Street address stays editable here, and city/state stay easy to review."
        open={openSections.contact}
        onToggle={() => setSectionOpen("contact")}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["addressLine1", "Address line 1"],
            ["addressLine2", "Address line 2"],
            ["postalCode", "ZIP / postal code"],
            ["country", "Country"]
          ].map(([key, label]) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <input
                className="field-input mt-2"
                value={String(profile.identity[key as keyof ApplicantProfile["identity"]] ?? "")}
                onChange={(event) => setIdentityField(key as keyof ApplicantProfile["identity"], event.target.value)}
              />
            </div>
          ))}

          <div className="md:col-span-2">
            <label className="field-label">City</label>
            <div className="mt-2">
              <CityAutocomplete
                city={profile.identity.city}
                stateProvince={profile.identity.stateProvince}
                country={profile.identity.country}
                locationLabel={profile.identity.locationLabel}
                onClear={() =>
                  setProfile((current) => ({
                    ...current,
                    identity: {
                      ...current.identity,
                      city: "",
                      locationLabel: "",
                      locationKey: ""
                    }
                  }))
                }
                onSelect={(location, manualCity) =>
                  setProfile((current) => ({
                    ...current,
                    identity: {
                      ...current.identity,
                      city: manualCity || location?.city || "",
                      stateProvince: location?.stateProvince || current.identity.stateProvince,
                      country: location?.country || current.identity.country,
                      locationLabel: location?.label || manualCity || "",
                      locationKey: location?.normalizedKey || (manualCity ? manualCity.toLowerCase().replace(/\s+/g, "-") : "")
                    }
                  }))
                }
              />
            </div>
          </div>

          <div>
            <label className="field-label">State / province</label>
            {isUnitedStates ? (
              <select className="field-input mt-2" value={profile.identity.stateProvince} onChange={(event) => setIdentityField("stateProvince", event.target.value)}>
                <option value="">Select a state</option>
                {US_STATE_OPTIONS.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
            ) : (
              <input className="field-input mt-2" value={profile.identity.stateProvince} onChange={(event) => setIdentityField("stateProvince", event.target.value)} />
            )}
          </div>
        </div>
      </DisclosureSection>

      <DisclosureSection
        title="Work authorization"
        description="Keep legally sensitive employment authorization answers explicit, separate, and easy to review."
        summary="These answers are reused only from what you save here."
        open={openSections.authorization}
        onToggle={() => setSectionOpen("authorization")}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className="field-label">Authorized to work in the United States</label>
            <select
              className="field-input mt-2"
              value={profile.workAuthorizationProfile.authorizedInUS}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  workAuthorizationProfile: {
                    ...current.workAuthorizationProfile,
                    authorizedInUS: event.target.value as ApplicantProfile["workAuthorizationProfile"]["authorizedInUS"]
                  }
                }))
              }
            >
              {binaryChoiceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">Current authorization category</label>
            <select
              className="field-input mt-2"
              value={profile.workAuthorizationProfile.usWorkAuthorizationCategory}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  workAuthorizationProfile: {
                    ...current.workAuthorizationProfile,
                    usWorkAuthorizationCategory: event.target.value as ApplicantProfile["workAuthorizationProfile"]["usWorkAuthorizationCategory"]
                  }
                }))
              }
            >
              {workAuthorizationCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">Require sponsorship now</label>
            <select
              className="field-input mt-2"
              value={profile.workAuthorizationProfile.requiresSponsorshipNow}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  workAuthorizationProfile: {
                    ...current.workAuthorizationProfile,
                    requiresSponsorshipNow: event.target.value as ApplicantProfile["workAuthorizationProfile"]["requiresSponsorshipNow"]
                  }
                }))
              }
            >
              {binaryChoiceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">Require sponsorship in the future</label>
            <select
              className="field-input mt-2"
              value={profile.workAuthorizationProfile.requiresSponsorshipFuture}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  workAuthorizationProfile: {
                    ...current.workAuthorizationProfile,
                    requiresSponsorshipFuture: event.target.value as ApplicantProfile["workAuthorizationProfile"]["requiresSponsorshipFuture"]
                  }
                }))
              }
            >
              {binaryChoiceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">Visa type</label>
            <input
              className="field-input mt-2"
              value={profile.workAuthorizationProfile.visaType}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  workAuthorizationProfile: {
                    ...current.workAuthorizationProfile,
                    visaType: event.target.value
                  }
                }))
              }
            />
          </div>

          <div>
            <label className="field-label">Authorization expiration date</label>
            <input
              type="date"
              className="field-input mt-2"
              value={profile.workAuthorizationProfile.authorizationExpirationDate}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  workAuthorizationProfile: {
                    ...current.workAuthorizationProfile,
                    authorizationExpirationDate: event.target.value
                  }
                }))
              }
            />
          </div>
        </div>
      </DisclosureSection>

      <DisclosureSection
        title="Employment"
        description="Keep work history tight and factual. Each entry is easy to expand, update, or skip."
        summary={profile.experience.some((entry) => entry.company || entry.title) ? `${profile.experience.length} saved role${profile.experience.length === 1 ? "" : "s"}` : "No roles saved yet."}
        open={openSections.experience}
        onToggle={() => setSectionOpen("experience")}
      >
        <label className="mb-5 flex items-center gap-3 rounded-[24px] bg-slate-50/80 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
          <input
            type="checkbox"
            checked={profile.workHistoryComplete}
            onChange={(event) => setProfile((current) => ({ ...current, workHistoryComplete: event.target.checked }))}
          />
          My saved work history is complete enough for employer-history questions.
        </label>

        <div className="space-y-4">
          {profile.experience.map((entry, index) => {
            const isEditing = editingExperienceId === entry.id;
            return (
              <div key={entry.id} className="rounded-[26px] bg-slate-50/70 p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{summarizeExperience(entry)}</p>
                    <p className="mt-1 text-sm text-slate-500">{entry.currentRole ? "Current role" : "Past role"}{entry.startDate ? ` • ${entry.startDate}` : ""}{entry.endDate ? ` to ${entry.endDate}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="secondary-button px-3 py-2" onClick={() => setEditingExperienceId(isEditing ? null : entry.id)}>
                      <PencilLine className="mr-2 h-4 w-4" />
                      {isEditing ? "Collapse" : "Edit"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button px-3 py-2"
                      onClick={() => {
                        if (!window.confirm(`Remove ${entry.title || `employment entry ${index + 1}`}?`)) return;
                        setProfile((current) => ({
                          ...current,
                          experience: current.experience.length === 1 ? [createExperienceEntry()] : current.experience.filter((item) => item.id !== entry.id)
                        }));
                        if (editingExperienceId === entry.id) {
                          setEditingExperienceId(null);
                        }
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {[
                      ["company", "Employer"],
                      ["title", "Role title"],
                      ["location", "Location"]
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label className="field-label">{label}</label>
                        <input
                          className="field-input mt-2"
                          value={String(entry[key as keyof ExperienceEntry] ?? "")}
                          onChange={(event) =>
                            setProfile((current) => ({
                              ...current,
                              experience: current.experience.map((item) => (item.id === entry.id ? { ...item, [key]: event.target.value } : item))
                            }))
                          }
                        />
                      </div>
                    ))}

                    <div>
                      <label className="field-label">Start month</label>
                      <input
                        type="month"
                        className="field-input mt-2"
                        value={entry.startDate}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            experience: current.experience.map((item) => (item.id === entry.id ? { ...item, startDate: event.target.value } : item))
                          }))
                        }
                      />
                    </div>

                    <div>
                      <label className="field-label">End month</label>
                      <input
                        type="month"
                        className="field-input mt-2"
                        value={entry.endDate}
                        disabled={entry.currentRole}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            experience: current.experience.map((item) => (item.id === entry.id ? { ...item, endDate: event.target.value } : item))
                          }))
                        }
                      />
                    </div>

                    <label className="flex items-center gap-3 rounded-[20px] bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
                      <input
                        type="checkbox"
                        checked={entry.currentRole}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            experience: current.experience.map((item) =>
                              item.id === entry.id ? { ...item, currentRole: event.target.checked, endDate: event.target.checked ? "" : item.endDate } : item
                            )
                          }))
                        }
                      />
                      This is my current role
                    </label>

                    <div className="md:col-span-2 xl:col-span-3">
                      <label className="field-label">Company aliases</label>
                      <input
                        className="field-input mt-2"
                        placeholder="Optional names a form might use for this company"
                        value={entry.aliases.join(", ")}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            experience: current.experience.map((item) =>
                              item.id === entry.id
                                ? {
                                    ...item,
                                    aliases: event.target.value
                                      .split(",")
                                      .map((alias) => alias.trim())
                                      .filter(Boolean)
                                  }
                                : item
                            )
                          }))
                        }
                      />
                    </div>

                    <div className="md:col-span-2 xl:col-span-3">
                      <label className="field-label">Role summary</label>
                      <textarea
                        className="field-input mt-2 min-h-[110px]"
                        placeholder="One concise description you would be comfortable reusing."
                        value={entry.summary}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            experience: current.experience.map((item) => (item.id === entry.id ? { ...item, summary: event.target.value } : item))
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const next = createExperienceEntry();
              setProfile((current) => ({ ...current, experience: [...current.experience, next] }));
              setEditingExperienceId(next.id);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add employment entry
          </button>
        </div>
      </DisclosureSection>

      <DisclosureSection
        title="Education"
        description="Save only the education details you want reused on application forms."
        summary={profile.education.some((entry) => entry.school || entry.degree) ? `${profile.education.length} saved education entr${profile.education.length === 1 ? "y" : "ies"}` : "No education saved yet."}
        open={openSections.education}
        onToggle={() => setSectionOpen("education")}
      >
        <div className="space-y-4">
          {profile.education.map((entry, index) => {
            const isEditing = editingEducationId === entry.id;
            return (
              <div key={entry.id} className="rounded-[26px] bg-slate-50/70 p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{summarizeEducation(entry)}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {entry.graduationStatus === "expected" || entry.graduationStatus === "currently_enrolled" ? "Expected / in progress" : "Education entry"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="secondary-button px-3 py-2" onClick={() => setEditingEducationId(isEditing ? null : entry.id)}>
                      <PencilLine className="mr-2 h-4 w-4" />
                      {isEditing ? "Collapse" : "Edit"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button px-3 py-2"
                      onClick={() => {
                        if (!window.confirm(`Remove ${entry.school || `education entry ${index + 1}`}?`)) return;
                        setProfile((current) => ({
                          ...current,
                          education: current.education.length === 1 ? [createEducationEntry()] : current.education.filter((item) => item.id !== entry.id)
                        }));
                        if (editingEducationId === entry.id) {
                          setEditingEducationId(null);
                        }
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div className="md:col-span-2">
                      <label className="field-label">School</label>
                      <div className="mt-2">
                        <SchoolAutocomplete
                          value={entry.school}
                          onSelect={(next) =>
                            setProfile((current) => ({
                              ...current,
                              education: current.education.map((item) =>
                                item.id === entry.id ? { ...item, school: next.school, normalizedSchoolName: next.normalizedSchoolName } : item
                              )
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="field-label">Degree type</label>
                      <select
                        className="field-input mt-2"
                        value={entry.degreeType}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            education: current.education.map((item) =>
                              item.id === entry.id
                                ? {
                                    ...item,
                                    degreeType: event.target.value as EducationEntry["degreeType"],
                                    degree: event.target.selectedOptions[0]?.textContent ?? "",
                                    degreeLevel: degreeTypeOptions.find((option) => option.value === event.target.value)?.degreeLevel ?? ""
                                  }
                                : item
                            )
                          }))
                        }
                      >
                        <option value="">Select a degree</option>
                        {degreeTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {entry.degreeType === "other" ? (
                      <div>
                        <label className="field-label">Custom degree</label>
                        <input
                          className="field-input mt-2"
                          value={entry.degreeCustomValue}
                          onChange={(event) =>
                            setProfile((current) => ({
                              ...current,
                              education: current.education.map((item) =>
                                item.id === entry.id ? { ...item, degreeCustomValue: event.target.value, degree: event.target.value } : item
                              )
                            }))
                          }
                        />
                      </div>
                    ) : null}

                    <div>
                      <label className="field-label">Field of study</label>
                      <div className="mt-2">
                        <FieldOfStudyAutocomplete
                          value={entry.displayFieldOfStudy || entry.fieldOfStudy || entry.major}
                          onSelect={(next) =>
                            setProfile((current) => ({
                              ...current,
                              education: current.education.map((item) =>
                                item.id === entry.id
                                  ? {
                                      ...item,
                                      major: next.displayFieldOfStudy,
                                      fieldOfStudy: next.displayFieldOfStudy,
                                      displayFieldOfStudy: next.displayFieldOfStudy,
                                      normalizedFieldOfStudy: next.normalizedFieldOfStudy
                                    }
                                  : item
                              )
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="field-label">Graduation status</label>
                      <select
                        className="field-input mt-2"
                        value={entry.graduationStatus}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            education: current.education.map((item) =>
                              item.id === entry.id
                                ? {
                                    ...item,
                                    graduationStatus: event.target.value as EducationEntry["graduationStatus"],
                                    graduationDateType:
                                      event.target.value === "expected" || event.target.value === "currently_enrolled" ? "expected" : item.graduationDateType
                                  }
                                : item
                            )
                          }))
                        }
                      >
                        {graduationStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="field-label">{entry.graduationStatus === "expected" || entry.graduationStatus === "currently_enrolled" ? "Expected graduation month" : "Graduation month"}</label>
                      <input
                        type="month"
                        className="field-input mt-2"
                        value={entry.graduationDate}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            education: current.education.map((item) =>
                              item.id === entry.id
                                ? {
                                    ...item,
                                    graduationDate: event.target.value,
                                    graduationDateType: entry.graduationStatus === "expected" || entry.graduationStatus === "currently_enrolled" ? "expected" : "actual"
                                  }
                                : item
                            )
                          }))
                        }
                      />
                    </div>

                    <div>
                      <label className="field-label">Start month</label>
                      <input
                        type="month"
                        className="field-input mt-2"
                        value={entry.startDate}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            education: current.education.map((item) => (item.id === entry.id ? { ...item, startDate: event.target.value } : item))
                          }))
                        }
                      />
                    </div>

                    <div>
                      <label className="field-label">School location</label>
                      <input
                        className="field-input mt-2"
                        value={entry.location}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            education: current.education.map((item) => (item.id === entry.id ? { ...item, location: event.target.value } : item))
                          }))
                        }
                      />
                    </div>

                    <div>
                      <label className="field-label">GPA (optional)</label>
                      <input
                        className="field-input mt-2"
                        value={entry.gpa}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            education: current.education.map((item) => (item.id === entry.id ? { ...item, gpa: event.target.value } : item))
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const next = createEducationEntry();
              setProfile((current) => ({ ...current, education: [...current.education, next] }));
              setEditingEducationId(next.id);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add education entry
          </button>
        </div>
      </DisclosureSection>

      <DisclosureSection
        title="Skills and professional links"
        description="Keep the links and skills you want reused most often within easy reach."
        summary="Skills stay chip-based, and links are validated before they save."
        open={openSections.skills}
        onToggle={() => setSectionOpen("skills")}
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <div>
              <label className="field-label">Skills</label>
              <div className="mt-3">
                <SkillSelector
                  value={profile.skillsProfile.skills}
                  onChange={(next) =>
                    setProfile((current) => ({
                      ...current,
                      skillsProfile: {
                        ...current.skillsProfile,
                        skills: next
                      }
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["linkedin", "LinkedIn"],
                ["github", "GitHub"],
                ["portfolio", "Portfolio"],
                ["website", "Website"],
                ["otherLink", "Other professional link"]
              ].map(([field, label]) => {
                const key = field as ProfileLinkField;
                return (
                  <div key={field}>
                    <label className="field-label">{label}</label>
                    <input
                      className={cn("field-input mt-2", linkErrors[key] ? "border-rose-300 pr-10" : "")}
                      value={String(profile.identity[key] ?? "")}
                      placeholder={label === "LinkedIn" ? "linkedin.com/in/your-name" : label === "GitHub" ? "github.com/your-name" : "https://"}
                      onBlur={(event) => setIdentityField(key, event.target.value.trim())}
                      onChange={(event) => setIdentityField(key, event.target.value)}
                    />
                    {linkErrors[key] ? <p className="mt-2 text-sm text-rose-600">{linkErrors[key]}</p> : null}
                  </div>
                );
              })}

              <div>
                <label className="field-label">Default website answer</label>
                <select
                  className="field-input mt-2"
                  value={profile.identity.genericWebsiteFallback}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      identity: {
                        ...current.identity,
                        genericWebsiteFallback: event.target.value as ApplicantProfile["identity"]["genericWebsiteFallback"]
                      }
                    }))
                  }
                >
                  {websiteFallbackOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-[26px] bg-slate-50/70 p-5 ring-1 ring-slate-200">
            <p className="field-label">Saved answers</p>
            <p className="mt-3 text-base font-medium text-slate-950">Keep reusable written answers separate from your core profile.</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              For questions like “Why this role?” or “Tell us about yourself,” edit your human-reviewed answers in the Answer Bank.
            </p>
            <Link href="/answer-bank" className="secondary-button mt-5 w-full justify-center">
              Open Answer Bank
            </Link>
          </div>
        </div>
      </DisclosureSection>

      <DisclosureSection
        title="Job preferences"
        description="Capture only the preferences you expect to reuse regularly."
        summary="Job types, location preferences, availability, and compensation stay concise."
        open={openSections.preferences}
        onToggle={() => setSectionOpen("preferences")}
      >
        <div className="space-y-5">
          <div>
            <label className="field-label">Preferred job types</label>
            <div className="mt-3 flex flex-wrap gap-2">
              {jobTypeOptions.map((option) => {
                const active = profile.preferencesProfile.jobTypes.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn("rounded-full px-4 py-2 text-sm font-medium transition", active ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50")}
                    onClick={() =>
                      setProfile((current) => ({
                        ...current,
                        preferencesProfile: {
                          ...current.preferencesProfile,
                          jobTypes: active
                            ? current.preferencesProfile.jobTypes.filter((jobType) => jobType !== option.value)
                            : [...current.preferencesProfile.jobTypes, option.value as JobType]
                        }
                      }))
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="field-label">Locations you'd consider</label>
            <div className="mt-3">
              <LocationPreferenceSelector
                value={profile.preferencesProfile.locationsOpenTo}
                onChange={(next) =>
                  setProfile((current) => ({
                    ...current,
                    preferencesProfile: {
                      ...current.preferencesProfile,
                      locationsOpenTo: next
                    }
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="field-label">When can you start?</label>
              <select
                className="field-input mt-2"
                value={profile.availabilityProfile.startTiming}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    availabilityProfile: {
                      ...current.availabilityProfile,
                      startTiming: event.target.value as ApplicantProfile["availabilityProfile"]["startTiming"]
                    }
                  }))
                }
              >
                {availabilityTimingOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {profile.availabilityProfile.startTiming === "custom_date" ? (
              <div>
                <label className="field-label">Specific start date</label>
                <input
                  type="date"
                  className="field-input mt-2"
                  value={profile.availabilityProfile.customStartDate}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      availabilityProfile: {
                        ...current.availabilityProfile,
                        customStartDate: event.target.value
                      }
                    }))
                  }
                />
              </div>
            ) : null}

            <div>
              <label className="field-label">Preferred salary answer</label>
              <select
                className="field-input mt-2"
                value={profile.compensationProfile.answerStyle}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    compensationProfile: {
                      ...current.compensationProfile,
                      answerStyle: event.target.value as ApplicantProfile["compensationProfile"]["answerStyle"]
                    }
                  }))
                }
              >
                {compensationAnswerStyleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {[
              ["minimumSalary", "Minimum salary"],
              ["targetSalary", "Target salary"],
              ["highSalary", "High salary"],
              ["hourlyMinimum", "Minimum hourly rate"],
              ["hourlyTarget", "Target hourly rate"]
            ].map(([key, label]) => (
              <div key={key}>
                <label className="field-label">{label}</label>
                <input
                  type="number"
                  className="field-input mt-2"
                  value={profile.compensationProfile[key as keyof ApplicantProfile["compensationProfile"]] ?? ""}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      compensationProfile: {
                        ...current.compensationProfile,
                        [key]: event.target.value ? Number(event.target.value) : null
                      }
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </DisclosureSection>

      <DisclosureSection
        title="Professional background"
        description="Keep this short. The goal is just enough trusted context for better tailored answers tomorrow."
        summary="Summary, target roles, career direction, strengths, accomplishments, and projects."
        open={openSections.background}
        onToggle={() => setSectionOpen("background")}
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="field-label">Professional summary</label>
              <textarea
                className="field-input mt-2 min-h-[110px]"
                placeholder="A few sentences grounded in your actual background."
                value={profile.professionalBackground.professionalSummary}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    professionalBackground: {
                      ...current.professionalBackground,
                      professionalSummary: event.target.value
                    }
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label">Current identity</label>
              <input
                className="field-input mt-2"
                placeholder="Product-minded software engineer"
                value={profile.professionalBackground.currentIdentity}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    professionalBackground: {
                      ...current.professionalBackground,
                      currentIdentity: event.target.value
                    }
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label">Career direction</label>
              <input
                className="field-input mt-2"
                placeholder="Looking for thoughtful product and platform work"
                value={profile.professionalBackground.careerDirection}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    professionalBackground: {
                      ...current.professionalBackground,
                      careerDirection: event.target.value
                    }
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <ManualChipEditor
              label="Target roles"
              helper="Add short role families you want the answer system to keep in mind."
              placeholder="Full-stack engineering"
              values={profile.professionalBackground.targetRoleCategories}
              onChange={(next) =>
                setProfile((current) => ({
                  ...current,
                  professionalBackground: {
                    ...current.professionalBackground,
                    targetRoleCategories: next
                  }
                }))
              }
            />
            <ManualChipEditor
              label="Industries of interest"
              placeholder="Developer tools"
              values={profile.professionalBackground.industriesOfInterest}
              onChange={(next) =>
                setProfile((current) => ({
                  ...current,
                  professionalBackground: {
                    ...current.professionalBackground,
                    industriesOfInterest: next
                  }
                }))
              }
            />
            <ManualChipEditor
              label="Strengths"
              placeholder="Cross-functional communication"
              values={profile.professionalBackground.keyStrengths}
              onChange={(next) =>
                setProfile((current) => ({
                  ...current,
                  professionalBackground: {
                    ...current.professionalBackground,
                    keyStrengths: next
                  }
                }))
              }
            />
            <ManualChipEditor
              label="Accomplishments"
              placeholder="Shipped an internal workflow tool"
              values={profile.professionalBackground.keyAccomplishments}
              onChange={(next) =>
                setProfile((current) => ({
                  ...current,
                  professionalBackground: {
                    ...current.professionalBackground,
                    keyAccomplishments: next
                  }
                }))
              }
            />
            <ManualChipEditor
              label="Important projects"
              placeholder="Application workflow assistant"
              values={profile.professionalBackground.importantProjects}
              onChange={(next) =>
                setProfile((current) => ({
                  ...current,
                  professionalBackground: {
                    ...current.professionalBackground,
                    importantProjects: next
                  }
                }))
              }
            />
            <ManualChipEditor
              label="Reasons you're exploring"
              placeholder="More product ownership"
              values={profile.professionalBackground.reasonsForSeeking}
              onChange={(next) =>
                setProfile((current) => ({
                  ...current,
                  professionalBackground: {
                    ...current.professionalBackground,
                    reasonsForSeeking: next
                  }
                }))
              }
            />
          </div>
        </div>
      </DisclosureSection>

      <DisclosureSection
        title="Behavioral stories"
        description="Capture real examples in human terms so you can quickly review them later."
        summary={profile.stories.some((story) => story.title || story.situation || story.action || story.result) ? `${profile.stories.length} saved stor${profile.stories.length === 1 ? "y" : "ies"}` : "No stories saved yet."}
        open={openSections.stories}
        onToggle={() => setSectionOpen("stories")}
      >
        <div className="space-y-4">
          {profile.stories.map((story, index) => {
            const isEditing = editingStoryId === story.id;
            return (
              <div key={story.id} className="rounded-[26px] bg-slate-50/70 p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-3xl">
                    <p className="text-sm font-semibold text-slate-900">{summarizeStory(story, index)}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{getStoryPreview(story)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="secondary-button px-3 py-2" onClick={() => setEditingStoryId(isEditing ? null : story.id)}>
                      <PencilLine className="mr-2 h-4 w-4" />
                      {isEditing ? "Collapse" : "Edit"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button px-3 py-2"
                      onClick={() => {
                        if (!window.confirm(`Remove ${story.title || `story ${index + 1}`}?`)) return;
                        setProfile((current) => ({
                          ...current,
                          stories: current.stories.length === 1 ? [createStory()] : current.stories.filter((item) => item.id !== story.id)
                        }));
                        if (editingStoryId === story.id) {
                          setEditingStoryId(null);
                        }
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="field-label">Story title</label>
                        <input
                          className="field-input mt-2"
                          placeholder="Launching a feature under a tight deadline"
                          value={story.title}
                          onChange={(event) =>
                            setProfile((current) => ({
                              ...current,
                              stories: current.stories.map((entry) => (entry.id === story.id ? { ...entry, title: event.target.value } : entry))
                            }))
                          }
                        />
                      </div>

                      <ManualChipEditor
                        label="Skills demonstrated"
                        placeholder="Leadership"
                        values={story.tags}
                        onChange={(next) =>
                          setProfile((current) => ({
                            ...current,
                            stories: current.stories.map((entry) => (entry.id === story.id ? { ...entry, tags: next } : entry))
                          }))
                        }
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="field-label">Situation</label>
                        <textarea
                          className="field-input mt-2 min-h-[110px]"
                          placeholder="What was happening?"
                          value={story.situation}
                          onChange={(event) =>
                            setProfile((current) => ({
                              ...current,
                              stories: current.stories.map((entry) => (entry.id === story.id ? { ...entry, situation: event.target.value } : entry))
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="field-label">Action</label>
                        <textarea
                          className="field-input mt-2 min-h-[110px]"
                          placeholder="What did you do?"
                          value={story.action}
                          onChange={(event) =>
                            setProfile((current) => ({
                              ...current,
                              stories: current.stories.map((entry) => (entry.id === story.id ? { ...entry, action: event.target.value } : entry))
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="field-label">Result</label>
                      <textarea
                        className="field-input mt-2 min-h-[110px]"
                        placeholder="What changed or improved?"
                        value={story.result}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            stories: current.stories.map((entry) => (entry.id === story.id ? { ...entry, result: event.target.value } : entry))
                          }))
                        }
                      />
                    </div>

                    <div className="rounded-[24px] bg-white p-4 ring-1 ring-slate-200">
                      <p className="field-label">Preview</p>
                      <p className="mt-3 text-sm leading-6 text-slate-700">{getStoryPreview(story)}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const next = createStory();
              setProfile((current) => ({ ...current, stories: [...current.stories, next] }));
              setEditingStoryId(next.id);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add story
          </button>
        </div>
      </DisclosureSection>

      <DisclosureSection
        title="Optional demographic and additional answers"
        description="Leave this section blank unless you want ApplyPilot to reuse exact saved answers when forms ask for them."
        summary="These answers stay optional and are stored locally."
        optional
        open={openSections.optional}
        onToggle={() => setSectionOpen("optional")}
      >
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="field-label">Security clearance level</label>
              <select
                className="field-input mt-2"
                value={profile.securityProfile.clearanceLevel}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    securityProfile: {
                      ...current.securityProfile,
                      clearanceLevel: event.target.value as ApplicantProfile["securityProfile"]["clearanceLevel"]
                    }
                  }))
                }
              >
                {securityClearanceLevelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Clearance status</label>
              <select
                className="field-input mt-2"
                value={profile.securityProfile.clearanceStatus}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    securityProfile: {
                      ...current.securityProfile,
                      clearanceStatus: event.target.value as ApplicantProfile["securityProfile"]["clearanceStatus"]
                    }
                  }))
                }
              >
                {clearanceStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Clearance expiration date</label>
              <input
                type="date"
                className="field-input mt-2"
                value={profile.securityProfile.clearanceExpirationDate}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    securityProfile: {
                      ...current.securityProfile,
                      clearanceExpirationDate: event.target.value
                    }
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label">Issuing authority</label>
              <input
                className="field-input mt-2"
                value={profile.securityProfile.issuingAuthority}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    securityProfile: {
                      ...current.securityProfile,
                      issuingAuthority: event.target.value
                    }
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="field-label">Gender</label>
              <select
                className="field-input mt-2"
                value={profile.eeocDefaults.gender.value}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    eeocDefaults: {
                      ...current.eeocDefaults,
                      gender: {
                        ...current.eeocDefaults.gender,
                        value: event.target.value
                      }
                    }
                  }))
                }
              >
                {eeocGenderOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Race / ethnicity default</label>
              <select
                className="field-input mt-2"
                value={profile.eeocDefaults.raceEthnicity.values[0] ?? "Ask me every time"}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    eeocDefaults: {
                      ...current.eeocDefaults,
                      raceEthnicity: {
                        ...current.eeocDefaults.raceEthnicity,
                        values: [event.target.value]
                      }
                    }
                  }))
                }
              >
                {eeocRaceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Veteran status</label>
              <select
                className="field-input mt-2"
                value={profile.eeocDefaults.veteranStatus.value}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    eeocDefaults: {
                      ...current.eeocDefaults,
                      veteranStatus: {
                        ...current.eeocDefaults.veteranStatus,
                        value: event.target.value
                      }
                    }
                  }))
                }
              >
                {eeocVeteranOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Disability status</label>
              <select
                className="field-input mt-2"
                value={profile.eeocDefaults.disabilityStatus.value}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    eeocDefaults: {
                      ...current.eeocDefaults,
                      disabilityStatus: {
                        ...current.eeocDefaults.disabilityStatus,
                        value: event.target.value
                      }
                    }
                  }))
                }
              >
                {eeocDisabilityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {additionalQuestionEntries.map(([key, label]) => {
              const isTextField = key === "shiftAvailability" || key === "willingToTravelPercentage" || key === "preferredEmploymentType" || key === "referralSource" || key === "noticePeriod";
              return (
                <div key={key}>
                  <label className="field-label">{label}</label>
                  {isTextField ? (
                    <input
                      className="field-input mt-2"
                      value={String(profile.additionalApplicationFacts[key] ?? "")}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          additionalApplicationFacts: {
                            ...current.additionalApplicationFacts,
                            [key]: event.target.value
                          }
                        }))
                      }
                    />
                  ) : (
                    <select
                      className="field-input mt-2"
                      value={String(profile.additionalApplicationFacts[key] ?? "ask")}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          additionalApplicationFacts: {
                            ...current.additionalApplicationFacts,
                            [key]: event.target.value
                          }
                        }))
                      }
                    >
                      {yesNoNotApplicableOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DisclosureSection>
    </div>
  );
}
