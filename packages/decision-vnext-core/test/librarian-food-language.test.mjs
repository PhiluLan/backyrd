import test from 'node:test';
import assert from 'node:assert/strict';
import { fact, request, profile, offer, area, prop, price, binding, search, budget, worldFact } from './librarian-matching-fixtures.mjs';
import {exercise} from './librarian-active-route-fixtures.mjs';
import {readFileSync} from 'node:fs';

const foodAlternative = (both=false) => request([
  fact('family','condition.children','children_activity','REQUIRED',['a1']),
  fact('meal','food.meal','meal','REQUIRED',['a2']),
  fact('snack','food.meal','snacks','REQUIRED',['a2']),
],{logic:{kind:'ALL',children:[{kind:'FACT',factId:'family'},{kind:both?'ALL':'ANY',...(both?{}:{strength:'REQUIRED'}),children:[{kind:'FACT',factId:'meal'},{kind:'FACT',factId:'snack'}]}]},bindings:[{kind:'SAME_PLACE',factIds:['family','meal']},{kind:'SAME_PLACE',factIds:['family','snack']}]});
const familyVenue = (food='meal') => profile([
  offer('play','MOVEMENT_PLAY',['playroom']),
  ...(food ? [offer('cafe','CAFE',['cafe'],[prop('food.meal_extent',food==='meal'?'Essen':food==='snacks'?'Snacks':food)])] : []),
],[area('playroom'),area('cafe')]);

test('family activity plus either food option can use a separate cafe at the same venue',()=>{
 const q=foodAlternative();
 assert.equal(q.diagnostics.some(d=>d.code==='CROSS_BRANCH_BINDING'),false,'a shared anchor and an active ANY branch coexist');
 for(const food of ['meal','snacks']){
  const p=familyVenue(food), result=search(q,[binding(1,p)]);
  assert.equal(result.ranked[0]?.status,'CONFIRMED',JSON.stringify(result.unresolved));
  assert.deepEqual(result.ranked[0].offerIds,['cafe','play']);
  assert.equal(result.ranked[0].selectedFactIds.includes(food==='meal'?'snack':'meal'),false);
 }
});
test('food is still a duty: an activity alone, a family restaurant alone, or food at another venue cannot satisfy it',()=>{
 const q=foodAlternative();
 const onlyFood=profile([offer('dinner','DINNER',['inside'],[prop('condition.children','Kinderangebote')])],[area('inside',[prop('atmosphere.character','familienfreundlich')])]);
 for(const catalog of [[binding(1,familyVenue(null))],[binding(2,onlyFood)],[binding(1,familyVenue(null)),binding(2,onlyFood)],[binding(1,familyVenue('drinks'))]])
  assert.equal(search(q,catalog).ranked.length,0);
 assert.equal(search(foodAlternative(true),[binding(1,familyVenue('meal'))]).ranked.length,0,'AND must not become OR');
});
test('properties attached to the same activity still cannot borrow a different cafe room',()=>{
 const q=request([fact('play','condition.children','children_activity'),fact('food','food.meal','meal')]);
 assert.equal(search(q,[binding(1,familyVenue())]).ranked.length,0);
});
test('family activity remains a priced activity; a cheap cafe cannot prove the whole outing budget',()=>{
 const original=foodAlternative().raw;
 const facts=[...original.facts,fact('budget','budget.maximum',{amount:5,operator:'LTE',currency:'CHF'},'REQUIRED',[]),fact('scope','budget.scope',{scope:'PER_PERSON'},'CONTEXT',[])];
 const costed=request(facts,{...original,facts});
 const p=familyVenue('meal');
 p.offers[0].prices=[price(50,{includes:'Eintritt'})];
 p.offers[1].prices=[price(1)];
 assert.equal(search(costed,[binding(1,p)]).ranked.length,0);
});
test('family activity aliases retain meaning without making a child menu an activity',()=>{
 for(const value of ['Familienaktivität','family activity','activité en famille']){
  const q=request([fact('family','experience.activity',value)]);
  assert.equal(search(q,[binding(1,familyVenue(null))]).ranked[0]?.status,'CONFIRMED');
  assert.equal(search(q,[binding(2,profile([offer('Kinderangebote','DINNER',['inside'],[prop('condition.children','Kinderangebote')])]))]).ranked.length,0);
 }
});
test('a catalogued snack can arrive in food.option without admitting unrelated dietary options',()=>{
 for(const key of ['food.meal','food.option']){
  const q=request([fact('food',key,'snacks')]);
  assert.equal(search(q,[binding(1,familyVenue('snacks'))]).ranked[0]?.status,'CONFIRMED');
  assert.equal(search(q,[binding(1,familyVenue('meal'))]).ranked.length,0);
 }
 assert.equal(search(request([fact('food','food.option','vegan')]),[binding(1,familyVenue('snacks'))]).ranked.length,0);
});
test('active HTTP chain preserves family plus food-or-snacks and rejects unconfirmed alternatives',async()=>{
 const result=await exercise({text:'familienaktivität wo es auch was zum Essen oder Snacks gibt',meaning:foodAlternative(),catalog:[binding(1,familyVenue('snacks')),binding(2,familyVenue(null))]});
 assert.equal(result.status,200,JSON.stringify(result.diagnostics));
 assert.equal(result.body.primaryCandidateId,binding(1,familyVenue('snacks')).decisionProjection.spotId);
 assert.equal(result.body.candidates.find(c=>c.spotId===binding(2,familyVenue(null)).decisionProjection.spotId)?.rank,null);
});
test('recorded malformed live meaning remains unchanged; matching never invents an OR or changes activity scope',()=>{
 const recorded=JSON.parse(readFileSync(new URL('./fixtures/family-food-live-failure.json',import.meta.url),'utf8'));
 const original=structuredClone(recorded.raw);
 const q=request(recorded.raw.facts,recorded.raw);
 assert.equal(search(q,[binding(1,familyVenue('meal'))]).ranked.length,0);
 assert.deepEqual(q.raw,original);
});

// Expected outcomes describe product duties, independently of the matching implementation.
// The source sentence is not interpreted by this deterministic stage.
for (const kind of ['LUNCH', 'DINNER', 'FULL_MEAL']) {
  test(`a normalized food.meal wish can use a real ${kind} offer`, () => {
    const result = search(request([fact('food', 'food.meal', 'essen gehen')]), [binding(1, profile([offer('food', kind)]))]);
    assert.equal(result.ranked[0]?.status, 'CONFIRMED');
    assert.deepEqual(result.ranked[0].offerIds, ['food']);
    assert.equal(result.ranked[0].facts.find(f => f.factId === 'food').family, 'food.meal');
  });
}
test('a drinks offer alone does not prove a meal', () => {
  const r = search(request([fact('food', 'food.meal', 'essen gehen')]), [binding(1, profile([offer('bar', 'DRINKS')]))]);
  assert.equal(r.ranked.length, 0);
  assert.equal(r.unresolved.length, 1);
});
test('generic drinking can use the drinks offer, while wine still needs wine evidence', () => {
  const catalog = [binding(1, profile([offer('bar', 'DRINKS')]))];
  assert.equal(search(request([fact('drink', 'food.drink', 'etwas trinken')]), catalog).ranked[0]?.status, 'CONFIRMED');
  assert.equal(search(request([fact('drink', 'food.drink', 'Wein')]), catalog).ranked.length, 0);
});
test('a museum meal request uses its dining offer, preserving venue and meal separately', () => {
  const p = profile([offer('entry', 'SELF_GUIDED_VISIT'), offer('food', 'LUNCH')], [area()], 'MUSEUM');
  const q = request([fact('museum', 'offer.kind', 'Museum', 'REQUIRED', []), fact('food', 'food.meal', 'essen gehen')]);
  assert.equal(search(q, [binding(1, p)]).ranked[0]?.status, 'CONFIRMED');
});
test('diet and budget remain attached to the meal selected through food.meal', () => {
  const p = profile([offer('food', 'DINNER', ['inside'], [prop('food.diet', 'vegan')], [price(30)]), offer('bar', 'DRINKS', ['inside'], [], [price(5)])]);
  const q = request([fact('food', 'food.meal', 'essen gehen'), fact('diet', 'food.diet', 'vegan'), ...budget(35)]);
  const r = search(q, [binding(1, p)]);
  assert.equal(r.ranked[0]?.status, 'CONFIRMED');
  assert.deepEqual(r.ranked[0].offerIds, ['food']);
});
test('diet in another meal cannot satisfy the requested dinner', () => {
  const p = profile([offer('dinner', 'DINNER'), offer('lunch', 'LUNCH', ['inside'], [prop('food.diet', 'vegan')])]);
  const q = request([fact('dinner', 'food.meal', 'Abendessen'), fact('diet', 'food.diet', 'vegan')]);
  const r = search(q, [binding(1, p)]);
  assert.notEqual(r.ranked[0]?.status, 'CONFIRMED');
});
test('a cheap drink does not lower a meal budget through the food.meal family', () => {
  const p = profile([offer('food', 'DINNER', ['inside'], [], [price(65)]), offer('bar', 'DRINKS', ['inside'], [], [price(5)])]);
  const r = search(request([fact('food', 'food.meal', 'essen gehen'), ...budget(35)]), [binding(1, p)]);
  assert.ok(r.excluded[0]?.failedFactIds.includes('money'));
});
test('an unrecognized food concept remains unknown rather than becoming a meal', () => {
  const r = search(request([fact('food', 'food.meal', 'unbekanntes Spezialangebot')]), [binding(1, profile())]);
  assert.equal(r.ranked.length, 0);
  assert.equal(r.unresolved[0].facts.find(f => f.factId === 'food').state, 'UNKNOWN');
});

test('recorded Luna output reaches catalog matching unchanged, including date, city and mood', async () => {
  const { readFileSync } = await import('node:fs');
  const { prepareLibrarianRequest, LUNA_LIBRARIAN_CONTRACT_VERSION } = await import('../dist/product-luna-librarian.js');
  const { searchLibrarianCatalog } = await import('../dist/product-librarian-matching.js');
  const fixture = JSON.parse(readFileSync(new URL('./request-understanding/luna-librarian-fixtures.json', import.meta.url), 'utf8'))[0];
  const q = prepareLibrarianRequest({contractVersion: LUNA_LIBRARIAN_CONTRACT_VERSION, output: fixture.output, sourceText: fixture.request, reference: fixture.reference});
  const candidates = ['gemütlich', 'lebhaft'].map((mood, index) => {
    const b = binding(index + 1, profile([offer('drinks', 'DRINKS')], [area('inside', [prop('atmosphere.character', mood)])], 'BAR'));
    b.decisionProjection.facts.find(f => f.key === 'location.locality').value = 'Baden';
    return b;
  });
  const result = searchLibrarianCatalog({request: q, catalog: candidates, authority: {city: 'Baden', now: '2026-10-14T08:00:00Z'}});
  assert.equal(result.ranked.length, 0);
  assert.equal(result.unresolved[0].status, 'PARTIAL');
  assert.ok(result.unresolved[0].unknownFactIds.length > 0);
  assert.equal(result.unresolved[0].status, 'PARTIAL');
  assert.equal(q.source.sourceText, fixture.request);
  assert.deepEqual(q.raw, fixture.output);
});

// Semantic alignment regressions: expectations precede the fresh live test.
const phase = (value='EVENING') => fact('phase','time.day_phase',{phase:value,timezone:'Europe/Zurich'},'REQUIRED',[]);
const sportBinding = p => { const b=binding(701,p); b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['CLIMBING_GYM']; return b; };
const child = () => fact('child-age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2']);
test('coffee activity labels and shared concept IDs use the same actual coffee offer',()=>{
 for(const term of ['Kaffee trinken','coffee','Kaffee']) {
  const q=request([fact('activity','experience.activity',term),fact('drink','food.drink','coffee')]);
  const r=search(q,[binding(701,profile([offer('cafe','DRINKS',['inside'],[prop('food.drink','coffee')])]))]);
  assert.equal(r.ranked[0]?.status,'CONFIRMED',term);
  assert.deepEqual(r.ranked[0].offerIds,['cafe']);
 }
});
test('unknown coffee-like prose does not become a known activity',()=>{
 const r=search(request([fact('activity','experience.activity','Kaffee-Malworkshop')]),[binding(701,profile([offer('cafe','CAFE')]))]);
 assert.equal(r.ranked.length,0);
});
test('an undated vegan dinner keeps its daypart without claiming calendar opening',()=>{
 const p=profile([{...offer('dinner','DINNER',['inside'],[prop('food.diet','vegan')]),schedule:[]}]);
 const q=request([fact('meal','food.meal','dinner'),fact('diet','food.diet','vegan'),phase()]);
 const r=search(q,[binding(701,p)]);
 assert.equal(r.unresolved[0]?.status,'PARTIAL');
 assert.equal(r.unresolved[0].facts.find(f=>f.factId==='phase').state,'UNKNOWN');
 assert.equal(r.unresolved[0].facts.find(f=>f.factId==='phase').reason,'UNDATED_DAYPART_NO_OPENING_CLAIM');
 assert.equal(q.facts.find(f=>f.id==='phase').modality,'REQUIRED');
});
test('undated lunch retains its actual per-person price and budget',()=>{
 const p=profile([{...offer('lunch','LUNCH',['inside'],[],[price(26)]),schedule:[]}]);
 const r=search(request([fact('meal','food.meal','lunch'),phase('MIDDAY'),...budget(30)]),[binding(701,p)]);
 assert.equal(r.unresolved[0]?.status,'PARTIAL');
 assert.equal(r.unresolved[0].facts.find(f=>f.factId==='money').state,'MET');
 const expensive=search(request([fact('meal','food.meal','lunch'),phase('MIDDAY'),...budget(20)]),[binding(701,p)]);
 assert.equal(expensive.excluded[0]?.failedFactIds.includes('money'),true);
});
test('a documented morning-only offer cannot serve an undated evening wish',()=>{
 const p=profile([{...offer(),schedule:[{weekday:4,start:'08:00',end:'10:00'}]}]);
 const r=search(request([fact('meal','food.meal','dinner'),phase()]),[binding(701,p)]);
 assert.equal(r.excluded[0]?.status,'INELIGIBLE');
});
test('a real date with no offer schedule uses the venue opening fallback',()=>{
 const p=profile([{...offer(),schedule:[]}]);
 const r=search(request([fact('meal','food.meal','dinner'),phase(),fact('date','time.date',{date:'2026-10-15',operator:'EQ',timezone:'Europe/Zurich'},'REQUIRED',[])]),[binding(701,p)]);
 assert.equal(r.ranked[0]?.status,'CONFIRMED');
 assert.equal(r.ranked[0].facts.find(f=>f.factId==='date').state,'MET');
});
test('an undated clock or weekday is not silently converted to a generic daypart',()=>{
 for(const f of [fact('clock','time.clock',{time:'19:00',operator:'EQ',timezone:'Europe/Zurich'},'REQUIRED',[]),fact('weekday','time.weekday','Donnerstag','REQUIRED',[])]) {
  const r=search(request([fact('meal','food.meal','dinner'),phase(),f]),[binding(701,profile())]);
  assert.notEqual(r.ranked[0]?.status,'CONFIRMED');
 }
});
test('an experiential purpose is retained as context without inventing an offer duty',()=>{
 const q=request([fact('drink','experience.activity','drinks'),fact('purpose','experience.purpose','den Abend geniessen','CONTEXT',[])]);
 const r=search(q,[binding(701,profile([offer('bar','DRINKS')]))]);
 assert.equal(r.ranked[0]?.status,'CONFIRMED');
 assert.ok(r.ranked[0].selectedFactIds.includes('purpose'));
 assert.equal(q.raw.facts.find(f=>f.id==='purpose').value.text,'den Abend geniessen');
});
test('the engine never reinterprets an incorrectly emitted activity into optional context',()=>{
 const r=search(request([fact('activity','experience.activity','den Abend geniessen')]),[binding(701,profile([offer('bar','DRINKS')]))]);
 assert.equal(r.ranked.length,0);
});
test('purpose alone does not manufacture a concrete experience',()=>{
 assert.throws(()=>request([fact('purpose','experience.purpose','den Abend geniessen','CONTEXT',[])]),/empty_instructions/);
});
test('a companion relationship does not require a matching property on the offer',()=>{
 const p=profile([offer('play','MOVEMENT_PLAY',['inside'],[prop('participation.minimum_age',1)])],[area()],'SPORT');
 const r=search(request([fact('play','experience.activity','movement_play'),child(),fact('with','people.relationship','Tochter','CONTEXT',[])]),[sportBinding(p)]);
 assert.equal(r.ranked[0]?.status,'CONFIRMED');
});
test('a genuine partner requirement remains an offer requirement',()=>{
 const r=search(request([fact('play','experience.activity','movement_play'),fact('partner','participation.partner','ohne eigenen Spielpartner teilnehmen')]),[binding(701,profile([offer('play','MOVEMENT_PLAY')]))]);
 assert.notEqual(r.ranked[0]?.status,'CONFIRMED');
});
test('a partial group cannot hide the age of a child outside its member list',()=>{
 const entities=[{id:'p1',kind:'PERSON',label:'Mutter',members:[]},{id:'p2',kind:'PERSON',label:'Kind',members:[]},{id:'g1',kind:'GROUP',label:'Besuch',members:['p1']}];
 const q=request([fact('climb','experience.activity','climbing','REQUIRED',['g1']),child()],{entities});
 const p=profile([offer('climb','CLIMBING',['inside'],[prop('participation.minimum_age',14)])],[area()],'SPORT');
 assert.equal(search(q,[sportBinding(p)]).excluded[0]?.status,'INELIGIBLE');
});
test('a partial group is not an authoritative headcount for a total budget',()=>{
 const entities=[{id:'p1',kind:'PERSON',label:'Frau',members:[]},{id:'g1',kind:'GROUP',label:'Paar',members:['p1']}];
 const q=request([fact('meal','food.meal','dinner','REQUIRED',['g1']),fact('money','budget.maximum',{amount:50,operator:'LTE',currency:'CHF'},'REQUIRED',['g1']),fact('scope','budget.scope',{scope:'GROUP_TOTAL'},'CONTEXT',['g1'])],{entities});
 const r=search(q,[binding(701,profile())]);
 assert.ok(r.unresolved[0]?.facts.some(f=>f.reason==='GROUP_PRICE_HEADCOUNT_UNKNOWN'));
});
test('location.setting indoor binds to the activity, not an unrelated indoor cafe',()=>{
 const p=profile([offer('climb','CLIMBING',['terrace']),offer('cafe','CAFE',['inside'])],[area('terrace'),area()],'SPORT');
 const r=search(request([fact('climb','experience.activity','climbing','REQUIRED',[]),fact('indoor','location.setting','indoor','REQUIRED',[])]),[sportBinding(p)]);
 assert.notEqual(r.ranked[0]?.status,'CONFIRMED');
});

test('excluding a date does not disappear into undated daypart context',()=>{
 const q=request([fact('meal','food.meal','dinner'),phase(),fact('excluded','time.date',{date:'2026-10-15',operator:'EQ',timezone:'Europe/Zurich'},'EXCLUDED',[])]);
 const r=search(q,[binding(701,profile())]);
 assert.notEqual(r.ranked[0]?.status,'CONFIRMED');
});
test('venue-wide geographic setting is not mistaken for an activity room requirement',()=>{
 const p=profile();p.properties=[prop('location.setting','im Grünen')];
 const r=search(request([fact('meal','food.meal','dinner'),fact('green','location.setting','im Grünen','REQUIRED',[])]),[binding(701,p)]);
 assert.equal(r.ranked[0]?.status,'CONFIRMED');
});
test('undated night includes the post-midnight part of an overnight offer',()=>{
 const p=profile([{...offer('dance','EVENT',['inside'],[prop('experience.activity','dancing')]),schedule:[{weekday:4,start:'21:00',end:'02:00'}]}]);
 const r=search(request([fact('dance','experience.activity','dancing'),phase('NIGHT')]),[binding(701,p)]);
 assert.equal(r.unresolved[0]?.status,'PARTIAL');
 assert.equal(r.unresolved[0].facts.find(f=>f.factId==='phase').state,'UNKNOWN');
});

test('an undated generic daypart does not invent a visit during the current opening state',()=>{
 const closed=worldFact('state.current',{kind:'CLOSED',scope:'VENUE'},{validityVerified:true,validFrom:'2026-10-14T07:00:00Z',validUntil:'2026-10-15T12:00:00Z'});
 const r=search(request([fact('meal','food.meal','dinner'),phase()]),[binding(701,profile(),[closed])]);
 assert.equal(r.unresolved[0]?.status,'PARTIAL');
 assert.equal(r.unresolved[0].facts.find(f=>f.factId==='phase').reason,'UNDATED_DAYPART_NO_OPENING_CLAIM');
});
test('classification without discovery authority cannot prove a venue match',async()=>{
 const {assessLibrarianPlaceType}=await import('../dist/product-librarian-world-language.js');
 const f=request([fact('venue','offer.kind','Weinbar')]).facts[0];
 const world={facts:[{key:'classification.place_types',value:['WINE_BAR'],freshness:'CURRENT',trust:'VERIFIED',resolution:'KNOWN_VALUE',authorizedUseCases:[],entryHash:'a'.repeat(64)}]};
 assert.equal(assessLibrarianPlaceType(f,world).state,'UNKNOWN');
 assert.equal(assessLibrarianPlaceType(f,world).reason,'SPOT_TYPE_USE_NOT_AUTHORIZED');
});
