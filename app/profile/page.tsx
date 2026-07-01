import { ProfileForm } from "@/components/ProfileForm";
import { getApplicantProfile } from "@/lib/profile";

export default async function ProfilePage() {
  const profile = await getApplicantProfile();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Profile</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-950">Keep your core data clean and current.</h1>
      </div>
      <ProfileForm initialProfile={profile} />
    </div>
  );
}
