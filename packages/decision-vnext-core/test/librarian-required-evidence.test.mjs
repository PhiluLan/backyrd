import test from 'node:test';
import assert from 'node:assert/strict';
import {librarianMandatoryEvidenceSatisfied} from '../dist/product-librarian-language.js';
import {fact,request,profile,offer,area,prop,binding,search,meal,date,evening,worldFact} from './librarian-matching-fixtures.mjs';
import {exercise} from './librarian-active-route-fixtures.mjs';
import {librarianCompanionContext} from '../dist/product-librarian-eligibility.js';

test('typed family context distinguishes recipients, adult children and explicitly minor or absent accompaniment',()=>{
 const age=(id,n)=>fact('age:'+id,'people.age',{amount:n,operator:'EQ',unit:'YEARS'},'CONTEXT',[id]);
 const child=age('p2',4),relation=fact('daughter','people.relationship','daughter','CONTEXT',['p2']);
 const check=facts=>{const q=request([fact('visit','experience.activity','open_discovery'),...facts]);return librarianCompanionContext(q,q.facts);};
 assert.equal(check([child,relation]).adultAccompaniment,true);
 assert.equal(check([age('p2',25),relation]).familyWithMinor,false);
 const recipient=fact('recipient','people.role','gift_recipient','CONTEXT',['p2']);
 assert.equal(check([child,relation,recipient]).familyWithMinor,false);
 assert.equal(check([child,relation,recipient,fact('visitor','people.role','companion','CONTEXT',['p2'])]).familyWithMinor,true);
 assert.equal(check([child,relation,fact('alone','people.relationship','children_alone','CONTEXT',['p2'])]).adultAccompaniment,false);
 assert.equal(check([child,relation,age('p1',16),fact('self','people.role','self','CONTEXT',['p1'])]).adultAccompaniment,false);
});

test('supporting visit conditions alone never become an experience or unrelated fallback cards',async()=>{
 for (const facts of [
  [fact('in','offer.area','indoor')],
  [fact('out','offer.area','outdoor')],
  [fact('access','participation.accessibility','stufenlos')],
 ]) {
  const meaning=request(facts);
  const b=binding(980,profile([offer('meal','DINNER')],[area('inside'),area('terrace')]),[
   worldFact('accessibility.step_free_entrance',true,{resolution:'KNOWN_TRUE'}),
  ]);
  const result=search(meaning,[b]);
  assert.equal(result.ranked.length,0);
  assert.equal(result.unresolved[0].decisionProof.semanticFit,'NOT_REQUESTED');
  const http=await exercise({text:'Ein Ort mit diesen Rahmenbedingungen',meaning,catalog:[b]});
  assert.equal(http.status,200,JSON.stringify(http.diagnostics));
  assert.equal(http.body.primaryCandidateId,null);
  assert.deepEqual(http.body.candidates,[]);
  assert.match(http.body.clarification,/Was möchtest du/);
  const empty=await exercise({text:'Ein Ort mit diesen Rahmenbedingungen',meaning,catalog:[]});
  assert.equal(empty.status,200);
  assert.deepEqual(empty.body.candidates,[]);
  assert.match(empty.body.clarification,/Was möchtest du/);
 }
});

test('open discovery with a child requires an age-suitable activity in the requested area, including at mixed venues',async()=>{
 const meaning=request([
  fact('outing','experience.activity','open_discovery'),fact('inside','offer.area','indoor'),
  fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2']),
 ]);
 const restaurant=binding(981,profile([offer('food','DINNER',['inside'],[prop('participation.age_suitability','all ages')])]));
 const museum=binding(982,profile([offer('exhibit','PERMANENT_EXHIBITION',['inside'],[prop('participation.age_suitability','all ages')])],[area()],'MUSEUM'));
 const play=binding(983,profile([offer('play','MOVEMENT_PLAY')]));
 const outdoor=binding(984,profile([offer('play','MOVEMENT_PLAY',['terrace']),offer('coffee','CAFE',['inside'])],[area('inside'),area('terrace')]));
 const tooOld=binding(985,profile([offer('sport','CHILDREN_COURSE',['inside'],[prop('participation.minimum_age',6)])]));
 const catalog=[restaurant,outdoor,tooOld,museum,play];
 const result=search(meaning,catalog);
 assert.deepEqual(new Set(result.ranked.map(row=>row.spotId)),new Set([museum,play].map(row=>row.decisionProjection.spotId)));
 assert.ok(result.excluded.some(row=>row.spotId===tooOld.decisionProjection.spotId));
 const http=await exercise({text:'Eine gemeinsame Unternehmung drinnen mit einem vierjährigen Kind',meaning,catalog});
 assert.equal(http.status,200,JSON.stringify(http.diagnostics));
 assert.ok([museum,play].some(row=>row.decisionProjection.spotId===http.body.primaryCandidateId));
 assert.ok(http.body.candidates.filter(row=>row.rank!==null).every(row=>[museum,play].some(b=>b.decisionProjection.spotId===row.spotId)));
 assert.ok(!http.body.candidates.some(row=>row.spotId===restaurant.decisionProjection.spotId),
  'an unrelated restaurant must not reappear in the small fallback window');
 assert.equal(http.body.interpretation.group.minimumAge,4);
});

test('NukNuk open-wish handoff keeps age and company through retrieval and Product presentation',async()=>{
 const {createDecisionProductNuknukProvider}=await import('../dist/product-nuknuk-provider.js');
 const raw={meaning:{entities:[{id:'child',kind:'PERSON',label:'Tochter',members:[]}],facts:[
  {id:'inside',key:'offer.area',value:{text:'indoor'},modality:'REQUIRED',basis:'EXPLICIT',subjectIds:[]},
  {id:'age',key:'people.age',value:{amount:4,operator:'EQ',unit:'YEARS'},modality:'CONTEXT',basis:'EXPLICIT',subjectIds:['child']},
  {id:'company',key:'people.relationship',value:{text:'adult_accompanied'},modality:'CONTEXT',basis:'INFERRED',subjectIds:['child']},
 ]}};
 const understandOverride=createDecisionProductNuknukProvider({endpoint:'https://nuknuk.example.test/v1/chat/completions',
  apiKey:'synthetic',model:'synthetic',now:()=>new Date('2026-10-14T08:00:00Z'),
  fetchImpl:async()=>Response.json({model:'synthetic',choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]}),
 });
 const restaurant=binding(986,profile()),play=binding(987,profile([offer('play','MOVEMENT_PLAY')]));
 const r=await exercise({text:'Irgendwas drinnen machen mit meiner 4 jährigen Tochter',catalog:[restaurant,play],understandOverride});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));
 assert.equal(r.body.primaryCandidateId,play.decisionProjection.spotId);
 assert.deepEqual(r.body.candidates.map(row=>row.spotId),[play.decisionProjection.spotId]);
 assert.equal(r.body.interpretation.group.minimumAge,4);
 assert.equal(r.body.interpretation.group.adultPresent,true);
 assert.equal(r.body.interpretation.group.companionType,'FAMILY');
 assert.equal(r.reads,1);
});

test('scoped indoor evidence cannot be borrowed by an unscoped activity, and separate activities retain their own areas',()=>{
 for(const subjects of [[],['a1']]){
  const q=request([fact('inside','offer.area','indoor','REQUIRED',['a1']),fact('visit','experience.activity','open_discovery','REQUIRED',subjects)]);
  const bad=binding(988,profile([offer('course','WORKSHOP',[]),offer('drink','DRINKS',['inside'])]));
  const good=binding(989,profile([offer('course','WORKSHOP',['inside']),offer('drink','DRINKS',['inside'])]));
  assert.equal(search(q,[bad]).ranked.length,0);
  const yes=search(q,[good]);assert.equal(yes.ranked.length,1);
  assert.deepEqual(yes.ranked[0].offerIds,['course']);
 }
 const two=request([fact('course','experience.activity','Workshop','REQUIRED',['a1']),fact('in','offer.area','indoor','REQUIRED',['a1']),fact('coffee','food.drink','coffee','REQUIRED',['a2'])]);
 const venue=binding(990,profile([offer('course','WORKSHOP',['inside']),offer('coffee','CAFE',['terrace'])],[area('inside'),area('terrace')]));
 assert.equal(search(two,[venue]).ranked.length,1,'an indoor requirement on the workshop must not move the separate coffee visit indoors');
});

test('open child discovery needs suitability on the actual activity, not on the catering',async()=>{
 const meaning=request([fact('open','experience.activity','open_discovery'),fact('inside','offer.area','indoor'),
  fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2']),
  fact('company','people.relationship','daughter','CONTEXT',['p2'])]);
 const boardGames=binding(991,profile([offer('games','PLAY',['inside'])]));
 const borrowed=binding(992,profile([offer('tour','GUIDED_TOUR',['inside']),offer('coffee','CAFE',['inside'],[prop('participation.age_suitability','all ages')])]));
 const childPlay=binding(993,profile([offer('play','MOVEMENT_PLAY',['inside'])]));
 const museum=binding(994,profile([offer('visit','PERMANENT_EXHIBITION',['inside'],[prop('participation.age_suitability','all ages')])],[area()],'MUSEUM'));
 const r=await exercise({text:'Mit meiner vierjährigen Tochter etwas drinnen unternehmen',meaning,catalog:[boardGames,borrowed,childPlay,museum]});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));
 assert.deepEqual(new Set(r.body.candidates.filter(c=>c.rank!==null).map(c=>c.spotId)),new Set([childPlay,museum].map(b=>b.decisionProjection.spotId)));
 assert.equal(r.body.interpretation.group.minimumAge,4);
 assert.equal(r.body.interpretation.group.adultPresent,true);
 assert.equal(r.body.interpretation.group.companionType,'FAMILY');
 assert.equal(meaning.facts.filter(f=>f.key==='people.age').length,1,'no numeric adult age may be invented');
});

test('a vegetarian-food budget cannot use a drinks tariff on a mixed snack offer',()=>{
 const q=request([fact('venue','offer.kind','RESTAURANT'),fact('diet','food.diet','vegetarian'),
  fact('money','budget.maximum',{amount:30,operator:'LTE',currency:'CHF'}),fact('scope','budget.scope',{scope:'PER_PERSON'},'CONTEXT',[])]);
 const venue=profile([offer('apero','APERITIF',['inside'],[prop('food.diet','vegetarian')],[{label:'Getränke',currency:'CHF',min:5,max:21,basis:'PER_PERSON',minimumAge:null,maximumAge:null,mandatoryFeesIncluded:true,includes:'Getränke',conditions:{weekdays:[],dayparts:[],event:null,validFrom:null,validUntil:null}}])]);
 const r=search(q,[binding(995,venue)]);
 assert.equal(r.ranked.length,0);
 assert.equal(r.unresolved[0].facts.find(f=>f.factId==='money').reason,'REQUESTED_PRICE_COMPONENT_NOT_DOCUMENTED');
 const meal=profile([offer('lunch','LUNCH',['inside'],[prop('food.diet','vegetarian')],[{...venue.offers[0].prices[0],label:'Mittagsmenü',includes:'Essen',min:22,max:22}])]);
 assert.equal(search(q,[binding(996,meal)]).ranked.length,1);
});

// Verify the admission invariant independently of wording and field families.
for(const family of ['experience.activity','offer.kind','offer.feature','atmosphere.character','participation.accessibility','time.date','people.count','extension']){
 for(const modality of ['REQUIRED','EXCLUDED'])for(const state of ['MET','UNKNOWN','FAILED','CONTEXT','NOT_REQUIRED']){
  test(`${family}: ${modality} ${state} cannot be silently weakened`,()=>{
   assert.equal(librarianMandatoryEvidenceSatisfied([{family,modality,state}]),state==='MET');
  });
 }
}
for(const a of ['MET','UNKNOWN','FAILED'])for(const b of ['MET','UNKNOWN','FAILED'])for(const c of ['MET','UNKNOWN','FAILED']){
 test(`all duties must hold together: ${a}/${b}/${c}`,()=>assert.equal(librarianMandatoryEvidenceSatisfied([a,b,c].map(state=>({modality:'REQUIRED',state}))),[a,b,c].every(s=>s==='MET')));
}

test('a proven access feature cannot replace an unknown required programme',async()=>{
 const meaning=request([fact('jazz','offer.feature','Live-Jazz'),fact('access','participation.accessibility','stufenlos')]);
 const b=binding(901,profile(),[worldFact('accessibility.step_free_entrance',true,{resolution:'KNOWN_TRUE'})]);
 const r=search(meaning,[b]);assert.equal(r.ranked.length,0);assert.equal(r.unresolved.length,1);
 assert.equal(r.unresolved[0].facts.find(f=>f.factId==='jazz').modality,'REQUIRED');
 assert.equal(r.unresolved[0].facts.find(f=>f.factId==='jazz').state,'UNKNOWN');
 assert.equal(r.unresolved[0].facts.find(f=>f.factId==='access').state,'MET');
 const http=await exercise({text:'Live-Jazz mit stufenlosem Zugang',meaning,catalog:[b]});
 assert.equal(http.status,200);assert.equal(http.body.primaryCandidateId,null);assert.ok(http.body.candidates.every(c=>c.rank===null&&c.coreIntentCoverage!=='CONFIRMED'));
});

test('mandatory atmosphere is binding while explicit preference remains optional',()=>{
 const b=binding(902,profile());
 const mandatory=search(request([meal(),fact('quiet','atmosphere.character','ruhig')]),[b]);
 assert.equal(mandatory.ranked.length,0);assert.equal(mandatory.unresolved[0].facts.find(f=>f.factId==='quiet').state,'UNKNOWN');
 const preferred=search(request([meal(),fact('quiet','atmosphere.character','ruhig','PREFERRED')]),[b]);
 assert.equal(preferred.ranked.length,1);assert.equal(preferred.ranked[0].facts.find(f=>f.factId==='quiet').modality,'PREFERRED');
});

test('unverifiable required participant count is not converted to harmless context',()=>{
 const r=search(request([meal(),fact('party','people.count',{amount:6,operator:'EQ',unit:'PEOPLE'},'REQUIRED',['g1'])]),[binding(903,profile())]);
 assert.equal(r.ranked.length,0);const count=r.unresolved[0].facts.find(f=>f.factId==='party');
 assert.equal(count.modality,'REQUIRED');assert.equal(count.state,'UNKNOWN');assert.equal(count.reason,'SCOPED_GROUP_CAPACITY_UNKNOWN_OR_CONFLICTING');
});

test('a requested date with no offer schedule inherits verified venue hours',async()=>{
 const b=binding(904,profile([{...offer(),schedule:[]} ]));const meaning=request([meal(),date(),evening()]);
 const r=search(meaning,[b]);assert.equal(r.ranked.length,1);
 assert.equal(r.ranked[0].facts.find(f=>f.factId==='date').state,'MET');
 const http=await exercise({text:'Morgen Abend essen',meaning,catalog:[b]});assert.equal(http.status,200);assert.equal(http.body.primaryCandidateId,b.decisionProjection.spotId);
});

test('a real either-or admits the fully proved branch without demanding the other',async()=>{
 const meaning=request([fact('dinner','experience.activity','Abendessen'),fact('coffee','offer.kind','Café'),fact('quiet','atmosphere.character','ruhig')],{
  logic:{kind:'ALL',children:[{kind:'ANY',strength:'REQUIRED',children:[{kind:'FACT',factId:'dinner'},{kind:'FACT',factId:'coffee'}]},{kind:'FACT',factId:'quiet'}]}
 });
 const good=binding(905,profile([offer()],[area('inside',[prop('atmosphere.character','ruhig')])])),bad=binding(906,profile());
 const r=search(meaning,[bad,good]);assert.deepEqual(r.ranked.map(c=>c.spotId),[good.decisionProjection.spotId]);
 assert.ok(r.unresolved.some(c=>c.spotId===bad.decisionProjection.spotId));
 const http=await exercise({text:'Abendessen oder Café, auf jeden Fall ruhig',meaning,catalog:[bad,good]});assert.equal(http.status,200);assert.equal(http.body.primaryCandidateId,good.decisionProjection.spotId);
});

test('a forbidden feature is not downgraded to a ranking penalty',()=>{
 const q=request([meal(),fact('music','atmosphere.music','Musik','EXCLUDED')]);
 const r=search(q,[binding(907,profile([offer()],[area('inside',[prop('atmosphere.music','Musik')])]))]);
 assert.equal(r.ranked.length,0);assert.ok(r.excluded[0].failedFactIds.includes('music'));
});

test('a programme with matching access is admitted when both facts are actually proven',async()=>{
 for(const key of ['offer.feature','atmosphere.music']){
  const meaning=request([fact('programme',key,'Live-Jazz'),fact('access','participation.accessibility','stufenlos')]);
  const b=binding(910,profile([offer('music','OTHER',['inside'],[prop(key,'Live-Jazz')])]),[worldFact('accessibility.step_free_entrance',true,{resolution:'KNOWN_TRUE'})]);
  const r=search(meaning,[b]);assert.equal(r.ranked.length,1,key);assert.deepEqual(r.ranked[0].unknownFactIds,[]);
  const http=await exercise({text:'Live-Jazz, stufenlos zugänglich',meaning,catalog:[b]});assert.equal(http.status,200);assert.equal(http.body.primaryCandidateId,b.decisionProjection.spotId);assert.equal(http.body.candidates[0].tier,'ELIGIBLE_CONFIRMED');
 }
});
