import { localAccountScope } from "./account-scope";
import { applyBootstrapPlan, previewLegacyBootstrap, readLegacyBackup } from "./bootstrap-migration";
import { openScopedStudyDatabase } from "./storage-db";
import {
  readCloudAdoptionSettings,
  writeCloudAdoptionSettings,
  type CloudAdoptionSettings,
} from "./sync-meta";
import type { AccountScope } from "../types/cloud";

const STUDY_STORES = [
  "activities",
  "progress",
  "reviews",
  "attempts",
  "writings",
  "results",
  "submissions",
  "simulationSubmissions",
  "revealedCorrections",
  "syncOutbox",
] as const;

export interface LegacySummary {
  counts: {
    activities: number;
    progress: number;
    reviews: number;
    attempts: number;
    writings: number;
    results: number;
  };
  latestActivityDate: string | null;
  approximateBytes: number;
}

function latestDate(input: unknown): string | null {
  const values: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
      if (
        typeof field === "string" &&
        /(?:date|at|access|review)$/i.test(key) &&
        /^\d{4}-\d{2}-\d{2}/.test(field)
      )
        values.push(field);
    }
  };
  if (Array.isArray(input)) input.forEach(visit);
  else visit(input);
  return values.sort().at(-1) ?? null;
}

export function activeStudyScopeForAdoption(
  candidate: AccountScope | null,
  adoption: CloudAdoptionSettings | null,
): AccountScope {
  if (
    candidate?.mode === "account" &&
    adoption &&
    adoption.choice !== "local_only"
  ) return candidate;
  return localAccountScope();
}

export async function summarizeLegacyProgress(dbName = "central-estudos"): Promise<LegacySummary> {
  const backup = await readLegacyBackup(dbName);
  const all = [
    ...(backup.activities ?? []),
    ...backup.progress,
    ...backup.reviews,
    ...backup.attempts,
    ...backup.writings,
    ...backup.results,
  ];
  return {
    counts: {
      activities: backup.activities?.length ?? 0,
      progress: backup.progress.length,
      reviews: backup.reviews.length,
      attempts: backup.attempts.length,
      writings: backup.writings.length,
      results: backup.results.length,
    },
    latestActivityDate: latestDate(all),
    approximateBytes: new TextEncoder().encode(JSON.stringify(backup)).byteLength,
  };
}

function requireAccount(scope: AccountScope) {
  if (scope.mode !== "account") throw new Error("Adoção exige AccountScope autenticado");
}

export async function readAdoptionDecision(scope: AccountScope) {
  requireAccount(scope);
  return readCloudAdoptionSettings(scope);
}

export async function keepLegacyLocalOnly(
  scope: AccountScope,
  decidedAt = new Date().toISOString(),
): Promise<CloudAdoptionSettings> {
  requireAccount(scope);
  const value: CloudAdoptionSettings = {
    id: "adoption",
    choice: "local_only",
    adopted: true,
    syncEnabled: false,
    decidedAt,
  };
  await writeCloudAdoptionSettings(scope, value);
  return value;
}

export async function copyLegacyIntoAccount(
  scope: AccountScope,
  decidedAt = new Date().toISOString(),
  legacyDbName = "central-estudos",
): Promise<CloudAdoptionSettings> {
  requireAccount(scope);
  const plan = await previewLegacyBootstrap(scope, legacyDbName);
  const applied = await applyBootstrapPlan(plan, scope, decidedAt);
  const value: CloudAdoptionSettings = {
    id: "adoption",
    choice: "copy_legacy",
    adopted: true,
    syncEnabled: false,
    decidedAt,
    sourceFingerprint: applied.sourceFingerprint,
  };
  await writeCloudAdoptionSettings(scope, value);
  return value;
}

export async function startEmptyAccount(
  scope: AccountScope,
  decidedAt = new Date().toISOString(),
): Promise<CloudAdoptionSettings> {
  requireAccount(scope);
  const db = await openScopedStudyDatabase(scope);
  try {
    if (db.version !== 3) throw new Error("Adoção exige StudyDB v3");
    const raw = db as unknown as { count(name: string): Promise<number> };
    for (const store of STUDY_STORES)
      if ((await raw.count(store)) > 0)
        throw new Error("A conta local já contém dados; use preview de reconciliação antes de continuar");
  } finally {
    db.close();
  }
  const value: CloudAdoptionSettings = {
    id: "adoption",
    choice: "empty_account",
    adopted: true,
    syncEnabled: false,
    decidedAt,
  };
  await writeCloudAdoptionSettings(scope, value);
  return value;
}
