import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDecisionProductResponse } from '../../../../mobile/packages/product-decision-contract/src/index.mjs';
import { ACCEPTED_SOURCE_POLICY, REGISTRY_HASH, REGISTRY_VERSION } from '@backyrd/world-knowledge-core';
import { canonicalBytes, contentHash as userHash, parseRelevantUserProjection, projectionHashBody } from '@backyrd/user-intelligence-vnext-core';
import { contentHash, parseProductRequestMeaning, bindProductMeaningSearchPlan, projectProductMeaningSearchPlan, evaluateProductWorldViews, buildDecisionProductExecution, createDecisionProductRpcEvaluationProvider, bindProductUnderstanding, validateProductUnderstanding } from '../../dist/index.js';
import { parseProductWorldResolverBinding } from '../../dist/product-world-resolver-binding.js';

const at = '2026-10-11T10:00:00.000Z';
const actor = { userId:'11111111-1111-4111-8111-111111111111', subjectBindingHash:'2'.repeat(64), authenticationContextHash:'3'.repeat(64), sessionBindingHash:'4'.repeat(64), sessionId:'session-test' };
const conditions = { days:[], dayparts:[], occasion:null, area:null, groupSize:null, ageContext:null, accompaniment:null, eventMode:null };
const target = (key,value,dimension='EXPERIENCE') => ({ dimension, value:{kind:'FACET',key,value}, evidence:'E1' });
function fixture({ preferred=false, quiet=false, localBudget=false, unsupported=false, thirdUnsupported=false, explicit={} }={}) {
  const cafe=quiet?'ruhiges Café':'Café';
  const other=unsupported?'Teestube':'Museum';
  const text=`${cafe}${localBudget?' für maximal 15 CHF pro Person':''} oder ${preferred?'lieber ':''}${other} in Zürich.`+(thirdUnsupported?' Oder auch eine Teestube.':'');
  const request={ contractVersion:'backyrd.decision-vnext.product-request@1.0', requestId:'single-choice', idempotencyKey:'single-choice', naturalLanguage:text, explicit:{targetCity:"Zurich",...explicit}, alternativeRequested:false, previouslyPresentedCandidateIds:[], rejectedCandidateIds:[] };
  const activity=(id,description,status)=>({id,description,status,alternativeGroup:'R1',condition:null,afterActivityId:null,replacesActivityId:null,evidence:['E1']});
  const constraints=localBudget?[{id:'C1',aspect:'BUDGET',description:'maximal 15 CHF pro Person',status:'REQUESTED',activityIds:['A1'],participantIds:[],comparison:'LTE',numericValue:15,unit:'CHF',basis:'pro Person',alternativeGroup:null,condition:null,evidence:['E1']}]:[];
  const meaning=parseProductRequestMeaning({summary:'Ein Besuch, Café oder Museum.',activities:[activity('A1',cafe,'REQUESTED'),activity('A2',other,preferred?'OPTIONAL':'REQUESTED'),...(thirdUnsupported?[activity('A3','Teestube','OPTIONAL')]:[])],participants:[],constraints,uncertainties:[]},text,{E1:text});
  const mappings=[{sourceId:'A1',state:'MAPPED',intent:'COFFEE',targets:[target('classification.place_types','CAFE'),...(quiet?[target('context.atmosphere','QUIET','ATMOSPHERE')]:[])]},unsupported?{sourceId:'A2',state:'UNSUPPORTED',intent:null,targets:[]}:{sourceId:'A2',state:'MAPPED',intent:'CULTURE_ART',targets:[target('classification.place_types','MUSEUM')]}];
  if(thirdUnsupported)mappings.push({sourceId:'A3',state:'UNSUPPORTED',intent:null,targets:[]});
  if(localBudget)mappings.push({sourceId:'C1',state:'MAPPED',intent:null,targets:[{dimension:'BUDGET',value:{kind:'BUDGET',amountMinor:1500,currency:'CHF',comparison:'LTE',basis:'PER_PERSON',includes:[]},evidence:'E1'}]});
  return projectProductMeaningSearchPlan(request,bindProductMeaningSearchPlan(request,meaning,{mappings},{E1:text}));
}
const ids=['11111111-1111-4111-a111-111111111111','22222222-2222-4222-a222-222222222222','33333333-3333-4333-a333-333333333333'];
function worldBinding(id,type,{ quiet=null, price=null, closed=false, hours=false, accessible=null }={}) {
  const fact=(key,value,extra={})=>({key,value,scope:'SPOT',resolution:'KNOWN_VALUE',freshness:'CURRENT',trust:'VERIFIED',basisClaimHashes:[contentHash(key)],...extra});
  const facts=[fact('identity.name','Synthetic '+type),fact('location.locality','Zurich'),fact('location.timezone','Europe/Zurich'),fact('purpose.primary_visit',type==='CAFE'?'EAT_DRINK':'CULTURE_ARTS'),fact('classification.primary_category',type==='CAFE'?'COFFEE_DAYTIME':'CULTURE_ARTS'),fact('classification.place_types',[type])];
  if(quiet!==null)facts.push(fact('context.atmosphere',[{atmosphere:quiet?'QUIET':'LIVELY',conditions}]));
  if(price!==null)facts.push(fact('operation.price_range',{currency:'CHF',min:price,max:price}));
  if(hours)facts.push(fact('hours.regular',[{day:'SUNDAY',intervals:closed?[]:[{start:'09:00',end:'18:00'}]}]));
  if(accessible!==null)for(const key of ['accessibility.step_free_entrance','accessibility.wheelchair_paths','accessibility.accessible_seating'])facts.push(fact(key,accessible,{resolution:accessible?'KNOWN_TRUE':'KNOWN_FALSE'}));
  return {contractVersion:'backyrd.world-knowledge.product-resolver-binding@1.0',manifestHash:contentHash({id,facts}),registryHash:REGISTRY_HASH,resolvedAt:at,decisionProjection:{contractVersion:'backyrd.world-knowledge.product-decision-projection@1.0',registryVersion:REGISTRY_VERSION,policyVersion:ACCEPTED_SOURCE_POLICY.policyVersion,spotId:id,facts,explicitUnknowns:[],conflicts:[]}};
}
const world=(id,type,extras)=>parseProductWorldResolverBinding(worldBinding(id,type,extras),'Zurich');
function projection(request) {
  const body={contractVersion:'backyrd.user-intelligence.projection@1.0',projectionId:'test-projection',decisionId:`decision-${contentHash({requestId:request.requestId,idempotencyKey:request.idempotencyKey}).slice(0,32)}`,subjectBindingHash:userHash('backyrd.user-intelligence.neutral-subject-binding@1.0'),snapshot:null,manifest:{manifestId:'test-manifest',manifestHash:'6'.repeat(64)},status:'NEUTRAL',neutralReason:'NO_CONSENT',taste:[],practical:[],directSpot:[],domainSufficiency:[],knowledgeLevel:'UNKNOWN',suppression:{total:0,byReason:[]},boundaries:{rawEventsIncluded:false,reviewTextIncluded:false,rawLocationIncluded:false,privateSocialDataIncluded:false,eligibilityAuthority:false,rankingAuthority:false},budgets:{maxItems:64,maxBytes:65536,actualItems:0,canonicalPayloadBytes:0},technicalMetadata:{createdAt:at}};
  body.budgets.canonicalPayloadBytes=canonicalBytes(projectionHashBody(body));
  return parseRelevantUserProjection({...body,projectionHash:userHash(projectionHashBody(body))});
}
function execute(i,worlds) {
  const p=projection(i.request),authority={authorizedCity:'Zurich',serverTime:at,locationBindingHash:contentHash('location')};
  const evaluated=evaluateProductWorldViews(i.request,authority,p,worlds,contentHash(worlds.map(w=>w.spot.spotId).sort()),i.understanding);
  return buildDecisionProductExecution({...evaluated,request:i.request,projection:p,actor,authority,evaluatorContractVersion:evaluated.evaluation.evaluatorVersion}).response;
}

test('quiet applies to cafe branch, not to museum; partial branches cannot combine',()=>{
  const r=execute(fixture({quiet:true}),[world(ids[0],'CAFE',{quiet:false}),world(ids[1],'CAFE',{quiet:true}),world(ids[2],'MUSEUM',{quiet:false})]);
  assert.equal(r.candidates.find(c=>c.spotId===ids[0]).rank,null);
  assert.ok(r.candidates.find(c=>c.spotId===ids[1]).rank!==null);
  assert.ok(r.candidates.find(c=>c.spotId===ids[2]).rank!==null);
  assert.equal(r.interpretation.visitAlternatives.length,2);
});
test('preferred fully matching museum ranks before cafe regardless of identity',()=>{
  const r=execute(fixture({preferred:true}),[world(ids[0],'CAFE'),world(ids[1],'MUSEUM')]);
  assert.equal(r.primaryCandidateId,ids[1]);
  assert.equal(r.candidates[0].rankVector.contextFit.preferredAlternativeConfirmed,true);
});
test('closed preferred alternative cannot override open fallback',()=>{
  const explicit={dateTime:{state:'KNOWN',localDate:'2026-10-11',dayPhase:null,timeZone:'Europe/Zurich'}};
  const r=execute(fixture({preferred:true,explicit}),[world(ids[0],'CAFE',{hours:true}),world(ids[1],'MUSEUM',{hours:true,closed:true})]);
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates.find(c=>c.spotId===ids[1]).rank,null);
});
test('preferred unverified opening cannot displace confirmed fallback',()=>{
  const explicit={dateTime:{state:'KNOWN',localDate:'2026-10-11',dayPhase:null,timeZone:'Europe/Zurich'}};
  const r=execute(fixture({preferred:true,explicit}),[world(ids[0],'CAFE',{hours:true}),world(ids[1],'MUSEUM')]);
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates.find(c=>c.spotId===ids[1]).tier,'UNCONFIRMED_FALLBACK');
});
test('local cafe budget does not constrain museum',()=>{
  const r=execute(fixture({localBudget:true}),[world(ids[0],'CAFE',{price:20}),world(ids[1],'MUSEUM',{price:25})]);
  assert.equal(r.primaryCandidateId,ids[1]);assert.equal(r.candidates.find(c=>c.spotId===ids[0]).rank,null);
});
test('explicit access filter cannot be bypassed by preferred alternative',()=>{
  const r=execute(fixture({preferred:true,explicit:{hardConstraints:['ACCESSIBILITY_BASIC']}}),[world(ids[0],'CAFE',{accessible:true}),world(ids[1],'MUSEUM',{accessible:false})]);
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates.find(c=>c.spotId===ids[1]).rank,null);
});
test('explicit primary intent remains authoritative',()=>{
  const r=execute(fixture({preferred:true,explicit:{primaryIntent:'COFFEE'}}),[world(ids[0],'CAFE'),world(ids[1],'MUSEUM')]);
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates.find(c=>c.spotId===ids[1]).rank,null);
});
test('unsupported alternative leaves known cafe usable and uncertainty visible',()=>{
  const r=execute(fixture({preferred:true,unsupported:true}),[world(ids[0],'CAFE'),world(ids[1],'MUSEUM')]);
  assert.equal(r.primaryCandidateId,ids[0]);assert.ok(r.limitations.includes('VISIT_ALTERNATIVE_UNMAPPED'));assert.equal(r.candidates.find(c=>c.spotId===ids[0]).tier,'ELIGIBLE_CONFIRMED');
});
test('private alternative metadata is request-bound and tampering rejected',()=>{
  const i=fixture({preferred:true}),changed={...i.understanding,visitAlternatives:i.understanding.visitAlternatives.map(b=>({...b,preferred:!b.preferred}))};
  assert.throws(()=>validateProductUnderstanding(changed,i.request),/binding_invalid/);
});
test('full-city production retrieval covers both intents in one authenticated call',async()=>{
  const i=fixture(),calls=[];
  const rpc={rpc:async(name,args)=>{calls.push(args.p_primary_intent);return {error:null,data:{contractVersion:'backyrd.decision-vnext.product-runtime-context@1.0',authorizedCity:'Zurich',serverTime:at,status:'NO_CONSENT',worldSnapshots:[worldBinding(ids[0],'CAFE'),worldBinding(ids[1],'MUSEUM')]}};}};
  const result=await createDecisionProductRpcEvaluationProvider(rpc).evaluate({request:i.request,understanding:i.understanding,actor,identity:{releaseHash:'a'.repeat(64),artifactHash:'b'.repeat(64),sourceSetHash:'c'.repeat(64),controlGeneration:1},signal:new AbortController().signal});
  assert.deepEqual(calls,[null]);assert.equal(result.evaluation.candidates.length,2);
});
test('unmapped third choice does not erase a confirmed preferred branch',()=>{
  const i=fixture({preferred:true,thirdUnsupported:true});
  const r=execute(i,[world(ids[0],'CAFE'),world(ids[1],'MUSEUM')]);
  assert.equal(r.primaryCandidateId,ids[1]);assert.equal(r.candidates[0].tier,'ELIGIBLE_CONFIRMED');assert.equal(r.candidates[0].rankVector.contextFit.preferredAlternativeConfirmed,true);
  assert.ok(r.limitations.includes('VISIT_ALTERNATIVE_UNMAPPED'));
});

test('global facet group cannot be widened into OR by local group IDs',()=>{
  const r=execute(fixture({preferred:true,explicit:{hardConstraints:['WK_REQUIRED:G1:classification.place_types:CAFE']}}),[world(ids[0],'CAFE'),world(ids[1],'MUSEUM')]);
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates.find(c=>c.spotId===ids[1]).rank,null);
});
test('same spot matching multiple alternatives is returned exactly once',()=>{
  const i=fixture();const branch=i.understanding.visitAlternatives[0];
  const alternatives=[branch,{...branch,id:'A2',preferred:true}];
  const understanding=bindProductUnderstanding(i.request,i.understanding.requirements,'MEANING_PLAN',undefined,alternatives);
  const r=execute({request:i.request,understanding},[world(ids[0],'CAFE')]);
  assert.equal(r.candidates.length,1);assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates[0].rankVector.contextFit.preferredAlternativeConfirmed,true);
});

test('targets-only Museum and Cinema activities retain both alternatives',()=>{
  const i=fixture();const text=i.request.naturalLanguage;const meaning=parseProductRequestMeaning({summary:'Café oder Museum',activities:[{id:'A1',description:'Café',status:'REQUESTED',alternativeGroup:'R1',condition:null,afterActivityId:null,replacesActivityId:null,evidence:['E1']},{id:'A2',description:'Museum',status:'REQUESTED',alternativeGroup:'R1',condition:null,afterActivityId:null,replacesActivityId:null,evidence:['E1']}],participants:[],constraints:[],uncertainties:[]},text,{E1:text});
  const plan=bindProductMeaningSearchPlan(i.request,meaning,{mappings:[{sourceId:'A1',state:'MAPPED',intent:null,targets:[target('classification.place_types','CAFE')]},{sourceId:'A2',state:'MAPPED',intent:null,targets:[target('classification.place_types','MUSEUM')]}]},{E1:text});
  const mapped=projectProductMeaningSearchPlan(i.request,plan);assert.deepEqual(mapped.understanding.visitAlternatives.map(b=>b.intent),['COFFEE','CULTURE_ART']);
  assert.equal(execute(mapped,[world(ids[0],'CAFE'),world(ids[1],'MUSEUM')]).candidates.filter(c=>c.rank!==null).length,2);
});

test('Mobile accepts the actual alternatives response and rejects malformed preference metadata',()=>{
  const i=fixture({preferred:true}),r=execute(i,[world(ids[0],'CAFE'),world(ids[1],'MUSEUM')]);
  assert.equal(validateDecisionProductResponse(r,i.request),r);
  const altered={...r,interpretation:{...r.interpretation,visitAlternatives:[{...r.interpretation.visitAlternatives[0],preferred:'yes'}]}};
  assert.throws(()=>validateDecisionProductResponse(altered,i.request),/visit_alternatives_invalid/);
});

test('identical destinations inside all alternatives override a profile fallback before retrieval',()=>{
  const naturalLanguage='Museum oder Kino in Basel, beide mit stufenlosem Eingang.';
  const request={...fixture().request,naturalLanguage,explicit:{targetCity:'Zurich',targetCitySource:'PROFILE_DEFAULT'}};
  const activity=(id,description)=>({id,description,status:'REQUESTED',alternativeGroup:'R1',condition:null,afterActivityId:null,replacesActivityId:null,evidence:['E1']});
  const meaning=parseProductRequestMeaning({summary:'Ein Besuch in Basel.',activities:[activity('A1','Museum in Basel'),activity('A2','Kino in Basel')],participants:[],constraints:[],uncertainties:[]},naturalLanguage,{E1:naturalLanguage});
  const location={dimension:'LOCATION',value:{kind:'LOCATION',city:'Basel',role:'DESTINATION',reference:null},evidence:'E1'};
  const plan=bindProductMeaningSearchPlan(request,meaning,{mappings:[{sourceId:'A1',state:'MAPPED',intent:null,targets:[target('classification.place_types','MUSEUM'),location]},{sourceId:'A2',state:'MAPPED',intent:null,targets:[target('classification.place_types','CINEMA'),location]}]},{E1:naturalLanguage});
  const i=projectProductMeaningSearchPlan(request,plan);
  assert.equal(i.understanding.requirements.find(row=>row.dimension==='LOCATION').value.city,'Basel');
  assert.ok(i.understanding.visitAlternatives.every(branch=>!branch.requirements.some(row=>row.dimension==='LOCATION')));
});
