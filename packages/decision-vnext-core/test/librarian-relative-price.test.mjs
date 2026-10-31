import test from 'node:test';
import assert from 'node:assert/strict';
import {fact,request,profile,offer,area,prop,binding,search,meal,budget,worldFact} from './librarian-matching-fixtures.mjs';
import {exercise} from './librarian-active-route-fixtures.mjs';
const relative=(value='nicht zu teuer',modality='REQUIRED')=>fact('relative','budget.qualitative',value,modality);
const level=value=>worldFact('operation.price_level',value);
const vegan=()=>fact('vegan','food.diet','vegan','REQUIRED',['p1']);
const food=()=>profile([offer('dinner','DINNER',['inside'],[prop('food.diet','vegan')])],[area()]);
const all=r=>[...r.ranked,...r.unresolved,...r.excluded];

test('required relative price uses the defined level without asking for a cash ceiling or changing modality',()=>{
 for(const [value,accepted] of [['VERY_LOW',true],['LOW',true],['MEDIUM',true],['HIGH',false],['PREMIUM',false]]){
  const q=request([meal(),vegan(),relative()]),before=JSON.stringify(q);
  const r=search(q,[binding(1800,food(),[level(value)])]);
  assert.equal(r.ranked.length,accepted?1:0,value);
  const price=all(r)[0].facts.find(f=>f.factId==='relative');
  assert.equal(price.modality,'REQUIRED');assert.equal(price.state,accepted?'MET':'FAILED');
  assert.equal(price.domainEvidence[0].details.monetaryBudgetInferred,false);
  assert.equal(r.evaluationPlan.requirements.find(r=>r.factId==='relative').support,'SUPPORTED');
  assert.equal(JSON.stringify(q),before);
 }
 const q=request([meal(),relative('günstig')]);
 assert.equal(search(q,[binding(1801,food(),[level('MEDIUM')])]).ranked.length,0,'cheap retains the lower LOW ceiling');
});

test('a missing price holds only that candidate back; known expensive places do not pass a required wish',()=>{
 const catalog=[binding(1802,food(),[level('MEDIUM')]),binding(1803,food()),binding(1804,food(),[level('HIGH')])];
 const r=search(request([meal(),vegan(),relative()]),catalog);
 assert.deepEqual(r.ranked.map(c=>c.spotId),[catalog[0].decisionProjection.spotId]);
 assert.ok(r.unresolved.some(c=>c.spotId===catalog[1].decisionProjection.spotId&&c.facts.some(f=>f.reason==='QUALITATIVE_PRICE_EVIDENCE_MISSING')));
 assert.ok(r.excluded.some(c=>c.spotId===catalog[2].decisionProjection.spotId));
});

test('an attraction, pool, museum or hotel venue price does not price its embedded restaurant',()=>{
 for(const [category,type] of [['ATTRACTIONS_LANDMARKS','ZOO'],['WELLNESS_RELAXATION','SWIMMING_POOL'],['CULTURE_ARTS','MUSEUM'],['STAY','HOTEL']]){
  const b=binding(1805,food(),[level('LOW'),worldFact('classification.primary_category',category)]);
  b.decisionProjection.facts=b.decisionProjection.facts.map(f=>f.key==='classification.place_types'?worldFact(f.key,[type]):f);
  const r=search(request([meal(),vegan(),relative()]),[b]);assert.equal(r.ranked.length,0,type);
  assert.ok(all(r)[0].facts.some(f=>f.reason==='QUALITATIVE_PRICE_SCOPE_UNBOUND'),type);
 }
});

test('restaurant and cafe defaults remain usable; unclassified or conflicting mixed venues stay unconfirmed',()=>{
 const cafe=binding(1806,food(),[level('MEDIUM'),worldFact('classification.primary_category','COFFEE_DAYTIME')]);
 cafe.decisionProjection.facts=cafe.decisionProjection.facts.map(f=>f.key==='classification.place_types'?worldFact(f.key,['CAFE','BISTRO']):f);
 assert.equal(search(request([meal(),vegan(),relative()]),[cafe]).ranked.length,1);
 const mixed=binding(1807,food(),[level('LOW'),worldFact('classification.primary_category','EAT')]);
 mixed.decisionProjection.facts=mixed.decisionProjection.facts.map(f=>f.key==='classification.place_types'?worldFact(f.key,['RESTAURANT','ZOO']):f);
 assert.equal(search(request([meal(),relative()]),[mixed]).ranked.length,0);
 const unknown=binding(1808,food(),[level('LOW')]);unknown.decisionProjection.facts=unknown.decisionProjection.facts.filter(f=>f.key!=='classification.place_types');
 assert.equal(search(request([meal(),relative()]),[unknown]).ranked.length,0);
});

test('cash budgets still require real meal prices; relative levels cannot satisfy them',()=>{
 const b=binding(1809,food(),[level('LOW')]);
 const r=search(request([meal(),vegan(),...budget(20)]),[b]);
 assert.equal(r.ranked.length,0,'a LOW venue cannot make its recorded CHF35 meal cost at most CHF20');
 const unknown=food();unknown.offers[0].prices=[];
 assert.equal(search(request([meal(),...budget(20)]),[binding(1810,unknown,[level('LOW')])]).ranked.length,0,'missing prices remain unknown');
});

test('one vegan diner can use a mixed restaurant and the normal response explains relative price without a budget question',async()=>{
 const catalog=[binding(1811,food(),[level('MEDIUM')]),binding(1812,food())];
 const q=request([meal(),vegan(),relative()]);
 const r=await exercise({text:'essen gehen, nicht zu teuer, und wir haben einen veganer dabei',meaning:q,catalog});
 assert.equal(r.status,200);const ranked=r.body.candidates.filter(c=>c.rank!==null);assert.equal(ranked.length,1);
 assert.ok(ranked[0].reasons.some(r=>r.code==='librarian-relative-price-level'&&r.confirmed&&r.statement.includes('Preisniveau')));
 assert.ok(!r.body.candidates.some(c=>c.reasons.some(r=>r.statement.includes('Welches Budget pro Person'))));
 assert.ok(r.body.candidates.filter(c=>c.rank===null).some(c=>c.reasons.some(r=>r.statement.includes('kein auswertbares Preisniveau'))));
 assert.equal(q.facts.find(f=>f.key==='food.diet').subjectIds[0],'p1');
});
