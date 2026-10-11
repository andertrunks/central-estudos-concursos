import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { AccountScope } from "../types/cloud";
import { deriveAccountScope } from "./account-scope";
import {
  disabledCloudConfig,
  readCloudConfig,
  type CloudConfig,
} from "./cloud-config";
import { getSupabaseBrowserClient } from "./supabase-client";

export type AuthBootstrap = {
  config: CloudConfig;
  client: SupabaseClient | null;
  session: Session | null;
  candidateScope: AccountScope | null;
  error: string;
};

type BootstrapOptions = {
  config?: CloudConfig;
  readConfig?: () => CloudConfig;
  getClient?: (config: CloudConfig) => SupabaseClient | null;
};

export async function bootstrapAuthSession(
  options: BootstrapOptions = {},
): Promise<AuthBootstrap> {
  let config: CloudConfig;
  try {
    config = options.config ?? (options.readConfig ?? readCloudConfig)();
  } catch (cause) {
    return {
      config: disabledCloudConfig(),
      client: null,
      session: null,
      candidateScope: null,
      error: cause instanceof Error ? cause.message : "Configuração cloud inválida",
    };
  }
  if (config.mode === "off")
    return { config, client: null, session: null, candidateScope: null, error: "" };

  try {
    const client = (options.getClient ?? getSupabaseBrowserClient)(config);
    if (!client)
      return { config, client: null, session: null, candidateScope: null, error: "" };
    const { data, error } = await client.auth.getSession();
    if (error)
      return {
        config,
        client,
        session: null,
        candidateScope: null,
        error: error.message,
      };
    const session = data.session;
    const candidateScope = session?.user.id
      ? await deriveAccountScope(config.projectRef, session.user.id)
      : null;
    return { config, client, session, candidateScope, error: "" };
  } catch (cause) {
    return {
      config,
      client: null,
      session: null,
      candidateScope: null,
      error: cause instanceof Error ? cause.message : "Falha ao inicializar autenticação cloud",
    };
  }
}
