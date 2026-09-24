import { readFile,writeFile,readdir } from 'node:fs/promises';
import process from 'node:process';
const sync=JSON.parse(await readFile('editorial/last-sync.json','utf8'));
const lessons=await readdir('content/lessons');
const receipts=await readdir('editorial/receipts').catch(()=>[]);
const checkpoint={lastDriveSync:sync.at,lastContentImported:lessons.filter(f=>f.endsWith('.json')),publicationReceipts:receipts,lastBuild:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,lastDeploy:new Date().toISOString(),publishedCommit:process.env.GITHUB_SHA,siteUrl:process.env.SITE_URL,errors:[],editorialPending:['Conteúdos dependem de itens canônicos prontos na fila do Drive.']};
await writeFile('deployment-checkpoint.json',JSON.stringify(checkpoint,null,2)+'\n');
