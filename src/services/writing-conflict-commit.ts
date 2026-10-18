import type { IDBPDatabase } from "idb";
import type { Writing } from "../types/schema";
import type {
  SyncOutboxEntry,
  SyncRemoteStateRecord,
  WritingConflictResolutionAuditRecord,
} from "../types/cloud";
import type { StudyDBV3 } from "./storage-db";
import {
  canonicalJson,
  isMutationRecord,
  payloadHashFor,
  projectForCloud,
  remoteStateId,
} from "./cloud-protocol";
import {
  planWritingConflictResolution,
  type WritingConflictChoice,
} from "./writing-conflict-resolution";

/**
 * Local, fail-closed PR-6 transaction. This does not run CAS, make a network
 * request or declare a conflict resolved. The caller must present a snapshot
 * previously shown for explicit user choice.
 */
export interface CommitWritingConflictInput {
  entityId: string;
  expectedLocal: Writing;
  remotePayload: Writing;
  remoteRevision: number;
  remoteChangeSeq: number;
  remotePayloadHash: string;
  blockedMutationIds: string[];
  choice: WritingConflictChoice;
  mergedPayload?: Writing;
  mutationId?: string;
  now?: string;
}

export interface ResolutionScopeGuard {
  isCurrent(): boolean;
}

function fail(code: string): never {
  throw new Error(code);
}

function validateBlockedChain(entries: SyncOutboxEntry[], expectedIds: string[]) {
  if (entries.length === 0 || entries.length !== expectedIds.length)
    fail("WRITING_RESOLUTION_BLOCKED_CHAIN_CHANGED");

  const actualIds = entries.map((item) => item.mutationId).sort();
  const suppliedIds = [...expectedIds].sort();
  if (
    new Set(actualIds).size !== actualIds.length ||
    new Set(suppliedIds).size !== suppliedIds.length ||
    canonicalJson(actualIds) !== canonicalJson(suppliedIds) ||
    entries.some((item) => item.status !== "blocked_conflict" || item.operation !== "upsert")
  ) fail("WRITING_RESOLUTION_BLOCKED_CHAIN_CHANGED");

  const heads = entries.filter((item) => item.predecessorMutationId === null);
  if (heads.length !== 1) fail("WRITING_RESOLUTION_MULTIPLE_HEADS");

  const visited = new Set<string>();
  let current: SyncOutboxEntry | undefined = heads[0];
  while (current) {
    if (visited.has(current.mutationId)) fail("WRITING_RESOLUTION_CHAIN_CYCLE");
    visited.add(current.mutationId);
    const children = entries.filter((item) => item.predecessorMutationId === current?.mutationId);
    if (children.length > 1) fail("WRITING_RESOLUTION_CHAIN_FORK");
    current = children[0];
  }
  if (visited.size !== entries.length) fail("WRITING_RESOLUTION_CHAIN_DISCONNECTED");
}

export async function commitWritingConflictResolution(
  db: IDBPDatabase<StudyDBV3>,
  guard: ResolutionScopeGuard,
  input: CommitWritingConflictInput,
): Promise<{ entry: SyncOutboxEntry; auditId: string }> {
  if (!guard.isCurrent()) fail("STALE_ACCOUNT_SCOPE");
  if (!Number.isSafeInteger(input.remoteChangeSeq) || input.remoteChangeSeq < 1)
    fail("WRITING_RESOLUTION_CHANGE_SEQ_INVALID");

  // Hashing is deliberately outside the IndexedDB transaction.
  const projectedRemote = projectForCloud("writings", input.remotePayload);
  const expectedHash = await payloadHashFor("upsert", projectedRemote);
  if (expectedHash !== input.remotePayloadHash)
    fail("WRITING_RESOLUTION_REMOTE_HASH_MISMATCH");

  const entry = await planWritingConflictResolution({
    entityId: input.entityId,
    remoteRevision: input.remoteRevision,
    localPayload: input.expectedLocal,
    remotePayload: input.remotePayload,
    choice: input.choice,
    mergedPayload: input.mergedPayload,
    blockedMutationIds: input.blockedMutationIds,
    mutationId: input.mutationId,
    now: input.now,
  });
  const chosen = projectForCloud("writings", entry.targetPayload) as Writing;
  const expectedLocal = projectForCloud("writings", input.expectedLocal);
  const auditId = "__writing_conflict_audit__:" + entry.mutationId;
  if (!guard.isCurrent()) fail("STALE_ACCOUNT_SCOPE");

  const tx = db.transaction(["writings", "syncOutbox"], "readwrite");
  const writings = tx.objectStore("writings");
  const outbox = tx.objectStore("syncOutbox");
  try {
    const liveLocal = await writings.get(input.entityId);
    const liveRecords = await outbox.index("by-entity").getAll(input.entityId);
    const metaRaw = await outbox.get(remoteStateId("writing", input.entityId));
    const existingEntry = await outbox.get(entry.mutationId);
    const existingAudit = await outbox.get(auditId);
    const liveBlocked = liveRecords.filter(isMutationRecord).filter(
      (item) => item.entityKind === "writing" && item.entityId === input.entityId,
    );

    if (!guard.isCurrent()) fail("STALE_ACCOUNT_SCOPE");
    if (liveLocal === undefined ||
        canonicalJson(projectForCloud("writings", liveLocal)) !== canonicalJson(expectedLocal))
      fail("WRITING_RESOLUTION_LOCAL_CHANGED");
    if (existingEntry || existingAudit) fail("WRITING_RESOLUTION_MUTATION_ID_COLLISION");
    if (!metaRaw || metaRaw.recordType !== "remote")
      fail("WRITING_RESOLUTION_REMOTE_STATE_MISSING");

    const meta: SyncRemoteStateRecord = metaRaw;
    if (
      meta.deleted ||
      meta.revision !== input.remoteRevision ||
      meta.changeSeq !== input.remoteChangeSeq ||
      meta.payloadHash !== expectedHash ||
      meta.payload === null ||
      canonicalJson(projectForCloud("writings", meta.payload)) !== canonicalJson(projectedRemote)
    ) fail("WRITING_RESOLUTION_REMOTE_CHANGED");

    validateBlockedChain(liveBlocked, input.blockedMutationIds);

    const audit: WritingConflictResolutionAuditRecord = {
      id: auditId,
      recordType: "writing_conflict_audit",
      entityKind: "writing",
      entityId: input.entityId,
      resolutionMutationId: entry.mutationId,
      state: "awaiting_cas",
      choice: input.choice,
      createdAt: entry.createdAt,
      previousLocal: liveLocal as Writing,
      previousRemoteRevision: meta.revision,
      supersededMutations: liveBlocked,
    };

    // Exactly one active head after commit. Old intent survives in durable
    // local audit, but is no longer eligible for any push or pull-head choice.
    for (const blocked of liveBlocked) await outbox.delete(blocked.id);
    await outbox.add(audit);
    await outbox.add(entry);
    await writings.put(chosen);

    if (!guard.isCurrent()) fail("STALE_ACCOUNT_SCOPE");
    await tx.done;
    return { entry, auditId };
  } catch (error) {
    try { tx.abort(); } catch { /* already aborted or complete */ }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
