import test from 'node:test';
import assert from 'node:assert/strict';
import {assemble,approveSnapshot} from './build.mjs';
import {opaqueIdentity,bindAssessmentCandidate,identityKeys} from './assessment-identity.mjs';
import {buildMetamorphicControls,auditAssessmentIdentity,summarizeTaskMixture} from './methodology.mjs';
import {buildSemanticRubric,assessReviewedDevelopment} from './rubric.mjs';
import {buildNuknukAssessmentRequest} from '../../../packages/decision-vnext-core/dist/nuknuk-grounded-assessment.js';
import {profile,offer,area,prop} from '../../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs';
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
const prepared=await assemble();
const controls=buildMetamorphicControls(prepared.balanced);
test('venue identity stays fixed across different evidence profiles and assignment variants',()=>{
 const unknown=profile([offer()],[area()]),known=profile([offer()],[area('inside',[prop('amenity.toilet',true)])]);
 const first=bindAssessmentCandidate('same-venue','venue-a',unknown),second=bindAssessmentCandidate('same-venue','venue-a',known);
 assert.equal(first.decisionProjection.spotId,second.decisionProjection.spotId);
 assert.notEqual(first.manifestHash,second.manifestHash);
 assert.match(opaqueIdentity('same-venue','venue-a'),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.notEqual(opaqueIdentity('same-venue','venue-a'),opaqueIdentity('same-venue','venue-b'));
 assert.deepEqual([...identityKeys('same-venue','negative')].sort(),[...identityKeys('same-venue','positive')].sort());
});
test('exported assessment targets no longer have the perfect global WEAK parity shortcut',()=>{
 const report=auditAssessmentIdentity(prepared.balanced);
 assert(report.weak.even>0&&report.weak.odd>0);assert.equal(report.perfectGlobalWeakParityShortcut,false);
 const broken=structuredClone(prepared.balanced);
 for(const r of broken.cases.filter(r=>r.content.task==='ASSESS_CANDIDATES'))for(const a of r.content.target.assessments)if(a.fit==='WEAK')a.candidateId='10000000-0000-4000-8000-000000000002';
 assert(auditAssessmentIdentity(broken).perfectGlobalWeakParityShortcut);
});
test('derived challenge changes nuisance identity, evidence, order and wording separately; never SFT',()=>{
 assert.deepEqual(controls.counts,{VALIDATION:8,TEST:8});
 for(const c of controls.cases){
  const base=prepared.balanced.cases.find(r=>r.id===c.baseCaseId);
  assert.equal(c.split,base.split);assert.notEqual(c.split,'TRAIN');assert.equal(c.messages.length,2);
  const original=buildNuknukAssessmentRequest(base.content.context),input=JSON.parse(c.messages[1].content);
  assert.equal(contentHash(input.moment),contentHash(JSON.parse(original.input).moment));
  const before=new Map(base.content.target.assessments.map(a=>[a.candidateId,a.fit]));
  if(c.variant==='id-rebind')for(const [oldId,newId]of Object.entries(c.proof.identityMapping))assert.equal(c.expected.assessments.find(a=>a.candidateId===newId).fit,before.get(oldId));
  if(c.variant==='evidence-swap'){
   assert(c.expected.assessments.some(a=>a.fit!==before.get(a.candidateId)));
   for(const [id,donor]of Object.entries(c.proof.evidenceDonors))assert.equal(c.expected.assessments.find(a=>a.candidateId===id).fit,before.get(donor));
  }
  if(c.variant==='order-reverse')for(const a of c.expected.assessments)assert.equal(a.fit,before.get(a.candidateId));
  if(c.variant==='paraphrase-codes'){
   assert(c.proof.changedStatements>0);
   assert(input.candidates.every(c=>c.evidence.every(e=>e.reasonCode.startsWith('proof-'))));
   for(const a of c.expected.assessments)assert.equal(a.fit,before.get(a.candidateId));
  }
 }
});
test('frozen selection requires actual DEV reviews for base and all derived controls, never TEST',()=>{
 assert.throws(()=>buildSemanticRubric(prepared.balanced),/controls_required/);
 const rubric=buildSemanticRubric(prepared.balanced,controls);
 assert.throws(()=>assessReviewedDevelopment({...rubric,derivedControls:undefined},[]),/controls_required/);
 const receipt=c=>({id:c.id,contentHash:c.contentHash,rawOutputHash:contentHash({syntheticOnly:c.id}),reviewer:'synthetic-unit-test-only',verdict:'PASS',errorClasses:[],rationale:'Protocol fixture only; no actual model run or review.'});
 const base=rubric.cases.filter(c=>c.split==='VALIDATION').map(receipt),derived=rubric.derivedControls.cases.filter(c=>c.split==='VALIDATION').map(receipt);
 assert(!assessReviewedDevelopment(rubric,base).eligibleForFrozenSelection);
 const result=assessReviewedDevelopment(rubric,base,derived);assert(result.eligibleForFrozenSelection);assert.equal(result.derivedControls.total,8);assert.equal(result.byTask.length,2);
 assert(!assessReviewedDevelopment(rubric,base,derived.slice(1)).eligibleForFrozenSelection);
 assert.throws(()=>assessReviewedDevelopment(rubric,base,[receipt(rubric.derivedControls.cases.find(c=>c.split==='TEST'))]),/non_development/);
 const failed=structuredClone(derived);failed[0].verdict='MATERIAL_ERROR';failed[0].errorClasses=['WRONG_PERSON_OR_AREA'];assert(!assessReviewedDevelopment(rubric,base,failed).eligibleForFrozenSelection);
 assert.throws(()=>buildSemanticRubric(prepared.balanced,{...controls,datasetHash:'bad'}),/dataset_mismatch/);
});
test('group counts and examples are reported independently of token mass and are not field samples',()=>{
 const summary=summarizeTaskMixture(prepared.balanced);
 assert.deepEqual(summary['TRAIN:INTERPRET_REQUEST'],{examples:616,scenarioGroups:144,answerTokens:null});
 assert.deepEqual(summary['TRAIN:ASSESS_CANDIDATES'],{examples:104,scenarioGroups:44,answerTokens:null});
 assert.equal(summary['TEST:INTERPRET_REQUEST'].scenarioGroups,13);assert.equal(summary['TEST:ASSESS_CANDIDATES'].scenarioGroups,5);
});
