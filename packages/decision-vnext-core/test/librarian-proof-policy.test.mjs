import test from 'node:test';
import assert from 'node:assert/strict';
import {fact,request,profile,offer,area,prop,binding,search,date,evening,worldFact,meal} from './librarian-matching-fixtures.mjs';
import {exercise} from './librarian-active-route-fixtures.mjs';
const all=r=>[...r.ranked,...r.unresolved,...r.excluded];
const withoutHours=b=>({...b,decisionProjection:{...b.decisionProjection,facts:b.decisionProjection.facts.filter(f=>!f.key.startsWith('hours.'))}});
const child=()=>fact('child','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2']);
const cases=[
 ['restaurant',()=>profile([offer('meal','DINNER')]),()=>meal()],
 ['museum',()=>profile([offer('visit','SELF_GUIDED_VISIT')],[area()],'MUSEUM'),()=>fact('visit','experience.activity','Museum besuchen')],
 ['movement',()=>profile([offer('play','MOVEMENT_PLAY')]),()=>fact('visit','experience.activity','Bewegungsspiel')],
 ['park',()=>profile([offer('walk','WALK')],[area()],'OUTDOOR_NATURE'),()=>fact('visit','experience.activity','Spazieren')],
];
for(const [name,make,visit] of cases) test(`${name}: contextual age does not invent a missing rule; a requested date still needs real availability`,async()=>{
 const b=binding(1400,make());
 const base=search(request([visit()]),[b]);assert.equal(base.ranked.length,1);
 const aged=search(request([visit(),child()]),[b]);assert.equal(aged.ranked.length,1);
 assert.equal(aged.ranked[0].decisionProof.semanticFit,'SUPPORTED');
 assert.equal(aged.ranked[0].decisionProof.access,'NOT_REQUESTED');
 assert.equal(aged.ranked[0].decisionProof.entries.find(e=>e.reason==='CHILD_ENTRY_RULE_NOT_DOCUMENTED').blocking,false);
 const q=request([visit(),child(),date()]);
 const dated=search(q,[b]);assert.equal(dated.ranked.length,1);
 const missing=withoutHours(b),unresolved=search(q,[missing]);assert.equal(unresolved.ranked.length,0);
 const c=all(unresolved)[0];assert.equal(c.decisionProof.semanticFit,'SUPPORTED');assert.equal(c.decisionProof.availability,'UNRESOLVED');
 assert.ok(!c.unknownFactIds.some(id=>id.includes('CHILD_ENTRY')));
 const http=await exercise({text:`${name} morgen mit vierjährigem Kind`,meaning:q,catalog:[missing]});
 assert.equal(http.status,200);assert.equal(http.body.primaryCandidateId,null);
 assert.equal(http.body.candidates[0].coreIntentCoverage,'CONFIRMED');
 assert.equal(http.body.candidates[0].actualAvailability,'unknown');assert.equal(http.body.candidates[0].rank,null);
});

test('the source of every blocking check remains visible; an unknown requested property is not turned into context',()=>{
 const q=request([meal(),fact('quiet','atmosphere.character','ruhig')]);
 const c=all(search(q,[binding(1401,profile())]))[0];
 assert.equal(c.decisionProof.semanticFit,'UNRESOLVED');
 assert.equal(c.decisionProof.entries.find(e=>e.factId==='quiet').origin,'USER_PLAN');
 assert.equal(c.decisionProof.entries.find(e=>e.factId==='quiet').blocking,true);
 assert.ok(c.decisionProof.unknownFactIds.includes('quiet'));
});

test('a known entry restriction blocks; an empty minimum-age field does not invent a restriction',()=>{
 for(const [value,state,reason,status] of [[6,'KNOWN','PARTICIPANT_BELOW_OFFER_MINIMUM_AGE','INELIGIBLE'],[null,'UNKNOWN','OFFER_MINIMUM_AGE_NOT_DOCUMENTED','CONFIRMED']]){
  const p=profile([offer('play','MOVEMENT_PLAY',['inside'],[prop('participation.minimum_age',value,{state})])]);
  const c=all(search(request([fact('play','experience.activity','Bewegungsspiel'),child()]),[binding(1402,p)]))[0];
  assert.equal(c.status,status);assert.ok(c.decisionProof.entries.some(e=>e.reason===reason&&e.blocking===(state==='KNOWN')&&e.origin==='VISIT_CHECK'));
 }
 const adultOnly=binding(1403,profile(),[worldFact('rule.age_access',{policy:'MINIMUM_AGE',minimumAge:18,appliesFromTime:null})]);
 const c=all(search(request([meal(),child()]),[adultOnly]))[0];
 assert.equal(c.status,'INELIGIBLE');assert.equal(c.decisionProof.access,'CONTRADICTED');
});

test('explicit venue and offer contradictions are found even when unrelated opening data is missing',()=>{
 const closure=worldFact('state.current',{kind:'CLOSED',scope:'VENUE'},{validityVerified:true,validFrom:null,validUntil:'2026-10-20T23:00:00Z'});
 const c=all(search(request([meal(),date()]),[withoutHours(binding(1404,profile(),[closure]))]))[0];
 assert.equal(c.status,'INELIGIBLE');assert.ok(c.facts.some(f=>f.reason==='VERIFIED_VENUE_CLOSURE'));
 const p=profile([{...offer(),schedule:[{weekday:4,start:'08:00',end:'10:00'}]}]);
 const early=all(search(request([meal(),date(),evening()]),[withoutHours(binding(1405,p))]))[0];
 assert.equal(early.status,'INELIGIBLE');assert.ok(early.facts.some(f=>f.reason==='OFFER_NOT_AVAILABLE_AT_REQUESTED_TIME'));
});

test('a supporting amenity does not establish the requested activity, but can qualify another actual activity',()=>{
 const p=profile([offer('dinner','DINNER')],[area('inside',[prop('amenity.playground',true)])]);
 const only=request([fact('play','offer.feature','Spielplatz')]);
 assert.equal(search(only,[binding(1406,p)]).ranked.length,0);
 const supporting=request([meal(),fact('play','offer.feature','Spielplatz')]);
 assert.equal(search(supporting,[binding(1406,p)]).ranked.length,1);
 const play=profile([offer('play','MOVEMENT_PLAY')],[area('inside',[prop('amenity.playground',true)])]);
 assert.equal(search(only,[binding(1407,play)]).ranked.length,1,'a real scoped play activity plus its specific facility is sufficient evidence');
});

test('alternative branches retain only their active duties and keep the meaning plan immutable',()=>{
 const q=request([meal(),fact('museum','experience.activity','Museum besuchen'),fact('quiet','atmosphere.character','ruhig','PREFERRED')],{logic:{kind:'ANY',strength:'REQUIRED',children:[{kind:'FACT',factId:'meal'},{kind:'FACT',factId:'museum'}]}});
 const before=JSON.stringify(q),c=search(q,[binding(1408,profile())]).ranked[0];
 assert.ok(c);assert.equal(c.decisionProof.entries.some(e=>e.factId==='museum'),false);
 assert.equal(JSON.stringify(q),before);assert.deepEqual(c.decisionProof.unknownFactIds,[]);
});

test('an unresolved condition on a documented age restriction is a real prerequisite',()=>{
 const p=profile([offer('play','MOVEMENT_PLAY',['inside'],[prop('participation.minimum_age',6,{conditions:{weekdays:[4],dayparts:[],validFrom:null,validUntil:null,event:null}})])]);
 const c=all(search(request([fact('play','experience.activity','Bewegungsspiel'),child()]),[binding(1409,p)]))[0];
 assert.equal(c.status,'PARTIAL');assert.ok(c.decisionProof.entries.some(e=>e.reason==='OFFER_MINIMUM_AGE_CONDITIONS_UNRESOLVED'&&e.blocking));
});

test('unknown weather branches keep separate proofs and never turn one branch failure into universal rejection',()=>{
 const q=request([meal(),fact('museum','experience.activity','Museum besuchen')],{weatherConditions:[{id:'w1',role:'CONDITIONAL',state:'RAIN',basis:'EXPLICIT',subjectIds:[],detail:null}],logic:{kind:'IF',conditionFactId:'w1',then:{kind:'FACT',factId:'meal'},else:{kind:'FACT',factId:'museum'}}});
 const c=all(search(q,[binding(1410,profile())]))[0];
 assert.equal(c.status,'PARTIAL');assert.equal(c.decisionProof.semanticFit,'UNRESOLVED');
 assert.equal(c.decisionProof.requirements,'UNRESOLVED');
 assert.ok(c.decisionProof.entries.some(e=>e.factId==='condition:w1'&&e.blocking));
 assert.ok(c.decisionProof.entries.filter(e=>e.factId!=='condition:w1').every(e=>typeof e.branchProofHash==='string'));
});

test('documented age rules use the known party, not an invented duty for a complete age/headcount form',()=>{
 const q=request([meal(),child(),fact('self','people.role','self','CONTEXT',['p1']),fact('companion','people.relationship','adult_accompanied','CONTEXT',[])]);
 const restriction=minimumAge=>worldFact('rule.age_access',{policy:'MINIMUM_AGE',minimumAge,appliesFromTime:null});
 const admitted=search(q,[binding(1411,profile(),[restriction(3)])]).ranked[0];
 assert.ok(admitted);assert.equal(admitted.decisionProof.access,'SUPPORTED');
 const rejected=search(q,[binding(1412,profile(),[restriction(6)])]);
 assert.equal(rejected.ranked.length,0);assert.ok(rejected.excluded[0].facts.some(f=>f.reason==='PARTICIPANT_BELOW_VERIFIED_MINIMUM_AGE'));
 const extraPerson=request([...q.raw.facts,fact('other','people.relationship','son','CONTEXT',['p3'])],{entities:[...q.raw.entities,{id:'p3',kind:'PERSON',label:'weiteres Kind',members:[]}]});
 const incomplete=search(extraPerson,[binding(1413,profile(),[restriction(3)])]);
 assert.equal(incomplete.ranked.length,0);assert.ok(incomplete.unresolved[0].facts.some(f=>f.reason==='PARTICIPANT_AGE_COVERAGE_INCOMPLETE'));
});

test('venue-hour fallback preserves the meaning of meal services without inventing precise opening times',()=>{
 const q=request([meal(),date(),evening()]);
 for(const kind of ['LUNCH','BREAKFAST','BRUNCH']){
  const p=profile([{...offer('service',kind),schedule:[]}]);
  const c=all(search(q,[binding(1420,p)]))[0];
  assert.equal(c.status,'PARTIAL',kind);assert.equal(c.decisionProof.experience,'SUPPORTED');
  assert.ok(c.facts.some(f=>f.reason==='INHERITED_HOURS_DO_NOT_CONFIRM_SERVICE_PERIOD'),kind);
 }
 const dinner=profile([{...offer('dinner','DINNER'),schedule:[]}]);
 assert.equal(search(q,[binding(1421,dinner)]).ranked.length,1);
 const allDay=profile([offer('all-day-breakfast','BREAKFAST')]);
 assert.equal(search(q,[binding(1422,allDay)]).ranked.length,1,'an explicit schedule can substantiate an unusual service period');
 const specified=profile([{...offer('service','BREAKFAST',['inside'],[prop('experience.activity','essen gehen',{conditions:{weekdays:[],dayparts:['EVENING'],validFrom:null,validUntil:null,event:null}})]),schedule:[]}]);
 assert.equal(search(q,[binding(1423,specified)]).ranked.length,1,'explicit authored service dayparts take precedence');
 const both=profile([{...offer('lunch','LUNCH'),schedule:[]},{...offer('dinner','DINNER'),schedule:[]}]);
 const c=search(q,[binding(1424,both)]).ranked[0];assert.ok(c);assert.deepEqual(c.offerIds,['dinner']);
});

test('a relative price preference uses known price levels without inventing a cash limit or rejecting expensive alternatives',()=>{
 const q=request([meal(),fact('price','budget.qualitative','nicht zu teuer','PREFERRED')]);
 const good=binding(1430,profile(),[worldFact('operation.price_level','MEDIUM')]);
 const high=binding(1431,profile(),[worldFact('operation.price_level','HIGH')]);
 const missing=binding(1432,profile());
 const r=search(q,[high,missing,good]);assert.equal(r.ranked.length,3);
 assert.equal(r.ranked[0].spotId,good.decisionProjection.spotId);
 assert.equal(r.evaluationPlan.requirements.find(row=>row.factId==='price').support,'SUPPORTED');
 const proof=r.ranked[0].facts.find(f=>f.factId==='price');assert.equal(proof.state,'MET');assert.equal(proof.domainEvidence[0].details.monetaryBudgetInferred,false);
 assert.ok(r.ranked.find(c=>c.spotId===high.decisionProjection.spotId).facts.some(f=>f.factId==='price'&&f.state==='FAILED'&&f.modality==='PREFERRED'));
 assert.equal(search(request([meal(),fact('price','budget.qualitative','nicht zu teuer')]),[good]).ranked.length,0,'a required undefined price ceiling still needs clarification');
});
