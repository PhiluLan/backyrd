import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDecisionEventOccurrences,eventVisitAvailability} from '../dist/product-event-candidates.js';
import {searchLibrarianCatalogWithWorlds} from '../dist/product-librarian-matching.js';
import {createLibrarianVisitWindow} from '../dist/product-librarian-time.js';
import {fact,request,authority} from './librarian-matching-fixtures.mjs';
const occurrence={eventId:'20000000-0000-4000-8000-000000000001',occurrenceId:'30000000-0000-4000-8000-000000000001',source:'manual_admin',title:'Musikabend',categories:['MUSIC'],city:'Basel',venueName:'Musikraum',address:'Teststrasse 1',matchedSpotId:null,startAt:'2026-10-15T18:00:00+02:00',endAt:'2026-10-15T22:00:00+02:00',eventStatus:'PUBLISHED',occurrenceStatus:'SCHEDULED',publishedAt:'2026-10-13T10:00:00Z',occurrencePublishedAt:'2026-10-13T10:00:00Z',updatedAt:'2026-10-13T10:00:00Z',isFree:null,priceMin:null,currency:null,minimumAge:null,familyFriendly:null,sourceUrl:'https://example.org/event',ticketUrl:null,imageUrl:null};
const views=(changes={})=>projectDecisionEventOccurrences([{...occurrence,...changes}],authority.city,authority.now);
const music=()=>fact('music','experience.activity','Musikveranstaltung');
const date=(day)=>fact('date','time.date',{operator:'EQ',date:day,timezone:'Europe/Zurich'},'REQUIRED',[]);
const run=(facts,changes={})=>searchLibrarianCatalogWithWorlds({request:request(facts),catalog:[],eventViews:views(changes),authority});
test('published occurrence is a real candidate without linked Spot or invented venue facts',()=>{
 const {result,worlds}=run([music()]); assert.equal(result.ranked.length,1); assert.match(result.ranked[0].spotId,/^event:/); assert.equal(worlds[0].facts.some(f=>f.key==='hours.regular'),false);
});
test('matching date admits the occurrence; a different date excludes it',()=>{
 assert.equal(run([music(),date('2026-10-15')]).result.ranked.length,1);
 assert.equal(run([music(),date('2026-10-16')]).result.ranked.length,0);
});
test('known minimum age cannot be talked away by family label',()=>{
 const result=run([music(),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p1'])],{minimumAge:18,familyFriendly:true}).result;
 assert.equal(result.ranked.length,0);assert.ok(result.excluded.length);
});
test('cancelled and postponed occurrences are unavailable even without a time request',()=>{
 const visit=createLibrarianVisitWindow([], 'Europe/Zurich');
 assert.equal(eventVisitAvailability({...occurrence,occurrenceStatus:'CANCELLED'},visit).state,'FAILED');
 assert.equal(eventVisitAvailability({...occurrence,eventStatus:'POSTPONED'},visit).state,'FAILED');
});
test('past occurrences do not return, including undated discovery',()=>assert.equal(projectDecisionEventOccurrences([occurrence],'Basel','2026-10-16T12:00:00Z').length,0));
test('unknown end is not an invented full night',()=>{
 const r=request([date('2026-10-15'),fact('clock','time.clock',{operator:'EQ',time:'23:00',timezone:'Europe/Zurich'},'REQUIRED',[])]);
 assert.equal(eventVisitAvailability({...occurrence,endAt:null},createLibrarianVisitWindow(r.facts,'Europe/Zurich')).state,'UNKNOWN');
});
test('one cancelled recurrence does not cancel another occurrence',()=>{
 const rows=projectDecisionEventOccurrences([occurrence,{...occurrence,occurrenceId:'30000000-0000-4000-8000-000000000002',occurrenceStatus:'CANCELLED'}],'Basel',authority.now);
 assert.equal(rows.length,2);assert.notEqual(rows[0].spot.spotId,rows[1].spot.spotId);
});
test('source, city, duplicate identities and future publication are validated',()=>{
 for(const changes of [{source:'unapproved'},{city:'Bern'},{publishedAt:'2027-01-01T00:00:00Z'}])assert.throws(()=>views(changes));
 assert.throws(()=>projectDecisionEventOccurrences([occurrence,occurrence],'Basel',authority.now));
});

test('sold out is excluded; unknown ticket availability still admits the event',()=>{
 assert.equal(run([music()],{ticketStatus:'SOLD_OUT'}).result.ranked.length,0);
 assert.equal(run([music()],{ticketStatus:'UNKNOWN'}).result.ranked.length,1);
});
test('specific genres and live format need structured evidence',()=>{
 const jazz=fact('genre','atmosphere.music','Jazz');
 const without=run([music(),jazz]).result.ranked[0];
 const withJazz=run([music(),jazz],{tags:['JAZZ']}).result.ranked[0];
 assert.ok(without);assert.ok(withJazz);
 assert.equal(without.facts.find(f=>f.factId==='genre').state,'UNKNOWN');
 assert.equal(withJazz.facts.find(f=>f.factId==='genre').state,'MET');
});
test('age, links, UUIDs and storage paths are bounded at the event boundary',()=>{
 for(const changes of [{minimumAge:18.5},{minimumAge:999},{eventId:'not-a-uuid'},{ticketUrl:'javascript:alert(1)'},{imageStoragePath:'../private/a.jpg'}]) assert.throws(()=>views(changes));
});
test('clock exclusions cannot become a confirmed visit',()=>{
 const visit={dates:['2026-10-15'],start:18*60,end:18*60+1,exact:true,requested:true,complete:true,undatedDayPhase:false,timezone:'Europe/Zurich',excludedMinutes:[18*60]};
 assert.equal(eventVisitAvailability(occurrence,visit).state,'FAILED');
});

import {exercise} from './librarian-active-route-fixtures.mjs';
import {validateDecisionProductResponse} from '../../../mobile/packages/product-decision-contract/src/index.mjs';
const eventRequest=text=>({contractVersion:'backyrd.decision-vnext.product-request@1.0',requestId:'event-test',idempotencyKey:'event-test-key',naturalLanguage:text,explicit:{targetCity:'Basel'},includeEvents:true,alternativeRequested:false,previouslyPresentedCandidateIds:[],rejectedCandidateIds:[]});
test('one HTTP chain returns an Event with separate provenance and a valid Mobile/Web contract',async()=>{
 const text='Musik in Basel';const r=await exercise({text,meaning:request([music()]),catalog:[],eventOccurrences:[occurrence],requestOverride:eventRequest(text)});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.equal(r.calls,1);assert.equal(r.reads,1);
 assert.equal(r.body.primaryCandidateId,`event:${occurrence.occurrenceId}`);
 const event=r.body.candidates[0].presentation.event;
 assert.equal(event.eventId,occurrence.eventId);assert.equal(event.venueSpotId,null);
 assert.doesNotThrow(()=>validateDecisionProductResponse(r.body,r.request));
 assert.equal(r.body.learning.eventCount,0);
 assert.ok(r.stored.envelope.bindings.worldCohortHash);
});
test('old clients remain Spot-only even if context contains events',async()=>{
 const text='Musik in Basel';const {binding,profile}=await import('./librarian-matching-fixtures.mjs');
 const r=await exercise({text,meaning:request([music()]),catalog:[binding(1,profile())],eventOccurrences:[occurrence]});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.ok(r.body.candidates.every(c=>!c.presentation.event));
});
test('matching event replaces its venue in the same ranked window',async()=>{
 const {binding,profile,offer,area}=await import('./librarian-matching-fixtures.mjs');
 const venue=binding(1,profile([offer('music','MUSIC_EVENT')],[area()],'BAR'));
 const text='Musik in Basel';const r=await exercise({text,meaning:request([music()]),catalog:[venue],eventOccurrences:[{...occurrence,matchedSpotId:venue.decisionProjection.spotId}],requestOverride:eventRequest(text)});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));
 assert.ok(r.body.candidates.some(c=>c.presentation.event));
 assert.ok(!r.body.candidates.some(c=>c.spotId===venue.decisionProjection.spotId));
});
test('the real Web transport validates an Event and preserves its occurrence link',async()=>{
 const ts=(await import('typescript')).default;const {readFileSync}=await import('node:fs');
 const code=ts.transpileModule(readFileSync(new URL('../../../web/lib/decision-web-api.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('exports','fetch','crypto',code)(exports,async(_url,options)=>{
  const req=JSON.parse(options.body);const r=await exercise({text:req.naturalLanguage,meaning:request([music()]),catalog:[],eventOccurrences:[occurrence],requestOverride:req});
  assert.equal(r.status,200,JSON.stringify(r.diagnostics));return new Response(JSON.stringify(r.body));
 },globalThis.crypto);
 const result=await exports.runWebDecision({inputMode:'free',rawFreeText:'Musik in Basel',city:'Basel',directions:[],audiences:[],moods:[]});
 assert.equal(result.results[0].presentation.event.occurrenceId,occurrence.occurrenceId);
});
test('family suitability helps ranking but cannot override an age restriction',()=>{
 const family=fact('family','atmosphere.character','familienfreundlich');
 assert.equal(run([music(),family],{familyFriendly:true}).result.ranked[0].facts.find(f=>f.factId==='family').state,'MET');
});
test('a typed OPEN_NOW cannot admit an event that has not started',async()=>{
 const text='Musik in Basel';const req=eventRequest(text);req.explicit.hardConstraints=['OPEN_NOW'];
 const r=await exercise({text,meaning:request([music()]),catalog:[],eventOccurrences:[occurrence],requestOverride:req});
 assert.equal(r.status,200,JSON.stringify(r.diagnostics));assert.equal(r.body.primaryCandidateId,null);
});
test('entry budget excludes a known minimum over budget; free and unknown prices remain usable',async()=>{
 const {budget}=await import('./librarian-matching-fixtures.mjs');
 assert.equal(run([music(),...budget(20)],{priceMin:30,currency:'CHF'}).result.ranked.length,0);
 assert.equal(run([music(),...budget(20)],{isFree:true}).result.ranked.length,1);
 assert.equal(run([music(),...budget(20)]).result.ranked.length,1);
});
test('overnight events use the actual occurrence interval across midnight',()=>{
 const event={...occurrence,startAt:'2026-10-15T22:00:00+02:00',endAt:'2026-10-16T02:00:00+02:00'};
 const visit={dates:['2026-10-16'],start:60,end:61,exact:true,requested:true,complete:true,undatedDayPhase:false,timezone:'Europe/Zurich',excludedMinutes:[]};
 assert.equal(eventVisitAvailability(event,visit).state,'MET');
 assert.equal(eventVisitAvailability(event,{...visit,start:180,end:181}).state,'FAILED');
});
test('generic event discovery includes a typed music event and binds its entry price',async()=>{
 const {budget}=await import('./librarian-matching-fixtures.mjs');
 assert.equal(run([fact('event','offer.kind','Veranstaltung')]).result.ranked.length,1);
 assert.equal(run([fact('live','experience.activity','Live-Musik'),...budget(20)],{tags:['LIVE_MUSIC'],priceMin:30,currency:'CHF'}).result.ranked.length,0);
});
test('DST fold is uncertain instead of inventing a clock interpretation',()=>{
 const event={...occurrence,startAt:'2026-10-25T02:45:00+02:00',endAt:'2026-10-25T02:15:00+01:00'};
 const visit={dates:['2026-10-25'],start:170,end:171,exact:true,requested:true,complete:true,undatedDayPhase:false,timezone:'Europe/Zurich',excludedMinutes:[]};
 assert.equal(eventVisitAvailability(event,visit).state,'UNKNOWN');
});
