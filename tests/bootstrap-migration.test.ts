import { afterEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { deriveAccountScope } from "../src/services/account-scope";
import {
  applyBootstrapPlan,
  previewBackupV1,
  previewLegacyBootstrap,
  rollbackBootstrap,
} from "../src/services/bootstrap-migration";
import { ANNULLED_ING001_032 } from "../src/services/cloud-protocol";
import { openLegacyStudyDatabase, openScopedStudyDatabase } from "../src/services/storage-db";
import type { BootstrapReceipt, SyncOutboxEntry } from "../src/types/cloud";
import type { StudyProgress } from "../src/types/schema";

const dbNames = new Set<string>();
const dbName = (label: string) => {
  const name = `pr5-${label}-${crypto.randomUUID()}`;
  dbNames.add(name);
  return name;
};

afterEach(async () => {
  await Promise.all([...dbNames].map((name) => deleteDB(name)));
  dbNames.clear();
});

const progress = (percent = 35): StudyProgress => ({
  id: "TI-BD-003",
  status: "em andamento",
  startedAt: "2026-10-12",
  completedAt: null,
  lastAccess: "2026-10-12",
  percent,
  correct: 1,
  wrong: 1,
  total: 2,
  lastReview: null,
  nextReview: "2026-10-14",
});

const backup = () => ({
  version: 1 as const,
  activities: [{
    id: "questoes:synthetic",
    kind: "questões" as const,
    contentId: "TI-BD-003",
    title: "Prática sintética",
    questionIds: [ANNULLED_ING001_032, "QAUT-SYNTH-001"],
    reviewIds: [],
    startedAt: "2026-10-12",
    completedAt: null,
    sequence: 1,
  }],
  progress: [progress()],
  reviews: [],
  attempts: [
    {
      id: "attempt-annulled",
      questionId: ANNULLED_ING001_032,
      contentId: "TI-BD-003",
      date: "2026-10-12",
      answer: "A",
      correct: false,
      reason: "conteúdo" as const,
      resolvedAt: null,
    },
    {
      id: "attempt-valid",
      questionId: "QAUT-SYNTH-001",
      contentId: "TI-BD-003",
      date: "2026-10-12",
      answer: "B",
      correct: true,
      reason: "conteúdo" as const,
      resolvedAt: null,
    },
  ],
  writings: [],
  results: [],
});

async function scope(label: string) {
  const result = await deriveAccountScope("central-test-project", label);
  if (result.mode !== "account") throw new Error("fixture sem AccountScope");
  dbNames.add(result.studyDbName);
  return result;
}

describe("PR-5 BOOTSTRAP — dry-run e fingerprint", () => {
  it("é determinístico, não aplica nada e exclui QREF032 do estado ativo", async () => {
    const target = await scope("preview-user");
    const first = await previewBackupV1(backup(), target);
    const second = await previewBackupV1(backup(), target);
    expect(first.sourceFingerprint).toBe(second.sourceFingerprint);
    expect(first.targetEmpty).toBe(true);
    expect(first.excludedAnnulledAttempts).toBe(1);
    expect(first.snapshot.attempts.map((attempt) => attempt.questionId)).toEqual(["QAUT-SYNTH-001"]);
    expect(first.snapshot.activities?.[0]?.questionIds).toEqual(["QAUT-SYNTH-001"]);
    const db = await openScopedStudyDatabase(target);
    expect(await (db as never as { count(store: string): Promise<number> }).count("progress")).toBe(0);
    expect(await (db as never as { count(store: string): Promise<number> }).count("syncOutbox")).toBe(0);
    db.close();
  });
});

describe("PR-5 BOOTSTRAP — apply local atômico", () => {
  it("aplica em AccountScope vazio, cria só receipt local e retry não duplica", async () => {
    const target = await scope("apply-user");
    const plan = await previewBackupV1(backup(), target);
    expect((await applyBootstrapPlan(plan, target, "2026-10-12T14:00:00.000Z")).status).toBe("applied");
    expect((await applyBootstrapPlan(plan, target, "2026-10-12T14:05:00.000Z")).status).toBe("already_applied");

    const db = await openScopedStudyDatabase(target);
    const raw = db as never as {
      get(store: string, key: string): Promise<unknown>;
      getAll(store: string): Promise<unknown[]>;
      count(store: string): Promise<number>;
    };
    expect((await raw.get("progress", "TI-BD-003") as StudyProgress).percent).toBe(35);
    expect(await raw.count("attempts")).toBe(1);
    const technical = await raw.getAll("syncOutbox");
    expect(technical).toHaveLength(1);
    expect((technical[0] as BootstrapReceipt).recordType).toBe("bootstrap");
    expect(technical.some((entry) => (entry as SyncOutboxEntry).recordType === "mutation")).toBe(false);
    db.close();
  });

  it("recusa alvo ocupado e preserva integralmente o dado que já existia", async () => {
    const target = await scope("occupied-user");
    const db = await openScopedStudyDatabase(target);
    await (db as never as { put(store: string, value: StudyProgress): Promise<IDBValidKey> }).put("progress", progress(91));
    db.close();
    const plan = await previewBackupV1(backup(), target);
    expect(plan.targetEmpty).toBe(false);
    await expect(applyBootstrapPlan(plan, target)).rejects.toThrow("não está vazio");
    const check = await openScopedStudyDatabase(target);
    expect(((await (check as never as { get(store: string, key: string): Promise<unknown> }).get("progress", "TI-BD-003")) as StudyProgress).percent).toBe(91);
    expect(await (check as never as { count(store: string): Promise<number> }).count("syncOutbox")).toBe(0);
    check.close();
  });
});

describe("PR-5 BOOTSTRAP — legado preservado e rollback", () => {
  it("copia legacy-v2 sem apagar origem e rollback restaura o alvo vazio", async () => {
    const legacyName = dbName("legacy");
    const legacy = await openLegacyStudyDatabase(legacyName);
    await legacy.put("progress", progress(44));
    await legacy.put("attempts", backup().attempts[0]);
    await legacy.put("attempts", backup().attempts[1]);
    await legacy.put("activities", backup().activities[0]);
    legacy.close();

    const target = await scope("legacy-target");
    const plan = await previewLegacyBootstrap(target, legacyName);
    expect(plan.sourceKind).toBe("legacy-v2");
    expect(plan.excludedAnnulledAttempts).toBe(1);
    await applyBootstrapPlan(plan, target, "2026-10-12T14:10:00.000Z");

    const sourceStillThere = await openLegacyStudyDatabase(legacyName);
    expect((await sourceStillThere.get("progress", "TI-BD-003"))?.percent).toBe(44);
    expect(await sourceStillThere.count("attempts")).toBe(2);
    sourceStillThere.close();

    expect((await rollbackBootstrap(target)).status).toBe("rolled_back");
    const check = await openScopedStudyDatabase(target);
    for (const store of ["activities", "progress", "reviews", "attempts", "writings", "results", "syncOutbox"])
      expect(await (check as never as { count(name: string): Promise<number> }).count(store)).toBe(0);
    check.close();
  });

  it("bloqueia rollback se o usuário já alterou o estado após a adoção", async () => {
    const target = await scope("changed-after-apply");
    const plan = await previewBackupV1(backup(), target);
    await applyBootstrapPlan(plan, target, "2026-10-12T14:15:00.000Z");
    const db = await openScopedStudyDatabase(target);
    await (db as never as { put(store: string, value: StudyProgress): Promise<IDBValidKey> }).put("progress", progress(77));
    db.close();
    await expect(rollbackBootstrap(target)).rejects.toThrow("estado local mudou");
    const check = await openScopedStudyDatabase(target);
    expect(((await (check as never as { get(store: string, key: string): Promise<unknown> }).get("progress", "TI-BD-003")) as StudyProgress).percent).toBe(77);
    expect(await (check as never as { count(store: string): Promise<number> }).count("syncOutbox")).toBe(1);
    check.close();
  });
});
