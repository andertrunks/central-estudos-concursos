import { useState } from "react";
import type {
  Discursive,
  Simulation,
  SimulationResult,
  Writing,
} from "../types/schema";
import { catalog } from "../services/catalog";
import { today } from "../services/study";
import { saveWriting, completeSimulation } from "../services/storage";
import { useStudy } from "../components/StudyContext";
import { Empty, PageHeading, formatDate, Prose } from "../components/Common";
function WritingEditor({ proposal: d }: { proposal: Discursive }) {
  const { state, run, ready } = useStudy();
  const previous = state.writings.find((w) => w.id === d.id);
  const [text, setText] = useState(previous?.text ?? "");
  const [notes, setNotes] = useState(previous?.notes ?? "");
  const [evaluation, setEvaluation] = useState(previous?.evaluation ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(status: Writing["status"]) {
    setBusy(true);
    try {
      await run(() =>
        saveWriting({
          id: d.id,
          theme: d.theme,
          contentIds: d.contentIds,
          contestId: d.contestId,
          text,
          date: today(),
          status,
          evaluation,
          notes,
        }),
      );
      setMessage("Texto salvo neste dispositivo.");
    } catch {
      setMessage("Falha ao salvar. Mantenha esta página aberta.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="card section-space">
      <h2>{d.title}</h2>
      <p>{d.theme}</p>
        <Prose text={d.instructions} />
        {d.modelAnswer && <details><summary>Espelho de correção e resposta-modelo</summary><Prose text={d.modelAnswer} /></details>}
      <label htmlFor={`${d.id}-response`}>Sua resposta</label>
        <textarea
          id={`${d.id}-response`}
          rows={15}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      <p className="small muted">
        {text.trim() ? text.trim().split(/\s+/).length : 0} palavras · salve
        antes de sair desta página.
      </p>
      <label htmlFor={`${d.id}-evaluation`}>Autoavaliação</label>
        <textarea
          id={`${d.id}-evaluation`}
          value={evaluation}
          onChange={(e) => setEvaluation(e.target.value)}
        />
      <label htmlFor={`${d.id}-notes`}>Observações</label>
        <textarea id={`${d.id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="actions">
        <button disabled={!ready || busy} onClick={() => void save("rascunho")}>
          Salvar rascunho
        </button>
        <button
          disabled={!text.trim() || busy || !ready}
          onClick={() => void save("concluída")}
        >
          Concluir texto
        </button>
      </div>
      <p role="status">{message}</p>
    </article>
  );
}
export function Discursives() {
  const { ready } = useStudy();
  return (
    <>
      <PageHeading eyebrow="CLAREZA NO PAPEL" title="Discursivas">
        Organize o raciocínio e pratique respostas técnicas com suas próprias
        palavras.
      </PageHeading>
      {catalog.discursives.length && ready ? (
        catalog.discursives.map((d) => (
          <WritingEditor key={d.id} proposal={d} />
        ))
      ) : (
        <Empty title="Nenhuma proposta publicada">
          Os temas reais serão vinculados aos concursos e aos conteúdos da
          biblioteca.
        </Empty>
      )}
    </>
  );
}
function SimulationRunner({ simulation: s }: { simulation: Simulation }) {
  const { run } = useStudy();
  const [started, setStarted] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const questions = catalog.questions.filter((q) =>
    s.questionIds.includes(q.id),
  );
  async function finish(finishedAt: number) {
    if (started === null) return;
    setBusy(true);
    const byDiscipline: SimulationResult["byDiscipline"] = {};
    let correct = 0,
      wrong = 0,
      unanswered = 0;
    for (const q of questions) {
      const discipline =
        catalog.references.find((r) => r.id === q.contentId)?.discipline ??
        "Geral";
      const d = byDiscipline[discipline] ?? {
        correct: 0,
        wrong: 0,
        unanswered: 0,
      };
      if (!answers[q.id]) {
        unanswered++;
        d.unanswered++;
      } else if (answers[q.id] === q.answer) {
        correct++;
        d.correct++;
      } else {
        wrong++;
        d.wrong++;
      }
      byDiscipline[discipline] = d;
    }
    const r: SimulationResult = {
      id: crypto.randomUUID(),
      simulationId: s.id,
      date: today(),
      correct,
      wrong,
      unanswered,
      seconds: Math.round((finishedAt - started) / 1000),
      score:
        correct * s.correctPoints +
        wrong * s.wrongPoints +
        unanswered * s.blankPoints,
      byDiscipline,
    };
    try {
      await run(() => completeSimulation(r, questions, answers));
      setResult(r);
    } catch {
      /* Context exposes the failure. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="card section-space">
      <h2>{s.title}</h2>
      <p>
        {questions.length} questões · Tempo de referência: {s.durationMinutes}{" "}
        minutos
      </p>
      <p className="small">
        Pontuação: acerto {s.correctPoints}, erro {s.wrongPoints}, em branco{" "}
        {s.blankPoints}.
      </p>
      {result ? (
        <div role="status">
          <h3>Resultado: {result.score} pontos</h3>
          <p>
            {result.correct} acertos · {result.wrong} erros ·{" "}
            {result.unanswered} em branco · {result.seconds}s
          </p>
          {Object.entries(result.byDiscipline).map(([d, v]) => (
            <p key={d}>
              {d}: {v.correct} acertos / {v.wrong} erros / {v.unanswered} em
              branco
            </p>
          ))}
        </div>
      ) : started === null ? (
        <button onClick={() => setStarted(Date.now())}>Iniciar simulado</button>
      ) : (
        <>
          <p className="notice">
            Simulado em andamento. Finalize antes de sair para registrar suas
            respostas.
          </p>
          {questions.map((q) => (
            <fieldset disabled={busy} key={q.id}>
              <legend>{q.statement}</legend>
              {q.options.map((o) => (
                <label className="option" key={o.id}>
                  <input
                    type="radio"
                    name={`sim-${q.id}`}
                    checked={answers[q.id] === o.id}
                    onChange={() => setAnswers({ ...answers, [q.id]: o.id })}
                  />
                  {o.text}
                </label>
              ))}
              <button onClick={() => setAnswers({ ...answers, [q.id]: "" })}>
                Deixar em branco
              </button>
            </fieldset>
          ))}
          <button disabled={busy} onClick={() => void finish(Date.now())}>
            Finalizar e registrar resultado
          </button>
        </>
      )}
    </article>
  );
}
export function Simulations() {
  const { state } = useStudy();
  return (
    <>
      <PageHeading eyebrow="TREINO EM CONDIÇÕES DE PROVA" title="Simulados">
        Configuração e pontuação próprias para cada concurso.
      </PageHeading>
      {catalog.simulations.length ? (
        catalog.simulations.map((s) => (
          <SimulationRunner key={s.id} simulation={s} />
        ))
      ) : (
        <Empty title="Nenhum simulado publicado">
          CRBio usa certo/errado e SETEC, múltipla escolha. Os simulados serão
          disponibilizados após a validação das questões e das regras de
          pontuação.
        </Empty>
      )}
      {state.results.length > 0 && (
        <section>
          <h2>Seu histórico</h2>
          {state.results.map((r) => (
            <p key={r.id}>
              {formatDate(r.date)} ·{" "}
              {catalog.simulations.find((s) => s.id === r.simulationId)
                ?.title ?? r.simulationId}{" "}
              · {r.score} pontos · {r.seconds}s
            </p>
          ))}
        </section>
      )}
    </>
  );
}
