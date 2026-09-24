import { access } from "node:fs/promises";
import { loadCatalog } from "./io";
const data = await loadCatalog();
for (const m of data.media) if (m.file) await access(`public/${m.file}`);
console.log(
  `Integridade validada: ${data.contests.length} concursos, ${data.references.length} tópicos, ${data.lessons.length} aulas publicadas.`,
);
