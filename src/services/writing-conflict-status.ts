import type { IDBPDatabase } from "idb";
import type { StudyDBV3 } from "./storage-db";
import type { WritingConflictResolutionAuditRecord } from "../types/cloud";
import type { ResolutionScopeGuard } from "./writing-conflict-commit";

export interface WritingResolutionView {
  auditId: string;
  mutationId: string;
  state: WritingConflictResolutionAuditRecord["state"];
  choice: WritingConflictResolutionAuditRecord["choice"];
}

/**
 * Reads durable local status, not a UI callback or a claimed network success.
 * This is safe when cloudMode is OFF and makes no network request.
 */
export async function readWritingResolutionStatus(
  db: IDBPDatabase<StudyDBV3>,
  guard: ResolutionScopeGuard,
  entityId: string,
): Promise<WritingResolutionView | null> {
  if (!guard.isCurrent()) throw new Error("STALE_ACCOUNT_SCOPE");
  const rows = await db.getAllFromIndex("syncOutbox", "by-entity", entityId);
  if (!guard.isCurrent()) throw new Error("STALE_ACCOUNT_SCOPE");
  const audits = rows.filter(
    (row): row is WritingConflictResolutionAuditRecord =>
      row.recordType === "writing_conflict_audit" &&
      row.entityKind === "writing" &&
      row.entityId === entityId,
  );
  const pending = audits.filter((row) => row.state === "awaiting_cas");
  if (pending.length > 1) throw new Error("WRITING_RESOLUTION_MULTIPLE_PENDING_AUDITS");
  // A later conflicting decision must not be hidden by a past CAS success.
  audits.sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) ||
      b.resolutionMutationId.localeCompare(a.resolutionMutationId),
  );
  const latest = pending[0] ?? audits[0];
  return latest
    ? {
        auditId: latest.id,
        mutationId: latest.resolutionMutationId,
        state: latest.state,
        choice: latest.choice,
      }
    : null;
}
