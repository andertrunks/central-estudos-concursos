import type { Catalog, Lesson, Question } from '../types/schema';
import type { Backup } from './storage';
import { activeContests, daysUntil, focusContest, priorityScore, today } from './study';
import { z } from 'zod';

export const activitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['aula', 'questões', 'revisão', 'reforço', 'discursiva', 'simulado']),
  contentId: z.string().min(1),
  unitId: z.string().optional(),
  title: z.string().min(1),
  questionIds: z.array(z.string()),
  reviewIds: z.array(z.string()),
  targetId: z.string().optional(),
  startedAt: z.iso.date(),
  completedAt: z.iso.date().nullable(),
  sequence: z.number().int().nonnegative(),
});
export type Activity = z.infer<typeof activitySchema>;
export type Recommendation = Omit<Activity, 'startedAt' | 'completedAt' | 'sequence'> & { score: number; reasons: string[] };
export function lessonUnits(lesson: Lesson): NonNullable<Lesson['sections']> {
  return lesson.sections?.length ? lesson.sections : [{ id: lesson.id, title: lesson.title, text: lesson.theory }];
}
export function studiedUnit(data: Catalog, state: Backup, contentId: string, unitId: string) {
  const activities = state.activities ?? [];
  return activities.some(a => a.kind === 'aula' && a.contentId === contentId && a.unitId === unitId && a.completedAt)
    || Boolean(state.progress.find(p => p.id === contentId)?.completedAt && data.lessons.some(l => l.id === contentId));
}
function questionOrder(a: Question, b: Question, board: string | undefined) {
  const rank = (q: Question) => q.origin === 'real' ? (q.banca === board ? 0 : 1) : 2;
  return rank(a) - rank(b) || a.id.localeCompare(b.id);
}

/** Pure, deterministic selection. Published material only; no invented exam weights. */
export function recommendations(data: Catalog, state: Backup, now = today()): Recommendation[] {
  const activities = state.activities ?? [];
  const active = activeContests(data, now);
  const focus = focusContest(data, now);
  const candidates: Recommendation[] = [];
  const completed = activities.filter(a => a.completedAt).sort((a,b) => b.sequence - a.sequence);
  const last = completed[0];
  const sameTypeRun = last ? completed.findIndex(a => a.kind !== last.kind) : 0;
  const run = sameTypeRun < 0 ? completed.length : sameTypeRun;
  const lessonCount = completed.filter(a => a.kind === 'aula').length;
  const secondarySlot = lessonCount % 10 >= Math.round(data.policy.primaryShare * 10);
  for (const lesson of data.lessons) {
    const ref = data.references.find(r => r.id === lesson.id && r.status === 'publicado');
    if (!ref || !ref.contests.some(x => active.some(c => c.id === x.contestId))) continue;
    const p = state.progress.find(p => p.id === ref.id);
    const base = priorityScore(ref, data, p, state.reviews, now);
    const units = lessonUnits(lesson);
    const studied = units.filter(u => studiedUnit(data, state, lesson.id, u.id));
    const pending = units.find(u => !studiedUnit(data, state, lesson.id, u.id));
    const primary = ref.contests.some(c => c.contestId === focus?.id);
    const slot = secondarySlot === !primary ? 1000 : 0;
    const recency = p ? Math.min(60, Math.max(0, -daysUntil(p.lastAccess, now))) : 0;
    const coverage = (1 - studied.length / units.length) * 30;
    const variation = last?.contentId === lesson.id ? -80 : 0;
    const baseScore = base.score + recency + coverage + variation;
    if (pending) candidates.push({
      id: `aula:${lesson.id}:${pending.id}`, kind: 'aula', contentId: lesson.id, unitId: pending.id,
      title: pending.title, questionIds: [], reviewIds: [],
      score: baseScore + slot + (p?.status === 'em andamento' ? 35 : 0),
      reasons: [...base.reasons, `${studied.length} de ${units.length} etapas estudadas`],
    });
    const due = state.reviews.filter(r => r.contentId === lesson.id && !r.doneAt && r.due <= now);
    // Group same-content/unit reviews due together, without marking future reviews complete.
    for (const unitId of new Set(due.map(r => r.unitId))) {
      const reviews = due.filter(r => r.unitId === unitId);
      const unit = units.find(u => u.id === unitId);
      const first = [...reviews].sort((a,b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id))[0];
      if (!first) continue;
      const reinforcement = reviews.some(r => r.stage === 'ERRO');
      candidates.push({ id: `revisão:${first.id}`, kind: reinforcement ? 'reforço' : 'revisão', contentId: lesson.id,
        unitId, title: unit?.title ?? lesson.title, questionIds: [], reviewIds: reviews.map(r => r.id),
        score: baseScore + 1600 + Math.min(300, -daysUntil(first.due, now) * 10),
        reasons: [reinforcement ? 'Revisão recomendada pelos seus erros' : 'Revisão programada', ...base.reasons],
      });
    }
    // Per-unit bank relationships must be editorially declared. Unmapped questions wait for the whole lesson.
    const available = data.questions.filter(q => q.contentId === lesson.id && q.contests.some(c => active.some(a => a.id === c))
      && (q.unitIds?.length ? q.unitIds.every(id => studied.some(u => u.id === id)) : !pending));
    const unanswered = available.filter(q => !state.attempts.some(a => a.questionId === q.id))
      .sort((a,b) => questionOrder(a,b,focus?.banca));
    const block = unanswered.slice(0, 5);
    if (block[0]) candidates.push({ id: `questões:${lesson.id}:${block[0].id}`, kind: 'questões', contentId: lesson.id,
      title: `Prática de ${lesson.subject}`, questionIds: block.map(q => q.id), reviewIds: [],
      score: baseScore + 1200, reasons: ['Pratique o que você já estudou', ...base.reasons],
    });
    for (const d of data.discursives.filter(d => d.contentIds.includes(lesson.id) && active.some(c => c.id === d.contestId))) {
      if (!pending && !state.writings.some(w => w.id === d.id && w.status === 'concluída')) candidates.push({
        id: `discursiva:${d.id}`, kind: 'discursiva', contentId: lesson.id, title: d.title, targetId: d.id,
        questionIds: [], reviewIds: [], score: baseScore + 500, reasons: ['Treino escrito após a base teórica'],
      });
    }
  }
  for (const sim of data.simulations) {
    const contentIds = [...new Set(data.questions.filter(q => sim.questionIds.includes(q.id)).map(q => q.contentId))];
    if (contentIds.length && active.some(c => c.id === sim.contestId) && !state.results.some(r => r.simulationId === sim.id)
      && contentIds.every(id => state.progress.some(p => p.id === id && p.completedAt))) candidates.push({
      id: `simulado:${sim.id}`, kind: 'simulado', contentId: contentIds[0]!, title: sim.title, targetId: sim.id,
      questionIds: sim.questionIds, reviewIds: [], score: 1700, reasons: ['Consolidação dos conteúdos estudados'],
    });
  }
  // At most two consecutive activities of the same kind when alternatives exist.
  if (last && run >= 2 && candidates.some(c => c.kind !== last.kind)) {
    for (const c of candidates) if (c.kind === last.kind) c.score -= 10000;
  }
  const sorted = candidates.filter(c => !activities.some(a => a.id === c.id && a.completedAt))
    .sort((a,b) => b.score - a.score || a.id.localeCompare(b.id));
  const current = activities.filter(a => !a.completedAt)
    .sort((a,b) => b.sequence - a.sequence)
    .find(a => data.lessons.some(l => l.id === a.contentId) && data.references.some(r => r.id === a.contentId && r.contests.some(c => active.some(x => x.id === c.contestId))));
  if (current) return [{ ...current, score: Number.MAX_SAFE_INTEGER, reasons: ['Retome a atividade em andamento'] }, ...sorted.filter(c => c.id !== current.id)];
  return sorted;
}
