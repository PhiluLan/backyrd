import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publishedVenueName,parseFlatFieldFacts,parseScopedCandidates,parseScopedPropertyFacts,applyScopedVerdicts,projectScopedResearch} from '../dist/nuknuk-spot-plan.js';
import {sourceText} from '../src/nuknuk-sources.mjs';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
const source=(text,extra={})=>({id:'s1',url:'https://example.org/menu',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-25T18:00:00Z',...extra});
const field=attributeKey=>({attributeKey,...researchValueContract(attributeKey),profileCategory:'EAT'}),fields=[field('experience.profile')];
const spot={name:'Example Central',existingValues:{'classification.primary_category':{value:'EAT'}}};
const entity=(kind,name,blockId)=>({field:'experience.profile',scope:'OFFER',entityKind:kind,entityName:name,propertyKey:'',valueJson:'null',blockId,belongsTo:'TARGET',applicability:'CURRENT',condition:''});
function accept(rows,s){applyScopedVerdicts({verdicts:rows.map(c=>({id:c.id,verdict:'SUPPORTED',reasonCode:'DIRECT_SUPPORT',explanation:'The original menu supports this service and row association.',evidenceQuote:c.quote}))},rows,s);}
for(const text of ['Ganze Pizza – 1 Belagvariante','Menü Stück','Unsere Speisekarte','Wir servieren warme Speisen.'])test('ordinary sourced meal permits both catalog dayparts without inventing a schedule: '+text,()=>{
 const s=source(text),blocks=[{id:'b0',text,offset:0}];const rows=parseScopedCandidates({candidates:[entity('LUNCH','Mittagessen','b0'),entity('DINNER','Abendessen','b0')]},s,fields,blocks);
 assert.ok(rows.every(c=>c.reason==='SEMANTIC_CHECK_PENDING'));accept(rows,s);
 const result=projectScopedResearch(spot,fields,rows,[s],validateAuthoringSubmission)[0];assert.equal(result.value.offers.length,2);assert.ok(result.value.offers.every(o=>o.schedule.length===0));
});
for(const text of ['Reservieren','Kein Mittagessen und kein Abendessen.','Pizza Rezept','Unsere Hotelpauschale beinhaltet eine Übernachtung und ein Menü.'])test('meal normalization does not certify action, negative, recipe or hotel-package evidence: '+text,()=>{
 const s=source(text);const rows=parseScopedCandidates({candidates:[entity('LUNCH','Mittagessen','b0'),entity('DINNER','Abendessen','b0')]},s,fields,[{id:'b0',text}]);assert.ok(rows.every(c=>c.reason!=='SEMANTIC_CHECK_PENDING'));
});
test('explicit lunch-only heading cannot establish dinner',()=>{
 const text='Mittagskarte\n\nGanze Pizza – 1 Belagvariante';const s=source(text,{headings:[{level:2,text:'Mittagskarte',offset:0}]});
 const rows=parseScopedCandidates({candidates:[entity('DINNER','Abendessen','b0')]},s,fields,[{id:'b0',text:'Ganze Pizza – 1 Belagvariante',offset:text.indexOf('Ganze')}]);assert.equal(rows[0].reason,'MEAL_SERVICE_CONTEXT_REQUIRED');
});
test('established canonical service accepts literal menu rows for semantic checking and merges positive inventory with all citations',()=>{
 const text='DRINKS\n\nHugo alkoholfrei 9,5\n\nProsecco 1dl 8,5';const s=source(text);const blocks=text.split('\n\n').map((text,i)=>({id:'b'+i,text,offset:s.text.indexOf(text)}));
 const nodes=parseScopedCandidates({candidates:[entity('DRINKS','Getränke','b0')]},s,fields,blocks);accept(nodes,s);
 const raw={facts:['b1','b2'].map(blockId=>({entity:nodes[0].id,key:'food.drink',value:'SOURCE_BLOCK',blockId,condition:''}))};
 const rows=parseScopedPropertyFacts(raw,nodes,s,fields,blocks,1);assert.ok(rows.every(c=>c.reason==='SEMANTIC_CHECK_PENDING'));accept(rows,s);
 const result=projectScopedResearch(spot,fields,[...nodes,...rows],[s],validateAuthoringSubmission)[0];
 assert.equal(result.value.offers[0].properties[0].value,'Hugo alkoholfrei 9,5\nProsecco 1dl 8,5');assert.equal(result.value.offers[0].prices.length,0);assert.equal(result.citations.length,3);assert.ok(!result.reviewEvidence?.length);
 const absent=projectScopedResearch(spot,fields,rows,[s],validateAuthoringSubmission)[0];assert.ok(!absent.value?.offers.length);
});
test('a semantic rejection still prevents a menu row from entering the profile',()=>{
 const s=source('DRINKS\n\nAndere Filiale: Hugo 12');const blocks=[{id:'b0',text:'DRINKS'},{id:'b1',text:'Andere Filiale: Hugo 12'}];const nodes=parseScopedCandidates({candidates:[entity('DRINKS','Getränke','b0')]},s,fields,blocks);accept(nodes,s);
 const rows=parseScopedPropertyFacts({facts:[{entity:nodes[0].id,key:'food.drink',value:'SOURCE_BLOCK',blockId:'b1',condition:''}]},nodes,s,fields,blocks,1);
 applyScopedVerdicts({verdicts:[{id:rows[0].id,verdict:'UNSUPPORTED',reasonCode:'WRONG_VENUE',explanation:'This row explicitly belongs to another branch.',evidenceQuote:rows[0].quote}]},rows,s);
 const result=projectScopedResearch(spot,fields,[...nodes,...rows],[s],validateAuthoringSubmission)[0];assert.equal(result.value.offers[0].properties.length,0);
});
test('menu collection preserves contradictory negative statements for review',()=>{
 const text='DRINKS\n\nWir servieren Wein.\n\nWir servieren keinen Wein.';const s=source(text);const blocks=text.split('\n\n').map((text,i)=>({id:'b'+i,text}));const nodes=parseScopedCandidates({candidates:[entity('DRINKS','Getränke','b0')]},s,fields,blocks);accept(nodes,s);
 const rows=parseScopedPropertyFacts({facts:['b1','b2'].map(blockId=>({entity:nodes[0].id,key:'food.drink',value:'SOURCE_BLOCK',blockId,condition:''}))},nodes,s,fields,blocks,1);accept(rows,s);
 const result=projectScopedResearch(spot,fields,[...nodes,...rows],[s],validateAuthoringSubmission)[0];assert.equal(result.value.offers[0].properties.length,0);assert.ok(result.reviewEvidence.some(c=>c.reviewReason==='PROPERTY_VALUES_REQUIRE_REVIEW'));
});
test('published name removes repeated brand and clear SEO decoration while retaining an exact substring',()=>{
 for(const [input,expected] of [['VITO – VITO Gundeli | Pizzeria','VITO Gundeli'],['EXAMPLE — EXAMPLE Central | Restaurant','EXAMPLE Central'],['Haus | Hof','Haus | Hof'],['Restaurant Central','Restaurant Central'],['Hotel Stadt – Garten','Hotel Stadt – Garten']]){const value=publishedVenueName(input);assert.equal(value,expected);assert.ok(input.includes(value));}
 const p={url:'https://example.org/',observedAt:'2026-10-25T18:00:00Z',contentType:'text/html',body:'<title>EXAMPLE – EXAMPLE Central | Restaurant</title><main><h1>Central</h1></main>'};const s=sourceText(p,'s1',{preferMain:true});const title=s.publishedTitle;
 const rows=parseFlatFieldFacts({facts:[{field:'identity.name',value:title,blockId:'title',belongsTo:'TARGET',condition:''}]},s,[field('identity.name')],[{id:'title',text:title}],0);assert.equal(JSON.parse(rows[0].valueJson),'EXAMPLE Central');assert.equal(rows[0].reason,'SEMANTIC_CHECK_PENDING');assert.equal(rows[0].quote,title);
});
