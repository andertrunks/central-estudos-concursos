import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CloudConflictPanel } from "../src/components/CloudConflictPanel";
import { WritingConflictResolutionController } from "../src/components/WritingConflictResolutionController";
import type { IDBPDatabase } from "idb";
import type { StudyDBV3 } from "../src/services/storage-db";

function render() {
  return renderToStaticMarkup(
    <CloudConflictPanel
      writings={[
        {
          id: "WRITING-1",
          baseText: "Base comum",
          localText: "Versão deste dispositivo",
          remoteText: "Versão da nuvem",
        },
      ]}
      openActivityIds={["ACTIVITY-A", "ACTIVITY-B"]}
      integrityConflicts={[
        {
          kind: "attempt",
          id: "ATTEMPT-1",
          message: "Divergência estrutural preservada.",
        },
      ]}
      onResolveWriting={vi.fn()}
      onSelectPrimaryActivity={vi.fn()}
    />,
  );
}

describe("PR-6 conflict UX foundation", () => {
  it("mostra base/local/remoto e três decisões explícitas para Writing", () => {
    const html = render();
    expect(html).toContain("Base comum");
    expect(html).toContain("Neste dispositivo");
    expect(html).toContain("Na nuvem");
    expect(html).toContain("Manter versão deste dispositivo");
    expect(html).toContain("Manter versão da nuvem");
    expect(html).toContain("Criar versão mesclada editável");
    expect(html).not.toContain("updated_at");
    expect(html).not.toContain("deviceId");
  });

  it("preserva todas as activities abertas e só permite escolher a principal", () => {
    const html = render();
    expect(html).toContain("ACTIVITY-A");
    expect(html).toContain("ACTIVITY-B");
    expect((html.match(/Retomar como principal/g) ?? []).length).toBe(2);
    expect(html).toContain("não conclui nem apaga as demais");
    expect(html).not.toContain("Excluir atividade");
    expect(html).not.toContain("Concluir automaticamente");
  });

  it("conflito de integridade não oferece escolha local/nuvem simplificada no bloco técnico", () => {
    const html = render();
    expect(html).toContain("Reconciliação técnica necessária");
    expect(html).toContain("ATTEMPT-1");
    expect(html).toContain("não oferecem escolha simplificada");
  });

  it("usa texto e aria-live, sem depender apenas de cor", () => {
    const html = render();
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Conflitos preservados");
    expect(html).toContain("Nenhuma versão foi descartada automaticamente");
  });

  it("não renderiza painel quando não há conflito", () => {
    const html = renderToStaticMarkup(
      <CloudConflictPanel
        writings={[]}
        openActivityIds={[]}
        integrityConflicts={[]}
        onResolveWriting={vi.fn()}
        onSelectPrimaryActivity={vi.fn()}
      />,
    );
    expect(html).toBe("");
  });
  it("não exibe confirmação de resolução antes de verificar auditoria e conta", () => {
    const sample = {
      id: "WRITING-1", theme: "Redação de teste",
      contentIds: ["TI-BD-003"], contestId: "CRBIO01-2026-ATI",
      text: "Texto local de exemplo", date: "2026-10-17",
      status: "rascunho", evaluation: "", notes: "",
    };
    // Server rendering never triggers a write or account/network discovery.
    const html = renderToStaticMarkup(
      <WritingConflictResolutionController
        db={{} as IDBPDatabase<StudyDBV3>}
        guard={{ isCurrent: () => true }}
        snapshot={{
          entityId: sample.id, baseText: null,
          localPayload: sample, remotePayload: { ...sample, text: "Texto remoto" },
          remoteRevision: 2, remoteChangeSeq: 2, remotePayloadHash: "sha256:placeholder",
          blockedMutationIds: ["blocked-1"],
        }}
      />,
    );
    expect(html).toContain("Conferindo o histórico local do conflito");
    expect(html).not.toContain("Confirmar decisão local");
    expect(html).not.toContain("cas_applied");
  });

});
