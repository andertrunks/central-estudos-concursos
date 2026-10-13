import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadState, type Backup } from "../services/storage";
import { setActiveStudyScope, studyScopeKey } from "../services/study-storage-route";
import { today } from '../services/study';
import { useCloudSync } from "./CloudSyncContext";

const initial: Backup = {
  version: 1,
  progress: [],
  reviews: [],
  attempts: [],
  writings: [],
  results: [],
};
const Context = createContext<{
  state: Backup;
  ready: boolean;
  error: string;
  day:string;
  run: (action: () => Promise<unknown>) => Promise<void>;
}>({ state: initial, ready: false, error: "", day:today(),run: async () => {} });

export function StudyProvider({ children }: { children: ReactNode }) {
  const cloud = useCloudSync();
  const desiredScopeKey = studyScopeKey(cloud.activeScope);
  const desiredScopeKeyRef = useRef(desiredScopeKey);
  desiredScopeKeyRef.current = desiredScopeKey;
  const [state, setState] = useState(initial);
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ scopeKey: string; message: string } | null>(null);
  const [day,setDay]=useState(today);

  useEffect(()=>{const update=()=>setDay(today());const timer=window.setInterval(update,60_000);document.addEventListener('visibilitychange',update);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',update);};},[]);

  useLayoutEffect(() => {
    setActiveStudyScope(cloud.activeScope);
  }, [cloud.activeScope, desiredScopeKey]);

  useEffect(() => {
    let current = true;
    const scopeKey = desiredScopeKey;
    void loadState()
      .then((next) => {
        if (!current || desiredScopeKeyRef.current !== scopeKey) return;
        setState(next);
        setLoadedScopeKey(scopeKey);
        setFailure(null);
      })
      .catch((cause: unknown) => {
        if (!current || desiredScopeKeyRef.current !== scopeKey) return;
        setFailure({
          scopeKey,
          message: cause instanceof Error
            ? cause.message
            : "Não foi possível abrir o armazenamento local. Verifique as permissões do navegador.",
        });
      });
    return () => { current = false; };
  }, [desiredScopeKey]);

  async function run(action: () => Promise<unknown>) {
    const scopeKey = desiredScopeKeyRef.current;
    try {
      await action();
      if (desiredScopeKeyRef.current !== scopeKey) return;
      const next = await loadState();
      if (desiredScopeKeyRef.current !== scopeKey) return;
      setState(next);
      setLoadedScopeKey(scopeKey);
      setFailure(null);
    } catch (e) {
      if (desiredScopeKeyRef.current === scopeKey) {
        setFailure({
          scopeKey,
          message: e instanceof Error ? e.message : "Não foi possível salvar.",
        });
      }
      throw e;
    }
  }

  const error = failure?.scopeKey === desiredScopeKey ? failure.message : "";
  const ready = loadedScopeKey === desiredScopeKey && !error;
  return (
    <Context.Provider value={{ state, ready, error, day,run }}>
      {children}
    </Context.Provider>
  );
}
// Shared context keeps the database as the persistence boundary.
export function useStudy() {
  return useContext(Context);
}
