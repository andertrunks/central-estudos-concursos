import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Attempt,
  Review,
  SimulationResult,
  StudyProgress,
  Writing,
} from "../types/schema";
import type { Activity } from "./trail";
import type {
  AccountScope,
  CloudSyncStore,
  RevealedCorrection,
  SimulationSubmission,
  Submission,
  SyncOutboxEntry,
  SyncOutboxRecord,
} from "../types/cloud";

export type StoredAttemptV3 = Attempt & { submissionId?: string };

export interface StudyDBV3 extends DBSchema {
  activities: { key: string; value: Activity };
  progress: { key: string; value: StudyProgress };
  reviews: { key: string; value: Review };
  attempts: {
    key: string;
    value: StoredAttemptV3;
    indexes: { "by-submission": string };
  };
  writings: { key: string; value: Writing };
  results: { key: string; value: SimulationResult };
  submissions: {
    key: string;
    value: Submission;
    indexes: { "by-status": string; "by-question": string; "by-dedupe": string };
  };
  simulationSubmissions: {
    key: string;
    value: SimulationSubmission;
    indexes: { "by-status": string; "by-simulation": string; "by-dedupe": string };
  };
  revealedCorrections: {
    key: string;
    value: RevealedCorrection;
    indexes: { "by-question": string };
  };
  syncOutbox: {
    key: string;
    value: SyncOutboxRecord;
    indexes: { "by-status": string; "by-entity": string };
  };
}

export interface LegacyStudyDB extends DBSchema {
  activities: { key: string; value: Activity };
  progress: { key: string; value: StudyProgress };
  reviews: { key: string; value: Review };
  attempts: { key: string; value: Attempt };
  writings: { key: string; value: Writing };
  results: { key: string; value: SimulationResult };
}

export function openLegacyStudyDatabase(dbName = "central-estudos") {
  return openDB<LegacyStudyDB>(dbName, 2, {
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
}

export function openScopedStudyDatabase(
  scope: AccountScope,
  options: { dbName?: string } = {},
): Promise<IDBPDatabase<LegacyStudyDB> | IDBPDatabase<StudyDBV3>> {
  if (scope.mode === "off")
    return openLegacyStudyDatabase(options.dbName ?? scope.studyDbName);
  const dbName = options.dbName ?? scope.studyDbName;
  return openDB<StudyDBV3>(dbName, 3, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore("progress", { keyPath: "id" });
        db.createObjectStore("reviews", { keyPath: "id" });
        db.createObjectStore("attempts", { keyPath: "id" });
        db.createObjectStore("writings", { keyPath: "id" });
        db.createObjectStore("results", { keyPath: "id" });
      }
      if (oldVersion < 2) db.createObjectStore("activities", { keyPath: "id" });
      if (oldVersion < 3) {
        const attempts = tx.objectStore("attempts");
        if (!attempts.indexNames.contains("by-submission"))
          attempts.createIndex("by-submission", "submissionId", { unique: true });

        const submissions = db.createObjectStore("submissions", { keyPath: "id" });
        submissions.createIndex("by-status", "status");
        submissions.createIndex("by-question", "questionId");
        submissions.createIndex("by-dedupe", "dedupeKey", { unique: true });

        const simulations = db.createObjectStore("simulationSubmissions", { keyPath: "id" });
        simulations.createIndex("by-status", "status");
        simulations.createIndex("by-simulation", "simulationId");
        simulations.createIndex("by-dedupe", "dedupeKey", { unique: true });

        const corrections = db.createObjectStore("revealedCorrections", { keyPath: "id" });
        corrections.createIndex("by-question", "questionId");

        const outbox = db.createObjectStore("syncOutbox", { keyPath: "id" });
        outbox.createIndex("by-status", "status");
        outbox.createIndex("by-entity", "entityId");
      }
    },
  });
}

export async function deleteStudyDatabase(dbName: string) {
  await deleteDB(dbName);
}

export async function atomicPutWithOutbox(
  db: IDBPDatabase<StudyDBV3>,
  store: CloudSyncStore,
  value: unknown,
  entry: SyncOutboxEntry,
) {
  if (entry.entityType !== store)
    throw new Error("Outbox incompatível com a entidade mutada");
  const tx = db.transaction([store, "syncOutbox"], "readwrite");
  const entityStore = tx.objectStore(store) as unknown as {
    put(value: unknown): Promise<IDBValidKey>;
  };
  try {
    await entityStore.put(value);
    await tx.objectStore("syncOutbox").add(entry);
    await tx.done;
  } catch (error) {
    await tx.done.catch(() => undefined);
    throw error;
  }
}
