import type { IDBPDatabase } from "idb";
import { z } from "zod";
import { activitySchema, type Activity } from "./trail";
import {
  openScopedStudyDatabase,
  type StudyDBV3,
  type StoredAttemptV3,
} from "./storage-db";
import {
  backupSchema,
  importBackup,
  loadState,
  type Backup,
} from "./storage";
import { getActiveStudyScope } from "./study-storage-route";
import { ANNULLED_ING001_032 } from "./cloud-protocol";
import {
  attemptSchema,
  progressSchema,
  resultSchema,
  reviewSchema,
  writingSchema,
  type Review,
  type SimulationResult,
  type StudyProgress,
  type Writing,
} from "../types/schema";
import type { SimulationSubmission, Submission } from "../types/cloud";

const nonEmpty = z.string().min(1);
const reasonSchema = z.enum(["conteúdo", "interpretação", "distração", "chute"]);
const pendingStatusSchema = z.enum(["pending", "finalized"]);

const storedAttemptSchema = attemptSchema
  .extend({ submissionId: z.string().min(1).optional() })
  .strict();

const submissionSchema = z
  .object({
    id: nonEmpty,
    dedupeKey: nonEmpty,
    questionId: nonEmpty,
    contentId: nonEmpty,
    unitIds: z.array(nonEmpty),
    activityId: nonEmpty.optional(),
    promptHash: nonEmpty,
    answer: z.string(),
    reason: reasonSchema,
    submittedAt: nonEmpty,
    status: pendingStatusSchema,
    finalizedAt: nonEmpty.nullable(),
    attemptId: nonEmpty.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "pending" && (value.finalizedAt !== null || value.attemptId !== null))
      ctx.addIssue({ code: "custom", message: "Submission pending não pode ter finalização" });
    if (value.status === "finalized" && (!value.finalizedAt || !value.attemptId))
      ctx.addIssue({ code: "custom", message: "Submission finalized exige finalizedAt e attemptId" });
  });

const simulationItemSchema = z
  .object({
    questionId: nonEmpty,
    contentId: nonEmpty,
    discipline: nonEmpty,
    unitIds: z.array(nonEmpty),
    promptHash: nonEmpty,
    answer: z.string().nullable(),
  })
  .strict();

const simulationSubmissionSchema = z
  .object({
    id: nonEmpty,
    dedupeKey: nonEmpty,
    simulationId: nonEmpty,
    activityId: nonEmpty.optional(),
    submittedAt: nonEmpty,
    seconds: z.number().nonnegative(),
    status: pendingStatusSchema,
    finalizedAt: nonEmpty.nullable(),
    resultId: nonEmpty.nullable(),
    scoringSnapshot: z
      .object({
        correctPoints: z.number(),
        wrongPoints: z.number(),
        blankPoints: z.number(),
      })
      .strict(),
    items: z.array(simulationItemSchema).min(1),
    annulledQuestionIds: z.array(nonEmpty),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "pending" && (value.finalizedAt !== null || value.resultId !== null))
      ctx.addIssue({ code: "custom", message: "SimulationSubmission pending não pode ter finalização" });
    if (value.status === "finalized" && (!value.finalizedAt || !value.resultId))
      ctx.addIssue({ code: "custom", message: "SimulationSubmission finalized exige finalizedAt e resultId" });
  });

export const backupV2Schema = z
  .object({
    version: z.literal(2),
    activities: z.array(activitySchema),
    progress: z.array(progressSchema),
    reviews: z.array(reviewSchema),
    attempts: z.array(storedAttemptSchema),
    writings: z.array(writingSchema),
    results: z.array(resultSchema),
    submissions: z.array(submissionSchema),
    simulationSubmissions: z.array(simulationSubmissionSchema),
  })
  .strict();

export interface BackupV2 {
  version: 2;
  activities: Activity[];
  progress: StudyProgress[];
  reviews: Review[];
  attempts: StoredAttemptV3[];
  writings: Writing[];
  results: SimulationResult[];
  submissions: Submission[];
  simulationSubmissions: SimulationSubmission[];
}

function sorted<T extends { id: string }>(values: T[]) {
  return [...values].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildBackupV2(input: Omit<BackupV2, "version">): BackupV2 {
  return {
    version: 2,
    activities: sorted(input.activities),
    progress: sorted(input.progress),
    reviews: sorted(input.reviews),
    attempts: sorted(input.attempts),
    writings: sorted(input.writings),
    results: sorted(input.results),
    submissions: sorted(input.submissions),
    simulationSubmissions: sorted(input.simulationSubmissions),
  };
}

export function migrateBackupV1ToV2(input: unknown): BackupV2 {
  const legacy = backupSchema.parse(input);
  return buildBackupV2({
    activities: legacy.activities ?? [],
    progress: legacy.progress,
    reviews: legacy.reviews,
    attempts: legacy.attempts,
    writings: legacy.writings,
    results: legacy.results,
    submissions: [],
    simulationSubmissions: [],
  });
}

export function parseBackupV2(input: unknown): BackupV2 {
  return backupV2Schema.parse(input) as BackupV2;
}

function sanitizeAnnulled(input: BackupV2): BackupV2 {
  const activities = input.activities.flatMap((activity) => {
    const questionIds = activity.questionIds.filter((id) => id !== ANNULLED_ING001_032);
    if (activity.kind === "questões" && activity.questionIds.length > 0 && questionIds.length === 0)
      return [];
    return [{ ...activity, questionIds }];
  });
  const simulationSubmissions = input.simulationSubmissions.flatMap((submission) => {
    const items = submission.items.filter((item) => item.questionId !== ANNULLED_ING001_032);
    if (items.length === 0) return [];
    return [{
      ...submission,
      items,
      annulledQuestionIds: submission.annulledQuestionIds.filter((id) => id !== ANNULLED_ING001_032),
    }];
  });
  return buildBackupV2({
    activities,
    progress: input.progress,
    reviews: input.reviews,
    attempts: input.attempts.filter((attempt) => attempt.questionId !== ANNULLED_ING001_032),
    writings: input.writings,
    results: input.results,
    submissions: input.submissions.filter((submission) => submission.questionId !== ANNULLED_ING001_032),
    simulationSubmissions,
  });
}

export async function exportBackupV2(db: IDBPDatabase<StudyDBV3>): Promise<BackupV2> {
  const [
    activities,
    progress,
    reviews,
    attempts,
    writings,
    results,
    submissions,
    simulationSubmissions,
  ] = await Promise.all([
    db.getAll("activities"),
    db.getAll("progress"),
    db.getAll("reviews"),
    db.getAll("attempts"),
    db.getAll("writings"),
    db.getAll("results"),
    db.getAll("submissions"),
    db.getAll("simulationSubmissions"),
  ]);
  const value = buildBackupV2({
    activities,
    progress,
    reviews,
    attempts,
    writings,
    results,
    submissions,
    simulationSubmissions,
  });
  assertBackupV2Privacy(value);
  return value;
}

export async function exportActiveBackupV2(): Promise<BackupV2> {
  const scope = getActiveStudyScope();
  if (scope.mode === "off") return migrateBackupV1ToV2(await loadState());
  const db = await openScopedStudyDatabase(scope);
  try {
    if (db.version !== 3) throw new Error("BackupV2 exige StudyDB v3 para estado de conta");
    return exportBackupV2(db as IDBPDatabase<StudyDBV3>);
  } finally {
    db.close();
  }
}

function samePendingSubmission(left: Submission, right: Submission) {
  return left.dedupeKey === right.dedupeKey &&
    left.questionId === right.questionId &&
    left.contentId === right.contentId &&
    left.promptHash === right.promptHash &&
    left.answer === right.answer &&
    left.reason === right.reason &&
    left.activityId === right.activityId &&
    JSON.stringify(left.unitIds) === JSON.stringify(right.unitIds);
}

function sameSimulationSubmission(left: SimulationSubmission, right: SimulationSubmission) {
  return left.dedupeKey === right.dedupeKey &&
    left.simulationId === right.simulationId &&
    left.activityId === right.activityId &&
    left.seconds === right.seconds &&
    JSON.stringify(left.scoringSnapshot) === JSON.stringify(right.scoringSnapshot) &&
    JSON.stringify(left.items) === JSON.stringify(right.items) &&
    JSON.stringify(left.annulledQuestionIds) === JSON.stringify(right.annulledQuestionIds);
}

async function importV2IntoAccount(value: BackupV2) {
  const scope = getActiveStudyScope();
  if (scope.mode !== "account") throw new Error("BackupV2 com estado pending exige um StudyDB v3 de conta");
  const db = await openScopedStudyDatabase(scope);
  if (db.version !== 3) {
    db.close();
    throw new Error("BackupV2 exige StudyDB v3");
  }
  const typed = db as IDBPDatabase<StudyDBV3>;
  const tx = typed.transaction([
    "activities",
    "progress",
    "reviews",
    "attempts",
    "writings",
    "results",
    "submissions",
    "simulationSubmissions",
  ], "readwrite");
  try {
    for (const item of value.activities) await tx.objectStore("activities").put(item);
    for (const item of value.progress) await tx.objectStore("progress").put(item);
    for (const item of value.reviews) await tx.objectStore("reviews").put(item);
    for (const item of value.attempts) await tx.objectStore("attempts").put(item);
    for (const item of value.writings) await tx.objectStore("writings").put(item);
    for (const item of value.results) await tx.objectStore("results").put(item);

    for (const incoming of value.submissions) {
      const store = tx.objectStore("submissions");
      const byDedupe = await store.index("by-dedupe").get(incoming.dedupeKey);
      if (byDedupe && byDedupe.id !== incoming.id)
        throw new Error("BackupV2 contém dedupeKey de Submission já associado a outro ID");
      const existing = await store.get(incoming.id);
      if (existing) {
        if (!samePendingSubmission(existing, incoming))
          throw new Error("BackupV2 tenta alterar resposta imutável de uma Submission existente");
        if (existing.status === "finalized" && incoming.status === "pending") continue;
        if (existing.status === "finalized" && incoming.status === "finalized" &&
            (existing.attemptId !== incoming.attemptId || existing.finalizedAt !== incoming.finalizedAt))
          throw new Error("BackupV2 diverge da finalização existente de Submission");
      }
      await store.put(incoming);
    }

    for (const incoming of value.simulationSubmissions) {
      const store = tx.objectStore("simulationSubmissions");
      const byDedupe = await store.index("by-dedupe").get(incoming.dedupeKey);
      if (byDedupe && byDedupe.id !== incoming.id)
        throw new Error("BackupV2 contém dedupeKey de SimulationSubmission já associado a outro ID");
      const existing = await store.get(incoming.id);
      if (existing) {
        if (!sameSimulationSubmission(existing, incoming))
          throw new Error("BackupV2 tenta alterar respostas imutáveis de SimulationSubmission existente");
        if (existing.status === "finalized" && incoming.status === "pending") continue;
        if (existing.status === "finalized" && incoming.status === "finalized" &&
            (existing.resultId !== incoming.resultId || existing.finalizedAt !== incoming.finalizedAt))
          throw new Error("BackupV2 diverge da finalização existente de SimulationSubmission");
      }
      await store.put(incoming);
    }
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch { /* transaction may already be complete */ }
    await tx.done.catch(() => undefined);
    throw error;
  } finally {
    db.close();
  }
}

export async function importPedagogicalBackup(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Backup inválido");
  const version = (input as { version?: unknown }).version;
  if (version === 1) {
    await importBackup(input);
    return { version: 1 as const };
  }
  if (version !== 2) throw new Error("Versão de backup não suportada");

  const value = sanitizeAnnulled(parseBackupV2(input));
  assertBackupV2Privacy(value);
  const scope = getActiveStudyScope();
  const hasV3OnlyState = value.submissions.length > 0 || value.simulationSubmissions.length > 0 ||
    value.attempts.some((attempt) => Boolean(attempt.submissionId));
  if (scope.mode === "off") {
    if (hasV3OnlyState)
      throw new Error("Este BackupV2 contém respostas pendentes; restaure-o em um espaço local de conta para preservá-las");
    const legacy: Backup = {
      version: 1,
      activities: value.activities,
      progress: value.progress,
      reviews: value.reviews,
      attempts: value.attempts.map(({ submissionId: _submissionId, ...attempt }) => attempt),
      writings: value.writings,
      results: value.results,
    };
    await importBackup(legacy);
    return { version: 2 as const };
  }
  await importV2IntoAccount(value);
  return { version: 2 as const };
}

export function assertBackupV2Privacy(value: BackupV2) {
  const serialized = JSON.stringify(value);
  const forbiddenKeys = [
    '"scopeHash"',
    '"sessionGeneration"',
    '"syncOutbox"',
    '"remoteBase"',
    '"lease"',
    '"mutationId"',
    '"requestHash"',
    '"access_token"',
    '"refresh_token"',
    '"revealedCorrections"',
    '"comment"',
  ];
  for (const key of forbiddenKeys)
    if (serialized.includes(key)) throw new Error("BackupV2 contém metadata técnica ou privada");
  return true;
}
