import type { BackupV2 } from "./backup-v2";
import {
  ANNULLED_ING001_032,
  CLOUD_KIND_TO_STORE,
  canonicalJson,
  payloadHashFor,
  projectForCloud,
} from "./cloud-protocol";
import type { CloudEntityKind } from "../types/cloud";

export type MergePreviewDisposition =
  | "local_only"
  | "remote_only"
  | "convergent"
  | "auto_mergeable"
  | "manual_conflict";

export type MergePreviewConflictReason =
  | "writing_conflict"
  | "integrity_conflict"
  | "remote_tombstone_conflict";

export interface MergePreviewLocalEntity {
  kind: CloudEntityKind;
  id: string;
  payload: unknown;
}

export interface MergePreviewRemoteRecord {
  kind: CloudEntityKind;
  id: string;
  revision: number;
  changeSeq: number;
  payload: unknown | null;
  payloadHash: string | null;
  deleted: boolean;
}

export interface MergePreviewItem {
  kind: CloudEntityKind;
  id: string;
  disposition: MergePreviewDisposition;
  reason?: MergePreviewConflictReason;
  localHash?: string;
  remoteHash?: string | null;
  remoteRevision?: number;
}

export interface MergePreviewIssue {
  code: "multiple_open_activities";
  activityIds: string[];
}

export interface CloudMergePreview {
  items: MergePreviewItem[];
  counts: Record<MergePreviewDisposition, number>;
  issues: MergePreviewIssue[];
}

function key(kind: CloudEntityKind, id: string) {
  return `${kind}\u0000${id}`;
}

function payloadId(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function activityIdentity(value: unknown) {
  const activity = value as Record<string, unknown>;
  return {
    id: activity.id,
    kind: activity.kind,
    contentId: activity.contentId,
    unitId: activity.unitId,
    questionIds: activity.questionIds,
    reviewIds: activity.reviewIds,
    targetId: activity.targetId,
  };
}

function sameActivityIdentity(local: unknown, remote: unknown) {
  return canonicalJson(activityIdentity(local)) === canonicalJson(activityIdentity(remote));
}

function isOpenActivity(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { completedAt?: unknown }).completedAt === null,
  );
}

export function mergePreviewEntitiesFromBackupV2(backup: BackupV2): MergePreviewLocalEntity[] {
  const entities: MergePreviewLocalEntity[] = [];
  for (const value of backup.activities)
    entities.push({ kind: "activity", id: value.id, payload: value });
  for (const value of backup.progress)
    entities.push({ kind: "progress", id: value.id, payload: value });
  for (const value of backup.reviews)
    entities.push({ kind: "review", id: value.id, payload: value });
  for (const value of backup.attempts)
    if (value.questionId !== ANNULLED_ING001_032)
      entities.push({ kind: "attempt", id: value.id, payload: value });
  for (const value of backup.writings)
    entities.push({ kind: "writing", id: value.id, payload: value });
  for (const value of backup.results)
    entities.push({ kind: "simulation_result", id: value.id, payload: value });
  return entities;
}

async function normalizeLocal(entity: MergePreviewLocalEntity) {
  const store = CLOUD_KIND_TO_STORE[entity.kind];
  const payload = projectForCloud(store, entity.payload);
  if (payloadId(payload) !== entity.id)
    throw new Error(`MERGE_PREVIEW_LOCAL_ID_MISMATCH:${entity.kind}:${entity.id}`);
  const hash = await payloadHashFor("upsert", payload);
  return { ...entity, payload, hash };
}

async function normalizeRemote(record: MergePreviewRemoteRecord) {
  if (!Number.isSafeInteger(record.revision) || record.revision < 1)
    throw new Error(`MERGE_PREVIEW_REMOTE_REVISION_INVALID:${record.kind}:${record.id}`);
  if (!Number.isSafeInteger(record.changeSeq) || record.changeSeq < 1)
    throw new Error(`MERGE_PREVIEW_REMOTE_CHANGESEQ_INVALID:${record.kind}:${record.id}`);
  if (record.deleted) {
    if (record.payload !== null || record.payloadHash !== null)
      throw new Error(`MERGE_PREVIEW_REMOTE_TOMBSTONE_INVALID:${record.kind}:${record.id}`);
    return record;
  }
  if (record.payload === null || record.payloadHash === null)
    throw new Error(`MERGE_PREVIEW_REMOTE_PAYLOAD_MISSING:${record.kind}:${record.id}`);
  if (payloadId(record.payload) !== record.id)
    throw new Error(`MERGE_PREVIEW_REMOTE_ID_MISMATCH:${record.kind}:${record.id}`);
  const computed = await payloadHashFor("upsert", record.payload);
  if (computed !== record.payloadHash)
    throw new Error(`MERGE_PREVIEW_REMOTE_HASH_MISMATCH:${record.kind}:${record.id}`);
  return record;
}

function emptyCounts(): Record<MergePreviewDisposition, number> {
  return {
    local_only: 0,
    remote_only: 0,
    convergent: 0,
    auto_mergeable: 0,
    manual_conflict: 0,
  };
}

export async function buildCloudMergePreview(
  localInput: MergePreviewLocalEntity[],
  remoteInput: MergePreviewRemoteRecord[],
): Promise<CloudMergePreview> {
  const local = await Promise.all(localInput.map(normalizeLocal));
  const remote = await Promise.all(remoteInput.map(normalizeRemote));

  const localByKey = new Map<string, (typeof local)[number]>();
  for (const entity of local) {
    const entityKey = key(entity.kind, entity.id);
    if (localByKey.has(entityKey)) throw new Error(`MERGE_PREVIEW_DUPLICATE_LOCAL:${entity.kind}:${entity.id}`);
    localByKey.set(entityKey, entity);
  }

  const remoteByKey = new Map<string, (typeof remote)[number]>();
  for (const entity of remote) {
    const entityKey = key(entity.kind, entity.id);
    if (remoteByKey.has(entityKey)) throw new Error(`MERGE_PREVIEW_DUPLICATE_REMOTE:${entity.kind}:${entity.id}`);
    remoteByKey.set(entityKey, entity);
  }

  const allKeys = [...new Set([...localByKey.keys(), ...remoteByKey.keys()])].sort();
  const items: MergePreviewItem[] = [];

  for (const entityKey of allKeys) {
    const localEntity = localByKey.get(entityKey);
    const remoteEntity = remoteByKey.get(entityKey);
    if (localEntity && !remoteEntity) {
      items.push({
        kind: localEntity.kind,
        id: localEntity.id,
        disposition: "local_only",
        localHash: localEntity.hash,
      });
      continue;
    }
    if (!localEntity && remoteEntity) {
      items.push({
        kind: remoteEntity.kind,
        id: remoteEntity.id,
        disposition: "remote_only",
        remoteHash: remoteEntity.payloadHash,
        remoteRevision: remoteEntity.revision,
      });
      continue;
    }
    if (!localEntity || !remoteEntity) throw new Error("MERGE_PREVIEW_INTERNAL_PAIRING_ERROR");

    if (remoteEntity.deleted) {
      items.push({
        kind: localEntity.kind,
        id: localEntity.id,
        disposition: "manual_conflict",
        reason: "remote_tombstone_conflict",
        localHash: localEntity.hash,
        remoteHash: null,
        remoteRevision: remoteEntity.revision,
      });
      continue;
    }

    if (localEntity.hash === remoteEntity.payloadHash) {
      items.push({
        kind: localEntity.kind,
        id: localEntity.id,
        disposition: "convergent",
        localHash: localEntity.hash,
        remoteHash: remoteEntity.payloadHash,
        remoteRevision: remoteEntity.revision,
      });
      continue;
    }

    if (
      localEntity.kind === "activity" &&
      remoteEntity.kind === "activity" &&
      sameActivityIdentity(localEntity.payload, remoteEntity.payload)
    ) {
      items.push({
        kind: localEntity.kind,
        id: localEntity.id,
        disposition: "auto_mergeable",
        localHash: localEntity.hash,
        remoteHash: remoteEntity.payloadHash,
        remoteRevision: remoteEntity.revision,
      });
      continue;
    }

    items.push({
      kind: localEntity.kind,
      id: localEntity.id,
      disposition: "manual_conflict",
      reason: localEntity.kind === "writing" ? "writing_conflict" : "integrity_conflict",
      localHash: localEntity.hash,
      remoteHash: remoteEntity.payloadHash,
      remoteRevision: remoteEntity.revision,
    });
  }

  const localOpenActivities = local
    .filter((entity) => entity.kind === "activity" && isOpenActivity(entity.payload))
    .map((entity) => entity.id);
  const remoteOpenActivities = remote
    .filter((entity) => entity.kind === "activity" && !entity.deleted && isOpenActivity(entity.payload))
    .map((entity) => entity.id);
  const distinctOpenAcrossSides = localOpenActivities.some((localId) =>
    remoteOpenActivities.some((remoteId) => remoteId !== localId),
  );
  const issues: MergePreviewIssue[] = distinctOpenAcrossSides
    ? [{
        code: "multiple_open_activities",
        activityIds: [...new Set([...localOpenActivities, ...remoteOpenActivities])].sort(),
      }]
    : [];

  const counts = emptyCounts();
  for (const item of items) counts[item.disposition] += 1;

  return { items, counts, issues };
}
