import { describe, expect, it } from "vitest";
import lesson from "../content/lessons/PORT-008.json";
import media from "../data/media.json";
import { loadCatalog } from "../scripts/io";

describe("publicação integral de PORT-008", () => {
  it("preserva os seis recortes e o vínculo comum aos dois concursos", () => {
    expect(lesson.sections.map((section) => section.id)).toEqual([
      "PORT-008-01", "PORT-008-02", "PORT-008-03",
      "PORT-008-04", "PORT-008-05", "PORT-008-06",
    ]);
    expect(lesson.contests).toEqual(["CRBIO01-2026-ATI", "SETEC-2026-ATI"]);
    expect(lesson.sections.map((section) => section.text).join("\n")).toContain("Exemplo 42");
    expect(lesson.sections.map((section) => section.text).join("\n")).toContain("65. Caderno de erros");
  });

  it("publica exatamente 50 flashcards, 12 treinos e 38 questões autorais", async () => {
    const catalog = await loadCatalog();
    const questions = catalog.questions.filter((question) => question.contentId === "PORT-008");
    expect(lesson.summary.match(/F-PORT-008-/g)).toHaveLength(50);
    expect(lesson.review.match(/T-PORT-008-/g)).toHaveLength(12);
    expect(questions).toHaveLength(38);
    expect(new Set(questions.map((question) => question.id)).size).toBe(38);
    expect(questions.every((question) => question.origin === "inédita")).toBe(true);
  });

  it("mantém a imagem original e não promove referências reais a itens pontuáveis", () => {
    expect(lesson.media).toEqual(["PORT-008-IMG-001"]);
    expect(media.some((item) => item.id === "PORT-008-IMG-001" && item.original)).toBe(true);
    expect(lesson.questions.every((id) => id.startsWith("Q-PORT-008-"))).toBe(true);
    expect(lesson.exception).toContain("somente como evidência e metadados");
  });
});
