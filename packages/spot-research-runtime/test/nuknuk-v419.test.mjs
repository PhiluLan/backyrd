import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sourceText,visibleSourceHtml,researchLegalPage} from '../src/nuknuk-sources.mjs';
import {fetchBrowserSource} from '../src/nuknuk-browser-source.mjs';
import {applyResearchHoursPolicy,applyScopedReservationPolicy,researchSpotV2} from '../dist/nuknuk-agent.js';
import {parseScopedCandidates,applyScopedVerdicts,projectScopedResearch,parsePropertyReviewIssues,parseScopedPropertyFacts,planSpotProfileFrontier,createSpotResearchPlan,spotResearchQuestions} from '../dist/nuknuk-spot-plan.js';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
const source=text=>({id:'s1',url:'https://example.org/',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-24T12:00:00Z'});
const field=attributeKey=>({attributeKey,...researchValueContract(attributeKey),...(attributeKey==='experience.profile'?{profileCategory:'DRINKS'}:{})});
const fields=[field('experience.profile')];
const spot={spotId:'11111111-1111-4111-8111-111111111111',name:'Synthetic Bar',existingValues:{'classification.primary_category':{value:'DRINKS'},'contact.website':{value:'https://example.org/'}}};
const candidate=(scope,kind,name,extra={})=>({field:'experience.profile',scope,entityKind:kind,entityName:name,propertyKey:'',valueJson:'null',blockId:'b0',belongsTo:'TARGET',applicability:'CURRENT',condition:'',...extra});
function accept(rows,s,fs=fields){const ledger=parseScopedCandidates({candidates:rows},s,fs,[{id:'b0',text:s.text}]);applyScopedVerdicts({verdicts:ledger.map(c=>({id:c.id,verdict:'SUPPORTED',reasonCode:'DIRECT_SUPPORT',explanation:'The synthetic source explicitly supports the exact scoped fact.',evidenceQuote:s.text}))},ledger,s);return ledger;}
test('all-device hidden website assertions are excluded, responsive and accordion content retained',()=>{
 const html='<main><h1>Bar</h1><section class="elementor-hidden-desktop elementor-hidden-tablet elementor-hidden-mobile"><div>Old no booking</div></section><section class="elementor-hidden-desktop">Mobile rule</section><div class="elementor-tab-content" style="display:none">Accordion details</div></main>';
 const result=sourceText({url:'https://example.org/',contentType:'text/html',body:html,observedAt:'2026-10-24T12:00:00Z'},'s1');
 assert.ok(!result.text.includes('Old no booking'));assert.ok(result.text.includes('Mobile rule'));assert.ok(result.text.includes('Accordion details'));assert.ok(visibleSourceHtml(html).includes('Mobile rule'));
});
for(const text of ['Wir servieren Barfood.','Bei uns gibt es Finger Food.','Wir servieren Snacks.'])test('catalog interpretation accepts evidenced snack service: '+text,()=>{
 const s=source(text),ledger=accept([candidate('OFFER','APERITIF','Apéro / Snacks')],s);assert.equal(ledger[0].state,'ACCEPTED');assert.equal(projectScopedResearch(spot,fields,ledger,[s],validateAuthoringSubmission)[0].value.offers[0].kind,'APERITIF');
 assert.match(createSpotResearchPlan(spot,fields).method.instructions,/Barfood/);
});
test('area booking restrictions survive critic and projection without becoming mandatory',()=>{
 const text='Im Innenbereich reservieren wir gerne Plätze ab 4 bis 30 Personen.';const s=source(text);
 const ledger=accept([candidate('AREA','INDOOR','Innenbereich'),candidate('AREA','INDOOR','Innenbereich',{propertyKey:'participation.booking',valueJson:JSON.stringify(text),applicability:'CONDITIONAL',condition:'ab 4 bis 30 Personen'})],s);
 assert.equal(ledger[1].state,'ACCEPTED');const profile=projectScopedResearch(spot,fields,ledger,[s],validateAuthoringSubmission)[0];assert.equal(profile.value.areas[0].properties[0].value,text);
 const reservation={attributeKey:'rule.reservation',status:'UNRESOLVED'};applyScopedReservationPolicy([profile,reservation],[s],spot,validateAuthoringSubmission);
 assert.equal(reservation.value.mode,'RECOMMENDED');assert.deepEqual(reservation.value.days,[]);assert.equal(reservation.value.minimumPartySize,null);assert.equal(profile.value.areas[0].properties[0].value,text);
});
test('outdoor booking prohibition stays scoped and does not imply recommended or required booking',()=>{
 const text='Auf der Terrasse nehmen wir keine Reservationen entgegen.',s=source(text);
 const ledger=accept([candidate('AREA','TERRACE','Terrasse'),candidate('AREA','TERRACE','Terrasse',{propertyKey:'participation.booking',valueJson:JSON.stringify(text)})],s);
 const profile=projectScopedResearch(spot,fields,ledger,[s],validateAuthoringSubmission)[0],r={attributeKey:'rule.reservation',status:'UNRESOLVED'};
 applyScopedReservationPolicy([profile,r],[s],spot,validateAuthoringSubmission);assert.equal(r.status,'UNRESOLVED');assert.equal(profile.value.areas[0].properties[0].value,text);
});
for(const [title,extra] of [['bar midnight default',''],['explicit kitchen qualification blocks blind default','\nKüchenzeiten ab 18 Uhr']])test(title,()=>{
 const s=source('Synthetic Bar\nÖffnungszeiten\nMONTAG–FREITAG\nab 17 Uhr geöffnet\nSAMSTAG–SONNTAG\nab 16 Uhr geöffnet'+extra),r={attributeKey:'hours.regular',status:'UNRESOLVED',reason:'NO_SUPPORTED_TARGET_FACT'};
 applyResearchHoursPolicy([r],[s],spot,[field('hours.regular'),field('experience.profile')],validateAuthoringSubmission);
 if(extra){assert.equal(r.status,'UNRESOLVED');return;}
 assert.equal(r.value.length,7);assert.deepEqual(r.value[0].intervals,[{start:'17:00',end:'00:00'}]);assert.deepEqual(r.value.at(-1).intervals,[{start:'16:00',end:'00:00'}]);assert.ok(r.derivation.rules.includes('BAR_MISSING_CLOSING_DEFAULT_MIDNIGHT'));assert.ok(r.citations.every(c=>!c.evidence.includes('00:00')));
});
test('conflicting published opening starts do not get a fabricated unified default',()=>{
 const a=source('Synthetic Bar\nÖffnungszeiten\nMontag ab 17 Uhr geöffnet'),b={...source('Synthetic Bar\nÖffnungszeiten\nMontag ab 18 Uhr geöffnet'),id:'s2',url:'https://example.org/hours/'};const r={attributeKey:'hours.regular',status:'UNRESOLVED'};
 applyResearchHoursPolicy([r],[a,b],spot,fields,validateAuthoringSubmission);assert.equal(r.value,undefined);
});
test('actual ambiguous source uses catalog-bound admin issue, never a question-valued fact',()=>{
 const s=source('Zugang erfolgt über den Seiteneingang.'),nodes=[];
 const issue={entity:'SPOT',key:'participation.accessibility',blockId:'b0',reasonCode:'INSUFFICIENT_CONTEXT',explanation:'Der Eingang ist beschrieben, seine Stufenlosigkeit bleibt unbelegt.'};
 const result=parsePropertyReviewIssues({facts:[],reviewIssues:[issue]},nodes,s,[{id:'b0',text:s.text}]);assert.equal(result[0].reviewReason,'INSUFFICIENT_CONTEXT');assert.equal(result[0].sourceHash,s.hash);
 assert.throws(()=>parsePropertyReviewIssues({reviewIssues:[{...issue,explanation:'Stufenlos zugänglich?'}]},nodes,s,[{id:'b0',text:s.text}]));
 assert.throws(()=>parsePropertyReviewIssues({reviewIssues:[{...issue,key:'invented.key'}]},nodes,s,[{id:'b0',text:s.text}]));
});
test('legal source selection is strictly conditional on the three allowed missing contacts',()=>{
 const links=['/impressum','/agb','/privacy','/datenschutz','/terms-of-service'].map(path=>({url:'https://example.org'+path,label:path,depth:1,topics:['contact']}));
 assert.deepEqual(planSpotProfileFrontier(links,fields,[],spotResearchQuestions(fields,[])),[]);
 const fs=[...fields,field('contact.phone')];assert.deepEqual(planSpotProfileFrontier(links,fs,[],spotResearchQuestions(fs,[])).map(p=>p.entry.url),['https://example.org/impressum']);
 assert.equal(researchLegalPage('https://example.org/impressum-und-datenschutzerklarung/'),'CONTACT_ONLY');
});
test('separate literal evidence merges compatible place-type sets without composite quotations',()=>{
 const fs=[field('classification.place_types')],a=source('Unsere Bar begrüsst euch.'),b={...source('Unsere Cocktailbar begrüsst euch.'),id:'s2'};
 const make=type=>candidate('SPOT','','',{field:'classification.place_types',valueJson:JSON.stringify([type])});const ledger=[...accept([make('BAR')],a,fs),...accept([make('COCKTAIL_BAR')],b,fs)];
 assert.deepEqual(projectScopedResearch(spot,fs,ledger,[a,b],validateAuthoringSubmission)[0].value,['BAR','COCKTAIL_BAR']);
});
test('403 triggers browser automatically and preserves successful source acquisition',async()=>{
 let called=0;const report=await researchSpotV2({spot,fields:[field('contact.phone')],skipKnownFields:false,modelPath:'/tmp/8b2b98c00a6b4d291155e4890773ca8f769aee53',maxRequests:2,maxModelCalls:2},{validateValue:validateAuthoringSubmission,fetchPage:async()=>{throw new Error('source_http_403');},browserPage:async url=>{called++;return {url,contentType:'text/html',body:'<main><h1>Synthetic Bar</h1><p>Keine Telefonnummer veröffentlicht.</p></main>',observedAt:'2026-10-24T12:00:00Z'};},modelFetch:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({facts:[]})}}]}))});
 assert.equal(called,1);assert.equal(report.sources.length,1);assert.ok(report.actions.some(a=>a.stage==='SOURCE_BROWSER_FALLBACK'));assert.equal(report.canonicalWrite,false);
});
test('browser refuses private-address navigation before starting a browser',async()=>{
 let launched=false;await assert.rejects(fetchBrowserSource('https://example.org/',{resolve:async()=>[{address:'127.0.0.1'}],launch:async()=>{launched=true;}}),/source_private_address/);assert.equal(launched,false);
});

test('generic terrace booking binds through a literal contiguous span only to one established terrace',()=>{
 const s=source('Unsere Dach-Terrasse bietet Aussicht.\n\nAuf der Terrasse nehmen wir keine Reservationen an.');
 const nodes=[{id:'roof',scope:'AREA',entityKind:'TERRACE',entityName:'Dach-Terrasse'}],block={id:'rule',text:'Auf der Terrasse nehmen wir keine Reservationen an.'};
 const raw={facts:[{entity:'roof',key:'participation.booking',value:block.text,blockId:'rule',condition:''}],reviewIssues:[]};
 const rows=parseScopedPropertyFacts(raw,nodes,s,fields,[block],0);assert.equal(rows[0].reason,'SEMANTIC_CHECK_PENDING');assert.ok(s.text.includes(rows[0].quote));assert.ok(rows[0].quote.includes('Dach-Terrasse'));assert.equal(JSON.parse(rows[0].valueJson),block.text);
 const ambiguous=parseScopedPropertyFacts(raw,[...nodes,{...nodes[0],id:'garden',entityName:'Gartenterrasse'}],s,fields,[block],0);assert.equal(ambiguous[0].reason,'PROPERTY_ENTITY_CONTEXT_REQUIRED');
});

test('a browser-rendered 403 error page is a failure, never a successfully loaded source',async()=>{
 let closed=false;
 const page={on(_event,fn){this.response=fn;},mainFrame(){return this;},goto:async function(){this.response({request:()=>({isNavigationRequest:()=>true}),frame:()=>this,status:()=>403});},waitForFunction:async()=>{},url:()=> 'https://example.org/',title:async()=> '403 Forbidden',content:async()=>'<h1>403 Forbidden</h1>'};
 const browser={newContext:async()=>({route:async()=>{},newPage:async()=>page}),close:async()=>{closed=true;}};
 await assert.rejects(fetchBrowserSource('https://example.org/',{resolve:async()=>[{address:'93.184.215.14'}],launch:async()=>browser}),/source_browser_http_403/);assert.equal(closed,true);
});

test('imprint fallback reads missing contacts only and cuts separately headed privacy content',async()=>{
 const url='https://example.org/impressum-und-datenschutzerklaerung/';
 const report=await researchSpotV2({spot,fields:[field('contact.phone'),field('experience.profile')],sources:[url],skipKnownFields:false,modelPath:'/tmp/8b2b98c00a6b4d291155e4890773ca8f769aee53',maxRequests:1,maxModelCalls:12,discoverLinks:false},{validateValue:validateAuthoringSubmission,fetchPage:async()=>({url,contentType:'text/html',body:'<main><h1>Impressum</h1><h2>Kontakt</h2><p>Telefon auf Anfrage.</p><h2>Datenschutz</h2><p>Datenschutzstelle: +41 61 123 45 67</p><p>Unsere vermeintliche Sauna ist hier kein Besucherangebot.</p></main>',observedAt:'2026-10-24T12:00:00Z'}),modelFetch:async()=>{throw Error('No model work should be needed for this contact-free imprint fixture');}});
 assert.equal(report.sources.length,1);assert.ok(!report.sources[0].text.includes('Datenschutzstelle'));assert.ok(!report.sources[0].text.includes('Sauna'));assert.equal(report.modelCalls,0);assert.equal(report.scopedLedger.length,0);
});

test('free text property values come from immutable blocks rather than model-retyped quotations',()=>{
 const text='Im Innenbereich reservieren wir gerne Plätze ab 4 bis 30 Personen.',s=source(text),node={id:'inside',scope:'AREA',entityKind:'INDOOR',entityName:'Innenbereich'};
 const rows=parseScopedPropertyFacts({facts:[{entity:'inside',key:'participation.booking',value:'SOURCE_BLOCK',blockId:'b0',condition:''}],reviewIssues:[]},[node],s,fields,[{id:'b0',text}],0);
 assert.equal(JSON.parse(rows[0].valueJson),text);assert.equal(rows[0].reason,'SEMANTIC_CHECK_PENDING');
});

test('a literal FAQ answer stays evidence while a question alone cannot become a property',()=>{
 const text='Ist der Eingang stufenlos? Ja, der Eingang ist stufenlos erreichbar.',s=source(text);
 const row=candidate('SPOT','','',{propertyKey:'participation.accessibility',valueJson:JSON.stringify(text)});
 assert.equal(parseScopedCandidates({candidates:[row]},s,fields,[{id:'b0',text}])[0].reason,'SEMANTIC_CHECK_PENDING');
 const question='Stufenlos zugänglich?',q=source(question);
 const bad={...row,valueJson:JSON.stringify(question)};
 assert.equal(parseScopedCandidates({candidates:[bad]},q,fields,[{id:'b0',text:question}])[0].reason,'UNKNOWN_PLACEHOLDER_NOT_A_FACT');
});

test('canonical activity labels reach the independent critic without requiring the website to repeat the catalog wording',()=>{
 const s=source('Bei uns treten jeden Freitag DJs auf und spielen live ihre Sets.'),rows=parseScopedCandidates({candidates:[candidate('OFFER','MUSIC_EVENT','Musikveranstaltung')]},s,fields,[{id:'b0',text:s.text}]);
 assert.equal(rows[0].reason,'SEMANTIC_CHECK_PENDING');assert.equal(rows[0].state,'HELD');
 applyScopedVerdicts({verdicts:[{id:rows[0].id,verdict:'UNSUPPORTED',reasonCode:'NOT_ENTAILED',explanation:'The independent synthetic critic rejects the proposed service interpretation.',evidenceQuote:s.text}]},rows,s);assert.equal(rows[0].state,'REJECTED');
});

test('duplicate-evidence notices remain in the audit without creating an Admin uncertainty',async()=>{
 const report=await researchSpotV2({spot,fields,skipKnownFields:false,modelPath:'/tmp/8b2b98c00a6b4d291155e4890773ca8f769aee53',maxRequests:1,maxModelCalls:8,discoverLinks:false},{validateValue:validateAuthoringSubmission,fetchPage:async url=>({url,contentType:'text/html',body:'<main><h1>Synthetic Bar</h1><p>Dieselbe veröffentlichte Aussage steht in zwei Sprachversionen.</p></main>',observedAt:'2026-10-24T12:00:00Z'}),modelFetch:async(_url,init)=>{
 const data=JSON.parse(JSON.parse(init.body).messages[1].content);const value=data.phase==='ENTITIES'?{candidates:[]}:{facts:[],reviewIssues:[{entity:'SPOT',key:'offer.feature',blockId:data.blocks.find(b=>b.text.includes('Sprachversionen')).id,reasonCode:'DUPLICATE_EVIDENCE',explanation:'Die zweite Sprachversion bestätigt dieselbe Angabe ohne Widerspruch.'}]};
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
 }});
 assert.deepEqual(report.adminReviewIssues,[]);assert.ok(report.modelAudit.some(call=>call.rawOutput?.includes('DUPLICATE_EVIDENCE')));
});

test('a generic food and drinks list establishes a snack service but never a named dish even if a critic approves it',()=>{
 const text='Wir servieren eine grosse Auswahl an Cocktails, Bieren, Weinen und Barfood.',s=source(text);
 const ledger=accept([candidate('OFFER','APERITIF','Apéro / Snacks'),candidate('OFFER','APERITIF','Apéro / Snacks',{propertyKey:'food.dish',valueJson:JSON.stringify(text)})],s);
 assert.equal(ledger[0].state,'ACCEPTED');assert.equal(ledger[1].state,'HELD');assert.equal(ledger[1].reason,'GENERIC_SERVICE_NOT_NAMED_DISH');
 const result=projectScopedResearch(spot,fields,ledger,[s],validateAuthoringSubmission)[0];assert.equal(result.value.offers[0].kind,'APERITIF');assert.deepEqual(result.value.offers[0].properties,[]);assert.equal(result.reviewEvidence[0].propertyKey,'food.dish');assert.match(result.reviewEvidence[0].reviewExplanation,/kein konkretes Gericht/);
});
