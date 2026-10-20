import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { lessonSchema, questionSchema } from '../src/types/schema';

describe('MAT-007 canonical publication', () => {
  const lesson = lessonSchema.parse(JSON.parse(readFileSync('content/lessons/MAT-007.json', 'utf8')));
  const text = JSON.stringify(lesson);
  it('preserves the common unit, full core, flashcards and guided exercises', () => {
    expect(lesson.contests).toEqual(['CRBIO01-2026-ATI', 'SETEC-2026-ATI']);
    expect(lesson.sections?.map(s => s.id)).toEqual(['MAT-007-01']);
    expect(lesson.sections![0]!.text.length).toBeGreaterThan(13000);
    for (let n = 1; n <= 24; n++) expect(text).toContain(`F-MC-009-${String(n).padStart(2, '0')}`);
    for (let n = 1; n <= 12; n++) expect(text).toContain(`T-MC-009-${String(n).padStart(2, '0')}`);
    for (const label of 'ABCDEFGHIJKL') expect(lesson.examples).toContain(`Exemplo ${label}`);
  });
  it('preserves 20 authorial questions and keeps answer feedback out of the lesson', () => {
    const answers = 'BDACEBDCAEB DCAEBDCAE'.replaceAll(' ', '');
    expect(lesson.questions).toHaveLength(20);
    expect(new Set(lesson.questions).size).toBe(20);
    lesson.questions.forEach((id, i) => {
      expect(id).toBe(`Q-MC-009-${String(i + 1).padStart(2, '0')}`);
      const q = questionSchema.parse(JSON.parse(readFileSync(`content/questions/${id}.json`, 'utf8')));
      expect(q.origin).toBe('inédita');
      expect(q.unitIds).toEqual(['MAT-007-01']);
      expect(q.contests).toEqual(lesson.contests);
      expect(q.options).toHaveLength(5);
      expect(q.answer).toBe(answers[i]);
      expect(q.comment.length).toBeGreaterThan(25);
      expect(text).not.toContain(q.comment);
    });
  });
  it('does not score real references or mark candidate resources as verified', () => {
    expect(lesson.media).toEqual(['MAT-007-IMG-001']);
    expect(lesson.requirements.videos).toBe(false);
    expect(lesson.exception).toContain('candidatos opcionais');
    expect(lesson.questions.some(id => id.startsWith('QREF'))).toBe(false);
    expect(lesson.materials![0]!.text).toContain('QREF-MAT007-INDEPAC-001');
    const png = readFileSync('public/media/MAT-007-IMG-001.png');
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
});
