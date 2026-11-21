import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionProductHttpHandler, createDecisionProductLunaProvider, createDecisionProductRpcEvaluationProvider, contentHash } from '../dist/index.js';
import { validateNuknukCompactSearch } from '../dist/nuknuk-understanding.js';
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
    assert.equal(weaker?.rank??null,null);assert.notEqual(weaker.tier,'ELIGIBLE_CONFIRMED');
    assert.ok(weaker.reasons.some(r=>r.domain==='LIMITATION'&&!r.confirmed));
  } else assert.equal(weaker?.rank??null,null);
  assert.equal(result.body.personalization.state,'NEUTRAL');
  assert.equal(JSON.stringify(result.stored).includes(text),false);
  assert.equal(result.body.interpretation.resolverVersion,'decision-vnext-librarian-context-v1');
});
test('unauthenticated requests never reach Luna or the catalog',async()=>{const r=await exercise({text:'Private request',meaning:plan([meal()]),catalog:[],auth:false});assert.equal(r.status,401);assert.equal(r.calls,0);assert.equal(r.reads,0);});
test('a forged or rebound meaning plan never reaches evaluation',async()=>{const r=await exercise({text:'Original request',meaning:plan([meal()]),catalog:[],understandOverride:async()=>plan([meal()])});assert.equal(r.status,503);assert.equal(r.reads,0);});
test('truncated model output never produces fallback recommendations or a second call',async()=>{let count=0;const r=await exercise({text:'Original request',meaning:plan([meal()]),catalog:[],fetchImpl:async()=>{count++;return new Response(JSON.stringify({status:'incomplete',output:[]}));}});assert.equal(r.status,503);assert.equal(count,1);assert.equal(r.reads,0);});

test('a required source-time echo fails before search without silently demoting it or retrying',async()=>{
 const meaning=plan([meal(),date(),fact('quote','time.original','morgen','REQUIRED')]);
 const before=structuredClone(meaning.raw);
 const r=await exercise({text:'Morgen essen in Basel',meaning,catalog:[binding(1,profile())]});
 assert.equal(r.status,503);assert.equal(r.calls,1);assert.equal(r.reads,0);
 assert.deepEqual(meaning.raw,before);
 assert.ok(r.diagnostics.some(d=>d.code==='product_luna_meaning_invalid'));
});

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
test('verified venue discovery does not waive an unknown mandatory extra feature',async()=>{
 const b=binding(1,profile([offer('bar','DRINKS')],[area()],'BAR'));b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['WINE_BAR'];
 const r=await exercise({text:'Weinbar mit bestätigtem Spezialangebot',meaning:plan([fact('type','offer.kind','Weinbar'),fact('special','offer.feature','Unbekanntes Spezialangebot')]),catalog:[b]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,null);
 assert.equal(r.body.candidates[0].rank,null);
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
 // Load the real shared visitor/request module now imported by the Web adapter.
 // Only the transport is faked; normalization and response checks remain real.
 const presentationSource=readFileSync(new URL('../../../mobile/lib/decision/wohinModel.ts',import.meta.url),'utf8');
 const presentationCode=ts.transpileModule(presentationSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const presentation={};new Function('exports',presentationCode)(presentation);
 const exports={};
 const requirePresentation=specifier=>{assert.equal(specifier,'../../mobile/lib/decision/wohinModel');return presentation;};
 new Function('exports','require','fetch','crypto',code)(exports,requirePresentation,async(url,options)=>{
   assert.equal(url,'/api/decision');
   const request=JSON.parse(options.body);
   const r=await exercise({text:request.naturalLanguage,meaning:plan([meal()]),catalog:[binding(1,profile())],requestOverride:request});
   assert.equal(r.status,200,JSON.stringify(r.diagnostics));return new Response(JSON.stringify(r.body));
 },globalThis.crypto);
 const result=await exports.runWebDecision({rawFreeText:'Etwas essen',city:'Basel'});
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

test('venue hours cannot confirm a recurring programme that asks users to check its schedule',async()=>{
 const {librarianOfferAvailability,createLibrarianVisitWindow}=await import('../dist/product-librarian-time.js');
 const program={...offer('quiz','PLAY'),name:'Pub Quiz am Sonntagabend',schedule:[],
  properties:[prop('experience.activity','Sonntagabend Pub Quiz; aktuelle Durchführung und Anmeldung beim Lokal prüfen')]};
 const result=librarianOfferAvailability(program,{},createLibrarianVisitWindow([{...date(),value:{...date().value,kind:'DATE'}}],reference.timezone));
 assert.equal(result.state,'UNKNOWN');
 assert.equal(result.reason,'PROGRAMME_WITHOUT_CONFIRMED_SCHEDULE');
});

test('a dated dinner without its own timetable inherits venue hours and explains the source',async()=>{
 const b=binding(810,profile([{...offer(),schedule:[]}]));
 const r=await exercise({text:'Morgen Abend essen in Basel',meaning:plan([meal(),date(),evening()]),catalog:[b]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,b.decisionProjection.spotId);
 const c=r.body.candidates[0];assert.equal(c.tier,'ELIGIBLE_CONFIRMED');assert.equal(c.rank,1);assert.equal(c.actualAvailability,'open');
 assert.equal(c.unknownHardConstraints.length,0);
 assert.ok(c.reasons.some(reason=>reason.code==='librarian-inherited-spot-hours'&&!reason.confirmed));
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

test('absent child restriction is an honest notice while documented age exclusion remains excluded',async()=>{
 const child=profile([offer('visit','VISIT',['inside'],[prop('experience.activity','Tiere beobachten')])],[area()],'ZOO');
 const unknown=binding(820,child),barred=binding(821,child,[worldFact('rule.age_access',{policy:'MINIMUM_AGE',minimumAge:18,appliesFromTime:null})]);
 const r=await exercise({text:'Tiere beobachten mit vierjährigem Kind',meaning:plan([fact('animals','experience.activity','Tiere beobachten'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])]),catalog:[unknown,barred]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,unknown.decisionProjection.spotId);
 const admitted=r.body.candidates.find(c=>c.spotId===unknown.decisionProjection.spotId);
 assert.equal(admitted.tier,'ELIGIBLE_CONFIRMED');
 assert.ok(admitted.reasons.some(reason=>!reason.confirmed&&reason.statement.includes('Alterseignung ist hier nicht vollständig dokumentiert')));
 assert.equal(r.body.candidates.find(c=>c.spotId===barred.decisionProjection.spotId).rank,null);
});
test('overlapping meal prices confirm budget without a price warning; known excess stays excluded',async()=>{
 const b=(id,min,max)=>binding(id,profile([offer('dinner','DINNER',['inside'],[],[price(min,{max})])]));
 const good=b(822,11,19),overlap=b(823,11,26),expensive=b(824,21,26);
 const r=await exercise({text:'Essen bis zwanzig Franken pro Person',meaning:plan([meal(),...budget(20)]),catalog:[overlap,expensive,good]});
 assert.equal(r.status,200);assert.notEqual(r.body.primaryCandidateId,null);
 const c=r.body.candidates.find(c=>c.spotId===overlap.decisionProjection.spotId);
 assert.ok(c.rank!==null);assert.equal(c.tier,'ELIGIBLE_CONFIRMED');assert.ok(c.reasons.some(r=>r.confirmed&&r.statement.includes('Budget passt')));assert.ok(!c.reasons.some(r=>r.domain==='LIMITATION'&&r.statement.includes('Preis')));
 assert.equal(r.body.candidates.find(c=>c.spotId===expensive.decisionProjection.spotId).rank,null);
});
test('an indoor cafe cannot confirm an indoor child activity, and cannot substitute for a mandatory indoor activity area',async()=>{
 const p=profile([offer('play','MOVEMENT_PLAY',['kids'],[prop('experience.activity','Bewegungsspiel'),prop('participation.minimum_age',1)]),offer('cafe','CAFE',['inside'])],[{...area('kids'),kind:'CHILDREN_AREA'},area()],'SPORT');
 const b=binding(825,p);b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['CLIMBING_GYM'];
 const r=await exercise({text:'Indoor Bewegungsspiel mit Kind',meaning:plan([fact('play','experience.activity','Bewegungsspiel'),fact('in','offer.area','drinnen'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])]),catalog:[b]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,null);assert.equal(r.body.candidates[0].tier,'UNCONFIRMED_FALLBACK');
 assert.ok(r.body.candidates[0].reasons.some(r=>r.statement.includes('die Kombination deiner Wünsche')&&!r.confirmed));
 assert.ok(!r.body.candidates[0].reasons.some(r=>r.code==='librarian-provisional-visit'));
});
test('partial wheelchair access is explained; a specifically disproven step-free entrance remains excluded',async()=>{
 const b=binding(826,profile(),[
  worldFact('accessibility.accessible_outdoor',true,{resolution:'KNOWN_TRUE'}),worldFact('accessibility.accessible_indoor',false,{resolution:'KNOWN_FALSE'}),
  worldFact('accessibility.accessible_seating',true,{resolution:'KNOWN_TRUE'}),worldFact('accessibility.step_free_entrance',false,{resolution:'KNOWN_FALSE'}),worldFact('accessibility.accessible_toilet',false,{resolution:'KNOWN_FALSE'})]);
 const generic=await exercise({text:'Rollstuhlgängig essen',meaning:plan([meal(),fact('wheel','participation.accessibility','rollstuhlgängig')]),catalog:[b]});
 assert.equal(generic.status,200);assert.equal(generic.body.primaryCandidateId,null);assert.equal(generic.body.candidates[0].tier,'UNCONFIRMED_FALLBACK');
 const note=generic.body.candidates[0].reasons.find(r=>r.code==='librarian-access-details');assert.ok(note.statement.includes('Aussenbereich'));assert.ok(note.statement.includes('WC'));assert.equal(note.confirmed,false);
 const specific=await exercise({text:'Stufenlos essen',meaning:plan([meal(),fact('step','participation.accessibility','stufenlos')]),catalog:[b]});
 assert.equal(specific.status,200);assert.equal(specific.body.primaryCandidateId,null);
});

test('fewer unknown duties cannot promote either incomplete candidate to a recommendation',async()=>{
 const more=binding(827,profile()),less=binding(828,profile([offer('dinner','DINNER',['inside'],[prop('food.diet','vegan')])]));
 const r=await exercise({text:'Vegan essen mit besonderer Aussicht',meaning:plan([meal(),fact('diet','food.diet','vegan'),fact('view','offer.feature','besondere Aussicht')]),catalog:[more,less]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,null);
 const ranked=r.body.candidates.filter(c=>c.rank!==null);assert.equal(ranked.length,0);
 assert.ok(r.body.candidates.every(c=>c.unknownHardConstraints.length>0));
});
test('legacy typed indoor requirements remain binding',async()=>{
 const b=binding(829,profile([offer('visit','VISIT',['terrace'],[prop('experience.activity','Tiere beobachten')])],[area('terrace')],'ZOO'));
 b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['ZOO'];
 const r=await exercise({text:'Tiere drinnen anschauen',meaning:plan([fact('animals','experience.activity','Tiere beobachten'),fact('inside','offer.area','drinnen')]),catalog:[b],explicit:{targetCity:'Basel',hardConstraints:['INDOOR_REQUIRED']}});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.equal(r.body.primaryCandidateId,null);assert.equal(r.body.candidates[0].rank,null);
});

test('known missing mandatory equipment excludes while verified equipment remains eligible',async()=>{
 const make=(id,value)=>binding(id,profile([offer('dinner','DINNER',['inside'])],[area('inside',[prop('amenity.playground',value)])]));
 const missing=make(840,false),present=make(841,true);
 const r=await exercise({text:'Essen mit Spielplatz',meaning:plan([meal(),fact('play','offer.feature','Spielplatz')]),catalog:[missing,present]});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.equal(r.body.primaryCandidateId,present.decisionProjection.spotId);
 const c=r.body.candidates.find(c=>c.spotId===missing.decisionProjection.spotId);assert.equal(c.rank,null);assert.equal(c.tier,'INELIGIBLE');assert.ok(c.failedHardConstraints.length>0);
 assert.ok(c.reasons.some(r=>r.statement.startsWith('Nicht passend:')&&!r.confirmed));
});
test('mandatory activity duration and route length excesses both exclude',async()=>{
 const duration=plan([meal(),fact('duration','time.duration',{amount:120,operator:'LTE',unit:'MINUTES',measurementScope:'ACTIVITY',includes:['ACTIVITY']})]);
 const long=binding(842,profile([offer('dinner','DINNER',['inside'],[prop('time.duration',180)])]));
 const r=await exercise({text:'Aktivität höchstens zwei Stunden',meaning:duration,catalog:[long]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,null);assert.equal(r.body.candidates[0].tier,'INELIGIBLE');
 const route=plan([meal(),fact('length','route.length',{amount:3000,operator:'LTE',unit:'METERS',referenceEntityId:null})]);
 const tooLong=binding(843,profile([offer('dinner','DINNER',['inside'],[prop('route.length',5000)])]));
 const blocked=await exercise({text:'Weg höchstens drei Kilometer',meaning:route,catalog:[tooLong]});
 assert.equal(blocked.status,200);assert.equal(blocked.body.primaryCandidateId,null);assert.equal(blocked.body.candidates[0].tier,'INELIGIBLE');
});
test('an approximate activity duration compares against the documented offer duration',async()=>{
 const wish=plan([meal(),fact('duration','time.duration',{amount:45,operator:'APPROX',unit:'MINUTES',measurementScope:'ACTIVITY',includes:['ACTIVITY']})]);
 const make=(id,minutes)=>binding(id,profile([offer('dinner','DINNER',['inside'],minutes===null?[]:[prop('time.duration',minutes)])]));
 const near=make(851,50),long=make(852,120),unknown=make(853,null);
 const result=await exercise({text:'In ungefähr einer Dreiviertelstunde essen',meaning:wish,catalog:[long,unknown,near]});
 assert.equal(result.status,200,JSON.stringify(result.diagnostics));
 assert.equal(result.body.primaryCandidateId,near.decisionProjection.spotId);
 assert.equal(result.body.candidates.find(c=>c.spotId===long.decisionProjection.spotId)?.tier,'INELIGIBLE');
 assert.equal(result.body.candidates.find(c=>c.spotId===unknown.decisionProjection.spotId)?.tier,'UNCONFIRMED_FALLBACK');
});
test('explicitly excluded food drinks activities and participation content prevent recommendation',async()=>{
 for(const [key,value] of [['food.dish','Pizza'],['food.drink','Bier'],['experience.activity','Tanzen'],['participation.language','Deutsch'],['participation.format','geführt']]) {
  const b=binding(844,profile([offer('dinner','DINNER',['inside'],[prop(key,value)])]));
  const r=await exercise({text:`Essen ohne ${value}`,meaning:plan([meal(),fact('excluded',key,value,'EXCLUDED')]),catalog:[b]});
  assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.equal(r.body.primaryCandidateId,null,key);
  assert.equal(r.body.candidates[0].tier,'INELIGIBLE',key);assert.ok(r.body.candidates[0].failedHardConstraints.length>0,key);
  assert.ok(r.body.candidates[0].reasons.some(reason=>reason.statement.includes('ausgeschlossener Inhalt')&&!reason.confirmed),key);
 }
});
test('evidence for a river view belongs to the visit and cannot come from nearby water alone',async()=>{
 const view=profile([offer('view','SELF_GUIDED_VISIT',['terrace'],[
  prop('experience.activity','Aussichtsterrasse mit Blick über den Rhein im alten Städtchen.'),
 ])],[area('terrace')]);
 const near=profile([offer('near','SELF_GUIDED_VISIT',['terrace'],[
  prop('experience.activity','Garten beim Rhein, ohne Blick auf den Rhein.'),
 ])],[area('terrace')]);
 const good=binding(848,view), bad=binding(849,near);
 const result=await exercise({text:'Wo sieht man den Rhein?',meaning:plan([fact('view','location.view','Rhein')]),catalog:[bad,good]});
 assert.equal(result.status,200,JSON.stringify(result.diagnostics));
 assert.equal(result.body.primaryCandidateId,good.decisionProjection.spotId);
 assert.equal(result.body.candidates.find(row=>row.spotId===bad.decisionProjection.spotId).rank,null);
});
test('excluded venue types still exclude, without treating unknown excluded types as mandatory positive identities',async()=>{
 const zoo=binding(845,profile()),restaurant=binding(846,profile());
 zoo.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['ZOO'];
 const r=await exercise({text:'Essen, aber kein Zoo',meaning:plan([meal(),fact('nozoo','offer.kind','Zoo','EXCLUDED')]),catalog:[zoo,restaurant]});
 assert.equal(r.status,200);assert.equal(r.body.primaryCandidateId,null);
 assert.equal(r.body.candidates.find(c=>c.spotId===zoo.decisionProjection.spotId).rank,null);
 assert.ok(r.body.candidates.find(c=>c.spotId===zoo.decisionProjection.spotId).unknownHardConstraints.length>0); // source exclusion rights stay unmodified
 const card=r.body.candidates.find(c=>c.spotId===restaurant.decisionProjection.spotId);
 assert.equal(card.tier,'UNCONFIRMED_FALLBACK');
 assert.ok(card.reasons.some(reason=>reason.code==='librarian-provisional-visit' && !reason.confirmed));
});
test('legacy UI equipment and exclusion requirements cannot be silently dropped',async()=>{
 const b=binding(847,profile([offer('dinner','DINNER',['inside'],[prop('food.drink','Bier')])],[area('inside',[prop('amenity.playground',false)])]),[worldFact('amenity.features',['TOILET']),worldFact('offering.groups',['BEER'])]);
 const r=await exercise({text:'Essen mit Spielplatz ohne Bier',meaning:plan([meal(),fact('play','offer.feature','Spielplatz'),fact('beer','food.drink','Bier','EXCLUDED')]),catalog:[b],explicit:{targetCity:'Basel',hardConstraints:['WK_REQUIRED:P1:amenity.features:PLAY_AREA','WK_EXCLUDED:B1:offering.groups:BEER']}});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.equal(r.body.primaryCandidateId,null);assert.ok(r.body.candidates[0].failedHardConstraints.length>0);
});

test('all authenticated account identities reach Luna without an account allowlist', async () => {
  for (const userId of ['33333333-3333-4333-a333-333333333333','44444444-4444-4444-a444-444444444444','55555555-5555-4555-a555-555555555555']) {
    const result=await exercise({text:'Ein ruhiges Café in Basel für einen Kaffee mit einer Freundin',meaning:plan([meal()]),catalog:[binding(1,profile())],userId});
    assert.equal(result.status,200,JSON.stringify(result.diagnostics));
    assert.equal(result.calls,1);
    assert.equal(result.reads,1);
    assert.notEqual(result.body.primaryCandidateId,null);
  }
});

// Diagnostics observe the same search; they must not add reads or change ranking.
test('request-local search observer captures once without changing the product answer',async()=>{
 const args={text:'Abendessen in Basel',meaning:plan([meal()]),catalog:[binding(1,profile()),binding(2,profile([offer('bar','DRINKS')]))]};
 const baseline=await exercise(args);let seen=[];
 const observed=await exercise({...args,onSearch:result=>seen.push(result)});
 assert.equal(observed.status,200);assert.equal(seen.length,1);
 assert.equal(seen[0].ranked.length+seen[0].excluded.length+seen[0].unresolved.length,2);
 assert.equal(observed.calls,baseline.calls);assert.equal(observed.reads,baseline.reads);
 assert.deepEqual(observed.body,baseline.body);
});


test('the language model never receives a profile/default city as an explicit wish',async()=>{
 const text='Spielplatz draussen mit meiner familie';
 const meaning=plan([fact('play','offer.facility','playground'),fact('outside','offer.area','outdoor')]);
 const data=profile([offer('play','MOVEMENT_PLAY',['playground'])],[{...area('playground'),kind:'PLAYGROUND'}],'OUTDOOR_NATURE');
 const seen=[];
 const r=await exercise({text,meaning,catalog:[binding(1,data)],explicit:{targetCity:'Basel',targetCityRole:'SEARCH_CONTEXT'},fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body);const modelInput=JSON.parse(body.input);seen.push(modelInput);
  assert.equal(modelInput.request,text);assert.equal('targetCity' in modelInput.explicitContext,false);assert.equal('targetCityRole' in modelInput.explicitContext,false);
  return new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(meaning.raw)}]}]}));
 }});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.equal(r.body.candidates.filter(c=>c.rank!==null).length,1);assert.equal(seen.length,1);
});
test('an explicitly selected destination still reaches the model and explicit source city is not demoted',async()=>{
 const text='Spielplatz in Basel';const meaning=plan([fact('city','location.destination','Basel'),fact('play','offer.facility','playground')]);
 const data=profile([offer('play','MOVEMENT_PLAY',['playground'])],[{...area('playground'),kind:'PLAYGROUND'}],'OUTDOOR_NATURE');
 const r=await exercise({text,meaning,catalog:[binding(1,data)],explicit:{targetCity:'Basel',targetCityRole:'REQUIRED_DESTINATION'},fetchImpl:async(_url,options)=>{
  assert.equal(JSON.parse(JSON.parse(options.body).input).explicitContext.targetCity,'Basel');
  return new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(meaning.raw)}]}]}));
 }});assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.equal(r.body.candidates.filter(c=>c.rank!==null).length,1);
 assert.equal(meaning.facts.find(f=>f.id==='city').modality,'REQUIRED');
});

 test('selected offer preserves explicit uncertainty about external guests without rejecting discovery',async()=>{
 const p=profile([offer('breakfast','BREAKFAST',['inside'],[prop('custom.detail','Frühstück ist bestätigt; Zeiten, Preis und externe Teilnahme beim Hotel erfragen.',{label:'Frühstück'})])]);
 const b=binding(1911,p);const r=await exercise({text:'Frühstücken in Basel',meaning:plan([fact('breakfast','experience.activity','breakfast')]),catalog:[b]});
 assert.equal(r.status,200);const c=r.body.candidates[0];assert.equal(c.rank,1);
 assert.ok(c.reasons.some(x=>x.code==='librarian-external-admission-unconfirmed'&&!x.confirmed&&x.statement.includes('externe Teilnahme')));
 const staying=profile([...p.offers,offer('stay','OVERNIGHT_STAY')]);
 const overnight=await exercise({text:'Übernachten und frühstücken',meaning:plan([fact('breakfast','experience.activity','breakfast'),fact('stay','experience.activity','overnight_stay','REQUIRED',['a2'])]),catalog:[binding(1912,staying)]});
 assert.equal(overnight.status,200);assert.equal(overnight.body.candidates[0].rank,1);
 assert.ok(!overnight.body.candidates[0].reasons.some(x=>x.code==='librarian-external-admission-unconfirmed'));
 });

test('offline resolved destinations query only the chosen municipality inside a regional search', async () => {
 const basel = binding(1, profile());
 const riehen = binding(2, profile());
 riehen.decisionProjection.facts.find(row => row.key === 'location.locality').value = 'Riehen';
 const result = await exercise({
  text: 'In Riehen essen',
  meaning: plan([meal(), fact('destination', 'location.destination', 'Riehen', 'REQUIRED', [])]),
  catalog: [basel, riehen],
  useResolvedTargetCity: true,
 });
 assert.equal(result.status, 200, JSON.stringify(result.diagnostics));
 assert.equal(result.reads, 1);
 assert.equal(result.body.primaryCandidateId, riehen.decisionProjection.spotId);
 assert.ok(result.body.candidates.every(candidate => candidate.presentation.locality === 'Riehen'));
});

test('a known Basel landmark is bound as a place within the city, not as a municipality', async () => {
 const text = 'Ich möchte ins Basler Münster.';
 let search;
 const spot = (id, name) => {
  const item = binding(id, profile());
  item.decisionProjection.facts.find(f => f.key === 'identity.name').value = name;
  return item;
 };
 const r = await exercise({ text, meaning: plan([fact('venue', 'location.destination', 'Basler Münster')]),
  catalog: [spot(1, 'Basler Münster'), spot(2, 'Münster-Fähre «Leu»')], useResolvedTargetCity: true, onSearch: result => { search = result; } });
 assert.equal(r.status, 200, JSON.stringify(r.diagnostics));
 assert.equal(r.body.interpretation.targetCity, 'Basel');
 assert.equal(r.body.candidates.find(c => c.presentation.name.includes('Fähre'))?.rank ?? null, null);
 const candidates = [...search.ranked, ...search.unresolved, ...search.excluded];
 assert.ok(candidates.find(c => c.name === 'Basler Münster').facts.some(f => f.state === 'MET' && f.reason === 'VERIFIED_PLACE_IDENTITY'));
});

test('a successful catalog read with no spots for the requested city returns a typed empty result', async () => {
 const text = 'Ich möchte in Liestal essen.';
 const r = await exercise({ text, meaning: plan([meal(), fact('city', 'location.destination', 'Liestal')]),
  catalog: [binding(1, profile())], useResolvedTargetCity: true });
 assert.equal(r.status, 200, JSON.stringify(r.diagnostics));
 assert.equal(r.reads, 1);
 assert.equal(r.body.primaryCandidateId, null);
 assert.deepEqual(r.body.candidates, []);
 assert.ok(r.body.limitations.includes('NO_CATALOG_CANDIDATES'));
});

test('a bar that closed at midnight on Saturday cannot be recommended on Sunday evening', async () => {
 const sunday = '2026-11-15';
 const runtimeReference = {now:'2026-11-15T17:50:00+01:00',timezone:'Europe/Zurich'};
 const runtimeAuthority = {city:'Basel',now:'2026-11-15T16:50:00Z'};
 const meaning = plan([
  fact('drink','food.drink','drinks'),fact('cozy','atmosphere.character','gemütlich','PREFERRED'),
  {...date(),value:{...date().value,date:sunday}},evening(),
 ]);
 const bar = profile([{...offer('drinks','DRINKS'),schedule:[]}],[area('inside',[prop('atmosphere.character','gemütlich')])],'BAR');
 const saturday = {day:'SATURDAY',intervals:[{start:'17:00',end:'00:00'}]};
 const closed = binding(117,bar);
 const open = binding(118,bar);
 closed.decisionProjection.facts.find(row=>row.key==='hours.regular').value = [saturday,{day:'SUNDAY',intervals:[]}];
 open.decisionProjection.facts.find(row=>row.key==='hours.regular').value = [saturday,{day:'SUNDAY',intervals:[{start:'18:00',end:'23:00'}]}];
 const result = await exercise({text:'Heute Abend gemütlich was trinken',meaning,catalog:[closed,open],runtimeReference,runtimeAuthority});
 assert.equal(result.status,200,JSON.stringify(result.diagnostics));
 assert.equal(result.body.primaryCandidateId,open.decisionProjection.spotId);
 const closedCard = result.body.candidates.find(row=>row.spotId===closed.decisionProjection.spotId);
 assert.ok(!closedCard || (closedCard.rank === null && closedCard.tier === 'INELIGIBLE'),JSON.stringify(closedCard));
});

test('NukNuk short searches preserve the full criteria before using the same Librarian route', async () => {
 const {createDecisionProductNuknukProvider} = await import('../dist/product-nuknuk-provider.js');
 const text = 'Gemütlich was trinken gehen';
 const compactFact = (key,text,modality) => ({key,value:{text},modality,basis:'EXPLICIT'});
 const drinks = compactFact('food.drink','drinks','REQUIRED');
 const cozy = compactFact('atmosphere.character','gemütlich','PREFERRED');
 const compact = (facts,rest={}) => ({singleActivity:true,meaning:{facts,...rest}});
 const spot = binding(111,profile([offer('bar','DRINKS')],[area('inside',[prop('atmosphere.character','gemütlich')])],'BAR'));
 const full = compact([drinks,cozy]);
 for (const scenario of [
  {input:text,short:full,modes:['short']},
  {input:text,short:compact([drinks]),modes:['short','full']},
  {input:text,short:compact([drinks,compactFact('atmosphere.character','gemütlich','REQUIRED')]),modes:['short','full']},
  {input:text,short:compact([drinks,cozy,compactFact('location.destination','Bern','REQUIRED')]),modes:['short','full']},
  {input:'Heute Abend gemütlich was trinken gehen',modes:['full']},
  {input:'Gemütlich was trinken gehen, bei Regen lieber ins Museum.',modes:['full']},
  {input:'Gemütlich was trinken gehen. Rückfrage: Drinnen oder draussen? Antwort: Draussen.',dialogue:true,modes:['dialogue','full','full']},
 ]) {
  const modes = [];
  const understand = createDecisionProductNuknukProvider({
   endpoint:'https://nuknuk.example.test/v1/chat/completions',apiKey:'fixture-key',model:'nuknuk-test',fastSimpleSearch:true,
   routeDialogue:scenario.dialogue,now:()=>new Date(reference.now),
   async fetchImpl(_url,init) {
    const body = JSON.parse(init.body);
    const prompt = body.messages[0].content;
    const mode = body.max_tokens === 96 ? 'dialogue' : prompt.length < 1000 ? 'short' : 'full';
    modes.push(mode);
    const changes = {meaning:{facts:[]},removeFactIds:[],removalEvidence:[]};
    const result = mode === 'dialogue' ? {route:'UPDATE_SEARCH'} : mode === 'short' ? scenario.short
     : scenario.dialogue && modes.length === 3 ? changes : full;
    return Response.json({model:'nuknuk-test',choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
   },
  });
  let accepted;
  const result = await exercise({text:scenario.input,catalog:[spot],understandOverride:async (...args) => {
   accepted = await understand(...args);
   return accepted;
  }});
  assert.deepEqual(modes,scenario.modes,scenario.input);
  if (scenario.input !== text) continue;
  assert.equal(result.status,200,JSON.stringify(result.diagnostics));
  assert.equal(result.body.primaryCandidateId,spot.decisionProjection.spotId);
  assert.deepEqual(accepted.facts.map(f=>[f.key,f.modality]),[['food.drink','REQUIRED'],['atmosphere.character','PREFERRED']]);
 }
});

test('NukNuk beta route searches outdoors with a follow-up and stops for an unbound rain rule', async () => {
 const { createDecisionProductNuknukProvider } = await import('../dist/product-nuknuk-provider.js');
 const text = 'Bei Schauern gern kurz unter ein Dach, aber wir möchten auch draussen spielen.';
 const outdoorArea = { ...area('playground'), kind: 'PLAYGROUND' };
 const outdoor = binding(101, profile([offer('play', 'MOVEMENT_PLAY', ['playground'])], [outdoorArea], 'OUTDOOR_NATURE'));
 const indoor = binding(102, profile([offer('play', 'MOVEMENT_PLAY', ['inside'])]));
 let raw = {
   meaning: { facts: [fact('move', 'experience.activity', 'movement_play', 'REQUIRED', []),
     fact('out', 'offer.area', 'outdoor', 'CONTEXT', [])] },
   clarification: { question: 'Soll der Regenschutz direkt beim Spielbereich sein?', dimension: 'OTHER', options: ['Direkt dort', 'In der Nähe genügt'] },
 };
 const understandOverride = createDecisionProductNuknukProvider({
   endpoint: 'https://nuknuk.example.test/v1/chat/completions', apiKey: 'fixture-key', model: 'nuknuk-test',
   now: () => new Date(reference.now),
   fetchImpl: async () => Response.json({ model: 'nuknuk-test', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] }),
 });
 const run = await exercise({ text, catalog: [indoor, outdoor], understandOverride });
 assert.equal(run.status, 200, JSON.stringify(run.diagnostics));
 assert.equal(run.body.primaryCandidateId, outdoor.decisionProjection.spotId);
 assert.ok(run.body.candidates.every(candidate => candidate.spotId !== indoor.decisionProjection.spotId || candidate.rank === null));
 assert.equal(run.body.clarification, raw.clarification.question);
 assert.equal(run.reads, 1);

 raw = { ...raw, meaning: { ...raw.meaning, weatherConditions: [
   { id: 'rain', role: 'CONDITIONAL', state: 'RAIN', basis: 'EXPLICIT', subjectIds: [], detail: null },
 ] } };
 const needsQuestion = await exercise({ text, catalog: [indoor, outdoor], understandOverride });
 assert.equal(needsQuestion.status, 422);
 assert.equal(needsQuestion.body.error.code, 'DECISION_NEEDS_CLARIFICATION');
 assert.match(needsQuestion.body.error.message, /draussen.*Regen/u);
 assert.equal(needsQuestion.reads, 0);
 assert.equal(needsQuestion.stored, undefined);
});

test('NukNuk preserves the previous search through an answer and accepts a sourced correction', async () => {
 const {createDecisionProductNuknukProvider} = await import('../dist/product-nuknuk-provider.js');
 const original = 'Abendessen für zwei heute Abend in Basel, gerne etwas Besonderes.';
 const question = {question:'Was würde den Abend für euch besonders machen?',dimension:'EXPERIENCE_DIRECTION',options:['Die Atmosphäre','Die Küche']};
 const originalMeaning = {
   entities:[{id:'party',kind:'GROUP',label:'Besuchsgruppe',members:[]}],
   facts:[fact('meal','food.meal','dinner','REQUIRED',[]),fact('city','location.destination','Basel','REQUIRED',[]),
     {...date(),subjectIds:[]},{...evening(),subjectIds:[]},
     fact('partySize','people.count',{amount:2,operator:'EQ',unit:'PEOPLE'},'CONTEXT',['party'])],
 };
 const town = binding(106,profile());
 town.decisionProjection.facts.find(row=>row.key==='location.locality').value = 'Liestal';
 for (const scenario of [
   {answer:'Gemütlich wäre schön.',city:'Basel',removeFactIds:[],removalEvidence:[]},
   {answer:'Gemütlich wäre schön. Doch lieber in Liestal.',city:'Liestal',removeFactIds:['city'],removalEvidence:[{id:'city',quote:'lieber in Liestal'}]},
   {answer:'Gemütlich wäre schön.',city:null,removeFactIds:['city'],removalEvidence:[{id:'city',quote:'lieber in Liestal'}]},
 ]) {
   const text = [original,`Rückfrage: ${question.question}`,`Antwort: ${scenario.answer}`].join(' ');
   const updateFacts = [originalMeaning.facts[0],fact('mood','atmosphere.character','cozy','PREFERRED',[])];
   if (scenario.city==='Liestal') updateFacts.push(fact('city','location.destination','Liestal','REQUIRED',[]));
   let calls = 0;
   const provider = createDecisionProductNuknukProvider({
     endpoint:'https://nuknuk.example.test/v1/chat/completions',apiKey:'fixture-key',model:'nuknuk-test',
     now:()=>new Date(reference.now),
     fetchImpl:async (_url,options)=>{
       const payload = JSON.parse(JSON.parse(options.body).messages[1].content);
       const output = ++calls===1 ? {meaning:originalMeaning,clarification:question}
         : {meaning:{facts:updateFacts},removeFactIds:scenario.removeFactIds,removalEvidence:scenario.removalEvidence,clarification:question};
       if (calls===1) assert.equal(payload.request,original);
       else {
         assert.equal(payload.turns[0].answer,scenario.answer);
         assert.equal(payload.previousMeaning.facts.length,originalMeaning.facts.length);
       }
       return Response.json({model:'nuknuk-test',choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]});
     },
   });
   let merged;
   const result = await exercise({text,catalog:[binding(105,profile()),town],useResolvedTargetCity:true,
     understandOverride:async (...args)=>{
       const value = await provider(...args);
       merged=value;
       return value;
     }});
   assert.equal(calls,2);
   if (!scenario.city) {
     assert.equal(result.status,422);
     assert.equal(result.reads,0);
     continue;
   }
   assert.equal(result.status,200,JSON.stringify(result.diagnostics));
   assert.equal(result.body.clarification,undefined);
   assert.equal(result.body.interpretation.targetCity,scenario.city);
   assert.equal(merged.facts.find(row=>row.key==='people.count').value.amount,2);
   assert.equal(merged.facts.filter(row=>row.key==='food.meal').length,1);
   assert.equal(merged.facts.find(row=>row.key==='time.day_phase').value.phase,'EVENING');
   assert.equal(merged.facts.find(row=>row.key==='time.date').value.date,date().value.date);
   assert.equal(merged.facts.find(row=>row.key==='atmosphere.character').value.text,'cozy');
 }
});

test('NukNuk retains prior facts when an unreferenced new fact reuses their wire IDs', async () => {
 const {mergeNuknukDialogueUpdate} = await import('../dist/nuknuk-dialogue.js');
 const saturday = {...date(),id:'f3',subjectIds:[]};
 const companion = fact('f4','people.relationship','Kollegin','CONTEXT',[]);
 const proximity = fact('f3','location.proximity','Bankverein','PREFERRED',[]);
 const previous = {facts:[saturday,companion],entities:[],extensions:[],weatherConditions:[],bindings:[],uncertainties:[],logic:null};
 const delta = {meaning:{facts:[proximity,{...saturday,id:'f4'}]},removeFactIds:[],removalEvidence:[]};
 const turns = [{question:null,answer:'Am gleichen Tag, am liebsten beim Bankverein.'}];
 const merged = mergeNuknukDialogueUpdate(previous,delta,turns);
 assert.deepEqual(merged.meaning.facts,[saturday,companion,{...proximity,id:'dialogueFact1'}]);
 const ambiguous = structuredClone(delta);
 ambiguous.meaning.logic = {kind:'FACT',factId:'f3'};
 assert.equal(mergeNuknukDialogueUpdate(previous,ambiguous,turns).meaning.facts.filter(row=>row.id==='f3').length,2);
});

test('accepting reservations updates the booking criterion without removing an independent preference', async () => {
 const {mergeNuknukDialogueUpdate} = await import('../dist/nuknuk-dialogue.js');
 const seating=fact('seating','atmosphere.character','Platz am Tisch','PREFERRED',[]);
 const booking=fact('booking','participation.booking','spontaneous','REQUIRED',[]);
 const previous={facts:[seating,booking],entities:[],extensions:[],weatherConditions:[],bindings:[],uncertainties:[],logic:null};
 const quote='Es darf auch mit Reservierung sein.';
 const answer='Wir werden vier. Du kannst auch etwas mit Reservation nehmen.';
 const source='Du kannst auch etwas mit Reservation nehmen.';
 const delta={meaning:{facts:[]},removeFactIds:['seating','booking'],
  removalEvidence:[{id:'seating',quote:source},{id:'booking',quote:source}]};
 assert.deepEqual(mergeNuknukDialogueUpdate(previous,delta,[{question:null,answer}]).meaning.facts,[seating]);
 assert.throws(()=>mergeNuknukDialogueUpdate(previous,{...delta,removalEvidence:[{id:'seating',quote},{id:'booking',quote:source}]},
  [{question:null,answer}]),/nuknuk_dialogue_removal_without_answer/);
});

test("the exhibition title proves its own topic, not a separate unrelated workshop", async () => {
  const exhibit = name => ({...offer('display','PERMANENT_EXHIBITION'),name});
  const themed = profile([exhibit('Musikinstrumente aus fünf Jahrhunderten')],[area()],'MUSEUM');
  const unrelated = profile([exhibit('Antike Münzen'),{...offer('workshop','WORKSHOP'),name:'Musikinstrumente bauen'}],[area()],'MUSEUM');
  const result = await exercise({
    text:'Ein Museum über Musikinstrumente in Basel',
    meaning:plan([fact('visit','experience.activity','Museum besuchen'),fact('theme','experience.theme','Musikinstrumente')]),
    catalog:[binding(1,themed),binding(2,unrelated)],
  });
  assert.equal(result.status,200);
  assert.equal(result.body.primaryCandidateId,binding(1,themed).decisionProjection.spotId);
  assert.equal(result.body.candidates.find(c=>c.spotId===binding(2,unrelated).decisionProjection.spotId)?.rank ?? null,null);
});

test("a self-guided exhibition can fulfil a thematic exhibition request", async () => {
  const named = name => profile([{...offer('display','SELF_GUIDED_VISIT'),name,prices:[]}],[area()],'MUSEUM');
  const matching = binding(1,named('Ausstellung zur Geschichte der Pharmazie'));
  const walking = binding(2,named('Spaziergang ohne Ausstellung durch den Hof'));
  const result = await exercise({text:'Eine Ausstellung über alte Heilmittel',
    meaning:plan([fact('visit','experience.activity','Ausstellung besuchen'),
      fact('theme','experience.theme','alte Heilmittel')]),catalog:[walking,matching]});
  assert.equal(result.status,200);
  assert.equal(result.body.primaryCandidateId,matching.decisionProjection.spotId);
  assert.equal(result.body.candidates.find(c=>c.spotId===walking.decisionProjection.spotId)?.rank ?? null,null);
});

test("self-guided admission is scoped to the selected exhibition", async () => {
  const thematic = {...offer('display','SELF_GUIDED_VISIT'),name:'Ausstellung zur Geschichte der Pharmazie',prices:[]};
  const selfGuided = binding(1,profile([thematic],[area()],'MUSEUM'));
  const guidedOnly = binding(2,profile([{...thematic,kind:'GUIDED_TOUR'}],[area()],'MUSEUM'));
  const query = 'Eine Ausstellung über alte Heilmittel ohne Führung';
  const { plan: meaning } = validateNuknukCompactSearch({meaning:{facts:[
    fact('activity','experience.activity','Ausstellung besuchen','REQUIRED',[]),
    fact('theme','experience.theme','alte Heilmittel','REQUIRED',[]),
    fact('format','participation.accessibility','self_guided','REQUIRED',[]),
  ]}},{query,reference});
  assert.equal(meaning.facts.find(row=>row.id==='format')?.key,'participation.format');
  const result = await exercise({text:query,meaning,catalog:[guidedOnly,selfGuided],understandOverride:async()=>meaning});
  assert.equal(result.status,200);
  assert.equal(result.body.primaryCandidateId,selfGuided.decisionProjection.spotId);
  assert.equal(result.body.candidates.find(c=>c.spotId===guidedOnly.decisionProjection.spotId)?.rank ?? null,null);
});

test("a structured flea-market value uses the same scoped offer as the German label", async () => {
  const flea = {...offer('market','MARKET_VISIT'),name:'Flohmarkt'};
  const produce = {...offer('market','MARKET_VISIT'),name:'Gemüsemarkt'};
  const market = (id,entry) => {
    const row = binding(id,profile([{...entry,prices:[]}],[area()],'SHOPPING_MARKETS'));
    row.decisionProjection.facts.find(entry=>entry.key==='classification.place_types').value=['MARKET'];
    return row;
  };
  const matching = market(1,flea);
  const other = market(2,produce);
  for (const label of ['Flohmarkt','FLOH_MARKET','FLEA_MARKET']) {
    const result = await exercise({text:'Flohmarkt in Basel',
      meaning:plan([fact('market','offer.kind',label)]),catalog:[other,matching]});
    assert.equal(result.status,200,label+' '+JSON.stringify(result.diagnostics));
    assert.equal(result.body.primaryCandidateId,matching.decisionProjection.spotId,label);
    assert.equal(result.body.candidates.find(c=>c.spotId===other.decisionProjection.spotId)?.rank ?? null,null,label);
  }
});

test("a documented river cruise is distinct from a ferry crossing and a tram ride", async () => {
  const ride = (id,name) => {
    const row = binding(id,profile([
      {...offer('ride','EXCURSION_RIDE'),name,prices:[]},
    ],[area()],'OUTDOOR_NATURE'));
    row.decisionProjection.facts.find(entry=>entry.key==='classification.place_types').value=['LANDMARK'];
    return row;
  };
  const cruise = ride(1,'Rundfahrten auf dem Rhein');
  const ferry = ride(2,'Mit der Fähre den Rhein überqueren');
  const tram = ride(3,'Historisches Tram für private Rundfahrten buchen');
  for (const [activity,spot] of [['Schifffahrt',cruise],['Fähre',ferry]]) {
    const result = await exercise({text:activity,meaning:plan([fact('ride','experience.activity',activity)]),
      catalog:[tram,ferry,cruise]});
    assert.equal(result.status,200);
    assert.deepEqual(result.body.candidates.filter(c=>c.rank!==null).map(c=>c.spotId),[spot.decisionProjection.spotId]);
  }
});

test("a scoped specialty coffee offer proves a request for coffee", async () => {
  const entry = {...offer('cafe','CAFE'),name:'Specialty Coffee',prices:[]};
  const b = binding(1,profile([entry]));
  b.decisionProjection.facts.find(entry=>entry.key==='classification.place_types').value=['CAFE'];
  const result = await exercise({text:'Kaffee in Basel',meaning:plan([fact('drink','food.drink','coffee')]),catalog:[b]});
  assert.equal(result.status,200);
  assert.equal(result.body.primaryCandidateId,b.decisionProjection.spotId);
});

test("a delegated discovery request keeps the exclusion and uses a documented programme", async () => {
  const text = 'Ich suche für uns etwas in Basel. Kein Sport, du kannst gerne eine Idee aussuchen.';
  const meaning = {facts:[
    {...fact('city','location.destination','Basel','REQUIRED',[]),subjectIds:[]},
    {...fact('sport','experience.activity','Sport','EXCLUDED',[]),subjectIds:[]},
  ]};
  const interpretation = validateNuknukCompactSearch({meaning},{query:text,reference});
  assert.ok(interpretation.plan.facts.some(f=>f.key==='experience.activity' && f.value.text==='offene Entdeckung'));
  assert.ok(interpretation.plan.facts.some(f=>f.id==='sport' && f.modality==='EXCLUDED'));
  const museum = binding(1,profile([{...offer('view','PERMANENT_EXHIBITION'),name:'Ausstellung über die Stadtgeschichte'}],[area()],'MUSEUM'));
  const result = await exercise({text,meaning:interpretation.plan,catalog:[museum,binding(2,profile())],
    understandOverride:async()=>interpretation.plan});
  assert.equal(result.status,200);
  assert.equal(result.body.primaryCandidateId,museum.decisionProjection.spotId);
  assert.equal(result.body.candidates.filter(row=>row.rank!==null).length,1);
});

test("documented ancient artefacts match a broad historic theme without treating a modern country as ancient", async () => {
  const museum = (id,theme) => binding(id,profile([
    {...offer('display','PERMANENT_EXHIBITION',['inside'],[prop('experience.theme',theme)]),name:'Dauerausstellung'},
  ],[area()],'MUSEUM'));
  const ancient = museum(1,'Ägypten sowie griechische und römische Skulpturen');
  const modern = museum(2,'Griechische Fotografie seit 1980');
  const result = await exercise({text:'Eine Ausstellung über alte Kulturen',
    meaning:plan([fact('visit','experience.activity','Ausstellung besuchen'),fact('theme','experience.theme','alte Kulturen')]),
    catalog:[modern,ancient]});
  assert.equal(result.status,200);
  assert.equal(result.body.primaryCandidateId,ancient.decisionProjection.spotId);
  assert.equal(result.body.candidates.find(c=>c.spotId===modern.decisionProjection.spotId)?.rank ?? null,null);
});
