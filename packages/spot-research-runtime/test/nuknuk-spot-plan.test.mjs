import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {literalSpotTravelDirections,literalOfferAreaRelationships,literalLinkedDiningServices,scopedEntitySchema,commissionedLinkScope,lodgingPackageAssertion,scopedCandidateSchema,scopedPropertySchema,literalOfferSchedules,flatFieldSchema,parseFlatFieldFacts,rankSpotProfileFrontier,planSpotProfileFrontier,spotResearchQuestions,createSpotResearchPlan,parseScopedCandidates,applyScopedVerdicts as applyNativeScopedVerdicts,projectScopedResearch,scopedCoverage,DEFAULT_SPOT_RESEARCH_FIELDS} from '../dist/nuknuk-spot-plan.js';
import {researchSpotV2,literalSourceFacts,recheckEvidenceFloors,projectEvidenceLedger} from '../dist/nuknuk-agent.js';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';

// Explicit synthetic critic outputs for existing behavioral fixtures. Native-contract failures are tested separately.
const fixtureJustification=(verdict,quote)=>({reasonCode:verdict==='SUPPORTED'?'DIRECT_SUPPORT':verdict==='UNSUPPORTED'?'NOT_ENTAILED':'INSUFFICIENT_CONTEXT',explanation:verdict==='SUPPORTED'?'The fixture source explicitly supports this value in its stated scope.':verdict==='UNSUPPORTED'?'The fixture critic identifies an entailment failure for this source assertion.':'The fixture source leaves the exact requested scope unresolved.',evidenceQuote:quote});
const spot={spotId:'11111111-1111-4111-8111-111111111111',name:'Test Restaurant',locality:'Basel',existingValues:{'classification.primary_category':{value:'EAT'},'contact.website':{value:'https://example.org/'}}};
const fields=['experience.profile'].map(attributeKey=>({attributeKey,...researchValueContract(attributeKey)}));
const source=text=>({id:'s1',url:'https://example.org/',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-21T12:00:00Z'});
const c=(scope,entityKind,entityName,blockId,extra={})=>({field:'experience.profile',scope,entityKind,entityName,propertyKey:'',valueJson:'null',blockId,belongsTo:'TARGET',applicability:'CURRENT',condition:'',...extra});
function applyScopedVerdicts(raw,candidates){const text=candidates.map(c=>c.quote).join('\n\n');return applyNativeScopedVerdicts({...raw,verdicts:raw.verdicts.map(v=>({...fixtureJustification(v.verdict,candidates.find(c=>c.id===v.id)?.quote??''),...v}))},candidates,source(text));}
function project(rows,text,extraFields=fields){const s=source(text);const blocks=text.split('\n\n').map((text,i)=>({id:'b'+i,text}));const ledger=parseScopedCandidates({candidates:rows},s,extraFields,blocks);applyScopedVerdicts({verdicts:ledger.map(c=>({id:c.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',c.quote)}))},ledger);return {ledger,result:projectScopedResearch(spot,extraFields,ledger,[s],validateAuthoringSubmission)[0],s};}
test('restaurant is visitor services, areas, scoped amenities and explicit relationships',()=>{
 const text='Wir servieren Mittagessen im Gastraum.\n\nDie Terrasse bietet einen Blick auf den Rhein.\n\nDer Gastraum ist stufenlos zugänglich.\n\nMittagessen wird im Gastraum serviert.';
 const rows=[c('OFFER','LUNCH','Mittagessen','b0'),c('AREA','DINING_AREA','Gastraum','b0'),c('AREA','TERRACE','Terrasse','b1'),c('AREA','DINING_AREA','Gastraum','b2',{propertyKey:'amenity.step_free',valueJson:'true'}),c('OFFER','LUNCH','Mittagessen','b3',{propertyKey:'$area',valueJson:'"Gastraum"'}),c('AREA','TERRACE','Terrasse','b1',{propertyKey:'location.view',valueJson:'"Rhein"'})];
 const {result,ledger}=project(rows,text);assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.partialProfile,true);assert.equal(result.value.offers.length,1);assert.equal(result.value.areas.length,2);assert.equal(result.value.offers[0].areaIds[0],result.value.areas[0].id);assert.equal(result.value.areas[0].properties[0].value,true);assert.equal(result.value.properties.length,0);assert.equal(scopedCoverage([result],ledger).explicitRelationships,1);
});
test('Fischerstube regression: eight named dishes never become eight dining offers',()=>{
 const names=['Rindsfilet','Rösti','Tagessuppe','Entrecôte','Gemüseteller','Bierbraten','Schnitzel','Salat'];
 const text=names.map(name=>`${name} mit Beilage für CHF 25.`).join('\n\n');
 const {result,ledger}=project(names.map((name,i)=>c('OFFER','GASTRONOMY',name,'b'+i)),text);assert.equal(result.status,'UNRESOLVED');assert.ok(ledger.every(c=>c.state==='HELD'&&c.reason==='MENU_PRODUCT_NOT_VISITOR_OFFER'));
});
test('a specialty is food.dish on an independently evidenced dining service',()=>{
 const {result}=project([c('OFFER','DINNER','Abendessen','b0'),c('OFFER','DINNER','Abendessen','b1',{propertyKey:'food.dish',valueJson:'"Rösti"'})],'Wir servieren Abendessen.\n\nZum Abendessen gibt es Rösti.');assert.equal(result.value.offers[0].properties[0].key,'food.dish');assert.equal(result.value.offers.length,1);
});
test('unproven, other-venue, dated and conditional claims cannot be critic-approved',()=>{
 for(const extra of [{belongsTo:'OTHER'},{belongsTo:'UNKNOWN'},{applicability:'DATED'},{applicability:'UNCERTAIN'},{applicability:'CONDITIONAL',condition:'nur im Sommer'}]){const {result,ledger}=project([c('AREA','TERRACE','Terrasse','b0',extra)],'Unsere Terrasse ist geöffnet.');assert.equal(result.status,'UNRESOLVED');assert.equal(ledger[0].state,'HELD');}
});
test('type identity never populates default facilities or offers',()=>{
 const f=['classification.place_types'].map(attributeKey=>({attributeKey,...researchValueContract(attributeKey)}));const {result}=project([c('SPOT','','','b0',{field:'classification.place_types',valueJson:'["RESTAURANT"]'})],'Wir sind ein Restaurant.',f);assert.deepEqual(result.value,['RESTAURANT']);assert.equal(result.status,'REQUIRES_REVIEW');
});
test('scope and type violations stay unresolved',()=>{
 for(const extra of [{propertyKey:'food.cuisine',valueJson:'"Schweizer Küche"'},{propertyKey:'amenity.step_free',valueJson:'"true"'},{propertyKey:'amenity.step_free',valueJson:'null'}]){const {result}=project([c('AREA','TERRACE','Terrasse','b0',extra)],'Die Terrasse bietet Schweizer Küche.');assert.equal(result.status,'UNRESOLVED');}
});
test('an orphan property cannot invent an area or offer',()=>{
 const {result}=project([c('AREA','TERRACE','Terrasse','b0',{propertyKey:'amenity.step_free',valueJson:'true'})],'Die Terrasse ist stufenlos.');assert.ok(!result.value||result.value.areas.length===0);
});
test('explicit negative is retained, unknown never becomes negative',()=>{
 const {result}=project([c('AREA','TERRACE','Terrasse','b0'),c('AREA','TERRACE','Terrasse','b1',{propertyKey:'amenity.step_free',valueJson:'false'})],'Die Terrasse ist geöffnet.\n\nDie Terrasse ist nicht stufenlos.');assert.equal(result.value.areas[0].properties[0].value,false);assert.ok(!result.value.properties.some(p=>p.value===false));
});
test('conflicting property evidence does not select one arbitrary value',()=>{
 const {result}=project([c('AREA','TERRACE','Terrasse','b0'),c('AREA','TERRACE','Terrasse','b0',{propertyKey:'amenity.step_free',valueJson:'true'}),c('AREA','TERRACE','Terrasse','b1',{propertyKey:'amenity.step_free',valueJson:'false'})],'Unsere Terrasse ist stufenlos.\n\nDie Terrasse ist nicht stufenlos.');assert.equal(result.value.areas[0].properties.length,0);assert.equal(result.citations.length,3);
});
test('a relationship needs both entities explicitly present in its own evidence',()=>{
 const {result,ledger}=project([c('AREA','TERRACE','Terrasse','b0'),c('OFFER','LUNCH','Mittagessen','b1'),c('OFFER','LUNCH','Mittagessen','b1',{propertyKey:'$area',valueJson:'"Terrasse"'})],'Unsere Terrasse ist geöffnet.\n\nWir servieren Mittagessen.');assert.equal(result.value.offers[0].areaIds.length,0);assert.equal(ledger[2].reason,'RELATIONSHIP_EVIDENCE_REQUIRED');
});
test('duplicate critic IDs reject the verdict batch atomically',()=>{
 const s=source('Unsere Terrasse ist geöffnet.');const ledger=parseScopedCandidates({candidates:[c('AREA','TERRACE','Terrasse','b0')]},s,fields,[{id:'b0',text:s.text}]);assert.throws(()=>applyScopedVerdicts({verdicts:[{id:'sc0',verdict:'SUPPORTED'},{id:'sc0',verdict:'UNSUPPORTED'}]},ledger));assert.equal(ledger[0].state,'HELD');
});
test('unsupported or ambiguous critic decisions never enter the profile',()=>{
 for(const verdict of ['UNSUPPORTED','AMBIGUOUS']){const s=source('Unsere Terrasse ist geöffnet.');const ledger=parseScopedCandidates({candidates:[c('AREA','TERRACE','Terrasse','b0')]},s,fields,[{id:'b0',text:s.text}]);applyScopedVerdicts({verdicts:[{id:'sc0',verdict}]},ledger);assert.equal(projectScopedResearch(spot,fields,ledger,[s],validateAuthoringSubmission)[0].status,'UNRESOLVED');}
});
test('changed source hashes cannot be projected',()=>{
 const {ledger,s}=project([c('AREA','TERRACE','Terrasse','b0')],'Unsere Terrasse ist geöffnet.');assert.equal(projectScopedResearch(spot,fields,ledger,[{...s,text:'Changed source.'}],validateAuthoringSubmission)[0].status,'UNRESOLVED');
});
test('wrong-weekday and invalid canonical values never become proposals',()=>{
 const f=['hours.kitchen'].map(attributeKey=>({attributeKey,...researchValueContract(attributeKey)}));const {result}=project([c('SPOT','','','b0',{field:'hours.kitchen',valueJson:'[{"day":"FUNDAY","intervals":[]}]'})],'Unsere Küche ist geöffnet.',f);assert.equal(result.status,'UNRESOLVED');
});
test('missing schedule days remain absent, not closed',()=>{
 const f=['hours.kitchen'].map(attributeKey=>({attributeKey,...researchValueContract(attributeKey)}));const {result}=project([c('SPOT','','','b0',{field:'hours.kitchen',valueJson:'[{"day":"MONDAY","intervals":[{"start":"11:00","end":"14:00"}]}]'})],'Küche: Montag 11:00–14:00.',f);assert.equal(result.value.length,1);assert.equal(result.partialHours,true);
});
test('the default plan covers identity, scoped experience, kitchen, rules and access',()=>{
 for(const key of ['classification.place_types','experience.profile','hours.kitchen','rule.reservation','accessibility.step_free_entrance'])assert.ok(DEFAULT_SPOT_RESEARCH_FIELDS.includes(key));
 const plan=createSpotResearchPlan(spot,fields);assert.equal(plan.priorities[0],'IDENTITY');assert.ok(plan.properties.some(p=>p.key==='food.dish'&&p.scopes.includes('OFFER')));assert.ok(plan.areas.some(a=>a.kind==='TERRACE'));assert.equal(plan.canonicalWrite,false);assert.ok(scopedCandidateSchema(fields,[{id:'b0'}]).properties.candidates);
});
test('end-to-end scoped model extraction creates areas without menu offer injection',async()=>{
 const r=await researchSpotV2({spot,fields,modelPath:'/tmp/8b2b98c00a6b4d291155e4890773ca8f769aee53',maxRequests:1,maxModelCalls:6},{validateValue:validateAuthoringSubmission,fetchPage:async url=>({url,contentType:'text/html',body:'<main><h1>Test Restaurant</h1><p>Unsere Terrasse ist stufenlos zugänglich.</p><p>Rindsfilet kostet CHF 30.</p></main>',observedAt:'2026-10-21T12:00:00Z'}),modelFetch:async(_url,init)=>{
  const req=JSON.parse(init.body);const data=JSON.parse(req.messages[1].content);let value;
  if(data.phase==='PROPERTIES'){const block=data.blocks.find(b=>b.text.includes('Terrasse'));value={facts:[{entity:data.nodes[0].id,key:'amenity.step_free',value:true,blockId:block.id,condition:''}]};}
  else if(data.plan){const block=data.blocks.find(b=>b.text.includes('Terrasse'));value={candidates:data.scope==='AREA'?[c('AREA','TERRACE','Terrasse',block.id)]:[]};}
  else if(data.candidates)value={verdicts:data.candidates.map(c=>({id:c.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',c.quote)}))};else throw new Error('UNEXPECTED_MODEL_STAGE');
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
 }});
 assert.equal(r.results[0].value.areas[0].properties[0].value,true);assert.equal(r.results[0].value.offers.length,0);assert.equal(r.spotCoverage.physicalAreas,1);assert.equal(r.canonicalWrite,false);assert.equal(r.importable,false);assert.equal(r.modelAudit.length,4);
});

test('a meal price must retain its explicit amount and unit, not an invented menu range',()=>{
 const price={label:'Mittagessen',currency:'CHF',min:20,max:null,basis:'PER_PERSON',minimumAge:null,maximumAge:null,mandatoryFeesIncluded:null,includes:'Mittagessen',conditions:{weekdays:[],dayparts:[],event:null,validFrom:null,validUntil:null}};
 const text='Unser Mittagessen kostet CHF 20 pro Person.';
 const rows=[c('OFFER','LUNCH','Mittagessen','b0'),c('OFFER','LUNCH','Mittagessen','b0',{propertyKey:'$price',valueJson:JSON.stringify(price)})];
 const valid=project(rows,text);assert.equal(valid.result.value.offers[0].prices[0].min,20);assert.equal(valid.result.value.offers[0].prices[0].mandatoryFeesIncluded,null);
 rows[1].valueJson=JSON.stringify({...price,min:25});const bad=project(rows,text);assert.equal(bad.result.value.offers[0].prices.length,0);assert.equal(bad.ledger[1].reason,'PRICE_AMOUNT_NOT_LITERAL');
});
test('an offer schedule cannot silently change the evidenced weekday',()=>{
 const text='Mittagessen Montag 11:30–13:30';
 const rows=[c('OFFER','LUNCH','Mittagessen','b0'),c('OFFER','LUNCH','Mittagessen','b0',{propertyKey:'$schedule',valueJson:'[{"weekday":1,"start":"11:30","end":"13:30"}]'})];
 assert.equal(project(rows,text).result.value.offers[0].schedule[0].weekday,1);
 rows[1].valueJson='[{"weekday":3,"start":"11:30","end":"13:30"}]';const bad=project(rows,text);assert.equal(bad.result.value.offers[0].schedule.length,0);assert.equal(bad.ledger[1].reason,'OFFER_WEEKDAY_NOT_LITERAL');
});
test('the source planner keeps physical-area and access pages ahead of menus',async()=>{
 const {rankSpotProfileFrontier}=await import('../dist/nuknuk-spot-plan.js');
 const links=[{url:'https://example.org/menu',depth:1,topics:['menu']},{url:'https://example.org/terrasse',depth:1,topics:['areas','experience']},{url:'https://example.org/access',depth:1,topics:['access']}];
 assert.deepEqual(rankSpotProfileFrontier(links,fields,[]).map(l=>l.url),['https://example.org/terrasse','https://example.org/access','https://example.org/menu']);
});
test('profile discovery reads observed room and group pages but never transactional or shop paths',async()=>{
 const {discoverResearchLinks}=await import('../src/nuknuk-sources.mjs');
 const page={url:'https://example.org/',contentType:'text/html',body:'<a href="/room-hire">Räume mieten</a><a href="/angebote/fuehrungen">Führungen</a><a href="/shop/angebote">Shop</a><a href="/booking/room-hire">Booking</a>'};
 assert.deepEqual(discoverResearchLinks(page,{spotProfile:true}).map(l=>l.url),['https://example.org/room-hire','https://example.org/angebote/fuehrungen']);
});
test('generator compatibility never mutates canonical uniqueness constraints',async()=>{
 const {localGenerationSchema}=await import('../dist/nuknuk-spot-plan.js');
 const schema={type:'object',properties:{weekdays:{type:'array',uniqueItems:true,items:{type:'integer'}}}};const copy=structuredClone(schema);const generated=localGenerationSchema(schema);
 assert.deepEqual(schema,copy);assert.equal(generated.properties.weekdays.uniqueItems,undefined);assert.equal(schema.properties.weekdays.uniqueItems,true);
});

test('a venue type prioritizes but never forbids a cross-category on-site service',()=>{
 const plan=createSpotResearchPlan({...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'SPORT_MOVEMENT'}}},fields);
 assert.ok(plan.offers.some(o=>o.kind==='SAUNA'));assert.ok(plan.offers.some(o=>o.kind==='CAFE'));assert.ok(plan.areas.some(a=>a.kind==='SAUNA_AREA'));
});
test('existing scoped profile is researched as a partial supplement, never silently replaced',async()=>{
 const original={contractVersion:'backyrd.world-knowledge.experience-profile@1.0',category:'EAT',properties:[],areas:[],offers:[],reviewed:true};
 const target={...spot,existingValues:{...spot.existingValues,'experience.profile':{knowledgeState:'KNOWN_VALUE',value:original}}};
 const r=await researchSpotV2({spot:target,fields,skipKnownFields:true,modelPath:'/tmp/8b2b98c00a6b4d291155e4890773ca8f769aee53',maxRequests:1,maxModelCalls:6},{validateValue:validateAuthoringSubmission,fetchPage:async url=>({url,contentType:'text/html',body:'<main><p>Unsere Terrasse ist geöffnet.</p></main>',observedAt:'2026-10-21T12:00:00Z'}),modelFetch:async(_url,init)=>{
  const data=JSON.parse(JSON.parse(init.body).messages[1].content);const value=data.phase==='ENTITIES'?{candidates:data.scope==='AREA'?[c('AREA','TERRACE','Terrasse',data.blocks[0].id)]:[]}:data.phase==='PROPERTIES'?{facts:[]}:{verdicts:data.candidates.map(c=>({id:c.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',c.quote)}))};
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
 }});assert.equal(r.results[0].status,'REQUIRES_REVIEW');assert.equal(r.results[0].partialProfile,true);assert.deepEqual(r.results[0].currentValue,original);assert.equal(original.areas.length,0);assert.equal(r.canonicalWrite,false);
});

test('canonical service labels can summarize explicit offerings without copying menu products',()=>{
 const {result}=project([c('OFFER','DRINKS','Getränke','b0'),c('OFFER','CAFE','Café / Bistro','b0')],'Bei uns gibt es Kaffee, Tee und Schokolade.');assert.equal(result.status,'REQUIRES_REVIEW');assert.deepEqual(result.value.offers.map(o=>o.name),['Getränke','Café / Bistro']);
});
test('a canonical lunch label still cannot be inferred from venue hours or a dish price',()=>{
 for(const text of ['Unser Restaurant öffnet von 10 bis 23 Uhr.','Rindsfilet mit Pommes CHF 30.'])assert.equal(project([c('OFFER','LUNCH','Mittagessen','b0')],text).result.status,'UNRESOLVED');
});

test('a sibling room heading cannot inherit an earlier terrace property scope',()=>{
 const text='Terrasse\n\nUnsere Terrasse bietet Sitzplätze.\n\nGastraum\n\nDer Zugang ist stufenlos.';
 const s={...source(text),headings:[{level:2,text:'Terrasse',offset:0},{level:2,text:'Gastraum',offset:text.indexOf('Gastraum')}]};
 const block={id:'b0',text:'Der Zugang ist stufenlos.',offset:text.indexOf('Der Zugang')};
 const ledger=parseScopedCandidates({candidates:[c('AREA','TERRACE','Terrasse','b0',{propertyKey:'amenity.step_free',valueJson:'true'})]},s,fields,[block]);
 assert.equal(ledger[0].reason,'PROPERTY_ENTITY_CONTEXT_REQUIRED');assert.equal(ledger[0].sourceOffset,block.offset);
});

test('the human review shows areas and properties even without any dining offers',async()=>{
 const {profileReviewHtml}=await import('../../../scripts/world-knowledge/nuknuk-research.mjs');
 const {result}=project([c('AREA','TERRACE','Terrasse','b0'),c('AREA','TERRACE','Terrasse','b0',{propertyKey:'amenity.step_free',valueJson:'true'})],'Unsere Terrasse ist stufenlos.');
 const html=profileReviewHtml(result.value);assert.match(html,/Räume und Bereiche \(1\)/);assert.match(html,/Terrasse/);assert.match(html,/Stufenlos zugänglich/);assert.match(html,/>Ja</);assert.match(html,/Besuchsangebote noch nicht ausreichend belegt/);
});

test('Backyrd method dimensions bind to existing fields and scoped catalog properties',async()=>{
 const {BACKYRD_RESEARCH_METHOD}=await import('../dist/nuknuk-spot-plan.js');
 const {ATTRIBUTE_DEFINITIONS}=await import('../../world-knowledge-core/dist/registry.js');
 const {EXPERIENCE_QUESTIONS}=await import('../../world-knowledge-core/dist/experience-profile.js');
 assert.equal(BACKYRD_RESEARCH_METHOD.version,'backyrd.research-method@1.5');
 assert.equal(BACKYRD_RESEARCH_METHOD.dimensions.length,9);
 assert.equal(new Set(BACKYRD_RESEARCH_METHOD.dimensions.map(d=>d.id)).size,9);
 for(const d of BACKYRD_RESEARCH_METHOD.dimensions){
  for(const key of d.worldFields)assert.ok(ATTRIBUTE_DEFINITIONS.some(f=>f.key===key),key);
  for(const key of d.propertyKeys)assert.ok(EXPERIENCE_QUESTIONS.some(q=>q.key===key),key);
 }
 assert.deepEqual(createSpotResearchPlan(spot,fields).method,BACKYRD_RESEARCH_METHOD);
});
test('Backyrd method is passed to every scoped local-model task and report without claiming completion',async()=>{
 const {BACKYRD_RESEARCH_METHOD}=await import('../dist/nuknuk-spot-plan.js');
 const text='Test Restaurant\n\nWir servieren Mittagessen.\n\nUnsere Terrasse ist geöffnet.';
 const s=source(text);const seen=[];
 const report=await researchSpotV2({spot,fields,modelPath:'/tmp/8b2b98c00a6b4d291155e4890773ca8f769aee53',sources:[s.url],maxRequests:1,maxModelCalls:8,discoverLinks:false},{
  fetchPage:async()=>({url:s.url,status:200,contentType:'text/html',body:text}),readPage:async()=>s,validateValue:validateAuthoringSubmission,
  modelFetch:async(_url,init)=>{
   const request=JSON.parse(init.body);const payload=JSON.parse(request.messages[1].content);
   assert.ok(request.messages[0].content.includes(BACKYRD_RESEARCH_METHOD.instructions));
   let value;
   if(payload.phase==='ENTITIES'){
    seen.push('EXTRACT_SPOT_'+(payload.scope==='AREA'?'AREAS':'OFFERS'));
    value={candidates:payload.scope==='AREA'?[]:[c('OFFER','LUNCH','Mittagessen',payload.blocks.find(b=>b.text.includes('Mittagessen')).id)]};
   }else if(payload.phase==='PROPERTIES'){seen.push('EXTRACT_SPOT_PROPERTIES');value={facts:[]};}
   else if(payload.candidates){seen.push('VERIFY_SPOT');value={verdicts:payload.candidates.map(c=>({id:c.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',c.quote)}))};}
   else throw new Error('UNEXPECTED_MODEL_STAGE');
   return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
  }
 });
 assert.ok(seen.includes('EXTRACT_SPOT_AREAS'));assert.ok(seen.includes('EXTRACT_SPOT_OFFERS'));assert.ok(seen.includes('EXTRACT_SPOT_PROPERTIES'));assert.ok(seen.includes('VERIFY_SPOT'));
 assert.equal(report.researchPlan.methodVersion,BACKYRD_RESEARCH_METHOD.version);
 assert.equal(report.researchPlan.revision,createSpotResearchPlan(spot,fields).revision);
 assert.equal(report.researchPlan.methodDimensions.length,9);
 assert.ok(report.researchPlan.methodDimensions.every(d=>d.assessment==='NOT_ASSESSED'));
 assert.equal(report.spotCoverage.complete,false);assert.equal(report.canonicalWrite,false);
});


test('heading-only property cannot be approved from a ventilation/heating body',()=>{
 const text='Klimaanlage\nUnser Betrieb verfügt über eine Lüftung und eine Heizung.';
 const {result,ledger}=project([c('SPOT','','','b0',{propertyKey:'offer.feature',valueJson:'"Klimaanlage"'})],text);
 assert.equal(ledger[0].reason,'PROPERTY_ONLY_IN_HEADING_REQUIRES_REVIEW');
 assert.equal(ledger[0].state,'HELD');assert.equal(result.status,'UNRESOLVED');
});
test('explicit body features survive while an unsupported heading feature remains held',()=>{
 const text='Klimaanlage\nUnser Betrieb verfügt über eine Lüftung und eine Heizung.';
 for(const value of ['Lüftung','Heizung']){
  const {result}=project([c('SPOT','','','b0',{propertyKey:'offer.feature',valueJson:JSON.stringify(value)})],text);
  assert.equal(result.value.properties[0].value,value);
 }
 const cooling=project([c('SPOT','','','b0',{propertyKey:'offer.feature',valueJson:'"Klimaanlage"'})],'Klimaanlage\nUnser Betrieb verfügt über eine Klimaanlage zur aktiven Kühlung.');
 assert.equal(cooling.result.value.properties[0].value,'Klimaanlage');
});
test('structured headings cannot alone establish a TEXT property; ordinary lists remain usable',()=>{
 const text='Ausstattung\nKlimaanlage\nUnser Betrieb bietet eine Heizung.';const s={...source(text),headings:[{level:2,text:'Klimaanlage',offset:text.indexOf('Klimaanlage')}]};
 const ledger=parseScopedCandidates({candidates:[c('SPOT','','','b0',{propertyKey:'offer.feature',valueJson:'"Klimaanlage"'})]},s,fields,[{id:'b0',text}]);
 applyScopedVerdicts({verdicts:[{id:ledger[0].id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',ledger[0].quote)}]},ledger);
 assert.equal(ledger[0].reason,'PROPERTY_ONLY_IN_HEADING_REQUIRES_REVIEW');
 assert.equal(projectScopedResearch(spot,fields,ledger,[s],validateAuthoringSubmission)[0].status,'UNRESOLVED');
 const list=project([c('SPOT','','','b0',{propertyKey:'offer.feature',valueJson:'"WLAN"'})],'Ausstattung: WLAN, Garderobe, Schliessfächer.');
 assert.equal(list.result.value.properties[0].value,'WLAN');
});
test('an unsupported unknown candidate never erases the supported same-scope property',()=>{
 const text='Wir servieren Abendessen mit veganen Optionen.';
 const {result,ledger}=project([c('OFFER','DINNER','Abendessen','b0'),c('OFFER','DINNER','Abendessen','b0',{propertyKey:'food.diet',valueJson:'"veganen Optionen"'}),c('OFFER','DINNER','Abendessen','b0',{propertyKey:'food.diet',valueJson:'null',applicability:'UNCERTAIN'})],text);
 assert.equal(ledger[2].state,'HELD');assert.equal(result.value.offers[0].properties[0].value,'veganen Optionen');
});
test('regular venue statement in a group brochure does not become an invented offer restriction',()=>{
 const f=['hours.regular'].map(attributeKey=>({attributeKey,...researchValueContract(attributeKey)}));
 const value=[{day:'MONDAY',intervals:[{start:'17:00',end:'23:00'}]}];
 const s={...source('Unsere regulären Öffnungszeiten: Montag 17:00–23:00.'),url:'https://example.org/banquet-brochure.pdf',format:'PDF'};
 const ledger=parseScopedCandidates({candidates:[c('SPOT','','','b0',{field:'hours.regular',valueJson:JSON.stringify(value)})]},s,f,[{id:'b0',text:s.text}]);
 applyScopedVerdicts({verdicts:[{id:ledger[0].id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',ledger[0].quote)}]},ledger);
 assert.deepEqual(projectScopedResearch(spot,f,ledger,[s],validateAuthoringSubmission)[0].value,value);
 const restricted=parseScopedCandidates({candidates:[c('SPOT','','','b0',{field:'hours.regular',valueJson:JSON.stringify(value),condition:'nur geschlossene Gesellschaft',applicability:'CONDITIONAL'})]},s,f,[{id:'b0',text:s.text}]);
 applyScopedVerdicts({verdicts:[{id:restricted[0].id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',restricted[0].quote)}]},restricted);
 assert.equal(projectScopedResearch(spot,f,restricted,[s],validateAuthoringSubmission)[0].status,'UNRESOLVED');
});


test('native flat values preserve strings and arrays without JSON-in-JSON guessing',()=>{
 const fs=['identity.name','classification.place_types'].map(attributeKey=>({attributeKey,...researchValueContract(attributeKey)}));
 const src=source('Test Restaurant ist ein Restaurant.');
 const raw={facts:[{field:'identity.name',value:'Test Restaurant',blockId:'b0',belongsTo:'TARGET',condition:''},{field:'classification.place_types',value:['RESTAURANT'],blockId:'b0',belongsTo:'TARGET',condition:''}]};
 const ledger=parseFlatFieldFacts(raw,src,fs,[{id:'b0',text:src.text}],0);
 assert.equal(ledger[0].valueJson,'"Test Restaurant"');assert.equal(ledger[1].valueJson,'["RESTAURANT"]');
 assert.ok(ledger.every(c=>c.state==='HELD')); // output alone never authorizes a fact
 applyScopedVerdicts({verdicts:ledger.map(c=>({id:c.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',c.quote)}))},ledger);
 assert.deepEqual(projectScopedResearch(spot,fs,ledger,[src],validateAuthoringSubmission).map(r=>r.value),['Test Restaurant',['RESTAURANT']]);
 assert.equal(flatFieldSchema(fs,[{id:'b0'}]).properties.facts.items.anyOf[0].properties.value.type,'string');
});
test('native flat schema cannot bypass source, ownership, null or canonical validation',()=>{
 const fs=[{attributeKey:'identity.name',...researchValueContract('identity.name')}],src=source('Other Hostel');
 const row={field:'identity.name',value:'Other Hostel',blockId:'b0',belongsTo:'TARGET',condition:''};
 for(const change of [{value:null},{field:'experience.profile'},{blockId:'invented'},{extra:true}]) assert.throws(()=>parseFlatFieldFacts({facts:[{...row,...change}]},src,fs,[{id:'b0',text:src.text}],0));
 for(const change of [{belongsTo:'OTHER'},{value:7},{value:'Invented Hostel'}]){
 const ledger=parseFlatFieldFacts({facts:[{...row,...change}]},src,fs,[{id:'b0',text:src.text}],0);
 applyScopedVerdicts({verdicts:[{id:ledger[0].id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',ledger[0].quote)}]},ledger);
 assert.equal(projectScopedResearch(spot,fs,ledger,[src],validateAuthoringSubmission)[0].status,'UNRESOLVED');
 }
});
test('flat plans omit irrelevant profile catalogs and declared category stays research context',()=>{
 const fs=[{attributeKey:'identity.name',...researchValueContract('identity.name')}];
 const plan=createSpotResearchPlan(spot,fs);assert.deepEqual(plan.offers,[]);assert.deepEqual(plan.areas,[]);assert.deepEqual(plan.properties,[]);
 const target={...spot,existingValues:{}};
 const stayPlan=createSpotResearchPlan(target,[{...fields[0],profileCategory:'STAY'}]);
 assert.equal(stayPlan.target.category,'STAY');assert.deepEqual(stayPlan.target.existingValues,{});
});
test('practical guest information and accommodation overview precede individual room pages',()=>{
 const fs=[{...fields[0],profileCategory:'STAY'}];
 const ranked=rankSpotProfileFrontier([
 {url:'https://example.org/de/hostel/doppelzimmer/',depth:1,topics:['stay','experience']},
 {url:'https://example.org/de/gaeste-infos/',depth:1,topics:['visit','hours','access','stay']},
 {url:'https://example.org/de/hostel/',depth:1,topics:['experience','areas','stay']}
 ],fs,[]);
 assert.ok(ranked.findIndex(x=>x.url.endsWith('/gaeste-infos/'))<ranked.findIndex(x=>x.url.endsWith('/doppelzimmer/')));
 assert.ok(ranked.findIndex(x=>x.url.endsWith('/hostel/'))<ranked.findIndex(x=>x.url.endsWith('/doppelzimmer/')));
});
test('literal accommodation and room evidence supports canonical labels without type-only invention',()=>{
 for(const [row,text] of [[c('OFFER','OVERNIGHT_STAY','Übernachtung','b0'),'Bucht unsere privaten Doppelzimmer und Mixed Dorms.'],[c('AREA','ROOM','Gästezimmer','b0'),'Unsere Doppelzimmer haben ein eigenes Badezimmer.'],[c('AREA','LOUNGE','Lounge','b0'),'Der Living Room lädt zum Verweilen ein.']]){
 const result=project([row],text,[{...fields[0],profileCategory:'STAY'}]).result;
 assert.equal(result.status,'REQUIRES_REVIEW');
 }
 const {result}=project([c('OFFER','OVERNIGHT_STAY','Übernachtung','b0')],'Wir sind ein Hostel.',[{...fields[0],profileCategory:'STAY'}]);assert.equal(result.status,'UNRESOLVED');
});

test('later guest pages can enrich an established offer without inventing it again',async()=>{
 let enriched=false;
 const result=await researchSpotV2({spot,fields,maxRequests:2,maxModelCalls:12,modelPath:'/tmp/8b2b98c00a6b4d291155e4890773ca8f769aee53'},{validateValue:validateAuthoringSubmission,
 fetchPage:async url=>({url,contentType:'text/html',observedAt:'2026-10-22T10:00:00Z',body:url.endsWith('/gaeste-infos/')?'<main><h1>Gäste-Infos</h1><p>Zum Frühstück gibt es vegane Optionen.</p></main>':'<main><h1>Test Restaurant</h1><p>Wir servieren Frühstück.</p><a href="/gaeste-infos/">Gäste-Infos</a></main>'}),
 modelFetch:async(_url,init)=>{
 const data=JSON.parse(JSON.parse(init.body).messages[1].content);let value;
 if(data.phase==='ENTITIES')value={candidates:data.scope==='OFFER'&&data.blocks.some(b=>b.text==='Wir servieren Frühstück.')?[c('OFFER','BREAKFAST','Frühstück',data.blocks.find(b=>b.text==='Wir servieren Frühstück.').id)]:[]};
 else if(data.phase==='PROPERTIES'){
 const block=data.blocks.find(b=>b.text.includes('vegane Optionen'));const node=data.nodes.find(n=>n.kind==='BREAKFAST');
 enriched=Boolean(block&&node)||enriched;
 value={facts:block&&node?[{entity:node.id,key:'food.diet',value:'vegane Optionen',blockId:block.id,condition:''}]:[]};
 }else if(data.candidates)value={verdicts:data.candidates.map(c=>({id:c.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',c.quote)}))};else throw Error('UNEXPECTED_STAGE');
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
 }});
 assert.equal(enriched,true);assert.equal(result.requests,2);
 assert.ok(result.results[0].value.offers.find(o=>o.kind==='BREAKFAST').properties.some(p=>p.key==='food.diet'&&p.value==='vegane Optionen'));
});

test('flat identity extraction sees short footer addresses and does not repeat resolved fields',async()=>{
 let flatCalls=0;
 const fs=[...fields,{attributeKey:'location.address_line1',...researchValueContract('location.address_line1')}];
 const r=await researchSpotV2({spot,fields:fs,maxRequests:2,maxModelCalls:14,modelPath:'/tmp/8b2b98c00a6b4d291155e4890773ca8f769aee53'},{validateValue:validateAuthoringSubmission,
 fetchPage:async url=>({url,contentType:'text/html',observedAt:'2026-10-22T10:00:00Z',body:url.endsWith('/gaeste-infos/')?'<main><h1>Test Restaurant Gäste-Infos</h1><p>Frühstück ist täglich verfügbar.</p></main>':'<div id="content"><h1>Test Restaurant</h1><p>Wir servieren Frühstück.</p><a href="/gaeste-infos/">Gäste-Infos</a></div><footer><div class="contact-data"><div>Test Restaurant<br>Signalstrasse 37<br>4058 Basel</div><a href="mailto:info@example.org">info@example.org</a></div></footer>'}),
 modelFetch:async(_url,init)=>{
 const data=JSON.parse(JSON.parse(init.body).messages[1].content);let value;
 if(data.fields){flatCalls++;const block=data.blocks.find(b=>b.text==='Signalstrasse 37');assert.ok(block);value={facts:[{field:'location.address_line1',value:'Signalstrasse 37',blockId:block.id,belongsTo:'TARGET',condition:''}]};}
 else if(data.phase==='ENTITIES')value={candidates:[]};
 else if(data.phase==='PROPERTIES')value={facts:[]};
 else if(data.candidates)value={verdicts:data.candidates.map(c=>({id:c.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',c.quote)}))};else throw Error('UNEXPECTED_STAGE');
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
 }});
 assert.equal(flatCalls,1);assert.equal(r.requests,2);assert.equal(r.results.find(f=>f.attributeKey==='location.address_line1').value,'Signalstrasse 37');
 // Footer contacts never become structural profile entities.
 assert.equal(r.scopedLedger.some(c=>c.field==='experience.profile'),false);
});
test('national phone is retained for review when country is missing, never guessed',()=>{
 const src=source('Test Restaurant\nTelefon: 061 555 06 06'),fs=[{attributeKey:'contact.phone',...researchValueContract('contact.phone')}];
 const raw=literalSourceFacts(src,fs,spot,0);assert.equal(raw.length,1);
 const facts=recheckEvidenceFloors(raw.map(f=>({...f,state:'ACCEPTED'})),[src],fs,spot);assert.equal(facts[0].reason,'PHONE_COUNTRY_REQUIRED');
 const r=projectEvidenceLedger({spot,fields:fs,facts,sources:[src],validateValue:validateAuthoringSubmission})[0];
 assert.equal(r.status,'UNRESOLVED');assert.equal(r.reason,'PHONE_COUNTRY_REQUIRED');assert.equal(r.value,undefined);assert.equal(r.reviewEvidence[0].evidence,'061 555 06 06');
 assert.equal(recheckEvidenceFloors(raw.map(f=>({...f,state:'ACCEPTED'})),[src],fs,{...spot,existingValues:{...spot.existingValues,'location.country_code':{value:'CH'}}})[0].state,'ACCEPTED');
});

test('a bicycle or car Stellplatz never becomes a camping area through critic agreement',()=>{
 for(const quote of ['Unser Velo hat im Treppenhaus einen sicheren Stellplatz.','Für Autos gibt es einen Stellplatz beim Haus.']){
 const {ledger,result}=project([c('AREA','CAMPSITE','Stellplatz','b0')],quote);
 assert.equal(result.status,'UNRESOLVED');assert.equal(ledger[0].reason,'CAMPING_CONTEXT_REQUIRED');
 }
 assert.equal(project([c('AREA','CAMPSITE','Stellplatz','b0')],'Der Stellplatz auf unserem Campingplatz ist für Wohnmobile verfügbar.').result.status,'REQUIRES_REVIEW');
});
test('property generation schema binds node kind, control type and metadata scope',()=>{
 const nodes=[{id:'breakfast',scope:'OFFER',entityKind:'BREAKFAST'},{id:'tour',scope:'OFFER',entityKind:'GUIDED_TOUR'},{id:'room',scope:'AREA',entityKind:'ROOM'}];
 const variants=scopedPropertySchema(nodes,[{id:'b0'}]).properties.facts.items.anyOf;
 const forKey=(node,key)=>variants.filter(v=>v.properties.entity.const===node&&v.properties.key.enum.includes(key));
 assert.equal(forKey('breakfast','time.duration').length,0);
 assert.equal(forKey('breakfast','$schedule')[0].properties.value.type,'array');
 assert.equal(forKey('tour','time.duration')[0].properties.value.type,'integer');
 assert.equal(forKey('room','amenity.step_free')[0].properties.value.type,'boolean');
 assert.equal(forKey('room','$schedule').length,0);assert.equal(forKey('SPOT','stay.check_in').length,0);
});
test('native empty hours are missing evidence, never a known empty or closed schedule',()=>{
 const fs=[{attributeKey:'hours.kitchen',...researchValueContract('hours.kitchen')}];
 const {ledger,result}=project([c('SPOT','','','b0',{field:'hours.kitchen',valueJson:'[]'})],'Frühstück gibt es am Morgen.',fs);
 assert.equal(result.status,'UNRESOLVED');assert.equal(ledger[0].reason,'EMPTY_VALUE_NOT_EVIDENCE');
});
test('source-bound weekly offer times normalize leading zeros without inventing weekdays',()=>{
 const schedule=[1,2,3,4,5].map(weekday=>({weekday,start:'07:00',end:'10:00'}));
 const text='Frühstück: Montag–Freitag 7:00–10:00 Uhr.';
 const rows=[c('OFFER','BREAKFAST','Frühstück','b0'),c('OFFER','BREAKFAST','Frühstück','b0',{propertyKey:'$schedule',valueJson:JSON.stringify(schedule)})];
 const {result}=project(rows,text);assert.deepEqual(result.value.offers[0].schedule,schedule);
 const bad=project([rows[0],{...rows[1],valueJson:JSON.stringify([{weekday:7,start:'07:00',end:'10:00'}])}],text);
 assert.equal(bad.ledger[1].reason,'OFFER_WEEKDAY_NOT_LITERAL');
});

test('literal service schedules use their own heading and await independent review',()=>{
 const text='Frühstück\nMontag–Freitag: 7:00–10:00 Uhr\nRezeption\nMontag: 6:00–22:00 Uhr';
 const src={...source(text),headings:[{level:2,text:'Frühstück',offset:0},{level:2,text:'Rezeption',offset:text.indexOf('Rezeption')}]};
 const node={...c('OFFER','BREAKFAST','Frühstück','b0'),id:'known',state:'ACCEPTED',reason:'CRITIC_SUPPORTED'};
 const blocks=text.split('\n').map((text,i)=>({id:'b'+i,text,offset:src.text.indexOf(text)}));
 const ledger=literalOfferSchedules([node],src,fields,blocks,1);
 assert.equal(ledger.length,1);assert.equal(ledger[0].state,'HELD');assert.equal(ledger[0].quote,'Montag–Freitag: 7:00–10:00 Uhr');
 assert.deepEqual(JSON.parse(ledger[0].valueJson).map(row=>row.weekday),[1,2,3,4,5]);
 applyScopedVerdicts({verdicts:[{id:ledger[0].id,verdict:'UNSUPPORTED',...fixtureJustification('UNSUPPORTED',ledger[0].quote)}]},ledger);assert.equal(ledger[0].state,'REJECTED');
 for(const row of ['Frühstück Montag 7:00–10:00 Uhr nur für Gruppen.','Frühstück Montag 7:00–10:00 Uhr an Feiertagen.','Kein Frühstück Montag 7:00–10:00 Uhr.']){
 const s=source(row);assert.equal(literalOfferSchedules([node],s,fields,[{id:'b0',text:row,offset:0}],0).length,0);
 }
});
test('explicit additive weekly rows merge, genuine overlaps remain conflicts',()=>{
 const row=(weekday,start,end)=>({weekday,start,end});
 for(const [second,expected] of [[row(6,'08:00','11:00'),2],[row(1,'14:00','18:00'),2],[row(1,'08:00','11:00'),0]]){
 const day=second.weekday===6?'Samstag':'Montag';
 const text=`Frühstück Montag 7:00–10:00 Uhr.\n\nFrühstück ${day} ${second.start}–${second.end} Uhr.`;
 const {result,ledger}=project([c('OFFER','BREAKFAST','Frühstück','b0'),c('OFFER','BREAKFAST','Frühstück','b0',{propertyKey:'$schedule',valueJson:JSON.stringify([row(1,'07:00','10:00')])}),c('OFFER','BREAKFAST','Frühstück','b1',{propertyKey:'$schedule',valueJson:JSON.stringify([second])})],text);
 assert.equal(result.value.offers[0].schedule.length,expected);
 assert.equal(scopedCoverage([result],ledger).conflictingProperties.length>0,expected===0);
 }
});
test('observed practical translations stay reachable after genuinely new pages',()=>{
 const current={...source('Gäste Infos'),url:'https://example.org/de/gaeste-infos/'};
 const fs=[{...fields[0],profileCategory:'STAY'},{attributeKey:'hours.regular',...researchValueContract('hours.regular')}];
 const translated={url:'https://example.org/en/guest-info/',depth:2,topics:['stay','visit','hours','access']};
 const fresh={url:'https://example.org/de/hostel/',depth:1,topics:['experience','areas','stay']};
 const ranked=rankSpotProfileFrontier([translated,fresh],fs,[current]);assert.equal(ranked[0].url,fresh.url);assert.ok(ranked.some(r=>r.url===translated.url));
});
test('structured property grammar chooses entity, key and value before conditions',()=>{
 const variants=scopedPropertySchema([{id:'breakfast',scope:'OFFER',entityKind:'BREAKFAST'}],[{id:'b0'}]).properties.facts.items.anyOf;
 assert.ok(variants.every(v=>Object.keys(v.properties).join(',')==='entity,key,value,blockId,condition'));
});

test('weekly schedule equivalence ignores JSON key order and catches Sunday-to-Monday overlap',()=>{
 const equivalent=project([c('OFFER','BREAKFAST','Frühstück','b0'),c('OFFER','BREAKFAST','Frühstück','b0',{propertyKey:'$schedule',valueJson:'[{"weekday":1,"start":"07:00","end":"10:00"}]'}),c('OFFER','BREAKFAST','Frühstück','b0',{propertyKey:'$schedule',valueJson:'[{"end":"10:00","start":"07:00","weekday":1}]'})],'Frühstück Montag 7:00–10:00 Uhr.');
 assert.equal(equivalent.result.value.offers[0].schedule.length,1);
 const conflict=project([c('OFFER','DRINKS','Getränke','b0'),c('OFFER','DRINKS','Getränke','b0',{propertyKey:'$schedule',valueJson:'[{"weekday":7,"start":"23:00","end":"01:00"}]'}),c('OFFER','DRINKS','Getränke','b1',{propertyKey:'$schedule',valueJson:'[{"weekday":1,"start":"00:30","end":"02:00"}]'})],'Getränke Sonntag 23:00–01:00 Uhr.\n\nGetränke Montag 00:30–02:00 Uhr.');
 assert.equal(conflict.result.value.offers[0].schedule.length,0);
});

test('breakfast or guest-kitchen times cannot be approved as venue kitchen hours',()=>{
 const fs=[{attributeKey:'hours.kitchen',...researchValueContract('hours.kitchen')}];
 const values='[{"day":"MONDAY","intervals":[{"start":"07:00","end":"10:00"}]}]';
 for(const quote of ['Frühstück Montag 07:00–10:00 Uhr.','Guest kitchen Monday 07:00–10:00.']){
 const {result,ledger}=project([c('SPOT','','','b0',{field:'hours.kitchen',valueJson:values})],quote,fs);
 assert.equal(result.status,'UNRESOLVED');assert.equal(ledger[0].reason,'KITCHEN_TIME_SCOPE_REQUIRED');
 }
 assert.equal(project([c('SPOT','','','b0',{field:'hours.kitchen',valueJson:values})],'Unsere Küche ist Montag 07:00–10:00 Uhr geöffnet.',fs).result.status,'REQUIRES_REVIEW');
});
test('observed English meeting translation is deferred behind an unread living-room page',()=>{
 const s={...source('Meetingraum'),url:'https://example.org/de/meeting/'};
 const translation={url:'https://example.org/en/meetings/',depth:2,topics:['stay','experience','areas','contact']};
 const fresh={url:'https://example.org/de/living-room/',depth:1,topics:['stay','experience']};
 const ranked=rankSpotProfileFrontier([translation,fresh],fields,[s]);assert.equal(ranked[0].url,fresh.url);assert.ok(ranked.some(r=>r.url===translation.url));
});


test('a synthetic contact heading never hides main offers when the CMS omits its H1',async()=>{
 for(const title of ['', '<h2>Unser Angebot</h2>', '<h1>Test Restaurant</h1>']){
 const seen=[];
 const r=await researchSpotV2({spot,fields,modelPath:'/tmp/8b2b98c00a6b4d291155e4890773ca8f769aee53',maxRequests:1,maxModelCalls:6},{validateValue:validateAuthoringSubmission,
 fetchPage:async url=>({url,contentType:'text/html',observedAt:'2026-10-22T12:00:00Z',body:'<header><h1>Test Restaurant</h1></header><main>'+title+'<p>Wir servieren Frühstück jeden Morgen.</p><h2>Terrasse</h2><p>Unsere Terrasse liegt direkt am Fluss.</p></main><footer><div class="contact-data"><div>Test Restaurant<br>Beispielgasse 7<br>4058 Basel</div><p>Workshop Footer: Hier stehen nur fremde Navigationstexte.</p><a href="mailto:info@example.org">info@example.org</a></div></footer>'}),
 modelFetch:async(_url,init)=>{
 const d=JSON.parse(JSON.parse(init.body).messages[1].content);let value;
 if(d.phase==='ENTITIES'){
 seen.push(d.scope);assert.ok(d.blocks.every(b=>!b.text.includes('Workshop Footer')));
 const block=d.blocks.find(b=>b.text.includes(d.scope==='AREA'?'Unsere Terrasse':'Wir servieren Frühstück'));
 assert.ok(block,'main-body evidence must reach entity extraction');
 value={candidates:[d.scope==='AREA'?c('AREA','TERRACE','Terrasse',block.id):c('OFFER','BREAKFAST','Frühstück',block.id)]};
 }else if(d.phase==='PROPERTIES'){assert.ok(d.blocks.every(b=>!b.text.includes('Workshop Footer')));value={facts:[]};}
 else if(d.candidates)value={verdicts:d.candidates.map(x=>({id:x.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',x.quote)}))};else throw Error('UNEXPECTED_STAGE');
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
 }});
 assert.deepEqual(seen,['AREA','OFFER']);assert.equal(r.spotCoverage.visitorOffers,1);assert.equal(r.spotCoverage.physicalAreas,1);assert.equal(r.canonicalWrite,false);
 }
});

test('explicit sparkling-wine menu rows support the canonical drinks service, never product services',()=>{
 const quote='Champagne Rosé, Chardonnay und Pinot Noir, 15.- / 106.-';
 const s={...source('Offen Bubbles\n\n'+quote),headings:[{level:2,text:'Offen Bubbles',offset:0}]};
 const block={id:'b0',text:quote,offset:s.text.indexOf(quote)};
 const ledger=parseScopedCandidates({candidates:[c('OFFER','DRINKS','Getränke','b0'),c('OFFER','DRINKS','Champagne Rosé','b0')]},s,fields,[block]);
 applyScopedVerdicts({verdicts:ledger.map(x=>({id:x.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',x.quote)}))},ledger);
 const [result]=projectScopedResearch(spot,fields,ledger,[s],validateAuthoringSubmission);
 assert.equal(result.status,'REQUIRES_REVIEW');assert.deepEqual(result.value.offers.map(x=>x.name),['Getränke']);assert.equal(ledger[1].state,'HELD');
});

test('sparkling-wine words without a current beverage-menu assertion never establish drinks',()=>{
 for(const [heading,quote,extra] of [
 ['Desserts','Champagne-Sorbet mit Früchten, CHF 15.',{}],
 ['Unser Haus','Champagne Rosé, Chardonnay und Pinot Noir.',{}],
 ['Offen Bubbles','Champagne-Sorbet mit Früchten, CHF 15.',{}],
 ['Offen Bubbles','Champagne Rosé, Chardonnay und Pinot Noir, 15.- / 106.-',{belongsTo:'OTHER'}],
 ['Offen Bubbles','Champagne Rosé, Chardonnay und Pinot Noir, 15.- / 106.-',{applicability:'DATED'}],
 ]){
 const s={...source(heading+'\n\n'+quote),headings:[{level:2,text:heading,offset:0}]};
 const ledger=parseScopedCandidates({candidates:[c('OFFER','DRINKS','Getränke','b0',extra)]},s,fields,[{id:'b0',text:quote,offset:s.text.indexOf(quote)}]);
 applyScopedVerdicts({verdicts:ledger.map(x=>({id:x.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',x.quote)}))},ledger);
 assert.equal(projectScopedResearch(spot,fields,ledger,[s],validateAuthoringSubmission)[0].status,'UNRESOLVED');
 }
});


test('explicit dining in the evening supports dinner without requiring the canonical word',()=>{
 const good=project([c('OFFER','DINNER','Abendessen','b0')],'Wir servieren saisonale Gerichte am Mittag und am Abend.');
 assert.equal(good.result.status,'REQUIRES_REVIEW');assert.equal(good.result.value.offers[0].kind,'DINNER');
 for(const text of ['Unser Haus ist am Abend geöffnet.','Am Abend kostet das Zimmer CHF 120.'])assert.equal(project([c('OFFER','DINNER','Abendessen','b0')],text).result.status,'UNRESOLVED');
});

test('a published service heading and its actual body are one evidence scope, not a bare label',()=>{
 for(const [heading,body,expected] of [
 ['Getränke & Wein','Wir servieren ausgewählte Weine und frisch gezapftes Bier.','REQUIRES_REVIEW'],
 ['Getränke & Wein','Hier findest du unsere Bildergalerie.','UNRESOLVED'],
 ]){
 const text=heading+'\n\n'+body,s={...source(text),headings:[{level:2,text:heading,offset:0}]};
 const ledger=parseScopedCandidates({candidates:[c('OFFER','DRINKS',heading,'b0')]},s,fields,[{id:'b0',text:body,offset:text.indexOf(body)}]);
 applyScopedVerdicts({verdicts:ledger.map(x=>({id:x.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',x.quote)}))},ledger);
 assert.equal(projectScopedResearch(spot,fields,ledger,[s],validateAuthoringSubmission)[0].status,expected);
 }
 const text='Getränke & Wein\n\nBildergalerie\n\nWir servieren ausgewählte Weine und Bier.';
 const s={...source(text),headings:[{level:2,text:'Getränke & Wein',offset:0},{level:2,text:'Bildergalerie',offset:text.indexOf('Bildergalerie')}]};
 const ledger=parseScopedCandidates({candidates:[c('OFFER','DRINKS','Getränke & Wein','b0')]},s,fields,[{id:'b0',text:'Wir servieren ausgewählte Weine und Bier.',offset:text.indexOf('Wir servieren')}]);
 applyScopedVerdicts({verdicts:ledger.map(x=>({id:x.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',x.quote)}))},ledger);
 assert.equal(projectScopedResearch(spot,fields,ledger,[s],validateAuthoringSubmission)[0].status,'UNRESOLVED');
});

test('a short published breakfast label stays joined to its explicit daily time row',async()=>{
 let found=false;
 const r=await researchSpotV2({spot,fields,maxRequests:1,maxModelCalls:6,modelPath:'/tmp/8b2b98c00a6b4d291155e4890773ca8f769aee53'},{validateValue:validateAuthoringSubmission,
 fetchPage:async url=>({url,contentType:'text/html',observedAt:'2026-10-22T12:00:00Z',body:'<main><h2>Öffnungszeiten</h2><p>Frühstück<br>Täglich von 07:00–10:30 Uhr</p></main>'}),
 modelFetch:async(_url,init)=>{
 const d=JSON.parse(JSON.parse(init.body).messages[1].content);let value;
 if(d.phase==='ENTITIES'){
 const block=d.blocks.find(b=>b.text.includes('Frühstück')&&b.text.includes('07:00–10:30'));if(d.scope==='OFFER'){assert.ok(block);found=true;}
 value={candidates:d.scope==='OFFER'?[c('OFFER','BREAKFAST','Frühstück',block.id)]:[]};
 }else if(d.phase==='PROPERTIES')value={facts:[]};else if(d.candidates)value={verdicts:d.candidates.map(x=>({id:x.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',x.quote)}))};else throw Error('UNEXPECTED_STAGE');
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
 }});
 assert.equal(found,true);assert.equal(r.spotCoverage.visitorOffers,1);assert.equal(r.results[0].value.offers[0].kind,'BREAKFAST');assert.equal(r.canonicalWrite,false);
});

// Gap planning uses only the canonical projected draft, not unverified model guesses.
const gapFields = ['contact.phone', 'contact.public_email', 'hours.regular', 'experience.profile'].map(attributeKey => ({attributeKey,...researchValueContract(attributeKey)}));
const candidateLink=(path,topics,label=path)=>({url:'https://example.org'+path,depth:1,topics,label});
const gapProfile=()=>project([c('OFFER','BREAKFAST','Frühstück','b0')],'Wir servieren Frühstück.').result;
const missingResults=()=>gapFields.filter(f=>f.attributeKey!=='experience.profile').map(f=>({attributeKey:f.attributeKey,status:'UNRESOLVED'}));

test('a sourced breakfast survives missing prices and times in research questions',()=>{
 const result=gapProfile(), before=structuredClone(result);
 const questions=spotResearchQuestions(gapFields,[...missingResults(),result]);
 assert.deepEqual(questions.knownOffers,[{kind:'BREAKFAST',name:'Frühstück'}]);
 assert.deepEqual(questions.offerPrices,questions.knownOffers);
 assert.deepEqual(questions.offerTimes,questions.knownOffers);
 assert.equal(questions.completeness,'NOT_ASSESSED');
 assert.equal(questions.discoverOffers,true);assert.equal(questions.discoverAreas,true);
 assert.deepEqual(result,before);
});
test('held, malformed and conflicting projections never close research questions',()=>{
 for(const result of [{...gapProfile(),status:'UNRESOLVED'}, {...gapProfile(),value:{offers:[]}}]){
  const questions=spotResearchQuestions(gapFields,[result]);assert.equal(questions.knownOffers.length,0);assert.ok(questions.unresolvedFields.includes('contact.phone'));
 }
});
test('completed contacts shift selection from contact to missing breakfast details',()=>{
 const links=[candidateLink('/kontakt',['contact']),candidateLink('/fruehstueck',['experience','menu'],'Frühstück'),candidateLink('/about',['about'])];
 const pending=spotResearchQuestions(gapFields,[gapProfile()]);
 assert.equal(rankSpotProfileFrontier([links[0],links[2]],gapFields,[],pending)[0].url,links[0].url);
 const resolved=gapFields.filter(f=>f.attributeKey!=='experience.profile').map(f=>({attributeKey:f.attributeKey,status:'REQUIRES_REVIEW',value:f.attributeKey.startsWith('contact.')?'confirmed':f.attributeKey.startsWith('hours.')?['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(day=>({day,intervals:[]})):[],partialHours:false}));
 const questions=spotResearchQuestions(gapFields,[...resolved,gapProfile()]);
 assert.equal(rankSpotProfileFrontier(links,gapFields,[],questions)[0].url,links[1].url);
 assert.equal(questions.unresolvedFields.length,0);
});
test('partial weekly hours remain an open question even with a valid draft',()=>{
 const questions=spotResearchQuestions(gapFields,[{attributeKey:'hours.regular',status:'REQUIRES_REVIEW',partialHours:true,value:[]}]);
 assert.ok(questions.unresolvedFields.includes('hours.regular'));
});
test('guest information outranks repetitive room inventory once lodging is evidenced',()=>{
 const f=[{...fields[0],profileCategory:'STAY'}];
 const {result}=project([c('OFFER','OVERNIGHT_STAY','Übernachtung','b0')],'Bei uns kannst du übernachten.',f);
 assert.equal(result.status,'REQUIRES_REVIEW');
 const links=[candidateLink('/rooms/double',['stay','experience']),candidateLink('/guest-information',['visit','hours'])];
 const questions=spotResearchQuestions(f,[result]);
 assert.equal(rankSpotProfileFrontier(links,f,[],questions)[0].url,links[1].url);
 assert.ok(rankSpotProfileFrontier(links,f,[],questions).some(link=>link.url===links[0].url));
});
test('closing a service time question removes its targeted boost without erasing service',()=>{
 const rows=[c('OFFER','BREAKFAST','Frühstück','b0'),c('OFFER','BREAKFAST','Frühstück','b0',{propertyKey:'$schedule',valueJson:'[{"weekday":1,"start":"07:00","end":"10:00"}]'})];
 const {result}=project(rows,'Frühstück Montag 07:00–10:00');
 const questions=spotResearchQuestions(fields,[result]);
 assert.equal(questions.knownOffers.length,1);assert.equal(questions.offerTimes.length,0);assert.equal(questions.offerPrices.length,1);
});
test('gap planning preserves depth and read-source exclusions and stable tie order',()=>{
 const links=[candidateLink('/fruehstueck',['experience']),{...candidateLink('/breakfast',['experience']),depth:4},candidateLink('/terrasse',['areas']),candidateLink('/garten',['areas'])];
 const prior={...source('Frühstück wird angeboten.'),url:links[0].url};
 const ranked=rankSpotProfileFrontier(links,fields,[prior],spotResearchQuestions(fields,[gapProfile()]));
 assert.deepEqual(ranked.map(link=>link.url),links.slice(2).map(link=>link.url));
});
test('scoped research records selection questions and source handoff',async()=>{
 const f=['identity.name'].map(attributeKey=>({attributeKey,...researchValueContract(attributeKey)}));
 const report=await researchSpotV2({spot,fields:f,modelPath:'/tmp/8b2b98c00a6b4d291155e4890773ca8f769aee53',maxRequests:1,maxModelCalls:6},{validateValue:validateAuthoringSubmission,fetchPage:async url=>({url,contentType:'text/html',body:'<main><h2>Kontakt</h2><p>Test Restaurant: Telefon +41 61 555 06 06.</p></main>',observedAt:'2026-10-22T12:00:00Z'}),modelFetch:async(_url,init)=>{
  const data=JSON.parse(JSON.parse(init.body).messages[1].content);
  const value=data.fields?{facts:[]}:{verdicts:(data.candidates??[]).map(c=>({id:c.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',c.quote)}))};
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
 }});
 assert.equal(report.canonicalWrite,false);
 const selection=report.actions.find(action=>action.stage==='SOURCE_SELECTION');
 assert.equal(selection.strategy,'PROJECTED_EVIDENCE_GAPS');assert.ok(selection.questions.unresolvedFields.includes('identity.name'));
 const handoff=report.actions.find(action=>action.stage==='SOURCE_HANDOFF');assert.ok(handoff.identityBlockCount>0);assert.equal(handoff.sourceHash,report.sources[0].hash);
});

test('a truncated or empty primary page cannot suppress its observed translation',()=>{
 const link=candidateLink('/en/guest-info',['visit','hours']);
 for(const prior of [{...source('x'.repeat(250)),truncated:true},{...source(''),truncated:false}]){
  const earlier={...prior,url:'https://example.org/guest-info'};
  assert.equal(rankSpotProfileFrontier([link],fields,[earlier],spotResearchQuestions(fields,[])).length,1);
 }
 const complete={...source('x'.repeat(250)),url:'https://example.org/guest-info',truncated:false};
 assert.equal(rankSpotProfileFrontier([link],fields,[complete],spotResearchQuestions(fields,[])).length,0);
});
test('planner exposes decision reasons without pretending a link label proves facts',()=>{
 const links=[candidateLink('/breakfast',['visit'],'Breakfast')];
 const questions=spotResearchQuestions(fields,[]);
 const before=structuredClone(questions);
 const planned=planSpotProfileFrontier(links,fields,[],questions);
 assert.equal(planned[0].entry.url,links[0].url);assert.ok(Number.isFinite(planned[0].score));
 assert.equal(questions.knownOffers.length,0);assert.deepEqual(questions,before);
 assert.deepEqual(rankSpotProfileFrontier(links,fields,[],questions),planned.map(item=>item.entry));
});

test('parent path names do not turn room details into guest-information overviews',()=>{
 const f=[{...fields[0],profileCategory:'STAY'}];
 const result=project([c('OFFER','OVERNIGHT_STAY','Übernachtung','b0')],'Bei uns kannst du übernachten.',f).result;
 const links=[candidateLink('/guest-info/rooms-quick-facts',['stay','experience'],'Dorms | Private Zimmer'),candidateLink('/hostel',['stay','experience'],'Hostel')];
 const planned=planSpotProfileFrontier(links,f,[],spotResearchQuestions(f,[result]));
 assert.equal(planned[0].entry.url,links[1].url);
 assert.ok(!planned.find(p=>p.entry.url===links[0].url).reasons.includes('OPEN_VENUE_OR_OFFER_TIMES'));
});

test('open practical questions cannot promote a read-page translation ahead of a new area',()=>{
 const prior={...source('Our guest information. Breakfast is available. '.repeat(8)),url:'https://example.org/gaeste-infos/'};
 const links=[candidateLink('/en/guest-info/',['visit','hours'],'Guest information'),candidateLink('/living-room/',['experience','areas'],'Living Room')];
 const questions=spotResearchQuestions(gapFields,[gapProfile()]);
 const planned=planSpotProfileFrontier(links,gapFields,[prior],questions);
 assert.equal(planned[0].entry.url,links[1].url);
 assert.ok(planned[1].reasons.includes('TRANSLATION_ALREADY_READ'));
 assert.ok(!planned[1].reasons.includes('OPEN_VENUE_OR_OFFER_TIMES'));
});

// Method 1.2: user-approved commission focus, service evidence and source order.
test('commissioned restaurant and hotel keep the connected business as a separate lead',()=>{
 assert.equal(commissionedLinkScope({url:'https://example.org/de/hotel/zimmer/',label:'Zimmer'},'EAT'),'RELATED_SERVICE');
 assert.equal(commissionedLinkScope({url:'https://example.org/de/restaurant/',label:'Restaurant'},'STAY'),'RELATED_SERVICE');
 assert.equal(commissionedLinkScope({url:'https://example.org/de/restaurant/terrasse/',label:'Terrasse'},'EAT'),'TARGET');
 assert.equal(commissionedLinkScope({url:'https://example.org/de/angebote/',label:'Angebote'},'EAT'),'UNKNOWN');
 assert.equal(commissionedLinkScope({url:'https://example.org/de/angebote/halbpension/',label:'Halbpension'},'EAT'),'RELATED_SERVICE');
});
test('hotel-package breakfast is held even when extraction and critic incorrectly agree',()=>{
 const text='Bei diesem Angebot profitieren Sie von einem inkludierten Frühstück und einem Late Check-Out.';
 const {ledger,result}=project([c('OFFER','BREAKFAST','Frühstück','b0')],text);
 assert.equal(ledger[0].reason,'HOTEL_PACKAGE_NOT_INDEPENDENT_SERVICE');assert.equal(ledger[0].state,'HELD');
 assert.equal(result.status,'UNRESOLVED');assert.equal(result.reviewEvidence[0].evidence,text);
});
test('independently offered breakfast remains eligible without a menu or price',()=>{
 const {result}=project([c('OFFER','BREAKFAST','Frühstück','b0')],'Wir servieren Frühstück, auch für externe Gäste ohne Übernachtung.');
 assert.equal(result.value.offers[0].kind,'BREAKFAST');
 assert.equal(lodgingPackageAssertion('Wir servieren Frühstück, auch für externe Gäste ohne Übernachtung.'),false);
});
test('hotel room statement is not lost merely because it includes breakfast',()=>{
 const text='Doppelzimmer für Ihre Übernachtung, inklusive Frühstück.';
 const fs=[{...fields[0],profileCategory:'STAY'}];
 const {ledger}=project([c('OFFER','OVERNIGHT_STAY','Übernachtung','b0')],text,fs);
 assert.equal(ledger[0].state,'ACCEPTED');
});
test('reservation button supports recommended but never required',()=>{
 const fs=[{attributeKey:'rule.reservation',...researchValueContract('rule.reservation')}];
 const rule=mode=>({mode,minimumPartySize:null,days:[],fromTime:null,toTime:null});
 const row=mode=>c('SPOT','','','b0',{field:'rule.reservation',valueJson:JSON.stringify(rule(mode))});
 assert.equal(project([row('RECOMMENDED')],'Tisch reservieren',fs).result.value.mode,'RECOMMENDED');
 assert.equal(project([row('REQUIRED')],'Tisch reservieren',fs).ledger[0].reason,'RESERVATION_REQUIREMENT_NOT_EXPLICIT');
 assert.equal(project([row('REQUIRED')],'Eine Reservation ist erforderlich.',fs).result.value.mode,'REQUIRED');
});
test('explicit evening menu establishes dinner without the literal word Abendessen',()=>{
 const {result}=project([c('OFFER','DINNER','Abendessen','b0')],'Abendmenü: Unser Menü wird ab 18 Uhr serviert.');
 assert.equal(result.value.offers[0].kind,'DINNER');
});
test('meal PDFs outrank generic offer pages while practical questions remain open',()=>{
 const f=[{...fields[0],profileCategory:'EAT'},...['rule.reservation','amenity.features','hours.regular'].map(attributeKey=>({attributeKey,...researchValueContract(attributeKey)}))];
 const q=spotResearchQuestions(f,[]);
 const entries=[{url:'https://example.org/de/angebote/',label:'Angebote',topics:['experience','areas','access'],depth:1},{url:'https://example.org/docs/mittagskarte.pdf',label:'Mittagsmenü',topics:['menu','experience'],depth:1},{url:'https://example.org/docs/abendkarte.pdf',label:'Abendmenü',topics:['menu','experience'],depth:1}];
 const ranked=planSpotProfileFrontier(entries,f,[],q);
 assert.ok(ranked[0].entry.url.endsWith('mittagskarte.pdf'));assert.ok(ranked[1].entry.url.endsWith('abendkarte.pdf'));
 assert.ok(ranked[0].reasons.includes('COMMISSIONED_DINING_DOCUMENT'));
 assert.ok(!ranked[2].reasons.includes('OPEN_PRACTICAL_INFORMATION'));
});
test('weekdayless restaurant times cannot become seven invented opening days',()=>{
 const fs=[{attributeKey:'hours.regular',...researchValueContract('hours.regular')}];
 const value=[{day:'MONDAY',closed:false,intervals:[{start:'12:00',end:'14:00'}]}];
 const {ledger}=project([c('SPOT','','','b0',{field:'hours.regular',valueJson:JSON.stringify(value)})],'Restaurant: 12–14 Uhr und 18–22 Uhr.',fs);
 assert.equal(ledger[0].reason,'VENUE_WEEKDAYS_NOT_LITERAL');
});
test('canonical service and its enclosing exact area heading can support a relationship',()=>{
 const text='Terrasse\n\nMittags servieren wir unser Tagesmenü.';
 const s={...source(text),headings:[{text:'Terrasse',level:2,offset:0}]};
 const blocks=[{id:'b0',text:'Mittags servieren wir unser Tagesmenü.',offset:text.indexOf('Mittags')}];
 const ledger=parseScopedCandidates({candidates:[c('OFFER','LUNCH','Mittagessen','b0',{propertyKey:'$area',valueJson:'"Terrasse"'})]},s,fields,blocks);
 assert.equal(ledger[0].reason,'SEMANTIC_CHECK_PENDING');
 const unrelated={...s,headings:[]};
 assert.equal(parseScopedCandidates({candidates:[c('OFFER','LUNCH','Mittagessen','b0',{propertyKey:'$area',valueJson:'"Terrasse"'})]},unrelated,fields,blocks)[0].reason,'RELATIONSHIP_EVIDENCE_REQUIRED');
});

test('actual retained meal-menu anchor supports a service, unlinked labels do not',()=>{
 const s={...source('Abendmenü'),linkedMenus:[{label:'Abendmenü',url:'https://example.org/dinner.pdf'}]};
 const blocks=[{id:'b0',text:s.text,offset:0}];
 const rows=literalLinkedDiningServices(s,fields,blocks,0);
 assert.equal(rows[0].entityKind,'DINNER');assert.equal(rows[0].reason,'SEMANTIC_CHECK_PENDING');
 assert.equal(literalLinkedDiningServices({...s,linkedMenus:[]},fields,blocks,0).length,0);
});

test('explicit terrace lunch assertion produces a relationship proposal requiring its own critic',()=>{
 const text='Bei schönem Wetter servieren wir mittags auf unserer Terrasse das Tagesmenü.';
 const s=source(text),blocks=[{id:'b0',text,offset:0}];
 const nodes=[{...c('OFFER','LUNCH','Mittagessen','b0'),id:'lunch',state:'ACCEPTED'},{...c('AREA','TERRACE','Terrasse','b0'),id:'terrace',state:'ACCEPTED'}];
 const links=literalOfferAreaRelationships(nodes,s,fields,blocks,0);
 assert.equal(links.length,1);assert.equal(links[0].reason,'SEMANTIC_CHECK_PENDING');assert.equal(links[0].state,'HELD');
 applyScopedVerdicts({verdicts:[{id:links[0].id,verdict:'AMBIGUOUS',...fixtureJustification('AMBIGUOUS',links[0].quote)}]},links);assert.equal(links[0].state,'HELD');
 const unrelated='Mittagessen. Unsere Terrasse hat 20 Plätze.';
 assert.equal(literalOfferAreaRelationships(nodes,source(unrelated),fields,[{id:'b0',text:unrelated}],0).length,0);
});
test('a proposed link is not sufficient to invent or transfer service availability',()=>{
 const text='Bei schönem Wetter servieren wir mittags auf unserer Terrasse das Tagesmenü.';
 const s=source(text),blocks=[{id:'b0',text,offset:0}];
 const nodes=parseScopedCandidates({candidates:[c('OFFER','LUNCH','Mittagessen','b0'),c('AREA','TERRACE','Terrasse','b0')]},s,fields,blocks);
 applyScopedVerdicts({verdicts:nodes.map(n=>({id:n.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',n.quote)}))},nodes);
 const links=literalOfferAreaRelationships(nodes,s,fields,blocks,nodes.length);applyScopedVerdicts({verdicts:links.map(n=>({id:n.id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',n.quote)}))},links);
 const result=projectScopedResearch(spot,fields,[...nodes,...links],[s],validateAuthoringSubmission)[0];
 assert.equal(result.value.offers[0].areaIds.length,1);assert.deepEqual(result.value.offers[0].schedule,[]);assert.equal(result.citations.at(-1).evidence,text);
});

test('explicit kitchen times also keep missing weekdays open',()=>{
 const fs=[{attributeKey:'hours.kitchen',...researchValueContract('hours.kitchen')}];
 const value=[{day:'MONDAY',intervals:[{start:'12:00',end:'14:00'}]}];
 const {ledger}=project([c('SPOT','','','b0',{field:'hours.kitchen',valueJson:JSON.stringify(value)})],'Küchenzeiten: 12–14 Uhr.',fs);
 assert.equal(ledger[0].reason,'KITCHEN_WEEKDAYS_NOT_LITERAL');
});

test('area-body evidence requires its active named heading and cannot borrow from a sibling or a label alone',()=>{
 const text='PRIVATE SALON\n\nDieser private Raum bietet Platz für 12 Personen.\n\nANDERER RAUM\n\nDieser Raum bietet Platz für 20 Personen.';
 const s={...source(text),headings:[{level:2,text:'PRIVATE SALON',offset:0},{level:2,text:'ANDERER RAUM',offset:text.indexOf('ANDERER RAUM')}]};
 const blocks=text.split('\n\n').map((text,i)=>({id:'b'+i,text,offset:s.text.indexOf(text)}));
 const rows=parseScopedCandidates({candidates:[c('AREA','PRIVATE_ROOM','Private Salon','b0'),c('AREA','PRIVATE_ROOM','Private Salon','b1'),c('AREA','PRIVATE_ROOM','Private Salon','b3')]},s,fields,blocks);
 assert.equal(rows[0].reason,'ENTITY_EVIDENCE_REQUIRED');assert.equal(rows[1].reason,'SEMANTIC_CHECK_PENDING');assert.equal(rows[2].reason,'ENTITY_EVIDENCE_REQUIRED');
 const unheaded=parseScopedCandidates({candidates:[c('AREA','PRIVATE_ROOM','Private Salon','b1')]},{...s,headings:[]},fields,blocks);
 assert.equal(unheaded[0].reason,'ENTITY_EVIDENCE_REQUIRED');
});


test('meal synonyms normalize to lunch and dinner without literal canonical names',()=>{
 const aliases={LUNCH:['Mittagsmenü','Mittagsmenüs','Lunch','Business Lunch','Business-Lunch','Mittagskarte','Mittagessen','Mittagsverpflegung','Mittagstisch','MITTAGSMENÜ'],DINNER:['Abendkarte','Abendmenü','Abendessen','Abendverpflegung','Dinner','Dinner Menu','Dîner','Speisekarte am Abend']};
 for(const [kind,labels] of Object.entries(aliases))for(const label of labels){
  const text=`Wir bieten ${label} an.`,name=kind==='LUNCH'?'Mittagessen':'Abendessen';
  const {result}=project([c('OFFER',kind,name,'b0')],text);
  assert.equal(result.status,'REQUIRES_REVIEW',label);assert.equal(result.value.offers[0].kind,kind,label);
  assert.equal(result.value.offers[0].prices.length,0);assert.equal(result.value.offers[0].schedule.length,0);
 }
});
test('meal normalization cannot turn negation, questions, breaks or venue hours into meals',()=>{
 for(const [kind,text] of [['LUNCH','Kein Lunch.'],['LUNCH','Kein Mittagessen.'],['LUNCH','Lunch wird nicht angeboten.'],['LUNCH','Lunch is not available.'],['LUNCH','Bieten Sie Lunch an?'],['LUNCH','Mittagspause von 12–14 Uhr.'],['LUNCH','Lunch break 12–14.'],['LUNCH','Am Mittag ist das Restaurant geöffnet.'],['DINNER','Keine Abendkarte.'],['DINNER','Kein Abendessen.'],['DINNER','Am Abend keine warmen Speisen.'],['DINNER','Unser Restaurant ist am Abend geöffnet.']]){
  assert.equal(project([c('OFFER',kind,kind==='LUNCH'?'Mittagessen':'Abendessen','b0')],text).result.status,'UNRESOLVED',text);
 }
 assert.equal(project([c('OFFER','LUNCH','Mittagessen','b0')],'Kein Frühstück, aber Business Lunch bieten wir an.').result.status,'REQUIRES_REVIEW');
});
test('active meal headings accompany price evidence as an unchanged contiguous quote',()=>{
 const text='Mittagsmenü\n\n3 Gang CHF 45 / 2 Gang CHF 35\n\nAbendkarte\n\nSaisonale Speisen werden serviert.';
 const s={...source(text),headings:[{level:2,text:'Mittagsmenü',offset:0},{level:2,text:'Abendkarte',offset:text.indexOf('Abendkarte')}]};
 const rows=parseScopedCandidates({candidates:[c('OFFER','LUNCH','Mittagessen','price')]},s,fields,[{id:'price',text:'3 Gang CHF 45 / 2 Gang CHF 35',offset:text.indexOf('3 Gang')}]);
 assert.equal(rows[0].reason,'SEMANTIC_CHECK_PENDING');assert.equal(rows[0].quote,'Mittagsmenü\n\n3 Gang CHF 45 / 2 Gang CHF 35');assert.equal(rows[0].sourceOffset,0);
 assert.equal(s.text.slice(rows[0].sourceOffset,rows[0].sourceOffset+rows[0].quote.length),rows[0].quote);
 const wrong=parseScopedCandidates({candidates:[c('OFFER','LUNCH','Mittagessen','dinner')]},s,fields,[{id:'dinner',text:'Saisonale Speisen werden serviert.',offset:text.indexOf('Saisonale')}]);
 assert.equal(wrong[0].reason,'MEAL_SERVICE_CONTEXT_REQUIRED');
});


test('meal aliases keep breakfast, coordinated negation and closed kitchens distinct',()=>{
 for(const [kind,text] of [['LUNCH','Petit-déjeuner wird angeboten.'],['DINNER','Weder Lunch noch Dinner.'],['DINNER','Keine Mittagskarte und Abendkarte.'],['LUNCH','Die Küche ist am Mittag geschlossen.']])assert.equal(project([c('OFFER',kind,kind==='LUNCH'?'Mittagessen':'Abendessen','b0')],text).result.status,'UNRESOLVED',text);
});
test('retained menu anchors accept the same meal synonyms as body evidence',()=>{
 for(const [label,kind] of [['Business Lunch','LUNCH'],['Mittagsverpflegung','LUNCH'],['Speisekarte am Abend','DINNER'],['Dinner Menu','DINNER']]){
  const s={...source(label),linkedMenus:[{label,url:'https://example.org/menu.pdf'}]};
  const rows=literalLinkedDiningServices(s,fields,[{id:'b0',text:label,offset:0}],0);
  assert.equal(rows.length,1,label);assert.equal(rows[0].entityKind,kind,label);assert.equal(rows[0].reason,'SEMANTIC_CHECK_PENDING',label);
 }
});


test('private celebration canonical label accepts published occasion synonyms and keeps negations held',()=>{
 for(const quote of ['Feiern Sie bei uns Ihren persönlichen Anlass in persönlicher Atmosphäre.','Wir organisieren private Feiern.','Familienfeiern bei uns im Restaurant.','Ihre Geburtstagsfeier bei uns.','Hochzeiten im Restaurant.','Bankette in unseren Räumen.','Familienanlässe bei uns.','Feiern Sie Ihren Geburtstag bei uns.','Jubiläumsfeiern in unserem Restaurant.','We host private events.']){
  const {ledger}=project([c('OFFER','PRIVATE_CELEBRATION','Private Feier','b0')],quote);assert.equal(ledger[0].state,'ACCEPTED',quote);
 }
 for(const quote of ['Keine privaten Feiern möglich.','Wir bieten keine Bankette an.','Private events are not offered.']){
  const {ledger}=project([c('OFFER','PRIVATE_CELEBRATION','Private Feier','b0')],quote);assert.equal(ledger[0].state,'HELD',quote);
 }
});
test('area inventory schema and parser preserve a fifth published room instead of silently capping four',()=>{
 const names=['Restaurant','Garten','Wyy Stübli','Kleines Stübli','Grosses Stübli'];
 const text=names.map((name,i)=>`${name} ${i+10} Plätze`).join('\n\n'),s=source(text),blocks=text.split('\n\n').map((text,i)=>({id:'b'+i,text}));
 const rows=names.map((name,i)=>c('AREA',i===0?'DINING_AREA':i===1?'TERRACE':'PRIVATE_ROOM',name,'b'+i));
 const schema=scopedEntitySchema(blocks,'AREA',createSpotResearchPlan(spot,fields));assert.equal(schema.properties.candidates.maxItems,16);
 const ledger=parseScopedCandidates({candidates:rows},s,fields,blocks,0,16);assert.equal(ledger.length,5);assert.equal(ledger[4].entityName,'Grosses Stübli');assert.equal(ledger[4].reason,'SEMANTIC_CHECK_PENDING');
 assert.throws(()=>parseScopedCandidates({candidates:Array(17).fill(rows[0])},s,fields,blocks,0,16),/SCOPED_EXTRACTION_INVALID/);
});

test('generic meal menu synonyms do not fail merely because name equals quote; critic still decides',()=>{
 for(const [kind,label] of [['LUNCH','Mittagsmenü'],['LUNCH','Business Lunch'],['DINNER','Abendkarte']]){
  const {result,ledger}=project([c('OFFER',kind,label,'b0')],label);
  assert.equal(ledger[0].state,'ACCEPTED');assert.equal(result.value.offers[0].kind,kind);
  assert.equal(ledger[0].normalization.originalEntityName,label);assert.equal(ledger[0].quote,label);
 }
 for(const label of ['Kein Mittagsmenü','Mittagspause','Lunch Rezepte']){
  const {ledger}=project([c('OFFER','LUNCH',label,'b0')],label);
  assert.equal(ledger[0].state,'HELD');
 }
 const s=source('Mittagsmenü'),rows=parseScopedCandidates({candidates:[c('OFFER','LUNCH','Mittagsmenü','b0')]},s,fields,[{id:'b0',text:s.text}]);
 assert.equal(rows[0].reason,'SEMANTIC_CHECK_PENDING');
 applyNativeScopedVerdicts({verdicts:[{id:rows[0].id,verdict:'UNSUPPORTED',...fixtureJustification('UNSUPPORTED',s.text)}]},rows,s);
 assert.equal(projectScopedResearch(spot,fields,rows,[s],validateAuthoringSubmission)[0].status,'UNRESOLVED');
});
test('area event capacity retains its literal qualifier instead of disappearing or becoming unconditional',()=>{
 const text='Der Saal bietet Platz für Veranstaltungen mit bis zu 84 Personen.\n\nDer Nebenraum ist für private Anlässe mit bis zu 22 Personen geeignet.';
 const {result,ledger}=project([
  c('AREA','DINING_AREA','Saal','b0'),c('AREA','PRIVATE_ROOM','Nebenraum','b1'),
  c('AREA','DINING_AREA','Saal','b0',{propertyKey:'offer.capacity',valueJson:'84',applicability:'CONDITIONAL',condition:'Veranstaltungen'}),
  c('AREA','PRIVATE_ROOM','Nebenraum','b1',{propertyKey:'offer.capacity',valueJson:'22',applicability:'CONDITIONAL',condition:'private Anlässe'})
 ],text);
 assert.ok(ledger.every(row=>row.state==='ACCEPTED'));
 assert.deepEqual(result.value.areas.map(a=>[a.properties[0].value,a.properties[0].conditions.event]),[[84,'Veranstaltungen'],[22,'private Anlässe']]);
 for(const condition of ['bei schönem Wetter','nur im Winter','Veranstaltungen ab 2027','unbekannte Anlässe']){
  const {ledger}=project([c('AREA','DINING_AREA','Saal','b0',{propertyKey:'offer.capacity',valueJson:'84',applicability:'CONDITIONAL',condition})],`Der Saal bietet 84 Plätze ${condition}.`);
  assert.equal(ledger[0].state,'HELD');assert.equal(ledger[0].reason,'CONDITIONAL_OR_DATED_REQUIRES_REVIEW');
 }
 const {ledger:dated}=project([c('AREA','DINING_AREA','Saal','b0',{propertyKey:'offer.capacity',valueJson:'84',applicability:'DATED',condition:'Veranstaltungen'})],'Der Saal bietet 84 Plätze für Veranstaltungen.');
 assert.equal(dated[0].state,'HELD');
});
test('generic celebration uses collapse to one catalog service without erasing the original audit labels',()=>{
 const text='Der Saal eignet sich für Familienfeiern, Hochzeiten und private Anlässe.\n\nBankette Herbst';
 const {result,ledger}=project([
  c('OFFER','PRIVATE_CELEBRATION','Hochzeit','b0'),c('OFFER','PRIVATE_CELEBRATION','Familienfeier','b0'),
  c('OFFER','EVENT','Bankette','b1')
 ],text);
 assert.equal(result.value.offers.length,1);assert.equal(result.value.offers[0].kind,'PRIVATE_CELEBRATION');
 assert.equal(ledger[2].normalization.originalEntityKind,'EVENT');
 const {result:named}=project([c('OFFER','PRIVATE_CELEBRATION','Rheinpaket','b0')],'Unser Rheinpaket für Ihre private Feier beinhaltet ein Menü.');
 assert.equal(named.value.offers[0].name,'Rheinpaket');
});

test('literal transit direction is a critic-checked SPOT travel claim, never accessibility',()=>{
 const s=source('Vom Bahnhof SBB: Tram Nr. 8 Richtung Stadtmitte.');
 const rows=literalSpotTravelDirections(s,fields,[{id:'b0',text:s.text}],0);
 assert.equal(rows.length,1);assert.equal(rows[0].propertyKey,'travel.mode');assert.equal(rows[0].scope,'SPOT');assert.equal(rows[0].reason,'SEMANTIC_CHECK_PENDING');
 assert.equal(projectScopedResearch(spot,fields,rows,[s],validateAuthoringSubmission)[0].status,'UNRESOLVED');
 applyNativeScopedVerdicts({verdicts:[{id:rows[0].id,verdict:'SUPPORTED',...fixtureJustification('SUPPORTED',s.text)}]},rows,s);
 const profile=projectScopedResearch(spot,fields,rows,[s],validateAuthoringSubmission)[0];assert.equal(profile.value.properties[0].value,s.text);
 for(const text of ['Tram fährt in der Stadt.','Vom Bahnhof SBB: Kein Tram fährt zum Ort.','Vom Bahnhof SBB: Tram nur für Mitarbeiter.'])assert.deepEqual(literalSpotTravelDirections(source(text),fields,[{id:'b0',text}],0),[]);
});

test('verified transit routes from distinct origins complement each other instead of erasing travel',()=>{
 const first='Vom Bahnhof SBB: Tram Nr. 8 Richtung Stadtmitte.';
 const second='Vom Badischen Bahnhof: Tram Nr. 6 Richtung Zentrum.';
 const third='Mit Bus Nr. 50 vom Flughafen zum Bahnhof SBB, von dort Tram Nr. 8.';
 const text=[first,second,third].join('\n\n');
 const rows=[first,second,third].map((value,i)=>c('SPOT','','','b'+i,{propertyKey:'travel.mode',valueJson:JSON.stringify(value)}));
 const {result}=project(rows,text);assert.equal(result.value.properties[0].value,[first,second,third].join('\n'));assert.equal(result.citations.length,3);
 const incompatible='Vom Bahnhof SBB: Tram Nr. 11 Richtung Zentrum.';
 const {result:conflict}=project([rows[0],c('SPOT','','','b1',{propertyKey:'travel.mode',valueJson:JSON.stringify(incompatible)})],first+'\n\n'+incompatible);
 assert.equal(conflict.status,'UNRESOLVED');
});
