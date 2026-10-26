import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sourceText,discoverResearchLinks} from '../src/nuknuk-sources.mjs';
import {criticContext,literalSourceFacts,sharedMenuRoute,researchSpotV2} from '../dist/nuknuk-agent.js';
import {restaurantProfileBlock} from '../dist/nuknuk-research-context.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
const field=attributeKey=>({attributeKey,...researchValueContract(attributeKey),profileCategory:'EAT'});
const spot={spotId:'11111111-1111-4111-8111-111111111111',name:'Example Central',locality:'Bern',existingValues:{'contact.website':{value:'https://example.org/locations/central-bern'}}};
const page=body=>({url:spot.existingValues['contact.website'].value,body,contentType:'text/html',observedAt:'2026-10-25T12:00:00Z'});
const hydration=items=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{global:{menuItems:items}}}})+'</script>';
const hours='<div><h2>Öffnungszeiten</h2><p>Küche</p></div><div>'+[['Montag – Freitag','10:00–23:00','11:00–21:00'],['Samstag','12:00–23:00','12:00–21:00'],['Sonntag','12:00–22:00','12:00–20:00']].map(([d,a,b])=>`<div><h4>${d}</h4><div><div>${a}</div><div>${b}</div></div></div>`).join('')+'</div>';
test('inert hydration navigation observes only bounded same-host declared nav records',()=>{
 const links=discoverResearchLinks(page(hydration([{menuLabel:'Menü',pageRelation:'http://example.org/menu'},{menuLabel:'Kontakt',pageRelation:'http://evil.org/contact'},{menuLabel:'Menü',pageRelation:'http://user:secret@example.org/menu'},{menuLabel:'Datenschutz',pageRelation:'https://example.org/privacy'},{menuLabel:'AGB',pageRelation:'https://example.org/agb'},{menuLabel:'Menü',pageRelation:'http://example.org:8080/menu'}])+ '<script>window.location="https://example.org/secret"</script>'),{spotProfile:true});
 assert.ok(links.some(l=>l.url==='https://example.org/menu'&&l.topics.includes('menu')));
 assert.ok(!links.some(l=>/evil|secret|privacy|8080/.test(l.url)));
 assert.deepEqual(discoverResearchLinks(page('<script id="__NEXT_DATA__">{bad</script>')),[]);
 assert.deepEqual(discoverResearchLinks(page('<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{randomUrl:'https://example.org/menu'}}})+'</script>')),[]);
});
test('two explicit schedule columns retain distinct full weekday associations and asset provenance',()=>{
 const p=page('<title>Example – Example Central | Restaurant</title><main><h1>Central, Bern</h1>'+hours+'<h2>Weitere Standorte</h2><p>Anderestrasse 42</p></main>');
 const s=sourceText(p,'s1',{preferMain:true});assert.equal(s.separatedScheduleColumns,true);
 const opening=s.text.slice(s.headings.find(h=>h.text==='Öffnungszeiten').offset,s.headings.find(h=>h.text==='Küche').offset);
 const kitchen=s.text.slice(s.headings.find(h=>h.text==='Küche').offset,s.headings.find(h=>h.text==='Weitere Standorte').offset);
 assert.ok(opening.includes('Montag – Freitag 10:00–23:00'));assert.ok(!opening.includes('11:00–21:00'));
 assert.ok(kitchen.includes('Montag – Freitag 11:00–21:00'));assert.ok(!kitchen.includes('10:00–23:00'));
 assert.equal(s.assetHash,createHash('sha256').update(p.body).digest('hex'));
 assert.ok(s.text.includes('Example – Example Central | Restaurant'));assert.ok(s.text.indexOf('Example –')>s.identityOffset);
 assert.deepEqual(literalSourceFacts(s,[field('hours.regular')],spot,0),[]);
 for(const h of s.headings)assert.equal(s.text.slice(h.offset,h.offset+h.text.length),h.text);
});
test('ambiguous, incomplete or unlabelled columns are never silently separated',()=>{
 for(const html of [hours.replace('Küche','Anderes'),hours.replace('12:00–20:00','auf Anfrage'),hours.replace('<div>12:00–20:00</div>','')])assert.equal(sourceText(page('<main>'+html+'</main>'),'s1',{preferMain:true}).separatedScheduleColumns,false);
});
test('critic addresses cannot leak from a following other-locations section',()=>{
 const text='Central, Bern\nTeststrasse 8\nÖffnungszeiten\nSonntag 12:00–22:00\nWeitere Standorte\nNord\nAndereweg 42';
 const headings=[['Central, Bern',1],['Öffnungszeiten',2],['Weitere Standorte',2],['Nord',3]].map(([label,level])=>({text:label,level,offset:text.indexOf(label)}));
 const quote='Sonntag 12:00–22:00';const ctx=criticContext({text,headings,url:page('').url},[{id:'f0',field:'hours.regular',quote,value:quote}],spot);
 assert.equal(ctx.claims[0].nearestPublishedAddress,'Teststrasse 8');assert.equal(ctx.claims[0].nearestAddressPosition,'before');
});
test('shared menu route requires exact same-host observed provenance and matching locality',()=>{
 const link={url:'https://example.org/menu',label:'Menü',topics:['menu'],discoveredOn:page('').url};
 assert.equal(sharedMenuRoute(link,spot),'INDEX');assert.equal(sharedMenuRoute({...link,url:'https://example.org/menu-bern'},spot),'LOCAL');
 for(const patch of [{url:'https://example.org/menu-zurich'},{url:'https://other.org/menu-bern'},{discoveredOn:undefined},{topics:['about']},{url:'https://example.org/menu?token=x'},{url:'https://example.org/locations/other/menu'}])assert.equal(sharedMenuRoute({...link,...patch},spot),null);
});
test('profile task excludes contact-only, hours-only and action blocks but keeps practical visitor evidence',()=>{
 for(const value of ['central@example.org','Teststrasse 8','3000 Bern','+41 61 222 33 44','Reservieren','Lieferung Reservieren','Öffnungszeiten\nMontag 10:00–22:00','Montag – Freitag 11:00–21:00'])assert.equal(restaurantProfileBlock(value,false),false,value);
 for(const value of ['Unser Garten liegt direkt am Fluss.','Mit Tram 8 bis Zentrum.','WLAN ist kostenlos verfügbar.','Wir servieren mittags warme Speisen.'])assert.equal(restaurantProfileBlock(value,false),true,value);
});
test('branch crawl follows the observed local menu but never extracts shared contact fields or a foreign regional menu',async()=>{
 const visited=[],inputs=[];
 const pages={
  [page('').url]:'<title>Example Central</title><main><h1>Central, Bern</h1>'+hours+'</main>'+hydration([{menuLabel:'Menü',pageRelation:'http://example.org/menu'}]),
  'https://example.org/menu':'<main><h1>Menü</h1><a href="/menu-bern">Menü Bern</a><a href="/menu-zurich">Menü Zürich</a></main>',
  'https://example.org/menu-bern':'<main><h1>Menü Bern</h1><p>Wir servieren warme Speisen und Getränke im Restaurant.</p></main><footer>headquarters@example.org</footer>'};
 const fields=['identity.name','hours.regular','hours.kitchen','contact.public_email','experience.profile'].map(field);
 const report=await researchSpotV2({spot,fields,restaurantWorkingContext:true,modelPath:'/tmp/45797d2985a12c55e6473686e9ea91b95e959553',sources:[page('').url],discoverLinks:true,maxDepth:3,maxRequests:8,maxModelCalls:16},{validateValue:validateAuthoringSubmission,fetchPage:async url=>{visited.push(url);assert.ok(pages[url],url);return {...page(pages[url]),url};},modelFetch:async(_url,init)=>{
  const data=JSON.parse(JSON.parse(init.body).messages[1].content);inputs.push(data);
  const raw=data.phase==='ENTITIES'?{candidates:[]}:data.phase==='PROPERTIES'?{facts:[],reviewIssues:[]}:data.claims||data.candidates?{verdicts:[]}:{facts:[]};
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]}));}});
 assert.deepEqual(visited,[page('').url,'https://example.org/menu','https://example.org/menu-bern']);
 assert.deepEqual(report.sourceFailures,[]);
 const flat=inputs.find(d=>Array.isArray(d.fields));assert.ok(flat.fields.some(f=>f.field==='hours.regular'));assert.ok(flat.fields.some(f=>f.field==='hours.kitchen'));
 assert.ok(flat.blocks.some(b=>b.text.includes('Öffnungszeiten')&&b.text.includes('Sonntag 12:00–22:00')));
 assert.ok(flat.blocks.some(b=>b.text.includes('Küche')&&b.text.includes('Sonntag 12:00–20:00')));
 assert.ok(!inputs.some(d=>d.source?.url==='https://example.org/menu-bern'&&Array.isArray(d.fields)));
 assert.ok(!report.facts.some(f=>f.value==='headquarters@example.org'));
});
