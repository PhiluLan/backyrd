import test from 'node:test';
import assert from 'node:assert/strict';
import {librarianMandatoryEvidenceSatisfied} from '../dist/product-librarian-language.js';
import {fact,request,profile,offer,area,prop,binding,search,meal,date,evening,worldFact} from './librarian-matching-fixtures.mjs';
import {exercise} from './librarian-active-route-fixtures.mjs';

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

test('a requested date with no offer schedule stays an unknown duty',async()=>{
 const b=binding(904,profile([{...offer(),schedule:[]} ]));const meaning=request([meal(),date(),evening()]);
 const r=search(meaning,[b]);assert.equal(r.ranked.length,0);assert.ok(r.unresolved[0].unknownFactIds.includes('date'));
 assert.equal(r.unresolved[0].facts.find(f=>f.factId==='date').state,'UNKNOWN');
 const http=await exercise({text:'Morgen Abend essen',meaning,catalog:[b]});assert.equal(http.status,200);assert.equal(http.body.primaryCandidateId,null);
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
