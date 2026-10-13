import { afterEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { deriveAccountScope } from "../src/services/account-scope";
import {
  copyLegacyIntoAccount,
  keepLegacyLocalOnly,
  readAdoptionDecision,
  startEmptyAccount,
  summarizeLegacyProgress,
} from "../src/services/cloud-adoption";
import { ANNULLED_ING001_032 } from "../src/services/cloud-protocol";
import { openLegacyStudyDatabase, openScopedStudyDatabase } from "../src/services/storage-db";
import type { StudyProgress } from "../src/types/schema";

const names = new Set<string>();

type RawStudyDb = {
  get(store: string, key: string): Promise<unknown>;
  count(store: string): Promise<number>;
  put(store: string, value: unknown): Promise<IDBValidKey>;
  close(): void;
};

function raw(db: unknown) {
  return db as RawStudyDb;
}

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

async function fixture(label: string) {
  const legacyDbName = `test-adoption-legacy-${label}-${crypto.randomUUID()}`;
  names.add(legacyDbName);
  const scope = await deriveAccountScope(`project-${label}-${crypto.randomUUID()}`, `user-${label}`);
  if (scope.mode !== "account") throw new Error("fixture inválida");
  names.add(scope.studyDbName);
  names.add(scope.syncMetaDbName);
  const legacy = await openLegacyStudyDatabase(legacyDbName);
  await legacy.put("progress", progress(42));
  legacy.close();
  return { scope, legacyDbName };
}

afterEach(async () => {
  await Promise.all([...names].map((name) => deleteDB(name)));
  names.clear();
});

describe("PR-6 adoção explícita — preflight local", () => {
  it("resume o legado sem escrever no AccountScope", async () => {
    const { scope, legacyDbName } = await fixture("summary");
    const summary = await summarizeLegacyProgress(legacyDbName);
    expect(summary.counts.progress).toBe(1);
    expect(summary.latestActivityDate).toBe("2026-10-12");
    expect(summary.approximateBytes).toBeGreaterThan(0);
    expect(await readAdoptionDecision(scope)).toBeNull();
  });

  it("opção A registra local-only sem copiar nem apagar o legado", async () => {
    const { scope, legacyDbName } = await fixture("local");
    const decision = await keepLegacyLocalOnly(scope, "2026-10-13T10:00:00.000Z");
    expect(decision.choice).toBe("local_only");
    expect(decision.syncEnabled).toBe(false);
    expect((await readAdoptionDecision(scope))?.choice).toBe("local_only");

    const account = raw(await openScopedStudyDatabase(scope));
    expect(await account.count("progress")).toBe(0);
    account.close();
    const legacy = await openLegacyStudyDatabase(legacyDbName);
    expect((await legacy.get("progress", "TI-BD-003"))?.percent).toBe(42);
    legacy.close();
  });

  it("opção B copia de forma idempotente, preserva origem e exclui QREF032", async () => {
    const { scope, legacyDbName } = await fixture("copy");
    const legacy = await openLegacyStudyDatabase(legacyDbName);
    await legacy.put("attempts", {
      id: "annulled-attempt",
      questionId: ANNULLED_ING001_032,
      contentId: "ING-001",
      date: "2026-10-12",
      answer: "A",
      correct: false,
      reason: "conteúdo",
      resolvedAt: null,
    });
    legacy.close();

    const first = await copyLegacyIntoAccount(scope, "2026-10-13T10:00:00.000Z", legacyDbName);
    const second = await copyLegacyIntoAccount(scope, "2026-10-13T10:01:00.000Z", legacyDbName);
    expect(first.sourceFingerprint).toBe(second.sourceFingerprint);
    expect(second.choice).toBe("copy_legacy");

    const account = raw(await openScopedStudyDatabase(scope));
    expect((await account.get("progress", "TI-BD-003") as StudyProgress | undefined)?.percent).toBe(42);
    expect(await account.count("progress")).toBe(1);
    expect(await account.count("attempts")).toBe(0);
    account.close();

    const legacyAgain = await openLegacyStudyDatabase(legacyDbName);
    expect((await legacyAgain.get("progress", "TI-BD-003"))?.percent).toBe(42);
    expect(await legacyAgain.count("attempts")).toBe(1);
    legacyAgain.close();
  });

  it("opção C prepara conta vazia e recusa alvo que já tenha estado", async () => {
    const empty = await fixture("empty");
    const decision = await startEmptyAccount(empty.scope, "2026-10-13T10:00:00.000Z");
    expect(decision.choice).toBe("empty_account");
    const account = raw(await openScopedStudyDatabase(empty.scope));
    expect(await account.count("progress")).toBe(0);
    account.close();
    const legacy = await openLegacyStudyDatabase(empty.legacyDbName);
    expect(await legacy.count("progress")).toBe(1);
    legacy.close();

    const occupied = await fixture("occupied");
    const occupiedDb = raw(await openScopedStudyDatabase(occupied.scope));
    await occupiedDb.put("progress", progress(90));
    occupiedDb.close();
    await expect(startEmptyAccount(occupied.scope)).rejects.toThrow(/já contém dados/);
    expect(await readAdoptionDecision(occupied.scope)).toBeNull();
  });

  it("permite mudar A para B sem apagar o legado nem duplicar a cópia", async () => {
    const { scope, legacyDbName } = await fixture("a-to-b");
    await keepLegacyLocalOnly(scope, "2026-10-13T10:00:00.000Z");
    expect((await readAdoptionDecision(scope))?.choice).toBe("local_only");
    await copyLegacyIntoAccount(scope, "2026-10-13T10:05:00.000Z", legacyDbName);
    expect((await readAdoptionDecision(scope))?.choice).toBe("copy_legacy");
    const account = raw(await openScopedStudyDatabase(scope));
    expect(await account.count("progress")).toBe(1);
    account.close();
  });
});
