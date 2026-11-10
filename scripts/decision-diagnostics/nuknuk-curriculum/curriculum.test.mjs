import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
import {assemble,approveSnapshot,selectLegacy} from './build.mjs';
import {matchingProbes} from './probes.mjs';
import {trainingSpecs} from './train.mjs';
import {materialize} from './authoring.mjs';
const prepared=await assemble();
const row=id=>prepared.fresh.find(r=>r.id===id);
const facts=id=>row(id).content.target.meaning.facts;
test('new corpus has fixed group-separated inventories, never historical evaluation queries',()=>{
 assert.equal(prepared.fresh.length,512);assert.deepEqual(prepared.report.counts.fresh,{TRAIN:368,VALIDATION:56,TEST:88});
 assert.equal(prepared.report.counts.newScenarioGroups,72);assert.deepEqual(prepared.report.exposedQueryCollisions,[]);
 for(const group of new Set(prepared.full.cases.map(r=>r.scenarioGroup)))assert.equal(new Set(prepared.full.cases.filter(r=>r.scenarioGroup===group).map(r=>r.split)).size,1);
 assert.equal(prepared.report.counts.balanced.TRAIN,624);
 assert.equal(prepared.report.counts.legacySelected,256);
});
test('no absent child age, invented quietness, category from specialness or passed-exam claim',()=>{
 for(const id of ['solid-grown-children-4','solid-young-family-6','solid-code-switch-5'])assert(!facts(id).some(f=>f.key==='people.age'));
 assert(!facts('solid-celebration-1').some(f=>f.key==='offer.kind'||f.key==='budget.maximum'));
 assert.equal(facts('solid-celebration-1').find(f=>f.key==='experience.character').modality,'PREFERRED');
 assert(!facts('solid-care-4').some(f=>f.value.text?.includes('geschafft')));
 assert.equal(facts('solid-coffee-specific-8').find(f=>f.key==='atmosphere.noise').modality,'NOT_REQUIRED');
 assert(facts('solid-skills-6').some(f=>f.value.text==='Schwimmbahnen'));
 assert(!facts('solid-music-7').some(f=>f.key==='food.drink'));
});
test('persons, separate food, adult children and watcher roles remain distinct',()=>{
 assert.deepEqual(facts('solid-diet-people-1').find(f=>f.key==='food.diet').subjectIds,['p1']);
 const combo=row('solid-coffee-specific-6').content.target.meaning;
 assert.deepEqual(combo.facts.find(f=>f.key==='food.diet').subjectIds,['a2']);assert.equal(combo.bindings[0].kind,'SAME_PLACE');
 const parents=row('solid-group-taste-2').content.target.meaning;
 assert.equal(parents.entities.find(e=>e.id==='g1').kind,'GROUP');assert.equal(parents.entities.find(e=>e.id==='g1').members.length,2);
 const grown=facts('solid-grown-children-5');assert.equal(grown.filter(f=>f.key==='people.role'&&f.value.text==='erwachsen').length,2);
 const bowling=row('solid-group-taste-4').content.target.meaning;
 assert.equal(bowling.entities.find(e=>e.id==='gActive').members.length,4);assert(!bowling.entities.find(e=>e.id==='gActive').members.includes('pWatch'));
});
test('date reference, strict/group budget, alternatives and revocations preserve meaning',()=>{
 assert.equal(facts('solid-dates-1').find(f=>f.key==='time.date').value.date,'2026-11-14');
 assert.equal(facts('solid-budget-language-1').find(f=>f.key==='budget.maximum').value.operator,'LT');
 assert.equal(facts('solid-budget-scope-2').find(f=>f.key==='budget.scope').value.scope,'GROUP_TOTAL');
 assert.equal(row('solid-coffee-specific-1').content.target.meaning.logic.children[0].kind,'ANY');
 assert.equal(facts('solid-self-correction-1').find(f=>f.value.text==='Sushi').modality,'NOT_REQUIRED');
 assert(row('solid-diet-precision-8').content.target.meaning.extensions.some(e=>e.modality==='REQUIRED'&&e.description.includes('Spuren')));
});
test('changed snapshot cannot inherit approval; review is explicitly assisted and not independent',()=>{
 const signoff={anchorHash:prepared.anchorHash,verdict:'ACCEPT_FOR_BOUNDED_TRAINING_EXPERIMENT',independentReview:false,reviewerKind:'DELEGATED_ASSISTANT',commission:{instruction:'synthetic test only'},reviewedAt:'2026-11-10T20:00:00Z'};
 assert.throws(()=>approveSnapshot(prepared,{...signoff,anchorHash:'0'.repeat(64)}),/snapshot_mismatch/);
 assert.throws(()=>approveSnapshot(prepared,{...signoff,independentReview:true}),/snapshot_mismatch/);
 const altered=structuredClone(prepared);altered.full.cases[0].content.query+=' changed';
 assert.throws(()=>approveSnapshot(altered,signoff),/snapshot_mismatch/);
 const approved=approveSnapshot(prepared,signoff);
 assert.equal(approved.exportData.manifest.instructionProfile,'SPOT_GROUNDED_V5');assert.equal(approved.exportData.files.train.length,624);
 assert(approved.full.cases.every(r=>r.reviews.length===2));
 const pending=materialize(trainingSpecs[0]);assert.equal(pending.reviews.length,0);assert.equal(pending.content.trainingPermission,'PENDING');
});
test('legacy selection rejects holdout promotion and retains family caps',()=>{
 assert.throws(()=>selectLegacy([row('solid-test-open-boundaries-1')]),/train_only/);
 const legacy=prepared.balanced.cases.filter(r=>!r.id.startsWith('solid-'));
 for(const r of legacy)assert(legacy.filter(x=>x.scenarioGroup===r.scenarioGroup).length<=(r.id.startsWith('r4-train-')?2:4));
 assert(legacy.filter(r=>r.content.task==='ASSESS_CANDIDATES').length<=24);
});
test('counterfactual exercises demonstrate evidence and equal-candidate behavior, not UUID copies',()=>{
 assert.equal(prepared.evidenceNotes.length,64);
 for(const note of prepared.evidenceNotes){const proof=note.counterfactualProof;assert.equal(proof.httpStatus,200);assert(proof.ranked.every(c=>(c.preferenceState==='MET')===proof.expectedPreferenceMet));
  const target=row(note.id).content.target;assert(target.assessments.every(a=>a.fit===(proof.expectedPreferenceMet?'STRONG':'POSSIBLE')));
  if(proof.ranked.length===2)assert.equal(new Set(target.assessments.map(a=>a.fit)).size,1);}
});
test('required and optional evidence execute through actual matching',()=>assert.equal(matchingProbes().length,8));
test('accepted historical bank remains unchanged',async()=>{
 const legacy=JSON.parse(await readFile(new URL('../../../.local/nuknuk-understanding/semantic-acceptance-20261110-reviewed/approved-train.json',import.meta.url),'utf8'));
 assert.equal(contentHash(legacy),prepared.anchor.acceptedLegacyHash);
 for(const r of legacy.cases)assert.deepEqual(prepared.full.cases.find(c=>c.id===r.id),r);
});
