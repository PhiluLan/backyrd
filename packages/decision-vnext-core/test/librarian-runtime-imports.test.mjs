import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=new URL('../../../',import.meta.url);
const config=new URL('supabase/functions/decision-v13/deno.json',root);
const imports=Object.fromEntries(Object.entries(JSON.parse(readFileSync(config,'utf8')).imports).map(([key,path])=>[key,new URL(path,config).href]));
const loader='data:text/javascript,'+encodeURIComponent(`const imports=${JSON.stringify(imports)};export async function resolve(s,c,next){return imports[s]?{url:imports[s],shortCircuit:true}:next(s,c);}`);
const script=`
const {exercise}=await import('./packages/decision-vnext-core/test/librarian-active-route-fixtures.mjs');
const {request,fact,meal,budget,date,evening,profile,offer,area,prop,binding}=await import('./packages/decision-vnext-core/test/librarian-matching-fixtures.mjs');
const {contentHash}=await import('./packages/decision-vnext-core/dist/canonical.js');
const queries=[[meal()],[fact('drink','experience.activity','etwas trinken')],[meal(),...budget(40)],[meal(),date(),evening()],[meal(),fact('quiet','atmosphere.character','ruhig')],[meal(),fact('inside','offer.area','drinnen')],[meal(),fact('vegan','food.diet','vegan')],[meal(),fact('music','atmosphere.music','Musik','EXCLUDED')],[meal(),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])],[fact('winebar','offer.kind','Weinbar'),date(),evening()]];
const catalog=Array.from({length:12},(_,i)=>binding(i+1,profile([offer('dinner','DINNER',['inside'],[prop('food.diet','vegan')]),offer('drink','DRINKS')],[area('inside',[prop('atmosphere.character','ruhig')])])));
const results=[];
for(const facts of queries){const r=await exercise({text:'Synthetischer Wunsch',meaning:request(facts),catalog,prefetch:true});results.push({status:r.status,calls:r.calls,reads:r.reads,hash:contentHash(r.body)});}
console.log(JSON.stringify(results));`;
function run(runtime){const result=spawnSync(process.execPath,[...(runtime?['--no-warnings','--loader',loader]:[]),'--input-type=module','--eval',script],{cwd:fileURLToPath(root),encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}
test('the exact Edge import map preserves ten complete HTTP responses and one model/catalog call',()=>{
 const original=run(false),runtime=run(true);
 assert.deepEqual(runtime,original);
 assert.equal(runtime.length,10);
 for(const r of runtime){assert.equal(r.status,200);assert.equal(r.calls,1);assert.equal(r.reads,1);}
});
