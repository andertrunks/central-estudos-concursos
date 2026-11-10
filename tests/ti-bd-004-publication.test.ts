import { expect, it } from "vitest";
import lesson from "../content/lessons/TI-BD-004.json";
import { loadCatalog } from "../scripts/io";

it("preserva composição e gabarito canônico de TI-BD-004 sem pontuar referências reais", async () => {
  const catalog = await loadCatalog();
  const questions = catalog.questions.filter(q => q.contentId === lesson.id).sort((a, b) => a.id.localeCompare(b.id));
  expect(lesson.sections).toHaveLength(6);
  expect(lesson.objectives).toHaveLength(10);
  expect(lesson.summary.match(/F-TI-BD-004-\d\d — Frente:/g)).toHaveLength(24);
  expect(lesson.review.match(/T-TI-BD-004-\d\d — /g)).toHaveLength(12);
  expect(questions).toHaveLength(20);
  expect(questions.map(q => q.answer)).toEqual("E C C E C E C E C C B B C A C C A C B C".split(" "));
  expect(questions.every(q => q.origin === "inédita" && q.comment.length > 0)).toBe(true);
  expect(questions.slice(10).every(q => q.options.length === 4)).toBe(true);
  expect(lesson.media).toEqual(["TI-BD-004-IMG-001"]);
  expect(lesson.theory).toContain("NÃO são promovidos a produtos exigidos");
  expect(lesson.theory).toContain("Q3932417");
  expect(lesson.sections.every((s, i) => s.text.includes(`Exemplo resolvido ${i + 1}:`))).toBe(true);
});
