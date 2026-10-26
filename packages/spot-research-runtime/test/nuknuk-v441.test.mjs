import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {discoverResearchLinks} from '../src/nuknuk-sources.mjs';
import {parseScopedCandidates,parseFlatFieldFacts,applyScopedVerdicts,researchFieldAnswered} from '../dist/nuknuk-spot-plan.js';
import {restaurantCriticClaim,createRestaurantResearchContext} from '../dist/nuknuk-research-context.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
const field=attributeKey=>({attributeKey,...researchValueContract(attributeKey),profileCategory:'EAT'});
test('observed singular/plural service overviews and reservation information survive discovery',()=>{
 const paths=['/angebot','/angebote','/offer','/offers','/reservation','/de/reservierungen.html'];
 const links=discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:paths.map(p=>`<a href="${p}">${p}</a>`).join('')},{spotProfile:true});
 for(const path of paths)assert.ok(links.some(l=>l.url==='https://example.org'+path&&l.topics.length),path);
});
test('information exception never admits transaction queries, external booking or forbidden documents',()=>{
 const paths=['/reservation?date=2026-11-01','/reservation/checkout','/checkout/reservation','https://booking.example.net/reservation','/privacy-policy','/datenschutz','/terms','/special-offers'];
 const links=discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:paths.map(p=>`<a href="${p}">Reservierung</a>`).join('')},{spotProfile:true});
 for(const path of paths.filter(p=>p!=='/terms'))assert.ok(!links.some(l=>l.url===new URL(path,'https://example.org/').href&&l.topics.length),path);
});
test('a supported proximity hint cannot close address research or defeat a later literal street address',()=>{
 const f=field('location.address_line1'),text='Unser Restaurant beim Brausebad Basel. Kontakt: Spalenring 118, 4055 Basel.';
 const source={id:'s1',url:'https://example.org/kontakt',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-26T12:00:00Z'};
 const parse=value=>parseFlatFieldFacts({facts:[{field:f.attributeKey,value,blockId:'b0',belongsTo:'TARGET',condition:''}]},source,[f],[{id:'b0',text}],0)[0];
 const bad=parse('beim Brausebad Basel');assert.equal(bad.reason,'ADDRESS_STREET_DETAIL_REQUIRES_REVIEW');
 applyScopedVerdicts({verdicts:[{id:bad.id,verdict:'SUPPORTED',reasonCode:'DIRECT_SUPPORT',explanation:'A location is named.',evidenceQuote:text}]},[bad],source);assert.notEqual(bad.state,'ACCEPTED');
 assert.equal(researchFieldAnswered(f,{status:'REQUIRES_REVIEW',value:'beim Brausebad Basel'}),false);
 assert.equal(researchFieldAnswered(f,{status:'REQUIRES_REVIEW',value:'4055 Basel'}),false);
 const good=parse('Spalenring 118');assert.equal(good.reason,'SEMANTIC_CHECK_PENDING');
 assert.equal(researchFieldAnswered(f,{status:'REQUIRES_REVIEW',value:'Spalenring 118'}),true);
});
test('restaurant critic receives the meaning of category codes as vocabulary rather than venue evidence',()=>{
 const context=createRestaurantResearchContext({name:'Test Restaurant',spotId:'11111111-1111-4111-8111-111111111111'},[field('classification.primary_category')]);assert.match(context.system,/never the EAT.ch delivery platform/);
});

test('discarded observed links retain a policy reason instead of silently vanishing',()=>{
 const excluded=[];discoverResearchLinks({url:'https://example.org/',contentType:'text/html',body:'<a href="/special-offers">Aktionen</a><a href="/reservation/checkout">Buchen</a>'},{spotProfile:true,onExcluded:entry=>excluded.push(entry)});
 assert.ok(excluded.some(e=>e.url.endsWith('/special-offers')&&e.reason==='CAMPAIGN_OR_TIME_BOUND_OFFER_PAGE'));assert.ok(excluded.some(e=>e.url.endsWith('/reservation/checkout')&&e.reason==='TRANSACTION_ACCOUNT_OR_SOURCE_BOUNDARY'));
});

test('house-specialities containing a real main dish reach semantic review without a dish-name allowlist',()=>{
 const text='Unsere Hausspezialitäten - auch Take away\n\nAdana Kebap Spiess aus Rindsfleisch vom Holzkohlegrill';
 const source={id:'s1',url:'https://example.org/angebot',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-26T12:00:00Z'};
 for(const [kind,name] of [['LUNCH','Mittagessen'],['DINNER','Abendessen']]){
  const input={field:'experience.profile',scope:'OFFER',entityKind:kind,entityName:name,propertyKey:'',valueJson:'null',blockId:'b0',belongsTo:'TARGET',applicability:'CURRENT',condition:''};
  const [c]=parseScopedCandidates({candidates:[input]},source,[field('experience.profile')],[{id:'b0',text}],0);assert.equal(c.reason,'SEMANTIC_CHECK_PENDING');assert.equal(c.state,'HELD');
  applyScopedVerdicts({verdicts:[{id:c.id,verdict:'UNSUPPORTED',reasonCode:'NOT_ENTAILED',explanation:'This fixture models a semantic rejection.',evidenceQuote:text}]},[c],source);assert.equal(c.state,'REJECTED');
 }
});
test('dining section admission retains negation and explicit meal daypart exclusions',()=>{
 for(const text of ['Keine Hausspezialitäten oder warmen Speisen bei uns erhältlich.','Nur Mittagessen: Unsere Hausspezialitäten vom Holzkohlegrill sind mittags erhältlich.']){
  const source={id:'s1',url:'https://example.org/angebot',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-26T12:00:00Z'};
  const input={field:'experience.profile',scope:'OFFER',entityKind:'DINNER',entityName:'Abendessen',propertyKey:'',valueJson:'null',blockId:'b0',belongsTo:'TARGET',applicability:'CURRENT',condition:''};
  const [c]=parseScopedCandidates({candidates:[input]},source,[field('experience.profile')],[{id:'b0',text}],0);assert.notEqual(c.reason,'SEMANTIC_CHECK_PENDING');
 }
});

test('independent critic verifies ordinary food service while software retains canonical meal mapping',()=>{
 const text='Unsere Hausspezialitäten - auch Take away\nAdana Kebap vom Holzkohlegrill mit Beilagen';
 const source={id:'s1',url:'https://example.org/angebot',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-26T12:00:00Z'};
 const raw={field:'experience.profile',scope:'OFFER',entityKind:'LUNCH',entityName:'Mittagessen',propertyKey:'',valueJson:'null',blockId:'b0',belongsTo:'TARGET',applicability:'CURRENT',condition:''};
 const [c]=parseScopedCandidates({candidates:[raw]},source,[field('experience.profile')],[{id:'b0',text}],0);
 assert.deepEqual(c.serviceEvidenceMapping,{rule:'ORDINARY_MAIN_MEAL_TO_CATALOG',canonicalKind:'LUNCH'});
 const claim=restaurantCriticClaim(c);assert.equal(claim.claimType,'MAIN_MEAL_DINING_EXISTS');assert.equal(claim.entityKind,undefined);assert.equal(claim.entityName,undefined);
 assert.equal(c.entityKind,'LUNCH');assert.equal(c.state,'HELD');
 applyScopedVerdicts({verdicts:[{id:c.id,verdict:'SUPPORTED',reasonCode:'DIRECT_SUPPORT',explanation:'The menu offers prepared main meals to restaurant guests.',evidenceQuote:text}]},[c],source);assert.equal(c.state,'ACCEPTED');
});
