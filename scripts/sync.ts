import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { z } from "zod";
import { transform } from "./editorial";
import { validateCatalog } from "../src/services/integrity";
import { loadCatalog, json } from "./io";

const file = process.argv[2];
if (!file) throw new Error("Uso: npm run sync -- snapshot.csv [--apply] [--initial]");
const mapping = z.record(z.string(), z.string()).parse(await json("editorial/contest-columns.json"));
const initial = process.argv.includes("--initial");
const existing = initial ? undefined : await loadCatalog();
const input = await readFile(file);
const csv = input.toString("utf8");
const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const data = validateCatalog(transform(csv, mapping, date, existing));
if (!process.argv.includes("--apply")) {
  console.log("Prévia validada; use --apply para aplicar.", data.references.length, "tópicos");
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
];
for (const [name, value] of pairs)
  await writeFile(`data/${name}.json`, JSON.stringify(value, null, 2) + "\n");

const baseCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const inputSha256 = `sha256:${createHash("sha256").update(input).digest("hex")}`;
await writeFile(
  "editorial/last-sync.json",
  JSON.stringify(
    {
      schemaVersion: 2,
      at: new Date().toISOString(),
      baseCommitSha,
      inputSha256,
      counts: {
        contests: data.contests.length,
        references: data.references.length,
        sources: data.sources.length,
        lessons: data.lessons.length,
        questions: data.questions.length,
        media: data.media.length,
      },
    },
    null,
    2,
  ) + "\n",
);
console.log("Sincronização pública aplicada; bruto editorial permanece fora do Git. Revisão obrigatória antes do deploy.");
