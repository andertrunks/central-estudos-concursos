import { describe, expect, it } from "vitest";
import { ANNULLED_ING001_032 } from "../src/services/cloud-protocol";
import {
  buildReconcilePreview,
  type ReconcileSnapshot,
} from "../src/services/reconcile-preview";

function snap(
  entityKind: ReconcileSnapshot["entityKind"],
  entityId: string,
  payload: unknown,
): ReconcileSnapshot {
  return { entityKind, entityId, payload };
}

describe("PR-6 reconcile preview — remoto já ocupado", () => {
  it("classifica somente local, somente nuvem e convergente sem aplicar nada", async () => {
    const local = [
      snap("progress", "LOCAL", { id: "LOCAL", percent: 20 }),
      snap("progress", "SAME", { id: "SAME", percent: 40 }),
    ];
    const remote = [
      snap("progress", "CLOUD", { id: "CLOUD", percent: 60 }),
      snap("progress", "SAME", { percent: 40, id: "SAME" }),
    ];
    const preview = await buildReconcilePreview({ local, remote });
    expect(preview.counts).toEqual({
      only_local: 1,
      only_cloud: 1,
      convergent: 1,
      automergeable: 0,
      requires_choice: 0,
    });
    expect(preview.items.map((item) => item.key)).toEqual([
      "progress:CLOUD",
      "progress:LOCAL",
      "progress:SAME",
    ]);
  });

  it("marca como automergeável quando apenas um lado mudou desde a base", async () => {
    const base = [snap("progress", "P1", { id: "P1", percent: 10 })];
    const local = [snap("progress", "P1", { id: "P1", percent: 30 })];
    const remote = [snap("progress", "P1", { id: "P1", percent: 10 })];
    const preview = await buildReconcilePreview({ local, remote, base });
    expect(preview.items[0]).toMatchObject({
      disposition: "automergeable",
      reason: null,
    });
  });

  it("preserva Writing concorrente divergente como escolha manual", async () => {
    const base = [snap("writing", "W1", { id: "W1", text: "base", status: "rascunho" })];
    const local = [snap("writing", "W1", { id: "W1", text: "local", status: "rascunho" })];
    const remote = [snap("writing", "W1", { id: "W1", text: "remoto", status: "concluída" })];
    const preview = await buildReconcilePreview({ local, remote, base });
    expect(preview.items[0]).toMatchObject({
      disposition: "requires_choice",
      reason: "writing_conflict",
    });
    expect(preview.counts.requires_choice).toBe(1);
  });

  it("preserva activities abertas diferentes e emite multiple_open_activities", async () => {
    const local = [
      snap("activity", "A-LOCAL", { id: "A-LOCAL", completedAt: null, contentId: "TI-BD-003" }),
    ];
    const remote = [
      snap("activity", "A-CLOUD", { id: "A-CLOUD", completedAt: null, contentId: "TI-BD-003" }),
    ];
    const preview = await buildReconcilePreview({ local, remote });
    expect(preview.counts.only_local).toBe(1);
    expect(preview.counts.only_cloud).toBe(1);
    expect(preview.warnings).toEqual([
      { type: "multiple_open_activities", entityIds: ["A-CLOUD", "A-LOCAL"] },
    ]);
  });

  it("é determinístico independentemente da ordem dos snapshots", async () => {
    const local = [
      snap("review", "R2", { id: "R2", doneAt: null }),
      snap("review", "R1", { id: "R1", doneAt: null }),
    ];
    const remote = [
      snap("review", "R3", { id: "R3", doneAt: null }),
      snap("review", "R1", { id: "R1", doneAt: null }),
    ];
    const a = await buildReconcilePreview({ local, remote });
    const b = await buildReconcilePreview({
      local: [...local].reverse(),
      remote: [...remote].reverse(),
    });
    expect(a).toEqual(b);
  });

  it("recusa Attempt da questão anulada antes de qualquer preview", async () => {
    await expect(
      buildReconcilePreview({
        local: [
          snap("attempt", "ATT-ANNULLED", {
            id: "ATT-ANNULLED",
            questionId: ANNULLED_ING001_032,
          }),
        ],
        remote: [],
      }),
    ).rejects.toThrow(/anulada/);
  });
});
