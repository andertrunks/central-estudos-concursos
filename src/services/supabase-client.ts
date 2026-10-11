import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CloudConfig } from "./cloud-config";

let cached: { signature: string; client: SupabaseClient } | null = null;

export function getSupabaseBrowserClient(config: CloudConfig): SupabaseClient | null {
  if (config.mode === "off") return null;
  const signature = `${config.projectUrl}\u0000${config.publishableKey}`;
  if (cached) {
    if (cached.signature !== signature)
      throw new Error("A configuração Supabase mudou durante a sessão do navegador");
    return cached.client;
  }
  const client = createClient(config.projectUrl, config.publishableKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  cached = { signature, client };
  return client;
}

export function resetSupabaseBrowserClientForTests() {
  cached = null;
}
