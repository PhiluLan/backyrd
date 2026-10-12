import test from 'node:test';
import assert from 'node:assert/strict';
import { contentHash, parseProductRequestMeaning, bindProductMeaningSearchPlan, projectProductMeaningSearchPlan, bindProductUnderstanding, parseModelRequirements, requestedProductCity } from '../../dist/index.js';
import { parseProductWorldResolverBinding } from '../../dist/product-world-resolver-binding.js';
import { fixture, ids, worldBinding, execute } from './visit-fixtures.mjs';
const friday='2026-10-16T10:00:00.000Z';
function timeFixture({ clocks=false, undated=false, bounded=false, optional=false, budget=false, explicit={} }={}) {
  const relation=bounded?'nach':'um';
  const text=undated?'Museum vormittags oder lieber nachmittags in Zürich.':clocks?`Museum in Zürich entweder Samstag ${relation} 23:30 oder lieber Sonntag ${relation} 00:30.`:'Museum in Zürich entweder Samstagvormittag oder lieber Sonntagnachmittag.';
  const request={...fixture().request,naturalLanguage:budget?text+' Maximal 30 CHF pro Person.':optional?'Ich suche ein Museum in Zürich. Am liebsten Samstagvormittag oder Sonntagnachmittag, aber andere Zeiten gehen auch.':text,explicit:{targetCity:'Zurich',...explicit}};
  const activity={id:'A1',description:'Museum besuchen',status:'REQUESTED',alternativeGroup:null,condition:null,afterActivityId:null,replacesActivityId:null,evidence:['E1']};
  const node=(id,status,description)=>({id,status,description,aspect:'TIME',activityIds:['A1'],participantIds:[],comparison:null,numericValue:null,costComponents:[],unit:null,basis:null,alternativeGroup:'R1',condition:null,evidence:['E1']});
  const participants=budget?[{id:'P1',role:'anfragende Person',entityType:'PERSON',participation:'CONFIRMED',quantity:null,age:null,ageTiming:'UNKNOWN',ageTimeReference:null,memberOfParticipantId:null,evidence:['E1']}]:[];
  const budgetNode=budget?[{...node('C3','REQUESTED','maximal 30 CHF pro Person'),aspect:'BUDGET',alternativeGroup:null,participantIds:['P1'],comparison:'LTE',numericValue:30,costComponents:[],unit:'CHF',basis:'pro Person'}]:[];
  const meaning=parseProductRequestMeaning({summary:'Ein Museum zu einem von zwei Terminen.',activities:[activity],participants,constraints:[...budgetNode,node('C1',optional?'OPTIONAL':'REQUESTED',clocks?`Samstag ${relation} 23:30`:undated?'vormittags':'Samstagvormittag'),node('C2','OPTIONAL',clocks?`lieber Sonntag ${relation} 00:30`:undated?'lieber nachmittags':'lieber Sonntagnachmittag')],uncertainties:[]},request.naturalLanguage,{E1:request.naturalLanguage});
  const value=(weekday,dayPhase,clockTime)=>({kind:'TIME',openNow:false,localDate:null,relativeDays:null,weekday:undated?null:weekday,dayPhase:clocks?null:dayPhase,clockTime, ...(bounded?{clockRelation:'AFTER'}:{})});
  const mappings=[{sourceId:'A1',state:'MAPPED',intent:'CULTURE_ART',targets:[{dimension:'EXPERIENCE',value:{kind:'FACET',key:'classification.place_types',value:'MUSEUM'},evidence:'E1'}]},
    {sourceId:'C1',state:'MAPPED',intent:null,targets:[{dimension:'TIME',value:value(6,'MORNING',clocks?'23:30':null),evidence:'E1'}]},
    {sourceId:'C2',state:'MAPPED',intent:null,targets:[{dimension:'TIME',value:value(0,'AFTERNOON',clocks?'00:30':null),evidence:'E1'}]}];
  if(budget){mappings.push({sourceId:'C3',state:'MAPPED',intent:null,targets:[{dimension:'BUDGET',value:{kind:'BUDGET',amountMinor:3000,currency:'CHF',comparison:'LTE',basis:'PER_PERSON',includes:[]},evidence:'E1'}]});}
  return projectProductMeaningSearchPlan(request,bindProductMeaningSearchPlan(request,meaning,{mappings},{E1:request.naturalLanguage}));
}
function timedWorld(id,{ saturday=null,sunday=null,special=[],state=null,timezone="Europe/Zurich" }={}) {
  const binding=worldBinding(id,'MUSEUM');
  binding.decisionProjection.facts.find(row=>row.key==='location.timezone').value=timezone;
  if(state)binding.decisionProjection.facts.push({key:'state.current',scope:'SPOT',resolution:'KNOWN_VALUE',freshness:'CURRENT',trust:'VERIFIED',basisClaimHashes:[contentHash(state)],validityVerified:true,...state});
  const fact=(key,value)=>({key,value,scope:'SPOT',resolution:'KNOWN_VALUE',freshness:'CURRENT',trust:'VERIFIED',basisClaimHashes:[contentHash({key,value})]});
  const regular=[];if(saturday!==null)regular.push({day:'SATURDAY',intervals:saturday});if(sunday!==null)regular.push({day:'SUNDAY',intervals:sunday});
  if(regular.length)binding.decisionProjection.facts.push(fact('hours.regular',regular));
  if(special.length)binding.decisionProjection.facts.push(fact('hours.special',special));
  binding.manifestHash=contentHash(binding.decisionProjection);
  return parseProductWorldResolverBinding(binding,'Zurich');
}
const interval=(start,end)=>[{start,end}];
test('day and phase stay paired; confirmed preferred Sunday ranks first',()=>{
  const r=execute(timeFixture(),[timedWorld(ids[0],{saturday:interval('09:00','11:00'),sunday:[]}),timedWorld(ids[1],{saturday:[],sunday:interval('14:00','17:00')})],friday);
  assert.equal(r.primaryCandidateId,ids[1]);assert.equal(r.candidates.filter(c=>c.rank!==null).length,2);
  assert.ok(r.candidates[0].reasons.some(reason=>reason.code==='visit-time-alternative-confirmed'&&reason.confirmed&&reason.statement.includes('2026-10-18')));
});
test('closed preferred Sunday does not veto valid Saturday',()=>{
  const r=execute(timeFixture(),[timedWorld(ids[0],{saturday:interval('09:00','11:00'),sunday:[]})],friday);
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates[0].tier,'ELIGIBLE_CONFIRMED');assert.equal(r.candidates[0].rankVector.contextFit.preferredAlternativeConfirmed,false);
});
test('unknown preferred Sunday cannot displace confirmed Saturday',()=>{
  const r=execute(timeFixture(),[timedWorld(ids[0],{saturday:interval('09:00','11:00')})],friday);
  assert.equal(r.candidates[0].tier,'ELIGIBLE_CONFIRMED');assert.equal(r.candidates[0].rankVector.contextFit.preferredAlternativeConfirmed,false);
});
test('special closure overrides regular Sunday opening',()=>{
  const r=execute(timeFixture(),[timedWorld(ids[0],{saturday:interval('09:00','11:00'),sunday:interval('14:00','17:00'),special:[{date:'2026-10-18',status:'CLOSED',intervals:[]}]})],friday);
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates[0].rankVector.contextFit.preferredAlternativeConfirmed,false);
});
test('special opening overrides regular Sunday closure',()=>{
  const r=execute(timeFixture(),[timedWorld(ids[0],{saturday:[],sunday:[],special:[{date:'2026-10-18',status:'OPEN',intervals:interval('14:00','17:00')}]})],friday);
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates[0].rankVector.contextFit.preferredAlternativeConfirmed,true);
});
test('Saturday afternoon plus Sunday morning cannot combine into a match',()=>{
  const r=execute(timeFixture(),[timedWorld(ids[0],{saturday:interval('14:00','17:00'),sunday:interval('09:00','11:00')})],friday);
  assert.equal(r.primaryCandidateId,null);assert.equal(r.candidates[0].rank,null);
});
test('one spot matching both windows produces one result',()=>{
  const r=execute(timeFixture(),[timedWorld(ids[0],{saturday:interval('09:00','11:00'),sunday:interval('14:00','17:00')})],friday);
  assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].rankVector.contextFit.preferredAlternativeConfirmed,true);
});
test('precise point after midnight uses Sunday carry-over from Saturday',()=>{
  const r=execute(timeFixture({clocks:true}),[timedWorld(ids[0],{saturday:interval('22:00','02:00'),sunday:[]})],friday);
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates[0].tier,'ELIGIBLE_CONFIRMED');assert.equal(r.candidates[0].rankVector.contextFit.preferredAlternativeConfirmed,true);
});
test('exact end of overnight opening is excluded',()=>{
  const r=execute(timeFixture({clocks:true}),[timedWorld(ids[0],{saturday:interval('22:00','00:30'),sunday:[]})],friday);
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates[0].rankVector.contextFit.preferredAlternativeConfirmed,false);
});
test('explicit access veto applies in both time windows',()=>{
  const binding=worldBinding(ids[0],'MUSEUM',{accessible:false});
  binding.decisionProjection.facts.push({key:'hours.regular',value:[{day:'SATURDAY',intervals:interval('09:00','11:00')},{day:'SUNDAY',intervals:interval('14:00','17:00')}],scope:'SPOT',resolution:'KNOWN_VALUE',freshness:'CURRENT',trust:'VERIFIED',basisClaimHashes:[contentHash('hours')]});binding.manifestHash=contentHash(binding.decisionProjection);
  const r=execute(timeFixture({explicit:{hardConstraints:['ACCESSIBILITY_BASIC']}}),[parseProductWorldResolverBinding(binding,'Zurich')],friday);
  assert.equal(r.primaryCandidateId,null);
});
test('a time bound is not silently interpreted as an exact arrival point',()=>{
  const r=execute(timeFixture({clocks:true,bounded:true}),[timedWorld(ids[0],{saturday:interval('22:00','02:00'),sunday:[]})],friday);
  assert.equal(r.primaryCandidateId,null);
});

test('undated time alternatives do not invent a calendar day or confirmed availability',()=>{
  const r=execute(timeFixture({undated:true}),[timedWorld(ids[0],{saturday:interval('09:00','11:00'),sunday:interval('14:00','17:00')})],friday);
  assert.equal(r.primaryCandidateId,null);assert.ok(r.candidates[0].unknownHardConstraints.includes('VISIT_TIME_UNVERIFIED'));
});

test('passed Saturday morning is not recommended or silently moved to next week',()=>{
  const r=execute(timeFixture(),[timedWorld(ids[0],{saturday:interval('09:00','11:00'),sunday:[]})],'2026-10-17T12:00:00.000Z');
  assert.equal(r.primaryCandidateId,null);assert.ok(r.candidates[0].failedHardConstraints.includes('VISIT_TIME_PAST'));
});
test('same-day opening that has already ended cannot confirm a future visit today',()=>{
  const r=execute(timeFixture(),[timedWorld(ids[0],{saturday:interval('09:00','11:00'),sunday:[]})],'2026-10-17T09:30:00.000Z');
  assert.equal(r.primaryCandidateId,null);
});

test('fully covered exact points are confirmed closed, not unknown',()=>{
  const r=execute(timeFixture({clocks:true}),[timedWorld(ids[0],{saturday:interval('22:00','02:00'),sunday:[],state:{value:{kind:'CLOSED',scope:'VENUE'},validFrom:'2026-10-17T21:00:00.000Z',validUntil:'2026-10-17T23:00:00.000Z'}})],friday);
  assert.equal(r.primaryCandidateId,null);assert.equal(r.candidates[0].tier,'INELIGIBLE');assert.equal(r.candidates[0].actualAvailability,'closed');
  assert.ok(r.candidates[0].failedHardConstraints.includes('ACTUAL_AVAILABILITY'));
});
test('a partial closure leaves a broad window unverified without inventing an arrival',()=>{
  const r=execute(timeFixture(),[timedWorld(ids[0],{saturday:[],sunday:interval('14:00','17:00'),state:{value:{kind:'CLOSED',scope:'VENUE'},validFrom:'2026-10-18T13:00:00.000Z',validUntil:'2026-10-18T14:00:00.000Z'}})],friday);
  assert.equal(r.primaryCandidateId,null);assert.ok(r.candidates[0].unknownHardConstraints.includes('VISIT_TIME_UNVERIFIED'));
});
test('optional timing stays preferred and cannot block the required museum',()=>{
  const i=timeFixture({optional:true});
  assert.equal(i.understanding.visitAlternatives,undefined);
  assert.equal(i.understanding.requirements.filter(row=>row.dimension==='TIME').every(row=>row.importance==='PREFERRED'),true);
  const r=execute(i,[timedWorld(ids[0],{saturday:[],sunday:[]})],friday);
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates[0].tier,'ELIGIBLE_CONFIRMED');
});
test('unknown timezone does not claim checked local slots',()=>{
  const r=execute(timeFixture(),[timedWorld(ids[0],{saturday:interval('09:00','11:00'),sunday:interval('14:00','17:00'),timezone:'America/New_York'})],friday);
  assert.equal(r.primaryCandidateId,null);
});

test('verified current OPEN wins over ended regular hours for a visit now',()=>{
  const base=fixture().request;
  const request={...base,naturalLanguage:'Museum jetzt heute Nachmittag in Zürich',explicit:{targetCity:'Zurich',primaryIntent:'CULTURE_ART',dateTime:{state:'KNOWN',localDate:'2026-10-17',dayPhase:'AFTERNOON',timeZone:'Europe/Zurich'},hardConstraints:['OPEN_NOW']}};
  const i={request,understanding:bindProductUnderstanding(request,[],'MEANING_PLAN')};
  const r=execute(i,[timedWorld(ids[0],{saturday:interval('14:00','15:00'),state:{value:{kind:'OPEN',scope:'VENUE'},validFrom:'2026-10-17T12:00:00.000Z',validUntil:'2026-10-17T15:00:00.000Z'}})],'2026-10-17T13:30:00.000Z');
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates[0].actualAvailability,'open');
  assert.equal(r.candidates[0].failedHardConstraints.includes('VISIT_TIME_PAST'),false);
});
test('a future valid Sunday remains selectable after Saturday has passed',()=>{
  const r=execute(timeFixture(),[timedWorld(ids[0],{saturday:interval('09:00','11:00'),sunday:interval('14:00','17:00')})],'2026-10-17T12:00:00.000Z');
  assert.equal(r.primaryCandidateId,ids[0]);assert.equal(r.candidates[0].rankVector.contextFit.preferredAlternativeConfirmed,true);
});
test('repeated DST clock cannot assert a unique arrival',()=>{
  const i=timeFixture({clocks:true});
  const requirements=i.understanding.requirements;
  const branches=i.understanding.visitAlternatives.map(b=>({...b,requirements:b.requirements.map(q=>({...q,value:{...q.value,weekday:null,localDate:'2026-10-25',clockTime:'02:30'}}))}));
  const understanding=bindProductUnderstanding(i.request,requirements,'MEANING_PLAN',undefined,branches);
  const r=execute({...i,understanding},[timedWorld(ids[0],{saturday:interval('22:00','04:00'),sunday:[]})],'2026-10-23T10:00:00.000Z');
  assert.equal(r.primaryCandidateId,null);assert.ok(r.candidates[0].unknownHardConstraints.includes('VISIT_TIME_UNVERIFIED'));
});

test('sole participant per-person budget is retained and applies to every slot',()=>{
  const i=timeFixture({budget:true});assert.ok(i.understanding.requirements.some(row=>row.value?.kind==='BUDGET'&&row.value.amountMinor===3000));
  const binding=worldBinding(ids[0],'MUSEUM',{price:31});
  binding.decisionProjection.facts.push({key:'hours.regular',value:[{day:'SATURDAY',intervals:interval('09:00','11:00')},{day:'SUNDAY',intervals:interval('14:00','17:00')}],scope:'SPOT',resolution:'KNOWN_VALUE',freshness:'CURRENT',trust:'VERIFIED',basisClaimHashes:[contentHash('hours')]});binding.manifestHash=contentHash(binding.decisionProjection);
  const r=execute(i,[parseProductWorldResolverBinding(binding,'Zurich')],friday);
  assert.equal(r.primaryCandidateId,null);assert.ok(r.candidates[0].failedHardConstraints.includes('BUDGET_MAXIMUM'));
});
test('grounded Bâle remains a public destination and resolves to Basel',()=>{
  const text='Un musée à Bâle.';
  const requirements=parseModelRequirements([{dimension:'LOCATION',importance:'ESSENTIAL',operator:'REQUIRE',origin:'EXPLICIT',interpretationState:'UNDERSTOOD',value:{kind:'LOCATION',city:'Bâle'},alternatives:[],group:null,evidence:text}],text);
  const request={...fixture().request,naturalLanguage:text,explicit:{targetCity:'Zurich',targetCitySource:'PROFILE_DEFAULT'}};
  assert.equal(requestedProductCity(bindProductUnderstanding(request,requirements,'MEANING_PLAN'),request),'Basel');
});
