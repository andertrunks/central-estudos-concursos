export type LocalScope = {
  mode: "off";
  scopeHash: null;
  studyDbName: "central-estudos";
  syncMetaDbName: null;
};

export type ScopedAccount = {
  mode: "account";
  scopeHash: string;
  studyDbName: string;
  syncMetaDbName: string;
};

export type AccountScope = LocalScope | ScopedAccount;

export type PendingStatus = "pending" | "finalized";

export interface Submission {
  id: string;
  dedupeKey: string;
  questionId: string;
  contentId: string;
  unitIds: string[];
  activityId?: string;
  promptHash: string;
  answer: string;
  reason: "conteúdo" | "interpretação" | "distração" | "chute";
  submittedAt: string;
  status: PendingStatus;
  finalizedAt: string | null;
  attemptId: string | null;
}

export interface SimulationSubmissionItem {
  questionId: string;
  contentId: string;
  discipline: string;
  unitIds: string[];
  promptHash: string;
  answer: string | null;
}

export interface SimulationSubmission {
  id: string;
  dedupeKey: string;
  simulationId: string;
  activityId?: string;
  submittedAt: string;
  seconds: number;
  status: PendingStatus;
  finalizedAt: string | null;
  resultId: string | null;
  scoringSnapshot: {
    correctPoints: number;
    wrongPoints: number;
    blankPoints: number;
  };
  items: SimulationSubmissionItem[];
  annulledQuestionIds: string[];
}

export interface RevealedCorrection {
  id: string;
  questionId: string;
  promptHash: string;
  answer: string;
  comment: string;
  revealedAt: string;
}

/** Stores present in StudyDB v3. Not every store is cloud-enabled. */
export type SyncableStore =
  | "activities"
  | "progress"
  | "reviews"
  | "attempts"
  | "writings"
  | "results"
  | "submissions"
  | "simulationSubmissions"
  | "revealedCorrections";

/** AUD110 deny-by-default allowlist for PR-4. */
export type CloudSyncStore =
  | "activities"
  | "progress"
  | "reviews"
  | "attempts"
  | "writings"
  | "results";

export type CloudEntityKind =
  | "activity"
  | "progress"
  | "review"
  | "attempt"
  | "writing"
  | "simulation_result";

export type CloudOperation = "upsert" | "delete";
export type OutboxStatus = "queued" | "sending" | "blocked_conflict" | "poisoned";

export interface SyncConflictSnapshot {
  currentRevision: number;
  currentPayloadHash: string | null;
  deleted: boolean;
}

export interface SyncOutboxEntry {
  id: string;
  recordType: "mutation";
  mutationId: string;
  entityType: CloudSyncStore;
  entityKind: CloudEntityKind;
  entityId: string;
  operation: CloudOperation;
  schemaVersion: 1;
  baseRevision: number;
  basePayload: unknown | null;
  targetPayload: unknown | null;
  payloadHash: string;
  requestHash: string;
  predecessorMutationId: string | null;
  createdAt: string;
  status: OutboxStatus;
  retryCount: number;
  nextRetryAt: string | null;
  conflict: SyncConflictSnapshot | null;
}

export interface SyncCursorRecord {
  id: "__cloud_sync_cursor__";
  recordType: "cursor";
  cursor: number;
}

export interface SyncRemoteStateRecord {
  id: string;
  recordType: "remote";
  entityType: CloudSyncStore;
  entityKind: CloudEntityKind;
  entityId: string;
  revision: number;
  changeSeq: number;
  payloadHash: string | null;
  deleted: boolean;
  payload: unknown | null;
}

/** Local-only PR-5 adoption receipt. It shares the technical store for atomicity,
 * but is never a cloud mutation and is ignored by the sync engine. */
export interface BootstrapReceipt {
  id: "__bootstrap_receipt__";
  recordType: "bootstrap";
  status: "bootstrap";
  entityId: "__bootstrap__";
  sourceKind: "legacy-v2" | "backup-v1";
  sourceFingerprint: string;
  targetScopeHash: string;
  appliedStateFingerprint: string;
  importedKeys: Record<CloudSyncStore, string[]>;
  appliedAt: string;
}

/** Durable account-local audit, never eligible for cloud transport. */
export interface WritingConflictResolutionAuditRecord {
  id: string;
  recordType: "writing_conflict_audit";
  entityKind: "writing";
  entityId: string;
  resolutionMutationId: string;
  state: "awaiting_cas" | "cas_applied" | "cas_conflict" | "needs_review";
  choice: "local" | "remote" | "merged";
  createdAt: string;
  previousLocal: import("./schema").Writing;
  previousRemoteRevision: number;
  supersededMutations: SyncOutboxEntry[];
}

export type SyncOutboxRecord =
  | SyncOutboxEntry
  | SyncCursorRecord
  | SyncRemoteStateRecord
  | BootstrapReceipt
  | WritingConflictResolutionAuditRecord;

export interface RemoteBaseRecord {
  id: string;
  payload: unknown;
  updatedAt: string;
}

export interface RevisionRecord {
  id: string;
  revision: string;
  updatedAt: string;
}

export interface ConflictRecord {
  id: string;
  entityType: string;
  entityId: string;
  localPayload: unknown;
  remotePayload: unknown;
  detectedAt: string;
}

export interface LeaseRecord {
  id: string;
  holder: string;
  expiresAt: string;
}
