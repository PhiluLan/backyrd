import test from 'node:test';
import assert from 'node:assert/strict';
import {declaredExperienceConcepts,librarianConcept,EXPERIENCE_LANGUAGE_CONCEPTS,EXPERIENCE_QUESTIONS} from '@backyrd/world-knowledge-core';
import {LUNA_LIBRARIAN_FACT_KEYS} from '../dist/product-luna-librarian-assets.js';
import {librarianPropertySourceKeys} from '../dist/product-librarian-language.js';
import {fact,request,profile,offer,area,prop,binding as originalBinding,search,meal,date,evening,price,worldFact} from './librarian-matching-fixtures.mjs';
import {exercise} from './librarian-active-route-fixtures.mjs';
const binding=(id,p)=>{const b=originalBinding(id,p);return {...b,decisionProjection:{...b.decisionProjection,facts:b.decisionProjection.facts.map(f=>f.key==='classification.place_types'?worldFact(f.key,[({SPORT:'SPORTS_CENTRE',ACTIVITIES_PLAY:'ESCAPE_ROOM',WELLNESS_RELAXATION:'SAUNA',OUTDOOR_NATURE:'PARK'})[p.category]??p.category]):f)}};};
const candidate=r=>[...r.ranked,...r.unresolved,...r.excluded][0];
const state=(r,id)=>candidate(r).facts.find(f=>f.factId===id)?.state;

test('occasion context does not require an organised service, but an emitted duty stays binding',()=>{
 const b=binding(980,profile());
 const context=request([meal(),fact('occasion','experience.occasion','erstes Date','CONTEXT')]);
 assert.equal(search(context,[b]).ranked.length,1);
 const duty=request([meal(),fact('occasion','experience.occasion','erstes Date','REQUIRED')]);
 assert.equal(search(duty,[b]).ranked.length,0);
 assert.equal(state(search(duty,[b]),'occasion'),'UNKNOWN');
});

test('conversation uses explicit scoped atmosphere evidence, never quiet or another room alone',()=>{
 const q=request([meal(),fact('talk','atmosphere.conversation','conversation')]);
 const good=binding(981,profile([offer()],[area('inside',[prop('atmosphere.character','Unterhaltung gut möglich')])]));
 assert.equal(state(search(q,[good]),'talk'),'MET');
 assert.equal(search(q,[good]).ranked.length,1);
 const quiet=binding(982,profile([offer()],[area('inside',[prop('atmosphere.character','ruhig')])]));
 assert.equal(state(search(q,[quiet]),'talk'),'UNKNOWN');
 const split=binding(983,profile([offer('lunch','LUNCH',['inside'])],[area('inside'),area('other',[prop('atmosphere.character','Unterhaltung gut möglich')])]));
 assert.equal(search(q,[split]).ranked.length,0);
});

test('the real conversation field survives aliases and reaches HTTP ranking',async()=>{
 const q=request([fact('bar','offer.kind','BAR'),fact('cozy','atmosphere.character','cozy'),fact('talk','atmosphere.conversation','conversation'),fact('occasion','experience.occasion','erstes Date','CONTEXT')]);
 const p=profile([offer('drink','DRINKS')],[area('inside',[prop('atmosphere.character','gemütlich'),prop('atmosphere.conversation','Unterhaltung gut möglich')])],'BAR');
 const b=binding(990,p),r=search(q,[b]);
 assert.equal(r.ranked.length,1);
 const talk=candidate(r).facts.find(f=>f.factId==='talk');
 assert.equal(talk.state,'MET');assert.ok(talk.propertyRead.observedKeys.includes('atmosphere.conversation'));
 const http=await exercise({text:'Gemütliche Bar fürs erste Date, gut unterhalten können',meaning:q,catalog:[b]});
 assert.equal(http.status,200);assert.equal(http.body.primaryCandidateId,b.decisionProjection.spotId);
 assert.deepEqual(http.body.candidates[0].unknownHardConstraints,[]);
});

test('all request families retain their own source field when aliases or accepted links exist',()=>{
 for(const key of Object.values(LUNA_LIBRARIAN_FACT_KEYS).flat()){
  assert.ok(librarianPropertySourceKeys(key).includes(key),key);
  assert.ok(librarianPropertySourceKeys(key,['custom.detail']).includes(key),key);
 }
});

// Authoring -> request -> matching: exercise actual catalogue fields, not a
// second hand-written list of expected property names.
for(const question of EXPERIENCE_QUESTIONS.filter(q=>q.control==='TEXT'&&LUNA_LIBRARIAN_FACT_KEYS.TEXT.includes(q.key)))test(`authoring field roundtrip: ${question.key}`,()=>{
 const value=['stay.check_in','stay.check_out'].includes(question.key)?'14:00':'Belegter Prüfwert';
 const property=prop(question.key,value),scope=question.scopes.includes('SPOT')?'SPOT':question.scopes.includes('OFFER')?'OFFER':'AREA';
 const p=profile([offer('dinner','DINNER',['inside'],scope==='OFFER'?[property]:[])],[area('inside',scope==='AREA'?[property]:[])]);
 if(scope==='SPOT')p.properties=[property];
 const r=search(request([fact('value',question.key,value)]),[binding(991,p)]);
 assert.equal(state(r,'value'),'MET',JSON.stringify(candidate(r).facts));
 assert.equal(r.ranked.length,1);
 for(const [valueState,stored] of [['KNOWN',value==='14:00'?'15:00':'Anderer Prüfwert'],['UNKNOWN',null],['NOT_APPLICABLE',null]]){
  const changed=structuredClone(p),properties=scope==='SPOT'?changed.properties:scope==='OFFER'?changed.offers[0].properties:changed.areas[0].properties;
  properties[0]={...property,state:valueState,value:stored};
  const unsupported=search(request([fact('value',question.key,value)]),[binding(991,changed)]);
  assert.equal(state(unsupported,'value'),'UNKNOWN',`${question.key}: ${valueState}`);
  assert.equal(unsupported.ranked.length,0);
 }
});

test('conversation evidence distinguishes absence, unreadable meaning, unknown values and visit conditions',()=>{
 const q=request([fact('talk','atmosphere.conversation','conversation')]);
 const evaluate=properties=>candidate(search(q,[binding(992,profile([offer()],[area('inside',properties)]))])).facts[0];
 assert.equal(evaluate([]).reason,'PROPERTY_FAMILY_NOT_RECORDED');
 assert.equal(evaluate([prop('atmosphere.conversation',null,{state:'UNKNOWN'})]).reason,'PROPERTY_VALUE_NOT_KNOWN');
 assert.equal(evaluate([prop('atmosphere.conversation','Besonders')]).reason,'PROPERTY_VALUE_NOT_PROVEN');
 const dated=request([fact('talk','atmosphere.conversation','conversation'),date()]);
 const excluded=prop('atmosphere.conversation','Unterhaltung gut möglich',{conditions:{weekdays:[1],dayparts:[],event:null,validFrom:null,validUntil:null}});
 const r=search(dated,[binding(993,profile([offer()],[area('inside',[excluded])]))]);
 assert.equal(candidate(r).facts.find(f=>f.factId==='talk').reason,'PROPERTY_OUTSIDE_REQUESTED_CONDITIONS');
});

test('entry-mode and booking share exact meaning without admitting a required reservation',()=>{
 const q=request([meal(),fact('entry','participation.entry_mode','spontaneous')]);
 const good=binding(984,profile([offer('meal','LUNCH',[],[prop('participation.booking','Keine Reservation nötig')])]));
 assert.equal(state(search(q,[good]),'entry'),'MET');
 assert.equal(search(q,[good]).ranked.length,1);
 const booked=binding(985,profile([offer('meal','LUNCH',[],[prop('participation.booking','Reservation erforderlich')])]));
 assert.equal(search(q,[booked]).ranked.length,0);
});

test('all canonical language IDs roundtrip',()=>{for(const c of EXPERIENCE_LANGUAGE_CONCEPTS)assert.equal(librarianConcept(c.id),c.id);});
for(const [text,mode,expected] of [
 ['Ping Pong mit Onlinebuchung','OFFER_NAME',['table_tennis']],
 ['Live-Jazz hören','OFFER_NAME',['live_jazz']],
 ['Kaffee aus Nepal','ITEM_LIST',['coffee']],
 ['Bier, Wein und Kaffee','ITEM_LIST',['world-value:BEER','world-value:WINE','coffee']],
 ['Kein Kaffee','ITEM_LIST',[]],['Kaffee ohne Kaufpflicht','ITEM_LIST',[]],
 ['Jazz ausverkauft','OFFER_NAME',[]],['Kaffee nur für Hotelgäste','ITEM_LIST',[]],['Kaffee aus Nepal nur auf Vorbestellung','ITEM_LIST',[]],
 ['Gelegentlich Jazz nach Absprache','OFFER_NAME',[]]
])test(`finite language preserves qualifiers: ${text}`,()=>assert.deepEqual(declaredExperienceConcepts(text,mode),expected));

test('coffee activity proves requested coffee within its own cafe area',()=>{
 const q=request([fact('coffee','food.drink','COFFEE'),fact('quiet','atmosphere.character','quiet')]);
 const good=profile([offer('cafe','CAFE',['inside'],[prop('experience.activity','Kaffee')])],[area('inside',[prop('atmosphere.character','ruhig')])]);
 assert.equal(search(q,[binding(950,good)]).ranked.length,1);
 const split=profile([offer('cafe','CAFE',['inside'],[prop('experience.activity','Kaffee')]),offer('dinner','DINNER',['other'])],[area('inside'),area('other',[prop('atmosphere.character','ruhig')])]);
 assert.equal(search(q,[binding(951,split)]).ranked.length,0);
});

test('declared live jazz proves programme, generic music and jazz alone do not',()=>{
 const q=request([fact('jazz','offer.feature','live_jazz')]);
 for(const [name,expected] of [['Live-Jazz hören',1],['Jazz',0],['Live-Musik',0],['Kein Live-Jazz',0]]){
  assert.equal(search(q,[binding(952,profile([{...offer('programme','MUSIC_EVENT'),name}]))]).ranked.length,expected,name);
 }
});

test('children activity is not replaced by a family friendly restaurant',()=>{
 const q=request([fact('kids','condition.children','children_activity')]);
 assert.equal(search(q,[binding(953,profile([offer('kids','MOVEMENT_PLAY')],undefined,'SPORT'))]).ranked.length,1);
 assert.equal(search(q,[binding(954,profile([offer('meal','LUNCH')],[area('inside',[prop('atmosphere.character','familienfreundlich')])]))]).ranked.length,0);
});

test('public day access and spontaneous entry require their own evidence',()=>{
 const q=request([fact('sauna','experience.activity','Sauna'),fact('entry','participation.permission','public_day_access'),fact('booking','participation.booking','spontaneous')]);
 const sauna=offer('sauna','SAUNA',['inside'],[prop('participation.permission','Öffentlicher Tageszugang'),prop('participation.booking','Keine Reservation nötig')]);
 assert.equal(search(q,[binding(955,profile([sauna],undefined,'WELLNESS_RELAXATION'))]).ranked.length,1);
 assert.equal(search(q,[binding(956,profile([{...sauna,properties:[prop('participation.audience','Nur für Hotelgäste')]}],undefined,'WELLNESS_RELAXATION'))]).ranked.length,0);
});

for(const [capacity,expected] of [[8,'MET'],[6,'MET'],[5,'FAILED'],[null,'UNKNOWN']])test(`scoped capacity ${capacity} for six people: ${expected}`,async()=>{
 const q=request([fact('play','experience.activity','Escape Room spielen'),fact('count','people.count',{amount:6,operator:'EQ',unit:'PEOPLE'},'REQUIRED',['g1'])]);
 const p=profile([offer('escape','ESCAPE_GAME',['inside'],capacity===null?[]:[prop('offer.capacity',capacity)])],undefined,'ACTIVITIES_PLAY');
 const b=binding(960,p),r=search(q,[b]);assert.equal(state(r,'count'),expected);assert.equal(r.ranked.length,expected==='MET'?1:0);
 if(expected==='MET'){const http=await exercise({text:'Escape Room für sechs',meaning:q,catalog:[b]});assert.equal(http.status,200);assert.ok(http.body.candidates[0].reasons.some(r=>r.code==='librarian-capacity-not-booking'));}
});
test('capacity in another offering cannot prove the selected activity',()=>{
 const q=request([fact('play','experience.activity','Escape Room spielen'),fact('count','people.count',{amount:6,operator:'EQ',unit:'PEOPLE'},'REQUIRED',['g1'])]);
 const p=profile([offer('escape','ESCAPE_GAME',['inside']),offer('big','WORKSHOP',['other'],[prop('offer.capacity',20)])],[area(),area('other')],'ACTIVITIES_PLAY');
 assert.equal(state(search(q,[binding(961,p)]),'count'),'UNKNOWN');
});

test('venue hours are the authorized fallback only for absent offering hours',()=>{
 const q=request([meal(),date(),evening()]);
 assert.equal(search(q,[binding(962,profile([{...offer(),schedule:[]}]))]).ranked.length,1);
 assert.equal(search(q,[binding(962,profile([offer()]))]).ranked.length,1);
});
test('an out of season offer keeps its activity proof while failing availability',()=>{
 const q=request([meal(),date(),evening()]);
 const r=search(q,[binding(963,profile([{...offer(),validUntil:'2026-09-01'}]))]);
 assert.equal(state(r,'meal'),'MET');assert.equal(r.ranked.length,0);assert.equal(state(r,'date'),'FAILED');
 assert.ok(candidate(r).facts.some(f=>f.reason==='OFFER_OUTSIDE_VALIDITY'));
});
test('documented free whole activity does not require an invented headcount or currency',()=>{
 const q=request([fact('walk','experience.activity','Spazieren'),fact('free','budget.maximum',{amount:0,operator:'LTE',currency:'UNSPECIFIED'})]);
 const free=offer('walk','WALK',['inside'],[],[price(0,{basis:'PER_GROUP',includes:'Eintritt'})]);
 assert.equal(search(q,[binding(964,profile([free],undefined,'OUTDOOR_NATURE'))]).ranked.length,1);
 assert.equal(search(q,[binding(965,profile([{...free,prices:[price(0,{basis:'PER_GROUP',includes:'Eintritt',mandatoryFeesIncluded:false})]}],undefined,'OUTDOOR_NATURE'))]).ranked.length,0);
});

test('duplicate preference and meal aliases do not inflate ranking',async()=>{
 const q=request([fact('lunch','experience.activity','lunch'),fact('meal','food.meal','Mittagessen'),fact('quiet1','atmosphere.character','ruhig','PREFERRED'),fact('quiet2','atmosphere.character','quiet','PREFERRED')]);
 const b=binding(966,profile([offer('lunch','LUNCH')],[area('inside',[prop('atmosphere.character','ruhig')])]));
 const http=await exercise({text:'Mittagessen, möglichst ruhig',meaning:q,catalog:[b]});assert.equal(http.status,200);
 const c=http.body.candidates[0];assert.equal(c.rankVector.contextFit.matchedSoftPreferenceCount,1);
 assert.equal(c.rankVector.worldEvidence.confirmedReasonCount,2);
});

test('relevant preferences beat neutral ties, without depending on catalog order',async()=>{
 const q=request([meal(),fact('quiet','atmosphere.character','ruhig','PREFERRED')]);
 const quiet=binding(970,profile([offer()],[area('inside',[prop('atmosphere.character','ruhig')])])),plain=binding(971,profile());
 for(const catalog of [[plain,quiet],[quiet,plain]]){
  const r=await exercise({text:'Essen, möglichst ruhig',meaning:q,catalog});assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,quiet.decisionProjection.spotId);
  assert.ok(r.body.candidates[0].reasons.some(r=>r.code==='product-rank-versus-next-v1'&&r.statement.includes('Kontextmerkmale')));
 }
});
test('irrelevant new profile content does not reshuffle a genuine neutral tie',async()=>{
 const q=request([meal()]);const a=binding(972,profile()),b=binding(973,profile());
 const before=await exercise({text:'Essen',meaning:q,catalog:[a,b]});
 const changed=binding(972,profile([offer(),offer('coffee','CAFE',[],[prop('food.drink','Kaffee')])]));
 const after=await exercise({text:'Essen',meaning:q,catalog:[b,changed]});
 assert.equal(before.status,200);assert.equal(after.status,200);
 assert.deepEqual(before.body.candidates.map(c=>[c.spotId,c.rank]),after.body.candidates.map(c=>[c.spotId,c.rank]));
});
test('conditional group capacity is not applied outside its documented validity',()=>{
 const q=request([fact('play','experience.activity','Escape Room spielen'),fact('count','people.count',{amount:6,operator:'EQ',unit:'PEOPLE'},'REQUIRED',['g1']),date()]);
 const capacity=prop('offer.capacity',8);capacity.conditions={...capacity.conditions,validUntil:'2026-09-30'};
 const r=search(q,[binding(974,profile([offer('escape','ESCAPE_GAME',['inside'],[capacity])],undefined,'ACTIVITIES_PLAY'))]);
 assert.equal(state(r,'count'),'UNKNOWN');assert.equal(r.ranked.length,0);
});


test('explicit coffee and cake in a food offer title are scoped product evidence, not generic bakery inference',()=>{
 const q=request([fact('coffee','food.drink','COFFEE'),fact('cake','food.dish','CAKE')]);
 const make=name=>profile([{...offer('cafe','CAFE'),name}]);
 assert.equal(search(q,[binding(1990,make('Kaffee und Kuchen aus eigener Bio-Backstube'))]).ranked.length,1);
 for(const name of ['Kaffee und süsse Backwaren','Kaffee und kein Kuchen','Kaffee und Kuchen nur auf Anfrage'])
  assert.equal(search(q,[binding(1991,make(name))]).ranked.length,0,name);
});

test('brunch and a co-diner diet require the same meal offer, including person-only diet scope',()=>{
 for(const subjects of [['a1','p1'],['p1']]){
 const q=request([fact('brunch','experience.activity','brunch'),fact('diet','food.diet','vegan','REQUIRED',subjects)]);
 const bad=profile([offer('brunch','BRUNCH'),offer('lunch','LUNCH',['inside'],[prop('food.diet','vegan')])]);
 const good=profile([offer('brunch','BRUNCH',['inside'],[prop('food.diet','vegan')])]);
 assert.equal(search(q,[binding(1992,bad)]).ranked.length,0);
 assert.equal(search(q,[binding(1993,good)]).ranked.length,1);
 }
});

test('catalogued gluten-free and lactose-free options prove the matching diet on the selected meal only',()=>{
 for(const [wanted,label] of [['glutenfrei','Glutenfreie Option'],['laktosefrei','Laktosefreie Option']]){
 const q=request([fact('meal','experience.activity','dinner'),fact('diet','food.diet',wanted)]);
 assert.equal(search(q,[binding(1994,profile([offer('dinner','DINNER',['inside'],[prop('food.option',label)])]))]).ranked.length,1);
 for(const label of ['Zutateninformation verfügbar','Anpassung auf Anfrage','Nicht glutenfrei'])
 assert.equal(search(q,[binding(1995,profile([offer('dinner','DINNER',['inside'],[prop('food.option',label)])]))]).ranked.length,0);
 assert.equal(search(q,[binding(1996,profile([offer('dinner','DINNER'),offer('lunch','LUNCH',['inside'],[prop('food.option',label)])]))]).ranked.length,0);
 }
});

test('zero activity budget fails a documented paid tariff regardless of missing currency or headcount',()=>{
 const q=request([fact('play','experience.activity','table_tennis'),fact('zero','budget.maximum',{amount:0,operator:'LTE',currency:'UNSPECIFIED'})]);
 const p=profile([offer('ping','BALL_SPORT',['inside'],[prop('experience.activity','table_tennis')],[price(18,{includes:'Eintritt'})])]);
 const r=search(q,[binding(1997,p)]);assert.equal(r.ranked.length,0);assert.ok(r.excluded[0].facts.some(f=>f.reason==='SCOPED_ACTIVITY_NOT_FREE'));
});

test('incidental companion headcount needs no invented capacity but respects an explicit offer limit',()=>{
 const q=request([fact('sport','experience.activity','bouldering'),fact('count','people.count',{amount:2,operator:'EQ',unit:'PEOPLE'},'CONTEXT',['g1'])]);
 assert.equal(search(q,[binding(1998,profile([offer('boulder','BOULDERING')]))]).ranked.length,1);
 const r=search(q,[binding(1999,profile([offer('boulder','BOULDERING',['inside'],[prop('offer.capacity',1)])]))]);
 assert.equal(r.ranked.length,0);assert.ok(r.excluded[0].facts.some(f=>f.reason==='PARTY_EXCEEDS_OFFER_CAPACITY'));
});

test('documented offer minimum entails a lower unaccompanied threshold without losing age notice',()=>{
 const rule=worldFact('rule.age_access_conditions',{notes:null,rules:[{mode:'UNACCOMPANIED_MINIMUM',minimumAge:13,accompaniment:'ADULT',area:null,days:[],event:null,appliesFromTime:null}]});
 const p=profile([offer('boulder','BOULDERING',['inside'],[prop('participation.minimum_age',14)])]);
 const q=request([fact('sport','experience.activity','bouldering')]);
 const b=originalBinding(2000,p,[rule]);let r=search(q,[b]);assert.equal(r.ranked.length,1);assert.ok(r.ranked[0].facts.some(f=>f.reason==='AGE_REQUIREMENT_TO_CHECK'));
 r=search(request([fact('sport','experience.activity','bouldering'),fact('age','people.age',{amount:10,operator:'EQ',unit:'YEARS'},'CONTEXT',['p1'])]),[b]);assert.equal(r.ranked.length,0);
 const weaker=originalBinding(2001,profile([offer('boulder','BOULDERING',['inside'],[prop('participation.minimum_age',1)])]),[rule]);
 assert.equal(search(q,[weaker]).ranked.length,0);
});

test('takeaway reads authorized operation evidence only for the selected food offer and does not mean delivery',()=>{
 const q=request([meal(),fact('take','food.delivery','zum Mitnehmen')]);const p=profile();
 for(const [value,expected] of [[true,1],[false,0]]) assert.equal(search(q,[originalBinding(2002,p,[worldFact('operation.takeaway',value,{resolution:value?'KNOWN_TRUE':'KNOWN_FALSE'})])]).ranked.length,expected);
 assert.equal(search(q,[originalBinding(2003,p)]).ranked.length,0);
 const delivery=request([meal(),fact('delivery','food.delivery','Lieferung nach Hause')]);
 assert.equal(search(delivery,[originalBinding(2004,p,[worldFact('operation.takeaway',true,{resolution:'KNOWN_TRUE'})])]).ranked.length,0);
});

test('explicit zero admission survives missing optional fee metadata without waiving real mandatory costs',()=>{
 const q=request([fact('visit','experience.activity','animals'),fact('zero','budget.maximum',{amount:0,operator:'LTE',currency:'UNSPECIFIED'})]);
 const tariff=price(0,{label:'Eintritt Tierpark',includes:'',mandatoryFeesIncluded:null});
 const make=(prices,kind='ANIMAL_OBSERVATION')=>originalBinding(2005,profile([offer('visit',kind,['inside'],[],prices)]));
 assert.equal(search(q,[make([tariff])]).ranked.length,1);
 for(const p of [{...tariff,mandatoryFeesIncluded:false},{...tariff,minimumAge:6},{...tariff,label:'Gratis Probelektion'}])assert.equal(search(q,[make([p])]).ranked.length,0);
 assert.equal(search(q,[make([tariff,price(10,{includes:'Eintritt'})])]).ranked.length,0);
});

test('general venue parking survives a detailed offer profile without manufacturing parking inside its area',()=>{
 const q=request([meal(),fact('parking','offer.feature','parking')]);
 const extra=[worldFact('amenity.features',['PARKING'])];
 const p=profile();assert.equal(search(q,[originalBinding(2006,p,extra)]).ranked.length,1);
 assert.equal(search(q,[originalBinding(2007,p)]).ranked.length,0);
 const unknown=profile();unknown.properties=[{...prop('amenity.parking',true),state:'UNKNOWN',value:null}];
 assert.equal(search(q,[originalBinding(2008,unknown,extra)]).ranked.length,0);
 const covered=request([meal(),fact('parking','offer.feature','parking'),fact('covered','condition.weather_protection','covered')]);
 assert.equal(search(covered,[originalBinding(2009,p,extra)]).ranked.length,0);
});

test('laptop work needs a real work offer, and venue WiFi does not manufacture permission to work',()=>{
 const q=request([fact('work','experience.activity','mit dem Laptop arbeiten'),fact('wifi','offer.facility','WLAN')]);
 const p=profile([offer('work','COWORKING')]);
 const wifi=[worldFact('amenity.features',['WIFI'])];
 assert.equal(search(q,[originalBinding(2010,p,wifi)]).ranked.length,1);
 assert.equal(search(q,[originalBinding(2011,p)]).ranked.length,0);
 assert.equal(search(q,[originalBinding(2012,profile([offer('coffee','CAFE')]),wifi)]).ranked.length,0);
});

test('ordinary mood retains an honest notice without suppressing proven coffee and cake; required mood still gates',async()=>{
 const coffee=offer('coffee','CAFE');coffee.name='Kaffee und Kuchen aus eigener Backstube';
 const b=binding(1101,profile([coffee],[area()]));
 const facts=[fact('coffee','food.drink','COFFEE'),fact('cake','food.dish','CAKE'),fact('mood','atmosphere.character','cozy','PREFERRED')];
 const result=await exercise({text:'Gemütlich Kaffee und Kuchen',meaning:request(facts),catalog:[b]});
 assert.equal(result.status,200);
 const selected=result.body.candidates.filter(c=>c.rank!==null);assert.equal(selected.length,1);
 assert.ok(selected[0].reasons.some(r=>r.code==='librarian-atmosphere-unconfirmed'&&!r.confirmed));
 assert.ok(!selected[0].reasons.some(r=>r.confirmed&&r.statement==='Bestätigt: die gewünschte Atmosphäre.'));
 const strict=await exercise({text:'Unbedingt gemütlich Kaffee und Kuchen',meaning:request(facts.map(f=>f.id==='mood'?{...f,modality:'REQUIRED'}:f)),catalog:[b]});
 assert.equal(strict.body.candidates.filter(c=>c.rank!==null).length,0);
 const onlyCoffee=offer('coffee','CAFE');onlyCoffee.name='Kaffee';
 assert.equal(search(request(facts),[binding(1102,profile([onlyCoffee],[area()]))]).ranked.length,0);
});

test('pure dining gives primary gastronomy priority without excluding secondary dining or changing mixed family visits',async()=>{
 const food=offer('food','GASTRONOMY');food.name='Restaurant';
 const cafe=originalBinding(1110,profile([food],[area()],'RESTAURANT'),[worldFact('classification.primary_category','EAT')]);
 const auxiliary=originalBinding(1111,profile([food],[area()],'MUSEUM'),[worldFact('classification.primary_category','CULTURE_ARTS')]);
 const dining=await exercise({text:'Essen gehen',meaning:request([meal()]),catalog:[auxiliary,cafe]});
 assert.equal(dining.status,200);assert.equal(dining.body.candidates.filter(c=>c.rank!==null).length,2);
 assert.equal(dining.body.candidates[0].presentation.name,cafe.decisionProjection.facts.find(f=>f.key==='identity.name').value);
 assert.ok(dining.body.candidates[0].reasons.some(r=>r.code==='primary-purpose-gastronomy'));
 const family=await exercise({text:'Familienaktivität mit Essen',meaning:request([meal(),fact('family','condition.children','children_activity')]),catalog:[cafe,auxiliary]});
 assert.ok(family.body.candidates.every(c=>!c.reasons.some(r=>r.code==='primary-purpose-gastronomy')));
});

test('an actual escape room is selected instead of a portable puzzle box under the same catalogue kind',()=>{
 const box=offer('box','ESCAPE_GAME');box.name='Rätselkiste spielen';
 const room=offer('room','ESCAPE_GAME');room.name='Escape Room im Team spielen';
 const q=request([fact('escape','experience.activity','escape_game')]);
 assert.equal(search(q,[binding(1120,profile([box,room]))]).ranked.length,1);
 assert.deepEqual(search(q,[binding(1120,profile([box,room]))]).ranked[0].offerIds,['room']);
 assert.equal(search(q,[binding(1121,profile([box]))]).ranked.length,0);
});
