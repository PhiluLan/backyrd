import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {researchSpotV2,validateEvidenceFacts,projectEvidenceLedger,rankResearchFrontier} from '../dist/nuknuk-agent.js';
import {discoverResearchLinks,discoverPublicDataSources,sourceText,readSourceText} from '../src/nuknuk-sources.mjs';
import {NUKNUK_MODEL_REVISION,fieldCandidates} from '../src/nuknuk-research.mjs';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
const spot={spotId:'11111111-1111-4111-8111-111111111111',name:'Synthetic Restaurant',existingValues:{'classification.primary_category':{value:'EAT'},'contact.website':{value:'https://example.org/'},'location.country_code':{value:'CH'},'location.address_line1':{value:'Teststrasse 1'}}};
const field=attributeKey=>({attributeKey,...researchValueContract(attributeKey)});
const fields=['contact.phone','hours.regular','amenity.features','operation.laptop_policy','experience.profile'].map(field);
const source=(text,id='s1')=>({id,text,url:'https://example.org/',observedAt:new Date().toISOString(),hash:createHash('sha256').update(text).digest('hex')});
const fact=(field,value,quote,extra={})=>({field,value,quote,subject:'TARGET',subjectLabel:spot.name,belongsTo:'TARGET',applicability:'CURRENT',condition:'',validFrom:null,validUntil:null,polarity:'AFFIRMATIVE',offerKind:'',...extra});
const ledger=(facts,s)=>validateEvidenceFacts({facts},s,fields).map(f=>({...f,state:'ACCEPTED'}));
const reply=value=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
const opts={spot,fields:[field('contact.phone')],modelPath:'/tmp/'+NUKNUK_MODEL_REVISION,maxRequests:4,maxModelCalls:8};
const deps={validateValue:validateAuthoringSubmission};
test('research links include scoped information pages and reject external/action URLs',()=>{
 const links=discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:'<a href="/besuch">Besuch</a><a href="/besuch/barrierefrei">Zugang</a><a href="https://evil.org/kontakt">Kontakt</a><a href="/login">Contact</a><a href="/reservation">Öffnungszeiten</a>'});
 assert.deepEqual(links.map(x=>x.url),['https://example.org/besuch','https://example.org/besuch/barrierefrei']);
});
test('template expressions are not followed and a late official contact link survives large navigation',()=>{
 const menu=Array.from({length:130},(_,i)=>`<a href="/topic/${i}">Weitere Informationen</a>`).join('');
 const links=discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:menu+'<a href="/de/MenuURLRubrik_de ==">Menü</a><a href="/de/restaurants/browser1.location.pathname.contains(">Restaurants</a><a href="/de/zoobasel/scBackToRubrikLink.data.BackToRubrikLink">Zurück</a><a href="/de/kontakt/">Kontakt</a>'});
 assert.equal(links.length,120);
 assert.ok(links.some(x=>x.url==='https://example.org/de/kontakt/'));
 assert.ok(!links.some(x=>x.url.includes('MenuURL')||x.url.includes('browser1')));
});
test('public client-data discovery follows only observed read-only same-host endpoints',()=>{
 const page={url:'https://zoo.example.org/de/zoobesuch/r/1/oeffnungszeiten/',contentType:'text/html',body:'{{Oeffnungszeit_de}}<dmx-serverconnect id="scOeffnungszeiten" url="/dmxConnect/api/Website/de/Oeffnungszeiten.php" dmx-param:wrid="query.wrid"><dmx-serverconnect id="scStatsPage" url="/dmxConnect/api/Website/Stats/Oeffnungszeiten.php"><dmx-serverconnect id="scOther" url="https://evil.org/dmxConnect/api/Website/Oeffnungszeiten.php"><dmx-serverconnect id="scKontakt" url="/dmxConnect/api/Website/de/Kontakt.php" dmx-param:uid="query.missing">'};
 assert.deepEqual(discoverPublicDataSources(page).map(x=>x.url),['https://zoo.example.org/dmxConnect/api/Website/de/Oeffnungszeiten.php?wrid=1']);
 assert.deepEqual(discoverPublicDataSources({...page,body:page.body.replace('{{Oeffnungszeit_de}}','') }),[]);
});
test('seasonal JSON hours remain source-bound evidence, not a permanent weekly schedule',async()=>{
 const body=JSON.stringify({repeatOeffnungszeitenKategorien:[{Kategorie_de:'Öffnungszeiten',repeatOeffnungszeiten:[{Datum:'1970-01-01',Tag_de:'Januar bis Februar',Oeffnungszeit_de:'8.00 bis 17.30 Uhr'},{Tag_de:'Mai bis August Montag bis Freitag',Oeffnungszeit_de:'8.00 bis 18.30 Uhr'}]},{Kategorie_de:'Restaurant',repeatOeffnungszeiten:[{Tag_de:'Montag bis Freitag',Oeffnungszeit_de:'9.00 bis 17.30 Uhr'}]}]});
 const s=await readSourceText({url:'https://zoo.example.org/dmxConnect/api/Website/de/Oeffnungszeiten.php?wrid=1',contentType:'application/json',body,observedAt:new Date().toISOString()},'s1');
 assert.equal(s.format,'JSON_TEXT');assert.equal(s.seasonalSchedule,true);assert.match(s.text,/Kategorie: Restaurant/);assert.doesNotMatch(s.text,/1970-01-01/);
 const quote='Tag: Mai bis August Montag bis Freitag';
 const facts=validateEvidenceFacts({facts:[fact('hours.regular','Montag bis Freitag 8.00 bis 18.30 Uhr',quote)]},s,[field('hours.regular')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot,fields:[field('hours.regular')],facts,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('permanent Spot research does not crawl event and news detail pages',()=>{
 const links=discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:'<a href="/konzert/band">Live-Musik</a><a href="/news/opening-hours">Öffnungszeiten</a><a href="/events/2026-10-20">Programm</a><a href="/besuch/ihrevent">Ihr Event</a><a href="/oeffnungszeiten">Öffnungszeiten</a>'});
 assert.deepEqual(links.map(x=>x.url),['https://example.org/oeffnungszeiten']);
});
test('dated exhibition detail pages are excluded from permanent museum research',()=>{
 const links=discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:'<a href="/de/ausstellungen/2026/new-show">Ausstellung</a><a href="/de/ausstellungen/vorschau">Vorschau</a><a href="/de/besuch/shop">Shop</a><a href="/de/besuch/besuch-planen">Besuch planen</a>'});
 assert.deepEqual(links.map(x=>x.url),['https://example.org/de/besuch/besuch-planen']);
});
test('dated exhibitions and generic navigation labels cannot become permanent museum copy or offers',()=>{
 const museum={...spot,name:'Kunstmuseum Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const detail={...source('Das Kunstmuseum Basel zeigt Druckgrafiken aus allen Schaffensphasen der Pop-Art-Legende Roy Lichtenstein (1923–1997).'),url:'https://example.org/de/ausstellungen/2026/roy-lichtenstein'};
 const description='Das Kunstmuseum Basel zeigt Druckgrafiken aus allen Schaffensphasen der Pop-Art-Legende Roy Lichtenstein (1923–1997).';
 const d=validateEvidenceFacts({facts:[fact('description.highlight',description,description)]},detail,[field('description.highlight')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('description.highlight')],facts:d,sources:[detail],...deps})[0].status,'UNRESOLVED');
 const preview={...source('Digitale Rundgänge durch die aktuelle Ausstellung im Kunstmuseum Basel.'),url:'https://example.org/de/ausstellungen/virtuelle-rundgaenge'};
 const previewCopy='Digitale Rundgänge durch die aktuelle Ausstellung im Kunstmuseum Basel.';
 const p=validateEvidenceFacts({facts:[fact('description.highlight',previewCopy,previewCopy)]},preview,[field('description.highlight')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('description.highlight')],facts:p,sources:[preview],...deps})[0].status,'UNRESOLVED');
 const homepage=source('Van Gogh, Hodler und ein Cabriolet\n/ 19. September 2026 – 7. Februar 2027\n→ Veranstaltungshighlights → Kostenlose Museumsangebote');
 const offers=[fact('experience.profile','Van Gogh, Hodler und ein Cabriolet','Van Gogh, Hodler und ein Cabriolet',{offerKind:'VISIT'}),fact('experience.profile','Kostenlose Museumsangebote','→ Veranstaltungshighlights → Kostenlose Museumsangebote',{offerKind:'VISIT'})];
 const f=validateEvidenceFacts({facts:offers},homepage,[field('experience.profile')]).map(x=>({...x,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('experience.profile')],facts:f,sources:[homepage],...deps})[0].status,'UNRESOLVED');
});
test('individual museum building hours cannot become whole-museum hours',()=>{
 const museum={...spot,name:'Kunstmuseum Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const text='Öffnungszeiten Hauptbau & Neubau\nDO–SO 10–18 Uhr\nÖffnungszeiten Gegenwart\nDI–SO 11–18 Uhr';
 const s={...source(text),headings:[{level:2,text:'Öffnungszeiten Hauptbau & Neubau',offset:0},{level:2,text:'Öffnungszeiten Gegenwart',offset:text.indexOf('Öffnungszeiten Gegenwart')}]};
 const facts=validateEvidenceFacts({facts:[fact('hours.regular','DO–SO 10–18 Uhr','DO–SO 10–18 Uhr'),fact('hours.regular','DI–SO 11–18 Uhr','DI–SO 11–18 Uhr')]},s,[field('hours.regular')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('hours.regular')],facts,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('an explicit late-opening exception cannot be silently lost from regular hours',()=>{
 const museum={...spot,name:'Museum Tinguely',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const s=source('Öffnungszeiten\nDienstag bis Sonntag 11-18 Uhr\nDonnerstags bis 21 Uhr geöffnet');
 const facts=validateEvidenceFacts({facts:[fact('hours.regular','Dienstag bis Sonntag 11-18 Uhr','Dienstag bis Sonntag 11-18 Uhr')]},s,[field('hours.regular')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('hours.regular')],facts,sources:[s],...deps})[0].reason,'UNPARSED_SCHEDULE_EXCEPTION');
});
test('museum, shop and bistro telephone labels stay separate even if a critic calls all TARGET',()=>{
 const museum={...spot,name:'Museum Tinguely',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const s=source('Adresse\nPaul Sacher-Anlage 1\nMuseum: +41 61 681 93 20\nShop: +41 61 688 94 42\nBistro: +41 61 688 94 58');
 const facts=validateEvidenceFacts({facts:[fact('contact.phone','+41 61 681 93 20','+41 61 681 93 20'),fact('contact.phone','+41 61 688 94 42','+41 61 688 94 42'),fact('contact.phone','+41 61 688 94 58','+41 61 688 94 58')]},s,[field('contact.phone')]).map(f=>({...f,state:'ACCEPTED'}));
 const r=projectEvidenceLedger({spot:museum,fields:[field('contact.phone')],facts,sources:[s],...deps})[0];
 assert.equal(r.value,'+41616819320');
});
test('an official address-bound museum phone is certifiable from the public identity panel',async()=>{
 const museum={...spot,name:'Museum Tinguely',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'location.address_line1':{value:'Paul Sacher-Anlage 1'}}};
 const body='<header><h3>Adresse</h3><p>Paul Sacher-Anlage 1, Basel</p><p>Museum: +41 61 681 93 20</p><p>Shop: +41 61 688 94 42</p></header><main><h1>Museum Tinguely</h1><p>Sammlung kinetischer Werke.</p></main>';
 const r=await researchSpotV2({...opts,spot:museum,fields:[field('contact.phone')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:async()=>reply({verdicts:[]})});
 assert.equal(r.results[0].value,'+41616819320');
 assert.equal(r.modelCalls,0);
 const wrong={...museum,existingValues:{...museum.existingValues,'location.address_line1':{value:'Andere Strasse 99'}}};
 const denied=await researchSpotV2({...opts,spot:wrong,fields:[field('contact.phone')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:async()=>reply({verdicts:[]})});
 assert.equal(denied.results[0].status,'UNRESOLVED');
});
test('dated event copy on a homepage cannot become a permanent venue description',()=>{
 const s=source('16. Oktober 2026 |\n20:00 |\nEintritt frei\nTapas Festival\nDie Idee ist einfach: von Lokal zu Lokal ziehen, verschiedene Tapas probieren und gemeinsam anstossen.');
 const quote='Die Idee ist einfach: von Lokal zu Lokal ziehen, verschiedene Tapas probieren und gemeinsam anstossen.';
 const facts=validateEvidenceFacts({facts:[fact('description.highlight',quote,quote)]},s,[field('description.highlight')]).map(f=>({...f,state:'ACCEPTED'}));
 const [result]=projectEvidenceLedger({spot,fields:[field('description.highlight')],facts,sources:[s],...deps});
 assert.equal(result.status,'UNRESOLVED');
});
test('weekday-prefixed calendar entries cannot become museum description or undated visits',()=>{
 const museum={...spot,name:'Museum Tinguely',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const copy='Lua Leirner führt in Gebärdensprache durch die Sonderausstellung Labouring Bodies.';
 const offer='Führung in Gebärdensprache';
 const s=source('Donnerstag, 29. Oktober 2026, 19.30-21 Uhr\nFührung\n'+offer+'\n'+copy);
 const description=validateEvidenceFacts({facts:[fact('description.highlight',copy,copy)]},s,[field('description.highlight')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('description.highlight')],facts:description,sources:[s],...deps})[0].status,'UNRESOLVED');
 const offers=validateEvidenceFacts({facts:[fact('experience.profile',offer,offer+'\n'+copy,{subject:'OFFER',subjectLabel:offer,offerKind:'VISIT'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('experience.profile')],facts:offers,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('kitchen and delivery schedules never override restaurant opening hours',()=>{
 const content='Unsere Öffnungszeiten\nMo.- Do. von 11 bis 22 Uhr\nWarme Kuche\nMo. - Do. von 11 bis 21 Uhr\nLieferdienst\nMo. - Do. von 11-20 Uhr';
 const s={...source(content),headings:[{level:3,text:'Unsere Öffnungszeiten',offset:0},{level:3,text:'Warme Kuche',offset:content.indexOf('Warme Kuche')},{level:3,text:'Lieferdienst',offset:content.indexOf('Lieferdienst')}]};
 const quotes=['Mo.- Do. von 11 bis 22 Uhr','Mo. - Do. von 11 bis 21 Uhr','Mo. - Do. von 11-20 Uhr'];
 const facts=validateEvidenceFacts({facts:quotes.map(q=>fact('hours.regular',q,q))},s,[field('hours.regular')]).map(f=>({...f,state:'ACCEPTED'}));
 const [result]=projectEvidenceLedger({spot,fields:[field('hours.regular')],facts,sources:[s],...deps});
 assert.equal(result.status,'REQUIRES_REVIEW');
 assert.deepEqual(result.value.map(x=>x.day),['MONDAY','TUESDAY','WEDNESDAY','THURSDAY']);
 assert.deepEqual(result.value[0].intervals,[{start:'11:00',end:'22:00'}]);
});
test('address-bound regular-hours section survives a weak language critic without accepting kitchen hours',async()=>{
 const exact={...spot,name:'Alexander',existingValues:{...spot.existingValues,'location.address_line1':{value:'Riehenring 85'}}};
 const body='<main><h1>Restaurant Alexander</h1><p>Riehenring 85, 4058 Basel</p><h2>Unsere Öffnungszeiten</h2><p>Mo.- Do. von 11 bis 22 Uhr</p><h2>Warme Kuche</h2><p>Mo. - Do. von 11 bis 21 Uhr</p></main>';
 const result=await researchSpotV2({...opts,spot:exact,fields:[field('hours.regular')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:async()=>reply({verdicts:[]})});
 assert.equal(result.results[0].status,'REQUIRES_REVIEW');
 assert.deepEqual(result.results[0].value[0].intervals,[{start:'11:00',end:'22:00'}]);
 assert.equal(result.facts.filter(f=>f.field==='hours.regular'&&f.state==='ACCEPTED').length,1);
 const other='<main><h1>Restaurant Annex</h1><h2>Unsere Öffnungszeiten</h2><p>Mo.- Do. von 11 bis 22 Uhr</p><p>Alexander, Riehenring 85, Basel</p></main>';
 const wrong=await researchSpotV2({...opts,spot:exact,fields:[field('hours.regular')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:other,observedAt:new Date().toISOString()}),modelFetch:async()=>reply({verdicts:[]})});
 assert.equal(wrong.results[0].status,'UNRESOLVED');
});
test('the official home page can bind an address for a same-host hours page whose main content omits its footer',async()=>{
 const exact={...spot,name:'Alexander',existingValues:{...spot.existingValues,'location.address_line1':{value:'Riehenring 85'}}};
 const pages={'https://example.org/':'<main><h1>Alexander</h1><p>Riehenring 85, Basel</p><a href="/hours">Öffnungszeiten</a></main>','https://example.org/hours':'<main><h1>Restaurant Alexander</h1><h2>Unsere Öffnungszeiten</h2><p>Mo.- Do. von 11 bis 22 Uhr</p></main>'};
 const result=await researchSpotV2({...opts,spot:exact,fields:[field('hours.regular')],maxRequests:2},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:pages[url],observedAt:new Date().toISOString()}),modelFetch:async()=>reply({verdicts:[]})});
 assert.equal(result.results[0].status,'REQUIRES_REVIEW');
 assert.equal(result.facts.filter(f=>f.state==='ACCEPTED'&&f.reason==='STRUCTURED_VENUE_HOURS').length,1);
});
test('a stored HTTP seed is probed only over HTTPS on the exact same host',async()=>{
 const insecure={...spot,existingValues:{...spot.existingValues,'contact.website':{value:'http://example.org/'}}};
 const requested=[];
 const result=await researchSpotV2({...opts,spot:insecure,maxRequests:1},{...deps,fetchPage:async url=>{requested.push(url);return {url,contentType:'text/html',body:'<main>Telefon: +41 61 111 22 33</main>',observedAt:new Date().toISOString()};},modelFetch:modelFor(()=>[])});
 assert.deepEqual(requested,['https://example.org/']);
 assert.equal(result.actions.some(x=>x.stage==='HTTPS_PROBE'),true);
 assert.equal(result.sourceFailures.length,0);
});
test('cuisine headings and hotel names are not concrete experience offers',()=>{
 const s=source('Swiss Cuisine — Fondue, Rösti and Cordon Bleu.\nBoutique & Design Hotel with spacious guestrooms.');
 const eatFacts=validateEvidenceFacts({facts:[fact('experience.profile','Swiss Cuisine','Swiss Cuisine — Fondue, Rösti and Cordon Bleu.',{subject:'OFFER',offerKind:'GASTRONOMY'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot,fields:[field('experience.profile')],facts:eatFacts,sources:[s],...deps})[0].status,'UNRESOLVED');
 const stay={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const stayFacts=validateEvidenceFacts({facts:[fact('experience.profile','Boutique & Design Hotel','Boutique & Design Hotel with spacious guestrooms.',{subject:'OFFER',offerKind:'OVERNIGHT_STAY'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:stay,fields:[field('experience.profile')],facts:stayFacts,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('explicit cuisine lists yield literal named dishes instead of cuisine headings',async()=>{
 const body='<main><h1>Synthetic Restaurant</h1><p>Swiss Cuisine — Fondue, Rösti, Cordon Bleu</p><p>Ukrainian Cuisine — Borschtsch, Wareniki</p><p>Georgian Cuisine — Chinkali, Chatschapuri</p><p>Italian Cuisine — Pizza, Pasta</p></main>';
 const result=await researchSpotV2({...opts,fields:[field('experience.profile')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(result.results[0].status,'REQUIRES_REVIEW');
 assert.deepEqual(result.results[0].value.offers.map(o=>o.name),['Fondue','Borschtsch','Chinkali','Pizza']);
 assert.ok(result.facts.every(f=>!f.value.endsWith('Cuisine')));
});
test('embedded visitor testimonials cannot certify a venue description',()=>{
 const text='Was andere sagen\nDieses Hotel ist wunderbar und ich habe hier mit meiner Familie ein fantastisches Wochenende erlebt.\nUnser Hotel\nUnsere Zimmer bieten einen Blick auf den historischen Innenhof und ruhige Nächte im Herzen der Stadt.';
 const s={...source(text),headings:[{level:2,text:'Was andere sagen',offset:0},{level:2,text:'Unser Hotel',offset:text.indexOf('Unser Hotel')}]};
 const bad='Dieses Hotel ist wunderbar und ich habe hier mit meiner Familie ein fantastisches Wochenende erlebt.';
 const good='Unsere Zimmer bieten einen Blick auf den historischen Innenhof und ruhige Nächte im Herzen der Stadt.';
 const facts=validateEvidenceFacts({facts:[fact('description.highlight',bad,bad),fact('description.highlight',good,good)]},s,[field('description.highlight')]).map(f=>({...f,state:'ACCEPTED'}));
 const [result]=projectEvidenceLedger({spot,fields:[field('description.highlight')],facts,sources:[s],...deps});
 assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.value,good);
});
test('identical words in different sections stay bound to the selected source occurrence',async()=>{
 const body='<main><h1>Synthetic Restaurant</h1><h2>BaselCard city hotspots</h2><p>Kostenloses WLAN</p><h2>Immer inbegriffen</h2><p>Kostenloses WLAN</p></main>';
 let checked=false;
 const result=await researchSpotV2({...opts,fields:[field('amenity.features')],maxRequests:1,maxModelCalls:4},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:async(_url,init)=>{
  const data=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(data.claims){const context=data.source.claims.find(x=>x.factId===data.claims[0].id);checked=context.section.includes('Immer inbegriffen');return reply({verdicts:data.claims.map(f=>({factId:f.id,verdict:'SUPPORTED',subject:'TARGET',belongsTo:'TARGET',applicability:'CURRENT',restrictionQuote:''}))});}
  const candidate=data.blocks.filter(b=>b.text==='Kostenloses WLAN').at(-1);
  return reply({facts:[{field:'amenity.features',value:'WIFI',blockId:candidate.id,subject:'TARGET',subjectLabel:spot.name,belongsTo:'TARGET',applicability:'CURRENT',restrictionQuote:'',offerKind:'',polarity:'AFFIRMATIVE'}],nextLinks:[]});
 }});
 assert.equal(checked,true,JSON.stringify({facts:result.facts,actions:result.actions}));
 assert.equal(result.facts[0].sourceOffset,result.sources[0].text.lastIndexOf('Kostenloses WLAN'));
});
test('repeated opening-hour rows under the same heading do not crowd model verification',async()=>{
 const body='<main><h1>Synthetic Restaurant</h1><h2>Öffnungszeiten</h2><p>Montag 11–18 Uhr</p><h2>Öffnungszeiten</h2><p>Montag 11–18 Uhr</p></main>';
 const r=await researchSpotV2({...opts,fields:[field('hours.regular')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(r.facts.filter(f=>f.field==='hours.regular'&&f.quote==='Montag 11–18 Uhr').length,1);
});
test('identical hour rows keep their restaurant and bar scopes separate',async()=>{
 const body='<main><h1>Synthetic Restaurant</h1><p>Teststrasse 1, Basel</p><h2>Öffnungszeiten</h2><p>Montag 10–18 Uhr</p><h2>Bar</h2><p>Montag 10–18 Uhr</p></main>';
 const result=await researchSpotV2({...opts,fields:[field('hours.regular')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:async()=>reply({verdicts:[]})});
 const rows=result.facts.filter(f=>f.field==='hours.regular');
 assert.equal(rows.length,2);
 assert.notEqual(rows[0].sourceOffset,rows[1].sourceOffset);
 assert.equal(rows[0].state,'ACCEPTED');assert.equal(rows[1].state,'HELD');
 assert.equal(result.results[0].status,'REQUIRES_REVIEW');
});
test('planner prioritizes unresolved questions, not insertion order',()=>{
 const f=[{url:'https://example.org/menu',depth:1,topics:['menu']},{url:'https://example.org/contact',depth:2,topics:['contact']}];
 assert.equal(rankResearchFrontier(f,[],[field('contact.phone')])[0].url,f[1].url);
});
test('regular hours outrank a menu when both questions remain open',()=>{
 const links=[{url:'https://example.org/menu',depth:1,topics:['menu','experience']},{url:'https://example.org/hours',depth:1,topics:['hours']}];
 const pending=[field('hours.regular'),field('experience.profile'),field('offering.groups')];
 assert.equal(rankResearchFrontier(links,[],pending)[0].url,'https://example.org/hours');
});
test('an explicit hours page outranks a busy visit page with many semantic topics',()=>{
 const links=[{url:'https://example.org/events',depth:1,topics:['visit','menu','experience','access','about']},{url:'https://example.org/hours',depth:1,topics:['hours','visit']}];
 const pending=[field('hours.regular'),field('experience.profile'),field('offering.groups'),field('amenity.features'),field('operation.laptop_policy')];
 assert.equal(rankResearchFrontier(links,[],pending)[0].url,'https://example.org/hours');
});
test('museum offer research follows visitor experiences instead of bistro menus',()=>{
 const links=[{url:'https://example.org/bistro/menu',depth:1,topics:['menu','experience','visit']},{url:'https://example.org/visit',depth:1,topics:['visit']}];
 assert.deepEqual(rankResearchFrontier(links,[],[{...field('offering.groups'),profileCategory:'CULTURE_ARTS'}]).map(x=>x.url),['https://example.org/visit']);
});
test('conditional group-programme pages cannot supply permanent spot fields',()=>{
 const links=[{url:'https://example.org/program/group-offers',depth:1,topics:['experience','contact']},{url:'https://example.org/visit',depth:1,topics:['visit']}];
 const museumFields=[{...field('contact.phone'),profileCategory:'CULTURE_ARTS'},{...field('experience.profile'),profileCategory:'CULTURE_ARTS'}];
 assert.deepEqual(rankResearchFrontier(links,[],museumFields).map(x=>x.url),['https://example.org/visit']);
 assert.deepEqual(discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:'<a href="/program/group-offers/122">Tour for school groups</a><a href="/press/contact">Press contact</a><a href="/visit">Visit</a>'}).map(x=>x.url),['https://example.org/visit']);
});
test('resolved contact links do not consume the remaining research budget',()=>{
 const links=[{url:'https://example.org/impressum',depth:1,topics:['contact']},{url:'https://example.org/hours',depth:1,topics:['hours']}];
 assert.deepEqual(rankResearchFrontier(links,[{field:'contact.phone',state:'ACCEPTED'}],[field('hours.regular')]).map(x=>x.url),['https://example.org/hours']);
 assert.deepEqual(rankResearchFrontier([links[0]],[{field:'contact.phone',state:'ACCEPTED'}],[field('hours.regular')]),[]);
});
test('a contact-only page does not repeat unrelated offer and amenity model questions',async()=>{
 let calls=0;const base=modelFor(()=>[]);
 const pages={'https://example.org/':'<main><a href="/kontakt">Kontakt</a></main>','https://example.org/kontakt':'<main>Kontakt</main>'};
 const r=await researchSpotV2({...opts,fields:[field('offering.groups')],maxRequests:2},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:pages[url],observedAt:new Date().toISOString()}),modelFetch:async(u,o)=>{calls++;return base(u,o);}});
 assert.equal(r.requests,2);assert.equal(calls,1);
});
test('fabricated quotations and schema extensions cannot enter accepted evidence',()=>{
 const s=source('Telefon +41 61 111 22 33');
 assert.equal(validateEvidenceFacts({facts:[fact('contact.phone','+41 61 999 99 99','Telefon +41 61 999 99 99')]},s,fields)[0].state,'REJECTED');
 assert.throws(()=>validateEvidenceFacts({facts:[{...fact('contact.phone','a','a'),reviewed:true}]},s,fields));
});
test('projection refuses conflicting target schedules and keeps missing days unknown',()=>{
 const s=source('Montag 10–18 Uhr\nMontag 11–19 Uhr');
 const f=ledger([fact('hours.regular','','Montag 10–18 Uhr'),fact('hours.regular','','Montag 11–19 Uhr')].map(x=>({...x,value:x.quote})),s);
 assert.equal(projectEvidenceLedger({spot,fields:[field('hours.regular')],facts:f,sources:[s],...deps})[0].reason,'CONFLICTING_TARGET_SCHEDULES');
 const r=projectEvidenceLedger({spot,fields:[field('hours.regular')],facts:f.slice(0,1),sources:[s],...deps})[0];
 assert.deepEqual(r.value,[{day:'MONDAY',intervals:[{start:'10:00',end:'18:00'}]}]);
});
test('a repeated general schedule cannot borrow adjacency from a different occurrence',()=>{
 const broad='Montag bis Sonntag 10-18',narrow='Mittwoch 10-20';
 const text=broad+'\n'+narrow+'\nAnderer Standort\n'+broad,s=source(text);
 const facts=ledger([fact('hours.regular',broad,broad),fact('hours.regular',narrow,narrow)],s);
 facts[0].sourceOffset=text.lastIndexOf(broad);facts[1].sourceOffset=text.indexOf(narrow);
 assert.equal(projectEvidenceLedger({spot,fields:[field('hours.regular')],facts,sources:[s],...deps})[0].reason,'CONFLICTING_TARGET_SCHEDULES');
});
test('contradictory amenities and laptop policies are not silently combined',()=>{
 const s=source('WLAN ist vorhanden. WLAN nicht verfügbar. Laptops erlaubt. Laptops verboten.');
 const facts=ledger([fact('amenity.features','WIFI','WLAN ist vorhanden.'),fact('amenity.features','WIFI','WLAN nicht verfügbar.',{polarity:'NEGATIVE'}),fact('operation.laptop_policy','true','Laptops erlaubt.'),fact('operation.laptop_policy','false','Laptops verboten.')],s);
 const r=projectEvidenceLedger({spot,fields:[field('amenity.features'),field('operation.laptop_policy')],facts,sources:[s],...deps});
 assert.deepEqual(r.map(x=>x.status),['UNRESOLVED','UNRESOLVED']);
});
test('literal named offers retain evidence and cannot self-approve profiles',()=>{
 const s=source('Geröstete Karotten mit Labneh.');const facts=ledger([fact('experience.profile','Geröstete Karotten','Geröstete Karotten mit Labneh.',{subject:'OFFER',offerKind:'GASTRONOMY'})],s);
 const [r]=projectEvidenceLedger({spot,fields:[field('experience.profile')],facts,sources:[s],...deps});
 assert.equal(r.value.reviewed,false);assert.equal(r.partialProfile,true);assert.equal(r.value.offers[0].name,'Geröstete Karotten');
});
function wireFacts(data,facts){return facts.map(f=>({field:f.field,value:f.value,blockId:data.blocks.find(b=>b.text===f.quote)?.id??'missing',subject:f.subject,subjectLabel:f.subjectLabel,belongsTo:f.belongsTo,applicability:f.applicability,restrictionQuote:f.condition,offerKind:f.offerKind,polarity:f.polarity}));}
function modelFor(makeFacts,verdict='SUPPORTED',criticExtra={}) {return async(_url,init)=>{
 const body=JSON.parse(init.body),data=JSON.parse(body.messages[1].content);
 assert.equal(init.redirect,'error');assert.equal(body.enable_thinking,false);assert.equal(init.headers.authorization,undefined);
 if(data.candidates)return reply({selected:[data.candidates[0].id]});
 if(!data.claims)data.source.text=data.blocks.map(b=>b.text).join('\n');
 return data.claims?reply({verdicts:data.claims.map(f=>({factId:f.id,verdict,subject:'TARGET',belongsTo:'TARGET',applicability:'CURRENT',restrictionQuote:'',...criticExtra}))}):reply({facts:wireFacts(data,makeFacts(data)),nextLinks:[]});
};}
test('adaptive crawl follows second-level contact page without operator source preparation',async()=>{
 const pages={
 'https://example.org/':'<a href="/besuch">Informationen für den Besuch</a>',
 'https://example.org/besuch':'<a href="/besuch/kontakt">Kontakt</a>',
 'https://example.org/besuch/kontakt':'<p>Telefon: +41 61 111 22 33</p>'};
 const r=await researchSpotV2(opts,{...deps,fetchPage:async url=>({url,contentType:'text/html',body:pages[url],observedAt:new Date().toISOString()}),modelFetch:modelFor(data=>data.source.text.includes('Telefon:')?[fact('contact.phone','+41 61 111 22 33','Telefon: +41 61 111 22 33')]:[])});
 assert.equal(r.requests,3);assert.equal(r.results[0].value,'+41611112233');assert.equal(r.stopReason,'FRONTIER_EXHAUSTED');assert.equal(r.coverage[0].complete,false);assert.equal(r.canonicalWrite,false);assert.equal(r.importable,false);
});
for(const [label,extra,expected] of [['other branch',{subject:'OTHER'},'SUBJECT_OTHER'],['kitchen',{subject:'AREA',subjectLabel:'Küche'},'SUBJECT_AREA'],['conditional',{applicability:'CONDITIONAL',condition:'bei gutem Wetter'},'VALIDITY_OR_CONDITION_REQUIRES_REVIEW'],['dated',{validUntil:'2020-01-01',applicability:'DATED'},'VALIDITY_OR_CONDITION_REQUIRES_REVIEW']])test(label+' remains separate even when model critic approves',async()=>{
 const r=await researchSpotV2({...opts,fields:[field('hours.regular')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'<p>Montag 10–18 Uhr</p><p>bei gutem Wetter</p>',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[],'SUPPORTED',{subject:extra.subject??'TARGET',applicability:extra.applicability??'CURRENT',restrictionQuote:extra.condition??''})});
 assert.equal(r.results[0].status,'UNRESOLVED');assert.equal(r.facts[0].state,'HELD');assert.equal(r.facts[0].reason,expected);
});
test('independent critic rejection cannot be projected',async()=>{
 const r=await researchSpotV2(opts,{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'Telefon: +41 61 111 22 33',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[fact('contact.phone','+41 61 111 22 33','Telefon: +41 61 111 22 33')],'UNSUPPORTED')});
 assert.equal(r.facts[0].state,'REJECTED');assert.equal(r.results[0].status,'UNRESOLVED');
});
test('missing/duplicate verification decisions leave facts unapproved and report errors',async()=>{
 const base=modelFor(()=>[fact('contact.phone','+41 61 111 22 33','Telefon: +41 61 111 22 33')]);
 const r=await researchSpotV2(opts,{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'Telefon: +41 61 111 22 33',observedAt:new Date().toISOString()}),modelFetch:async(u,o)=>JSON.parse(o.body).messages[0].content.includes('critic')?reply({verdicts:[]}):base(u,o)});
 assert.equal(r.facts[0].state,'HELD');assert.equal(r.results[0].status,'UNRESOLVED');assert.ok(r.actions.some(a=>a.reason==='VERDICTS_INCOMPLETE'));
});
test('request limits preserve unresolved frontier and source failures are visible',async()=>{
 const r=await researchSpotV2({...opts,maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'<a href="/kontakt">Kontakt</a>',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(r.stopReason,'REQUEST_BUDGET_EXHAUSTED');assert.equal(r.frontier.length,1);
 const failed=await researchSpotV2(opts,{...deps,fetchPage:async()=>{throw new Error('source_http_503');}});
 assert.equal(failed.sourceFailures[0].reason,'source_http_503');assert.equal(failed.results[0].status,'UNRESOLVED');
});
test('unrendered website template markers are reported as a source limitation',async()=>{
 const r=await researchSpotV2({...opts,maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'<main><h1>Zoo Basel</h1><p>{{Oeffnungszeit_de}}</p></main>',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.ok(r.limitations.includes('CLIENT_RENDERED_CONTENT_MISSING'));
 assert.equal(r.results[0].status,'UNRESOLVED');
});
test('known values remain untouched and require no model or network work',async()=>{
 const r=await researchSpotV2({...opts,skipKnownFields:true,spot:{...spot,existingValues:{...spot.existingValues,'contact.phone':{value:'+41611112233',knowledgeState:'KNOWN_VALUE'}}}},{...deps,fetchPage:async()=>{throw new Error('must not fetch');}});
 assert.equal(r.results[0].status,'SKIPPED');assert.equal(r.requests,0);
});
test('foreign seeds, model responses truncated by token limit and tampered sources are not trusted',async()=>{
 const foreign=await researchSpotV2({...opts,sources:['https://evil.org/']},deps);assert.equal(foreign.requests,0);assert.equal(foreign.sourceFailures[0].reason,'SOURCE_IDENTITY_REQUIRES_REVIEW');
 const bad=await researchSpotV2(opts,{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'Telefon: +41 61 111 22 33',observedAt:new Date().toISOString()}),modelFetch:async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{}'}}]}))});
 assert.equal(bad.modelAudit[0].error,'model_incomplete');assert.equal(bad.results[0].status,'UNRESOLVED');
 const tampered=await researchSpotV2(opts,{...deps,fetchPage:async url=>({url,body:'Telefon: +41 61 111 22 33',contentType:'text/html',observedAt:new Date().toISOString()}),readPage:async()=>({...source('hello'),hash:'wrong'})});
 assert.equal(tampered.sourceFailures[0].reason,'SOURCE_INTEGRITY_FAILED');
});
test('projection independently blocks injected area, conditional and ungrounded ACCEPTED facts',()=>{
 const s=source('Montag 10–18 Uhr');
 for(const extra of [{subject:'AREA'},{condition:'bei gutem Wetter'},{quote:'Montag 11–20 Uhr'}]){
  const f={...ledger([fact('hours.regular','Montag 10–18 Uhr','Montag 10–18 Uhr')],s)[0],...extra};
  assert.equal(projectEvidenceLedger({spot,fields:[field('hours.regular')],facts:[f],sources:[s],...deps})[0].status,'UNRESOLVED');
 }
});
test('separate day rows cannot become the same merged intervals on every day',()=>{
 const s=source('Montag 10–18 Uhr\nDienstag 11–20 Uhr');const f=ledger([fact('hours.regular',s.text,s.text)],s);
 assert.equal(projectEvidenceLedger({spot,fields:[field('hours.regular')],facts:f,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('adjacent explicit weekday override is resolved but another page never overrides silently',()=>{
 const s=source('Montag–Sonntag 10–18 Uhr\nMittwoch 10–20 Uhr');
 const facts=ledger([fact('hours.regular','Montag–Sonntag 10–18 Uhr','Montag–Sonntag 10–18 Uhr'),fact('hours.regular','Mittwoch 10–20 Uhr','Mittwoch 10–20 Uhr')],s);
 const [r]=projectEvidenceLedger({spot,fields:[field('hours.regular')],facts,sources:[s],...deps});
 assert.equal(r.value.find(x=>x.day==='WEDNESDAY').intervals[0].end,'20:00');assert.equal(r.value.length,7);
 const other={...s,id:'s2',url:'https://example.org/other'};facts[1]={...facts[1],sourceId:'s2'};
 assert.equal(projectEvidenceLedger({spot,fields:[field('hours.regular')],facts,sources:[s,other],...deps})[0].reason,'CONFLICTING_TARGET_SCHEDULES');
});
test('model link IDs must refer to actual observed pages and cannot inject a URL',async()=>{
 const r=await researchSpotV2({...opts,fields:[field('amenity.features')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'<a href="/kontakt">Kontakt</a>',observedAt:new Date().toISOString()}),modelFetch:async()=>reply({facts:[],nextLinks:['https://evil.org/']})});
 assert.ok(r.actions.some(a=>a.reason==='PLANNER_SELECTION_INVALID'));assert.ok(!r.sources.some(s=>s.url.includes('evil.org')));
});
test('checkpoint preserves raw evidence and pending facts if verification fails',async()=>{
 const saved=[];
 const r=await researchSpotV2(opts,{...deps,onCheckpoint:async state=>saved.push(structuredClone(state)),fetchPage:async url=>({url,contentType:'text/html',body:'Telefon: +41 61 111 22 33',observedAt:new Date().toISOString()}),modelFetch:async(_u,o)=>{const b=JSON.parse(o.body),d=JSON.parse(b.messages[1].content);return b.messages[0].content.includes('critic')?reply({verdicts:[]}):reply({facts:wireFacts(d,[fact('contact.phone','+41 61 111 22 33','Telefon: +41 61 111 22 33')]),nextLinks:[]});}});
 assert.ok(saved.some(s=>s.facts.length===1&&s.modelAudit.length>=1));assert.equal(r.results[0].status,'UNRESOLVED');
});
test('main content can be read without mixing other-branch footer or navigation facts',async()=>{
 const {readSourceText}=await import('../src/nuknuk-sources.mjs');
 const s=await readSourceText({url:'https://example.org/',contentType:'text/html',observedAt:new Date().toISOString(),body:'<nav>Other shop</nav><main><p>Our venue content here.</p></main><footer>Neighbour has Wi-Fi</footer>'},'s1',{preferMain:true});
 assert.equal(s.text,'Our venue content here.');assert.equal(s.textSelection,'MAIN_CONTENT');assert.equal(s.assetHash.length,64);
});
test('public header hours and labelled museum contacts remain available without admitting navigation as offers',()=>{
 const body='<header><h3>Öffnungszeiten</h3><p>Dienstag bis Sonntag 11-18 Uhr</p><h3>Adresse</h3><p>Paul Sacher-Anlage 1, Basel</p><p>Museum: +41 61 681 93 20</p><p>Shop: +41 61 688 94 42</p></header><main><p>Die Sammlung zeigt kinetische Werke.</p></main>';
 const s=sourceText({url:'https://example.org/',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.ok(s.text.includes('Museum: +41 61 681 93 20'));
 assert.ok(s.text.includes('Dienstag bis Sonntag 11-18 Uhr'));
 assert.ok(s.descriptionText.includes('Die Sammlung zeigt'));
 assert.ok(!s.descriptionText.includes('Museum: +41'));
 assert.ok(s.identityOffset>s.descriptionText.length-2);
});
test('a dated programme at the end of main content does not date the separate public-hours panel',()=>{
 const museum={...spot,name:'Museum Tinguely',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const body='<header><h3>Öffnungszeiten</h3><p>Montag 11–18 Uhr</p></header><main><p>Donnerstag, 29. Oktober 2026, 19 Uhr</p><p>Film Screening</p></main>';
 const s=sourceText({url:'https://example.org/',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 const f=validateEvidenceFacts({facts:[fact('hours.regular','Montag 11–18 Uhr','Montag 11–18 Uhr')]},s,[field('hours.regular')]).map(x=>({...x,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('hours.regular')],facts:f,sources:[s],...deps})[0].status,'REQUIRES_REVIEW');
});
test('source restrictions cannot be invented by the model',async()=>{
 const base=modelFor(()=>[fact('amenity.features','WIFI','WLAN verfügbar.',{condition:'only during a festival'})]);
 const r=await researchSpotV2({...opts,fields:[field('amenity.features')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'WLAN verfügbar.',observedAt:new Date().toISOString()}),modelFetch:base});
 assert.equal(r.facts[0].reason,'RESTRICTION_NOT_LITERAL');assert.equal(r.facts[0].state,'REJECTED');
});
test('bounded same-site redirects validate every target and reject outside hosts',async()=>{
 const {EventEmitter}=await import('node:events');const {fetchPublicSource}=await import('../src/nuknuk-sources.mjs');
 for(const external of [false,true]){
  const visited=[];
  const requestImpl=(url,_options,callback)=>{
   const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{
    visited.push(url);const res=new EventEmitter();res.statusCode=url.endsWith('/old')?301:200;res.headers=res.statusCode===301?{location:external?'https://evil.org/new':'/new'}:{'content-type':'text/html'};res.destroy=()=>req.emit('close');callback(res);
    if(res.statusCode===200){res.emit('data',Buffer.from('Current venue source.'));res.emit('end');req.emit('close');}
   });req.destroy=error=>req.emit('error',error);return req;
  };
  const config={maxRedirects:2,resolve:async()=>[{address:'93.184.216.34'}],requestImpl};
  if(external){await assert.rejects(fetchPublicSource('https://example.org/old',config),/redirect_identity_rejected/);assert.equal(visited.length,1);}
  else {const page=await fetchPublicSource('https://example.org/old',config);assert.equal(page.url,'https://example.org/new');assert.deepEqual(page.redirectedFrom,['https://example.org/old']);}
 }
});
test('description candidates do not require a hand-maintained venue or cuisine vocabulary',async()=>{
 const r=await researchSpotV2({...opts,fields:[field('description.highlight')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'<main><p>Hier entstehen handgeschnitzte Holzfiguren und kunstvolle Marionetten.</p></main>',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(r.results[0].value,'Hier entstehen handgeschnitzte Holzfiguren und kunstvolle Marionetten.');
});
test('two agreeing model passes cannot establish Wi-Fi from food prose',async()=>{
 const prose='Wir servieren Kuchen, Waffeln und frische Speisen.';
 const r=await researchSpotV2({...opts,fields:[field('amenity.features')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:prose,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[fact('amenity.features','WIFI',prose)])});
 assert.equal(r.facts[0].reason,'ENUM_ENTAILMENT_REQUIRES_REVIEW');assert.equal(r.results[0].status,'UNRESOLVED');assert.equal(r.results[0].value,undefined);
});
test('navigation headings cannot become concrete offers even with two agreeing model passes',async()=>{
 const r=await researchSpotV2({...opts,spot:{...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}},fields:[field('experience.profile')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'<main><h2>Wood carving</h2></main>',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[fact('experience.profile','Wood carving','Wood carving',{offerKind:'WORKSHOP'})])});
 assert.equal(r.facts.some(f=>f.state==='ACCEPTED'),false);assert.equal(r.results[0].status,'UNRESOLVED');
});
test('a named building in a museum ensemble is an area, not a visitor offer',()=>{
 const museum={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const quote='The museum ensemble unites the Ammann Pavilion and the Erlen Gatehouse.';
 const s=source(quote),facts=validateEvidenceFacts({facts:[fact('experience.profile','Ammann Pavilion',quote,{subject:'AREA',subjectLabel:'Ammann Pavilion',offerKind:'VISIT'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('experience.profile')],facts,sources:[s],...deps})[0].status,'UNRESOLVED');
 const mislabeled=validateEvidenceFacts({facts:[fact('experience.profile','Ammann Pavilion',quote,{subject:'OFFER',subjectLabel:'Ammann Pavilion',offerKind:'VISIT'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('experience.profile')],facts:mislabeled,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('rechecking saved evidence blocks newly guarded claims without promoting unknowns',async()=>{
 const {recheckEvidenceFloors}=await import('../dist/nuknuk-agent.js');const s=source('Carving');const f=ledger([fact('experience.profile','Carving','Carving',{subject:'OFFER',offerKind:'WORKSHOP'})],s)[0];
 const checked=recheckEvidenceFloors([f,{...f,id:'held',state:'HELD',reason:'SEMANTIC_AMBIGUOUS'}],[s],fields,spot);
 assert.equal(checked[0].state,'HELD');assert.equal(checked[0].reason,'OFFER_CONTEXT_REQUIRED');assert.equal(checked[1].reason,'SEMANTIC_AMBIGUOUS');
 assert.equal(recheckEvidenceFloors([f],[{...s,hash:'tampered'}],fields,spot)[0].state,'REJECTED');
});
test('hotel research prioritizes rooms over restaurant menus for missing room offers',()=>{
 const frontier=[{url:'https://example.org/menu',depth:1,topics:['menu']},{url:'https://example.org/rooms',depth:1,topics:['stay']}];
 assert.equal(rankResearchFrontier(frontier,[],[{...field('experience.profile'),profileCategory:'STAY'}])[0].url,'https://example.org/rooms');
});
test('wrong offer kind is withheld per fact and does not invalidate correctly typed hotel rooms',async()=>{
 const s=source('Classic Room: a double room with shower.\nSteak with seasonal vegetables.');
 const stay={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const facts=ledger([fact('experience.profile','Classic Room','Classic Room: a double room with shower.',{subject:'OFFER',offerKind:'OVERNIGHT_STAY'}),fact('experience.profile','Steak','Steak with seasonal vegetables.',{subject:'OFFER',offerKind:'GASTRONOMY'})],s);
 const [r]=projectEvidenceLedger({spot:stay,fields:[field('experience.profile')],facts,sources:[s],...deps});
 assert.equal(r.status,'REQUIRES_REVIEW');assert.equal(r.value.offers.length,1);assert.equal(r.value.offers[0].name,'Classic Room');
});
test('different fragment links merge research topics instead of hiding the hours intent',()=>{
 const links=discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:'<a href="/info/#top">Info</a><a href="/info/#hours">Hours</a>'});
 assert.equal(links.length,1);assert.ok(links[0].topics.includes('hours'));
});
test('English weekday ranges with till or through retain every explicitly included day',async()=>{
 const {parseHoursRow,fieldCandidates}=await import('../src/nuknuk-research.mjs');
 for(const word of ['till','through']){
  const q='Tuesday '+word+' Friday\n11 – 17';
  assert.deepEqual(parseHoursRow(q).map(r=>r.day),['TUESDAY','WEDNESDAY','THURSDAY','FRIDAY']);
  const candidates=fieldCandidates(field('hours.regular'),[source(q)]);assert.equal(candidates.length,1);assert.deepEqual(parseHoursRow(candidates[0].quote).map(r=>r.day),['TUESDAY','WEDNESDAY','THURSDAY','FRIDAY']);
 }
});
test('quoted visitor speech cannot become an official Spot description',()=>{
 const s=source('“This was wonderful for our children and we enjoyed every minute.');const facts=validateEvidenceFacts({facts:[fact('description.highlight',s.text,s.text)]},s,[field('description.highlight')]).map(f=>({...f,state:'ACCEPTED'}));
 const [r]=projectEvidenceLedger({spot,fields:[field('description.highlight')],facts,sources:[s],...deps});assert.equal(r.status,'UNRESOLVED');
});
test('research model routing accepts only the two pinned local snapshots',async()=>{
 const {selectResearchModel}=await import('../dist/nuknuk-agent.js');assert.equal(selectResearchModel('/tmp/45797d2985a12c55e6473686e9ea91b95e959553').id,'qwen3.5-27b-4bit');
 for(const path of ['https://api.example.org/model','/tmp/unpinned','/tmp/prefix'+NUKNUK_MODEL_REVISION])assert.throws(()=>selectResearchModel(path));
});
test('literal candidate extraction retains the established fax exclusion',async()=>{
 const r=await researchSpotV2(opts,{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'Fax: +41 61 111 22 33',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(r.results[0].status,'UNRESOLVED');assert.equal(r.facts.filter(f=>f.field==='contact.phone').length,0);
});
test('hotel restaurant pages cannot establish whole-hotel hours even when critic says TARGET',async()=>{
 const stay={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const r=await researchSpotV2({...opts,spot:stay,fields:[field('hours.regular')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:url.endsWith('/restaurant')?'Montag 10–18 Uhr':'<a href="/restaurant">Restaurant</a>',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(r.results[0].status,'UNRESOLVED');assert.equal(r.facts[0].subject,'AREA');assert.equal(r.sources[1].areaScope,'Restaurant');
});
test('same-page HTML heading hierarchy keeps bar hours separate from a hotel',async()=>{
 const stay={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const r=await researchSpotV2({...opts,spot:stay,fields:[field('hours.regular')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'<main><h1>Hotel</h1><h2>Bar</h2><h3>Opening hours</h3><p>Montag 10–18 Uhr</p></main>',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(r.results[0].status,'UNRESOLVED');assert.equal(r.facts[0].subject,'AREA');assert.equal(r.sources[0].headings[1].text,'Bar');
});
test('explicit same-line area label is sufficient to withhold hotel opening hours',async()=>{
 const stay={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const r=await researchSpotV2({...opts,spot:stay,fields:[field('hours.regular')]},{...deps,fetchPage:async url=>({url,contentType:'text/plain',body:'Bar: Montag 11–23 Uhr',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(r.results[0].status,'UNRESOLVED');assert.equal(r.facts[0].subject,'AREA');
});
test('owned scoped offers can be projected without promoting area properties to the whole venue',()=>{
 const s=source('Classic Room: a double room with shower.\nOur private room has free Wi-Fi.');const stay={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const facts=ledger([fact('experience.profile','Classic Room','Classic Room: a double room with shower.',{subject:'OFFER',belongsTo:'TARGET',offerKind:'OVERNIGHT_STAY'}),fact('amenity.features','WIFI','Our private room has free Wi-Fi.',{subject:'AREA',belongsTo:'TARGET'})],s);
 const r=projectEvidenceLedger({spot:stay,fields:[field('experience.profile'),field('amenity.features')],facts,sources:[s],...deps});assert.equal(r[0].status,'REQUIRES_REVIEW');assert.equal(r[0].value.offers[0].name,'Classic Room');assert.equal(r[1].status,'UNRESOLVED');
 facts[0].belongsTo='OTHER';assert.equal(projectEvidenceLedger({spot:stay,fields:[field('experience.profile')],facts,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('v2 block extraction never promotes unverified item prices into a canonical offer',()=>{
 const s=source('Ravioli CHF 28.00');const facts=ledger([fact('experience.profile','Ravioli',s.text,{subject:'OFFER',belongsTo:'TARGET',offerKind:'GASTRONOMY'})],s);
 const [r]=projectEvidenceLedger({spot,fields:[field('experience.profile')],facts,sources:[s],...deps});assert.equal(r.status,'REQUIRES_REVIEW');assert.deepEqual(r.value.offers[0].prices,[]);
});
test('unavailable model stops further crawling and preserves the explicit failure',async()=>{
 let requests=0,calls=0;const r=await researchSpotV2(opts,{...deps,fetchPage:async url=>{requests++;return {url,contentType:'text/html',body:'Telefon: +41 61 111 22 33<a href="/kontakt">Kontakt</a>',observedAt:new Date().toISOString()};},modelFetch:async()=>{calls++;throw new TypeError('fetch failed');}});
 assert.equal(requests,1);assert.equal(calls,1);assert.equal(r.stopReason,'MODEL_UNAVAILABLE');assert.equal(r.results[0].status,'UNRESOLVED');assert.ok(r.failureSummary.length);
});
test('critic can narrow an owned OFFER to unknown and cannot approve it accidentally',async()=>{
 const quote='Classic Room: a double room with shower.';const stay={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const r=await researchSpotV2({...opts,spot:stay,fields:[field('experience.profile')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:quote,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[fact('experience.profile','Classic Room',quote,{subject:'OFFER',offerKind:'OVERNIGHT_STAY'})],'SUPPORTED',{subject:'UNKNOWN'})});assert.equal(r.facts[0].subject,'UNKNOWN');assert.equal(r.results[0].status,'UNRESOLVED');
});
test('exact descriptive text can retain its explicit area and weather condition without becoming a global property',()=>{
 const s=source('Unsere Terrasse ist bei schönem Wetter geöffnet.');const f=validateEvidenceFacts({facts:[fact('description.highlight',s.text,s.text,{subject:'AREA',applicability:'CONDITIONAL',condition:'bei schönem Wetter'})]},s,[field('description.highlight')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot,fields:[field('description.highlight')],facts:f,sources:[s],...deps})[0].value,s.text);
 f[0].condition='Nur am Wochenende';assert.equal(projectEvidenceLedger({spot,fields:[field('description.highlight')],facts:f,sources:[s],...deps})[0].status,'UNRESOLVED');
});

test('hotel decoding permits actual food kinds and abstention instead of forcing a false room classification',async()=>{
 const stay={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 let observed=false;const base=modelFor(()=>[]);
 await researchSpotV2({...opts,spot:stay,fields:[field('experience.profile')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'<main>Our restaurant serves seasonal dishes every evening.</main>',observedAt:new Date().toISOString()}),modelFetch:async(url,init)=>{
  const req=JSON.parse(init.body);const schema=req.response_format.json_schema.schema;
  if(schema.properties.facts){const kinds=schema.properties.facts.items.properties.offerKind.enum;assert.ok(kinds.includes('GASTRONOMY'));assert.ok(kinds.includes('OVERNIGHT_STAY'));assert.ok(kinds.includes(''));observed=true;}
  return base(url,init);
 }});assert.equal(observed,true);
});

test('explicit uppercase operating-area labels scope every weekday row and reset at the next area',()=>{
 const text='Öffnungszeiten\nRESTAURANT\nMontag bis Samstag 11.30–23 Uhr\nRIVER BAR\nSonntag & Montag geschlossen\nDienstag bis Samstag 11.30–24 Uhr\nRESTAURANT\nSonntag 12–18 Uhr';
 const s={...source(text),headings:[{level:2,text:'Öffnungszeiten',offset:0}]};
 const rows=['Montag bis Samstag 11.30–23 Uhr','Sonntag & Montag geschlossen','Dienstag bis Samstag 11.30–24 Uhr','Sonntag 12–18 Uhr'];
 const checked=ledger(rows.map(q=>fact('hours.regular',q,q)),s);
 const r=projectEvidenceLedger({spot,fields:[field('hours.regular')],facts:checked,sources:[s],...deps})[0];
 assert.equal(r.status,'REQUIRES_REVIEW');assert.equal(r.value.length,7);assert.deepEqual(r.value.find(row=>row.day==='MONDAY').intervals,[{start:'11:30',end:'23:00'}]);assert.deepEqual(r.value.find(row=>row.day==='SUNDAY').intervals,[{start:'12:00',end:'18:00'}]);
});
test('an uppercase navigation role outside an hours section cannot relabel a restaurant schedule',()=>{
 const s=source('BAR\nAbout our restaurant and our history.\nMontag 11–23 Uhr');const f=ledger([fact('hours.regular','Montag 11–23 Uhr','Montag 11–23 Uhr')],s);
 assert.equal(projectEvidenceLedger({spot,fields:[field('hours.regular')],facts:f,sources:[s],...deps})[0].status,'REQUIRES_REVIEW');
});

test('accented café labels cannot establish museum opening hours',()=>{
 const text='Öffnungszeiten\nCAFÉ\nMontag 11–23 Uhr';const s={...source(text),headings:[{level:2,text:'Öffnungszeiten',offset:0}]};
 const museum={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};const f=ledger([fact('hours.regular','Montag 11–23 Uhr','Montag 11–23 Uhr')],s);
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('hours.regular')],facts:f,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('a cafe kiosk and brunch service cannot redefine the cafe opening hours',()=>{
 const cafe={...spot,name:'Acero',existingValues:{...spot.existingValues,'classification.primary_category':{value:'COFFEE_DAYTIME'}}};
 const text='Öffnungszeiten Bistro\nSonntag 10–18 Uhr\nBrunch\nSonntag 10–14 Uhr\nGlacé-Kiosk\nSonntag 14–18 Uhr';
 const s={...source(text),headings:[{level:2,text:'Öffnungszeiten Bistro',offset:0},{level:3,text:'Brunch',offset:text.indexOf('Brunch')},{level:3,text:'Glacé-Kiosk',offset:text.indexOf('Glacé-Kiosk')}]};
 const facts=validateEvidenceFacts({facts:[fact('hours.regular','Sonntag 10–18 Uhr','Sonntag 10–18 Uhr'),fact('hours.regular','Sonntag 10–14 Uhr','Sonntag 10–14 Uhr'),fact('hours.regular','Sonntag 14–18 Uhr','Sonntag 14–18 Uhr')]},s,[field('hours.regular')]).map(f=>({...f,state:'ACCEPTED'}));
 const r=projectEvidenceLedger({spot:cafe,fields:[field('hours.regular')],facts,sources:[s],...deps})[0];
 assert.equal(r.status,'REQUIRES_REVIEW');assert.deepEqual(r.value.find(x=>x.day==='SUNDAY').intervals,[{start:'10:00',end:'18:00'}]);
});
test('paired weekday and service rows in an HTML table preserve their distinct times',()=>{
 const html='<main><h2>Öffnungszeiten Bistro</h2><table><tr><td>Sonntag<br>Brunch</td><td>10:00-18:00<br>10:00-14:00</td></tr></table></main>';
 const s=sourceText({url:'https://example.org/',body:html,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.ok(s.text.includes('Sonntag 10:00-18:00\nBrunch 10:00-14:00'));
 const candidates=fieldCandidates(field('hours.regular'),[s]);
 assert.ok(candidates.some(c=>c.quote.includes('Sonntag 10:00-18:00')));
 assert.ok(!candidates.some(c=>c.quote.includes('Sonntag 10:00-14:00')));
});

test('the venue itself cannot be duplicated as a concrete dish or activity offer',()=>{
 const text='Synthetic Restaurant serves seasonal food every evening.';const s=source(text);const f=ledger([fact('experience.profile',spot.name,text,{offerKind:'GASTRONOMY'})],s);
 assert.equal(projectEvidenceLedger({spot,fields:[field('experience.profile')],facts:f,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('ice-cream product categories remain offering-group evidence, not named profile offers',()=>{
 const cafe={...spot,name:'Acero',existingValues:{...spot.existingValues,'classification.primary_category':{value:'COFFEE_DAYTIME'}}};
 const s=source('Dort bieten wir kleine, mittlere und grosse Eisportionen im Becher oder in der Waffel an. Unser Fruchteis wird aus Früchten hergestellt.');
 const f=validateEvidenceFacts({facts:[fact('experience.profile','Eisportionen','Dort bieten wir kleine, mittlere und grosse Eisportionen im Becher oder in der Waffel an.',{offerKind:'GASTRONOMY'}),fact('experience.profile','Fruchteis','Unser Fruchteis wird aus Früchten hergestellt.',{offerKind:'GASTRONOMY'})]},s,[field('experience.profile')]).map(x=>({...x,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:cafe,fields:[field('experience.profile')],facts:f,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('a model spelling a hyphenated offer with spaces is grounded to the literal source spelling',async()=>{
 const body='<main><p>Unsere Focaccia-Sandwiches werden frisch zubereitet und am Tresen angeboten.</p></main>';
 const r=await researchSpotV2({...opts,fields:[field('experience.profile')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[fact('experience.profile','Focaccia Sandwiches','Unsere Focaccia-Sandwiches werden frisch zubereitet und am Tresen angeboten.',{subject:'OFFER',subjectLabel:'Focaccia Sandwiches',offerKind:'GASTRONOMY'})])});
 assert.equal(r.results[0].value?.offers[0]?.name,'Focaccia-Sandwiches');
});

test('deterministically scoped area schedules are held before the semantic critic sees target claims',async()=>{
 let count=0;const r=await researchSpotV2({...opts,fields:[field('hours.regular')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'<main><h2>Öffnungszeiten</h2>RESTAURANT<p>Montag 11–23 Uhr</p>RIVER BAR<p>Dienstag 12–24 Uhr</p></main>',observedAt:new Date().toISOString()}),modelFetch:async(url,init)=>{
  const req=JSON.parse(init.body),data=JSON.parse(req.messages[1].content);count++;assert.equal(data.claims.length,1);assert.equal(data.claims[0].value,'Montag 11–23 Uhr');return reply({verdicts:data.claims.map(f=>({factId:f.id,verdict:'SUPPORTED',subject:'TARGET',belongsTo:'TARGET',applicability:'CURRENT',restrictionQuote:''}))});
 }});assert.equal(count,1);assert.equal(r.results[0].value[0].day,'MONDAY');assert.equal(r.facts.find(f=>f.quote==='Dienstag 12–24 Uhr').state,'HELD');
});
