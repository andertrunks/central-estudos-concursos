import type { CloudEntityKind } from "../types/cloud";
import { ANNULLED_ING001_032, canonicalJson, sha256 } from "./cloud-protocol";

export type PreviewDisposition =
  | "only_local"
  | "only_cloud"
  | "convergent"
  | "automergeable"
  | "requires_choice";

export type PreviewConflictReason =
  | "writing_conflict"
  | "integrity_conflict"
  | "manual_conflict"
  | null;

export interface ReconcileSnapshot {
  entityKind: CloudEntityKind;
  entityId: string;
  payload: unknown | null;
  deleted?: boolean;
  revision?: number;
}

export interface ReconcilePreviewItem {
  key: string;
  entityKind: CloudEntityKind;
  entityId: string;
  disposition: PreviewDisposition;
  reason: PreviewConflictReason;
}

export interface ReconcilePreviewWarning {
  type: "multiple_open_activities";
  entityIds: string[];
}

export interface ReconcilePreview {
  counts: Record<PreviewDisposition, number>;
  items: ReconcilePreviewItem[];
  warnings: ReconcilePreviewWarning[];
  fingerprint: string;
}

function keyOf(value: Pick<ReconcileSnapshot, "entityKind" | "entityId">) {
  return `${value.entityKind}:${value.entityId}`;
}

function stateOf(value: ReconcileSnapshot | undefined) {
  if (!value) return "missing";
  if (value.deleted) return "deleted";
  return canonicalJson(value.payload);
}

function sameState(left: ReconcileSnapshot | undefined, right: ReconcileSnapshot | undefined) {
  return stateOf(left) === stateOf(right);
}

function isAnnulledAttempt(value: ReconcileSnapshot | undefined) {
  if (!value || value.entityKind !== "attempt" || value.deleted || !value.payload || typeof value.payload !== "object")
    return false;
  return (value.payload as { questionId?: unknown }).questionId === ANNULLED_ING001_032;
}

function classify(
  local: ReconcileSnapshot | undefined,
  remote: ReconcileSnapshot | undefined,
  base: ReconcileSnapshot | undefined,
): Pick<ReconcilePreviewItem, "disposition" | "reason"> {
  if (local && !remote) return { disposition: "only_local", reason: null };
  if (!local && remote) return { disposition: "only_cloud", reason: null };
  if (!local || !remote) throw new Error("Preview inconsistente");
  if (sameState(local, remote)) return { disposition: "convergent", reason: null };

  if (base) {
    const localChanged = !sameState(local, base);
    const remoteChanged = !sameState(remote, base);
    if (localChanged !== remoteChanged)
      return { disposition: "automergeable", reason: null };
    if (!localChanged && !remoteChanged)
      return { disposition: "convergent", reason: null };
  }

  if (local.entityKind === "writing")
    return { disposition: "requires_choice", reason: "writing_conflict" };

  if (local.entityKind === "attempt" || local.entityKind === "activity")
    return { disposition: "requires_choice", reason: "integrity_conflict" };

  return { disposition: "requires_choice", reason: "manual_conflict" };
}

function openActivityIds(values: ReconcileSnapshot[]) {
  const ids = new Set<string>();
  for (const value of values) {
    if (value.entityKind !== "activity" || value.deleted || !value.payload || typeof value.payload !== "object") continue;
    const completedAt = (value.payload as { completedAt?: unknown }).completedAt;
    if (completedAt == null) ids.add(value.entityId);
  }
  return [...ids].sort();
}

export async function buildReconcilePreview(input: {
  local: ReconcileSnapshot[];
  remote: ReconcileSnapshot[];
  base?: ReconcileSnapshot[];
}): Promise<ReconcilePreview> {
  const all = [...input.local, ...input.remote, ...(input.base ?? [])];
  if (all.some(isAnnulledAttempt))
    throw new Error("Questão anulada não pode participar de preview/sync");

  const local = new Map(input.local.map((value) => [keyOf(value), value]));
  const remote = new Map(input.remote.map((value) => [keyOf(value), value]));
  const base = new Map((input.base ?? []).map((value) => [keyOf(value), value]));
  const keys = [...new Set([...local.keys(), ...remote.keys()])].sort();

  const counts: Record<PreviewDisposition, number> = {
    only_local: 0,
    only_cloud: 0,
    convergent: 0,
    automergeable: 0,
    requires_choice: 0,
  };

  const items = keys.map((key) => {
    const localValue = local.get(key);
    const remoteValue = remote.get(key);
    const sample = localValue ?? remoteValue;
    if (!sample) throw new Error("Preview inconsistente");
    const result = classify(localValue, remoteValue, base.get(key));
    counts[result.disposition] += 1;
    return {
      key,
      entityKind: sample.entityKind,
      entityId: sample.entityId,
      disposition: result.disposition,
      reason: result.reason,
    } satisfies ReconcilePreviewItem;
  });

  const activityIds = openActivityIds([...input.local, ...input.remote]);
  const warnings: ReconcilePreviewWarning[] = activityIds.length > 1
    ? [{ type: "multiple_open_activities", entityIds: activityIds }]
    : [];

  const fingerprint = await sha256(canonicalJson({ counts, items, warnings }));
  return { counts, items, warnings, fingerprint };
}
