import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyExperienceProfile, emptyExperienceConditions, REGISTRY_VERSION, REGISTRY_HASH, ACCEPTED_SOURCE_POLICY } from '@backyrd/world-knowledge-core';
import { prepareLibrarianRequest,LUNA_LIBRARIAN_CONTRACT_VERSION } from '../dist/product-luna-librarian.js';
import { searchLibrarianCatalog } from '../dist/product-librarian-matching.js';
import { contentHash } from '../dist/canonical.js';
import { LIBRARIAN_FAMILY_STRATEGIES } from '../dist/product-librarian-language.js';
import { LUNA_LIBRARIAN_FACT_KEYS } from '../dist/product-luna-librarian-assets.js';
import { reference, authority, entities, fact, request, conditions, prop, area, schedule, price, offer, profile, worldFact, binding, search, meal, date, evening, budget, summary } from './librarian-matching-fixtures.mjs';

test('all frozen fact families have an explicit strategy',()=>assert.equal(Object.keys(LIBRARIAN_FAMILY_STRATEGIES).length,Object.values(LUNA_LIBRARIAN_FACT_KEYS).flat().length));
test('simple meal joins a reviewed offering without interpreting user prose',()=>{const r=search(request([meal()]),[binding(1,profile())]);assert.equal(r.ranked[0].status,'CONFIRMED',JSON.stringify(summary(r)));assert.deepEqual(r.ranked[0].offerIds,['dinner']);});
test('Luzern destination cannot become Basel despite candidate authority',()=>{const r=search(request([meal(),fact('city','location.destination','Luzern','REQUIRED',[])]),[binding(1,profile())]);assert.equal(r.excluded[0].failedFactIds.includes('city'),true);});
test('romantic dinner at the river needs one real offer-area link',()=>{
 const r=request([meal(),fact('romance','atmosphere.character','romantisch'),fact('river','location.waterbody','Rhein')]);
 const good=profile([offer('dinner','DINNER',['terrace'])],[area('terrace',[prop('atmosphere.character','romantisch'),prop('location.waterbody','Rhein')])]);
 const split=profile([offer('dinner','DINNER',['inside'])],[area('inside',[prop('atmosphere.character','romantisch')]),area('terrace',[prop('location.waterbody','Rhein')])]);
 const result=search(r,[binding(1,good),binding(2,split)]);assert.equal(result.ranked[0].status,'CONFIRMED',JSON.stringify(summary(result)));assert.equal(result.ranked[1].status,"PARTIAL",JSON.stringify(summary(result)));
});
test('cheap aperitif cannot prove the dinner budget',()=>{const p=profile([offer('dinner','DINNER',['inside'],[],[price(65)]),offer('apero','APERITIF',['inside'],[],[price(12)])]);const r=search(request([meal(),...budget(40)]),[binding(1,p)]);assert.equal(r.excluded[0].failedFactIds.includes('money'),true,JSON.stringify(summary(r)));});
test('exact complete per-person price can confirm budget',()=>{const r=search(request([meal(),...budget(40)]),[binding(1,profile())]);assert.equal(r.ranked[0].status,'CONFIRMED',JSON.stringify(summary(r)));});
test('unknown upper bound or mandatory fees stays unknown',()=>{for(const extra of [{max:null},{mandatoryFeesIncluded:null},{mandatoryFeesIncluded:false}]){const r=search(request([meal(),...budget(40)]),[binding(1,profile([offer('dinner','DINNER',['inside'],[],[price(30,extra)])]))]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].unknownFactIds.includes('money'));}});
test('group budget sums actual participants without changing its scope',()=>{const facts=[meal(),fact('count','people.count',{amount:2,operator:'EQ',unit:'PEOPLE'},'CONTEXT',['g1']),fact('money','budget.maximum',{amount:60,operator:'LTE',currency:'CHF'}),fact('scope','budget.scope',{scope:'GROUP_TOTAL'},'CONTEXT',[])];const r=search(request(facts),[binding(1,profile())]);assert.equal(r.excluded[0].failedFactIds.includes('money'),true,JSON.stringify(summary(r)));});
test('museum with cafe is two scoped offers, not a meal or a guided tour',()=>{const p=profile([offer('visit','PERMANENT_EXHIBITION',['inside'],[],[]),offer('cafe','CAFE',['inside'],[],[])],[area()],'MUSEUM');const r=search(request([fact('museum','offer.kind','Museum'),fact('coffee','offer.kind','Café')]),[binding(1,p)]);assert.equal(r.ranked[0].status,'CONFIRMED',JSON.stringify(summary(r)));assert.deepEqual(r.ranked[0].offerIds,['cafe','visit']);});
test('real either-or does not demand both offerings',()=>{const r=request([fact('coffee','offer.kind','Café'),fact('drinks','experience.activity','etwas trinken')],{logic:{kind:'ANY',strength:'REQUIRED',children:[{kind:'FACT',factId:'coffee'},{kind:'FACT',factId:'drinks'}]}});const result=search(r,[binding(1,profile([offer('bar','DRINKS',['inside'],[],[])],[area()],'BAR'))]);assert.equal(result.ranked[0].status,'CONFIRMED',JSON.stringify(summary(result)));assert.deepEqual(result.ranked[0].selectedFactIds,['drinks']);});
test('missing preferred cake does not exclude a valid cafe',()=>{const r=search(request([fact('coffee','offer.kind','Café'),fact('cake','food.dish','Apfelkuchen','PREFERRED')]),[binding(1,profile([offer('cafe','CAFE',['inside'],[],[])],[area()],'MUSEUM'))]);assert.equal(r.ranked[0].status,'CONFIRMED');assert.ok(r.ranked[0].facts.find(f=>f.factId==='cake').state==='UNKNOWN');});
test('preferred either-or remains soft, even if neither offer exists',()=>{const r=request([meal(),fact('cake','food.dish','Apfelkuchen'),fact('wine','food.drink','Wein')],{logic:{kind:'ALL',children:[{kind:'FACT',factId:'meal'},{kind:'ANY',strength:'PREFERRED',children:[{kind:'FACT',factId:'cake'},{kind:'FACT',factId:'wine'}]}]}});const result=search(r,[binding(1,profile())]);assert.equal(result.ranked[0].status,'CONFIRMED',JSON.stringify(summary(result)));});
test('a fact repeated in a hard branch cannot become soft through another branch',()=>{const r=request([meal(),fact('vegan','food.diet','vegan'),fact('wine','food.drink','Wein')],{logic:{kind:'ALL',children:[{kind:'FACT',factId:'meal'},{kind:'FACT',factId:'vegan'},{kind:'ANY',strength:'PREFERRED',children:[{kind:'FACT',factId:'vegan'},{kind:'FACT',factId:'wine'}]}]}});const result=search(r,[binding(1,profile())]);assert.equal(result.ranked[0].status,'PARTIAL',JSON.stringify(summary(result)));assert.ok(result.ranked[0].unknownFactIds.includes('vegan'));});
test('friendly wording never weakens required vegan food',()=>{const r=search(request([meal(),fact('vegan','food.diet','vegan')]),[binding(1,profile())]);assert.equal(r.ranked[0].status,'PARTIAL');assert.equal(r.ranked[0].facts.find(f=>f.factId==='vegan').modality,'REQUIRED');});
test('no music needs explicit absence at the chosen area',()=>{const p=profile([offer('cafe','CAFE',['inside','terrace'],[],[])],[area('inside',[prop('atmosphere.character','ruhig'),prop('atmosphere.music','keine Musik')]),area('terrace',[prop('atmosphere.music','Live-Musik')])],'MUSEUM');const r=search(request([fact('coffee','offer.kind','Café'),fact('quiet','atmosphere.character','ruhig'),fact('music','atmosphere.music','Musik','EXCLUDED')]),[binding(1,p)]);assert.equal(r.ranked[0].status,'CONFIRMED',JSON.stringify(summary(r)));assert.deepEqual(r.ranked[0].areaIds,['inside']);});
test('lack of music data does not prove no music',()=>{const r=search(request([meal(),fact('music','atmosphere.music','Musik','EXCLUDED')]),[binding(1,profile())]);assert.equal(r.ranked[0].status,'PARTIAL');});
test('new unknown words stay unresolved instead of matching a familiar dish',()=>{const r=search(request([meal(),fact('novel','food.dish','glitzerknödel')]),[binding(1,profile([offer('dinner','DINNER',['inside'],[prop('food.dish','Pizza')])]))]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].unknownFactIds.includes('novel'));});
test('tomorrow evening checks the venue and the offering for that exact day',()=>{const good=binding(1,profile()),p=profile([{...offer(),schedule:[{weekday:4,start:'11:00',end:'14:00'}]}]);const r=search(request([meal(),date(),evening()]),[good,binding(2,p)]);assert.equal(r.ranked[0].status,'CONFIRMED',JSON.stringify(summary(r)));assert.equal(r.excluded.length,1);});
test('spot opening hours alone do not confirm kitchen or offer time',()=>{const p=profile([{...offer(),schedule:[]}]);const r=search(request([meal(),date(),evening()]),[binding(1,p)]);assert.equal(r.ranked[0].status,'CONFIRMED');assert.equal(r.ranked[0].facts.find(f=>f.factId==='date').reason,'VISIT_TIME_UNCONFIRMED');});
test('day conditions do not turn into unconditional atmosphere',()=>{const p=profile([offer()],[area('inside',[prop('atmosphere.character','ruhig',{conditions:{...conditions,weekdays:[3]}})])]);const r=search(request([meal(),date(),fact('quiet','atmosphere.character','ruhig')]),[binding(1,p)]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].unknownFactIds.includes('quiet'));});
test('custom detail and unsupported family survive as unknown',()=>{const r=search(request([meal(),fact('creator','experience.creator','unbekannter Künstler')]),[binding(1,profile())]);assert.ok(r.ranked[0].facts.some(f=>f.factId==='creator'&&f.state==='UNKNOWN'));});
test('result is deterministic under catalog order and contains no private source text',()=>{const r=request([meal()]),a=binding(1,profile()),b=binding(2,profile());assert.equal(search(r,[a,b]).resultHash,search(r,[b,a]).resultHash);assert.equal(JSON.stringify(search(r,[a])).includes(r.source.sourceText),false);});
test('forged request hash, duplicate spot and unbound manifest are rejected',()=>{const r=request([meal()]),b=binding(1,profile());assert.throws(()=>search({...r,requestHash:'0'.repeat(64)},[b]),/request_hash/);assert.throws(()=>search(r,[b,b]),/duplicate_spot/);assert.throws(()=>search(r,[{...b,manifestHash:'not-a-hash'}]),/manifest_binding/);});

test('an unscoped river wish cannot be proved by a different, unused terrace',()=>{const p=profile([offer('dinner','DINNER',['inside'])],[area(),area('terrace',[prop('location.waterbody','Rhein')])]);const r=search(request([meal(),fact('river','location.waterbody','Rhein','REQUIRED',[])]),[binding(1,p)]);assert.equal(r.ranked[0].status,"PARTIAL",JSON.stringify(summary(r)));});
test('separate activity budgets are not added into each other',()=>{const facts=[meal(),fact('drinks','experience.activity','etwas trinken','REQUIRED',['a2']),...budget(40),fact('drinkbudget','budget.maximum',{amount:12,operator:'LTE',currency:'CHF'},'REQUIRED',['a2']),fact('drinkscope','budget.scope',{scope:'PER_PERSON'},'CONTEXT',['a2'])];facts.find(f=>f.id==='scope').subjectIds=['a1'];const p=profile([offer('dinner','DINNER',['inside'],[],[price(35)]),offer('drinks','OTHER',['inside'],[prop('experience.activity','etwas trinken')],[price(10,{includes:'Getränke'})])]);const r=search(request(facts),[binding(1,p)]);assert.equal(r.ranked[0].status,'CONFIRMED',JSON.stringify(summary(r)));});
test('closed music offering cannot fabricate explicit absence of music',()=>{const p=profile([offer('cafe','CAFE',['inside'],[],[]),{...offer('event','MUSIC_EVENT',['inside'],[prop('atmosphere.music','Musik')],[]),schedule:[{weekday:4,start:'21:00',end:'23:00'}]}],[area()],'MUSEUM');p.offers[1].kind='SPECIAL_EXHIBITION';const r=search(request([fact('cafe','offer.kind','Café'),date(),fact('clock','time.clock',{time:'14:00',operator:'EQ',timezone:'Europe/Zurich'},'REQUIRED',[]),fact('music','atmosphere.music','Musik','EXCLUDED')]),[binding(1,p)]);assert.equal(r.ranked[0].status,'PARTIAL',JSON.stringify(summary(r)));assert.ok(r.ranked[0].unknownFactIds.includes('music'));});
test('verified under-18 entry restriction is applied before ranking',()=>{const rule=worldFact('rule.age_access',{policy:'MINIMUM_AGE',minimumAge:18,appliesFromTime:null});const r=search(request([meal(),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2']),fact('party','people.relationship','Familie','CONTEXT',['g1'])]),[binding(1,profile(),[rule])]);assert.equal(r.excluded[0].status,'INELIGIBLE');assert.ok(r.excluded[0].facts.some(f=>f.reason==='PARTICIPANT_BELOW_VERIFIED_MINIMUM_AGE'));});
test('missing ages cannot satisfy a known legal minimum',()=>{const r=search(request([meal()]),[binding(1,profile(),[worldFact('rule.age_access',{policy:'MINIMUM_AGE',minimumAge:18,appliesFromTime:null})])]);assert.equal(r.ranked[0].status,'PARTIAL');});
test('family age-specific entry prices are summed for the actual people',()=>{const p=profile([offer('visit','VISIT',['inside'],[],[price(25,{label:'Erwachsene',minimumAge:18}),price(5,{label:'Kinder',minimumAge:0,maximumAge:17})])],[area()],'ZOO');const facts=[fact('visit','offer.kind','Zoo'),fact('aage','people.age',{amount:34,operator:'EQ',unit:'YEARS'},'CONTEXT',['p1']),fact('cage','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2']),fact('count','people.count',{amount:2,operator:'EQ',unit:'PEOPLE'},'CONTEXT',['g1']),fact('money','budget.maximum',{amount:30,operator:'LTE',currency:'CHF'}),fact('scope','budget.scope',{scope:'GROUP_TOTAL'},'CONTEXT',[])];const r=search(request(facts),[binding(1,p,[worldFact('rule.age_access',{policy:'ALL_AGES',minimumAge:null,appliesFromTime:null})])]);assert.equal(r.ranked[0].status,'CONFIRMED',JSON.stringify(summary(r)));});
test('unreferenced group entities do not manufacture budget participants',()=>{const facts=[meal(),fact('money','budget.maximum',{amount:100,operator:'LTE',currency:'CHF'}),fact('scope','budget.scope',{scope:'GROUP_TOTAL'},'CONTEXT',[])];const r=search(request(facts),[binding(1,profile())]);assert.equal(r.ranked[0].status,'PARTIAL');assert.equal(r.ranked[0].facts.find(f=>f.factId==='money').reason,'GROUP_PRICE_HEADCOUNT_UNKNOWN');});
test('an indoor zoo building alone cannot prove an indoor whole-zoo visit',()=>{const p=profile([offer('visit','VISIT',['inside','terrace'],[],[])],[area(),area('terrace',[])],'ZOO');p.areas[1].kind='OUTDOOR';const r=search(request([fact('zoo','offer.kind','Zoo'),fact('inside','offer.area','drinnen')]),[binding(1,p)]);assert.equal(r.ranked[0].status,'PARTIAL');});
const rainyRequest=()=>request([date(),fact('zoo','offer.kind','Zoo'),fact('museum','offer.kind','Museum')],{weatherConditions:[{id:'rain',basis:'EXPLICIT',subjectIds:[],state:'RAIN',detail:null}],logic:{kind:'IF',conditionFactId:'rain',then:{kind:'FACT',factId:'museum'},else:{kind:'FACT',factId:'zoo'}}});
const zoo=()=>{const p=profile([offer('visit','VISIT',['inside'],[],[])],[area()],'ZOO');return binding(1,p);};
test('unknown rain does not make a weather branch unconditional',()=>{const r=search(rainyRequest(),[zoo()]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].limitations.includes('WEATHER_CONDITION_UNKNOWN'));});
test('bound trusted dry weather selects the correct alternative',()=>{const q=rainyRequest(),b=zoo();const evidence={requestHash:q.requestHash,conditionId:'rain',spotId:b.decisionProjection.spotId,localDate:'2026-10-15',state:'FALSE',sourceHash:'a'.repeat(64),validUntil:'2026-10-14T10:00:00Z'};const r=search(q,[b],{conditionEvidence:[evidence]});assert.equal(r.ranked[0].status,'CONFIRMED',JSON.stringify(summary(r)));assert.ok(r.ranked[0].selectedFactIds.includes('zoo'));assert.ok(r.ranked[0].inactiveFactIds.includes('museum'));});
test('stale or differently bound weather is ignored',()=>{const q=rainyRequest(),b=zoo();for(const patch of [{requestHash:'f'.repeat(64)},{localDate:'2026-10-16'},{validUntil:'2026-10-14T07:59:00Z'}]){const r=search(q,[b],{conditionEvidence:[{requestHash:q.requestHash,conditionId:'rain',spotId:b.decisionProjection.spotId,localDate:'2026-10-15',state:'FALSE',sourceHash:'a'.repeat(64),validUntil:'2026-10-14T10:00:00Z',...patch}]});assert.equal(r.ranked[0].status,'PARTIAL');}});
test('inactive cross-weather binding cannot force mutually exclusive offers',()=>{const base=rainyRequest();const q=prepareLibrarianRequest({contractVersion:LUNA_LIBRARIAN_CONTRACT_VERSION,sourceText:base.source.sourceText,reference,output:{...base.raw,bindings:[{kind:'SAME_PLACE',factIds:['zoo','museum']}]}});const b=zoo();const r=search(q,[b],{conditionEvidence:[{requestHash:q.requestHash,conditionId:'rain',spotId:b.decisionProjection.spotId,localDate:'2026-10-15',state:'FALSE',sourceHash:'a'.repeat(64),validUntil:'2026-10-14T10:00:00Z'}]});assert.equal(r.ranked[0].status,'CONFIRMED',JSON.stringify(summary(r)));});
test('single app recommendations never fabricate multi-stop or simultaneous capacity',()=>{for(const kind of ['SEQUENCE','SIMULTANEOUS']){const q=request([meal(),fact('drinks','experience.activity','etwas trinken','REQUIRED',['a2'])],{bindings:[{kind,factIds:['meal','drinks']}]});const p=profile([offer(),offer('drinks','OTHER',['inside'],[prop('experience.activity','etwas trinken')],[])]);const r=search(q,[binding(1,p)]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].limitations.length===0||r.ranked[0].unknownFactIds.some(id=>id.startsWith('binding:')));}});
test('without a time wish the engine does not invent a current visit from opening state',()=>{const closed=worldFact('state.current',{kind:'CLOSED',scope:'VENUE'},{validityVerified:true,validFrom:'2026-10-14T07:00:00Z',validUntil:'2026-10-14T12:00:00Z'});const r=search(request([meal()]),[binding(1,profile(),[closed])]);assert.equal(r.ranked[0].status,'CONFIRMED');});
test('ranking favors complete fit over a partial venue with many preferences',()=>{const q=request([meal(),fact('vegan','food.diet','vegan'),fact('romance','atmosphere.character','romantisch','PREFERRED')]);const complete=profile([offer('dinner','DINNER',['inside'],[prop('food.diet','vegan')])]);const partial=profile([offer()],[area('inside',[prop('atmosphere.character','romantisch')])]);const r=search(q,[binding(2,partial),binding(1,complete)]);assert.equal(r.ranked[0].status,'CONFIRMED');assert.equal(r.ranked[1].status,'PARTIAL');});

test('a bare weekday is not silently converted to today',()=>{const r=search(request([meal(),fact('weekday','time.weekday','Samstag','REQUIRED',[])]),[binding(1,profile())]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].unknownFactIds.includes('weekday'));});
test('inconsistent exact date and weekday remain unresolved',()=>{const r=search(request([meal(),date(),fact('weekday','time.weekday','Samstag','REQUIRED',[])]),[binding(1,profile())]);assert.equal(r.ranked[0].status,'PARTIAL');});
test('an original time phrase without its structured date is never treated as now',()=>{const closed=worldFact('state.current',{kind:'CLOSED',scope:'VENUE'},{validityVerified:true,validFrom:'2026-10-14T07:00:00Z',validUntil:'2026-10-14T12:00:00Z'});const r=search(request([meal(),fact('original','time.original','Morgen','CONTEXT',[])]),[binding(1,profile(),[closed])]);assert.equal(r.ranked[0].status,'PARTIAL');});
test('a preferred money bound earns a bonus only if actual selected prices meet it',()=>{const facts=[meal(),fact('money','budget.maximum',{amount:40,operator:'LTE',currency:'CHF'},'PREFERRED'),fact('scope','budget.scope',{scope:'PER_PERSON'},'CONTEXT',[])];const r=search(request(facts),[binding(1,profile())]);assert.equal(r.ranked[0].status,'CONFIRMED');assert.ok(r.ranked[0].matchedPreferences.includes('money'));});
test('additional open vocabulary is data, not new user-prose parsing',async()=>{
 const {createLibrarianCatalogMatcher}=await import('../dist/product-librarian-matching.js');
 const {LIBRARIAN_MEANING_REGISTRY_VERSION}=await import('../dist/product-librarian-semantics.js');
 const body={contractVersion:LIBRARIAN_MEANING_REGISTRY_VERSION,releaseId:'synthetic:approved-v1',links:[{family:'food.diet',requestValue:'vegane Gerichte müssen möglich sein',propertyKey:'food.diet',propertyLabel:null,propertyValue:'vegan',relation:'SAME_MEANING'}]};const registry={...body,registryHash:contentHash(body)};
 const q=request([meal(),fact('vegan','food.diet','vegane Gerichte müssen möglich sein')]),catalog=[binding(1,profile([offer('dinner','DINNER',['inside'],[prop('food.diet','vegan')])]))];
 assert.equal(search(q,catalog).ranked[0].status,'PARTIAL');
 const matcher=createLibrarianCatalogMatcher({meaningRegistry:registry,acceptedRegistryHashes:[registry.registryHash]});const result=matcher({request:q,catalog,authority});
 assert.equal(result.ranked[0].status,'CONFIRMED');assert.notEqual(result.languageHash,search(q,catalog).languageHash);assert.ok(result.ranked[0].facts.find(f=>f.factId==='vegan').evidenceHashes.length>0);
 assert.throws(()=>createLibrarianCatalogMatcher({meaningRegistry:registry,acceptedRegistryHashes:[]}),/not_accepted/);
 assert.throws(()=>createLibrarianCatalogMatcher({meaningRegistry:{...registry,links:[]},acceptedRegistryHashes:[registry.registryHash]}),/hash_mismatch/);
});
test('an accepted link cannot override unknown property state or its conditions',async()=>{
 const {createLibrarianCatalogMatcher}=await import('../dist/product-librarian-matching.js');const {LIBRARIAN_MEANING_REGISTRY_VERSION}=await import('../dist/product-librarian-semantics.js');
 const body={contractVersion:LIBRARIAN_MEANING_REGISTRY_VERSION,releaseId:'synthetic:vegan',links:[{family:'food.diet',requestValue:'rein pflanzliche Gerichte',propertyKey:'food.diet',propertyLabel:null,propertyValue:'vegan',relation:'SAME_MEANING'}]};const registry={...body,registryHash:contentHash(body)},matcher=createLibrarianCatalogMatcher({meaningRegistry:registry,acceptedRegistryHashes:[registry.registryHash]});
 for(const property of [prop('food.diet',null,{state:'UNKNOWN'}),prop('food.diet','vegan',{conditions:{...conditions,weekdays:[3]}})]){
 const result=matcher({request:request([meal(),date(),fact('vegan','food.diet','rein pflanzliche Gerichte')]),catalog:[binding(1,profile([offer('dinner','DINNER',['inside'],[property])]))],authority});assert.equal(result.ranked[0].status,'PARTIAL');}
});
test('meaning data cannot rewrite context, identity or numeric family semantics',async()=>{
 const {createLibrarianCatalogMatcher}=await import('../dist/product-librarian-matching.js');const {LIBRARIAN_MEANING_REGISTRY_VERSION}=await import('../dist/product-librarian-semantics.js');
 for(const family of ['people.identity','time.weekday','budget.maximum']){const body={contractVersion:LIBRARIAN_MEANING_REGISTRY_VERSION,releaseId:'synthetic:invalid',links:[{family,requestValue:'X',propertyKey:'food.diet',propertyLabel:null,propertyValue:'vegan',relation:'SAME_MEANING'}]};const registry={...body,registryHash:contentHash(body)};assert.throws(()=>createLibrarianCatalogMatcher({meaningRegistry:registry,acceptedRegistryHashes:[registry.registryHash]}),/nontext_family|context_or_numeric_boundary/);}
});
test('custom detail translation is bound to its label, not just a reused text',async()=>{
 const {createLibrarianCatalogMatcher}=await import('../dist/product-librarian-matching.js');const {LIBRARIAN_MEANING_REGISTRY_VERSION}=await import('../dist/product-librarian-semantics.js');
 const body={contractVersion:LIBRARIAN_MEANING_REGISTRY_VERSION,releaseId:'synthetic:label',links:[{family:'experience.theme',requestValue:'Astronomie',propertyKey:'custom.detail',propertyLabel:'Ausstellungsthema',propertyValue:'Sterne und Planeten',relation:'SAME_MEANING'}]};const registry={...body,registryHash:contentHash(body)},matcher=createLibrarianCatalogMatcher({meaningRegistry:registry,acceptedRegistryHashes:[registry.registryHash]});
 const q=request([meal(),fact('theme','experience.theme','Astronomie')]);
 const good=profile([offer('dinner','DINNER',['inside'],[{...prop('custom.detail','Sterne und Planeten'),label:'Ausstellungsthema'}])]),wrong=profile([offer('dinner','DINNER',['inside'],[{...prop('custom.detail','Sterne und Planeten'),label:'Speisekartenname'}])]);const result=matcher({request:q,catalog:[binding(1,good),binding(2,wrong)],authority});assert.equal(result.ranked[0].status,'CONFIRMED');assert.equal(result.ranked[1].status,'PARTIAL');
});

test('server adapter uses one existing authorized catalog read and preserves the new contract',async()=>{
 const {createDecisionProductLibrarianRpcEvaluationProvider}=await import('../dist/product-decision-production-adapter.js');
 const calls=[],identity={releaseHash:contentHash('release'),artifactHash:contentHash('artifact'),sourceSetHash:contentHash('source'),controlGeneration:1};
 const actor={userId:'11111111-1111-4111-a111-111111111111',subjectBindingHash:contentHash('subject'),authenticationContextHash:contentHash('auth'),sessionBindingHash:contentHash('session'),sessionId:'22222222-2222-4222-a222-222222222222'};
 const rpc={async rpc(name,parameters,signal){calls.push({name,parameters,aborted:signal.aborted});return{error:null,data:{contractVersion:'backyrd.decision-vnext.product-runtime-context@1.0',authorizedCity:'Basel',serverTime:authority.now,worldSnapshots:[zoo()]}};}};
 const provider=createDecisionProductLibrarianRpcEvaluationProvider(rpc,identity),q=request([fact('zoo','offer.kind','Zoo')]);
 const result=await provider.evaluate({request:q,actor,authorizedCity:'Basel',signal:new AbortController().signal});
 assert.equal(result.ranked[0].status,'CONFIRMED');assert.equal(calls.length,1);assert.equal(calls[0].name,'backyrd_decision_vnext_product_context_v5');
 assert.equal(calls[0].parameters.p_auth_user_id,actor.userId);assert.equal(calls[0].parameters.p_source_set_hash,identity.sourceSetHash);assert.equal(JSON.stringify(calls).includes(q.source.sourceText),false);
});
test('server adapter rejects cancellation and malformed authority before catalog access',async()=>{
 const {createDecisionProductLibrarianRpcEvaluationProvider}=await import('../dist/product-decision-production-adapter.js');let calls=0;
 const identity={releaseHash:contentHash('release'),artifactHash:contentHash('artifact'),sourceSetHash:contentHash('source'),controlGeneration:1};
 const actor={userId:'11111111-1111-4111-a111-111111111111',subjectBindingHash:contentHash('subject'),authenticationContextHash:contentHash('auth'),sessionBindingHash:contentHash('session'),sessionId:'22222222-2222-4222-a222-222222222222'};
 const provider=createDecisionProductLibrarianRpcEvaluationProvider({async rpc(){calls++;throw Error('must not access');}},identity),q=request([meal()]),controller=new AbortController();controller.abort();
 await assert.rejects(provider.evaluate({request:q,actor,authorizedCity:'Basel',signal:controller.signal}),/aborted/);
 await assert.rejects(provider.evaluate({request:q,actor:{...actor,userId:'invalid'},authorizedCity:'Basel',signal:new AbortController().signal}),/authority_invalid/);
 assert.equal(calls,0);
});
test('server adapter checks city binding and does not substitute an empty malformed catalog',async()=>{
 const {createDecisionProductLibrarianRpcEvaluationProvider}=await import('../dist/product-decision-production-adapter.js');
 const identity={releaseHash:contentHash('release'),artifactHash:contentHash('artifact'),sourceSetHash:contentHash('source'),controlGeneration:1};const actor={userId:'11111111-1111-4111-a111-111111111111',subjectBindingHash:contentHash('subject'),authenticationContextHash:contentHash('auth'),sessionBindingHash:contentHash('session'),sessionId:'22222222-2222-4222-a222-222222222222'};
 for(const data of [{contractVersion:'backyrd.decision-vnext.product-runtime-context@1.0',authorizedCity:'Luzern',serverTime:authority.now,worldSnapshots:[]},{contractVersion:'backyrd.decision-vnext.product-runtime-context@1.0',authorizedCity:'Basel',serverTime:authority.now}]){
 const provider=createDecisionProductLibrarianRpcEvaluationProvider({async rpc(){return{data,error:null};}},identity);await assert.rejects(provider.evaluate({request:request([meal()]),actor,authorizedCity:'Basel',signal:new AbortController().signal}),/context_invalid/);}
});

test('prices cannot use the age of a person outside the actual financial group',()=>{
 const p=profile([offer('visit','VISIT',['inside'],[],[price(25,{label:'Erwachsene',minimumAge:18}),price(5,{label:'Kinder',minimumAge:0,maximumAge:17})])],[area()],'ZOO');
 const raw={entities:[...entities,{id:'p3',kind:'PERSON',label:'Andere Person',members:[]}],facts:[fact('visit','offer.kind','Zoo'),fact('cage','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2']),fact('otherage','people.age',{amount:5,operator:'EQ',unit:'YEARS'},'CONTEXT',['p3']),fact('count','people.count',{amount:2,operator:'EQ',unit:'PEOPLE'},'CONTEXT',['g1']),fact('money','budget.maximum',{amount:15,operator:'LTE',currency:'CHF'}),fact('scope','budget.scope',{scope:'GROUP_TOTAL'},'CONTEXT',[])],logic:null,bindings:[],extensions:[],uncertainties:[],weatherConditions:[]};
 const q=prepareLibrarianRequest({contractVersion:LUNA_LIBRARIAN_CONTRACT_VERSION,sourceText:'Synthetischer Familienpreis',reference,output:raw});const r=search(q,[binding(1,p,[worldFact('rule.age_access',{policy:'ALL_AGES',minimumAge:null,appliesFromTime:null})])]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].unknownFactIds.includes('money'));
});
test('excluded or preferred group sizes do not become certain budget quantities',()=>{for(const modality of ['EXCLUDED','PREFERRED','NOT_REQUIRED']){const facts=[meal(),fact('count','people.count',{amount:2,operator:'EQ',unit:'PEOPLE'},modality,['g1']),fact('money','budget.maximum',{amount:100,operator:'LTE',currency:'CHF'}),fact('scope','budget.scope',{scope:'GROUP_TOTAL'},'CONTEXT',[])];const r=search(request(facts),[binding(1,profile())]);assert.equal(r.ranked[0].status,'PARTIAL');}});
test('capacity evidence without hard-constraint authority never creates a confirmed fit',()=>{const facts=[meal(),fact('count','people.count',{amount:8,operator:'EQ',unit:'PEOPLE'},'CONTEXT',['g1'])];const r=search(request(facts),[binding(1,profile(),[worldFact('capacity.group_size_supported',{min:1,max:4})])]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].facts.some(f=>f.reason==='GROUP_CAPACITY_HARD_AUTHORITY_MISSING'));});
test('weather-unknown results preserve both plans and do not pretend one branch is settled',()=>{const r=search(rainyRequest(),[zoo()]);assert.equal(r.ranked[0].conditionalPlans.length,2);assert.equal(r.ranked[0].selectedFactIds.includes('zoo'),false);assert.equal(r.ranked[0].selectedFactIds.includes('museum'),false);assert.ok(r.ranked[0].conditionalPlans.some(p=>p.facts.some(f=>f.factId==='zoo')));assert.ok(r.ranked[0].conditionalPlans.some(p=>p.facts.some(f=>f.factId==='museum')));});

test('an exact or unequal requested amount inside a price range stays unknown',()=>{for(const operator of ['EQ','NEQ']){const facts=[meal(),fact('money','budget.maximum',{amount:30,operator,currency:'CHF'}),fact('scope','budget.scope',{scope:'PER_PERSON'},'CONTEXT',[])];const r=search(request(facts),[binding(1,profile([offer('dinner','DINNER',['inside'],[],[price(20,{max:40})])]))]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].unknownFactIds.includes('money'));}});
test('only active scope witnesses are returned as proof, not an unrelated terrace',()=>{const p=profile([offer('dinner','DINNER',['inside','terrace'])],[area('inside',[prop('atmosphere.character','romantisch')]),area('terrace',[prop('atmosphere.character','romantisch')])]);const r=search(request([meal(),fact('romance','atmosphere.character','romantisch'),fact('area','offer.area','drinnen')]),[binding(1,p)]);assert.deepEqual(r.ranked[0].areaIds,['inside']);assert.deepEqual(r.ranked[0].facts.find(f=>f.factId==='romance').areaIds,['inside']);});

test('group price converted to a strict per-person budget respects payable cents',()=>{const facts=[meal(),fact('count','people.count',{amount:3,operator:'EQ',unit:'PEOPLE'},'CONTEXT',['g1']),fact('money','budget.maximum',{amount:20,operator:'LT',currency:'CHF'}),fact('scope','budget.scope',{scope:'PER_PERSON'},'CONTEXT',[])];const p=profile([offer('dinner','DINNER',['inside'],[],[price(59.99,{basis:'PER_GROUP'})])]);const r=search(request(facts),[binding(1,p)]);assert.equal(r.excluded[0].failedFactIds.includes('money'),true);});
test('group invoice cannot establish every individual exact share',()=>{const facts=[meal(),fact('count','people.count',{amount:3,operator:'EQ',unit:'PEOPLE'},'CONTEXT',['g1']),fact('money','budget.maximum',{amount:33.34,operator:'EQ',currency:'CHF'}),fact('scope','budget.scope',{scope:'PER_PERSON'},'CONTEXT',[])];const r=search(request(facts),[binding(1,profile([offer('dinner','DINNER',['inside'],[],[price(100,{basis:'PER_GROUP'})])]))]);assert.equal(r.ranked[0].status,'PARTIAL');});


test('coffee price inside a dinner offer cannot prove a meal budget',()=>{
 const p=profile([offer('dinner','DINNER',['inside'],[],[price(8,{includes:'Kaffee'})])]);
 const r=search(request([meal(),...budget(40)]),[binding(1,p)]);
 assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].unknownFactIds.includes('money'));
});
test('vegan cafe cannot establish the diet of an unrelated dinner',()=>{
 const p=profile([offer('dinner','DINNER',['inside']),offer('cafe','OTHER',['inside'],[prop('food.diet','vegan')],[])],[area()],'RESTAURANT');
 const r=search(request([meal(),fact('vegan','food.diet','vegan')]),[binding(1,p)]);
 assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].unknownFactIds.includes('__scope__'));
});
test('diet evidence on the actual dinner confirms the same request',()=>{
 const p=profile([offer('dinner','DINNER',['inside'],[prop('food.diet','vegan')])]);
 assert.equal(search(request([meal(),fact('vegan','food.diet','vegan')]),[binding(1,p)]).ranked[0].status,'CONFIRMED');
});
test('expired spot knowledge cannot confirm an undated visit',()=>{
 const b=binding(1,profile());const row=b.decisionProjection.facts.find(f=>f.key==='experience.profile');row.validUntil='2026-10-13T00:00:00Z';
 const r=search(request([meal()]),[b]);assert.equal(r.ranked.length,0);assert.equal(r.unresolved[0].status,'PARTIAL');
});


const legacy=(index,extras=[])=>{const b=binding(index,profile(),extras);b.decisionProjection.facts=b.decisionProjection.facts.filter(f=>f.key!=='experience.profile');return b;};
const emptyLegacyConditions={dayparts:[],days:[],area:null,occasion:null,groupSize:null,ageContext:null,accompaniment:null,eventMode:null};
test('unchanged live Luna drinking phrase matches a structured drinks offer',()=>{const p=profile([offer('drinks','DRINKS',['inside'],[],[])],[area()],'BAR');const r=search(request([fact('drinks','experience.activity','etwas trinken gehen'),fact('relaxed','atmosphere.character','RELAXED')]),[binding(1,{...p,areas:[area('inside',[prop('atmosphere.character','entspannt')])]})]);assert.equal(r.ranked[0].status,'CONFIRMED');});
test('a wine group supports drinking but does not become confirmed offer scope',()=>{const r=search(request([fact('drink','experience.activity','etwas trinken gehen')]),[legacy(1,[worldFact('offering.groups',['WINE'])])]);assert.equal(r.ranked[0].status,'PARTIAL');const a=r.ranked[0].facts.find(f=>f.factId==='drink');assert.equal(a.reason,'LEGACY_TYPED_DISCOVERY_SUPPORT');assert.deepEqual(a.offerIds,[]);assert.ok(a.evidenceHashes.length>=2);});
test('every recorded drink kind supports the common drinking concept',()=>{for(const token of ['BEER','WINE','COCKTAILS','NON_ALCOHOLIC_DRINKS','COFFEE','TEA','SPIRITS','CRAFT_BEER','NATURAL_WINE']){const r=search(request([fact('drink','experience.activity','etwas trinken gehen')]),[legacy(1,[worldFact('offering.groups',[token])])]);assert.equal(r.ranked.length,1,token);assert.equal(r.ranked[0].status,'PARTIAL');}});
test('Basel alone cannot put a fitness venue in the drinking recommendations',()=>{const r=search(request([fact('drink','experience.activity','etwas trinken gehen')]),[legacy(1,[worldFact('purpose.primary_visit','SPORT_MOVEMENT')])]);assert.equal(r.ranked.length,0);assert.equal(r.excluded.length,0);assert.equal(r.unresolved[0].status,'PARTIAL');});
test('a completely unknown activity does not borrow a matching atmosphere',()=>{const r=search(request([fact('unknown','experience.activity','Glitzerflug'),fact('relaxed','atmosphere.character','entspannt')]),[binding(1,profile([offer()],[area('inside',[prop('atmosphere.character','entspannt')])]))]);assert.equal(r.ranked.length,0);assert.equal(r.unresolved.length,1);});
test('legacy cafe facilities remain facilities and do not prove the whole museum visit',()=>{const r=search(request([fact('museum','experience.activity','Museum besuchen')]),[legacy(1,[worldFact('offering.onsite',[{kind:'CAFE',relationship:'EMBEDDED_FACILITY',area:'Eingang'}])])]);assert.equal(r.ranked.length,0);});
test('legacy positive lists do not prove that an excluded drink is absent',()=>{const r=search(request([fact('drink','experience.activity','etwas trinken'),fact('beer','food.drink','Bier','EXCLUDED')]),[legacy(1,[worldFact('offering.groups',['WINE'])])]);assert.equal(r.ranked[0].status,'PARTIAL');assert.equal(r.ranked[0].facts.find(f=>f.factId==='beer').state,'UNKNOWN');});
test('new profiles take precedence over broad old spot facts',()=>{const r=search(request([meal(),fact('vegan','food.diet','vegan')]),[binding(1,profile(),[worldFact('offering.food_specialities',['VEGAN_DISHES'])])]);assert.equal(r.ranked[0].facts.find(f=>f.factId==='vegan').state,'UNKNOWN');});
test('relaxed does not become quiet or romantic',()=>{for(const actual of ['ruhig','romantisch']){const r=search(request([meal(),fact('relaxed','atmosphere.character','entspannt')]),[binding(1,profile([offer()],[area('inside',[prop('atmosphere.character',actual)])]))]);assert.equal(r.ranked[0].status,'PARTIAL');assert.equal(r.ranked[0].facts.find(f=>f.factId==='relaxed').state,'UNKNOWN');}});
test('named-area and group conditions in old atmosphere are never discarded',()=>{const r=search(request([fact('drink','experience.activity','etwas trinken'),fact('relaxed','atmosphere.character','entspannt')]),[legacy(1,[worldFact('offering.groups',['WINE']),worldFact('context.atmosphere',[{atmosphere:'RELAXED',conditions:{...emptyLegacyConditions,area:'Terrasse',groupSize:{min:1,max:2}}}],{hardConstraintAuthorized:true,validityVerified:true,validFrom:null,validUntil:null})])]);const a=r.ranked[0].facts.find(f=>f.factId==='relaxed');assert.equal(a.state,'UNKNOWN');assert.equal(a.reason,'LEGACY_CONDITIONS_OR_AREA_UNRESOLVED');});
test('expired contextual source stays unresolved',()=>{const r=search(request([fact('drink','experience.activity','etwas trinken'),date(),fact('relaxed','atmosphere.character','entspannt')]),[legacy(1,[worldFact('offering.groups',['WINE']),worldFact('context.atmosphere',[{atmosphere:'RELAXED',conditions:emptyLegacyConditions}],{hardConstraintAuthorized:true,validityVerified:true,validFrom:null,validUntil:'2026-10-01T00:00:00Z'})])]);assert.equal(r.ranked[0].facts.find(f=>f.factId==='relaxed').state,'UNKNOWN');});
test('recorded closure excludes a legacy venue without inventing an offer schedule',()=>{const b=legacy(1,[worldFact('offering.groups',['WINE'])]);b.decisionProjection.facts=b.decisionProjection.facts.map(f=>f.key==='hours.regular'?worldFact('hours.regular',[{day:'THURSDAY',intervals:[{start:'08:00',end:'12:00'}]}]):f);const r=search(request([fact('drink','experience.activity','etwas trinken'),date(),evening()]),[b]);assert.equal(r.ranked.length,0);assert.ok(r.excluded[0].facts.some(f=>f.reason==='VENUE_NOT_OPEN_AT_REQUESTED_TIME'));});
test('a closed legacy venue cannot be rescued by preferred drink evidence',()=>{const b=legacy(1,[worldFact('offering.groups',['WINE'])]);b.decisionProjection.facts=b.decisionProjection.facts.map(f=>f.key==='hours.regular'?worldFact('hours.regular',[{day:'THURSDAY',intervals:[]}]):f);const r=search(request([fact('drink','experience.activity','etwas trinken','PREFERRED'),date(),evening()]),[b]);assert.equal(r.ranked.length,0);assert.equal(r.excluded.length,1);});


test('historic source flags cannot authorize required atmosphere through translation',async()=>{const {REGISTRY_V2_1_HASH,REGISTRY_V2_1_VERSION}=await import('@backyrd/world-knowledge-core');const b=legacy(1,[worldFact('offering.groups',['WINE']),worldFact('context.atmosphere',[{atmosphere:'RELAXED',conditions:emptyLegacyConditions}],{hardConstraintAuthorized:true,validityVerified:true,validFrom:null,validUntil:null})]);b.registryHash=REGISTRY_V2_1_HASH;b.decisionProjection.registryVersion=REGISTRY_V2_1_VERSION;b.decisionProjection.policyVersion='backyrd.world-knowledge.source-policy@4b.1';const r=search(request([fact('drink','experience.activity','etwas trinken'),fact('relaxed','atmosphere.character','entspannt')]),[b]);assert.equal(r.ranked[0].facts.find(f=>f.factId==='relaxed').state,'UNKNOWN');assert.equal(r.ranked[0].facts.find(f=>f.factId==='relaxed').reason,'LEGACY_SOURCE_USE_NOT_AUTHORIZED');});
test('legacy amenities use their actual field meaning without inventing a linked terrace',()=>{const r=search(request([fact('drink','experience.activity','etwas trinken'),fact('wc','offer.feature','Toilette')]),[legacy(1,[worldFact('offering.groups',['WINE']),worldFact('amenity.features',['TOILET'])])]);const a=r.ranked[0].facts.find(f=>f.factId==='wc');assert.equal(a.reason,'LEGACY_TYPED_DISCOVERY_SUPPORT');assert.deepEqual(a.areaIds,[]);assert.equal(a.state,'UNKNOWN');});

// Venue identity is distinct from an offering, even when Luna uses offer.kind.
const venueBinding=(index,types,{scoped=true,activity='Apéro',groups=[]}={})=>{
 const b=binding(index,profile([offer('apero','APERITIF',['inside'],[prop('experience.activity',activity)],[])],[area()],'BAR'));
 b.decisionProjection.facts=b.decisionProjection.facts.filter(f=>f.key!=='classification.place_types'&&(scoped||f.key!=='experience.profile'));
 b.decisionProjection.facts.push(worldFact('classification.place_types',types));
 if(groups.length)b.decisionProjection.facts.push(worldFact('offering.groups',groups));
 return b;
};
test('required wine bar uses verified spot classification with or without scoped cards',()=>{
 for(const scoped of [true,false]){const r=search(request([fact('venue','offer.kind','Weinbar')]),[venueBinding(301,['WINE_BAR'],{scoped})]);assert.equal(r.ranked.length,1);assert.equal(r.ranked[0].facts.find(f=>f.factId==='venue').reason,'VERIFIED_SPOT_TYPE');}
});
test('all canonical spot labels and tokens share the authoring taxonomy',async()=>{
 const {PLACE_TYPE_AUTHORING_OPTIONS}=await import('@backyrd/world-knowledge-core');
 for(const option of PLACE_TYPE_AUTHORING_OPTIONS.filter(o=>o.state==='CANONICAL'))for(const value of [option.label,option.value,option.value.replaceAll('_',' ')]){
  const r=search(request([fact('venue','offer.kind',value)]),[venueBinding(302,[option.value])]);assert.equal(r.ranked.length,1,`${option.value}: ${value}`);assert.equal(r.ranked[0].facts.find(f=>f.factId==='venue').reason,'VERIFIED_SPOT_TYPE',value);
 }
});
test('required wine bar is not proved by wine, aperitif, general BAR category or a venue name',()=>{
 for(const scoped of [true,false]){const b=venueBinding(303,['BAR'],{scoped,groups:['WINE']});b.decisionProjection.facts.find(f=>f.key==='identity.name').value='Eine tolle Weinbar';const r=search(request([fact('venue','offer.kind','Weinbar'),fact('drink','experience.activity','Apéro')]),[b]);assert.equal(r.ranked.length,0);assert.equal(r.unresolved.length,1);}
});
test('a required venue type cannot be rescued by an independently matching drink offer',()=>{
 const b=venueBinding(304,['CLIMBING_GYM'],{activity:'etwas trinken'});const r=search(request([fact('venue','offer.kind','Weinbar'),fact('drink','experience.activity','etwas trinken')]),[b]);assert.equal(r.ranked.length,0);assert.equal(r.unresolved.length,1);
});
test('unknown activity comparisons never become positive visit evidence',()=>{
 const b=venueBinding(305,['ZOO'],{activity:'Zoo besuchen'});const r=search(request([fact('activity','experience.activity','den Abend geniessen')]),[b]);assert.equal(r.ranked.length,0);assert.deepEqual(r.unresolved[0].facts.find(f=>f.factId==='activity').evidenceHashes,[]);
});
test('general bar accepts specific bar subtypes but the reverse stays unproven',()=>{
 const r=search(request([fact('venue','offer.kind','Bar')]),[venueBinding(306,['WINE_BAR']),venueBinding(307,['COCKTAIL_BAR'])]);assert.equal(r.ranked.length,2);assert.ok(r.ranked.every(c=>c.facts.find(f=>f.factId==='venue').reason==='VERIFIED_SPOT_TYPE'));
 const narrow=search(request([fact('venue','offer.kind','Weinbar')]),[venueBinding(308,['BAR'])]);assert.equal(narrow.ranked.length,0);
});
test('classification Discovery permission cannot self-authorize a hard exclusion',()=>{
 const r=search(request([fact('venue','offer.kind','Weinbar','EXCLUDED')]),[venueBinding(309,['WINE_BAR'])]);assert.equal(r.ranked.length,0);assert.equal(r.unresolved[0].facts.find(f=>f.factId==='venue').reason,'SPOT_TYPE_USE_NOT_AUTHORIZED');
});
test('preferred venue type does not block a separately proven activity',()=>{
 const r=search(request([fact('venue','offer.kind','Weinbar','PREFERRED'),fact('drink','experience.activity','Apéro')]),[venueBinding(310,['BAR'])]);assert.equal(r.ranked.length,1);assert.equal(r.ranked[0].facts.find(f=>f.factId==='venue').state,'UNKNOWN');
});
test('venue identity does not invent an offering, area, price or seat reservation',()=>{
 const r=search(request([fact('venue','offer.kind','Weinbar')]),[venueBinding(311,['WINE_BAR'])]);assert.equal(r.ranked.length,1);assert.deepEqual(r.ranked[0].offerIds,[]);assert.deepEqual(r.ranked[0].areaIds,[]);
});
test('venue-only time request checks venue hours without inventing aperitif times',()=>{
 const r=search(request([fact('venue','offer.kind','Weinbar'),date(),evening()]),[venueBinding(312,['WINE_BAR'])]);assert.equal(r.ranked.length,1);assert.equal(r.ranked[0].facts.find(f=>f.factId==='date').state,'MET');
 const closed=venueBinding(313,['WINE_BAR']);closed.decisionProjection.facts=closed.decisionProjection.facts.map(f=>f.key==='hours.regular'?worldFact('hours.regular',[{day:'THURSDAY',intervals:[{start:'08:00',end:'12:00'}]}]):f);assert.equal(search(request([fact('venue','offer.kind','Weinbar'),date(),evening()]),[closed]).excluded.length,1);
});
test('exact wine bar case cannot rank Zoo or Boulderloft as partial matches',()=>{
 const r=search(request([fact('count','people.count',{amount:4,operator:'EQ',unit:'PEOPLE'},'REQUIRED',['g1']),fact('activity','experience.activity','den Abend geniessen'),fact('venue','offer.kind','Weinbar'),fact('city','location.destination','Basel'),date(),evening()]),[venueBinding(314,['ZOO'],{activity:'Zoo besuchen'}),venueBinding(315,['CLIMBING_GYM'],{activity:'Bouldern'}),venueBinding(316,['WINE_BAR'])]);assert.deepEqual(r.ranked.map(c=>c.spotId),[venueBinding(316,['WINE_BAR']).decisionProjection.spotId]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].unknownFactIds.includes('activity'));
});
test('general bar includes a wine bar with a real scoped drinks offer',()=>{
 const b=venueBinding(317,['WINE_BAR']);b.decisionProjection.facts.find(f=>f.key==='experience.profile').value.offers[0].kind='DRINKS';const r=search(request([fact('bar','offer.kind','Bar')]),[b]);assert.equal(r.ranked.length,1);assert.equal(r.ranked[0].facts.find(f=>f.factId==='bar').state,'MET');assert.deepEqual(r.ranked[0].offerIds,['apero']);
});
test('either wine bar or cafe keeps an actual cafe alternative',()=>{
 const q=request([fact('winebar','offer.kind','Weinbar'),fact('cafe','offer.kind','Café')],{logic:{kind:'ANY',strength:'REQUIRED',children:[{kind:'FACT',factId:'winebar'},{kind:'FACT',factId:'cafe'}]}});const b=binding(319,profile([offer('cafe','CAFE',['inside'],[],[])],[area()],'MUSEUM'));const r=search(q,[b]);assert.equal(r.ranked.length,1);assert.equal(r.ranked[0].status,'CONFIRMED');assert.ok(r.ranked[0].inactiveFactIds.includes('winebar'));
});
test('a missing spot classification is not filled from its profile category',()=>{
 const b=venueBinding(320,[]);b.decisionProjection.facts=b.decisionProjection.facts.filter(f=>f.key!=='classification.place_types');const r=search(request([fact('venue','offer.kind','Weinbar')]),[b]);assert.equal(r.ranked.length,0);assert.equal(r.unresolved[0].facts.find(f=>f.factId==='venue').reason,'REQUESTED_SPOT_TYPE_NOT_PROVEN');
});
test('a restaurant request accepts a confirmed brasserie meal without widening a narrow request',()=>{
 const b=binding(321,profile());b.decisionProjection.facts=b.decisionProjection.facts.map(f=>f.key==='classification.place_types'?worldFact(f.key,['BRASSERIE']):f);const r=search(request([fact('venue','offer.kind','Restaurant')]),[b]);assert.equal(r.ranked.length,1);assert.equal(r.ranked[0].facts.find(f=>f.factId==='venue').state,'MET');
 const narrow=search(request([fact('venue','offer.kind','Brasserie')]),[binding(322,profile())]);assert.equal(narrow.ranked.length,0);
});

const animalZoo=(index,{properties=[],kind='VISIT'}={})=>binding(index,profile([offer('visit',kind,['inside'],properties,[])],[area()],'ZOO'));
test('animal viewing finds a real zoo visit while retaining a four-year-old child',()=>{
 const q=request([fact('animals','experience.activity','Tiere anschauen'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])]);const r=search(q,[animalZoo(401,{properties:[prop('experience.activity','Zoo besuchen')]})]);assert.equal(r.ranked.length,1);assert.equal(r.ranked[0].facts.find(f=>f.factId==='animals').state,'MET');assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].unknownFactIds.includes('eligibility:CHILD_ENTRY_RULE_NOT_DOCUMENTED'));
});
test('animal activity wording shares one concept without narrowing it to Zoo',()=>{
 for(const text of ['Tiere anschauen','Tiere ansehen','Tiere beobachten','Tierbeobachtung']){const r=search(request([fact('animals','experience.activity',text)]),[animalZoo(402)]);assert.equal(r.ranked.length,1,text);assert.equal(r.ranked[0].facts.find(f=>f.factId==='animals').state,'MET',text);assert.deepEqual(r.ranked[0].areaIds,[]);}
});
test('a confirmed scoped zoo-visit activity supports animal viewing even on an OTHER offering',()=>{
 const r=search(request([fact('animals','experience.activity','Tiere anschauen')]),[animalZoo(403,{kind:'OTHER',properties:[prop('experience.activity','Zoo besuchen')]})]);assert.equal(r.ranked.length,1);assert.equal(r.ranked[0].facts.find(f=>f.factId==='animals').state,'MET');
});
test('animal observation does not prove that its venue is a Zoo',()=>{
 const b=animalZoo(404,{kind:'ANIMAL_OBSERVATION'});b.decisionProjection.facts=b.decisionProjection.facts.map(f=>f.key==='classification.place_types'?worldFact(f.key,['PARK']):f);
 assert.equal(search(request([fact('animals','experience.activity','Tiere anschauen')]),[b]).ranked.length,1);
 assert.equal(search(request([fact('zoo','offer.kind','Zoo')]),[b]).ranked.length,0);
});
test('a generic visit at a non-Zoo is not an animal-viewing offer',()=>{
 const b=animalZoo(405);b.decisionProjection.facts=b.decisionProjection.facts.map(f=>f.key==='classification.place_types'?worldFact(f.key,['PARK']):f);assert.equal(search(request([fact('animals','experience.activity','Tiere anschauen')]),[b]).ranked.length,0);
});
test('animal themes, venue names and a cafe do not prove animal observation',()=>{
 const b=binding(406,profile([offer('cafe','CAFE',['inside'],[prop('experience.theme','Tiere anschauen')],[])],[area()],'MUSEUM'));b.decisionProjection.facts.find(f=>f.key==='identity.name').value='Tierwelt Cafe';assert.equal(search(request([fact('animals','experience.activity','Tiere anschauen')]),[b]).ranked.length,0);
});
test('derived animal activity preserves its original weekday conditions',()=>{
 const b=animalZoo(407,{kind:'OTHER',properties:[prop('experience.activity','Zoo besuchen',{conditions:{...conditions,weekdays:[1]}})]});const r=search(request([fact('animals','experience.activity','Tiere anschauen'),date()]),[b]);assert.equal(r.ranked.length,0);
});
test('animal activity derivation cannot reopen an unavailable zoo offering',()=>{
 const b=animalZoo(408);b.decisionProjection.facts.find(f=>f.key==='experience.profile').value.offers[0].schedule=[{weekday:4,start:'08:00',end:'12:00'}];const r=search(request([fact('animals','experience.activity','Tiere anschauen'),date(),evening()]),[b]);assert.equal(r.ranked.length,0);assert.equal(r.excluded.length,1);
});
test('excluding animal viewing is contradicted by the actual zoo visit',()=>{
 const r=search(request([fact('animals','experience.activity','Tiere anschauen','EXCLUDED')]),[animalZoo(409)]);assert.equal(r.excluded.length,1);assert.ok(r.excluded[0].failedFactIds.includes('animals'));
});
test('only Zoo classification supports discovery, not a fabricated scoped animal offer',()=>{
 const b=animalZoo(410);b.decisionProjection.facts=b.decisionProjection.facts.filter(f=>f.key!=='experience.profile');const r=search(request([fact('animals','experience.activity','Tiere anschauen')]),[b]);assert.equal(r.ranked.length,1);assert.equal(r.ranked[0].status,'PARTIAL');assert.deepEqual(r.ranked[0].offerIds,[]);
});
test('an offer-level Zoo activity does not select an arbitrary animal-viewing area',()=>{
 const b=animalZoo(411,{properties:[prop('experience.activity','Zoo besuchen')]});const p=b.decisionProjection.facts.find(f=>f.key==='experience.profile').value;p.areas.push({...area('terrace'),kind:'OUTDOOR'});p.offers[0].areaIds=['inside','terrace'];const r=search(request([fact('animals','experience.activity','Tiere anschauen')]),[b]);assert.equal(r.ranked.length,1);assert.deepEqual(r.ranked[0].areaIds,[]);assert.deepEqual(r.ranked[0].facts.find(f=>f.factId==='animals').areaIds,[]);
});

test('indoor evidence from an unrelated cafe cannot satisfy the requested activity',()=>{
 const p=profile([offer('sport','OTHER',['outside'],[prop('experience.activity','Klettern')]),offer('coffee','OTHER',['inside'],[prop('experience.activity','Kaffee')])],[{...area('outside'),kind:'TERRACE'},area()]);
 const r=search(request([fact('climb','experience.activity','Klettern','REQUIRED',[]),fact('in','offer.area','indoor','REQUIRED',[])]),[binding(1,p)]);
 const c=[...r.ranked,...r.unresolved][0];assert.notEqual(c.status,'CONFIRMED');assert.equal(c.facts.find(f=>f.factId==='in').state,'UNKNOWN');
});
test('unknown compound activities cannot borrow indoor proof from a cafe',()=>{
 const p=profile([offer('coffee','OTHER',['inside'],[prop('experience.activity','Kaffee')])]);const r=search(request([fact('climb','experience.activity','bewegen und klettern','REQUIRED',[]),fact('in','offer.area','indoor','REQUIRED',[])]),[binding(1,p)]);
 const c=[...r.ranked,...r.unresolved][0];assert.equal(c.facts.find(f=>f.factId==='in').state,'UNKNOWN');
});
test('explicit indoor setting on the actual activity area is usable',()=>{
 const p=profile([offer('sport','OTHER',['inside'],[prop('experience.activity','Klettern')])],[area('inside',[prop('location.setting','drinnen')])]);
 const r=search(request([fact('climb','experience.activity','Klettern','REQUIRED',[]),fact('in','offer.area','indoor','REQUIRED',[])]),[binding(1,p)]);assert.equal(r.ranked[0].status,'CONFIRMED');
});
test('an offer minimum age excludes a younger participant without a global rule',()=>{
 const p=profile([offer('sport','OTHER',['inside'],[prop('experience.activity','Klettern'),prop('participation.minimum_age',14)])]);
 const r=search(request([fact('climb','experience.activity','Klettern'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])]),[binding(1,p)]);
 assert.ok(r.excluded[0].facts.some(f=>f.reason==='PARTICIPANT_BELOW_OFFER_MINIMUM_AGE'));
});
test('a scoped child minimum age is consumed on the selected child offer',()=>{
 const p=profile([offer('play','OTHER',['inside'],[prop('experience.activity','Bewegungsspiel'),prop('participation.minimum_age',1)])]);
 const r=search(request([fact('play','experience.activity','Bewegungsspiel'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])]),[binding(1,p)]);assert.equal(r.ranked[0].status,'CONFIRMED',JSON.stringify(r));
});
test('a scoped minimum never overrides a global entry restriction',()=>{
 const p=profile([offer('play','OTHER',['inside'],[prop('experience.activity','Bewegungsspiel'),prop('participation.minimum_age',1)])]);
 const r=search(request([fact('play','experience.activity','Bewegungsspiel'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])]),[binding(1,p,[worldFact('rule.age_access',{policy:'MINIMUM_AGE',minimumAge:18,appliesFromTime:null})])]);assert.equal(r.excluded[0].status,'INELIGIBLE');
});
test('conflicting scoped minimum ages stay unknown',()=>{
 const p=profile([offer('play','OTHER',['inside'],[prop('experience.activity','Bewegungsspiel'),prop('participation.minimum_age',1),prop('participation.minimum_age',14)])]);
 const r=search(request([fact('play','experience.activity','Bewegungsspiel'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])]),[binding(1,p)]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].facts.some(f=>f.reason==='CONFLICTING_OFFER_MINIMUM_AGES'));
});

test('an adult-only activity does not apply its age limit to the child on a separate offer',()=>{
 const p=profile([offer('climb','OTHER',['inside'],[prop('experience.activity','Klettern'),prop('participation.minimum_age',14)]),offer('play','OTHER',['inside'],[prop('experience.activity','Bewegungsspiel'),prop('participation.minimum_age',1)])]);
 const r=search(request([fact('adult','experience.activity','Klettern','REQUIRED',['p1']),fact('child','experience.activity','Bewegungsspiel','REQUIRED',['p2']),fact('adultage','people.age',{amount:34,operator:'EQ',unit:'YEARS'},'CONTEXT',['p1']),fact('childage','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])]),[binding(1,p)]);
 assert.equal(r.ranked[0].status,'CONFIRMED',JSON.stringify(r));
});

test('a group-scoped indoor requirement cannot borrow proof from an unrelated cafe',()=>{
 const p=profile([offer('sport','OTHER',['outside'],[prop('experience.activity','Klettern')]),offer('coffee','OTHER',['inside'],[prop('experience.activity','Kaffee')])],[{...area('outside'),kind:'TERRACE'},area()]);
 const r=search(request([fact('climb','experience.activity','Klettern','REQUIRED',['g1']),fact('in','offer.area','indoor','REQUIRED',['g1'])]),[binding(1,p)]);
 const c=[...r.ranked,...r.unresolved][0];assert.notEqual(c.status,'CONFIRMED');assert.equal(c.facts.find(f=>f.factId==='in').state,'UNKNOWN');assert.ok(!c.offerIds.includes('coffee'));
});

test('child climbing explicitly recorded on movement play keeps that offer age rule',()=>{
 const p=profile([offer('adult','OTHER',['inside'],[prop('experience.activity','Bouldern'),prop('participation.minimum_age',14)]),offer('kids','OTHER',['inside'],[prop('experience.activity','Bewegungsspiel'),prop('experience.activity','Klettern'),prop('participation.minimum_age',1)])]);
 const r=search(request([fact('move','experience.activity','bewegen','REQUIRED',['g1']),fact('climb','experience.activity','Klettern','REQUIRED',['g1']),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2']),fact('inside','offer.area','indoor','REQUIRED',['g1'])]),[binding(1,p)]);
 assert.equal(r.ranked[0].status,'CONFIRMED',JSON.stringify(r));assert.deepEqual(r.ranked[0].offerIds,['kids']);assert.ok(!r.ranked[0].facts.some(f=>f.reason==='PARTICIPANT_BELOW_OFFER_MINIMUM_AGE'));
});

test('all universal offer kinds are understood through the shared catalogue',async()=>{
 const {OFFER_CATALOG}=await import('@backyrd/world-knowledge-core');
 for(const item of OFFER_CATALOG){
  const p=profile([offer('chosen',item.kind,['inside'],[],[])],[area()]);const b=binding(1,p);b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['RESTAURANT','BAR','MUSEUM','ZOO'];
  const r=search(request([fact('activity','experience.activity',item.activities[0])]),[b]);
  assert.equal(r.ranked[0]?.status,'CONFIRMED',item.kind+':'+JSON.stringify(r));assert.deepEqual(r.ranked[0].offerIds,['chosen']);
 }
});
test('hotel subtype is recognized without inferring a spa or restaurant',async()=>{
 const {SPOT_TYPE_CATALOG}=await import('@backyrd/world-knowledge-core');const {requestedLibrarianPlaceType}=await import('../dist/product-librarian-world-language.js');
 for(const type of SPOT_TYPE_CATALOG){const q=request([fact('type','offer.kind',type.label)]);assert.equal(requestedLibrarianPlaceType(q.facts[0]),type.kind,type.label);for(const alias of type.aliases){const a=request([fact('type','offer.kind',alias)]);assert.equal(requestedLibrarianPlaceType(a.facts[0]),type.kind,alias);}}
 const p=profile([offer('sleep','OVERNIGHT_STAY',['inside'],[],[])]);const b=binding(1,p);b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['BOUTIQUE_HOTEL'];
 const r=search(request([fact('hotel','offer.kind','Hotel')]),[b]);assert.equal(r.ranked[0]?.status,'CONFIRMED');assert.ok(r.ranked[0].facts.some(f=>f.reason==='VERIFIED_SPOT_TYPE'));
 assert.equal(search(request([fact('spa','experience.activity','Sauna besuchen')]),[b]).ranked.length,0);
});
test('room-night prices never become per-person prices',()=>{
 const p=profile([offer('sleep','OVERNIGHT_STAY',['inside'],[],[price(160,{basis:'PER_ROOM_NIGHT',includes:'Übernachtung'})])]);
 const r=search(request([fact('sleep','experience.activity','Übernachten'),...budget(200)]),[binding(1,p)]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].facts.some(f=>f.reason==='OVERNIGHT_PRICE_QUANTITY_OR_SCOPE_UNRESOLVED'));
});
test('a hotel guest-only bar is not confirmed as publicly usable',()=>{
 const p=profile([offer('bar','DRINKS',['inside'],[prop('participation.audience','Nur für Hotelgäste')],[])]);const r=search(request([fact('drink','experience.activity','etwas trinken')]),[binding(1,p)]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].facts.some(f=>f.reason==='RESTRICTED_OFFER_ACCESS_NOT_PROVEN'));
});

test('a family room is matched from its actual scoped room type',()=>{
 const p=profile([offer('room','OVERNIGHT_STAY',['inside'],[prop('stay.room_type','Familienzimmer')],[])]);const r=search(request([fact('room','offer.kind','Familienzimmer')]),[binding(1,p)]);assert.equal(r.ranked[0].status,'CONFIRMED');assert.deepEqual(r.ranked[0].offerIds,['room']);
});
test('booking minimum age never becomes a blanket guest entry limit',()=>{
 const p=profile([offer('room','OVERNIGHT_STAY',['inside'],[prop('stay.minimum_booking_age',18)],[])]);const r=search(request([fact('room','experience.activity','Übernachten')]),[binding(1,p)]);assert.equal(r.ranked[0].status,'PARTIAL');assert.ok(r.ranked[0].facts.some(f=>f.reason==='BOOKING_PERSON_AGE_NOT_VERIFIED'));assert.equal(r.excluded.length,0);
});
