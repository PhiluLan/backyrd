import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {projectScopedResearch,scopedCoverage} from '../dist/nuknuk-spot-plan.js';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
import {discoverMenuDocuments,publicSourceUrl,readSourceText} from '../src/nuknuk-sources.mjs';
const fields=[{attributeKey:'experience.profile',...researchValueContract('experience.profile'),profileCategory:'EAT'}];
function dietaryFixture(values){
 const text='Wir servieren Mittagessen.\n'+values.join('\n'),source={id:'s1',url:'https://example.org/menu',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-26T12:00:00Z'};
 const common={field:'experience.profile',scope:'OFFER',entityKind:'LUNCH',entityName:'Mittagessen',blockId:'b0',belongsTo:'TARGET',applicability:'CURRENT',condition:'',sourceId:'s1',state:'ACCEPTED',reason:'CRITIC_SUPPORTED'};
 const ledger=[{...common,id:'s0',propertyKey:'',valueJson:'null',quote:'Wir servieren Mittagessen.'},...values.map((v,i)=>({...common,id:'p'+i,propertyKey:'food.diet',valueJson:JSON.stringify(v),quote:v}))];
 return {source,ledger,project:()=>projectScopedResearch({name:'Test Restaurant'},fields,ledger,[source],validateAuthoringSubmission)};
}
test('compatible vegan and vegetarian options remain in projection and cease to be diagnostic conflicts',()=>{
 const f=dietaryFixture(['Falafel Vegan Falafelbällchen mit Fladenbrot','Marmaris Vegi-Teller verschiedenes Gemüse gefüllt mit Reis']);
 const results=f.project(),diet=results[0].value.offers[0].properties.find(p=>p.key==='food.diet');assert.ok(diet.value.includes('Falafel Vegan'));assert.ok(diet.value.includes('Vegi-Teller'));
 assert.equal(results[0].citations.length,3);assert.deepEqual(scopedCoverage(results,f.ledger).conflictingProperties,[]);
});
test('positive dietary options from different current sources are additive too',()=>{
 const f=dietaryFixture(['Vegane Optionen verfügbar.','Vegetarische Optionen verfügbar.']);const other={...f.source,id:'s2',url:'https://example.org/food'};f.ledger[2].sourceId='s2';
 const results=projectScopedResearch({name:'Test Restaurant'},fields,f.ledger,[f.source,other],validateAuthoringSubmission);assert.match(results[0].value.offers[0].properties.find(p=>p.key==='food.diet').value,/Vegane[\s\S]*Vegetarische/);
});
test('negated or exclusive dietary assertions are not flattened into positive options',()=>{
 for(const other of ['Keine veganen Gerichte verfügbar.','Ausschließlich vegetarische Küche.']){const f=dietaryFixture(['Vegane Optionen verfügbar.',other]);assert.ok(scopedCoverage(f.project(),f.ledger).conflictingProperties.length>0);assert.ok(!f.project()[0].value.offers[0].properties.some(p=>p.key==='food.diet'));}
});
test('merging dietary options does not erase an explicit condition',()=>{
 const f=dietaryFixture(['Vegane Optionen verfügbar.','Vegetarische Optionen nur am Montag.']);f.ledger[2].condition='nur am Montag';
 assert.ok(!String(f.project()[0].value.offers[0].properties.find(p=>p.key==='food.diet')?.value).includes('Montag'));assert.ok(scopedCoverage(f.project(),f.ledger).conflictingProperties.length>0);
});
const widget=(data={})=>({type:'widget.filedownload',uniqueHTMLId:'download-1',uniqueId:'key-1',data:{text:'Menükarte',url:'http://cdn.example.org/menu.pdf',fileName:'menu.pdf',...data}});
function page(record=widget(),dom='<div id="download-1" data-name="filedownload" data-uniqueid="key-1"><div><button class="js-file-btn">Menükarte</button></div></div>'){
 return {url:'https://example.org/angebot',contentType:'text/html',body:dom+'<script>Server.components = '+JSON.stringify({one:record})+'; globalThis.__nuknukPdfScriptExecuted=true;</script>'};
}
test('visible CMS file buttons expose their published PDF with TLS and exact parent provenance without executing script',()=>{
 const p=page();delete globalThis.__nuknukPdfScriptExecuted;const [d]=discoverMenuDocuments(p);
 assert.equal(d.url,'https://cdn.example.org/menu.pdf');assert.equal(d.discoveredOn,p.url);assert.equal(d.observedUrl,'http://cdn.example.org/menu.pdf');assert.equal(d.discovery,'PUBLISHED_CMS_DOWNLOAD_WIDGET');assert.equal(globalThis.__nuknukPdfScriptExecuted,undefined);
 assert.throws(()=>publicSourceUrl('http://cdn.example.org/menu.pdf'));
});
test('CMS PDF discovery requires a matching visible download control',()=>{
 assert.deepEqual(discoverMenuDocuments(page(widget(),'')),[]);assert.deepEqual(discoverMenuDocuments(page({...widget(),uniqueId:'wrong'})),[]);
 assert.deepEqual(discoverMenuDocuments(page(widget(),'<div hidden id="download-1" data-name="filedownload" data-uniqueid="key-1"><button class="js-file-btn">Menükarte</button></div>')),[]);
 assert.deepEqual(discoverMenuDocuments(page(widget({text:'Other button'}))),[]);
});
test('CMS file discovery rejects private, authenticated, legal and non-PDF destinations',()=>{
 for(const url of ['https://127.0.0.1/menu.pdf','https://localhost/menu.pdf','https://user:password@cdn.example.org/menu.pdf','https://cdn.example.org/menu.pdf?token=secret','javascript:alert(1)','https://cdn.example.org/not-a-pdf'])assert.deepEqual(discoverMenuDocuments(page(widget({url}))),[],url);
 assert.deepEqual(discoverMenuDocuments(page(widget({fileName:'terms.pdf'}))),[]);
});
test('published widget arrays, escaped URLs and duplicate CMS records are read as inert JSON only',()=>{
 const p=page();p.body+='<script>Server.widgetsOnPage = '+JSON.stringify([widget()]).replaceAll('/','\\/')+';</script>';assert.equal(discoverMenuDocuments(p).length,1);
 const broken=page();broken.body=broken.body.replace('Server.components = {','Server.components = function(){ return {');assert.deepEqual(discoverMenuDocuments(broken),[]);
});

const scannedPdf={url:'https://example.org/menu.pdf',contentType:'application/pdf',body:Buffer.from('%PDF-scanned-fixture'),observedAt:'2026-10-26T12:00:00Z'};
const scannedHash=createHash('sha256').update(scannedPdf.body).digest('hex');
function ocrAudit(overrides={}){return {officialMenuUrl:scannedPdf.url,documentAssetHash:scannedHash,images:[{pageNumber:1,tesseractLines:['Vegane Falafel 19.50','Vegetarischer Teller 21.50']}],totalDocumentPages:1,layoutPagesInspected:1,layoutCheckComplete:true,candidateRows:0,catalogWrites:0,certifiedComplete:false,...overrides};}
test('scanned PDFs reach bounded page OCR and preserve provenance and the layout review flag',async()=>{
 let calls=0;
 const source=await readSourceText(scannedPdf,'pdf1',{pdfCommand:'/usr/bin/true',pdfOcr:async(page,options)=>{calls++;assert.equal(page,scannedPdf);assert.equal(options.maxPages,20);assert.equal(options.maxDurationMs,180000);return ocrAudit();}});
 assert.equal(calls,1);assert.match(source.text,/\[Page 1\][\s\S]*Vegane Falafel/);assert.equal(source.assetHash,scannedHash);assert.equal(source.layoutReviewRequired,true);assert.equal(source.extractionOrder,'PAGE_OCR');assert.equal(source.pdfLayoutAudit.layoutCheckComplete,true);assert.equal(source.truncated,false);
});
test('OCR audits cannot substitute a different document or source',async()=>{
 for(const overrides of [{officialMenuUrl:'https://other.org/menu.pdf'},{documentAssetHash:'wrong'}])await assert.rejects(readSourceText(scannedPdf,'pdf1',{pdfCommand:'/usr/bin/true',pdfOcr:async()=>ocrAudit(overrides)}),/source_pdf_ocr_provenance_invalid/);
});
test('empty OCR fails honestly and incomplete page reads remain truncated',async()=>{
 await assert.rejects(readSourceText(scannedPdf,'pdf1',{pdfCommand:'/usr/bin/true',pdfOcr:async()=>ocrAudit({images:[]})}),/source_pdf_ocr_empty/);
 const source=await readSourceText(scannedPdf,'pdf1',{pdfCommand:'/usr/bin/true',pdfOcr:async()=>ocrAudit({layoutCheckComplete:false,totalDocumentPages:25})});assert.equal(source.truncated,true);
});

test('a scanned PDF reuses its source-bound OCR audit in the agent without a second rendering pass',async()=>{
 const {researchSpotV2}=await import('../dist/nuknuk-agent.js');
 const {validateAuthoringSubmission}=await import('../../world-knowledge-core/dist/index.js');
 const events=[],seed='https://example.org/';
 const field=attributeKey=>({attributeKey,...researchValueContract(attributeKey),profileCategory:'EAT'});
 const report=await researchSpotV2({spot:{spotId:'11111111-1111-4111-8111-111111111111',name:'Example Restaurant',existingValues:{'contact.website':{value:seed}}},fields:[field('contact.phone'),field('experience.profile')],sources:[seed],modelPath:'/tmp/45797d2985a12c55e6473686e9ea91b95e959553',restaurantWorkingContext:true,maxRequests:3,maxModelCalls:12,discoverLinks:true,inspectMenuImages:true},{
 validateValue:validateAuthoringSubmission,
 fetchPage:async url=>url.endsWith('/menu.pdf')?{url,contentType:'application/pdf',body:Buffer.from('%PDF-invalid-test'),observedAt:'2026-10-26T08:00:00Z'}:{url,contentType:'text/html',body:'<main><h1>Example Restaurant</h1><p>Wir servieren Mittagessen.</p><a href="/kontakt">Kontakt</a><a href="/menu.pdf">Speisekarte</a></main>',observedAt:'2026-10-26T08:00:00Z'},
 readPage:async(page,id)=>{const text=page.contentType==='application/pdf'?'Speisekarte':'Example Restaurant\nWir servieren Mittagessen.';return {id,url:page.url,text,hash:createHash('sha256').update(text).digest('hex'),observedAt:page.observedAt,...(page.contentType==='application/pdf'?{format:'PDF_TEXT',layoutReviewRequired:true,pdfLayoutAudit:{...ocrAudit(),officialMenuUrl:page.url,documentAssetHash:createHash('sha256').update(page.body).digest('hex')}}:{})};},
 modelFetch:async(_url,init)=>{const d=JSON.parse(JSON.parse(init.body).messages[1].content),value=d.phase==='ENTITIES'?{candidates:[]}:d.phase==='PROPERTIES'?{facts:[],reviewIssues:[]}:d.candidates||d.claims?{verdicts:[]}:{facts:[]};return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));},onProgress:e=>events.push(e)});
 assert.ok(report.sources.some(s=>s.url===seed+'kontakt'));assert.equal(report.sources.find(s=>s.format==='PDF_TEXT').discoveredOn,seed);assert.ok(events.some(e=>e.stage==='PDF_LAYOUT_STARTED'));assert.ok(events.some(e=>e.stage==='PDF_LAYOUT_CHECK'&&e.complete));assert.ok(!events.some(e=>e.stage==='PDF_LAYOUT_ERROR'));assert.equal(report.menuMedia.audits.length,1);assert.equal(report.canonicalWrite,false);
});
