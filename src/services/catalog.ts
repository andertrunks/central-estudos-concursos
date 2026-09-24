import contests from "../../data/concursos.json";
import references from "../../data/matriz-editais.json";
import sources from "../../data/fontes.json";
import media from "../../data/media.json";
import cycle from "../../data/ciclo-estudos.json";
import policy from "../../data/study-policy.json";
import syncedAt from "../../data/synced-at.json";
import { validateCatalog } from "./integrity";
const lessons = Object.values(
  import.meta.glob("../../content/lessons/*.json", {
    eager: true,
    import: "default",
  }),
);
const questions = Object.values(
  import.meta.glob("../../content/questions/*.json", {
    eager: true,
    import: "default",
  }),
);
const simulations = Object.values(
  import.meta.glob("../../content/simulations/*.json", {
    eager: true,
    import: "default",
  }),
);
const discursives = Object.values(
  import.meta.glob("../../content/discursives/*.json", {
    eager: true,
    import: "default",
  }),
);
export const catalog = validateCatalog({
  contests,
  references,
  sources,
  media,
  cycle,
  policy,
  syncedAt,
  lessons,
  questions,
  simulations,
  discursives,
});
