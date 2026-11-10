import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
import {assemble,approveSnapshot,selectLegacy} from './build.mjs';
import {matchingProbes} from './probes.mjs';
import {trainingSpecs} from './train.mjs';
import {buildSemanticRubric,assessReviewedDevelopment} from './rubric.mjs';
import {buildNuknukUnderstandingRequest} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {materialize} from './authoring.mjs';
const prepared=await assemble();
const row=id=>prepared.fresh.find(r=>r.id===id);
const facts=id=>row(id).content.target.meaning.facts;
test('new corpus has fixed group-separated inventories, never historical evaluation queries',()=>{
 assert.equal(prepared.fresh.length,608);assert.deepEqual(prepared.report.counts.fresh,{TRAIN:416,VALIDATION:80,TEST:112});
 assert.equal(prepared.report.counts.newScenarioGroups,88);assert.deepEqual(prepared.report.exposedQueryCollisions,[]);
 for(const group of new Set(prepared.full.cases.map(r=>r.scenarioGroup)))assert.equal(new Set(prepared.full.cases.filter(r=>r.scenarioGroup===group).map(r=>r.split)).size,1);
 assert.equal(prepared.report.counts.balanced.TRAIN,672);
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
 assert.notEqual(row('solid-dates-1').content.reference.now,'2026-11-12T09:00:00Z');
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row('solid-dates-1').content.reference.now));
 const plus=new Date(day+'T12:00:00Z');plus.setUTCDate(plus.getUTCDate()+2);assert.equal(facts('solid-dates-1').find(f=>f.key==='time.date').value.date,plus.toISOString().slice(0,10));
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
 assert.equal(approved.exportData.manifest.instructionProfile,'SPOT_GROUNDED_V6');assert.equal(approved.exportData.files.train.length,672);
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
 assert.equal(prepared.evidenceNotes.length,96);
 for(const note of prepared.evidenceNotes.filter(n=>n.counterfactualProof)){const proof=note.counterfactualProof;assert.equal(proof.httpStatus,200);assert(proof.ranked.every(c=>(c.preferenceState==='MET')===proof.expectedPreferenceMet));
  const target=row(note.id).content.target;assert(target.assessments.every(a=>a.fit===(proof.expectedPreferenceMet?'STRONG':'POSSIBLE')));
  if(proof.ranked.length===2)assert.equal(new Set(target.assessments.map(a=>a.fit)).size,1);}
});
test('required and optional evidence execute through actual matching',()=>assert.equal(matchingProbes().length,16));
test('accepted historical bank remains unchanged',async()=>{
 const legacy=JSON.parse(await readFile(new URL('../../../.local/nuknuk-understanding/semantic-acceptance-20261110-reviewed/approved-train.json',import.meta.url),'utf8'));
 assert.equal(contentHash(legacy),prepared.anchor.acceptedLegacyHash);
 assert.equal(prepared.revisionLedger.length,220);
 for(const r of legacy.cases){const updated=prepared.full.cases.find(c=>c.id===r.id);if(prepared.revisionLedger.some(c=>c.id===r.id)){assert.equal(updated.reviews.length,0);assert.equal(updated.content.trainingPermission,'PENDING');}else assert.deepEqual(updated,r);}
});

test('Astra failures have faithful targets, without invented activity, venue consumption or access',()=>{
 assert(!facts('solid-pets-7').some(f=>f.value.text==='adult_accompanied'));
 assert(!facts('solid-test-place-combinations-6').some(f=>f.value.text==='adult_accompanied'));
 assert(facts('solid-booking-access-6').some(f=>f.key==='offer.kind'&&f.value.text==='HOTEL'));
 assert(facts('solid-hospitality-6').some(f=>f.key==='offer.kind'&&f.value.text==='HOTEL'));
 assert(facts('solid-test-guest-and-location-2').some(f=>f.key==='offer.kind'&&f.value.text==='HOTEL'));
 assert(facts('solid-drink-character-3').some(f=>f.value.text==='WINE_BAR'));
 assert(!facts('solid-drink-character-3').some(f=>f.key==='food.drink'));
 assert(facts('solid-bring-or-buy-6').some(f=>f.value.text==='CAFE'));
 assert(!facts('solid-self-correction-5').some(f=>f.key==='food.meal'));
 assert(row('solid-self-correction-5').content.target.moment.clarification);
 assert.equal(facts('solid-celebration-8').find(f=>f.value.text==='Überraschung').modality,'EXCLUDED');
 assert(row('solid-young-family-7').content.target.meaning.bindings.some(b=>b.kind==='SEQUENCE'));
 assert.equal(facts('solid-dev-revisions-meaning-6').find(f=>f.key==='budget.maximum').value.currency,'UNSPECIFIED');
 assert.equal(facts('solid-test-natural-contrast-4').find(f=>f.key==='experience.activity').value.text,'bathing');
 const booking=prepared.full.cases.find(r=>r.id==='r2-language-8').content.target.meaning.facts.find(f=>f.id==='f3');assert.equal(booking.value.text,'spontaneous');assert.equal(booking.modality,'NOT_REQUIRED');
});
test('calendar holdout varies local boundaries; exclusions and natural uncertainty cover every split',()=>{
 const interpretations=prepared.fresh.filter(r=>r.content.task==='INTERPRET_REQUEST');
 assert(new Set(interpretations.map(r=>r.content.reference.now)).size>=24);
 for(const split of ['TRAIN','VALIDATION','TEST']){const rows=interpretations.filter(r=>r.split===split);assert(rows.some(r=>r.content.target.meaning.facts.some(f=>f.modality==='EXCLUDED')));assert(rows.some(r=>r.content.target.moment.hypotheses.length));assert(rows.some(r=>r.content.target.meaning.uncertainties.length));}
 const dev=row('solid-dev-calendar-contrast-1');assert.equal(dev.content.target.meaning.facts.find(f=>f.key==='time.date').value.date,'2027-01-01');
 const leap=row('solid-test-calendar-contrast-2');assert.equal(leap.content.target.meaning.facts.find(f=>f.key==='time.date').value.date,'2028-03-01');
 assert.equal(facts('solid-dates-6').find(f=>f.key==='time.date').value.date,'2026-11-20');
});
test('assessment contrasts include unequal fits, explicit negative evidence, unknowns and order variation',()=>{
 const rich=prepared.evidenceNotes.filter(n=>n.proofs);assert.equal(rich.length,32);
 for(const n of rich){assert.equal(n.httpStatus,200);assert(n.hardEligibilityUnchanged);assert.equal(new Set(n.proofs.map(p=>p.expectedFit)).size,2);}
 for(const split of ['TRAIN','VALIDATION','TEST'])assert(prepared.fresh.filter(r=>r.split===split&&r.content.task==='ASSESS_CANDIDATES').some(r=>r.content.target.assessments.some(a=>a.fit==='WEAK')));
});
test('V6 is explicit, corrects currency and counts, preserves historical profile identity',()=>{
 const input={query:'Zu viert brunchen, maximal 100.',reference:{now:'2026-11-12T09:00:00Z',timezone:'Europe/Zurich'}};
 const v6=buildNuknukUnderstandingRequest({...input,instructionProfile:'SPOT_GROUNDED_V6'}),v5=buildNuknukUnderstandingRequest({...input,instructionProfile:'SPOT_GROUNDED_V5'});
 assert(v6.instructions.includes('UNSPECIFIED'));assert(v6.instructions.includes('Zuschauer'));assert.notEqual(v6.identity.promptHash,v5.identity.promptHash);assert.notEqual(contentHash(v6.outputSchema),contentHash(v5.outputSchema));
 const soft=buildNuknukUnderstandingRequest({...input,query:'Ein Café mit WLAN wäre nett, ist aber kein Muss.',instructionProfile:'SPOT_GROUNDED_V6'});assert.equal(soft.identity.schemaHash,v6.identity.schemaHash);
 assert.equal(contentHash(buildNuknukUnderstandingRequest({...input,instructionProfile:'SPOT_GROUNDED_V5'})),contentHash(v5));
});
test('semantic selection requires reviewed complete DEV, rejects TEST, stale/contradictory reviews and counts failures',()=>{
 const rubric=buildSemanticRubric(prepared.balanced);const receipt=c=>({id:c.id,contentHash:c.contentHash,rawOutputHash:contentHash({synthetic:true,id:c.id}),reviewer:'synthetic-test-only',verdict:'PASS',errorClasses:[],rationale:'Synthetic unit fixture, no model assessment claimed.'});
 const records=rubric.cases.filter(c=>c.split==='VALIDATION').map(receipt);
 assert(assessReviewedDevelopment(rubric,records).eligibleForFrozenSelection);
 assert(!assessReviewedDevelopment(rubric,records.slice(1)).eligibleForFrozenSelection);
 assert.throws(()=>assessReviewedDevelopment(rubric,[receipt(rubric.cases.find(c=>c.split==='TEST'))]),/non_development/);
 const bad=structuredClone(records);bad[0].errorClasses=['UNSAFE_ACCESS_ASSUMPTION'];assert.throws(()=>assessReviewedDevelopment(rubric,bad),/severity_mismatch/);
 const missing=structuredClone(records);delete missing[0].errorClasses;assert.throws(()=>assessReviewedDevelopment(rubric,missing),/classes_invalid/);
 bad[0].verdict='CRITICAL_ERROR';assert(!assessReviewedDevelopment(rubric,bad).eligibleForFrozenSelection);
 const failed=structuredClone(records);failed[0].verdict='FAILED_GENERATION';failed[0].errorClasses=['FAILED_GENERATION'];assert.equal(assessReviewedDevelopment(rubric,failed).material,1);assert.equal(assessReviewedDevelopment(rubric,failed).total,80);
});
