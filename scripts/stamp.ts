import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
let commit=process.env.GITHUB_SHA??'uncommitted';
if(commit==='uncommitted'){
  try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{/* Initial local build can precede the first commit. */}
}
await writeFile('dist/version.json',JSON.stringify({commit,builtAt:new Date().toISOString(),application:'central-estudos-concursos'},null,2)+'\n');
console.log(`Build identificado: ${commit}`);
