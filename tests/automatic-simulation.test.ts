import {beforeEach,describe,it,expect} from 'vitest';
import 'fake-indexeddb/auto';
import {loadCatalog} from '../scripts/io';
import {recommendations,activitySchema} from '../src/services/trail';
import {database,loadState,setProgress,saveSimulationDraft,finishActivity,backupSchema} from '../src/services/storage';
import {projectForCloud,validateRemotePayload} from '../src/services/cloud-protocol';
import {resultSchema} from '../src/types/schema';
const data=await loadCatalog();
const day='2026-10-17';
beforeEach(async()=>{const db=await database();for(const name of ['activities','progress','reviews','attempts','writings','results'] as const)await db.clear(name);db.close();});
describe('simulados automáticos pela trilha',()=>{
 it('não inclui conteúdo ainda não estudado e só libera após três aulas completas',async()=>{
  const lessons=data.lessons.slice(0,3);
  for(const l of lessons.slice(0,2))await setProgress(l.id,'concluído',day);
  expect(recommendations(data,await loadState(),day).some(a=>a.targetId?.startsWith('TREINO-AUTOMATICO-'))).toBe(false);
  await setProgress(lessons[2]!.id,'concluído',day);
  const rec=recommendations(data,await loadState(),day).find(a=>a.targetId?.startsWith('TREINO-AUTOMATICO-'))!;
  expect(rec).toBeDefined();expect(rec.questionIds.length).toBeGreaterThanOrEqual(3);
  expect(rec.questionIds.every(id=>lessons.some(l=>l.id===data.questions.find(q=>q.id===id)?.contentId))).toBe(true);
  expect(new Set(rec.questionIds).size).toBe(rec.questionIds.length);
  expect(()=>resultSchema.parse({id:'TEST-RESULT',simulationId:rec.targetId,date:day,correct:0,wrong:0,unanswered:rec.questionIds.length,seconds:0,score:0,byDiscipline:{}})).not.toThrow();
 });
 it('salva rascunho durável no progresso e mantém o contrato de nuvem e backup',async()=>{
  const q=data.questions[0]!;
  const a=activitySchema.parse({id:'simulado:teste',kind:'simulado',contentId:q.contentId,title:'Teste',targetId:'teste',questionIds:[q.id],reviewIds:[],startedAt:day,completedAt:null,sequence:1});
  const db=await database();await db.put('activities',a);db.close();
  const draft={started:Date.now(),answers:{[q.id]:q.options[0]!.id}};
  await saveSimulationDraft(a.id,draft);
  const saved=(await loadState()).activities![0]!;
  expect(saved.simulationDraft).toEqual(draft);
  expect(backupSchema.parse(await loadState()).activities![0]!.simulationDraft).toEqual(draft);
  expect((validateRemotePayload('activity',projectForCloud('activities',saved),2) as typeof saved).simulationDraft).toEqual(draft);
  await expect(saveSimulationDraft(a.id,{...draft,answers:{desconhecida:'A'}})).rejects.toThrow('fora');
  await expect(finishActivity(a.id,data,day)).rejects.toThrow('Finalize o simulado');
  expect((await loadState()).activities![0]!.completedAt).toBeNull();
 });
});
