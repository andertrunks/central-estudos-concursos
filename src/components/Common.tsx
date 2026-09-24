import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { Contest, ContentReference } from "../types/schema";
import { catalog } from "../services/catalog";
import { contestProgress, effectiveStatus } from "../services/study";
import { useStudy } from "./StudyContext";
export function Prose({ text }: { text: string }) {
  return <div className="prose">{text.replace(/\n{3,}/g, "\n\n")}</div>;
}
export function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value + "T12:00:00Z"))
    : "A confirmar";
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-symbol" aria-hidden="true">
        ↗
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1 tabIndex={-1}>{title}</h1>
      {children && <p className="lead">{children}</p>}
    </header>
  );
}
export function ContestCard({ contest: c }: { contest: Contest }) {
  const { state } = useStudy();
  const percent = contestProgress(c, state.progress);
  return (
    <article className="card contest-card">
      <div className="card-top">
        <span className="badge">{effectiveStatus(c)}</span>
        <span className="muted">{c.banca}</span>
      </div>
      <h3>
        <Link to={`/concursos/${c.id}`}>{c.orgao}</Link>
      </h3>
      <p>{c.cargo}</p>
      <div className="contest-date">
        <span>Prova prevista</span>
        <strong>{formatDate(c.dataProvaAtual)}</strong>
      </div>
      <div className="progress-label">
        <span>Progresso do edital</span>
        <strong>{percent}%</strong>
      </div>
      <progress value={percent} max={100} aria-label={`Progresso ${c.orgao}`} />
      <Link className="text-link" to={`/concursos/${c.id}`}>
        Explorar concurso <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
export function ContentCard({ item: r }: { item: ContentReference }) {
  const { state } = useStudy();
  const p = state.progress.find((p) => p.id === r.id);
  return (
    <article className="card content-card">
      <div className="card-top">
        <span className="mono">{r.id}</span>
        <span
          className={`badge ${r.status === "publicado" ? "published" : "neutral"}`}
        >
          {r.status}
        </span>
      </div>
      <p className="eyebrow">{r.category}</p>
      <h3>
        <Link to={`/biblioteca/${r.id}`}>{r.title}</Link>
      </h3>
      <p className="muted">{r.subtopic}</p>
      <div className="tags">
        {r.contests.map((c) => (
          <span key={c.contestId}>
            {
              catalog.contests
                .find((x) => x.id === c.contestId)
                ?.orgao.split(" – ")[0]
            }{" "}
            {c.coverage === "parcial" ? "◐" : "✓"}
          </span>
        ))}
      </div>
      <div className="card-bottom">
        <span>
          Prioridade {r.priority}/5 · {r.coverage}
        </span>
        {p && <span>{p.status}</span>}
      </div>
    </article>
  );
}
