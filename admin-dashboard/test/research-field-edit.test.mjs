import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import test from "node:test";
import ts from "typescript";
const dir=await mkdtemp(join(tmpdir(),"research-edit-"));
const feedbackSource=await readFile(new URL('../lib/researchSaveFeedback.ts',import.meta.url),'utf8');
await writeFile(join(dir,'researchSaveFeedback.mjs'),ts.transpileModule(feedbackSource,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
for(const name of ["worldResearchExport","researchFieldEdit"]){
 const source=await readFile(new URL(`../lib/server/${name}.ts`,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace('import "server-only";','')
  .replace('"@backyrd/world-knowledge-core"',JSON.stringify(new URL('../../packages/world-knowledge-core/dist/index.js',import.meta.url).href))
  .replace('"../researchSaveFeedback"',JSON.stringify(pathToFileURL(join(dir,'researchSaveFeedback.mjs')).href))
  .replace('"./worldResearchExport"',JSON.stringify(pathToFileURL(join(dir,'worldResearchExport.mjs')).href));
 await writeFile(join(dir,name+'.mjs'),code);
}
const {researchFieldEdit}=await import(pathToFileURL(join(dir,'researchFieldEdit.mjs')).href);
const id="174cfd79-d10d-434d-be8f-1a7e39047e82";
const input={spotId:id,attributeKey:"contact.phone",knowledgeState:"KNOWN_VALUE",value:"+41612725415",expectedClaimId:null,idempotencyKey:"research-edit:174cfd79-d10d-434d-be8f-1a7e39047e82"};
function fixture(){
 const calls=[];let manifest={manifestHash:'before',worldSnapshot:{spotId:id}};
 const answers={'contact.website':{claimId:'website',knowledgeState:'KNOWN_VALUE',value:'https://example.org',visibility:'PUBLIC'},secret:{value:'private',visibility:'PRIVATE'}};
 const actor={rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='world_product_authoring_detail_v1')return {data:{spotId:id,name:'Fixture',status:'approved',actor:{role:'ADMIN',allowedAttributeKeys:['contact.phone']},answers,manifest}};
  if(name==='world_product_admin_submit_claim_v1'){answers[args.p_attribute_key]={claimId:'new-claim',knowledgeState:args.p_knowledge_state,value:args.p_value,visibility:'PUBLIC'};return {data:{}};}
  throw new Error('Unexpected RPC');
 }};
 const service={rpc:async(name,args)=>{calls.push([name,args]);manifest={manifestHash:'after',worldSnapshot:{spotId:id}};return {data:manifest};}};
 return {actor,service,calls,answers};
}
test('editing reads public current fields without submitting claims',async()=>{
 const f=fixture();const read=await researchFieldEdit(f.actor,null,'admin',input,false);
 assert.ok(read.answers['contact.website']);assert.equal(read.answers.secret,undefined);assert.equal(f.calls.length,1);
});
test('manual confirmations use the actor writer, not research evidence, and preserve unrelated facts',async()=>{
 const f=fixture();const result=await researchFieldEdit(f.actor,f.service,'admin',input,true);
 assert.equal(result.answer.value,input.value);assert.ok(result.answers['contact.website']);assert.equal(result.answers.secret,undefined);
 const saved=f.calls.find(([name])=>name==='world_product_admin_submit_claim_v1')[1];
 assert.equal(saved.p_supersedes_claim_id,null);assert.equal(saved.p_attribute_key,'contact.phone');assert.ok(saved.p_observed_at);assert.equal(saved.p_source,undefined);
 assert.equal(f.calls.filter(([name])=>name==='world_product_rebuild_spot_v1').length,1);
 await researchFieldEdit(f.actor,f.service,'admin',input,true);
 assert.equal(f.calls.filter(([name])=>name==='world_product_admin_submit_claim_v1').length,1);
});
test('stale edits, unauthorized keys and invalid input cannot overwrite the current profile',async()=>{
 for(const change of [{expectedClaimId:'stale'},{attributeKey:'identity.name',value:'Changed'},{value:'broken'},{idempotencyKey:'invalid'}]){
  const f=fixture();await assert.rejects(()=>researchFieldEdit(f.actor,f.service,'admin',{...input,...change},true));
  assert.equal(f.calls.filter(([name])=>name==='world_product_admin_submit_claim_v1').length,0);
 }
});
test('rebuild failure is reported honestly and retry does not submit the same claim twice',async()=>{
 const f=fixture();await assert.rejects(()=>researchFieldEdit(f.actor,{rpc:async()=>({error:{message:'offline'}})},'admin',input,true),error=>error.saveState === "SAVED_UNVERIFIED" && /ist gespeichert/.test(error.message));
 await researchFieldEdit(f.actor,f.service,'admin',input,true);
 assert.equal(f.calls.filter(([name])=>name==='world_product_admin_submit_claim_v1').length,1);
});
test('missing rebuild configuration fails before writing',async()=>{
 const f=fixture();await assert.rejects(()=>researchFieldEdit(f.actor,null,'admin',input,true),/nichts gespeichert/);
 assert.equal(f.calls.filter(([name])=>name==='world_product_admin_submit_claim_v1').length,0);
});


test('an equal private value is never reported as a saved public confirmation',async()=>{
 const f=fixture();f.answers['contact.phone']={claimId:'private-claim',knowledgeState:'KNOWN_VALUE',value:input.value,visibility:'PRIVATE'};
 await assert.rejects(()=>researchFieldEdit(f.actor,f.service,'admin',input,true),/inzwischen geändert/);
 assert.equal(f.calls.filter(([name])=>name==='world_product_admin_submit_claim_v1').length,0);
});
