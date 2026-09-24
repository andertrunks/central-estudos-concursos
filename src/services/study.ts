import type {
  Catalog,
  Contest,
  ContentReference,
  StudyProgress,
  Review,
} from "../types/schema";
export function today() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}
export function addDays(day: string, count: number) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + count * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function daysUntil(day: string, now = today()) {
  return Math.round(
    (Date.parse(`${day}T12:00:00Z`) - Date.parse(`${now}T12:00:00Z`)) /
      86400000,
  );
}
export function effectiveStatus(c: Contest, now = today()): Contest["status"] {
  if (
    [
      "encerrado",
      "arquivado",
      "prova realizada",
      "suspenso",
      "adiado",
    ].includes(c.status)
  )
    return c.status;
  return c.dataProvaAtual && c.dataProvaAtual < now
    ? "prova realizada"
    : c.status;
}
export function isActive(c: Contest, now = today()) {
  return !["prova realizada", "encerrado", "arquivado"].includes(
    effectiveStatus(c, now),
  );
}
export function activeContests(data: Catalog, now = today()) {
  return data.contests
    .filter((c) => isActive(c, now))
    .sort((a, b) =>
      (a.dataProvaAtual ?? "9999").localeCompare(b.dataProvaAtual ?? "9999"),
    );
}
export function focusContest(data: Catalog, now = today()) {
  const active = activeContests(data, now).filter(
    (c) => !["suspenso", "adiado"].includes(c.status),
  );
  return active[0];
}
export function progressFor(id: string, now = today()): StudyProgress {
  return {
    id,
    status: "não iniciado",
    startedAt: null,
    completedAt: null,
    lastAccess: now,
    percent: 0,
    correct: 0,
    wrong: 0,
    total: 0,
    lastReview: null,
    nextReview: null,
  };
}
export function scheduleReviews(contentId: string, day = today()): Review[] {
  return ([0, 1, 7, 21] as const).map((n) => ({
    id: `${contentId}:${day}:D${n}`,
    contentId,
    stage: `D${n}`,
    due: addDays(day, n),
    doneAt: null,
  }));
}
export function reviewGroup(r: Review, now = today()) {
  return r.due < now ? "atrasadas" : r.due === now ? "hoje" : "próximas";
}
export function priorityScore(
  ref: ContentReference,
  data: Catalog,
  progress: StudyProgress | undefined,
  reviews: Review[],
  now = today(),
) {
  const active = activeContests(data, now);
  const linked = active.filter((c) =>
    ref.contests.some((x) => x.contestId === c.id),
  );
  if (!linked.length) return { score: 0, reasons: ["Sem concurso ativo"] };
  const focus = focusContest(data, now);
  const primary = linked.some((c) => c.id === focus?.id);
  const share = primary ? data.policy.primaryShare : data.policy.secondaryShare;
  const nearest = linked
    .filter((c) => c.dataProvaAtual && c.dataProvaAtual >= now)
    .map((c) => daysUntil(c.dataProvaAtual ?? now, now));
  const proximity = nearest.length ? Math.max(0, 60 - Math.min(...nearest)) : 0;
  const due = reviews.filter(
    (r) => r.contentId === ref.id && !r.doneAt && r.due <= now,
  ).length;
  const performance = progress?.total ? progress.wrong / progress.total : 0;
  const week = data.cycle.find((w) => w.start <= now && w.end >= now);
  const inCycle =
    week && [...week.contentIds, ...week.basicIds].includes(ref.id);
  const score = Math.round(
    share * 1000 +
      ref.priority * 10 * (data.policy.disciplineWeights[ref.discipline] ?? 1) +
      linked.length * 8 +
      proximity +
      performance * 40 +
      due * 30 +
      (!progress || progress.status === "não iniciado" ? 15 : 0) +
      (inCycle ? 100 : 0) +
      (progress?.status === "concluído" && !due ? -150 : 0),
  );
  return {
    score,
    reasons: [
      primary ? "Foco da próxima prova" : "Faixa de manutenção",
      `${linked.length} concurso(s) ativo(s)`,
      inCycle
        ? "No ciclo desta semana"
        : "Prioridade editorial " + ref.priority,
      ...(due ? [`${due} revisão(ões) pendente(s)`] : []),
    ],
  };
}
export function rankContents(
  data: Catalog,
  progress: StudyProgress[],
  reviews: Review[],
  now = today(),
) {
  return data.references
    .map((ref) => ({
      ref,
      ...priorityScore(
        ref,
        data,
        progress.find((p) => p.id === ref.id),
        reviews,
        now,
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.ref.id.localeCompare(b.ref.id));
}
export function nextStudy(
  data: Catalog,
  progress: StudyProgress[],
  reviews: Review[],
  now = today(),
) {
  const ranked = rankContents(data, progress, reviews, now).filter(
    (x) => x.ref.status === "publicado",
  );
  // Ten completed study sessions form the initial 90/10 cycle; only available lessons participate.
  const focus = focusContest(data, now);
  const completed = progress.filter((p) => p.status === "concluído").length;
  const secondarySlot =
    completed % 10 >= Math.round(data.policy.primaryShare * 10);
  const selected = ranked.find((x) =>
    secondarySlot
      ? !x.ref.contests.some((c) => c.contestId === focus?.id)
      : x.ref.contests.some((c) => c.contestId === focus?.id),
  );
  return selected ?? ranked[0];
}
export function contestProgress(c: Contest, progress: StudyProgress[]) {
  return c.conteudosRelacionados.length
    ? Math.round(
        c.conteudosRelacionados.reduce(
          (sum, id) => sum + (progress.find((p) => p.id === id)?.percent ?? 0),
          0,
        ) / c.conteudosRelacionados.length,
      )
    : 0;
}
