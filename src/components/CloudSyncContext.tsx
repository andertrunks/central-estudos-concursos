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
  cloudStatusView,
  deriveCloudPublicStatus,
  type CloudPublicStatus,
  type CloudStatusView,
} from "../services/cloud-ux";
import type { AccountScope } from "../types/cloud";

type CloudSyncValue = {
  status: CloudPublicStatus;
  view: CloudStatusView;
  online: boolean;
  activeScope: AccountScope;
  candidateScope: AccountScope | null;
  cloudAvailable: boolean;
};

const Context = createContext<CloudSyncValue | null>(null);

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuthSession();
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // PR-6 foundation is deliberately fail-closed. Until the explicit adoption
  // UX is implemented and confirmed, the active study path remains legacy.
  const activeScope = useMemo(() => localAccountScope(), []);
  const status = deriveCloudPublicStatus({
    cloudMode: auth.cloudMode,
    authenticated: Boolean(auth.session),
    hadCloudAccount: false,
    adopted: false,
    syncEnabled: false,
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
