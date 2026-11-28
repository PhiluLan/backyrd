import test from 'node:test';import assert from'node:assert/strict';
import {selectForty,compareHostObservations,syntheticProbeCatalog,parseSavedMeaning,dimensionCoverage,importBindings,replayOne,sealLocalReview,verifyLocalReviewSeal}from'./beta-local-review.mjs';
import {parseProductWorldResolverBinding}from'../../../packages/decision-vnext-core/dist/product-world-resolver-binding.js';
const row=(id,stratum)=>({id,split:'DEV',family:id,theme:id,scenarioGroup:id,query:'synthetic',reference:{now:'2026-09-15T09:00:00Z',timezone:'Europe/Zurich'},task:stratum==='DIALOGUE'?'DIALOGAKTUALISIERUNG_V3':'COMPACT_SEARCH_V7',provenance:{kind:stratum==='COMPOSITION'?'INDIVIDUALLY_AUTHORED_SYNTHETIC_COMPOSITION':'BLUEPRINT'}});
test('frozen selection includes all regressions, forty unique DEV IDs and no held-out TEST',()=>{
 const cases=[...Array.from({length:10},(_,n)=>row('reg'+n,'BLUEPRINT')),...Array.from({length:10},(_,n)=>row('gain'+n,'BLUEPRINT')),...Array.from({length:12},(_,n)=>row('composition'+n,'COMPOSITION')),...Array.from({length:12},(_,n)=>row('dialogue'+n,'DIALOGUE')), {...row('secret-test','COMPOSITION'),split:'TEST'}];
 const comparison={comparison:{regressions:cases.slice(0,10).map(r=>r.id),improvements:cases.slice(10,20).map(r=>r.id)}};
 const selected=selectForty({cases},comparison);assert.equal(selected.length,40);assert.equal(new Set(selected.map(r=>r.id)).size,40);assert(!selected.some(r=>r.id==='secret-test'));assert.deepEqual(selected.filter(r=>r.bucket==='REGRESSION').map(r=>r.id).sort(),comparison.comparison.regressions.sort());assert.deepEqual(selectForty({cases:[...cases].reverse()},comparison),selected);
});
test('empty identical results never prove equivalence; differences and errors remain visible',()=>{
 const empty={signature:{candidates:[],primaryCandidateId:null}};assert.equal(compareHostObservations(empty,empty).state,'NO_POSITIVE_WITNESS');assert.equal(compareHostObservations(empty,empty).equivalenceProven,false);
 const good={signature:{candidates:[{spotId:'a',rank:1}]}};assert.equal(compareHostObservations(good,good).state,'SAME_ON_SYNTHETIC_PROBES');assert.equal(compareHostObservations(good,good).equivalenceProven,false);
 assert.equal(compareHostObservations(good,empty).state,'OBSERVED_HOST_DIFFERENCE');assert.equal(compareHostObservations(good,{error:'invalid'}).state,'VALIDATION_OR_HOST_ERROR');assert.equal(compareHostObservations({error:'bad-gold'},good).errorAttribution,'GOLD_OR_HARNESS_REQUIRES_REVIEW');assert.equal(compareHostObservations(good,{error:'invalid'}).errorAttribution,'CANDIDATE_VALIDATION_OR_HOST');
});
test('probe worlds validate and cover actual price, age and day counterexamples',()=>{
 const worlds=syntheticProbeCatalog(row('probe','BLUEPRINT').reference);assert.equal(worlds.length,105);for(const world of worlds)parseProductWorldResolverBinding(world,'Basel');
 const profiles=worlds.flatMap(w=>w.decisionProjection.facts.filter(f=>f.key==='experience.profile').map(f=>f.value));assert(profiles.some(p=>p.offers.some(o=>o.prices.some(p=>p.max===65))));assert(profiles.some(p=>p.offers.some(o=>o.validFrom)));assert(profiles.some(p=>p.offers.length>1));assert(worlds.some(w=>w.decisionProjection.facts.some(f=>f.key==='rule.age_access'&&f.value.minimumAge===6)));
});
test('dialogue replay preserves the canonical invalid-patch rejection',()=>{assert.throws(()=>parseSavedMeaning({...row('dialogue','DIALOGUE'),previousMeaning:{facts:[]},turns:[{question:null,answer:'Morgen'}]},{}));});

test('case IDs that could escape the report directory are rejected before replay',()=>{const cases=Array.from({length:10},(_,n)=>row(n?'reg'+n:'../escape','BLUEPRINT'));assert.throws(()=>selectForty({cases},{comparison:{regressions:cases.map(r=>r.id),improvements:[]}}),/unsafe_case_id/);});

test('transitively imported source mutation invalidates its binding',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const{tmpdir}=await import('node:os');const{join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'nuknuk-import-proof-'));
 try{await writeFile(join(dir,'entry.mjs'),"export {value} from './dependency.mjs';");await writeFile(join(dir,'dependency.mjs'),'export const value=1;');const before=await importBindings(join(dir,'entry.mjs'));await writeFile(join(dir,'dependency.mjs'),'export const value=2;');const after=await importBindings(join(dir,'entry.mjs'));assert.notEqual(before[join(dir,'dependency.mjs')],after[join(dir,'dependency.mjs')]);}finally{await rm(dir,{recursive:true,force:true});}
});
const entity=(id,kind='ACTIVITY')=>({id,kind,label:id,members:[]});
const f=(id,key,value,modality='REQUIRED',subjectIds=['a'])=>({id,key,value:typeof value==='string'?{text:value}:value,modality,basis:'EXPLICIT',subjectIds});
const raw=facts=>({meaning:{entities:[entity('a')],facts}});
async function replay(text,payload){const r={...row('host-control','BLUEPRINT'),query:text};return replayOne(r,payload,syntheticProbeCatalog(r.reference));}
const rankedIds=result=>new Set(result.search?.ranked.map(r=>r.spotId)??[]);
test('actual host excludes over-budget probe offers when only amount changes',async()=>{
 const make=n=>raw([f('coffee','food.drink','coffee'),f('money','budget.maximum',{amount:n,operator:'LTE',currency:'CHF'}),f('scope','budget.scope',{scope:'PER_PERSON'},'CONTEXT')]);
 const enough=await replay('Kaffee bis31 Franken pro Person.',make(31)),tooLittle=await replay('Kaffee bis9 Franken pro Person.',make(9));assert(!enough.error,JSON.stringify(enough));assert(!tooLittle.error,JSON.stringify(tooLittle));assert(rankedIds(enough).size>0);assert.equal(rankedIds(tooLittle).size,0);
});
test('actual host changes valid-day offers when only visit date changes',async()=>{
 const make=date=>raw([f('coffee','food.drink','coffee'),f('date','time.date',{date,operator:'EQ',timezone:'Europe/Zurich'})]);
 const today=await replay('Heute Kaffee trinken.',make('2026-09-15')),tomorrow=await replay('Morgen Kaffee trinken.',make('2026-09-16'));assert(!today.error);assert(!tomorrow.error);assert(rankedIds(today).size>0);assert(rankedIds(tomorrow).size>0);assert.notDeepEqual([...rankedIds(today)].sort(),[...rankedIds(tomorrow)].sort());
});
test('actual host preserves outdoor options for a preference and excludes them for a requirement',async()=>{
 const make=modality=>raw([f('coffee','food.drink','coffee'),f('inside','offer.area','indoor',modality)]);
 const hard=await replay('Kaffee zwingend drinnen.',make('REQUIRED')),soft=await replay('Kaffee, drinnen wäre schön.',make('PREFERRED'));assert(!hard.error);assert(!soft.error);assert(rankedIds(hard).size>0);assert(rankedIds(soft).size>rankedIds(hard).size);
});
test('actual host applies the verified minimum age when only child age changes',async()=>{
 const make=age=>({meaning:{entities:[entity('a'),entity('child','PERSON')],facts:[f('visit','experience.activity','open_discovery'),f('kin','people.relationship','child','CONTEXT',['child']),f('age','people.age',{amount:age,operator:'EQ',unit:'YEARS'},'CONTEXT',['child'])]}});
 const four=await replay('Mit meinem4 jährigen Kind etwas unternehmen.',make(4)),eight=await replay('Mit meinem8 jährigen Kind etwas unternehmen.',make(8));assert(!four.error,JSON.stringify(four));assert(!eight.error,JSON.stringify(eight));assert(rankedIds(four).size>0);assert(rankedIds(eight).size>rankedIds(four).size);
});

test('result closure detects changes to a replay or annotation artifact',async()=>{
 const{mkdtemp,writeFile,rm}=await import('node:fs/promises');const{tmpdir}=await import('node:os');const{join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'nuknuk-review-seal-'));
 try{await writeFile(join(dir,'manifest.json'),'{}');await writeFile(join(dir,'case.json'),'{}');await writeFile(join(dir,'engineering-review.json'),'{}');await sealLocalReview(dir);assert.equal(await verifyLocalReviewSeal(dir),true);await writeFile(join(dir,'engineering-review.json'),'{"changed":true}');await assert.rejects(()=>verifyLocalReviewSeal(dir),/result_changed:engineering-review/);}finally{await rm(dir,{recursive:true,force:true});}
});

test('an unrelated positive result is not dimension evidence for atmosphere',()=>{
 const coverage=dimensionCoverage({meaning:{facts:[{id:'noise',key:'atmosphere.character',modality:'PREFERRED'}]},search:{ranked:[{facts:[{factId:'noise',state:'UNKNOWN'}]}],excluded:[],unresolved:[]}});assert.equal(coverage.atmosphere.state,'WITNESS_MISSING_OR_PARTIAL');
 const budget=dimensionCoverage({meaning:{facts:[{id:'money',key:'budget.maximum',modality:'REQUIRED'}]},search:{ranked:[{facts:[{factId:'money',state:'MET'}]}],excluded:[{facts:[{factId:'money',state:'FAILED'}]}],unresolved:[]}});assert.equal(budget.budget.state,'CONTRASTING_HOST_ASSESSMENTS');
});
