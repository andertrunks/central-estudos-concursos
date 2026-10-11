import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const mode = process.argv[2];
if (mode !== "source" && mode !== "dist") throw new Error("Uso: privacy.ts source|dist");

const editorialAllowlist = new Set([
  "editorial/contest-columns.json",
  "editorial/last-sync.json",
  "editorial/source-policy.md",
]);
const forbiddenPublicFragments = [
  "editorial/snapshots/",
  "editorial/imports/",
  "editorial/receipts/",
  "editorial/reuse/",
  "data/estado-atual.json",
];

async function privateTokens() {
  try {
    const parsed = JSON.parse(await readFile("work/privacy-deny.json", "utf8"));
    const values = Array.isArray(parsed) ? parsed : parsed.tokens;
    if (!Array.isArray(values)) throw new Error("privacy-deny inválido");
    return values.filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function assertNoPrivateTokens(files: string[], tokens: string[]) {
  if (!tokens.length) return;
  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    if (tokens.some((token) => content.includes(token)))
      throw new Error(`privacy: token privado detectado em ${file}`);
  }
}

async function walk(directory: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function assertLastSync(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("last-sync v2 inválido");
  const record = value as Record<string, unknown>;
  const expected = ["schemaVersion", "at", "baseCommitSha", "inputSha256", "counts"].sort();
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expected))
    throw new Error("last-sync v2 contém campos não permitidos");
  if (record.schemaVersion !== 2) throw new Error("last-sync v2: schemaVersion inválido");
  if (typeof record.at !== "string" || Number.isNaN(Date.parse(record.at)))
    throw new Error("last-sync v2: data inválida");
  if (typeof record.baseCommitSha !== "string" || !/^[0-9a-f]{40}$/.test(record.baseCommitSha))
    throw new Error("last-sync v2: baseCommitSha inválido");
  if (typeof record.inputSha256 !== "string" || !/^sha256:[0-9a-f]{64}$/.test(record.inputSha256))
    throw new Error("last-sync v2: inputSha256 inválido");
  const counts = record.counts;
  if (!counts || typeof counts !== "object") throw new Error("last-sync v2: counts ausente");
  const countRecord = counts as Record<string, unknown>;
  const countKeys = ["contests", "references", "sources", "lessons", "questions", "media"].sort();
  if (JSON.stringify(Object.keys(countRecord).sort()) !== JSON.stringify(countKeys))
    throw new Error("last-sync v2: counts inválido");
  for (const key of countKeys)
    if (!Number.isInteger(countRecord[key]) || Number(countRecord[key]) < 0)
      throw new Error(`last-sync v2: count inválido em ${key}`);
}

if (mode === "source") {
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const unexpectedEditorial = tracked.filter((file) => file.startsWith("editorial/") && !editorialAllowlist.has(file));
  if (unexpectedEditorial.length)
    throw new Error(`privacy: editorial público fora da allowlist: ${unexpectedEditorial.join(", ")}`);
  if (tracked.includes("data/estado-atual.json"))
    throw new Error("privacy: data/estado-atual.json não pode ser público");
  assertLastSync(JSON.parse(await readFile("editorial/last-sync.json", "utf8")));
  const sources = JSON.parse(await readFile("data/fontes.json", "utf8")) as Array<{ level?: string }>;
  if (sources.some((source) => source.level === "P3"))
    throw new Error("privacy: fonte P3 não pode entrar no catálogo público");
  await assertNoPrivateTokens(tracked, await privateTokens());
  console.log(`privacy:source PASS — ${tracked.length} arquivos rastreados; editorial default-deny ativo.`);
} else {
  const files = await walk("dist");
  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const fragment of forbiddenPublicFragments)
      if (content.includes(fragment)) throw new Error(`privacy:dist encontrou referência proibida em ${file}`);
    if (/"level"\s*:\s*"P3"/.test(content))
      throw new Error(`privacy:dist encontrou P3 em ${file}`);
  }
  await assertNoPrivateTokens(files, await privateTokens());
  console.log(`privacy:dist PASS — ${files.length} arquivos inspecionados.`);
}
