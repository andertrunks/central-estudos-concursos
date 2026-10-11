import { deleteDB, openDB, type DBSchema } from "idb";
import type {
  AccountScope,
  ConflictRecord,
  LeaseRecord,
  RemoteBaseRecord,
  RevisionRecord,
} from "../types/cloud";

interface SyncMetaDB extends DBSchema {
  remoteBase: { key: string; value: RemoteBaseRecord };
  revisions: { key: string; value: RevisionRecord };
  conflicts: { key: string; value: ConflictRecord };
  leases: { key: string; value: LeaseRecord };
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
  return openDB<SyncMetaDB>(name, 1, {
    upgrade(db) {
      db.createObjectStore("remoteBase", { keyPath: "id" });
      db.createObjectStore("revisions", { keyPath: "id" });
      db.createObjectStore("conflicts", { keyPath: "id" });
      db.createObjectStore("leases", { keyPath: "id" });
    },
  });
}

export async function deleteSyncMetaDatabase(
  scope: AccountScope,
  options: { dbName?: string } = {},
) {
  await deleteDB(resolveName(scope, options.dbName));
}
