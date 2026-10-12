import {
  attemptSchema,
  progressSchema,
  resultSchema,
  reviewSchema,
  writingSchema,
} from "../types/schema";
import type {
  CloudEntityKind,
  CloudOperation,
  CloudSyncStore,
  SyncOutboxEntry,
} from "../types/cloud";
import { activitySchema } from "./trail";

export const ANNULLED_ING001_032 = "QREF-QUAD-ING001-032";

export const CLOUD_STORE_TO_KIND = {
  activities: "activity",
  progress: "progress",
  reviews: "review",
  attempts: "attempt",
  writings: "writing",
  results: "simulation_result",
} as const satisfies Record<CloudSyncStore, CloudEntityKind>;

export const CLOUD_KIND_TO_STORE = {
  activity: "activities",
  progress: "progress",
  review: "reviews",
  attempt: "attempts",
  writing: "writings",
  simulation_result: "results",
} as const satisfies Record<CloudEntityKind, CloudSyncStore>;

const activityCloudSchema = activitySchema.omit({ sequence: true });
const attemptCloudSchema = attemptSchema.extend({ submissionId: attemptSchema.shape.id.optional() });

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Número não finito não pode ser sincronizado");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  throw new Error(`Tipo não serializável no protocolo cloud: ${typeof value}`);
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  return `sha256:${hex(await crypto.subtle.digest("SHA-256", encoded))}`;
}

export async function payloadHashFor(operation: CloudOperation, payload: unknown | null) {
  return sha256(canonicalJson(operation === "delete" ? null : payload));
}

export async function requestHashFor(input: {
  mutationId: string;
  entityKind: CloudEntityKind;
  entityId: string;
  operation: CloudOperation;
  schemaVersion: 1;
  baseRevision: number;
  payloadHash: string;
}) {
  return sha256(canonicalJson({
    baseRevision: input.baseRevision,
    entityId: input.entityId,
    entityKind: input.entityKind,
    mutationId: input.mutationId,
    operation: input.operation,
    payloadHash: input.payloadHash,
    schemaVersion: input.schemaVersion,
  }));
}

export function projectForCloud(store: CloudSyncStore, value: unknown): unknown {
  switch (store) {
    case "activities": return activityCloudSchema.parse(activitySchema.parse(value));
    case "progress": return progressSchema.parse(value);
    case "reviews": return reviewSchema.parse(value);
    case "attempts": {
      const parsed = attemptCloudSchema.parse(value);
      if (parsed.questionId === ANNULLED_ING001_032)
        throw new Error("Questão anulada não pode gerar Attempt/outbox");
      return parsed;
    }
    case "writings": return writingSchema.parse(value);
    case "results": return resultSchema.parse(value);
  }
}

export function validateRemotePayload(
  kind: CloudEntityKind,
  payload: unknown,
  sequence: number,
): unknown {
  switch (kind) {
    case "activity": return activitySchema.parse({ ...activityCloudSchema.parse(payload), sequence });
    case "progress": return progressSchema.parse(payload);
    case "review": return reviewSchema.parse(payload);
    case "attempt": {
      const parsed = attemptCloudSchema.parse(payload);
      if (parsed.questionId === ANNULLED_ING001_032)
        throw new Error("Questão anulada recusada no estado remoto");
      return parsed;
    }
    case "writing": return writingSchema.parse(payload);
    case "simulation_result": return resultSchema.parse(payload);
  }
}

export function isMutationRecord(value: unknown): value is SyncOutboxEntry {
  return Boolean(value && typeof value === "object" && (value as { recordType?: string }).recordType === "mutation");
}

export function remoteStateId(kind: CloudEntityKind, entityId: string) {
  return `__cloud_remote__:${kind}:${entityId}`;
}

export function sameEntity(a: Pick<SyncOutboxEntry, "entityKind" | "entityId">, kind: CloudEntityKind, entityId: string) {
  return a.entityKind === kind && a.entityId === entityId;
}
