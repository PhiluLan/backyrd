import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {discoverResearchLinks} from '../src/nuknuk-sources.mjs';
import {auditMenuPdf,agreeingPricedRows} from '../src/nuknuk-menu-media.mjs';
import {literalLinkedDiningServices,parseScopedCandidates,applyScopedVerdicts,projectScopedResearch,sourceRestrictionChoices,parsePropertyReviewIssues} from '../dist/nuknuk-spot-plan.js';
import {applyResearchHoursPolicy,pdfMenuReviewEvidence} from '../dist/nuknuk-agent.js';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
const field=key=>({attributeKey:key,...researchValueContract(key),profileCategory:'EAT'}),fields=[field('experience.profile')];
const spot={spotId:'11111111-1111-4111-8111-111111111111',name:'Fixture Bistro',locality:'Basel',existingValues:{'classification.primary_category':{value:'EAT'}}};
const source=text=>({id:'s1',url:'https://example.org/',observedAt:'2026-10-25T12:00:00Z',text,hash:createHash('sha256').update(text).digest('hex')});
const candidate=(scope,kind,name,blockId,extra={})=>({field:'experience.profile',scope,entityKind:kind,entityName:name,propertyKey:'',valueJson:'null',blockId,belongsTo:'TARGET',applicability:'CURRENT',condition:'',...extra});
const accept=(rows,s)=>applyScopedVerdicts({verdicts:rows.map(c=>({id:c.id,verdict:'SUPPORTED',reasonCode:'DIRECT_SUPPORT',explanation:'The fixture source explicitly supports this assertion in its stated scope.',evidenceQuote:c.quote}))},rows,s);

test('observed recurring celebration pages are queued as research topics; dated events and privacy are not admitted',()=>{
 const page={url:'https://example.org/',contentType:'text/html',body:'<a href="/feiere-mit-uns">Feiern</a><a href="/anlässe">Anlässe</a><a href="/eventlocation">Eventlocation</a><a href="/events/2027-01-20">Konzert 20.01.2027</a><a href="/datenschutz">Datenschutz</a>'};
 const links=discoverResearchLinks(page,{spotProfile:true});
 for(const path of ['/feiere-mit-uns','/anl%C3%A4sse','/eventlocation'])assert.ok(links.some(l=>new URL(l.url).pathname===path&&l.topics.includes('experience')));
 assert.ok(!links.some(l=>l.url.includes('2027-01-20')||l.url.includes('datenschutz')));
});
test('meal proposal lane finds a real dinner paragraph rather than reusing a lunch citation',()=>{
 const s=source('Wir servieren Mittagessen.\n\nBunte Teller am Abend. Ideal für ein ausgiebiges Dinner.');
 const blocks=s.text.split('\n\n').map((text,i)=>({id:'b'+i,text}));
 const rows=literalLinkedDiningServices(s,fields,blocks,0);const dinner=rows.find(c=>c.entityKind==='DINNER');assert.ok(dinner);assert.equal(dinner.blockId,'b1');assert.equal(dinner.reason,'SEMANTIC_CHECK_PENDING');
 for(const text of ['Wir servieren kein Dinner.','Unser Dinner-Rezept für zu Hause.','Dinner im Hotelpaket inklusive Übernachtung.'])assert.ok(!literalLinkedDiningServices(source(text),fields,[{id:'b0',text}],0).some(c=>c.entityKind==='DINNER'));
});
test('venue itself cannot silently become a separate indoor area, even in replayed old accepted data',()=>{
 const s=source('Die ganze Fixture Bistro steht für deinen Anlass zur Verfügung.');
 const rows=parseScopedCandidates({candidates:[candidate('AREA','INDOOR',spot.name,'b0')]},s,fields,[{id:'b0',text:s.text}],0,8,spot.name);
 assert.equal(rows[0].reason,'WHOLE_VENUE_IS_NOT_A_SEPARATE_AREA');rows[0].state='ACCEPTED';
 assert.equal(projectScopedResearch(spot,fields,rows,[s],validateAuthoringSubmission)[0].status,'UNRESOLVED');
});
test('condition choices contain actual restriction clauses, never diet labels or descriptive source paragraphs',()=>{
 const choices=sourceRestrictionChoices([{text:'VEGI\nVEGAN\nWir bieten täglich ein Mittagsmenü.\nNur auf Vorbestellung servieren wir das Menü.\nDer Saal bietet 80 Plätze für Veranstaltungen.'}]);
 assert.ok(choices.includes(''));assert.ok(choices.includes('Nur auf Vorbestellung servieren wir das Menü.'));assert.ok(choices.includes('Veranstaltungen'));
 assert.ok(!choices.includes('VEGI'));assert.ok(!choices.includes('VEGAN'));assert.ok(!choices.includes('Wir bieten täglich ein Mittagsmenü.'));
});
test('restaurant with bar place type receives sourced opening starts, explicit midnight derivation and complete kitchen inheritance',()=>{
 const s=source('Fixture Bistro\nBar\nÖffnungszeiten\nMontag - Samstag\nab 11 Uhr\nSonntag geschlossen');
 const hours={attributeKey:'hours.regular',status:'REQUIRES_REVIEW',value:[{day:'SUNDAY',intervals:[]}],partialHours:true,citations:[{url:s.url,evidence:'Sonntag geschlossen',observedAt:s.observedAt,sourceHash:s.hash}]};
 const kitchen={attributeKey:'hours.kitchen',status:'UNRESOLVED',reason:'NO_SUPPORTED_TARGET_FACT'};
 applyResearchHoursPolicy([hours,kitchen,{attributeKey:'classification.place_types',value:['RESTAURANT','BAR']}],[s],spot,[...fields,field('hours.regular'),field('hours.kitchen')],validateAuthoringSubmission);
 assert.equal(hours.value.length,7);assert.equal(hours.partialHours,false);assert.deepEqual(hours.value.find(r=>r.day==='MONDAY').intervals,[{start:'11:00',end:'00:00'}]);
 assert.ok(hours.derivation.rules.includes('BAR_MISSING_CLOSING_DEFAULT_MIDNIGHT'));assert.ok(hours.citations.every(c=>!c.evidence.includes('00:00')));assert.deepEqual(kitchen.value,hours.value);assert.equal(kitchen.partialHours,false);
});
test('an unclosed restaurant weekday remains open information and is never invented as a closed weekday',()=>{
 const s=source('Öffnungszeiten\nMontag - Samstag\nab 11 Uhr\nSonntag geschlossen');
 const hours={attributeKey:'hours.regular',status:'REQUIRES_REVIEW',value:[{day:'SUNDAY',intervals:[]}],partialHours:true,citations:[{url:s.url,evidence:'Sonntag geschlossen',observedAt:s.observedAt,sourceHash:s.hash}]};
 applyResearchHoursPolicy([hours],[s],spot,[...fields,field('hours.regular')],validateAuthoringSubmission);
 assert.equal(hours.value.length,1);assert.equal(hours.partialHours,true);assert.ok(hours.reviewEvidence.some(c=>c.reviewReason==='OPENING_START_WITHOUT_CLOSING'&&c.evidence.includes('11')));
});
test('complementary centre and view descriptions survive; two different centre claims remain unresolved',()=>{
 const make=text=>{const s=source(text),blocks=text.split('\n\n').map((text,i)=>({id:'b'+i,text}));const rows=parseScopedCandidates({candidates:blocks.map(b=>candidate('SPOT','','',b.id,{propertyKey:'location.setting',valueJson:JSON.stringify(b.text)}))},s,fields,blocks);accept(rows,s);return {result:projectScopedResearch(spot,fields,rows,[s],validateAuthoringSubmission)[0],s,blocks};};
 const {result,s,blocks}=make('Im Herzen von Basel liegt unser Bistro.\n\nVon hier kann man den Marktplatz beobachten.');assert.equal(result.value.properties[0].value,s.text.replace('\n\n','\n'));
 const issues=parsePropertyReviewIssues({reviewIssues:[{entity:'SPOT',key:'location.setting',blockId:'b1',reasonCode:'CONFLICTING_STATEMENTS',explanation:'The fixture model incorrectly considers the central location and market view incompatible.'}]},[],s,blocks);assert.equal(issues[0].reviewReason,'COMPLEMENTARY_STATEMENTS');
 assert.equal(make('Im Herzen von Basel liegt unser Bistro.\n\nIm Herzen von Zürich liegt unser Bistro.').result.status,'UNRESOLVED');
});
test('a conflict review needs an actual second evidence block, not an absence-of-evidence claim',()=>{
 const s=source('Zugang über den Seiteneingang.');
 const issues=parsePropertyReviewIssues({reviewIssues:[{entity:'SPOT',key:'participation.accessibility',blockId:'b0',reasonCode:'CONFLICTING_STATEMENTS',explanation:'No explicit statement of step-free access is present in this sentence.'}]},[],s,[{id:'b0',text:s.text}]);assert.equal(issues[0].reviewReason,'INSUFFICIENT_CONTEXT');
});
test('a whole rendered OCR row can bind an item price, but one-engine guesses cannot',()=>{
 const row={text:'GEMÜSETELLER 19.50',confidence:0.99,x:0.1,y:0.5,width:0.7,height:0.02};
 assert.equal(agreeingPricedRows([row],'GEMÜSETELLER 19.50')[0].price,'19.50');assert.deepEqual(agreeingPricedRows([row],'GEMÜSETELLER 29.50'),[]);
});
test('PDF rendering feeds the existing independent OCR lane with page and document provenance',async()=>{
 const page={url:'https://example.org/menu.pdf',contentType:'application/pdf',observedAt:'2026-10-25T12:00:00Z',body:Buffer.from('%PDF-fixture')};
 const runCommand=async(command,args)=>{
  if(command==='pdfinfo')return 'Pages: 2\n';
  if(command==='pdftoppm'){const prefix=args.at(-1);await writeFile(prefix+'-1.png','rendered-page-1');await writeFile(prefix+'-2.png','rendered-page-2');return '';}
  if(command==='swift')return args.slice(1).map(path=>JSON.stringify({path,lines:[{text:'GEMÜSETELLER 19.50',confidence:0.99,x:0.1,y:0.5,width:0.7,height:0.02}]})).join('\n');
  if(command==='tesseract')return 'GEMÜSETELLER 19.50';throw Error('Unexpected tool');
 };
 const audit=await auditMenuPdf(page,{runCommand});assert.equal(audit.layoutCheckComplete,true);assert.equal(audit.layoutPagesInspected,2);assert.equal(audit.candidateRows,2);assert.equal(audit.catalogWrites,0);assert.equal(audit.certifiedComplete,false);
 assert.ok(audit.images.every(image=>image.documentAssetHash===audit.documentAssetHash&&image.pageNumber&&image.assetHash&&image.url.includes('#page=')));
 await assert.rejects(auditMenuPdf({...page,body:Buffer.from('not a PDF')},{runCommand}),/menu_pdf_invalid/);
});

test('private occasion recovery selects the actual hosting paragraph, never a public dated event',()=>{
 const text='Ob Hochzeit oder Geburtstag: Wir bieten den passenden Rahmen für deine private Feier.';
 const rows=literalLinkedDiningServices(source(text),fields,[{id:'b0',text}],0);assert.ok(rows.some(c=>c.entityKind==='PRIVATE_CELEBRATION'&&c.quote===text&&c.reason==='SEMANTIC_CHECK_PENDING'));
 for(const text of ['Wir bieten keine private Feier an.','Deine Hochzeit feiern wir am 12.12.2027.'])assert.ok(!literalLinkedDiningServices(source(text),fields,[{id:'b0',text}],0).some(c=>c.entityKind==='PRIVATE_CELEBRATION'));
});

test('PDF price review quarantines producer and serving ambiguities without turning drinks into dishes',()=>{
 const audits=[{format:'PDF_PAGE_OCR',officialMenuUrl:'https://example.org/menu.pdf',observedAt:'2026-10-25T12:00:00Z',images:[{url:'https://example.org/menu.pdf#page=1',assetHash:'rendered-asset',documentAssetHash:'pdf-asset',pricedRows:[{name:'Kaffee',price:'4.40'},{name:'Weingut Fixture',price:'8.80'},{name:'Panache 4.8% 5.80 /',price:'8.80'}]}]}];
 const rows=pdfMenuReviewEvidence(audits);assert.equal(rows.length,3);assert.equal(rows[0].reviewReason,'MENU_ITEM_PRICE_LAYOUT_CHECKED');assert.equal(rows[1].reviewReason,'MENU_PRICE_CONTEXT_REQUIRES_REVIEW');assert.equal(rows[2].reviewReason,'MENU_PRICE_CONTEXT_REQUIRES_REVIEW');assert.ok(rows.every(row=>!row.propertyKey&&!row.scope&&row.layoutReviewRequired));
});

test('old accepted birthday and company-party nodes merge into the existing private celebration without losing scoped properties',()=>{
 const s=source('Wir bieten private Feiern, Hochzeiten, Geburtstage und Firmenfeiern mit einem Menü an.');
 const rows=parseScopedCandidates({candidates:['Private Feier','Geburtstag','Firmenfeier'].map(name=>candidate('OFFER','PRIVATE_CELEBRATION',name,'b0'))},s,fields,[{id:'b0',text:s.text}]);
 accept(rows,s);
 // Emulate old ledger labels, retaining the old independently checked source.
 rows[1].entityName='Geburtstag';rows[2].entityName='Firmenfeier';
 const result=projectScopedResearch(spot,fields,rows,[s],validateAuthoringSubmission)[0];assert.equal(result.value.offers.length,1);assert.equal(result.value.offers[0].name,'Private Feier');assert.equal(result.citations.length,3);
});
