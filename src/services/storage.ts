import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { z } from "zod";
import {
  progressSchema,
  reviewSchema,
  attemptSchema,
  writingSchema,
  resultSchema,
  type StudyProgress,
  type Review,
  type Attempt,
  type Writing,
  type SimulationResult,
  type Question,
} from "../types/schema";
import { today, progressFor, scheduleReviews, addDays } from "./study";
import { activitySchema, lessonUnits, recommendations, type Activity } from './trail';
import type { Catalog } from '../types/schema';
interface StudyDB extends DBSchema {
  activities: { key: string; value: Activity };
  progress: { key: string; value: StudyProgress };
  reviews: { key: string; value: Review };
  attempts: { key: string; value: Attempt };
  writings: { key: string; value: Writing };
  results: { key: string; value: SimulationResult };
}
export const backupSchema = z.object({
  version: z.literal(1),
  activities: z.array(activitySchema).optional(),
  progress: z.array(progressSchema),
  reviews: z.array(reviewSchema),
  attempts: z.array(attemptSchema),
  writings: z.array(writingSchema),
  results: z.array(resultSchema),
});
export type Backup = z.infer<typeof backupSchema>;
export async function database() {
  return new Promise<IDBPDatabase<StudyDB>>((resolve, reject) => {
    let blocked = false;
    const opening = openDB<StudyDB>("central-estudos", 2, {
    blocked() {
      blocked = true;
      reject(new Error('Feche as outras abas da Central de Estudos e recarregue esta página para atualizar o progresso com segurança.'));
    },
    blocking() { void opening.then(db => db.close()); },
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
      db.createObjectStore("progress", { keyPath: "id" });
      db.createObjectStore("reviews", { keyPath: "id" });
      db.createObjectStore("attempts", { keyPath: "id" });
      db.createObjectStore("writings", { keyPath: "id" });
      db.createObjectStore("results", { keyPath: "id" });
      }
      if (oldVersion < 2) db.createObjectStore("activities", { keyPath: "id" });
    },
    });
    void opening.then(db => { if (blocked) db.close(); else resolve(db); }, reject);
  });
}
export async function loadState(): Promise<Backup> {
  const db = await database();
  const [progress, reviews, attempts, writings, results] = await Promise.all([
    db.getAll("progress"),
    db.getAll("reviews"),
    db.getAll("attempts"),
    db.getAll("writings"),
    db.getAll("results"),
  ]);
  return { version: 1, progress, reviews, attempts, writings, results, activities: await db.getAll('activities') };
}
export async function setProgress(
  id: string,
  status: StudyProgress["status"],
  day = today(),
) {
  const db = await database();
  const tx = db.transaction(["progress", "reviews"], "readwrite");
  const previous = await tx.objectStore("progress").get(id);
  const p = previous ?? progressFor(id, day);
  p.status = status;
  p.lastAccess = day;
  p.startedAt ??= day;
  p.percent =
    status === "concluído"
      ? 100
      : status === "não iniciado"
        ? 0
        : status === "revisar"
          ? p.percent
          : 50;
  if (status === "concluído" && previous?.completedAt == null) {
    p.completedAt = day;
    p.nextReview = day;
    for (const r of scheduleReviews(id, day))
      await tx.objectStore("reviews").put(r);
  }
  if (status === "revisar") {
    p.nextReview = day;
    await tx.objectStore("reviews").put({
      id: `${id}:manual:${day}`,
      contentId: id,
      stage: "ERRO",
      due: day,
      doneAt: null,
    });
  }
  await tx.objectStore("progress").put(p);
  await tx.done;
}
export async function completeReview(id: string, day = today()) {
  const db = await database();
  const tx = db.transaction(["reviews", "progress"], "readwrite");
  const r = await tx.objectStore("reviews").get(id);
  if (!r) throw new Error("Revisão inexistente");
  r.doneAt = day;
  await tx.objectStore("reviews").put(r);
  const p = await tx.objectStore("progress").get(r.contentId);
  if (p) {
    p.lastReview = day;
    const pending = (await tx.objectStore("reviews").getAll())
      .filter((x) => x.contentId === r.contentId && !x.doneAt)
      .sort((a, b) => a.due.localeCompare(b.due));
    p.nextReview = pending[0]?.due ?? null;
    if (!pending.some(x => x.due <= day)) p.status = p.completedAt ? 'concluído' : 'em andamento';
    await tx.objectStore("progress").put(p);
  }
  await tx.done;
}
export async function recordAnswer(
  q: Question,
  answer: string,
  reason: Attempt["reason"] = "conteúdo",
  day = today(),
  activityId?: string,
) {
  if (!q.options.some((o) => o.id === answer))
    throw new Error("Alternativa inválida");
  const db = await database();
  const tx = db.transaction(["progress", "attempts", "reviews"], "readwrite");
  if (activityId) {
    const previous = (await tx.objectStore('attempts').getAll()).find(a => a.activityId === activityId && a.questionId === q.id);
    if (previous) { await tx.done; return previous; }
  }
  const correct = answer === q.answer;
  const id = crypto.randomUUID();
  const a: Attempt = {
    id,
    ...(activityId ? { activityId } : {}),
    questionId: q.id,
    contentId: q.contentId,
    date: day,
    answer,
    correct,
    reason,
    resolvedAt: null,
  };
  await tx.objectStore("attempts").put(a);
  const p =
    (await tx.objectStore("progress").get(q.contentId)) ??
    progressFor(q.contentId, day);
  p.total++;
  if (correct) p.correct++;
  else {
    p.wrong++;
    p.status = "revisar";
    const due = addDays(day, 2);
    p.nextReview = p.nextReview && p.nextReview < due ? p.nextReview : due;
    await tx.objectStore("reviews").put({
      id: `${q.contentId}:erro:${id}`,
      contentId: q.contentId,
      stage: "ERRO",
      ...(q.unitIds?.length === 1 ? { unitId: q.unitIds[0] } : {}),
      due,
      doneAt: null,
    });
  }
  p.lastAccess = day;
  await tx.objectStore("progress").put(p);
  await tx.done;
  return a;
}
export async function classifyError(id: string, reason: Attempt["reason"]) {
  const db = await database();
  const a = await db.get("attempts", id);
  if (!a) throw new Error("Erro não encontrado");
  await db.put("attempts", { ...a, reason });
}
export async function resolveError(id: string) {
  const db = await database();
  const a = await db.get("attempts", id);
  if (!a) throw new Error("Erro não encontrado");
  await db.put("attempts", { ...a, resolvedAt: today() });
}
export async function saveWriting(w: Writing) {
  const db = await database();
  await db.put("writings", writingSchema.parse(w));
}
export async function saveResult(r: SimulationResult) {
  const db = await database();
  await db.put("results", resultSchema.parse(r));
}
export async function completeSimulation(
  result: SimulationResult,
  questions: Question[],
  answers: Record<string, string>,
) {
  const validated = resultSchema.parse(result);
  for (const q of questions) {
    const answer = answers[q.id];
    if (answer && !q.options.some((o) => o.id === answer))
      throw new Error("Alternativa inválida");
  }
  const db = await database();
  const tx = db.transaction(
    ["results", "progress", "attempts", "reviews"],
    "readwrite",
  );
  if (await tx.objectStore("results").get(validated.id)) {
    await tx.done;
    return;
  }
  for (const q of questions) {
    const answer = answers[q.id];
    if (!answer) continue;
    const correct = answer === q.answer;
    const id = `${result.id}:${q.id}`;
    await tx.objectStore("attempts").put({
      id,
      questionId: q.id,
      contentId: q.contentId,
      date: result.date,
      answer,
      correct,
      reason: "conteúdo",
      resolvedAt: null,
    });
    const p =
      (await tx.objectStore("progress").get(q.contentId)) ??
      progressFor(q.contentId, result.date);
    p.total++;
    p.lastAccess = result.date;
    if (correct) p.correct++;
    else {
      p.wrong++;
      p.status = "revisar";
      const due = addDays(result.date, 2);
      p.nextReview = p.nextReview && p.nextReview < due ? p.nextReview : due;
      await tx.objectStore("reviews").put({
        id: `${q.contentId}:erro:${id}`,
        contentId: q.contentId,
        stage: "ERRO",
        due,
        doneAt: null,
      });
    }
    await tx.objectStore("progress").put(p);
  }
  await tx.objectStore("results").put(validated);
  await tx.done;
}
export async function importBackup(input: unknown) {
  const b = backupSchema.parse(input);
  const db = await database();
  const tx = db.transaction(
    ["progress", "reviews", "attempts", "writings", "results", "activities"],
    "readwrite",
  );
  for (const p of b.progress) await tx.objectStore("progress").put(p);
  for (const r of b.reviews) await tx.objectStore("reviews").put(r);
  for (const a of b.attempts) await tx.objectStore("attempts").put(a);
  for (const w of b.writings) await tx.objectStore("writings").put(w);
  for (const r of b.results) await tx.objectStore("results").put(r);
  for (const a of b.activities ?? []) await tx.objectStore('activities').put(a);
  await tx.done;
}

export async function beginNextActivity(data: Catalog, day = today()) {
  const db = await database();
  const tx = db.transaction(['activities','progress','reviews','attempts','writings','results'], 'readwrite');
  const state: Backup = { version: 1, activities: await tx.objectStore('activities').getAll(),
    progress: await tx.objectStore('progress').getAll(), reviews: await tx.objectStore('reviews').getAll(),
    attempts: await tx.objectStore('attempts').getAll(), writings: await tx.objectStore('writings').getAll(), results: await tx.objectStore('results').getAll() };
  const next = recommendations(data, state, day)[0];
  if (!next) { await tx.done; return null; }
  const previous = await tx.objectStore('activities').get(next.id);
  if (previous && !previous.completedAt) { await tx.done; return previous; }
  const activity = activitySchema.parse({ ...next, startedAt: day, completedAt: null,
    sequence: Math.max(0, ...(state.activities ?? []).map(a => a.sequence)) + 1 });
  await tx.objectStore('activities').put(activity);
  const p = state.progress.find(p => p.id === next.contentId) ?? progressFor(next.contentId, day);
  p.startedAt ??= day; p.lastAccess = day;
  if (p.status === 'não iniciado') p.status = 'em andamento';
  await tx.objectStore('progress').put(p);
  await tx.done;
  return activity;
}

export async function finishActivity(id: string, data: Catalog, day = today()) {
  const db = await database();
  const tx = db.transaction(['activities','progress','reviews','attempts','writings','results'], 'readwrite');
  const a = await tx.objectStore('activities').get(id);
  if (!a) throw new Error('Atividade não encontrada');
  if (a.completedAt) { await tx.done; return; }
  const attempts = await tx.objectStore('attempts').getAll();
  if (a.kind === 'questões' && a.questionIds.some(id => !attempts.some(t => t.activityId === a.id && t.questionId === id)))
    throw new Error('Responda todas as questões antes de concluir.');
  if (a.kind === 'discursiva' && (await tx.objectStore('writings').get(a.targetId ?? ''))?.status !== 'concluída')
    throw new Error('Conclua e salve o texto antes de continuar.');
  if (a.kind === 'simulado' && !(await tx.objectStore('results').getAll()).some(r => r.simulationId === a.targetId))
    throw new Error('Finalize o simulado antes de continuar.');
  const lesson = data.lessons.find(l => l.id === a.contentId);
  if (a.kind === 'aula' && !lesson) throw new Error('Aula indisponível');
  a.completedAt = day;
  await tx.objectStore('activities').put(a);
  const p = (await tx.objectStore('progress').get(a.contentId)) ?? progressFor(a.contentId, day);
  if (a.kind === 'aula') {
    if (!lesson) { tx.abort(); throw new Error('Aula indisponível'); }
    const units = lessonUnits(lesson);
    const activities = await tx.objectStore('activities').getAll();
    const count = units.filter(u => activities.some(a => a.kind === 'aula' && a.contentId === lesson.id && a.unitId === u.id && a.completedAt)).length;
    p.percent = Math.max(p.percent, Math.round(count / units.length * 100));
    if (count === units.length) { p.completedAt ??= day; p.status = 'concluído'; }
    else if (p.status !== 'revisar') p.status = 'em andamento';
    for (const r of scheduleReviews(a.unitId ?? a.contentId, day))
      await tx.objectStore('reviews').put({ ...r, contentId: a.contentId, unitId: a.unitId });
  }
  for (const id of a.reviewIds) {
    const review = await tx.objectStore('reviews').get(id);
    if (!review || review.doneAt || review.due > day) continue;
    review.doneAt = day;
    await tx.objectStore('reviews').put(review);
    p.lastReview = day;
    for (const attempt of attempts.filter(t => id === `${t.contentId}:erro:${t.id}`))
      await tx.objectStore('attempts').put({ ...attempt, resolvedAt: day });
  }
  const pending = (await tx.objectStore('reviews').getAll()).filter(r => r.contentId === a.contentId && !r.doneAt).sort((a,b) => a.due.localeCompare(b.due));
  p.nextReview = pending[0]?.due ?? null; p.lastAccess = day;
  if (pending.some(r => r.due <= day)) p.status = 'revisar';
  else if (p.status === 'revisar') p.status = p.completedAt ? 'concluído' : 'em andamento';
  await tx.objectStore('progress').put(p);
  await tx.done;
}
