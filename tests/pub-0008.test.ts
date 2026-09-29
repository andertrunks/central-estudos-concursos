import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../scripts/io';
import { validateCatalog } from '../src/services/integrity';

const catalog = await loadCatalog();
const lesson = catalog.lessons.find((item) => item.id === 'TI-BD-001')!;
const lessonText = lesson.sections?.map((section) => section.text).join('\n') ?? '';

describe('PUB-0008 — Banco de dados relacional', () => {
  it('preserves the four ordered units, both contest links, and the full source material', () => {
    expect(lesson.sections?.map((section) => section.id)).toEqual([
      'TI-BD-001-01', 'TI-BD-001-02', 'TI-BD-001-03', 'TI-BD-001-04',
    ]);
    expect(lesson.contests).toEqual(['CRBIO01-2026-ATI', 'SETEC-2026-ATI']);
    expect(lessonText.length).toBeGreaterThan(70_000);
    expect(lessonText).toContain('independência física');
    expect(lessonText).toContain('integridade referencial');
    expect(lessonText).toContain('QREF-QUAD-143');
    expect(lessonText).not.toContain('aguardando validação/publicação');
    expect(lessonText).not.toContain('CHECKPOINT — Produção intercalada');
    expect(lessonText).not.toContain('Vinculações formais a cargos e editais permanecem pendentes');
    expect(lessonText).not.toContain('docs.google.com/document/d/');
  });

  it('keeps the four validated author questions interactive and the six Quadrix locators unscored', () => {
    const authoredIds = [1, 2, 3, 4].map((n) => `Q-TI-BD-001-INDEPAC-00${n}`);
    const authored = catalog.questions.filter((question) => authoredIds.includes(question.id));
    expect(authored).toHaveLength(4);
    expect(authored.map((question) => question.id)).toEqual(authoredIds);
    for (const question of authored) {
      expect(question.origin).toBe('inédita');
      expect(question.banca).toContain('Autoral');
      expect(question.options).toHaveLength(4);
      expect(question.comment.length).toBeGreaterThan(20);
      expect(lesson.questions).toContain(question.id);
      expect(lessonText).not.toContain(question.statement);
      expect(lessonText).not.toContain(question.comment);
    }
    for (const n of [143, 144, 145, 146, 147, 148]) {
      const locatorId = `QREF-QUAD-${n}`;
      expect(lessonText).toContain(locatorId);
      expect(lesson.questions).not.toContain(locatorId);
      expect(catalog.questions.some((question) => question.id === locatorId)).toBe(false);
    }
    expect(catalog.questions.filter((question) => question.contentId === lesson.id)).toHaveLength(29);
  });

  it('registers the original diagram and both verified complementary videos', () => {
    const media = catalog.media.filter((item) => item.contentId === lesson.id);
    expect(media.map((item) => item.id)).toEqual([
      'TI-BD-001-IMG-001', 'TI-BD-001-YT-001', 'TI-BD-001-YT-002',
    ]);
    expect(media.find((item) => item.id === 'TI-BD-001-IMG-001')?.alt).toContain('Duas tabelas relacionais');
    expect(validateCatalog(catalog).lessons.some((item) => item.id === lesson.id)).toBe(true);
  });
});
