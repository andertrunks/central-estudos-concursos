export type CloudMode = "off" | "qa" | "on";

export type DisabledCloudConfig = {
  mode: "off";
  projectUrl: null;
  publishableKey: null;
  projectRef: null;
};

export type EnabledCloudConfig = {
  mode: "qa" | "on";
  projectUrl: string;
  publishableKey: string;
  projectRef: string;
};

export type CloudConfig = DisabledCloudConfig | EnabledCloudConfig;

export type CloudEnv = {
  VITE_CLOUD_MODE?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

export function disabledCloudConfig(): DisabledCloudConfig {
  return {
    mode: "off",
    projectUrl: null,
    publishableKey: null,
    projectRef: null,
  };
}

export function cloudConfigFromEnv(env: CloudEnv): CloudConfig {
  const rawMode = (env.VITE_CLOUD_MODE ?? "off").trim().toLowerCase();
  if (!rawMode || rawMode === "off") return disabledCloudConfig();
  if (rawMode !== "qa" && rawMode !== "on")
    throw new Error("VITE_CLOUD_MODE inválido; use off, qa ou on");

  const projectUrl = (env.VITE_SUPABASE_URL ?? "").trim();
  const publishableKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (!projectUrl || !publishableKey)
    throw new Error("Cloud habilitado exige URL e chave publicável do Supabase");
  if (!publishableKey.startsWith("sb_publishable_"))
    throw new Error("O navegador aceita somente chave Supabase publicável");

  let parsed: URL;
  try {
    parsed = new URL(projectUrl);
  } catch {
    throw new Error("VITE_SUPABASE_URL inválida");
  }
  if (parsed.protocol !== "https:" || parsed.pathname !== "/")
    throw new Error("VITE_SUPABASE_URL deve ser a origem HTTPS do projeto");
  const suffix = ".supabase.co";
  if (!parsed.hostname.endsWith(suffix))
    throw new Error("VITE_SUPABASE_URL deve apontar para a origem Supabase do projeto");
  const projectRef = parsed.hostname.slice(0, -suffix.length);
  if (!projectRef || projectRef.includes("."))
    throw new Error("Não foi possível derivar o projectRef do Supabase");

  return { mode: rawMode, projectUrl: parsed.origin, publishableKey, projectRef };
}

export function readCloudConfig(): CloudConfig {
  return cloudConfigFromEnv(import.meta.env);
}
