import { QuickApplyBox } from "@/components/QuickApplyBox";
import { getActiveSession } from "@/lib/applyExperience";
import { getApplicationSessions } from "@/lib/applications";
import { getApplicantProfile } from "@/lib/profile";

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ session?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedSessionId = typeof params.session === "string" ? params.session : params.session?.[0];

  const [profile, sessions] = await Promise.all([getApplicantProfile(), getApplicationSessions()]);
  const activeSession = getActiveSession(sessions, requestedSessionId);

  return <QuickApplyBox profile={profile} initialSession={activeSession} recentSessions={sessions} />;
}
