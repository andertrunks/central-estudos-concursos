import { Link } from "react-router-dom";
import { catalog } from "../services/catalog";
import {
  activeContests,
  daysUntil,
  focusContest,
  nextStudy,
  today,
} from "../services/study";
import {
  ContestCard,
  Empty,
  formatDate,
  PageHeading,
} from "../components/Common";
import { useStudy } from "../components/StudyContext";
export default function Dashboard() {
  const { state } = useStudy();
  const now = today();
  const active = activeContests(catalog);
  const focus = focusContest(catalog);
  const next = nextStudy(catalog, state.progress, state.reviews);
  const week = catalog.cycle.find((w) => w.start <= now && w.end >= now);
  const due = state.reviews.filter((r) => !r.doneAt && r.due <= now).length;
  const errors = state.attempts.filter(
    (a) => !a.correct && !a.resolvedAt,
  ).length;
  return (
    <>
      <PageHeading
        eyebrow="SEU ESPAÇO DE PREPARAÇÃO"
        title="Um pouco a cada dia."
      >
        Construa conhecimento que acompanha você em cada novo concurso.
      </PageHeading>
      <section className="hero-grid">
        <article className="next-exam">
          <p className="eyebrow">PRÓXIMA PROVA</p>
          {focus ? (
            <>
              <h2>{focus.orgao.split(" – ")[0]}</h2>
              <p>{focus.cargo}</p>
              <div className="countdown">
                <strong>
                  {focus.dataProvaAtual
                    ? Math.max(0, daysUntil(focus.dataProvaAtual))
                    : "—"}
                </strong>
                <span>
                  dias para a prova
                  <br />
                  <b>{formatDate(focus.dataProvaAtual)}</b>
                </span>
              </div>
              <Link className="button light" to={`/concursos/${focus.id}`}>
                Ver preparação <span aria-hidden="true">↗</span>
              </Link>
            </>
          ) : (
            <>
              <h2>Seu próximo objetivo</h2>
              <p>Novos concursos aparecerão após a sincronização editorial.</p>
            </>
          )}
        </article>
        <article className="card study-now">
          <div className="card-top">
            <p className="eyebrow">ESTUDAR AGORA</p>
            <span className="badge neutral">
              {week?.week ?? "Ciclo contínuo"}
            </span>
          </div>
          {next ? (
            <>
              <h2>{next.ref.title}</h2>
              <p>{next.reasons.join(" · ")}</p>
              <Link className="button" to={`/biblioteca/${next.ref.id}`}>
                Começar estudo →
              </Link>
            </>
          ) : (
            <>
              <h2>Sua biblioteca está sendo preparada</h2>
              <p>
                Os tópicos dos editais já estão organizados. As aulas aparecerão
                aqui assim que passarem pela revisão editorial.
              </p>
              <Link className="button" to="/biblioteca">
                Explorar os assuntos →
              </Link>
              <p className="small muted">
                Nenhuma aula publicada até o momento.
              </p>
            </>
          )}
        </article>
      </section>
      <section className="metrics" aria-label="Resumo de estudos">
        <Link to="/revisoes">
          <strong>{due}</strong>
          <span>Revisões pendentes</span>
        </Link>
        <Link to="/questoes">
          <strong>{catalog.questions.length}</strong>
          <span>Questões disponíveis</span>
        </Link>
        <Link to="/erros">
          <strong>{errors}</strong>
          <span>Erros para revisar</span>
        </Link>
        <Link to="/biblioteca">
          <strong>
            {state.progress.filter((p) => p.status === "concluído").length}
            <small> / {catalog.references.length}</small>
          </strong>
          <span>Conteúdos concluídos</span>
        </Link>
      </section>
      <section>
        <div className="section-heading">
          <h2>Seus concursos ativos</h2>
          <Link to="/concursos">Ver todos →</Link>
        </div>
        <div className="grid two">
          {active.map((c) => (
            <ContestCard key={c.id} contest={c} />
          ))}
        </div>
        {!active.length && (
          <Empty title="Um ciclo concluído">
            Sua biblioteca e seu progresso continuam disponíveis.
          </Empty>
        )}
      </section>
      <section className="grid two section-space">
        <article className="card">
          <p className="eyebrow">DIREÇÃO DA SEMANA</p>
          <h2>
            {week?.focus ??
              (focus
                ? `Foco em ${focus.orgao.split(" – ")[0]}`
                : "Biblioteca permanente")}
          </h2>
          <p>
            {week?.goal ??
              "A prioridade acompanha a próxima prova ativa e o seu desempenho."}
          </p>
          <div className="allocation">
            <span style={{ width: `${catalog.policy.primaryShare * 100}%` }} />
          </div>
          <p className="small">
            {active.length > 1
              ? `${Math.round(catalog.policy.primaryShare * 100)}% foco principal + núcleo comum · ${Math.round(catalog.policy.secondaryShare * 100)}% demais conteúdos`
              : "Prioridade no concurso ativo mais próximo"}
          </p>
          <Link className="text-link" to="/ciclo">
            Consultar ciclo completo →
          </Link>
        </article>
        <article className="card">
          <p className="eyebrow">PRÁTICA E CONSOLIDAÇÃO</p>
          <h2>Transforme estudo em prática</h2>
          <div className="practice-row">
            <span>Discursiva pendente</span>
            <Link to="/discursivas">
              {catalog.discursives.filter(
                (d) =>
                  !state.writings.some(
                    (w) => w.id === d.id && w.status === "concluída",
                  ),
              ).length || "Aguardando propostas"}{" "}
              →
            </Link>
          </div>
          <div className="practice-row">
            <span>Simulado recomendado</span>
            <Link to="/simulados">
              {catalog.simulations.find((s) => s.contestId === focus?.id)
                ?.title ?? "Aguardando publicação"}{" "}
              →
            </Link>
          </div>
        </article>
      </section>
    </>
  );
}
