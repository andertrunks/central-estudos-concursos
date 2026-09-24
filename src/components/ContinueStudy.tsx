import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudy } from './StudyContext';
import { catalog } from '../services/catalog';
import { beginNextActivity } from '../services/storage';
import { recommendations } from '../services/trail';

export function ContinueStudy({ label = 'Continuar estudando' }: { label?: string }) {
  const { run, ready, state, day } = useStudy();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const next = recommendations(catalog, state, day)[0];
  async function go() {
    setBusy(true);
    try {
      let id: string | undefined;
      await run(async () => { id = (await beginNextActivity(catalog))?.id; });
      if (id) navigate(`/estudar/${encodeURIComponent(id)}`);
    } catch { /* The provider displays the save error. */ }
    finally { setBusy(false); }
  }
  return <div className="continue-study">
    <button className="button" disabled={!ready || busy || !next} onClick={() => void go()}>{busy ? 'Preparando atividade…' : label} <span aria-hidden="true">→</span></button>
    {ready && !next && <p role="status">Por hoje, nenhuma atividade disponível. Suas próximas revisões aparecerão na data programada.</p>}
  </div>;
}

export function TrailOverview() {
  const { state, day, ready } = useStudy();
  const queue = recommendations(catalog, state, day);
  const next = queue[0];
  const ref = catalog.references.find(r => r.id === next?.contentId);
  const progress = state.progress.find(p => p.id === ref?.id);
  return <section className="card trail-overview" aria-label="Sua próxima atividade">
    <p className="eyebrow">{next?.kind ?? 'SUA TRILHA'}</p>
    <h2>{ready ? next?.title ?? 'Tudo em dia com o material disponível' : 'Carregando sua trilha…'}</h2>
    {ref && <>
      <p>{ref.discipline} · {ref.subject}</p>
      <div className="tags">{ref.contests.map(c => <span key={c.contestId}>{catalog.contests.find(x => x.id === c.contestId)?.orgao}</span>)}</div>
      <p>{progress?.percent ?? 0}% do assunto estudado</p>
      <progress max={100} value={progress?.percent ?? 0} aria-label="Progresso no assunto recomendado" />
      <p className="muted">{next?.reasons.join(' · ')}</p>
    </>}
    <ContinueStudy />
    {queue.length > 1 && <details className="section-space"><summary>Também no seu horizonte de estudo</summary><ul>{queue.slice(1,4).map(a => <li key={a.id}>{a.kind} — {a.title}</li>)}</ul><p className="small">A próxima atividade é recalculada quando você conclui a atual.</p></details>}
  </section>;
}
