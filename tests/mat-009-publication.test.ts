import { describe, expect, it } from "vitest";
import lesson from "../content/lessons/MAT-009.json";
import media from "../data/media.json";
import { loadCatalog } from "../scripts/io";

describe("publicação integral de MAT-009", () => {
  it("preserva os dois recortes e o conteúdo canônico completo", () => {
    expect(lesson.sections.map((section) => section.id)).toEqual(["MAT-009-01", "MAT-009-02"]);
    expect(lesson.sections.reduce((sum, section) => sum + section.text.length, 0)).toBeGreaterThan(38_000);
    expect(lesson.review.match(/T-MED-MAT-013-/g)).toHaveLength(12);
    expect(lesson.sections.map((section) => section.text).join("\n").match(/\*\*\d+\./g)).toHaveLength(24);
  });

  it("publica as 20 questões autorais com IDs estáveis", async () => {
    const catalog = await loadCatalog();
    const questions = catalog.questions.filter((question) => question.contentId === "MAT-009");
    expect(questions).toHaveLength(20);
    expect(new Set(questions.map((question) => question.id)).size).toBe(20);
    expect(questions[0]?.id).toBe("q-inedita-medio-matematica-0408");
    expect(questions.at(-1)?.id).toBe("q-inedita-medio-matematica-0427");
    expect(questions.every((question) => question.origin === "inédita")).toBe(true);
  });

  it("mantém a exclusividade CRBio, a fonte e a imagem original", () => {
    expect(lesson.contests).toEqual(["CRBIO01-2026-ATI"]);
    expect(lesson.source_ids).toEqual(["SRC-CRBIO01-EDITAL-001"]);
    expect(lesson.media).toEqual(["MAT-009-IMG-001"]);
    expect(media.some((item) => item.id === "MAT-009-IMG-001" && item.original)).toBe(true);
  });
});
