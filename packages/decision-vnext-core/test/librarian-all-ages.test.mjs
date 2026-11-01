import test from 'node:test';
import assert from 'node:assert/strict';
import {fact,request,profile,offer,area,prop,binding,search,date,conditions,worldFact} from './librarian-matching-fixtures.mjs';
import {exercise} from './librarian-active-route-fixtures.mjs';
const family=()=>fact('family','condition.children','children_activity');
const animals=()=>fact('animals','experience.activity','Tiere beobachten');
const allAges=extra=>prop('participation.age_suitability','Alle Altersgruppen',extra);
const animalProfile=(properties=[allAges()])=>profile([offer('animals','ANIMAL_OBSERVATION',['outside'],properties)],[{...area('outside'),kind:'OUTDOOR'}]);

test('all ages explicitly establishes child suitability across offer kinds without family atmosphere',()=>{
 for(const kind of ['ANIMAL_OBSERVATION','GUIDED_TOUR','WORKSHOP','VISIT','DINNER','PERMANENT_EXHIBITION']){
  const p=profile([offer('activity',kind,['inside'],[allAges()])]);
  const c=search(request([family()]),[binding(1600,p)]).ranked[0];
  assert.ok(c,kind);assert.equal(c.facts.find(f=>f.factId==='family').state,'MET');assert.ok(c.facts.find(f=>f.factId==='family').propertyRead.sourceKeys.includes('participation.age_suitability'));
 }
 for(const value of ['Alle Altersgruppen','All ages','Tous âges']){
  const p=animalProfile([prop('participation.age_suitability',value)]);
  assert.equal(search(request([family(),animals()]),[binding(1601,p)]).ranked.length,1,value);
 }
});

test('all ages does not impose an age cutoff and known admission restrictions remain independent',()=>{
 for(const amount of [0,1,4,17,18,80,130]){
  const q=request([family(),animals(),fact('age','people.age',{amount,operator:'EQ',unit:'YEARS'},'CONTEXT',['p1'])]);
  const c=search(q,[binding(1602,animalProfile())]).ranked[0];assert.ok(c,String(amount));assert.ok(!c.facts.some(f=>f.reason==='CHILD_ENTRY_RULE_NOT_DOCUMENTED'),'explicit all-ages suitability is documented');
 }
 const p=animalProfile([allAges(),prop('participation.minimum_age',6)]);
 const q=request([family(),animals(),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p1'])]);
 assert.equal(search(q,[binding(1603,p)]).ranked.length,0);
});

test('offer age suitability is never borrowed from another offer or unrelated area',()=>{
 const p=animalProfile([]);p.areas.push(area('cafe'));p.offers.push(offer('food','DINNER',['cafe'],[allAges()]));
 assert.equal(search(request([family(),animals()]),[binding(1605,p)]).ranked.length,0,'a cafe cannot establish the animal offer age suitability');
 const shared=animalProfile([]);shared.offers.push(offer('food','DINNER',['outside'],[allAges()]));
 assert.equal(search(request([family(),animals()]),[binding(1606,shared)]).ranked.length,0,'sharing an area does not make two offers the same activity');
});

test('conditional and unknown all-ages declarations are not unconditional evidence',()=>{
 const q=request([family(),animals()]);
 const conditional=animalProfile([allAges({conditions:{...conditions,weekdays:[1]}})]);
 assert.equal(search(q,[binding(1607,conditional)]).ranked.length,0,'unknown applicability');
 assert.equal(search(request([...q.raw.facts,date()]),[binding(1607,conditional)]).ranked.length,0,'outside applicable weekday');
 for(const state of ['UNKNOWN','NOT_APPLICABLE'])assert.equal(search(q,[binding(1608,animalProfile([prop('participation.age_suitability',null,{state})]))]).ranked.length,0,state);
});

test('all ages proves suitability, not animals, playgrounds, food, or adult supervision',()=>{
 const p=profile([offer('meal','DINNER',['inside'],[allAges()])]);
 assert.equal(search(request([family(),animals()]),[binding(1609,p)]).ranked.length,0);
 assert.equal(search(request([family(),fact('play','offer.feature','Spielplatz')]),[binding(1609,p)]).ranked.length,0);
 const animalsOnly=animalProfile();
 assert.equal(search(request([family(),animals(),fact('meal','experience.activity','Essen gehen')]),[binding(1610,animalsOnly)]).ranked.length,0);
 const supervision=worldFact('rule.age_access_conditions',{notes:null,rules:[{mode:'UNACCOMPANIED_MINIMUM',minimumAge:13,accompaniment:'ADULT',area:null,days:[],event:null,appliesFromTime:null}]});
 const alone=request([family(),animals(),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p1']),fact('alone','people.relationship','unaccompanied','CONTEXT',[])]);
 assert.equal(search(alone,[binding(1610,animalsOnly,[supervision])]).ranked.length,0);
});

test('the ordinary HTTP composition confirms an all-ages animal activity without a family-atmosphere tag',async()=>{
 const r=await exercise({text:'Familienausflug irgendwas mit Tieren',meaning:request([family(),animals()]),catalog:[binding(1611,animalProfile())]});
 assert.equal(r.status,200);assert.ok(r.body.primaryCandidateId);assert.equal(r.body.candidates[0].rank,1);
 assert.equal(r.body.candidates[0].coreIntentCoverage,'CONFIRMED');assert.deepEqual(r.body.candidates[0].unknownHardConstraints,[]);
});
