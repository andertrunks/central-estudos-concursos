import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const base =
  process.env.SITE_URL ?? "http://127.0.0.1:4174/central-estudos-concursos/";
const destination = path.resolve(process.env.OUTPUT_DIR ?? "test-results");
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  locale: "pt-BR",
  timezoneId: "America/Sao_Paulo",
  serviceWorkers: "allow",
});
const page = await context.newPage();
const errors: string[] = [];
const privateDriveRequests: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (/drive\.google\.com|docs\.google\.com/.test(r.url()))
    privateDriveRequests.push(r.url());
});
const checks: string[] = [];
try {
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "Um pouco a cada dia." }),
  ).toBeVisible();
  await page.waitForFunction(()=>navigator.serviceWorker.getRegistration().then(r=>Boolean(r?.active)),undefined,{timeout:30_000});
  await expect(page.getByRole("button", { name: "Entendi" })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Entendi" }).click();
  checks.push("Dashboard, manifesto e service worker");
  console.log('Dashboard e service worker verificados');
  await page.screenshot({
    path: path.join(destination, "dashboard-desktop.png"),
    fullPage: true,
  });
  const manifest = await page
    .locator("link[rel=manifest]")
    .getAttribute("href");
  expect(manifest).toBeTruthy();
  const routes = [
    ["concursos", "Concursos"],
    ["biblioteca", "Biblioteca"],
    ["questoes", "Questões"],
    ["revisoes", "Revisões"],
    ["erros", "Caderno de erros"],
    ["simulados", "Simulados"],
    ["discursivas", "Discursivas"],
    ["ciclo", "Ciclo de estudos"],
    ["dados", "Dados e privacidade"],
  ];
  const accessibility: Record<string, unknown> = {};
  for (const [route, heading] of routes) {
    await page.goto(`${base}#/${route}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible();
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    accessibility[route ?? ""] = audit.violations;
    expect(audit.violations, `Acessibilidade: ${route}`).toEqual([]);
    console.log(`Rota e acessibilidade verificadas: ${route}`);
  }
  checks.push("Nove rotas e acessibilidade WCAG A/AA automatizada");
  await page.goto(`${base}#/biblioteca`);
  await page.getByRole("searchbox").fill("TI-BD-003");
  await expect(page.locator(".content-card")).toHaveCount(1);
  await page.getByRole("link", { name: "SQL", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Estude por subtema" })).toBeVisible();
  await expect(page.locator('[aria-label="Subtemas da aula"] details')).toHaveCount(28);
  await page.locator('[aria-label="Subtemas da aula"] summary').first().click();
  await expect(page.locator('[aria-label="Subtemas da aula"] details[open] .prose')).toContainText("SQL");
  const lessonAudit = await new AxeBuilder({page}).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(lessonAudit.violations).toEqual([]);
  await expect(page.locator('figure img')).toHaveCount(2);
  for(const img of await page.locator('figure img').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate(e => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.getByRole('link', {name:'Assistir no YouTube ↗'})).toHaveCount(3);
  await page.getByRole('button',{name:'Marcar como concluído'}).click();
  await expect(page.getByText('Progresso salvo neste dispositivo.')).toBeVisible();
  await page.goto(`${base}#/questoes`);
  await page.getByRole('searchbox').fill('Q-TI-BD-003-CE-001');
  await page.getByRole('radio',{name:'Certo',exact:true}).check();
  await page.getByRole('button',{name:'Conferir resposta'}).click();
  await expect(page.getByRole('heading',{name:'Vamos revisar este ponto'})).toBeVisible();
  await page.goto(`${base}#/erros`);
  await expect(page.getByRole('button', {name:'Marcar como revisado'})).toBeVisible();
  await page.goto(`${base}#/discursivas`);
  await page.getByLabel('Sua resposta', {exact:true}).first().fill('Resposta de verificação: JOIN combina linhas conforme as correspondências.');
  await page.getByRole('button',{name:'Salvar rascunho'}).first().click();
  await expect(page.getByText('Texto salvo neste dispositivo.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Sua resposta',{exact:true}).first()).toHaveValue(/Resposta de verificação/);
  checks.push('SQL: 28 subtemas, imagens, vídeos, conclusão, erro automático e discursiva persistente');
  await page.goto(`${base}#/biblioteca/TI-RED-001`);
  await expect(
    page.getByRole("heading", { name: "Aula planejada, ainda não publicada" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Marcar como concluído" }),
  ).toHaveCount(0);
  checks.push("Filtro por ID e bloqueio de aula ainda não publicada");
  await page.goto(`${base}#/concursos/CRBIO01-2026-ATI`);
  await expect(
    page.getByRole("heading", { level: 1, name: "CRBio-01" }),
  ).toBeVisible();
  await expect(
    page.getByText("29 de nov. de 2026", { exact: true }).first(),
  ).toBeVisible();
  await page.goto(`${base}#/concursos/SETEC-2026-ATI`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "SETEC – Serviços Técnicos Gerais",
    }),
  ).toBeVisible();
  checks.push("Detalhes dos dois concursos");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.screenshot({
    path: path.join(destination, "dashboard-mobile.png"),
    fullPage: true,
  });
  for (const [route] of routes) {
    await page.goto(`${base}#/${route}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `Overflow móvel ${route}`,
    ).toBe(true);
  }
  checks.push("Nove rotas em 390px sem transbordamento horizontal");
  await page.goto(`${base}#/dados`);
  const backup = {
    version: 1,
    progress: [
      {
        id: "TI-BD-003",
        status: "em andamento",
        startedAt: "2026-09-23",
        completedAt: null,
        lastAccess: "2026-09-23",
        percent: 50,
        correct: 0,
        wrong: 0,
        total: 0,
        lastReview: null,
        nextReview: null,
      },
    ],
    reviews: [],
    attempts: [],
    writings: [],
    results: [],
  };
  await page
    .getByLabel("Restaurar ou combinar backup")
    .setInputFiles({
      name: "progresso-teste.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await expect(
    page.getByText(
      "Backup importado. Registros com o mesmo ID foram atualizados.",
    ),
  ).toBeVisible();
  await page.reload();
  await page.goto(`${base}#/biblioteca`);
  await page.getByRole("searchbox").fill("TI-BD-003");
  await expect(
    page.locator(".content-card").getByText("em andamento", { exact: true }),
  ).toBeVisible();
  checks.push("IndexedDB real: importação e persistência após reload");
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "Um pouco a cada dia." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Biblioteca", exact: true }).click();
  await expect(page.locator(".content-card")).toHaveCount(77);
  await expect(page.getByText("Modo offline", { exact: true })).toBeVisible();
  checks.push("Reload offline e biblioteca completa sem Google Drive");
  await page.goto(`${base}#/biblioteca/TI-BD-003`);
  await expect(page.getByRole('heading',{name:'Estude por subtema'})).toBeVisible();
  await page.locator('figure img').first().scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('figure img').first().evaluate(e => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  checks.push('Aula SQL e imagem didática disponíveis offline');
  expect(privateDriveRequests).toEqual([]);
  expect(errors).toEqual([]);
  await writeFile(
    path.join(destination, "browser-verification.json"),
    JSON.stringify(
      {
        base,
        at: new Date().toISOString(),
        checks,
        errors,
        privateDriveRequests,
        accessibility,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ checks, errors, privateDriveRequests }, null, 2),
  );
} finally {
  await browser.close();
}
