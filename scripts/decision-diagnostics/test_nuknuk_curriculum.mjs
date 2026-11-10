import assert from 'node:assert/strict';
import {round4Specs} from './nuknuk-round4-cases.mjs';
import {makeInterpretation} from './nuknuk-pilot-authoring.mjs';
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
