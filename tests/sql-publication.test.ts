import { describe, it, expect } from "vitest";
import { loadCatalog } from "../scripts/io";
import { validateCatalog } from "../src/services/integrity";
import { transform } from "../scripts/editorial";
import { readFile } from "node:fs/promises";
const data = await loadCatalog();
describe("publicação canônica de SQL", () => {
  it("preserva 28 subtemas e distingue 252 itens objetivos dos cadernos integrais", () => {
    const sql = data.lessons.find(l => l.id === "TI-BD-003")!;
    expect(sql.sections).toHaveLength(28);
    expect(sql.sections?.at(-1)?.id).toBe("TI-BD-003-28");
    expect(sql.questions).toHaveLength(252);
    expect(data.questions.filter(q => q.contentId === sql.id).every(q => q.banca.startsWith("Autoral"))).toBe(true);
    expect(sql.materials?.find(m => m.id === "Q-TI-BD-003")?.text).toContain("Q-TI-BD-003-AN-036");
    expect(data.discursives).toHaveLength(9);
    expect(data.media.filter(m => m.type === "imagem")).toHaveLength(2);
    expect(data.media.filter(m => m.type === "YouTube")).toHaveLength(3);
    expect(validateCatalog(data).lessons).toHaveLength(1);
  });
  it("rejeita seções com IDs duplicados", () => {
    const copy = structuredClone(data);
    const lesson = copy.lessons[0]!;
    lesson.sections!.push(lesson.sections![0]!);
    expect(() => validateCatalog(copy)).toThrow("ID de seção/material duplicado");
  });
  it("produzido no Drive ainda exige o pacote validado para se tornar publicado", async () => {
    const csv = await readFile("editorial/snapshots/2026-09-23-sql-ready.csv", "utf8");
    const snapshot = transform(csv, { CRBio: "CRBIO01-2026-ATI", SETEC: "SETEC-2026-ATI" }, "2026-09-24");
    expect(snapshot.references.find(r => r.id === "TI-BD-003")?.status).toBe("em produção");
    expect(snapshot.lessons).toHaveLength(0);
  });
});
