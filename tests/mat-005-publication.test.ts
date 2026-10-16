import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { lessonSchema, questionSchema } from '../src/types/schema';

describe('MAT-005 canonical publication', () => {
  const lesson = lessonSchema.parse(JSON.parse(readFileSync('content/lessons/MAT-005.json', 'utf8')));
  it('preserves both cores, 48 flashcards and ten guided exercises', () => {
    expect(lesson.sections?.map(s => s.id)).toEqual(['MC-011', 'MC-014']);
    const text = lesson.sections!.map(s => s.text).join('\n');
    for (const core of ['011', '014']) for (let n = 1; n <= 24; n++)
      expect(text).toContain(`F-MC-${core}-${String(n).padStart(2, '0')}`);
    for (let n = 1; n <= 10; n++) expect(text).toContain(`T-MC-014-${String(n).padStart(2, '0')}`);
    expect(text.length).toBeGreaterThan(20000);
  });
  it('keeps 35 stable authorial questions and their feedback in the attempt flow', () => {
    expect(lesson.questions).toHaveLength(35);
    expect(new Set(lesson.questions).size).toBe(35);
    for (const id of lesson.questions) {
      const q = questionSchema.parse(JSON.parse(readFileSync(`content/questions/${id}.json`, 'utf8')));
      expect(q.origin).toBe('inédita');
      expect(q.contentId).toBe('MAT-005');
      expect(q.options).toHaveLength(5);
      expect(q.comment.length).toBeGreaterThan(10);
      expect(lesson.sections!.map(s => s.text).join('\n')).not.toContain(`${id} — ${q.answer}.`);
    }
  });
  it('does not label candidate videos as verified or real references as scored questions', () => {
    expect(lesson.media).toEqual(['MAT-005-IMG-001']);
    expect(lesson.exception).toContain('pendência audiovisual');
    expect(lesson.questions.some(id => id.startsWith('QREF'))).toBe(false);
    expect(lesson.materials?.[0]?.text).toContain('QREF-MAT005-QUAD-001');
  });
});
