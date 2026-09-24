import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { catalog } from "../services/catalog";
import { isActive, effectiveStatus, contestProgress } from "../services/study";
import {
  ContentCard,
  ContestCard,
  Empty,
  formatDate,
  PageHeading,
} from "../components/Common";
import { useStudy } from "../components/StudyContext";
export function Contests() {
  const {day}=useStudy();
  const active = catalog.contests.filter((c) => isActive(c,day));
  const archived = catalog.contests.filter((c) => !isActive(c,day));
  return (
    <>
      <PageHeading eyebrow="SEUS OBJETIVOS" title="Concursos">
        Cada edital é uma rota. O conhecimento faz parte da sua biblioteca.
      </PageHeading>
      <h2>
        Ativos <span className="count">{active.length}</span>
      </h2>
      <div className="grid two">
        {active.map((c) => (
          <ContestCard key={c.id} contest={c} />
        ))}
      </div>
      <h2 className="section-space">Arquivados e encerrados</h2>
      {archived.length ? (
        <div className="grid two">
          {archived.map((c) => (
            <ContestCard key={c.id} contest={c} />
          ))}
        </div>
      ) : (
        <Empty title="Nenhum concurso encerrado">
          Após a prova, o concurso sai do ciclo ativo. Suas aulas e registros
          permanecem.
        </Empty>
      )}
    </>
  );
}
export function ContestDetail() {
  const { id } = useParams();
  const { state } = useStudy();
  const c = catalog.contests.find((c) => c.id === id);
  if (!c)
    return (
      <Empty title="Concurso não encontrado">
        Confira os concursos disponíveis no menu.
      </Empty>
    );
  const refs = catalog.references.filter((r) =>
    r.contests.some((x) => x.contestId === c.id),
  );
  return (
    <>
      <Link className="back" to="/concursos">
        ← Concursos
      </Link>
      <PageHeading eyebrow={c.banca} title={c.orgao}>
        {c.cargo}
      </PageHeading>
      <span className="badge">{effectiveStatus(c)}</span>
      <div className="card section-space">
        <dl className="details">
          <div>
            <dt>Prova prevista</dt>
            <dd>{formatDate(c.dataProvaAtual)}</dd>
          </div>
          <div>
            <dt>Local</dt>
            <dd>{c.local}</dd>
          </div>
          <div>
            <dt>Salário base</dt>
            <dd>
              {c.salario?.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              }) ?? "Não informado"}
            </dd>
          </div>
          <div>
            <dt>Vagas</dt>
            <dd>{c.vagas}</dd>
          </div>
          <div>
            <dt>Inscrições</dt>
            <dd>
              {formatDate(c.dataInscricaoInicio)} a{" "}
              {formatDate(c.dataInscricaoFim)}
            </dd>
          </div>
          <div>
            <dt>Jornada</dt>
            <dd>{c.jornada}</dd>
          </div>
          <div>
            <dt>Benefícios</dt>
            <dd>{c.beneficios}</dd>
          </div>
          <div>
            <dt>Requisitos</dt>
            <dd>
              {c.requisitos ??
                "Ainda não informados no cadastro canônico. Consulte o edital."}
            </dd>
          </div>
          <div>
            <dt>Prova objetiva</dt>
            <dd>{c.estruturaProva}</dd>
          </div>
          <div>
            <dt>Discursiva</dt>
            <dd>{c.discursiva}</dd>
          </div>
        </dl>
        <p>{c.observacoes}</p>
        <a
          className="button"
          href={c.editalUrl}
          target="_blank"
          rel="noreferrer"
        >
          Consultar edital oficial ↗
        </a>
        <p className="small muted">
          Cadastro do Drive sincronizado em {formatDate(c.ultimaVerificacao)}.
          Versão: {c.versaoEdital ?? "não informada"}.
        </p>
      </div>
      <div className="section-heading">
        <h2>Conteúdo programático</h2>
        <span>
          {contestProgress(c, state.progress)}% concluído · {refs.length}{" "}
          assuntos
        </span>
      </div>
      {[...new Set(refs.map((r) => r.discipline))].map((d) => (
        <section key={d}>
          <h3>{d}</h3>
          <div className="grid two">
            {refs
              .filter((r) => r.discipline === d)
              .map((r) => (
                <ContentCard key={r.id} item={r} />
              ))}
          </div>
        </section>
      ))}
      <section className="card section-space">
        <h2>Histórico do edital</h2>
        <p>Data original: {formatDate(c.dataProvaOriginal)}</p>
        {c.history.length ? (
          c.history.map((h, i) => (
            <p key={i}>
              {formatDate(h.date)} · {h.field}: {h.previous ?? "não informado"}{" "}
              → {h.current ?? "não informado"} · <a href={h.source}>Fonte</a>
            </p>
          ))
        ) : (
          <p className="muted">
            Nenhuma retificação registrada nesta sincronização.
          </p>
        )}
      </section>
    </>
  );
}
export function Library() {
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [contest, setContest] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [coverage, setCoverage] = useState("");
  const normalized = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const refs = catalog.references.filter(
    (r) =>
      (!discipline || r.discipline === discipline) &&
      (!category || r.category === category) &&
      (!contest || r.contests.some((c) => c.contestId === contest)) &&
      (!status || r.status === status) &&
      (!coverage || r.coverage === coverage) &&
      normalized(`${r.id} ${r.title} ${r.subtopic}`).includes(
        normalized(query),
      ),
  );
  return (
    <>
      <PageHeading eyebrow="CONHECIMENTO QUE PERMANECE" title="Biblioteca">
        Um conteúdo, vários caminhos. {catalog.references.length} assuntos
        organizados por IDs permanentes.
      </PageHeading>
      <div className="filters card">
        <label className="search">
          Buscar assunto ou ID
          <input
            type="search"
            placeholder="Ex.: SQL, redes, TI-BD-003"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Disciplina
          <select
            value={discipline}
            onChange={(e) => {
              setDiscipline(e.target.value);
              setCategory("");
            }}
          >
            <option value="">Todas as disciplinas</option>
            {[...new Set(catalog.references.map((r) => r.discipline))].map(
              (d) => (
                <option key={d}>{d}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Categoria
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {[
              ...new Set(
                catalog.references
                  .filter((r) => !discipline || r.discipline === discipline)
                  .map((r) => r.category),
              ),
            ].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Concurso
          <select value={contest} onChange={(e) => setContest(e.target.value)}>
            <option value="">Todos os concursos</option>
            {catalog.contests.map((c) => (
              <option key={c.id} value={c.id}>
                {c.orgao}
              </option>
            ))}
          </select>
        </label>
        <label>
          Publicação
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os estados</option>
            {["planejado", "em produção", "publicado"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Cobertura
          <select
            value={coverage}
            onChange={(e) => setCoverage(e.target.value)}
          >
            <option value="">Todas as relações</option>
            {[...new Set(catalog.references.map((r) => r.coverage))].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </label>
      </div>
      <p className="muted" role="status">
        {refs.length} assuntos encontrados · ✓ integral · ◐ parcial
      </p>
      <div className="grid two">
        {refs.map((r) => (
          <ContentCard key={r.id} item={r} />
        ))}
      </div>
      {!refs.length && (
        <Empty title="Nenhum assunto com esses filtros">
          Experimente outro termo ou amplie a seleção.
        </Empty>
      )}
    </>
  );
}
export function Cycle() {
  return (
    <>
      <PageHeading
        eyebrow="CONSISTÊNCIA ANTES DE INTENSIDADE"
        title="Ciclo de estudos"
      >
        Programação editorial sincronizada do Drive. A prioridade acompanha os
        concursos ativos.
      </PageHeading>
      <div className="notice">
        Até a próxima prova, {Math.round(catalog.policy.primaryShare * 100)}% do ciclo
        favorece o foco principal e o núcleo comum. Os demais{" "}
        {Math.round(catalog.policy.secondaryShare * 100)}% mantêm os assuntos exclusivos dos
        outros concursos. Conteúdos ainda não publicados não são oferecidos como
        aulas.
      </div>
      {catalog.cycle.map((w) => (
        <article className="card section-space" key={w.week}>
          <p className="eyebrow">
            {w.week} · {w.period}
          </p>
          <h2>{w.focus}</h2>
          <p>{w.goal}</p>
          <p className="small muted">Conteúdos: {w.contentPlan}</p>
          <p className="small muted">Base geral: {w.basicPlan}</p>
          <div className="tags">
            {[...w.contentIds, ...w.basicIds].map((id) => (
              <Link key={id} to={`/biblioteca/${id}`}>
                {id}
              </Link>
            ))}
          </div>
          <dl className="details">
            <div>
              <dt>Questões</dt>
              <dd>{w.questions}</dd>
            </div>
            <div>
              <dt>Revisão</dt>
              <dd>{w.review}</dd>
            </div>
            <div>
              <dt>Discursiva</dt>
              <dd>{w.discursive}</dd>
            </div>
            <div>
              <dt>Simulado</dt>
              <dd>{w.simulation}</dd>
            </div>
            <div>
              <dt>Manutenção de conteúdo exclusivo</dt>
              <dd>{w.secondary}</dd>
            </div>
          </dl>
        </article>
      ))}
    </>
  );
}
