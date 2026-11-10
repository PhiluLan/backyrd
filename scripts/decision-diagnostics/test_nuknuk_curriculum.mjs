import assert from 'node:assert/strict';
import {round4Specs} from './nuknuk-round4-cases.mjs';
import {makeInterpretation} from './nuknuk-pilot-authoring.mjs';
import {cleanRound5Training,validateRound5Specs} from './nuknuk-round5-cases.mjs';
import {round5EvaluationSpecs} from './nuknuk-round5-evaluation-cases.mjs';
const rows=round4Specs(),groups=new Map(),queries=new Set();
assert.deepEqual(Object.fromEntries(['TRAIN','VALIDATION','TEST'].map(split=>[split,rows.filter(r=>r.split===split).length])),{TRAIN:2000,VALIDATION:100,TEST:300});
for(const row of rows){assert(!queries.has(row.query),row.id);queries.add(row.query);if(groups.has(row.scenarioGroup))assert.equal(groups.get(row.scenarioGroup),row.split);groups.set(row.scenarioGroup,row.split);makeInterpretation(row,row);}
assert.equal(groups.size,90);
for(const row of rows.filter(r=>/NOT_REQUIRED/.test(JSON.stringify(r.facts))))assert(row.facts.some(f=>f.modality==='NOT_REQUIRED'));
const combined=rows.find(r=>r.id==='r4-train-logic-1-1');assert.equal(combined.logic.kind,'ALL');assert.equal(combined.logic.children[0].kind,'ANY');
const total=rows.find(r=>r.id==='r4-train-budget-1-1');assert(total.facts.some(f=>f.key==='budget.scope'&&f.value.scope==='GROUP_TOTAL'));
const neither=rows.find(r=>r.id==='r4-train-polarity-1-1');assert.equal(neither.facts.find(f=>f.key==='food.meal').modality,'NOT_REQUIRED');
const tomorrow=rows.find(r=>r.id==='r4-train-time-1-1');assert(tomorrow.facts.some(f=>f.key==='time.date'));
const revised=rows.find(r=>r.id==='r4-train-revision-1-1');assert.equal(revised.facts.length,1);assert(!revised.facts.some(f=>f.modality==='EXCLUDED'));
console.log('Curriculum partitions, key contrasts and canonical targets verified; no model-quality assertion.');

const contrasts=validateRound5Specs();
const byId=id=>contrasts.find(r=>r.id===`r5-train-${id}`);
const has=(row,key,modality)=>row.facts.some(f=>f.key===key&&(!modality||f.modality===modality));
// Semantic counterfactuals: correlated concepts must not introduce new duties.
assert(has(byId('area-1'),'offer.area','PREFERRED'));
assert(!has(byId('area-1'),'atmosphere.noise'));
assert(!has(byId('area-2'),'atmosphere.noise'));
assert(has(byId('area-5'),'atmosphere.conversation','REQUIRED'));
assert(!has(byId('area-5'),'atmosphere.noise','REQUIRED'));
assert(has(byId('food_permission-1'),'participation.permission','REQUIRED'));
assert(!has(byId('food_permission-1'),'food.delivery'));
assert(has(byId('dog-3'),'participation.permission'));
assert(!has(byId('dog-3'),'condition.animals'));
assert(has(byId('booking-1'),'participation.booking','REQUIRED'));
assert(has(byId('booking-2'),'participation.booking','NOT_REQUIRED'));
assert(!has(byId('occasion-1'),'experience.activity'));
assert(has(byId('occasion-2'),'experience.activity','REQUIRED'));
assert(byId('composition-1').sequence);
assert(!byId('composition-2').sequence);
assert(!byId('composition-5').bindings);
assert(!byId('budget-6').facts.some(f=>f.key==='budget.maximum'));
assert(!has(byId('revision-8'),'participation.permission'));

const parentCases=[makeInterpretation(rows.find(r=>r.id==='r4-train-intent-3-1'),rows.find(r=>r.id==='r4-train-intent-3-1')),
 makeInterpretation(rows.find(r=>r.split==='TEST'),rows.find(r=>r.split==='TEST'))];
const parent={version:'backyrd.nuknuk-understanding-dataset@1',cases:parentCases,splitPlan:parentCases.map(({scenarioGroup,split})=>({scenarioGroup,split}))};
const frozenParent=structuredClone(parent),cleaned=cleanRound5Training(parent);
assert.deepEqual(parent,frozenParent,'Cleaning must not mutate the frozen parent');
assert.equal(cleaned.dataset.cases.length,1);
assert.equal(cleaned.excluded.length,1);
assert.equal(cleaned.corrections.length,1);
assert.equal(cleaned.dataset.cases[0].reviews.length,0,'Changed targets need fresh review');
assert.notEqual(cleaned.dataset.cases[0].contentHash,parentCases[0].contentHash);
assert.equal(cleaned.dataset.cases[0].content.target.meaning.facts.at(-1).key,'atmosphere.conversation');
const invalidParent=structuredClone(parent);
invalidParent.cases[0].content.target.meaning.facts.at(-1).value.text='unexpected';
assert.throws(()=>cleanRound5Training(invalidParent),/parent_mismatch/,'Unknown parent targets must not be silently replaced');
const exposedQueries=new Set(rows.filter(r=>r.split!=='TRAIN').map(r=>r.query));
assert(!contrasts.some(r=>exposedQueries.has(r.query)),'Old evaluation queries must not be copied to new training');
console.log('Targeted contrast semantics, frozen-parent preservation, review invalidation and exposed-case exclusion verified.');
const fresh=round5EvaluationSpecs();
assert.equal(fresh.filter(r=>r.split==='VALIDATION').length,16);
assert.equal(fresh.filter(r=>r.split==='TEST').length,24);
const knownQueries=new Set([...rows,...contrasts].map(r=>r.query));
for(const spec of fresh){assert(!knownQueries.has(spec.query));knownQueries.add(spec.query);makeInterpretation(spec,spec);}
assert(fresh.filter(r=>r.split==='TEST').some(r=>r.sequence&&r.bindings));
console.log('Fresh composition references validate; no evaluated old query copied, no model answers used.');
