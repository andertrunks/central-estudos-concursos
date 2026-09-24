import { z } from "zod";
const id = z.string().regex(/^[A-Z0-9][A-Z0-9-]*$/);
export const date = z.iso.date();
const text = z.string().trim().min(1);
const url = z
  .url()
  .refine((v) => new URL(v).protocol === "https:", "A URL deve usar HTTPS");
export const contestStatus = z.enum([
  "futuro",
  "inscrições abertas",
  "inscrito",
  "em preparação",
  "prova próxima",
  "prova realizada",
  "suspenso",
  "adiado",
  "encerrado",
  "arquivado",
]);
export const contestSchema = z.object({
  id,
  orgao: text,
  cargo: text,
  banca: text,
  local: text,
  dataInscricaoInicio: date.nullable(),
  dataInscricaoFim: date.nullable(),
  dataProvaOriginal: date.nullable(),
  dataProvaAtual: date.nullable(),
  status: contestStatus,
  requisitos: text.nullable(),
  vagas: text,
  salario: z.number().nonnegative().nullable(),
  beneficios: text,
  jornada: text,
  estruturaProva: text,
  discursiva: text,
  editalUrl: url,
  conteudosRelacionados: z.array(id),
  ultimaVerificacao: date,
  fonteData: text,
  versaoEdital: text.nullable(),
  ultimaAtualizacao: date,
  observacoes: z.string(),
  questionType: z.enum(["certo/errado", "múltipla escolha"]),
  history: z.array(
    z.object({
      date,
      field: text,
      previous: z.string().nullable(),
      current: z.string().nullable(),
      source: url,
    }),
  ),
});
export const referenceSchema = z.object({
  id,
  type: z
    .enum([
      "aula",
      "questão",
      "lista de questões",
      "revisão",
      "simulado",
      "discursiva",
      "mapa mental",
      "resumo",
      "material visual",
    ])
    .default("aula"),
  title: text,
  discipline: text,
  subject: text,
  subtopic: z.string(),
  category: text,
  contests: z.array(
    z.object({ contestId: id, coverage: z.enum(["integral", "parcial"]) }),
  ),
  coverage: z.enum([
    "Comum",
    "Parcial",
    "Só CRBio",
    "Só SETEC",
    "Exclusivo",
    "Compartilhado",
  ]),
  priority: z.number().min(1).max(5),
  status: z.enum(["planejado", "em produção", "publicado"]),
  editorialStatus: text,
  phase: text,
  notes: z.string(),
});
export const sourceSchema = z.object({
  id,
  title: text,
  level: z.enum(["P1", "P2", "S1", "C1", "D1"]),
  author: text,
  url,
  version: text,
  verifiedAt: date,
  status: z.enum(["ativo", "revisar", "superado", "arquivado"]),
});
export const mediaSchema = z.object({
  id,
  contentId: id,
  type: z.enum(["imagem", "YouTube"]),
  title: text,
  caption: text,
  alt: z.string(),
  file: z.string().optional(),
  url: url.optional(),
  channel: z.string().optional(),
  duration: z.string().optional(),
  verifiedAt: date,
  original: z.boolean().default(false),
});
export const questionSchema = z
  .object({
    id,
    contentId: id,
    banca: text,
    type: z.enum(["certo/errado", "múltipla escolha"]),
    statement: text,
    options: z.array(z.object({ id: text, text })).min(2),
    answer: text,
    comment: text,
    source_ids: z.array(id).min(1),
    contests: z.array(id),
  })
  .refine(
    (q) => q.options.some((o) => o.id === q.answer),
    "Gabarito não corresponde às alternativas",
  )
  .refine(
    (q) => new Set(q.options.map((o) => o.id)).size === q.options.length,
    "Alternativas duplicadas",
  )
  .refine(
    (q) => q.type !== "certo/errado" || q.options.length === 2,
    "Certo/errado exige duas alternativas",
  );
export const lessonSchema = z.object({
  id,
  title: text,
  discipline: text,
  subject: text,
  subtopic: z.string(),
  contests: z.array(id).min(1),
  objectives: z.array(text).min(1),
  theory: text,
  examples: text,
  pitfalls: text,
  summary: text,
  review: text,
  source_ids: z.array(id).min(1),
  media: z.array(id),
  questions: z.array(id),
  updatedAt: date,
  requirements: z.object({
    image: z.boolean(),
    videos: z.boolean(),
    questions: z.boolean(),
  }),
  exception: z.string().optional(),
});
export const simulationSchema = z.object({
  id,
  title: text,
  contestId: id,
  questionIds: z.array(id).min(1),
  durationMinutes: z.number().positive(),
  correctPoints: z.number(),
  wrongPoints: z.number(),
  blankPoints: z.number(),
  source_ids: z.array(id).min(1),
});
export const discursiveSchema = z.object({
  id,
  title: text,
  theme: text,
  contentIds: z.array(id),
  contestId: id,
  instructions: text,
  source_ids: z.array(id).min(1),
});
export const cycleSchema = z.object({
  week: text,
  period: text,
  start: date,
  end: date,
  focus: text,
  contentIds: z.array(id),
  basicIds: z.array(id),
  contentPlan: z.string().default(""),
  basicPlan: z.string().default(""),
  questions: text,
  review: text,
  discursive: text,
  simulation: text,
  secondary: text,
  goal: text,
});
export const policySchema = z.object({
  primaryShare: z.number().min(0).max(1),
  secondaryShare: z.number().min(0).max(1),
  focusOrder: z.array(id),
  disciplineWeights: z.record(z.string(), z.number().positive()),
  description: text,
});
export const catalogSchema = z.object({
  contests: z.array(contestSchema),
  references: z.array(referenceSchema),
  sources: z.array(sourceSchema),
  media: z.array(mediaSchema),
  lessons: z.array(lessonSchema),
  questions: z.array(questionSchema),
  simulations: z.array(simulationSchema),
  discursives: z.array(discursiveSchema),
  cycle: z.array(cycleSchema),
  policy: policySchema,
  syncedAt: date,
});
export type Contest = z.infer<typeof contestSchema>;
export type ContentReference = z.infer<typeof referenceSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Simulation = z.infer<typeof simulationSchema>;
export type Discursive = z.infer<typeof discursiveSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export const progressSchema = z.object({
  id,
  status: z.enum(["não iniciado", "em andamento", "concluído", "revisar"]),
  startedAt: date.nullable(),
  completedAt: date.nullable(),
  lastAccess: date,
  percent: z.number().min(0).max(100),
  correct: z.number().int().nonnegative(),
  wrong: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  lastReview: date.nullable(),
  nextReview: date.nullable(),
});
export type StudyProgress = z.infer<typeof progressSchema>;
export const reviewSchema = z.object({
  id: z.string(),
  contentId: id,
  stage: z.enum(["D0", "D1", "D7", "D21", "ERRO"]),
  due: date,
  doneAt: date.nullable(),
});
export type Review = z.infer<typeof reviewSchema>;
export const attemptSchema = z.object({
  id: z.string(),
  questionId: id,
  contentId: id,
  date,
  answer: z.string(),
  correct: z.boolean(),
  reason: z.enum(["conteúdo", "interpretação", "distração", "chute"]),
  resolvedAt: date.nullable(),
});
export type Attempt = z.infer<typeof attemptSchema>;
export const writingSchema = z.object({
  id,
  theme: text,
  contentIds: z.array(id),
  contestId: id,
  text: z.string(),
  date,
  status: z.enum(["rascunho", "concluída"]),
  evaluation: z.string(),
  notes: z.string(),
});
export type Writing = z.infer<typeof writingSchema>;
export const resultSchema = z.object({
  id: z.string(),
  simulationId: id,
  date,
  correct: z.number(),
  wrong: z.number(),
  unanswered: z.number(),
  seconds: z.number(),
  score: z.number(),
  byDiscipline: z.record(
    z.string(),
    z.object({
      correct: z.number(),
      wrong: z.number(),
      unanswered: z.number(),
    }),
  ),
});
export type SimulationResult = z.infer<typeof resultSchema>;
