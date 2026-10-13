import { afterEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { deriveAccountScope, localAccountScope } from "../src/services/account-scope";
import {
  exportActiveBackupV2,
  importPedagogicalBackup,
  migrateBackupV1ToV2,
  parseBackupV2,
} from "../src/services/backup-v2";
import { ANNULLED_ING001_032 } from "../src/services/cloud-protocol";
import { openLegacyStudyDatabase, openScopedStudyDatabase, type StudyDBV3 } from "../src/services/storage-db";
import { setActiveStudyScope } from "../src/services/study-storage-route";
import { progressFor } from "../src/services/study";
import type { Submission } from "../src/types/cloud";
import type { AccountScope } from "../src/types/cloud";
import type { IDBPDatabase } from "idb";

const databases = new Set<string>();

async function account(label: string): Promise<AccountScope> {
  const scope = await deriveAccountScope(`backup-${label}-${crypto.randomUUID()}`, `user-${label}`);
  if (scope.mode !== "account") throw new Error("fixture inválida");
  databases.add(scope.studyDbName);
  databases.add(scope.syncMetaDbName);
  return scope;
}

function pendingSubmission(answer = "B", questionId = "QAUT-SYNTH-001"): Submission {
  return {
    id: "submission-synthetic-1",
    dedupeKey: "dedupe-synthetic-1",
    questionId,
    contentId: "TI-BD-003",
    unitIds: ["TI-BD-003-U1"],
    promptHash: "sha256-synthetic-prompt",
    answer,
    reason: "conteúdo",
    submittedAt: "2026-10-13T12:00:00.000Z",
    status: "pending",
    finalizedAt: null,
    attemptId: null,
  };
}

function finalizedSubmission(): Submission {
  return {
    ...pendingSubmission(),
    status: "finalized",
    finalizedAt: "2026-10-13T12:05:00.000Z",
    attemptId: "attempt-synthetic-1",
  };
}

function emptyV2() {
  return {
    version: 2 as const,
    activities: [],
    progress: [],
    reviews: [],
    attempts: [],
    writings: [],
    results: [],
    submissions: [],
    simulationSubmissions: [],
  };
}

async function db(scope: AccountScope) {
  const value = await openScopedStudyDatabase(scope);
  if (value.version !== 3) throw new Error("StudyDB v3 esperado");
  return value as IDBPDatabase<StudyDBV3>;
}

afterEach(async () => {
  setActiveStudyScope(localAccountScope());
  await Promise.all([...databases].map((name) => deleteDB(name)));
  databases.clear();
  await deleteDB("central-estudos");
});

describe("PR-6 BackupV2 — import e round-trip", () => {
  it("exporta e restaura pending Submission sem correction ou metadata técnica", async () => {
    const source = await account("source");
    setActiveStudyScope(source);
    const sourceDb = await db(source);
    await sourceDb.put("progress", { ...progressFor("TI-BD-003", "2026-10-13"), percent: 50, status: "em andamento" });
    await sourceDb.put("submissions", pendingSubmission());
    await sourceDb.put("revealedCorrections", {
      id: "correction-private-1",
      questionId: "QAUT-SYNTH-001",
      promptHash: "sha256-synthetic-prompt",
      answer: "B",
      comment: "segredo sintético",
      revealedAt: "2026-10-13T12:01:00.000Z",
    });
    await sourceDb.put("syncOutbox", {
      id: "__cloud_sync_cursor__",
      recordType: "cursor",
      cursor: 17,
    });
    sourceDb.close();

    const exported = await exportActiveBackupV2();
    expect(exported.version).toBe(2);
    expect(exported.submissions).toEqual([pendingSubmission()]);
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain("correction-private-1");
    expect(serialized).not.toContain("syncOutbox");
    expect(serialized).not.toContain("scopeHash");

    const target = await account("target");
    setActiveStudyScope(target);
    await importPedagogicalBackup(exported);
    await importPedagogicalBackup(exported);
    const targetDb = await db(target);
    expect(await targetDb.count("submissions")).toBe(1);
    expect(await targetDb.get("submissions", "submission-synthetic-1")).toEqual(pendingSubmission());
    expect(await targetDb.count("revealedCorrections")).toBe(0);
    expect(await targetDb.count("syncOutbox")).toBe(0);
    expect((await targetDb.get("progress", "TI-BD-003"))?.percent).toBe(50);
    targetDb.close();
  });

  it("não rebaixa Submission finalized para pending", async () => {
    const target = await account("finalized");
    setActiveStudyScope(target);
    const targetDb = await db(target);
    await targetDb.put("submissions", finalizedSubmission());
    targetDb.close();

    await importPedagogicalBackup({ ...emptyV2(), submissions: [pendingSubmission()] });
    const verify = await db(target);
    expect(await verify.get("submissions", "submission-synthetic-1")).toEqual(finalizedSubmission());
    verify.close();
  });

  it("rejeita mudança de resposta pending e aborta a transação inteira", async () => {
    const target = await account("conflict");
    setActiveStudyScope(target);
    const targetDb = await db(target);
    await targetDb.put("submissions", pendingSubmission("A"));
    await targetDb.put("progress", { ...progressFor("TI-BD-003", "2026-10-13"), percent: 10, status: "em andamento" });
    targetDb.close();

    const conflicting = {
      ...emptyV2(),
      progress: [{ ...progressFor("TI-BD-003", "2026-10-13"), percent: 90, status: "em andamento" as const }],
      submissions: [pendingSubmission("B")],
    };
    await expect(importPedagogicalBackup(conflicting)).rejects.toThrow(/resposta imutável/);

    const verify = await db(target);
    expect((await verify.get("progress", "TI-BD-003"))?.percent).toBe(10);
    expect((await verify.get("submissions", "submission-synthetic-1"))?.answer).toBe("A");
    verify.close();
  });

  it("migra BackupV1 para o modelo V2 sem inventar submissions", async () => {
    const v1 = {
      version: 1 as const,
      activities: [],
      progress: [{ ...progressFor("TI-BD-003", "2026-10-13"), percent: 25, status: "em andamento" as const }],
      reviews: [],
      attempts: [],
      writings: [],
      results: [],
    };
    const migrated = migrateBackupV1ToV2(v1);
    expect(migrated.version).toBe(2);
    expect(migrated.submissions).toEqual([]);

    const target = await account("v1");
    setActiveStudyScope(target);
    await importPedagogicalBackup(v1);
    const targetDb = await db(target);
    expect((await targetDb.get("progress", "TI-BD-003"))?.percent).toBe(25);
    expect(await targetDb.count("submissions")).toBe(0);
    targetDb.close();
  });

  it("recusa V2 com pending no legado em vez de perder a resposta", async () => {
    setActiveStudyScope(localAccountScope());
    const legacy = await openLegacyStudyDatabase();
    await legacy.put("progress", { ...progressFor("TI-BD-003", "2026-10-13"), percent: 12, status: "em andamento" });
    legacy.close();

    await expect(
      importPedagogicalBackup({ ...emptyV2(), submissions: [pendingSubmission()] }),
    ).rejects.toThrow(/respostas pendentes/);
    const verify = await openLegacyStudyDatabase();
    expect((await verify.get("progress", "TI-BD-003"))?.percent).toBe(12);
    verify.close();
  });

  it("remove QREF032 de attempts, submissions e atividades restauradas", async () => {
    const target = await account("annulled");
    setActiveStudyScope(target);
    const backup = {
      ...emptyV2(),
      activities: [{
        id: "questions-annulled",
        kind: "questões" as const,
        contentId: "ING-001",
        title: "Bloco anulado",
        questionIds: [ANNULLED_ING001_032],
        reviewIds: [],
        startedAt: "2026-10-13",
        completedAt: null,
        sequence: 1,
      }],
      attempts: [{
        id: "attempt-annulled",
        questionId: ANNULLED_ING001_032,
        contentId: "ING-001",
        date: "2026-10-13",
        answer: "A",
        correct: false,
        reason: "conteúdo" as const,
        resolvedAt: null,
      }],
      submissions: [pendingSubmission("A", ANNULLED_ING001_032)],
    };
    await importPedagogicalBackup(backup);
    const targetDb = await db(target);
    expect(await targetDb.count("activities")).toBe(0);
    expect(await targetDb.count("attempts")).toBe(0);
    expect(await targetDb.count("submissions")).toBe(0);
    expect(await targetDb.count("syncOutbox")).toBe(0);
    targetDb.close();
  });

  it("parser estrito rejeita metadata técnica e correction injetadas", () => {
    expect(() => parseBackupV2({ ...emptyV2(), scopeHash: "secret" })).toThrow();
    expect(() => parseBackupV2({ ...emptyV2(), revealedCorrections: [] })).toThrow();
  });
});
