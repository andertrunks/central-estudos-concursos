import type { IDBPDatabase } from "idb";
import type {
  CloudEntityKind,
  CloudSyncStore,
  SyncCursorRecord,
  SyncOutboxEntry,
  SyncOutboxRecord,
  SyncRemoteStateRecord,
} from "../types/cloud";
import type { StudyDBV3 } from "./storage-db";
import {
  CLOUD_KIND_TO_STORE,
  isMutationRecord,
  remoteStateId,
  requestHashFor,
  validateRemotePayload,
} from "./cloud-protocol";

const CURSOR_ID = "__cloud_sync_cursor__" as const;
const CLOUD_STORES: CloudSyncStore[] = [
  "activities",
  "progress",
  "reviews",
  "attempts",
  "writings",
  "results",
];

export interface SyncScopeGuard {
  userId: string;
  scopeEpoch: number;
  isCurrent(): boolean;
}

export interface RemoteCloudRecord {
  userId: string;
  entityKind: CloudEntityKind;
  entityId: string;
  schemaVersion: 1;
  revision: number;
  changeSeq: number;
  payload: unknown | null;
  payloadHash: string | null;
  deleted: boolean;
}

export interface PullPage {
  records: RemoteCloudRecord[];
  nextCursor: number;
  hasMore: boolean;
}

export interface FrozenPushMutation {
  mutationId: string;
  entityKind: CloudEntityKind;
  entityId: string;
  operation: "upsert" | "delete";
  schemaVersion: 1;
  baseRevision: number;
  payload: unknown | null;
  payloadHash: string;
  requestHash: string;
}

export type PushOutcome = "applied" | "duplicate" | "conflict" | "integrity_conflict" | "invalid";

export interface PushResult {
  mutationId: string;
  requestHash: string;
  outcome: PushOutcome;
  originalOutcome?: "applied" | "conflict";
  revision?: number;
  changeSeq?: number;
  stateHash?: string | null;
  currentRevision?: number;
  currentPayloadHash?: string | null;
  deleted?: boolean;
}

export interface CloudSyncTransport {
  pull(input: { userId: string; after: number; limit: number }): Promise<PullPage>;
  push(input: { userId: string; mutations: FrozenPushMutation[] }): Promise<PushResult[]>;
}

function assertCurrent(guard: SyncScopeGuard) {
  if (!guard.isCurrent()) throw new Error("STALE_ACCOUNT_SCOPE");
}

export async function readPullCursor(db: IDBPDatabase<StudyDBV3>) {
  const record = await db.get("syncOutbox", CURSOR_ID);
  return record?.recordType === "cursor" ? record.cursor : 0;
}

function entityMutations(records: SyncOutboxRecord[], kind: CloudEntityKind, entityId: string) {
  return records
    .filter(isMutationRecord)
    .filter((entry) => entry.entityKind === kind && entry.entityId === entityId);
}

function headMutation(entries: SyncOutboxEntry[]) {
  return entries.find((entry) => entry.predecessorMutationId === null) ?? null;
}

function descendantOf(entries: SyncOutboxEntry[], rootId: string) {
  const descendants: SyncOutboxEntry[] = [];
  let current = rootId;
  for (;;) {
    const next = entries.find((entry) => entry.predecessorMutationId === current);
    if (!next) return descendants;
    descendants.push(next);
    current = next.mutationId;
  }
}

function isEquivalent(entry: SyncOutboxEntry, remote: RemoteCloudRecord) {
  if (entry.operation === "delete") return remote.deleted;
  return !remote.deleted && remote.payloadHash === entry.payloadHash;
}

function remoteMeta(remote: RemoteCloudRecord): SyncRemoteStateRecord {
  return {
    id: remoteStateId(remote.entityKind, remote.entityId),
    recordType: "remote",
    entityType: CLOUD_KIND_TO_STORE[remote.entityKind],
    entityKind: remote.entityKind,
    entityId: remote.entityId,
    revision: remote.revision,
    changeSeq: remote.changeSeq,
    payloadHash: remote.payloadHash,
    deleted: remote.deleted,
    payload: remote.deleted ? null : remote.payload,
  };
}

export async function applyPullPage(
  db: IDBPDatabase<StudyDBV3>,
  guard: SyncScopeGuard,
  page: PullPage,
) {
  assertCurrent(guard);
  const currentCursor = await readPullCursor(db);
  if (!Number.isSafeInteger(page.nextCursor) || page.nextCursor < currentCursor)
    throw new Error("Cursor remoto inválido");

  const prepared = page.records.map((remote) => {
    if (remote.userId !== guard.userId) throw new Error("CROSS_ACCOUNT_REMOTE_RECORD");
    if (!Number.isSafeInteger(remote.revision) || remote.revision < 1)
      throw new Error("Revisão remota inválida");
    if (!Number.isSafeInteger(remote.changeSeq) || remote.changeSeq < 1)
      throw new Error("change_seq remoto inválido");
    if (remote.deleted) {
      if (remote.payload !== null || remote.payloadHash !== null)
        throw new Error("Tombstone remoto inválido");
      return { remote, value: null };
    }
    if (!remote.payloadHash) throw new Error("Payload remoto sem hash");
    return {
      remote,
      value: validateRemotePayload(remote.entityKind, remote.payload, remote.changeSeq),
    };
  });

  const tx = db.transaction([...CLOUD_STORES, "syncOutbox"], "readwrite");
  const outbox = tx.objectStore("syncOutbox");
  try {
    for (const { remote, value } of prepared) {
      const storeName = CLOUD_KIND_TO_STORE[remote.entityKind];
      const records = await outbox.index("by-entity").getAll(remote.entityId);
      const mutations = entityMutations(records, remote.entityKind, remote.entityId);
      const head = headMutation(mutations);
      const existingMetaRaw = await outbox.get(remoteStateId(remote.entityKind, remote.entityId));
      const existingMeta = existingMetaRaw?.recordType === "remote" ? existingMetaRaw : undefined;

      if (head && remote.revision > head.baseRevision) {
        if (isEquivalent(head, remote)) {
          const successor = mutations.find((entry) => entry.predecessorMutationId === head.mutationId);
          await outbox.delete(head.id);
          if (successor) {
            successor.predecessorMutationId = null;
            successor.baseRevision = remote.revision;
            successor.basePayload = remote.deleted ? null : remote.payload;
            successor.conflict = null;
            if (successor.status !== "poisoned") successor.status = "queued";
            await outbox.put(successor);
          }
        } else {
          const blocked = [head, ...descendantOf(mutations, head.mutationId)];
          for (const entry of blocked) {
            if (entry.status === "poisoned") continue;
            entry.status = "blocked_conflict";
            entry.conflict = {
              currentRevision: remote.revision,
              currentPayloadHash: remote.payloadHash,
              deleted: remote.deleted,
            };
            await outbox.put(entry);
          }
        }
      } else if (!head) {
        const entityStore = tx.objectStore(storeName) as unknown as {
          put(value: unknown): Promise<IDBValidKey>;
          delete(key: string): Promise<void>;
        };
        if (remote.deleted) await entityStore.delete(remote.entityId);
        else await entityStore.put(value);
      }

      if (!existingMeta || remote.changeSeq >= existingMeta.changeSeq)
        await outbox.put(remoteMeta(remote));
    }

    const cursor: SyncCursorRecord = {
      id: CURSOR_ID,
      recordType: "cursor",
      cursor: page.nextCursor,
    };
    await outbox.put(cursor);
    if (!guard.isCurrent()) tx.abort();
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch { /* transaction may already be finished */ }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

async function freezeHead(
  db: IDBPDatabase<StudyDBV3>,
  entry: SyncOutboxEntry,
): Promise<SyncOutboxEntry | null> {
  if (entry.predecessorMutationId !== null) return null;
  if (entry.status === "sending") return entry;
  if (entry.status !== "queued") return null;
  const requestHash = await requestHashFor({
    mutationId: entry.mutationId,
    entityKind: entry.entityKind,
    entityId: entry.entityId,
    operation: entry.operation,
    schemaVersion: entry.schemaVersion,
    baseRevision: entry.baseRevision,
    payloadHash: entry.payloadHash,
  });
  const tx = db.transaction("syncOutbox", "readwrite");
  const store = tx.objectStore("syncOutbox");
  const live = await store.get(entry.id);
  if (!live || !isMutationRecord(live) || live.requestHash !== entry.requestHash || live.status !== "queued" || live.predecessorMutationId !== null) {
    tx.abort();
    await tx.done.catch(() => undefined);
    return null;
  }
  live.requestHash = requestHash;
  live.status = "sending";
  live.nextRetryAt = null;
  await store.put(live);
  await tx.done;
  return live;
}

export async function preparePushBatch(
  db: IDBPDatabase<StudyDBV3>,
  guard: SyncScopeGuard,
  limit = 20,
) {
  assertCurrent(guard);
  const records = await db.getAll("syncOutbox");
  const mutations = records.filter(isMutationRecord);
  const heads = mutations
    .filter((entry) => entry.predecessorMutationId === null && (entry.status === "queued" || entry.status === "sending"))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.mutationId.localeCompare(b.mutationId));
  const frozen: SyncOutboxEntry[] = [];
  for (const head of heads) {
    if (frozen.length >= limit) break;
    const item = await freezeHead(db, head);
    if (item) frozen.push(item);
  }
  assertCurrent(guard);
  return frozen.map((entry): FrozenPushMutation => ({
    mutationId: entry.mutationId,
    entityKind: entry.entityKind,
    entityId: entry.entityId,
    operation: entry.operation,
    schemaVersion: entry.schemaVersion,
    baseRevision: entry.baseRevision,
    payload: entry.operation === "delete" ? null : entry.targetPayload,
    payloadHash: entry.payloadHash,
    requestHash: entry.requestHash,
  }));
}

function effectiveOutcome(result: PushResult) {
  if (result.outcome !== "duplicate") return result.outcome;
  return result.originalOutcome ?? "applied";
}

export async function applyPushResults(
  db: IDBPDatabase<StudyDBV3>,
  guard: SyncScopeGuard,
  results: PushResult[],
) {
  assertCurrent(guard);
  const tx = db.transaction("syncOutbox", "readwrite");
  const store = tx.objectStore("syncOutbox");
  try {
    const all = (await store.getAll()).filter(isMutationRecord);
    for (const result of results) {
      const entryRaw = await store.get(result.mutationId);
      if (!entryRaw || !isMutationRecord(entryRaw)) continue;
      if (entryRaw.requestHash !== result.requestHash) continue;
      const outcome = effectiveOutcome(result);
      if (outcome === "applied") {
        if (!result.revision || !result.changeSeq)
          throw new Error("ACK aplicado sem revisão/change_seq");
        await store.delete(entryRaw.id);
        const auditRecord = await store.get("__writing_conflict_audit__:" + entryRaw.mutationId);
        if (auditRecord?.recordType === "writing_conflict_audit") {
          auditRecord.state = "cas_applied";
          await store.put(auditRecord);
        }
        const remote: SyncRemoteStateRecord = {
          id: remoteStateId(entryRaw.entityKind, entryRaw.entityId),
          recordType: "remote",
          entityType: entryRaw.entityType,
          entityKind: entryRaw.entityKind,
          entityId: entryRaw.entityId,
          revision: result.revision,
          changeSeq: result.changeSeq,
          payloadHash: entryRaw.operation === "delete" ? null : entryRaw.payloadHash,
          deleted: entryRaw.operation === "delete",
          payload: entryRaw.operation === "delete" ? null : entryRaw.targetPayload,
        };
        await store.put(remote);
        const successor = all.find((candidate) => candidate.predecessorMutationId === entryRaw.mutationId);
        if (successor) {
          successor.predecessorMutationId = null;
          successor.baseRevision = result.revision;
          successor.basePayload = entryRaw.operation === "delete" ? null : entryRaw.targetPayload;
          successor.conflict = null;
          if (successor.status !== "poisoned") successor.status = "queued";
          await store.put(successor);
        }
      } else if (outcome === "conflict") {
        const conflict = {
          currentRevision: result.currentRevision ?? entryRaw.baseRevision,
          currentPayloadHash: result.currentPayloadHash ?? null,
          deleted: result.deleted ?? false,
        };
        for (const blocked of [entryRaw, ...descendantOf(all, entryRaw.mutationId)]) {
          if (blocked.status === "poisoned") continue;
          blocked.status = "blocked_conflict";
          blocked.conflict = conflict;
          await store.put(blocked);
        }
        const auditRecord = await store.get("__writing_conflict_audit__:" + entryRaw.mutationId);
        if (auditRecord?.recordType === "writing_conflict_audit") {
          auditRecord.state = "cas_conflict";
          await store.put(auditRecord);
        }
      } else {
        entryRaw.status = "poisoned";
        entryRaw.conflict = null;
        await store.put(entryRaw);
        const auditRecord = await store.get("__writing_conflict_audit__:" + entryRaw.mutationId);
        if (auditRecord?.recordType === "writing_conflict_audit") {
          auditRecord.state = "needs_review";
          await store.put(auditRecord);
        }
      }
    }
    if (!guard.isCurrent()) tx.abort();
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch { /* already complete */ }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

export async function pullUntilCaughtUp(
  db: IDBPDatabase<StudyDBV3>,
  guard: SyncScopeGuard,
  transport: CloudSyncTransport,
  pageSize = 100,
) {
  for (let pageNumber = 0; pageNumber < 1000; pageNumber++) {
    assertCurrent(guard);
    const after = await readPullCursor(db);
    const page = await transport.pull({ userId: guard.userId, after, limit: pageSize });
    assertCurrent(guard);
    await applyPullPage(db, guard, page);
    if (!page.hasMore || page.records.length === 0) return;
    if (page.nextCursor <= after) throw new Error("Pull remoto não avançou o cursor");
  }
  throw new Error("Limite de paginação de pull excedido");
}

export async function pushEligible(
  db: IDBPDatabase<StudyDBV3>,
  guard: SyncScopeGuard,
  transport: CloudSyncTransport,
) {
  for (let batchNumber = 0; batchNumber < 1000; batchNumber++) {
    const mutations = await preparePushBatch(db, guard);
    if (mutations.length === 0) return;
    const results = await transport.push({ userId: guard.userId, mutations });
    assertCurrent(guard);
    await applyPushResults(db, guard, results);
    if (results.length === 0) throw new Error("Writer retornou lote vazio para push não vazio");
  }
  throw new Error("Limite de lotes de push excedido");
}

export async function runSyncCycle(
  db: IDBPDatabase<StudyDBV3>,
  guard: SyncScopeGuard,
  transport: CloudSyncTransport,
) {
  await pullUntilCaughtUp(db, guard, transport);
  await pushEligible(db, guard, transport);
  await pullUntilCaughtUp(db, guard, transport);
}
