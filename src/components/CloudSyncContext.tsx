import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuthSession } from "./AuthSessionContext";
import { localAccountScope } from "../services/account-scope";
import {
  copyLegacyIntoAccount,
  keepLegacyLocalOnly,
  readAdoptionDecision,
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
};

const Context = createContext<CloudSyncValue | null>(null);

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuthSession();
  const [online, setOnline] = useState(() => navigator.onLine);
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
    setAdoption(null);
    setAdoptionError("");
    setLegacySummary(null);
    if (!scope || scope.mode !== "account") return () => { current = false; };
    void Promise.all([readAdoptionDecision(scope), summarizeLegacyProgress()])
      .then(([decision, summary]) => {
        if (!current) return;
        setAdoption(decision);
        setLegacySummary(summary);
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setAdoptionError(cause instanceof Error ? cause.message : "Não foi possível preparar a adoção local");
      });
    return () => { current = false; };
  }, [auth.candidateScope]);

  async function applyDecision(
    action: (scope: AccountScope) => Promise<CloudAdoptionSettings>,
  ) {
    const scope = auth.candidateScope;
    if (!scope || scope.mode !== "account") throw new Error("Entre na conta antes de escolher a adoção");
    setAdoptionBusy(true);
    setAdoptionError("");
    try {
      const decision = await action(scope);
      setAdoption(decision);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível concluir a escolha";
      setAdoptionError(message);
      throw cause;
    } finally {
      setAdoptionBusy(false);
    }
  }

  // This PR intentionally prepares the account copy/decision but does not yet
  // route the live StudyProvider into the account DB. That switch must change
  // reads and writes together in the next narrow PR.
  const activeScope = useMemo(() => localAccountScope(), []);
  const status = deriveCloudPublicStatus({
    cloudMode: auth.cloudMode,
    authenticated: Boolean(auth.session),
    hadCloudAccount: Boolean(adoption),
    adopted: Boolean(adoption),
    syncEnabled: adoption?.syncEnabled ?? false,
    online,
    queued: 0,
    sending: 0,
    conflicts: 0,
    blockedError: Boolean(auth.error),
    syncing: false,
    currentScopeHash: auth.candidateScope?.mode === "account" ? auth.candidateScope.scopeHash : null,
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
        adoption,
        adoptionBusy,
        adoptionError,
        legacySummary,
        keepLocalOnly: () => applyDecision(keepLegacyLocalOnly),
        copyLegacy: () => applyDecision(copyLegacyIntoAccount),
        startEmpty: () => applyDecision(startEmptyAccount),
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
