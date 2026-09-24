import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStudy } from '../components/StudyContext';
import { ContinueStudy } from '../components/ContinueStudy';
import { Empty, PageHeading, Prose } from '../components/Common';
import { catalog } from '../services/catalog';
import { finishActivity } from '../services/storage';
import { lessonUnits, recommendations, type Activity } from '../services/trail';
import { QuestionCard } from './Practice';
import { WritingEditor, SimulationRunner } from './Training';

export default function StudyActivity() {
  const { id } = useParams();
  const { state, ready } = useStudy();
  if (!ready) return <p role="status">Carregando atividade…</p>;
  const activity = state.activities?.find(a => a.id === id);
  if (!activity) return <><Empty title="Continue pela sua trilha">A atividade pode pertencer a outro dispositivo ou backup.</Empty><ContinueStudy /></>;
  return <ActivityContent key={activity.id} activity={activity} />;
}
function ActivityContent({ activity: a }: { activity: Activity }) {
  const { run, state, day } = useStudy();
  const [busy, setBusy] = useState(false);
  const lesson = catalog.lessons.find(l => l.id === a.contentId);
  const ref = catalog.references.find(r => r.id === a.contentId);
  if (!lesson || !ref) return <Empty title="Material temporariamente indisponível">Seu progresso foi preservado.</Empty>;
  const units = lessonUnits(lesson);
  const unit = units.find(u => u.id === a.unitId);
  const writing = catalog.discursives.find(d => d.id === a.targetId);
  const simulation = catalog.simulations.find(s => s.id === a.targetId);
  const questions = a.questionIds.map(id => catalog.questions.find(q => q.id === id)).filter(q => q !== undefined);
  const answered = a.questionIds.filter(id => state.attempts.some(t => t.activityId === a.id && t.questionId === id)).length;
  const canFinish = a.kind === 'questões' ? answered === a.questionIds.length
    : a.kind === 'discursiva' ? state.writings.some(w => w.id === a.targetId && w.status === 'concluída')
    : a.kind === 'simulado' ? state.results.some(r => r.simulationId === a.targetId) : true;
  const upcoming = recommendations(catalog, state, day).find(next => next.id !== a.id);
  async function finish() {
    setBusy(true);
    try { await run(() => finishActivity(a.id, catalog)); }
    catch { /* Provider reports failure; remain on the current activity. */ }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading eyebrow={`${a.kind.toLocaleUpperCase('pt-BR')} · ${ref.discipline}`} title={a.title}>{ref.subject}{unit ? ` · Etapa ${units.indexOf(unit) + 1} de ${units.length}` : ''}</PageHeading>
    <div className="tags">{ref.contests.map(c => <Link key={c.contestId} to={`/concursos/${c.contestId}`}>{catalog.contests.find(x => x.id === c.contestId)?.orgao}</Link>)}</div>
    <p className="small muted">Seu estudo deste conteúdo conta em todos os concursos relacionados.</p>
    {a.completedAt ? <section className="card section-space" role="status"><h2>Atividade concluída</h2><p>Progresso salvo. {upcoming ? `A seguir: ${upcoming.kind} — ${upcoming.title}.` : 'Suas revisões futuras já estão programadas.'}</p></section> : <article className="lesson-body section-space">
      {(a.kind === 'aula' || a.kind === 'revisão' || a.kind === 'reforço') && <>
        {a.kind !== 'aula' && <p className="notice">Tente explicar o assunto de memória antes de reler. Confira os pontos que causaram dúvida.</p>}
        {a.kind === 'reforço' && state.attempts.filter(t => a.reviewIds.includes(`${t.contentId}:erro:${t.id}`)).map(t => {
          const q = catalog.questions.find(q => q.id === t.questionId);
          return q ? <section key={t.id} className="card"><h2>O ponto a reforçar</h2><Prose text={q.statement} /><p><strong>Resposta:</strong> {q.options.find(o => o.id === q.answer)?.text}</p><Prose text={q.comment} /></section> : null;
        })}
        <Prose text={unit?.text ?? (a.kind === 'aula' ? lesson.theory : lesson.review)} />
        {unit?.includeReview && <><h2>Revisão completa</h2><Prose text={lesson.review} /></>}
        {lesson.materials?.filter(m => unit?.materialIds?.includes(m.id)).map(m => <section key={m.id}><h2>{m.title}</h2><Prose text={m.text} /></section>)}
        {a.kind === 'aula' && !lesson.sections?.length && <><h2>Exemplos</h2><Prose text={lesson.examples} /><h2>Pegadinhas</h2><Prose text={lesson.pitfalls} /><h2>Resumo</h2><Prose text={lesson.summary} /></>}
      </>}
      {a.kind === 'questões' && <><p>{answered} de {a.questionIds.length} respostas registradas. Leia o comentário de cada resposta antes de concluir.</p>{questions.map(q => <QuestionCard key={q.id} question={q} activityId={a.id} initialAttempt={state.attempts.find(t => t.activityId === a.id && t.questionId === q.id)} />)}</>}
      {a.kind === 'discursiva' && writing && <WritingEditor proposal={writing} showContinue={false} />}
      {a.kind === 'simulado' && simulation && (!canFinish ? <SimulationRunner simulation={simulation} showContinue={false} /> : <p>Resultado registrado. Você já pode concluir esta atividade.</p>)}
      <details className="section-space"><summary>Fontes, imagens e materiais complementares</summary><Link to={`/biblioteca/${lesson.id}`}>Consultar aula completa e referências</Link></details>
    </article>}
    <section className="card section-space activity-actions" aria-label="Próximo passo">
      {!a.completedAt ? <><button className="button" disabled={busy || !canFinish} onClick={() => void finish()}>{busy ? 'Salvando…' : 'Concluir atividade'}</button>{!canFinish && <p>Termine e registre as respostas para liberar a conclusão.</p>}</> : <ContinueStudy label="Continuar" />}
    </section>
  </>;
}
