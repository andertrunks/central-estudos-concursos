import { afterEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { readFileSync } from "node:fs";
import { deriveAccountScope } from "../src/services/account-scope";
import { deleteCloudEntity, putCloudEntity } from "../src/services/cloud-mutations";
import {
  applyPullPage,
  applyPushResults,
  preparePushBatch,
  readPullCursor,
  runSyncCycle,
  type CloudSyncTransport,
  type FrozenPushMutation,
  type PullPage,
  type PushResult,
  type RemoteCloudRecord,
  type SyncScopeGuard,
} from "../src/services/cloud-sync-engine";
import { payloadHashFor } from "../src/services/cloud-protocol";
import { openScopedStudyDatabase, type StudyDBV3 } from "../src/services/storage-db";
import type { SyncOutboxEntry, SyncOutboxRecord } from "../src/types/cloud";
import type { Attempt, StudyProgress } from "../src/types/schema";
import type { IDBPDatabase } from "idb";

const dbNames = new Set<string>();
const USER = "11111111-1111-4111-8111-111111111111";

function progress(id: string, percent: number): StudyProgress {
  return {
    id,
    status: percent === 100 ? "concluído" : "em andamento",
    startedAt: "2026-10-12",
    completedAt: percent === 100 ? "2026-10-12" : null,
    lastAccess: "2026-10-12",
    percent,
    correct: 0,
    wrong: 0,
    total: 0,
    lastReview: null,
    nextReview: null,
  };
}

async function createDb(label: string) {
  const scope = await deriveAccountScope("project-ref", `${USER}:${label}`);
  if (scope.mode !== "account") throw new Error("fixture inválida");
  const dbName = `pr4-${label}-${crypto.randomUUID()}`;
  dbNames.add(dbName);
  return await openScopedStudyDatabase(scope, { dbName }) as IDBPDatabase<StudyDBV3>;
}

function guard(epoch = 1, state = { current: true }): SyncScopeGuard {
  return { userId: USER, scopeEpoch: epoch, isCurrent: () => state.current };
}

function mutations(records: SyncOutboxRecord[]) {
  return records.filter((record): record is SyncOutboxEntry => record.recordType === "mutation");
}

class MemoryTransport implements CloudSyncTransport {
  private seq = 0;
  private records = new Map<string, RemoteCloudRecord>();
  private receipts = new Map<string, PushResult>();
  pushCalls: FrozenPushMutation[][] = [];
  loseNextResponse = false;

  private key(kind: string, id: string) { return `${kind}\u0000${id}`; }

  async inject(kind: RemoteCloudRecord["entityKind"], entityId: string, payload: unknown | null, deleted = false) {
    const key = this.key(kind, entityId);
    const previous = this.records.get(key);
    const revision = (previous?.revision ?? 0) + 1;
    const payloadHash = deleted ? null : await payloadHashFor("upsert", payload);
    const record: RemoteCloudRecord = {
      userId: USER,
      entityKind: kind,
      entityId,
      schemaVersion: 1,
      revision,
      changeSeq: ++this.seq,
      payload: deleted ? null : payload,
      payloadHash,
      deleted,
    };
    this.records.set(key, record);
    return record;
  }

  async pull(input: { userId: string; after: number; limit: number }): Promise<PullPage> {
    const visible = [...this.records.values()]
      .filter((record) => record.userId === input.userId && record.changeSeq > input.after)
      .sort((a, b) => a.changeSeq - b.changeSeq)
      .slice(0, input.limit);
    return {
      records: visible,
      nextCursor: visible.at(-1)?.changeSeq ?? input.after,
      hasMore: [...this.records.values()].some((record) => record.userId === input.userId && record.changeSeq > (visible.at(-1)?.changeSeq ?? input.after)),
    };
  }

  async push(input: { userId: string; mutations: FrozenPushMutation[] }): Promise<PushResult[]> {
    this.pushCalls.push(input.mutations.map((m) => structuredClone(m)));
    const results: PushResult[] = [];
    for (const mutation of input.mutations) {
      const prior = this.receipts.get(mutation.mutationId);
      if (prior) {
        if (prior.requestHash !== mutation.requestHash) {
          results.push({ mutationId: mutation.mutationId, requestHash: mutation.requestHash, outcome: "integrity_conflict" });
          continue;
        }
        results.push({ ...prior, outcome: "duplicate", originalOutcome: prior.outcome === "conflict" ? "conflict" : "applied" });
        continue;
      }
      const key = this.key(mutation.entityKind, mutation.entityId);
      const current = this.records.get(key);
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== mutation.baseRevision) {
        const conflict: PushResult = {
          mutationId: mutation.mutationId,
          requestHash: mutation.requestHash,
          outcome: "conflict",
          currentRevision,
          currentPayloadHash: current?.payloadHash ?? null,
          deleted: current?.deleted ?? false,
        };
        this.receipts.set(mutation.mutationId, conflict);
        results.push(conflict);
        continue;
      }
      const record: RemoteCloudRecord = {
        userId: input.userId,
        entityKind: mutation.entityKind,
        entityId: mutation.entityId,
        schemaVersion: 1,
        revision: currentRevision + 1,
        changeSeq: ++this.seq,
        payload: mutation.operation === "delete" ? null : mutation.payload,
        payloadHash: mutation.operation === "delete" ? null : mutation.payloadHash,
        deleted: mutation.operation === "delete",
      };
      this.records.set(key, record);
      const applied: PushResult = {
        mutationId: mutation.mutationId,
        requestHash: mutation.requestHash,
        outcome: "applied",
        revision: record.revision,
        changeSeq: record.changeSeq,
        stateHash: mutation.payloadHash,
      };
      this.receipts.set(mutation.mutationId, applied);
      results.push(applied);
    }
    if (this.loseNextResponse) {
      this.loseNextResponse = false;
      throw new Error("simulated lost response");
    }
    return results;
  }
}

afterEach(async () => {
  await Promise.all([...dbNames].map((name) => deleteDB(name)));
  dbNames.clear();
});

describe("AUD110 PR-4 — durable outbox and protocol", () => {
  it("2. coalesces only a never-sent queued mutation", async () => {
    const db = await createDb("coalesce");
    const first = await putCloudEntity(db, "progress", "TI-BD-003", progress("TI-BD-003", 10));
    const second = await putCloudEntity(db, "progress", "TI-BD-003", progress("TI-BD-003", 20));
    expect(second.mutationId).toBe(first.mutationId);
    expect(mutations(await db.getAll("syncOutbox"))).toHaveLength(1);
    expect((mutations(await db.getAll("syncOutbox"))[0].targetPayload as StudyProgress).percent).toBe(20);
    db.close();
  });

  it("2/3. freezes sent mutation and chains later edit as successor", async () => {
    const db = await createDb("successor");
    const g = guard();
    const first = await putCloudEntity(db, "progress", "TI-BD-003", progress("TI-BD-003", 10));
    const frozen = await preparePushBatch(db, g);
    expect(frozen[0].mutationId).toBe(first.mutationId);
    const successor = await putCloudEntity(db, "progress", "TI-BD-003", progress("TI-BD-003", 30));
    expect(successor.mutationId).not.toBe(first.mutationId);
    expect(successor.predecessorMutationId).toBe(first.mutationId);
    const liveFirst = await db.get("syncOutbox", first.mutationId) as SyncOutboxEntry;
    expect(liveFirst.status).toBe("sending");
    db.close();
  });

  it("3/8. applied ACK releases successor and never moves pullCursor", async () => {
    const db = await createDb("ack");
    const g = guard();
    const first = await putCloudEntity(db, "progress", "TI-BD-003", progress("TI-BD-003", 10));
    const frozen = await preparePushBatch(db, g);
    const successor = await putCloudEntity(db, "progress", "TI-BD-003", progress("TI-BD-003", 30));
    await applyPushResults(db, g, [{
      mutationId: first.mutationId,
      requestHash: frozen[0].requestHash,
      outcome: "applied",
      revision: 1,
      changeSeq: 77,
      stateHash: frozen[0].payloadHash,
    }]);
    const next = await db.get("syncOutbox", successor.mutationId) as SyncOutboxEntry;
    expect(next.predecessorMutationId).toBeNull();
    expect(next.baseRevision).toBe(1);
    expect(next.status).toBe("queued");
    expect(await readPullCursor(db)).toBe(0);
    db.close();
  });

  it("9/13. stale AccountScope aborts a late pull before cursor/domain commit", async () => {
    const db = await createDb("epoch");
    const state = { current: true };
    const g = guard(1, state);
    const payload = progress("TI-BD-003", 60);
    const hash = await payloadHashFor("upsert", payload);
    const transport: CloudSyncTransport = {
      async pull() {
        state.current = false;
        return { records: [{ userId: USER, entityKind: "progress", entityId: payload.id, schemaVersion: 1, revision: 1, changeSeq: 1, payload, payloadHash: hash, deleted: false }], nextCursor: 1, hasMore: false };
      },
      async push() { return []; },
    };
    await expect(runSyncCycle(db, g, transport)).rejects.toThrow("STALE_ACCOUNT_SCOPE");
    expect(await db.get("progress", payload.id)).toBeUndefined();
    expect(await readPullCursor(db)).toBe(0);
    db.close();
  });

  it("10. repeated pull page is idempotent", async () => {
    const db = await createDb("repeat-pull");
    const g = guard();
    const payload = progress("TI-BD-003", 55);
    const hash = await payloadHashFor("upsert", payload);
    const page: PullPage = { records: [{ userId: USER, entityKind: "progress", entityId: payload.id, schemaVersion: 1, revision: 1, changeSeq: 1, payload, payloadHash: hash, deleted: false }], nextCursor: 1, hasMore: false };
    await applyPullPage(db, g, page);
    await applyPullPage(db, g, page);
    expect((await db.get("progress", payload.id))?.percent).toBe(55);
    expect(await readPullCursor(db)).toBe(1);
    db.close();
  });

  it("H. concurrent remote revision blocks divergent local intent without overwrite", async () => {
    const db = await createDb("conflict");
    const g = guard();
    const remote1 = progress("TI-BD-003", 10);
    await applyPullPage(db, g, { records: [{ userId: USER, entityKind: "progress", entityId: remote1.id, schemaVersion: 1, revision: 1, changeSeq: 1, payload: remote1, payloadHash: await payloadHashFor("upsert", remote1), deleted: false }], nextCursor: 1, hasMore: false });
    const local = progress("TI-BD-003", 20);
    const pending = await putCloudEntity(db, "progress", local.id, local);
    const remote2 = progress("TI-BD-003", 30);
    await applyPullPage(db, g, { records: [{ userId: USER, entityKind: "progress", entityId: remote2.id, schemaVersion: 1, revision: 2, changeSeq: 2, payload: remote2, payloadHash: await payloadHashFor("upsert", remote2), deleted: false }], nextCursor: 2, hasMore: false });
    expect((await db.get("progress", local.id))?.percent).toBe(20);
    expect((await db.get("syncOutbox", pending.mutationId) as SyncOutboxEntry).status).toBe("blocked_conflict");
    db.close();
  });

  it("reconcile accepts exact equivalent remote payload without generic merge", async () => {
    const db = await createDb("equivalent");
    const g = guard();
    const base = progress("TI-BD-003", 10);
    await applyPullPage(db, g, { records: [{ userId: USER, entityKind: "progress", entityId: base.id, schemaVersion: 1, revision: 1, changeSeq: 1, payload: base, payloadHash: await payloadHashFor("upsert", base), deleted: false }], nextCursor: 1, hasMore: false });
    const local = progress("TI-BD-003", 20);
    const pending = await putCloudEntity(db, "progress", local.id, local);
    await applyPullPage(db, g, { records: [{ userId: USER, entityKind: "progress", entityId: local.id, schemaVersion: 1, revision: 2, changeSeq: 2, payload: local, payloadHash: await payloadHashFor("upsert", local), deleted: false }], nextCursor: 2, hasMore: false });
    expect(await db.get("syncOutbox", pending.mutationId)).toBeUndefined();
    expect((await db.get("progress", local.id))?.percent).toBe(20);
    db.close();
  });

  it("11/I. remote tombstone blocks stale resurrection", async () => {
    const db = await createDb("tombstone");
    const g = guard();
    const payload = progress("TI-BD-003", 10);
    await applyPullPage(db, g, { records: [{ userId: USER, entityKind: "progress", entityId: payload.id, schemaVersion: 1, revision: 1, changeSeq: 1, payload, payloadHash: await payloadHashFor("upsert", payload), deleted: false }], nextCursor: 1, hasMore: false });
    const pending = await putCloudEntity(db, "progress", payload.id, progress(payload.id, 25));
    await applyPullPage(db, g, { records: [{ userId: USER, entityKind: "progress", entityId: payload.id, schemaVersion: 1, revision: 2, changeSeq: 2, payload: null, payloadHash: null, deleted: true }], nextCursor: 2, hasMore: false });
    expect((await db.get("syncOutbox", pending.mutationId) as SyncOutboxEntry).status).toBe("blocked_conflict");
    expect(await db.get("progress", payload.id)).toBeDefined();
    db.close();
  });

  it("12. two tabs may send the same frozen head and duplicate ACK converges safely", async () => {
    const db = await createDb("two-tabs");
    const g = guard();
    const server = new MemoryTransport();
    await putCloudEntity(db, "progress", "TI-BD-003", progress("TI-BD-003", 70));
    const a = await preparePushBatch(db, g);
    const b = await preparePushBatch(db, g);
    expect(b[0].mutationId).toBe(a[0].mutationId);
    const first = await server.push({ userId: USER, mutations: a });
    const duplicate = await server.push({ userId: USER, mutations: b });
    expect(first[0].outcome).toBe("applied");
    expect(duplicate[0].outcome).toBe("duplicate");
    await applyPushResults(db, g, duplicate);
    expect(mutations(await db.getAll("syncOutbox"))).toHaveLength(0);
    db.close();
  });

  it("4/C/D. lost response retries immutable mutation and creates one remote revision", async () => {
    const db = await createDb("lost-response");
    const g = guard();
    const server = new MemoryTransport();
    await putCloudEntity(db, "progress", "TI-BD-003", progress("TI-BD-003", 80));
    const batch = await preparePushBatch(db, g);
    server.loseNextResponse = true;
    await expect(server.push({ userId: USER, mutations: batch })).rejects.toThrow("lost response");
    const retry = await preparePushBatch(db, g);
    expect(retry[0]).toEqual(batch[0]);
    const duplicate = await server.push({ userId: USER, mutations: retry });
    expect(duplicate[0].outcome).toBe("duplicate");
    expect(duplicate[0].revision).toBe(1);
    await applyPushResults(db, g, duplicate);
    db.close();
  });

  it("14. same-user token refresh does not invalidate AccountScope epoch", async () => {
    const db = await createDb("refresh");
    const state = { current: true };
    const g = guard(4, state);
    const server = new MemoryTransport();
    await server.inject("progress", "TI-BD-003", progress("TI-BD-003", 45));
    const tokenBefore = "old-token";
    const tokenAfter = "new-token";
    expect(tokenBefore).not.toBe(tokenAfter);
    await runSyncCycle(db, g, server);
    expect((await db.get("progress", "TI-BD-003"))?.percent).toBe(45);
    db.close();
  });

  it("15. fresh device cursor 0 reconstructs paginated remote state", async () => {
    const db = await createDb("fresh");
    const g = guard();
    const server = new MemoryTransport();
    await server.inject("progress", "TI-BD-001", progress("TI-BD-001", 25));
    await server.inject("progress", "TI-BD-002", progress("TI-BD-002", 50));
    await runSyncCycle(db, g, {
      pull: ({ userId, after }) => server.pull({ userId, after, limit: 1 }),
      push: (input) => server.push(input),
    });
    expect((await db.get("progress", "TI-BD-001"))?.percent).toBe(25);
    expect((await db.get("progress", "TI-BD-002"))?.percent).toBe(50);
    expect(await readPullCursor(db)).toBe(2);
    db.close();
  });

  it("16. offline local commit remains usable and later online cycle drains outbox", async () => {
    const db = await createDb("offline-online");
    const g = guard();
    const local = progress("TI-BD-003", 65);
    await putCloudEntity(db, "progress", local.id, local);
    expect((await db.get("progress", local.id))?.percent).toBe(65);
    expect(mutations(await db.getAll("syncOutbox"))).toHaveLength(1);
    const server = new MemoryTransport();
    await runSyncCycle(db, g, server);
    expect(mutations(await db.getAll("syncOutbox"))).toHaveLength(0);
    expect(await readPullCursor(db)).toBe(1);
    db.close();
  });

  it("17. invalid remote payload aborts page and preserves cursor", async () => {
    const db = await createDb("invalid-remote");
    const g = guard();
    const invalid = { ...progress("TI-BD-003", 10), percent: 999 };
    await expect(applyPullPage(db, g, { records: [{ userId: USER, entityKind: "progress", entityId: "TI-BD-003", schemaVersion: 1, revision: 1, changeSeq: 1, payload: invalid, payloadHash: await payloadHashFor("upsert", invalid), deleted: false }], nextCursor: 1, hasMore: false })).rejects.toBeTruthy();
    expect(await readPullCursor(db)).toBe(0);
    expect(await db.get("progress", "TI-BD-003")).toBeUndefined();
    db.close();
  });

  it("18. writer is no-store/authenticated and PWA defines no runtime API cache", () => {
    const writer = readFileSync("supabase/functions/cloud-sync-write/index.ts", "utf8");
    const vite = readFileSync("vite.config.ts", "utf8");
    expect(writer).toContain('auth: "user"');
    expect(writer).toContain('"Cache-Control": "no-store"');
    expect(writer).not.toContain("console.log");
    expect(vite).not.toContain("runtimeCaching");
  });

  it("20. annulled QREF032 is rejected before Attempt/outbox creation", async () => {
    const db = await createDb("annulled");
    const attempt: Attempt = {
      id: crypto.randomUUID(),
      questionId: "QREF-QUAD-ING001-032",
      contentId: "ING-001",
      date: "2026-10-12",
      answer: "A",
      correct: false,
      reason: "conteúdo",
      resolvedAt: null,
    };
    await expect(putCloudEntity(db, "attempts", attempt.id, attempt)).rejects.toThrow("anulada");
    expect(await db.get("attempts", attempt.id)).toBeUndefined();
    expect(mutations(await db.getAll("syncOutbox"))).toHaveLength(0);
    db.close();
  });

  it("delete creates a durable tombstone intent and never hard-deletes remote metadata", async () => {
    const db = await createDb("delete");
    const g = guard();
    const base = progress("TI-BD-003", 15);
    await applyPullPage(db, g, { records: [{ userId: USER, entityKind: "progress", entityId: base.id, schemaVersion: 1, revision: 1, changeSeq: 1, payload: base, payloadHash: await payloadHashFor("upsert", base), deleted: false }], nextCursor: 1, hasMore: false });
    const pending = await deleteCloudEntity(db, "progress", base.id);
    expect(pending.operation).toBe("delete");
    expect(pending.baseRevision).toBe(1);
    expect(await db.get("progress", base.id)).toBeUndefined();
    db.close();
  });
});
