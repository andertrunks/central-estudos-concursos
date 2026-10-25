import { describe, expect, it } from "vitest";
import lesson from "../content/lessons/TI-SEG-003.json";
import media from "../data/media.json";
import { loadCatalog } from "../scripts/io";

describe("publicação integral de TI-SEG-003", () => {
  it("preserva seis recortes e o vínculo comum aos dois concursos", () => {
    expect(lesson.sections.map((section) => section.id)).toEqual([
      "TI-SEG-003-01", "TI-SEG-003-02", "TI-SEG-003-03",
      "TI-SEG-003-04", "TI-SEG-003-05", "TI-SEG-003-06",
    ]);
    expect(lesson.contests).toEqual(["CRBIO01-2026-ATI", "SETEC-2026-ATI"]);
  });

  it("publica exatamente 24 flashcards, 12 treinos e 20 questões autorais", async () => {
    const catalog = await loadCatalog();
    const questions = catalog.questions.filter((question) => question.contentId === "TI-SEG-003");
    expect(lesson.summary.match(/F-TI-SEG-003-/g)).toHaveLength(24);
    expect(lesson.review.match(/T-TI-SEG-003-/g)).toHaveLength(12);
    expect(questions).toHaveLength(20);
    expect(new Set(questions.map((question) => question.id)).size).toBe(20);
    expect(questions.every((question) => question.origin === "inédita")).toBe(true);
  });

  it("mantém a imagem original e não promove referências reais a questões pontuáveis", () => {
    expect(lesson.media).toEqual(["TI-SEG-003-IMG-001"]);
    expect(media.some((item) => item.id === "TI-SEG-003-IMG-001" && item.original)).toBe(true);
    expect(lesson.questions.every((id) => id.startsWith("Q-TI-SEG-003-"))).toBe(true);
  });
});
