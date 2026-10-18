import { afterEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { deleteDB, type IDBPDatabase } from "idb";
import type { Writing } from "../src/types/schema";
import type {
  SyncOutboxEntry,
  WritingConflictResolutionAuditRecord,
} from "../src/types/cloud";
import { deriveAccountScope } from "../src/services/account-scope";
import { isMutationRecord, payloadHashFor } from "../src/services/cloud-protocol";
import {
  applyPullPage,
  applyPushResults,
  type SyncScopeGuard,
} from "../src/services/cloud-sync-engine";
import { putCloudEntity } from "../src/services/cloud-mutations";
import {
  commitWritingConflictResolution,
  type CommitWritingConflictInput,
} from "../src/services/writing-conflict-commit";
import { openScopedStudyDatabase, type StudyDBV3 } from "../src/services/storage-db";

const USER = "11111111-1111-4111-8111-111111111111";
const databases = new Set<string>();

function writing(text: string): Writing {
  return {
    id: "DISC-001",
    theme: "SQL",
    contentIds: ["TI-BD-003"],
    contestId: "CRBIO01-2026-ATI",
    text,
    date: "2026-10-17",
    status: "rascunho",
    evaluation: "",
    notes: "",
  };
}

function guard(scope = { current: true }): SyncScopeGuard {
  return { userId: USER, scopeEpoch: 1, isCurrent: () => scope.current };
}

async function createDb() {
  const scope = await deriveAccountScope("project-ref", USER);
  if (scope.mode !== "account") throw new Error("Test scope missing");
  const dbName = "pr6-writing-transaction-" + crypto.randomUUID();
  databases.add(dbName);
  return await openScopedStudyDatabase(scope, { dbName }) as IDBPDatabase<StudyDBV3>;
}

async function conflictFixture() {
  const db = await createDb();
  const g = guard();
  const first = writing("Remote before conflict");
  const remote = writing("Remote newer");
  const local = writing("Draft on this device");
  const initialHash = await payloadHashFor("upsert", first);
  const remoteHash = await payloadHashFor("upsert", remote);

  await applyPullPage(db, g, {
    records: [{
      userId: USER, entityKind: "writing", entityId: first.id,
      schemaVersion: 1, revision: 1, changeSeq: 1,
      payload: first, payloadHash: initialHash, deleted: false,
    }],
    nextCursor: 1,
    hasMore: false,
  });
  const previous = await putCloudEntity(db, "writings", local.id, local);
  await applyPullPage(db, g, {
    records: [{
      userId: USER, entityKind: "writing", entityId: remote.id,
      schemaVersion: 1, revision: 2, changeSeq: 2,
      payload: remote, payloadHash: remoteHash, deleted: false,
    }],
    nextCursor: 2,
    hasMore: false,
  });
  const blocked = await db.get("syncOutbox", previous.id) as SyncOutboxEntry;
  expect(blocked.status).toBe("blocked_conflict");

  const input: CommitWritingConflictInput = {
    entityId: local.id,
    expectedLocal: local,
    remotePayload: remote,
    remoteRevision: 2,
    remoteChangeSeq: 2,
    remotePayloadHash: remoteHash,
    blockedMutationIds: [blocked.mutationId],
    choice: "local",
    mutationId: "resolution-1",
    now: "2026-10-17T20:00:00.000Z",
  };
  return { db, g, input, previous, local, remote };
}

function mutations(records: unknown[]): SyncOutboxEntry[] {
  return records.filter(isMutationRecord);
}

async function allMutations(db: IDBPDatabase<StudyDBV3>) {
  return mutations(await db.getAll("syncOutbox"));
}

async function readAudit(db: IDBPDatabase<StudyDBV3>, mutationId = "resolution-1") {
  const row = await db.get("syncOutbox", "__writing_conflict_audit__:" + mutationId);
  if (row?.recordType !== "writing_conflict_audit") throw new Error("Missing audit");
  return row as WritingConflictResolutionAuditRecord;
}

afterEach(async () => {
  for (const name of databases) await deleteDB(name);
  databases.clear();
});

describe("PR-6 Writing local atomic conflict resolution staging", () => {
  it("archives the blocked chain and leaves exactly one queued head", async () => {
    const { db, g, input, previous, local } = await conflictFixture();
    const { entry } = await commitWritingConflictResolution(db, g, input);
    const heads = (await allMutations(db)).filter((item) => item.predecessorMutationId === null);
    expect(heads).toHaveLength(1);
    expect(heads[0]?.id).toBe(entry.id);
    expect(heads[0]?.status).toBe("queued");
    expect(heads[0]?.baseRevision).toBe(2);
    expect(heads[0]?.targetPayload).toEqual(local);
    expect(await db.get("syncOutbox", previous.id)).toBeUndefined();
    const audit = await readAudit(db);
    expect(audit.state).toBe("awaiting_cas");
    expect(audit.supersededMutations).toEqual([previous]);
    expect(audit.previousLocal).toEqual(local);
    expect((await db.get("writings", local.id))?.text).toBe(local.text);
    db.close();
  });

  it("marks audit as cas_applied only after the matching confirmed CAS ACK", async () => {
    const { db, g, input } = await conflictFixture();
    const { entry } = await commitWritingConflictResolution(db, g, input);
    expect((await readAudit(db)).state).toBe("awaiting_cas");
    await applyPushResults(db, g, [{
      mutationId: entry.id, requestHash: entry.requestHash,
      outcome: "applied", revision: 3, changeSeq: 3,
    }]);
    expect(await allMutations(db)).toHaveLength(0);
    const audit = await readAudit(db);
    expect(audit.state).toBe("cas_applied");
    expect(audit.supersededMutations).toHaveLength(1);
    db.close();
  });

  it("preserves the audit as a conflict if the CAS revision races", async () => {
    const { db, g, input } = await conflictFixture();
    const { entry } = await commitWritingConflictResolution(db, g, input);
    await applyPushResults(db, g, [{
      mutationId: entry.id, requestHash: entry.requestHash,
      outcome: "conflict", currentRevision: 4,
      currentPayloadHash: "sha256:changed", deleted: false,
    }]);
    expect((await readAudit(db)).state).toBe("cas_conflict");
    expect((await allMutations(db))[0]?.status).toBe("blocked_conflict");
    db.close();
  });

  it("rejects a stale remote revision without modifying Writing or the outbox", async () => {
    const { db, g, input, local, previous } = await conflictFixture();
    const metaId = "__cloud_remote__:writing:" + local.id;
    const meta = await db.get("syncOutbox", metaId);
    if (meta?.recordType !== "remote") throw new Error("Missing remote meta");
    await db.put("syncOutbox", { ...meta, revision: 3 });
    await expect(commitWritingConflictResolution(db, g, input))
      .rejects.toThrow(/REMOTE_CHANGED/);
    expect((await db.get("writings", local.id))?.text).toBe(local.text);
    expect((await db.get("syncOutbox", previous.id) as SyncOutboxEntry).status).toBe("blocked_conflict");
    expect(await db.get("syncOutbox", "__writing_conflict_audit__:resolution-1")).toBeUndefined();
    db.close();
  });

  it("rejects an unexpected concurrent head without replacing any mutation", async () => {
    const { db, g, input, previous } = await conflictFixture();
    const rogue = {
      ...previous, id: "rogue", mutationId: "rogue", status: "queued" as const,
      predecessorMutationId: null, requestHash: "rogue-hash",
    };
    await db.put("syncOutbox", rogue);
    await expect(commitWritingConflictResolution(db, g, input))
      .rejects.toThrow(/BLOCKED_CHAIN_CHANGED/);
    expect((await allMutations(db)).map((x) => x.id).sort()).toEqual([previous.id, "rogue"].sort());
    db.close();
  });

  it("refuses scope changes before any destructive work", async () => {
    const { db, input, previous, local } = await conflictFixture();
    await expect(commitWritingConflictResolution(db, guard({ current: false }), input))
      .rejects.toThrow(/STALE_ACCOUNT_SCOPE/);
    expect((await db.get("syncOutbox", previous.id) as SyncOutboxEntry).status).toBe("blocked_conflict");
    expect((await db.get("writings", local.id))?.text).toBe(local.text);
    db.close();
  });

  it("does not overwrite an existing mutation identifier", async () => {
    const { db, g, input, previous } = await conflictFixture();
    await db.put("syncOutbox", { ...previous, id: "resolution-1", mutationId: "resolution-1" });
    await expect(commitWritingConflictResolution(db, g, input))
      .rejects.toThrow(/MUTATION_ID_COLLISION|BLOCKED_CHAIN_CHANGED/);
    expect(await db.get("syncOutbox", previous.id)).toBeDefined();
    db.close();
  });

  it("rejects invalid merged structural identities with no local side effects", async () => {
    const { db, g, input, previous } = await conflictFixture();
    await expect(commitWritingConflictResolution(db, g, {
      ...input, choice: "merged",
      mergedPayload: { ...writing("merged text"), contentIds: ["MAT-001"] },
    })).rejects.toThrow(/MERGED_IDENTITY_MISMATCH/);
    expect(await db.get("syncOutbox", previous.id)).toBeDefined();
    db.close();
  });

  it("stages an explicit remote choice without silently declaring CAS success", async () => {
    const { db, g, input, remote } = await conflictFixture();
    const { entry } = await commitWritingConflictResolution(db, g, {
      ...input, choice: "remote",
    });
    expect(entry.status).toBe("queued");
    expect(entry.targetPayload).toEqual(remote);
    expect((await db.get("writings", remote.id))?.text).toBe(remote.text);
    expect((await readAudit(db)).state).toBe("awaiting_cas");
    db.close();
  });
});
