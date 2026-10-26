import test from 'node:test';
import assert from 'node:assert/strict';
import {createRestaurantResearchContext,restaurantTaskInstructions,restaurantSourceTier,restaurantEvidenceWindows,restaurantFieldHasEvidence,RESTAURANT_RESEARCH_FIELDS,RESTAURANT_RESEARCH_PRIORITIES} from '../dist/nuknuk-research-context.js';
import {BACKYRD_RESEARCH_METHOD,createSpotResearchPlan,scopedEntitySchema} from '../dist/nuknuk-spot-plan.js';
import {researchSpotV2} from '../dist/nuknuk-agent.js';
import {sourceText} from '../src/nuknuk-sources.mjs';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
const field=attributeKey=>({attributeKey,...researchValueContract(attributeKey),profileCategory:'EAT'});
const spot={spotId:'11111111-1111-4111-8111-111111111111',name:'Test Restaurant',locality:'Basel',existingValues:{'classification.primary_category':{value:'EAT'},'contact.website':{value:'https://example.org/'}}};
const fs=[field('identity.name'),field('contact.instagram'),field('experience.profile')];
const opts={spot,fields:fs,restaurantWorkingContext:true,skipKnownFields:false,modelPath:'/tmp/8b2b98c00a6b4d291155e4890773ca8f769aee53',maxRequests:1,maxModelCalls:8,discoverLinks:false};
const html='<main><h1>Test Restaurant</h1><p>Auf unserer Terrasse servieren wir Mittagessen.</p></main><footer><a href="https://www.instagram.com/testrestaurant/" aria-label="Instagram"></a></footer>';
const reply=(value,cached)=>new Response(JSON.stringify({usage:{prompt_tokens:100,completion_tokens:20,...(cached===undefined?{}:{prompt_tokens_details:{cached_tokens:cached}})},choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
const entity=(scope,kind,name,blockId)=>({scope,entityKind:kind,entityName:name,blockId});
test('restaurant lexicon is immutable and does not embed prior venue facts or changing target text',()=>{
 const a=createRestaurantResearchContext(spot,fs),b=createRestaurantResearchContext({...spot,name:'Other Restaurant',existingValues:{'classification.primary_category':{value:'EAT'},'contact.phone':{value:'+41 secret fixture'}}},fs);
 assert.equal(a.system,b.system);assert.equal(a.prefixHash,b.prefixHash);assert.ok(Object.isFrozen(a));assert.ok(!a.system.includes('secret fixture'));assert.ok(!a.system.includes('Test Restaurant'));assert.ok(a.system.includes(BACKYRD_RESEARCH_METHOD.instructions));assert.ok(a.system.includes('Mittagessen'));
 const instructions=restaurantTaskInstructions(BACKYRD_RESEARCH_METHOD.instructions+'\nFind actual visitor services.');assert.equal(instructions,'Find actual visitor services.');
});
test('restaurant default commission includes actual canonical public contact and social contracts',()=>{
 for(const key of ['identity.name','location.address_line1','location.locality','contact.website','contact.phone','contact.public_email','contact.instagram','contact.facebook','contact.tiktok','contact.linkedin','hours.regular','hours.kitchen'])assert.ok(RESTAURANT_RESEARCH_FIELDS.includes(key),key);
 for(const key of RESTAURANT_RESEARCH_FIELDS)assert.ok(researchValueContract(key).valueSchema,key);
 assert.ok(RESTAURANT_RESEARCH_FIELDS.length<=24);assert.equal(RESTAURANT_RESEARCH_PRIORITIES[0],'IDENTITY_AND_PUBLIC_CONTACT');assert.equal(RESTAURANT_RESEARCH_PRIORITIES[1],'OPENING_AND_KITCHEN_HOURS');
});
test('source hierarchy prefers open contacts, then hours, and releases later stages when basics are missing',()=>{
 const entry=topics=>({depth:1,topics});const pending=['contact.public_email','hours.regular','experience.profile'];
 assert.ok(restaurantSourceTier(entry(['contact']),pending)<restaurantSourceTier(entry(['hours']),pending));assert.ok(restaurantSourceTier(entry(['hours']),pending)<restaurantSourceTier(entry(['experience']),pending));
 assert.equal(restaurantSourceTier(entry(['contact']),['experience.profile']),5);assert.equal(restaurantSourceTier(entry(['experience']),pending),3);assert.equal(restaurantSourceTier({depth:0,topics:[]},pending),0);
});
test('combined entity schema retains 16 places per scope, valid typed catalog branches and no SPOT facts',()=>{
 const schema=scopedEntitySchema([{id:'b0'}],'BOTH',createSpotResearchPlan(spot,fs));
 assert.equal(schema.properties.candidates.maxItems,32);const branches=schema.properties.candidates.items.anyOf;assert.deepEqual(branches.map(v=>v.properties.scope.const),['AREA','OFFER']);assert.ok(branches[0].properties.entityKind.enum.includes('TERRACE'));assert.ok(branches[1].properties.entityKind.enum.includes('LUNCH'));assert.ok(branches.every(v=>v.properties.propertyKey.const===''));
});
test('source reader retains published icon profile URLs, excludes hidden/share links and does not infer ownership',()=>{
 const page=sourceText({url:'https://example.org/',body:html+'<script>const markup="<a href=\"https://instagram.com/script-only\">fake</a>";</script><!-- <a href="https://instagram.com/comment-only">fake</a> --><a hidden href="https://facebook.com/hidden-profile">X</a><a href="https://facebook.com/sharer/sharer.php?u=example.org">Share</a><a href="https://www.linkedin.com/company/testrestaurant/">LinkedIn</a>',contentType:'text/html',observedAt:'2026-10-24T12:00:00Z'},'s1');
 assert.ok(page.text.includes('Instagram: https://www.instagram.com/testrestaurant/'));assert.ok(page.text.includes('LinkedIn: https://www.linkedin.com/company/testrestaurant/'));assert.ok(!page.text.includes('hidden-profile'));assert.ok(!page.text.includes('sharer.php'));assert.ok(!page.text.includes('Instagram: https://instagram.com/script-only'));assert.ok(!page.text.includes('Instagram: https://instagram.com/comment-only'));
});
async function runFixture({supported=true,reportCache=true}={}){
 const inputs=[];
 const report=await researchSpotV2(opts,{validateValue:validateAuthoringSubmission,fetchPage:async url=>({url,contentType:'text/html',body:html,observedAt:'2026-10-24T12:00:00Z'}),modelFetch:async(_url,init)=>{
  const req=JSON.parse(init.body),d=JSON.parse(req.messages[1].content);inputs.push(req);let value;
  if(d.phase==='ENTITIES'){
   assert.equal(d.scope,'BOTH');assert.deepEqual(req.response_format.json_schema.schema.properties.candidates.items.required,['scope','entityKind','entityName','blockId']);assert.equal(d.plan.offers,undefined);assert.equal(d.plan.areas,undefined);
   const b=d.blocks.find(b=>b.text.includes('servieren'));value={candidates:[entity('AREA','TERRACE','Terrasse',b.id),entity('OFFER','LUNCH','Mittagessen',b.id)]};
  }else if(d.phase==='PROPERTIES')value={facts:[],reviewIssues:[]};
  else if(d.fields){
   const name=d.blocks.find(b=>b.text==='Test Restaurant'),social=d.blocks.find(b=>b.text.includes('https://www.instagram.com/testrestaurant/'));
   value={facts:[{field:'identity.name',value:'Test Restaurant',blockId:name.id,belongsTo:'TARGET',condition:''},{field:'contact.instagram',value:'https://www.instagram.com/testrestaurant/',blockId:social.id,belongsTo:'TARGET',condition:''}]};
  }else if(d.candidates){
   assert.deepEqual(d.researchState,{mode:'INDEPENDENT_EVIDENCE_CHECK'});
   value={verdicts:d.candidates.map(c=>({id:c.id,reasonCode:supported?'DIRECT_SUPPORT':'NOT_ENTAILED',explanation:supported?'The original published source explicitly supports the exact scoped claim.':'This synthetic verdict withholds the claim to test independent evidence rejection.'}))};
  }else throw Error('Unexpected task');
  return reply(value,reportCache?(inputs.length===1?0:20):undefined);
 }});return {report,inputs};
}
test('restaurant workflow uses one fixed lexicon, extracts basics first and combines entities without losing critic',async()=>{
 const {report,inputs}=await runFixture();assert.equal(inputs.length,4);assert.equal(report.modelCalls,4);assert.ok(JSON.parse(inputs[0].messages[1].content).fields);assert.equal(new Set(inputs.map(req=>req.messages[0].content)).size,1);
 assert.ok(report.modelAudit.some(a=>a.stage==='EXTRACT_SPOT_ENTITIES'));assert.ok(!report.modelAudit.some(a=>a.stage==='EXTRACT_SPOT_AREAS'||a.stage==='EXTRACT_SPOT_OFFERS'));assert.ok(report.modelAudit.some(a=>a.stage==='VERIFY_SPOT'));
 const profile=report.results.find(r=>r.attributeKey==='experience.profile');assert.equal(profile.value.offers[0].kind,'LUNCH');assert.equal(profile.value.areas[0].kind,'TERRACE');assert.equal(report.results.find(r=>r.attributeKey==='contact.instagram').value,'https://www.instagram.com/testrestaurant/');
 assert.equal(report.researchPlan.workingContext.cacheReuseObserved,true);assert.equal(report.researchPlan.workingContext.cacheReportingAvailable,true);assert.ok(report.modelAudit.every(a=>a.workingContextHash===report.researchPlan.workingContext.prefixHash));assert.equal(report.canonicalWrite,false);assert.equal(report.importable,false);
});
test('cache reporting absence is unknown, not invented reuse or an inferred server setting',async()=>{
 const {report}=await runFixture({reportCache:false});assert.equal(report.researchPlan.workingContext.cacheReuseObserved,false);assert.equal(report.researchPlan.workingContext.cacheReportingAvailable,false);assert.ok(report.modelAudit.every(a=>a.cachedPromptTokens===undefined));
});
test('combined extraction never bypasses an independent critic rejection',async()=>{
 const {report}=await runFixture({supported:false});const profile=report.results.find(r=>r.attributeKey==='experience.profile');assert.equal(profile.value,undefined);assert.ok(report.scopedLedger.some(c=>c.state==='REJECTED'));assert.equal(report.canonicalWrite,false);
});
test('restaurant-only context cannot silently apply to a zoo or malformed configuration',async()=>{
 const deps={validateValue:validateAuthoringSubmission};await assert.rejects(researchSpotV2({...opts,fields:[{...field('experience.profile'),profileCategory:'ZOO'}],spot:{...spot,existingValues:{'classification.primary_category':{value:'ZOO'}}}},deps),/restaurant_context_requires_restaurant/);
 await assert.rejects(researchSpotV2({...opts,restaurantWorkingContext:'yes'},deps),/restaurant_context_invalid/);
});

test('actual source selection reads contact and hours before menu despite other open profile questions',async()=>{
 const visited=[];
 const report=await researchSpotV2({...opts,fields:[field('contact.phone'),field('hours.regular'),field('experience.profile')],maxRequests:4,maxModelCalls:48,discoverLinks:true},{validateValue:validateAuthoringSubmission,fetchPage:async url=>{
  visited.push(url);return {url,contentType:'text/html',observedAt:'2026-10-24T12:00:00Z',body:url==='https://example.org/'?'<main><h1>Test Restaurant</h1><a href="/speisekarte/">Speisekarte</a><a href="/oeffnungszeiten/">Öffnungszeiten</a><a href="/kontakt/">Kontakt</a></main>':'<main><h1>Test Restaurant</h1><p>Informationen auf Anfrage.</p></main>'};
 },modelFetch:async(_url,init)=>{const d=JSON.parse(JSON.parse(init.body).messages[1].content);return reply(d.phase==='ENTITIES'?{candidates:[]}:d.phase==='PROPERTIES'?{facts:[],reviewIssues:[]}:d.candidates?{verdicts:[]}:d.claims?{verdicts:[]}:{facts:[],nextLinks:[]});}});
 assert.deepEqual(visited,['https://example.org/','https://example.org/kontakt/','https://example.org/oeffnungszeiten/','https://example.org/speisekarte/']);
 assert.ok(report.actions.filter(a=>a.stage==='SOURCE_SELECTION').every(a=>a.strategy==='RESTAURANT_CONTACT_HOURS_FIRST'));
});

test('restaurant contact pages do not run offer/property work or invent missing social searches',async()=>{
 const tasks=[];
 const report=await researchSpotV2({...opts,fields:[field('contact.tiktok'),field('experience.profile')],sources:['https://example.org/kontakt/'],maxRequests:1},{validateValue:validateAuthoringSubmission,
 fetchPage:async url=>({url,contentType:'text/html',observedAt:'2026-10-24T12:00:00Z',body:'<main><h1>Kontakt</h1><p>Unsere Mitarbeiterinnen beantworten gerne Ihre Fragen.</p></main>'}),
 modelFetch:async(_url,init)=>{const d=JSON.parse(JSON.parse(init.body).messages[1].content);tasks.push(d);return reply(d.phase==='ENTITIES'?{candidates:[]}:d.phase==='PROPERTIES'?{facts:[],reviewIssues:[]}:{facts:[]});}});
 assert.equal(report.modelCalls,0);assert.deepEqual(tasks,[]);assert.equal(report.results.find(r=>r.attributeKey==='contact.tiktok').status,'UNRESOLVED');
});
test('published language alternate is not fetched and reprocessed after primary source',async()=>{
 const visited=[];
 const report=await researchSpotV2({...opts,fields:[field('experience.profile')],maxRequests:4,maxModelCalls:48,discoverLinks:true},{validateValue:validateAuthoringSubmission,
 fetchPage:async url=>{visited.push(url);return {url,contentType:'text/html',observedAt:'2026-10-24T12:00:00Z',body:'<link rel="alternate" hreflang="de" href="https://example.org/"><link rel="alternate" hreflang="en" href="https://example.org/en/restaurant/"><main><h1>Restaurant</h1><p>Wir servieren Mittagessen auf unserer Terrasse.</p><a href="/en/restaurant/">Restaurant English</a></main>'};},
 modelFetch:async(_url,init)=>{const d=JSON.parse(JSON.parse(init.body).messages[1].content);return reply(d.phase==='ENTITIES'?{candidates:[]}:d.phase==='PROPERTIES'?{facts:[],reviewIssues:[]}:{facts:[]});}});
 assert.deepEqual(visited,['https://example.org/']);assert.ok(report.actions.some(a=>a.stage==='EXPLICIT_TRANSLATION_DEFERRED'));assert.equal(report.canonicalWrite,false);
});
test('critic evidence IDs must reference immutable source evidence; invented IDs fail closed',async()=>{
 const report=await researchSpotV2({...opts,fields:[field('experience.profile')]},{validateValue:validateAuthoringSubmission,
 fetchPage:async url=>({url,contentType:'text/html',body:html,observedAt:'2026-10-24T12:00:00Z'}),
 modelFetch:async(_url,init)=>{const d=JSON.parse(JSON.parse(init.body).messages[1].content);return reply(d.phase==='ENTITIES'?{candidates:[entity('AREA','TERRACE','Terrasse',d.blocks.find(b=>b.text.includes('servieren')).id)]}:d.phase==='PROPERTIES'?{facts:[],reviewIssues:[]}:{verdicts:d.candidates.map(c=>({id:'invented',reasonCode:'DIRECT_SUPPORT',explanation:'The terrace is explicitly described in the original source.'}))});}});
 assert.ok(report.modelAudit.some(a=>a.error==='DECISION_EVIDENCE_ID_INVALID'));assert.ok(!report.scopedLedger.some(c=>c.state==='ACCEPTED'));assert.equal(report.results.find(r=>r.attributeKey==='experience.profile').value,undefined);
});
test('restaurant amenity uses only the canonical typed lane, never the second legacy extractor',async()=>{
 const stages=[];
 const report=await researchSpotV2({...opts,fields:[field('amenity.features')],maxModelCalls:8},{validateValue:validateAuthoringSubmission,
 fetchPage:async url=>({url,contentType:'text/html',observedAt:'2026-10-24T12:00:00Z',body:'<main><h1>Restaurant</h1><p>WLAN ist für unsere Gäste kostenlos verfügbar.</p></main>'}),
 modelFetch:async(_url,init)=>{const d=JSON.parse(JSON.parse(init.body).messages[1].content);stages.push(d.fields?'TYPED':d.questions?'LEGACY':'OTHER');return reply({facts:[]});}});
 assert.equal(report.modelCalls,1);assert.deepEqual(stages,['TYPED']);assert.ok(!report.modelAudit.some(a=>a.stage==='EXTRACT'));
});

test('overlapping critic context is transmitted once with exact original offsets and separate distant branches',()=>{
 const text='a'.repeat(400)+'Venue A: First assertion.'+'b'.repeat(100)+'Second assertion.'+'c'.repeat(1000)+'Venue B: Distant assertion.'+'d'.repeat(400);
 const claims=[{quote:'First assertion.'},{quote:'Second assertion.'},{quote:'Distant assertion.'}];const windows=restaurantEvidenceWindows(text,claims);
 assert.equal(windows.length,2);assert.ok(windows[0].text.includes('Venue A:'));assert.ok(windows[1].text.includes('Venue B:'));for(const w of windows)assert.equal(w.text,text.slice(w.start,w.end));
 assert.ok(windows.reduce((n,w)=>n+w.text.length,0)<claims.reduce((n,c)=>n+c.quote.length+600,0));
 assert.throws(()=>restaurantEvidenceWindows(text,[{quote:'Invented passage'}]),/CRITIC_SOURCE_SPAN_INVALID/);
 assert.throws(()=>restaurantEvidenceWindows(text,[{quote:'First assertion.',sourceOffset:1}]),/CRITIC_SOURCE_SPAN_INVALID/);
});
test('hours without published weekdays stay reviewable without asking the model to guess days',async()=>{
 for(const t of ['12 – 14 Uhr','18:00–22:00'])assert.equal(restaurantFieldHasEvidence('hours.regular',t),false);
 for(const t of ['Mo–Fr 12–14 Uhr','täglich 12–14 Uhr','Monday 12:00–14:00','lundi 12–14','weekday 1 12–14'])assert.equal(restaurantFieldHasEvidence('hours.regular',t),true,t);
 const report=await researchSpotV2({...opts,fields:[field('hours.regular')]},{validateValue:validateAuthoringSubmission,fetchPage:async url=>({url,contentType:'text/html',body:'<main><h1>Restaurant</h1><p>12 – 14 Uhr</p><p>18 – 22 Uhr</p></main>',observedAt:'2026-10-24T12:00:00Z'}),modelFetch:async()=>{throw Error('No weekday evidence should not spend a model call');}});
 assert.equal(report.modelCalls,0);const hours=report.results.find(r=>r.attributeKey==='hours.regular');assert.equal(hours.status,'UNRESOLVED');assert.equal(hours.reason,'PUBLISHED_TIMES_WITHOUT_CONFIRMED_WEEKDAYS');assert.ok(hours.reviewEvidence.some(e=>e.evidence.includes('12 – 14 Uhr')));
});
for(const supported of [true,false])test(`literal contact projection survives an empty typed lane (critic supported=${supported})`,async()=>{
 const report=await researchSpotV2({...opts,fields:[field('contact.phone'),field('contact.public_email')]},{validateValue:validateAuthoringSubmission,
 fetchPage:async url=>({url,contentType:'text/html',body:'<main><h1>Test Restaurant</h1><p>Kontakt zum Test Restaurant</p><a href="tel:+41616909130">+41 61 690 91 30</a><a href="mailto:kontakt@cafefixture.ch">kontakt@cafefixture.ch</a></main>',observedAt:'2026-10-24T12:00:00Z'}),
 modelFetch:async(_url,init)=>{const d=JSON.parse(JSON.parse(init.body).messages[1].content);assert.ok(d.claims);assert.ok(d.questions.every(q=>['contact.phone','contact.public_email'].includes(q.field)));return reply({verdicts:d.claims.map(c=>({factId:c.id,verdict:supported?'SUPPORTED':'UNSUPPORTED',subject:'TARGET',applicability:'CURRENT',restrictionQuote:'',belongsTo:'TARGET',reasonCode:supported?'DIRECT_SUPPORT':'NOT_ENTAILED',explanation:supported?'The exact venue publishes this literal public contact.':'This fixture deliberately rejects attribution to verify that rejection is preserved.',evidenceQuote:c.quote}))});}});
 for(const key of ['contact.phone','contact.public_email']){const result=report.results.find(r=>r.attributeKey===key);assert.equal(result.status,supported?'REQUIRES_REVIEW':'UNRESOLVED');if(supported)assert.ok(result.value);}
 assert.equal(report.canonicalWrite,false);
});

test('active published table booking link is a review draft under the agreed rule, without guessed days or model work',async()=>{
 const report=await researchSpotV2({...opts,fields:[field('rule.reservation')]},{validateValue:validateAuthoringSubmission,
 fetchPage:async url=>({url,contentType:'text/html',observedAt:'2026-10-24T12:00:00Z',body:'<main><h1>Test Restaurant</h1><a href="https://booking.example.org/table">Tisch reservieren</a></main>'}),
 modelFetch:async()=>{throw Error('The fixed published-button rule needs no model call');}});
 assert.equal(report.modelCalls,0);const reservation=report.results.find(r=>r.attributeKey==='rule.reservation');assert.equal(reservation.status,'REQUIRES_REVIEW');assert.deepEqual(reservation.value,{mode:'RECOMMENDED',minimumPartySize:null,days:[],fromTime:null,toTime:null});assert.equal(reservation.humanReviewRequired,true);assert.ok(reservation.citations.some(c=>c.evidence==='Tisch reservieren'&&c.sourceHash&&c.observedAt));assert.equal(report.scopedLedger[0].reason,'PUBLISHED_TABLE_BUTTON_RECOMMENDED');assert.equal(report.scopedLedger[0].modelDecision,undefined);assert.equal(report.canonicalWrite,false);
});
for(const [label,body] of [
 ['hotel room booking','<a href="/zimmer/">Zimmer buchen</a>'],
 ['plain text without a link','<p>Tisch reservieren</p>'],
 ['disabled link','<a aria-disabled="true" href="/table/">Tisch reservieren</a>'],
 ['hidden link','<a hidden href="/table/">Tisch reservieren</a>'],
 ['script-only link','<script>const a="<a href=\'/table/\'>Tisch reservieren</a>";</script>'],
 ['explicit booking prohibition','<a href="/table/">Tisch reservieren</a><p>Wir nehmen keine Reservationen entgegen.</p>']
])test(`table booking derivation does not accept ${label}`,async()=>{
 const report=await researchSpotV2({...opts,fields:[field('rule.reservation')]},{validateValue:validateAuthoringSubmission,fetchPage:async url=>({url,contentType:'text/html',observedAt:'2026-10-24T12:00:00Z',body:'<main><h1>Test Restaurant</h1>'+body+'</main>'}),modelFetch:async()=>reply({facts:[]})});
 assert.ok(!report.scopedLedger.some(c=>c.reason==='PUBLISHED_TABLE_BUTTON_RECOMMENDED'));assert.equal(report.results.find(r=>r.attributeKey==='rule.reservation').status,'UNRESOLVED');assert.equal(report.canonicalWrite,false);
});
test('compact place catalog preserves every canonical label and kind',async()=>{
 let catalog;
 const fields=[field('classification.place_types')];
 await researchSpotV2({...opts,fields},{validateValue:validateAuthoringSubmission,fetchPage:async url=>({url,contentType:'text/html',observedAt:'2026-10-24T12:00:00Z',body:'<main><h1>Test Restaurant</h1></main>'}),modelFetch:async(_url,init)=>{catalog=JSON.parse(JSON.parse(init.body).messages[1].content).placeTypeCatalog;return reply({facts:[]});}});
 const original=createSpotResearchPlan(spot,fields).placeTypes;assert.deepEqual(catalog,Object.fromEntries(original.map(({kind,label})=>[kind,label])));assert.ok(JSON.stringify(catalog).length<JSON.stringify(original).length);
});

test('critic receives explicit existence assertions rather than empty property storage columns',async()=>{
 const {inputs}=await runFixture();const task=inputs.map(r=>JSON.parse(r.messages[1].content)).find(d=>d.candidates);
 const exists=task.candidates.filter(c=>['PHYSICAL_AREA_EXISTS','VISITOR_SERVICE_EXISTS'].includes(c.claimType));assert.equal(exists.length,2);
 for(const c of exists){assert.equal(c.propertyKey,undefined);assert.equal(c.value,undefined);assert.equal(c.valueJson,undefined);assert.ok(c.assertion);assert.ok(!('state' in c));}
});

test('restaurant contact pages cannot attach transit directions to unrelated established dining services',async()=>{
 const captured=[];
 const report=await researchSpotV2({...opts,fields:[field('experience.profile')],sources:['https://example.org/','https://example.org/kontakt/'],maxRequests:2,maxModelCalls:12},{validateValue:validateAuthoringSubmission,
 fetchPage:async url=>({url,contentType:'text/html',observedAt:'2026-10-25T12:00:00Z',body:url.endsWith('/kontakt/')?'<main><h1>Test Restaurant Kontakt</h1><p>Vom Bahnhof SBB: Tram Nr. 8 Richtung Stadtmitte.</p></main>':'<main><h1>Test Restaurant</h1><p>Wir servieren Mittagessen.</p></main>'}),
 modelFetch:async(_url,init)=>{const d=JSON.parse(JSON.parse(init.body).messages[1].content);captured.push(d);
 if(d.phase==='ENTITIES')return reply({candidates:[entity('OFFER','LUNCH','Mittagessen',d.blocks.find(b=>b.text.includes('servieren')).id)]});
 if(d.phase==='PROPERTIES')return reply({facts:[],reviewIssues:[]});
 if(d.candidates)return reply({verdicts:d.candidates.map(c=>({id:c.id,reasonCode:'DIRECT_SUPPORT',explanation:'The literal source explicitly supports the scoped fixture assertion.'}))});
 throw Error('Unexpected task');}
 });
 const contact=captured.find(d=>d.phase==='PROPERTIES'&&d.blocks.some(b=>b.text.includes('Vom Bahnhof')));assert.ok(contact);assert.deepEqual(contact.nodes,[]);
 assert.ok(report.results.find(r=>r.attributeKey==='experience.profile').value.properties.some(p=>p.key==='travel.mode'));assert.equal(report.canonicalWrite,false);
});
