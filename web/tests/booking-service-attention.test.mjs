import assert from 'node:assert/strict';
import test from 'node:test';
import {createBookingTsLoader} from './helpers/booking-ts-runtime.mjs';
const load=createBookingTsLoader(import.meta.url);
const api=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{}});
const {serviceOverruns,serviceClock}=load('../lib/booking-service-attention.ts',{'./booking-api':api});
const now=Date.parse('2026-10-20T12:00:00Z');
const visit=(changes={})=>({id:'visit',table_id:'a',service_id:'lunch',guest_name:'Synthetic',guest_contact:null,note:null,party_size:2,status:'seated',source:'phone',starts_at:'2026-10-20T10:00:00Z',ends_at:'2026-10-20T12:00:00Z',seated_at:'2026-10-20T10:00:00Z',...changes});
const snapshot=(reservations=[visit()],changes={})=>({settings:null,areas:[],tables:[],services:[],reservations,operating_date:'2026-10-20',capabilities:{current_seating:true,service_lifecycle:true},...changes});
const rows=(s=snapshot(),time=now,date='2026-10-20')=>serviceOverruns(s,date,time);
test('deadline boundary uses saved seated status without mutating inventory',()=>{
 const s=snapshot(),before=JSON.stringify(s);assert.equal(rows(s,now-1).length,0);assert.equal(rows(s).length,1);assert.equal(JSON.stringify(s),before);
 for(const status of ['pending','confirmed','arrived','completed','cancelled','declined','no_show'])assert.equal(rows(snapshot([visit({status})])).length,0);
});
test('current operating date and explicit lifecycle capabilities are required',()=>{
 assert.equal(rows(snapshot(),now,'2026-10-21').length,0);assert.equal(rows(snapshot(),NaN).length,0);
 assert.equal(rows(snapshot(),Date.parse('2026-10-21T12:00:00Z')).length,0);
 for(const capabilities of [undefined,{}, {current_seating:true},{service_lifecycle:true}])assert.equal(rows(snapshot(undefined,{capabilities})).length,0);
 assert.equal(rows(snapshot([visit({starts_at:'2026-10-19T20:00:00Z'})])).length,0);
});
test('transferred physical allocation controls deadline rather than original booking time',()=>{
 assert.equal(rows(snapshot([visit({allocation_ends_at:'2026-10-20T12:30:00Z'})])).length,0);
 const r=rows(snapshot([visit({ends_at:'2026-10-20T18:00:00Z',allocation_starts_at:'2026-10-20T11:00:00Z',allocation_ends_at:'2026-10-20T11:59:00Z'})]));
 assert.equal(r.length,1);assert.equal(r[0].plannedEnd,'2026-10-20T11:59:00Z');
 assert.equal(rows(snapshot([visit({seated_at:'2026-10-20T12:01:00Z'})])).length,0);
 assert.equal(rows(snapshot([visit({allocation_starts_at:'2026-10-20T12:01:00Z'})])).length,0);
});
test('combined tables count once and find the earliest active successor on any physical table',()=>{
 const group=visit({table_ids:['a','b']});
 const later=visit({id:'later',table_id:'a',status:'confirmed',starts_at:'2026-10-20T16:00:00Z'});
 const next=visit({id:'next',table_id:'b',status:'pending',starts_at:'2026-10-20T14:00:00Z'});
 const cancelled=visit({id:'cancelled',table_id:'b',status:'cancelled',starts_at:'2026-10-20T12:01:00Z'});
 const unrelated=visit({id:'elsewhere',table_id:'c',status:'confirmed',starts_at:'2026-10-20T12:02:00Z'});
 const result=rows(snapshot([group,later,next,cancelled,unrelated]));assert.equal(result.length,1);assert.equal(result[0].next.id,'next');
});
test('successor uses effective transfer start and excludes earlier occupied windows',()=>{
 const earlier=visit({id:'earlier',status:'confirmed',starts_at:'2026-10-20T11:00:00Z'});
 const moved=visit({id:'moved',status:'confirmed',starts_at:'2026-10-20T10:00:00Z',allocation_starts_at:'2026-10-20T12:15:00Z'});
 assert.equal(rows(snapshot([visit(),earlier,moved]))[0].next.id,'moved');
});
test('oldest planned deadline sorts first with deterministic ties',()=>{
 const r=rows(snapshot([visit({id:'b'}),visit({id:'a'}),visit({id:'old',ends_at:'2026-10-20T11:00:00Z'})]));
 assert.equal(r.map(x=>x.reservation.id).join(','),'old,a,b');
});
test('Zurich daylight-saving fold shows distinct offsets for repeated local time',()=>{
 assert.match(serviceClock('2026-10-25T00:30:00Z'),/02:30.*GMT\+2/);
 assert.match(serviceClock('2026-10-25T01:30:00Z'),/02:30.*GMT\+1/);
});
