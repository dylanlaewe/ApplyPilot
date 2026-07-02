import { ApplicationsWorkspace } from "@/components/ApplicationsWorkspace";
import { getApplicationSessions } from "@/lib/applications";
import { buildDogfoodReport } from "@/lib/dogfoodReport";
import { getApplicantProfile } from "@/lib/profile";

export default async function ApplicationsPage({
  searchParams
}: {
  searchParams?: Promise<{ view?: string | string[]; application?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const initialView = typeof params.view === "string" && params.view === "insights" ? "insights" : "applications";
  const initialSelectedId = typeof params.application === "string" ? params.application : params.application?.[0] ?? null;

  const [sessions, profile, dogfoodReport] = await Promise.all([getApplicationSessions(), getApplicantProfile(), buildDogfoodReport()]);

  return (
    <ApplicationsWorkspace
      initialSessions={sessions}
      currentResume={{
        filename: profile.resume.originalFilename,
        fileExists: profile.resume.fileExists
      }}
      initialDogfoodReport={dogfoodReport}
      initialView={initialView}
      initialSelectedId={initialSelectedId}
    />
  );
}
