import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseScopedCandidates} from '../dist/nuknuk-spot-plan.js';
import {researchSpotV2,retryableResearchSourceError} from '../dist/nuknuk-agent.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
const fields=[{attributeKey:'experience.profile',...researchValueContract('experience.profile'),profileCategory:'EAT'}];
const source=text=>({id:'s1',url:'https://example.org/',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-25T20:00:00Z'});
const entity=(scope,kind,name)=>({field:'experience.profile',scope,entityKind:kind,entityName:name,propertyKey:'',valueJson:'null',blockId:'b0',belongsTo:'TARGET',applicability:'CURRENT',condition:''});
for(const name of ['Weine','Weinkarte','Wine list','Biere','Getränkekarte'])test('beverage class normalizes to the catalog service without creating bottle offers: '+name,()=>{
 const text='Unsere Weinkarte und Bierkarte bieten verschiedene Weine und Biere.';const s=source(text);const row=parseScopedCandidates({candidates:[entity('OFFER','DRINKS',name)]},s,fields,[{id:'b0',text}],0)[0];
 assert.equal(row.entityKind,'DRINKS');assert.equal(row.entityName,'Getränke');assert.equal(row.quote,text);assert.equal(row.reason,'SEMANTIC_CHECK_PENDING');assert.equal(row.normalization.originalEntityName,name);
});
test('a named bottle remains a product, not a drinks service',()=>{
 const text='Unser Wein Hausberg Pinot Noir 2023 kostet CHF 62.';const row=parseScopedCandidates({candidates:[entity('OFFER','DRINKS','Hausberg Pinot Noir')]},source(text),fields,[{id:'b0',text}],0)[0];assert.equal(row.entityName,'Hausberg Pinot Noir');assert.equal(row.reason,'MENU_PRODUCT_NOT_VISITOR_OFFER');
});
test('an evidenced dining room is an AREA, never a private celebration',()=>{
 const text='Im Stübli servieren wir feine Menüs in ruhiger Atmosphäre.';const rows=parseScopedCandidates({candidates:[entity('AREA','PRIVATE_ROOM','Stübli')]},source(text),fields,[{id:'b0',text}],0);
 assert.equal(rows.length,1);assert.equal(rows[0].scope,'AREA');assert.equal(rows[0].entityKind,'DINING_AREA');assert.equal(rows[0].entityName,'Stübli');assert.equal(rows[0].reason,'SEMANTIC_CHECK_PENDING');
 const exclusive='Unser privater Raum Stübli kann exklusiv gebucht werden.';const row=parseScopedCandidates({candidates:[entity('AREA','PRIVATE_ROOM','Stübli')]},source(exclusive),fields,[{id:'b0',text:exclusive}],0)[0];assert.equal(row.entityKind,'PRIVATE_ROOM');
});
test('socket termination and nested transport codes are retryable; permanent/policy failures are not',()=>{
 for(const error of [new Error('socket hang up'),new Error('ECONNRESET'),new Error('fetch failed',{cause:Object.assign(new Error('other side closed'),{code:'UND_ERR_SOCKET'})}),new Error('source_http_503')])assert.equal(retryableResearchSourceError(error),true,error.message);
 for(const error of [new Error('source_http_404'),new Error('source_http_401'),new Error('private_target_forbidden'),new Error('certificate_invalid')])assert.equal(retryableResearchSourceError(error),false,error.message);
});
for(const failsTwice of [false,true])test(`socket hang up makes exactly two attempts, then ${failsTwice?'records source unavailability':'continues with the source'}`,async()=>{
 let fetches=0;const events=[];
 const r=await researchSpotV2({spot:{spotId:'11111111-1111-4111-8111-111111111111',name:'Example',existingValues:{'contact.website':{value:'https://example.org/'}}},fields:[{attributeKey:'contact.phone',...researchValueContract('contact.phone')}],sources:['https://example.org/'],modelPath:'/tmp/45797d2985a12c55e6473686e9ea91b95e959553',maxRequests:4,maxModelCalls:4},{validateValue:validateAuthoringSubmission,fetchPage:async url=>{fetches++;if(fetches===1||failsTwice)throw new Error('socket hang up');return {url,body:'<main><h1>Example</h1><p>Keine weiteren Angaben verfügbar.</p></main>',contentType:'text/html',observedAt:'2026-10-25T20:00:00Z'};},modelFetch:async()=>{throw Error('unexpected model invocation');},onProgress:e=>events.push(e)});
 assert.equal(fetches,2);assert.equal(r.requests,2);assert.equal(events.filter(e=>e.stage==='SOURCE_RETRY').length,1);assert.equal(r.modelCalls,0);
 assert.equal(r.sourceFailures.length,failsTwice?1:0);assert.equal(r.sources.length,failsTwice?0:1);
 if(failsTwice){const event=events.find(e=>e.stage==='SOURCE_UNAVAILABLE');assert.equal(event.attempts,2);assert.equal(event.modelFailure,false);assert.equal(event.classification,'SOURCE_OR_TRANSPORT_UNAVAILABLE');}
});
