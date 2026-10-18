import { useEffect, useState } from "react";
import type { IDBPDatabase } from "idb";
import type { Writing } from "../types/schema";
import type { StudyDBV3 } from "../services/storage-db";
import {
  commitWritingConflictResolution,
  type ResolutionScopeGuard,
} from "../services/writing-conflict-commit";
import {
  readWritingResolutionStatus,
  type WritingResolutionView,
} from "../services/writing-conflict-status";
import type { WritingConflictChoice } from "../services/writing-conflict-resolution";
import { CloudConflictPanel } from "./CloudConflictPanel";

/** Trusted snapshot from the scoped local store, never assembled from URL params. */
export interface WritingConflictSnapshot {
  entityId: string;
  baseText: string | null;
  localPayload: Writing;
  remotePayload: Writing;
  remoteRevision: number;
  remoteChangeSeq: number;
  remotePayloadHash: string;
  blockedMutationIds: string[];
}

export interface WritingConflictResolutionControllerProps {
  db: IDBPDatabase<StudyDBV3>;
  guard: ResolutionScopeGuard;
  snapshot: WritingConflictSnapshot;
}

export function WritingConflictResolutionController({
  db,
  guard,
  snapshot,
}: WritingConflictResolutionControllerProps) {
  const [choice, setChoice] = useState<WritingConflictChoice | null>(null);
  const [mergedText, setMergedText] = useState("");
  const [audit, setAudit] = useState<WritingResolutionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void readWritingResolutionStatus(db, guard, snapshot.entityId)
      .then((record) => { if (mounted) setAudit(record); })
      .catch((cause: unknown) => {
        if (mounted) setError(cause instanceof Error ? cause.message : "Não foi possível conferir o conflito.");
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [db, guard, snapshot.entityId]);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const result = await readWritingResolutionStatus(db, guard, snapshot.entityId);
      if (!guard.isCurrent()) return;
      setAudit(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível confirmar o status.");
    } finally {
      setBusy(false);
    }
  }

  async function stage() {
    if (loading || busy || audit || choice === null || !guard.isCurrent()) return;
    if (choice === "merged" && !mergedText.trim()) {
      setError("Escreva e revise o texto mesclado antes de confirmar.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await commitWritingConflictResolution(db, guard, {
        entityId: snapshot.entityId,
        expectedLocal: snapshot.localPayload,
        remotePayload: snapshot.remotePayload,
        remoteRevision: snapshot.remoteRevision,
        remoteChangeSeq: snapshot.remoteChangeSeq,
        remotePayloadHash: snapshot.remotePayloadHash,
        blockedMutationIds: snapshot.blockedMutationIds,
        choice,
        mergedPayload: choice === "merged"
          ? { ...snapshot.localPayload, text: mergedText }
          : undefined,
      });
      if (!guard.isCurrent()) return;
      // Local staging is NOT a successful CAS or a synchronized cloud copy.
      setAudit({
        auditId: result.auditId,
        mutationId: result.entry.mutationId,
        state: "awaiting_cas",
        choice,
      });
      setChoice(null);
    } catch (cause) {
      if (guard.isCurrent())
        setError(cause instanceof Error ? cause.message : "A decisão não foi gravada.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status">Conferindo o histórico local do conflito…</p>;

  if (audit) {
    const labels = {
      awaiting_cas: "Decisão registrada neste dispositivo. Aguardando confirmação remota CAS; conflito ainda não resolvido.",
      cas_applied: "Confirmação CAS registrada na auditoria local. O conflito pode ser considerado aplicado somente para esta mutação.",
      cas_conflict: "O servidor informou novo conflito. Nenhuma versão será descartada; revise os dados atualizados.",
      needs_review: "Erro de integridade ou validação. Requer revisão técnica, sem descartar nenhuma versão.",
    } as const;
    return (
      <section className="card" aria-labelledby="writing-resolution-status-title">
        <h2 id="writing-resolution-status-title">Status da decisão Writing</h2>
        <p role="status" aria-live="polite">{labels[audit.state]}</p>
        <p>Identificador de auditoria local: <code>{audit.auditId}</code></p>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          Conferir confirmação no armazenamento local
        </button>
        {error && <p role="alert" className="notice error">{error}</p>}
      </section>
    );
  }

  return (
    <section aria-label="Revisão explícita do conflito Writing">
      {error && <p role="alert" className="notice error">{error}</p>}
      <CloudConflictPanel
        writings={[{
          id: snapshot.entityId,
          baseText: snapshot.baseText,
          localText: snapshot.localPayload.text,
          remoteText: snapshot.remotePayload.text,
        }]}
        openActivityIds={[]}
        integrityConflicts={[]}
        onResolveWriting={(_id, next) => {
          setChoice(next);
          setError("");
          if (next === "merged") setMergedText(snapshot.localPayload.text);
        }}
        onSelectPrimaryActivity={() => undefined}
      />
      {choice && (
        <section className="card section-space" aria-labelledby="writing-confirm-choice">
          <h3 id="writing-confirm-choice">Confirme a escolha antes da gravação local</h3>
          <p>Esta ação substitui a cadeia local bloqueada por uma nova mutação pendente. O histórico anterior será preservado. A confirmação remota CAS será necessária.</p>
          <p>Versão escolhida: <strong>{choice === "local" ? "deste dispositivo" : choice === "remote" ? "da nuvem" : "texto mesclado"}</strong></p>
          {choice === "merged" && (
            <label className="section-space">
              Texto mesclado editável
              <textarea
                value={mergedText}
                onChange={(event) => setMergedText(event.target.value)}
                rows={8}
                aria-label="Texto mesclado editável"
              />
            </label>
          )}
          <button type="button" disabled={busy || !guard.isCurrent()} onClick={() => void stage()}>
            Confirmar decisão local (aguardar CAS)
          </button>{" "}
          <button type="button" disabled={busy} onClick={() => setChoice(null)}>
            Voltar sem gravar
          </button>
        </section>
      )}
    </section>
  );
}
