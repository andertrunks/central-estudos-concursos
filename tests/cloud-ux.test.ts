import { describe, expect, it } from "vitest";
import { assertBackupV2Privacy, buildBackupV2 } from "../src/services/backup-v2";
import { cloudStatusView, deriveCloudPublicStatus } from "../src/services/cloud-ux";
import type { CloudStatusInput } from "../src/services/cloud-ux";
import type { Submission } from "../src/types/cloud";

const base = (overrides: Partial<CloudStatusInput> = {}): CloudStatusInput => ({
  cloudMode: "qa",
  authenticated: true,
  hadCloudAccount: true,
  adopted: true,
  syncEnabled: true,
  online: true,
  queued: 0,
  sending: 0,
  conflicts: 0,
  blockedError: false,
  syncing: false,
  currentScopeHash: "scope-a",
  sessionGeneration: 3,
  lastConfirmedScopeHash: "scope-a",
  lastConfirmedSessionGeneration: 3,
  ...overrides,
});

describe("PR-6 CLOUD-UX foundation — status fail-closed", () => {
  it("mantém local-only quando o gate está OFF", () => {
    const status = deriveCloudPublicStatus(base({ cloudMode: "off" }));
    expect(status).toBe("DISABLED_BY_GATE");
    expect(cloudStatusView(status).label).toBe("Somente neste dispositivo");
  });

  it("não confunde login com adoção", () => {
    expect(deriveCloudPublicStatus(base({ adopted: false }))).toBe("CLOUD_NOT_ADOPTED");
  });

  it("nunca mostra sincronizado só porque a outbox está vazia", () => {
    expect(
      deriveCloudPublicStatus(
        base({ lastConfirmedScopeHash: null, lastConfirmedSessionGeneration: null }),
      ),
    ).toBe("SYNCING");
  });

  it("só fica UP_TO_DATE após confirmação do mesmo scope e sessionGeneration", () => {
    expect(deriveCloudPublicStatus(base())).toBe("UP_TO_DATE");
    expect(
      deriveCloudPublicStatus(base({ lastConfirmedSessionGeneration: 2 })),
    ).toBe("SYNCING");
    expect(
      deriveCloudPublicStatus(base({ lastConfirmedScopeHash: "scope-b" })),
    ).toBe("SYNCING");
  });

  it("offline com fila pendente informa que as alterações estão salvas localmente", () => {
    const status = deriveCloudPublicStatus(base({ online: false, queued: 2 }));
    expect(status).toBe("PENDING_OFFLINE");
    const view = cloudStatusView(status, 2);
    expect(view.label).toContain("2 alterações");
    expect(view.detail).toContain("salvas localmente");
  });

  it("conflitos e erro bloqueado nunca viram estado verde", () => {
    expect(deriveCloudPublicStatus(base({ conflicts: 1 }))).toBe("CONFLICTS");
    expect(deriveCloudPublicStatus(base({ blockedError: true }))).toBe("BLOCKED_ERROR");
  });

  it("sessão perdida exige autenticação apenas para conta já conhecida", () => {
    expect(
      deriveCloudPublicStatus(base({ authenticated: false, hadCloudAccount: true })),
    ).toBe("AUTH_REQUIRED");
    expect(
      deriveCloudPublicStatus(base({ authenticated: false, hadCloudAccount: false })),
    ).toBe("LOCAL_ONLY");
  });

  it("conta que pausou sync continua local-only sem apagar dados", () => {
    expect(deriveCloudPublicStatus(base({ syncEnabled: false }))).toBe("LOCAL_ONLY");
  });
});

describe("PR-6 BackupV2 — somente estado pedagógico exportável", () => {
  it("inclui Submission pending e exclui metadata técnica/corrections", () => {
    const submission: Submission = {
      id: "submission-synthetic-1",
      dedupeKey: "dedupe-synthetic-1",
      questionId: "QAUT-SYNTH-001",
      contentId: "TI-BD-003",
      unitIds: ["TI-BD-003:U1"],
      promptHash: "sha256:synthetic",
      answer: "B",
      reason: "conteúdo",
      submittedAt: "2026-10-12T14:00:00.000Z",
      status: "pending",
      finalizedAt: null,
      attemptId: null,
    };
    const backup = buildBackupV2({
      activities: [],
      progress: [],
      reviews: [],
      attempts: [],
      writings: [],
      results: [],
      submissions: [submission],
      simulationSubmissions: [],
    });
    expect(backup.version).toBe(2);
    expect(backup.submissions).toEqual([submission]);
    expect(assertBackupV2Privacy(backup)).toBe(true);
    const serialized = JSON.stringify(backup);
    expect(serialized).not.toContain("scopeHash");
    expect(serialized).not.toContain("syncOutbox");
    expect(serialized).not.toContain("revealedCorrections");
  });

  it("ordena entidades por ID para exportação determinística", () => {
    const backup = buildBackupV2({
      activities: [],
      progress: [],
      reviews: [],
      attempts: [],
      writings: [],
      results: [],
      submissions: [
        {
          id: "z",
          dedupeKey: "z",
          questionId: "Q2",
          contentId: "C",
          unitIds: [],
          promptHash: "h2",
          answer: "B",
          reason: "conteúdo",
          submittedAt: "2026-10-12T14:00:00.000Z",
          status: "pending",
          finalizedAt: null,
          attemptId: null,
        },
        {
          id: "a",
          dedupeKey: "a",
          questionId: "Q1",
          contentId: "C",
          unitIds: [],
          promptHash: "h1",
          answer: "A",
          reason: "conteúdo",
          submittedAt: "2026-10-12T14:00:00.000Z",
          status: "pending",
          finalizedAt: null,
          attemptId: null,
        },
      ],
      simulationSubmissions: [],
    });
    expect(backup.submissions.map((item) => item.id)).toEqual(["a", "z"]);
  });
});
