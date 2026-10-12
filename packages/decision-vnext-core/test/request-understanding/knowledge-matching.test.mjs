import test from 'node:test';
import assert from 'node:assert/strict';
import { REGISTRY_V2_1_HASH, REGISTRY_V2_1_VERSION, parseAttributeValue, validateAuthoringSubmission, AUTHORING_FIELDS, OWNER_BASIC_KEYS } from '@backyrd/world-knowledge-core';
import { bindProductUnderstanding, contentHash, projectRequirementFacets, encodeWorldQueryConstraint } from '../../dist/index.js';
import { parseProductWorldResolverBinding } from '../../dist/product-world-resolver-binding.js';
import { fixture, ids, worldBinding, execute, conditions } from './visit-fixtures.mjs';
const facet=(key,value,importance='ESSENTIAL')=>({dimension:key==='context.atmosphere'?'ATMOSPHERE':key.startsWith('offering.')?'OFFERING':'EXPERIENCE',importance,operator:'REQUIRE',origin:'EXPLICIT',interpretationState:'UNDERSTOOD',value:{kind:'FACET',key,value},alternatives:[],group:null});
const price=(min,max=min,patch={})=>({purposes:['DRINK'],allOfferingsCovered:true,currency:'CHF',min,max,basis:'PER_PERSON',minimumAge:null,maximumAge:null,mandatoryFeesIncluded:true,conditions,...patch});
function inquiry({budget=20,strict=false,cake=false,coffee=false,quiet=null,phase=null,includes=[]}={}){
 const request={...fixture().request,naturalLanguage:'Synthetisches Café mit expliziten Bedingungen in Zürich.',explicit:{targetCity:'Zurich',primaryIntent:'COFFEE',...(phase?{dateTime:{state:'KNOWN',localDate:'2026-10-18',dayPhase:phase,timeZone:'Europe/Zurich'}}:{})}};
 const requirements=[facet('classification.place_types','CAFE'),...(budget===null?[]:[{dimension:'BUDGET',importance:'HARD',operator:'REQUIRE',origin:'EXPLICIT',interpretationState:'UNDERSTOOD',value:{kind:'BUDGET',amountMinor:budget*100,currency:'CHF',comparison:strict?'LT':'LTE',basis:'PER_PERSON',includes},alternatives:[],group:null}]),...(cake?[facet('offering.food_specialities','CAKE')]:[]),...(coffee?[facet('offering.groups','COFFEE')]:[]),...(quiet?[facet('context.atmosphere','QUIET',quiet)]:[])];
 request.explicit.hardConstraints=projectRequirementFacets(requirements).filter(row=>row.role!=='PREFERRED').map(row=>encodeWorldQueryConstraint(row.role,row.group??'X',row.key,row.value));
 return {request,understanding:bindProductUnderstanding(request,requirements,'MEANING_PLAN')};
}
function view({prices=null,specialities=[],groups=['COFFEE'],atmosphere=[],legacy=null,unknownPrice=false,previous=false,validUntil=null,hardAuthorized=true}={}){
 const binding=worldBinding(ids[0],'CAFE');const facts=binding.decisionProjection.facts;
 const fact=(key,value)=>({key,value,scope:'SPOT',resolution:'KNOWN_VALUE',freshness:'CURRENT',trust:'VERIFIED',basisClaimHashes:[contentHash({key,value})],...(['context.atmosphere','operation.price_options','operation.price_range'].includes(key)?{validityVerified:true,validFrom:null,validUntil}:{}),...(key==='context.atmosphere'?{hardConstraintAuthorized:hardAuthorized}:{})});
 facts.push(fact('offering.food_specialities',specialities),fact('offering.groups',groups),fact('context.atmosphere',atmosphere),fact('hours.regular',[{day:'SUNDAY',intervals:[{start:'06:00',end:'23:00'}]}]));
 if(prices!==null)facts.push(fact('operation.price_options',prices));if(legacy)facts.push(fact('operation.price_range',legacy));
 if(unknownPrice){facts.push({...fact('operation.price_options',null),resolution:'UNKNOWN'});binding.decisionProjection.explicitUnknowns.push({key:'operation.price_options',scope:'SPOT'});}
 if(previous){binding.registryHash=REGISTRY_V2_1_HASH;binding.decisionProjection.registryVersion=REGISTRY_V2_1_VERSION;binding.decisionProjection.policyVersion='backyrd.world-knowledge.source-policy@4b.1';}
 binding.manifestHash=contentHash(binding.decisionProjection);return parseProductWorldResolverBinding(binding,'Zurich');
}
const candidate=(input,data)=>execute(inquiry(input),[view(data)],'2026-10-16T10:00:00.000Z').candidates[0];
test('precise CAKE is authorable and baked goods do not prove it',()=>{
 assert.equal(validateAuthoringSubmission('offering.food_specialities','KNOWN_VALUE',['CAKE']).ok,true);
 assert.equal(candidate({budget:null,cake:true},{specialities:['BAKED_GOODS']}).rank,null);
 assert.equal(candidate({budget:null,cake:true},{specialities:['CAKE']}).rank,1);
});
test('comparable prices have one shared authorized Admin/Owner control',()=>{
 const field=AUTHORING_FIELDS.find(row=>row.attributeKey==='operation.price_options');assert.equal(field.control,'PRICE_OPTIONS');
 assert.ok(field.roles.includes('OWNER_BASIC')&&field.roles.includes('ADMIN'));assert.ok(OWNER_BASIC_KEYS.includes(field.attributeKey));
 assert.equal(validateAuthoringSubmission(field.attributeKey,'KNOWN_VALUE',[price(10)]).ok,true);
 assert.equal(validateAuthoringSubmission(field.attributeKey,'UNKNOWN',null).ok,true);
 assert.throws(()=>parseAttributeValue(field.attributeKey,[price(10.001)]));
 assert.throws(()=>parseAttributeValue(field.attributeKey,[price(10,9)]));
 assert.throws(()=>parseAttributeValue(field.attributeKey,[price(10,10,{minimumAge:18,maximumAge:8})]));
});
test('a partial drink price cannot confirm coffee plus cake; a covering bundle can',()=>{
 const input={budget:10,cake:true,coffee:true};const data={specialities:['CAKE'],prices:[price(5),price(8,8,{purposes:['SNACK']})]};
 assert.ok(candidate(input,data).unknownHardConstraints.includes('BUDGET_MAXIMUM'));
 const bundle=candidate(input,{...data,prices:[price(9,10,{purposes:['DRINK','SNACK']})]});assert.ok(bundle.confirmedHardConstraints.includes('BUDGET_MAXIMUM'));assert.equal(bundle.rank,1);
});
test('overlapping prices are unknown; complete ceilings confirm; wholly higher prices reject',()=>{
 assert.ok(candidate({}, {prices:[price(15,30)]}).unknownHardConstraints.includes('BUDGET_MAXIMUM'));
 assert.ok(candidate({}, {prices:[price(10,20)]}).confirmedHardConstraints.includes('BUDGET_MAXIMUM'));
 assert.ok(candidate({}, {prices:[price(21,30)]}).failedHardConstraints.includes('BUDGET_MAXIMUM'));
});
test('strict ceilings distinguish an overlapping range from an exact excluded point',()=>{
 assert.ok(candidate({strict:true},{prices:[price(15,20)]}).unknownHardConstraints.includes('BUDGET_MAXIMUM'));
 assert.ok(candidate({strict:true},{prices:[price(20)]}).failedHardConstraints.includes('BUDGET_MAXIMUM'));
});
test('wrong purpose, group basis, unknown fees or incomplete coverage cannot confirm budget',()=>{
 for(const patch of [{purposes:['ADMISSION']},{basis:'PER_GROUP'},{mandatoryFeesIncluded:false},{allOfferingsCovered:false},{currency:'EUR'},{maximumAge:12}])assert.ok(candidate({}, {prices:[price(5,5,patch)]}).unknownHardConstraints.includes('BUDGET_MAXIMUM'));
});
test('explicit missing quiet remains unknown, never a negative inference from cozy',()=>{
 const c=candidate({budget:null,quiet:'ESSENTIAL'},{atmosphere:[{atmosphere:'COZY',conditions}]});assert.equal(c.rank,null);
 assert.ok(c.unknownHardConstraints.some(code=>code.startsWith('QUERY_REQUIRED')));assert.equal(c.failedHardConstraints.some(code=>code.startsWith('QUERY_REQUIRED')),false);
 const preferred=candidate({budget:null,quiet:'PREFERRED'},{atmosphere:[{atmosphere:'COZY',conditions}]});assert.equal(preferred.rank,1);
});
test('conditional quiet is confirmed only in its actual scope',()=>{
 const data={atmosphere:[{atmosphere:'QUIET',conditions:{...conditions,dayparts:['MORNING']}},{atmosphere:'COZY',conditions:{...conditions,dayparts:['EVENING']}}]};
 assert.equal(candidate({budget:null,quiet:'ESSENTIAL',phase:'MORNING'},data).rank,1);
 const evening=candidate({budget:null,quiet:'ESSENTIAL',phase:'EVENING'},data);assert.equal(evening.rank,null);assert.ok(evening.unknownHardConstraints.some(code=>code.startsWith('QUERY_REQUIRED')));
});
test('known legacy release remains readable but cannot carry new knowledge',()=>{
 assert.equal(view({previous:true}).spot.spotId,ids[0]);
 assert.throws(()=>view({previous:true,specialities:['CAKE']}),/previous_registry/);
 assert.throws(()=>view({previous:true,prices:[price(5)]}),/previous_registry/);
});
test('generic legacy cafe price and unrepresented budget components remain unverified',()=>{
 assert.ok(candidate({}, {legacy:{currency:'CHF',min:5,max:10}}).unknownHardConstraints.includes('BUDGET_MAXIMUM'));
 assert.ok(candidate({includes:['TRANSPORT']},{prices:[price(5)]}).unknownHardConstraints.includes('BUDGET_MAXIMUM'));
});

test('implicit core consumption cannot disappear behind an additional required cake',()=>{
  assert.ok(candidate({budget:10,cake:true},{specialities:['CAKE'],prices:[price(8,8,{purposes:['SNACK']})]}).unknownHardConstraints.includes('BUDGET_MAXIMUM'));
});
test('a cheaper option with unresolved fees prevents an unsupported negative budget claim',()=>{
  const c=candidate({budget:20},{prices:[price(30),price(10,10,{mandatoryFeesIncluded:false})]});
  assert.ok(c.unknownHardConstraints.includes('BUDGET_MAXIMUM'));assert.equal(c.failedHardConstraints.includes('BUDGET_MAXIMUM'),false);
  assert.ok(candidate({budget:20},{prices:[price(15),price(10,10,{mandatoryFeesIncluded:false})]}).confirmedHardConstraints.includes('BUDGET_MAXIMUM'));
});
test('historical quiet cannot become required eligibility merely through a new reader',()=>{
  const c=candidate({budget:null,quiet:'ESSENTIAL'},{previous:true,atmosphere:[{atmosphere:'QUIET',conditions}]});assert.equal(c.rank,null);assert.ok(c.unknownHardConstraints.some(code=>code.startsWith('QUERY_REQUIRED')));
});

test('explicit budget components bind a covering price without inventing cafe consumption',()=>{
 const c=candidate({budget:10,cake:true,includes:['FOOD']},{specialities:['CAKE'],prices:[price(8,8,{purposes:['SNACK']})]});assert.ok(c.confirmedHardConstraints.includes('BUDGET_MAXIMUM'));
 const combined=candidate({budget:10,cake:true,includes:['FOOD','DRINKS']},{specialities:['CAKE'],prices:[price(8,8,{purposes:['SNACK']})]});assert.ok(combined.unknownHardConstraints.includes('BUDGET_MAXIMUM'));
});

test('visit-scoped prices and atmosphere cannot be confirmed after their validity expires',()=>{
 const c=candidate({phase:'MORNING',quiet:'ESSENTIAL'},{prices:[price(10)],atmosphere:[{atmosphere:'QUIET',conditions}],validUntil:'2026-10-17T22:00:00.000Z'});assert.ok(c.unknownHardConstraints.includes('BUDGET_MAXIMUM'));assert.equal(c.rank,null);assert.ok(c.unknownHardConstraints.some(code=>code.startsWith('QUERY_REQUIRED')));
});
test('negative atmosphere cannot veto a spot from unauthorized or expired evidence',()=>{
 for (const data of [{hardAuthorized:false},{validUntil:'2026-10-17T22:00:00.000Z'},{previous:true}]) {
  const input=inquiry({budget:null,phase:'MORNING'});const requirement={...facet('context.atmosphere','LIVELY','HARD'),operator:'EXCLUDE'};
  input.understanding=bindProductUnderstanding(input.request,[...input.understanding.requirements,requirement],'MEANING_PLAN');
  const result=execute(input,[view({...data,atmosphere:[{atmosphere:'LIVELY',conditions}]})],'2026-10-16T10:00:00.000Z').candidates[0];assert.equal(result.failedHardConstraints.some(code=>code.startsWith('UNDERSTANDING_REQUIREMENT')),false);assert.ok(result.unknownHardConstraints.some(code=>code.startsWith('UNDERSTANDING_REQUIREMENT')));
 }
});

test('a food-only ceiling never charges a separately requested coffee to that ceiling',()=>{
 const data={specialities:['CAKE'],prices:[price(8,8,{purposes:['SNACK']}),price(13,13,{purposes:['DRINK','SNACK']})]};const c=candidate({budget:10,cake:true,coffee:true,includes:['FOOD']},data);assert.ok(c.confirmedHardConstraints.includes('BUDGET_MAXIMUM'));assert.equal(c.failedHardConstraints.includes('BUDGET_MAXIMUM'),false);
 assert.ok(candidate({budget:10,cake:true,coffee:true,includes:['FOOD','DRINKS']},data).failedHardConstraints.includes('BUDGET_MAXIMUM'));
});

test('a legacy restaurant range without unit, service and fee scope is never upgraded into meal proof',()=>{
 const input=inquiry({budget:20});input.request.explicit.primaryIntent='EAT';input.understanding=bindProductUnderstanding(input.request,[...input.understanding.requirements.filter(r=>r.dimension!=='EXPERIENCE'),facet('classification.place_types','RESTAURANT')],'MEANING_PLAN');
 const binding=worldBinding(ids[0],'RESTAURANT');binding.decisionProjection.facts.push({key:'operation.price_range',value:{currency:'CHF',min:5,max:10},scope:'SPOT',resolution:'KNOWN_VALUE',freshness:'CURRENT',trust:'VERIFIED',basisClaimHashes:[contentHash('old-price')],validityVerified:true,validFrom:null,validUntil:null});
 const c=execute(input,[parseProductWorldResolverBinding(binding,'Zurich')],'2026-10-16T10:00:00.000Z').candidates[0];assert.ok(c.unknownHardConstraints.includes('BUDGET_MAXIMUM'));
});
