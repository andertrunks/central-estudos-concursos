import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from '../scripts/io';
const data = await loadCatalog();
const base = process.env.SITE_URL ?? 'http://127.0.0.1:4174/central-estudos-concursos/';
const destination = path.resolve(process.env.OUTPUT_DIR ?? 'test-results');
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
const checks: string[] = [];
// The original SQL-only expectation predates PUB-0008 and the larger catalog.
// The current contract (trail.ts, commit 8d8a758) alternates disciplines, groups
// due D0 reviews, and resumes an open activity ahead of a new recommendation.
// These explicit expectations exercise the real catalog, not the selector as oracle.
const firstTitle = '1. LEG-005-01 — Disposições preliminares, âmbito, fundamentos e conceitos';
const mathTitle = 'MAT-003-01 — Regra de três simples direta';
const nextLawTitle = '2. LEG-005-02 — Princípios, bases legais e consentimento';
const nextMathTitle = 'MAT-003-02 — Regra de três simples inversa';
async function finish() {
  await page.getByRole('button', { name: 'Concluir atividade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Atividade concluída' })).toBeVisible();
}
async function advance(title: string, kind: string) {
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  await expect(page.locator('.page-heading .eyebrow')).toContainText(kind);
}
try {
  await page.clock.install({ time: new Date('2026-09-24T15:00:00Z') });
  await page.goto(base);
  await expect(page.getByRole('heading', { level: 1, name: 'Continuar estudando' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar estudando' })).toBeEnabled();
  const dashboardAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(dashboardAxe.violations).toEqual([]);
  await page.getByRole('button', { name: 'Continuar estudando' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(firstTitle);
  await expect(page.locator('.tags').first()).toContainText('CRBio');
  await expect(page.locator('.tags').first()).toContainText('SETEC');
  const firstUrl = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(firstTitle);
  expect(page.url()).toBe(firstUrl);
  const activityAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(activityAxe.violations).toEqual([]);
  await page.screenshot({ path: path.join(destination, 'trilha-inicial.png'), fullPage: true });
  await finish();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Atividade concluída' })).toBeVisible();
  // Alternate from Legislation to Mathematics despite a due Legislation review.
  await advance(mathTitle, 'AULA');
  await finish();
  await advance(firstTitle, 'REVISÃO');
  await finish();
  await advance(mathTitle, 'REVISÃO');
  await finish();
  // Two recovery blocks reserve curricular progress; discipline alternates again.
  await advance(nextLawTitle, 'AULA');
  await finish();
  await advance('Prática de Regra de três', 'QUESTÕES');
  const ids = ['Q-MC-005-01', 'Q-MC-005-04', 'Q-MC-005-16'];
  await expect(page.locator('article.card fieldset')).toHaveCount(ids.length);
  await expect(page.getByRole('button', { name: 'Concluir atividade', exact: true })).toBeDisabled();
  for (const id of ids) {
    const question = data.questions.find(q => q.id === id)!;
    expect(question.unitIds).toContain('MAT-003-01');
    const wrong = question.options.find(o => o.id !== question.answer)!;
    const card = page.locator('article.card').filter({ hasText: id }).first();
    await card.getByRole('radio', { name: wrong.text, exact: true }).check();
    await card.getByRole('button', { name: 'Conferir resposta' }).click();
    await expect(card.getByRole('heading', { name: 'Vamos revisar este ponto' })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Vamos revisar este ponto' })).toHaveCount(ids.length);
  await expect(page.getByRole('button', { name: 'Conferir resposta' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Concluir atividade', exact: true })).toBeEnabled();
  await finish();
  await advance(nextLawTitle, 'REVISÃO');
  await finish();
  await advance(nextMathTitle, 'AULA');
  const nextUrl = page.url();
  await page.goto(base);
  await page.getByRole('button', { name: 'Continuar estudando' }).click();
  await expect(page).toHaveURL(nextUrl);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(destination, 'trilha-mobile.png') });
  checks.push('Catálogo completo: entrada LGPD, alternância Matemática, D0 agrupados, avanço após duas revisões, três respostas, próxima etapa e retomada exata');
  await page.goto(`${base}#/erros`);
  for (const id of ids) {
    await expect(page.getByRole('heading', { name: data.questions.find(q => q.id === id)!.statement, exact: true })).toBeVisible();
  }
  await page.goto(`${base}#/dados`);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar meu progresso' }).click();
  const download = await downloadPromise;
  await download.saveAs(path.join(destination, 'trilha-backup-test.json'));
  const backup = JSON.parse(await readFile(path.join(destination, 'trilha-backup-test.json'), 'utf8'));
  expect(backup.progress).toHaveLength(2);
  expect(backup.progress.find((p: { id: string }) => p.id === 'LEG-005').percent).toBe(22);
  expect(backup.progress.find((p: { id: string }) => p.id === 'MAT-003').percent).toBe(25);
  expect(backup.attempts).toHaveLength(ids.length);
  expect(new Set(backup.attempts.map((a: { questionId: string }) => a.questionId))).toEqual(new Set(ids));
  expect(backup.reviews.filter((r: { stage: string; due: string }) => r.stage === 'ERRO' && r.due === '2026-09-26')).toHaveLength(ids.length);
  checks.push('IndexedDB: progresso parcial por ID único, respostas sem duplicação, três erros e revisões futuras persistidos');
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.goto(base);
  await page.getByRole('button', { name: 'Continuar estudando' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(nextMathTitle);
  checks.push('Retomada offline da atividade em andamento');
  expect(errors).toEqual([]);
  await writeFile(path.join(destination, 'trail-verification.json'), JSON.stringify({ base, at: new Date().toISOString(), checks, errors, accessibility: { dashboard: dashboardAxe.violations, activity: activityAxe.violations } }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} finally { await browser.close(); }
