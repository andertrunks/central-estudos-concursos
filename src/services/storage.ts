import { openDB, type DBSchema } from "idb";
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
interface StudyDB extends DBSchema {
  progress: { key: string; value: StudyProgress };
  reviews: { key: string; value: Review };
  attempts: { key: string; value: Attempt };
  writings: { key: string; value: Writing };
  results: { key: string; value: SimulationResult };
}
export const backupSchema = z.object({
  version: z.literal(1),
  progress: z.array(progressSchema),
  reviews: z.array(reviewSchema),
  attempts: z.array(attemptSchema),
  writings: z.array(writingSchema),
  results: z.array(resultSchema),
});
export type Backup = z.infer<typeof backupSchema>;
export async function database() {
  return openDB<StudyDB>("central-estudos", 1, {
    upgrade(db) {
      db.createObjectStore("progress", { keyPath: "id" });
      db.createObjectStore("reviews", { keyPath: "id" });
      db.createObjectStore("attempts", { keyPath: "id" });
      db.createObjectStore("writings", { keyPath: "id" });
      db.createObjectStore("results", { keyPath: "id" });
    },
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
  return { version: 1, progress, reviews, attempts, writings, results };
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
    await tx.objectStore("progress").put(p);
  }
  await tx.done;
}
export async function recordAnswer(
  q: Question,
  answer: string,
  reason: Attempt["reason"] = "conteúdo",
  day = today(),
) {
  if (!q.options.some((o) => o.id === answer))
    throw new Error("Alternativa inválida");
  const db = await database();
  const tx = db.transaction(["progress", "attempts", "reviews"], "readwrite");
  const correct = answer === q.answer;
  const id = crypto.randomUUID();
  const a: Attempt = {
    id,
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
    ["progress", "reviews", "attempts", "writings", "results"],
    "readwrite",
  );
  for (const p of b.progress) await tx.objectStore("progress").put(p);
  for (const r of b.reviews) await tx.objectStore("reviews").put(r);
  for (const a of b.attempts) await tx.objectStore("attempts").put(a);
  for (const w of b.writings) await tx.objectStore("writings").put(w);
  for (const r of b.results) await tx.objectStore("results").put(r);
  await tx.done;
}
