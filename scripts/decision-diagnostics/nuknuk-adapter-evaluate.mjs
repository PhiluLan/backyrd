#!/usr/bin/env node
// Same pinned held-out inputs/profile for baseline and adapter; no live Product.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {buildNuknukUnderstandingRequest,callNuknukLocal,validateNuknukUnderstanding} from '../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {buildNuknukAssessmentRequest,validateNuknukAssessment} from '../../packages/decision-vnext-core/dist/nuknuk-grounded-assessment.js';

const [dataDirectory,modelPath,outputDirectory,adapterPath]=process.argv.slice(2);
if(!dataDirectory||!modelPath||!outputDirectory) throw Error('nuknuk_eval_arguments_required');
const folder=resolve(outputDirectory);await mkdir(folder,{mode:0o700});
const data=JSON.parse(await readFile(resolve(dataDirectory,'reviewed-backyrd.json'),'utf8'));
const manifest=JSON.parse(await readFile(resolve(dataDirectory,'manifest.json'),'utf8'));
if(contentHash(data)!==manifest.datasetHash||manifest.instructionProfile!=='COMPACT_ADAPTER_V1') throw Error('nuknuk_eval_data_changed');
const adapterHash=adapterPath?createHash('sha256').update(await readFile(resolve(adapterPath,'adapters.safetensors'))).digest('hex'):null;
const rows=data.cases.filter(c=>c.split==='TEST');
const results=[];
const fingerprint=f=>JSON.stringify({key:f.key,modality:f.modality,value:f.value});
for(const row of rows){
  const request=row.content.task==='INTERPRET_REQUEST'
    ?buildNuknukUnderstandingRequest({...row.content,instructionProfile:'COMPACT_ADAPTER_V1'})
    :buildNuknukAssessmentRequest(row.content.context);
  const start=performance.now();let raw=null,rawText=null,metadata=null;
  let result;
  try{
    const response=await callNuknukLocal({modelPath:resolve(modelPath),...(adapterPath?{expectedAdapterPath:resolve(adapterPath)}:{}),request,maxOutputTokens:2048,signal:AbortSignal.timeout(240000),onRawOutput:value=>{raw=value;},onRawText:value=>{rawText=value;},onResponseMetadata:value=>{metadata=value;}});
    raw=response.raw;
    const checked=row.content.task==='INTERPRET_REQUEST'?validateNuknukUnderstanding(raw,row.content):validateNuknukAssessment(raw,request);
    const expected=row.content.target.meaning?.facts??[];
    const actual=raw.meaning?.facts??[];
    result={status:'STRUCTURALLY_VALID',requestState:checked.requestState??null,
      literalTargetFactsMissing:expected.filter(f=>!actual.some(a=>fingerprint(a)===fingerprint(f))),
      literalFactsBeyondTarget:actual.filter(f=>!expected.some(a=>fingerprint(a)===fingerprint(f))),
      note:'Literal fact differences are diagnostic, not a semantic pass/fail score; wording equivalents and permissible inferences require review.'};
  }catch(error){result={status:'FAILED',code:error instanceof Error?error.message:'nuknuk_eval_failed'};}
  const record={id:row.id,task:row.content.task,query:row.content.query,inputHash:contentHash(request.input),promptHash:contentHash(request.instructions),
    targetHash:row.contentHash,result,raw,rawText,metadata,maxOutputTokens:2048,durationMs:performance.now()-start,modelPath:resolve(modelPath),adapterPath:adapterPath?resolve(adapterPath):null,adapterHash};
  results.push(record);await writeFile(resolve(folder,row.id+'.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({id:row.id,status:result.status,durationSeconds:Math.round(record.durationMs/1000)}));
}
const summary={datasetHash:manifest.datasetHash,profile:manifest.instructionProfile,modelPath:resolve(modelPath),adapterHash,
  cases:results.map(({id,result,durationMs})=>({id,result,durationMs})),structurallyValid:results.filter(r=>r.result.status==='STRUCTURALLY_VALID').length,total:results.length,
  durationMs:results.reduce((s,r)=>s+r.durationMs,0),productionWrites:0,limitations:['ASSISTANT_AUTHORED_HOLDOUT','ADVISORY_READING_CASES_ARE_NOT_END_TO_END_DISCOVERY','STRUCTURAL_SUCCESS_IS_NOT_SEMANTIC_SUCCESS']};
await writeFile(resolve(folder,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx',mode:0o600});
