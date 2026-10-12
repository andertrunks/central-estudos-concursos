import type { IDBPDatabase } from "idb";
import type { Activity } from "./trail";
import type { StudyDBV3, StoredAttemptV3 } from "./storage-db";
import type { Review, SimulationResult, StudyProgress, Writing } from "../types/schema";
import type { SimulationSubmission, Submission } from "../types/cloud";

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
  return buildBackupV2({
    activities,
    progress,
    reviews,
    attempts,
    writings,
    results,
    submissions,
    simulationSubmissions,
  });
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
  ];
  for (const key of forbiddenKeys)
    if (serialized.includes(key)) throw new Error("BackupV2 contém metadata técnica ou privada");
  return true;
}
