import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { validateCatalog } from "../src/services/integrity";
export async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}
export async function contents(folder: string): Promise<unknown[]> {
  const names = await readdir(folder);
  return Promise.all(
    names
      .filter((n) => n.endsWith(".json"))
      .sort()
      .map((n) => json(path.join(folder, n))),
  );
}
export async function loadCatalog() {
  return validateCatalog({
    contests: await json("data/concursos.json"),
    references: await json("data/matriz-editais.json"),
    sources: await json("data/fontes.json"),
    media: await json("data/media.json"),
    lessons: await contents("content/lessons"),
    questions: await contents("content/questions"),
    simulations: await contents("content/simulations"),
    discursives: await contents("content/discursives"),
    cycle: await json("data/ciclo-estudos.json"),
    policy: await json("data/study-policy.json"),
    syncedAt: await json("data/synced-at.json"),
  });
}
