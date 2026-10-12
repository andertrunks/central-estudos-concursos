import type { SupabaseClient } from "@supabase/supabase-js";
import type { CloudConfig } from "./cloud-config";

let cachedSignature: string | null = null;
let cachedClient: Promise<SupabaseClient> | null = null;

export async function getSupabaseBrowserClient(
  config: CloudConfig,
): Promise<SupabaseClient | null> {
  if (config.mode === "off") return null;
  const signature = `${config.projectUrl}\u0000${config.publishableKey}`;
  if (cachedSignature && cachedSignature !== signature)
    throw new Error("A configuração Supabase mudou durante a sessão do navegador");
  if (!cachedClient) {
    cachedSignature = signature;
    cachedClient = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(config.projectUrl, config.publishableKey, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      }),
    );
  }
  return cachedClient;
}

export function resetSupabaseBrowserClientForTests() {
  cachedSignature = null;
  cachedClient = null;
}
