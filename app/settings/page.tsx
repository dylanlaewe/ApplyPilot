import { SettingsWorkspace } from "@/components/SettingsWorkspace";
import { getApplicationSessions } from "@/lib/applications";
import { buildLocalDataSummary } from "@/lib/localData";
import { getSettings } from "@/lib/settings";
import { getShortAnswerGeneratorRuntimeHealth } from "@/lib/shortAnswerGenerator";

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [summary, settings, sessions] = await Promise.all([
    buildLocalDataSummary(),
    getSettings(),
    getApplicationSessions()
  ]);
  const resolvedSearchParams = ((await (searchParams ?? Promise.resolve({}))) as Record<string, string | string[] | undefined>) ?? {};

  const sessionParam = resolvedSearchParams.session;
  const focusSessionId = Array.isArray(sessionParam) ? (sessionParam[0] ?? null) : (sessionParam ?? null);

  return (
    <SettingsWorkspace
      initialSettings={settings}
      initialSummary={summary}
      generatorHealth={getShortAnswerGeneratorRuntimeHealth()}
      recentSessions={sessions.slice(0, 5)}
      focusSessionId={focusSessionId}
    />
  );
}
