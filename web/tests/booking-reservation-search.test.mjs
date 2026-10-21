import assert from 'node:assert/strict';
import test from 'node:test';
import {createBookingTsLoader} from './helpers/booking-ts-runtime.mjs';
const load=createBookingTsLoader(import.meta.url),api=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{}});
const scope={query:'Ada',from:'2026-10-25',to:'2026-10-25'};
const row=(n=1,changes={})=>({id:`54000000-0000-4000-8000-${String(n).padStart(12,'0')}`,guest_name:'Ada',guest_contact:'+41 (61) 123 45 67',starts_at:'2026-10-25T00:30:00Z',ends_at:'2026-10-25T01:00:00Z',party_size:2,status:'cancelled',...changes});
const page=rows=>({reservations:rows,next_cursor:null});
test('search accepts bounded real calendar dates and three Unicode characters',()=>{
 assert.equal(api.validateBookingSearchScope({...scope,query:'  Ada  '}).query,'Ada');
 assert.equal(api.validateBookingSearchScope({...scope,query:'😀😀😀'}).query,'😀😀😀');
 assert.doesNotThrow(()=>api.validateBookingSearchScope({...scope,from:'2026-01-01',to:'2027-01-01'}));
 for(const change of [{query:'ad'},{query:'  '},{query:'a'.repeat(121)},{query:'A\nb'},{from:'2026-02-30'},{from:'2026-10-26'},{to:'2027-10-26'}])assert.throws(()=>api.validateBookingSearchScope({...scope,...change}));
});
test('search result preserves contact as recorded and supports every reservation status',()=>{
 for(const status of ['pending','confirmed','arrived','seated','completed','cancelled','declined','no_show'])assert.equal(api.parseBookingSearch(page([row(1,{status})]),scope).reservations[0].status,status);
 assert.equal(api.parseBookingSearch(page([row()]),scope).reservations[0].guest_contact,'+41 (61) 123 45 67');
 assert.equal(api.parseBookingSearch(page([]),scope).reservations.length,0);
});
test('search validates the 25 hour Zurich day using actual instants',()=>{
 assert.doesNotThrow(()=>api.parseBookingSearch(page([row(1,{starts_at:'2026-10-24T22:00Z',ends_at:'2026-10-24T22:30Z'})]),scope));
 assert.doesNotThrow(()=>api.parseBookingSearch(page([row(1,{starts_at:'2026-10-25T22:30Z',ends_at:'2026-10-25T23:00Z'})]),scope));
 for(const starts_at of ['2026-10-24T21:59Z','2026-10-25T23:00Z'])assert.throws(()=>api.parseBookingSearch(page([row(1,{starts_at,ends_at:'2026-10-26T12:00Z'})]),scope));
});
test('search rejects duplicate, unsorted, malformed or unbounded result pages',()=>{
 for(const rows of [[row(),row()],[row(2),row(1)],Array.from({length:26},(_,i)=>row(i+1)),[row(1,{id:'bad'})],[row(1,{status:'paid'})],[row(1,{party_size:0})],[row(1,{guest_name:''})],[row(1,{guest_contact:'x'.repeat(321)})],[row(1,{ends_at:'2026-10-25T00:00Z'})]])assert.throws(()=>api.parseBookingSearch(page(rows),scope));
 assert.throws(()=>api.parseBookingSearch({reservations:[]},scope));
});
test('cursor is tied to the last full page row and must advance',()=>{
 const rows=Array.from({length:25},(_,i)=>row(i+1));const next_cursor={starts_at:rows[24].starts_at,id:rows[24].id};
 assert.equal(api.parseBookingSearch({reservations:rows,next_cursor},scope).next_cursor.id,rows[24].id);
 assert.throws(()=>api.parseBookingSearch({reservations:rows,next_cursor:{...next_cursor,id:rows[0].id}},scope));
 assert.throws(()=>api.parseBookingSearch({reservations:[row()],next_cursor},scope));
 assert.throws(()=>api.parseBookingSearch(page([row(25)]),scope,next_cursor));
 assert.doesNotThrow(()=>api.parseBookingSearch(page([row(26)]),scope,next_cursor));
 assert.throws(()=>api.parseBookingSearch(page([]),scope,{...next_cursor,starts_at:'2026-10-24T00:00Z'}));
});
test('search RPC transmits only the explicit restaurant, scope and cursor',async()=>{
 const calls=[],signal=new AbortController().signal;
 const client={rpc:(method,args)=>({abortSignal:received=>{calls.push({method,args,signal:received});return Promise.resolve({data:page([row()]),error:null,status:200});}})};
 const isolated=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{supabase:client}});
 await isolated.searchBookingReservations('54000000-0000-4000-8000-000000000099',scope,null,signal);
 assert.equal(calls.length,1);assert.equal(calls[0].method,'booking_console_search_v1');assert.equal(calls[0].args.p_query,'Ada');assert.equal(calls[0].args.p_after_id,null);assert.equal(calls[0].args.p_from,scope.from);
 await assert.rejects(isolated.searchBookingReservations('54000000-0000-4000-8000-000000000099',{...scope,query:'a'},null));assert.equal(calls.length,1);
});
