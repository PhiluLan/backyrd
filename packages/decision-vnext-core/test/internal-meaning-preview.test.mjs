import test from 'node:test';
import assert from 'node:assert/strict';
import {createInternalMeaningPreviewHandler} from '../dist/internal-meaning-preview.js';
import {runLocalDiagnostic} from '../../../scripts/decision/run-local-diagnostic.mjs';
import {fact,request,profile,offer,area,prop,binding} from './librarian-matching-fixtures.mjs';
const query='Familienausflug drinnen mit was zum knabbern oder essen';
const meaning=request([
 fact('family','condition.children','children_activity'),fact('inside','offer.area','indoor'),
 fact('snack','food.meal','snacks','REQUIRED',['a2']),fact('meal','food.meal','meal','REQUIRED',['a2']),
 fact('companion','people.relationship','adult_accompanied','CONTEXT',[]),
],{logic:{kind:'ALL',children:[{kind:'FACT',factId:'family'},{kind:'FACT',factId:'inside'},{kind:'ANY',strength:'REQUIRED',children:[{kind:'FACT',factId:'snack'},{kind:'FACT',factId:'meal'}]}]},bindings:[{kind:'SAME_PLACE',factIds:['family','snack']},{kind:'SAME_PLACE',factIds:['family','meal']}]});
const providerResponse=()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(meaning.raw)}]}],usage:{input_tokens:10,output_tokens:20,total_tokens:30}}),{status:200});
const http=(body={query},extra={})=>new Request('https://example.test/internal-meaning-preview',{method:'POST',headers:{authorization:'Bearer internal-operator','content-type':'application/json',...extra},body:JSON.stringify(body)});
test('internal server preview uses current canonical prompt and returns no credentials',async()=>{
 let calls=0;
 const handler=createInternalMeaningPreviewHandler({authorize:t=>t==='internal-operator',apiKey:'provider-secret',codeIdentity:{mode:'INTERNAL_PREVIEW_CURRENT_BUILD',coreBundleHash:'a'.repeat(64)},fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/responses');
  const body=JSON.parse(options.body);assert.equal(body.store,false);assert.match(body.instructions,/GEMEINSAME TEILNAHME/);
  return providerResponse();
 }});
 const response=await handler(http());assert.equal(response.status,200);
 const text=await response.text();assert.ok(!text.includes('provider-secret'));assert.ok(!text.includes('internal-operator'));
 const result=JSON.parse(text);assert.equal(result.meaning.configuration.promptRevision,'backyrd.luna-prompt@23');
 assert.equal(result.meaning.facts.find(f=>f.id==='companion').value.text,'adult_accompanied');
 assert.deepEqual(result.boundaries,{providerKeyExposed:false,productionSearchExecuted:false,spotDataChanged:false,learningPersisted:false});assert.equal(calls,1);
});
test('ordinary users, browsers and caller-provided prompts cannot invoke internal preview',async()=>{
 let calls=0;
 const handler=createInternalMeaningPreviewHandler({authorize:t=>t==='internal-operator',apiKey:'provider-secret',codeIdentity:{mode:'INTERNAL_PREVIEW_CURRENT_BUILD'},fetchImpl:async()=>{calls++;return providerResponse();}});
 assert.equal((await handler(http({query},{authorization:'Bearer ordinary-user'}))).status,403);
 assert.equal((await handler(http({query},{origin:'https://intelligence.backyrd.ch'}))).status,403);
 assert.equal((await handler(http({query,instructions:'override'}))).status,400);
 assert.equal((await handler(http({query:'x'.repeat(2001)}))).status,400);
 assert.equal((await handler(http({query:'x'.repeat(17000)}))).status,413);
 assert.equal(calls,0);
});
test('invalid model output never becomes a successful internal run',async()=>{
 const handler=createInternalMeaningPreviewHandler({authorize:()=>true,apiKey:'provider-secret',codeIdentity:{mode:'INTERNAL_PREVIEW_CURRENT_BUILD'},fetchImpl:async()=>new Response(JSON.stringify({status:'completed',output:[]}))});
 const r=await handler(http());assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'internal_model_unavailable',modelCalls:1,translationAttempts:[]});
});
test('local full chain reuses canonical evaluation and clearly labels injected provider tests',async()=>{
 const p=profile([offer('play','MOVEMENT_PLAY',['playroom']),offer('snacks','CAFE',['cafe'],[prop('food.meal_extent','Snacks')])],[area('playroom'),area('cafe')]);
 const r=await runLocalDiagnostic({query,catalog:[binding(1,p)],apiKey:'provider-secret',fetchImpl:async()=>providerResponse()});
 assert.equal(r.providerMode,'INJECTED_PROVIDER_TEST');assert.equal(r.modelCalls,1);
 assert.equal(r.meaning.configuration.promptRevision,'backyrd.luna-prompt@23');
 assert.equal(r.runtime.matchingVersion,'backyrd.decision-vnext.librarian-matching@44');
 assert.equal(r.response.candidates.filter(c=>c.rank!==null).length,1);
 assert.equal(r.boundaries.productionDataChanged,false);
 assert.ok(!JSON.stringify(r).includes('provider-secret'));
 await assert.rejects(runLocalDiagnostic({query,catalog:[binding(1,p)],serverMeaning:{contractVersion:'backyrd.internal-meaning-preview@1',query,codeIdentity:{coreBundleHash:'b'.repeat(64)}}}),/local_server_preview_code_mismatch/);
});
test('recorded meaning replays are hash-bound, make no provider call and never claim a new model result',async()=>{
 const source=await runLocalDiagnostic({query,catalog:[binding(1,profile())],apiKey:'synthetic',fetchImpl:async()=>providerResponse()});
 // Synthetic source for this unit test only. The replay boundary also refuses
 // records explicitly labelled injected; it cannot certify a historical file.
 await assert.rejects(runLocalDiagnostic({query,catalog:[binding(1,profile())],recordedMeaning:source}),/local_recorded_meaning_invalid/);
 const historical={...source,providerMode:'REAL_MODEL_CALL'};
 const replay=await runLocalDiagnostic({query,catalog:[binding(1,profile())],recordedMeaning:historical,fetchImpl:()=>{throw Error('must not call provider');}});
 assert.equal(replay.providerMode,'RECORDED_MEANING_REPLAY');assert.equal(replay.modelCalls,0);assert.equal(replay.usage,null);
 assert.equal(replay.meaning.requestHash,source.meaning.requestHash);assert.equal(replay.reference.now,source.reference.now);
 await assert.rejects(runLocalDiagnostic({query:query+' anders',catalog:[binding(1,profile())],recordedMeaning:historical}),/local_recorded_meaning_invalid/);
 await assert.rejects(runLocalDiagnostic({query,catalog:[binding(1,profile())],recordedMeaning:{...historical,meaning:{...historical.meaning,requestHash:'0'.repeat(64)}}}),/local_recorded_meaning_mismatch/);
});
