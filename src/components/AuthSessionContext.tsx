import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountScope } from "../types/cloud";
import { deriveAccountScope } from "../services/account-scope";
import type { AuthBootstrap } from "../services/auth-bootstrap";
import type { CloudMode } from "../services/cloud-config";

type AuthSessionValue = {
  cloudMode: CloudMode;
  session: Session | null;
  sessionGeneration: number;
  candidateScope: AccountScope | null;
  ready: boolean;
  error: string;
};

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider({
  bootstrap,
  children,
}: {
  bootstrap: AuthBootstrap;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(bootstrap.session);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const [candidateScope, setCandidateScope] = useState<AccountScope | null>(
    bootstrap.candidateScope,
  );
  const [error, setError] = useState(bootstrap.error);
  const generationRef = useRef(0);

  useEffect(() => {
    const client = bootstrap.client;
    if (!client) return;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      setSessionGeneration(generation);
      setSession(nextSession);
      setCandidateScope(null);
      if (!nextSession?.user.id || bootstrap.config.mode === "off") return;
      void deriveAccountScope(bootstrap.config.projectRef, nextSession.user.id)
        .then((scope) => {
          if (generationRef.current === generation) {
            setCandidateScope(scope);
            setError("");
          }
        })
        .catch((cause: unknown) => {
          if (generationRef.current === generation)
            setError(
              cause instanceof Error
                ? cause.message
                : "Falha ao preparar o escopo autenticado",
            );
        });
    });
    return () => subscription.unsubscribe();
  }, [bootstrap.client, bootstrap.config]);

  return (
    <AuthSessionContext.Provider
      value={{
        cloudMode: bootstrap.config.mode,
        session,
        sessionGeneration,
        candidateScope,
        ready: true,
        error,
      }}
    >
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error("useAuthSession exige AuthSessionProvider");
  return value;
}
