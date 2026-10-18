import { chromium, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.PR6_QA_SITE_URL ??
  "http://127.0.0.1:4175/central-estudos-concursos/tests/pr6-conflict-harness.html";
const selectedBrowser = process.env.PR6_BROWSER === "msedge" ? "msedge" : "chromium";
const browser = await chromium.launch({ channel: selectedBrowser, headless: true });
const directory = path.resolve(process.env.OUTPUT_DIR ?? "test-results/pr6-browser");
await mkdir(directory, { recursive: true });
const checks: string[] = [];
const browserErrors: string[] = [];
const prohibited: string[] = [];

async function scenario(name: string, test: (page: Page) => Promise<void>) {
  const context = await browser.newContext({
    locale: "pt-BR",
    viewport: { width: 1260, height: 850 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(name + ": " + error.message));
  page.on("request", (request) => {
    if (/\.supabase\.co\b|drive\.google\.com|docs\.google\.com/i.test(request.url()))
      prohibited.push(name + ": " + request.url());
  });
  try {
    await page.goto(base + "?case=" + name);
    await expect(page.getByRole("heading", { name: /QA isolado PR-6/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Manter versão deste dispositivo" })).toBeVisible();
    await test(page);
    checks.push(name);
  } finally {
    await context.close();
  }
}

async function readDb(page: Page) {
  await page.getByRole("button", { name: "QA inspecionar IndexedDB" }).click();
  await expect(page.getByTestId("qa-db-state")).not.toBeEmpty();
  return JSON.parse(await page.getByTestId("qa-db-state").innerText()) as {
    heads: number;
    statuses: string[];
    text: string | null;
    audit: string | null;
  };
}

try {
  await scenario("local-ack-reload", async (page) => {
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(axe.violations, "QA controller conflict selection axe WCAG A/AA").toEqual([]);
    await page.getByRole("button", { name: "Manter versão deste dispositivo" }).click();
    await expect(page.getByRole("heading", { name: "Confirme a escolha antes da gravação local" })).toBeVisible();
    await page.getByRole("button", { name: "Voltar sem gravar" }).click();
    expect((await readDb(page)).statuses).toContain("blocked_conflict");
    await page.getByRole("button", { name: "Manter versão deste dispositivo" }).click();
    await page.getByRole("button", { name: "Confirmar decisão local (aguardar CAS)" }).click();
    await expect(page.getByText(/Aguardando confirmação remota CAS/)).toBeVisible();
    expect((await readDb(page)).heads).toBe(1);
    await page.reload();
    await expect(page.getByText(/Aguardando confirmação remota CAS/)).toBeVisible();
    await page.getByRole("button", { name: "QA aplicar CAS fictício" }).click();
    await page.getByRole("button", { name: "Conferir confirmação no armazenamento local" }).click();
    await expect(page.getByText(/Confirmação CAS registrada na auditoria local/)).toBeVisible();
    expect((await readDb(page)).heads).toBe(0);
  });

  await scenario("remote-conflict", async (page) => {
    await page.getByRole("button", { name: "Manter versão da nuvem" }).click();
    await expect(page.getByText("Versão escolhida:", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Confirmar decisão local (aguardar CAS)" }).click();
    await expect(page.getByText(/Aguardando confirmação remota CAS/)).toBeVisible();
    await page.getByRole("button", { name: "QA simular novo conflito CAS" }).click();
    await page.getByRole("button", { name: "Conferir confirmação no armazenamento local" }).click();
    await expect(page.getByText(/O servidor informou novo conflito/)).toBeVisible();
    expect((await readDb(page)).audit).toBe("cas_conflict");
  });

  await scenario("merged-editable", async (page) => {
    await page.getByRole("button", { name: "Criar versão mesclada editável" }).click();
    await page.getByRole("textbox", { name: "Texto mesclado editável" })
      .fill("Rascunho mesclado QA fictício, preservando identidade.");
    await page.getByRole("button", { name: "Confirmar decisão local (aguardar CAS)" }).click();
    await expect(page.getByText(/Aguardando confirmação remota CAS/)).toBeVisible();
    const state = await readDb(page);
    expect(state.text).toBe("Rascunho mesclado QA fictício, preservando identidade.");
    expect(state.statuses).toEqual(["queued"]);
    expect(state.audit).toBe("awaiting_cas");
  });

  await scenario("remote-stale", async (page) => {
    await page.getByRole("button", { name: "QA mudar revisão remota" }).click();
    await page.getByRole("button", { name: "Manter versão deste dispositivo" }).click();
    await page.getByRole("button", { name: "Confirmar decisão local (aguardar CAS)" }).click();
    await expect(page.getByRole("alert")).toContainText("WRITING_RESOLUTION_REMOTE_CHANGED");
    const state = await readDb(page);
    expect(state.statuses).toEqual(["blocked_conflict"]);
    expect(state.text).toBe("Rascunho local fictício");
  });

  await scenario("scope-switch", async (page) => {
    await page.getByRole("button", { name: "Manter versão deste dispositivo" }).click();
    await page.getByRole("button", { name: "QA trocar conta" }).click();
    await expect(page.getByTestId("qa-scope")).toHaveText("Conta QA alterada");
    await expect(page.getByRole("button", { name: "Manter versão deste dispositivo" })).toBeVisible();
    await page.getByRole("button", { name: "Manter versão deste dispositivo" }).click();
    await expect(page.getByRole("button", { name: "Confirmar decisão local (aguardar CAS)" })).toBeDisabled();
  });

  expect(prohibited).toEqual([]);
  expect(browserErrors).toEqual([]);
  await writeFile(path.join(directory, "pr6-controller-" + selectedBrowser + ".json"), JSON.stringify({
    browser: selectedBrowser,
    checks,
    cloudMode: "off",
    cloudCasEndToEndTested: false,
    simulatedCasOnly: true,
    browserErrors,
    prohibited,
    realUserDataTouched: false,
  }, null, 2));
  console.log(JSON.stringify({ browser: selectedBrowser, checks, prohibited, browserErrors }, null, 2));
} finally {
  await browser.close();
}
