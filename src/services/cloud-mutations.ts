import type { IDBPDatabase } from "idb";
import type {
  CloudOperation,
  CloudSyncStore,
  SyncOutboxEntry,
  SyncOutboxRecord,
  SyncRemoteStateRecord,
} from "../types/cloud";
import type { StudyDBV3 } from "./storage-db";
import {
  CLOUD_STORE_TO_KIND,
  isMutationRecord,
  payloadHashFor,
  projectForCloud,
  remoteStateId,
  requestHashFor,
  sameEntity,
} from "./cloud-protocol";

function mutationsFor(records: SyncOutboxRecord[], store: CloudSyncStore, entityId: string) {
  const kind = CLOUD_STORE_TO_KIND[store];
  return records
    .filter(isMutationRecord)
    .filter((entry) => sameEntity(entry, kind, entityId));
}

function chainTail(entries: SyncOutboxEntry[]) {
  return entries.find((candidate) =>
    !entries.some((entry) => entry.predecessorMutationId === candidate.mutationId),
  ) ?? null;
}

function fingerprint(entries: SyncOutboxEntry[], remote: SyncRemoteStateRecord | undefined) {
  return JSON.stringify({
    remote: remote ? [remote.revision, remote.changeSeq, remote.payloadHash, remote.deleted] : null,
    entries: [...entries]
      .sort((a, b) => a.mutationId.localeCompare(b.mutationId))
      .map((entry) => [entry.mutationId, entry.requestHash, entry.status, entry.predecessorMutationId]),
  });
}

async function readSnapshot(
  db: IDBPDatabase<StudyDBV3>,
  store: CloudSyncStore,
  entityId: string,
) {
  const records = await db.getAllFromIndex("syncOutbox", "by-entity", entityId);
  const remote = await db.get("syncOutbox", remoteStateId(CLOUD_STORE_TO_KIND[store], entityId));
  return {
    mutations: mutationsFor(records, store, entityId),
    remote: remote?.recordType === "remote" ? remote : undefined,
  };
}

export async function mutateCloudEntity(
  db: IDBPDatabase<StudyDBV3>,
  input: {
    store: CloudSyncStore;
    entityId: string;
    operation: CloudOperation;
    value?: unknown;
    now?: string;
  },
): Promise<SyncOutboxEntry> {
  const targetPayload = input.operation === "delete"
    ? null
    : projectForCloud(input.store, input.value);
  const entityKind = CLOUD_STORE_TO_KIND[input.store];
  const payloadHash = await payloadHashFor(input.operation, targetPayload);
  const now = input.now ?? new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const snapshot = await readSnapshot(db, input.store, input.entityId);
    const tail = chainTail(snapshot.mutations);
    const mutationId = tail?.status === "queued" ? tail.mutationId : crypto.randomUUID();
    const baseRevision = tail?.baseRevision ?? snapshot.remote?.revision ?? 0;
    const predecessorMutationId = tail?.status === "queued" ? tail.predecessorMutationId : tail?.mutationId ?? null;
    const requestHash = await requestHashFor({
      mutationId,
      entityKind,
      entityId: input.entityId,
      operation: input.operation,
      schemaVersion: 1,
      baseRevision,
      payloadHash,
    });
    const previousRaw = await db.get(input.store, input.entityId);
    const basePayload = tail?.status === "queued"
      ? tail.basePayload
      : previousRaw === undefined
        ? snapshot.remote?.payload ?? null
        : projectForCloud(input.store, previousRaw);
    const entry: SyncOutboxEntry = {
      id: mutationId,
      recordType: "mutation",
      mutationId,
      entityType: input.store,
      entityKind,
      entityId: input.entityId,
      operation: input.operation,
      schemaVersion: 1,
      baseRevision,
      basePayload,
      targetPayload,
      payloadHash,
      requestHash,
      predecessorMutationId,
      createdAt: tail?.status === "queued" ? tail.createdAt : now,
      status: "queued",
      retryCount: tail?.status === "queued" ? tail.retryCount : 0,
      nextRetryAt: null,
      conflict: null,
    };

    const tx = db.transaction([input.store, "syncOutbox"], "readwrite");
    const outboxStore = tx.objectStore("syncOutbox");
    const liveRecords = await outboxStore.index("by-entity").getAll(input.entityId);
    const liveRemoteRaw = await outboxStore.get(remoteStateId(entityKind, input.entityId));
    const liveRemote = liveRemoteRaw?.recordType === "remote" ? liveRemoteRaw : undefined;
    const liveMutations = mutationsFor(liveRecords, input.store, input.entityId);
    if (fingerprint(snapshot.mutations, snapshot.remote) !== fingerprint(liveMutations, liveRemote)) {
      tx.abort();
      await tx.done.catch(() => undefined);
      continue;
    }

    const entityStore = tx.objectStore(input.store) as unknown as {
      put(value: unknown): Promise<IDBValidKey>;
      delete(key: string): Promise<void>;
    };
    if (input.operation === "delete") await entityStore.delete(input.entityId);
    else await entityStore.put(input.value);

    if (tail?.status === "queued") await outboxStore.put(entry);
    else await outboxStore.add(entry);
    await tx.done;
    return entry;
  }

  throw new Error("Concorrência local impediu criar a mutação com segurança");
}

export async function putCloudEntity(
  db: IDBPDatabase<StudyDBV3>,
  store: CloudSyncStore,
  entityId: string,
  value: unknown,
  now?: string,
) {
  return mutateCloudEntity(db, { store, entityId, operation: "upsert", value, now });
}

export async function deleteCloudEntity(
  db: IDBPDatabase<StudyDBV3>,
  store: CloudSyncStore,
  entityId: string,
  now?: string,
) {
  return mutateCloudEntity(db, { store, entityId, operation: "delete", now });
}
