import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { bootstrapAuthSession } from "../src/services/auth-bootstrap";
import {
  cloudConfigFromEnv,
  disabledCloudConfig,
} from "../src/services/cloud-config";

describe("PR-2 AUTH-SHELL — feature gate", () => {
  it("permanece OFF por padrão sem exigir configuração remota", () => {
    expect(cloudConfigFromEnv({})).toEqual(disabledCloudConfig());
  });

  it("aceita somente origem Supabase HTTPS e chave publicável no modo QA", () => {
    expect(
      cloudConfigFromEnv({
        VITE_CLOUD_MODE: "qa",
        VITE_SUPABASE_URL: "https://project-ref.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
      }),
    ).toEqual({
      mode: "qa",
      projectUrl: "https://project-ref.supabase.co",
      publishableKey: "sb_publishable_fixture",
      projectRef: "project-ref",
    });
    expect(() =>
      cloudConfigFromEnv({
        VITE_CLOUD_MODE: "on",
        VITE_SUPABASE_URL: "https://project-ref.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_fixture",
      }),
    ).toThrow(/publicável/);
  });

  it("não instancia cliente nem rede quando o gate está OFF", async () => {
    const getClient = vi.fn(() => {
      throw new Error("não deveria ser chamado");
    });
    const result = await bootstrapAuthSession({
      config: disabledCloudConfig(),
      getClient,
    });
    expect(getClient).not.toHaveBeenCalled();
    expect(result.client).toBeNull();
    expect(result.candidateScope).toBeNull();
    expect(result.error).toBe("");
  });

  it("deriva apenas um AccountScope candidato e não adota banco no login", async () => {
    const session = { user: { id: "uid-account-A" } } as unknown as Session;
    const client = {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
      },
    } as unknown as SupabaseClient;
    const config = cloudConfigFromEnv({
      VITE_CLOUD_MODE: "qa",
      VITE_SUPABASE_URL: "https://project-ref.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    });
    const result = await bootstrapAuthSession({ config, getClient: () => client });
    expect(result.session).toBe(session);
    expect(result.candidateScope?.mode).toBe("account");
    if (result.candidateScope?.mode !== "account") throw new Error("fixture inválida");
    expect(result.candidateScope.studyDbName).not.toContain("uid-account-A");
    expect(result.candidateScope.scopeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("falha fechada para OFF quando a configuração é inválida", async () => {
    const result = await bootstrapAuthSession({
      readConfig: () => cloudConfigFromEnv({ VITE_CLOUD_MODE: "maybe" }),
    });
    expect(result.config.mode).toBe("off");
    expect(result.client).toBeNull();
    expect(result.error).toMatch(/VITE_CLOUD_MODE/);
  });
});

describe("PR-2 AUTH-SHELL — contratos de integração", () => {
  it("inicializa a sessão antes de construir o HashRouter", () => {
    const source = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
    expect(source.indexOf("await bootstrapAuthSession()"))
      .toBeGreaterThan(-1);
    expect(source.indexOf("await bootstrapAuthSession()"))
      .toBeLessThan(source.indexOf("<HashRouter>"));
  });

  it("mantém PKCE e o banco legado v2 sem troca automática", () => {
    const clientSource = readFileSync(
      new URL("../src/services/supabase-client.ts", import.meta.url),
      "utf8",
    );
    const storageSource = readFileSync(
      new URL("../src/services/storage.ts", import.meta.url),
      "utf8",
    );
    const providerSource = readFileSync(
      new URL("../src/components/AuthSessionContext.tsx", import.meta.url),
      "utf8",
    );
    expect(clientSource).toContain('flowType: "pkce"');
    expect(clientSource).toContain("detectSessionInUrl: true");
    expect(clientSource).not.toContain("service_role");
    expect(storageSource).toContain('openDB<StudyDB>("central-estudos", 2');
    expect(providerSource).toContain("sessionGeneration");
    expect(providerSource).toContain("candidateScope");
    expect(providerSource).not.toContain("openScopedStudyDatabase");
  });
});
