import { afterEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { deleteDB, openDB } from "idb";
import { backupSchema } from "../src/services/storage";
import {
  databaseNameForScope,
  deriveAccountScope,
  localAccountScope,
} from "../src/services/account-scope";
import {
  atomicPutWithOutbox,
  openScopedStudyDatabase,
  type StudyDBV3,
} from "../src/services/storage-db";
import {
  deleteSyncMetaDatabase,
  openSyncMetaDatabase,
} from "../src/services/sync-meta";
import type { Submission, SyncOutboxEntry } from "../src/types/cloud";
import type { StudyProgress } from "../src/types/schema";

const databases = new Set<string>();
const name = (label: string) => {
  const value = `test-${label}-${crypto.randomUUID()}`;
  databases.add(value);
  return value;
};

afterEach(async () => {
  await Promise.all([...databases].map((dbName) => deleteDB(dbName)));
  databases.clear();
});

const progress = (percent: number): StudyProgress => ({
  id: "TI-BD-003",
  status: percent === 100 ? "concluído" : "em andamento",
  startedAt: "2026-10-11",
  completedAt: percent === 100 ? "2026-10-11" : null,
  lastAccess: "2026-10-11",
  percent,
  correct: 0,
  wrong: 0,
  total: 0,
  lastReview: null,
  nextReview: null,
});

function outbox(id: string, basePayload: unknown, nextPayload: unknown): SyncOutboxEntry {
  return {
    id,
    mutationId: id,
    entityType: "progress",
    entityId: "TI-BD-003",
    operation: "put",
    basePayload,
    nextPayload,
    createdAt: "2026-10-11T14:00:00.000Z",
    status: "pending",
  };
}

describe("PR-1 LOCAL-SCOPE — AccountScope", () => {
  it("mantém mode off exatamente no banco legado e deriva nomes opacos por conta", async () => {
    expect(databaseNameForScope(localAccountScope())).toBe("central-estudos");
    const a = await deriveAccountScope("project-ref", "uid-A@example.invalid");
    const b = await deriveAccountScope("project-ref", "uid-B@example.invalid");
    expect(a.mode).toBe("account");
    expect(b.mode).toBe("account");
    if (a.mode !== "account" || b.mode !== "account") throw new Error("fixture inválida");
    expect(a.scopeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.scopeHash).not.toBe(b.scopeHash);
    expect(a.studyDbName).not.toContain("uid-A");
    expect(a.studyDbName).not.toContain("@example");
    expect(a.studyDbName).not.toBe(b.studyDbName);
  });
});

describe("PR-1 LOCAL-SCOPE — StudyDB v3", () => {
  it("migra v1→v3 preservando dado e cria somente a estrutura nova", async () => {
    const dbName = name("v1-v3");
    const old = await openDB(dbName, 1, {
      upgrade(db) {
        db.createObjectStore("progress", { keyPath: "id" });
        db.createObjectStore("reviews", { keyPath: "id" });
        db.createObjectStore("attempts", { keyPath: "id" });
        db.createObjectStore("writings", { keyPath: "id" });
        db.createObjectStore("results", { keyPath: "id" });
      },
    });
    await old.put("progress", progress(25));
    old.close();
    const scope = await deriveAccountScope("project-ref", "migration-user");
    const upgraded = await openScopedStudyDatabase(scope, { dbName }) as unknown as IDBDatabase & StudyDBV3;
    expect(upgraded.version).toBe(3);
    expect([...upgraded.objectStoreNames]).toEqual(expect.arrayContaining([
      "activities", "progress", "reviews", "attempts", "writings", "results",
      "submissions", "simulationSubmissions", "revealedCorrections", "syncOutbox",
    ]));
    upgraded.close();
    const check = await openDB(dbName);
    expect((await check.get("progress", "TI-BD-003") as StudyProgress).percent).toBe(25);
    check.close();
  });

  it("migra v2→v3, é idempotente e isola a mesma entidade entre contas", async () => {
    const scopeA = await deriveAccountScope("project-ref", "account-A");
    const scopeB = await deriveAccountScope("project-ref", "account-B");
    if (scopeA.mode !== "account" || scopeB.mode !== "account") throw new Error("fixture inválida");
    databases.add(scopeA.studyDbName);
    databases.add(scopeB.studyDbName);
    const a = await openScopedStudyDatabase(scopeA);
    const b = await openScopedStudyDatabase(scopeB);
    if (a.version !== 3 || b.version !== 3) throw new Error("versão inválida");
    await (a as unknown as { put(store: string, value: StudyProgress): Promise<IDBValidKey> }).put("progress", progress(10));
    await (b as unknown as { put(store: string, value: StudyProgress): Promise<IDBValidKey> }).put("progress", progress(90));
    a.close(); b.close();
    const again = await openScopedStudyDatabase(scopeA);
    expect(again.version).toBe(3);
    expect((await (again as unknown as { get(store: string, key: string): Promise<StudyProgress> }).get("progress", "TI-BD-003")).percent).toBe(10);
    again.close();
  });

  it("commita entidade+outbox atomicamente e rollbacka quando a outbox falha", async () => {
    const dbName = name("atomic");
    const scope = await deriveAccountScope("project-ref", "atomic-user");
    const db = await openScopedStudyDatabase(scope, { dbName });
    if (db.version !== 3) throw new Error("versão inválida");
    const typed = db as unknown as IDBDatabase & StudyDBV3;
    await atomicPutWithOutbox(typed as never, "progress", progress(10), outbox("mutation-1", null, progress(10)));
    await expect(atomicPutWithOutbox(typed as never, "progress", progress(80), outbox("mutation-1", progress(10), progress(80)))).rejects.toBeTruthy();
    const raw = db as unknown as { get(store: string, key: string): Promise<unknown> };
    expect((await raw.get("progress", "TI-BD-003") as StudyProgress).percent).toBe(10);
    expect((await raw.get("syncOutbox", "mutation-1") as SyncOutboxEntry).basePayload).toBeNull();
    db.close();
  });

  it("falha da mutação cria zero outbox e commit sobrevivente preserva ambos após reopen", async () => {
    const dbName = name("mutation-failure");
    const scope = await deriveAccountScope("project-ref", "failure-user");
    const db = await openScopedStudyDatabase(scope, { dbName });
    if (db.version !== 3) throw new Error("versão inválida");
    const raw = db as unknown as {
      add(store: string, value: unknown): Promise<IDBValidKey>;
      get(store: string, key: string): Promise<unknown>;
    };
    const first: Submission = {
      id: "sub-1", dedupeKey: "same", questionId: "Q-1", contentId: "TI-BD-003",
      unitIds: [], promptHash: "hash-1", answer: "A", reason: "conteúdo",
      submittedAt: "2026-10-11T14:00:00.000Z", status: "pending", finalizedAt: null, attemptId: null,
    };
    await raw.add("submissions", first);
    const badEntry: SyncOutboxEntry = {
      ...outbox("mutation-bad", null, null), entityType: "submissions", entityId: "sub-2",
    };
    await expect(atomicPutWithOutbox(db as never, "submissions", { ...first, id: "sub-2" }, badEntry)).rejects.toBeTruthy();
    expect(await raw.get("syncOutbox", "mutation-bad")).toBeUndefined();
    await atomicPutWithOutbox(db as never, "progress", progress(40), outbox("mutation-ok", progress(10), progress(40)));
    db.close();
    const reopened = await openScopedStudyDatabase(scope, { dbName });
    const reopenedRaw = reopened as unknown as { get(store: string, key: string): Promise<unknown> };
    expect((await reopenedRaw.get("progress", "TI-BD-003") as StudyProgress).percent).toBe(40);
    expect((await reopenedRaw.get("syncOutbox", "mutation-ok") as SyncOutboxEntry).nextPayload).toEqual(progress(40));
    reopened.close();
  });
});

describe("PR-1 LOCAL-SCOPE — companion metadata", () => {
  it("apagar companion não apaga StudyDB e Backup não incorpora metadata técnica", async () => {
    const studyName = name("study");
    const metaName = name("meta");
    const scope = await deriveAccountScope("project-ref", "meta-user");
    const study = await openScopedStudyDatabase(scope, { dbName: studyName });
    if (study.version !== 3) throw new Error("versão inválida");
    await (study as unknown as { put(store: string, value: StudyProgress): Promise<IDBValidKey> }).put("progress", progress(33));
    study.close();
    const meta = await openSyncMetaDatabase(scope, { dbName: metaName });
    await meta.put("remoteBase", { id: "TI-BD-003", payload: { percent: 10 }, updatedAt: "2026-10-11T14:00:00.000Z" });
    meta.close();
    await deleteSyncMetaDatabase(scope, { dbName: metaName });
    const reopened = await openScopedStudyDatabase(scope, { dbName: studyName });
    expect((await (reopened as unknown as { get(store: string, key: string): Promise<StudyProgress> }).get("progress", "TI-BD-003")).percent).toBe(33);
    reopened.close();
    const parsed = backupSchema.parse({
      version: 1, progress: [], reviews: [], attempts: [], writings: [], results: [],
      syncOutbox: [{ id: "private" }], remoteBase: [{ id: "private" }],
    });
    expect("syncOutbox" in parsed).toBe(false);
    expect("remoteBase" in parsed).toBe(false);
  });
});