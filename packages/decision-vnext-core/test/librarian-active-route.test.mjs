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
  const weaker=result.body.candidates.find(c=>c.spotId===binding(2,scenario.bad).decisionProjection.spotId);
  if (['relaxed drinks use their actual linked room','vegan dinner cannot borrow a vegan lunch','explicit indoor requirement uses the selected activity area','music exclusion needs documented absence in the selected area','an actual river area cannot be borrowed across unlinked rooms'].includes(scenario.name)) {
    assert.equal(weaker?.rank,2);assert.equal(weaker.tier,'UNCONFIRMED_FALLBACK');
    assert.ok(weaker.reasons.some(r=>r.domain==='LIMITATION'&&!r.confirmed));
  } else assert.equal(weaker?.rank??null,null);
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
test('verified venue discovery with an unknown extra feature is an honest fallback',async()=>{
 const b=binding(1,profile([offer('bar','DRINKS')],[area()],'BAR'));b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['WINE_BAR'];
 const r=await exercise({text:'Weinbar mit bestätigtem Spezialangebot',meaning:plan([fact('type','offer.kind','Weinbar'),fact('special','offer.feature','Unbekanntes Spezialangebot')]),catalog:[b]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,b.decisionProjection.spotId);
 assert.equal(r.body.candidates[0].tier,'UNCONFIRMED_FALLBACK');
 assert.ok(r.body.candidates[0].reasons.some(reason=>!reason.confirmed));
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

test('unknown child admission never suppresses a proven activity, documented age exclusion still does',async()=>{
 const child=profile([offer('visit','VISIT',['inside'],[prop('experience.activity','Tiere beobachten')])],[area()],'ZOO');
 const unknown=binding(820,child),barred=binding(821,child,[worldFact('rule.age_access',{policy:'MINIMUM_AGE',minimumAge:18,appliesFromTime:null})]);
 const r=await exercise({text:'Tiere beobachten mit vierjährigem Kind',meaning:plan([fact('animals','experience.activity','Tiere beobachten'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])]),catalog:[unknown,barred]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,unknown.decisionProjection.spotId);
 assert.equal(r.body.candidates.find(c=>c.spotId===unknown.decisionProjection.spotId).tier,'UNCONFIRMED_FALLBACK');
 assert.equal(r.body.candidates.find(c=>c.spotId===barred.decisionProjection.spotId).rank,null);
});
test('overlapping meal prices rank below a proven budget fit and above no answer; known excess stays excluded',async()=>{
 const b=(id,min,max)=>binding(id,profile([offer('dinner','DINNER',['inside'],[],[price(min,{max})])]));
 const good=b(822,11,19),overlap=b(823,11,26),expensive=b(824,21,26);
 const r=await exercise({text:'Essen bis zwanzig Franken pro Person',meaning:plan([meal(),...budget(20)]),catalog:[overlap,expensive,good]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,good.decisionProjection.spotId);
 const c=r.body.candidates.find(c=>c.spotId===overlap.decisionProjection.spotId);
 assert.equal(c.rank,2);assert.equal(c.tier,'UNCONFIRMED_FALLBACK');assert.ok(c.reasons.some(r=>r.statement.includes('günstigere und teurere')));
 assert.equal(r.body.candidates.find(c=>c.spotId===expensive.decisionProjection.spotId).rank,null);
});
test('an indoor cafe cannot confirm an indoor child activity, nor prevent a clearly marked fallback',async()=>{
 const p=profile([offer('play','MOVEMENT_PLAY',['kids'],[prop('experience.activity','Bewegungsspiel'),prop('participation.minimum_age',1)]),offer('cafe','CAFE',['inside'])],[{...area('kids'),kind:'CHILDREN_AREA'},area()],'SPORT');
 const b=binding(825,p);b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['CLIMBING_GYM'];
 const r=await exercise({text:'Indoor Bewegungsspiel mit Kind',meaning:plan([fact('play','experience.activity','Bewegungsspiel'),fact('in','offer.area','drinnen'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])]),catalog:[b]});
 assert.equal(r.status,200);assert.notEqual(r.body.primaryCandidateId,null);assert.equal(r.body.candidates[0].tier,'UNCONFIRMED_FALLBACK');
 assert.ok(r.body.candidates[0].reasons.some(r=>r.statement.includes('Noch nicht bestätigt: der gewünschte Bereich')&&!r.confirmed));
});
test('partial wheelchair access is explained; a specifically disproven step-free entrance remains excluded',async()=>{
 const b=binding(826,profile(),[
  worldFact('accessibility.accessible_outdoor',true,{resolution:'KNOWN_TRUE'}),worldFact('accessibility.accessible_indoor',false,{resolution:'KNOWN_FALSE'}),
  worldFact('accessibility.accessible_seating',true,{resolution:'KNOWN_TRUE'}),worldFact('accessibility.step_free_entrance',false,{resolution:'KNOWN_FALSE'}),worldFact('accessibility.accessible_toilet',false,{resolution:'KNOWN_FALSE'})]);
 const generic=await exercise({text:'Rollstuhlgängig essen',meaning:plan([meal(),fact('wheel','participation.accessibility','rollstuhlgängig')]),catalog:[b]});
 assert.equal(generic.status,200);assert.equal(generic.body.primaryCandidateId,b.decisionProjection.spotId);assert.equal(generic.body.candidates[0].tier,'UNCONFIRMED_FALLBACK');
 const note=generic.body.candidates[0].reasons.find(r=>r.code==='librarian-access-details');assert.ok(note.statement.includes('Aussenbereich'));assert.ok(note.statement.includes('WC'));assert.equal(note.confirmed,false);
 const specific=await exercise({text:'Stufenlos essen',meaning:plan([meal(),fact('step','participation.accessibility','stufenlos')]),catalog:[b]});
 assert.equal(specific.status,200);assert.equal(specific.body.primaryCandidateId,null);
});

test('otherwise equivalent supported fallbacks with fewer missing details rank first',async()=>{
 const more=binding(827,profile()),less=binding(828,profile([offer('dinner','DINNER',['inside'],[prop('food.diet','vegan')])]));
 const r=await exercise({text:'Vegan essen mit besonderer Aussicht',meaning:plan([meal(),fact('diet','food.diet','vegan'),fact('view','offer.feature','besondere Aussicht')]),catalog:[more,less]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,less.decisionProjection.spotId);
 const ranked=r.body.candidates.filter(c=>c.rank!==null);assert.equal(ranked.length,2);
 assert.equal(ranked[0].tier,'UNCONFIRMED_FALLBACK');assert.ok(ranked[0].unknownHardConstraints.length<ranked[1].unknownHardConstraints.length);
});
test('legacy typed indoor filters cannot restore an exclusion for the softened area preference',async()=>{
 const b=binding(829,profile([offer('visit','VISIT',['terrace'],[prop('experience.activity','Tiere beobachten')])],[area('terrace')],'ZOO'));
 b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['ZOO'];
 const r=await exercise({text:'Tiere drinnen anschauen',meaning:plan([fact('animals','experience.activity','Tiere beobachten'),fact('inside','offer.area','drinnen')]),catalog:[b],explicit:{targetCity:'Basel',hardConstraints:['INDOOR_REQUIRED']}});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.equal(r.body.primaryCandidateId,b.decisionProjection.spotId);assert.equal(r.body.candidates[0].tier,'UNCONFIRMED_FALLBACK');
});
