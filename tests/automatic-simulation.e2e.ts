import {chromium,expect} from '@playwright/test';
import {loadCatalog} from '../scripts/io';
import {recommendations,activitySchema} from '../src/services/trail';
import {progressFor} from '../src/services/study';
import {writeFile,mkdir} from 'node:fs/promises';
const data=await loadCatalog(),day='2026-10-17';
const base=process.env.SITE_URL??'http://127.0.0.1:4183/central-estudos-concursos/';
const state={version:1 as const,activities:[],reviews:[],attempts:[],writings:[],results:[],progress:data.lessons.slice(0,3).map(l=>({...progressFor(l.id,day),completedAt:day,status:'concluído' as const,percent:100}))};
const next=recommendations(data,state,day).find(a=>a.targetId?.startsWith('TREINO-AUTOMATICO-'))!;
const activity=activitySchema.parse({...next,startedAt:day,completedAt:null,sequence:1});
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors:string[]=[];
try{
 const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await expect(page.getByRole('button',{name:'Continuar estudando',exact:true})).toBeEnabled();
 await page.evaluate(async({state,activity})=>{const request=indexedDB.open('central-estudos');const db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});const tx=db.transaction(['progress','activities'],'readwrite');for(const p of state.progress)tx.objectStore('progress').put(p);tx.objectStore('activities').put(activity);await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});db.close();},{state,activity});
 await page.goto(base+'#/estudar/'+encodeURIComponent(activity.id));await page.reload();
 await expect(page.getByRole('heading',{level:1})).toHaveText(activity.title);
 await page.getByRole('button',{name:'Iniciar simulado',exact:true}).click();
 await expect(page.locator('fieldset')).toHaveCount(activity.questionIds.length);
 await expect(page.locator('.activity-actions button')).toBeDisabled();
 await page.locator('fieldset').first().getByRole('radio').first().check();
 await expect(page.locator('fieldset').first()).toBeEnabled();
 await page.reload();await expect(page.locator('fieldset').first().getByRole('radio').first()).toBeChecked();
 for(const field of await page.locator('fieldset').all()){await field.getByRole('radio').first().check();await expect(field).toBeEnabled();}
 await page.getByRole('button',{name:'Finalizar e registrar resultado',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Resultado registrado',exact:true})).toBeVisible();
 await expect(page.locator('details').filter({hasText:'Conferir Q-'}).first()).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'Resultado registrado',exact:true})).toBeVisible();
 const previous=page.url();await page.getByRole('button',{name:'Concluir e continuar',exact:true}).click();await expect(page).not.toHaveURL(previous);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
 expect(errors).toEqual([]);
 await mkdir('test-results',{recursive:true});await writeFile(`test-results/automatic-simulation-${base.startsWith('https')?'public':'local'}.json`,JSON.stringify({base,date:new Date().toISOString(),activity:activity.id,questions:activity.questionIds,checks:['rascunho retomado após recarga','resultado persistido','gabarito só após finalizar','concluir avança com um clique','celular sem overflow'],errors},null,2));
 console.log('Simulado automático verificado:',activity.id,activity.questionIds.length,'questões; rascunho, resultado, retomada e avanço verificados.');
}finally{await browser.close()}
