import test from 'node:test';
import assert from 'node:assert/strict';
import {LUNA_MEANING_ROLE_CONTRACT,inspectLunaMeaning,assertLunaMeaningCorrection} from '../dist/product-luna-meaning-contract.js';
import {createDecisionProductLunaProvider} from '../dist/product-luna-provider.js';
import {LIBRARIAN_FAMILY_STRATEGIES} from '../dist/product-librarian-language.js';
import {fact,request as plan,profile,offer,area,prop,binding} from './librarian-matching-fixtures.mjs';
import {exercise} from './librarian-active-route-fixtures.mjs';
const raw=(key,value='animals')=>structuredClone(plan([fact('want',key,value)]).raw);
const response=output=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]}));
const req={contractVersion:'backyrd.decision-vnext.product-request@1.0',requestId:'r',idempotencyKey:'i',naturalLanguage:'Familientag, meine Tochter will was mit Tieren.',explicit:{},alternativeRequested:false,previouslyPresentedCandidateIds:[],rejectedCandidateIds:[]};
const provide=(outputs,onTranslationAttempt)=>{
 let calls=0;
 const provider=createDecisionProductLunaProvider({apiKey:'synthetic',onTranslationAttempt,fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.store,false);
  if(calls===1){const correction=JSON.parse(body.input);assert.equal(correction.originalRequest.request,req.naturalLanguage);assert.deepEqual(correction.previousMeaning,outputs[0]);}
  return response(outputs[calls++]);
 }});
 return {run:()=>provider(req,{},new AbortController().signal),calls:()=>calls};
};
test('every advertised concept destination has an executable family strategy',()=>{
 assert.ok(Object.keys(LUNA_MEANING_ROLE_CONTRACT.rules).length>60);
 for(const [concept,families] of Object.entries(LUNA_MEANING_ROLE_CONTRACT.rules))for(const key of families)assert.notEqual(LIBRARIAN_FAMILY_STRATEGIES[key],'UNSUPPORTED',`${concept}: ${key}`);
});
for(const [value,bad,good] of [
 ['animals','condition.animals','experience.activity'],['climbing','condition.children','experience.activity'],
 ['cozy','experience.activity','atmosphere.character'],['conversation','experience.character','atmosphere.conversation'],
 ['own_food','condition.animals','participation.permission'],['indoor','experience.activity','offer.area'],
 ['snacks','condition.children','food.meal'],['playground','condition.animals','offer.feature'],
 ['vegan','experience.activity','food.diet'],['spontaneous','experience.activity','participation.booking'],
])test(`concept-role guard and bounded correction: ${value}`,async()=>{
 const before=raw(bad,value),after=raw(good,value);
 const issues=inspectLunaMeaning(before);assert.equal(issues[0].code,'CONCEPT_FAMILY_MISMATCH');
 assert.deepEqual(inspectLunaMeaning(after),[]);
 assert.doesNotThrow(()=>assertLunaMeaningCorrection(before,after,issues));
 const attempts=[];const p=provide([before,after],a=>attempts.push(a));
 const result=await p.run();assert.equal(p.calls(),2);assert.deepEqual(result.raw,after);
 assert.deepEqual(attempts.map(a=>a.issues.length),[1,0]);assert.deepEqual(attempts[0].output,before);
});
test('already valid output stays unchanged and needs only one call',async()=>{
 const output=raw('experience.activity');const p=provide([output]);assert.deepEqual((await p.run()).raw,output);assert.equal(p.calls(),1);
});
test('a correction may not remove, soften, negate, narrow or move the wish to another person',async()=>{
 for(const mutate of [o=>o.facts.pop(),o=>o.facts[0].modality='PREFERRED',o=>o.facts[0].modality='EXCLUDED',o=>o.facts[0].value.text='zoo',o=>o.facts[0].subjectIds=[]]){
  const before=raw('condition.animals'),after=raw('experience.activity');mutate(after);
  const p=provide([before,after]);await assert.rejects(p.run(),/product_luna_understanding_unresolved/);assert.equal(p.calls(),2);
 }
});
test('unknown animal rules and pet admission never become an animal-observation activity',async()=>{
 for(const text of ['Hund mitbringen','kein Tierkontakt','nur artgerechte Tierhaltung']){
  const output=raw('condition.animals',text);assert.equal(inspectLunaMeaning(output)[0].code,'UNSUPPORTED_REQUIREMENT');
  const p=provide([output]);await assert.rejects(p.run(),/product_luna_understanding_unresolved/);assert.equal(p.calls(),1);
 }
});
test('still invalid correction stops after two calls without searching or claiming zero matches',async()=>{
 let calls=0;
 const output=raw('condition.animals');
 const r=await exercise({text:req.naturalLanguage,meaning:plan([fact('want','condition.animals','animals')]),catalog:[binding(1,profile())],fetchImpl:async()=>{calls++;return response(output);}});
 assert.equal(calls,2);assert.equal(r.reads,0);assert.equal(r.status,503);assert.match(r.body.error.message,/zuverlässig zugeordnet/);
});
test('both formerly divergent representations reach identical eligibility through the real provider boundary',async()=>{
 const catalog=[binding(1,profile([offer('animals','ANIMAL_OBSERVATION')],[area()],'ZOO'))];
 const results=[];
 for(const key of ['experience.activity','condition.animals']){
  let calls=0;const output=raw(key);
  const r=await exercise({text:req.naturalLanguage,meaning:plan([fact('want',key,'animals')]),catalog,fetchImpl:async()=>response(calls++===0?output:raw('experience.activity'))});
  assert.equal(r.status,200,JSON.stringify(r.body));results.push(r.body.candidates.filter(c=>c.rank!==null).map(c=>c.spotId));
 }
 assert.ok(results[0].length);assert.deepEqual(results[0],results[1]);
});
