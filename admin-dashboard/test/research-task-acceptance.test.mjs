import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";import {join} from "node:path";import {pathToFileURL} from "node:url";import {test} from "node:test";import ts from "typescript";
const dir=await mkdtemp(join(tmpdir(),"research-accept-"));
const files={researchInbox:"../lib/researchInbox.ts",nuknukDraftImport:"../lib/nuknukDraftImport.ts",researchSaveFeedback:"../lib/researchSaveFeedback.ts",worldResearchExport:"../lib/server/worldResearchExport.ts",researchFieldEdit:"../lib/server/researchFieldEdit.ts",researchTaskAcceptance:"../lib/server/researchTaskAcceptance.ts"};
for(const [name,file] of Object.entries(files)){
 const raw=await readFile(new URL(file,import.meta.url),"utf8");
 let code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace('import "server-only";','').replaceAll('"@backyrd/world-knowledge-core"',JSON.stringify(new URL('../../packages/world-knowledge-core/dist/index.js',import.meta.url).href));
 for(const dependency of Object.keys(files))for(const prefix of ["../","./"])code=code.replaceAll(JSON.stringify(prefix+dependency),JSON.stringify(pathToFileURL(join(dir,dependency+'.mjs')).href));
 await writeFile(join(dir,name+'.mjs'),code);
}
const {acceptResearchTask}=await import(pathToFileURL(join(dir,'researchTaskAcceptance.mjs')).href);
const {taskFingerprint}=await import(pathToFileURL(join(dir,'researchInbox.mjs')).href);
const id='174cfd79-d10d-434d-be8f-1a7e39047e82';
function fixture(attributeKey='contact.phone',value='+41612725415',existing){
 const calls=[],answers=existing?{[attributeKey]:{claimId:'old',value:existing,knowledgeState:'KNOWN_VALUE',visibility:'PUBLIC'}}:{};
 let manifest={manifestHash:'before',worldSnapshot:{spotId:id}};
 const detail=()=>({spotId:id,name:'Ort',status:'approved',actor:{role:'ADMIN',allowedAttributeKeys:[attributeKey]},answers,manifest});
 const actor={rpc:async(name,args)=>{calls.push([name,args]);if(name==='world_product_authoring_detail_v1')return {data:detail()};if(name==='world_product_admin_submit_claim_v1'){answers[attributeKey]={claimId:'saved',value:args.p_value,knowledgeState:args.p_knowledge_state,visibility:'PUBLIC'};return {data:{}};}throw Error(name);}};
 const service={rpc:async(name)=>{calls.push([name]);manifest={manifestHash:'after',worldSnapshot:{spotId:id}};return {data:manifest};}};
 const result={attributeKey,value,status:'REQUIRES_REVIEW',citations:[{url:'https://example.org',evidence:'Veröffentlichte Angabe'}]};
 const row={id:'job',actor_id:'admin',spot_id:id,spot_name:'Ort',status:'READY_FOR_REVIEW',created_at:'2026-10-27T20:00:00Z',updated_at:'2026-10-27T20:00:00Z',reviewed_at:null,export_document:{kind:'ADMIN_RESEARCH_FOLLOWUP'},result_document:{results:[result]}};
 const input={fingerprint:taskFingerprint(result),claimId:existing?'old':null,idempotencyKey:'research-edit:'+id};
 return {actor,service,row,input,answers,calls,detail:structuredClone(detail())};
}
test('acceptance writes the exact stored proposal through the existing moderated Admin writer and verifies it',async()=>{
 const f=fixture();const saved=await acceptResearchTask(f.actor,f.service,'admin',[f.row],f.detail,{...f.input,value:'browser must not choose this'});
 assert.equal(saved.saved,true);assert.equal(saved.answer.value,'+41612725415');assert.equal(f.calls.filter(([name])=>name==='world_product_admin_submit_claim_v1').length,1);assert.equal(f.calls.filter(([name])=>name==='world_product_rebuild_spot_v1').length,1);
});
test('acceptance cannot use another Admin or Spot, an archived report, a changed proposal or stale claim',async()=>{
 for(const change of [{row:{actor_id:'other'}},{row:{spot_id:'other'}},{row:{reviewed_at:'2026-10-27T21:00:00Z'}},{input:{fingerprint:'changed'}},{input:{claimId:'stale'}}]){
  const f=fixture();await assert.rejects(acceptResearchTask(f.actor,f.service,'admin',[{...f.row,...change.row}],f.detail,{...f.input,...change.input}));assert.equal(f.calls.filter(([name])=>name==='world_product_admin_submit_claim_v1').length,0);
 }
});
test('a missing proposal is not silently converted into a fact',async()=>{
 const f=fixture();f.row.result_document.results[0].value=undefined;f.input.fingerprint=taskFingerprint(f.row.result_document.results[0]);
 await assert.rejects(acceptResearchTask(f.actor,f.service,'admin',[f.row],f.detail,f.input),/eindeutige Angabe/);assert.equal(f.calls.length,0);
});
test('a competing profile edit is rechecked by the writer immediately before saving',async()=>{
 const f=fixture();f.answers['contact.phone']={claimId:'competing',knowledgeState:'KNOWN_VALUE',visibility:'PUBLIC',value:'+41619999999'};
 await assert.rejects(acceptResearchTask(f.actor,f.service,'admin',[f.row],f.detail,f.input),/inzwischen geändert/);assert.equal(f.calls.filter(([name])=>name==='world_product_admin_submit_claim_v1').length,0);
});
test('accepting special dates preserves unrelated existing holidays',async()=>{
 const before={date:'2026-11-01',status:'CLOSED',intervals:[]},added={date:'2026-12-24',status:'CLOSED',intervals:[]};
 const f=fixture('hours.special',[added],[before]);const saved=await acceptResearchTask(f.actor,f.service,'admin',[f.row],f.detail,f.input);assert.deepEqual(saved.answer.value,[before,added]);
});
test('yes and no retain their actual knowledge state when accepted',async()=>{
 for(const value of [true,false]){const f=fixture('operation.takeaway',value);const result=await acceptResearchTask(f.actor,f.service,'admin',[f.row],f.detail,f.input);assert.equal(result.answer.knowledgeState,value?'KNOWN_TRUE':'KNOWN_FALSE');assert.equal(result.answer.value,value);}
});
test('an unconfirmed projection never becomes a successful acceptance',async()=>{
 const f=fixture();await assert.rejects(acceptResearchTask(f.actor,{rpc:async()=>({error:{message:'offline'}})},'admin',[f.row],f.detail,f.input),error=>error.saveState==='SAVED_UNVERIFIED');
});
