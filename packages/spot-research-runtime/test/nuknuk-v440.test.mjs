import test from 'node:test';
import assert from 'node:assert/strict';
import {parseScopedCandidates,applyScopedVerdicts,parseFlatFieldFacts,researchFieldAnswered,keyedFlatFieldSchema,spotResearchQuestions} from '../dist/nuknuk-spot-plan.js';
import {restaurantCriticEvidence} from '../dist/nuknuk-research-context.js';
import {createHash} from 'node:crypto';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
const field=attributeKey=>({attributeKey,...researchValueContract(attributeKey),profileCategory:'EAT'});
test('flat conditions are constrained to actual source restrictions, never reasoning prose',()=>{
 const schema=keyedFlatFieldSchema([field('rule.reservation')],[{id:'a',text:'Reservation empfohlen.'},{id:'b',text:'Nur auf Anfrage.'}]);const value=schema.properties.facts.properties['rule.reservation'].anyOf[1];
 assert.ok(value.properties.condition.enum.includes(''));assert.ok(value.properties.condition.enum.includes('Nur auf Anfrage.'));assert.ok(!value.properties.condition.enum.includes('This button implies a recommendation.'));
});
test('one answered-field rule is used by the restaurant planning view',()=>{
 const f=field('hours.regular'),value=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(day=>({day,intervals:[]}));
 const complete={attributeKey:f.attributeKey,status:'REQUIRES_REVIEW',value,partialHours:false};assert.equal(researchFieldAnswered(f,complete),true);assert.deepEqual(spotResearchQuestions([f],[complete]).unresolvedFields,[]);
 for(const result of [{...complete,partialHours:true},{...complete,value:value.slice(0,5)},{...complete,status:'UNRESOLVED',reason:'CONFLICTING_TARGET_VALUES'},{...complete,value:undefined}])assert.equal(researchFieldAnswered(f,result),false);
 assert.equal(researchFieldAnswered(field('experience.profile'),{status:'REQUIRES_REVIEW',value:{}}),false);assert.equal(researchFieldAnswered(field('contact.phone'),{status:'REQUIRES_REVIEW',value:'+41610000000'}),true);
});
const candidate=(id,field,propertyKey,quote,value=quote)=>({id,field,propertyKey,quote,valueJson:JSON.stringify(value),scope:'OFFER',entityKind:'DINNER',entityName:'Abendessen',condition:'',applicability:'CURRENT',belongsTo:'TARGET'});
test('shared literal evidence is transmitted once without erasing independent claims or values',()=>{
 const quote='Wir servieren vegetarische Gerichte aus saisonalen Zutaten.';
 const rows=[candidate('a','experience.profile','food.diet',quote),candidate('b','experience.profile','food.cuisine',quote),candidate('c','experience.profile','food.dish',quote,'Pasta')];
 const bundle=restaurantCriticEvidence(rows,()=>['Restaurant']);assert.equal(bundle.evidence.length,1);assert.deepEqual(bundle.evidence[0].candidateIds,['a','b','c']);assert.equal(bundle.claims.length,3);assert.deepEqual(bundle.claims[0].value,{transcriptionOf:'e0'});assert.equal(bundle.claims[2].value,'Pasta');assert.equal(bundle.evidence[0].text,quote);assert.equal(rows[0].valueJson,JSON.stringify(quote));
});
test('different heading scopes cannot share an evidence identity even with identical prose',()=>{
 const rows=[candidate('a','experience.profile','food.diet','Vegetarische Gerichte.'),candidate('b','experience.profile','food.diet','Vegetarische Gerichte.')];const bundle=restaurantCriticEvidence(rows,c=>[c.id==='a'?'Restaurant':'Privater Raum']);assert.equal(bundle.evidence.length,2);assert.notEqual(bundle.claims[0].evidenceId,bundle.claims[1].evidenceId);
});

test('a generic restaurant reservation action cannot acquire invented opening weekdays or thresholds',()=>{
 const text='Restaurant Example\nReservation',source={id:'s1',url:'https://example.org/',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-26T08:00:00Z'};
 const row=parseFlatFieldFacts({facts:[{field:'rule.reservation',value:{mode:'RECOMMENDED',minimumPartySize:6,days:['FRIDAY'],fromTime:'18:00',toTime:'22:00'},blockId:'b0',belongsTo:'TARGET',condition:''}]},source,[field('rule.reservation')],[{id:'b0',text:'Reservation'}],0)[0];
 assert.deepEqual(JSON.parse(row.valueJson),{mode:'RECOMMENDED',minimumPartySize:null,days:[],fromTime:null,toTime:null});assert.equal(row.reason,'SEMANTIC_CHECK_PENDING');assert.equal(row.valueNormalization.rule,'RESERVATION_ACTION_SUPPORTS_RECOMMENDATION_ONLY');
});

test('a PDF linked by two pages keeps its queued original parent and reaches layout inspection',async()=>{
 const {researchSpotV2}=await import('../dist/nuknuk-agent.js');
 const {validateAuthoringSubmission}=await import('../../world-knowledge-core/dist/index.js');
 const events=[],seed='https://example.org/';
 const report=await researchSpotV2({spot:{spotId:'11111111-1111-4111-8111-111111111111',name:'Example Restaurant',existingValues:{'contact.website':{value:seed}}},fields:[field('contact.phone'),field('experience.profile')],sources:[seed],modelPath:'/tmp/45797d2985a12c55e6473686e9ea91b95e959553',restaurantWorkingContext:true,maxRequests:3,maxModelCalls:12,discoverLinks:true,inspectMenuImages:true},{
 validateValue:validateAuthoringSubmission,
 fetchPage:async url=>url.endsWith('/menu.pdf')?{url,contentType:'application/pdf',body:Buffer.from('%PDF-invalid-test'),observedAt:'2026-10-26T08:00:00Z'}:{url,contentType:'text/html',body:'<main><h1>Example Restaurant</h1><p>Wir servieren Mittagessen.</p><a href="/kontakt">Kontakt</a><a href="/menu.pdf">Speisekarte</a></main>',observedAt:'2026-10-26T08:00:00Z'},
 readPage:async(page,id)=>{const text=page.contentType==='application/pdf'?'Speisekarte':'Example Restaurant\nWir servieren Mittagessen.';return {id,url:page.url,text,hash:createHash('sha256').update(text).digest('hex'),observedAt:page.observedAt,...(page.contentType==='application/pdf'?{format:'PDF_TEXT',layoutReviewRequired:true}:{})};},
 modelFetch:async(_url,init)=>{const d=JSON.parse(JSON.parse(init.body).messages[1].content),value=d.phase==='ENTITIES'?{candidates:[]}:d.phase==='PROPERTIES'?{facts:[],reviewIssues:[]}:d.candidates||d.claims?{verdicts:[]}:{facts:[]};return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));},onProgress:e=>events.push(e)});
 assert.ok(report.sources.some(s=>s.url===seed+'kontakt'));assert.equal(report.sources.find(s=>s.format==='PDF_TEXT').discoveredOn,seed);assert.ok(events.some(e=>e.stage==='PDF_LAYOUT_STARTED'));assert.ok(events.some(e=>e.stage==='PDF_LAYOUT_ERROR'));assert.equal(report.canonicalWrite,false);
});

test('a dinner-menu diet statement cannot become a lunch property even after a supporting model verdict',()=>{
 const text='Von Dienstag bis Samstag ab 18:30 Uhr servieren wir ein Menü in vier Gängen, wahlweise vegetarisch.',s={id:'s1',url:'https://example.org/',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-26T08:00:00Z'};
 const raw={field:'experience.profile',scope:'OFFER',entityKind:'LUNCH',entityName:'Mittagessen',propertyKey:'food.diet',valueJson:JSON.stringify(text),blockId:'b0',belongsTo:'TARGET',applicability:'CURRENT',condition:''};
 const c=parseScopedCandidates({candidates:[raw]},s,[field('experience.profile')],[{id:'b0',text}],0)[0];assert.equal(c.reason,'PROPERTY_MEAL_DAYPART_REQUIRES_REVIEW');
 applyScopedVerdicts({verdicts:[{id:c.id,verdict:'SUPPORTED',reasonCode:'DIRECT_SUPPORT',explanation:'The quote explicitly mentions a vegetarian menu.',evidenceQuote:text}]},[c],s);assert.equal(c.state,'HELD');
 const dinner=parseScopedCandidates({candidates:[{...raw,entityKind:'DINNER',entityName:'Abendessen'}]},s,[field('experience.profile')],[{id:'b0',text}],0)[0];assert.equal(dinner.reason,'SEMANTIC_CHECK_PENDING');
});
test('general sourced menu properties remain eligible for both independently established meal services',()=>{
 const text='Wir servieren vegetarische Gerichte und Pizza aus saisonalen Zutaten.',s={id:'s1',url:'https://example.org/',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-26T08:00:00Z'};
 for(const [kind,name] of [['LUNCH','Mittagessen'],['DINNER','Abendessen']]){const raw={field:'experience.profile',scope:'OFFER',entityKind:kind,entityName:name,propertyKey:'food.diet',valueJson:JSON.stringify(text),blockId:'b0',belongsTo:'TARGET',applicability:'CURRENT',condition:''};assert.equal(parseScopedCandidates({candidates:[raw]},s,[field('experience.profile')],[{id:'b0',text}],0)[0].reason,'SEMANTIC_CHECK_PENDING');}
});
