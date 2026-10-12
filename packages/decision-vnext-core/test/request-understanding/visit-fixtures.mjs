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
  const constraints=localBudget?[{id:'C1',aspect:'BUDGET',description:'maximal 15 CHF pro Person',status:'REQUESTED',activityIds:['A1'],participantIds:[],comparison:'LTE',numericValue:15,costComponents:[],unit:'CHF',basis:'pro Person',alternativeGroup:null,condition:null,evidence:['E1']}]:[];
  const meaning=parseProductRequestMeaning({summary:'Ein Besuch, Café oder Museum.',activities:[activity('A1',cafe,'REQUESTED'),activity('A2',other,preferred?'OPTIONAL':'REQUESTED'),...(thirdUnsupported?[activity('A3','Teestube','OPTIONAL')]:[])],participants:[],constraints,uncertainties:[]},text,{E1:text});
  const mappings=[{sourceId:'A1',state:'MAPPED',intent:'COFFEE',targets:[target('classification.place_types','CAFE'),...(quiet?[target('context.atmosphere','QUIET','ATMOSPHERE')]:[])]},unsupported?{sourceId:'A2',state:'UNSUPPORTED',intent:null,targets:[]}:{sourceId:'A2',state:'MAPPED',intent:'CULTURE_ART',targets:[target('classification.place_types','MUSEUM')]}];
  if(thirdUnsupported)mappings.push({sourceId:'A3',state:'UNSUPPORTED',intent:null,targets:[]});
  if(localBudget)mappings.push({sourceId:'C1',state:'MAPPED',intent:null,targets:[{dimension:'BUDGET',value:{kind:'BUDGET',amountMinor:1500,currency:'CHF',comparison:'LTE',basis:'PER_PERSON',includes:[]},evidence:'E1'}]});
  return projectProductMeaningSearchPlan(request,bindProductMeaningSearchPlan(request,meaning,{mappings},{E1:text}));
}
const ids=['11111111-1111-4111-a111-111111111111','22222222-2222-4222-a222-222222222222','33333333-3333-4333-a333-333333333333'];
function worldBinding(id,type,{ quiet=null, price=null, closed=false, hours=false, accessible=null }={}) {
  const fact=(key,value,extra={})=>({key,value,scope:'SPOT',resolution:'KNOWN_VALUE',freshness:'CURRENT',trust:'VERIFIED',basisClaimHashes:[contentHash(key)],...(['context.atmosphere','operation.price_options','operation.price_range'].includes(key)?{validityVerified:true,validFrom:null,validUntil:null}:{}),...(key==='context.atmosphere'?{hardConstraintAuthorized:true}:{}),...extra});
  const facts=[fact('identity.name','Synthetic '+type),fact('location.locality','Zurich'),fact('location.timezone','Europe/Zurich'),fact('purpose.primary_visit',type==='CAFE'?'EAT_DRINK':'CULTURE_ARTS'),fact('classification.primary_category',type==='CAFE'?'COFFEE_DAYTIME':'CULTURE_ARTS'),fact('classification.place_types',[type])];
  if(quiet!==null)facts.push(fact('context.atmosphere',[{atmosphere:quiet?'QUIET':'LIVELY',conditions}]));
  if(price!==null)facts.push(fact('operation.price_range',{currency:'CHF',min:price,max:price}),fact('operation.price_options',[{purposes:[type==='CAFE'?'DRINK':'ADMISSION'],allOfferingsCovered:true,currency:'CHF',min:price,max:price,basis:'PER_PERSON',minimumAge:null,maximumAge:null,mandatoryFeesIncluded:true,conditions}]));
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
function execute(i,worlds,serverTime=at) {
  const p=projection(i.request),authority={authorizedCity:'Zurich',serverTime,locationBindingHash:contentHash('location')};
  const evaluated=evaluateProductWorldViews(i.request,authority,p,worlds,contentHash(worlds.map(w=>w.spot.spotId).sort()),i.understanding);
  return buildDecisionProductExecution({...evaluated,request:i.request,projection:p,actor,authority,evaluatorContractVersion:evaluated.evaluation.evaluatorVersion}).response;
}

export { at, actor, conditions, target, fixture, ids, worldBinding, world, projection, execute };
