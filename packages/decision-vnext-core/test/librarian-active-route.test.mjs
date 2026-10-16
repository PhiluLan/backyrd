import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionProductHttpHandler, createDecisionProductLunaProvider, createDecisionProductRpcEvaluationProvider, contentHash } from '../dist/index.js';
import { request as plan, fact, meal, profile, offer, area, prop, price, binding, worldFact, budget, date, evening, reference, authority } from './librarian-matching-fixtures.mjs';
import { exercise } from "./librarian-active-route-fixtures.mjs";

const scenarios=[
  {name:'relaxed drinks use their actual linked room',facts:[fact('drink','experience.activity','etwas trinken'),fact('relaxed','atmosphere.character','entspannt')],good:profile([offer('bar','DRINKS')],[area('inside',[prop('atmosphere.character','entspannt')])],'BAR'),bad:profile([offer('bar','DRINKS')],[area('inside',[prop('atmosphere.character','laut')])],'BAR')},
  {name:'vegan dinner cannot borrow a vegan lunch',facts:[fact('dinner','experience.activity','Abendessen'),fact('diet','food.diet','vegan')],good:profile([offer('dinner','DINNER',['inside'],[prop('food.diet','vegan')])]),bad:profile([offer('dinner','DINNER'),offer('lunch','LUNCH',['inside'],[prop('food.diet','vegan')])])},
  {name:'meal family uses the dinner offer',facts:[fact('food','food.meal','essen gehen')],good:profile(),bad:profile([offer('bar','DRINKS')])},
  {name:'budget cannot use an unrelated cheap drink',facts:[meal(),...budget(40)],good:profile([offer('dinner','DINNER',['inside'],[],[price(30)])]),bad:profile([offer('dinner','DINNER',['inside'],[],[price(60)]),offer('bar','DRINKS',['inside'],[],[price(5)])])},
  {name:'a numeric total stays a group budget',facts:[meal(),fact('n','people.count',{amount:2,operator:'EQ',unit:'PEOPLE'},'CONTEXT',['g1']),fact('b','budget.maximum',{amount:60,operator:'LTE',currency:'CHF'}),fact('scope','budget.scope',{scope:'GROUP_TOTAL'},'CONTEXT',[])],good:profile([offer('dinner','DINNER',['inside'],[],[price(25)])]),bad:profile([offer('dinner','DINNER',['inside'],[],[price(40)])])},
  {name:'explicit indoor requirement uses the selected activity area',facts:[meal(),fact('inside','offer.area','drinnen')],good:profile(),bad:profile([offer('dinner','DINNER',['terrace'])],[area('terrace')])},
  {name:'music exclusion needs documented absence in the selected area',facts:[meal(),fact('music','atmosphere.music','Musik','EXCLUDED')],good:profile([offer()],[area('inside',[prop('atmosphere.music','keine Musik')])]),bad:profile([offer()],[area('inside',[prop('atmosphere.music','Live-Musik')])])},
  {name:'an actual river area cannot be borrowed across unlinked rooms',facts:[meal(),fact('river','location.waterbody','Rhein')],good:profile([offer('dinner','DINNER',['terrace'])],[area('terrace',[prop('location.waterbody','Rhein')])]),bad:profile([offer()],[area(),area('terrace',[prop('location.waterbody','Rhein')])])},
  {name:'requested evening needs joint offer and venue time',facts:[meal(),date(),evening()],good:profile(),bad:profile([{...offer(),schedule:[{weekday:4,start:'11:00',end:'14:00'}]}])},
  {name:'a separate child climbing offer keeps its own age rule',facts:[fact('climb','experience.activity','Klettern'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])],good:profile([offer('adult','BOULDERING',['inside'],[prop('participation.minimum_age',14)]),offer('kids','MOVEMENT_PLAY',['inside'],[prop('experience.activity','Klettern'),prop('participation.minimum_age',1)])],[area()],'SPORT'),bad:profile([offer('adult','BOULDERING',['inside'],[prop('participation.minimum_age',14)])],[area()],'SPORT')},
];
for(const scenario of scenarios)test(`single active HTTP chain: ${scenario.name}`,async()=>{
  const text=`Synthetischer Wunsch: ${scenario.name}`;
  const result=await exercise({text,meaning:plan(scenario.facts),catalog:[scenario.good,scenario.bad].map((p,i)=>{const b=binding(i+1,p);if(p.category==='SPORT') b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['CLIMBING_GYM'];return b;})});
  assert.equal(result.status,200,JSON.stringify(result.diagnostics));
  assert.equal(result.calls,1);assert.equal(result.reads,1);
  assert.equal(result.body.primaryCandidateId,binding(1,scenario.good).decisionProjection.spotId,JSON.stringify(result.body));
  assert.equal(result.body.candidates.find(c=>c.spotId===binding(2,scenario.bad).decisionProjection.spotId)?.rank??null,null);
  assert.equal(result.body.personalization.state,'NEUTRAL');
  assert.equal(JSON.stringify(result.stored).includes(text),false);
  assert.equal(result.body.interpretation.resolverVersion,'decision-vnext-librarian-context-v1');
});
test('unauthenticated requests never reach Luna or the catalog',async()=>{const r=await exercise({text:'Private request',meaning:plan([meal()]),catalog:[],auth:false});assert.equal(r.status,401);assert.equal(r.calls,0);assert.equal(r.reads,0);});
test('a forged or rebound meaning plan never reaches evaluation',async()=>{const r=await exercise({text:'Original request',meaning:plan([meal()]),catalog:[],understandOverride:async()=>plan([meal()])});assert.equal(r.status,503);assert.equal(r.reads,0);});
test('truncated model output never produces fallback recommendations or a second call',async()=>{let count=0;const r=await exercise({text:'Original request',meaning:plan([meal()]),catalog:[],fetchImpl:async()=>{count++;return new Response(JSON.stringify({status:'incomplete',output:[]}));}});assert.equal(r.status,503);assert.equal(count,1);assert.equal(r.reads,0);});

test('a required either/or is not flattened into two duties by HTTP presentation',async()=>{
 const q=plan([fact('meal','experience.activity','essen gehen'),fact('coffee','offer.kind','Café')],{logic:{kind:'ANY',strength:'REQUIRED',children:[{kind:'FACT',factId:'meal'},{kind:'FACT',factId:'coffee'}]}});
 const r=await exercise({text:'Ein Café oder etwas essen in Basel',meaning:q,catalog:[binding(1,profile())]});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.notEqual(r.body.primaryCandidateId,null);
});
test('a requested venue type can support discovery without upgrading classification rights',async()=>{
 const b=binding(1,profile([offer('bar','DRINKS')],[area()],'BAR'));
 b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['WINE_BAR'];
 const r=await exercise({text:'Eine Weinbar in Basel',meaning:plan([fact('type','offer.kind','Weinbar')]),catalog:[b]});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.equal(r.body.primaryCandidateId,b.decisionProjection.spotId);
 const c=r.body.candidates[0];assert.equal(c.tier,'ELIGIBLE_CONFIRMED');assert.deepEqual(c.unknownHardConstraints,[]);
});
test('discovery rights never override an unknown mandatory visit condition',async()=>{
 const b=binding(1,profile([offer('bar','DRINKS')],[area()],'BAR'));b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['WINE_BAR'];
 const r=await exercise({text:'Weinbar mit bestätigtem Spezialangebot',meaning:plan([fact('type','offer.kind','Weinbar'),fact('special','offer.feature','Unbekanntes Spezialangebot')]),catalog:[b]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,null);
});
test('explicit numeric UI budget remains binding even if Luna omits it',async()=>{
 const r=await exercise({text:'Abendessen in Basel',meaning:plan([meal()]),understandOverride:async()=>{const {prepareLibrarianRequest,LUNA_LIBRARIAN_CONTRACT_VERSION}=await import('../dist/index.js');return prepareLibrarianRequest({contractVersion:LUNA_LIBRARIAN_CONTRACT_VERSION,output:plan([meal()]).raw,sourceText:'Abendessen in Basel',reference});},catalog:[binding(1,profile())],explicit:{targetCity:'Basel',hardConstraints:['BUDGET_MAXIMUM'],budget:{state:'KNOWN',amount:10,currency:'CHF',perPerson:true,calibrationLabel:null}}});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.equal(r.body.primaryCandidateId,null);
});
test('all new HTTP responses remain valid for the installed Mobile contract',async()=>{
 const {validateDecisionProductResponse}=await import('../../../mobile/packages/product-decision-contract/src/index.mjs');
 const text='Etwas essen in Basel';const r=await exercise({text,meaning:plan([meal()]),catalog:[binding(1,profile())]});
 assert.equal(r.status,200);assert.doesNotThrow(()=>validateDecisionProductResponse(r.body,r.request));
});

test('the real Web transport accepts the new hashed response without a client contract change',async()=>{
 const ts=(await import('typescript')).default;
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../../../web/lib/decision-web-api.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function('exports','fetch','crypto',code)(exports,async(url,options)=>{
   assert.equal(url,'/api/decision');
   const request=JSON.parse(options.body);
   const r=await exercise({text:request.naturalLanguage,meaning:plan([meal()]),catalog:[binding(1,profile())],requestOverride:request});
   assert.equal(r.status,200,JSON.stringify(r.diagnostics));return new Response(JSON.stringify(r.body));
 },globalThis.crypto);
 const result=await exports.runWebDecision({inputMode:'free',rawFreeText:'Etwas essen',city:'Basel',directions:[],audiences:[],moods:[]});
 assert.equal(result.results.length,1);assert.equal(result.primaryCandidateId,binding(1,profile()).decisionProjection.spotId);
});
test('whole-city evaluation does not discard later valid candidates before contextual rejection',async()=>{
 const catalog=Array.from({length:80},(_,i)=>binding(i+1,profile()));
 const rejected=catalog.slice(0,75).map(b=>b.decisionProjection.spotId);
 const text='Etwas essen in Basel';
 const r=await exercise({text,meaning:plan([meal()]),catalog,requestOverride:{contractVersion:'backyrd.decision-vnext.product-request@1.0',requestId:'many-request',idempotencyKey:'many-idempotency',naturalLanguage:text,explicit:{targetCity:'Basel'},alternativeRequested:false,previouslyPresentedCandidateIds:[],rejectedCandidateIds:rejected.slice(0,50)}});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.notEqual(r.body.primaryCandidateId,null);assert.ok(!rejected.slice(0,50).includes(r.body.primaryCandidateId));
});
test('typed UI participant age cannot silently disappear in the provider response',async()=>{
 const r=await exercise({text:'Ein Ausflug in Basel',meaning:plan([meal()]),catalog:[],explicit:{targetCity:'Basel',group:{size:2,minimumAge:4,adultPresent:true,companionType:'FAMILY'}}});
 assert.equal(r.status,503);assert.equal(r.calls,1);assert.equal(r.reads,0);
});

test('a typed location filter does not apply today closure to tomorrow meaning',async()=>{
 const closed=worldFact('state.current',{kind:'CLOSED',scope:'VENUE'},{validityVerified:true,validFrom:'2026-10-14T07:00:00Z',validUntil:'2026-10-14T12:00:00Z'});
 const r=await exercise({text:'Morgen essen in Basel',meaning:plan([meal(),date()]),catalog:[binding(1,profile(),[closed])],explicit:{targetCity:'Basel',hardConstraints:['TARGET_LOCATION']}});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.notEqual(r.body.primaryCandidateId,null);
});

test('an older venue-wide price cannot override a proven scoped meal budget',async()=>{
 const oldPrice=worldFact('operation.price_range',{currency:'CHF',min:60,max:120});
 const r=await exercise({text:'Abendessen bis 40 CHF pro Person in Basel',meaning:plan([meal(),...budget(40)]),catalog:[binding(1,profile([offer('dinner','DINNER',['inside'],[],[price(30)])]),[oldPrice])],explicit:{targetCity:'Basel',hardConstraints:['BUDGET_MAXIMUM'],budget:{state:'KNOWN',amount:40,currency:'CHF',perPerson:true,calibrationLabel:null}}});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.notEqual(r.body.primaryCandidateId,null);
});

test('a typed total budget cannot become a per-person budget in Luna output',async()=>{
 const q=plan([meal(),...budget(30),fact('count','people.count',{amount:2,operator:'EQ',unit:'PEOPLE'},'CONTEXT',['g1'])]);
 const r=await exercise({text:'Zusammen höchstens 30 CHF ausgeben',meaning:q,catalog:[],explicit:{targetCity:'Basel',budget:{state:'KNOWN',amount:30,currency:'CHF',perPerson:false,calibrationLabel:null}}});
 assert.equal(r.status,503);assert.equal(r.calls,1);assert.equal(r.reads,0);
});


test('overlapped city preparation preserves complete responses for all ten domain cases',async()=>{
 for(const scenario of scenarios){
  const text=`Synthetischer Wunsch: ${scenario.name}`;
  const catalog=[scenario.good,scenario.bad].map((p,i)=>{const b=binding(i+1,p);if(p.category==='SPORT')b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['CLIMBING_GYM'];return b;});
  const sequential=await exercise({text,meaning:plan(scenario.facts),catalog});
  const parallel=await exercise({text,meaning:plan(scenario.facts),catalog,prefetch:true});
  assert.equal(parallel.status,200,JSON.stringify(parallel.diagnostics));
  assert.equal(parallel.calls,1);assert.equal(parallel.reads,1);
  assert.deepEqual(parallel.body,sequential.body);
 }
});

test('a dated dinner with missing offer time is recommended with unknown availability, never an open claim',async()=>{
 const b=binding(810,profile([{...offer(),schedule:[]}]));
 const r=await exercise({text:'Morgen Abend essen in Basel',meaning:plan([meal(),date(),evening()]),catalog:[b]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,b.decisionProjection.spotId);
 const c=r.body.candidates[0];assert.equal(c.tier,'ELIGIBLE_CONFIRMED');assert.equal(c.actualAvailability,'unknown');
 assert.deepEqual(c.unknownHardConstraints,[]);
 assert.ok(c.reasons.some(reason=>reason.code==='librarian-visit-time-unconfirmed'&&!reason.confirmed));
});
test('without user time, closed regular hours and the current day never filter a fitting offer',async()=>{
 const b=binding(811,profile([{...offer(),schedule:[{weekday:7,start:'10:00',end:'11:00'}]}]));
 b.decisionProjection.facts=b.decisionProjection.facts.map(f=>f.key==='hours.regular'?worldFact(f.key,[{day:'WEDNESDAY',intervals:[]},{day:'THURSDAY',intervals:[]}]):f);
 const r=await exercise({text:'Essen in Basel',meaning:plan([meal()]),catalog:[b]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,b.decisionProjection.spotId);
 assert.equal(r.body.candidates[0].actualAvailability,'not_requested');
});
test('a verified winebar identity cannot override its documented adult-only admission',async()=>{
 const b=binding(812,profile([offer('bar','DRINKS')],[area()],'BAR'),[worldFact('rule.age_access',{policy:'MINIMUM_AGE',minimumAge:18,appliesFromTime:null})]);
 b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['WINE_BAR'];
 const r=await exercise({text:'Weinbar mit einem Kind in Basel',meaning:plan([fact('venue','offer.kind','Weinbar'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])]),catalog:[b]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,null);
 assert.equal(r.body.candidates[0].tier,'INELIGIBLE');
});
test('known closure at the requested date is still an exclusion',async()=>{
 const b=binding(813,profile());
 b.decisionProjection.facts=b.decisionProjection.facts.map(f=>f.key==='hours.regular'?worldFact(f.key,[{day:'THURSDAY',intervals:[]}]):f);
 const r=await exercise({text:'Morgen Abend essen in Basel',meaning:plan([meal(),date(),evening()]),catalog:[b]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,null);assert.equal(r.body.candidates[0].tier,'INELIGIBLE');
});
