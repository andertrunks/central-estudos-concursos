import { beforeEach, afterEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { deriveAccountScope, localAccountScope } from "../src/services/account-scope";
import { loadState, setProgress } from "../src/services/storage";
import { openLegacyStudyDatabase, openScopedStudyDatabase } from "../src/services/storage-db";
import {
  getActiveStudyEpoch,
  getActiveStudyScope,
  setActiveStudyScope,
  studyScopeKey,
} from "../src/services/study-storage-route";
import type { AccountScope } from "../src/types/cloud";
import type { StudyProgress } from "../src/types/schema";

function progress(percent: number): StudyProgress {
  return {
    id: "TI-BD-003",
    status: "em andamento",
    startedAt: "2026-10-10",
    completedAt: null,
    lastAccess: "2026-10-12",
    percent,
    correct: 0,
    wrong: 0,
    total: 0,
    lastReview: null,
    nextReview: null,
  };
}

type RawDb = {
  get(store: string, key: string): Promise<unknown>;
  put(store: string, value: unknown): Promise<IDBValidKey>;
  count(store: string): Promise<number>;
  close(): void;
};
const raw = (db: unknown) => db as RawDb;

async function account(label: string): Promise<AccountScope> {
  return deriveAccountScope(`routing-${label}-${crypto.randomUUID()}`, `user-${label}`);
}

beforeEach(async () => {
  setActiveStudyScope(localAccountScope());
  await deleteDB("central-estudos");
});

afterEach(() => {
  setActiveStudyScope(localAccountScope());
});

describe("PR-6 scope routing — leitura e escrita juntas", () => {
  it("só incrementa o epoch quando o escopo efetivamente muda", async () => {
    const local = localAccountScope();
    const first = await account("epoch-a");
    const second = await account("epoch-b");
    const initial = getActiveStudyEpoch();
    setActiveStudyScope(local);
    expect(getActiveStudyEpoch()).toBe(initial);
    setActiveStudyScope(first);
    expect(getActiveStudyEpoch()).toBe(initial + 1);
    setActiveStudyScope(first);
    expect(getActiveStudyEpoch()).toBe(initial + 1);
    setActiveStudyScope(second);
    expect(getActiveStudyEpoch()).toBe(initial + 2);
    expect(studyScopeKey(getActiveStudyScope())).toBe(studyScopeKey(second));
  });

  it("isola legado, conta A e conta B em loadState e nas mutações", async () => {
    const scopeA = await account("a");
    const scopeB = await account("b");

    const legacy = await openLegacyStudyDatabase();
    await legacy.put("progress", progress(10));
    legacy.close();

    const dbA = raw(await openScopedStudyDatabase(scopeA));
    await dbA.put("progress", progress(20));
    dbA.close();
    const dbB = raw(await openScopedStudyDatabase(scopeB));
    await dbB.put("progress", progress(30));
    dbB.close();

    setActiveStudyScope(localAccountScope());
    expect((await loadState()).progress[0]?.percent).toBe(10);

    setActiveStudyScope(scopeA);
    expect((await loadState()).progress[0]?.percent).toBe(20);
    await setProgress("TI-BD-003", "concluído", "2026-10-13");

    const verifyA = raw(await openScopedStudyDatabase(scopeA));
    expect((await verifyA.get("progress", "TI-BD-003") as StudyProgress).percent).toBe(100);
    expect(await verifyA.count("syncOutbox")).toBe(0);
    verifyA.close();
    const verifyLegacy1 = await openLegacyStudyDatabase();
    expect((await verifyLegacy1.get("progress", "TI-BD-003"))?.percent).toBe(10);
    verifyLegacy1.close();
    const verifyB1 = raw(await openScopedStudyDatabase(scopeB));
    expect((await verifyB1.get("progress", "TI-BD-003") as StudyProgress).percent).toBe(30);
    verifyB1.close();

    setActiveStudyScope(scopeB);
    expect((await loadState()).progress[0]?.percent).toBe(30);
    await setProgress("TI-BD-003", "em andamento", "2026-10-13");
    const verifyB2 = raw(await openScopedStudyDatabase(scopeB));
    expect((await verifyB2.get("progress", "TI-BD-003") as StudyProgress).percent).toBe(50);
    expect(await verifyB2.count("syncOutbox")).toBe(0);
    verifyB2.close();
    const verifyA2 = raw(await openScopedStudyDatabase(scopeA));
    expect((await verifyA2.get("progress", "TI-BD-003") as StudyProgress).percent).toBe(100);
    verifyA2.close();

    setActiveStudyScope(localAccountScope());
    await setProgress("TI-BD-003", "revisar", "2026-10-14");
    const verifyLegacy2 = await openLegacyStudyDatabase();
    expect((await verifyLegacy2.get("progress", "TI-BD-003"))?.status).toBe("revisar");
    verifyLegacy2.close();
    const verifyA3 = raw(await openScopedStudyDatabase(scopeA));
    const verifyB3 = raw(await openScopedStudyDatabase(scopeB));
    expect((await verifyA3.get("progress", "TI-BD-003") as StudyProgress).percent).toBe(100);
    expect((await verifyB3.get("progress", "TI-BD-003") as StudyProgress).percent).toBe(50);
    verifyA3.close();
    verifyB3.close();
  });
});
