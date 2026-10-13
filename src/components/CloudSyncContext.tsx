import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuthSession } from "./AuthSessionContext";
import {
  activeStudyScopeForAdoption,
  copyLegacyIntoAccount,
  keepLegacyLocalOnly,
  pauseCloudSync,
  readAdoptionDecision,
  resumeCloudSync,
  startEmptyAccount,
  summarizeLegacyProgress,
  type LegacySummary,
} from "../services/cloud-adoption";
import {
  cloudStatusView,
  deriveCloudPublicStatus,
  type CloudPublicStatus,
  type CloudStatusView,
} from "../services/cloud-ux";
import type { CloudAdoptionSettings } from "../services/sync-meta";
import type { AccountScope } from "../types/cloud";

type CloudSyncValue = {
  status: CloudPublicStatus;
  view: CloudStatusView;
  online: boolean;
  activeScope: AccountScope;
  candidateScope: AccountScope | null;
  cloudAvailable: boolean;
  adoption: CloudAdoptionSettings | null;
  adoptionBusy: boolean;
  adoptionError: string;
  legacySummary: LegacySummary | null;
  keepLocalOnly: () => Promise<void>;
  copyLegacy: () => Promise<void>;
  startEmpty: () => Promise<void>;
  pauseSync: () => Promise<void>;
  resumeSync: () => Promise<void>;
};

const Context = createContext<CloudSyncValue | null>(null);

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuthSession();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [loadedScopeHash, setLoadedScopeHash] = useState<string | null>(null);
  const [adoption, setAdoption] = useState<CloudAdoptionSettings | null>(null);
  const [adoptionBusy, setAdoptionBusy] = useState(false);
  const [adoptionError, setAdoptionError] = useState("");
  const [legacySummary, setLegacySummary] = useState<LegacySummary | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let current = true;
    const scope = auth.candidateScope;
    const clear = () => {
      if (!current) return;
      setLoadedScopeHash(null);
      setAdoption(null);
      setAdoptionError("");
      setLegacySummary(null);
    };
    if (!scope || scope.mode !== "account") {
      queueMicrotask(clear);
      return () => { current = false; };
    }
    void Promise.all([readAdoptionDecision(scope), summarizeLegacyProgress()])
      .then(([decision, summary]) => {
        if (!current) return;
        setLoadedScopeHash(scope.scopeHash);
        setAdoption(decision);
        setAdoptionError("");
        setLegacySummary(summary);
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setLoadedScopeHash(scope.scopeHash);
        setAdoption(null);
        setLegacySummary(null);
        setAdoptionError(cause instanceof Error ? cause.message : "Não foi possível preparar a adoção local");
      });
    return () => { current = false; };
  }, [auth.candidateScope]);

  const candidateHash = auth.candidateScope?.mode === "account"
    ? auth.candidateScope.scopeHash
    : null;
  const effectiveAdoption = candidateHash && loadedScopeHash === candidateHash
    ? adoption
    : null;
  const effectiveSummary = candidateHash && loadedScopeHash === candidateHash
    ? legacySummary
    : null;

  async function applyDecision(
    action: (scope: AccountScope) => Promise<CloudAdoptionSettings>,
  ) {
    const scope = auth.candidateScope;
    if (!scope || scope.mode !== "account") throw new Error("Entre na conta antes de escolher a adoção");
    setAdoptionBusy(true);
    setAdoptionError("");
    try {
      const decision = await action(scope);
      setLoadedScopeHash(scope.scopeHash);
      setAdoption(decision);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível concluir a escolha";
      setAdoptionError(message);
      throw cause;
    } finally {
      setAdoptionBusy(false);
    }
  }

  async function applySyncPreference(
    action: (scope: AccountScope) => Promise<CloudAdoptionSettings>,
  ) {
    const scope = auth.candidateScope;
    if (!scope || scope.mode !== "account") throw new Error("Entre na conta antes de configurar sincronização");
    setAdoptionBusy(true);
    setAdoptionError("");
    try {
      const next = await action(scope);
      setLoadedScopeHash(scope.scopeHash);
      setAdoption(next);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível alterar a sincronização";
      setAdoptionError(message);
      throw cause;
    } finally {
      setAdoptionBusy(false);
    }
  }

  const activeScope = useMemo<AccountScope>(
    () => activeStudyScopeForAdoption(auth.candidateScope, effectiveAdoption),
    [auth.candidateScope, effectiveAdoption],
  );

  const status = deriveCloudPublicStatus({
    cloudMode: auth.cloudMode,
    authenticated: Boolean(auth.session),
    hadCloudAccount: Boolean(effectiveAdoption),
    adopted: Boolean(effectiveAdoption),
    syncEnabled: effectiveAdoption?.syncEnabled ?? false,
    online,
    queued: 0,
    sending: 0,
    conflicts: 0,
    blockedError: Boolean(auth.error),
    syncing: Boolean(
      effectiveAdoption?.syncEnabled &&
      (effectiveAdoption.reconcileRequired ?? true)
    ),
    currentScopeHash: candidateHash,
    sessionGeneration: auth.sessionGeneration,
    lastConfirmedScopeHash: null,
    lastConfirmedSessionGeneration: null,
  });
  const view = cloudStatusView(status);

  return (
    <Context.Provider
      value={{
        status,
        view,
        online,
        activeScope,
        candidateScope: auth.candidateScope,
        cloudAvailable: auth.cloudMode !== "off",
        adoption: effectiveAdoption,
        adoptionBusy,
        adoptionError,
        legacySummary: effectiveSummary,
        keepLocalOnly: () => applyDecision(keepLegacyLocalOnly),
        copyLegacy: () => applyDecision(copyLegacyIntoAccount),
        startEmpty: () => applyDecision(startEmptyAccount),
        pauseSync: () => applySyncPreference(pauseCloudSync),
        resumeSync: () => applySyncPreference(resumeCloudSync),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useCloudSync() {
  const value = useContext(Context);
  if (!value) throw new Error("useCloudSync exige CloudSyncProvider");
  return value;
}
