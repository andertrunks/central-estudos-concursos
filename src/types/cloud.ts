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

export interface SyncOutboxEntry {
  id: string;
  mutationId: string;
  entityType: SyncableStore;
  entityId: string;
  operation: "put" | "delete";
  basePayload: unknown | null;
  nextPayload: unknown | null;
  createdAt: string;
  status: "pending";
}

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
