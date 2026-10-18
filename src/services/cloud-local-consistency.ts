import { openScopedStudyDatabase, type StudyDBV3 } from "./storage-db";
import { openSyncMetaDatabase } from "./sync-meta";
import { isMutationRecord } from "./cloud-protocol";
import type { AccountScope } from "../types/cloud";
import type { IDBPDatabase } from "idb";

/**
 * Read-only, conservative PR-6 preflight across two independent IndexedDBs.
 * NO cross-database atomicity is claimed. A clean result is not cloud
 * confirmation; reconcileRequired stays true until separately validated.
 */
export async function inspectLocalCloudConsistency(scope: AccountScope): Promise<{
  readyForExplicitResume: boolean;
  reasons: string[];
}> {
  if (scope.mode !== "account") throw new Error("CLOUD_CONSISTENCY_ACCOUNT_REQUIRED");
  const study = await openScopedStudyDatabase(scope);
  if (study.version !== 3) {
    study.close();
    throw new Error("CLOUD_CONSISTENCY_STUDY_DB_VERSION");
  }
  try {
    const db = study as IDBPDatabase<StudyDBV3>;
    const [receipt, outbox] = await Promise.all([
      db.get("syncOutbox", "__bootstrap_receipt__"),
      db.getAll("syncOutbox"),
    ]);
    const meta = await openSyncMetaDatabase(scope);
    try {
      const [adoption, historicalConflicts] = await Promise.all([
        meta.get("settings", "adoption"),
        meta.getAll("conflicts"),
      ]);
      const reasons: string[] = [];
      if (!adoption) reasons.push("ADOPTION_METADATA_MISSING");
      else if (adoption.choice === "local_only") reasons.push("LOCAL_ONLY_CHOICE");

      if (receipt?.recordType === "bootstrap") {
        if (receipt.targetScopeHash !== scope.scopeHash)
          reasons.push("BOOTSTRAP_SCOPE_MISMATCH");
        if (adoption?.choice !== "copy_legacy")
          reasons.push("BOOTSTRAP_ADOPTION_MISMATCH");
        else if (receipt.sourceFingerprint !== adoption.sourceFingerprint)
          reasons.push("BOOTSTRAP_FINGERPRINT_MISMATCH");
      } else if (adoption?.choice === "copy_legacy") {
        reasons.push("BOOTSTRAP_RECEIPT_MISSING");
      }

      if (historicalConflicts.length > 0)
        reasons.push("SYNC_META_CONFLICTS_PRESENT");
      if (outbox.some((row) => isMutationRecord(row) &&
        (row.status === "blocked_conflict" || row.status === "poisoned")))
        reasons.push("STUDY_DB_BLOCKED_MUTATION");
      if (outbox.some((row) => row.recordType === "writing_conflict_audit" &&
        (row.state === "cas_conflict" || row.state === "needs_review")))
        reasons.push("STUDY_DB_UNRESOLVED_WRITING_AUDIT");

      return { readyForExplicitResume: reasons.length === 0, reasons };
    } finally {
      meta.close();
    }
  } finally {
    study.close();
  }
}
