import { describe, expect, it } from "vitest";
import lesson from "../content/lessons/MAT-008.json";
import media from "../data/media.json";
import { loadCatalog } from "../scripts/io";

describe("publicação integral de MAT-008", () => {
  it("preserva os sete núcleos canônicos e a integração transversal", () => {
    expect(lesson.sections).toHaveLength(8);
    expect(lesson.sections.slice(0, 7).map((section) => section.id)).toEqual([
      "MAT-008-01", "MAT-008-02", "MAT-008-03", "MAT-008-04",
      "MAT-008-05", "MAT-008-06", "MAT-008-07",
    ]);
    expect(lesson.sections.slice(0, 7).every((section) => section.text.length > 15_000)).toBe(true);
  });

  it("publica as 152 questões autorais sem duplicar IDs", async () => {
    const catalog = await loadCatalog();
    const questions = catalog.questions.filter((question) => question.contentId === "MAT-008");
    expect(questions).toHaveLength(152);
    expect(new Set(questions.map((question) => question.id)).size).toBe(152);
    expect(questions.every((question) => question.origin === "inédita")).toBe(true);
    expect(questions.every((question) => question.answer && question.comment)).toBe(true);
  });

  it("mantém concursos, fontes e imagem original vinculados", () => {
    expect(lesson.contests).toEqual(["CRBIO01-2026-ATI", "SETEC-2026-ATI"]);
    expect(lesson.source_ids).toEqual(["SRC-CRBIO01-EDITAL-001", "SRC-SETEC-EDITAL-001"]);
    expect(lesson.media).toEqual(["MAT-008-IMG-001"]);
    expect(media.some((item) => item.id === "MAT-008-IMG-001" && item.original)).toBe(true);
  });
});
