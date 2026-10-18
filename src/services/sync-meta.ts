import { deleteDB, openDB, type DBSchema } from "idb";
import type {
  AccountScope,
  ConflictRecord,
  LeaseRecord,
  RemoteBaseRecord,
  RevisionRecord,
} from "../types/cloud";

export type CloudAdoptionChoice = "local_only" | "copy_legacy" | "empty_account";

export interface CloudAdoptionSettings {
  id: "adoption";
  choice: CloudAdoptionChoice;
  adopted: true;
  syncEnabled: boolean;
  decidedAt: string;
  sourceFingerprint?: string;
  reconcileRequired?: boolean;
  syncPreferenceUpdatedAt?: string;
}

interface SyncMetaDB extends DBSchema {
  remoteBase: { key: string; value: RemoteBaseRecord };
  revisions: { key: string; value: RevisionRecord };
  conflicts: { key: string; value: ConflictRecord };
  leases: { key: string; value: LeaseRecord };
  settings: { key: string; value: CloudAdoptionSettings };
}

function resolveName(scope: AccountScope, override?: string) {
  if (scope.mode !== "account")
    throw new Error("Metadados de sync exigem escopo de conta");
  return override ?? scope.syncMetaDbName;
}

export function openSyncMetaDatabase(
  scope: AccountScope,
  options: { dbName?: string } = {},
) {
  const name = resolveName(scope, options.dbName);
  return openDB<SyncMetaDB>(name, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("remoteBase", { keyPath: "id" });
        db.createObjectStore("revisions", { keyPath: "id" });
        db.createObjectStore("conflicts", { keyPath: "id" });
        db.createObjectStore("leases", { keyPath: "id" });
      }
      if (oldVersion < 2) db.createObjectStore("settings", { keyPath: "id" });
    },
  });
}

export async function readCloudAdoptionSettings(scope: AccountScope) {
  if (scope.mode !== "account") return null;
  const db = await openSyncMetaDatabase(scope);
  try {
    return (await db.get("settings", "adoption")) ?? null;
  } finally {
    db.close();
  }
}

export async function writeCloudAdoptionSettings(
  scope: AccountScope,
  value: CloudAdoptionSettings,
) {
  if (scope.mode !== "account") throw new Error("Adoção exige escopo de conta");
  const db = await openSyncMetaDatabase(scope);
  try {
    await db.put("settings", value);
  } finally {
    db.close();
  }
}

/** A stable adoption choice stamp, used only for comparing two local reads. */
export function adoptionChoiceStamp(value: CloudAdoptionSettings | null) {
  return value ? JSON.stringify([
    value.choice, value.decidedAt, value.sourceFingerprint ?? null,
    value.syncEnabled, value.syncPreferenceUpdatedAt ?? null,
  ]) : null;
}

export interface LocalPreferenceGuard {
  isCurrent(): boolean;
}

export async function updateCloudSyncPreference(
  scope: AccountScope,
  enabled: boolean,
  updatedAt = new Date().toISOString(),
  options: { guard?: LocalPreferenceGuard; expectedChoiceStamp?: string | null } = {},
) {
  if (scope.mode !== "account") throw new Error("Preferência de sync exige escopo de conta");
  const assertScope = () => {
    if (options.guard && !options.guard.isCurrent())
      throw new Error("STALE_ACCOUNT_SCOPE");
  };
  assertScope();
  const db = await openSyncMetaDatabase(scope);
  try {
    assertScope();
    // Atomic only WITHIN SyncMetaDB. StudyDB is independent and always
    // requires the separate read-only consistency preflight before resume.
    const tx = db.transaction(["settings", "conflicts"], "readwrite");
    try {
      const current = await tx.objectStore("settings").get("adoption");
      const conflicts = enabled ? await tx.objectStore("conflicts").count() : 0;
      assertScope();
      if (!current) throw new Error("Escolha a adoção local antes de configurar sincronização");
      if (enabled && current.choice === "local_only")
        throw new Error("Copie ou inicie o espaço isolado da conta antes de reativar a sincronização");
      if (options.expectedChoiceStamp !== undefined &&
          adoptionChoiceStamp(current) !== options.expectedChoiceStamp)
        throw new Error("CLOUD_ADOPTION_CHANGED_AFTER_PREFLIGHT");
      if (conflicts > 0) throw new Error("SYNC_META_CONFLICTS_PRESENT");
      const next: CloudAdoptionSettings = {
        ...current,
        syncEnabled: enabled,
        reconcileRequired: enabled ? true : (current.reconcileRequired ?? true),
        syncPreferenceUpdatedAt: updatedAt,
      };
      assertScope();
      await tx.objectStore("settings").put(next);
      assertScope();
      await tx.done;
      return next;
    } catch (error) {
      try { tx.abort(); } catch { /* already completed/aborted */ }
      await tx.done.catch(() => undefined);
      throw error;
    }
  } finally {
    db.close();
  }
}

export async function deleteSyncMetaDatabase(
  scope: AccountScope,
  options: { dbName?: string } = {},
) {
  await deleteDB(resolveName(scope, options.dbName));
}
