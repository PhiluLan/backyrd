import test from 'node:test';
import assert from 'node:assert/strict';
import {productTrainingCases} from './nuknuk-product-training-cases.mjs';
import {validateProductTrainingRows} from './nuknuk-product-training.mjs';

test('current Product targets pass the installed compact and atomic-dialogue boundaries',()=>{
 const inventory=validateProductTrainingRows(productTrainingCases());
 assert.deepEqual(inventory.counts,{TRAIN:121,VALIDATION:15,TEST:16});
 assert.equal(inventory.scenarioGroups.TRAIN,19);
});
test('related family cannot leak across train and evaluation',()=>{
 const rows=productTrainingCases();rows.find(r=>r.split==='TRAIN').split='VALIDATION';
 assert.throws(()=>validateProductTrainingRows(rows),/group_leakage|known_case_in_evaluation/);
});
test('repeated examples do not inflate the inventory',()=>{
 const rows=productTrainingCases();rows.push({...structuredClone(rows[0]),id:'other-id'});
 assert.throws(()=>validateProductTrainingRows(rows),/duplicate_input/);
});
test('a syntactically valid but inverted money target is rejected before export',()=>{
 const rows=productTrainingCases();
 const row=rows.find(r=>r.query==='Gemütlich essen, möglichst unter 30 Franken pro Person.');
 row.expected.meaning.facts.find(f=>f.key==='budget.maximum').value.operator='GTE';
 assert.throws(()=>validateProductTrainingRows(rows),/budget|money/i);
});
test('an atomic dialogue edit needs a literal source quotation',()=>{
 const rows=productTrainingCases(),row=rows.find(r=>r.task==='DIALOGAKTUALISIERUNG_V3');
 row.expected.changes[0].quote='Ein erfundenes Zitat';
 assert.throws(()=>validateProductTrainingRows(rows),/evidence|citation|removal/i);
});
test('unknown task cannot enter the current profile by omission',()=>{
 const rows=productTrainingCases();rows[0].task='RETIRED_TASK';
 assert.throws(()=>validateProductTrainingRows(rows),/task_invalid/);
});

test('founder case-14 paraphrase is retention and cannot become fresh evaluation',()=>{
 const rows=productTrainingCases();
 const row=rows.find(r=>r.scenarioGroup==='known-14-dish-alternative');
 assert.equal(row.split,'TRAIN');row.split='VALIDATION';
 assert.throws(()=>validateProductTrainingRows(rows),/known_case_in_evaluation/);
});

test('known subgroup targets teach counts and explicit membership, without broadening the diet to all diners',()=>{
 const rows=productTrainingCases().filter(r=>r.scenarioGroup==='known-numeric-subgroups');
 assert.equal(rows.length,8);
 for(const r of rows){
  const m=r.expected.meaning;assert.equal(r.split,'TRAIN');
  assert.deepEqual(m.entities.find(e=>e.id==='g1').members,['g2']);
  assert.equal(m.facts.filter(f=>f.key==='people.count').length,2);
  const requirement=m.facts.find(f=>['food.diet','food.drink'].includes(f.key)&&f.subjectIds.includes('g2'));
  assert(requirement);assert.deepEqual(requirement.subjectIds,['g2']);
 }
});
test('recipient and duration correction targets retain the previously missing meaning',()=>{
 const rows=productTrainingCases();
 for(const r of rows.filter(r=>/als Geschenk/.test(r.query))){
  assert(r.expected.meaning.facts.some(f=>f.key==='people.role'&&f.value.text==='recipient'&&f.subjectIds.includes('p1')),r.id);
  assert(r.expected.meaning.facts.some(f=>f.key==='experience.occasion'&&f.value.text==='Geschenk'),r.id);
 }
 const duration=rows.find(r=>r.id.endsWith('dialogue-duration-change'));
 assert.equal(duration.expected.changes[0].fact.value.measurementScope,'AVAILABLE_TOTAL');
});
