import { useState } from "react";
import { Link } from "react-router-dom";
import { catalog } from "../services/catalog";
import {
  classifyError,
  completeReview,
  recordAnswer,
  resolveError,
} from "../services/storage";
import { reviewGroup } from "../services/study";
import type { Question, Attempt } from "../types/schema";
import { useStudy } from "../components/StudyContext";
import { Empty, formatDate, PageHeading } from "../components/Common";
export function QuestionCard({ question: q }: { question: Question }) {
  const { run, ready } = useStudy();
  const [answer, setAnswer] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await run(async () => setAttempt(await recordAnswer(q, answer)));
    } catch {
      /* Provider displays persistence error. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="card section-space">
      <p className="eyebrow">
        {q.banca} · {q.type} · {q.id}
      </p>
      <fieldset disabled={!!attempt || busy || !ready}>
        <legend className="question-statement">{q.statement}</legend>
        {q.options.map((o) => (
          <label className="option" key={o.id}>
            <input
              type="radio"
              name={q.id}
              value={o.id}
              checked={answer === o.id}
              onChange={() => setAnswer(o.id)}
            />
            <span>{o.text}</span>
          </label>
        ))}
      </fieldset>
      {!attempt ? (
        <button
          className="button"
          disabled={!answer || busy || !ready}
          onClick={() => void submit()}
        >
          Conferir resposta
        </button>
      ) : (
        <div className="answer" role="status">
          <h3>
            {attempt.correct ? "Resposta correta" : "Vamos revisar este ponto"}
          </h3>
          <p>
            <strong>Gabarito:</strong>{" "}
            {q.options.find((o) => o.id === q.answer)?.text}
          </p>
          <p>{q.comment}</p>
          {!attempt.correct && (
            <>
              <p>
                Este erro foi registrado automaticamente. Uma revisão foi
                agendada para daqui a dois dias.
              </p>
              <label>
                Motivo do erro
                <select
                  value={attempt.reason}
                  onChange={(e) => {
                    const reason = reasonFrom(e.target.value);
                    void run(() => classifyError(attempt.id, reason))
                      .then(() => setAttempt({ ...attempt, reason }))
                      .catch(() => {});
                  }}
                >
                  {reasons.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <details className="small">
            <summary>Fontes do banco de questões</summary>
            {q.source_ids.map((id) => (
              <a key={id} href={catalog.sources.find((s) => s.id === id)?.url}>
                {catalog.sources.find((s) => s.id === id)?.title}{" "}
              </a>
            ))}
          </details>
        </div>
      )}
    </article>
  );
}
const reasons: Attempt["reason"][] = [
  "conteúdo",
  "interpretação",
  "distração",
  "chute",
];
function reasonFrom(s: string): Attempt["reason"] {
  return reasons.find((r) => r === s) ?? "conteúdo";
}
export function Questions() {
  const [contest, setContest] = useState("");
  const [type, setType] = useState("");
  const questions = catalog.questions.filter(
    (q) =>
      (!contest || q.contests.includes(contest)) && (!type || q.type === type),
  );
  return (
    <>
      <PageHeading eyebrow="PRÁTICA COM PROPÓSITO" title="Questões">
        Resolva, entenda o comentário e transforme os erros em revisões.
      </PageHeading>
      <div className="filters card">
        <label>
          Concurso
          <select value={contest} onChange={(e) => setContest(e.target.value)}>
            <option value="">Todos</option>
            {catalog.contests.map((c) => (
              <option key={c.id} value={c.id}>
                {c.orgao}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Todos</option>
            <option>certo/errado</option>
            <option>múltipla escolha</option>
          </select>
        </label>
      </div>
      {questions.length ? (
        <QuestionList key={`${contest}-${type}`} questions={questions} />
      ) : (
        <Empty title="As primeiras questões estão a caminho">
          Somente questões revisadas e vinculadas à biblioteca serão publicadas
          aqui.
        </Empty>
      )}
    </>
  );
}
export function QuestionList({ questions }: { questions: Question[] }) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const filtered = questions.filter(q => `${q.id} ${q.statement}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const pages = Math.ceil(filtered.length / 10);
  const current = Math.min(page, Math.max(0, pages - 1));
  return <>
    <label>Buscar questão por ID ou enunciado<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
    <p>{filtered.length} questões · página {pages ? current + 1 : 0} de {pages}</p>
    {filtered.slice(current * 10, current * 10 + 10).map(q => <QuestionCard key={q.id} question={q} />)}
    <div className="actions" aria-label="Paginação de questões">
      <button disabled={current === 0} onClick={() => setPage(current - 1)}>Anteriores</button>
      <button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Próximas</button>
    </div>
  </>;
}
export function Reviews() {
  const { state, run } = useStudy();
  const [busy, setBusy] = useState("");
  return (
    <>
      <PageHeading eyebrow="LEMBRAR É PARTE DE APRENDER" title="Revisões">
        D0, D1, D7 e D21, além da revisão por erro.
      </PageHeading>
      {(["hoje", "atrasadas", "próximas"] as const).map((group) => {
        const items = state.reviews
          .filter((r) => !r.doneAt && reviewGroup(r) === group)
          .sort((a, b) => a.due.localeCompare(b.due));
        return (
          <section key={group}>
            <h2>
              Revisões {group} <span className="count">{items.length}</span>
            </h2>
            {items.length ? (
              items.map((r) => (
                <article className="card review-row" key={r.id}>
                  <div>
                    <span className="badge neutral">{r.stage}</span>
                    <h3>
                      <Link to={`/biblioteca/${r.contentId}`}>
                        {catalog.references.find((x) => x.id === r.contentId)
                          ?.title ?? r.contentId}
                      </Link>
                    </h3>
                    <p>{formatDate(r.due)}</p>
                  </div>
                  <button
                    disabled={!!busy}
                    onClick={() => {
                      setBusy(r.id);
                      void run(() => completeReview(r.id))
                        .catch(() => {})
                        .finally(() => setBusy(""));
                    }}
                  >
                    Concluir revisão
                  </button>
                </article>
              ))
            ) : (
              <Empty
                title={
                  group === "atrasadas"
                    ? "Tudo em dia"
                    : "Nenhuma revisão nesta lista"
                }
              >
                As revisões são agendadas quando você conclui uma aula ou erra
                uma questão.
              </Empty>
            )}
          </section>
        );
      })}
    </>
  );
}
export function Errors() {
  const { state, run } = useStudy();
  const [filter, setFilter] = useState("");
  const errors = state.attempts.filter(
    (a) => !a.correct && !a.resolvedAt && (!filter || a.reason === filter),
  );
  return (
    <>
      <PageHeading eyebrow="SEU MAPA DE MELHORIA" title="Caderno de erros">
        Um registro do que merece uma segunda atenção.
      </PageHeading>
      <label>
        Classificação
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todos os motivos</option>
          {reasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      {errors.length ? (
        errors.map((a) => (
          <article className="card section-space" key={a.id}>
            <span className="badge neutral">{a.reason}</span>
            <h2>
              {catalog.questions.find((q) => q.id === a.questionId)
                ?.statement ?? a.questionId}
            </h2>
            <p>
              {formatDate(a.date)} ·{" "}
              <Link to={`/biblioteca/${a.contentId}`}>Revisar conteúdo</Link>
            </p>
            <label>
              Motivo
              <select
                value={a.reason}
                onChange={(e) =>
                  void run(() =>
                    classifyError(a.id, reasonFrom(e.target.value)),
                  ).catch(() => {})
                }
              >
                {reasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <p>
              {catalog.questions.find((q) => q.id === a.questionId)?.comment}
            </p>
            <button
              onClick={() => void run(() => resolveError(a.id)).catch(() => {})}
            >
              Marcar como revisado
            </button>
          </article>
        ))
      ) : (
        <Empty title="Nenhum erro pendente">
          Os erros das questões aparecerão automaticamente aqui, com espaço para
          classificar a causa.
        </Empty>
      )}
    </>
  );
}
