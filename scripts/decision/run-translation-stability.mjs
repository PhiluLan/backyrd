import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const options={};const args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2){if(!['--server-env','--catalog','--events','--output'].includes(args[i])||!args[i+1])throw Error('stability_arguments_invalid');options[args[i]]=resolve(args[i+1]);}
if(!options['--server-env']||!options['--catalog']||!options['--output'])throw Error('stability_arguments_missing');
execFileSync('npm',['run','decision-vnext:build'],{cwd:root,stdio:'pipe'});
const {runLocalDiagnostic}=await import('./run-local-diagnostic.mjs');
const {LUNA_MEANING_ROLE_CONTRACT}=await import('../../packages/decision-vnext-core/dist/product-luna-meaning-contract.js');
const {librarianConcept}=await import('../../packages/world-knowledge-core/dist/index.js');
const env=Object.fromEntries((await readFile(options['--server-env'],'utf8')).split(/\r?\n/).flatMap(line=>{const m=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());return m?[[m[1],m[2].replace(/^(['"])(.*)\1$/,'$2')]]:[];}));
if(env.NEXT_PUBLIC_SUPABASE_URL!=='https://hjgcrrzfjchzqoegcywn.supabase.co'||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('stability_server_configuration_invalid');
const catalog=JSON.parse(await readFile(options['--catalog'],'utf8'));
const events=options['--events']?JSON.parse(await readFile(options['--events'],'utf8')):undefined;
await mkdir(options['--output'],{recursive:true});
const animal='Familientag, meine Tochter will was mit Tieren.';
const cases=[
 {id:'animals-identical',queries:Array(5).fill(animal)},
 {id:'animals-paraphrases',queries:['Mit meiner Tochter Tiere anschauen als Familienausflug.','Familienunternehmung: Meine Tochter möchte Tiere beobachten.']},
 {id:'family-indoor',queries:Array(2).fill('Heute mit meiner 4 jährigen Tochter indoor etwas unternehmen, wo es auch Snacks oder Essen gibt')},
 {id:'restaurant',queries:Array(5).fill('Heute Abend zuerst gemütlich was essen, ohne Reservierung und nicht zu teuer')},
 {id:'jazz-access',queries:Array(2).fill('Live-Jazz in Basel, ich nutze einen Rollstuhl')},
 {id:'own-food',queries:Array(2).fill('Morgen einen Familienausflug machen, egal ob drinnen oder draussen, wir bringen unser eigenes Essen mit')},
];
const duties=meaning=>[...new Set(meaning.facts.filter(f=>['REQUIRED','EXCLUDED'].includes(f.modality)).map(f=>{
 const c=f.value.kind==='TEXT'?librarianConcept(f.value.text):null;
 const key=c?LUNA_MEANING_ROLE_CONTRACT.rules[c]?.[0]??f.key:f.key;
 return JSON.stringify([key,f.modality,c??f.value]);
}))].sort();
// Compare branch structure as well: meal OR snack must never look equivalent
// to meal AND snack merely because both plans contain the same fact values.
function logicSignature(meaning) {
 const atom=id=>{const f=meaning.facts.find(f=>f.id===id);if(!f)return {extension:true};const c=f.value.kind==='TEXT'?librarianConcept(f.value.text):null;return [c?LUNA_MEANING_ROLE_CONTRACT.rules[c]?.[0]??f.key:f.key,f.modality,c??f.value];};
 const walk=n=>{
  if(n.kind==='FACT')return atom(n.factId);
  if(n.kind==='IF'){const condition=meaning.weatherConditions.find(c=>c.id===n.conditionFactId);return ['IF',condition?{state:condition.state,role:condition.role}:atom(n.conditionFactId),walk(n.then),n.else?walk(n.else):null];}
  if(n.kind==='FALLBACK')return ['FALLBACK',n.options.map(walk)];
  const children=n.children.map(walk).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return children.length===1?children[0]:[n.kind,n.strength??null,children];
 };
 const bindings=meaning.bindings.map(b=>[b.kind,b.factIds.map(atom)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return {logic:walk(meaning.logic),bindings};
}
const groups=[];
for(const group of cases){const runs=[];
 for(let i=0;i<group.queries.length;i++){
  const query=group.queries[i];const path=resolve(options['--output'],`${group.id}-${i+1}.json`);
  try{
   const response=await fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/decision-internal-meaning-preview',{method:'POST',headers:{authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,apikey:env.SUPABASE_SERVICE_ROLE_KEY,'content-type':'application/json','x-region':'eu-central-2'},body:JSON.stringify({query}),signal:AbortSignal.timeout(35000)});
   const serverMeaning=await response.json();
   if(!response.ok){await writeFile(path,JSON.stringify({query,status:response.status,diagnostic:serverMeaning},null,2));runs.push({query,status:'UNDERSTANDING_ERROR',error:serverMeaning.error,modelCalls:serverMeaning.modelCalls});continue;}
   const report=await runLocalDiagnostic({query,catalog,events,serverMeaning});
   await writeFile(path,JSON.stringify(report,null,2));
   runs.push({query,status:'COMPLETE',modelCalls:report.modelCalls,modelMs:report.timings.modelMs,duties:duties(report.meaning),logicStructure:logicSignature(report.meaning),ranked:report.response.candidates.filter(c=>c.rank!==null).map(c=>({id:c.spotId,name:c.presentation.name})),attempts:report.translationAttempts.map(a=>a.issues)});
  }catch(error){runs.push({query,status:'FAILED',error:error instanceof Error&&/^[a-z_]+$/.test(error.message)?error.message:'stability_run_failed'});}
  console.log(JSON.stringify({group:group.id,run:i+1,...runs.at(-1)}));
 }
 const eligible=r=>JSON.stringify((r.ranked??[]).map(c=>c.id).sort());
 groups.push({id:group.id,allCompleted:runs.every(r=>r.status==='COMPLETE'),stableEligibility:runs.every(r=>r.status==='COMPLETE'&&eligible(r)===eligible(runs[0])),stableLogic:runs.every(r=>r.status==='COMPLETE'&&JSON.stringify(r.logicStructure)===JSON.stringify(runs[0].logicStructure)),stableMandatoryMeaning:runs.every(r=>r.status==='COMPLETE'&&JSON.stringify(r.duties)===JSON.stringify(runs[0].duties)),runs});
 await writeFile(resolve(options['--output'],'summary.json'),JSON.stringify({scope:'REAL_INDEPENDENT_MODEL_CALLS_CURRENT_INTERNAL_BUILD_SAVED_CATALOG_NEUTRAL_USER',groups},null,2));
}
