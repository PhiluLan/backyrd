import test from 'node:test';
import assert from 'node:assert/strict';
import {declaredExperienceConcepts,librarianConcept,EXPERIENCE_LANGUAGE_CONCEPTS} from '@backyrd/world-knowledge-core';
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

test('venue hours never stand in for missing offering hours',()=>{
 const q=request([meal(),date(),evening()]);
 assert.equal(search(q,[binding(962,profile([{...offer(),schedule:[]}]))]).ranked.length,0);
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
