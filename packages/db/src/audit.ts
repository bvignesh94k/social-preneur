import type { Database } from "./client";
import { auditLogs } from "./schema";

export type AuditEntry = typeof auditLogs.$inferInsert;

export async function recordAudit(db: Database, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values(entry);
}
