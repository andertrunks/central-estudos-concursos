import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { loadCatalog } from '../scripts/io';
import { recommendations, lessonUnits, studiedUnit } from '../src/services/trail';
import { beginNextActivity, finishActivity, loadState, database, recordAnswer, setProgress, importBackup, type Backup } from '../src/services/storage';
import { contestProgress } from '../src/services/study';
import { validateCatalog } from '../src/services/integrity';
const data = await loadCatalog();
const day = '2026-09-24';
const empty: Backup = { version: 1, progress: [], reviews: [], attempts: [], writings: [], results: [], activities: [] };
beforeEach(async () => {
  const db = await database();
  for (const name of ['progress','reviews','attempts','writings','results','activities'] as const) await db.clear(name);
  db.close();
});
describe('trilha única e persistência', () => {
  it('oferece somente aula publicada e primeiro subtema, compartilhado entre concursos', () => {
    const result = recommendations(data, empty, day);
    expect(result[0]?.unitId).toBe('TI-BD-003-01');
    expect(result).toHaveLength(1);
    expect(data.lessons[0]?.contests).toHaveLength(2);
  });
  it('retoma a mesma atividade e mantém a ordem após recarregar', async () => {
    const first = await beginNextActivity(data, day);
    const next = await beginNextActivity(data, '2026-09-25');
    expect(next).toEqual(first);
    expect((await loadState()).activities).toHaveLength(1);
  });
  it('conclusão parcial, D0, questões e próximo subtema funcionam sem escolha de concurso', async () => {
    const first = (await beginNextActivity(data, day))!;
    await finishActivity(first.id, data, day);
    await finishActivity(first.id, data, day);
    let state = await loadState();
    expect(state.progress[0]?.percent).toBe(4);
    expect(state.progress[0]?.completedAt).toBeNull();
    expect(state.reviews).toHaveLength(4);
    expect(state.reviews.every(r => r.contentId === 'TI-BD-003' && r.unitId === 'TI-BD-003-01')).toBe(true);
    expect(studiedUnit(data, state, 'TI-BD-003','TI-BD-003-02')).toBe(false);
    const review = (await beginNextActivity(data, day))!;
    expect(review.kind).toBe('revisão');
    await finishActivity(review.id, data, day);
    const questions = (await beginNextActivity(data, day))!;
    expect(questions.kind).toBe('questões');
    await expect(finishActivity(questions.id, data, day)).rejects.toThrow('Responda');
    for (const id of questions.questionIds) {
      const q = data.questions.find(q => q.id === id)!;
      await recordAnswer(q, q.answer, 'conteúdo', day, questions.id);
      await recordAnswer(q, q.answer, 'conteúdo', day, questions.id);
    }
    await finishActivity(questions.id, data, day);
    state = await loadState();
    expect(state.attempts).toHaveLength(questions.questionIds.length);
    expect(recommendations(data, state, day)[0]?.unitId).toBe('TI-BD-003-02');
    const shared = data.contests.map(c => ({...c,conteudosRelacionados:['TI-BD-003']}));
    expect(shared.map(c => contestProgress(c, state.progress))).toEqual([4,4]);
  });
  it('erros causam reforço futuro e revisar não conclui a teoria inteira', async () => {
    const q = data.questions.find(q => q.unitIds?.includes('TI-BD-003-01'))!;
    const attempt = await recordAnswer(q, q.options.find(o=>o.id!==q.answer)!.id, 'interpretação',day);
    expect(recommendations(data,await loadState(), day).some(a=>a.kind==='reforço')).toBe(false);
    const review=(await beginNextActivity(data,'2026-09-26'))!;
    expect(review.kind).toBe('reforço');
    await finishActivity(review.id,data,'2026-09-26');
    const state=await loadState();
    expect(state.attempts.find(a=>a.id===attempt.id)?.resolvedAt).toBe('2026-09-26');
    expect(state.progress[0]?.completedAt).toBeNull();
    expect(recommendations(data,state,'2026-09-26')[0]?.kind).toBe('aula');
  });
  it('preserva uma aula inteira concluída na versão antiga', async () => {
    await setProgress('TI-BD-003','concluído',day);
    const state=await loadState();
    expect(lessonUnits(data.lessons[0]!).every(u=>studiedUnit(data,state,'TI-BD-003',u.id))).toBe(true);
    expect(recommendations(data,state,day).some(a=>a.kind==='aula')).toBe(false);
  });
  it('backup antigo continua válido e backup novo inclui a retomada', async () => {
    const {activities: _activities, ...old} = empty;
    expect(_activities).toEqual([]);
    await importBackup(old);
    const activity=await beginNextActivity(data,day);
    const backup=await loadState();
    const db=await database(); await db.clear('activities'); db.close();
    await importBackup(JSON.parse(JSON.stringify(backup)));
    expect((await beginNextActivity(data,day))?.id).toBe(activity?.id);
  });
  it('exclui prova expirada, preserva suspensão e mantém os dados', () => {
    expect(recommendations(data,empty,'2026-11-30')[0]?.reasons).toContain('1 concurso(s) ativo(s)');
    expect(recommendations(data,empty,'2027-01-18')).toEqual([]);
    const copy=structuredClone(data); copy.contests[0]!.status='suspenso';
    expect(recommendations(copy,empty,'2027-01-18')).toHaveLength(1);
    expect(data.lessons).toHaveLength(1);
  });
  it('prioriza questão real da banca antes de autoral, sem inventar procedência', async () => {
    await setProgress('TI-BD-003','concluído',day);
    const copy=structuredClone(data);
    const original=copy.questions[0]!;
    copy.questions.push({...original,id:'TEST-REAL',origin:'real',banca:copy.contests[0]!.banca,
      provenance:{orgao:'Fixture',prova:'Teste',cargo:'Teste',year:2026,url:'https://example.org/test'}});
    const activity=recommendations(copy,await loadState(),day).find(a=>a.kind==='questões');
    expect(activity?.questionIds[0]).toBe('TEST-REAL');
    expect(()=>validateCatalog({...copy,questions:[{...original,origin:'real'}]})).toThrow('procedência');
  });
  it('rejeita vínculo de questão com subtema inexistente', () => {
    const copy=structuredClone(data); copy.questions[0]!.unitIds=['INEXISTENTE'];
    expect(()=>validateCatalog(copy)).toThrow('subtema inexistente');
  });
  it('um concurso novo reutiliza a mesma atividade pelos dados', () => {
    const copy=structuredClone(data);
    copy.contests.push({...copy.contests[1]!,id:'TEST-NOVO',dataProvaAtual:'2026-10-01',conteudosRelacionados:['TI-BD-003']});
    copy.references.find(r=>r.id==='TI-BD-003')!.contests.push({contestId:'TEST-NOVO',coverage:'integral'});
    const next=recommendations(validateCatalog(copy),empty,day);
    expect(next[0]?.reasons).toContain('3 concurso(s) ativo(s)');
    expect(next[0]?.id).toBe(recommendations(data,empty,day)[0]?.id);
  });
  it('questões sem associação canônica só entram depois da teoria inteira', async () => {
    const first=(await beginNextActivity(data,day))!; await finishActivity(first.id,data,day);
    const block=recommendations(data,await loadState(),day).find(a=>a.kind==='questões');
    expect(block?.questionIds.length).toBeGreaterThan(0);
    expect(block?.questionIds.every(id=>data.questions.find(q=>q.id===id)?.unitIds?.includes('TI-BD-003-01'))).toBe(true);
  });
  it('reserva a décima etapa teórica ao exclusivo secundário quando disponível', () => {
    const copy=structuredClone(data);
    const exclusive=copy.references.find(r=>r.id==='TI-PROG-001')!;
    exclusive.status='publicado';
    copy.lessons.push({...copy.lessons[0]!,id:exclusive.id,title:exclusive.title,contests:exclusive.contests.map(c=>c.contestId),sections:undefined});
    const history=Array.from({length:9},(_,i)=>({id:`TEST-${i}`,kind:'aula' as const,contentId:'TEST',unitId:`TEST-${i}`,title:'Fixture',questionIds:[],reviewIds:[],startedAt:day,completedAt:day,sequence:i+1}));
    expect(recommendations(copy,{...empty,activities:history},day)[0]?.contentId).toBe(exclusive.id);
    expect(recommendations(copy,empty,day)[0]?.contentId).toBe('TI-BD-003');
  });
  it('baixa performance e longo intervalo aumentam a prioridade de revisão do assunto', async () => {
    await setProgress('TI-BD-003','em andamento',day);
    const state=await loadState();
    const initial=recommendations(data,state,day)[0]!.score;
    state.progress[0]!.lastAccess='2026-08-01';
    state.progress[0]!.wrong=8; state.progress[0]!.total=10;
    expect(recommendations(data,state,day)[0]!.score).toBeGreaterThan(initial);
  });
  it('duas revisões consecutivas dão espaço a conteúdo novo', () => {
    const history=Array.from({length:2},(_,i)=>({id:`TEST-${i}`,kind:'revisão' as const,contentId:'TI-BD-003',title:'Fixture',questionIds:[],reviewIds:[],startedAt:day,completedAt:day,sequence:i+1}));
    const state={...empty,activities:history,reviews:[{id:'TEST-DUE',contentId:'TI-BD-003',stage:'D1' as const,due:day,doneAt:null}]};
    expect(recommendations(data,state,day)[0]?.kind).toBe('aula');
  });
});
