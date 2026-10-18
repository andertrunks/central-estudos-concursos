import { afterEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { deriveAccountScope } from "../src/services/account-scope";
import {
  activeStudyScopeForAdoption,
  copyLegacyIntoAccount,
  keepLegacyLocalOnly,
  pauseCloudSync,
  readAdoptionDecision,
  resumeCloudSync,
  startEmptyAccount,
  summarizeLegacyProgress,
} from "../src/services/cloud-adoption";
import { ANNULLED_ING001_032 } from "../src/services/cloud-protocol";
import { inspectLocalCloudConsistency } from "../src/services/cloud-local-consistency";
import { adoptionChoiceStamp, openSyncMetaDatabase, updateCloudSyncPreference, writeCloudAdoptionSettings } from "../src/services/sync-meta";
import { openLegacyStudyDatabase, openScopedStudyDatabase } from "../src/services/storage-db";
import type { CloudAdoptionSettings } from "../src/services/sync-meta";
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

function decision(choice: CloudAdoptionSettings["choice"]): CloudAdoptionSettings {
  return {
    id: "adoption",
    choice,
    adopted: true,
    syncEnabled: false,
    decidedAt: "2026-10-13T10:00:00.000Z",
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
  it("ativa AccountScope somente para B/C; A e decisão ausente ficam no legado", async () => {
    const { scope } = await fixture("scope-selection");
    expect(activeStudyScopeForAdoption(scope, null).mode).toBe("off");
    expect(activeStudyScopeForAdoption(scope, decision("local_only")).mode).toBe("off");
    expect(activeStudyScopeForAdoption(scope, decision("copy_legacy"))).toEqual(scope);
    expect(activeStudyScopeForAdoption(scope, decision("empty_account"))).toEqual(scope);
    expect(activeStudyScopeForAdoption(null, decision("copy_legacy")).mode).toBe("off");
  });

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
    const saved = await keepLegacyLocalOnly(scope, "2026-10-13T10:00:00.000Z");
    expect(saved.choice).toBe("local_only");
    expect(saved.syncEnabled).toBe(false);
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
    const saved = await startEmptyAccount(empty.scope, "2026-10-13T10:00:00.000Z");
    expect(saved.choice).toBe("empty_account");
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

  it("pausa e reativa sem apagar estado e exige reconciliação após reativar", async () => {
    const { scope } = await fixture("pause-resume");
    await startEmptyAccount(scope, "2026-10-13T10:00:00.000Z");
    const account = raw(await openScopedStudyDatabase(scope));
    await account.put("progress", progress(73));
    account.close();

    const resumed = await resumeCloudSync(scope, "2026-10-13T10:05:00.000Z");
    expect(resumed.syncEnabled).toBe(true);
    expect(resumed.reconcileRequired).toBe(true);
    expect(resumed.syncPreferenceUpdatedAt).toBe("2026-10-13T10:05:00.000Z");

    const paused = await pauseCloudSync(scope, "2026-10-13T10:06:00.000Z");
    expect(paused.syncEnabled).toBe(false);
    expect(paused.reconcileRequired).toBe(true);

    const afterPause = raw(await openScopedStudyDatabase(scope));
    expect((await afterPause.get("progress", "TI-BD-003") as StudyProgress | undefined)?.percent).toBe(73);
    expect(await afterPause.count("syncOutbox")).toBe(0);
    afterPause.close();

    const resumedAgain = await resumeCloudSync(scope, "2026-10-13T10:07:00.000Z");
    expect(resumedAgain.syncEnabled).toBe(true);
    expect(resumedAgain.reconcileRequired).toBe(true);
  });

  it("não permite reativar sync enquanto a opção A mantém o estudo no legado", async () => {
    const { scope } = await fixture("local-only-resume");
    await keepLegacyLocalOnly(scope, "2026-10-13T10:00:00.000Z");
    await expect(resumeCloudSync(scope)).rejects.toThrow(/Copie ou inicie/);
    expect((await readAdoptionDecision(scope))?.syncEnabled).toBe(false);
  });
  it("bloqueia reativação se o recibo de adoção StudyDB não corresponde ao SyncMetaDB", async () => {
    const { scope, legacyDbName } = await fixture("adoption-mismatch");
    const adopted = await copyLegacyIntoAccount(scope, "2026-10-13T10:00:00.000Z", legacyDbName);
    await writeCloudAdoptionSettings(scope, { ...adopted, sourceFingerprint: "sha256:unexpected" });
    const check = await inspectLocalCloudConsistency(scope);
    expect(check.readyForExplicitResume).toBe(false);
    expect(check.reasons).toContain("BOOTSTRAP_FINGERPRINT_MISMATCH");
    await expect(resumeCloudSync(scope)).rejects.toThrow(/CLOUD_LOCAL_CONSISTENCY_BLOCKED/);
    expect((await readAdoptionDecision(scope))?.syncEnabled).toBe(false);
    const study = raw(await openScopedStudyDatabase(scope));
    expect((await study.get("progress", "TI-BD-003") as StudyProgress)?.percent).toBe(42);
    study.close();
  });

  it("detecta receipt StudyDB órfão após falha SyncMetaDB e permite reexecução idempotente explícita", async () => {
    const { scope, legacyDbName } = await fixture("missing-meta");
    await copyLegacyIntoAccount(scope, "2026-10-13T10:00:00.000Z", legacyDbName);
    const meta = await openSyncMetaDatabase(scope);
    await meta.delete("settings", "adoption");
    meta.close();

    const blocked = await inspectLocalCloudConsistency(scope);
    expect(blocked.readyForExplicitResume).toBe(false);
    expect(blocked.reasons).toContain("ADOPTION_METADATA_MISSING");
    expect(blocked.reasons).toContain("BOOTSTRAP_ADOPTION_MISMATCH");
    await expect(resumeCloudSync(scope)).rejects.toThrow(/CLOUD_LOCAL_CONSISTENCY_BLOCKED/);

    const rerun = await copyLegacyIntoAccount(scope, "2026-10-13T10:01:00.000Z", legacyDbName);
    expect(rerun.syncEnabled).toBe(false);
    expect((await inspectLocalCloudConsistency(scope)).readyForExplicitResume).toBe(true);
    const study = raw(await openScopedStudyDatabase(scope));
    expect(await study.count("progress")).toBe(1);
    study.close();
  });

  it("não habilita sync com conflitos exclusivos do SyncMetaDB até revisão explícita", async () => {
    const { scope } = await fixture("meta-conflict");
    await startEmptyAccount(scope);
    const meta = await openSyncMetaDatabase(scope);
    await meta.put("conflicts", {
      id: "qa-conflict", entityType: "writings", entityId: "QA-WRITING",
      localPayload: { text: "local fictício" }, remotePayload: { text: "remoto fictício" },
      detectedAt: "2026-10-17T10:00:00.000Z",
    });
    meta.close();
    const check = await inspectLocalCloudConsistency(scope);
    expect(check.reasons).toContain("SYNC_META_CONFLICTS_PRESENT");
    await expect(resumeCloudSync(scope)).rejects.toThrow(/SYNC_META_CONFLICTS_PRESENT/);
    expect((await readAdoptionDecision(scope))?.syncEnabled).toBe(false);
    const metadata = await openSyncMetaDatabase(scope);
    expect(await metadata.count("conflicts")).toBe(1);
    await metadata.delete("conflicts", "qa-conflict");
    metadata.close();
    const resumed = await resumeCloudSync(scope);
    expect(resumed.syncEnabled).toBe(true);
    expect(resumed.reconcileRequired).toBe(true);
  });

  it("recusa reativação com mutação Writing bloqueada no StudyDB sem perder o dado", async () => {
    const { scope } = await fixture("blocked-outbox");
    await startEmptyAccount(scope);
    const study = raw(await openScopedStudyDatabase(scope));
    await study.put("syncOutbox", {
      id: "qa-blocked", recordType: "mutation", mutationId: "qa-blocked",
      entityKind: "writing", entityId: "QA-WRITING", status: "blocked_conflict",
    });
    const check = await inspectLocalCloudConsistency(scope);
    expect(check.reasons).toContain("STUDY_DB_BLOCKED_MUTATION");
    await expect(resumeCloudSync(scope)).rejects.toThrow(/STUDY_DB_BLOCKED_MUTATION/);
    expect((await readAdoptionDecision(scope))?.syncEnabled).toBe(false);
    expect(await study.get("syncOutbox", "qa-blocked")).toBeDefined();
    study.close();
  });

  it("protege escopos de conta distintos e recusa preflight no legado", async () => {
    const a = await fixture("account-a");
    const b = await fixture("account-b");
    await startEmptyAccount(a.scope);
    await startEmptyAccount(b.scope);
    const aMeta = await openSyncMetaDatabase(a.scope);
    await aMeta.put("conflicts", {
      id: "qa-only-a", entityType: "writing", entityId: "QA-WR",
      localPayload: null, remotePayload: null,
      detectedAt: "2026-10-17T12:00:00.000Z",
    });
    aMeta.close();
    expect((await inspectLocalCloudConsistency(a.scope)).readyForExplicitResume).toBe(false);
    expect((await inspectLocalCloudConsistency(b.scope)).readyForExplicitResume).toBe(true);
    await expect(inspectLocalCloudConsistency({ mode: "off", scopeHash: null, studyDbName: "central-estudos", syncMetaDbName: null }))
      .rejects.toThrow(/ACCOUNT_REQUIRED/);
  });

  it("recusa preferência após mudança da conta durante transação e faz rollback", async () => {
    const { scope } = await fixture("epoch-during-transaction");
    await startEmptyAccount(scope);
    let checks = 0;
    const guard = { isCurrent: () => ++checks < 7 };
    await expect(resumeCloudSync(scope, "2026-10-17T23:55:00.000Z", guard))
      .rejects.toThrow(/STALE_ACCOUNT_SCOPE/);
    expect(checks).toBeGreaterThanOrEqual(7);
    const decision = await readAdoptionDecision(scope);
    expect(decision?.syncEnabled).toBe(false);
    expect(decision?.syncPreferenceUpdatedAt).toBeUndefined();
  });

  it("impede ativação se a decisão SyncMetaDB mudar entre preflight e commit", async () => {
    const { scope } = await fixture("preflight-choice-race");
    const adopted = await startEmptyAccount(scope);
    const stamp = adoptionChoiceStamp(adopted);
    await writeCloudAdoptionSettings(scope, {
      ...adopted,
      decidedAt: "2026-10-17T23:57:00.000Z",
    });
    await expect(updateCloudSyncPreference(scope, true, "2026-10-17T23:58:00.000Z", {
      expectedChoiceStamp: stamp,
    })).rejects.toThrow(/CLOUD_ADOPTION_CHANGED_AFTER_PREFLIGHT/);
    expect((await readAdoptionDecision(scope))?.syncEnabled).toBe(false);
  });

  it("transação SyncMetaDB recusa conflito recém-criado entre inspeção e gravação", async () => {
    const { scope } = await fixture("late-legacy-conflict");
    await startEmptyAccount(scope);
    const before = await inspectLocalCloudConsistency(scope);
    expect(before.readyForExplicitResume).toBe(true);
    const meta = await openSyncMetaDatabase(scope);
    await meta.put("conflicts", {
      id: "qa-late-conflict", entityType: "writing", entityId: "QA-WRITING-1",
      localPayload: { text: "fictício A" }, remotePayload: { text: "fictício B" },
      detectedAt: "2026-10-17T23:59:00.000Z",
    });
    meta.close();
    await expect(updateCloudSyncPreference(scope, true, "2026-10-17T23:59:30.000Z", {
      expectedChoiceStamp: before.observedChoiceStamp,
    })).rejects.toThrow(/SYNC_META_CONFLICTS_PRESENT/);
    expect((await readAdoptionDecision(scope))?.syncEnabled).toBe(false);
    const keep = await openSyncMetaDatabase(scope);
    expect(await keep.count("conflicts")).toBe(1);
    keep.close();
  });

  it("bloqueia reativação com auditoria Writing cas_conflict mesmo sem mutação ativa", async () => {
    const { scope } = await fixture("writing-audit-conflict");
    await startEmptyAccount(scope);
    const db = raw(await openScopedStudyDatabase(scope));
    await db.put("syncOutbox", {
      id: "__writing_conflict_audit__:qa", recordType: "writing_conflict_audit",
      entityKind: "writing", entityId: "QA-WRITING",
      resolutionMutationId: "qa", state: "cas_conflict",
      choice: "local", createdAt: "2026-10-17T23:58:00.000Z",
      previousLocal: { id: "QA-WRITING", text: "fictício" },
      previousRemoteRevision: 2, supersededMutations: [],
    });
    db.close();
    const check = await inspectLocalCloudConsistency(scope);
    expect(check.reasons).toContain("STUDY_DB_UNRESOLVED_WRITING_AUDIT");
    await expect(resumeCloudSync(scope)).rejects.toThrow(/STUDY_DB_UNRESOLVED_WRITING_AUDIT/);
    expect((await readAdoptionDecision(scope))?.syncEnabled).toBe(false);
    const verify = raw(await openScopedStudyDatabase(scope));
    expect(await verify.get("syncOutbox", "__writing_conflict_audit__:qa")).toBeDefined();
    verify.close();
  });

  it("recusa mutação poisoned de qualquer disciplina sem apagar progresso", async () => {
    const { scope } = await fixture("poisoned-account-outbox");
    await startEmptyAccount(scope);
    const db = raw(await openScopedStudyDatabase(scope));
    await db.put("progress", progress(53));
    await db.put("syncOutbox", {
      id: "qa-poisoned", recordType: "mutation", mutationId: "qa-poisoned",
      entityKind: "progress", entityId: "TI-BD-003", status: "poisoned",
    });
    db.close();
    const check = await inspectLocalCloudConsistency(scope);
    expect(check.reasons).toContain("STUDY_DB_BLOCKED_MUTATION");
    await expect(resumeCloudSync(scope)).rejects.toThrow(/STUDY_DB_BLOCKED_MUTATION/);
    const verify = raw(await openScopedStudyDatabase(scope));
    expect((await verify.get("progress", "TI-BD-003") as StudyProgress)?.percent).toBe(53);
    expect(await verify.get("syncOutbox", "qa-poisoned")).toBeDefined();
    verify.close();
  });

});
