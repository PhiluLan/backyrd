import test from 'node:test';
import assert from 'node:assert/strict';
import {betaTrainingCases,semanticPattern} from './nuknuk-beta-training-cases.mjs';
import {betaTrainingProgram,betaSupplementalChecks} from './nuknuk-beta-training-program.mjs';
import {validateProductTrainingRows} from './nuknuk-product-training.mjs';
const rows=betaTrainingCases();
test('all synthetic targets execute through canonical validation with the commissioned inventory',()=>{
 assert.deepEqual(validateProductTrainingRows(rows).counts,{TRAIN:800,VALIDATION:200,TEST:200});
 for(const split of ['TRAIN','VALIDATION','TEST'])for(const locale of ['de','de-CH','en','fr'])assert.equal(rows.filter(r=>r.split===split&&r.locale===locale).length,split==='TRAIN'?200:50);
 assert.equal(new Set(rows.map(r=>r.familyId)).size,300);
});
test('effective dialogue edits do not leak through unrelated initial activities',()=>{
 const byPattern=new Map();
 for(const r of rows){const key=semanticPattern(r),split=byPattern.get(key);if(split)assert.equal(split,r.split,r.id);else byPattern.set(key,r.split);}
 const a=rows.find(r=>r.familyId==='beta1-dialogue-facts-lunch-duration'&&r.locale==='de');
 const b=rows.find(r=>r.familyId==='beta1-dialogue-facts-swimming-duration'&&r.locale==='de');
 assert.equal(semanticPattern(a),semanticPattern(b));assert.equal(a.split,b.split);
 const changed=structuredClone(a);changed.previousMeaning.entities.forEach(e=>e.id='new-'+e.id);
 changed.previousMeaning.facts.forEach(f=>{f.id='new-'+f.id;f.subjectIds=f.subjectIds.map(id=>'new-'+id);});
 changed.expected.changes.forEach(c=>{c.id='new-'+c.id;if(c.fact){c.fact.id='new-'+c.fact.id;c.fact.subjectIds=c.fact.subjectIds.map(id=>'new-'+id);}});
 changed.previousMeaning.facts.reverse();assert.equal(semanticPattern(a),semanticPattern(changed));
});
test('known patterns stay training-only and test includes genuine ambiguity',()=>{
 assert(rows.some(r=>r.knownFamily));assert(rows.filter(r=>r.knownFamily).every(r=>r.split==='TRAIN'));
 assert(rows.some(r=>r.split==='TEST'&&r.expected.clarification));
 assert(rows.some(r=>r.split==='TRAIN'&&r.expected.clarification));
});
test('coverage distinguishes observed weather, booking and self versus venue exclusion',()=>{
 const compact=rows.filter(r=>r.expected.meaning);
 assert(compact.some(r=>r.expected.meaning.weatherConditions.some(w=>w.role==='CONTEXT')));
 assert(compact.some(r=>r.expected.meaning.weatherConditions.some(w=>w.role==='CONDITIONAL')));
 for(const modality of ['REQUIRED','PREFERRED','NOT_REQUIRED','EXCLUDED'])assert(compact.some(r=>r.expected.meaning.facts.some(f=>f.key==='participation.booking'&&f.modality===modality)));
 for(const scope of ['AVAILABLE_TOTAL','ACTIVITY','WALKING','TRAVEL'])assert(compact.some(r=>r.expected.meaning.facts.some(f=>f.key==='time.duration'&&f.value.measurementScope===scope)));
 for(const id of ['self','a1'])assert(compact.some(r=>r.theme==='exclusion-scope'&&r.expected.meaning.facts.some(f=>f.modality==='EXCLUDED'&&f.subjectIds.includes(id))));
 assert(new Set(rows.map(r=>r.reference.now)).size>=4);
 assert(compact.some(r=>r.reference.now.startsWith('2027-01-31')&&r.expected.meaning.facts.some(f=>f.value.date==='2027-02-01')));
});
test('all material test cases are mandatory and resource allocation remains unauthorized',()=>{
 const p=betaTrainingProgram();assert.deepEqual(p.acceptance.criticalCoreCaseIds,rows.filter(r=>r.split==='TEST'&&r.critical).map(r=>r.id));
 assert(p.acceptance.criticalCoreRequiresAllListedCases);assert.equal(p.acceptance.minimumPassFractionPerLanguage,.95);
 assert.equal(p.costs.newCloudAllocationNow,false);assert.equal(p.proposedRecipe.trainingAuthorizedByThisFile,false);
 assert.match(p.executionReadiness,/BLOCKED/);assert.equal(p.independentHumanGold,false);
});
test('routing retains the museum history across every locale',()=>{
 const {routing,conversations,boundaries}=betaSupplementalChecks();assert.equal(routing.length,32);assert.equal(conversations.length,20);assert.equal(boundaries.length,24);
 for(const r of routing.filter(r=>/beta-route-[67]-/.test(r.id)))assert.match(r.currentWish,/museum|Museum|musée/);
});
test('exact dialogue answer shortcuts cannot cross splits even with different old branches',()=>{
 const splits=new Map();for(const row of rows.filter(r=>r.task==='DIALOGAKTUALISIERUNG_V3')){
  const key=JSON.stringify([row.turns,row.expected]);if(splits.has(key))assert.equal(row.split,splits.get(key),row.id);else splits.set(key,row.split);
 }
});
test('venue bans use canonical facility facts and each new protocol has teaching and transfer cases',()=>{
 for(const r of rows.filter(r=>r.theme==='exclusion-scope'&&r.familyId.endsWith('-venue')))assert(r.expected.meaning.facts.some(f=>f.key==='offer.kind'&&f.modality==='EXCLUDED'));
 const protocols=[r=>r.theme==='weather-evidence',r=>r.theme==='booking',r=>r.theme==='exclusion-scope'&&r.familyId.endsWith('-self'),r=>r.theme==='exclusion-scope'&&r.familyId.endsWith('-venue'),...['WALKING','TRAVEL'].map(scope=>r=>r.expected.meaning?.facts.some(f=>f.key==='time.duration'&&f.value.measurementScope===scope))];
 for(const match of protocols)for(const split of ['TRAIN','TEST'])assert(rows.some(r=>r.split===split&&match(r)),split);
 for(const r of rows.filter(r=>r.theme==='subgroup-scope'))for(const f of r.expected.meaning.facts.filter(f=>f.key==='people.count'&&f.subjectIds.includes('g2')))assert(f.value.amount>1);
});
