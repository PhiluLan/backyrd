import {compactFixture} from './compact-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateMeaningCorpus} from './meaning-evaluation.mjs';
const meaning={summary:'Ein Café suchen.',activities:[{id:'A1',description:'Café besuchen',status:'REQUESTED',alternativeGroup:null,condition:null,afterActivityId:null,replacesActivityId:null,evidence:['E1']}],participants:[],constraints:[],uncertainties:[]};
const corpus={cases:[{id:'fixture1',text:'Ein Café suchen.',expected:'Private test oracle must not reach model.'}]};
const fetchImpl=async(url,options)=>{assert.ok(!options.body.includes(corpus.cases[0].expected));const body=JSON.parse(options.body);assert.deepEqual(JSON.parse(body.input),{request:corpus.cases[0].text});assert.equal(body.text.format.name,'backyrd_compact_meaning_v1');assert.equal(body.max_output_tokens,3600);return{ok:true,json:async()=>({status:'completed',usage:{input_tokens:100,output_tokens:100,input_tokens_details:{cached_tokens:0}},output:[{content:[{type:'output_text',text:JSON.stringify(compactFixture(meaning))}]}]})};};
test('meaning evaluation distinguishes transport contract from semantic quality',async()=>{const result=await evaluateMeaningCorpus({corpus,apiKey:'fixture',fetchImpl});assert.equal(result.results[0].status,'VALID_CONTRACT');assert.equal(result.semanticReview,'NOT_REVIEWED');assert.equal(result.providerCalls,1);});
test('usage failure stops subsequent calls honestly',async()=>{let calls=0;const result=await evaluateMeaningCorpus({corpus:{cases:[...corpus.cases,{...corpus.cases[0],id:'fixture2'}]},apiKey:'fixture',fetchImpl:async()=>{calls++;return{ok:true,json:async()=>({status:'completed'})};}});assert.equal(calls,1);assert.equal(result.stopReason,'USAGE_INVALID');assert.equal(result.results[1].status,'NOT_RUN');});
test('limits fail before provider dispatch',async()=>{let called=0;const result=await evaluateMeaningCorpus({corpus,apiKey:'fixture',maxEstimatedCostUsd:.001,fetchImpl:async()=>{called++;throw Error('must not call')}});assert.equal(called,0);assert.equal(result.results[0].status,'ERROR');assert.equal(result.stopReason,'LIMIT');});
test('duplicate corpus ids rejected before provider',async()=>{await assert.rejects(evaluateMeaningCorpus({corpus:{cases:[...corpus.cases,...corpus.cases]},apiKey:'fixture',fetchImpl}),/corpus_invalid/);});

test('an independent checklist and fixed server clock stay out of provider inputs',async()=>{
 const expected=['Private untouched oracle one','Private untouched oracle two'];const serverTime='2026-10-12T12:00:00.000Z';
 const result=await evaluateMeaningCorpus({corpus:{cases:[{...corpus.cases[0],expected}]},apiKey:'fixture',serverTime,fetchImpl:async(url,o)=>{for(const item of expected)assert.ok(!o.body.includes(item));assert.ok(!o.body.includes(serverTime));return fetchImpl(url,o);}});
 assert.equal(result.results[0].status,'VALID_CONTRACT');assert.equal(result.evaluationServerTime,serverTime);
});
for(const input of [{expected:[]},{expected:['ok',null]},{expected:42}])test('reject malformed independent rubric '+JSON.stringify(input),async()=>{await assert.rejects(evaluateMeaningCorpus({corpus:{cases:[{...corpus.cases[0],...input}]},apiKey:'fixture',fetchImpl}),/corpus_invalid/);});
test('invalid evaluation clock fails before any provider request',async()=>{await assert.rejects(evaluateMeaningCorpus({corpus,apiKey:'fixture',serverTime:'invalid',fetchImpl}),/configuration_invalid/);});
