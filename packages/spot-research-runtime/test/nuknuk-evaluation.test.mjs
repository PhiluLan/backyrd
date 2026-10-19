import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateNuknukAudit} from '../dist/nuknuk-evaluation.js';
const report={spotId:'s',results:[{attributeKey:'hours.regular',status:'UNRESOLVED'},{attributeKey:'amenity.features',status:'REQUIRES_REVIEW'}]};
const ref={spotId:'s',checks:['hours listed','no supported Wi-Fi claim']};
const assessments=[{attributeKey:'hours.regular',outcome:'OMISSION',falseAssertions:0,misattributions:0,missedFacts:7,note:'All seven published weekdays missed.'},{attributeKey:'amenity.features',outcome:'INCORRECT',falseAssertions:1,misattributions:1,missedFacts:0,note:'Neighbour Wi-Fi attributed to target.'}];
test('audit distinguishes missing supported data from invented or misattributed facts',()=>{const r=evaluateNuknukAudit(report,ref,assessments);assert.equal(r.totals.missedFacts,7);assert.equal(r.totals.falseAssertions,1);assert.equal(r.totals.misattributions,1);assert.equal(r.totals.omitted,1);assert.equal(r.reportHash.length,64);});
test('every requested field must be audited exactly once and bound to the correct spot',()=>{for(const args of [[report,ref,[]],[report,{...ref,spotId:'other'},assessments],[report,ref,[assessments[0],assessments[0]]]])assert.throws(()=>evaluateNuknukAudit(...args));});
test('cannot label an omitted known fact as a correct answer or abstention',()=>{assert.throws(()=>evaluateNuknukAudit(report,ref,[{...assessments[0],outcome:'JUSTIFIED_ABSTENTION'},assessments[1]]));assert.throws(()=>evaluateNuknukAudit(report,ref,[{...assessments[0],outcome:'CORRECT',missedFacts:0},assessments[1]]));assert.throws(()=>evaluateNuknukAudit(report,ref,[assessments[0],{...assessments[1],outcome:'CORRECT'}]));});
