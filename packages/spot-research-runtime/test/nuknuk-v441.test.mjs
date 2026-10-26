import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {discoverResearchLinks} from '../src/nuknuk-sources.mjs';
import {parseFlatFieldFacts,applyScopedVerdicts,researchFieldAnswered} from '../dist/nuknuk-spot-plan.js';
import {createRestaurantResearchContext} from '../dist/nuknuk-research-context.js';
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
