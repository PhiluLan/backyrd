import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {researchSpotV2,researchFieldRelevance,certifiedPermanentExhibition,validateEvidenceFacts,projectEvidenceLedger,addMenuImageReviewLeads,structuredMenuLeads,addStructuredMenuReviewLeads,structuredRoomLeads,addStructuredRoomReviewLeads,rankResearchFrontier,recheckEvidenceFloors,sourceSubsumedByEarlier,equivalentLocalizedRoomInventory,literalSourceFacts,topicsForSearchLead,chainBranchCityPath} from '../dist/nuknuk-agent.js';
import {discoverResearchLinks,discoverDelegatedExperienceLinks,discoverPublicDataSources,discoverMenuImages,sourceText,readSourceText} from '../src/nuknuk-sources.mjs';
import {agreeingPricedRows,auditMenuImages} from '../src/nuknuk-menu-media.mjs';
import {parseMenuVisionRows,corroborateMenuVisionRows} from '../src/nuknuk-menu-vision.mjs';
import {localSearchEndpoint,planSpotSearches,searchLocalWeb,classifySearchResults,permanentSpotSearchLead} from '../src/nuknuk-search.mjs';
import {NUKNUK_MODEL_REVISION,fieldCandidates,enumFactCandidates,parseHoursRow} from '../src/nuknuk-research.mjs';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
import {reviewHtml,searchReviewHtml,selectResearchSpots,summarizeResearchReports,resumeResearchReports} from '../../../scripts/world-knowledge/nuknuk-research.mjs';
const spot={spotId:'11111111-1111-4111-8111-111111111111',name:'Synthetic Restaurant',existingValues:{'classification.primary_category':{value:'EAT'},'contact.website':{value:'https://example.org/'},'location.country_code':{value:'CH'},'location.address_line1':{value:'Teststrasse 1'}}};
const field=attributeKey=>({attributeKey,...researchValueContract(attributeKey)});
const fields=['contact.phone','hours.regular','amenity.features','operation.laptop_policy','experience.profile'].map(field);
const source=(text,id='s1')=>({id,text,url:'https://example.org/',observedAt:new Date().toISOString(),hash:createHash('sha256').update(text).digest('hex')});
const fact=(field,value,quote,extra={})=>({field,value,quote,subject:'TARGET',subjectLabel:spot.name,belongsTo:'TARGET',applicability:'CURRENT',condition:'',validFrom:null,validUntil:null,polarity:'AFFIRMATIVE',offerKind:'',...extra});
const ledger=(facts,s)=>validateEvidenceFacts({facts},s,fields).map(f=>({...f,state:'ACCEPTED'}));
const reply=value=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
test('official heading-paired menu names become price-free review leads with food and drink scope',()=>{
 const drinkText="BARKARTE\n\nBARTENDER'S CHOICE\n\nCEST LA VIT\n\nWhiskey, Aquavit, Rosmarin, Verjus\n\nCHF 18.00\n\nMAR-OHNI\n\nWhiskey, Thymian, Ahorn, Marroni\n\nCHF 18.00\n\nLONGDRINKS\n\nPimm’s Nº1 Cup\n\nPimm’s Nº 1, Ginger Ale, Gurke, Orange\n\n13 CHF";
 const foodText='BAR FOOD\n\nSNACKS\n\nApéroplatte gemischt\n\nFleisch, Käse, Oliven\n\n18 CHF\n\nESSEN\n\nHausburger\n\nRindfleisch, Brie, Speck und Pommes Frites\n\n26,50 CHF';
 const make=(text,url,names)=>({...source(text),url,headings:names.map(([level,name])=>({level,text:name,offset:text.indexOf(name)})).sort((a,b)=>a.offset-b.offset)});
 const sources=[make(drinkText,'https://example.org/bar/',[[1,'BARKARTE'],[2,"BARTENDER'S CHOICE"],[6,'CEST LA VIT'],[6,'CHF 18.00'],[6,'MAR-OHNI'],[2,'LONGDRINKS'],[6,'Pimm’s Nº1 Cup'],[6,'13 CHF']]),make(foodText,'https://example.org/food/',[[1,'BAR FOOD'],[2,'SNACKS'],[4,'Apéroplatte gemischt'],[4,'18 CHF'],[2,'ESSEN'],[4,'Hausburger'],[4,'26,50 CHF']])];
 // Duplicate price headings in production have distinct offsets; this small
 // fixture keeps one of each price to isolate grouping and scope.
 const leads=structuredMenuLeads(sources);
 assert.deepEqual(leads.map(lead=>[lead.name,lead.kind]),[['CEST LA VIT','DRINKS'],['Pimm’s Nº1 Cup','DRINKS'],['Apéroplatte gemischt','GASTRONOMY'],['Hausburger','GASTRONOMY']]);
 const result=addStructuredMenuReviewLeads({attributeKey:'experience.profile',status:'UNRESOLVED'}, {...field('experience.profile'),profileCategory:'DRINKS'},sources);
 assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.humanReviewRequired,true);
 assert.deepEqual(result.value.offers.map(offer=>offer.name),['CEST LA VIT','Pimm’s Nº1 Cup','Hausburger','Apéroplatte gemischt']);
 assert.ok(result.value.offers.every(offer=>offer.prices.length===0));
 assert.ok(result.citations.every(citation=>citation.layoutReviewRequired&&citation.sourceFormat==='HTML_MENU'&&citation.evidence.includes('CHF')));
});
test('observed official PDF rows replace generic website food claims with cited review leads',()=>{
 const text='Bunt belegte Brote\nRÖSTI, PILZE, SCHNITTLAUCHMAYO 9.30\nRösti with mushrooms\nRANDE, APFEL, BAUMNÜSSE — 8.80\nEintopf 16 + Wienerli 4\nVegetable stew with Sausage + 4\nCocktails\nEspresso Martini 16\nWhiskey Sour 17\nmit Tonic & Soda 11\nWEISS 1DL / FLASCHE 7.5DL\nSauvignon Blanc 8.70 / 60\nSCHAUM, ROSÉ, WEISS & ROT\nWEISSWEINE\nIsteiner Gutedel 61\nEspresso 4';
 const pdf={...source(text),url:'https://files.example.net/menu.pdf',format:'PDF_TEXT',layoutReviewRequired:true,discoveredOn:'https://example.org/das-angebot'};
 const leads=structuredMenuLeads([pdf]);
 assert.deepEqual(leads.map(lead=>[lead.name,lead.kind]),[['RÖSTI, PILZE, SCHNITTLAUCHMAYO','GASTRONOMY'],['RANDE, APFEL, BAUMNÜSSE','GASTRONOMY'],['Espresso Martini','DRINKS'],['Whiskey Sour','DRINKS'],['Espresso','DRINKS']]);
 assert.ok(leads.every(lead=>lead.citation.sourceFormat==='PDF_TEXT'&&lead.citation.discoveredOn==='https://example.org/das-angebot'&&lead.citation.layoutReviewRequired));
 const generic={id:'offer_generic',kind:'GASTRONOMY',name:'Craft Beer',areaIds:[],properties:[],prices:[],schedule:[],validFrom:null,validUntil:null};
 const result=addStructuredMenuReviewLeads({attributeKey:'experience.profile',status:'REQUIRES_REVIEW',value:{contractVersion:'backyrd.world-knowledge.experience-profile@1.0',category:'EAT',properties:[],areas:[],offers:[generic],reviewed:false},citations:[]},{...field('experience.profile'),profileCategory:'EAT'},[pdf]);
 assert.equal(result.status,'REQUIRES_REVIEW');
 assert.ok(result.value.offers.some(offer=>offer.name==='RÖSTI, PILZE, SCHNITTLAUCHMAYO'));
 assert.ok(result.value.offers.some(offer=>offer.name==='Espresso Martini'&&offer.kind==='DRINKS'));
 assert.ok(!result.value.offers.some(offer=>offer.name==='Craft Beer'));
 assert.ok(result.value.offers.every(offer=>offer.prices.length===0));
});
test('flat CMS navigation promotes observed dinner, info and encoded about links',()=>{
 const page={url:'https://example.org/index.html',contentType:'text/html',body:'<nav><a href="dinner.html">Dinner</a><a href="info.html">Info</a><a href="uumlber-uns.html">Mehr &uuml;ber uns</a><a href="speisekarte-download.html">Speisekarte download</a><a href="reservation.html">Reservation</a></nav>'};
 const links=discoverResearchLinks(page);
 assert.ok(links.find(link=>link.url.endsWith('/dinner.html'))?.topics.includes('menu'));
 assert.ok(links.find(link=>link.url.endsWith('/info.html'))?.topics.includes('contact'));
 assert.ok(links.find(link=>link.url.endsWith('/info.html'))?.topics.includes('hours'));
 assert.ok(links.find(link=>link.url.endsWith('/uumlber-uns.html'))?.topics.includes('about'));
 assert.ok(!links.some(link=>link.url.endsWith('/reservation.html')));
 const ranked=rankResearchFrontier(links.map(link=>({...link,depth:1})),[],[{...field('experience.profile'),profileCategory:'EAT'}]);
 assert.equal(ranked[0].url,'https://example.org/dinner.html');
 assert.deepEqual(topicsForSearchLead({url:'https://example.org/info.html',title:'Info'}),['visit','hours','contact']);
});
test('same-origin HTML base resolves relative links without duplicating locale segments',()=>{
 const body='<head><base href="https://www.example.org/"></head><main><a href="de/food-drinks">Food &amp; Drinks</a><a href="de/kontakt">Kontakt</a><a href="de/dinner.pdf">Abendmenü</a></main>';
 const page={url:'https://www.example.org/de/basel-barfi',body,contentType:'text/html',observedAt:new Date().toISOString()};
 const links=discoverResearchLinks(page);
 assert.ok(links.some(link=>link.url==='https://www.example.org/de/food-drinks'));
 assert.ok(links.some(link=>link.url==='https://www.example.org/de/kontakt'));
 assert.ok(!links.some(link=>link.url.includes('/de/de/')));
 const s=sourceText(page,'s1',{preferMain:true});
 assert.deepEqual(s.linkedMenus.map(item=>item.url),['https://www.example.org/de/dinner.pdf']);
 const foreign={...page,body:body.replace('https://www.example.org/','https://other.example/')};
 assert.ok(discoverResearchLinks(foreign).every(link=>!link.url.startsWith('https://other.example/')));
});
test('Seafood in a sustainability label is not a menu lead, while Food and Drinks is',()=>{
 const page={url:'https://restaurant.example/de/home',contentType:'text/html',body:'<a href="/de/nachhaltigkeit">Nachhaltiger Seafood</a><a href="/de/food-drinks">Food & Drinks</a>'};
 const links=discoverResearchLinks(page);
 assert.ok(!links.find(link=>link.url.endsWith('/nachhaltigkeit'))?.topics.includes('menu'));
 assert.ok(links.find(link=>link.url.endsWith('/food-drinks'))?.topics.includes('menu'));
 const campaign={url:'https://restaurant.example/de/basel-barfi',contentType:'text/html',body:'<a href="/de/chinese-modern-cuisine-globetrotter-gewinnspiel">Modern Chinese Cuisine</a><a href="/de/firmen">Firmenangebot</a><a href="/de/food-drinks">Food & Drinks</a>'};
 assert.deepEqual(discoverResearchLinks(campaign).map(link=>link.url),['https://restaurant.example/de/food-drinks']);
 assert.equal(permanentSpotSearchLead('https://restaurant.example/de/chinese-modern-cuisine-globetrotter-gewinnspiel'),false);
 assert.equal(permanentSpotSearchLead('https://restaurant.example/de/firmen'),false);
});
test('brand homepage and explicitly location-variable menu cannot prove a branch offer',()=>{
 const branch={...spot,name:'Nooch Basel Barfi',locality:'Basel',existingValues:{...spot.existingValues,'contact.website':{value:'https://nooch.ch/basel-barfi'}}};
 const quote='Entdecke Cantonese Crispy Duck mit Gemüse.';
 const home=sourceText({url:'https://nooch.ch/de/home',contentType:'text/html',observedAt:new Date().toISOString(),body:`<main><h2>Limited Special</h2><p>${quote}</p></main>`},'s1',{preferMain:true});
 const menu=sourceText({url:'https://nooch.ch/de/food-drinks',contentType:'text/html',observedAt:new Date().toISOString(),body:`<main><p>Unser Angebot variiert leicht von Standort zu Standort.</p><h2>Food & Drinks</h2><p>${quote}</p></main>`},'s2',{preferMain:true});
 const branchPromo=sourceText({url:'https://nooch.ch/de/basel-barfi',contentType:'text/html',observedAt:new Date().toISOString(),body:`<main><h2>Limited Special</h2><p>${quote}</p></main>`},'s3',{preferMain:true});
 const make=s=>({id:'f1',...fact('experience.profile','Cantonese Crispy Duck',quote,{subject:'OFFER',subjectLabel:'Cantonese Crispy Duck',offerKind:'GASTRONOMY'}),sourceId:s.id,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'});
 const brandAbout=sourceText({url:'https://nooch.ch/de/ueber-nooch',contentType:'text/html',observedAt:new Date().toISOString(),body:`<main><p>${quote}</p></main>`},'s4',{preferMain:true});
 for(const [s,reason] of [[home,'BRAND_HOME_NOT_VENUE_SOURCE'],[menu,'BRAND_MENU_LOCATION_UNCONFIRMED'],[branchPromo,'LIMITED_CAMPAIGN_NOT_PERMANENT'],[brandAbout,'BRANCH_SOURCE_OUTSIDE_LOCATION_PATH']]){
  const checked=recheckEvidenceFloors([make(s)],[s],[field('experience.profile')],branch);
  assert.equal(checked[0].state,'HELD');assert.equal(checked[0].reason,reason);
 }
});
test('a stored visitor-hours URL does not turn its dedicated homepage into a different brand',()=>{
 const venue={...spot,name:'Basler Münster',existingValues:{...spot.existingValues,'contact.website':{value:'https://www.baslermuenster.ch/infos-kontakt/oeffnungszeiten'},'classification.primary_category':{value:'ATTRACTIONS_LANDMARKS'}}};
 const quote='Ein Münsterbesuch im Basler Münster ist möglich.';
 const s=sourceText({url:'https://www.baslermuenster.ch/',contentType:'text/html',observedAt:new Date().toISOString(),body:`<main><p>${quote}</p></main>`},'s1',{preferMain:true});
 const [checked]=recheckEvidenceFloors(validateEvidenceFacts({facts:[fact('experience.profile','Münsterbesuch',quote,{offerKind:'VISIT'})]},s,[{...field('experience.profile'),profileCategory:'ATTRACTIONS_LANDMARKS'}]).map(f=>({...f,state:'ACCEPTED'})),[s],[{...field('experience.profile'),profileCategory:'ATTRACTIONS_LANDMARKS'}],venue);
 assert.notEqual(checked.reason,'BRAND_HOME_NOT_VENUE_SOURCE');
 const links=discoverResearchLinks({url:'https://www.baslermuenster.ch/infos-kontakt/oeffnungszeiten',contentType:'text/html',body:'<a href="/infos-kontakt/besuche-und-fuehrungen/turmbesteigung">Turmbesteigung</a>'});
 assert.deepEqual(links.map(link=>link.topics),[['experience']]);
});
test('only direct venue-named official activity links delegate experience evidence',()=>{
 const page={url:'https://www.baslermuenster.ch/',contentType:'text/html',body:'<a href="https://www.erk-bs.ch/muensterfuehrungen">Führungen</a><a href="https://www.gruppenbuchungen.baslermuenster.ch/">Gruppenbesuche</a><a href="https://www.other.ch/tours">Führungen</a><a href="https://www.erk-bs.ch/newsletter-baslermuenster">Newsletter</a>'};
 assert.deepEqual(discoverDelegatedExperienceLinks(page,'Basler Münster').map(link=>[link.url,link.delegatedBy,link.topics]),[
  ['https://www.erk-bs.ch/muensterfuehrungen','https://www.baslermuenster.ch/',['experience']],
  ['https://www.gruppenbuchungen.baslermuenster.ch/','https://www.baslermuenster.ch/',['experience']]
 ]);
 const venue={...spot,name:'Basler Münster',existingValues:{...spot.existingValues,'contact.website':{value:'https://www.baslermuenster.ch/infos-kontakt/oeffnungszeiten'},'classification.primary_category':{value:'ATTRACTIONS_LANDMARKS'}}};
 const quote='Münsterführungen im Basler Münster werden angeboten.';
 const s={...source(quote+'\n061 272 91 57'),url:'https://www.erk-bs.ch/muensterfuehrungen',delegatedBy:'https://www.baslermuenster.ch/'};
 const contact=fact('contact.phone','061 272 91 57','061 272 91 57');
 const candidate=fact('experience.profile','Münsterführungen',quote,{offerKind:'GUIDED_TOUR'});
 const chosen=[{...field('experience.profile'),profileCategory:'ATTRACTIONS_LANDMARKS'},field('contact.phone')];
 const checked=recheckEvidenceFloors(validateEvidenceFacts({facts:[candidate,contact]},s,chosen).map(f=>({...f,state:'ACCEPTED'})),[s],chosen,venue);
 assert.notEqual(checked[0].reason,'DELEGATED_OPERATOR_FIELD_SCOPE');
 assert.equal(checked[1].reason,'DELEGATED_OPERATOR_FIELD_SCOPE');
});
test('a parent group-booking rule stays attached to each listed guided visit',()=>{
 const venue={...spot,name:'Basler Münster',existingValues:{...spot.existingValues,'contact.website':{value:'https://www.baslermuenster.ch/infos-kontakt/oeffnungszeiten'},'classification.primary_category':{value:'ATTRACTIONS_LANDMARKS'}}};
 const marker='Anmeldung für Gruppen obligatorisch:';
 const line='→ Führung mit Guides vom Basler Münster : www.erk-bs.ch/muensterfuehrungen';
 const text='Münsterbesuch\n\n'+marker+'\n'+line;
 const s={...source(text),url:'https://www.baslermuenster.ch/'};
 const chosen=[{...field('experience.profile'),profileCategory:'ATTRACTIONS_LANDMARKS'}];
 const item=fact('experience.profile','Führung mit Guides vom Basler Münster',line,{offerKind:'GUIDED_TOUR',sourceOffset:text.indexOf(line)});
 const [checked]=recheckEvidenceFloors([{...item,id:'f1',sourceId:s.id,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}],[s],chosen,venue);
 assert.equal(checked.state,'ACCEPTED');assert.equal(checked.condition,marker);assert.ok(checked.quote.startsWith(marker));
 const result=projectEvidenceLedger({spot:venue,fields:chosen,facts:[checked],sources:[s],...deps})[0];
 assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.value.offers[0].properties[0].value,marker);
 const inline='Gruppenbesuch\n\nGruppen, Reisegruppen, Schulklassen mit oder ohne eigenen Guides müssen sich anmelden: www.gruppenbuchungen.baslermuenster.ch';
 const s2={...source(inline,'s2'),url:'https://www.baslermuenster.ch/infos-kontakt/besuche-und-fuehrungen/fuehrungen'};
 const [group]=recheckEvidenceFloors(validateEvidenceFacts({facts:[fact('experience.profile','Gruppenbesuch',inline,{offerKind:'VISIT'})]},s2,chosen).map(f=>({...f,state:'ACCEPTED'})),[s2],chosen,venue);
 assert.equal(group.state,'ACCEPTED');assert.match(group.condition,/müssen sich anmelden/);
});
test('a page-wide group-tour deadline remains attached to each named tour heading',()=>{
 const venue={...spot,name:'Synthetic Museum',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const deadline='Anmeldungen müssen mindestens zwei Wochen im Voraus erfolgen.';
 const first='Rundgang durch das erste Haus',last='Rundgang durch das dritte Haus';
 const text=`Gruppen\n\nGerne führen wir Ihre Gruppe auf Anfrage durch unsere Häuser.\n\nAnmeldung\n\n${deadline}\n\nAngebote im ersten Haus\n\n${first}\n\nAngebote im dritten Haus\n\n${last}\n\nAnfrageformular\n\n${deadline}`;
 const s={...source(text),url:'https://example.org/besuch/gruppen',headings:[{level:1,text:'Gruppen',offset:0},{level:2,text:'Angebote im ersten Haus',offset:text.indexOf('Angebote im ersten Haus')},{level:2,text:'Angebote im dritten Haus',offset:text.indexOf('Angebote im dritten Haus')},{level:2,text:'Anfrageformular',offset:text.indexOf('Anfrageformular')}],identityOffset:text.length};
 const chosen=[{...field('experience.profile'),profileCategory:'CULTURE_ARTS'}];
 const proposals=[first,last].map((name,index)=>({...fact('experience.profile',name,name,{offerKind:'GUIDED_TOUR',sourceOffset:text.indexOf(name)}),id:'f'+index,sourceId:s.id,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}));
 const checked=recheckEvidenceFloors(proposals,[s],chosen,venue);
 assert.ok(checked.every(item=>item.state==='ACCEPTED'&&item.condition===deadline&&item.quote.includes(item.value)&&item.quote.includes(deadline)),JSON.stringify(checked.map(item=>({state:item.state,reason:item.reason,condition:item.condition,quote:item.quote}))));
 const result=projectEvidenceLedger({spot:venue,fields:chosen,facts:checked,sources:[s],...deps})[0];
 assert.equal(result.value.offers.length,2);
 assert.ok(result.value.offers.every(item=>item.properties[0]?.value===deadline));
 const shorter='Anmeldungen müssen mindestens drei Tage im Voraus erfolgen.';
 const changedText=text.replaceAll(deadline,shorter);
 const changed={...s,text:changedText,hash:createHash('sha256').update(changedText).digest('hex'),headings:s.headings.map(h=>({...h,offset:changedText.indexOf(h.text)}))};
 const general=recheckEvidenceFloors([{...proposals[0],sourceOffset:changedText.indexOf(first)}],[changed],chosen,venue)[0];
 assert.equal(general.condition,shorter);
 const withoutDeadline={...s,text:text.replaceAll(deadline,'Die Anmeldung ist möglich.'),hash:createHash('sha256').update(text.replaceAll(deadline,'Die Anmeldung ist möglich.')).digest('hex')};
 const unbound=recheckEvidenceFloors([{...proposals[0],sourceOffset:withoutDeadline.text.indexOf(first)}],[withoutDeadline],chosen,venue)[0];
 assert.equal(unbound.reason,'OFFER_CONTEXT_REQUIRED');
});
test('a later tour mention cannot remove an earlier mandatory booking condition',()=>{
 const venue={...spot,name:'Basler Münster',existingValues:{...spot.existingValues,'classification.primary_category':{value:'ATTRACTIONS_LANDMARKS'}}};
 const withRule='Anmeldung für Gruppen obligatorisch:\nFührung mit Guides vom Basler Münster';
 const withoutRule='Münsterführung: Führung mit Guides vom Basler Münster';
 const sources=[source(withRule,'s1'),source(withoutRule,'s2')];
 const item=(id,sourceId,quote,condition)=>({...fact('experience.profile','Führung mit Guides vom Basler Münster',quote,{offerKind:'GUIDED_TOUR',condition}),id,sourceId,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'});
 const profile={...field('experience.profile'),profileCategory:'ATTRACTIONS_LANDMARKS'};
 const result=projectEvidenceLedger({spot:venue,fields:[profile],facts:[item('f1','s1',withRule,'Anmeldung für Gruppen obligatorisch:'),item('f2','s2',withoutRule,'')],sources,...deps})[0];
 assert.equal(result.status,'REQUIRES_REVIEW');
 assert.equal(result.value.offers[0].properties[0].value,'Anmeldung für Gruppen obligatorisch:');
});
test('a public CMS route reveals only its observed visitor JSON, without unrelated empty hour endpoints',()=>{
 const body='<dmx-serverconnect id="scRubrik" url="/dmxConnect/api/Website/de/Zoobesuch/Rubrik/Rubrik.php" dmx-param:wrid="query.wrid"><dmx-serverconnect id="scOeffnungszeiten" url="/dmxConnect/api/Website/de/Zoobesuch/Rubrik/Oeffnungszeiten.php" dmx-param:wrid="query.wrid"><dmx-serverconnect id="scStatsPage" url="/dmxConnect/api/Website/de/Zoobesuch/Rubrik/StatsPage.php" dmx-param:pageurl="browser1.location.href">{{RubrikText_de}}';
 const visitor=discoverPublicDataSources({url:'https://www.zoobasel.ch/de/zoobesuch/r/5/fuetterung/',contentType:'text/html',body});
 assert.deepEqual(visitor.map(link=>link.url),['https://www.zoobasel.ch/dmxConnect/api/Website/de/Zoobesuch/Rubrik/Rubrik.php?wrid=5']);
 const hours=discoverPublicDataSources({url:'https://www.zoobasel.ch/de/zoobesuch/r/1/oeffnungszeiten/',contentType:'text/html',body});
 assert.equal(hours.length,1);assert.ok(hours[0].url.endsWith('/Oeffnungszeiten.php?wrid=1'));
});
test('a page-declared public JSON representation remains reachable at the crawl depth limit',async()=>{
 const venue={...spot,name:'Synthetic Zoo',existingValues:{...spot.existingValues,'classification.primary_category':{value:'OUTDOOR_NATURE'}}};
 const api='https://example.org/dmxConnect/api/Website/de/Zooerlebnisse/Rubrik/Rubrik.php?wrid=19';
 const pages=new Map([
  ['https://example.org/','<main><a href="/zooerlebnisse/">Erlebnisse</a></main>'],
  ['https://example.org/zooerlebnisse/','<main><a href="/zooerlebnisse/r/19/kinderzoo/">Kinderzoo</a></main>'],
  ['https://example.org/zooerlebnisse/r/19/kinderzoo/','<main><dmx-serverconnect id="scRubrik" url="/dmxConnect/api/Website/de/Zooerlebnisse/Rubrik/Rubrik.php" dmx-param:wrid="query.wrid">{{RubrikText_de}}</main>'],
 ]);
 const visited=[];
 const report=await researchSpotV2({...opts,spot:venue,fields:[field('experience.profile')],sources:['https://example.org/'],maxRequests:4,maxDepth:2,maxModelCalls:8},{...deps,
  fetchPage:async url=>{visited.push(url);return {url,contentType:url===api?'application/json':'text/html',body:url===api?JSON.stringify({RubrikTitel_de:'Kinderzoo',RubrikText_de:'Kinder können im Kinderzoo Haustiere beobachten.'}):pages.get(url),observedAt:new Date().toISOString()};},
  modelFetch:modelFor(()=>[]),
 });
 assert.ok(visited.includes(api),JSON.stringify(visited));
 assert.ok(report.sources.some(item=>item.url===api));
});
test('an official menu PDF is fetched as a bounded layout-review source',async()=>{
 const pdf='https://example.org/_files/menu.pdf',cdn='https://files.example.net/assets/menu.pdf',venue={...spot,existingValues:{...spot.existingValues,'contact.website':{value:'https://example.org/'}}};
 const requests=[];
 const report=await researchSpotV2({...opts,spot:venue,fields:[field('experience.profile')],sources:['https://example.org/das-angebot'],maxRequests:2,maxModelCalls:4,maxDepth:2},{...deps,
  fetchPage:async(url,options)=>{requests.push({url,options});return {url:url===pdf?cdn:url,...(url===pdf?{redirectedFrom:[url]}:{}),contentType:url===pdf?'application/pdf':'text/html',body:url===pdf?Buffer.from('%PDF-'): '<main><a href="/_files/menu.pdf">Menü</a></main>',observedAt:new Date().toISOString()};},
  readPage:async(page,id)=>({...source(page.url===cdn?'RÖSTI, PILZE, SCHNITTLAUCHMAYO 9.30':'Menü',id),url:page.url,...(page.url===cdn?{format:'PDF_TEXT',layoutReviewRequired:true}:{})}),
  modelFetch:modelFor(()=>[]),
 });
 assert.deepEqual(requests.map(item=>item.url),['https://example.org/das-angebot',pdf]);
 assert.equal(requests[1].options.maxBytes,20000000);
 assert.equal(requests[1].options.allowObservedPdfRedirect,true);
 assert.equal(report.sources[1].url,cdn);
 assert.equal(report.sources[1].discoveredOn,'https://example.org/das-angebot');
 assert.equal(report.sources[1].layoutReviewRequired,true);
});
test('public JSON card links are same-site leads with visitor topics, never evidence by themselves',()=>{
 const body=JSON.stringify({repeatGrid:[{sqryCards:{InfoTitel_de:'Führungen',Link_de:'https://www.zoobasel.ch/de/zooerlebnisse/r/17/fuehrungen/'}},{sqryCards:{InfoTitel_de:'Kinderzoo',Link_de:'https://www.zoobasel.ch/de/zooerlebnisse/kinderzoo/'}},{sqryCards:{InfoTitel_de:'Shop',Link_de:'https://shop.example.org/'}}]});
 const links=discoverResearchLinks({url:'https://www.zoobasel.ch/dmxConnect/api/Website/de/Zooerlebnisse/Grid.php',contentType:'application/json',body});
 assert.deepEqual(links.map(link=>link.label),['Führungen','Kinderzoo']);
 assert.ok(links.every(link=>link.topics.includes('experience')));
});
test('a visitor pass is not a standalone nature experience, and pricing pages cannot consume its research frontier',()=>{
 const venue={...spot,name:'Zoo Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'OUTDOOR_NATURE'}}};
 const quote='Mit einer Gönnerjahreskarte können Sie den Zoo ein ganzes Jahr lang besuchen.';
 const s=source(quote),profile={...field('experience.profile'),profileCategory:'OUTDOOR_NATURE'};
 const [checked]=recheckEvidenceFloors([{...fact('experience.profile','Gönnerjahreskarte',quote,{offerKind:'VISIT'}),id:'f1',sourceId:'s1',state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}],[s],[profile],venue);
 assert.equal(checked.reason,'ADMISSION_PRODUCT_NOT_VISITOR_EXPERIENCE');
 const links=[{url:'https://example.org/de/zoobesuch/r/2/eintrittspreise/',depth:1,label:'Eintrittspreise',topics:['visit']},{url:'https://example.org/de/zooerlebnisse/',depth:1,label:'Zoo-Erlebnisse',topics:['experience']}];
 assert.deepEqual(rankResearchFrontier(links,[],[profile]).map(link=>link.label),['Zoo-Erlebnisse']);
});
test('an explicitly observed animal feeding visit is eligible, while conditional walks remain held',()=>{
 const venue={...spot,name:'Zoo Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'OUTDOOR_NATURE'}}};
 const quote='Beobachten Sie die Tiere im Zoo Basel bei den Fütterungen.';
 const s=source(quote),profile={...field('experience.profile'),profileCategory:'OUTDOOR_NATURE'};
 const [checked]=recheckEvidenceFloors([{...fact('experience.profile','Fütterungen',quote,{offerKind:'VISIT'}),id:'f1',sourceId:'s1',state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}],[s],[profile],venue);
 assert.equal(checked.state,'ACCEPTED');
 const seasonal='Die Pinguine spazieren von November bis Februar; vorausgesetzt, das Thermometer zeigt nicht mehr als 10° C an.';
 const seasonalSource=source(seasonal);
 const [held]=recheckEvidenceFloors([{...fact('experience.profile','Pinguinspaziergang',seasonal,{offerKind:'WALK',condition:'von November bis Februar; vorausgesetzt, das Thermometer zeigt nicht mehr als 10° C an.',applicability:'CONDITIONAL'}),id:'f2',sourceId:'s1',state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}],[seasonalSource],[profile],venue);
 assert.equal(held.reason,'VALIDITY_OR_CONDITION_REQUIRES_REVIEW');
});
test('seasonal visitor instructions cannot become an evergreen highlight',()=>{
 const venue={...spot,name:'Zoo Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'OUTDOOR_NATURE'}}};
 const seasonal='Die Pinguine spazieren von November bis Februar in der Regel täglich; vorausgesetzt, das Thermometer zeigt nicht mehr als 10° C an.';
 const logistics='Der Start erfolgt gegen 11.00 Uhr entweder bei der Brücke oder beim Gehege.';
 const fields=[field('description.highlight')];
 for(const [quote,reason] of [[seasonal,'DESCRIPTION_SEASONAL_OR_CONDITIONAL'],[logistics,'DESCRIPTION_VISITOR_LOGISTICS_NOT_HIGHLIGHT']]){
  const s=source(quote);
  const [checked]=recheckEvidenceFloors([{...fact('description.highlight',quote,quote),id:'f1',sourceId:'s1',state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}],[s],fields,venue);
  assert.equal(checked.reason,reason);
 }
});
test('a shared museum ticket is admission guidance, not a descriptive experience highlight',()=>{
 const venue={...spot,name:'Historisches Museum Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const quote='Mit Ihrem Ticket haben Sie Zugang zu allen drei Ausstellungshäusern.';
 const s=source(quote);
 const [checked]=recheckEvidenceFloors([{...fact('description.highlight',quote,quote),id:'f1',sourceId:'s1',state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}],[s],[field('description.highlight')],venue);
 assert.equal(checked.reason,'DESCRIPTION_ADMISSION_TERMS_NOT_HIGHLIGHT');
});
test('private event rental paths do not outrank ordinary visitor experiences',()=>{
 const profile={...field('experience.profile'),profileCategory:'OUTDOOR_NATURE'};
 const links=[{url:'https://example.org/de/zooerlebnisse/r/20/ihr-anlass/',depth:1,label:'Ihr Anlass',topics:['experience']},{url:'https://example.org/de/zooerlebnisse/r/17/fuehrungen/',depth:1,label:'Führungen',topics:['experience']}];
 assert.deepEqual(rankResearchFrontier(links,[],[profile]).map(link=>link.label),['Führungen']);
 const page={url:'https://example.org/de/zooerlebnisse/',contentType:'text/html',body:'<a href="/de/zooerlebnisse/r/20/ihr-anlass/">Ihr Anlass</a><a href="/de/zooerlebnisse/r/17/fuehrungen/">Führungen</a>'};
 assert.deepEqual(discoverResearchLinks(page).map(link=>link.label),['Führungen']);
 const venue={...spot,name:'Zoo Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'OUTDOOR_NATURE'}}};
 const quote='Für Ihren Apéro stehen der Zolli-Saal und das Restaurant bereit.';
 const s={...source(quote),url:'https://example.org/de/zooerlebnisse/r/20/ihr-anlass/'};
 const [checked]=recheckEvidenceFloors([{...fact('experience.profile','Zolli-Saal',quote,{offerKind:'GASTRONOMY'}),id:'f1',sourceId:'s1',state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}],[s],[profile],venue);
 assert.equal(checked.reason,'PRIVATE_EVENT_SOURCE_NOT_SPOT_EXPERIENCE');
 const backing={...s,url:'https://example.org/dmxConnect/api/Website/de/Zooerlebnisse/Rubrik/Rubrik.php?wrid=20',discoveredOn:s.url};
 const [apiChecked]=recheckEvidenceFloors([{...fact('experience.profile','Zolli-Saal',quote,{offerKind:'GASTRONOMY'}),id:'f1',sourceId:'s1',state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}],[backing],[profile],venue);
 assert.equal(apiChecked.reason,'PRIVATE_EVENT_SOURCE_NOT_SPOT_EXPERIENCE');
});
test('museum group visits outrank collection administration and room hire',()=>{
 const page={url:'https://www.hmb.ch/besuch',contentType:'text/html',body:'<a href="/besuch/gruppen">Gruppen</a><a href="/besuch/familien">Familien</a><a href="/museum/sammlung-und-konservierung">Sammlung und Konservierung</a><a href="/en/museum/room-hire">Room hire</a>'};
 const links=discoverResearchLinks(page).map(link=>({...link,depth:1}));
 const profile={...field('experience.profile'),profileCategory:'CULTURE_ARTS'};
 assert.ok(links.find(link=>link.url.endsWith('/besuch/gruppen'))?.topics.includes('experience'));
 assert.deepEqual(rankResearchFrontier(links,[],[profile,field('hours.regular'),field('amenity.features')]).map(link=>link.url),['https://www.hmb.ch/besuch/gruppen','https://www.hmb.ch/besuch/familien']);
});
test('season names keep a venue schedule out of a single whole-year weekly field',()=>{
 const body='<main><h1>Öffnungszeiten</h1><p>Öffnung während der Sommerzeit</p><p>Montag bis Freitag: 10.00–17.00 Uhr</p><p>Öffnung während der Winterzeit</p><p>Montag bis Freitag: 11.00–16.00 Uhr</p></main>';
 const s=sourceText({url:'https://www.baslermuenster.ch/infos-kontakt/oeffnungszeiten',contentType:'text/html',observedAt:new Date().toISOString(),body},'s1',{preferMain:true});
 assert.equal(s.seasonalSchedule,true);
});
test('landmark visitor activities outrank background contacts and religious programme pages',()=>{
 const open=[{...field('experience.profile'),profileCategory:'ATTRACTIONS_LANDMARKS'},field('contact.public_email')];
 const frontier=[
  {url:'https://www.baslermuenster.ch/infos-kontakt/besuche-und-fuehrungen/turmbesteigung',label:'Turmbesteigung',depth:2,topics:['experience']},
  {url:'https://www.baslermuenster.ch/kirchliches-leben/gemeinde-feiert/gottesdienste',label:'Gottesdienste',depth:1,topics:['experience']},
  {url:'https://www.baslermuenster.ch/bauwerk/freunde-der-basler-muensterbauhuette/kontakt',label:'Kontakt',depth:1,topics:['contact']}
 ];
 const ordered=rankResearchFrontier(frontier,[{field:'contact.phone',state:'ACCEPTED'}],open,[]);
 assert.equal(ordered[0].label,'Turmbesteigung');
 assert.ok(!ordered.some(item=>item.label==='Kontakt'));
});
test('description selection excludes an adjacent limited campaign before model choice',async()=>{
 const branch={...spot,name:'Nooch Basel Barfi',existingValues:{...spot.existingValues,'contact.website':{value:'https://example.org/basel-barfi'}}};
 const body='<main><h2>Basel Barfi</h2><p>Hier verbinden wir urban Asian Cuisine mit kreativer Rauminszenierung – mitten in Basel.</p><h2>Limited Special</h2><p>China auf dem Teller: Entdecke Cantonese Crispy Duck, Sichuan Mapo Tofu und Shrimp Dumpling Soup – modern interpretiert und voller intensiver Aromen.</p></main>';
 let supplied,verified;
 const report=await researchSpotV2({...opts,spot:branch,fields:[field('description.highlight')],maxRequests:1,maxModelCalls:2},{...deps,
  fetchPage:async url=>({url,body,contentType:'text/html',observedAt:new Date().toISOString()}),
  modelFetch:async(_url,init)=>{const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);if(input.candidates){supplied=input.candidates;return reply({selected:[]});}verified=input.claims;return reply({verdicts:input.claims.map(claim=>({factId:claim.id,verdict:'SUPPORTED',subject:'TARGET',applicability:'CURRENT',restrictionQuote:'',belongsTo:'TARGET'}))});},
 });
 assert.deepEqual(supplied.map(candidate=>candidate.text),['Hier verbinden wir urban Asian Cuisine mit kreativer Rauminszenierung – mitten in Basel.']);
 assert.deepEqual(verified.map(claim=>claim.value),supplied.map(candidate=>candidate.text));
 assert.equal(report.results[0].status,'REQUIRES_REVIEW');
});
test('hotel parking links answer amenities while meeting rooms do not masquerade as guest rooms',()=>{
 const page={url:'https://hotel.example/',contentType:'text/html',body:'<a href="/de/information/lage-anfahrt-parken/">Lage | Anfahrt | Parken</a><a href="/de/information/fitness/">Fitness</a><a href="/de/raeumlichkeiten/sitzungszimmer-12/">Sitzungszimmer 12</a><a href="/de/zimmer/ambiente-doppelzimmer/">Ambiente Doppelzimmer</a>'};
 const links=discoverResearchLinks(page);
 const parking=links.find(link=>link.url.includes('parken'));
 const meeting=links.find(link=>link.url.includes('sitzungszimmer'));
 assert.ok(parking.topics.includes('access'));
 assert.ok(!meeting.topics.includes('stay'));
 assert.equal(rankResearchFrontier(links.map(link=>({...link,depth:1})),[],[{...field('amenity.features'),profileCategory:'STAY'}])[0].url,parking.url);
});
test('hotel-owned first-come parking is a cited facility without implying a reserved space',()=>{
 const quote='Wir haben vor dem Hotel 5 kostenfreie Parkplätze, die nach der Devise «frist come, first serve» vergeben werden und deshalb leider nicht reservierbar sind.';
 const s=source(quote);
 assert.deepEqual(enumFactCandidates(field('amenity.features'),[s]).map(item=>[item.value,item.quote]),[['PARKING',quote]]);
 for(const unsafe of ['Wir haben leider keine Parkplätze.','Das Nachbarhotel hat 5 Parkplätze.','Im nahegelegenen Centralbahnparking können Sie kostenpflichtig parken.','Wir haben vor dem Hotel keine Parkplätze.'])assert.ok(!enumFactCandidates(field('amenity.features'),[source(unsafe)]).some(item=>item.value==='PARKING'));
 const stay={...spot,name:'Hotel Beispiel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const facts=ledger([fact('amenity.features','PARKING',quote)],s);
 const result=projectEvidenceLedger({spot:stay,fields:[field('amenity.features')],facts,sources:[s],...deps});
 assert.equal(result[0].status,'REQUIRES_REVIEW');
 assert.deepEqual(result[0].value,['PARKING']);
 assert.equal(result[0].citations[0].evidence,quote);
});
test('hotel-wide WLAN and paid garage rental are recognized without borrowing nearby amenities',()=>{
 const homepage='Das Hotel Alexander bietet Ihnen 65 modern eingerichtete Zimmer mit kostenlosem WLAN- Internetzugang.';
 const inventory='Unabhängig von der gebuchten Zimmerkategorie sind Serviceleistungen, wie WLAN-Internetzugang, Druck- und Kopier-Service für unsere Gäste kostenlos.';
 const garage='Wir vermieten Garagen-Stellplätze zum fairen Preis direkt am Hotel.';
 assert.ok(enumFactCandidates(field('amenity.features'),[source(homepage)]).some(item=>item.value==='WIFI'));
 assert.ok(enumFactCandidates(field('amenity.features'),[source(inventory)]).some(item=>item.value==='WIFI'));
 assert.deepEqual(enumFactCandidates(field('amenity.features'),[source(garage)]).map(item=>item.value),['PARKING']);
 for(const unsafe of ['Das Nachbarhotel bietet kostenloses WLAN-Internetzugang.','Das Hotel hat kein WLAN-Internetzugang.','Wir vermieten keine Garagen-Stellplätze.','Das Nachbarhotel vermietet Garagen-Stellplätze.'])assert.deepEqual(enumFactCandidates(field('amenity.features'),[source(unsafe)]),[]);
});
test('a public Cloudflare-protected hotel mailbox is decoded from its own link',()=>{
 const address='mail@hotel.example',key=0x6a;
 const encoded=Buffer.from([key,...Buffer.from(address).map(byte=>byte^key)]).toString('hex');
 const body=`<main><h1>Hotel Example</h1><p>Kontakt</p><a href="/cdn-cgi/l/email-protection#${encoded}"><span data-cfemail="${encoded}">[email protected]</span></a></main>`;
 const s=sourceText({url:'https://hotel.example/',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.ok(s.text.includes(address));
 const stay={...spot,name:'Hotel Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const facts=literalSourceFacts(s,[field('contact.public_email')],stay,0);
 assert.deepEqual(facts.map(item=>item.value),[address]);
 assert.equal(facts[0].state,'HELD');
 const malformed=sourceText({url:'https://hotel.example/',body:body.replaceAll(encoded,'zzzzzzzz'),contentType:'text/html',observedAt:new Date().toISOString()},'s2',{preferMain:true});
 assert.ok(!malformed.text.includes(address));
});
test('explicit hotel benefit labels enter the critic without inventing bicycle parking from rentals',()=>{
 const text=['Ihre Vorteile auf einen Blick','Kostenloses WLAN im ganzen Hotel','Schöner Garten im Innenhof','Kinder-Spielzimmer','Kostenlose Fahrräder','Direkt buchen'].join('\n\n');
 const s={...source(text),url:'https://hotel.example/'};
 const candidates=enumFactCandidates(field('amenity.features'),[s]);
 assert.deepEqual(candidates.map(item=>item.value),['WIFI','GARDEN','PLAY_AREA']);
 const stay={...spot,name:'Example Hotel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const facts=literalSourceFacts(s,[field('amenity.features')],stay,0);
 assert.deepEqual(facts.map(item=>item.value),['WIFI','GARDEN','PLAY_AREA']);
 assert.ok(facts.every(item=>item.state==='HELD'&&item.reason==='SEMANTIC_CHECK_PENDING'&&s.text.slice(item.sourceOffset,item.sourceOffset+item.quote.length)===item.quote));
 assert.deepEqual(enumFactCandidates(field('amenity.features'),[source('Kostenloses WLAN im ganzen Hotel\n\nKinder-Spielzimmer')]),[]);
});
test('hotel-owned English service list and paid onsite garage yield only supported amenities',()=>{
 const services={...source(['Your advantages at Hotel Example','Hotel Example offers you numerous amenities.','Benefit from many extras:','WIFI','GYM (10 MINUTES\' WALK)','ADAPTERS, UMBRELLAS AND BIKES FOR HIRE'].join('\n\n')),url:'https://hotel.example/en/hotel/services'};
 assert.deepEqual(enumFactCandidates(field('amenity.features'),[services]).map(item=>item.value),['WIFI']);
 const parking='For a parkingfee you can park your car either in our underground garage or in our outdoor parking lots.';
 assert.deepEqual(enumFactCandidates(field('amenity.features'),[source(parking)]).map(item=>item.value),['PARKING']);
 assert.ok(!enumFactCandidates(field('amenity.features'),[source('For a parkingfee you can park your car in the nearby public garage.')]).some(item=>item.value==='PARKING'));
});
test('literal hotel breakfast-buffet labels become review facts, not guest-review claims',()=>{
 const stay={...spot,name:'Hotel Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'},'classification.place_types':{value:['HOTEL']}}};
 const offering={...field('offering.groups'),profileCategory:'STAY'};
 for(const label of ['Reichhaltiges\nFrühstückbuffet','Generous rich breakfast buffet & more']){
  const s=source('Hotel Example\n\n'+label);
  assert.ok(enumFactCandidates(offering,[s]).some(item=>item.value==='BREAKFAST'&&item.quote===label));
  assert.ok(literalSourceFacts(s,[offering],stay,0).some(item=>item.field==='offering.groups'&&item.value==='BREAKFAST'&&item.quote===label&&item.state==='HELD'));
 }
 const review=source('A guest wrote: The breakfast buffet was wonderful!');
 assert.ok(!enumFactCandidates(offering,[review]).some(item=>item.value==='BREAKFAST'));
});
test('explicit garage parking inside the venue building is evidence, adjacent parking is not',()=>{
 const onsite='Parkplätze findest du direkt im Parkhaus in unserem Gebäude.';
 assert.deepEqual(enumFactCandidates(field('amenity.features'),[source(onsite)]).map(item=>item.value),['PARKING']);
 for(const unsafe of ['Parkplätze findest du im Parkhaus neben unserem Gebäude.','Parkplätze findest du im nahegelegenen Parkhaus.','Keine Parkplätze in unserem Gebäude.'])assert.ok(!enumFactCandidates(field('amenity.features'),[source(unsafe)]).some(item=>item.value==='PARKING'));
});
test('after a hotel inventory overview, unread room categories outrank already supported details',()=>{
 const overview={...source('Einzelzimmer Classic\n\nEinzelzimmer Modern'),url:'https://example.org/de/zimmer/',headings:[{level:2,text:'Einzelzimmer Classic',offset:0},{level:2,text:'Einzelzimmer Modern',offset:22}]};
 const accepted=[{...fact('experience.profile','Einzelzimmer Modern','Einzelzimmer Modern',{subject:'OFFER',offerKind:'OVERNIGHT_STAY'}),state:'ACCEPTED'}];
 const links=[
   {url:'https://example.org/de/zimmer/einzelzimmer-standard/',label:'Einzelzimmer Modern',depth:1,topics:['stay']},
   {url:'https://example.org/de/zimmer/einzelzimmer-basic/',label:'Einzelzimmer Classic',depth:1,topics:['stay']}
 ];
 assert.equal(rankResearchFrontier(links,accepted,[{...field('experience.profile'),profileCategory:'STAY'}],[overview])[0].label,'Einzelzimmer Classic');
});
test('a source phrase offering alternative courses is not one invented composite course',()=>{
 const quote='Wer die Technik schneller lernen möchte, bucht einen Schnupper- oder Grundkurs.';
 const s={...source(quote),url:'https://example.org/bouldern'};
 const sport={...spot,name:'Synthetic Boulder Hall',existingValues:{...spot.existingValues,'classification.primary_category':{value:'SPORT'}}};
 const accepted=ledger([fact('experience.profile','Schnupper- oder Grundkurs',quote,{subject:'OFFER',offerKind:'COURSE'})],s);
 const [checked]=recheckEvidenceFloors(accepted,[s],[field('experience.profile')],sport);
 assert.equal(checked.state,'HELD');assert.equal(checked.reason,'ALTERNATIVE_OFFERS_NOT_SINGLE_OFFER');
});
test('a named movement area retains its exact under-18 access rule in the offer',()=>{
 const quote='Bewegungslandschaft\n\nSpielen erwünscht und erlaubt, für alle. Unter 18 Jahren nur mit Aufsichtspflicht oder EVE.';
 const s={...source(quote),url:'https://example.org/bouldern',headings:[{level:3,text:'Bewegungslandschaft',offset:0}]};
 const sport={...spot,name:'Synthetic Boulder Hall',existingValues:{...spot.existingValues,'classification.primary_category':{value:'SPORT_MOVEMENT'}}};
 const candidates=literalSourceFacts(s,[{...field('experience.profile'),profileCategory:'SPORT_MOVEMENT'}],sport,0);
 const movement=candidates.find(f=>f.value==='Bewegungslandschaft');
 assert.ok(movement);assert.equal(movement.quote,quote);assert.equal(movement.condition,'Unter 18 Jahren nur mit Aufsichtspflicht oder EVE.');
 const [checked]=recheckEvidenceFloors([{...movement,state:'ACCEPTED'}],[s],[field('experience.profile')],sport);
 assert.equal(checked.state,'ACCEPTED');
 const [result]=projectEvidenceLedger({spot:sport,fields:[{...field('experience.profile'),profileCategory:'SPORT_MOVEMENT'}],facts:[checked],sources:[s],...deps});
 assert.equal(result.status,'REQUIRES_REVIEW');
 assert.deepEqual(result.value.offers[0].properties.map(property=>[property.key,property.value]),[['participation.prerequisite','Unter 18 Jahren nur mit Aufsichtspflicht oder EVE.']]);
});
test('search identity matches punctuation in an official venue name without matching another venue',()=>{
 const results=[{url:'https://www.chequelomo.ch/menus',title:'Speisekarte | ¡Che, que lomo!',snippet:'Argentinische Spezialitäten Basel'},{url:'https://www.chequelomo.ch/another',title:'Che Lomo',snippet:'Andere Bar Basel'}];
 const found=classifySearchResults(results,{name:'Che que lomo',locality:'Basel',existingValues:{'classification.primary_category':{value:'EAT'}}},'https://chequelomo.ch/');
 assert.deepEqual(found.official.map(lead=>lead.url),['https://www.chequelomo.ch/menus']);
});
test('inline à-la-carte rows yield literal dish leads without ingredients, diet markers or footer prices',()=>{
 const text='Dinner\n\nA la Carte\n\nVorspeisen _ pflanzlich\nSuppe des Tages gf 12\n\nFaux Gras, Artischoke, Marmelade, Aroma-Öl gf 23\n\nHauptgänge _ pflanzlich\nDonna’s Burger, Malz-Bao-Bun, Cashew-Creme 32\n\nDesserts _ pflanzlich\nJohnny Crumble, Vanille-Glace gf 14\n\nAllergien, bitte fragen Sie uns\nPreise in CHF / incl. MwSt\nKüche von 18h - 21h';
 const leads=structuredMenuLeads([{...source(text),url:'https://example.org/dinner.html'}]);
 assert.deepEqual(leads.map(lead=>[lead.name,lead.section]),[['Suppe des Tages','VORSPEISEN _ PFLANZLICH'],['Faux Gras','VORSPEISEN _ PFLANZLICH'],['Donna’s Burger','HAUPTGÄNGE _ PFLANZLICH'],['Johnny Crumble','DESSERTS _ PFLANZLICH']]);
 assert.ok(leads.every(lead=>lead.citation.evidence.includes(lead.name)&&lead.citation.layoutReviewRequired));
});
test('adjacent storefront menu rows outrank a model-selected description as a dish name',()=>{
 const text='Speisekarte\n\nFleischspezialitäten\n\nParillada para dos\n\ngemischte Grillplatte für zwei\n139 CHF\n\nBife de Lomo\n\nArgentinisches Rindsfilet\n59 CHF\n\nEntraña a la pizza\n\nDie Fleischpizza mit Schinken und Käse\n46 CHF\n\nEmpanadas\n\nEmpanada de carne\n\nGefüllt mit Rindfleisch\n6 CHF';
 const s={...source(text),url:'https://example.org/menu'};
 const leads=structuredMenuLeads([s]);
 assert.deepEqual(leads.map(lead=>lead.name),['Parillada para dos','Bife de Lomo','Entraña a la pizza','Empanada de carne']);
 const profile={contractVersion:'backyrd.world-knowledge.experience-profile@1.0',category:'EAT',properties:[],areas:[],offers:[{id:'offer_bogus',kind:'GASTRONOMY',name:'Die Fleischpizza',areaIds:[],properties:[],prices:[],schedule:[],validFrom:null,validUntil:null}],reviewed:false};
 const draft=addStructuredMenuReviewLeads({attributeKey:'experience.profile',status:'REQUIRES_REVIEW',value:profile,citations:[{url:s.url,evidence:'Die Fleischpizza mit Schinken und Käse',observedAt:s.observedAt,sourceHash:s.hash}]},{...field('experience.profile'),profileCategory:'EAT'},[s]);
 assert.ok(draft.value.offers.some(offer=>offer.name==='Entraña a la pizza'));
 assert.ok(!draft.value.offers.some(offer=>offer.name==='Die Fleischpizza'));
 assert.ok(draft.value.offers.every(offer=>offer.prices.length===0));
 assert.ok(draft.reviewEvidence.some(citation=>citation.evidence.includes('Die Fleischpizza')));
});
test('homepage cocktail name-price rows stay inside their menu section and exclude a dated special',()=>{
 const text='AKTUELLES\n\n17.10.2026 Wild Dinner CHF 85\n\nAUSZUG AUS DER COCKTAILKARTE\n\nYuzual Suspects chf 18.00\n\nTequila, Yuzu und Limette\n\nNo Need 2 Be Sorry chf 18\n\nBourbon, Mezcal und Pfirsich\n\nSCHAUMWEINE\n\nCuvée d’Or\n\n68.00';
 const leads=structuredMenuLeads([{...source(text),url:'https://example.org/'}]);
 assert.deepEqual(leads.map(lead=>lead.name),['Yuzual Suspects','No Need 2 Be Sorry']);
 assert.ok(leads.every(lead=>lead.kind==='DRINKS'&&lead.citation.sourceFormat==='HTML_MENU'));
});
test('modal food sections take item names before ingredient lines and leave secondary prices out',()=>{
 const html='<main><h2>Auszug aus der Cocktailkarte</h2><p>Yuzual Suspects chf 18.00</p><h4>SHARING</h4><p>Classics Platte</p><p>Sandwich, Fried Chicken,</p><p>Kräuterpommes & Dip</p><p>CHF 55.00</p><h4>SEASONALS</h4><p>Herbstsalat</p><p>Apfel, Kürbis, Granola</p><p>CHF 14.00</p><p>als Vorspeise: CHF 9.00</p><p>Geschmorte Karotte</p><p>Shiitake, Curry</p><p>CHF 31.00</p></main>';
 const s=sourceText({url:'https://example.org/',body:html,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 const leads=structuredMenuLeads([s]);
 assert.deepEqual(leads.filter(lead=>lead.kind==='GASTRONOMY').map(lead=>lead.name),['Classics Platte','Herbstsalat','Geschmorte Karotte']);
 assert.ok(leads.every(lead=>lead.citation.evidence.startsWith(lead.name)));
});
test('drink-led venues reserve draft slots for cited food when both menus exist',()=>{
 const text='Auszug aus der cocktailkarte\n\nYuzual Suspects chf 18.00\n\nNo Need 2 Be Sorry chf 18.00\n\nInFloranti chf 18.00\n\nTziki-Tziki-Tak chf 18.00\n\nVirgin WERK8 spritz chf 14.00\n\nSober After Work chf 14.00\n\nSHARING\n\nWERK8 Aperoplatte\n\nGemüse, Oliven, Dips\n\nCHF 31.00\n\nSEASONALS\n\nGeschmorte Karotte\n\nShiitake, Curry\n\nCHF 31.00\n\nCLASSICS\n\nWERK 8 Club Sandwich\n\nmit Kräuterpommes\n\nCHF 28.00';
 const s={...source(text),url:'https://example.org/',headings:['SHARING','SEASONALS','CLASSICS'].map(name=>({level:4,text:name,offset:text.indexOf(name)}))};
 const existing={contractVersion:'backyrd.world-knowledge.experience-profile@1.0',category:'DRINKS',properties:[],areas:[],offers:['Yuzual Suspects','No Need 2 Be Sorry','InFloranti','Tziki-Tziki-Tak','Virgin WERK8 spritz','Sober After Work','WERK8 Aperoplatte','Geschmorte Karotte'].map((name,index)=>({id:'offer_'+index,kind:index<6?'DRINKS':'GASTRONOMY',name,areaIds:[],properties:[],prices:[],schedule:[],validFrom:null,validUntil:null})),reviewed:false};
 const draft=addStructuredMenuReviewLeads({attributeKey:'experience.profile',status:'REQUIRES_REVIEW',value:existing,citations:[]},{...field('experience.profile'),profileCategory:'DRINKS'},[s]);
 assert.equal(draft.value.offers.filter(offer=>offer.kind==='DRINKS').length,5);
 assert.equal(draft.value.offers.filter(offer=>offer.kind==='GASTRONOMY').length,3);
 assert.ok(draft.value.offers.some(offer=>offer.name==='WERK 8 Club Sandwich'));
});
test('representative food drafts favour substantive dishes across sections over low-priced side items',()=>{
 const html='<main><h2>Auszug aus der Cocktailkarte</h2><p>Yuzual Suspects chf 18.00</p><p>Hanami chf 18.00</p><h4>SHARING</h4><p>WERK8 Aperoplatte</p><p>Oliven, Dips</p><p>CHF 31.00</p><h4>APPETIZERS</h4><p>würzige nüsse</p><p>chf 6.00</p><h4>SEASONALS</h4><p>Herbstsalat</p><p>Apfel, Kürbis</p><p>CHF 14.00</p><p>Geschmorte Karotte</p><p>Shiitake, Curry</p><p>CHF 31.00</p><p>Hausgemachte Spätzli</p><p>Bergkäse, Trüffel</p><p>CHF 39.00</p><h4>CLASSICS</h4><p>Kräuterpommes mit Dip</p><p>CHF 9.00</p><p>WERK 8 Club Sandwich</p><p>mit Pommes</p><p>CHF 28.00</p><p>Rindstartar</p><p>mit Toast</p><p>CHF 34.00</p></main>';
 const s=sourceText({url:'https://example.org/',body:html,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 const draft=addStructuredMenuReviewLeads({attributeKey:'experience.profile',status:'UNRESOLVED'},{...field('experience.profile'),profileCategory:'DRINKS'},[s]);
 assert.deepEqual(draft.value.offers.filter(offer=>offer.kind==='GASTRONOMY').map(offer=>offer.name),['WERK 8 Club Sandwich','Geschmorte Karotte','WERK8 Aperoplatte']);
 assert.ok(draft.value.offers.every(offer=>offer.prices.length===0));
});
test('a drinks-only official menu can fill all eight draft slots without reserving absent food',()=>{
 const names=['Yuzual Suspects','No Need 2 Be Sorry','InFloranti','Tziki-Tziki-Tak','Virgin Spritz','Sober After Work','Almighty Almond','Ana & Coco'];
 const text='AUSZUG AUS DER COCKTAILKARTE\n\n'+names.map(name=>`${name} chf 18.00\n\nGin, Zitrone`).join('\n\n');
 const s={...source(text),url:'https://example.org/'};
 const draft=addStructuredMenuReviewLeads({attributeKey:'experience.profile',status:'UNRESOLVED'},{...field('experience.profile'),profileCategory:'DRINKS'},[s]);
 assert.deepEqual(draft.value.offers.map(offer=>offer.name),names);
});
test('a published Swiss phone with space after plus is captured literally and normalized later',()=>{
 const s=source('Cantina Restaurant\n\nKontakt\n\n+ 41616930507');
 const found=literalSourceFacts(s,[field('contact.phone')],spot,0).filter(f=>f.field==='contact.phone');
 assert.deepEqual(found.map(f=>f.value),['+ 41616930507']);
});
test('reservation mailbox under the operator general Contact heading may be public, while event mail stays scoped',()=>{
 const text='Kontakt\nWERK 8\nDornacherstrasse 192\nreservation@werkacht.ch\nBankette & Events\nevents@werkacht.ch';
 const s={...source(text),headings:[{level:1,text:'Kontakt',offset:0},{level:1,text:'Bankette & Events',offset:text.indexOf('Bankette & Events')}]};
 const chosen=[field('contact.public_email')];
 const facts=validateEvidenceFacts({facts:[fact('contact.public_email','reservation@werkacht.ch','reservation@werkacht.ch'),fact('contact.public_email','events@werkacht.ch','events@werkacht.ch')]},s,chosen).map(item=>({...item,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(facts,[s],chosen,spot);
 assert.equal(checked[0].reason,'SEMANTIC_CHECK_PENDING');
 assert.equal(checked[1].reason,'EXPLICIT_AREA_EMAIL');
});
test('prefixed tour mailbox on a venue contact page is not its public contact',()=>{
 const text='Contact Botanical Garden\nBotanical Garden\nSpalengraben 8\ngarden@ clutter university.ch\nGuided tours in the Botanical Garden\nFor questions about tours please contact garden-events@university.ch.';
 const s=sourceText({url:'https://example.org/contact/',body:`<main><p>${text.replaceAll('\n','</p><p>')}</p></main>`,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 const value='garden-events@university.ch';
 const facts=validateEvidenceFacts({facts:[fact('contact.public_email',value,value)]},s,[field('contact.public_email')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(recheckEvidenceFloors(facts,[s],[field('contact.public_email')],spot)[0].reason,'EXPLICIT_AREA_EMAIL');
 assert.equal(projectEvidenceLedger({spot,fields:[field('contact.public_email')],facts,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('published rotated mailto target yields the browser-visible venue email only',()=>{
 const rotate=(text,amount)=>[...text].map(char=>{const code=char.charCodeAt(0),range=code>=43&&code<=58?[43,58]:code>=64&&code<=90?[64,90]:code>=97&&code<=122?[97,122]:null;if(!range)return char;const [first,last]=range,size=last-first+1;return String.fromCharCode(first+(code-first+amount)%size);}).join('');
 const address='garden@university.ch',token=rotate('mailto:'+address,1);
 const body=`<main><h1>Contact Botanical Garden</h1><p>Botanical Garden<br><a href="#" data-mailto-token="${token}" data-mailto-vector="1">garden@<i class="hidden">clutter</i>university.ch</a></p><h2>Guided tours</h2><p>For questions please contact garden-events@university.ch.</p></main>`;
 const s=sourceText({url:'https://example.org/contact',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.match(s.text,/garden@university\.ch/);assert.doesNotMatch(s.text,/clutter/);
 const chosen=[field('contact.public_email')];
 const claims=[address,'garden-events@university.ch'].map(value=>fact('contact.public_email',value,value));
 const checked=recheckEvidenceFloors(validateEvidenceFacts({facts:claims},s,chosen).map(f=>({...f,state:'ACCEPTED'})),[s],chosen,spot);
 assert.deepEqual(checked.map(f=>f.reason),['SEMANTIC_CHECK_PENDING','EXPLICIT_AREA_EMAIL']);
 const invalid=sourceText({url:'https://example.org/contact',body:body.replace('data-mailto-vector="1"','data-mailto-vector="99"'),contentType:'text/html',observedAt:new Date().toISOString()},'s2',{preferMain:true});
 assert.doesNotMatch(invalid.text,/(?:^|\W)garden@university\.ch(?:\W|$)/u);
});
test('nature visit offers require visitor activity, not garden-map or hours labels',()=>{
 const nature={...spot,name:'Botanical Garden',existingValues:{...spot.existingValues,'classification.primary_category':{value:'OUTDOOR_NATURE'}}};
 const claims=[['Tropical House','The Tropical House offers a tropical experience for visitors.'],['Trees','Locations of greenhouses, outdoor sections and Trees (map as of 2025).'],['Victoria House','Tropical House, Victoria House and adjacent greenhouses 9-17 h']];
 const s=source(claims.map(x=>x[1]).join('\n'));
 const chosen=[{...field('experience.profile'),profileCategory:'OUTDOOR_NATURE'}];
 const facts=validateEvidenceFacts({facts:claims.map(([value,quote])=>fact('experience.profile',value,quote,{subject:'OFFER',offerKind:'VISIT'}))},s,chosen).map(f=>({...f,state:'ACCEPTED'}));
 assert.deepEqual(recheckEvidenceFloors(facts,[s],chosen,nature).map(f=>f.reason),['SEMANTIC_CHECK_PENDING','NATURE_AREA_NOT_VISIT_OFFER','NATURE_AREA_NOT_VISIT_OFFER']);
});
test('published guided tour wording controls kind and all-weather wording is not a restriction',()=>{
 const nature={...spot,name:'Botanical Garden',existingValues:{...spot.existingValues,'classification.primary_category':{value:'OUTDOOR_NATURE'}}};
 const quote='Feierabendführungen sind öffentlich und finden bei jeder Witterung statt.';
 const s=source(quote),chosen=[{...field('experience.profile'),profileCategory:'OUTDOOR_NATURE'}];
 const item=fact('experience.profile','Feierabendführungen',quote,{offerKind:'VISIT',condition:'bei jeder Witterung'});
 const [checked]=recheckEvidenceFloors(validateEvidenceFacts({facts:[item]},s,chosen).map(f=>({...f,state:'ACCEPTED'})),[s],chosen,nature);
 assert.equal(checked.state,'ACCEPTED');assert.equal(checked.offerKind,'GUIDED_TOUR');assert.equal(checked.condition,'');
 const result=projectEvidenceLedger({spot:nature,fields:chosen,facts:[checked],sources:[s],...deps})[0];
 assert.equal(result.value.offers[0].kind,'GUIDED_TOUR');
});
test('private guided-tour section and optional meal bundle cannot become unrestricted tours',()=>{
 const nature={...spot,name:'Botanical Garden',existingValues:{...spot.existingValues,'classification.primary_category':{value:'OUTDOOR_NATURE'}}};
 const title='Führungen & Apéros für private Gruppen und Institutionen';
 const quote='Wir bieten eine allgemeine Gartenführung für maximal 20 Personen an.';
 const text=title+'\n\n'+quote;
 const s={...source(text),headings:[{level:2,text:title,offset:0}]};
 const chosen=[{...field('experience.profile'),profileCategory:'OUTDOOR_NATURE'}];
 const candidates=[fact('experience.profile','Gartenführung',quote,{offerKind:'VISIT'}),fact('experience.profile',title,text,{offerKind:'VISIT'})];
 const checked=recheckEvidenceFloors(validateEvidenceFacts({facts:candidates},s,chosen).map(f=>({...f,state:'ACCEPTED'})),[s],chosen,nature);
 assert.deepEqual(checked.map(f=>f.reason),['PRIVATE_TOUR_AUDIENCE_NOT_RETAINED','OPTIONAL_MEAL_NOT_SINGLE_TOUR']);
});
test('explicitly public tours are not inherited as private from a broad parent heading',()=>{
 const nature={...spot,name:'Botanical Garden',existingValues:{...spot.existingValues,'classification.primary_category':{value:'OUTDOOR_NATURE'}}};
 const heading='Führungen & Apéros für private Gruppen und Institutionen';
 const subheading='Feierabendführungen & Mittagsführungen';
 const quote='Feierabendführungen sind öffentlich und finden bei jeder Witterung statt.';
 const text=heading+'\n\n'+subheading+'\n\n'+quote;
 const s={...source(text),headings:[{level:2,text:heading,offset:0},{level:3,text:subheading,offset:text.indexOf(subheading)}]};
 const chosen=[{...field('experience.profile'),profileCategory:'OUTDOOR_NATURE'}];
 const [checked]=recheckEvidenceFloors(validateEvidenceFacts({facts:[fact('experience.profile','Feierabendführungen',quote,{offerKind:'VISIT',condition:'bei jeder Witterung'})]},s,chosen).map(f=>({...f,state:'ACCEPTED'})),[s],chosen,nature);
 assert.equal(checked.state,'ACCEPTED');assert.equal(checked.offerKind,'GUIDED_TOUR');assert.equal(checked.condition,'');
});
test('a public guided-tour programme can remain a cited draft with unknown dates',()=>{
 const nature={...spot,name:'Botanical Garden',existingValues:{...spot.existingValues,'classification.primary_category':{value:'OUTDOOR_NATURE'}}};
 const quote='Feierabendführungen sind öffentlich. Sobald vorhanden, finden Sie das Programm auf dieser Seite Feierabendführungen.';
 const s={...source(quote),url:'https://example.org/de/fuehrungen/'};
 const chosen=[{...field('experience.profile'),profileCategory:'OUTDOOR_NATURE'}];
 const item=fact('experience.profile','Feierabendführungen',quote,{offerKind:'VISIT',applicability:'CONDITIONAL',condition:'Sobald vorhanden, finden Sie das Programm auf dieser Seite'});
 const [checked]=recheckEvidenceFloors(validateEvidenceFacts({facts:[item]},s,chosen).map(f=>({...f,state:'ACCEPTED'})),[s],chosen,nature);
 assert.equal(checked.state,'ACCEPTED');assert.equal(checked.offerKind,'GUIDED_TOUR');
 const result=projectEvidenceLedger({spot:nature,fields:chosen,facts:[checked],sources:[s],...deps})[0];
 assert.equal(result.status,'REQUIRES_REVIEW');assert.deepEqual(result.value.offers[0].schedule,[]);
 assert.match(result.citations[0].evidence,/Sobald vorhanden/);
});
test('association background links are skipped, but an explicitly stored association seed remains readable',()=>{
 const chosen=[{...field('experience.profile'),profileCategory:'OUTDOOR_NATURE'}];
 const links=[{url:'https://example.org/verein/',label:'Verein',depth:1,topics:['experience']},{url:'https://example.org/fuehrungen/',label:'Führungen',depth:1,topics:['experience']}];
 assert.deepEqual(rankResearchFrontier(links,[],chosen).map(item=>item.url),['https://example.org/fuehrungen/']);
 assert.deepEqual(rankResearchFrontier([{...links[0],depth:0}],[],chosen).map(item=>item.url),['https://example.org/verein/']);
});
test('official FAQ toilet location proves the amenity without claiming off-site toilets',()=>{
 const s=source('Toiletten befinden sich in der Nähe des Tropenhauses. Ein paar Meter am Eingang vorbei auf rechter Hand.\nToilets are located near the tropical greenhouse. A few metres past the entrance on the right.\nThe restrooms are located across the street.');
 const found=enumFactCandidates(field('amenity.features'),[s]);
 assert.deepEqual(found.filter(f=>f.value==='TOILET').map(f=>f.quote),['Toiletten befinden sich in der Nähe des Tropenhauses.','Toilets are located near the tropical greenhouse.']);
});
test('HTML source marks month-range hours as seasonal before weekly projection',()=>{
 const body='<main><h1>Botanical Garden</h1><h2>Opening hours</h2><p>März-Oktober 8-18 Uhr</p><p>November-Februar 8-17 Uhr</p><p>Gewächshäuser 9-17 Uhr</p></main>';
 const s=sourceText({url:'https://example.org/',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.equal(s.seasonalSchedule,true);
 const ordinary=sourceText({url:'https://example.org/',body:'<main><p>Montag bis Sonntag 10-18 Uhr</p></main>',contentType:'text/html',observedAt:new Date().toISOString()},'s2',{preferMain:true});
 assert.equal(ordinary.seasonalSchedule,false);
});
test('corroborated image menu rows become cited review draft offers without prices or catalog approval',()=>{
 const audit={officialMenuUrl:'https://example.org/menu',observedAt:'2026-10-20T12:00:00Z',images:[{url:'https://example.org/board.png',discoveredOn:'https://example.org/menu',assetHash:'a'.repeat(64),visionLines:[{text:'HAUSGEKOCHT'}],localVision:{corroborated:[{name:'Curry',price:'15.5'},{name:'Granola mit Früchten',price:'7.5'}],held:[{name:'Aperol',price:'12.5',reason:'NAME_PRICE_ROW_NOT_CORROBORATED'}]}}]};
 const result=addMenuImageReviewLeads({attributeKey:'experience.profile',status:'UNRESOLVED',reason:'NO_SUPPORTED_TARGET_FACT'}, {...field('experience.profile'),profileCategory:'EAT'},[audit]);
 assert.equal(result.status,'REQUIRES_REVIEW');
 assert.equal(result.value.reviewed,false);
 assert.deepEqual(result.value.offers.map(offer=>offer.name).sort(),['Curry','Granola mit Früchten']);
 assert.ok(result.value.offers.every(offer=>offer.prices.length===0));
 assert.ok(result.citations.every(citation=>citation.layoutReviewRequired&&citation.sourceHash==='a'.repeat(64)&&citation.sourceFormat==='IMAGE_OCR'));
 assert.ok(!JSON.stringify(result).includes('Aperol'));
 assert.equal(addMenuImageReviewLeads({attributeKey:'experience.profile',status:'UNRESOLVED'}, {...field('experience.profile'),profileCategory:'DRINKS'},[audit]).status,'UNRESOLVED');
 assert.equal(addMenuImageReviewLeads({attributeKey:'experience.profile',status:'FAILED',reason:'SOURCE_INTEGRITY_FAILED'}, {...field('experience.profile'),profileCategory:'EAT'},[audit]).status,'FAILED');
});
test('a mixed food-and-coffee board classifies each corroborated row by its own section',()=>{
 const audit={officialMenuUrl:'https://example.org/menu',observedAt:'2026-10-20T12:00:00Z',images:[{url:'https://example.org/mixed.png',discoveredOn:'https://example.org/menu',assetHash:'b'.repeat(64),visionLines:[{text:'HAUSGEKOCHT',y:.9},{text:'CURRY',y:.7},{text:'KAFFEE',y:.5},{text:'CAPPUCCINO',y:.3}],localVision:{corroborated:[{name:'CURRY',price:'15.5'},{name:'CAPPUCCINO',price:'5.8'}]}}]};
 const empty={attributeKey:'experience.profile',status:'UNRESOLVED',reason:'NO_SUPPORTED_TARGET_FACT'};
 const names=category=>addMenuImageReviewLeads(empty,{...field('experience.profile'),profileCategory:category},[audit]).value.offers.map(offer=>offer.name);
 assert.deepEqual(names('EAT'),['CURRY']);assert.deepEqual(names('DRINKS'),['CAPPUCCINO']);
 assert.deepEqual(names('COFFEE_DAYTIME').sort(),['CAPPUCCINO','CURRY']);
});
test('reservation forms do not consume a bounded factual-research page slot',()=>{
 const entries=[
  {url:'https://example.org/angebot/tisch-reservierung',label:'Tisch reservieren',depth:1,topics:['menu','experience']},
  {url:'https://example.org/angebot/speisekarte',label:'Speisekarte',depth:1,topics:['menu','experience']}
 ];
 const chosen=rankResearchFrontier(entries,[],[{...field('experience.profile'),profileCategory:'EAT'}]);
 assert.deepEqual(chosen.map(item=>item.url),['https://example.org/angebot/speisekarte']);
});
test('embedded visitor reviews without a heading cannot supply operator descriptions or offers',()=>{
 const review='The bread that came with hummus was crispy outside and fluffy inside.';
 const text='Speisekarte\n\nHummus mit Brot\n\n'+review+'\nMehr lesen\n\nShuhei Kagawa\n\n5 years ago\n\nWir servieren hausgemachte Speisen im Park.';
 const s=source(text);
 const drafted=[
   {...fact('description.highlight',review,review),id:'f0',sourceId:s.id,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'},
   {...fact('experience.profile','Hummus',review, {subject:'OFFER',offerKind:'GASTRONOMY'}),id:'f1',sourceId:s.id,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}
 ];
 const checked=recheckEvidenceFloors(drafted,[s],[field('description.highlight'),{...field('experience.profile'),profileCategory:'EAT'}],spot);
 assert.deepEqual(checked.map(item=>item.reason),['VISITOR_REVIEW_NOT_OFFICIAL_FACT','VISITOR_REVIEW_NOT_OFFICIAL_FACT']);
 const official='Wir servieren hausgemachte Speisen im Park.';
 const safe=recheckEvidenceFloors([{...fact('description.highlight',official,official),id:'f2',sourceId:s.id,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}],[s],[field('description.highlight')],spot);
 assert.equal(safe[0].reason,'SEMANTIC_SUPPORTED');
});
test('explicit first-party cafe facilities survive deterministic entailment without claiming nearby facilities',()=>{
 const text='CAFÉ MIT TERRASSE IN BASEL STADT\nDEIN NEUES LIEBLINGSCAFÉ IN BASEL MIT WLAN\nBARRIEREFREIER FAMILIENORT IN BASEL MIT FREILUFT SITZPLATZ\nUnd in unserem WC findest du auch einen Wickeltisch.\nDer Spielplatz nebenan gehört nicht zu uns.\nEin Nachbarcafé mit WLAN ist ebenfalls in der Nähe.';
 const found=enumFactCandidates(field('amenity.features'),[source(text)]);
 assert.deepEqual([...new Set(found.map(item=>item.value))].sort(),['CHANGING_TABLE','OUTDOOR_SEATING','TERRACE','TOILET','WIFI']);
 assert.ok(found.every(item=>!item.quote.includes('Nachbarcafé')&&!item.quote.includes('Spielplatz')));
});
test('first-party garden and Sääli assertions survive without importing a neighboring garden',()=>{
 const s=source('Ganzjährlich geöffnet - mit wunderschönem Gartenparadies. Für grössere Gruppen reservieren wir gerne in unserem Sääli. Der Garten nebenan gehört einem anderen Restaurant.');
 const found=enumFactCandidates(field('amenity.features'),[s]);
 assert.deepEqual([...new Set(found.map(item=>item.value))].sort(),['GARDEN','PRIVATE_ROOM']);
 assert.ok(found.every(item=>!item.quote.includes('nebenan')));
});
test('a description preserves St. as part of the place name instead of ending the sentence',()=>{
 const sentence='Das Parkcafé serviert Kaffee und hausgemachte Speisen im St. Johanns-Park am Rhein.';
 const facts=literalSourceFacts(source(sentence),[field('description.highlight')],spot,0);
 assert.ok(facts.some(item=>item.quote===sentence));
 assert.ok(!facts.some(item=>item.quote.endsWith('St.')));
});
test('menu-image discovery can inventory observed pages beyond a four-image preview',()=>{
 const tags=Array.from({length:7},(_,i)=>`<img src="https://assets.example.org/menu-${i}.jpg" alt="menu page ${i}">`).join('');
 const page={url:'https://example.org/speisekarte',contentType:'text/html',body:tags};
 assert.equal(discoverMenuImages(page).length,4);
 assert.equal(discoverMenuImages(page,{maxImages:7}).length,7);
 assert.throws(()=>discoverMenuImages(page,{maxImages:25}),/menu_image_limit_invalid/);
});
test('an unlabeled image between official menu pages remains in the menu inventory',()=>{
 const img=(src,alt)=>`<img src="https://assets.example.org/${src}.png" alt="${alt}">`;
 const page={url:'https://example.org/speisekarte',contentType:'text/html',body:img('logo','Venue')+img('menu-one','Speisekarte')+img('menu-two','Speisekarte')+img('wine-page','')+img('menu-four','Speisekarte')+img('reviewer','Guest photo')};
 assert.deepEqual(discoverMenuImages(page,{maxImages:24}).map(item=>new URL(item.url).pathname),['/menu-one.png','/menu-two.png','/wine-page.png','/menu-four.png']);
 const unrelated={...page,body:img('menu-one','Speisekarte')+img('reviewer','Guest photo')};
 assert.deepEqual(discoverMenuImages(unrelated,{maxImages:24}).map(item=>new URL(item.url).pathname),['/menu-one.png']);
});
test('two OCR engines must agree on a priced menu row at the same visual height',()=>{
 const lines=[{text:'Український борщ',confidence:0.99,x:0.06,y:0.66,width:0.3,height:0.02},{text:'18.00',confidence:0.99,x:0.42,y:0.66,width:0.08,height:0.02},{text:'З пампушками',confidence:0.99,x:0.06,y:0.62,width:0.3,height:0.02},{text:'19.50',confidence:0.99,x:0.82,y:0.4,width:0.08,height:0.02}];
 assert.deepEqual(agreeingPricedRows(lines,'Український борщ 18.00\nЗ пампушками').map(row=>row.name),['Український борщ']);
 assert.deepEqual(agreeingPricedRows(lines,'Борщ 18.00'),[]);
 const variants=[{text:'klein',confidence:1,x:0.1,y:0.5,width:0.2},{text:'26.00',confidence:1,x:0.4,y:0.5,width:0.1},{text:'Deruny Natur dazu',confidence:1,x:0.1,y:0.3,width:0.25},{text:'18.00',confidence:1,x:0.4,y:0.3,width:0.1}];
 assert.deepEqual(agreeingPricedRows(variants,'klein 26.00\nDeruny Natur dazu 18.00'),[]);
});
test('image-menu rows join same-column name continuations but exclude smaller descriptions',()=>{
 const lines=[
  {text:'Hausgemachte Quark',confidence:.98,x:.55,y:.20,width:.20,height:.018},
  {text:'22.50',confidence:.98,x:.86,y:.20,width:.07,height:.018},
  {text:'Küchleine „Syrnyky“',confidence:.96,x:.55,y:.181,width:.24,height:.018},
  {text:'Dazu Sauerrahm',confidence:.96,x:.55,y:.166,width:.20,height:.010},
  {text:'Fremde Spalte',confidence:.98,x:.12,y:.181,width:.20,height:.018}
 ];
 assert.deepEqual(agreeingPricedRows(lines,'Hausgemachte Quark vegi 22.50\nKüchleine „Syrnyky“\nDazu Sauerrahm').map(row=>row.name),['Hausgemachte Quark Küchleine „Syrnyky“']);
 assert.deepEqual(agreeingPricedRows(lines,'Hausgemachte Quark 22.50').map(row=>row.name),[]);
});
test('image-menu leads reject dangling Ukrainian conjunctions and priced add-ons',()=>{
 const rows=[
  {text:'Крем-суп з вершками та',confidence:.99,x:.1,y:.7,width:.3,height:.018},{text:'18.00',confidence:.99,x:.45,y:.7,width:.06,height:.018},
  {text:'Zusätzlicher Kirsch zum Tünkle (2cl)',confidence:.99,x:.55,y:.5,width:.3,height:.018},{text:'5.50',confidence:.99,x:.9,y:.5,width:.05,height:.018}
 ];
 assert.deepEqual(agreeingPricedRows(rows,'Крем-суп з вершками та 18.00\nZusätzlicher Kirsch zum Tünkle (2cl) 5.50'),[]);
});
test('menu-image audit retains both local OCR transcripts with official image provenance',async()=>{
 const url='https://example.org/speisekarte',imageUrl='https://cdn.example.org/menu-page-1.jpg';
 const page={url,contentType:'text/html',body:`<img src="${imageUrl}" alt="Menü Seite 1">`};
 const line={text:'Borschtsch',confidence:.99,x:.1,y:.7,width:.2,height:.02};
 const amount={text:'18.00',confidence:.99,x:.5,y:.7,width:.06,height:.02};
 const report=await auditMenuImages(url,{page,maxImages:1,fetchPage:async requested=>{assert.equal(requested,imageUrl);return {url:requested,contentType:'image/jpeg',body:Buffer.from('public image bytes')};},runCommand:async(command,args)=>command==='swift'?JSON.stringify({path:args[1],lines:[line,amount]}):'Borschtsch 18.00'});
 assert.equal(report.candidateRows,1);
 assert.equal(report.catalogWrites,0);
 assert.equal(report.certifiedComplete,false);
 assert.equal(report.images[0].discoveredOn,url);
 assert.equal(report.images[0].assetHash,createHash('sha256').update('public image bytes').digest('hex'));
 assert.deepEqual(report.images[0].visionLines,[line,amount]);
 assert.deepEqual(report.images[0].tesseractLines,['Borschtsch 18.00']);
});
test('menu-image audit recovers single-decimal prices from a second OCR layout mode',async()=>{
 const url='https://example.org/speisekarte',imageUrl='https://cdn.example.org/menu-1.png';
 const page={url,contentType:'text/html',body:`<img src="${imageUrl}" alt="Speisekarte">`};
 const lines=[{text:'OLIVEN MIT BROT',confidence:.99,x:.26,y:.81,width:.25,height:.025},{text:'6.8',confidence:.99,x:.7,y:.81,width:.07,height:.03}];
 const report=await auditMenuImages(url,{page,maxImages:1,fetchPage:async()=>({url:imageUrl,contentType:'image/png',body:Buffer.from('public image bytes')}),runCommand:async(command,args)=>command==='swift'?JSON.stringify({path:args[1],lines}):args.includes('4')?'=OLIVEN MIT BROT 6.8':'OLIVEN MIT BROT\n6.8'});
 assert.deepEqual(report.images[0].pricedRows.map(row=>row.name),['OLIVEN MIT BROT']);
 assert.deepEqual(report.images[0].tesseractLayoutLines,['=OLIVEN MIT BROT 6.8']);
});
test('bounded menu audit keeps local vision findings inside the image evidence report',async()=>{
 const url='https://example.org/speisekarte',imageUrl='https://cdn.example.org/menu-1.png';
 const page={url,contentType:'text/html',body:`<img src="${imageUrl}" alt="Speisekarte">`};
 const lines=[{text:'OLIVEN MIT BROT',confidence:.99,x:.26,y:.81,width:.25,height:.025},{text:'6.8',confidence:.99,x:.7,y:.81,width:.07,height:.03}];
 const report=await auditMenuImages(url,{page,maxImages:1,fetchPage:async()=>({url:imageUrl,contentType:'image/png',body:Buffer.from('public image bytes')}),runCommand:async(command,args)=>command==='swift'?JSON.stringify({path:args[1],lines}):'OLIVEN MIT BROT 6.8',visionModel:async(bytes,mime,audit)=>{
   assert.equal(mime,'image/png');assert.equal(audit.assetHash,createHash('sha256').update(bytes).digest('hex'));
   return {modelRows:1,corroborated:[{name:'OLIVEN MIT BROT',price:'6.8'}],held:[],catalogWrites:0,certifiedComplete:false};
 }});
 assert.equal(report.visionPages,1);
 assert.deepEqual(report.images[0].localVision.corroborated.map(row=>row.name),['OLIVEN MIT BROT']);
 assert.equal(report.catalogWrites,0);
});
test('local vision menu rows need their own OCR price row and concrete name',()=>{
 const audit={url:'https://assets.example.org/menu.png',discoveredOn:'https://example.org/speisekarte',assetHash:'abc',
  visionLines:[
   {text:'OLIVEN MIT BROT',confidence:.99,x:.26,y:.8,width:.25,height:.025},{text:'6.8',confidence:.99,x:.7,y:.8,width:.07,height:.03},
   {text:'HAUSGEMACHT MIT/OHNE ALK',confidence:.99,x:.26,y:.4,width:.3,height:.025},{text:'12.5',confidence:.99,x:.7,y:.4,width:.07,height:.03},
   {text:'APEROL',confidence:.99,x:.26,y:.37,width:.12,height:.025}
  ],tesseractLines:[],tesseractLayoutLines:['=OLIVEN MIT BROT 6.8','HAUSGEMACHT MIT/OHNE ALK 12.5','APEROL']};
 const raw='```json\n'+JSON.stringify({rows:[{name:'OLIVEN MIT BROT',price:'6.8'},{name:'APEROL',price:'12.5'},{name:'HAUSGEMACHT MIT/OHNE ALK',price:'12.5'},{name:'FLASCHE',price:'57.0'},{name:'ROTE WONNE',price:''}]})+'\n```';
 const result=corroborateMenuVisionRows(raw,audit);
 assert.deepEqual(result.corroborated.map(row=>row.name),['OLIVEN MIT BROT']);
 assert.deepEqual(result.held.map(row=>row.reason),['NAME_PRICE_ROW_NOT_CORROBORATED','GENERIC_OR_CONTEXT_DEPENDENT_NAME','GENERIC_OR_CONTEXT_DEPENDENT_NAME','PRICE_MISSING_OR_INVALID']);
 assert.equal(result.catalogWrites,0);
 assert.throws(()=>parseMenuVisionRows('{"rows":[{"name":"Aperol","price":"12.5","approved":true}]}'),/menu_vision_row_invalid/);
});
test('menu-image inspection remains a cited lead and never an asserted catalog offer',async()=>{
 const menuUrl='https://example.org/speisekarte';
 const menu='<main><h1>Speisekarte</h1><img src="https://cdn.example.org/menu-1.jpg" alt="Menü 1"><img src="https://cdn.example.org/menu-2.jpg" alt="Menü 2"></main>';
 let inspected=0;
 const report=await researchSpotV2({...opts,fields:[field('experience.profile')],sources:[menuUrl],maxRequests:1,inspectMenuImages:true},{...deps,
   fetchPage:async url=>({url,contentType:'text/html',body:menu,observedAt:new Date().toISOString()}),
   inspectMenuImages:async(url,{page})=>{inspected++;assert.equal(url,menuUrl);assert.equal(page.body,menu);return {officialMenuUrl:url,images:[{url:'https://cdn.example.org/menu-1.jpg',assetHash:'abc',pricedRows:[{name:'Suppe',price:'12.00'}]}],candidateRows:1,catalogWrites:0,certifiedComplete:false};},
   modelFetch:modelFor(()=>[])
 });
 assert.equal(inspected,1);
 assert.equal(report.menuMedia.candidateRows,1);
 assert.equal(report.menuMedia.assertions,0);
 assert.equal(report.facts.filter(f=>f.value==='Suppe').length,0);
 assert.equal(report.canonicalWrite,false);
});
test('optional local menu vision counts against the agent model budget and remains review-only',async()=>{
 const url='https://example.org/speisekarte';
 const menu='<main><h1>Speisekarte</h1><img src="https://cdn.example.org/menu-1.jpg" alt="Menü 1"><img src="https://cdn.example.org/menu-2.jpg" alt="Menü 2"></main>';
 let calls=0;
 const report=await researchSpotV2({...opts,fields:[field('experience.profile')],sources:[url],maxRequests:1,inspectMenuImages:true,inspectMenuImagesWithModel:true},{...deps,
   fetchPage:async requested=>({url:requested,contentType:'text/html',body:menu,observedAt:new Date().toISOString()}),
   inspectMenuImages:async(requested,options)=>{assert.equal(requested,url);const image={index:0,url:'https://cdn.example.org/menu-1.jpg',discoveredOn:url,assetHash:'abc',visionLines:[{text:'HAUSGEKOCHT',y:.8}]};
     const localVision=await options.visionModel(Buffer.from('image'),'image/jpeg',image,5000);
     return {officialMenuUrl:url,observedAt:new Date().toISOString(),images:[{...image,localVision}],candidateRows:0,visionPages:1,visionErrors:0,catalogWrites:0,certifiedComplete:false};},
   readMenuImage:async()=>{calls++;return {modelRows:1,corroborated:[{name:'Suppe',price:'12.00'}],held:[],promptHash:'test',raw:'{}',catalogWrites:0,certifiedComplete:false};},
   modelFetch:async(url,init)=>JSON.parse(init.body).response_format?.json_schema?.schema?.properties?.selectedNames?reply({selectedNames:['Suppe']}):modelFor(()=>[])(url,init)
 });
 assert.equal(calls,1);
 assert.equal(report.menuMedia.corroboratedRows,1);
 assert.equal(report.menuMedia.assertions,0);
 assert.equal(report.menuMedia.reviewDraftOffers,1);
 assert.ok(report.actions.findIndex(action=>action.stage==='MENU_REVIEW_SELECTION')>report.actions.findIndex(action=>action.stage==='MENU_MEDIA_AUDITED'));
 assert.ok(report.actions.findIndex(action=>action.stage==='MENU_REVIEW_SELECTION')<report.actions.findIndex(action=>action.stage==='FACTS'));
 assert.deepEqual(report.results.find(result=>result.attributeKey==='experience.profile').value.offers.map(offer=>offer.name),['Suppe']);
 assert.ok(report.modelCalls>=1);
 assert.equal(report.humanReviewRequired,true);
 assert.equal(report.canonicalWrite,false);
});
const opts={spot,fields:[field('contact.phone')],modelPath:'/tmp/'+NUKNUK_MODEL_REVISION,maxRequests:4,maxModelCalls:8};
const deps={validateValue:validateAuthoringSubmission};
test('local web search accepts only loopback, and snippets are leads rather than evidence',async()=>{
 assert.equal(localSearchEndpoint('http://127.0.0.1:8888/'),'http://127.0.0.1:8888/search');
 for(const url of ['https://127.0.0.1:8888/','http://192.168.1.1:8888/','http://localhost:8888/','http://127.0.0.1:8888/redirect','http://user:secret@127.0.0.1:8888/'])assert.throws(()=>localSearchEndpoint(url),/local_search_endpoint_required/);
 const query=planSpotSearches(spot,[field('contact.phone')],spot.existingValues['contact.website'].value,{maxQueries:2});
 assert.equal(query.length,2);assert.match(query[0].query,/site:example\.org/);
 const results=await searchLocalWeb('http://127.0.0.1:8888/',query[0].query,{fetchImpl:async(url,options)=>{
  assert.equal(new URL(url).hostname,'127.0.0.1');assert.equal(new URL(url).searchParams.get('format'),'json');assert.equal(options.redirect,'error');
  return new Response(JSON.stringify({results:[{url:'https://example.org/contact',title:'Synthetic Restaurant – Kontakt',content:'Basel'},{url:'http://127.0.0.1/private',title:'Synthetic Restaurant'},{url:'https://directory.example/place',title:'Other venue'}]}),{headers:{'content-type':'application/json'}});
 }});
 assert.deepEqual(results.map(result=>result.url),['https://example.org/contact','https://directory.example/place']);
 assert.deepEqual(classifySearchResults(results,spot,spot.existingValues['contact.website'].value).official.map(result=>result.url),['https://example.org/contact']);
 assert.equal(permanentSpotSearchLead('https://example.org/events/'),false);
 assert.equal(permanentSpotSearchLead('https://example.org/kalender/'),false);
 assert.equal(permanentSpotSearchLead('https://example.org/museum?date=2026-11-15'),false);
 assert.equal(permanentSpotSearchLead('https://example.org/press/2017/museum.pdf'),false);
 assert.equal(permanentSpotSearchLead('https://example.org/de/node/866'),false);
 assert.equal(permanentSpotSearchLead('https://example.org/de/content-access-denied?destination=/de/node/866'),false);
 assert.equal(permanentSpotSearchLead('https://example.org/en/exhibitions/artist-name'),false);
 assert.equal(permanentSpotSearchLead('https://example.org/de/ausstellungen.html'),false);
 assert.equal(permanentSpotSearchLead('https://example.org/de/veranstaltungen/veranstaltungshighlights/offenes-atelier'),true);
 assert.equal(permanentSpotSearchLead('https://example.org/de/veranstaltungen/veranstaltungshighlights/kinderworkshops'),true);
 assert.equal(permanentSpotSearchLead('https://example.org/de/besuch/ihrevent/fuehrungen-und-workshops'),false);
 assert.equal(permanentSpotSearchLead('https://example.org/de/veranstaltungen/kalender'),false);
 assert.equal(permanentSpotSearchLead('https://example.org/de/sammlung.html?detail=artwork-1'),false);
 assert.equal(permanentSpotSearchLead('https://example.org/de/presse-download'),false);
 assert.equal(permanentSpotSearchLead('https://example.org/dauerausstellung/'),true);
 assert.deepEqual(classifySearchResults([{url:'https://example.org/events/',title:'Synthetic Restaurant Basel',snippet:'Basel'},{url:'https://example.org/museum?date=2026-11-15',title:'Synthetic Restaurant Basel',snippet:'Basel'}],spot,spot.existingValues['contact.website'].value).official,[]);
 const museum={...spot,name:'Fondation Beyeler',existingValues:{...spot.existingValues,'classification.place_types':{value:['MUSEUM']}}};
 assert.match(planSpotSearches(museum,[field('contact.public_email')],museum.existingValues['contact.website'].value,{maxQueries:3})[1].query,/"Visitor Services" site:example\.org/);
 const museumQueries=planSpotSearches(museum,[field('experience.profile')],museum.existingValues['contact.website'].value,{maxQueries:4});
 assert.deepEqual(museumQueries.slice(1,3).map(x=>x.query),['Fondation Beyeler Besuch planen Führungen Atelier site:example.org','Fondation Beyeler Workshop Atelier']);
 let attempts=0;
 const recovered=await searchLocalWeb('http://127.0.0.1:8888/','Museum Tinguely Sammlung',{fetchImpl:async url=>{
  attempts++;
  if(attempts===2)assert.equal(new URL(url).searchParams.get('engines'),'yahoo,yep');
  return new Response(JSON.stringify(attempts===1?{results:[],unresponsive_engines:[['duckduckgo','CAPTCHA']]}:{results:[{url:'https://example.org/sammlung',title:'Museum Tinguely',content:'Sammlung'}]}),{headers:{'content-type':'application/json'}});
 }});
 assert.equal(attempts,2);assert.equal(recovered.length,1);
 let silentEmpty=0;
 const recoveredSilent=await searchLocalWeb('http://127.0.0.1:8888/','Kleiner Wassermann Basel',{fetchImpl:async()=>{
  silentEmpty++;
  return new Response(JSON.stringify(silentEmpty===1?{results:[],unresponsive_engines:[]}:{results:[{url:'https://example.org/menu',title:'Kleiner Wassermann',content:'Menü'}]}),{headers:{'content-type':'application/json'}});
 }});
 assert.equal(silentEmpty,2);assert.equal(recoveredSilent.length,1);
});
test('an ambiguous restaurant name does not admit flights as external identity matches',()=>{
 const restaurant={...spot,name:'Antalya',locality:'Basel'};
 const results=[{url:'https://travel.example/flug/basel-antalya',title:'Flüge Basel Antalya',snippet:'Reisen von Basel in die Stadt Antalya'},{url:'https://guide.example/restaurants/antalya',title:'Antalya Restaurant in Basel',snippet:'Speisekarte am Leonhardsgraben'}];
 assert.deepEqual(classifySearchResults(results,restaurant,'https://restaurantantalya.ch/').external.map(item=>item.url),['https://guide.example/restaurants/antalya']);
 assert.match(planSpotSearches(restaurant,[field('experience.profile')],'https://restaurantantalya.ch/',{maxQueries:2})[1].query,/Speisekarte Gerichte/);
});
test('wellness research asks for the relevant water and spa facilities',()=>{
 const wellness={...spot,name:'aquabasilea',existingValues:{...spot.existingValues,'classification.primary_category':{value:'WELLNESS_RELAXATION'}}};
 assert.match(planSpotSearches(wellness,[field('experience.profile')],'https://www.aquabasilea.ch/',{maxQueries:2})[1].query,/Sauna Spa Hamam Badewelt/);
});
test('unattended selection uses only official-site Admin rows with missing fields',()=>{
 const item=(spotId,website,values={})=>({spotId,name:spotId,existingValues:{'contact.website':website?{knowledgeState:'KNOWN_VALUE',value:website}:undefined,...values}});
 const exported={batch:{spots:[
  item('a','https://a.example.org/',{'contact.phone':{knowledgeState:'KNOWN_VALUE',value:'+41610000000'}}),
  item('b','https://b.example.org/'),
  item('c',null),
  item('d','https://d.example.org/',{'contact.phone':{knowledgeState:'KNOWN_VALUE',value:'+41610000000'},'hours.regular':{knowledgeState:'NOT_APPLICABLE'}}),
 ]}};
 assert.deepEqual(selectResearchSpots(exported,['contact.phone','hours.regular'],{maxSpots:2}).map(x=>x.spotId),['b','a']);
 assert.throws(()=>selectResearchSpots(exported,['contact.phone'],{maxSpots:11}),/automatic_selection_invalid/);
});
test('museum planning omits food and laptop questions before fetching or selecting a batch row',async()=>{
 const museum={...spot,name:'Anatomisches Museum',existingValues:{...spot.existingValues,'contact.website':{knowledgeState:'KNOWN_VALUE',value:'https://example.org/'},'classification.primary_category':{value:'CULTURE_ARTS'},'classification.place_types':{value:['MUSEUM']}}};
 assert.deepEqual(researchFieldRelevance(museum,'offering.groups'),{relevant:false,reason:'FIELD_NOT_APPLICABLE_TO_SPOT_TYPE'});
 assert.deepEqual(researchFieldRelevance(museum,'operation.laptop_policy'),{relevant:false,reason:'FIELD_NOT_APPLICABLE_TO_SPOT_TYPE'});
 assert.equal(researchFieldRelevance(museum,'experience.profile').relevant,true);
 assert.deepEqual(selectResearchSpots({batch:{spots:[museum]}},['offering.groups','operation.laptop_policy'],{maxSpots:1}),[]);
 const report=await researchSpotV2({...opts,spot:museum,fields:[field('offering.groups'),field('operation.laptop_policy')]},{...deps,fetchPage:async()=>{throw Error('irrelevant fetch');}});
 assert.equal(report.stopReason,'NO_FIELDS_REQUIRE_RESEARCH');
 assert.equal(report.requests,0);
 assert.deepEqual(report.results.map(result=>result.reason),['FIELD_NOT_APPLICABLE_TO_SPOT_TYPE','FIELD_NOT_APPLICABLE_TO_SPOT_TYPE']);
 assert.deepEqual(report.researchPlan.activeFields,[]);
});
test('hotel planning retains offering groups for a source-backed breakfast question',()=>{
 const hotel={...spot,name:'Hotel Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'},'classification.place_types':{value:['HOTEL']}}};
 assert.deepEqual(researchFieldRelevance(hotel,'offering.groups'),{relevant:true});
 assert.deepEqual(researchFieldRelevance(hotel,'offering.cuisines'),{relevant:false,reason:'FIELD_NOT_APPLICABLE_TO_SPOT_TYPE'});
});
test('a real museum overview link outranks translations and request forms',()=>{
 const links=discoverResearchLinks({url:'https://www.baslerpapiermuehle.ch/en/home-2/',contentType:'text/html',body:'<a href="/">Deutsch</a><a href="/en/info/">Info</a><a href="/fr/informations/">Informations</a><a href="/informationen/">Informationen</a><a href="/aktuell/">Aktuell</a><a href="/aktuell/">Ausstellung</a><a href="/aktuell/">Mitmachstationen</a><a href="/fr/actualites/">Actualités</a><a href="/en/request-for-guided-tour-groups/">Guided tour request</a><a href="/en/request-for-request-for-room-rental/">Room rental</a>'});
 assert.deepEqual(links.map(link=>link.url),['https://www.baslerpapiermuehle.ch/','https://www.baslerpapiermuehle.ch/en/info/','https://www.baslerpapiermuehle.ch/fr/informations/','https://www.baslerpapiermuehle.ch/informationen/','https://www.baslerpapiermuehle.ch/aktuell/']);
 const frontier=links.map(link=>({...link,depth:1}));
 const ranked=rankResearchFrontier(frontier,[],[{...field('experience.profile'),profileCategory:'CULTURE_ARTS'},field('description.highlight')]);
 assert.equal(ranked[0].url,'https://www.baslerpapiermuehle.ch/');
 assert.ok(ranked.findIndex(link=>link.url.endsWith('/aktuell/'))<ranked.findIndex(link=>link.url.endsWith('/fr/informations/')));
 assert.ok(ranked.findIndex(link=>link.url.endsWith('/informationen/'))<ranked.findIndex(link=>link.url.endsWith('/fr/informations/')));
});
test('museum collection and onsite tours outrank online videos and broad children pages',()=>{
 const entries=['/de/digital/tinguely-home.html','/de/vermittlung-fuehrungen-workshops/freizeitangebot-fuer-kinder.html','/de/tinguely-sammlung-restaurierung/sammlung.html','/de/vermittlung-fuehrungen-workshops/fuehrungen/'].map(path=>({url:'https://example.org'+path,label:path,depth:1,topics:['experience']}));
 const ranked=rankResearchFrontier(entries,[],[{...field('experience.profile'),profileCategory:'CULTURE_ARTS'}]);
 assert.equal(ranked[0].url,entries[2].url);
 assert.equal(ranked[1].url,entries[3].url);
 assert.ok(!ranked.some(x=>x.url===entries[0].url));
});
test('a museum programme overview outranks observed filter variants without hiding unique filtered pages',()=>{
 const url='https://museum.example/de/veranstaltungen/schulen,-gruppen-und-fuehrungen';
 const filtered={url:url+'?targetId=3&typeId=9',depth:1,topics:['experience']};
 const overview={url,depth:1,topics:['experience']};
 const profile={...field('experience.profile'),profileCategory:'CULTURE_ARTS'};
 assert.equal(rankResearchFrontier([filtered,overview],[],[profile])[0].url,url);
 assert.equal(rankResearchFrontier([filtered],[],[profile])[0].url,filtered.url);
});
test('museum visitor planning outranks private-collection and history pages',()=>{
 const museumField={...field('experience.profile'),profileCategory:'CULTURE_ARTS'};
 const links=[
  {url:'https://example.org/de/sammlung/private-sammlungen',label:'Private Sammlungen',depth:1,topics:['experience']},
  {url:'https://example.org/de/sammlung/geschichte',label:'Geschichte',depth:1,topics:['experience']},
  {url:'https://example.org/de/besuch/besuch-planen',label:'Besuch planen',depth:1,topics:['visit']},
 ];
 assert.deepEqual(rankResearchFrontier(links,[],[museumField]).map(link=>link.url),['https://example.org/de/besuch/besuch-planen']);
});
test('a filtered view skips model work only when every source line is already known',()=>{
 const base='https://museum.example.org/de/angebote';
 const rows=Array.from({length:18},(_,i)=>`Angebot ${i+1}: Museumskurs mit eigenem Schwerpunkt.`);
 const original={url:base+'?targetId=3',text:rows.join('\n')};
 const subset={url:base+'?targetId=3&typeId=9',text:rows.slice(0,15).join('\n')};
 assert.equal(sourceSubsumedByEarlier(subset,[original]),true);
 assert.equal(sourceSubsumedByEarlier({...subset,text:subset.text+'\nNeuer Workshop: Keramik selbst gestalten.'},[original]),false);
 assert.equal(sourceSubsumedByEarlier({...subset,url:'https://other.example.org/de/angebote'},[original]),false);
 assert.equal(sourceSubsumedByEarlier({...subset,url:'https://museum.example.org/de/andere-angebote'},[original]),false);
});
test('a translated room overview skips model work only when every room was already accepted',()=>{
 const body=(names,booking)=>'<main><h1>Rooms</h1><h3>'+booking+'</h3>'+names.map(name=>`<h2>${name}</h2><p>${name} is a room available to hotel guests.</p>`).join('')+'</main>';
 const names=['Small Double Room','Medium Double Room','Terrace Club Suite'];
 const earlier=sourceText({url:'https://hotel.example/en/rooms-suites',body:body(names,'room<br>book'),contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 const current=sourceText({url:'https://hotel.example/de/rooms-suites',body:body(names,'Zimmer<br>buchen'),contentType:'text/html',observedAt:new Date().toISOString()},'s2',{preferMain:true});
 const accepted=names.map(value=>({field:'experience.profile',sourceId:'s1',value,state:'ACCEPTED'}));
 assert.equal(equivalentLocalizedRoomInventory(current,[earlier],accepted),true);
 assert.equal(equivalentLocalizedRoomInventory(current,[earlier],accepted.slice(1)),false);
 const changed=sourceText({url:'https://hotel.example/de/rooms-suites',body:body([...names,'Family Suite'],'Zimmer<br>buchen'),contentType:'text/html',observedAt:new Date().toISOString()},'s3',{preferMain:true});
 assert.equal(equivalentLocalizedRoomInventory(changed,[earlier],accepted),false);
 assert.equal(equivalentLocalizedRoomInventory({...current,url:'https://other.example/de/rooms-suites'},[earlier],accepted),false);
});
test('a German room inventory matches its English translation without merging Villa and standard rooms',()=>{
 const de=['Ambiente Doppelzimmer','Business Doppelzimmer','Economy Einzelzimmer','Villa Ambiente Doppelzimmer','Villa Business Doppelzimmer'];
 const en=['Ambience Double Room','Business Double Room','Economy Single Room','Villa Ambiente Double Room','Villa Business Double Room'];
 const page=(url,names,id)=>sourceText({url,contentType:'text/html',observedAt:new Date().toISOString(),body:`<main><h1>Hotel Beispiel</h1>${names.map(name=>`<h2>${name}</h2><p>${name} ist ein Zimmer für Hotelgäste.</p>`).join('')}</main>`},id,{preferMain:true});
 const earlier=page('https://hotel.example/de/zimmer/',de,'s1');
 const current=page('https://hotel.example/en/rooms/',en,'s2');
 const accepted=de.map(value=>({field:'experience.profile',sourceId:'s1',value,state:'ACCEPTED'}));
 assert.equal(equivalentLocalizedRoomInventory(current,[earlier],accepted),true);
 assert.equal(equivalentLocalizedRoomInventory(current,[earlier],accepted.slice(1)),false);
 const changed=page('https://hotel.example/en/rooms/',[...en.slice(0,4),'Villa Family Suite'],'s3');
 assert.equal(equivalentLocalizedRoomInventory(changed,[earlier],accepted),false);
});
test('a multilingual hotel ledger projects one offer per actual room category',()=>{
 const de=['Ambiente Doppelzimmer','Villa Ambiente Doppelzimmer'],en=['Ambience Double Room','Villa Ambiente Double Room'];
 const make=(names,id,url)=>{const text=names.map(name=>`${name}\n\n${name} bietet ein eigenes Bad und bequeme Betten für Hotelgäste.`).join('\n\n');return {...source(text,id),url};};
 const sources=[make(de,'s1','https://example.org/de/zimmer/'),make(en,'s2','https://example.org/en/rooms/')];
 const facts=sources.flatMap((s,index)=>(index?en:de).map(name=>{const quote=`${name}\n\n${name} bietet ein eigenes Bad und bequeme Betten für Hotelgäste.`;return {...fact('experience.profile',name,quote,{subject:'OFFER',subjectLabel:name,offerKind:'OVERNIGHT_STAY'}),sourceId:s.id,sourceOffset:s.text.indexOf(quote),state:'ACCEPTED'};}));
 const stay={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const result=projectEvidenceLedger({spot:stay,fields:[{...field('experience.profile'),profileCategory:'STAY'}],facts,sources,...deps})[0];
 assert.deepEqual(result.value.offers.map(offer=>offer.name),de);
});
test('wellness overview and sauna outrank action-only pages for a wellness profile',()=>{
 const entries=['/badewelt-actionwelt.html','/wellness.html','/sauna.html','/wellness-buchen.html'].map(path=>({url:'https://example.org'+path,label:path,depth:1,topics:['experience']}));
 const ranked=rankResearchFrontier(entries,[],[{...field('experience.profile'),profileCategory:'WELLNESS_RELAXATION'}]);
 assert.deepEqual(ranked.slice(0,2).map(x=>x.url),[entries[2].url,entries[1].url]);
 assert.ok(!ranked.some(x=>x.url===entries[3].url));
});
test('four wellness facts do not hide an unread sauna page, and projection covers different offer kinds',()=>{
 const wellness={...spot,name:'aquabasilea',existingValues:{...spot.existingValues,'classification.primary_category':{value:'WELLNESS_RELAXATION'}}};
 const f={...field('experience.profile'),profileCategory:'WELLNESS_RELAXATION'};
 const texts=[
  ['Sprudelgrotte','BATHING','In der Sprudelgrotte schwimmen Gäste in warmem Wasser und geniessen die beleuchtete Grotte.','https://example.org/badewelt/relaxwelt.html'],
  ['Sugaring','SPA_TREATMENT','Wir bieten Sugaring als hautschonende Haarentfernung im Spa-Bereich des aquabasilea an.','https://example.org/wellness.html'],
  ['Ayurveda-Anwendungen','SPA_TREATMENT','Unsere Ayurveda-Anwendungen werden im Spa von erfahrenem Personal angeboten und individuell besprochen.','https://example.org/wellness.html'],
  ['Hamam Rundgang','SPA_TREATMENT','Ein Hamam Rundgang im aquabasilea umfasst einen Reinigungsbereich und einen Ruhebereich.','https://example.org/wellness/hamam.html'],
  ['Sogukluk','SAUNA','Gestartet wird mit einem Besuch im milden Dampfbad Sogukluk und anschliessender Ruhephase.','https://example.org/wellness/hamam.html'],
 ];
 const sources=texts.map(([, ,quote,url],i)=>({...source(quote,'s'+i),url}));
 const facts=texts.map(([name,kind,quote],i)=>validateEvidenceFacts({facts:[fact('experience.profile',name,quote,{subject:'OFFER',offerKind:kind})]},sources[i],[f])[0]).map(x=>({...x,state:'ACCEPTED'}));
 const frontier=[{url:'https://example.org/wellness/sauna.html',depth:1,topics:['experience']}];
 assert.equal(rankResearchFrontier(frontier,facts.slice(0,4),[f])[0].url,frontier[0].url);
 const result=projectEvidenceLedger({spot:wellness,fields:[f],facts,sources,...deps})[0];
 assert.equal(result.status,'REQUIRES_REVIEW');
 assert.deepEqual(result.value.offers.map(o=>o.name),['Sprudelgrotte','Sugaring','Ayurveda-Anwendungen','Hamam Rundgang','Sogukluk']);
});
test('a permanent museum offer requires an explicit permanence statement',()=>{
 const museum={...spot,name:'Basler Papiermühle',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const chosen=[field('experience.profile')];
 const dated='Sonderausstellung Papier und Druck zeigt die Geschichte des Buches.';
 const permanent='DAUERAUSSTELLUNG\n\nDie Ausstellung zeigt die Geschichte von Papier bis zum fertigen Buch.';
 const one=source(dated),two=source(permanent,'s2');
 const candidates=[...validateEvidenceFacts({facts:[fact('experience.profile','Sonderausstellung Papier und Druck',dated,{subject:'OFFER',offerKind:'PERMANENT_EXHIBITION'})]},one,chosen),...validateEvidenceFacts({facts:[fact('experience.profile','DAUERAUSSTELLUNG',permanent,{subject:'OFFER',offerKind:'PERMANENT_EXHIBITION'})]},two,chosen)].map(item=>({...item,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(candidates,[one,two],chosen,museum);
 assert.equal(checked[0].reason,'PERMANENCE_NOT_EXPLICIT');
 assert.equal(checked[1].reason,'CATEGORY_LABEL_NOT_CONCRETE_OFFER');
});
test('a named museum collection can use the explicitly inflected German permanence statement',()=>{
 const museum={...spot,name:'Museum Tinguely',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'classification.place_types':{value:['MUSEUM']}}};
 const quote='Sammlung Museum Tinguely\n\nDie Werke sind für Besuchende in der permanenten Ausstellung im Museum Tinguely zugänglich.';
 const original=source(quote);
 const draft=validateEvidenceFacts({facts:[fact('experience.profile','Sammlung Museum Tinguely',quote,{subject:'OFFER',offerKind:'PERMANENT_EXHIBITION'})]},original,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(recheckEvidenceFloors(draft,[original],[field('experience.profile')],museum)[0].state,'ACCEPTED');
 const generic=validateEvidenceFacts({facts:[fact('experience.profile','permanenten Ausstellung',quote,{subject:'OFFER',offerKind:'PERMANENT_EXHIBITION'})]},original,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(recheckEvidenceFloors(generic,[original],[field('experience.profile')],museum)[0].reason,'CATEGORY_LABEL_NOT_CONCRETE_OFFER');
});
test('museum collection objects cannot masquerade as four separate permanent exhibitions',()=>{
 const museum={...spot,name:'Museum Tinguely',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const quote='Sammlung Museum Tinguely\n\nDie Skulpturen, Zeichnungen und Briefzeichnungen der Sammlung sind in der permanenten Ausstellung öffentlich zugänglich.';
 const original=source(quote);
 const draft=validateEvidenceFacts({facts:['Sammlung Museum Tinguely','Skulpturen','Zeichnungen','Briefzeichnungen'].map(name=>fact('experience.profile',name,quote,{subject:'OFFER',offerKind:'PERMANENT_EXHIBITION'}))},original,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(draft,[original],[field('experience.profile')],museum);
 assert.deepEqual(checked.map(f=>f.state),['ACCEPTED','HELD','HELD','HELD']);
 assert.deepEqual(checked.slice(1).map(f=>f.reason),['EXHIBITION_TITLE_REQUIRED','EXHIBITION_TITLE_REQUIRED','EXHIBITION_TITLE_REQUIRED']);
});
test('only a named permanent exhibition survives a wrong AREA label',()=>{
 const museum={...spot,name:'Basler Papiermühle - Schweizerisches Museum',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const name='Dauerausstellung Papier und Druck';
 const quote=`${name}\n\nDie Basler Papiermühle zeigt die Geschichte von Papier und Buch in einer dauerhaften Ausstellung mit Werkstätten und Objekten zum Mitmachen.`;
 const official={...source(quote),url:'https://example.org/aktuell/',headings:[{level:3,text:name,offset:0}]};
 const candidate={...fact('experience.profile',name,quote,{subject:'AREA',offerKind:'PERMANENT_EXHIBITION'}),sourceOffset:0};
 assert.equal(certifiedPermanentExhibition(candidate,official,museum),true);
 assert.equal(certifiedPermanentExhibition({...candidate,value:'Dauerausstellung'},official,museum),false);
 assert.equal(certifiedPermanentExhibition(candidate,{...official,url:'https://example.org/aktuell/event/2026/'},museum),false);
 assert.equal(certifiedPermanentExhibition({...candidate,belongsTo:'OTHER'},official,museum),false);
 assert.equal(certifiedPermanentExhibition(candidate,{...official,headings:[]},museum),false);
 const otherQuote=quote.replace('Basler Papiermühle','Anderes Museum');
 assert.equal(certifiedPermanentExhibition({...candidate,quote:otherQuote},{...official,text:otherQuote,headings:[{level:3,text:name,offset:0}]},museum),false);
});
test('museum research projects a named permanent exhibition after correcting model scope and case',async()=>{
 const museum={...spot,name:'Basler Papiermühle - Schweizerisches Museum',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'classification.place_types':{value:['MUSEUM']}}};
 const name='Dauerausstellung Papier und Druck';
 const quote=`${name}\n\nDie Basler Papiermühle zeigt die Geschichte von Papier und Buch in einer dauerhaften Ausstellung mit Werkstätten und Objekten zum Mitmachen.`;
 const official={...source(quote),url:'https://example.org/aktuell/',headings:[{level:3,text:name,offset:0}]};
 const report=await researchSpotV2({...opts,spot:museum,fields:[field('experience.profile')],sources:[official.url],maxRequests:1,maxModelCalls:4,discoverLinks:false},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'<main></main>',observedAt:new Date().toISOString()}),readPage:async()=>official,modelFetch:async(_url,request)=>{
  const input=JSON.parse(JSON.parse(request.body).messages[1].content);
  const block=input.blocks.find(block=>block.text===quote);
  assert.ok(block);
  return reply({facts:[{field:'experience.profile',value:name,blockId:block.id,subject:'AREA',subjectLabel:name,belongsTo:'TARGET',applicability:'CURRENT',restrictionQuote:'',offerKind:'PERMANENT_EXHIBITION',polarity:'AFFIRMATIVE'}],nextLinks:[]});
 }});
 assert.equal(report.results[0].status,'REQUIRES_REVIEW');
 assert.equal(report.results[0].value.offers[0].name,name);
 assert.equal(report.results[0].value.offers[0].kind,'PERMANENT_EXHIBITION');
 assert.equal(report.canonicalWrite,false);
});
test('draft review clearly displays the image-menu limitation',()=>{
 const html=reviewHtml([{name:'Bar',results:[],limitations:['MENU_LAYOUT_REQUIRES_REVIEW']}]);
 const withExtra=reviewHtml([{name:'Café',results:[{attributeKey:'experience.profile',status:'REQUIRES_REVIEW',citations:[{url:'https://example.org/one',evidence:'Curry 15.5',observedAt:'2026-10-20'}],reviewEvidence:[{url:'https://example.org/two',evidence:'Cappuccino 5.8',observedAt:'2026-10-20'}]}]}]);
 assert.match(withExtra,/Curry 15\.5/);assert.match(withExtra,/Cappuccino 5\.8/);
 assert.match(html,/Bild- oder PDF-Speisekarten brauchen eine Layoutprüfung/);
});
test('web-search review separates leads from facts and escapes outside text',()=>{
 const html=searchReviewHtml([{name:'Museum',search:{configured:true,queries:[{query:'Museum Basel',resultCount:1}],leads:[{url:'https://other.example/',title:'<script>alert(1)</script>'}],externalSources:[],discrepancies:[]}}]);
 assert.match(html,/Suchtreffer, kein Beleg/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});
test('batch summary keeps unresolved fields and incomplete spots visible',()=>{
 const summary=summarizeResearchReports([{results:[{status:'REQUIRES_REVIEW'},{status:'UNRESOLVED'}],sourceFailures:[{reason:'TLS'}],modelAudit:[],stopReason:'REQUEST_BUDGET_EXHAUSTED'}],3);
 assert.equal(summary.completedSpots,1);
 assert.equal(summary.deferredSpots,2);
 assert.equal(summary.proposedFields,1);
 assert.equal(summary.fieldStatuses.UNRESOLVED,1);
 assert.equal(summary.sourceFailures,1);
 assert.equal(summary.budgetStopped,1);
 assert.equal(summary.catalogWrites,0);
 assert.equal(summary.readinessCertified,false);
});
test('a resumed batch cannot silently mix reports from another export or spot order',()=>{
 const inputs=[{spotId:'a'},{spotId:'b'}],report={spotId:'a',canonicalWrite:false,importable:false};
 const previous={runKey:'same-export-and-code',canonicalWrite:false,selectedCount:2,reports:[report]};
 assert.deepEqual(resumeResearchReports(previous,'same-export-and-code',inputs),[report]);
 assert.throws(()=>resumeResearchReports(previous,'changed-export',inputs),/research_resume_mismatch/);
 assert.throws(()=>resumeResearchReports(previous,'same-export-and-code',[inputs[1],inputs[0]]),/research_resume_mismatch/);
});
test('a sport activity page remains eligible after model planning adds a menu topic',()=>{
 const frontier=[{url:'https://example.org/bouldern',depth:1,topics:['experience','menu']},{url:'https://example.org/bistro',depth:1,topics:['menu']}];
 const selected=rankResearchFrontier(frontier,[{field:'contact.phone',state:'ACCEPTED'}],[{...field('experience.profile'),profileCategory:'SPORT_MOVEMENT'}]);
 assert.deepEqual(selected.map(item=>item.url),['https://example.org/bouldern']);
});
test('research links include scoped information pages and reject external/action URLs',()=>{
 const links=discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:'<a href="/besuch">Besuch</a><a href="/besuch/barrierefrei">Zugang</a><a href="https://evil.org/kontakt">Kontakt</a><a href="/login">Contact</a><a href="/reservation">Öffnungszeiten</a>'});
 assert.deepEqual(links.map(x=>x.url),['https://example.org/besuch','https://example.org/besuch/barrierefrei']);
});
test('accessible icon links expose observed contact and hours pages',()=>{
 const links=discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:'<a href="/service" aria-label="Kontakt"><svg></svg></a><a href="/schedule" title="Öffnungszeiten"><span class="icon"></span></a><a href="/rooms"><img alt="Zimmer" src="room.svg"></a>'});
 assert.deepEqual(links.map(link=>link.url),['https://example.org/service','https://example.org/schedule','https://example.org/rooms']);
 assert.deepEqual(links.map(link=>link.topics),[['contact'],['hours'],['stay','experience']]);
});
test('parent information section does not turn solar and video pages into visitor facts',()=>{
 const links=discoverResearchLinks({url:'https://example.org/informationen.html',contentType:'text/html',body:'<a href="/informationen/pv-anlage.html">PV Anlage</a><a href="/informationen/videos.html">Videos</a><a href="/informationen/oeffnungszeiten.html">Öffnungszeiten</a>'});
 assert.deepEqual(links.filter(link=>link.topics.length).map(link=>link.url),['https://example.org/informationen/oeffnungszeiten.html']);
});
test('wellness and water-park pages are researchable without following booking forms',()=>{
 const links=discoverResearchLinks({url:'https://example.org/informationen.html',contentType:'text/html',body:'<a href="/badewelt/actionwelt.html">Actionwelt</a><a href="/wellness/sauna.html">Sauna</a><a href="/wellness/hamam.html">Hamam</a><a href="/wellness-buchen.html">Wellness buchen</a><a href="/wellness-buchen.htmll">Wellness</a>'});
 assert.deepEqual(links.filter(link=>link.topics.includes('experience')).map(link=>link.url),['https://example.org/badewelt/actionwelt.html','https://example.org/wellness/sauna.html','https://example.org/wellness/hamam.html']);
});
test('public mailto links retain the inline department context for verification',()=>{
 const html='<main><h1>Restaurant Antalya</h1><p>Leonhardsgraben 8</p><a href="mailto:info@restaurantantalya.ch?subject=Hallo">E-Mail</a><a href="mailto:press@restaurantantalya.ch">Presse</a></main>';
 const read=sourceText({url:'https://www.restaurantantalya.ch/kontakt',body:html,observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.match(read.text,/E-Mail \(info@restaurantantalya\.ch\)/);
 assert.match(read.text,/Presse \(press@restaurantantalya\.ch\)/);
 assert.equal(read.textSelection,'MAIN_CONTENT');
 const staff=sourceText({url:'https://www.restaurantantalya.ch/team/jane',body:html,observedAt:new Date().toISOString()},'s2',{preferMain:true});
 assert.match(staff.text,/info@restaurantantalya\.ch/);
 const evidence=validateEvidenceFacts({facts:[fact('contact.public_email','press@restaurantantalya.ch','press@restaurantantalya.ch')]},read,[field('contact.public_email')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(recheckEvidenceFloors(evidence,[read],[field('contact.public_email')],spot)[0].reason,'EXPLICIT_AREA_EMAIL');
});
test('a hotel instance crawl skips other cities and pagination on the shared brand site',async()=>{
 const hotel={...spot,name:'25hours Hotel Zürich Langstrasse',existingValues:{...spot.existingValues,'contact.website':{value:'https://example.org/de/zurich/langstrasse/'}}};
 const visited=[];
 const body='<main><h1>25hours Hotel Zürich Langstrasse</h1></main><a href="/de/dubai/one-central/rooms/">Rooms</a><a href="/de/zurich/langstrasse/rooms/">Rooms</a><a href="/de/zurich/langstrasse/rooms/?query-0-page=2">Rooms</a>';
 await researchSpotV2({...opts,spot:hotel,maxRequests:4},{...deps,fetchPage:async url=>{visited.push(url);return {url,contentType:'text/html',body,observedAt:new Date().toISOString()};},modelFetch:async()=>reply({verdicts:[]})});
 assert.deepEqual(visited,['https://example.org/de/zurich/langstrasse/','https://example.org/de/zurich/langstrasse/rooms/']);
});
test('a venue profile outranks and excludes dated news or programme paths',()=>{
 const links=discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:'<a href="/home/ueber-das-lokal">Über das Lokal</a><a href="/home/news-leute-machen-orte">News</a><a href="/kunstprogramm">Kunst</a><a href="/informationen/aktuelles.html">Aktuelles</a><a href="/stellenangebote.html">Stellenangebote</a><a href="/kontakt">Kontakt</a>'});
 assert.deepEqual(links.map(link=>link.url),['https://example.org/home/ueber-das-lokal','https://example.org/kontakt']);
 assert.ok(links[0].topics.includes('about'));
});
test('temporary hotel campaigns do not enter permanent-spot research',()=>{
 const links=discoverResearchLinks({url:'https://example.org/de/zurich/langstrasse/',contentType:'text/html',body:'<a href="/de/zurich/langstrasse/rooms/">Zimmer</a><a href="/de/zurich/langstrasse/stay-for-goods/">Stay for Goods</a><a href="/de/zurich/langstrasse/artist-in-hotel-residence/">Artist in Residence</a><a href="/de/zurich/langstrasse/offers/winter/">Winter Offer</a>'});
 assert.deepEqual(links.map(x=>x.url),['https://example.org/de/zurich/langstrasse/rooms/']);
});
test('template expressions are not followed and a late official contact link survives large navigation',()=>{
 const menu=Array.from({length:130},(_,i)=>`<a href="/topic/${i}">Weitere Informationen</a>`).join('');
 const links=discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:menu+'<a href="/de/MenuURLRubrik_de ==">Menü</a><a href="/de/restaurants/browser1.location.pathname.contains(">Restaurants</a><a href="/de/zoobasel/scBackToRubrikLink.data.BackToRubrikLink">Zurück</a><a href="/de/kontakt/">Kontakt</a>'});
 assert.equal(links.length,120);
 assert.ok(links.some(x=>x.url==='https://example.org/de/kontakt/'));
 assert.ok(!links.some(x=>x.url.includes('MenuURL')||x.url.includes('browser1')));
});
test('client template fragments cannot consume a bounded source request',()=>{
 const links=discoverResearchLinks({url:'https://example.org/besuchen/',contentType:'text/html',body:'<a href="/besuchen/RubrikMenuURL_de ==">Mehr erfahren</a><a href="/bouldern">Bouldern</a><a href="/kontakt">Kontakt</a>'});
 assert.deepEqual(links.map(x=>x.url),['https://example.org/bouldern','https://example.org/kontakt']);
 assert.ok(links[0].topics.includes('experience'));
});
test('a menu price is not a date and a later contact heading ends event scope',()=>{
 const text='Speisekarte\nBurger Da Pia mit Pommes Frites\n19.50 Fr.\nTeigwaren und Risotto frisch zubereitet.\n20.08.2026\nBoulder-Rave\nEin Abend mit Musik.\nKontakt & Anfahrt\nÖffnungszeiten\nMO 09.00 bis 23.00\nAllgemein\nelys@boulderloft.ch';
 const s={...source(text),headings:[{level:2,text:'Speisekarte',offset:0},{level:3,text:'Boulder-Rave',offset:text.indexOf('Boulder-Rave')},{level:2,text:'Kontakt & Anfahrt',offset:text.indexOf('Kontakt & Anfahrt')}]};
 const cases=[fact('experience.profile','Risotto','Teigwaren und Risotto frisch zubereitet.',{subject:'OFFER',offerKind:'GASTRONOMY'}),fact('description.highlight','Ein Abend mit Musik.','Ein Abend mit Musik.'),fact('contact.public_email','elys@boulderloft.ch','elys@boulderloft.ch')];
 const values=validateEvidenceFacts({facts:cases},s,[field('experience.profile'),field('description.highlight'),field('contact.public_email')]).map(f=>({...f,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(values,[s],[field('experience.profile'),field('description.highlight'),field('contact.public_email')],spot);
 assert.equal(checked[0].state,'ACCEPTED');
 assert.equal(checked[1].reason,'DATED_EVENT_NOT_PERMANENT_SPOT_FACT');
 assert.equal(checked[2].state,'ACCEPTED');
});
test('dated news path ending in HTML cannot supply a permanent venue description',()=>{
 const text='Im November findet das Lichterfest im Bad statt.';
 const s={...source(text),url:'https://example.org/informationen/aktuelles.html'};
 const f=validateEvidenceFacts({facts:[fact('description.highlight',text,text)]},s,[field('description.highlight')]).map(item=>({...item,state:'ACCEPTED'}));
 const [checked]=recheckEvidenceFloors(f,[s],[field('description.highlight')],spot);
 assert.equal(checked.reason,'DATED_EVENT_NOT_PERMANENT_SPOT_FACT');
});
test('restaurant kitchen hours and department email never override whole-venue values',()=>{
 const restaurant={...spot,name:'Pizzeria Da Pia'};
 const text='Pizzeria Da Pia\nÖffnungszeiten\nMo – Fr\n08:30 – 23:00\nÖffnungszeiten Küche\nMo – Sa 11:00 – 14:00\nKontakt\nAllgemein\ninfo@restaurant-dapia.ch\nKurse & Gruppen\nkurse@restaurant-dapia.ch';
 const s={...source(text),headings:[{level:3,text:'Öffnungszeiten',offset:text.indexOf('Öffnungszeiten')}]};
 const items=[fact('hours.regular','Mo – Fr\n08:30 – 23:00','Mo – Fr\n08:30 – 23:00'),fact('hours.regular','Mo – Sa 11:00 – 14:00','Mo – Sa 11:00 – 14:00'),fact('contact.public_email','info@restaurant-dapia.ch','info@restaurant-dapia.ch'),fact('contact.public_email','kurse@restaurant-dapia.ch','kurse@restaurant-dapia.ch')];
 const chosen=[field('hours.regular'),field('contact.public_email')];
 const facts=validateEvidenceFacts({facts:items},s,chosen).map(f=>({...f,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(facts,[s],chosen,restaurant);
 assert.equal(checked[0].state,'ACCEPTED');
 assert.equal(checked[1].reason,'EXPLICIT_AREA_HOURS');
 assert.equal(checked[2].state,'ACCEPTED');
 assert.equal(checked[3].reason,'EXPLICIT_AREA_EMAIL');
});
test('split lunch and dinner hours merge without inventing closed weekdays',()=>{
 const rows=['Mi-Fr 12-14 Uhr','Di-Do 17-22 Uhr','Fr & Sa 17-23 Uhr'];
 const text='Öffnungszeiten\n'+rows.join('\n');
 const s=source(text);
 const make=quotes=>validateEvidenceFacts({facts:quotes.map(q=>fact('hours.regular',q,q))},s,[field('hours.regular')]).map(f=>({...f,state:'ACCEPTED'}));
 const partial=projectEvidenceLedger({spot,fields:[field('hours.regular')],facts:make(rows),sources:[s],...deps})[0];
 assert.equal(partial.status,'REQUIRES_REVIEW');
 assert.equal(partial.partialHours,true);
 assert.equal(partial.value.length,5);
 assert.ok(!partial.value.some(row=>['MONDAY','SUNDAY'].includes(row.day)));
 assert.match(reviewHtml([{name:'Test',results:[partial]}]),/Nicht genannte Wochentage sind unbekannt/);
 const fullText=text+'\nMo geschlossen\nSo geschlossen';
 const full=source(fullText);
 const facts=validateEvidenceFacts({facts:[...rows,'Mo geschlossen','So geschlossen'].map(q=>fact('hours.regular',q,q))},full,[field('hours.regular')]).map(f=>({...f,state:'ACCEPTED'}));
 const result=projectEvidenceLedger({spot,fields:[field('hours.regular')],facts,sources:[full],...deps})[0];
 assert.equal(result.status,'REQUIRES_REVIEW');
 assert.deepEqual(result.value.find(row=>row.day==='FRIDAY').intervals,[{start:'12:00',end:'14:00'},{start:'17:00',end:'23:00'}]);
});
test('role mailbox cannot conflict with a venue-wide contact email',()=>{
 const text='¡Che, que lomo!\nCatering@chequelomo.ch\nKontakt\ninfo@chequelomo.ch';
 const s=source(text);
 const chosen=[field('contact.public_email')];
 const facts=validateEvidenceFacts({facts:[fact('contact.public_email','Catering@chequelomo.ch','Catering@chequelomo.ch'),fact('contact.public_email','info@chequelomo.ch','info@chequelomo.ch')]},s,chosen).map(f=>({...f,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(facts,[s],chosen,spot);
 assert.equal(checked[0].reason,'EXPLICIT_AREA_EMAIL');
 assert.equal(checked[1].state,'ACCEPTED');
 assert.equal(projectEvidenceLedger({spot,fields:chosen,facts:checked,sources:[s],validateValue:validateAuthoringSubmission})[0].value,'info@chequelomo.ch');
});
test('wellness department mailboxes and poolbar hours cannot override the venue',()=>{
 const wellness={...spot,name:'aquabasilea',existingValues:{...spot.existingValues,'classification.primary_category':{value:'WELLNESS_RELAXATION'}}};
 const text='aquabasilea\ninfo@aquabasilea.ch\nspa@aquabasilea.ch\nquality@aquabasilea.ch\nPoolbar La Brise\nTäglich von 10.30 - 21.30 Uhr';
 const s={...source(text),headings:[{level:4,text:'Poolbar La Brise',offset:text.indexOf('Poolbar La Brise')}]};
 const selected=[field('contact.public_email'),field('hours.regular')];
 const values=[fact('contact.public_email','info@aquabasilea.ch','info@aquabasilea.ch'),fact('contact.public_email','spa@aquabasilea.ch','spa@aquabasilea.ch'),fact('contact.public_email','quality@aquabasilea.ch','quality@aquabasilea.ch'),fact('hours.regular','Täglich von 10.30 - 21.30 Uhr','Täglich von 10.30 - 21.30 Uhr')];
 const checked=recheckEvidenceFloors(validateEvidenceFacts({facts:values},s,selected).map(item=>({...item,state:'ACCEPTED'})),[s],selected,wellness);
 assert.deepEqual(checked.map(item=>item.reason),['SEMANTIC_CHECK_PENDING','EXPLICIT_AREA_EMAIL','EXPLICIT_AREA_EMAIL','EXPLICIT_AREA_HOURS']);
});
test('pool equipment cannot be projected as separate bookable wellness experiences',()=>{
 const wellness={...spot,name:'aquabasilea',existingValues:{...spot.existingValues,'classification.primary_category':{value:'WELLNESS_RELAXATION'}}};
 const quote='Im Aussenbecken sind Strömungskanal, Nackenduschen, Wasserfontänen und Unterwassermassagedüsen besondere Anziehungspunkte.';
 const s=source(quote),selected=[field('experience.profile')];
 const candidates=['Strömungskanal','Nackenduschen','Wasserfontänen','Unterwassermassagedüsen'].map(value=>fact('experience.profile',value,quote,{subject:'OFFER',offerKind:value.includes('massage')?'MASSAGE':'BATHING'}));
 const checked=recheckEvidenceFloors(validateEvidenceFacts({facts:candidates},s,selected).map(item=>({...item,state:'ACCEPTED'})),[s],selected,wellness);
 assert.ok(checked.every(item=>item.reason==='WELLNESS_FACILITY_NOT_OFFER'));
 assert.equal(projectEvidenceLedger({spot:wellness,fields:selected,facts:checked,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('a wellness profile excludes incidental food and title-only treatment fragments',()=>{
 const wellness={...spot,name:'aquabasilea',existingValues:{...spot.existingValues,'classification.primary_category':{value:'WELLNESS_RELAXATION'}}};
 const text='Private Hamam Suite very exclusive\nIm arabischen Café geniessen Gäste einen Tee nach dem Hamam.';
 const s=source(text),selected=[field('experience.profile')];
 const items=[fact('experience.profile','Private Hamam Suite','Private Hamam Suite very exclusive',{subject:'OFFER',offerKind:'SPA_TREATMENT'}),fact('experience.profile','Tee','Im arabischen Café geniessen Gäste einen Tee nach dem Hamam.',{subject:'OFFER',offerKind:'GASTRONOMY'})];
 const checked=recheckEvidenceFloors(validateEvidenceFacts({facts:items},s,selected).map(item=>({...item,state:'ACCEPTED'})),[s],selected,wellness);
 assert.deepEqual(checked.map(item=>item.reason),['WELLNESS_OFFER_DESCRIPTION_REQUIRED','OFFER_OUTSIDE_RESEARCH_FOCUS']);
});
test('a single address-bound general inbox wins over same-domain booking inbox',()=>{
 const hotel={...spot,name:'ART HOUSE Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'},'location.address_line1':{value:'Steinenvorstadt 42'}}};
 const text='ART HOUSE Basel\nSteinenvorstadt 42\ninfo@arthousebasel.ch\nQuestions about booking? hotel@arthousebasel.ch';
 const s=source(text);
 const chosen=[field('contact.public_email')];
 const facts=validateEvidenceFacts({facts:[fact('contact.public_email','info@arthousebasel.ch','info@arthousebasel.ch'),fact('contact.public_email','hotel@arthousebasel.ch','hotel@arthousebasel.ch')]},s,chosen).map(item=>({...item,state:'ACCEPTED'}));
 const result=projectEvidenceLedger({spot:hotel,fields:chosen,facts,sources:[s],...deps})[0];
 assert.equal(result.value,'info@arthousebasel.ch');
 assert.equal(result.citations.length,1);
 const other=source(text+'\ninfo@otherhotel.ch');
 const mixed=validateEvidenceFacts({facts:[fact('contact.public_email','info@arthousebasel.ch','info@arthousebasel.ch'),fact('contact.public_email','info@otherhotel.ch','info@otherhotel.ch')]},other,chosen).map(item=>({...item,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:hotel,fields:chosen,facts:mixed,sources:[other],...deps})[0].reason,'CONFLICTING_TARGET_VALUES');
});
test('public client-data discovery follows only observed read-only same-host endpoints',()=>{
 const page={url:'https://zoo.example.org/de/zoobesuch/r/1/oeffnungszeiten/',contentType:'text/html',body:'{{Oeffnungszeit_de}}<dmx-serverconnect id="scOeffnungszeiten" url="/dmxConnect/api/Website/de/Oeffnungszeiten.php" dmx-param:wrid="query.wrid"><dmx-serverconnect id="scStatsPage" url="/dmxConnect/api/Website/Stats/Oeffnungszeiten.php"><dmx-serverconnect id="scOther" url="https://evil.org/dmxConnect/api/Website/Oeffnungszeiten.php"><dmx-serverconnect id="scKontakt" url="/dmxConnect/api/Website/de/Kontakt.php" dmx-param:uid="query.missing">'};
 assert.deepEqual(discoverPublicDataSources(page).map(x=>x.url),['https://zoo.example.org/dmxConnect/api/Website/de/Oeffnungszeiten.php?wrid=1']);
 assert.deepEqual(discoverPublicDataSources({...page,body:page.body.replace('{{Oeffnungszeit_de}}','') }),[]);
});
test('a page-bound public sidebar yields contacts and seasonal hours without event copy',async()=>{
 const page={url:'https://park.example.org/besuchen/r/1/parkbesuch/',contentType:'text/html',body:'<dmx-serverconnect id="scSidebar" url="/dmxConnect/api/Website/includes/Sidebar.php"><dmx-serverconnect id="scStatsPage" url="/dmxConnect/api/Website/Stats/Page.php"><div dmx-bind:repeat="scSidebar.data.qryOeffnungszeiten">{{Oeffnungszeit_de}}</div><p>{{scSidebar.data.sqrySidebarContact.Telefon}}</p>'};
 const [item]=discoverPublicDataSources(page);
 assert.equal(item.url,'https://park.example.org/dmxConnect/api/Website/includes/Sidebar.php');
 assert.deepEqual(item.topics,['contact','hours']);
 const payload={sqrySidebarContact:{Firma_de:'Tierpark Lange Erlen',Adresszeile1:'Erlenparkweg 110',Telefon:'+41 61 681 43 44',EMail:'info@erlen-verein.ch'},qryOeffnungszeiten:[{Kategorie_de:'März bis Oktober',Oeffnungszeit_de:'Täglich von 08.00 bis 18.00 Uhr'},{Kategorie_de:'November bis Februar',Oeffnungszeit_de:'Täglich von 08.00 bis 17.00 Uhr'}],qrySidebarEvents:[{VeranstaltungText_de:'Ausstellung täglich 12–17 Uhr'}]};
 const source=await readSourceText({url:item.url,contentType:'application/json',body:JSON.stringify(payload),observedAt:new Date().toISOString()},'s1');
 assert.match(source.text,/Tierpark Lange Erlen/);assert.match(source.text,/Erlenparkweg 110/);assert.match(source.text,/08.00 bis 18.00 Uhr/);
 assert.doesNotMatch(source.text,/Ausstellung täglich/);assert.equal(source.seasonalSchedule,true);
});
test('sport research accepts the canonical bouldering kind when the activity is literal',()=>{
 const sport={...spot,name:'ELYS Boulderloft',existingValues:{...spot.existingValues,'classification.primary_category':{value:'SPORT_MOVEMENT'}}};
 const text='Bouldern ist Klettern in Absprunghöhe, ohne Seil und Gurt, dafür auf dicken Matten.';
 const s=source(text);
 const item=fact('experience.profile','Bouldern',text,{subject:'OFFER',subjectLabel:'Bouldern',offerKind:'BOULDERING'});
 const facts=validateEvidenceFacts({facts:[item]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 const result=projectEvidenceLedger({spot:sport,fields:[field('experience.profile')],facts,sources:[s],...deps})[0];
 assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.value.offers[0].kind,'BOULDERING');
 const target=validateEvidenceFacts({facts:[{...item,subject:'TARGET'}]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:sport,fields:[field('experience.profile')],facts:target,sources:[s],...deps})[0].status,'REQUIRES_REVIEW');
 const food=validateEvidenceFacts({facts:[fact('experience.profile','Pizza','Wir bieten Pizza aus dem Bistro an.',{subject:'TARGET',offerKind:'GASTRONOMY'})]},source('Wir bieten Pizza aus dem Bistro an.'),[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:sport,fields:[field('experience.profile')],facts:food,sources:[source('Wir bieten Pizza aus dem Bistro an.')],...deps})[0].status,'UNRESOLVED');
});
test('a wine list is not a concrete restaurant offer even when the model approves it',()=>{
 const text='Unsere Weinkarte im Restaurant bietet ausgewählte Weine, perfekt abgestimmt auf unsere Spezialitäten.';
 const s=source(text);
 const item=fact('experience.profile','Weinkarte',text,{subject:'TARGET',subjectLabel:'Weinkarte',offerKind:'GASTRONOMY'});
 const facts=validateEvidenceFacts({facts:[item]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot,fields:[field('experience.profile')],facts,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('an explicit move away from the stored address stops old-Spot research',async()=>{
 const old={...spot,name:'Roter Bären',existingValues:{...spot.existingValues,'location.address_line1':{value:'Ochsengasse 17'}}};
 const body='<main><h1>Wir sind umgezogen</h1><p>Der Rote Bären ist neu im Perron zu Hause. Seit August kochen wir am Vogesenplatz 1 weiter.</p></main>';
 const result=await researchSpotV2({...opts,spot:old,fields:[field('description.highlight'),field('contact.phone')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:async()=>{throw new Error('model must not run after relocation');}});
 assert.equal(result.stopReason,'IDENTITY_RELOCATION_REQUIRES_REVIEW');assert.equal(result.modelCalls,0);
 assert.ok(result.results.every(r=>r.status==='UNRESOLVED'));
});
test('membership benefits are not visitor offers and office phones stay separate',()=>{
 const museum={...spot,name:'S AM Schweizerisches Architekturmuseum',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const member=source('Eine exklusive Führung durch die Ausstellung Ihrer Wahl pro Jahr.');member.url='https://example.org/de/mitglied-werden';
 const offer=fact('experience.profile','Eine exklusive Führung durch die Ausstellung Ihrer Wahl pro Jahr',member.text,{subject:'TARGET',offerKind:'GUIDED_TOUR'});
 const offerFacts=validateEvidenceFacts({facts:[offer]},member,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('experience.profile')],facts:offerFacts,sources:[member],...deps})[0].status,'UNRESOLVED');
 const contact=source('Telefonnummer Büro:: +41 (0)61 261 14 13\nTelefonnummer Museumsfoyer: +41 (0)61 206 99 01');
 const phoneFacts=validateEvidenceFacts({facts:[fact('contact.phone','+41 (0)61 261 14 13','+41 (0)61 261 14 13'),fact('contact.phone','+41 (0)61 206 99 01','+41 (0)61 206 99 01')]},contact,[field('contact.phone')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:museum,fields:[field('contact.phone')],facts:phoneFacts,sources:[contact],...deps})[0].value,'+41612069901');
});
test('slash-separated weekday groups remain one literal schedule row',()=>{
 assert.deepEqual(fieldCandidates(field('hours.regular'),[source('Öffnungszeiten\nDi/MI/Fr 11–18:00H')]).flatMap(c=>parseHoursRow(c.quote)).map(r=>r.day),['TUESDAY','WEDNESDAY','FRIDAY']);
});
test('a hotel reception schedule and a Hôtel heading are not whole-Spot offers',()=>{
 const stay={...spot,name:'Hotel Brasserie au Violon',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const schedule='Öffnungszeiten Rezeption:\nMontag bis Samstag von 8.00 bis 21.00 Uhr';
 const s=source(schedule);
 const hours=validateEvidenceFacts({facts:[fact('hours.regular','Montag bis Samstag von 8.00 bis 21.00 Uhr','Montag bis Samstag von 8.00 bis 21.00 Uhr')]},s,[field('hours.regular')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:stay,fields:[field('hours.regular')],facts:hours,sources:[s],...deps})[0].status,'UNRESOLVED');
 const title=source('hotel brasserie au violon - Hôtel');
 const offers=validateEvidenceFacts({facts:[fact('experience.profile','Hôtel',title.text,{subject:'TARGET',offerKind:'OVERNIGHT_STAY'})]},title,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:stay,fields:[field('experience.profile')],facts:offers,sources:[title],...deps})[0].status,'UNRESOLVED');
});
test('a hotel room list with an explicit availability sentence yields named review offers',async()=>{
 const stay={...spot,name:'Hotel Brasserie au Violon',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const body='<main><h1>Hotel Brasserie au Violon</h1><p>Unsere Zimmer sind individuell gestaltet.</p><p>Es stehen verschiedene Zimmer zur Auswahl:<br>Zimmer "Münster" und Zimmer "Lohnhof"</p></main>';
 const report=await researchSpotV2({...opts,spot:stay,fields:[field('experience.profile')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(report.results[0].status,'REQUIRES_REVIEW');
 assert.deepEqual(report.results[0].value.offers.map(o=>o.name),['Zimmer "Münster"','Zimmer "Lohnhof"']);
});
test('literal hotel room detail heading survives a mistaken AREA label',async()=>{
 const stay={...spot,name:'Airport Hotel Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const quote='Familienzimmer mit Platz für die ganze Familie und eigenem Bad.',business='Business Zimmer mit ruhigem Arbeitsplatz und eigenem Bad.';
 const pages={'https://example.org/':'<main><h1>Airport Hotel Basel</h1><a href="/zimmer/familienzimmer">Familienzimmer</a><a href="/zimmer/business-zimmer">Business Zimmer</a></main>','https://example.org/zimmer/familienzimmer':`<main><p>Airport Hotel Basel</p><h1>Familienzimmer</h1><p>${quote}</p></main>`,'https://example.org/zimmer/business-zimmer':`<main><p>Airport Hotel Basel</p><h1>Business Zimmer</h1><p>${business}</p></main>`};
 const report=await researchSpotV2({...opts,spot:stay,fields:[field('experience.profile')],maxRequests:3},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:pages[url],observedAt:new Date().toISOString()}),modelFetch:modelFor(data=>data.source.url.endsWith('/familienzimmer')?[fact('experience.profile','Familienzimmer',quote,{subject:'AREA',belongsTo:'UNKNOWN',offerKind:'OVERNIGHT_STAY'})]:data.source.url.endsWith('/business-zimmer')?[fact('experience.profile','Business Zimmer',business,{subject:'AREA',belongsTo:'UNKNOWN',offerKind:'OVERNIGHT_STAY'})]:[])});
 assert.equal(report.results[0].status,'REQUIRES_REVIEW');
 assert.deepEqual(report.sources.map(s=>s.url),Object.keys(pages));
 assert.deepEqual(report.results[0].value.offers.map(o=>o.name),['Familienzimmer','Business Zimmer']);
 assert.ok(report.facts.some(f=>f.value==='Familienzimmer'&&f.reason==='STRUCTURED_HOTEL_ROOM'));
});
test('official room detail with numeric CMS suffix retains its exact room heading',async()=>{
 const stay={...spot,name:'ART HOUSE Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const quote='Arthouse Club Suite offers a separate sitting area and a quiet place to rest.';
 const url='https://example.org/en/rooms-suites/arthouse-club-suite-40';
 const body=`<main><p>ART HOUSE Basel</p><h1>Arthouse Club Suite</h1><p>${quote}</p></main>`;
 const report=await researchSpotV2({...opts,spot:stay,fields:[field('experience.profile')],sources:[url],maxRequests:1},{...deps,fetchPage:async()=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.deepEqual(report.results[0].value.offers.map(offer=>offer.name),['Arthouse Club Suite']);
 assert.ok(report.facts.some(f=>f.value==='Arthouse Club Suite'&&f.reason==='STRUCTURED_HOTEL_ROOM'));
 const title='Arthouse Club Suite | ART HOUSE Basel';
 const sourcePage={...source(title+'\n\nArthouse Club Suite\n\n'+quote),url,headings:[{level:1,text:'Arthouse Club Suite',offset:title.length+2}]};
 const short=validateEvidenceFacts({facts:[fact('experience.profile','Arthouse Club Suite',title,{subject:'OFFER',offerKind:'OVERNIGHT_STAY'})]},sourcePage,[field('experience.profile')]).map(item=>({...item,state:'ACCEPTED'}));
 // A site title is not a room description, even when the room itself exists.
 assert.equal(recheckEvidenceFloors(short,[sourcePage],[field('experience.profile')],stay)[0].reason,'ROOM_DETAIL_DESCRIPTION_REQUIRED');
});
test('a room page titled for another hotel cannot become this hotel’s offer',async()=>{
 const stay={...spot,name:'Airport Hotel Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const body='<main><p>Other Hotel</p><h1>Familienzimmer</h1><p>Familienzimmer mit Platz für die ganze Familie und eigenem Bad.</p></main>';
 const report=await researchSpotV2({...opts,spot:stay,fields:[field('experience.profile')],sources:['https://example.org/zimmer/familienzimmer'],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(report.results[0].status,'UNRESOLVED');
});
test('hotel amenity sentences cannot masquerade as room names',()=>{
 const stay={...spot,name:'Hotel Brasserie au Violon',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const text='Alle Zimmer sind mit Dusche/WC, Schreibtisch, Direktwahltelefon und Haarfön ausgestattet.';
 const offer=fact('experience.profile','Zimmer sind mit Dusche/WC, Schreibtisch, Direktwahltelefon und Haarfön ausgestattet',text,{subject:'OFFER',offerKind:'OVERNIGHT_STAY'});
 const s=source(text),facts=validateEvidenceFacts({facts:[offer]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:stay,fields:[field('experience.profile')],facts,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('malformed ampersand paths never enter the official research frontier',()=>{
 const links=discoverResearchLinks({url:'https://hotel.example.org/',contentType:'text/html',body:'<a href="/&#38;">Hotel</a><a href="/&">Hotel</a><a href="/Hotel/Zimmer/">Zimmer</a>'});
 assert.deepEqual(links.map(link=>link.url),['https://hotel.example.org/Hotel/Zimmer/']);
});
test('punctuation-only links cannot consume a hotel research request',()=>{
 const links=discoverResearchLinks({url:'https://hotel.example.org/Hotel/PsdEW/',contentType:'text/html',body:'<a href="&">Hotel</a><a href="/Hotel/Zimmer/P62zQ/">Zimmer</a>'});
 assert.deepEqual(links.map(link=>link.url),['https://hotel.example.org/Hotel/Zimmer/P62zQ/']);
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
test('single-venue sport hours under an explicit regular heading survive later dated exceptions',async()=>{
 const sport={...spot,name:'Kletterhalle 7',existingValues:{...spot.existingValues,'classification.primary_category':{value:'SPORT_MOVEMENT'},'location.address_line1':{value:''}}};
 const body='<title>Kletterhalle 7 – Klettern in Basel</title><main><h1>Kletterhalle 7</h1><h2>Öffnungszeiten</h2><p>Reguläre Öffnungszeiten</p><p>Montag–Freitag: 12.00–22.30 Uhr</p><p>Samstag–Sonntag: 10.00–18.00 Uhr</p><h2>Schulferienzeit Sommer</h2><p>03.07.27 bis 08.08.27</p><p>Montag–Freitag: 16.30–22.00 Uhr</p></main>';
 const result=await researchSpotV2({...opts,spot:sport,fields:[field('hours.regular')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:async()=>reply({verdicts:[]})});
 assert.equal(result.results[0].value?.length,7);
 assert.equal(result.results[0].value?.find(day=>day.day==='MONDAY')?.intervals[0].start,'12:00');
 assert.equal(result.results[0].value?.find(day=>day.day==='SUNDAY')?.intervals[0].end,'18:00');
});
test('dated event copy on a homepage cannot become a permanent venue description',()=>{
 const s=source('16. Oktober 2026 |\n20:00 |\nEintritt frei\nTapas Festival\nDie Idee ist einfach: von Lokal zu Lokal ziehen, verschiedene Tapas probieren und gemeinsam anstossen.');
 const quote='Die Idee ist einfach: von Lokal zu Lokal ziehen, verschiedene Tapas probieren und gemeinsam anstossen.';
 const facts=validateEvidenceFacts({facts:[fact('description.highlight',quote,quote)]},s,[field('description.highlight')]).map(f=>({...f,state:'ACCEPTED'}));
 const [result]=projectEvidenceLedger({spot,fields:[field('description.highlight')],facts,sources:[s],...deps});
 assert.equal(result.status,'UNRESOLVED');
});
test('a wrapped-line fragment cannot become a standalone spot description',()=>{
 const text='In den letzten Jahren fanden Kunstinstallationen,\nLesungen und Stand-Up Comedy ihren Weg in die Bar.\n\nHeute finden Gäste hier Kultur und Getränke.';
 const s=source(text),fragment='Lesungen und Stand-Up Comedy ihren Weg in die Bar.',complete='Heute finden Gäste hier Kultur und Getränke.';
 const facts=validateEvidenceFacts({facts:[fact('description.highlight',fragment,fragment),fact('description.highlight',complete,complete)]},s,[field('description.highlight')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot,fields:[field('description.highlight')],facts:[facts[0]],sources:[s],...deps})[0].status,'UNRESOLVED');
 assert.equal(projectEvidenceLedger({spot,fields:[field('description.highlight')],facts:[facts[1]],sources:[s],...deps})[0].value,complete);
});
test('description selection sees a complete sentence across visual line wraps',async()=>{
 const sentence='Hier finden Gäste Getränke und kulturelle Angebote,\ndie regelmässig stattfinden und zum Mitmachen einladen.';
 const body=`<main><h1>Synthetic Restaurant</h1><p>${sentence}</p></main>`;
 let candidates=[];
 await researchSpotV2({...opts,fields:[field('description.highlight')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:async(_url,init)=>{candidates=JSON.parse(JSON.parse(init.body).messages[1].content).candidates.map(c=>c.text);return reply({selected:[]});}});
 assert.ok(candidates.includes(sentence));
 assert.ok(!candidates.some(text=>text.startsWith('die regelmässig')));
});
test('menu-image ingredient words do not become named drink offers without layout review',()=>{
 const bar={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'DRINKS'}}};
 const s={...source('PIMM S, GINGER ALE, ORANGE, LIME, PFEFFERMINZ, GURKE'),format:'IMAGE_OCR',layoutReviewRequired:true};
 const facts=validateEvidenceFacts({facts:[fact('experience.profile','GINGER ALE',s.text,{subject:'OFFER',offerKind:'DRINKS'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:bar,fields:[field('experience.profile')],facts,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('unverified menu layouts remain review-only when an observed PDF cannot be read',async()=>{
 const body='<main><h1>Synthetic Restaurant</h1><a href="/menu.pdf">Speisekarte</a><img src="/speisekarte.jpg" alt="Speisekarte"></main>';
 const report=await researchSpotV2({...opts,fields:[field('experience.profile')],maxRequests:3},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(report.requests,2);
 assert.ok(report.limitations.includes('MENU_LAYOUT_REQUIRES_REVIEW'));
 assert.equal(report.results.find(result=>result.attributeKey==='experience.profile').status,'UNRESOLVED');
 assert.deepEqual(discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body}).map(link=>link.url),[]);
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
test('an ongoing named exhibition becomes a visit draft without a permanent-exhibition claim',async()=>{
 const target={...spot,name:'Novartis Pavillon',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'contact.website':{value:'https://example.org/pavillon'}}};
 const quote='Inside, you will find the interactive exhibition Wonders of Medicine that explores the past, present and future of medicine.';
 const r=await researchSpotV2({...opts,spot:target,fields:[field('experience.profile')],sources:['https://example.org/pavillon'],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:`<main><h1>Novartis Pavillon</h1><p>${quote}</p></main>`,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[fact('experience.profile','Wonders of Medicine',quote,{subject:'OFFER',subjectLabel:'Wonders of Medicine',offerKind:'PERMANENT_EXHIBITION'})])});
 assert.equal(r.results[0].status,'REQUIRES_REVIEW');
 assert.deepEqual(r.results[0].value.offers.map(o=>[o.name,o.kind]),[['Wonders of Medicine','VISIT']]);
 assert.equal(r.facts.find(f=>f.value==='Wonders of Medicine')?.offerKind,'VISIT');
});
test('critic context stays inside the cited sibling collection section',async()=>{
 const target={...spot,name:'Synthetic Museum',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'contact.website':{value:'https://example.org/sammlung.html'}}};
 const body='<main><h1>Sammlung</h1><h2>Orient</h2><p>Die Sammlung Orient ist geschlossen.</p><h2>Skulpturen</h2><p>Die Sammlung zeigt griechische und römische Skulpturen im Museum und ermöglicht Besucherinnen und Besuchern einen Rundgang durch die Ausstellung.</p></main>';
 let examined=false;
 const r=await researchSpotV2({...opts,spot:target,fields:[field('experience.profile')],sources:['https://example.org/sammlung.html'],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:async(_url,init)=>{
   const data=JSON.parse(JSON.parse(init.body).messages[1].content);
   if(data.claims){
     const candidate=data.source.claims.find(x=>x.section.includes('Skulpturen'));
     assert.ok(candidate);assert.ok(!candidate.surrounding.includes('geschlossen'));examined=true;
     return reply({verdicts:data.claims.map(f=>({factId:f.id,verdict:'SUPPORTED',subject:'OFFER',belongsTo:'TARGET',applicability:'CURRENT',restrictionQuote:''}))});
   }
   return reply({facts:[],nextLinks:[]});
 }});
 assert.ok(examined);assert.ok(r.results[0].value.offers.some(o=>o.name==='Skulpturen'));
});
test('adaptive crawl follows second-level contact page without operator source preparation',async()=>{
 const pages={
 'https://example.org/':'<a href="/besuch">Informationen für den Besuch</a>',
 'https://example.org/besuch':'<a href="/besuch/kontakt">Kontakt</a>',
 'https://example.org/besuch/kontakt':'<p>Telefon: +41 61 111 22 33</p>'};
 const r=await researchSpotV2(opts,{...deps,fetchPage:async url=>({url,contentType:'text/html',body:pages[url],observedAt:new Date().toISOString()}),modelFetch:modelFor(data=>data.source.text.includes('Telefon:')?[fact('contact.phone','+41 61 111 22 33','Telefon: +41 61 111 22 33')]:[])});
 assert.equal(r.requests,3);assert.equal(r.results[0].value,'+41611112233');assert.equal(r.stopReason,'FRONTIER_EXHAUSTED');assert.equal(r.coverage[0].complete,false);assert.equal(r.canonicalWrite,false);assert.equal(r.importable,false);
});
test('search finds the primary-language page before translated overviews consume the budget',async()=>{
 const target={...spot,name:'Basler Papiermühle',locality:'Basel',existingValues:{...spot.existingValues,'contact.website':{value:'https://example.org/en/home-2/'},'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const fetched=[];
 const report=await researchSpotV2({...opts,spot:target,fields:[field('description.highlight')],webSearchEndpoint:'http://127.0.0.1:8888/',maxSearchQueries:1,maxExternalPages:0,maxRequests:4},{...deps,
  fetchPage:async url=>{fetched.push(url);return {url,contentType:'text/html',body:url.endsWith('/en/home-2/')?'<main>Basler Papiermühle</main><a href="/en/info/">Info</a><a href="/fr/informations/">Informations</a>':'<main>Basler Papiermühle</main>',observedAt:new Date().toISOString()};},
  searchWeb:async()=>[{url:'https://example.org/',title:'Basler Papiermühle Basel',snippet:'Offizielle Website'}],
  modelFetch:modelFor(()=>[])});
 assert.deepEqual(fetched,['https://example.org/en/home-2/','https://example.org/']);
 assert.equal(report.search.queries.length,1);
 assert.ok(report.actions.some(action=>action.stage==='TRANSLATED_OVERVIEW_DEFERRED'));
});
test('a stored contact-page seed queues and reads the same-host homepage as HTML',async()=>{
 const restaurant={...spot,existingValues:{...spot.existingValues,'contact.website':{value:'https://example.org/kontakt'}}};
 const fetched=[];
 const r=await researchSpotV2({...opts,spot:restaurant,fields:[field('description.highlight')],maxRequests:2,discoverLinks:false},{...deps,fetchPage:async url=>{fetched.push(url);return {url,contentType:'text/html',body:url.endsWith('/kontakt')?'<main><h1>Kontakt</h1></main>':'<main><h1>Synthetic Restaurant</h1><p>Wir servieren hausgemachte Spezialitäten aus der Region in unserem Restaurant.</p></main>',observedAt:new Date().toISOString()};},modelFetch:modelFor(()=>[])});
 assert.deepEqual(fetched,['https://example.org/kontakt','https://example.org/']);
 assert.equal(r.sources.length,2);
 assert.ok(!r.sourceFailures.some(f=>f.reason==='EMBEDDED_FORMAT_REJECTED'));
});
test('a rejected promotional description does not hide a second factual passage',async()=>{
 const promotional='Bei uns erleben Sie ein unvergessliches Geschmackserlebnis, das alle Ihre Sinne verzaubert.';
 const factual='Unsere Küche serviert anatolische Gerichte und frisch zubereitete Pide im Restaurant.';
 const body=`<main><h1>Synthetic Restaurant</h1><p>${promotional}</p><p>${factual}</p></main>`;
 const r=await researchSpotV2({...opts,fields:[field('description.highlight')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:async(_url,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(input.candidates)return reply({selected:input.candidates.map(c=>c.id)});
  return reply({verdicts:input.claims.map(f=>({factId:f.id,verdict:f.quote===promotional?'UNSUPPORTED':'SUPPORTED',subject:'TARGET',belongsTo:'TARGET',applicability:'CURRENT',restrictionQuote:''}))});
 }});
 assert.equal(r.results[0].status,'REQUIRES_REVIEW');
 assert.equal(r.results[0].value,factual);
});
test('local web search recovers an official contact page and flags a contradictory external page without using it as evidence',async()=>{
 const target={...spot,locality:'Basel',existingValues:{...spot.existingValues,'contact.phone':{knowledgeState:'KNOWN_VALUE',value:'+41611112233'}}};
 const pages={
  'https://example.org/':'<main>Synthetic Restaurant Basel</main>',
  'https://example.org/kontakt':'<main>Synthetic Restaurant Basel. E-Mail: info@synthetic-restaurant.ch</main>',
  'https://city.example.ch/restaurant':'<main>Synthetic Restaurant Basel, Teststrasse 1. Telefon +41 61 999 88 77</main>'};
 const report=await researchSpotV2({...opts,spot:target,fields:[field('contact.public_email'),field('contact.phone')],skipKnownFields:true,webSearchEndpoint:'http://127.0.0.1:8888/',maxSearchQueries:1,maxExternalPages:1,maxRequests:4},{...deps,
  fetchPage:async url=>({url,contentType:'text/html',body:pages[url],observedAt:new Date().toISOString()}),
  searchWeb:async()=>[{url:'https://example.org/kontakt',title:'Synthetic Restaurant Basel Kontakt',snippet:'E-Mail'},{url:'https://city.example.ch/restaurant',title:'Synthetic Restaurant Basel',snippet:'Teststrasse 1'}],
  modelFetch:modelFor(()=>[])});
 assert.equal(report.search.queries.length,1);
 assert.equal(report.search.externalSources[0].identity,'MATCHED');
 assert.deepEqual(report.search.discrepancies.map(item=>item.field),['contact.phone']);
 assert.equal(report.results.find(item=>item.attributeKey==='contact.phone').status,'SKIPPED');
 assert.equal(report.results.find(item=>item.attributeKey==='contact.public_email').value,'info@synthetic-restaurant.ch');
 assert.equal(report.humanReviewRequired,true);
 assert.equal(report.sources.every(source=>source.url.startsWith('https://example.org/')),true);
 assert.equal(report.canonicalWrite,false);
});
test('failed optional search stays visible and cannot fabricate a proposal',async()=>{
 const report=await researchSpotV2({...opts,webSearchEndpoint:'http://127.0.0.1:8888/',maxSearchQueries:1,maxRequests:2},{...deps,
  fetchPage:async url=>({url,contentType:'text/html',body:'<main>Synthetic Restaurant Basel</main>',observedAt:new Date().toISOString()}),
  searchWeb:async()=>{throw new Error('search_http_403');},modelFetch:modelFor(()=>[])});
 assert.equal(report.search.queries[0].error,'search_http_403');
 assert.ok(report.limitations.includes('WEB_SEARCH_DEGRADED'));
 assert.equal(report.results[0].status,'UNRESOLVED');
 assert.equal(report.canonicalWrite,false);
});
test('a same-name external listing without the exact address cannot become a contradiction',async()=>{
 const target={...spot,locality:'Basel',existingValues:{...spot.existingValues,'contact.phone':{knowledgeState:'KNOWN_VALUE',value:'+41611112233'}}};
 const report=await researchSpotV2({...opts,spot:target,fields:[field('contact.phone'),field('contact.public_email')],skipKnownFields:true,webSearchEndpoint:'http://127.0.0.1:8888/',maxSearchQueries:1,maxExternalPages:1,maxRequests:3},{...deps,
  fetchPage:async url=>({url,contentType:'text/html',body:url.includes('city.example.ch')?'<main>Synthetic Restaurant Basel. Telefon +41 61 999 88 77</main>':'<main>Synthetic Restaurant Basel</main>',observedAt:new Date().toISOString()}),
  searchWeb:async()=>[{url:'https://city.example.ch/listing',title:'Synthetic Restaurant Basel',snippet:'Basel'}],modelFetch:modelFor(()=>[])});
 assert.equal(report.search.externalSources[0].identity,'UNCONFIRMED');
 assert.deepEqual(report.search.discrepancies,[]);
});
test('semantic cross-check records a literal external contradiction without promoting it to a Spot fact',async()=>{
 const officialQuote='Unsere Focaccia Sandwiches werden frisch zubereitet und am Tresen angeboten.';
 const externalQuote='Synthetic Restaurant Basel, Teststrasse 1, bietet keine Focaccia Sandwiches an.';
 const target={...spot,locality:'Basel'};
 const base=modelFor(data=>data.source.text.includes(officialQuote)?[fact('experience.profile','Focaccia Sandwiches',officialQuote,{subject:'OFFER',subjectLabel:'Focaccia Sandwiches',offerKind:'GASTRONOMY'})]:[]);
 const report=await researchSpotV2({...opts,spot:target,fields:[field('experience.profile')],webSearchEndpoint:'http://127.0.0.1:8888/',maxSearchQueries:1,maxExternalPages:1,maxRequests:2,maxModelCalls:6},{...deps,
  fetchPage:async url=>({url,contentType:'text/html',body:url.includes('city.example.ch')?`<main>${externalQuote}</main>`:`<main>${officialQuote}</main>`,observedAt:new Date().toISOString()}),
  searchWeb:async()=>[{url:'https://city.example.ch/listing',title:'Synthetic Restaurant Basel',snippet:'Teststrasse 1'}],
  modelFetch:async(url,init)=>{
    const body=JSON.parse(init.body);
    if(body.messages[0].content.includes('Compare exact claims')){
      const data=JSON.parse(body.messages[1].content);
      return reply({checks:data.claims.map(claim=>({factId:claim.id,verdict:'CONTRADICTS',quote:externalQuote}))});
    }
    return base(url,init);
  }});
 assert.equal(report.search.semanticCounterchecks[0].verdict,'CONTRADICTS');
 assert.equal(report.search.semanticCounterchecks[0].quote,externalQuote);
 assert.equal(report.results[0].status,'REQUIRES_REVIEW');
 assert.equal(report.results[0].value.offers[0].name,'Focaccia Sandwiches');
 assert.equal(report.sources.length,1);
 assert.equal(report.canonicalWrite,false);
 const invalid=await researchSpotV2({...opts,spot:target,fields:[field('experience.profile')],webSearchEndpoint:'http://127.0.0.1:8888/',maxSearchQueries:1,maxExternalPages:1,maxRequests:2,maxModelCalls:6},{...deps,
  fetchPage:async url=>({url,contentType:'text/html',body:url.includes('city.example.ch')?`<main>${externalQuote}</main>`:`<main>${officialQuote}</main>`,observedAt:new Date().toISOString()}),
  searchWeb:async()=>[{url:'https://city.example.ch/listing',title:'Synthetic Restaurant Basel',snippet:'Teststrasse 1'}],
  modelFetch:async(url,init)=>{
    const body=JSON.parse(init.body);
    if(body.messages[0].content.includes('Compare exact claims')){
      const data=JSON.parse(body.messages[1].content);
      return reply({checks:data.claims.map(claim=>({factId:claim.id,verdict:'CONTRADICTS',quote:'Erfundener Widerspruch'}))});
    }
    return base(url,init);
  }});
 assert.equal(invalid.search.semanticCounterchecks[0].verdict,'UNCERTAIN');
 assert.equal(invalid.search.semanticCounterchecks[0].reason,'QUOTE_NOT_FOUND');
 assert.ok(invalid.limitations.includes('CROSS_CHECK_UNGROUNDED'));
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
 assert.equal(r.facts[0].state,'HELD');assert.equal(r.facts[0].reason,'VERDICT_MISSING_OR_DUPLICATE');assert.equal(r.results[0].status,'UNRESOLVED');assert.ok(r.actions.some(a=>a.stage==='VERDICT_ID_ERROR'));
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
test('the same general schedule and Wednesday exception in two languages agree',()=>{
 const english=source('Monday–Sunday: 10 a.m. – 6 p.m.\nWednesday: 10 a.m. – 8 p.m.');
 const german={...source('Montag–Sonntag: 10–18 Uhr\nMittwoch: 10–20 Uhr','s2'),url:'https://example.org/de/besuch'};
 const facts=[
  ...ledger([fact('hours.regular','Monday–Sunday: 10 a.m. – 6 p.m.','Monday–Sunday: 10 a.m. – 6 p.m.'),fact('hours.regular','Wednesday: 10 a.m. – 8 p.m.','Wednesday: 10 a.m. – 8 p.m.')],english),
  ...ledger([fact('hours.regular','Montag–Sonntag: 10–18 Uhr','Montag–Sonntag: 10–18 Uhr'),fact('hours.regular','Mittwoch: 10–20 Uhr','Mittwoch: 10–20 Uhr')],german).map(f=>({...f,sourceId:'s2'})),
 ];
 const result=projectEvidenceLedger({spot,fields:[field('hours.regular')],facts,sources:[english,german],...deps})[0];
 assert.equal(result.status,'REQUIRES_REVIEW');
 assert.equal(result.value.length,7);
 assert.equal(result.value.find(row=>row.day==='WEDNESDAY').intervals[0].end,'20:00');
});
test('a legal imprint mailbox cannot become the public visitor email',()=>{
 const imprint={...source('Impressum\nVerantwortlich für Inhalte\nDigitale Kommunikation\nkommunikation@fondationbeyeler.ch'),url:'https://example.org/de/impressum'};
 const email=validateEvidenceFacts({facts:[fact('contact.public_email','kommunikation@fondationbeyeler.ch','kommunikation@fondationbeyeler.ch')]},imprint,[field('contact.public_email')]).map(f=>({...f,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(email,[imprint],[field('contact.public_email')],spot);
 assert.equal(checked[0].reason,'EXPLICIT_AREA_EMAIL');
 assert.equal(projectEvidenceLedger({spot,fields:[field('contact.public_email')],facts:email,sources:[imprint],...deps})[0].status,'UNRESOLVED');
});
test('a staff page retains mailto scope and accepts only its visitor-services inbox',()=>{
 const page={url:'https://example.org/de/mitarbeitende',contentType:'text/html',observedAt:new Date().toISOString(),body:'<main><h1>Team</h1><h2>Digitale Kommunikation</h2><a href="mailto:kommunikation@museum.ch">Kontakt</a><h2>Visitor Services</h2><a href="mailto:info@museum.ch">Kontakt</a></main>'};
 const staff=sourceText(page,'s1',{preferMain:true});
 assert.match(staff.text,/Digitale Kommunikation\n\s*Kontakt \(kommunikation@museum\.ch\)/);
 assert.match(staff.text,/Visitor Services\n\s*Kontakt \(info@museum\.ch\)/);
 const facts=validateEvidenceFacts({facts:[fact('contact.public_email','kommunikation@museum.ch','kommunikation@museum.ch'),fact('contact.public_email','info@museum.ch','info@museum.ch')]},staff,[field('contact.public_email')]).map(f=>({...f,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(facts,[staff],[field('contact.public_email')],spot);
 assert.equal(checked[0].reason,'EXPLICIT_AREA_EMAIL');
 assert.equal(checked[1].state,'ACCEPTED');
 const result=projectEvidenceLedger({spot,fields:[field('contact.public_email')],facts,sources:[staff],...deps})[0];
 assert.equal(result.value,'info@museum.ch');
});
test('a long museum artwork list does not hide the visitor-facing collection summary at its end',()=>{
 const artworks=Array.from({length:500},(_,i)=>`<p>Jean Tinguely Kunstwerk ${i} aus der Sammlung.</p>`).join('');
 const summary='Die Sammlung ist in der permanenten Ausstellung im Museum für Besuchende zugänglich.';
 const read=sourceText({url:'https://example.org/de/sammlung.html',contentType:'text/html',observedAt:new Date().toISOString(),body:`<main><h1>Sammlung</h1>${artworks}<h2>Sammlung Museum Tinguely</h2><p>${summary}</p></main>`},'s1',{preferMain:true});
 assert.ok(read.text.length<=12000);
 assert.match(read.text,/mittlerer Seitenteil ausgelassen/);
 assert.ok(read.text.includes(summary));
 assert.ok(read.descriptionText.includes(summary));
 const heading=read.headings.find(h=>h.text==='Sammlung Museum Tinguely');
 assert.equal(read.text.slice(heading.offset,heading.offset+heading.text.length),heading.text);
});
test('museum extraction actually receives the summary after a long artwork list',async()=>{
 const summary='Die Sammlung Museum Tinguely ist für Besuchende in der permanenten Ausstellung zugänglich.';
 const artworks=Array.from({length:500},(_,i)=>`<p>Jean Tinguely Kunstwerk ${i} aus der Sammlung.</p>`).join('');
 const museum={...spot,name:'Museum Tinguely',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'classification.place_types':{value:['MUSEUM']}}};
 let offered=[];
 await researchSpotV2({...opts,spot:museum,fields:[field('experience.profile')],maxRequests:1,discoverLinks:false},{...deps,
  fetchPage:async url=>({url,contentType:'text/html',observedAt:new Date().toISOString(),body:`<main><h1>Museum Tinguely</h1>${artworks}<h2>Sammlung Museum Tinguely</h2><p>${summary}</p></main>`}),
  modelFetch:async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.blocks)offered=input.blocks;return input.claims?reply({verdicts:input.claims.map(f=>({factId:f.id,verdict:'UNSUPPORTED',subject:'UNKNOWN',belongsTo:'UNKNOWN',applicability:'UNCERTAIN',restrictionQuote:''}))}):reply({facts:[],nextLinks:[]});},
 });
 assert.ok(offered.some(block=>block.text.includes(summary)));
});
test('plain-text museum tour titles are paired with their exact description for extraction',async()=>{
 const museum={...spot,name:'Synthetic Museum',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'classification.place_types':{value:['MUSEUM']}}};
 let offered=[];
 await researchSpotV2({...opts,spot:museum,fields:[field('experience.profile')],maxRequests:1,discoverLinks:false},{...deps,
  fetchPage:async url=>({url,contentType:'text/html',observedAt:new Date().toISOString(),body:'<main><h1>Synthetic Museum</h1><p>Private Gruppenführungen</p><p>Wir bieten private Führungen durch die Sammlung in mehreren Sprachen an.</p></main>'}),
  modelFetch:async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.blocks)offered=input.blocks;return input.claims?reply({verdicts:input.claims.map(f=>({factId:f.id,verdict:'UNSUPPORTED',subject:'UNKNOWN',belongsTo:'UNKNOWN',applicability:'UNCERTAIN',restrictionQuote:''}))}):reply({facts:[],nextLinks:[]});},
 });
 assert.ok(offered.some(block=>block.text==='Private Gruppenführungen\n\nWir bieten private Führungen durch die Sammlung in mehreren Sprachen an.'));
});
test('a staff-directory tour email link does not establish a bookable guided tour',()=>{
 const text='Rundgänge und Gruppen (tours@museum.ch)';
 const directory={...source(text),url:'https://example.org/de/mitarbeitende'};
 const draft=validateEvidenceFacts({facts:[fact('experience.profile','Rundgänge und Gruppen',text,{offerKind:'GUIDED_TOUR'})]},directory,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(recheckEvidenceFloors(draft,[directory],[field('experience.profile')],spot)[0].reason,'CONTACT_LINK_NOT_OFFER_EVIDENCE');
 assert.equal(projectEvidenceLedger({spot,fields:[field('experience.profile')],facts:draft,sources:[directory],...deps})[0].status,'UNRESOLVED');
});
test('search continues with an unresolved field after the official seed has no useful links',async()=>{
 const queries=[];
 const report=await researchSpotV2({...opts,discoverLinks:false,webSearchEndpoint:'http://127.0.0.1:8888/',maxSearchQueries:3},{...deps,
  fetchPage:async url=>({url,contentType:'text/html',body:'<main><p>No contact information on this page.</p></main>',observedAt:new Date().toISOString()}),
  searchWeb:async(_endpoint,query)=>{queries.push(query);return [];},
 });
 assert.equal(report.search.queries.length,2);
 assert.match(queries[0],/site:example\.org/);
 assert.match(queries[1],/Kontakt Telefon E-Mail/);
 assert.equal(report.results[0].status,'UNRESOLVED');
});
test('a redirected official seed is not fetched again from search results',async()=>{
 const fetched=[];
 const report=await researchSpotV2({...opts,webSearchEndpoint:'http://127.0.0.1:8888/',maxSearchQueries:1,discoverLinks:false,maxRequests:4},{...deps,
  fetchPage:async url=>{fetched.push(url);return {url:'https://example.org/de.html',redirectedFrom:['https://example.org/'],contentType:'text/html',body:'<main>Synthetic Restaurant</main>',observedAt:new Date().toISOString()};},
  searchWeb:async()=>[{url:'https://example.org/de.html',title:'Synthetic Restaurant',snippet:'Official page'}],
 });
 assert.deepEqual(fetched,['https://example.org/']);
 assert.equal(report.search.queries.length,1);
});
test('an unresolved museum email does not starve collection research',async()=>{
 const museum={...spot,name:'Synthetic Museum',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'classification.place_types':{value:['MUSEUM']}}};
 const fetched=[];
 const report=await researchSpotV2({...opts,spot:museum,fields:[field('contact.public_email'),field('experience.profile')],maxRequests:4,maxModelCalls:8},{...deps,
  fetchPage:async url=>{fetched.push(url);return {url,contentType:'text/html',observedAt:new Date().toISOString(),body:url==='https://example.org/'?'<main><h1>Synthetic Museum</h1><a href="/de/kontakt">Kontakt</a><a href="/de/mitarbeitende">Mitarbeitende</a><a href="/de/sammlung">Sammlung</a></main>':'<main><h1>Synthetic Museum</h1><p>Further information.</p></main>'};},
  modelFetch:modelFor(()=>[]),
 });
 assert.deepEqual(fetched.slice(0,4),['https://example.org/','https://example.org/de/kontakt','https://example.org/de/mitarbeitende','https://example.org/de/sammlung']);
 assert.equal(report.results.find(x=>x.attributeKey==='experience.profile').status,'UNRESOLVED');
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
test('nested CMS content div excludes navigation and unrelated footer while preserving the venue H1',()=>{
 const body='<nav>Neighbour café has free Wi-Fi</nav><div id="main"><div class="main-content" id="content"><h1>Novartis Pavillon</h1><section><div><h2>Plan your visit</h2><p>We have bathrooms for everyone at Novartis Pavillon.</p></div></section></div><aside>Campus phone +41 61 999 99 99</aside></div><footer>Corporate contact</footer>';
 const s=sourceText({url:'https://example.org/pavillon',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.equal(s.textSelection,'MAIN_CONTENT');
 assert.ok(s.text.includes('We have bathrooms for everyone at Novartis Pavillon.'));
 assert.ok(!s.text.includes('Neighbour café'));
 assert.ok(!s.text.includes('Campus phone'));
 assert.ok(!s.text.includes('Corporate contact'));
 for(const heading of s.headings)assert.equal(s.text.slice(heading.offset,heading.offset+heading.text.length),heading.text);
});
test('CMS hero heading immediately before a content div remains attached to its body',()=>{
 const body='<nav>Other locations</nav><div class="hero"><h1>Über die Ausstellung «Wonders of Medicine»</h1></div><div id="main"><div id="content"><p>Ziel der Ausstellung ist es, medizinische Themen verständlich aufzubereiten und Besucherinnen und Besucher zum Dialog einzuladen.</p></div></div><footer>Unrelated</footer>';
 const s=sourceText({url:'https://example.org/pavillon/ausstellung',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.equal(s.textSelection,'MAIN_CONTENT');
 assert.ok(s.text.startsWith('Über die Ausstellung «Wonders of Medicine»'));
 assert.ok(s.text.includes('Ziel der Ausstellung'));
 assert.ok(!s.text.includes('Other locations'));
});
test('an HTTP-200 access-denied redirect is not usable as official evidence',()=>{
 assert.throws(()=>sourceText({url:'https://example.org/de/content-access-denied?destination=/de/node/866',body:'<h1>Access denied</h1>',observedAt:new Date().toISOString()},'s1',{preferMain:true}),/source_access_denied/);
});
test('numeric CMS node links are excluded from the visitor-page frontier',()=>{
 const page={url:'https://example.org/pavillon',contentType:'text/html',body:'<a href="/de/node/866">Ausstellung</a><a href="/de/pavillon/ausstellung">Ausstellung besuchen</a>'};
 assert.deepEqual(discoverResearchLinks(page).map(link=>link.url),['https://example.org/de/pavillon/ausstellung']);
});
test('a shared corporate contact page scopes identical numbers to the named venue block',()=>{
 const target={...spot,name:'Novartis Pavillon',existingValues:{...spot.existingValues,'contact.website':{value:'https://campus.example/de/novartis-pavillon'}}};
 const text='Kontakt\n\nAllgemeine Anfragen\n\nTelefon: +41 61 324 11 11\n\nNovartis Pavillon\n\nTelefon: +41 61 324 11 11\n\nCafé\n\nTelefon: +41 61 555 55 55';
 const s={...source(text),url:'https://campus.example/de/kontakt'};
 const quote='+41 61 324 11 11',first=text.indexOf(quote),second=text.indexOf(quote,first+1);
 const facts=[first,second].map((sourceOffset,i)=>({...fact('contact.phone',quote,quote,{subjectLabel:target.name}),id:'f'+i,sourceId:s.id,sourceOffset,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}));
 const checked=recheckEvidenceFloors(facts,[s],[field('contact.phone')],target);
 assert.equal(checked[0].reason,'CONTACT_VENUE_SCOPE_UNCONFIRMED');
 assert.equal(checked[1].state,'ACCEPTED');
});
test('museum workshop contacts and age-limited programme titles are not whole-venue facts',()=>{
 const target={...spot,name:'Antikenmuseum Basel und Sammlung Ludwig',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'contact.website':{value:'https://museum.example/'}}};
 const quote='Die Götter Ägyptens\n\nEintauchen in die Götterwelt der alten Ägypter';
 const text=quote+'\nInteraktive Führung mit Bastelarbeit\n2 Stunden, für Schulkinder ab 10 Jahren, max. 20 Personen\n\nKontakt +41 61 267 01 40';
 const s={...source(text),url:'https://museum.example/de/workshops.html'};
 const facts=[{...fact('experience.profile','Die Götter Ägyptens',quote,{subject:'OFFER',subjectLabel:'Die Götter Ägyptens',offerKind:'GUIDED_TOUR'}),id:'f0',sourceId:s.id,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'},
  {...fact('contact.phone','+41 61 267 01 40','+41 61 267 01 40',{subjectLabel:target.name}),id:'f1',sourceId:s.id,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}];
 const checked=recheckEvidenceFloors(facts,[s],[field('experience.profile'),field('contact.phone')],target);
 assert.equal(checked[0].reason,'PROGRAMME_ACCESS_CONDITION_REQUIRES_REVIEW');
 assert.equal(checked[1].reason,'PROGRAMME_CONTACT_NOT_VENUE');
});
test('an exhibit film and scanner do not become standalone culture visits',()=>{
 const target={...spot,name:'Novartis Pavillon',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'contact.website':{value:'https://campus.example/de/novartis-pavillon'}}};
 const text='Über die Ausstellung «Wonders of Medicine»\n\nAuf dem Weg ins Obergeschoss befindet sich ein kleiner Filmsaal. Hier startet die Ausstellung mit dem Kurzfilm «Making Medicine».\n\nDer «Time Scanner» ermöglicht anhand einer interaktiven Stadtkarte, die Veränderungen der Stadt Basel nachzuvollziehen.';
 const s={...source(text),url:'https://campus.example/de/novartis-pavillon/ausstellung',headings:[{level:1,text:'Über die Ausstellung «Wonders of Medicine»',offset:0}]};
 const values=['Making Medicine','Time Scanner'];
 const facts=values.map((value,i)=>({...fact('experience.profile',value,text.split('\n\n')[i+1],{subject:'OFFER',subjectLabel:value,offerKind:'VISIT'}),id:'f'+i,sourceId:s.id,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}));
 const checked=recheckEvidenceFloors(facts,[s],[field('experience.profile')],target);
 assert.ok(checked.every(f=>f.reason==='EXHIBITION_COMPONENT_NOT_STANDALONE_VISIT'));
});
test('a published audio walk is self-guided even when the model calls it a guided tour',()=>{
 const target={...spot,name:'Museum Beispiel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'contact.website':{value:'https://museum.example/'}}};
 const quote='Verpassen Sie nicht unseren Audio-Rundgang zum Thema «Griechische Mythen».';
 const s={...source(quote),url:'https://museum.example/de/museum.html'};
 const f={...fact('experience.profile','Audio-Rundgang zum Thema «Griechische Mythen»',quote,{subject:'OFFER',offerKind:'GUIDED_TOUR'}),id:'f0',sourceId:s.id,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'};
 const [checked]=recheckEvidenceFloors([f],[s],[field('experience.profile')],target);
 assert.equal(checked.offerKind,'SELF_GUIDED_VISIT');
 assert.equal(checked.state,'ACCEPTED');
});
test('a named exhibition with visitor prose is a current VISIT lead without claiming permanence',()=>{
 const target={...spot,name:'Novartis Pavillon',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'contact.website':{value:'https://campus.example/de/novartis-pavillon'}}};
 const title='Über die Ausstellung «Wonders of Medicine»';
 const text=title+'\n\nZiel der Ausstellung ist es, wissenschaftliche und medizinische Themen verständlich aufzubereiten, Interesse zu wecken und Besucherinnen und Besucher zu einem Dialog einzuladen.';
 const s={...source(text),url:'https://campus.example/de/novartis-pavillon/ausstellung',headings:[{level:1,text:title,offset:0}]};
 const facts=literalSourceFacts(s,[field('experience.profile')],target,0);
 assert.deepEqual(facts.map(f=>[f.value,f.offerKind]),[['Wonders of Medicine','VISIT']]);
 const checked=recheckEvidenceFloors(facts.map(f=>({...f,state:'ACCEPTED'})),[s],[field('experience.profile')],target);
 assert.equal(checked[0].state,'ACCEPTED');
});
test('a museum collection overview outranks a staff directory and age-scoped workshop page after public phone is known',()=>{
 const frontier=[
  {url:'https://museum.example/de/footer/team.html',label:'Team und Kontakt',depth:1,topics:['contact']},
  {url:'https://museum.example/de/workshops.html',label:'Workshops',depth:1,topics:['experience']},
  {url:'https://museum.example/de/museum.html',label:'Sammlung',depth:1,topics:['experience']},
 ];
 const ranked=rankResearchFrontier(frontier,[{field:'contact.phone',state:'ACCEPTED'}],[field('contact.public_email'),{...field('experience.profile'),profileCategory:'CULTURE_ARTS'}]);
 assert.equal(ranked[0].url,'https://museum.example/de/museum.html');
});
test('collection headings bind to their own prose while closed, online and second-site sections stay out',()=>{
 const target={...spot,name:'Museum Beispiel und Sammlung',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'contact.website':{value:'https://museum.example/'}}};
 const body='<main><h1>Sammlung</h1><p>Unser zweiter Standort, die Skulpturhalle Beispiel, befindet sich an einer anderen Adresse.</p><h2>Griechische Vasen</h2><p>Die Sammlung griechischer Vasen zeigt antike Tongefässe und ihre Nutzung in Alltag und Mythologie.</p><h2>Ägypten</h2><p>Rund 600 Artefakte präsentieren die Kulturgeschichte des pharaonischen Ägyptens und die Entwicklung von Kunst und Schrift.</p><h2>Orient</h2><p>Die Sammlung zeigt Werke des Vorderen Orients.</p><p>Dieser Bereich bleibt bis 2027 geschlossen.</p><h2>Skulpturhalle Beispiel</h2><p>Die Sammlung von Gipsabgüssen gehört zu unserem zweiten Standort und umfasst antike Skulpturen.</p><h2>Sammlung Online</h2><p>Die digitale Sammlung zeigt Bilder und Texte im Internet.</p></main>';
 const s=sourceText({url:'https://museum.example/de/museum.html',body,observedAt:new Date().toISOString()},'s1',{preferMain:true});
 const facts=literalSourceFacts(s,[field('experience.profile')],target,0);
 assert.deepEqual(facts.filter(f=>f.offerKind==='VISIT').map(f=>f.value),['Griechische Vasen','Ägypten']);
 assert.ok(facts.filter(f=>f.offerKind==='VISIT').every(f=>s.text.includes(f.quote)));
});
test('CMS element sections following a short main remain readable without admitting the footer',()=>{
 const body='<header>Hotel navigation</header><main><h1>Hotel Beispiel</h1></main><section class="element text"><h2>Parken</h2><p>Vor dem Hotel stehen fünf kostenfreie Parkplätze zur Verfügung.</p></section><section class="element text"><p>Weitere Angaben zur Anfahrt.</p></section><footer><p>Ein anderes Hotel hat eine Tiefgarage.</p></footer>';
 const s=sourceText({url:'https://hotel.example/de/information/parken/',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.ok(s.text.includes('fünf kostenfreie Parkplätze'));
 assert.ok(s.descriptionText.includes('fünf kostenfreie Parkplätze'));
 assert.ok(!s.text.includes('anderes Hotel'));
 assert.ok(!s.text.includes('Hotel navigation'));
 for(const heading of s.headings)assert.equal(s.text.slice(heading.offset,heading.offset+heading.text.length),heading.text);
});
test('long official pages preserve price-bearing food and drink sections between introduction and footer',()=>{
 const filler='Eine lange allgemeine Beschreibung ohne konkrete Angebote. '.repeat(115);
 const body=`<main><h1>Testlokal</h1><p>Kontakt +41 61 111 22 33</p>${filler}<h2>ESSEN</h2><a href="#essen">Zur Speisekarte</a><h2>WEIN</h2>${filler}<h4>SHARING</h4><p>Gemischte Platte</p><p>CHF 31.00</p><h4>SEASONALS</h4><p>Geschmorte Karotte</p><p>CHF 28.00</p>${filler}<h2>Auszug aus der Cocktailkarte</h2><p>Yuzual Suspects chf 18.00</p><p>Gin, Zitrone</p>${filler}<h2>Kontakt</h2><p>reservation@testlokal.example</p></main>`;
 const s=sourceText({url:'https://testlokal.example/',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.equal(s.truncated,true);
 assert.ok(s.text.length<=12000);
 assert.ok(s.text.includes('Gemischte Platte'));
 assert.ok(s.text.includes('Geschmorte Karotte'));
 assert.ok(s.text.includes('Yuzual Suspects'));
 assert.ok(s.text.includes('reservation@testlokal.example'));
 for(const heading of s.headings)assert.equal(s.text.slice(heading.offset,heading.offset+heading.text.length),heading.text);
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
 for(const mode of ['same','external','http-alias']){
  const visited=[];
  const requestImpl=(url,_options,callback)=>{
   const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{
    visited.push(url);const res=new EventEmitter();res.statusCode=url.endsWith('/old')?301:200;res.headers=res.statusCode===301?{location:mode==='external'?'https://evil.org/new':mode==='http-alias'?'http://www.example.org/new':'/new'}:{'content-type':'text/html'};res.destroy=()=>req.emit('close');callback(res);
    if(res.statusCode===200){res.emit('data',Buffer.from('Current venue source.'));res.emit('end');req.emit('close');}
   });req.destroy=error=>req.emit('error',error);return req;
  };
  const config={maxRedirects:2,resolve:async()=>[{address:'93.184.216.34'}],requestImpl};
  if(mode==='external'){await assert.rejects(fetchPublicSource('https://example.org/old',config),/redirect_identity_rejected/);assert.equal(visited.length,1);}
  else {const page=await fetchPublicSource('https://example.org/old',config);assert.equal(page.url,mode==='http-alias'?'https://www.example.org/new':'https://example.org/new');assert.deepEqual(page.redirectedFrom,['https://example.org/old']);assert.ok(visited.every(url=>url.startsWith('https://')));}
 }
});
test('an observed official PDF link may make one bounded public document-host redirect',async()=>{
 const {EventEmitter}=await import('node:events');const {fetchPublicSource}=await import('../src/nuknuk-sources.mjs');
 const original='https://example.org/menu.pdf',cdn='https://files.example.net/assets/menu.pdf';
 const payload=Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(2100000)]),visited=[];
 const requestImpl=(url,_options,callback)=>{
  const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{
   visited.push(url);const res=new EventEmitter();res.statusCode=url===original?302:200;res.headers=res.statusCode===302?{location:cdn}:{'content-type':'application/pdf'};res.destroy=()=>req.emit('close');callback(res);
   if(res.statusCode===200){res.emit('data',payload);res.emit('end');req.emit('close');}
  });req.destroy=error=>req.emit('error',error);return req;
 };
 const config={resolve:async()=>[{address:'93.184.216.34'}],requestImpl,maxRedirects:2,maxBytes:20000000};
 await assert.rejects(fetchPublicSource(original,config),/redirect_identity_rejected/);
 const page=await fetchPublicSource(original,{...config,allowObservedPdfRedirect:true});
 assert.equal(page.url,cdn);assert.equal(page.body.length,payload.length);assert.deepEqual(page.redirectedFrom,[original]);
 assert.deepEqual(visited,[original,original,cdn]);
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
test('a priced cocktail row contributes its exact name and ingredients, not wine producers or menu sections',()=>{
 const bar={...spot,name:'Amber Bar',existingValues:{...spot.existingValues,'classification.primary_category':{value:'DRINKS'}}};
 const body='<main><h1>Amber Menu</h1><h2>SIGNATURE COCKTAILS</h2><p>Nancy’s Blushes | 20.–</p><p>Gin, Lichie, Grenadine, Lavendel</p><p>Mezcal Gimlet | 20.–</p><p>Mezcal, Kiwi, Jalapeños</p><h2>WEINE</h2><p>Chardonnay (2023)</p><p>Winery Example | Basel</p><p>10cl 9.5 | 75cl 65.–</p><h2>BARFOOD</h2><p>Marinierte Oliven</p><p>mit Brot 7.5</p></main>';
 const s=sourceText({url:'https://example.org/amber-menu/',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 const facts=literalSourceFacts(s,[field('experience.profile')],bar,0);
 assert.deepEqual(facts.map(f=>f.value),['Nancy’s Blushes','Mezcal Gimlet']);
 assert.deepEqual(facts.map(f=>f.offerKind),['DRINKS','DRINKS']);
 assert.ok(facts.every(f=>s.text.slice(f.sourceOffset,f.sourceOffset+f.quote.length)===f.quote));
 assert.equal(rankResearchFrontier([{url:'https://example.org/impressionen/',depth:1,topics:['experience']},{url:'https://example.org/amber-menu/',depth:1,topics:['menu','experience']},{url:'https://example.org/menu/barfood/',depth:1,topics:['menu']}],[],[{...field('experience.profile'),profileCategory:'DRINKS'}])[0].url,'https://example.org/amber-menu/');
});
test('official search leads carry only topics visible in their URL or title',()=>{
 assert.deepEqual(topicsForSearchLead({url:'https://amber-bar.ch/menu/barfood/',title:'Barfood – Amber Bar'}),['menu']);
 assert.deepEqual(topicsForSearchLead({url:'https://amber-bar.ch/offnungszeiten/',title:'Öffnungszeiten – Amber Bar'}),['hours']);
 assert.deepEqual(topicsForSearchLead({url:'https://amber-bar.ch/impressionen/',title:'Impressionen – Amber Bar'}),[]);
 const frontier=[{url:'https://amber-bar.ch/amber-menu/',depth:1,topics:['menu']},{url:'https://amber-bar.ch/menu/barfood/',depth:1,topics:['menu']},{url:'https://amber-bar.ch/impressionen/',depth:1,topics:[]}];
 assert.equal(rankResearchFrontier(frontier,[],[{...field('experience.profile'),profileCategory:'DRINKS'}])[0].url,'https://amber-bar.ch/amber-menu/');
});
test('hotel research reads an observed room inventory overview before detail pages',()=>{
 const frontier=[{url:'https://example.org/de/rooms-suites',depth:1,topics:['stay','experience']},{url:'https://example.org/en/rooms-suites/large-junior-suite',depth:1,topics:['stay','experience']}];
 const profile={...field('experience.profile'),profileCategory:'STAY'};
 assert.equal(rankResearchFrontier(frontier,[],[profile])[0].url,'https://example.org/de/rooms-suites');
 const six=Array.from({length:6},(_,i)=>({field:'experience.profile',value:'Room '+i,state:'ACCEPTED'}));
 assert.equal(rankResearchFrontier(frontier,six,[profile])[0].url,'https://example.org/de/rooms-suites');
});
test('plain-text hotel room cards yield eight literal review offers without day rooms or packages',()=>{
 const names=['Tiny Economy','Economy','Business','Comfort','Eco-Double','Superior','Superior Garden','Family'];
 const text=['Zimmer','Sämtliche Zimmer verfügen über ein Bett und ein Bad.','Tageszimmer','Ein Hotelzimmer ohne Übernachtung kann auf Anfrage gebucht werden.',...names.flatMap(name=>[name,`Unser ${name} Zimmer bietet ein Bett und ein eigenes Bad für einen Aufenthalt im Hotel.`]),'Dinner Package','Das Zimmer mit einem Drei-Gang-Dinner kann als Paket gebucht werden.'].join('\n\n');
 const s={...source(text),url:'https://hotel.example/de/rooms/'};
 const leads=structuredRoomLeads([s]);
 assert.deepEqual(leads.map(lead=>lead.name),names);
 assert.ok(leads.every(lead=>lead.citation.evidence.startsWith(lead.name+'\n\n')&&lead.citation.sourceHash===s.hash));
 const result=addStructuredRoomReviewLeads({attributeKey:'experience.profile',status:'UNRESOLVED',reason:'NO_SUPPORTED_TARGET_FACT'},{...field('experience.profile'),profileCategory:'STAY'},[s]);
 assert.equal(result.status,'REQUIRES_REVIEW');
 assert.deepEqual(result.value.offers.map(offer=>offer.name),names);
 assert.ok(result.value.offers.every(offer=>offer.kind==='OVERNIGHT_STAY'&&offer.prices.length===0));
 assert.deepEqual(rankResearchFrontier([{url:'https://hotel.example/de/rooms/economy/',depth:1,topics:['stay','experience']}],[],[{...field('experience.profile'),profileCategory:'STAY'}],[s]),[]);
 assert.deepEqual(structuredRoomLeads([{...s,text:s.text+' changed'}]),[]);
});
test('a complete room-card overview skips direct detail URLs despite a promotional room heading',()=>{
 const body='<main><h1>Our Rooms</h1><h2>Find your perfect feel-good room</h2><h3>Design Standard Room</h3><p>Our Design Standard Room is a hotel bedroom with a double bed.</p><h3>Design Family Room</h3><p>Our Design Family Room is a hotel bedroom for overnight family stays.</p></main>';
 const s=sourceText({url:'https://hotel.example/en/zimmer',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.deepEqual(structuredRoomLeads([s]).map(lead=>lead.name),['Design Standard Room','Design Family Room']);
 const frontier=[{url:'https://hotel.example/en/design-standard-room',depth:1,topics:['stay','experience']},{url:'https://hotel.example/en/DesignFamilyZimmer',depth:2,topics:['stay','experience']}];
 assert.deepEqual(rankResearchFrontier(frontier,[],[{...field('experience.profile'),profileCategory:'STAY'}],[s]),[]);
});
test('a first-party room-type list repeated as category headings yields exact review leads',()=>{
 const names=['Single room','Double room','Family room'];
 const make=listed=>sourceText({url:'https://hotel.example/our-rooms/',body:`<main><h1>Our Rooms</h1><p>Our hotel offers comfortable rooms for overnight stays.</p><h2>Modern and comfortable</h2><p>${listed.join(' / ')} /</p>${names.map(name=>`<h3>${name}</h3><a href="/our-rooms/${name.toLowerCase().replaceAll(' ','-')}/">View room</a>`).join('')}</main>`,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 const complete=make(names),leads=structuredRoomLeads([complete]);
 assert.deepEqual(leads.map(item=>item.name),names);
 assert.ok(leads.every(item=>item.citation.evidence.includes('Our hotel offers comfortable rooms')&&item.citation.evidence.includes(item.name)&&item.citation.sourceHash===complete.hash));
 assert.deepEqual(rankResearchFrontier([{url:'https://hotel.example/our-rooms/family-room/',depth:1,topics:['stay']}],[],[{...field('experience.profile'),profileCategory:'STAY'}],[complete]),[]);
 assert.deepEqual(structuredRoomLeads([make(names.slice(0,2))]),[]);
});
test('hotel room headings with descriptions exclude booking links and form labels',()=>{
 const names=['Einzelzimmer','Doppelzimmer','Familienzimmer','Dachappartemente','Historisches Zimmer'];
 const cards=names.map(name=>`<h3>${name}</h3><p>Unsere Unterkunft ${name} bietet Gästen einen eigenen Schlafbereich und ein Badezimmer für eine Übernachtung in unserem Hotel.</p><a href="/de/hotel/zimmer/${name.toLowerCase()}/">${name} ansehen</a>`).join('');
 const s=sourceText({url:'https://hotel.example/de/hotel/zimmer',body:`<main><h1>Unsere Hotelzimmer</h1>${cards}<h3>Was ist inklusive?</h3><form><label>Personen</label><button>Zimmer buchen Jetzt buchen zum besten Preis</button></form></main>`,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.deepEqual(structuredRoomLeads([s]).map(lead=>lead.name),names);
 const result=addStructuredRoomReviewLeads({attributeKey:'experience.profile',status:'UNRESOLVED',reason:'NO_SUPPORTED_TARGET_FACT'},{...field('experience.profile'),profileCategory:'STAY'},[s]);
 assert.deepEqual(result.value.offers.map(offer=>offer.name),names);
});
test('compact hotel inventory cards preserve every literal room and exclude unrelated booking controls',()=>{
 const names=['Penthouse Suite','Junior Suite','Deluxe Room','Prestige Room','Superior Accessible Room','Superior Room','Comfort Room'];
 const cards=names.map((name,index)=>`${name}\n\n${90-index*8} m2\n\n${index%2+2} Personen\n\nDetails\n\nbuchen`).join('\n\n');
 const text=`Zimmer und Suiten\n\nSechs verschiedene Zimmerkategorien stehen zur Auswahl.\n\n${cards}\n\nAnkommen.\n\nInklusivleistungen\n\nHighspeed WLAN\n\nReichhaltiges Frühstück\n\nMeeting Room\n\n45 m2\n\n20 Personen\n\nDetails\n\nbuchen`;
 const s={...source(text),url:'https://hotel.example/zimmer-suiten/'};
 const leads=structuredRoomLeads([s]);
 assert.deepEqual(leads.map(lead=>lead.name),names);
 assert.ok(leads.every(lead=>s.text.slice(lead.citation.sourceOffset,lead.citation.sourceOffset+lead.citation.evidence.length)===lead.citation.evidence));
 const result=addStructuredRoomReviewLeads({attributeKey:'experience.profile',status:'UNRESOLVED'},{...field('experience.profile'),profileCategory:'STAY'},[s]);
 assert.deepEqual(result.value.offers.map(offer=>offer.name),names);
 assert.ok(result.value.offers.every(offer=>offer.prices.length===0));
 assert.deepEqual(rankResearchFrontier([{url:'https://hotel.example/zimmer/comfort-room/',depth:2,topics:['stay']}],[],[{...field('experience.profile'),profileCategory:'STAY'}],[s]),[]);
});
test('sized sibling room cards include nounless type names but stop before hotel amenities',()=>{
 const names=['Medium','Large','Extra Large','Plaza Suite','Trainspotting Suite'];
 const cards=names.map((name,i)=>`<h3>${name}</h3><p>${18+i*6}sqm | king-size bed</p><p>The ${name} room offers a private bathroom, a bed and a quiet place to stay overnight in this hotel.</p><a href="/book">Book now</a>`).join('');
 const body=`<main><h1>rooms</h1>${cards}<h2>All room amenities</h2><p>Free minibar, high-speed WiFi and television for hotel guests.</p><h2>restaurants & bars</h2><h3>Breakfast & Brunch</h3><p>Breakfast is served downstairs.</p></main>`;
 const s=sourceText({url:'https://hotel.example/rooms/',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.deepEqual(structuredRoomLeads([s]).map(item=>item.name),names);
 const result=addStructuredRoomReviewLeads({attributeKey:'experience.profile',status:'UNRESOLVED'},{...field('experience.profile'),profileCategory:'STAY'},[s]);
 assert.deepEqual(result.value.offers.map(offer=>offer.name),names);
 assert.ok(result.citations.every(citation=>!citation.evidence.includes('All room amenities')&&citation.sourceHash===s.hash));
});
test('hotel inclusion list supports literal Wi-Fi and breakfast, while paid garage is parking',()=>{
 const text='Zimmer und Suiten\n\nInklusivleistungen\n\nHighspeed WLAN\n\nReichhaltiges Frühstück\n\nNutzung der Therme\n\nWissenswertes\n\nParkmöglichkeit in der Tiefgarage: 17 € / Nacht. Parkplatz vor dem Hotel: 17 € / Nacht';
 const s={...source(text),url:'https://hotel.example/zimmer-suiten/'};
 const amenity={...field('amenity.features'),profileCategory:'STAY'};
 const offering={...field('offering.groups'),profileCategory:'STAY'};
 assert.deepEqual([...new Set(enumFactCandidates(amenity,[s]).map(item=>item.value))].sort(),['PARKING','WIFI']);
 assert.deepEqual(enumFactCandidates(offering,[s]).map(item=>item.value),['BREAKFAST']);
 const other={...source('Wellness partners\n\nHighspeed WLAN\n\nReichhaltiges Frühstück'),url:'https://hotel.example/partners/'};
 assert.deepEqual(enumFactCandidates(amenity,[other]),[]);
 assert.deepEqual(enumFactCandidates(offering,[other]),[]);
 const service={...source('Services im B&B HOTEL Basel\n\nKostenpflichtige Tiefgarage\n\nKostenloses Highspeed-WLAN\n\nFrühstücksbuffet\n\nUnseren Gästen steht im gesamten Gebäude eine kostenlose High-Speed-WLAN-Internetverbindung zur Verfügung.'),url:'https://hotel.example/de/hotel/basel'};
 assert.deepEqual([...new Set(enumFactCandidates(amenity,[service]).map(item=>item.value))].sort(),['PARKING','WIFI']);
 assert.ok(enumFactCandidates(amenity,[service]).some(item=>item.value==='WIFI'&&item.quote.startsWith('Unseren Gästen')));
 assert.deepEqual(enumFactCandidates(offering,[service]).map(item=>item.value),['BREAKFAST']);
 const roomOnly={...source('Doppelzimmer\n\n1 Doppelbett\n\nWLAN gratis'),url:'https://hotel.example/de/zimmer/doppelzimmer'};
 assert.deepEqual(enumFactCandidates(amenity,[roomOnly]),[]);
});
test('a chain hotel branch is read from its bounded Hotel block after global navigation',()=>{
 const nav='<div class="navigation">'+Array.from({length:100},(_,i)=>`<a href="/hotel/city-${i}">Other Hotel ${i}</a>`).join('')+'</div>';
 const body=`${nav}<div itemscope itemtype="http://schema.org/Hotel"><span>B&B HOTEL Basel</span><span itemprop="streetAddress">St. Jakobs-Strasse 195</span><a href="mailto:bb_7605@hotelbb.com">bb_7605@hotelbb.com</a><h2>Ausstattung und Services</h2><p>Kostenpflichtige Tiefgarage</p><h2>Services im Überblick</h2><p>Kostenloses Highspeed-WLAN</p><p>Frühstücksbuffet</p></div><footer>Other Hotel Berlin</footer>`;
 const s=sourceText({url:'https://hotel-bb.example/de/hotel/basel',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.equal(s.textSelection,'MAIN_CONTENT');
 assert.ok(s.text.includes('St. Jakobs-Strasse 195')&&s.text.includes('bb_7605@hotelbb.com'));
 assert.ok(!s.text.includes('Other Hotel Berlin')&&!s.text.includes('Other Hotel 99'));
 assert.deepEqual([...new Set(enumFactCandidates({...field('amenity.features'),profileCategory:'STAY'},[s]).map(item=>item.value))].sort(),['PARKING','WIFI']);
 assert.deepEqual(enumFactCandidates({...field('offering.groups'),profileCategory:'STAY'},[s]).map(item=>item.value),['BREAKFAST']);
});
test('generic chain service seed permits only the exact address-matched branch evidence',()=>{
 const branchSpot={...spot,name:'B&B Hotel Basel',locality:'Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'},'contact.website':{value:'https://hotel-bb.example/de/services/schweiz/24std-erreichbar'},'location.address_line1':{value:'St. Jakobs-Strasse 195'}}};
 const make=(name,address)=>source(`${name}\n\n${address}\n\nbb_7605@hotelbb.com`);
 const branch={...make('B&B Hotel Basel','St. Jakobs-Strasse 195'),url:'https://hotel-bb.example/de/hotel/basel'};
 const wrong={...make('B&B Hotel Berlin','Alexanderplatz 1'),url:'https://hotel-bb.example/de/hotel/berlin'};
 const generic={...make('B&B Hotels Schweiz','Alle Hotels'),url:'https://hotel-bb.example/de/services/schweiz/24std-erreichbar'};
 const accepted=s=>validateEvidenceFacts({facts:[fact('contact.public_email','bb_7605@hotelbb.com','bb_7605@hotelbb.com',{subjectLabel:branchSpot.name})]},s,[field('contact.public_email')]).map(x=>({...x,state:'ACCEPTED'}));
 assert.equal(recheckEvidenceFloors(accepted(branch),[branch],[field('contact.public_email')],branchSpot)[0].state,'ACCEPTED');
 assert.equal(recheckEvidenceFloors(accepted(wrong),[wrong],[field('contact.public_email')],branchSpot)[0].reason,'CHAIN_BRANCH_IDENTITY_UNCONFIRMED');
 assert.equal(recheckEvidenceFloors(accepted(generic),[generic],[field('contact.public_email')],branchSpot)[0].reason,'CHAIN_BRANCH_IDENTITY_UNCONFIRMED');
 assert.equal(chainBranchCityPath('https://hotel-bb.example/de/hotel/basel',branchSpot),true);
 assert.equal(chainBranchCityPath('https://hotel-bb.example/de/hotel/basel-city',branchSpot),true);
 assert.equal(chainBranchCityPath('https://hotel-bb.example/de/hotel/bern',branchSpot),false);
 assert.equal(chainBranchCityPath('https://hotel-bb.example/de/stadt/hotels-basel/parkplatz',branchSpot),false);
});
test('hotel service evidence outranks seminar rooms after room inventory is read',()=>{
 const page={url:'https://hotel.example/en',contentType:'text/html',body:'<a href="/en/hotel/services">Services</a><a href="/en/meetings-seminars/event-meeting">Meetings & Seminars</a>',observedAt:new Date().toISOString()};
 const links=discoverResearchLinks(page).map(link=>({...link,depth:1}));
 assert.deepEqual(links.find(link=>link.url.endsWith('/services')).topics,['access']);
 const fields=[{...field('experience.profile'),profileCategory:'STAY'},{...field('amenity.features'),profileCategory:'STAY'}];
 assert.deepEqual(rankResearchFrontier(links,[],fields).map(link=>link.url),['https://hotel.example/en/hotel/services']);
});
test('four accepted drinks do not hide an unread official menu overview',()=>{
 const frontier=[{url:'https://example.org/amber-menu/',depth:1,topics:['menu']}];
 const four=Array.from({length:4},(_,i)=>({field:'experience.profile',value:'Cocktail '+i,state:'ACCEPTED'}));
 assert.equal(rankResearchFrontier(frontier,four,[{...field('experience.profile'),profileCategory:'DRINKS'}])[0].url,'https://example.org/amber-menu/');
});
test('four provisional food offers do not hide an observed official menu PDF',()=>{
 const pdf={url:'https://example.org/_files/menu.pdf',depth:1,topics:['menu','experience'],discoveredOn:'https://example.org/das-angebot',label:'Menü'};
 const four=Array.from({length:4},(_,i)=>({field:'experience.profile',value:'Offer '+i,state:'ACCEPTED'}));
 assert.equal(rankResearchFrontier([pdf],four,[{...field('experience.profile'),profileCategory:'EAT'}])[0].url,pdf.url);
});
test('a complete official hotel inventory stops at its actual room count, not a fixed six',()=>{
 const names=['Business Zimmer','Executive Zimmer','Familienzimmer'];
 const body='<main><h1>Zimmer</h1>'+names.map(name=>`<h3>${name}</h3><p>${name} bietet ein eigenes Zimmer für Hotelgäste.</p>`).join('')+'</main>';
 const s=sourceText({url:'https://hotel.example/zimmer',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 const facts=names.map(value=>({field:'experience.profile',value,state:'ACCEPTED',sourceId:'s1'}));
 const frontier=[{url:'https://hotel.example/zimmer/business-zimmer',depth:1,topics:['stay']}];
 const fields=[{...field('experience.profile'),profileCategory:'STAY'}];
 assert.deepEqual(rankResearchFrontier(frontier,facts,fields,[s]),[]);
 assert.deepEqual(rankResearchFrontier(frontier,facts.slice(1),fields,[s]),[]);
 assert.equal(rankResearchFrontier(frontier,facts,fields,[{...s,truncated:true}])[0].url,frontier[0].url);
 const incompleteBody='<main><h1>Zimmer</h1><h3>Business Zimmer</h3><p>Business Zimmer bietet ein eigenes Zimmer für Hotelgäste.</p><h3>Executive Zimmer</h3><p>Mehr.</p><h3>Familienzimmer</h3><p>Familienzimmer bietet ein eigenes Zimmer für Hotelgäste.</p></main>';
 const incomplete=sourceText({url:'https://hotel.example/zimmer',body:incompleteBody,contentType:'text/html',observedAt:new Date().toISOString()},'s2',{preferMain:true});
 assert.equal(rankResearchFrontier(frontier,[],fields,[incomplete])[0].url,frontier[0].url);
 const translated=[{url:'https://hotel.example/en/rooms',depth:1,topics:['stay']}];
 assert.deepEqual(rankResearchFrontier(translated,facts,fields,[s]),[]);
 const active=[{url:'https://hotel.example/en/rooms',depth:1,topics:['stay']},{url:'https://hotel.example/de/food-and-drink/brunch/',depth:1,topics:['stay','experience']},{url:'https://hotel.example/de/information/lage-anfahrt-parken/',depth:1,topics:['access']}];
 const pending=[fields[0],{...field('amenity.features'),profileCategory:'STAY'}];
 assert.deepEqual(rankResearchFrontier(active,facts,pending,[s]).map(item=>item.url),['https://hotel.example/de/information/lage-anfahrt-parken/']);
 const food=[{url:'https://hotel.example/de/hotel/essen-und-trinken/',depth:1,topics:['menu']}];
 assert.deepEqual(rankResearchFrontier(food,facts,[fields[0],{...field('offering.groups'),profileCategory:'STAY'}],[s]).map(item=>item.url),[food[0].url]);
 const mixed=[{url:'https://hotel.example/de/hotel/',depth:1,topics:['stay']},...food];
 assert.equal(rankResearchFrontier(mixed,facts,[fields[0],{...field('offering.groups'),profileCategory:'STAY'}],[s])[0].url,food[0].url);
});
test('wrong offer kind is withheld per fact and does not invalidate correctly typed hotel rooms',async()=>{
 const s=source('Classic Room: a double room with shower.\nSteak with seasonal vegetables.');
 const stay={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const facts=ledger([fact('experience.profile','Classic Room','Classic Room: a double room with shower.',{subject:'OFFER',offerKind:'OVERNIGHT_STAY'}),fact('experience.profile','Steak','Steak with seasonal vegetables.',{subject:'OFFER',offerKind:'GASTRONOMY'})],s);
 const [r]=projectEvidenceLedger({spot:stay,fields:[field('experience.profile')],facts,sources:[s],...deps});
 assert.equal(r.status,'REQUIRES_REVIEW');assert.equal(r.value.offers.length,1);assert.equal(r.value.offers[0].name,'Classic Room');
});
test('hotel pet packages and extra beds cannot masquerade as overnight room offers',()=>{
 const stay={...spot,name:'ART HOUSE Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const body='Small Double Room: A comfortable room for overnight guests.\nA dog package is available for 25 francs per night and includes a dog bed.\nAn extra bed for guests costs CHF 25 per night.';
 const s=source(body);
 const quotes=['Small Double Room: A comfortable room for overnight guests.','A dog package is available for 25 francs per night and includes a dog bed.','An extra bed for guests costs CHF 25 per night.'];
 const original=validateEvidenceFacts({facts:['Small Double Room','dog package','extra bed'].map((name,i)=>fact('experience.profile',name,quotes[i],{subject:'OFFER',offerKind:'OVERNIGHT_STAY'}))},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(original,[s],[field('experience.profile')],stay);
 assert.deepEqual(checked.map(f=>f.state),['ACCEPTED','HELD','HELD']);
 assert.deepEqual(checked.slice(1).map(f=>f.reason),['STAY_PACKAGE_NOT_ROOM','STAY_OFFER_NOT_LODGING']);
});
test('a hotel retreat with an included room is not a separate room category',()=>{
 const stay={...spot,name:'ART HOUSE Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const room='Medium Double Room\n\nOur Medium Double Rooms offer space to relax during a visit to Basel.';
 const retreat='URBAN WELLNESS RETREAT\n\nWe offer breakfast, dinner and access to a nearby wellness zone and, of course, a comfortable room to sleep and relax in.';
 const s=source(room+'\n\n'+retreat);
 const original=validateEvidenceFacts({facts:[fact('experience.profile','Medium Double Room',room,{subject:'OFFER',offerKind:'OVERNIGHT_STAY'}),fact('experience.profile','URBAN WELLNESS RETREAT',retreat,{subject:'OFFER',offerKind:'OVERNIGHT_STAY'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(original,[s],[field('experience.profile')],stay);
 assert.deepEqual(checked.map(f=>f.state),['ACCEPTED','HELD']);
 assert.equal(checked[1].reason,'STAY_PACKAGE_NOT_ROOM');
});
test('a bedding choice mentioned inside room details is not a separate room category',()=>{
 const stay={...spot,name:'Airport Hotel Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const room='Business Zimmer: a comfortable hotel room with modern design and space to rest.';
 const bed='Grosses Kingsizebett / Zweibettzimmer nach Wahl';
 const s=source(room+'\n\n'+bed);
 const original=validateEvidenceFacts({facts:[fact('experience.profile','Business Zimmer',room,{subject:'OFFER',offerKind:'OVERNIGHT_STAY'}),fact('experience.profile','Zweibettzimmer',bed,{subject:'OFFER',offerKind:'OVERNIGHT_STAY'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(original,[s],[field('experience.profile')],stay);
 assert.deepEqual(checked.map(f=>f.state),['ACCEPTED','HELD']);
 assert.equal(checked[1].reason,'ROOM_CATEGORY_TITLE_REQUIRED');
});
test('hotel inventory cards bind each room heading to its own description after a details link',()=>{
 const stay={...spot,name:'ART HOUSE Basel',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const body='<main><h1>Rooms & Suites</h1><nav>Small Double Room | Terrace Club Suite</nav><h2>Small Double Room</h2><p>Room details</p><p>Large windows and a French balcony provide a view of Basel’s city life.</p><h2>Terrace Club Suite</h2><p>Room details</p><p>The Terrace Club Suite on the top floor has a large terrace and a separate living area.</p><h2>Urban Wellness Retreat</h2><p>Includes breakfast, wellness access and a room to sleep in.</p></main>';
 const s=sourceText({url:'https://example.org/en/rooms-suites',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 const candidates=literalSourceFacts(s,[field('experience.profile')],stay,0);
 assert.deepEqual(candidates.map(f=>f.value),['Small Double Room','Terrace Club Suite']);
 assert.ok(candidates.every(f=>s.text.slice(f.sourceOffset,f.sourceOffset+f.quote.length)===f.quote));
 assert.ok(candidates[0].quote.includes('Large windows'));
 assert.ok(!candidates[0].quote.includes('separate living area'));
});
test('a named water slide cannot be relabelled as a wellness bathing offer',()=>{
 const wellness={...spot,name:'aquabasilea',existingValues:{...spot.existingValues,'classification.primary_category':{value:'WELLNESS_RELAXATION'}}};
 const slide='Auf der Rivellazione sind Reifen Pflicht und die Rutsche führt durch eine rote Röhre.';
 const pool='Das Wellenbad lädt Gäste zum Baden im warmen Wasser ein.';
 const s=source(slide+'\n\n'+pool);
 const original=validateEvidenceFacts({facts:[fact('experience.profile','Rivellazione',slide,{subject:'OFFER',offerKind:'BATHING'}),fact('experience.profile','Wellenbad',pool,{subject:'OFFER',offerKind:'BATHING'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(original,[s],[field('experience.profile')],wellness);
 assert.equal(checked[0].reason,'WATER_SLIDE_NOT_BATHING_OFFER');
 assert.equal(checked[1].state,'ACCEPTED');
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
test('promotional promises cannot displace a concrete literal Spot description',()=>{
 const hype='Ob Kebabs oder Meze – bei uns erleben Sie ein Geschmackserlebnis, das Ihre Sinne verzaubert.';
 const factual='Wir bieten regelmässig wechselnde Mittagsmenüs an.';
 const s=source(hype+'\n\n'+factual);
 const facts=validateEvidenceFacts({facts:[fact('description.highlight',hype,hype),fact('description.highlight',factual,factual)]},s,[field('description.highlight')]).map(f=>({...f,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(facts,[s],[field('description.highlight')],spot);
 assert.equal(checked[0].reason,'DESCRIPTION_PROMOTIONAL_CLAIM');
 assert.equal(projectEvidenceLedger({spot,fields:[field('description.highlight')],facts:checked,sources:[s],...deps})[0].value,factual);
});
test('a perfect-symbiosis hotel slogan cannot become an objective highlight',()=>{
 const hype='Die 89 Zimmer vereinen klassische Eleganz und moderne Annehmlichkeiten – eine perfekte Symbiose aus Vergangenheit und Gegenwart.';
 const factual='Das Hotel wurde 1864 am Bahnhof Basel SBB eröffnet.';
 const s=source(hype+'\n\n'+factual);
 const facts=validateEvidenceFacts({facts:[fact('description.highlight',hype,hype),fact('description.highlight',factual,factual)]},s,[field('description.highlight')]).map(f=>({...f,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(facts,[s],[field('description.highlight')],spot);
 assert.equal(checked[0].reason,'DESCRIPTION_PROMOTIONAL_CLAIM');
 assert.equal(projectEvidenceLedger({spot,fields:[field('description.highlight')],facts:checked,sources:[s],...deps})[0].value,factual);
});
test('research model routing accepts only the two pinned local snapshots',async()=>{
 const {selectResearchModel}=await import('../dist/nuknuk-agent.js');assert.equal(selectResearchModel('/tmp/45797d2985a12c55e6473686e9ea91b95e959553').id,'qwen3.5-27b-4bit');
 for(const path of ['https://api.example.org/model','/tmp/unpinned','/tmp/prefix'+NUKNUK_MODEL_REVISION])assert.throws(()=>selectResearchModel(path));
});
test('literal candidate extraction retains the established fax exclusion',async()=>{
 const r=await researchSpotV2(opts,{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'Fax: +41 61 111 22 33',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(r.results[0].status,'UNRESOLVED');assert.equal(r.facts.filter(f=>f.field==='contact.phone').length,0);
});
test('hotel restaurant pages are not selected to establish whole-hotel hours',async()=>{
 const stay={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const r=await researchSpotV2({...opts,spot:stay,fields:[field('hours.regular')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:url.endsWith('/restaurant')?'Montag 10–18 Uhr':'<a href="/restaurant">Restaurant</a>',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(r.results[0].status,'UNRESOLVED');assert.equal(r.requests,1);assert.equal(r.sources.length,1);
});
test('same-page HTML heading hierarchy keeps bar hours separate from a hotel',async()=>{
 const stay={...spot,existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const r=await researchSpotV2({...opts,spot:stay,fields:[field('hours.regular')]},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'<main><h1>Hotel</h1><h2>Bar</h2><h3>Opening hours</h3><p>Montag 10–18 Uhr</p></main>',observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(r.results[0].status,'UNRESOLVED');assert.equal(r.facts[0].subject,'AREA');assert.equal(r.sources[0].headings[1].text,'Bar');
});
test('exhibition hours under a Pavillon heading do not become whole-venue hours',()=>{
 const target={...spot,name:'Novartis Pavillon',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const s=sourceText({url:'https://example.org/pavillon',body:'<main><h1>Novartis Pavillon</h1><h2>Opening hours</h2><h3>Exhibition</h3><p>Wonders of Medicine open from Tue. - Sun. 10:00 - 18:00</p></main>',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 const quote='Tue. - Sun. 10:00 - 18:00';
 const facts=[{...fact('hours.regular',quote,quote,{subjectLabel:target.name}),id:'f0',sourceId:s.id,sourceOffset:s.text.indexOf(quote),state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED'}];
 const [checked]=recheckEvidenceFloors(facts,[s],[field('hours.regular')],target);
 assert.equal(checked.reason,'EXPLICIT_AREA_HOURS');
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
test('a request cut off by the overall research clock reports budget exhaustion rather than model outage',async()=>{
 let clock=0;
 const r=await researchSpotV2({...opts,fields:[field('description.highlight')],budgetMs:1000},{...deps,now:()=>clock,
  fetchPage:async url=>({url,contentType:'text/html',body:'<main><h1>Über uns</h1>Wir servieren Kaffee und hausgemachte Speisen direkt am Rhein.</main>',observedAt:new Date().toISOString()}),
  modelFetch:async()=>{clock=1000;const error=new Error('The operation was aborted due to timeout');error.name='TimeoutError';throw error;}
 });
 assert.equal(r.stopReason,'TIME_BUDGET_EXHAUSTED');
 assert.equal(r.modelAudit[0].error,'TIME_BUDGET_EXHAUSTED');
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
test('museum section titles with their own descriptions become literal offer candidates, while prohibited tours do not',async()=>{
 const museum={...spot,name:'Museum Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const body='<main><h1>Museum Example</h1><h2>Sammlung Museum Example</h2><p>Die Sammlung des Museums ist öffentlich zugänglich und wird regelmässig in der permanenten Ausstellung gezeigt.</p><h2>Private Gruppenführungen</h2><p>Wir bieten private Führungen durch die Sammlung des Museums in mehreren Sprachen an.</p><h2>Eigenführungen</h2><p>Führungen durch externe Personen sind aus Sicherheitsgründen nicht möglich.</p></main>';
 const r=await researchSpotV2({...opts,spot:museum,fields:[field('experience.profile')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 const names=r.results[0].value?.offers?.map(o=>o.name)??[];
 assert.deepEqual(names,['Sammlung Museum Example','Private Gruppenführungen']);
 assert.equal(r.results[0].status,'REQUIRES_REVIEW');
 assert.ok(!r.facts.some(f=>f.value==='Eigenführungen'&&f.state==='ACCEPTED'));
});
test('a recurring museum atelier remains eligible while its dated theme does not',()=>{
 const museum={...spot,name:'Museum Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const opening='Offenes Atelier\n\nJeden ersten Sonntag im Monat öffnen wir unser Atelier im Museum Example für alle Besucherinnen und Besucher.';
 const dated='Sonntag, 4.10.2026\n\nPunkte, Linien, Pop-Art! Wir gestalten heute eigene Comics im Atelier.';
 const s={...source(opening+'\n\n'+dated),url:'https://example.org/de/veranstaltungen/veranstaltungshighlights/offenes-atelier'};
 const f=validateEvidenceFacts({facts:[fact('experience.profile','Offenes Atelier',opening,{subject:'OFFER',offerKind:'WORKSHOP'}),fact('experience.profile','Punkte, Linien, Pop-Art!',dated,{subject:'OFFER',offerKind:'WORKSHOP'})]},s,[field('experience.profile')]).map(x=>({...x,state:'ACCEPTED'}));
 const checked=recheckEvidenceFloors(f,[s],[field('experience.profile')],museum);
 assert.equal(checked[0].state,'ACCEPTED');
 assert.equal(checked[1].reason,'DATED_EVENT_NOT_PERMANENT_SPOT_FACT');
});
test('private event workshops do not become ordinary museum visitor offers',()=>{
 const museum={...spot,name:'Museum Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const quote='We offer individual teambuilding workshops for your private event guests at Museum Example.';
 const s={...source(quote),url:'https://example.org/en/visit/your-event/guided-tours-and-workshops'};
 const facts=validateEvidenceFacts({facts:[fact('experience.profile','teambuilding workshops',quote,{subject:'OFFER',offerKind:'WORKSHOP'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(recheckEvidenceFloors(facts,[s],[field('experience.profile')],museum)[0].reason,'PRIVATE_EVENT_ONLY_OFFER');
});
test('museum programme price headers and language labels are not concrete offers',()=>{
 const museum={...spot,name:'Museum Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const s=source('Dauer und Kosten für Workshops:\nBesuch ohne Führung\n\nAngebot in: Deutsch / Englisch / Französisch');
 const facts=validateEvidenceFacts({facts:[fact('experience.profile','Workshops','Dauer und Kosten für Workshops:',{subject:'OFFER',offerKind:'WORKSHOP'}),fact('experience.profile','Besuch ohne Führung','Besuch ohne Führung\n\nAngebot in: Deutsch / Englisch / Französisch',{subject:'OFFER',offerKind:'SELF_GUIDED_VISIT'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.deepEqual(recheckEvidenceFloors(facts,[s],[field('experience.profile')],museum).map(f=>f.reason),['CATEGORY_LABEL_NOT_CONCRETE_OFFER','CATEGORY_LABEL_NOT_CONCRETE_OFFER']);
});
test('museum hospitality prose is not a named self-guided visitor activity',()=>{
 const museum={...spot,name:'Museum Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const quote='Das Museum Example macht Platz für dich und stellt sich auf dich ein. Stöbere in unseren Pop-Up-Bibliotheken und werde kreativ.';
 const s=source(quote);
 const facts=validateEvidenceFacts({facts:[fact('experience.profile','macht Platz',quote,{subject:'OFFER',offerKind:'SELF_GUIDED_VISIT'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(recheckEvidenceFloors(facts,[s],[field('experience.profile')],museum)[0].reason,'VISITOR_ACTIVITY_NAME_REQUIRED');
});
test('a café can cite named items from its own serving prose without admitting sibling-shop items',()=>{
 const cafe={...spot,name:'Café Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'COFFEE_DAYTIME'}}};
 const first='Café Example – unser Café\n\nIm Café Example kannst du unseren Espresso probieren. Süsses und Salziges backen wir von Hand: Quiche und Gebäck.';
 const other='\n\nUnser Onlineshop\n\nIm Onlineshop gibt es Espresso für zuhause.';
 const s={...source(first+other),headings:[{level:1,text:'Café Example – unser Café',offset:0},{level:2,text:'Unser Onlineshop',offset:first.length+2}]};
 const facts=validateEvidenceFacts({facts:[fact('experience.profile','Espresso','Im Café Example kannst du unseren Espresso probieren.',{subject:'OFFER',offerKind:'DRINKS'}),fact('experience.profile','Quiche','Süsses und Salziges backen wir von Hand: Quiche und Gebäck.',{subject:'OFFER',offerKind:'GASTRONOMY'}),fact('experience.profile','Espresso','Im Onlineshop gibt es Espresso für zuhause.',{subject:'OFFER',offerKind:'DRINKS'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.deepEqual(recheckEvidenceFloors(facts,[s],[field('experience.profile')],cafe).map(f=>f.state),['ACCEPTED','ACCEPTED','HELD']);
 assert.equal(recheckEvidenceFloors(facts,[s],[field('experience.profile')],cafe)[2].reason,'FOOD_ITEM_SOURCE_REQUIRED');
});
test('unambiguous coffee beverages remain drinks when the model calls them gastronomy',()=>{
 const quote='Im Café Example kannst du einen Espresso und Filterkaffee probieren.';
 const s=source(quote+'\nQuiche wird bei uns gebacken.');
 const values=validateEvidenceFacts({facts:[fact('experience.profile','Espresso',quote,{offerKind:'GASTRONOMY'}),fact('experience.profile','Filterkaffee',quote,{offerKind:'GASTRONOMY'}),fact('experience.profile','Quiche','Quiche wird bei uns gebacken.',{offerKind:'GASTRONOMY'})]},s,[field('experience.profile')]);
 assert.deepEqual(values.map(f=>f.offerKind),['DRINKS','DRINKS','GASTRONOMY']);
});
test('literal cuisine lists with decorative emoji support individual dishes',()=>{
 const quote='Schweizer Küche 🧀🥔 — Fondue, Rösti, Cordon Bleu, saisonale Gerichte';
 const s=source(quote);
 const facts=validateEvidenceFacts({facts:[fact('experience.profile','Fondue',quote,{subject:'OFFER',offerKind:'GASTRONOMY'}),fact('experience.profile','Rösti',quote,{subject:'OFFER',offerKind:'GASTRONOMY'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.deepEqual(recheckEvidenceFloors(facts,[s],[field('experience.profile')],spot).map(f=>f.state),['ACCEPTED','ACCEPTED']);
 const modelScoped=validateEvidenceFacts({facts:[fact('experience.profile','Rösti',quote,{subject:'TARGET',subjectLabel:spot.name,offerKind:'GASTRONOMY'})]},s,[field('experience.profile')]);
 assert.equal(modelScoped[0].subject,'OFFER');
 assert.equal(modelScoped[0].subjectLabel,'Rösti');
});
test('adjectival and connective prose cannot become food offer names',()=>{
 const quote='Schweizer und ukrainische Küche – nicht zufällig nebeneinander, sondern bewusst verbunden.';
 const s=source(quote);
 const facts=validateEvidenceFacts({facts:[fact('experience.profile','nicht zufällig nebeneinander',quote,{offerKind:'GASTRONOMY'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(recheckEvidenceFloors(facts,[s],[field('experience.profile')],spot)[0].reason,'OFFER_PROSE_NOT_NAME');
});
test('a compound workshop name states its kind explicitly',()=>{
 const museum={...spot,name:'Museum Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const quote='Kinderworkshops finden jeden Monat im Museum Example statt und bieten Kindern Raum zum Experimentieren.';
 const s={...source(quote),url:'https://example.org/de/veranstaltungen/veranstaltungshighlights/kinderworkshops'};
 const facts=validateEvidenceFacts({facts:[fact('experience.profile','Kinderworkshops',quote,{subject:'OFFER',offerKind:'WORKSHOP'})]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(recheckEvidenceFloors(facts,[s],[field('experience.profile')],museum)[0].state,'ACCEPTED');
});
test('a recurring programme may retain a cited schedule caveat, but not an age restriction',()=>{
 const museum={...spot,name:'Museum Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const quote='Kinderworkshops finden jeden Monat im Museum Example statt. Termin: Samstags nach Ankündigung. Nur für Kinder von 7–10 Jahren.';
 const s={...source(quote),url:'https://example.org/de/veranstaltungen/veranstaltungshighlights/kinderworkshops'};
 const make=condition=>validateEvidenceFacts({facts:[{...fact('experience.profile','Kinderworkshops',quote,{subject:'OFFER',offerKind:'WORKSHOP'}),condition}]},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'}));
 assert.equal(recheckEvidenceFloors(make('Samstags nach Ankündigung'),[s],[field('experience.profile')],museum)[0].state,'ACCEPTED');
 assert.equal(recheckEvidenceFloors(make('Nur für Kinder von 7–10 Jahren'),[s],[field('experience.profile')],museum)[0].reason,'VALIDITY_OR_CONDITION_REQUIRES_REVIEW');
});
test('recurring museum programme intro stays with its heading before dated themes',async()=>{
 const museum={...spot,name:'Museum Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'},'contact.website':{value:'https://example.org/de/veranstaltungen/veranstaltungshighlights/kinderworkshops'}}};
 const body='<main><h1>Kinderworkshops</h1><p>Termin: Samstags nach Ankündigung</p><p>Ort: Hauptbau</p><p>Für Kinder von 7–10 Jahren</p><p>Jeden Monat finden im Museum Example Kinderworkshops zu einem Thema statt. Kinder experimentieren mit Farben und Materialien.</p><p>Samstag, 24.10.2026</p><h2>Kinderworkshop: Süsses oder Saures</h2><p>Ein einmaliger Halloween-Termin.</p></main>';
 let inspected=false;
 const report=await researchSpotV2({...opts,spot:museum,fields:[field('experience.profile')],maxRequests:1,discoverLinks:false},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(data=>{
  const intro=data.blocks.find(block=>block.text.startsWith('Kinderworkshops\n')&&block.text.includes('Jeden Monat'));
  assert.ok(intro);assert.doesNotMatch(intro.text,/Süsses oder Saures/);inspected=true;return [];
 })});
 assert.equal(inspected,true);assert.equal(report.canonicalWrite,false);
});
test('museum offer name and adjacent admission price reach extraction together',async()=>{
 const museum={...spot,name:'Museum Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'CULTURE_ARTS'}}};
 const body='<main><h1>Museum Example</h1><h2>Öffentliche Führungen</h2><p>Öffentliche Führung</p><p>Eintritt + 7 CHF</p><p>Private Führungen</p><p>500 CHF für Gruppen</p></main>';
 let inspected=false;
 await researchSpotV2({...opts,spot:museum,fields:[field('experience.profile')],maxRequests:1,discoverLinks:false},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(data=>{
  assert.ok(data.blocks.some(block=>block.text==='Öffentliche Führung\n\nEintritt + 7 CHF'));
  inspected=true;return [];
 })});
 assert.equal(inspected,true);
});
test('a flattened sauna overview retains named rows with their own descriptions',async()=>{
 const wellness={...spot,name:'Thermalbad Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'WELLNESS_RELAXATION'}}};
 const body='<main><h1>Thermalbad Example</h1><h2>Alle Saunen im Überblick</h2><table><tr><th>Name</th><th>Temperatur</th><th>Besonderheiten</th></tr><tr><td>Finnsauna</td><td>80° bis 90° C</td><td>In dieser Sauna finden regelmässig Aufgusszeremonien statt.</td></tr><tr><td>Eventsauna</td><td>80° bis 90° C</td><td>Die Eventsauna bietet Raum für bis zu 120 Personen und Aufgüsse mit Musik.</td></tr></table></main>';
 const r=await researchSpotV2({...opts,spot:wellness,fields:[field('experience.profile')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.deepEqual(r.results[0].value?.offers?.map(offer=>offer.name),['Finnsauna','Eventsauna']);
 assert.ok(r.facts.some(f=>f.value==='Finnsauna'&&f.state==='ACCEPTED'&&f.offerKind==='SAUNA'));
});
test('accessible tab labels are paired with their own pane content in source text',()=>{
 const body='<main><h2>Zimmer und Suiten</h2><ul role="tablist"><li><a role="tab" aria-controls="room-a" href="#room-a">Corner</a></li><li><a role="tab" aria-controls="room-b" href="#room-b">Junior Suite</a></li></ul><div role="tabpanel" id="room-a"><p>Dieses Zimmer bietet einen Ausblick auf das Quartier und viel Platz.</p></div><div role="tabpanel" id="room-b"><p>Diese Suite bietet einen separaten Wohnbereich für Hotelgäste.</p></div></main>';
 const s=sourceText({url:'https://example.org/rooms',body,contentType:'text/html',observedAt:new Date().toISOString()},'s1',{preferMain:true});
 assert.match(s.text,/Corner\n\nDieses Zimmer bietet/u);
 assert.match(s.text,/Junior Suite\n\nDiese Suite bietet/u);
 assert.ok(s.headings.some(h=>h.text==='Corner'));
});
test('hotel-room research prefers a suite page over meeting rooms and guest services',()=>{
 const stayField={...field('experience.profile'),profileCategory:'STAY'};
 const links=['https://example.org/terrace-suite/','https://example.org/sitzungszimmer/','https://example.org/gaeste-services/'].map(url=>({url,label:url,depth:1,topics:['stay','experience']}));
 assert.deepEqual(rankResearchFrontier(links,[],[stayField]).map(link=>link.url),['https://example.org/terrace-suite/']);
});
test('a primary-language hotel room overview outranks one suite detail',()=>{
 const stayField={...field('experience.profile'),profileCategory:'STAY'};
 const links=[
  {url:'https://example.org/terrace-suite/',label:'Terrace Suite',depth:1,topics:['stay']},
  {url:'https://example.org/boutique-design-hotel/',label:'Hotel | Zimmer und Suiten',depth:1,topics:['stay','experience']},
  {url:'https://example.org/en/terrace-suite/',label:'Terrace Suite',depth:1,topics:['stay','language']},
 ];
 assert.equal(rankResearchFrontier(links,[],[stayField])[0].url,'https://example.org/boutique-design-hotel/');
});
test('six official hotel room tabs remain six scoped lodging offers',async()=>{
 const stay={...spot,name:'Hotel Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const labels=['Cozy','Corner','Top Floor Signature Design','Signature Design','Junior Suite','Terrace Suite'];
 const tabs=labels.map((name,i)=>`<a role="tab" aria-controls="room-${i}" href="#room-${i}">${name}</a>`).join('');
 const panes=labels.map((name,i)=>`<div role="tabpanel" id="room-${i}"><p>Dieses Zimmer im Hotel Example bietet Gästen eine eigene Unterkunft mit Beschreibung für die Zimmerkategorie ${name}.</p></div>`).join('');
 const body=`<main><h1>Hotel Example</h1><h3>Zimmer und Suiten</h3>${tabs}${panes}</main>`;
 const r=await researchSpotV2({...opts,spot:stay,fields:[field('experience.profile')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(()=>[])});
 assert.equal(r.results[0].status,'REQUIRES_REVIEW');
 assert.deepEqual(r.results[0].value.offers.map(offer=>offer.name),labels);
 assert.ok(r.results[0].value.offers.every(offer=>offer.kind==='OVERNIGHT_STAY'));
});
test('a room tab and its more specific literal room name are one offer',()=>{
 const stay={...spot,name:'Hotel Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'STAY'}}};
 const text='Cozy\n\nIm Cozy Double Room geniessen Gäste einen ruhigen Aufenthalt in diesem Hotelzimmer.';
 const s=source(text);
 const f=validateEvidenceFacts({facts:[fact('experience.profile','Cozy',text,{subject:'OFFER',offerKind:'OVERNIGHT_STAY'}),fact('experience.profile','Cozy Double Room','Im Cozy Double Room geniessen Gäste einen ruhigen Aufenthalt in diesem Hotelzimmer.',{subject:'OFFER',offerKind:'OVERNIGHT_STAY'})]},s,[field('experience.profile')]).map(x=>({...x,state:'ACCEPTED'}));
 const result=projectEvidenceLedger({spot:stay,fields:[field('experience.profile')],facts:f,sources:[s],...deps})[0];
 assert.deepEqual(result.value?.offers?.map(offer=>offer.name),['Cozy Double Room']);
});
test('duplicate critic IDs hold only their affected facts',async()=>{
 const wellness={...spot,name:'Thermalbad Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'WELLNESS_RELAXATION'}}};
 const body='<main><h1>Thermalbad Example</h1><h2>Alle Saunen im Überblick</h2><table><tr><td>Finnsauna</td><td>80° bis 90° C</td><td>In dieser Sauna finden regelmässig Aufgusszeremonien statt.</td></tr><tr><td>Eventsauna</td><td>80° bis 90° C</td><td>Die Eventsauna bietet Raum für bis zu 120 Personen und Aufgüsse mit Musik.</td></tr></table></main>';
 const critic=(id,verdict)=>({factId:id,verdict,subject:'OFFER',belongsTo:'TARGET',applicability:'CURRENT',restrictionQuote:''});
 const r=await researchSpotV2({...opts,spot:wellness,fields:[field('experience.profile')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:async(_url,init)=>{
  const data=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(!data.claims)return reply({facts:[],nextLinks:[]});
  return reply({verdicts:[critic(data.claims[0].id,'SUPPORTED'),critic(data.claims[1].id,'SUPPORTED'),critic(data.claims[1].id,'UNSUPPORTED')]});
 }});
 assert.deepEqual(r.results[0].value?.offers?.map(offer=>offer.name),['Finnsauna']);
 assert.equal(r.facts.find(f=>f.value==='Eventsauna')?.reason,'VERDICT_MISSING_OR_DUPLICATE');
 assert.ok(r.actions.some(a=>a.stage==='VERDICT_ID_ERROR'));
});
test('unused description candidates cannot reuse IDs of later model facts',async()=>{
 const wellness={...spot,name:'Thermalbad Example',existingValues:{...spot.existingValues,'classification.primary_category':{value:'WELLNESS_RELAXATION'}}};
 const body='<main><h1>Thermalbad Example</h1><p>Das Thermalbad bietet einen Innenbereich mit warmem Wasser für seine Gäste.</p><p>Im Aussenbereich befinden sich weitere Becken für einen Besuch.</p><h2>Alle Saunen im Überblick</h2><table><tr><td>Finnsauna</td><td>80° bis 90° C</td><td>In dieser Sauna finden regelmässig Aufgusszeremonien statt.</td></tr></table><p>Die Schneehöhle ist ideal zum Abkühlen nach dem Saunagang.</p></main>';
 const r=await researchSpotV2({...opts,spot:wellness,fields:[field('description.highlight'),field('experience.profile')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:new Date().toISOString()}),modelFetch:modelFor(data=>{
  const block=data.blocks.find(b=>b.text.includes('Schneehöhle'));
  return block?[fact('experience.profile','Schneehöhle',block.text,{subject:'OFFER',subjectLabel:'Schneehöhle',offerKind:'SAUNA'})]:[];
 })});
 assert.ok(r.facts.some(f=>f.value==='Schneehöhle'));
 assert.equal(new Set(r.facts.map(f=>f.id)).size,r.facts.length);
 assert.ok(!r.actions.some(a=>a.stage==='VERDICT_ID_ERROR'));
});
test('ice-cream product categories remain offering-group evidence, not named profile offers',()=>{
 const cafe={...spot,name:'Acero',existingValues:{...spot.existingValues,'classification.primary_category':{value:'COFFEE_DAYTIME'}}};
 const s=source('Dort bieten wir kleine, mittlere und grosse Eisportionen im Becher oder in der Waffel an. Unser Fruchteis wird aus Früchten hergestellt.');
 const f=validateEvidenceFacts({facts:[fact('experience.profile','Eisportionen','Dort bieten wir kleine, mittlere und grosse Eisportionen im Becher oder in der Waffel an.',{offerKind:'GASTRONOMY'}),fact('experience.profile','Fruchteis','Unser Fruchteis wird aus Früchten hergestellt.',{offerKind:'GASTRONOMY'})]},s,[field('experience.profile')]).map(x=>({...x,state:'ACCEPTED'}));
 assert.equal(projectEvidenceLedger({spot:cafe,fields:[field('experience.profile')],facts:f,sources:[s],...deps})[0].status,'UNRESOLVED');
});
test('restaurant homepage food categories need a named menu item source',()=>{
 const quote='Ob saftige Kebabs, aromatische Meze oder Desserts – bei uns erleben Sie anatolische Küche.';
 const s=source(quote);const proposed=['Kebabs','Meze','Desserts'].map(name=>fact('experience.profile',name,quote,{subject:'OFFER',offerKind:'GASTRONOMY'}));
 const checked=recheckEvidenceFloors(validateEvidenceFacts({facts:proposed},s,[field('experience.profile')]).map(f=>({...f,state:'ACCEPTED'})),[s],[field('experience.profile')],spot);
 assert.deepEqual(checked.map(f=>f.reason),['FOOD_ITEM_SOURCE_REQUIRED','FOOD_ITEM_SOURCE_REQUIRED','FOOD_ITEM_SOURCE_REQUIRED']);
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
