// Local inference only. No model loading, provider billing, production writes or deployment.
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {currentPrompt} from './nuknuk-product-training.mjs';
import {germanDiagnosticCases} from './nuknuk-german-diagnostic-cases.mjs';
import {validateNuknukCompactSearch} from '../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
const [command,outArg,casesArg,...extraArgs]=process.argv.slice(2),out=resolve(outArg??'.');
const health=async(port=8088)=>{const r=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(5000),redirect:'error'});if(!r.ok)throw Error('local_health_unavailable');return r.json();};
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
}else if(command==='prepare-candidate'){
 const directories=[resolve(casesArg),resolve(extraArgs[0])],adapter=resolve(extraArgs[1]);
 const conversionBytes=await readFile(resolve(adapter,'conversion.json')),conversion=JSON.parse(conversionBytes);
 if(conversion.hfAdapterSha256!=='2b620aa7fbec48946c3e8ce25182452f0e4e366bab8e9ea20f1ebb47d02ce271'||conversion.exactRoundTrip!==true||conversion.tensors!==80||conversion.modelLoaded!==false||conversion.activated!==false||sha(await readFile(resolve(adapter,'adapters.safetensors')))!==conversion.mlxAdapterSha256||sha(await readFile(resolve(adapter,'adapter_config.json')))!==conversion.mlxConfigSha256)throw Error('candidate_conversion_invalid');
 const rows=[],requests=[],baselineBindings=[];let model;
 for(const directory of directories){
  const bytes=await readFile(resolve(directory,'manifest.json')),m=JSON.parse(bytes);
  if(m.scope!=='CURRENT_RUNNING_BASELINE_ONLY'||m.adapterSha256!==conversion.parentMlxSha256||model&&model!==m.model)throw Error('comparison_baseline_identity_mismatch');
  model=m.model;
  // The diagnostic runner itself may evolve; the frozen prompts and their canonical producers must agree.
  for(const [name,hash]of Object.entries(m.sourceHashes))if(!name.endsWith('/nuknuk-german-diagnostics.mjs')&&sha(await readFile(new URL('../../'+name,import.meta.url)))!==hash)throw Error('comparison_prompt_source_changed');
  for(const [name,hash]of Object.entries(m.files))if(sha(await readFile(resolve(directory,name)))!==hash)throw Error('comparison_inputs_changed');
  const cases=JSON.parse(await readFile(resolve(directory,'cases.json'))),reqs=JSON.parse(await readFile(resolve(directory,'requests.json')));
  if(cases.length!==m.caseCount||reqs.length!==cases.length)throw Error('comparison_roster_changed');
  const outputs={};for(const row of cases){const b=await readFile(resolve(directory,'baseline',row.id+'.json')),r=JSON.parse(b);if(r.id!==row.id||r.query!==row.query||r.adapterSha256!==m.adapterSha256||!r.raw)throw Error('comparison_baseline_output_invalid');outputs[row.id]=sha(b);}
  rows.push(...cases);requests.push(...reqs);baselineBindings.push({directory,manifestSha256:sha(bytes),outputs});
 }
 if(rows.length!==25||new Set(rows.map(r=>r.id)).size!==25||requests.some((r,i)=>r.id!==rows[i].id))throw Error('candidate_matched_roster_required');
 const files={'cases.json':JSON.stringify(rows,null,2)+'\n','requests.json':JSON.stringify(requests,null,2)+'\n'};
 const sourceNames=['scripts/decision-diagnostics/nuknuk-german-diagnostics.mjs','scripts/decision-diagnostics/nuknuk-german-chain.mjs','scripts/decision-diagnostics/nuknuk-german-test-world.mjs','scripts/decision-diagnostics/nuknuk-product-training.mjs','packages/decision-vnext-core/dist/nuknuk-understanding.js','packages/decision-vnext-core/dist/product-nuknuk-provider.js'];
 const sourceHashes={};for(const n of sourceNames)sourceHashes[n]=sha(await readFile(new URL('../../'+n,import.meta.url)));
 const manifest={version:'backyrd.german-diagnostic@1',scope:'ISOLATED_TRAINING_CANDIDATE_ONLY',port:8089,caseCount:25,model,adapter,adapterSha256:conversion.mlxAdapterSha256,adapterConfigSha256:conversion.mlxConfigSha256,conversionSha256:sha(conversionBytes),sourceHashes,baselineBindings,files:Object.fromEntries(Object.entries(files).map(([n,b])=>[n,sha(b)])),modelLoadedByThisRun:false,paidResources:false,productionWrites:false,candidateEvaluated:false};
 await mkdir(out,{mode:0o700});for(const[n,b]of Object.entries(files))await writeFile(resolve(out,n),b,{flag:'wx',mode:0o600});
 await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({scope:manifest.scope,caseCount:25,adapterSha256:manifest.adapterSha256,ready:true}));
}else if(command==='run'){
 const manifest=JSON.parse(await readFile(resolve(out,'manifest.json')));
 for(const [name,hash]of Object.entries(manifest.sourceHashes))if(sha(await readFile(new URL('../../'+name,import.meta.url)))!==hash)throw Error('diagnostic_source_changed');
 for(const [name,hash]of Object.entries(manifest.files))if(sha(await readFile(resolve(out,name)))!==hash)throw Error('diagnostic_inputs_changed');
 if(sha(await readFile(resolve(manifest.adapter,'adapters.safetensors')))!==manifest.adapterSha256)throw Error('baseline_adapter_changed');
 const rows=JSON.parse(await readFile(resolve(out,'cases.json'))),requests=JSON.parse(await readFile(resolve(out,'requests.json')));if(rows.length!==manifest.caseCount||requests.length!==manifest.caseCount)throw Error('diagnostic_roster_changed');
 const candidate=manifest.scope==='ISOLATED_TRAINING_CANDIDATE_ONLY',port=candidate?8089:8088,folder=candidate?'candidate':'baseline';
 if(!candidate&&manifest.scope!=='CURRENT_RUNNING_BASELINE_ONLY'||candidate&&manifest.port!==8089)throw Error('diagnostic_scope_invalid');
 if(candidate){
  if(sha(await readFile(resolve(manifest.adapter,'adapter_config.json')))!==manifest.adapterConfigSha256||sha(await readFile(resolve(manifest.adapter,'conversion.json')))!==manifest.conversionSha256)throw Error('candidate_configuration_changed');
  for(const binding of manifest.baselineBindings){if(sha(await readFile(resolve(binding.directory,'manifest.json')))!==binding.manifestSha256)throw Error('baseline_manifest_changed');for(const[id,hash]of Object.entries(binding.outputs))if(sha(await readFile(resolve(binding.directory,'baseline',id+'.json')))!==hash)throw Error('baseline_output_changed');}
 }
 const records=[];await mkdir(resolve(out,folder),{mode:0o700});
 for(const row of rows){
  const h=await health(port);if(h.status!=='healthy'||h.loaded_model!==manifest.model||h.loaded_adapter!==manifest.adapter)throw Error('baseline_model_identity_changed');
  const req=requests.find(r=>r.id===row.id);const reservation=await open(resolve(out,folder,row.id+'.started'),'wx',0o600);await reservation.writeFile(JSON.stringify({at:new Date().toISOString(),requestSha256:sha(JSON.stringify(req)),adapterSha256:manifest.adapterSha256}));await reservation.sync();await reservation.close();
  const started=performance.now(),record={id:row.id,query:row.query,field:row.field,adapterSha256:manifest.adapterSha256,attempt:1};
  try{
   const r=await fetch(`http://127.0.0.1:${port}/v1/chat/completions`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{'content-type':'application/json'},body:JSON.stringify({model:manifest.model,messages:req.messages,temperature:0,max_tokens:2048,stream:false,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:{name:'nuknuk_compact_search',strict:true,schema:req.outputSchema}}})});
   record.httpStatus=r.status;if(!r.ok)throw Error('inference_http_'+r.status);const payload=await r.json();record.usage=payload.usage;if(payload.model!==manifest.model)throw Error('response_model_identity_mismatch');const choice=payload.choices?.[0];record.finishReason=choice?.finish_reason;record.rawText=choice?.message?.content;if(choice?.finish_reason!=='stop'||typeof record.rawText!=='string')throw Error('incomplete_model_output');record.raw=JSON.parse(record.rawText);
   try{record.validated=validateNuknukCompactSearch(record.raw,row);record.status='GENERATED_REQUIRES_SEMANTIC_REVIEW';}catch(e){record.status='HANDOFF_VALIDATION_FAILED';record.validationError=e.message;}
  }catch(e){record.status='INFERENCE_FAILED';record.error=e.name+': '+e.message;}
  record.durationMs=Math.round(performance.now()-started);await writeFile(resolve(out,folder,row.id+'.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});records.push(record);console.log(JSON.stringify({id:row.id,status:record.status,durationMs:record.durationMs}));
 }
 await writeFile(resolve(out,folder+'-summary.json'),JSON.stringify({scope:manifest.scope,records:records.map(({rawText,raw,validated,...r})=>r),semanticsApproved:false,paidResources:false,productionWrites:false,candidateEvaluated:candidate},null,2)+'\n',{flag:'wx',mode:0o600});
}else throw Error('usage: prepare|run OUTPUT_DIRECTORY; prepare-candidate OUTPUT BASELINE_20 BASELINE_5 MLX_CANDIDATE');
