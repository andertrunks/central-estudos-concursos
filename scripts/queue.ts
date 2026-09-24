import { readFile, writeFile, copyFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { lessonSchema, mediaSchema, questionSchema, discursiveSchema } from "../src/types/schema";
import { validateCatalog } from "../src/services/integrity";
import { loadCatalog } from "./io";
export const packageSchema = z.object({
  queueId: z.string().regex(/^PUB-[A-Z0-9-]+$/),
  driveDocumentId: z.string().min(1),
  status: z.literal("pronto para publicação"),
  lesson: lessonSchema,
  media: z.array(mediaSchema),
  questions: z.array(questionSchema),
  discursives: z.array(discursiveSchema).default([]),
});
export function preparePackage(
  input: unknown,
  catalog: Awaited<ReturnType<typeof loadCatalog>>,
) {
  const item = packageSchema.parse(input);
  const id = item.lesson.id;
  if (!catalog.references.some((r) => r.id === id))
    throw new Error(`ID inexistente na matriz: ${id}`);
  const merge = <T extends { id: string }>(old: T[], incoming: T[]) => [
    ...old.filter((x) => !incoming.some((n) => n.id === x.id)),
    ...incoming,
  ];
  for (const m of item.media)
    if (m.contentId !== id) throw new Error("Mídia de outro conteúdo");
  for (const q of item.questions)
    if (q.contentId !== id) throw new Error("Questão de outro conteúdo");
  for (const d of item.discursives)
    if (!d.contentIds.includes(id)) throw new Error("Discursiva de outro conteúdo");
  const next = validateCatalog({
    ...catalog,
    references: catalog.references.map((r) =>
      r.id === id
        ? { ...r, status: "publicado", editorialStatus: "publicado" }
        : r,
    ),
    lessons: merge(catalog.lessons, [item.lesson]),
    media: merge(catalog.media, item.media),
    questions: merge(catalog.questions, item.questions),
    discursives: merge(catalog.discursives, item.discursives),
  });
  return { item, next };
}
async function main() {
  const file = process.argv[2];
  if (!file)
    throw new Error("Uso: npm run queue -- work/pacote.json [--apply]");
  const { item, next } = preparePackage(
    JSON.parse(await readFile(file, "utf8")),
    await loadCatalog(),
  );
  const directory = path.dirname(path.resolve(file));
  for (const m of item.media)
    if (m.file) {
      const source = path.resolve(directory, m.file);
      if (!source.startsWith(directory + path.sep))
        throw new Error("Caminho fora do pacote");
      await access(source);
    }
  if (!process.argv.includes("--apply")) {
    console.log("Pacote validado. Use --apply para integrar ao repositório.");
    return;
  }
  // All validation and asset checks precede writes; Git provides review and rollback.
  for (const m of item.media)
    if (m.file) {
      await mkdir(path.dirname(`public/${m.file}`), { recursive: true });
      await copyFile(path.join(directory, m.file), `public/${m.file}`);
    }
  await writeFile(
    `content/lessons/${item.lesson.id}.json`,
    JSON.stringify(item.lesson, null, 2) + "\n",
  );
  for (const q of item.questions)
    await writeFile(
      `content/questions/${q.id}.json`,
      JSON.stringify(q, null, 2) + "\n",
    );
  for (const d of item.discursives)
    await writeFile(`content/discursives/${d.id}.json`, JSON.stringify(d, null, 2) + "\n");
  await writeFile(
    "data/media.json",
    JSON.stringify(next.media, null, 2) + "\n",
  );
  await writeFile(
    "data/matriz-editais.json",
    JSON.stringify(next.references, null, 2) + "\n",
  );
  await mkdir("editorial/receipts", { recursive: true });
  await writeFile(
    `editorial/receipts/${item.queueId}.json`,
    JSON.stringify(
      {
        queueId: item.queueId,
        contentId: item.lesson.id,
        driveDocumentId: item.driveDocumentId,
        integratedAt: new Date().toISOString(),
        status: "integrado; aguardando testes e deploy",
        publishedCommit: null,
        siteUrl: null,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Integrado. Execute npm run check; só marque publicado no Drive após verificar o deploy.",
  );
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/queue.ts"))
  await main();
