import { describe, expect, it } from "vitest";
import lesson from "../content/lessons/MAT-012.json";
import media from "../data/media.json";
import { loadCatalog } from "../scripts/io";

describe("publicação integral de MAT-012", () => {
  it("preserva os três recortes canônicos e o escopo exclusivo da SETEC", () => {
    expect(lesson.sections.map((section) => section.id)).toEqual(["MAT-012-01", "MAT-012-02", "MAT-012-03"]);
    expect(lesson.contests).toEqual(["SETEC-2026-ATI"]);
    expect(lesson.sections.map((section) => section.text).join("\n")).not.toMatch(/TEOREMA DE PITÁGORAS|TEOREMA DE TALES|PIRÂMIDE|CONE TÊM VOLUME|ESFERA, V=/i);
  });

  it("publica exatamente 32 flashcards, 16 treinos e 26 questões autorais", async () => {
    const catalog = await loadCatalog();
    const questions = catalog.questions.filter((question) => question.contentId === "MAT-012");
    expect(lesson.summary.match(/F-MC-/g)).toHaveLength(32);
    expect(lesson.review.match(/T-MC-/g)).toHaveLength(16);
    expect(questions).toHaveLength(26);
    expect(new Set(questions.map((question) => question.id)).size).toBe(26);
    expect(questions.every((question) => question.origin === "inédita" && question.contests?.length === 1 && question.contests[0] === "SETEC-2026-ATI")).toBe(true);
  });

  it("mantém a imagem original aprovada e todos os vínculos internos", () => {
    expect(lesson.media).toEqual(["MAT-012-IMG-001"]);
    expect(media.some((item) => item.id === "MAT-012-IMG-001" && item.original && item.contentId === "MAT-012")).toBe(true);
    expect(lesson.questions).toHaveLength(26);
  });
});
