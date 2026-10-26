import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {localGenerationSchema,sourceAssertionReviewReason,parseScopedCandidates,parseFlatFieldFacts,applyScopedVerdicts,projectScopedResearch,spotResearchQuestions,applyPublishedKitchenConflicts,keyedFlatFieldSchema,expandKeyedFlatFields} from '../dist/nuknuk-spot-plan.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
const field=attributeKey=>({attributeKey,...researchValueContract(attributeKey),profileCategory:'EAT'});
const profileFields=[field('experience.profile')];
function source(text,sections=[],id='s1') {return {id,url:'https://example.org/'+(id==='s1'?'':id),text,headings:sections.map(([level,title])=>({level,text:title,offset:text.indexOf(title)})),hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-26T08:00:00Z'};}
const entity=(kind,name,blockId='b0')=>({field:'experience.profile',scope:'OFFER',entityKind:kind,entityName:name,propertyKey:'',valueJson:'null',blockId,belongsTo:'TARGET',applicability:'CURRENT',condition:''});
const read=(c,s,blocks=[{id:'b0',text:s.text}])=>parseScopedCandidates({candidates:[c]},s,profileFields,blocks)[0];
test('embedded opinions remain review-only even if a model calls the quoted claim supported',()=>{
 const text='Example\nDAS ERZÄHLT IHR ÜBER UNS\nDie Ente war ausgezeichnet.\nLena, Tripadvisor\nKontakt\nWir servieren täglich frische Pasta.';
 const s=source(text,[[1,'Example'],[2,'DAS ERZÄHLT IHR ÜBER UNS'],[2,'Kontakt']]);
 const quote='Die Ente war ausgezeichnet.';
 const c=read({...entity('DINNER','Abendessen'),propertyKey:'food.dish',valueJson:JSON.stringify(quote)},s,[{id:'b0',text:quote,offset:text.indexOf(quote)}]);
 assert.equal(c.reason,'ATTRIBUTED_CONTENT_NOT_OPERATOR_FACT');
 applyScopedVerdicts({verdicts:[{id:c.id,verdict:'SUPPORTED',reasonCode:'DIRECT_SUPPORT',explanation:'The original excerpt contains the dish.',evidenceQuote:quote}]},[c],s);
 assert.equal(c.state,'HELD');assert.equal(sourceAssertionReviewReason(s,'Wir servieren täglich frische Pasta.'),null);
});
for(const attribution of ['Mia, via Google','Jonas, Tripadvisor','Eva, via Facebook'])test('plain-text attribution is not operator knowledge: '+attribution,()=>{
 const quote='Eine tolle Auswahl an Bier.';assert.equal(sourceAssertionReviewReason(source(quote+'\n\n'+attribution+'\n'),quote),'ATTRIBUTED_CONTENT_NOT_OPERATOR_FACT');
});
test('an embedded date cannot become permanent music; later regular offers are unaffected',()=>{
 const text='Aktuell\nLive Musik\nDatum & Uhrzeit: 17.12.2026 · 19:00 Uhr\nUnsere Band spielt live an der Bar.\nRestaurant\nWir servieren Mittagessen.';
 const s=source(text,[[1,'Aktuell'],[2,'Live Musik'],[2,'Restaurant']]);
 assert.equal(sourceAssertionReviewReason(s,'Unsere Band spielt live an der Bar.'),'DATED_EVENT_NOT_PERMANENT_SPOT_FACT');
 assert.equal(sourceAssertionReviewReason(s,'Wir servieren Mittagessen.'),null);
 const c=read({...entity('DRINKS','Getränke'),propertyKey:'atmosphere.music',valueJson:JSON.stringify('Live Musik')},s,[{id:'b0',text:'Unsere Band spielt live an der Bar.'}]);assert.equal(c.reason,'DATED_EVENT_NOT_PERMANENT_SPOT_FACT');
});
test('historical dish wording cannot establish current inventory',()=>{
 const quote='Die Ente war Teil des früheren Menüs.';assert.equal(sourceAssertionReviewReason(source(quote),quote),'HISTORICAL_ASSERTION_NOT_CURRENT');
});
for(const label of ['Tapas','Barfood','Snacks'])test('a generic snack class maps to a service, not a menu product: '+label,()=>{
 const s=source('Wir servieren '+label+' an der Bar.');const c=read(entity('APERITIF',label),s);assert.equal(c.reason,'SEMANTIC_CHECK_PENDING');assert.equal(c.entityName,'Apéro / Snacks');assert.equal(c.quote,s.text);
});
test('a named priced snack product does not establish a new service',()=>{
 const s=source('Oliven mit Rosmarin CHF 8');assert.equal(read(entity('APERITIF','Oliven mit Rosmarin'),s).reason,'MENU_PRODUCT_NOT_VISITOR_OFFER');
});
test('bare daypart binds to actual kitchen service evidence with a trace, not to venue opening hours',()=>{
 const text='Restaurant\nMittag\nÖffnungszeiten\nDi–Fr 12–24 Uhr\nKüche: Lunch 12–13:30 Uhr | Dinner 18–21 Uhr';
 const s=source(text,[[1,'Restaurant'],[2,'Öffnungszeiten']]);const c=read(entity('LUNCH','Mittag'),s,[{id:'b0',text:'Mittag',offset:text.indexOf('Mittag')}]);
 assert.equal(c.reason,'SEMANTIC_CHECK_PENDING');assert.equal(c.entityName,'Mittagessen');assert.equal(c.evidenceBinding.originalQuote,'Mittag');assert.ok(c.quote.startsWith('Küche: Lunch'));assert.equal(s.text.slice(c.sourceOffset,c.sourceOffset+c.quote.length),c.quote);
 const noKitchen=source('Restaurant\nMittag\nDi–Fr 12–24 Uhr');assert.equal(read(entity('LUNCH','Mittag'),noKitchen,[{id:'b0',text:'Mittag'}]).reason,'MEAL_SERVICE_CONTEXT_REQUIRED');
});
test('a pre-dinner snack mention does not prove dinner',()=>{
 const s=source('Tapas sind eine kleine Begleitung vor dem Dinner.');assert.equal(read(entity('DINNER','Abendessen'),s).reason,'MEAL_SERVICE_CONTEXT_REQUIRED');
});
test('a published multi-course service normalizes while retaining its exact assertion',()=>{
 const s=source('Wir servieren unser Dinner-Menü in vier Gängen ab 18 Uhr.');const c=read(entity('DINNER','Fine Casual Dinieren'),s);assert.equal(c.entityName,'Abendessen');assert.equal(c.reason,'SEMANTIC_CHECK_PENDING');assert.equal(c.quote,s.text);
});
test('a full weekly source span normalizes midnight, proves all rows and closes the planning question',()=>{
 const text='Öffnungszeiten\nMo–Fr 12–14 Uhr | 18–24 Uhr\nSa 18–24 Uhr\nSo geschlossen\nAndere Räume\nMontag 10–11 Uhr';const s=source(text,[[2,'Öffnungszeiten'],[2,'Andere Räume']]);
 const rows=parseFlatFieldFacts({facts:[{field:'hours.regular',value:[{day:'MONDAY',intervals:[{start:'12:00',end:'23:59'}]}],blockId:'b0',belongsTo:'TARGET',condition:''}]},s,[field('hours.regular')],[{id:'b0',text:'Mo–Fr 12–14 Uhr | 18–24 Uhr'}],0);
 const c=rows[0];assert.equal(c.reason,'SEMANTIC_CHECK_PENDING');const v=JSON.parse(c.valueJson);assert.equal(v.length,7);assert.equal(v[0].intervals[1].end,'00:00');assert.ok(!c.quote.includes('Andere Räume'));assert.ok(c.valueNormalization);
 applyScopedVerdicts({verdicts:[{id:c.id,verdict:'SUPPORTED',reasonCode:'DIRECT_SUPPORT',explanation:'The weekly source explicitly supports all intervals.',evidenceQuote:c.quote}]},rows,s);
 const results=projectScopedResearch({name:'Example'},[field('hours.regular')],rows,[s],validateAuthoringSubmission);assert.equal(results[0].partialHours,false);assert.deepEqual(spotResearchQuestions([field('hours.regular')],results).unresolvedFields,[]);
});
test('conflicting same-scope kitchen windows require both sources for review, no silent first-wins',()=>{
 const src=end=>source('Öffnungszeiten\nDi–Fr 12–14 Uhr | 18–24 Uhr\nSa 18–24 Uhr\nSo & Mo geschlossen\nKüche: Lunch 12–14 Uhr | Abendessen 18–'+end+' Uhr',[[2,'Öffnungszeiten']],end==='21:15'?'s1':'s2');
 const result={attributeKey:'hours.kitchen',status:'REQUIRES_REVIEW',value:[{day:'TUESDAY',intervals:[{start:'18:00',end:'21:15'}]}]};applyPublishedKitchenConflicts([result],[src('21:15'),src('21:30')]);assert.equal(result.status,'UNRESOLVED');assert.equal(result.reason,'CONFLICTING_PUBLISHED_KITCHEN_TIMES');assert.equal(result.value,undefined);assert.equal(result.reviewEvidence.length,2);
});
test('different kitchen services and area-scoped sources are not false conflicts',()=>{
 const a=source('Öffnungszeiten\nDi–Fr 12–24 Uhr\nKüche: Lunch 12–14 Uhr | Dinner 18–21 Uhr',[[2,'Öffnungszeiten']]);const b=source(a.text.replace('18–21','18–22'),[[2,'Öffnungszeiten']],'s2');b.areaScope={name:'Terrasse'};
 const r={attributeKey:'hours.kitchen',status:'REQUIRES_REVIEW',value:[]};applyPublishedKitchenConflicts([r],[a,b]);assert.equal(r.reason,undefined);assert.deepEqual(r.value,[]);
});
test('keyed output represents one supported value or explicit abstention for each requested field',()=>{
 const fields=[field('identity.name'),field('contact.public_email')],schema=keyedFlatFieldSchema(fields,[{id:'b0'}]);assert.equal(schema.properties.facts.type,'object');
 const raw={facts:{'identity.name':{value:'Example',blockId:'b0',belongsTo:'TARGET',condition:''},'contact.public_email':null}};const parsed=expandKeyedFlatFields(raw,fields.map(f=>f.attributeKey));assert.equal(parsed.facts.length,1);assert.equal(parsed.facts[0].field,'identity.name');assert.equal(raw.facts['identity.name'].field,undefined);
 assert.throws(()=>expandKeyedFlatFields({facts:{'identity.name':null}},fields.map(f=>f.attributeKey)),/KEYED_FLAT_FIELDS_INVALID/);
 assert.throws(()=>expandKeyedFlatFields({facts:{'identity.name':null,'unrequested':null}},fields.map(f=>f.attributeKey)),/KEYED_FLAT_FIELDS_INVALID/);
});

test('an explicitly served evening multi-course menu needs no literal Dinner label',()=>{
 const s=source('Von Dienstag bis Samstag ab 18:30 Uhr servieren wir unser Menü in vier oder fünf Gängen.');const c=read(entity('DINNER','Fine Casual Dinieren'),s);assert.equal(c.entityName,'Abendessen');assert.equal(c.reason,'SEMANTIC_CHECK_PENDING');
});

test('keyed schemas use the existing local-decoder adapter before reaching MLX',()=>{
 const schema=localGenerationSchema(keyedFlatFieldSchema([field('classification.place_types')],[{id:'b0'}]));assert.ok(!JSON.stringify(schema).includes('uniqueItems'));assert.equal(schema.properties.facts.type,'object');
});
