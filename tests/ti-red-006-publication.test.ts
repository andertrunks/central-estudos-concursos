import { expect, it } from "vitest";
import lesson from "../content/lessons/TI-RED-006.json";
import { loadCatalog } from "../scripts/io";

it("preserva composição, flashcards, treinos e questões autorais de TI-RED-006", async () => {
  const catalog = await loadCatalog();
  const questions = catalog.questions.filter(q => q.contentId === "TI-RED-006");
  expect(lesson.sections).toHaveLength(6);
  expect(lesson.summary.match(/F-TI-RED-006-/g)).toHaveLength(24);
  expect(lesson.review.match(/T-TI-RED-006-/g)).toHaveLength(12);
  expect(questions).toHaveLength(20);
  expect(new Set(questions.map(q => q.id)).size).toBe(20);
  expect(questions.every(q => q.origin === "inédita" && q.comment.length > 0)).toBe(true);
  expect(lesson.media).toEqual(["TI-RED-006-IMG-001"]);
  expect(lesson.theory).toContain("PRÉ-REQUISITOS");
});
