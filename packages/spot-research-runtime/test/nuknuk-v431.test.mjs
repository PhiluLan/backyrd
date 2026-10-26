import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {discoverResearchLinks,discoverMenuDocuments} from '../src/nuknuk-sources.mjs';
import {parseScopedCandidates,parseScopedPropertyFacts,parseFlatFieldFacts,flatFieldSchema,scopedPropertySchema,applyScopedVerdicts,projectScopedResearch} from '../dist/nuknuk-spot-plan.js';
import {researchSpotV2} from '../dist/nuknuk-agent.js';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
const field=key=>({attributeKey:key,...researchValueContract(key),profileCategory:'EAT'}),fields=[field('experience.profile')];
const source=(text,headings=[])=>({id:'s1',url:'https://example.org/',observedAt:'2026-10-25T12:00:00Z',text,headings,hash:createHash('sha256').update(text).digest('hex')});
const candidate=(scope,kind,name,blockId,extra={})=>({field:'experience.profile',scope,entityKind:kind,entityName:name,propertyKey:'',valueJson:'null',blockId,belongsTo:'TARGET',applicability:'CURRENT',condition:'',...extra});

test('Italian menu routes are discovered without admitting actual carts or private/legal pages',()=>{
 const page={url:'https://example.org/',contentType:'text/html',body:['/pdfdownload/menu-del-pranzo','/pdfdownload/alla-carta','/pdfdownload/carta-dei-vini','/cart','/shopping-cart','/cart/checkout','/datenschutz','/pdfdownload/agb'].map((u,i)=>`<a href="${u}">${['Menu del pranzo','Alla carta','Carta dei vini','Warenkorb','Shopping cart','Kasse','Datenschutz','AGB'][i]}</a>`).join('')};
 const links=discoverResearchLinks(page,{spotProfile:true});
 for(const path of ['menu-del-pranzo','alla-carta','carta-dei-vini'])assert.ok(links.some(l=>l.url.endsWith(path)&&l.topics.includes('menu')));
 assert.ok(!links.some(l=>/\/(?:cart|shopping-cart)(?:\/|$)|datenschutz/.test(l.url)));
 const documents=discoverMenuDocuments(page);assert.equal(documents.length,3);assert.ok(documents.every(d=>d.discoveredOn===page.url));
 assert.deepEqual(discoverMenuDocuments({...page,body:'<a href="/products/alla-carta">Alla carta</a><a href="/pdfdownload/agb">AGB</a>'}),[]);
});
test('an area body retains its exact active heading but cannot borrow a sibling heading',()=>{
 const text='BANKETTSAAL\n\nFeiern und tagen\n\nUnser heller Saal bietet Platz für bis zu 80 Personen.\n\nGARTEN\n\nWenn die Sonne scheint\n\nUnsere grüne Oase lädt zum Verweilen ein.';
 const s=source(text,[{level:2,text:'BANKETTSAAL',offset:0},{level:3,text:'Feiern und tagen',offset:text.indexOf('Feiern und tagen')},{level:2,text:'GARTEN',offset:text.indexOf('GARTEN')},{level:3,text:'Wenn die Sonne scheint',offset:text.indexOf('Wenn die Sonne scheint')}]);
 const blocks=[{id:'b1',text:'Unser heller Saal bietet Platz für bis zu 80 Personen.'},{id:'b2',text:'Unsere grüne Oase lädt zum Verweilen ein.'}];
 const rows=parseScopedCandidates({candidates:[candidate('AREA','PRIVATE_ROOM','Bankettsaal','b1'),candidate('AREA','OUTDOOR','Garten','b2'),candidate('AREA','PRIVATE_ROOM','Bankettsaal','b2')]},s,fields,blocks);
 assert.deepEqual(rows.slice(0,2).map(r=>r.reason),['SEMANTIC_CHECK_PENDING','SEMANTIC_CHECK_PENDING']);
 for(const r of rows.slice(0,2))assert.equal(s.text.slice(r.sourceOffset,r.sourceOffset+r.quote.length),r.quote);
 assert.equal(rows[2].reason,'ENTITY_EVIDENCE_REQUIRED');
 assert.ok(rows.slice(0,2).every(r=>r.state==='HELD'));
});
test('event inquiry belongs to the celebration heading and never becomes a venue-wide reservation rule',()=>{
 const text='Private Tavolata & Events\n\nJetzt Event anfragen (events@example.org)';
 const s=source(text,[{level:2,text:'Private Tavolata & Events',offset:0}]);
 const rows=parseScopedCandidates({candidates:[candidate('OFFER','PRIVATE_CELEBRATION','Private Feier','b1',{propertyKey:'participation.booking',valueJson:JSON.stringify('Jetzt Event anfragen (events@example.org)')})]},s,fields,[{id:'b1',text:'Jetzt Event anfragen (events@example.org)'}]);
 assert.equal(rows[0].reason,'SEMANTIC_CHECK_PENDING');assert.equal(rows[0].scope,'OFFER');assert.equal(rows[0].field,'experience.profile');assert.ok(rows[0].quote.startsWith('Private Tavolata'));
});
test('more than eight practical properties retain literal numeric capacities and a bounded output contract',()=>{
 const blocks=Array.from({length:9},(_,i)=>({id:'b'+i,text:`Raum ${i+1} bietet ${10+i} Plätze.`}));const s=source(blocks.map(b=>b.text).join('\n\n'));
 const nodes=blocks.map((b,i)=>({...candidate('AREA','PRIVATE_ROOM','Raum '+(i+1),b.id),id:'sc'+i}));
 const facts=nodes.map((n,i)=>({entity:n.id,key:'offer.capacity',blockId:blocks[i].id,value:10+i,condition:''}));
 const rows=parseScopedPropertyFacts({facts,reviewIssues:[]},nodes,s,fields,blocks,0);
 assert.equal(rows.length,9);assert.ok(rows.every(r=>r.reason==='SEMANTIC_CHECK_PENDING'));assert.equal(scopedPropertySchema(nodes,blocks).properties.facts.maxItems,24);
 assert.throws(()=>parseScopedPropertyFacts({facts:Array(25).fill(facts[0])},nodes,s,fields,blocks,0),/SCOPED_PROPERTIES_INVALID/);
 const fs=[field('identity.name')];const native=Array.from({length:9},()=>({field:'identity.name',blockId:'b0',value:'Raum 1',belongsTo:'TARGET',condition:''}));
 assert.equal(parseFlatFieldFacts({facts:native},s,fs,blocks,0).length,1); // v4.36: identical flat facts retain one evidence-backed candidate.
 assert.equal(flatFieldSchema(fs,blocks).properties.facts.maxItems,16);
});
test('a redirected menu route retains its official parent and starts PDF layout inspection',async()=>{
 const events=[];const route='https://example.org/pdfdownload/alla-carta';
 const report=await researchSpotV2({spot:{spotId:'11111111-1111-4111-8111-111111111111',name:'Fixture Restaurant',existingValues:{'contact.website':{value:'https://example.org/'}}},fields,modelPath:'/tmp/45797d2985a12c55e6473686e9ea91b95e959553',restaurantWorkingContext:true,sources:['https://example.org/'],maxRequests:5,maxModelCalls:12,inspectMenuImages:true,discoverLinks:true},{
 validateValue:validateAuthoringSubmission,
 fetchPage:async url=>url===route?{url:'https://example.org/menu.pdf',redirectedFrom:[url],contentType:'application/pdf',body:Buffer.from('%PDF-fixture'),observedAt:'2026-10-25T12:00:00Z'}:{url,contentType:'text/html',body:'<main><h1>Fixture Restaurant</h1><p>Wir servieren Mittagessen.</p><a href="/pdfdownload/alla-carta">Alla carta</a></main>',observedAt:'2026-10-25T12:00:00Z'},
 readPage:async (page,id)=>({...source(page.contentType==='application/pdf'?'Menü 25 CHF':'Fixture Restaurant\n\nWir servieren Mittagessen.'),id,url:page.url,...(page.contentType==='application/pdf'?{format:'PDF_TEXT',layoutReviewRequired:true}:{})}),
 modelFetch:async(_url,init)=>{const d=JSON.parse(JSON.parse(init.body).messages[1].content);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(d.phase==='ENTITIES'?{candidates:[]}:d.phase==='PROPERTIES'?{facts:[],reviewIssues:[]}:d.candidates||d.claims?{verdicts:[]}:{facts:[]})}}]}));},onProgress:e=>events.push(e)});
 assert.ok(events.some(e=>e.stage==='PDF_LAYOUT_STARTED'));assert.ok(events.some(e=>e.stage==='PDF_LAYOUT_ERROR')); // Invalid fixture bytes must fail honestly after entering the audit lane.
 assert.equal(report.sources.find(s=>s.format==='PDF_TEXT').discoveredOn,'https://example.org/');assert.equal(report.canonicalWrite,false);assert.ok(!report.modelAudit.some(a=>a.sourceId===report.sources.find(s=>s.format==='PDF_TEXT').id));
});

test('directions fragments from one active section form one unchanged evidence span',()=>{
 const text='Anreise\n\nTramhaltestelle Zentrum\n\nVom Bahnhof: Tram 8.\n\nMit dem Velo: Station 42.\n\nWeitere Infos\n\nVom Bahnhof: Bus 5.';
 const s=source(text,[{level:2,text:'Anreise',offset:0},{level:2,text:'Weitere Infos',offset:text.indexOf('Weitere Infos')}]);
 const blocks=[{id:'a',text:'Tramhaltestelle Zentrum'},{id:'b',text:'Vom Bahnhof: Tram 8.'},{id:'c',text:'Mit dem Velo: Station 42.'},{id:'d',text:'Vom Bahnhof: Bus 5.'}];
 const fact=id=>({entity:'SPOT',key:'travel.mode',blockId:id,value:'SOURCE_BLOCK',condition:''});
 const raw={facts:['a','b','c'].map(fact),reviewIssues:[]};const unchanged=JSON.stringify(raw);
 const rows=parseScopedPropertyFacts(raw,[],s,fields,blocks,0);assert.equal(rows.length,1);assert.ok(rows[0].quote.includes('Tram 8.'));assert.ok(rows[0].quote.includes('Station 42.'));assert.equal(s.text.slice(rows[0].sourceOffset,rows[0].sourceOffset+rows[0].quote.length),rows[0].quote);assert.equal(rows[0].reason,'SEMANTIC_CHECK_PENDING');assert.equal(JSON.stringify(raw),unchanged);
 const single=parseScopedPropertyFacts({facts:[fact('b')]},[],s,fields,blocks,1)[0];const together=[rows[0],single];
 applyScopedVerdicts({verdicts:together.map(c=>({id:c.id,verdict:'SUPPORTED',reasonCode:'DIRECT_SUPPORT',explanation:'The original source explicitly supports these directions.',evidenceQuote:c.quote}))},together,s);
 const projected=projectScopedResearch({name:'Fixture',existingValues:{'classification.primary_category':{value:'EAT'}}},fields,together,[s],validateAuthoringSubmission)[0];
 assert.equal(projected.value.properties.find(p=>p.key==='travel.mode').value,JSON.parse(rows[0].valueJson));

 assert.equal(parseScopedPropertyFacts({facts:['b','d'].map(fact)},[],s,fields,blocks,0).length,2);
 assert.throws(()=>parseScopedPropertyFacts({facts:[{...fact('a'),extra:'invalid'},fact('b')]},[],s,fields,blocks,0),/SCOPED_PROPERTY_INVALID/);
});


test('individually supported differing property texts remain explicit scoped review evidence after projection',()=>{
 const s=source('Wir bieten private Geburtstagsfeiern an.\n\nFür Familien und Freundeskreise.\n\nFür Firmen und Gruppen.');
 const blocks=s.text.split('\n\n').map((text,i)=>({id:'b'+i,text}));
 const rows=parseScopedCandidates({candidates:[candidate('OFFER','PRIVATE_CELEBRATION','Private Feier','b0'),candidate('OFFER','PRIVATE_CELEBRATION','Private Feier','b0',{propertyKey:'participation.audience',valueJson:JSON.stringify(blocks[0].text)}),candidate('OFFER','PRIVATE_CELEBRATION','Private Feier','b0',{propertyKey:'participation.audience',valueJson:JSON.stringify(blocks[0].text+' invented')})]},s,fields,blocks,0);
 // Use two valid different literal passages which both name this service.
 const text='Private Geburtstagsfeiern für Familien.\n\nPrivate Geburtstagsfeiern für Firmen.';const other=source(text),bs=text.split('\n\n').map((text,i)=>({id:'b'+i,text}));
 const cs=parseScopedCandidates({candidates:[candidate('OFFER','PRIVATE_CELEBRATION','Private Feier','b0'),...bs.map(b=>candidate('OFFER','PRIVATE_CELEBRATION','Private Feier',b.id,{propertyKey:'participation.audience',valueJson:JSON.stringify(b.text)}))]},other,fields,bs,0);
 applyScopedVerdicts({verdicts:cs.map(c=>({id:c.id,verdict:'SUPPORTED',reasonCode:'DIRECT_SUPPORT',explanation:'The source explicitly supports each separate original statement.',evidenceQuote:c.quote}))},cs,other);
 const result=projectScopedResearch({name:'Fixture',existingValues:{'classification.primary_category':{value:'EAT'}}},fields,cs,[other],validateAuthoringSubmission)[0];
 assert.ok(!result.value.offers[0].properties.some(p=>p.key==='participation.audience'));assert.equal(result.reviewEvidence.length,2);assert.ok(result.reviewEvidence.every(e=>e.reviewReason==='PROPERTY_VALUES_REQUIRE_REVIEW'&&e.propertyKey==='participation.audience'&&e.entityName==='Private Feier'&&e.sourceHash===other.hash&&other.text.includes(e.evidence)));
 assert.equal(rows[2].state,'HELD');
});
