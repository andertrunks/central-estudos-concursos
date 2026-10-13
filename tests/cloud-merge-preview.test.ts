import { describe, expect, it } from "vitest";
import { buildBackupV2 } from "../src/services/backup-v2";
import {
  buildCloudMergePreview,
  mergePreviewEntitiesFromBackupV2,
  type MergePreviewRemoteRecord,
} from "../src/services/cloud-merge-preview";
import {
  ANNULLED_ING001_032,
  payloadHashFor,
  projectForCloud,
} from "../src/services/cloud-protocol";
import type { CloudEntityKind } from "../src/types/cloud";
import type { StudyProgress, Writing } from "../src/types/schema";
import type { Activity } from "../src/services/trail";

function activity(
  id: string,
  overrides: Partial<Activity> = {},
): Activity {
  return {
    id,
    kind: "aula",
    contentId: "TI-BD-003",
    unitId: "TI-BD-003-U1",
    title: "SQL básico",
    questionIds: [],
    reviewIds: [],
    startedAt: "2026-10-10",
    completedAt: null,
    sequence: 1,
    ...overrides,
  };
}

function progress(percent: number): StudyProgress {
  return {
    id: "TI-BD-003",
    status: "em andamento",
    startedAt: "2026-10-10",
    completedAt: null,
    lastAccess: "2026-10-13",
    percent,
    correct: 1,
    wrong: 0,
    total: 1,
    lastReview: null,
    nextReview: null,
  };
}

function writing(text: string): Writing {
  return {
    id: "DISC-SYNTH-001",
    theme: "Tema sintético",
    contentIds: ["TI-BD-003"],
    contestId: "CRBIO01-ATI",
    text,
    date: "2026-10-13",
    status: "rascunho",
    evaluation: "",
    notes: "",
  };
}

async function remote(
  kind: CloudEntityKind,
  id: string,
  payload: unknown,
  revision = 1,
  changeSeq = 1,
): Promise<MergePreviewRemoteRecord> {
  return {
    kind,
    id,
    revision,
    changeSeq,
    payload,
    payloadHash: await payloadHashFor("upsert", payload),
    deleted: false,
  };
}

function emptyBackup() {
  return buildBackupV2({
    activities: [],
    progress: [],
    reviews: [],
    attempts: [],
    writings: [],
    results: [],
    submissions: [],
    simulationSubmissions: [],
  });
}

describe("PR-6 merge preview puro", () => {
  it("classifica local-only, remote-only e convergente sem efeitos colaterais", async () => {
    const localProgress = progress(40);
    const localOnly = activity("activity-local");
    const local = mergePreviewEntitiesFromBackupV2(buildBackupV2({
      ...emptyBackup(),
      activities: [localOnly],
      progress: [localProgress],
    }));
    const remoteProgressPayload = projectForCloud("progress", localProgress);
    const remoteOnlyPayload = projectForCloud("reviews", {
      id: "synthetic-review",
      contentId: "TI-BD-003",
      stage: "D1",
      due: "2026-10-14",
      doneAt: null,
    });
    const preview = await buildCloudMergePreview(local, [
      await remote("progress", localProgress.id, remoteProgressPayload, 2, 2),
      await remote("review", "synthetic-review", remoteOnlyPayload, 1, 3),
    ]);

    expect(preview.counts).toEqual({
      local_only: 1,
      remote_only: 1,
      convergent: 1,
      auto_mergeable: 0,
      manual_conflict: 0,
    });
    expect(preview.issues).toEqual([]);
  });

  it("marca Activity com mesma identidade e tempos divergentes como auto-mergeável", async () => {
    const localActivity = activity("activity-same", {
      title: "Título local",
      startedAt: "2026-10-11",
      completedAt: null,
    });
    const remoteActivity = activity("activity-same", {
      title: "Título remoto",
      startedAt: "2026-10-10",
      completedAt: "2026-10-12",
      sequence: 99,
    });
    const local = mergePreviewEntitiesFromBackupV2(buildBackupV2({
      ...emptyBackup(),
      activities: [localActivity],
    }));
    const remotePayload = projectForCloud("activities", remoteActivity);
    const preview = await buildCloudMergePreview(local, [
      await remote("activity", remoteActivity.id, remotePayload),
    ]);

    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]?.disposition).toBe("auto_mergeable");
    expect(preview.items[0]?.reason).toBeUndefined();
  });

  it("trata divergência de identidade da mesma Activity como conflito de integridade", async () => {
    const localActivity = activity("activity-integrity", { contentId: "TI-BD-003" });
    const remoteActivity = activity("activity-integrity", { contentId: "TI-BD-004" });
    const local = mergePreviewEntitiesFromBackupV2(buildBackupV2({
      ...emptyBackup(),
      activities: [localActivity],
    }));
    const preview = await buildCloudMergePreview(local, [
      await remote("activity", remoteActivity.id, projectForCloud("activities", remoteActivity)),
    ]);

    expect(preview.items[0]?.disposition).toBe("manual_conflict");
    expect(preview.items[0]?.reason).toBe("integrity_conflict");
  });

  it("preserva versões divergentes de Writing como writing_conflict", async () => {
    const localWriting = writing("versão local");
    const remoteWriting = writing("versão remota");
    const local = mergePreviewEntitiesFromBackupV2(buildBackupV2({
      ...emptyBackup(),
      writings: [localWriting],
    }));
    const preview = await buildCloudMergePreview(local, [
      await remote("writing", remoteWriting.id, projectForCloud("writings", remoteWriting)),
    ]);

    expect(preview.items[0]?.disposition).toBe("manual_conflict");
    expect(preview.items[0]?.reason).toBe("writing_conflict");
  });

  it("não ressuscita automaticamente entidade local diante de tombstone remoto", async () => {
    const localProgress = progress(80);
    const local = mergePreviewEntitiesFromBackupV2(buildBackupV2({
      ...emptyBackup(),
      progress: [localProgress],
    }));
    const preview = await buildCloudMergePreview(local, [{
      kind: "progress",
      id: localProgress.id,
      revision: 4,
      changeSeq: 9,
      payload: null,
      payloadHash: null,
      deleted: true,
    }]);

    expect(preview.items[0]?.disposition).toBe("manual_conflict");
    expect(preview.items[0]?.reason).toBe("remote_tombstone_conflict");
  });

  it("preserva Activities abertas distintas e sinaliza multiple_open_activities", async () => {
    const localActivity = activity("activity-open-local");
    const remoteActivity = activity("activity-open-remote", { sequence: 4 });
    const local = mergePreviewEntitiesFromBackupV2(buildBackupV2({
      ...emptyBackup(),
      activities: [localActivity],
    }));
    const preview = await buildCloudMergePreview(local, [
      await remote("activity", remoteActivity.id, projectForCloud("activities", remoteActivity)),
    ]);

    expect(preview.counts.local_only).toBe(1);
    expect(preview.counts.remote_only).toBe(1);
    expect(preview.issues).toEqual([{
      code: "multiple_open_activities",
      activityIds: ["activity-open-local", "activity-open-remote"],
    }]);
  });

  it("omite QREF032 do conjunto local de preview", () => {
    const backup = buildBackupV2({
      ...emptyBackup(),
      attempts: [{
        id: "attempt-annulled",
        questionId: ANNULLED_ING001_032,
        contentId: "ING-001",
        date: "2026-10-13",
        answer: "A",
        correct: false,
        reason: "conteúdo",
        resolvedAt: null,
      }],
    });
    expect(mergePreviewEntitiesFromBackupV2(backup)).toEqual([]);
  });

  it("rejeita hash remoto incompatível em vez de gerar preview enganoso", async () => {
    const local = mergePreviewEntitiesFromBackupV2(emptyBackup());
    const payload = projectForCloud("progress", progress(55));
    await expect(buildCloudMergePreview(local, [{
      kind: "progress",
      id: "TI-BD-003",
      revision: 1,
      changeSeq: 1,
      payload,
      payloadHash: "sha256:invalido",
      deleted: false,
    }])).rejects.toThrow(/HASH_MISMATCH/);
  });
});
