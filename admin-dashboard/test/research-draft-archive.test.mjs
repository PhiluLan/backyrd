import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const dir=await mkdtemp(join(tmpdir(),'research-archive-'));
const href=name=>pathToFileURL(join(dir,name+'.mjs')).href;
const core=new URL('../../packages/world-knowledge-core/dist/index.js',import.meta.url).href;
for(const [name,path] of [['draft','../lib/nuknukResearchDraft.ts'],['import','../lib/nuknukDraftImport.ts']]){
 const source=await readFile(new URL(path,import.meta.url),'utf8');
 await writeFile(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace('"@backyrd/world-knowledge-core"',JSON.stringify(core)));
}
await writeFile(join(dir,'mock.mjs'),`export let f;export const installFixture=x=>f=x;export const authorizeAdminRequest=async()=>f.authorization;export const createClient=(_url,key)=>key==='service'?f.service:f.actor;export const readWorldResearchDetail=async()=>f.detail;`);
const source=await readFile(new URL('../app/api/world-knowledge/research-drafts/route.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace('import "server-only";','')
 .replace('"@supabase/supabase-js"',JSON.stringify(href('mock')))
 .replace('"@/lib/server/adminAuthorization"',JSON.stringify(href('mock')))
 .replace('"@/lib/nuknukResearchDraft"',JSON.stringify(href('draft')))
 .replace('"@/lib/nuknukDraftImport"',JSON.stringify(href('import')))
 .replace('"@/lib/server/worldResearchExport"',JSON.stringify(href('mock')));
await writeFile(join(dir,'route.mjs'),code);
const {GET,POST}=await import(href('route'));const {installFixture}=await import(href('mock'));
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='anon';process.env.SUPABASE_SERVICE_ROLE_KEY='service';
const id='174cfd79-d10d-434d-be8f-1a7e39047e82';
function fixture(){
 const row={id,spot_id:id,spot_name:'Fixture',actor_id:'admin',created_at:'2026-10-25T12:00:00Z',updated_at:'2026-10-25T12:00:00Z',reviewed_at:null,status:'READY_FOR_REVIEW',export_document:{kind:'NUKNUK_RESEARCH_DRAFT',version:'nuknuk-research-v4.30'},result_document:{version:'nuknuk-research-v4.30',spotId:id,name:'Fixture',canonicalWrite:false,importable:false,results:[{attributeKey:'identity.name',status:'REQUIRES_REVIEW',value:'Fixture',citations:[]},{attributeKey:'contact.tiktok',status:'UNRESOLVED'}]}};
 const f={row,authorization:{ok:true,userId:'admin'},detail:{spotId:id,manifest:{manifestHash:'verified'},answers:{'identity.name':{claimId:'current',knowledgeState:'KNOWN_VALUE',visibility:'PUBLIC',value:'Fixture'}}},updates:[],fail:false,cas:false};
 f.service={from:()=>{
  const filters=[];let update;const q={select(){return q;},contains(k,v){filters.push(r=>Object.entries(v).every(([key,value])=>r[k]?.[key]===value));return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){return q.eq(k,v);},not(k,_op,v){filters.push(r=>r[k]!==v);return q;},order(){return q;},limit(){return q;},update(v){update=v;return q;},maybeSingle(){return Promise.resolve(run(true));},single(){return q.maybeSingle();},then(resolve,reject){return Promise.resolve(run(false)).then(resolve,reject);}};
  function run(single){if(f.fail)return {data:null,error:{message:'unavailable'}};const matches=filters.every(test=>test(row))&&!(update&&f.cas);if(update&&matches){f.updates.push(update);Object.assign(row,update);}return {data:single?(matches?structuredClone(row):null):(matches?[structuredClone(row)]:[]),error:null};}return q;
 }};f.actor={};installFixture(f);return f;
}
const request=(body)=>new Request('https://fixture.invalid/api/world-knowledge/research-drafts',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify(body)});
const complete=extra=>request({action:'complete',draftId:id,expectedManifestHash:'verified',...extra});
test('no unauthenticated or non-admin archive/list access and no writes',async()=>{
 const f=fixture();f.authorization={ok:false,status:403,error:'admin_required'};
 assert.equal((await POST(complete())).status,403);assert.equal((await GET(new Request('https://fixture.invalid'))).status,403);assert.equal(f.updates.length,0);
});
test('complete verifies persisted fields, archives only the requested report and retains audit evidence',async()=>{
 const f=fixture();const response=await POST(complete());assert.equal(response.status,200);assert.equal((await response.json()).archived,true);
 assert.ok(f.row.reviewed_at);assert.equal(f.row.reviewed_by,'admin');assert.equal(f.row.export_document.reviewReceipt.manifestHash,'verified');assert.equal(f.row.export_document.reviewReceipt.decisions[0].claimId,'current');assert.equal(f.row.result_document.results.length,2);
 assert.equal((await (await GET(new Request('https://fixture.invalid'))).json()).drafts.length,0);
 assert.equal((await (await GET(new Request('https://fixture.invalid?view=archive'))).json()).drafts.length,1);
});
test('partial/imported-some results cannot archive remaining differences; explicit KEEP is claim-bound',async()=>{
 const f=fixture();f.detail.answers['identity.name'].value='Existing name';
 let response=await POST(complete());assert.deepEqual((await response.json()).pending,['identity.name']);assert.equal(f.updates.length,0);
 response=await POST(complete({kept:{'identity.name':'old-claim'}}));assert.equal((await response.json()).archived,false);assert.equal(f.updates.length,0);
 response=await POST(complete({kept:{'identity.name':'current'}}));assert.equal((await response.json()).archived,true);assert.equal(f.row.export_document.reviewReceipt.decisions[0].outcome,'KEPT_PROFILE');
});
test('stale manifests, concurrent archive changes and storage failures cannot announce success',async()=>{
 for(const setup of [f=>{f.detail.manifest.manifestHash='changed';},f=>{f.cas=true;},f=>{f.fail=true;}]){
  const f=fixture();setup(f);const response=await POST(complete());assert.equal(response.status,409);assert.ok((await response.json()).error);assert.equal(f.row.reviewed_at,null);
 }
});
test('archive is readable and restorable, restoring never changes profile values',async()=>{
 const f=fixture();await POST(complete());const before=structuredClone(f.detail);
 const archived=await (await GET(new Request('https://fixture.invalid?draftId='+id))).json();assert.ok(archived.draft.archivedAt);assert.equal(archived.review.fields[0].covered,true);
 const response=await POST(request({action:'restore',draftId:id}));assert.equal((await response.json()).restored,true);assert.equal(f.row.reviewed_at,null);assert.deepEqual(f.detail,before);assert.ok(f.row.export_document.reviewReceipt);assert.equal(f.row.export_document.restoredBy,'admin');
});
