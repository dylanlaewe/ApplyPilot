import { ResumeUploadCard } from "@/components/ResumeUploadCard";
import { getApplicantProfile } from "@/lib/profile";

export default async function OnboardingPage() {
  const profile = await getApplicantProfile();

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Resume</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-slate-950">
          Save the resume you want ApplyPilot to upload.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          Your profile is the source of truth. The resume is just a stored attachment that ApplyPilot can upload when an application asks for it.
        </p>
      </div>
      <ResumeUploadCard initialProfile={profile} />
    </div>
  );
}
