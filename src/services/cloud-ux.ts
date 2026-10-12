import type { CloudMode } from "./cloud-config";

export type CloudPublicStatus =
  | "LOCAL_ONLY"
  | "CLOUD_NOT_ADOPTED"
  | "SYNCING"
  | "UP_TO_DATE"
  | "PENDING_OFFLINE"
  | "AUTH_REQUIRED"
  | "CONFLICTS"
  | "BLOCKED_ERROR"
  | "DISABLED_BY_GATE";

export interface CloudStatusInput {
  cloudMode: CloudMode;
  authenticated: boolean;
  hadCloudAccount: boolean;
  adopted: boolean;
  syncEnabled: boolean;
  online: boolean;
  queued: number;
  sending: number;
  conflicts: number;
  blockedError: boolean;
  syncing: boolean;
  currentScopeHash: string | null;
  sessionGeneration: number;
  lastConfirmedScopeHash: string | null;
  lastConfirmedSessionGeneration: number | null;
}

export interface CloudStatusView {
  status: CloudPublicStatus;
  label: string;
  detail: string;
}

export function deriveCloudPublicStatus(input: CloudStatusInput): CloudPublicStatus {
  if (input.cloudMode === "off") return "DISABLED_BY_GATE";
  if (!input.authenticated) return input.hadCloudAccount ? "AUTH_REQUIRED" : "LOCAL_ONLY";
  if (!input.adopted) return "CLOUD_NOT_ADOPTED";
  if (!input.syncEnabled) return "LOCAL_ONLY";
  if (input.blockedError) return "BLOCKED_ERROR";
  if (input.conflicts > 0) return "CONFLICTS";
  if (!input.online && input.queued + input.sending > 0) return "PENDING_OFFLINE";
  if (input.syncing || input.sending > 0) return "SYNCING";

  const confirmedForCurrentSession =
    input.currentScopeHash !== null &&
    input.lastConfirmedScopeHash === input.currentScopeHash &&
    input.lastConfirmedSessionGeneration === input.sessionGeneration;
  if (
    input.online &&
    input.queued === 0 &&
    input.sending === 0 &&
    input.conflicts === 0 &&
    confirmedForCurrentSession
  )
    return "UP_TO_DATE";

  // Empty outbox alone is not proof of synchronization. Until this exact
  // scope/session completes a pull-confirmed cycle, stay fail-closed.
  return "SYNCING";
}

export function cloudStatusView(status: CloudPublicStatus, pending = 0, conflicts = 0): CloudStatusView {
  switch (status) {
    case "DISABLED_BY_GATE":
      return {
        status,
        label: "Somente neste dispositivo",
        detail: "A sincronização em nuvem está desativada.",
      };
    case "LOCAL_ONLY":
      return {
        status,
        label: "Somente neste dispositivo",
        detail: "Seu progresso continua salvo localmente.",
      };
    case "CLOUD_NOT_ADOPTED":
      return {
        status,
        label: "Configuração da nuvem pendente",
        detail: "Escolha explicitamente como tratar o progresso deste dispositivo.",
      };
    case "SYNCING":
      return {
        status,
        label: "Sincronizando…",
        detail: "A nuvem ainda não foi confirmada para esta sessão.",
      };
    case "UP_TO_DATE":
      return {
        status,
        label: "Sincronizado",
        detail: "O último ciclo foi confirmado para esta sessão.",
      };
    case "PENDING_OFFLINE":
      return {
        status,
        label: `${pending} ${pending === 1 ? "alteração" : "alterações"} aguardando conexão`,
        detail: "As alterações estão salvas localmente e serão enviadas quando houver conexão.",
      };
    case "AUTH_REQUIRED":
      return {
        status,
        label: "Sessão necessária",
        detail: "Entre novamente antes de retomar a sincronização.",
      };
    case "CONFLICTS":
      return {
        status,
        label: `${conflicts} conflito${conflicts === 1 ? "" : "s"} para resolver`,
        detail: "Os dados foram preservados; nenhuma versão foi sobrescrita automaticamente.",
      };
    case "BLOCKED_ERROR":
      return {
        status,
        label: "Sincronização pausada por erro",
        detail: "Seu estudo local continua disponível enquanto o problema é preservado para reconciliação.",
      };
  }
}
