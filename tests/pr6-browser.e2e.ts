/**
 * PR-6 browser regression: run only against an ephemeral LOCAL Vite preview.
 * Not an end-to-end test of cloud CAS (there is no UI wiring yet).
 * No cloud credentials or real learner data are permitted.
 */
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.SITE_URL ?? "http://127.0.0.1:4174/central-estudos-concursos/";
const resultsDir = path.resolve(process.env.OUTPUT_DIR ?? "test-results/pr6-browser");
await mkdir(resultsDir, { recursive: true });

const selectedBrowser = process.env.PR6_BROWSER === "msedge" ? "msedge" : "chromium";
const browser = await chromium.launch({ channel: selectedBrowser, headless: true });
const context = await browser.newContext({
  viewport: { width: 1365, height: 900 },
  locale: "pt-BR",
  timezoneId: "America/Sao_Paulo",
  serviceWorkers: "allow",
  acceptDownloads: true,
});
const page = await context.newPage();
const errors: string[] = [];
const prohibitedRequests: string[] = [];
const checks: string[] = [];

page.on("pageerror", (cause) => errors.push(cause.message));
page.on("request", (request) => {
  if (/\.supabase\.co\b|drive\.google\.com|docs\.google\.com/i.test(request.url()))
    prohibitedRequests.push(request.url());
});

try {
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "Continuar estudando", level: 1 })).toBeVisible();
  const dashboardAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(dashboardAxe.violations, "WCAG A/AA: dashboard").toEqual([]);
  checks.push("Dashboard local and axe WCAG A/AA");

  await page.goto(base + "#/dados");
  await expect(page.getByRole("heading", { name: "Dados e privacidade", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Progresso na nuvem" })).toHaveCount(0);
  await expect(page.getByText(/não envia seu progresso para servidores/)).toBeVisible();
  const settingsAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(settingsAxe.violations, "WCAG A/AA: privacy settings").toEqual([]);
  checks.push("Cloud OFF in UI, no implicit cloud activation, settings WCAG A/AA");

  await page.goto(base + "#/discursivas");
  const writing = page.getByLabel("Sua resposta", { exact: true }).first();
  await expect(writing).toBeVisible();
  const content = "PR6 teste local de recuperacao apos recarga; escrita ficticia, sem identificadores pessoais.";
  await writing.fill(content);
  await page.getByRole("button", { name: "Salvar rascunho" }).first().click();
  await expect(page.getByText("Texto salvo neste dispositivo.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Sua resposta", { exact: true }).first()).toHaveValue(content);
  checks.push("Fictitious Writing survives reload in disposable browser profile");

  await page.goto(base + "#/dados");
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar meu progresso" }).click();
  const backup = await saved;
  expect(backup.suggestedFilename()).toMatch(/central-estudos-backup-v2.*\.json$/);
  checks.push("BackupV2 export button functional without remote sync");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "#/dados");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "Privacy controls do not overflow mobile viewport",
  ).toBe(true);
  await page.screenshot({ path: path.join(resultsDir, "privacy-mobile.png") });
  checks.push("390px mobile privacy layout with no horizontal overflow");

  expect(prohibitedRequests, "No real cloud or private Google Drive requests").toEqual([]);
  expect(errors, "No uncaught browser errors").toEqual([]);
  await writeFile(path.join(resultsDir, "result.json"), JSON.stringify({
    site: "localhost, ephemeral Vite preview",
    browser: selectedBrowser,
    cloudMode: "off",
    checks,
    prohibitedRequests,
    errors,
    accessibility: { dashboard: dashboardAxe.violations, privacy: settingsAxe.violations },
    cloudCasEndToEndTested: false,
    realUserProgressTouched: false,
  }, null, 2));
  console.log(JSON.stringify({ checks, cloudCasEndToEndTested: false, errors }, null, 2));
} finally {
  await browser.close();
}
