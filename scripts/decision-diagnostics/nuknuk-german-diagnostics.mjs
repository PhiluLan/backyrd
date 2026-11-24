// Local inference only. No model loading, provider billing, production writes or deployment.
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {currentPrompt} from './nuknuk-product-training.mjs';
import {germanDiagnosticCases} from './nuknuk-german-diagnostic-cases.mjs';
import {validateNuknukCompactSearch} from '../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
const [command,outArg,casesArg]=process.argv.slice(2),out=resolve(outArg??'.');
const health=async()=>{const r=await fetch('http://127.0.0.1:8088/health',{signal:AbortSignal.timeout(5000),redirect:'error'});if(!r.ok)throw Error('local_health_unavailable');return r.json();};
if(command==='prepare'){
 const h=await health();if(h.status!=='healthy'||!h.loaded_model?.startsWith('/')||!h.loaded_adapter?.startsWith('/'))throw Error('local_model_identity_unknown');
 const rows=casesArg?JSON.parse(await readFile(resolve(casesArg))):germanDiagnosticCases(),requests=[];
 if(!Array.isArray(rows)||rows.length<1||rows.length>25||new Set(rows.map(r=>r.id)).size!==rows.length||rows.some(r=>!/^german-(?:diag|probe)-[a-z0-9-]+$/.test(r.id)||typeof r.query!=='string'||r.query.length>2000||r.task!=='COMPACT_SEARCH_V7'||r.trainingPermission!==false||!Array.isArray(r.obligations)||!r.reference?.now))throw Error('invalid_synthetic_diagnostic_cases');
 for(const row of rows){const p=await currentPrompt(row);requests.push({id:row.id,messages:[{role:'system',content:p.instructions},{role:'user',content:p.input}],outputSchema:p.outputSchema});}
 await mkdir(out,{recursive:true,mode:0o700});
 const files={'cases.json':JSON.stringify(rows,null,2)+'\n','requests.json':JSON.stringify(requests,null,2)+'\n'};
 const sourceNames=['scripts/decision-diagnostics/nuknuk-german-diagnostics.mjs','scripts/decision-diagnostics/nuknuk-german-diagnostic-cases.mjs','scripts/decision-diagnostics/nuknuk-product-training.mjs','packages/decision-vnext-core/dist/nuknuk-understanding.js','packages/decision-vnext-core/dist/product-nuknuk-provider.js'];
 const sourceHashes={};for(const name of sourceNames)sourceHashes[name]=sha(await readFile(new URL('../../'+name,import.meta.url)));
 const manifest={sourceHashes,version:'backyrd.german-diagnostic@1',scope:'CURRENT_RUNNING_BASELINE_ONLY',caseCount:rows.length,model:h.loaded_model,adapter:h.loaded_adapter,adapterSha256:sha(await readFile(resolve(h.loaded_adapter,'adapters.safetensors'))),files:Object.fromEntries(Object.entries(files).map(([n,b])=>[n,sha(b)])),modelLoadedByThisRun:false,paidResources:false,productionWrites:false,candidateEvaluated:false};
 for(const [name,bytes]of Object.entries(files))await writeFile(resolve(out,name),bytes,{flag:'wx',mode:0o600});
 await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(manifest));
}else if(command==='run'){
 const manifest=JSON.parse(await readFile(resolve(out,'manifest.json')));
 for(const [name,hash]of Object.entries(manifest.sourceHashes))if(sha(await readFile(new URL('../../'+name,import.meta.url)))!==hash)throw Error('diagnostic_source_changed');
 for(const [name,hash]of Object.entries(manifest.files))if(sha(await readFile(resolve(out,name)))!==hash)throw Error('diagnostic_inputs_changed');
 if(sha(await readFile(resolve(manifest.adapter,'adapters.safetensors')))!==manifest.adapterSha256)throw Error('baseline_adapter_changed');
 const rows=JSON.parse(await readFile(resolve(out,'cases.json'))),requests=JSON.parse(await readFile(resolve(out,'requests.json')));if(rows.length!==manifest.caseCount||requests.length!==manifest.caseCount)throw Error('diagnostic_roster_changed');
 const records=[];await mkdir(resolve(out,'baseline'),{mode:0o700});
 for(const row of rows){
  const h=await health();if(h.loaded_model!==manifest.model||h.loaded_adapter!==manifest.adapter)throw Error('baseline_model_identity_changed');
  const req=requests.find(r=>r.id===row.id);const reservation=await open(resolve(out,'baseline',row.id+'.started'),'wx',0o600);await reservation.writeFile(JSON.stringify({at:new Date().toISOString(),requestSha256:sha(JSON.stringify(req)),adapterSha256:manifest.adapterSha256}));await reservation.sync();await reservation.close();
  const started=performance.now(),record={id:row.id,query:row.query,field:row.field,adapterSha256:manifest.adapterSha256,attempt:1};
  try{
   const r=await fetch('http://127.0.0.1:8088/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{'content-type':'application/json'},body:JSON.stringify({model:manifest.model,messages:req.messages,temperature:0,max_tokens:2048,stream:false,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:{name:'nuknuk_compact_search',strict:true,schema:req.outputSchema}}})});
   record.httpStatus=r.status;if(!r.ok)throw Error('inference_http_'+r.status);const payload=await r.json();record.usage=payload.usage;if(payload.model!==manifest.model)throw Error('response_model_identity_mismatch');const choice=payload.choices?.[0];record.finishReason=choice?.finish_reason;record.rawText=choice?.message?.content;if(choice?.finish_reason!=='stop'||typeof record.rawText!=='string')throw Error('incomplete_model_output');record.raw=JSON.parse(record.rawText);
   try{record.validated=validateNuknukCompactSearch(record.raw,row);record.status='GENERATED_REQUIRES_SEMANTIC_REVIEW';}catch(e){record.status='HANDOFF_VALIDATION_FAILED';record.validationError=e.message;}
  }catch(e){record.status='INFERENCE_FAILED';record.error=e.name+': '+e.message;}
  record.durationMs=Math.round(performance.now()-started);await writeFile(resolve(out,'baseline',row.id+'.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});records.push(record);console.log(JSON.stringify({id:row.id,status:record.status,durationMs:record.durationMs}));
 }
 await writeFile(resolve(out,'baseline-summary.json'),JSON.stringify({scope:manifest.scope,records:records.map(({rawText,raw,validated,...r})=>r),semanticsApproved:false,paidResources:false,productionWrites:false,candidateEvaluated:false},null,2)+'\n',{flag:'wx',mode:0o600});
}else throw Error('usage: prepare|run OUTPUT_DIRECTORY');
