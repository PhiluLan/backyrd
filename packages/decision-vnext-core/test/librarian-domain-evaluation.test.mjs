import test from 'node:test';
import assert from 'node:assert/strict';
import {fact,request,profile,offer,area,prop,binding,search,meal,date,evening,price,worldFact} from './librarian-matching-fixtures.mjs';
import {parseProductWorldResolverBinding} from '../dist/product-world-resolver-binding.js';
import {qualitativePriceEvidence} from '../dist/product-librarian-knowledge.js';
import {createLibrarianVisitWindow,librarianOfferAvailability} from '../dist/product-librarian-time.js';
import {exercise} from './librarian-active-route-fixtures.mjs';
const candidate=r=>[...r.ranked,...r.unresolved,...r.excluded][0];
const assessment=(r,id)=>candidate(r).facts.find(f=>f.factId===id);
const optional=()=>fact('booking','participation.booking','spontaneous','REQUIRED',[]);
const rule=mode=>worldFact('rule.reservation',{mode,minimumPartySize:null,days:[],fromTime:null,toTime:null});
const p=properties=>profile([offer('dinner','DINNER',['inside'],properties)],[area('inside',[prop('atmosphere.character','gemütlich')])]);

test('optional booking understands the actual authoring enum and three languages without promising a free seat',()=>{
 for(const label of ['Empfohlen','RECOMMENDED','reservation recommended','réservation conseillée']){
  const result=search(request([meal(),optional()]),[binding(1000,p([prop('participation.booking',label)]))]);
  assert.equal(result.ranked.length,1,label);
  const evidence=assessment(result,'booking');
  assert.equal(evidence.reason,'BOOKING_RECOMMENDED_NOT_MANDATORY');
  assert.equal(evidence.domainEvidence[0].details.guaranteesFreePlace,false);
 }
});
test('the canonical reservation rule remains readable when a scoped experience profile exists',()=>{
 const b=binding(1001,p([]),[rule('RECOMMENDED')]);
 const result=search(request([meal(),optional()]),[b]);
 assert.equal(result.ranked.length,1);
 assert.ok(assessment(result,'booking').domainEvidence[0].sourceKeys.includes('rule.reservation'));
});
test('optional drinks and a recommended tour cannot qualify a mandatory-booked meal',()=>{
 const data=profile([offer('dinner','DINNER',['inside'],[prop('participation.booking','Erforderlich')]),offer('drink','DRINKS',['inside'],[prop('participation.booking','Nicht erforderlich')]),offer('tour','GUIDED_TOUR',['inside'],[prop('participation.booking','Empfohlen')])]);
 const result=search(request([meal(),optional()]),[binding(1002,data)]);
 assert.equal(result.ranked.length,0);
 assert.equal(assessment(result,'booking').state,'FAILED');
 assert.deepEqual(assessment(result,'booking').offerIds,['dinner']);
});
test('specific offer rules override a venue default, but a same-scope conflict is not guessed away',()=>{
 const q=request([meal(),optional()]);
 assert.equal(search(q,[binding(1003,p([prop('participation.booking','Nicht erforderlich')]),[rule('REQUIRED')])]).ranked.length,1);
 const result=search(q,[binding(1004,p([prop('participation.booking','Erforderlich'),prop('participation.booking','Empfohlen')]))]);
 assert.equal(result.ranked.length,0);
 assert.equal(assessment(result,'booking').reason,'BOOKING_RULE_CONFLICT');
 assert.equal(assessment(result,'booking').diagnosis,'CONFLICTING_DATA');
});
test('an uninterpreted booking value and an absent rule have different diagnoses',()=>{
 const q=request([meal(),optional()]);
 assert.equal(assessment(search(q,[binding(1005,p([prop('participation.booking','Bitte nachfragen')]))]),'booking').diagnosis,'UNINTERPRETED_VALUE');
 assert.equal(assessment(search(q,[binding(1006,p([]))]),'booking').diagnosis,'MISSING_DATA');
});
test('group reservation conditions do not turn into unconditional admission',()=>{
 const extra=rule('REQUIRED');extra.value.minimumPartySize=8;
 const result=search(request([meal(),optional()]),[binding(1007,p([]),[extra])]);
 assert.equal(assessment(result,'booking').reason,'BOOKING_RULE_CONDITIONS_UNRESOLVED');
 assert.equal(result.ranked.length,0);
});
test('area atmosphere does not purchase or advertise an unrelated tour',async()=>{
 const data=profile([offer('drink','DRINKS'),{...offer('tour','GUIDED_TOUR'),name:'Führung'}],[area('inside',[prop('atmosphere.character','gemütlich')])],'BAR');
 const q=request([fact('bar','offer.kind','BAR'),fact('cozy','atmosphere.character','cozy')]);
 const b=binding(1008,data),result=search(q,[b]);
 assert.equal(result.ranked.length,1);
 assert.ok(!candidate(result).offerIds.includes('tour'));
 const response=await exercise({text:'Gemütliche Bar',meaning:q,catalog:[b]});
 assert.equal(response.status,200);
 assert.ok(!JSON.stringify(response.body.candidates[0].reasons).includes('Führung'));
});
test('typed cuisine and scoped meal meet in one witness, while a scoped unknown is respected',()=>{
 const extra=worldFact('offering.cuisines',['ITALIAN'],{hardConstraintAuthorized:true});
 const q=request([meal(),fact('cuisine','food.cuisine','italienisch','PREFERRED')]);
 assert.equal(assessment(search(q,[binding(1009,p([]),[extra])]),'cuisine').state,'MET');
 const required=search(request([meal(),fact('cuisine','food.cuisine','italienisch')]),[binding(1009,p([]),[extra])]);
 assert.equal(assessment(required,'cuisine').diagnosis,'SOURCE_NOT_AUTHORIZED');
 assert.equal(assessment(search(q,[binding(1010,p([prop('food.cuisine',null,{state:'UNKNOWN'})]),[extra])]),'cuisine').state,'UNKNOWN');
 const ambiguous=profile([offer('first','DINNER'),offer('second','LUNCH')]);
 assert.equal(assessment(search(q,[binding(1011,ambiguous,[extra])]),'cuisine').state,'UNKNOWN');
});
test('a missing evaluator is a software limitation before the venue is examined',()=>{
 const q=request([meal(),fact('wish','experience.occasion','romantisches Date')]);
 const result=search(q,[binding(1012,p([]))]);
 assert.equal(result.evaluationPlan.requirements.find(r=>r.factId==='wish').support,'UNSUPPORTED');
 assert.equal(assessment(result,'wish').diagnosis,'UNSUPPORTED_REQUIREMENT');
});
test('qualitative price requires an explicit product policy and never invents a CHF limit',()=>{
 const b=binding(1013,p([]),[worldFact('operation.price_level','MEDIUM')]);
 const world=parseProductWorldResolverBinding(b,'Basel');
 const f=request([fact('cheap','budget.qualitative','nicht zu teuer')]).facts[0];
 assert.equal(qualitativePriceEvidence(f,world,p([]),'CLARIFY')[0].reason,'QUALITATIVE_PRICE_POLICY_UNDEFINED');
 const evidence=qualitativePriceEvidence(f,world,p([]),'PRICE_LEVEL')[0];
 assert.equal(evidence.state,'MET');
 assert.equal(evidence.details.monetaryBudgetInferred,false);
 assert.equal(evidence.details.evidenceScope,'SPOT');
});
test('today evening cannot be satisfied by a kitchen that closed before the real request time',()=>{
 const b=binding(1014,p([]),[worldFact('hours.kitchen',[{day:'THURSDAY',intervals:[{start:'11:00',end:'19:00'}]}])]);
 const world=parseProductWorldResolverBinding(b,'Basel');
 const facts=request([date(),evening()]).facts;
 const visit=createLibrarianVisitWindow(facts,'Europe/Zurich','2026-10-15T18:07:00Z');
 assert.equal(visit.start,20*60+7);
 assert.equal(librarianOfferAvailability(p([]).offers[0],world,visit).state,'FAILED');
 const future=createLibrarianVisitWindow(facts,'Europe/Zurich','2026-10-14T18:07:00Z');
 assert.equal(librarianOfferAvailability(p([]).offers[0],world,future).state,'MET');
});
test('absent kitchen hours use the established venue-hours fallback',()=>{
 const b=binding(1015,p([]));
 const world=parseProductWorldResolverBinding(b,'Basel');
 const visit=createLibrarianVisitWindow(request([date(),evening()]).facts,'Europe/Zurich');
 assert.equal(librarianOfferAvailability(p([]).offers[0],world,visit).state,'MET');
});

test('music recorded only for a tour cannot describe an unrelated dinner',()=>{
 const data=profile([offer('dinner','DINNER'),offer('tour','GUIDED_TOUR',['inside'],[prop('atmosphere.music','Live Jazz')])]);
 const result=search(request([meal(),fact('music','atmosphere.music','Live Jazz')]),[binding(1016,data)]);
 assert.equal(result.ranked.length,0);
 assert.equal(assessment(result,'music').reason,'REQUIRED_DETAIL_NOT_PROVEN_FOR_SELECTED_OFFER');
});
test('a current kitchen closure leaves the drinks offer available',()=>{
 const closure=worldFact('state.current',{kind:'KITCHEN_CLOSED',scope:'VENUE'},{validityVerified:true,validFrom:null,validUntil:'2026-10-20T23:00:00Z'});
 const world=parseProductWorldResolverBinding(binding(1017,p([]),[closure]),'Basel');
 const visit=createLibrarianVisitWindow(request([date(),evening()]).facts,'Europe/Zurich');
 assert.equal(librarianOfferAvailability(offer(),world,visit).state,'FAILED');
 assert.equal(librarianOfferAvailability(offer('drink','DRINKS'),world,visit).state,'MET');
});

test('explicitly unresolved kitchen hours are not silently replaced by venue hours',()=>{
 const b=binding(1018,p([]),[worldFact('hours.kitchen',null,{resolution:'UNKNOWN'})]);
 b.decisionProjection.explicitUnknowns=[{key:'hours.kitchen',scope:'SPOT'}];
 const world=parseProductWorldResolverBinding(b,'Basel');
 const visit=createLibrarianVisitWindow(request([date(),evening()]).facts,'Europe/Zurich');
 assert.equal(librarianOfferAvailability(offer(),world,visit).reason,'KITCHEN_HOURS_EXPLICITLY_UNKNOWN');
 assert.equal(librarianOfferAvailability(offer('drink','DRINKS'),world,visit).state,'MET');
});

test('an explicit start time earlier today is not presented as a new future plan',()=>{
 const facts=request([date(),fact('start','time.clock_start',{time:'18:00',operator:'EQ',timezone:'Europe/Zurich'}),fact('end','time.clock_end',{time:'23:00',operator:'EQ',timezone:'Europe/Zurich'})]).facts;
 assert.equal(createLibrarianVisitWindow(facts,'Europe/Zurich','2026-10-15T18:07:00Z').expired,true);
});

test('a reservation wish for the party applies to its meal, not a nonexistent group offer',()=>{
 const f={...optional(),subjectIds:['g1']};
 const result=search(request([meal(),f]),[binding(1019,p([prop('participation.booking','Empfohlen')]))]);
 assert.equal(result.ranked.length,1);
 assert.deepEqual(assessment(result,'booking').offerIds,['dinner']);
});

test('missing offer hours inherit venue hours with traceable provenance',()=>{
 const data=profile([{...offer(),schedule:[]}]);
 const world=parseProductWorldResolverBinding(binding(1021,data),'Basel');
 const visit=createLibrarianVisitWindow(request([date(),evening()]).facts,'Europe/Zurich');
 const result=librarianOfferAvailability(data.offers[0],world,visit);
 assert.equal(result.state,'MET');
 assert.equal(result.reason,'OFFER_HOURS_INHERITED_FROM_VENUE');
 assert.ok(world.operationalRules.filter(r=>r.key==='hours.regular').every(r=>result.hashes.includes(r.entryHash)));
});
test('an explicit offer calendar does not inherit an unlisted weekday',()=>{
 const data=profile([{...offer(),schedule:[{weekday:3,start:'11:00',end:'23:00'}]}]);
 const world=parseProductWorldResolverBinding(binding(1022,data),'Basel');
 const result=librarianOfferAvailability(data.offers[0],world,createLibrarianVisitWindow(request([date(),evening()]).facts,'Europe/Zurich'));
 assert.equal(result.state,'UNKNOWN');
 assert.equal(result.reason,'OFFER_WEEKDAY_UNKNOWN');
});
test('venue fallback cannot extend an explicit morning-only offer into the evening',()=>{
 const data=profile([{...offer(),schedule:[{weekday:4,start:'08:00',end:'10:00'}]}]);
 const world=parseProductWorldResolverBinding(binding(1023,data),'Basel');
 assert.equal(librarianOfferAvailability(data.offers[0],world,createLibrarianVisitWindow(request([date(),evening()]).facts,'Europe/Zurich')).state,'FAILED');
});
test('inherited hours cannot reopen a closed venue or replace unknown venue hours',()=>{
 const data=profile([{...offer(),schedule:[]}]);
 const b=binding(1024,data);
 const check=()=>librarianOfferAvailability(data.offers[0],parseProductWorldResolverBinding(b,'Basel'),createLibrarianVisitWindow(request([date(),evening()]).facts,'Europe/Zurich'));
 b.decisionProjection.facts=b.decisionProjection.facts.filter(f=>f.key!=='hours.regular');
 assert.equal(check().state,'UNKNOWN');
 b.decisionProjection.facts.push(worldFact('hours.regular',[{day:'THURSDAY',intervals:[]}]));
 assert.equal(check().state,'FAILED');
});
test('a linked indoor area uses venue hours when its activity has no calendar',()=>{
 const data=profile([{...offer('play','MOVEMENT_PLAY'),schedule:[]}],[area('inside')],'SPORT');
 const b=binding(1025,data);
 b.decisionProjection.facts=b.decisionProjection.facts.map(f=>f.key==='classification.place_types'?worldFact(f.key,['SPORTS_CENTRE']):f);
 const result=search(request([fact('play','experience.activity','Bewegungsspiel'),fact('inside','offer.area','indoor'),date()]),[b]);
 assert.equal(result.ranked.length,1);
 assert.deepEqual(result.ranked[0].areaIds,['inside']);
});
test('meal inheritance still respects a separate kitchen closure',()=>{
 const data=profile([{...offer(),schedule:[]}]);
 const b=binding(1026,data,[worldFact('hours.kitchen',[{day:'THURSDAY',intervals:[{start:'11:00',end:'16:00'}]}])]);
 const result=search(request([meal(),date(),evening()]),[b]);
 assert.equal(result.ranked.length,0);
 assert.ok(result.excluded[0].facts.some(f=>f.reason==='KITCHEN_CLOSED_AT_REQUESTED_TIME'));
});


test('child outings distinguish child menus from a documented family museum visit',()=>{
 const q=request([fact('children','condition.children','children_activity'),fact('inside','offer.area','indoor')]);
 const brunch=profile([offer('brunch','BRUNCH',['inside'],[prop('condition.children','Kinderangebote')])]);
 assert.equal(search(q,[binding(1100,brunch)]).ranked.length,0);
 brunch.offers[0].name='Kinderangebote';
 assert.equal(search(q,[binding(1100,brunch)]).ranked.length,0);
 const museum=profile([offer('exhibition','PERMANENT_EXHIBITION',['inside'],[prop('experience.activity','Ausstellung besuchen'),prop('participation.age_suitability','Alle Altersgruppen')])],[area('inside',[prop('atmosphere.character','familienfreundlich')])],'MUSEUM');
 const result=search(q,[binding(1101,museum)]);
 assert.equal(result.ranked.length,1);
 assert.deepEqual(candidate(result).facts.find(f=>f.factId==='children').offerIds,['exhibition']);
 const noAge=structuredClone(museum);noAge.offers[0].properties=noAge.offers[0].properties.filter(p=>p.key!=='participation.age_suitability');
 assert.equal(search(q,[binding(1102,noAge)]).ranked.length,0);
 const noFamily=structuredClone(museum);noFamily.areas[0].properties=[];
 assert.equal(search(q,[binding(1103,noFamily)]).ranked.length,0);
 const wrongArea=structuredClone(museum);wrongArea.areas[0].properties=[];wrongArea.areas.push(area('terrace',[prop('atmosphere.character','familienfreundlich')]));
 assert.equal(search(q,[binding(1104,wrongArea)]).ranked.length,0);
 const adult=structuredClone(museum);adult.offers[0].properties.push(prop('participation.minimum_age',18));
 assert.equal(search(request([...q.raw.facts,fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p1'])]),[binding(1105,adult)]).ranked.length,0);
});
test('venue hours cannot erase structured recurring offer restrictions',()=>{
 const data=profile([{...offer('brunch','BRUNCH',['inside'],[prop('experience.activity','essen gehen',{conditions:{weekdays:[7],dayparts:['MORNING'],validFrom:null,validUntil:null,event:'Brunch'}})]),schedule:[]}]);
 const world=parseProductWorldResolverBinding(binding(1110,data),'Basel');
 const visit=createLibrarianVisitWindow(request([date()]).facts,'Europe/Zurich','2026-10-14T08:00:00Z');
 assert.equal(librarianOfferAvailability(data.offers[0],world,visit).state,'FAILED');
 assert.equal(librarianOfferAvailability(data.offers[0],world,visit).reason,'OFFER_ACTIVITY_OUTSIDE_CONDITIONS');
});
test('Basel region retains the real locality and does not erase a required exact destination',()=>{
 const q=request([fact('inside','offer.area','indoor')]);
 const b=binding(1120,profile());b.decisionProjection.facts.find(f=>f.key==='location.locality').value='Muttenz';
 assert.equal(search(q,[b]).ranked.length,1);
 assert.throws(()=>parseProductWorldResolverBinding(b,'Basel'),/locality_invalid/);
 assert.equal(search(request([...q.raw.facts,fact('destination','location.destination','Basel')]),[b]).ranked.length,0);
 const unrelated=structuredClone(b);unrelated.decisionProjection.facts.find(f=>f.key==='location.locality').value='Zürich';
 assert.throws(()=>search(q,[unrelated]),/locality_invalid/);
});

test('SQL and runtime authorize the identical bounded region',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {BASEL_DISCOVERY_LOCALITIES}=await import('../dist/product-librarian-geography.js');
 const sql=await readFile(new URL('../../../supabase/migrations/20261031090327_decision_regional_catalog_v1.sql',import.meta.url),'utf8');
 const declared=sql.match(/then array\[([^\]]+)\]::text\[\]/)[1].split(',').map(s=>s.slice(1,-1));
 assert.deepEqual(declared,BASEL_DISCOVERY_LOCALITIES);
});

test('an empty offer calendar inherits only within its documented activity daypart',()=>{
 const data=profile([{...offer('brunch','BRUNCH',['inside'],[prop('experience.activity','essen gehen',{conditions:{weekdays:[4],dayparts:['MORNING'],validFrom:null,validUntil:null,event:null}})]),schedule:[]}]);
 const world=parseProductWorldResolverBinding(binding(1111,data),'Basel');
 const visit=createLibrarianVisitWindow(request([date(),evening()]).facts,'Europe/Zurich','2026-10-14T08:00:00Z');
 assert.equal(librarianOfferAvailability(data.offers[0],world,visit).state,'FAILED');
});


test('an outdoor playground is read from its typed area or its explicit amenity, in one actual area',()=>{
 const q=request([fact('playground','offer.facility','playground'),fact('outside','offer.area','outdoor')]);
 const typed=profile([offer('play','MOVEMENT_PLAY',['playground'])],[{...area('playground'),kind:'PLAYGROUND'}],'OUTDOOR_NATURE');
 const result=search(q,[binding(1200,typed)]);assert.equal(result.ranked.length,1);assert.deepEqual(candidate(result).areaIds,['playground']);
 const amenity=profile([offer('play','MOVEMENT_PLAY',['garden'])],[{...area('garden',[prop('amenity.playground',true)]),kind:'OUTDOOR'}],'OUTDOOR_NATURE');
 assert.equal(search(q,[binding(1201,amenity)]).ranked.length,1);
 const absent=structuredClone(amenity);absent.areas[0].properties[0].value=false;assert.equal(search(q,[binding(1202,absent)]).ranked.length,0);
 const inside=structuredClone(typed);inside.areas[0].properties.push(prop('location.setting','drinnen'));inside.areas.push({...area('garden'),kind:'OUTDOOR'});inside.offers.push(offer('walk','WALK',['garden']));
 assert.equal(search(q,[binding(1203,inside)]).ranked.length,0,'outdoor elsewhere cannot relocate an indoor playground');
 const billiards=structuredClone(typed);billiards.offers[0].kind='OTHER';billiards.offers[0].name='Billard spielen';
 assert.equal(search(q,[binding(1204,billiards)]).ranked.length,0,'a legacy game-room area does not prove a playground');
 const unlocated=profile([offer('play','MOVEMENT_PLAY',['garden'])],[{...area('garden'),kind:'OUTDOOR'}],'OUTDOOR_NATURE');unlocated.properties.push(prop('offer.feature','Spielplatz'));
 assert.equal(search(q,[binding(1205,unlocated)]).ranked.length,0,'whole-venue facility presence does not locate it outdoors');
 const unknown=structuredClone(typed);unknown.areas[0].properties.push(prop('location.setting',null,{state:'UNKNOWN'}));
 assert.equal(search(q,[binding(1206,unknown)]).ranked.length,0);
});
test('a profile city is retrieval context while a genuinely required destination is retained',async()=>{
 const {librarianTargetCity}=await import('../dist/product-librarian-evaluator.js');
 const base={explicit:{targetCity:'Basel',targetCityRole:'SEARCH_CONTEXT'}};
 assert.equal(librarianTargetCity(base,request([fact('play','offer.facility','playground')])),'Basel');
 const elsewhere=request([fact('destination','location.destination','Zürich')]);
 assert.equal(librarianTargetCity(base,elsewhere),'Zurich');
 assert.throws(()=>librarianTargetCity({explicit:{targetCity:'Basel',targetCityRole:'REQUIRED_DESTINATION'}},elsewhere),/explicit_city_mismatch/);
 assert.throws(()=>librarianTargetCity({explicit:{targetCity:'Basel'}},elsewhere),/explicit_city_mismatch/);
});

test('a city-only retrieval cannot silently admit a neighboring locality',()=>{
 const b=binding(1210,profile());b.decisionProjection.facts.find(f=>f.key==='location.locality').value='Muttenz';
 assert.throws(()=>search(request([meal()]),[b],{authority:{city:'Basel',now:'2026-10-14T08:00:00Z',authorizedLocalities:['Basel']}}),/locality_invalid/);
 assert.throws(()=>search(request([meal()]),[binding(1211,profile())],{authority:{city:'Basel',now:'2026-10-14T08:00:00Z',authorizedLocalities:['Zürich']}}),/authority_region_invalid/);
});
