"use client";

import { LoaderCircle, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  availabilityTimingOptions,
  binaryChoiceOptions,
  clearanceStatusOptions,
  compensationAnswerStyleOptions,
  degreeTypeOptions,
  eeocDisabilityOptions,
  eeocGenderOptions,
  eeocRaceOptions,
  eeocVeteranOptions,
  graduationDateTypeOptions,
  graduationStatusOptions,
  jobTypeOptions,
  securityClearanceLevelOptions,
  websiteFallbackOptions,
  workAuthorizationCategoryOptions,
  yesNoNotApplicableOptions
} from "@/lib/profileSchema";
import { formatDateTime } from "@/lib/utils";
import { ApplicantProfile, BehavioralStory, EducationEntry, ExperienceEntry } from "@/types";

import { CityAutocomplete } from "@/components/CityAutocomplete";
import { FieldOfStudyAutocomplete } from "@/components/FieldOfStudyAutocomplete";
import { LocationPreferenceSelector } from "@/components/LocationPreferenceSelector";
import { SchoolAutocomplete } from "@/components/SchoolAutocomplete";
import { SectionCard } from "@/components/SectionCard";
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

const eeocSingleSections: Array<{
  key: "gender" | "veteranStatus" | "disabilityStatus";
  label: string;
  options: readonly string[];
}> = [
  { key: "gender", label: "Gender", options: eeocGenderOptions },
  { key: "veteranStatus", label: "Veteran status", options: eeocVeteranOptions },
  { key: "disabilityStatus", label: "Disability status", options: eeocDisabilityOptions }
];

function normalizeCommaSeparatedList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function updateListValue(values: string[], index: number, nextValue: string) {
  return values.map((value, valueIndex) => (valueIndex === index ? nextValue : value));
}

function createEmptyStory(): BehavioralStory {
  return {
    id: crypto.randomUUID(),
    title: "",
    tags: [],
    situation: "",
    action: "",
    result: ""
  };
}

function ListEditor({
  label,
  description,
  values,
  placeholder,
  addLabel,
  onChange
}: {
  label: string;
  description?: string;
  values: string[];
  placeholder: string;
  addLabel: string;
  onChange: (next: string[]) => void;
}) {
  const safeValues = values.length ? values : [""];

  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
        </div>
        <button type="button" className="secondary-button px-3 py-2 text-xs" onClick={() => onChange([...safeValues, ""])}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          {addLabel}
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {safeValues.map((value, index) => (
          <div key={`${label}-${index}`} className="flex items-start gap-3">
            <textarea
              className="field-input min-h-[84px] flex-1"
              value={value}
              placeholder={placeholder}
              onChange={(event) => onChange(updateListValue(safeValues, index, event.target.value))}
            />
            <button
              type="button"
              className="secondary-button px-3 py-2"
              onClick={() => onChange(safeValues.length === 1 ? [""] : safeValues.filter((_, valueIndex) => valueIndex !== index))}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileForm({ initialProfile }: { initialProfile: ApplicantProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [resumeBusy, setResumeBusy] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  const saveProfile = () => {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          identity: {
            ...profile.identity,
            fullName:
              profile.identity.fullName.trim() ||
              [profile.identity.firstName, profile.identity.middleName, profile.identity.lastName].filter(Boolean).join(" ").trim(),
            phone: [profile.identity.phoneCountryCode, profile.identity.phoneNationalNumber].filter(Boolean).join(" ").trim()
          }
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? "Could not save profile.");
        return;
      }

      setProfile(payload.profile);
      setMessage("Profile saved locally.");
    });
  };

  const uploadResume = async (file: File) => {
    setResumeBusy(true);
    setMessage(null);
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

      setProfile(payload.profile);
      setMessage("Resume saved locally.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not upload resume.");
    } finally {
      setResumeBusy(false);
    }
  };

  const removeResume = async () => {
    setResumeBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/profile/resume", { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not remove resume.");
      }

      setProfile(payload.profile);
      setMessage("Resume removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove resume.");
    } finally {
      setResumeBusy(false);
    }
  };

  const isUnitedStates = profile.identity.country === "United States";

  return (
    <div className="space-y-5 pb-24">
      <SectionCard title="Contact Information" description="Save clean identity, phone, and address facts once so ApplyPilot can adapt them safely across different forms.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["firstName", "First name"],
            ["middleName", "Middle name"],
            ["lastName", "Last name"],
            ["preferredName", "Preferred name"],
            ["email", "Email"],
            ["phoneCountry", "Phone country"],
            ["phoneCountryCode", "Calling code"],
            ["phoneNationalNumber", "National number"],
            ["phoneExtension", "Extension"],
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
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    identity: {
                      ...current.identity,
                      [key]: event.target.value
                    }
                  }))
                }
              />
            </div>
          ))}

          <div className="md:col-span-2 xl:col-span-2">
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
              <select
                className="field-input mt-2"
                value={profile.identity.stateProvince}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    identity: {
                      ...current.identity,
                      stateProvince: event.target.value
                    }
                  }))
                }
              >
                <option value="">Select a state</option>
                {US_STATE_OPTIONS.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="field-input mt-2"
                value={profile.identity.stateProvince}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    identity: {
                      ...current.identity,
                      stateProvince: event.target.value
                    }
                  }))
                }
              />
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Professional Links" description="Store the exact links ApplyPilot should reuse, plus one generic website fallback preference for ambiguous Website fields.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["linkedin", "LinkedIn"],
            ["portfolio", "Portfolio"],
            ["website", "Personal website"],
            ["github", "GitHub"],
            ["otherLink", "Other professional link"]
          ].map(([key, label]) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <input
                className="field-input mt-2"
                value={String(profile.identity[key as keyof ApplicantProfile["identity"]] ?? "")}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    identity: {
                      ...current.identity,
                      [key]: event.target.value
                    }
                  }))
                }
              />
            </div>
          ))}
          <div>
            <label className="field-label">Generic Website fallback</label>
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
      </SectionCard>

      <SectionCard title="Resume" description="Your resume is stored locally and reused only when an application asks for a file upload.">
        <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-4">
          <p className="text-base font-medium text-slate-950">{profile.resume.originalFilename || "No resume uploaded yet"}</p>
          <p className="mt-1 text-sm text-slate-500">
            {profile.resume.uploadedAt
              ? `Uploaded ${formatDateTime(profile.resume.uploadedAt)}`
              : "Upload a PDF or DOCX resume once, and ApplyPilot will reuse it when a visible file input matches."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="secondary-button" disabled={resumeBusy} onClick={() => resumeInputRef.current?.click()}>
              {resumeBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Replace Resume
            </button>
            <button type="button" className="secondary-button" disabled={resumeBusy || !profile.resume.originalFilename} onClick={removeResume}>
              <X className="mr-2 h-4 w-4" />
              Remove
            </button>
          </div>
          <input
            ref={resumeInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadResume(file);
            }}
          />
        </div>
      </SectionCard>

      <SectionCard title="Work Authorization" description="Keep authorization, status category, and sponsorship answers separate so ApplyPilot can answer the right question instead of flattening everything into one yes/no.">
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
            <label className="field-label">Current work authorization category</label>
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

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["openToRelocation", "Open to relocation"],
            ["openToRemote", "Open to remote work"],
            ["openToHybrid", "Open to hybrid work"],
            ["openToOnsite", "Open to onsite work"]
          ].map(([key, label]) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <select
                className="field-input mt-2"
                value={String(profile.workAuthorizationProfile[key as keyof ApplicantProfile["workAuthorizationProfile"]])}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    workAuthorizationProfile: {
                      ...current.workAuthorizationProfile,
                      [key]: event.target.value
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
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Security Clearance" description="These answers are never inferred. Save them only if you want ApplyPilot to reuse them exactly when a compatible form option is present.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="field-label">Clearance level</label>
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
            <label className="field-label">Expiration date</label>
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
      </SectionCard>

      <SectionCard title="Availability" description="Structured availability is easier for ApplyPilot to adapt than custom prose.">
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
        </div>
      </SectionCard>

      <SectionCard title="Compensation" description="Store numeric values once and let ApplyPilot format them for salary or hourly questions.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["minimumSalary", "Minimum salary"],
            ["targetSalary", "Target salary"],
            ["highSalary", "Maximum salary"],
            ["hourlyMinimum", "Minimum hourly rate"],
            ["hourlyTarget", "Target hourly rate"]
          ].map(([key, label]) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <input
                type="number"
                className="field-input mt-2"
                placeholder="Enter a number"
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
          <div>
            <label className="field-label">Preferred answer format</label>
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
        </div>
      </SectionCard>

      <SectionCard title="Education" description="Store explicit education facts so ApplyPilot can safely derive highest education, graduation status, and expected versus actual dates.">
        <div className="space-y-4">
          {profile.education.map((entry, index) => (
            <div key={entry.id} className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Education entry {index + 1}</p>
                <button
                  type="button"
                  className="secondary-button px-3 py-2"
                  onClick={() =>
                    setProfile((current) => ({
                      ...current,
                      education: current.education.filter((item) => item.id !== entry.id)
                    }))
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                    <option value="">Select a degree type</option>
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
                          item.id === entry.id ? { ...item, graduationStatus: event.target.value as EducationEntry["graduationStatus"] } : item
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
                  <label className="field-label">Graduation date type</label>
                  <select
                    className="field-input mt-2"
                    value={entry.graduationDateType}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        education: current.education.map((item) =>
                          item.id === entry.id ? { ...item, graduationDateType: event.target.value as EducationEntry["graduationDateType"] } : item
                        )
                      }))
                    }
                  >
                    {graduationDateTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="field-label">Graduation date</label>
                  <input
                    type="month"
                    className="field-input mt-2"
                    value={entry.graduationDate}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        education: current.education.map((item) =>
                          item.id === entry.id ? { ...item, graduationDate: event.target.value } : item
                        )
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
            </div>
          ))}

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setProfile((current) => ({
                ...current,
                education: [...current.education, createEducationEntry()]
              }))
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Add education
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Employment History" description="Add enough work history for ApplyPilot to answer current-employer and former-employer questions safely.">
        <div className="space-y-4">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={profile.workHistoryComplete}
              onChange={(event) => setProfile((current) => ({ ...current, workHistoryComplete: event.target.checked }))}
            />
            My saved work history is complete enough to answer former-employer questions.
          </label>

          {profile.experience.map((entry, index) => (
            <div key={entry.id} className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Employment entry {index + 1}</p>
                <button
                  type="button"
                  className="secondary-button px-3 py-2"
                  onClick={() =>
                    setProfile((current) => ({
                      ...current,
                      experience: current.experience.filter((item) => item.id !== entry.id)
                    }))
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ["company", "Employer"],
                  ["title", "Role title"],
                  ["location", "Location"],
                  ["startDate", "Start date"],
                  ["endDate", "End date"]
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

                <div className="md:col-span-2 xl:col-span-3">
                  <label className="field-label">Company aliases (optional)</label>
                  <input
                    className="field-input mt-2"
                    placeholder="Comma-separated aliases, such as IBM, International Business Machines"
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

                <label className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={entry.currentRole}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        experience: current.experience.map((item) => (item.id === entry.id ? { ...item, currentRole: event.target.checked } : item))
                      }))
                    }
                  />
                  Current role
                </label>

                <div className="md:col-span-2 xl:col-span-3">
                  <label className="field-label">Description</label>
                  <textarea
                    className="subtle-textarea mt-2"
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
            </div>
          ))}

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setProfile((current) => ({
                ...current,
                experience: [...current.experience, createExperienceEntry()]
              }))
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Add employment entry
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Skills" description="Keep reusable skills structured so ApplyPilot can reuse them across text fields and chips without guessing.">
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
      </SectionCard>

      <details className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
        <summary className="cursor-pointer font-display text-xl font-semibold tracking-tight text-slate-950">Professional Background</summary>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          This section powers better “tell us about yourself,” “why this role,” and “why should we hire you” answers without inventing anything. Keep it factual, short, and reusable.
        </p>
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="field-label">Professional summary</label>
              <textarea
                className="field-input mt-2 min-h-[120px]"
                placeholder="A concise professional summary grounded in your actual background."
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
                placeholder="Data-focused software engineer"
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
                placeholder="Looking for product-minded engineering roles"
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

            <div>
              <label className="field-label">Target role categories</label>
              <input
                className="field-input mt-2"
                placeholder="Product engineering, data tooling, frontend platform"
                value={profile.professionalBackground.targetRoleCategories.join(", ")}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    professionalBackground: {
                      ...current.professionalBackground,
                      targetRoleCategories: normalizeCommaSeparatedList(event.target.value)
                    }
                  }))
                }
              />
            </div>

            <div>
              <label className="field-label">Industries of interest</label>
              <input
                className="field-input mt-2"
                placeholder="Developer tools, SaaS, fintech"
                value={profile.professionalBackground.industriesOfInterest.join(", ")}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    professionalBackground: {
                      ...current.professionalBackground,
                      industriesOfInterest: normalizeCommaSeparatedList(event.target.value)
                    }
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ListEditor
              label="Key strengths"
              description="Reusable strengths that are actually supported by your experience."
              values={profile.professionalBackground.keyStrengths}
              placeholder="Example: Turning messy workflows into clear, reliable product experiences."
              addLabel="Add strength"
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

            <ListEditor
              label="Key accomplishments"
              description="High-signal achievements you are comfortable reusing in tailored answers."
              values={profile.professionalBackground.keyAccomplishments}
              placeholder="Example: Built an internal tool that reduced repetitive application prep work."
              addLabel="Add accomplishment"
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

            <ListEditor
              label="Important projects"
              description="Projects the generator can reference when a role asks for relevant experience."
              values={profile.professionalBackground.importantProjects}
              placeholder="Example: Built and shipped a local job-application workflow assistant in Next.js."
              addLabel="Add project"
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

            <ListEditor
              label="Reasons for seeking"
              description="Real motivations you want ApplyPilot to reuse for role- or company-interest answers."
              values={profile.professionalBackground.reasonsForSeeking}
              placeholder="Example: I want to work on products where thoughtful UX and reliable execution both matter."
              addLabel="Add reason"
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
      </details>

      <details className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
        <summary className="cursor-pointer font-display text-xl font-semibold tracking-tight text-slate-950">Behavioral Stories</summary>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Save a few STAR-style examples here so ApplyPilot can recognize when a prompt needs a real story instead of guessing. Leave blank stories empty until you want to fill them in.
        </p>
        <div className="mt-5 space-y-4">
          {profile.stories.map((story, index) => (
            <div key={story.id || index} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Story {index + 1}</p>
                  <p className="mt-1 text-sm text-slate-600">Use concrete facts only. ApplyPilot will not invent missing parts.</p>
                </div>
                <button
                  type="button"
                  className="secondary-button px-3 py-2"
                  onClick={() =>
                    setProfile((current) => ({
                      ...current,
                      stories: current.stories.length === 1 ? [createEmptyStory()] : current.stories.filter((_, storyIndex) => storyIndex !== index)
                    }))
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label">Title</label>
                  <input
                    className="field-input mt-2"
                    placeholder="Cross-functional launch under a tight deadline"
                    value={story.title}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        stories: current.stories.map((entry, storyIndex) =>
                          storyIndex === index ? { ...entry, title: event.target.value } : entry
                        )
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="field-label">Tags</label>
                  <input
                    className="field-input mt-2"
                    placeholder="leadership, conflict, prioritization"
                    value={story.tags.join(", ")}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        stories: current.stories.map((entry, storyIndex) =>
                          storyIndex === index ? { ...entry, tags: normalizeCommaSeparatedList(event.target.value) } : entry
                        )
                      }))
                    }
                  />
                </div>

                {[
                  ["situation", "Situation", "What was happening?"],
                  ["action", "Action", "What did you specifically do?"],
                  ["result", "Result", "What measurable or concrete outcome happened?"]
                ].map(([key, label, placeholder]) => (
                  <div key={key} className={key === "result" ? "md:col-span-2" : ""}>
                    <label className="field-label">{label}</label>
                    <textarea
                      className="field-input mt-2 min-h-[110px]"
                      placeholder={placeholder}
                      value={story[key as keyof BehavioralStory] as string}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          stories: current.stories.map((entry, storyIndex) =>
                            storyIndex === index ? { ...entry, [key]: event.target.value } : entry
                          )
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setProfile((current) => ({
                ...current,
                stories: [...current.stories, createEmptyStory()]
              }))
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Add another story
          </button>
        </div>
      </details>

      <SectionCard title="Work Preferences" description="Save preferred employment types and locations once.">
        <div className="space-y-5">
          <div>
            <p className="field-label">Employment types open to</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {jobTypeOptions.map((option) => (
                <label key={option.value} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={profile.preferencesProfile.jobTypes.includes(option.value)}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        preferencesProfile: {
                          ...current.preferencesProfile,
                          jobTypes: event.target.checked
                            ? [...current.preferencesProfile.jobTypes, option.value]
                            : current.preferencesProfile.jobTypes.filter((value) => value !== option.value)
                        }
                      }))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label">Preferred locations</label>
            <div className="mt-2">
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
        </div>
      </SectionCard>

      <details className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
        <summary className="cursor-pointer font-display text-xl font-semibold tracking-tight text-slate-950">Sensitive / EEOC</summary>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          These answers are never inferred. If you save an actual answer, ApplyPilot will reuse it only when a compatible visible option is found. If you choose Ask me every time, it will stay in review.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {eeocSingleSections.map(({ key, label, options }) => {
            const setting = profile.eeocDefaults[key];
            const needsCustomInput = setting.value === "Another identity";

            return (
              <div key={key} className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="field-label">Saved answer</label>
                    <select
                      className="field-input mt-2"
                      value={setting.value}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          eeocDefaults: {
                            ...current.eeocDefaults,
                            [key]: {
                              ...current.eeocDefaults[key],
                              value: event.target.value
                            }
                          }
                        }))
                      }
                    >
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  {needsCustomInput ? (
                    <div>
                      <label className="field-label">Custom answer</label>
                      <input
                        className="field-input mt-2"
                        value={setting.customValue}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            eeocDefaults: {
                              ...current.eeocDefaults,
                              [key]: {
                                ...current.eeocDefaults[key],
                                customValue: event.target.value
                              }
                            }
                          }))
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4 md:col-span-2">
            <p className="text-sm font-semibold text-slate-900">Race / ethnicity</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {eeocRaceOptions.map((option) => (
                <label key={option} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={profile.eeocDefaults.raceEthnicity.values.includes(option)}
                    onChange={(event) =>
                      setProfile((current) => {
                        const existing = new Set(current.eeocDefaults.raceEthnicity.values);
                        if (option === "Ask me every time" || option === "Prefer not to answer") {
                          return {
                            ...current,
                            eeocDefaults: {
                              ...current.eeocDefaults,
                              raceEthnicity: {
                                ...current.eeocDefaults.raceEthnicity,
                                values: event.target.checked ? [option] : []
                              }
                            }
                          };
                        }

                        existing.delete("Ask me every time");
                        if (event.target.checked) {
                          existing.add(option);
                        } else {
                          existing.delete(option);
                        }

                        return {
                          ...current,
                          eeocDefaults: {
                            ...current.eeocDefaults,
                            raceEthnicity: {
                              ...current.eeocDefaults.raceEthnicity,
                              values: Array.from(existing)
                            }
                          }
                        };
                      })
                    }
                  />
                  {option}
                </label>
              ))}
            </div>
          </div>
        </div>
      </details>

      <details className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
        <summary className="cursor-pointer font-display text-xl font-semibold tracking-tight text-slate-950">Additional Application Questions</summary>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Keep this section light. These are common reusable questions that show up often enough to be worth saving, but they stay collapsed by default so the core profile stays calm.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["validDriversLicense", "Valid driver's license"],
            ["reliableTransportation", "Reliable transportation"],
            ["meetsMinimumWorkingAge", "At least 18 years old"],
            ["willingBackgroundCheck", "Willing to undergo background check"],
            ["willingDrugScreen", "Willing to undergo drug screening"],
            ["relatedFamilyAtCompany", "Related family employed by company"],
            ["boundByNonCompete", "Bound by non-compete agreement"],
            ["governmentEmploymentHistory", "Government employment history"],
            ["willingToTravel", "Willing to travel"],
            ["weekendAvailability", "Weekend availability"],
            ["overtimeAvailability", "Overtime availability"]
          ].map(([key, label]) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <select
                className="field-input mt-2"
                value={String(profile.additionalApplicationFacts[key as keyof ApplicantProfile["additionalApplicationFacts"]])}
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
            </div>
          ))}

          {[
            ["willingToTravelPercentage", "Travel percentage"],
            ["shiftAvailability", "Shift availability"],
            ["preferredEmploymentType", "Preferred employment type"],
            ["referralSource", "Referral source"],
            ["noticePeriod", "Current notice period"]
          ].map(([key, label]) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <input
                className="field-input mt-2"
                value={String(profile.additionalApplicationFacts[key as keyof ApplicantProfile["additionalApplicationFacts"]] ?? "")}
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
            </div>
          ))}
        </div>
      </details>

      <div className="fixed bottom-4 left-1/2 z-20 w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 rounded-[24px] border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">{message || "Save after making profile changes."}</p>
          <button type="button" className="primary-button" onClick={saveProfile} disabled={isPending || resumeBusy}>
            {isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isPending ? "Saving..." : "Save profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
