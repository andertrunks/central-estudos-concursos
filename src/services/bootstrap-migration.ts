import type { Backup } from "./storage";
import { backupSchema } from "./storage";
import { ANNULLED_ING001_032, canonicalJson, sha256 } from "./cloud-protocol";
import {
  openLegacyStudyDatabase,
  openScopedStudyDatabase,
  type StudyDBV3,
} from "./storage-db";
import type { AccountScope, BootstrapReceipt } from "../types/cloud";

const RECEIPT_ID = "__bootstrap_receipt__" as const;
const DOMAIN_STORES = [
  "activities",
  "progress",
  "reviews",
  "attempts",
  "writings",
  "results",
] as const;
const AUX_STORES = ["submissions", "simulationSubmissions", "revealedCorrections"] as const;
const ALL_STORES = [...DOMAIN_STORES, ...AUX_STORES, "syncOutbox"] as const;

type DomainStore = (typeof DOMAIN_STORES)[number];
type ImportedKeys = Record<DomainStore, string[]>;
type SourceKind = "legacy-v2" | "backup-v1";

export interface BootstrapPreview {
  sourceKind: SourceKind;
  sourceFingerprint: string;
  targetScopeHash: string;
  targetEmpty: boolean;
  counts: Record<DomainStore, number>;
  excludedAnnulledAttempts: number;
  excludedEmptyQuestionActivities: number;
}

export interface BootstrapPlan extends BootstrapPreview {
  snapshot: Backup;
}

export interface BootstrapApplyResult {
  status: "applied" | "already_applied";
  sourceFingerprint: string;
}

export interface BootstrapRollbackResult {
  status: "rolled_back" | "not_applied";
  sourceFingerprint: string | null;
}

type RawStore = {
  get(key: IDBValidKey): Promise<unknown>;
  getAll(): Promise<unknown[]>;
  put(value: unknown): Promise<IDBValidKey>;
  delete(key: IDBValidKey): Promise<void>;
};
type RawTx = {
  objectStore(name: string): RawStore;
  done: Promise<void>;
};
type RawDb = {
  get(store: string, key: IDBValidKey): Promise<unknown>;
  getAll(store: string): Promise<unknown[]>;
};

function sorted<T extends { id: string }>(values: T[]) {
  return [...values].sort((a, b) => a.id.localeCompare(b.id));
}

function sanitizeBackup(input: unknown) {
  const parsed = backupSchema.parse(input);
  const attempts = parsed.attempts.filter((attempt) => attempt.questionId !== ANNULLED_ING001_032);
  const excludedAnnulledAttempts = parsed.attempts.length - attempts.length;
  let excludedEmptyQuestionActivities = 0;
  const activities = (parsed.activities ?? []).flatMap((activity) => {
    const questionIds = activity.questionIds.filter((id) => id !== ANNULLED_ING001_032);
    if (activity.kind === "questões" && activity.questionIds.length > 0 && questionIds.length === 0) {
      excludedEmptyQuestionActivities += 1;
      return [];
    }
    return [{ ...activity, questionIds }];
  });
  const snapshot = backupSchema.parse({
    version: 1,
    activities: sorted(activities),
    progress: sorted(parsed.progress),
    reviews: sorted(parsed.reviews),
    attempts: sorted(attempts),
    writings: sorted(parsed.writings),
    results: sorted(parsed.results),
  });
  return { snapshot, excludedAnnulledAttempts, excludedEmptyQuestionActivities };
}

async function fingerprint(snapshot: Backup) {
  return sha256(canonicalJson(snapshot));
}

function counts(snapshot: Backup): Record<DomainStore, number> {
  return {
    activities: snapshot.activities?.length ?? 0,
    progress: snapshot.progress.length,
    reviews: snapshot.reviews.length,
    attempts: snapshot.attempts.length,
    writings: snapshot.writings.length,
    results: snapshot.results.length,
  };
}

function importedKeys(snapshot: Backup): ImportedKeys {
  return {
    activities: (snapshot.activities ?? []).map((value) => value.id),
    progress: snapshot.progress.map((value) => value.id),
    reviews: snapshot.reviews.map((value) => value.id),
    attempts: snapshot.attempts.map((value) => value.id),
    writings: snapshot.writings.map((value) => value.id),
    results: snapshot.results.map((value) => value.id),
  };
}

function ids(values: unknown[]) {
  return values
    .map((value) => (value as { id?: unknown }).id)
    .filter((value): value is string => typeof value === "string")
    .sort((a, b) => a.localeCompare(b));
}

function sameKeys(actual: string[], expected: string[]) {
  const sortedExpected = [...expected].sort((a, b) => a.localeCompare(b));
  return actual.length === sortedExpected.length && actual.every((value, index) => value === sortedExpected[index]);
}

async function targetIsEmpty(scope: AccountScope) {
  if (scope.mode !== "account") throw new Error("Bootstrap exige AccountScope autenticado");
  const db = await openScopedStudyDatabase(scope);
  if (db.version !== 3) {
    db.close();
    throw new Error("Bootstrap exige StudyDB v3");
  }
  try {
    for (const store of ALL_STORES) {
      if ((await (db as unknown as { count(name: string): Promise<number> }).count(store)) > 0) return false;
    }
    return true;
  } finally {
    db.close();
  }
}

async function buildPlan(input: unknown, sourceKind: SourceKind, scope: AccountScope): Promise<BootstrapPlan> {
  if (scope.mode !== "account") throw new Error("Bootstrap exige AccountScope autenticado");
  const sanitized = sanitizeBackup(input);
  const sourceFingerprint = await fingerprint(sanitized.snapshot);
  return {
    sourceKind,
    sourceFingerprint,
    targetScopeHash: scope.scopeHash,
    targetEmpty: await targetIsEmpty(scope),
    counts: counts(sanitized.snapshot),
    excludedAnnulledAttempts: sanitized.excludedAnnulledAttempts,
    excludedEmptyQuestionActivities: sanitized.excludedEmptyQuestionActivities,
    snapshot: sanitized.snapshot,
  };
}

export async function readLegacyBackup(dbName = "central-estudos"): Promise<Backup> {
  const db = await openLegacyStudyDatabase(dbName);
  try {
    return backupSchema.parse({
      version: 1,
      activities: await db.getAll("activities"),
      progress: await db.getAll("progress"),
      reviews: await db.getAll("reviews"),
      attempts: await db.getAll("attempts"),
      writings: await db.getAll("writings"),
      results: await db.getAll("results"),
    });
  } finally {
    db.close();
  }
}

export async function previewLegacyBootstrap(scope: AccountScope, dbName = "central-estudos") {
  return buildPlan(await readLegacyBackup(dbName), "legacy-v2", scope);
}

export async function previewBackupV1(input: unknown, scope: AccountScope) {
  return buildPlan(input, "backup-v1", scope);
}

function txFor(db: IDBDatabase & StudyDBV3): RawTx {
  return db.transaction([...ALL_STORES], "readwrite") as unknown as RawTx;
}

async function currentSnapshotFromDb(db: RawDb): Promise<Backup> {
  return backupSchema.parse({
    version: 1,
    activities: sorted((await db.getAll("activities")) as NonNullable<Backup["activities"]>),
    progress: sorted((await db.getAll("progress")) as Backup["progress"]),
    reviews: sorted((await db.getAll("reviews")) as Backup["reviews"]),
    attempts: sorted((await db.getAll("attempts")) as Backup["attempts"]),
    writings: sorted((await db.getAll("writings")) as Backup["writings"]),
    results: sorted((await db.getAll("results")) as Backup["results"]),
  });
}

function isReceipt(value: unknown): value is BootstrapReceipt {
  return Boolean(value && typeof value === "object" && (value as { recordType?: string }).recordType === "bootstrap");
}

export async function applyBootstrapPlan(
  plan: BootstrapPlan,
  scope: AccountScope,
  appliedAt = new Date().toISOString(),
): Promise<BootstrapApplyResult> {
  if (scope.mode !== "account") throw new Error("Bootstrap exige AccountScope autenticado");
  if (plan.targetScopeHash !== scope.scopeHash) throw new Error("Preview pertence a outro AccountScope");
  const sanitized = sanitizeBackup(plan.snapshot);
  const verifiedFingerprint = await fingerprint(sanitized.snapshot);
  if (verifiedFingerprint !== plan.sourceFingerprint) throw new Error("Preview alterado após o dry-run");

  const db = await openScopedStudyDatabase(scope);
  if (db.version !== 3) {
    db.close();
    throw new Error("Bootstrap exige StudyDB v3");
  }
  const tx = txFor(db as unknown as IDBDatabase & StudyDBV3);
  try {
    const existing = await tx.objectStore("syncOutbox").get(RECEIPT_ID);
    if (isReceipt(existing)) {
      if (existing.sourceFingerprint !== plan.sourceFingerprint)
        throw new Error("AccountScope já adotou outra origem");
      await tx.done;
      return { status: "already_applied", sourceFingerprint: plan.sourceFingerprint };
    }

    for (const store of DOMAIN_STORES)
      if ((await tx.objectStore(store).getAll()).length) throw new Error("AccountScope alvo não está vazio");
    for (const store of AUX_STORES)
      if ((await tx.objectStore(store).getAll()).length) throw new Error("AccountScope alvo contém estado incompatível");
    if ((await tx.objectStore("syncOutbox").getAll()).length)
      throw new Error("AccountScope alvo contém metadata de sync");

    const entries: Record<DomainStore, unknown[]> = {
      activities: sanitized.snapshot.activities ?? [],
      progress: sanitized.snapshot.progress,
      reviews: sanitized.snapshot.reviews,
      attempts: sanitized.snapshot.attempts,
      writings: sanitized.snapshot.writings,
      results: sanitized.snapshot.results,
    };
    for (const store of DOMAIN_STORES)
      for (const value of entries[store]) await tx.objectStore(store).put(value);

    const receipt: BootstrapReceipt = {
      id: RECEIPT_ID,
      recordType: "bootstrap",
      status: "bootstrap",
      entityId: "__bootstrap__",
      sourceKind: plan.sourceKind,
      sourceFingerprint: plan.sourceFingerprint,
      targetScopeHash: scope.scopeHash,
      appliedStateFingerprint: plan.sourceFingerprint,
      importedKeys: importedKeys(sanitized.snapshot),
      appliedAt,
    };
    await tx.objectStore("syncOutbox").put(receipt);
    await tx.done;
    return { status: "applied", sourceFingerprint: plan.sourceFingerprint };
  } catch (error) {
    await tx.done.catch(() => undefined);
    throw error;
  } finally {
    db.close();
  }
}

export async function rollbackBootstrap(scope: AccountScope): Promise<BootstrapRollbackResult> {
  if (scope.mode !== "account") throw new Error("Rollback exige AccountScope autenticado");
  const db = await openScopedStudyDatabase(scope);
  if (db.version !== 3) {
    db.close();
    throw new Error("Rollback exige StudyDB v3");
  }
  const rawDb = db as unknown as RawDb;
  try {
    // Crypto must happen before the write transaction. IndexedDB is allowed to
    // auto-commit while awaiting unrelated async work such as subtle.digest().
    const preflightReceipt = await rawDb.get("syncOutbox", RECEIPT_ID);
    if (!isReceipt(preflightReceipt))
      return { status: "not_applied", sourceFingerprint: null };
    const preflightSyncRecords = await rawDb.getAll("syncOutbox");
    if (preflightSyncRecords.some((record) => !isReceipt(record)))
      throw new Error("Rollback bloqueado: há estado de sync posterior ao bootstrap");
    for (const store of AUX_STORES)
      if ((await rawDb.getAll(store)).length)
        throw new Error("Rollback bloqueado: há estado criado após o bootstrap");
    const preflightSnapshot = await currentSnapshotFromDb(rawDb);
    if ((await fingerprint(preflightSnapshot)) !== preflightReceipt.appliedStateFingerprint)
      throw new Error("Rollback bloqueado: o estado local mudou após o bootstrap");

    // Open a fresh write transaction only after hashing. Re-read all structural
    // guards inside the transaction so concurrent insert/delete activity cannot
    // silently turn rollback into a partial delete.
    const tx = txFor(db as unknown as IDBDatabase & StudyDBV3);
    try {
      const receipt = await tx.objectStore("syncOutbox").get(RECEIPT_ID);
      if (!isReceipt(receipt) || receipt.sourceFingerprint !== preflightReceipt.sourceFingerprint)
        throw new Error("Rollback bloqueado: receipt do bootstrap mudou");
      const syncRecords = await tx.objectStore("syncOutbox").getAll();
      if (syncRecords.length !== 1 || !isReceipt(syncRecords[0]))
        throw new Error("Rollback bloqueado: há estado de sync posterior ao bootstrap");
      for (const store of AUX_STORES)
        if ((await tx.objectStore(store).getAll()).length)
          throw new Error("Rollback bloqueado: há estado criado após o bootstrap");
      for (const store of DOMAIN_STORES) {
        const currentKeys = ids(await tx.objectStore(store).getAll());
        if (!sameKeys(currentKeys, receipt.importedKeys[store]))
          throw new Error("Rollback bloqueado: o conjunto local mudou após o bootstrap");
      }
      for (const store of DOMAIN_STORES)
        for (const key of receipt.importedKeys[store]) await tx.objectStore(store).delete(key);
      await tx.objectStore("syncOutbox").delete(RECEIPT_ID);
      await tx.done;
      return { status: "rolled_back", sourceFingerprint: receipt.sourceFingerprint };
    } catch (error) {
      await tx.done.catch(() => undefined);
      throw error;
    }
  } finally {
    db.close();
  }
}
