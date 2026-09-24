import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { catalog } from "../services/catalog";
import { setProgress } from "../services/storage";
import { useStudy } from "../components/StudyContext";
import { Empty, formatDate, PageHeading } from "../components/Common";
import { QuestionList } from "./Practice";
export default function LessonPage() {
  const { id } = useParams();
  const ref = catalog.references.find((r) => r.id === id);
  const lesson = catalog.lessons.find((l) => l.id === id);
  const { state, run, ready } = useStudy();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  if (!ref)
    return (
      <Empty title="Conteúdo não encontrado">
        Consulte a biblioteca para escolher um assunto.
      </Empty>
    );
  const p = state.progress.find((p) => p.id === ref.id);
  async function update(status: "em andamento" | "concluído" | "revisar") {
    if (!ref) return;
    setSaving(true);
    try {
      await run(() => setProgress(ref.id, status));
      setMessage("Progresso salvo neste dispositivo.");
    } catch {
      setMessage("Não foi possível salvar o progresso.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Link className="back" to="/biblioteca">
        ← Biblioteca
      </Link>
      <PageHeading
        eyebrow={`${ref.id} · ${ref.discipline}`}
        title={lesson?.title ?? ref.title}
      >
        {ref.subtopic}
      </PageHeading>
      <div className="tags">
        {ref.contests.map((c) => (
          <Link to={`/concursos/${c.contestId}`} key={c.contestId}>
            {catalog.contests.find((x) => x.id === c.contestId)?.orgao} ·{" "}
            {c.coverage}
          </Link>
        ))}
      </div>
      {!lesson ? (
        <Empty title="Aula planejada, ainda não publicada">
          Este assunto consta da matriz dos editais. A teoria, as fontes, a
          imagem didática e os exercícios serão disponibilizados após a
          validação editorial.
        </Empty>
      ) : (
        <>
          <section className="card section-space progress-actions">
            <div>
              <strong>Seu progresso</strong>
              <p>{p?.status ?? "não iniciado"}</p>
            </div>
            <button
              disabled={!ready || saving}
              onClick={() => void update("em andamento")}
            >
              Iniciar estudo
            </button>
            <button
              disabled={!ready || saving}
              onClick={() => void update("concluído")}
            >
              Marcar como concluído
            </button>
            <button
              disabled={!ready || saving}
              onClick={() => void update("revisar")}
            >
              Revisar depois
            </button>
            <p role="status">{message}</p>
          </section>
          <article className="lesson-body">
            {lesson.sections?.length ? <section aria-label="Subtemas da aula">
              <h2>Estude por subtema</h2>
              <p>Abra um subtema para continuar. A biblioteca mantém uma única aula compartilhada entre os concursos.</p>
              {lesson.sections.map(section => <details className="card section-space" key={section.id}>
                <summary>{section.id} · {section.title}</summary>
                <div className="prose">{section.text}</div>
              </details>)}
            </section> : null}
            <section>
              <h2>Objetivos</h2>
              <ul>
                {lesson.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </section>
            {[
              ["Teoria", lesson.theory],
              ["Exemplos", lesson.examples],
              ["Pegadinhas de prova", lesson.pitfalls],
            ].map(([title, text]) => (
              <section key={title}>
                <h2>{title}</h2>
                <div className="prose">{text}</div>
              </section>
            ))}
            {catalog.media
              .filter((m) => lesson.media.includes(m.id) && m.type === "imagem")
              .map((m) => (
                <figure key={m.id}>
                  <img
                    src={`${import.meta.env.BASE_URL}${m.file}`}
                    alt={m.alt}
                    loading="lazy"
                  />
                  <figcaption>
                    <strong>{m.title}</strong> — {m.caption}
                  </figcaption>
                </figure>
              ))}
            {catalog.media.some(
              (m) => lesson.media.includes(m.id) && m.type === "YouTube",
            ) && (
              <section>
                <h2>Vídeos de apoio</h2>
                <p>
                  Complementos opcionais. Todo o conteúdo essencial está no
                  texto da aula.
                </p>
                <div className="grid two">
                  {catalog.media
                    .filter(
                      (m) =>
                        lesson.media.includes(m.id) && m.type === "YouTube",
                    )
                    .map((m) => {
                      const u = new URL(m.url ?? "https://youtube.com");
                      const videoId =
                        u.hostname === "youtu.be"
                          ? u.pathname.slice(1)
                          : u.searchParams.get("v");
                      return (
                        <article className="card" key={m.id}>
                          {videoId && /^[\w-]{11}$/.test(videoId) && (
                            <img
                              className="thumbnail"
                              src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
                              alt={`Miniatura: ${m.title}`}
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.hidden = true;
                              }}
                            />
                          )}
                          <h3>{m.title}</h3>
                          <p>
                            {m.channel}
                            {m.duration ? ` · ${m.duration}` : ""}
                          </p>
                          <p>{m.caption}</p>
                          <a href={m.url} target="_blank" rel="noreferrer">
                            Assistir no YouTube ↗
                          </a>
                        </article>
                      );
                    })}
                </div>
              </section>
            )}
            <section>
              <h2>Resumo</h2>
              <div className="prose">{lesson.summary}</div>
            </section>
            <section>
              <h2>Questões e gabarito comentado</h2>
              <QuestionList questions={catalog.questions.filter(q => lesson.questions.includes(q.id))} />
            </section>
            <section>
              <h2>Revisão</h2>
              <details><summary>Abrir revisão completa</summary><div className="prose">{lesson.review}</div></details>
            </section>
            {lesson.materials?.map(material => <section key={material.id}>
              <h2>{material.title}</h2>
              <details><summary>Abrir material de estudo</summary><div className="prose">{material.text}</div></details>
            </section>)}
            <section>
              <h2>Fontes e referências</h2>
              <ul>
                {catalog.sources
                  .filter((s) => lesson.source_ids.includes(s.id))
                  .map((s) => (
                    <li key={s.id}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title} ↗
                      </a>{" "}
                      · {s.author} · {s.version}
                      <p className="small">
                        Verificada em {formatDate(s.verifiedAt)}
                      </p>
                    </li>
                  ))}
              </ul>
              <p>Atualização da aula: {formatDate(lesson.updatedAt)}</p>
            </section>
          </article>
        </>
      )}
    </>
  );
}
