import type { SyncOutboxEntry } from "../types/cloud";
import type { Writing } from "../types/schema";
import {
  payloadHashFor,
  projectForCloud,
  requestHashFor,
} from "./cloud-protocol";

export type WritingConflictChoice = "local" | "remote" | "merged";

function identity(value: Writing) {
  return {
    id: value.id,
    theme: value.theme,
    contentIds: value.contentIds,
    contestId: value.contestId,
  };
}

function sameIdentity(left: Writing, right: Writing) {
  return JSON.stringify(identity(left)) === JSON.stringify(identity(right));
}

export async function planWritingConflictResolution(input: {
  entityId: string;
  remoteRevision: number;
  localPayload: Writing;
  remotePayload: Writing;
  choice: WritingConflictChoice;
  mergedPayload?: Writing;
  blockedMutationIds?: string[];
  mutationId?: string;
  now?: string;
}): Promise<SyncOutboxEntry> {
  if (!Number.isSafeInteger(input.remoteRevision) || input.remoteRevision < 1)
    throw new Error("WRITING_RESOLUTION_REMOTE_REVISION_INVALID");

  const local = projectForCloud("writings", input.localPayload) as Writing;
  const remote = projectForCloud("writings", input.remotePayload) as Writing;
  if (local.id !== input.entityId || remote.id !== input.entityId)
    throw new Error("WRITING_RESOLUTION_ID_MISMATCH");
  if (!sameIdentity(local, remote))
    throw new Error("WRITING_RESOLUTION_INTEGRITY_CONFLICT");

  let target: Writing;
  if (input.choice === "local") target = local;
  else if (input.choice === "remote") target = remote;
  else {
    if (!input.mergedPayload) throw new Error("WRITING_RESOLUTION_MERGED_PAYLOAD_REQUIRED");
    target = projectForCloud("writings", input.mergedPayload) as Writing;
    if (target.id !== input.entityId || !sameIdentity(local, target))
      throw new Error("WRITING_RESOLUTION_MERGED_IDENTITY_MISMATCH");
  }

  const mutationId = input.mutationId ?? crypto.randomUUID();
  if (!mutationId.trim()) throw new Error("WRITING_RESOLUTION_MUTATION_ID_REQUIRED");
  if (input.blockedMutationIds?.includes(mutationId))
    throw new Error("WRITING_RESOLUTION_REQUIRES_NEW_MUTATION_ID");

  const payloadHash = await payloadHashFor("upsert", target);
  const requestHash = await requestHashFor({
    mutationId,
    entityKind: "writing",
    entityId: input.entityId,
    operation: "upsert",
    schemaVersion: 1,
    baseRevision: input.remoteRevision,
    payloadHash,
  });

  return {
    id: mutationId,
    recordType: "mutation",
    mutationId,
    entityType: "writings",
    entityKind: "writing",
    entityId: input.entityId,
    operation: "upsert",
    schemaVersion: 1,
    baseRevision: input.remoteRevision,
    basePayload: remote,
    targetPayload: target,
    payloadHash,
    requestHash,
    predecessorMutationId: null,
    createdAt: input.now ?? new Date().toISOString(),
    status: "queued",
    retryCount: 0,
    nextRetryAt: null,
    conflict: null,
  };
}
