import test from 'node:test';
import assert from 'node:assert/strict';
import {listNuknukSpotAssertions,evaluateNuknukSpotAudit,evaluateNuknukAudit,evaluateNuknukCohort} from '../dist/nuknuk-evaluation.js';
const report={version:'nuknuk-research-v4.0',spotId:'test-place',startedAt:'2026-10-21T12:00:00Z',results:[{attributeKey:'experience.profile',status:'REQUIRES_REVIEW',value:{properties:[],areas:[{kind:'TERRACE',name:'Terrasse',properties:[{key:'amenity.step_free',state:'KNOWN',value:true}]}],offers:[{kind:'LUNCH',name:'Mittagessen',properties:[],areaIds:['terrace'],prices:[],schedule:[]}]}}]};
const reference={spotId:report.spotId,preparedAt:'2026-10-21T11:00:00Z',checks:[{id:'lunch',dimension:'OFFER',requirement:'Explicit lunch service'},{id:'terrace',dimension:'AREA',requirement:'Physical terrace'},{id:'access',dimension:'ACCESS',requirement:'Terrace step-free only'}]};
const paths=listNuknukSpotAssertions(report);
const assessment={assertions:paths.map(a=>({path:a.path,verdict:'SUPPORTED',note:'Explicit source evidence checked.'})),checks:[{id:'lunch',outcome:'FOUND',paths:['/results/0/value/offers/0'],note:'Lunch stated.'},{id:'terrace',outcome:'FOUND',paths:['/results/0/value/areas/0'],note:'Terrace stated.'},{id:'access',outcome:'FOUND',paths:['/results/0/value/areas/0/properties/0'],note:'Scope is terrace only.'}]};
test('spot audit counts entities, scoped properties and relations, not dish totals',()=>{
 assert.deepEqual(paths.map(a=>a.dimension),['AREA','PROPERTY','OFFER','RELATIONSHIP']);
 const audit=evaluateNuknukSpotAudit(report,reference,assessment);assert.equal(audit.totals.proposedAssertions,4);assert.equal(audit.totals.found,3);assert.equal(audit.referenceBreadthSufficient,true);assert.equal(audit.readyForCatalogWrites,false);
});
test('every proposed assertion must be assessed, including an extra false relationship',()=>{
 assert.throws(()=>evaluateNuknukSpotAudit(report,reference,{...assessment,assertions:assessment.assertions.slice(0,3)}),/spot_audit_incomplete/);
});
test('empty extraction cannot count as perfect spot coverage',()=>{
 const empty={...report,results:[{attributeKey:'experience.profile',status:'UNRESOLVED'}]};
 const audit=evaluateNuknukSpotAudit(empty,reference,{assertions:[],checks:reference.checks.map(c=>({id:c.id,outcome:'MISSING',paths:[],note:'The expected source fact was missed.'}))});assert.equal(audit.totals.proposedAssertions,0);assert.equal(audit.totals.missed,3);assert.equal(audit.totals.found,0);
});
test('a source-scoped audit cannot silently reuse unsupported assertions to satisfy references',()=>{
 const bad=structuredClone(assessment);bad.assertions[0].verdict='WRONG_SCOPE';assert.throws(()=>evaluateNuknukSpotAudit(report,reference,bad),/spot_reference_assessment_invalid/);
});
test('menu-only references and late references cannot certify spot research',()=>{
 const narrow={...reference,preparedAt:'2026-10-21T13:00:00Z',checks:[reference.checks[0]]};const audit=evaluateNuknukSpotAudit(report,narrow,{assertions:assessment.assertions,checks:[assessment.checks[0]]});assert.equal(audit.preRunReference,false);assert.equal(audit.referenceBreadthSufficient,false);
});
test('v4 cohort rejects a green field-only evaluation without scoped spot evidence',()=>{
 const fieldAudit=evaluateNuknukAudit(report,{spotId:report.spotId,preparedAt:reference.preparedAt,checks:['profile']},[{attributeKey:'experience.profile',outcome:'CORRECT',falseAssertions:0,misattributions:0,missedFacts:0,note:'Field-level assessment alone is insufficient.'}]);
 const result=evaluateNuknukCohort([{category:'FOOD_DRINK',report,audit:fieldAudit}]);assert.ok(result.blockers.includes('SCOPED_SPOT_AUDIT_REQUIRED'));assert.equal(result.readyForUnattendedDrafts,false);
});
