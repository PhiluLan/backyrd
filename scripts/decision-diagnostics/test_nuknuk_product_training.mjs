import test from 'node:test';
import assert from 'node:assert/strict';
import {productTrainingCases} from './nuknuk-product-training-cases.mjs';
import {validateProductTrainingRows} from './nuknuk-product-training.mjs';

test('current Product targets pass the installed compact and atomic-dialogue boundaries',()=>{
 const inventory=validateProductTrainingRows(productTrainingCases());
 assert.deepEqual(inventory.counts,{TRAIN:113,VALIDATION:15,TEST:16});
 assert.equal(inventory.scenarioGroups.TRAIN,18);
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
