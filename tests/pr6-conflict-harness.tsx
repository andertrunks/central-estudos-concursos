import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { IDBPDatabase } from "idb";
import type { Writing } from "../src/types/schema";
import type { StudyDBV3 } from "../src/services/storage-db";
import { deriveAccountScope } from "../src/services/account-scope";
import { openScopedStudyDatabase } from "../src/services/storage-db";
import { payloadHashFor, isMutationRecord, remoteStateId } from "../src/services/cloud-protocol";
import { putCloudEntity } from "../src/services/cloud-mutations";
import {
  applyPullPage,
  applyPushResults,
  preparePushBatch,
  type SyncScopeGuard,
} from "../src/services/cloud-sync-engine";
import { readWritingResolutionStatus } from "../src/services/writing-conflict-status";
import {
  WritingConflictResolutionController,
  type WritingConflictSnapshot,
} from "../src/components/WritingConflictResolutionController";

/**
 * QA-only Vite-dev fixture, never imported by the application or its production
 * entrypoint. Fake identity, local IndexedDB and simulated CAS acknowledgements.
 * Do not configure a cloud endpoint or real learner data here.
 */
const testCase = new URL(window.location.href).searchParams.get("case") ?? "local";
if (!/^[a-z0-9-]{1,40}$/.test(testCase)) throw new Error("INVALID_QA_CASE");
const USER = "11111111-1111-4111-8111-111111111111";
const entityId = "QA-WRITING-1";
const local: Writing = {
  id: entityId, theme: "Texto fictício sobre SQL",
  contentIds: ["TI-BD-003"], contestId: "CRBIO01-2026-ATI",
  text: "Rascunho local fictício", date: "2026-10-17",
  status: "rascunho", evaluation: "", notes: "",
};
const first: Writing = { ...local, text: "Versão anterior fictícia" };
const remote: Writing = { ...local, text: "Versão remota fictícia" };
let scopeCurrent = true;
const guard: SyncScopeGuard = {
  userId: USER, scopeEpoch: 1, isCurrent: () => scopeCurrent,
};

async function fixture() {
  const scope = await deriveAccountScope("pr6-qa-only", USER);
  if (scope.mode !== "account") throw new Error("INVALID_QA_SCOPE");
  const db = await openScopedStudyDatabase(scope, {
    dbName: "pr6-harness-" + testCase,
  }) as IDBPDatabase<StudyDBV3>;
  const remoteHash = await payloadHashFor("upsert", remote);
  const existing = await db.get("writings", entityId);
  if (!existing) {
    await applyPullPage(db, guard, {
      records: [{
        userId: USER, entityKind: "writing", entityId,
        schemaVersion: 1, revision: 1, changeSeq: 1,
        payload: first, payloadHash: await payloadHashFor("upsert", first),
        deleted: false,
      }],
      nextCursor: 1, hasMore: false,
    });
    await putCloudEntity(db, "writings", entityId, local);
    await applyPullPage(db, guard, {
      records: [{
        userId: USER, entityKind: "writing", entityId,
        schemaVersion: 1, revision: 2, changeSeq: 2,
        payload: remote, payloadHash: remoteHash, deleted: false,
      }],
      nextCursor: 2, hasMore: false,
    });
  }

  const rows = await db.getAllFromIndex("syncOutbox", "by-entity", entityId);
  const blockedIds = rows.filter(isMutationRecord)
    .filter((row) => row.entityKind === "writing" && row.status === "blocked_conflict")
    .map((row) => row.mutationId);
  const snapshot: WritingConflictSnapshot = {
    entityId, baseText: first.text, localPayload: local,
    remotePayload: remote, remoteRevision: 2, remoteChangeSeq: 2,
    remotePayloadHash: remoteHash, blockedMutationIds: blockedIds,
  };
  return { db, snapshot };
}

function App({ db, snapshot }: {
  db: IDBPDatabase<StudyDBV3>; snapshot: WritingConflictSnapshot;
}) {
  const [message, setMessage] = useState("Fixture carregada; somente dados fictícios.");
  const [summary, setSummary] = useState("");
  const [epoch, setEpoch] = useState(0);

  async function inspect() {
    const rows = await db.getAllFromIndex("syncOutbox", "by-entity", entityId);
    const mutations = rows.filter(isMutationRecord);
    const active = mutations.filter((row) => row.predecessorMutationId === null);
    const writing = await db.get("writings", entityId);
    const audit = scopeCurrent
      ? await readWritingResolutionStatus(db, guard, entityId)
      : null;
    setSummary(JSON.stringify({
      heads: active.length,
      statuses: mutations.map((row) => row.status),
      text: writing?.text ?? null,
      audit: audit?.state ?? null,
    }));
  }

  async function fakeCas(outcome: "applied" | "conflict") {
    try {
      const audit = await readWritingResolutionStatus(db, guard, entityId);
      if (!audit || audit.state !== "awaiting_cas")
        throw new Error("NO_PENDING_QA_DECISION");
      const [mutation] = await preparePushBatch(db, guard);
      if (!mutation || mutation.mutationId !== audit.mutationId)
        throw new Error("NO_UNIQUE_QA_PUSH_HEAD");
      await applyPushResults(db, guard, [outcome === "applied"
        ? {
          mutationId: mutation.mutationId,
          requestHash: mutation.requestHash,
          outcome: "applied", revision: 3, changeSeq: 3,
        }
        : {
          mutationId: mutation.mutationId,
          requestHash: mutation.requestHash,
          outcome: "conflict", currentRevision: 4,
          currentPayloadHash: "sha256:simulated-later-change", deleted: false,
        },
      ]);
      setMessage(outcome === "applied"
        ? "QA: CAS fictício aplicado ao IndexedDB local."
        : "QA: conflito CAS fictício aplicado ao IndexedDB local.");
      await inspect();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro CAS QA");
    }
  }

  async function invalidateRemote() {
    const id = remoteStateId("writing", entityId);
    const record = await db.get("syncOutbox", id);
    if (record?.recordType !== "remote") throw new Error("QA_REMOTE_MISSING");
    await db.put("syncOutbox", { ...record, revision: record.revision + 1 });
    setMessage("QA: revisão remota modificada depois do preview.");
  }

  return (
    <main>
      <h1>QA isolado PR-6 — conflitos Writing</h1>
      <p>Ambiente local de desenvolvimento, conta e dados fictícios, sem rede cloud.</p>
      <p data-testid="qa-case">{testCase}</p>
      <p data-testid="qa-scope">{scopeCurrent ? "Conta QA válida" : "Conta QA alterada"}</p>
      <section aria-label="Controles de simulação exclusiva do QA">
        <button type="button" onClick={() => void inspect()}>QA inspecionar IndexedDB</button>{" "}
        <button type="button" onClick={() => void fakeCas("applied")}>QA aplicar CAS fictício</button>{" "}
        <button type="button" onClick={() => void fakeCas("conflict")}>QA simular novo conflito CAS</button>{" "}
        <button type="button" onClick={() => void invalidateRemote()}>QA mudar revisão remota</button>{" "}
        <button type="button" onClick={() => {
          scopeCurrent = false;
          setEpoch((x) => x + 1);
          setMessage("QA: escopo trocado; gravação bloqueada.");
        }}>QA trocar conta</button>
      </section>
      <p role="status" data-testid="qa-message">{message}</p>
      <output data-testid="qa-db-state">{summary}</output>
      <WritingConflictResolutionController
        key={entityId + String(epoch)}
        db={db}
        guard={guard}
        snapshot={snapshot}
      />
    </main>
  );
}

const { db, snapshot } = await fixture();
const target = document.getElementById("qa-root");
if (!target) throw new Error("QA_ROOT_MISSING");
createRoot(target).render(<App db={db} snapshot={snapshot} />);
