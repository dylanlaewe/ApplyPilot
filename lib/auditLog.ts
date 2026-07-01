import { AuditLogEntry } from "@/types";

export function createAuditEntry(
  sessionId: string,
  action: AuditLogEntry["action"],
  message: string,
  options?: Partial<Omit<AuditLogEntry, "id" | "sessionId" | "action" | "message" | "timestamp">>
): AuditLogEntry {
  return {
    id: crypto.randomUUID(),
    sessionId,
    action,
    message,
    timestamp: new Date().toISOString(),
    ...options
  };
}
