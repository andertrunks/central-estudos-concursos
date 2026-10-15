import { describe, expect, it } from "vitest";
import type { Writing } from "../src/types/schema";
import { planWritingConflictResolution } from "../src/services/writing-conflict-resolution";

function writing(text: string, status: Writing["status"] = "rascunho"): Writing {
  return {
    id: "DISC-001",
    theme: "SQL",
    contentIds: ["TI-BD-003"],
    contestId: "CRBIO01-2026-ATI",
    text,
    date: "2026-10-14",
    status,
    evaluation: "",
    notes: "",
  };
}

describe("PR-6 Writing conflict resolution plan", () => {
  it("cria nova mutação head usando a revisão remota atual", async () => {
    const entry = await planWritingConflictResolution({
      entityId: "DISC-001",
      remoteRevision: 9,
      localPayload: writing("local"),
      remotePayload: writing("remote", "concluída"),
      choice: "local",
      mutationId: "mutation-new",
      blockedMutationIds: ["mutation-old"],
      now: "2026-10-14T20:00:00.000Z",
    });
    expect(entry.mutationId).toBe("mutation-new");
    expect(entry.baseRevision).toBe(9);
    expect(entry.predecessorMutationId).toBeNull();
    expect(entry.basePayload).toEqual(writing("remote", "concluída"));
    expect(entry.targetPayload).toEqual(writing("local"));
    expect(entry.status).toBe("queued");
  });

  it("permite escolher remoto sem LWW implícito", async () => {
    const remote = writing("remote", "concluída");
    const entry = await planWritingConflictResolution({
      entityId: "DISC-001",
      remoteRevision: 4,
      localPayload: writing("local"),
      remotePayload: remote,
      choice: "remote",
      mutationId: "mutation-remote",
    });
    expect(entry.targetPayload).toEqual(remote);
    expect(entry.baseRevision).toBe(4);
  });

  it("permite versão mesclada editável mantendo identidade estrutural", async () => {
    const merged = { ...writing("texto mesclado"), notes: "revisado manualmente" };
    const entry = await planWritingConflictResolution({
      entityId: "DISC-001",
      remoteRevision: 12,
      localPayload: writing("local"),
      remotePayload: writing("remote"),
      choice: "merged",
      mergedPayload: merged,
      mutationId: "mutation-merged",
    });
    expect(entry.targetPayload).toEqual(merged);
    expect(entry.baseRevision).toBe(12);
  });

  it("recusa reutilizar mutationId bloqueada", async () => {
    await expect(planWritingConflictResolution({
      entityId: "DISC-001",
      remoteRevision: 2,
      localPayload: writing("local"),
      remotePayload: writing("remote"),
      choice: "local",
      mutationId: "blocked-id",
      blockedMutationIds: ["blocked-id"],
    })).rejects.toThrow(/NEW_MUTATION_ID/);
  });

  it("recusa divergência estrutural de identidade", async () => {
    await expect(planWritingConflictResolution({
      entityId: "DISC-001",
      remoteRevision: 2,
      localPayload: writing("local"),
      remotePayload: { ...writing("remote"), theme: "Tema adulterado" },
      choice: "local",
      mutationId: "mutation-integrity",
    })).rejects.toThrow(/INTEGRITY_CONFLICT/);
  });

  it("recusa merged payload de outra identidade", async () => {
    await expect(planWritingConflictResolution({
      entityId: "DISC-001",
      remoteRevision: 2,
      localPayload: writing("local"),
      remotePayload: writing("remote"),
      choice: "merged",
      mergedPayload: { ...writing("merge"), contentIds: ["MAT-001"] },
      mutationId: "mutation-invalid-merge",
    })).rejects.toThrow(/MERGED_IDENTITY_MISMATCH/);
  });
});
