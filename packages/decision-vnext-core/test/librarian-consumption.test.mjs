import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fact,request,profile,offer,area,prop,binding,search,worldFact,date,conditions} from './librarian-matching-fixtures.mjs';
import {validateActiveLunaMeaningOutput} from '../dist/product-luna-librarian.js';
import {exercise} from './librarian-active-route-fixtures.mjs';
import {parseProductWorldResolverBinding} from '../dist/product-world-resolver-binding.js';
import {externalConsumptionEvidence} from '../dist/product-librarian-knowledge.js';
import {createLibrarianVisitWindow} from '../dist/product-librarian-time.js';
const captured=JSON.parse(readFileSync(new URL('./fixtures/zoo-basel-own-food.json',import.meta.url),'utf8')).binding;
const own=()=>fact('own','participation.permission','own_food');
const rule=(policy='ALLOWED',exceptions=[])=>worldFact('rule.external_food',{policy,exceptions});
const play=()=>profile([offer('play','MOVEMENT_PLAY',['play'])],[area('play')]);
const query=()=>request([fact('family','condition.children','children_activity'),own()]);
const first=r=>[...r.ranked,...r.unresolved,...r.excluded][0];
const result=(p,policy='ALLOWED',exceptions=[])=>search(query(),[binding(1,p,[rule(policy,exceptions)])]);
const exception='Nicht in den Restaurationsbetrieben: Cafeteria beim Eingang, Selbstbedienungsrestaurant und Restaurant «Elefantenblick».';

test('the recorded Zoo profile proves a family outing and own-food permission without changing its knowledge',async()=>{
 const original=structuredClone(captured);
 const q=query(),r=search(q,[captured]);
 assert.equal(r.ranked.length,1,JSON.stringify(r.unresolved));
 const permission=r.ranked[0].facts.find(f=>f.factId==='own');
 assert.equal(permission.reason,'EXTERNAL_CONSUMPTION_ALLOWED');
 assert.ok(permission.domainEvidence.some(e=>e.sourceKeys.includes('rule.external_food')));
 assert.ok(permission.domainEvidence.every(e=>e.details.suppliedByVenue===false));
 assert.ok(r.evaluationPlan.requirements.find(f=>f.factId==='own').sourceKeys.includes('rule.external_food'));
 const http=await exercise({text:'Familienausflug, wir bringen eigenes Essen mit',meaning:q,catalog:[captured]});
 assert.equal(http.body.candidates[0].rank,1);
 assert.ok(http.body.candidates[0].reasons.some(r=>r.code==='librarian-external-consumption-exceptions'&&r.statement.includes('Nicht in den Restaurationsbetrieben')));
 assert.deepEqual(captured,original);
});

test('a typed world permission is not food supply, and missing or denied permission cannot pass',()=>{
 assert.equal(result(play()).ranked.length,1);
 for(const policy of ['NOT_ALLOWED','CONDITIONAL'])assert.equal(result(play(),policy).ranked.length,0);
 assert.equal(search(query(),[binding(1,play())]).ranked.length,0);
 assert.equal(result(play(),'ALLOWED',['Nur nach vorheriger Absprache']).ranked.length,0);
 const dishes=request([...query().raw.facts,fact('dish','food.dish','Pizza')]);
 assert.equal(search(dishes,[binding(1,play(),[rule()])]).ranked.length,0,'permission cannot prove a requested dish');
});

test('restaurant exceptions are scoped and cannot be bypassed through an outside cafe terrace',()=>{
 const p=profile([offer('meal','DINNER',['terrace']),offer('play','MOVEMENT_PLAY',['play'])],[area('terrace'),area('play')]);
 const meal=request([fact('meal','experience.activity','dinner'),own()]);
 const b=binding(1,p,[rule('ALLOWED',[exception])]);
 assert.equal(search(meal,[b]).ranked.length,0);
 assert.equal(search(query(),[b]).ranked.length,1,'separate play area is outside dining exception');
 const unknownArea=profile([offer('play','MOVEMENT_PLAY',[])],[]);
 assert.equal(result(unknownArea,'ALLOWED',[exception]).ranked.length,0,'an unresolved area cannot bypass an exception');
 for(const text of ['Nicht im Restaurant','Nicht in Restaurants','Except in restaurants','Nicht in Restaurants: Café Garten und Restaurant «Beispiel».']){
  assert.equal(search(meal,[binding(1,p,[rule('ALLOWED',[text])])]).ranked.length,0);
  assert.equal(search(query(),[binding(1,p,[rule('ALLOWED',[text])])]).ranked.length,1);
 }
});

test('qualified or otherwise uninterpretable exceptions are not discarded',()=>{
 for(const text of ['Nur für Kinder','Nicht in Restaurants: Restaurant X, nur sonntags','Nicht in Restaurants; auch nicht auf dem Spielplatz','Erlaubt gegen Gebühr','Ausser im Innenbereich'])
  assert.equal(result(play(),'ALLOWED',[text]).ranked.length,0,text);
});

test('scoped restrictions, explicit uncertainty and contradictory permissions stay effective',()=>{
 const p=play();p.offers[0].properties=[prop('participation.permission','Eigene Speisen nicht erlaubt')];
 assert.equal(result(p).ranked.length,0,'scoped denial restricts a general permission');
 p.offers[0].properties=[prop('participation.permission','eigene Speisen erlaubt')];
 assert.equal(result(p,'NOT_ALLOWED').ranked.length,0,'scoped allowance cannot silently erase a general prohibition');
 p.offers[0].properties=[prop('participation.permission',null,{label:'Eigene Speisen',state:'UNKNOWN'})];
 assert.equal(result(p).ranked.length,0);
 p.offers[0].properties=[prop('participation.permission','Eigenes Essen erlaubt')];
 assert.equal(search(query(),[binding(1,p)]).ranked.length,1,'an explicit scoped permission can prove the rule without a world default');
 p.offers[0].properties=[prop('participation.permission','Fotografieren erlaubt')];
 assert.equal(search(query(),[binding(1,p)]).ranked.length,0,'unrelated permissions are not food evidence');
});

test('own drinks have their independent rule and food permission is not a drink allowance',()=>{
 const q=request([fact('family','condition.children','children_activity'),fact('drink','participation.permission','own_drinks')]);
 assert.equal(search(q,[binding(1,play(),[rule()])]).ranked.length,0);
 assert.equal(search(q,[binding(1,play(),[worldFact('rule.external_drink',{policy:'ALLOWED',exceptions:[]})])]).ranked.length,1);
});

test('scope and conditions prevent borrowing another area permission',()=>{
 const p=profile([offer('play','MOVEMENT_PLAY',['play']),offer('meal','DINNER',['cafe'],[prop('participation.permission','Eigenes Essen erlaubt')])],[area('play'),area('cafe')]);
 assert.equal(search(query(),[binding(1,p)]).ranked.length,0);
 p.offers[0].properties=[prop('participation.permission','Eigenes Essen erlaubt',{conditions:{...conditions,weekdays:[1]}})];
 const q=request([...query().raw.facts,date()]);
 assert.equal(search(q,[binding(1,p)]).ranked.length,0);
});

test('a verified Zoo VISIT needs child/all-ages and family evidence; food or classification alone is not enough',()=>{
 const p=profile([offer('visit','VISIT',['outside'],[prop('participation.age_suitability','Alle Altersgruppen')])],[{...area('outside',[prop('atmosphere.character','familienfreundlich')]),kind:'OUTDOOR'}],'ZOO');
 assert.equal(result(p).ranked.length,1);
 p.offers[0].properties=[];
 assert.equal(result(p).ranked.length,0);
 const noClassification=structuredClone(captured);noClassification.decisionProjection.facts=noClassification.decisionProjection.facts.filter(f=>f.key!=='classification.place_types');
 assert.equal(search(query(),[noClassification]).ranked.length,0);
 const restaurant=profile([offer('meal','DINNER',['inside'],[prop('participation.age_suitability','Alle Altersgruppen')])],[area('inside',[prop('atmosphere.character','familienfreundlich')])]);
 assert.equal(result(restaurant).ranked.length,0);
});

test('active model validation rejects converting brought food into a supplied dish, retaining historical plans unchanged',()=>{
 const q=query();assert.doesNotThrow(()=>validateActiveLunaMeaningOutput(q.raw));
 for(const key of ['food.dish','food.meal','experience.activity']){
  const wrong={...q.raw,facts:[...q.raw.facts,fact('supply',key,'own_food')]};
  assert.throws(()=>validateActiveLunaMeaningOutput(wrong),/brought_consumption_is_permission_not_supply/);
  assert.equal(request(wrong.facts,wrong).raw.facts.find(f=>f.id==='supply').modality,'REQUIRED');
 }
});

test('conflicting and unauthorized canonical rules cannot be used as permission',()=>{
 const p=play(),b=binding(1,p,[rule()]),q=query();
 const world=parseProductWorldResolverBinding(b,'Basel');
 const visit=createLibrarianVisitWindow(q.facts,'Europe/Zurich',q.source.reference.now);
 const denied={...world,operationalRules:world.operationalRules.map(r=>({...r,authorizedUseCases:[]}))};
 assert.ok(externalConsumptionEvidence(q.facts.find(f=>f.id==='own'),denied,p,visit).every(e=>e.state==='UNKNOWN'));
 p.offers[0].properties.push(prop('participation.permission','Eigenes Essen erlaubt'));
 const conflicting={...world,conflicts:[{code:'OVERLAPPING_CONTRADICTORY_CLAIMS',severity:'BLOCKING',attributeKeys:['rule.external_food']}]};
 assert.ok(externalConsumptionEvidence(q.facts.find(f=>f.id==='own'),conflicting,p,visit).every(e=>e.state==='UNKNOWN'&&e.reason==='EXTERNAL_CONSUMPTION_RULE_CONFLICT'));
});
