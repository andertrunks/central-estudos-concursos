import { describe, expect, it } from "vitest";
import lesson from "../content/lessons/TI-CLOUD-001.json";
import media from "../data/media.json";
import { loadCatalog } from "../scripts/io";

describe("publicação integral de TI-CLOUD-001", () => {
  it("preserva seis recortes e o vínculo comum aos dois concursos", () => {
    expect(lesson.sections.map((section) => section.id)).toEqual([
      "TI-CLOUD-001-01", "TI-CLOUD-001-02", "TI-CLOUD-001-03",
      "TI-CLOUD-001-04", "TI-CLOUD-001-05", "TI-CLOUD-001-06",
    ]);
    expect(lesson.contests).toEqual(["CRBIO01-2026-ATI", "SETEC-2026-ATI"]);
  });

  it("publica exatamente 13 flashcards, 12 treinos e 16 questões autorais", async () => {
    const catalog = await loadCatalog();
    const questions = catalog.questions.filter((question) => question.contentId === "TI-CLOUD-001");
    expect(lesson.summary.match(/F-TI-CLOUD-001-/g)).toHaveLength(13);
    expect(lesson.review.match(/T-TI-CLOUD-001-/g)).toHaveLength(12);
    expect(questions).toHaveLength(16);
    expect(new Set(questions.map((question) => question.id)).size).toBe(16);
    expect(questions.every((question) => question.origin === "inédita")).toBe(true);
  });

  it("mantém a imagem original e referências reais fora da pontuação", () => {
    expect(lesson.media).toEqual(["TI-CLOUD-001-IMG-001"]);
    expect(media.some((item) => item.id === "TI-CLOUD-001-IMG-001" && item.original)).toBe(true);
    expect(lesson.questions.every((id) => id.startsWith("Q-TI-CLOUD-001-"))).toBe(true);
    expect(lesson.theory).not.toMatch(/serverless|FinOps|RTO\/RPO/i);
  });
});
