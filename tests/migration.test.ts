import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { openDB } from 'idb';
import { loadState } from '../src/services/storage';
import { progressFor } from '../src/services/study';
it('migra IndexedDB 1 para 2 preservando todos os registros antigos', async () => {
  const old = await openDB('central-estudos',1,{upgrade(db){
    for(const name of ['progress','reviews','attempts','writings','results']) db.createObjectStore(name,{keyPath:'id'});
  }});
  const progress={...progressFor('TI-BD-003','2026-09-24'),percent:50,status:'em andamento'};
  await old.put('progress',progress);
  await expect(loadState()).rejects.toThrow('Feche as outras abas');
  old.close();
  const state=await loadState();
  expect(state.progress).toEqual([progress]);
  expect(state.activities).toEqual([]);
});
