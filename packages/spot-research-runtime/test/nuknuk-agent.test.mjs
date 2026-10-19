import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {researchSpotV2,validateEvidenceFacts,projectEvidenceLedger,rankResearchFrontier} from '../dist/nuknuk-agent.js';
import {discoverResearchLinks,sourceText} from '../src/nuknuk-sources.mjs';
import {NUKNUK_MODEL_REVISION} from '../src/nuknuk-research.mjs';
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
test('planner prioritizes unresolved questions, not insertion order',()=>{
 const f=[{url:'https://example.org/menu',depth:1,topics:['menu']},{url:'https://example.org/contact',depth:2,topics:['contact']}];
 assert.equal(rankResearchFrontier(f,[],[field('contact.phone')])[0].url,f[1].url);
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
test('contradictory amenities and laptop policies are not silently combined',()=>{
 const s=source('WLAN ist vorhanden. WLAN nicht verfügbar. Laptops erlaubt. Laptops verboten.');
 const facts=ledger([fact('amenity.features','WIFI','WLAN ist vorhanden.'),fact('amenity.features','WIFI','WLAN nicht verfügbar.',{polarity:'NEGATIVE'}),fact('operation.laptop_policy','true','Laptops erlaubt.'),fact('operation.laptop_policy','false','Laptops verboten.')],s);
 const r=projectEvidenceLedger({spot,fields:[field('amenity.features'),field('operation.laptop_policy')],facts,sources:[s],...deps});
 assert.deepEqual(r.map(x=>x.status),['UNRESOLVED','UNRESOLVED']);
});
test('literal named offers retain evidence and cannot self-approve profiles',()=>{
 const s=source('Geröstete Karotten mit Labneh.');const facts=ledger([fact('experience.profile','Geröstete Karotten','Geröstete Karotten mit Labneh.',{offerKind:'GASTRONOMY'})],s);
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
test('rechecking saved evidence blocks newly guarded claims without promoting unknowns',async()=>{
 const {recheckEvidenceFloors}=await import('../dist/nuknuk-agent.js');const s=source('Carving');const f=ledger([fact('experience.profile','Carving','Carving',{offerKind:'WORKSHOP'})],s)[0];
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
 const facts=ledger([fact('experience.profile','Classic Room','Classic Room: a double room with shower.',{offerKind:'OVERNIGHT_STAY'}),fact('experience.profile','Steak','Steak with seasonal vegetables.',{offerKind:'GASTRONOMY'})],s);
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

test('the venue itself cannot be duplicated as a concrete dish or activity offer',()=>{
 const text='Synthetic Restaurant serves seasonal food every evening.';const s=source(text);const f=ledger([fact('experience.profile',spot.name,text,{offerKind:'GASTRONOMY'})],s);
 assert.equal(projectEvidenceLedger({spot,fields:[field('experience.profile')],facts:f,sources:[s],...deps})[0].status,'UNRESOLVED');
});

test('deterministically scoped area schedules are held before the semantic critic sees target claims',async()=>{
 let count=0;const r=await researchSpotV2({...opts,fields:[field('hours.regular')],maxRequests:1},{...deps,fetchPage:async url=>({url,contentType:'text/html',body:'<main><h2>Öffnungszeiten</h2>RESTAURANT<p>Montag 11–23 Uhr</p>RIVER BAR<p>Dienstag 12–24 Uhr</p></main>',observedAt:new Date().toISOString()}),modelFetch:async(url,init)=>{
  const req=JSON.parse(init.body),data=JSON.parse(req.messages[1].content);count++;assert.equal(data.claims.length,1);assert.equal(data.claims[0].value,'Montag 11–23 Uhr');return reply({verdicts:data.claims.map(f=>({factId:f.id,verdict:'SUPPORTED',subject:'TARGET',belongsTo:'TARGET',applicability:'CURRENT',restrictionQuote:''}))});
 }});assert.equal(count,1);assert.equal(r.results[0].value[0].day,'MONDAY');assert.equal(r.facts.find(f=>f.quote==='Dienstag 12–24 Uhr').state,'HELD');
});
