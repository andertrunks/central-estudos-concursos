import { parse } from "csv-parse/sync";
import { z } from "zod";
import { catalogSchema, type Catalog } from "../src/types/schema";
const rows = z.array(z.record(z.string(), z.string()));
export function parseSnapshot(csv: string) {
  return csv
    .split("\f")
    .filter((s) => s.trim())
    .map((s) =>
      rows.parse(
        parse(s.trim(), { columns: true, skip_empty_lines: true, bom: true }),
      ),
    );
}
export function transform(
  csv: string,
  mapping: Record<string, string>,
  syncedAt: string,
  existing?: Catalog,
): Catalog {
  const sheets = parseSnapshot(csv);
  const table = (header: string) => {
    const t = sheets.find((s) => s[0] && header in s[0]);
    if (!t) throw new Error(`Aba obrigatória ausente: ${header}`);
    return t;
  };
  const get = (r: Record<string, string>, key: string) => {
    const value = r[key];
    if (value === undefined) throw new Error(`Coluna ausente: ${key}`);
    return value;
  };
  const iso = (s: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
  };
  const categories: Record<string, string> = {
    BD: "Banco de Dados",
    RED: "Redes",
    SEG: "Segurança da Informação",
    SO: "Sistemas Operacionais",
    CLOUD: "Cloud",
    ES: "Engenharia de Software",
    PROG: "Programação",
    INFRA: "Infraestrutura",
    GOV: "Governança e Gestão de TI",
    CRB: "Gestão e Contratações de TIC",
    WEB: "Web/APIs",
    FUND: "Fundamentos de TI",
  };
  const references = table("ID_TÓPICO").map((r) => {
    const id = get(r, "ID_TÓPICO");
    const old = existing?.references.find((x) => x.id === id);
    const editorial = get(r, "Status editorial");
    if (
      ![
        "ausente",
        "planejado",
        "a produzir",
        "em produção",
        "parcial",
        "publicado",
      ].includes(editorial)
    )
      throw new Error(`${id}: status editorial desconhecido ${editorial}`);
    for (const column of Object.keys(mapping))
      if (!["Sim", "Não", "Parcial"].includes(get(r, column)))
        throw new Error(`${id}: cobertura inválida em ${column}`);
    return {
      id,
      type: "aula",
      title: get(r, "Assunto"),
      discipline: get(r, "Disciplina"),
      subject: get(r, "Assunto"),
      subtopic: get(r, "Subassunto / escopo"),
      category: categories[id.split("-")[1] ?? ""] ?? get(r, "Disciplina"),
      contests: Object.entries(mapping)
        .filter(([column]) => ["Sim", "Parcial"].includes(get(r, column)))
        .map(([column, contestId]) => ({
          contestId,
          coverage: r[column] === "Parcial" ? "parcial" : "integral",
        })),
      coverage: get(r, "Cobertura"),
      priority: Number(get(r, "Prioridade inicial")),
      status:
        old?.status === "publicado"
          ? "publicado"
          : editorial === "ausente"
            ? "planejado"
            : editorial === "em produção"
              ? "em produção"
              : editorial === "publicado"
                ? "publicado"
                : "planejado",
      editorialStatus: editorial,
      phase: get(r, "Fase"),
      notes: get(r, "Observação"),
    };
  });
  const contests = table("ID_CONCURSO").map((r) => {
    const id = get(r, "ID_CONCURSO");
    const old = existing?.contests.find((x) => x.id === id);
    const current = get(r, "Data da prova")
      ? iso(get(r, "Data da prova"))
      : null;
    const editalUrl = get(r, "Edital oficial");
    const history = [...(old?.history ?? [])];
    if (old && old.dataProvaAtual !== current)
      history.push({
        date: syncedAt,
        field: "dataProvaAtual",
        previous: old.dataProvaAtual,
        current,
        source: editalUrl,
      });
    if (old && old.status !== r.Status)
      history.push({
        date: syncedAt,
        field: "status",
        previous: old.status,
        current: get(r, "Status"),
        source: editalUrl,
      });
    for (const [field, previous, current] of [
      [
        "versaoEdital",
        old?.versaoEdital,
        r["Versão edital"] || old?.versaoEdital || null,
      ],
      ["editalUrl", old?.editalUrl, editalUrl],
    ] as const) {
      if (old && previous !== current)
        history.push({
          date: syncedAt,
          field,
          previous: previous ?? null,
          current,
          source: editalUrl,
        });
    }
    const observations = get(r, "Observações");
    let questionType = r["Tipo questão"];
    if (!questionType) {
      if (observations.includes("Certo/Errado")) questionType = "certo/errado";
      else if (observations.includes("múltipla escolha"))
        questionType = "múltipla escolha";
      else throw new Error(`${id}: cadastrar Tipo questão`);
    }
    return {
      id,
      orgao: get(r, "Órgão"),
      cargo: get(r, "Cargo"),
      banca: get(r, "Banca"),
      local: get(r, "Local"),
      dataInscricaoInicio: get(r, "Inscrição início")
        ? iso(get(r, "Inscrição início"))
        : null,
      dataInscricaoFim: get(r, "Inscrição fim")
        ? iso(get(r, "Inscrição fim"))
        : null,
      dataProvaOriginal: old?.dataProvaOriginal ?? current,
      dataProvaAtual: current,
      status: get(r, "Status"),
      requisitos: r.Requisitos || null,
      vagas: get(r, "Vagas"),
      salario: get(r, "Salário base") ? Number(get(r, "Salário base")) : null,
      beneficios: get(r, "Benefícios principais"),
      jornada: get(r, "Jornada"),
      estruturaProva: get(r, "Estrutura objetiva"),
      discursiva: get(r, "Discursiva"),
      editalUrl,
      conteudosRelacionados: references
        .filter((t) => t.contests.some((c) => c.contestId === id))
        .map((t) => t.id),
      ultimaVerificacao: syncedAt,
      fonteData: "CONCURSOS / Google Drive",
      versaoEdital: r["Versão edital"] || old?.versaoEdital || null,
      ultimaAtualizacao: syncedAt,
      observacoes: observations,
      questionType,
      history,
    };
  });
  if (existing) {
    for (const c of existing.contests)
      if (!contests.some((x) => x.id === c.id))
        throw new Error(
          `Remoção de concurso bloqueada: ${c.id}. Arquive-o na fonte.`,
        );
    for (const r of existing.references)
      if (!references.some((x) => x.id === r.id))
        throw new Error(`Remoção de ID permanente bloqueada: ${r.id}`);
  }
  const sources = table("ID_FONTE").map((r) => ({
    id: get(r, "ID_FONTE"),
    title: get(r, "Título"),
    level: get(r, "Nível"),
    author: get(r, "Instituição / Autor"),
    url: get(r, "URL / arquivo Drive"),
    version: get(r, "Versão / data publicação"),
    verifiedAt: iso(get(r, "Data verificação")),
    status: get(r, "Status"),
  }));
  const state = Object.fromEntries(
    table("Chave").map((r) => [get(r, "Chave"), get(r, "Valor")]),
  );
  const cycle = table("Semana").map((r) => {
    const period = get(r, "Período");
    const [start, end] = period.split("–");
    if (!start || !end) throw new Error("Período inválido");
    const extract = (s: string) => {
      const found = new Set(
        [...s.matchAll(/\b[A-Z]+(?:-[A-Z]+)*-\d{3}\b/g)].map((x) => x[0]),
      );
      for (const range of s.matchAll(
        /\b([A-Z]+(?:-[A-Z]+)*-)(\d{3})\.\.(\d{3})\b/g,
      )) {
        for (let n = Number(range[2]); n <= Number(range[3]); n++)
          found.add(`${range[1]}${String(n).padStart(3, "0")}`);
      }
      return [...found];
    };
    const year = state.data_referencia?.slice(-4);
    if (!year || !/^\d{4}$/.test(year))
      throw new Error(
        "ESTADO_ATUAL deve informar data_referencia para o ciclo",
      );
    const startDate = r["Data início"]
      ? iso(r["Data início"])
      : iso(`${start}/${year}`);
    const endDate = r["Data fim"] ? iso(r["Data fim"]) : iso(`${end}/${year}`);
    if (endDate < startDate)
      throw new Error(
        "Ciclo cruza o ano; informe Data início e Data fim completas",
      );
    return {
      week: get(r, "Semana"),
      period,
      start: startDate,
      end: endDate,
      focus: get(r, "Foco principal"),
      contentIds: extract(get(r, "Conteúdos / IDs")),
      basicIds: extract(get(r, "Português / Matemática / Inglês")),
      contentPlan: get(r, "Conteúdos / IDs"),
      basicPlan: get(r, "Português / Matemática / Inglês"),
      questions: get(r, "Questões"),
      review: get(r, "Revisão"),
      discursive: get(r, "Discursiva"),
      simulation: get(r, "Simulado"),
      secondary: r["Conteúdo secundário"] ?? get(r, "SETEC exclusiva"),
      goal: get(r, "Meta da semana"),
    };
  });
  return catalogSchema.parse({
    contests,
    references,
    sources,
    media: existing?.media ?? [],
    lessons: existing?.lessons ?? [],
    questions: existing?.questions ?? [],
    simulations: existing?.simulations ?? [],
    discursives: existing?.discursives ?? [],
    cycle,
    policy: {
      primaryShare:
        Number(
          (state.distribuicao_ciclo ?? state.distribuicao_ate_CRBio)?.match(
            /(\d+)%/,
          )?.[1] ?? 90,
        ) / 100,
      secondaryShare:
        1 -
        Number(
          (state.distribuicao_ciclo ?? state.distribuicao_ate_CRBio)?.match(
            /(\d+)%/,
          )?.[1] ?? 90,
        ) /
          100,
      focusOrder: Object.entries(state)
        .filter(([key]) => /^concurso_foco_\d+$/.test(key))
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([, value]) => value),
      disciplineWeights: existing?.policy.disciplineWeights ?? {},
      description: state.distribuicao_ciclo ?? state.distribuicao_ate_CRBio,
    },
    syncedAt,
  });
}
