import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { readFile } from "node:fs/promises";
import { loadCatalog } from "../scripts/io";
import { transform, parseSnapshot } from "../scripts/editorial";
import { preparePackage } from "../scripts/queue";
import {
  effectiveStatus,
  isActive,
  daysUntil,
  focusContest,
  priorityScore,
  scheduleReviews,
  reviewGroup,
  nextStudy,
} from "../src/services/study";
import { validateCatalog } from "../src/services/integrity";
import {
  database,
  setProgress,
  loadState,
  recordAnswer,
  completeReview,
  importBackup,
  saveWriting,
  saveResult,
  completeSimulation,
} from "../src/services/storage";
import type { Question } from "../src/types/schema";
const data = await loadCatalog();
const crbio = data.contests[0]!;
const setec = data.contests[1]!;
const sql = data.references.find((r) => r.id === "TI-BD-003")!;
const referenceDay = "2026-09-23";
// Artificial fixtures live only in tests and never enter the published catalog.
const question: Question = {
  id: "TEST-Q-001",
  contentId: sql.id,
  banca: "Teste automatizado",
  type: "certo/errado",
  statement: "Fixture para testar persistência",
  options: [
    { id: "C", text: "Certo" },
    { id: "E", text: "Errado" },
  ],
  answer: "C",
  comment: "Fixture, não é conteúdo editorial",
  source_ids: [data.sources[0]!.id],
  contests: [crbio.id],
};
describe("datas e ciclo", () => {
  it("mantém a prova no dia e expira somente no seguinte", () => {
    expect(effectiveStatus(crbio, "2026-11-29")).toBe("inscrições abertas");
    expect(effectiveStatus(crbio, "2026-11-30")).toBe("prova realizada");
    expect(isActive(crbio, "2026-11-30")).toBe(false);
    expect(data.references).toHaveLength(77);
  });
  it("respeita suspensão, adiamento, encerramento e nova data", () => {
    expect(isActive({ ...crbio, status: "suspenso" }, "2026-12-01")).toBe(true);
    expect(isActive({ ...crbio, status: "adiado" }, "2026-12-01")).toBe(true);
    expect(isActive({ ...crbio, status: "encerrado" }, referenceDay)).toBe(
      false,
    );
    expect(
      isActive({ ...crbio, dataProvaAtual: "2027-02-01" }, "2026-12-01"),
    ).toBe(true);
  });
  it("calcula dias sem depender do horário de verão", () => {
    expect(daysUntil("2026-11-29", referenceDay)).toBe(67);
    expect(daysUntil("2026-11-29", "2026-11-29")).toBe(0);
  });
  it("troca foco automaticamente depois da prova", () => {
    expect(focusContest(data, referenceDay)?.id).toBe(crbio.id);
    expect(focusContest(data, "2026-11-30")?.id).toBe(setec.id);
    expect(focusContest(data, "2027-01-18")).toBeUndefined();
  });
  it("prioriza núcleo comum sobre exclusivo secundário; considera erros e revisões", () => {
    const exclusive = data.references.find((r) => r.id === "TI-PROG-001")!;
    const score = priorityScore(sql, data, undefined, [], referenceDay).score;
    expect(score).toBeGreaterThan(
      priorityScore(exclusive, data, undefined, [], referenceDay).score,
    );
    expect(
      priorityScore(
        sql,
        data,
        undefined,
        scheduleReviews(sql.id, referenceDay),
        referenceDay,
      ).score,
    ).toBeGreaterThan(score);
    expect(priorityScore(sql, data, undefined, [], "2027-01-18").score).toBe(0);
  });
  it("nunca recomenda aula planejada como publicada", () => {
    const planned = { ...data, lessons: [], references: data.references.map(r => ({...r, status: "planejado" as const})) };
    expect(nextStudy(planned, [], [], referenceDay)).toBeUndefined();
  });
  it("agenda D0 D1 D7 D21 com virada de ano", () => {
    const r = scheduleReviews(sql.id, "2026-12-31");
    expect(r.map((x) => x.due)).toEqual([
      "2026-12-31",
      "2027-01-01",
      "2027-01-07",
      "2027-01-21",
    ]);
    expect(reviewGroup(r[0]!, "2027-01-01")).toBe("atrasadas");
    expect(reviewGroup(r[1]!, "2027-01-01")).toBe("hoje");
    expect(reviewGroup(r[2]!, "2027-01-01")).toBe("próximas");
  });
});
describe("integridade e importação editorial", () => {
  it("integra pacote completo por ID e bloqueia mídia obrigatória ausente", () => {
    const item = {
      queueId: "PUB-TEST",
      driveDocumentId: "fixture",
      status: "pronto para publicação",
      lesson: {
        id: sql.id,
        title: "Fixture de integração",
        discipline: "TI",
        subject: "Teste",
        subtopic: "",
        contests: [crbio.id, setec.id],
        objectives: ["Testar integração"],
        theory: "Fixture",
        examples: "Fixture",
        pitfalls: "Fixture",
        summary: "Fixture",
        review: "Fixture",
        source_ids: [data.sources[0]!.id],
        media: ["TEST-IMAGE", "TEST-VIDEO"],
        questions: [question.id],
        updatedAt: referenceDay,
        requirements: { image: true, videos: true, questions: true },
      },
      media: [
        {
          id: "TEST-IMAGE",
          contentId: sql.id,
          type: "imagem",
          title: "Fixture",
          caption: "Fixture",
          alt: "Diagrama de teste",
          file: "media/test.png",
          verifiedAt: referenceDay,
          original: true,
        },
        {
          id: "TEST-VIDEO",
          contentId: sql.id,
          type: "YouTube",
          title: "Fixture",
          caption: "Fixture",
          alt: "",
          url: "https://www.youtube.com/watch?v=abcdefghijk",
          channel: "Teste",
          verifiedAt: referenceDay,
          original: false,
        },
      ],
      questions: [question],
    };
    const { next } = preparePackage(item, data);
    expect(next.lessons).toHaveLength(1);
    expect(next.references).toHaveLength(77);
    expect(next.references.find((r) => r.id === sql.id)?.status).toBe(
      "publicado",
    );
    expect(() => preparePackage({ ...item, media: [] }, data)).toThrow(
      "referência inexistente",
    );
    expect(() =>
      preparePackage(
        { ...item, lesson: { ...item.lesson, source_ids: ["INEXISTENTE"] } },
        data,
      ),
    ).toThrow("referência inexistente");
    expect(() =>
      preparePackage(
        {
          ...item,
          media: item.media.map((m) =>
            m.type === "imagem" ? { ...m, alt: "" } : m,
          ),
        },
        data,
      ),
    ).toThrow("imagem/alt");
    expect(() =>
      preparePackage(
        {
          ...item,
          lesson: {
            ...item.lesson,
            requirements: { image: false, videos: false, questions: false },
          },
        },
        data,
      ),
    ).toThrow("exceção editorial");
  });
  it("não muda o ano do ciclo em uma sincronização futura", async () => {
    const csv = await readFile("editorial/snapshots/2026-09-23.csv", "utf8");
    const next = transform(
      csv,
      { CRBio: crbio.id, SETEC: setec.id },
      "2027-01-01",
      data,
    );
    expect(next.cycle[0]?.start).toBe("2026-09-23");
    expect(next.cycle[6]?.basicIds).toContain("PORT-007");
  });
  it("preserva 77 IDs e relação compartilhada sem duplicar aulas", () => {
    expect(validateCatalog(data).references).toHaveLength(77);
    expect(sql.contests.map((c) => c.contestId)).toEqual([crbio.id, setec.id]);
    expect(new Set(data.references.map((r) => r.id)).size).toBe(77);
  });
  it("rejeita IDs duplicados e relacionamentos quebrados", () => {
    expect(() =>
      validateCatalog({ ...data, references: [...data.references, sql] }),
    ).toThrow("duplicado");
    expect(() =>
      validateCatalog({
        ...data,
        questions: [{ ...question, contentId: "AUSENTE" }],
      }),
    ).toThrow("inexistente");
    expect(() =>
      validateCatalog({
        ...data,
        questions: [{ ...question, source_ids: ["AUSENTE"] }],
      }),
    ).toThrow("inexistente");
  });
  it("rejeita aula publicada sem conteúdo", () =>
    expect(() =>
      validateCatalog({
        ...data,
        lessons: [],
        references: data.references.map((r) =>
          r.id === sql.id ? { ...r, status: "publicado" } : r,
        ),
      }),
    ).toThrow("inexistente"));
  it("lê CSV com aspas, mantém dados reais e histórico", async () => {
    const csv = await readFile("editorial/snapshots/2026-09-23.csv", "utf8");
    expect(parseSnapshot(csv)).toHaveLength(11);
    const next = transform(
      csv.replace("29/11/2026", "06/12/2026"),
      { CRBio: crbio.id, SETEC: setec.id },
      referenceDay,
      data,
    );
    expect(next.contests[0]?.dataProvaOriginal).toBe("2026-11-29");
    expect(next.contests[0]?.dataProvaAtual).toBe("2026-12-06");
    expect(next.contests[0]?.history).toHaveLength(1);
    expect(
      next.references.find((r) => r.id === "PORT-005")?.subtopic,
    ).toContain("Substantivo, adjetivo");
  });
  it("bloqueia colunas ausentes e remoção de conteúdo", async () => {
    const csv = await readFile("editorial/snapshots/2026-09-23.csv", "utf8");
    expect(() =>
      transform(csv, { Inexistente: crbio.id }, referenceDay),
    ).toThrow("Coluna ausente");
    expect(() =>
      transform(
        csv.replace(/^43,TI-BD-003.*\n/m, ""),
        { CRBio: crbio.id, SETEC: setec.id },
        referenceDay,
        data,
      ),
    ).toThrow("Remoção");
  });
  it("admite concurso novo pelos dados, sem duplicação de conteúdo", () => {
    const copy = structuredClone(data);
    copy.contests.push({
      ...setec,
      id: "NOVO-2027-TI",
      conteudosRelacionados: [sql.id],
    });
    copy.references
      .find((r) => r.id === sql.id)!
      .contests.push({ contestId: "NOVO-2027-TI", coverage: "integral" });
    expect(validateCatalog(copy).contests).toHaveLength(3);
    expect(copy.references).toHaveLength(77);
  });
  it("não processa fila a produzir nem aula incompleta", () => {
    expect(() =>
      preparePackage({ queueId: "PUB-0001", status: "a produzir" }, data),
    ).toThrow();
    expect(() =>
      preparePackage(
        {
          queueId: "PUB-TEST",
          status: "pronto para publicação",
          driveDocumentId: "fixture",
          lesson: { id: sql.id },
        },
        data,
      ),
    ).toThrow();
  });
});
describe("IndexedDB e registros do aluno", () => {
  beforeEach(async () => {
    const db = await database();
    for (const store of [
      "progress",
      "reviews",
      "attempts",
      "writings",
      "results",
    ] as const)
      await db.clear(store);
    db.close();
  });
  it("salva simulado e tentativas atomicamente e sem duplicar uma retomada", async () => {
    const result = {
      id: "test-atomic",
      simulationId: "TEST-S-001",
      date: referenceDay,
      correct: 0,
      wrong: 1,
      unanswered: 0,
      seconds: 45,
      score: -1,
      byDiscipline: { TI: { correct: 0, wrong: 1, unanswered: 0 } },
    };
    await completeSimulation(result, [question], { [question.id]: "E" });
    await completeSimulation(result, [question], { [question.id]: "E" });
    const state = await loadState();
    expect(state.results).toHaveLength(1);
    expect(state.attempts).toHaveLength(1);
    expect(state.progress[0]?.wrong).toBe(1);
    expect(state.reviews).toHaveLength(1);
  });
  it("persiste conclusão por ID e não duplica revisão", async () => {
    await setProgress(sql.id, "concluído", referenceDay);
    await setProgress(sql.id, "concluído", referenceDay);
    const db = await database();
    db.close();
    const state = await loadState();
    expect(state.progress[0]?.percent).toBe(100);
    expect(state.progress[0]?.id).toBe(sql.id);
    expect(state.reviews).toHaveLength(4);
  });
  it("registra erro, desempenho e revisão em 48 horas", async () => {
    await recordAnswer(question, "E", "interpretação", referenceDay);
    const state = await loadState();
    expect(state.attempts[0]?.reason).toBe("interpretação");
    expect(state.progress[0]?.wrong).toBe(1);
    expect(state.reviews[0]?.due).toBe("2026-09-25");
  });
  it("acerto não entra no caderno de erros", async () => {
    await recordAnswer(question, "C", "conteúdo", referenceDay);
    const state = await loadState();
    expect(state.attempts.filter((a) => !a.correct)).toHaveLength(0);
    expect(state.progress[0]?.correct).toBe(1);
    expect(state.reviews).toHaveLength(0);
  });
  it("concluir revisão atualiza a próxima data", async () => {
    await setProgress(sql.id, "concluído", referenceDay);
    const state = await loadState();
    await completeReview(
      state.reviews.find((r) => r.stage === "D0")!.id,
      referenceDay,
    );
    expect((await loadState()).progress[0]?.nextReview).toBe("2026-09-24");
  });
  it("exportação e restauração preservam registros", async () => {
    await setProgress(sql.id, "em andamento", referenceDay);
    const backup = await loadState();
    const db = await database();
    await db.clear("progress");
    await importBackup(backup);
    expect((await loadState()).progress).toEqual(backup.progress);
    await expect(importBackup({ version: 999 })).rejects.toThrow();
  });
  it("salva discursiva e resultado por disciplina", async () => {
    await saveWriting({
      id: "TEST-D-001",
      theme: "Teste",
      contentIds: [sql.id],
      contestId: crbio.id,
      text: "Rascunho de teste",
      date: referenceDay,
      status: "rascunho",
      evaluation: "",
      notes: "",
    });
    await saveResult({
      id: "test-result",
      simulationId: "TEST-S-001",
      date: referenceDay,
      correct: 1,
      wrong: 1,
      unanswered: 1,
      seconds: 90,
      score: 0,
      byDiscipline: { TI: { correct: 1, wrong: 1, unanswered: 1 } },
    });
    const state = await loadState();
    expect(state.writings[0]?.text).toBe("Rascunho de teste");
    expect(state.results[0]?.byDiscipline.TI?.wrong).toBe(1);
  });
});
