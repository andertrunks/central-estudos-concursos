import { readFile, writeFile, mkdir } from "node:fs/promises";
import { z } from "zod";
import { transform, parseSnapshot } from "./editorial";
import { validateCatalog } from "../src/services/integrity";
import { loadCatalog, json } from "./io";
const file = process.argv[2];
if (!file)
  throw new Error("Uso: npm run sync -- snapshot.csv [--apply] [--initial]");
const mapping = z
  .record(z.string(), z.string())
  .parse(await json("editorial/contest-columns.json"));
const initial = process.argv.includes("--initial");
const existing = initial ? undefined : await loadCatalog();
const csv = await readFile(file, "utf8");
const date = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/Sao_Paulo",
});
const data = validateCatalog(transform(csv, mapping, date, existing));
if (!process.argv.includes("--apply")) {
  console.log(
    "Prévia validada; use --apply para aplicar.",
    data.references.length,
    "tópicos",
  );
  process.exit(0);
}
await mkdir("data", { recursive: true });
const pairs: [string, unknown][] = [
  ["concursos", data.contests],
  ["matriz-editais", data.references],
  ["fontes", data.sources],
  ["media", data.media],
  ["ciclo-estudos", data.cycle],
  ["study-policy", data.policy],
  ["synced-at", date],
  [
    "estado-atual",
    parseSnapshot(csv).find((table) => table[0] && "Chave" in table[0]) ?? [],
  ],
];
for (const [name, value] of pairs)
  await writeFile(`data/${name}.json`, JSON.stringify(value, null, 2) + "\n");
for (const [header, name] of [
  ["ID_ITEM", "fila-publicacao"],
  ["Ordem", "ordem-producao"],
  ["Item", "padrao-editorial"],
  ["Regra", "regras-revisao"],
  ["ID_MÍDIA", "midias-canonicas"],
  ["Categoria", "padrao-fontes"],
]) {
  if (!header || !name) continue;
  const table = parseSnapshot(csv).find((t) => t[0] && header in t[0]);
  if (table)
    await writeFile(
      `editorial/${name}.json`,
      JSON.stringify(table, null, 2) + "\n",
    );
}
await writeFile(
  "editorial/last-sync.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      snapshot: file,
      contests: data.contests.length,
      references: data.references.length,
      publishedLessons: data.lessons.length,
    },
    null,
    2,
  ) + "\n",
);
console.log("Sincronização aplicada; revisão Git obrigatória antes do deploy.");
