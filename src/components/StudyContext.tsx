import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { loadState, type Backup } from "../services/storage";
import { today } from '../services/study';
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
  const [state, setState] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [day,setDay]=useState(today);
  useEffect(()=>{const update=()=>setDay(today());const timer=window.setInterval(update,60_000);document.addEventListener('visibilitychange',update);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',update);};},[]);
  useEffect(() => {
    loadState()
      .then((s) => {
        setState(s);
        setReady(true);
      })
      .catch(() =>
        setError(
          "Não foi possível abrir o armazenamento local. Verifique as permissões do navegador.",
        ),
      );
  }, []);
  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setState(await loadState());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      throw e;
    }
  }
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
