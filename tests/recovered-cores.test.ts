import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lessonSchema, questionSchema } from '../src/types/schema';

describe('canonical hardware and progression cores', () => {
  for (const [id, core] of [['TI-FUND-001', 'TI-FUND-001'], ['MAT-011', 'MC-016']]) {
    const lesson = lessonSchema.parse(JSON.parse(readFileSync(`content/lessons/${id}.json`, 'utf8')));
    it(`${id} retains the 24 flashcards, 12 guided exercises and 20 stable questions`, () => {
      const text = [lesson.theory, lesson.examples, lesson.pitfalls, lesson.summary, lesson.review,
        ...(lesson.sections ?? []).map(s => s.text), ...(lesson.materials ?? []).map(s => s.text)].join('\n');
      for (let n = 1; n <= 24; n++) expect(text).toContain(`F-${core}-${String(n).padStart(2, '0')}`);
      for (let n = 1; n <= 12; n++) expect(text).toContain(`T-${core}-${String(n).padStart(2, '0')}`);
      expect(lesson.questions).toHaveLength(20);
      for (let n = 1; n <= 20; n++) {
        const qid = `Q-${core}-${String(n).padStart(2, '0')}`;
        expect(lesson.questions).toContain(qid);
        const q = questionSchema.parse(JSON.parse(readFileSync(`content/questions/${qid}.json`, 'utf8')));
        expect(q.origin).toBe('inédita');
        expect(q.contentId).toBe(id);
        expect(q.comment.trim().length).toBeGreaterThan(0);
      }
      expect(lesson.questions.some(q => q.startsWith('QREF'))).toBe(false);
    });
    if (id === 'MAT-011') it('keeps progressions exclusive to CRBio and the infinite sum as an extension', () => {
      expect(lesson.contests).toEqual(['CRBIO01-2026-ATI']);
      expect(lesson.sections?.[1]?.text).toContain('EXTENSÃO');
    });
  }
});
