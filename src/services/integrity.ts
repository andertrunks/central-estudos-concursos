import { catalogSchema, type Catalog } from "../types/schema";
export function validateCatalog(input: unknown): Catalog {
  const data = catalogSchema.parse(input);
  const errors: string[] = [];
  const indexes = new Map<string, Set<string>>();
  for (const key of [
    "contests",
    "references",
    "sources",
    "media",
    "lessons",
    "questions",
    "simulations",
    "discursives",
  ] as const) {
    const ids = new Set<string>();
    for (const item of data[key]) {
      if (ids.has(item.id)) errors.push(`${key}: ID duplicado ${item.id}`);
      ids.add(item.id);
    }
    indexes.set(key, ids);
  }
  const check = (kind: string, ids: string[], owner: string) => {
    for (const id of ids)
      if (!indexes.get(kind)?.has(id))
        errors.push(`${owner}: referência inexistente ${kind}/${id}`);
  };
  for (const c of data.contests)
    check("references", c.conteudosRelacionados, c.id);
  for (const r of data.references) {
    check(
      "contests",
      r.contests.map((c) => c.contestId),
      r.id,
    );
    if (new Set(r.contests.map((c) => c.contestId)).size !== r.contests.length)
      errors.push(`${r.id}: vínculo duplicado`);
    for (const c of data.contests) {
      if (
        c.conteudosRelacionados.includes(r.id) !==
        r.contests.some((x) => x.contestId === c.id)
      )
        errors.push(`${r.id}: vínculo assimétrico com ${c.id}`);
    }
    if (r.status === "publicado") check("lessons", [r.id], r.id);
  }
  for (const q of data.questions) {
    check("references", [q.contentId], q.id);
    check("sources", q.source_ids, q.id);
    check("contests", q.contests, q.id);
  }
  for (const m of data.media) {
    check("references", [m.contentId], m.id);
    if (
      m.type === "imagem" &&
      (!m.alt.trim() ||
        !m.file ||
        !/^media\/[a-zA-Z0-9_./-]+\.(png|jpg|jpeg|webp|svg)$/.test(m.file) ||
        m.file.includes(".."))
    )
      errors.push(`${m.id}: imagem/alt/caminho inválido`);
    if (
      m.type === "YouTube" &&
      (!m.url ||
        !["www.youtube.com", "youtube.com", "youtu.be"].includes(
          new URL(m.url).hostname,
        ) ||
        !m.channel)
    )
      errors.push(`${m.id}: vídeo inválido`);
  }
  for (const l of data.lessons) {
    check("references", [l.id], l.id);
    check("contests", l.contests, l.id);
    check("sources", l.source_ids, l.id);
    check("media", l.media, l.id);
    check("questions", l.questions, l.id);
    const ref = data.references.find((r) => r.id === l.id);
    if (ref?.status !== "publicado")
      errors.push(`${l.id}: aula sem status publicado`);
    if (l.contests.some((c) => !ref?.contests.some((x) => x.contestId === c)))
      errors.push(`${l.id}: concurso fora da matriz`);
    const media = data.media.filter((m) => l.media.includes(m.id));
    if (media.some((m) => m.contentId !== l.id))
      errors.push(`${l.id}: mídia pertence a outro conteúdo`);
    if (
      data.questions.some(
        (q) => l.questions.includes(q.id) && q.contentId !== l.id,
      )
    )
      errors.push(`${l.id}: questão pertence a outro conteúdo`);
    if (
      !l.source_ids.some((s) =>
        data.sources.some(
          (x) =>
            x.id === s &&
            ["P1", "P2"].includes(x.level) &&
            x.status === "ativo",
        ),
      )
    )
      errors.push(`${l.id}: falta fonte-base oficial ativa`);
    if (
      l.source_ids.some((s) =>
        data.sources.some((x) => x.id === s && x.level === "D1"),
      )
    )
      errors.push(`${l.id}: D1 não pode ser fonte factual final`);
    if (!l.exception?.trim()) {
      if (
        !l.requirements.image ||
        !l.requirements.videos ||
        !l.requirements.questions
      )
        errors.push(
          `${l.id}: dispensar requisitos exige exceção editorial justificada`,
        );
      if (
        l.requirements.image &&
        !media.some((m) => m.type === "imagem" && m.original)
      )
        errors.push(`${l.id}: imagem original obrigatória`);
      const videos = media.filter((m) => m.type === "YouTube");
      if (l.requirements.videos && (videos.length < 1 || videos.length > 3))
        errors.push(`${l.id}: exige 1–3 vídeos verificados`);
      if (l.requirements.questions && l.questions.length === 0)
        errors.push(`${l.id}: questões obrigatórias`);
    }
  }
  for (const s of data.simulations) {
    check("contests", [s.contestId], s.id);
    check("questions", s.questionIds, s.id);
    check("sources", s.source_ids, s.id);
    const c = data.contests.find((c) => c.id === s.contestId);
    if (
      data.questions.some(
        (q) =>
          s.questionIds.includes(q.id) &&
          (q.type !== c?.questionType || !q.contests.includes(s.contestId)),
      )
    )
      errors.push(`${s.id}: questão incompatível com o concurso`);
  }
  for (const d of data.discursives) {
    check("contests", [d.contestId], d.id);
    check("references", d.contentIds, d.id);
    check("sources", d.source_ids, d.id);
  }
  for (const c of data.cycle)
    check("references", [...c.contentIds, ...c.basicIds], c.week);
  check("contests", data.policy.focusOrder, "ciclo");
  if (
    Math.abs(data.policy.primaryShare + data.policy.secondaryShare - 1) > 0.001
  )
    errors.push("ciclo: distribuição deve somar 100%");
  if (errors.length) throw new Error(errors.join("\n"));
  return data;
}
