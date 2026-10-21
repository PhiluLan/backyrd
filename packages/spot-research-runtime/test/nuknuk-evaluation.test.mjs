import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateNuknukAudit,evaluateNuknukCohort} from '../dist/nuknuk-evaluation.js';
const report={spotId:'s',results:[{attributeKey:'hours.regular',status:'UNRESOLVED'},{attributeKey:'amenity.features',status:'REQUIRES_REVIEW'}]};
const ref={spotId:'s',checks:['hours listed','no supported Wi-Fi claim']};
const assessments=[{attributeKey:'hours.regular',outcome:'OMISSION',falseAssertions:0,misattributions:0,missedFacts:7,note:'All seven published weekdays missed.'},{attributeKey:'amenity.features',outcome:'INCORRECT',falseAssertions:1,misattributions:1,missedFacts:0,note:'Neighbour Wi-Fi attributed to target.'}];
test('audit distinguishes missing supported data from invented or misattributed facts',()=>{const r=evaluateNuknukAudit(report,ref,assessments);assert.equal(r.totals.missedFacts,7);assert.equal(r.totals.falseAssertions,1);assert.equal(r.totals.misattributions,1);assert.equal(r.totals.omitted,1);assert.equal(r.reportHash.length,64);});
test('every requested field must be audited exactly once and bound to the correct spot',()=>{for(const args of [[report,ref,[]],[report,{...ref,spotId:'other'},assessments],[report,ref,[assessments[0],assessments[0]]]])assert.throws(()=>evaluateNuknukAudit(...args));});
test('cannot label an omitted known fact as a correct answer or abstention',()=>{assert.throws(()=>evaluateNuknukAudit(report,ref,[{...assessments[0],outcome:'JUSTIFIED_ABSTENTION'},assessments[1]]));assert.throws(()=>evaluateNuknukAudit(report,ref,[{...assessments[0],outcome:'CORRECT',missedFacts:0},assessments[1]]));assert.throws(()=>evaluateNuknukAudit(report,ref,[assessments[0],{...assessments[1],outcome:'CORRECT'}]));});
test('cohort gate requires a balanced audited set, useful coverage and zero wrong facts',()=>{
 const categories=['FOOD_DRINK','STAY','CULTURE','ACTIVITY'];
 const cases=Array.from({length:12},(_,i)=>{
   const run={spotId:'spot-'+i,startedAt:'2026-10-20T12:00:00.000Z',results:[{attributeKey:'contact.phone',status:'REQUIRES_REVIEW'},{attributeKey:'operation.laptop_policy',status:'UNRESOLVED'}],sourceFailures:[],stopReason:'FRONTIER_EXHAUSTED'};
   const reference={spotId:run.spotId,preparedAt:'2026-10-20T11:00:00.000Z',checks:['official phone literal','no laptop statement']};
   const audit=evaluateNuknukAudit(run,reference,[
     {attributeKey:'contact.phone',outcome:'CORRECT',falseAssertions:0,misattributions:0,missedFacts:0,note:'Matched the exact target venue.'},
     {attributeKey:'operation.laptop_policy',outcome:'JUSTIFIED_ABSTENTION',falseAssertions:0,misattributions:0,missedFacts:0,note:'Official site makes no explicit statement.'},
   ]);
   return {category:categories[i%4],report:run,audit};
 });
 const ready=evaluateNuknukCohort(cases);
 assert.equal(ready.readyForUnattendedDrafts,true);
 assert.equal(ready.readyForCatalogWrites,false);
 assert.equal(ready.counts.fieldsProposed,12);
 assert.deepEqual(ready.counts.categories,{FOOD_DRINK:3,STAY:3,CULTURE:3,ACTIVITY:3});
 assert.ok(evaluateNuknukCohort(cases.slice(0,11)).blockers.includes('MINIMUM_12_SPOTS'));
 const late=structuredClone(cases);late[0].audit.preRunReference=false;
 assert.ok(evaluateNuknukCohort(late).blockers.includes('REFERENCE_NOT_PREPARED_BEFORE_RUN'));
 const missed=structuredClone(cases);missed[0].audit.assessments[0].outcome='PARTIAL';missed[0].audit.assessments[0].missedFacts=1;missed[0].audit.totals.missedFacts=1;
 assert.ok(evaluateNuknukCohort(missed).blockers.includes('KNOWN_FACTS_MISSED'));
 const bad=structuredClone(cases);
 bad[0].report.results[0].status='UNRESOLVED';
 assert.throws(()=>evaluateNuknukCohort(bad),/cohort_audit_invalid/);
 const lowCoverage=cases.map((item,i)=>i<5?item:{...item,report:{...item.report,results:[{attributeKey:'contact.phone',status:'UNRESOLVED'},{attributeKey:'operation.laptop_policy',status:'UNRESOLVED'}]}});
 assert.throws(()=>evaluateNuknukCohort(lowCoverage),/cohort_audit_invalid/);
});
