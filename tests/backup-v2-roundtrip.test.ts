import { afterEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { deriveAccountScope, localAccountScope } from "../src/services/account-scope";
import {
  exportActiveBackupV2,
  importPedagogicalBackup,
  migrateBackupV1ToV2,
  parseBackupV2,
} from "../src/services/backup-v2";
import { ANNULLED_ING001_032 } from "../src/services/cloud-protocol";
import { putCloudEntity } from "../src/services/cloud-mutations";
import { openLegacyStudyDatabase, openScopedStudyDatabase, type StudyDBV3 } from "../src/services/storage-db";
import { setActiveStudyScope } from "../src/services/study-storage-route";
import { progressFor } from "../src/services/study";
import type { SimulationSubmission, Submission } from "../src/types/cloud";
import type { AccountScope } from "../src/types/cloud";
import type { IDBPDatabase } from "idb";

async function account(label: string): Promise<AccountScope> {
  const scope = await deriveAccountScope(`backup-${label}-${crypto.randomUUID()}`, `user-${label}`);
  if (scope.mode !== "account") throw new Error("fixture inválida");
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

function pendingSimulationSubmission(): SimulationSubmission {
  return {
    id: "simulation-submission-synthetic-1",
    dedupeKey: "simulation-dedupe-synthetic-1",
    simulationId: "SIM-SYNTH-001",
    activityId: "activity-synthetic-sim",
    submittedAt: "2026-10-13T13:00:00.000Z",
    seconds: 321,
    status: "pending",
    finalizedAt: null,
    resultId: null,
    scoringSnapshot: {
      correctPoints: 1,
      wrongPoints: 0,
      blankPoints: 0,
    },
    items: [
      {
        questionId: "QAUT-SYNTH-SIM-001",
        contentId: "TI-BD-003",
        discipline: "Tecnologia da Informação",
        unitIds: ["TI-BD-003-U1"],
        promptHash: "sha256-synthetic-simulation-prompt",
        answer: "C",
      },
    ],
    annulledQuestionIds: [],
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

afterEach(() => {
  // Account fixtures use unique DB names. Do not delete a database while the
  // production storage layer may legitimately keep an IndexedDB handle open.
  setActiveStudyScope(localAccountScope());
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

  it("faz round-trip de SimulationSubmission pending sem criar resultado ou outbox", async () => {
    const source = await account("simulation-source");
    setActiveStudyScope(source);
    const sourceDb = await db(source);
    await sourceDb.put("simulationSubmissions", pendingSimulationSubmission());
    sourceDb.close();

    const exported = await exportActiveBackupV2();
    expect(exported.simulationSubmissions).toEqual([pendingSimulationSubmission()]);

    const target = await account("simulation-target");
    setActiveStudyScope(target);
    await importPedagogicalBackup(exported);
    await importPedagogicalBackup(exported);
    const targetDb = await db(target);
    expect(await targetDb.count("simulationSubmissions")).toBe(1);
    expect(await targetDb.get("simulationSubmissions", "simulation-submission-synthetic-1"))
      .toEqual(pendingSimulationSubmission());
    expect(await targetDb.count("results")).toBe(0);
    expect(await targetDb.count("syncOutbox")).toBe(0);
    targetDb.close();
  });

  it("exportação estrita recusa campo inesperado persistido no store", async () => {
    const scope = await account("strict-export");
    setActiveStudyScope(scope);
    const studyDb = await db(scope);
    await (studyDb as unknown as {
      put(store: string, value: unknown): Promise<IDBValidKey>;
    }).put("submissions", {
      ...pendingSubmission(),
      internalSecret: "should-never-export",
    });
    studyDb.close();

    await expect(exportActiveBackupV2()).rejects.toThrow();
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
  it("aborta restauração de Writing com mutação queued e preserva os demais stores", async () => {
    const scope = await account("pending-writing-restore");
    setActiveStudyScope(scope);
    const target = await db(scope);
    const writing = {
      id: "QA-WRITING-1", theme: "SQL", contentIds: ["TI-BD-003"],
      contestId: "CRBIO01-2026-ATI", text: "Texto local em espera",
      date: "2026-10-17", status: "rascunho" as const, evaluation: "", notes: "",
    };
    await putCloudEntity(target, "writings", writing.id, writing);
    await target.put("progress", {
      ...progressFor("TI-BD-003", "2026-10-13"), percent: 20, status: "em andamento",
    });
    const beforeOutbox = await target.getAll("syncOutbox");
    target.close();
    await expect(importPedagogicalBackup({
      ...emptyV2(),
      writings: [{ ...writing, text: "Backup não deve sobrescrever" }],
      progress: [{ ...progressFor("TI-BD-003", "2026-10-13"), percent: 95, status: "em andamento" }],
    })).rejects.toThrow(/BACKUP_WRITING_SYNC_CONFLICT/);
    const verify = await db(scope);
    expect((await verify.get("writings", writing.id))?.text).toBe(writing.text);
    expect((await verify.get("progress", "TI-BD-003"))?.percent).toBe(20);
    expect(await verify.getAll("syncOutbox")).toEqual(beforeOutbox);
    verify.close();
  });

  it("não sobrescreve Writing em blocked_conflict ao importar BackupV2", async () => {
    const scope = await account("blocked-writing-restore");
    setActiveStudyScope(scope);
    const target = await db(scope);
    const writing = {
      id: "QA-WRITING-2", theme: "SQL", contentIds: ["TI-BD-003"],
      contestId: "CRBIO01-2026-ATI", text: "Texto local bloqueado",
      date: "2026-10-17", status: "rascunho" as const, evaluation: "", notes: "",
    };
    const entry = await putCloudEntity(target, "writings", writing.id, writing);
    await target.put("syncOutbox", { ...entry, status: "blocked_conflict" });
    target.close();
    await expect(importPedagogicalBackup({
      ...emptyV2(),
      writings: [{ ...writing, text: "Importação bloqueada" }],
    })).rejects.toThrow(/BACKUP_WRITING_SYNC_CONFLICT/);
    const verify = await db(scope);
    expect((await verify.get("writings", writing.id))?.text).toBe(writing.text);
    expect((await verify.get("syncOutbox", entry.id) as typeof entry).status).toBe("blocked_conflict");
    verify.close();
  });

});
