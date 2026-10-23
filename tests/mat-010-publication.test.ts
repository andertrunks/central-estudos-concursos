import { describe, expect, it } from "vitest";
import lesson from "../content/lessons/MAT-010.json";
import media from "../data/media.json";
import { loadCatalog } from "../scripts/io";

describe("publicação integral de MAT-010", () => {
  it("preserva os três recortes canônicos e o escopo exclusivo do CRBio", () => {
    expect(lesson.sections.map((section) => section.id)).toEqual(["MAT-010-01", "MAT-010-02", "MAT-010-03"]);
    expect(lesson.contests).toEqual(["CRBIO01-2026-ATI"]);
    expect(lesson.sections.map((section) => section.text).join("\n")).not.toMatch(/PARTE IX — MÉDIA PONDERADA|PARTE XII — AMPLITUDE/);
  });

  it("publica exatamente 12 flashcards, 10 treinos e 10 questões autorais", async () => {
    const catalog = await loadCatalog();
    const questions = catalog.questions.filter((question) => question.contentId === "MAT-010");
    expect(lesson.summary.match(/F-MAT-010-/g)).toHaveLength(12);
    expect(lesson.review.match(/T-MAT-010-/g)).toHaveLength(10);
    expect(questions).toHaveLength(10);
    expect(new Set(questions.map((question) => question.id)).size).toBe(10);
    expect(questions.every((question) => question.contests?.length === 1 && question.contests[0] === "CRBIO01-2026-ATI")).toBe(true);
  });

  it("mantém a imagem original aprovada e os vínculos internos", () => {
    expect(lesson.media).toEqual(["MAT-010-IMG-001"]);
    expect(media.some((item) => item.id === "MAT-010-IMG-001" && item.original && item.contentId === "MAT-010")).toBe(true);
    expect(lesson.questions).toHaveLength(10);
  });
});
