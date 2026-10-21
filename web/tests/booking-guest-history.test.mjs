import assert from 'node:assert/strict';
import test from 'node:test';
import {createBookingTsLoader} from './helpers/booking-ts-runtime.mjs';
const load=createBookingTsLoader(import.meta.url);
const api=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{}});
const id=n=>`55000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const intent=changes=>({kind:'assign',reservation_id:id(1),reservation_revision:0,link_revision:0,guest_id:id(2),guest_revision:0,...changes});
const row=(n=1,changes={})=>({id:id(n),starts_at:'2026-10-25T00:30:00.123456Z',ends_at:'2026-10-25T01:30:00Z',party_size:2,status:'cancelled',guest_name:'Saved booking',revision:0,...changes});
test('guest history keeps cancellation facts and minimizes contacts/notes without inferring a visit',()=>{
 const parsed=api.parseGuestReservations({reservations:[row(1,{guest_contact:'PRIVATE',note:'PRIVATE'})],next_cursor:null});
 assert.equal(parsed.reservations[0].status,'cancelled');assert.equal(parsed.reservations[0].guest_contact,undefined);assert.equal(parsed.reservations[0].note,undefined);
 for(const change of [{party_size:0},{status:'visited'},{revision:-1},{ends_at:'2026-10-24T00:00:00Z'},{guest_name:''}])assert.throws(()=>api.parseGuestReservations({reservations:[row(1,change)],next_cursor:null}));
});
test('guest history preserves microsecond order and bounds keysets to the last returned row',()=>{
 const newer=row(1),older=row(9,{starts_at:'2026-10-25T00:30:00.123123Z'});
 assert.doesNotThrow(()=>api.parseGuestReservations({reservations:[newer,older],next_cursor:null}));
 assert.throws(()=>api.parseGuestReservations({reservations:[older,newer],next_cursor:null}));
 const rows=Array.from({length:25},(_,n)=>row(30-n));const last=rows.at(-1),cursor={id:last.id,starts_at:last.starts_at};
 assert.equal(api.parseGuestReservations({reservations:rows,next_cursor:cursor}).next_cursor.id,last.id);
 assert.throws(()=>api.parseGuestReservations({reservations:[last],next_cursor:null},cursor));
 assert.throws(()=>api.parseGuestReservations({reservations:rows,next_cursor:{...cursor,id:id(99)}}));
 assert.throws(()=>api.parseGuestReservations({reservations:[...rows,row(5)],next_cursor:null}));
});
test('association intents require an explicit card or detach and both revisions',()=>{
 assert.doesNotThrow(()=>api.validateReservationGuestIntent(intent()));
 assert.doesNotThrow(()=>api.validateReservationGuestIntent(intent({kind:'detach',guest_id:null,guest_revision:null,link_revision:3})));
 for(const change of [{kind:'merge'},{guest_revision:null},{link_revision:'0'},{reservation_revision:-1},{guest_id:null},{owner_id:id(9)},{kind:'detach'}])assert.throws(()=>api.validateReservationGuestIntent(intent(change)));
});
test('archived association redaction is preserved and change metadata is bounded',()=>{
 const event={id:id(3),actor_id:null,previous_guest_id:null,guest_id:id(2),revision:1,created_at:'2026-10-21T00:00:00.123456Z'};
 const details={reservation_id:id(1),revision:1,guest:{id:id(2),name:null,revision:null,is_archived:true},events:[event]};
 assert.equal(api.parseReservationGuestDetails(details,id(1)).guest.name,null);
 assert.throws(()=>api.parseReservationGuestDetails(details,id(9)));
 assert.throws(()=>api.parseReservationGuestDetails({...details,guest:{...details.guest,is_archived:false}},id(1)));
 assert.throws(()=>api.parseReservationGuestDetails({...details,events:[event,event]},id(1)));
 assert.throws(()=>api.parseReservationGuestDetails({...details,revision:0},id(1)));
 assert.throws(()=>api.parseReservationGuestOutcome({reservation_id:id(1),guest_id:id(2),revision:0}));
});
test('association recovery remains actor/intent bound and cannot acknowledge a different card',async()=>{
 const calls=[];let response=null;
 const client={rpc:(method,args)=>({abortSignal:()=>{calls.push({method,args});return Promise.resolve({data:response,error:null,status:200});}})};
 const isolated=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{supabase:client}});
 assert.equal(await isolated.writeReservationGuest(id(8),id(9),intent(),id(7),true),null);
 assert.equal(calls[0].args.p_actor,id(7));assert.equal(calls[0].args.p_recover,true);
 await assert.rejects(isolated.writeReservationGuest(id(8),id(9),intent(),id(7),false));
 response={reservation_id:id(1),guest_id:id(2),revision:1};
 assert.equal((await isolated.writeReservationGuest(id(8),id(9),intent(),id(7))).revision,1);
 response={...response,guest_id:id(99)};await assert.rejects(isolated.writeReservationGuest(id(8),id(9),intent(),id(7)));
});
test('atomic creates send an explicit nullable association and reject a mismatched acknowledgement',async()=>{
 const calls=[];const slot={service_id:id(3),table_id:id(4),table_ids:[id(4)],combination_id:null,starts_at:'2026-10-25T12:00:00Z',ends_at:'2026-10-25T13:00:00Z'};
 let response={...slot,id:id(1),guest_link:{reservation_id:id(1),guest_id:id(2),revision:1}};
 const client={rpc:(method,args)=>({abortSignal:()=>{calls.push({method,args});return Promise.resolve({data:response,error:null,status:200});}})};
 const isolated=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{supabase:client}});
 const booking={requestId:id(9),slot,partySize:2,name:'Guest',contact:'',note:'',source:'phone',status:'confirmed',guestContext:{actorId:id(7),card:{id:id(2),revision:0}}};
 assert.equal(await isolated.createBooking(id(8),booking),id(1));assert.equal(calls[0].method,'booking_console_create_v3');assert.equal(calls[0].args.p_actor,id(7));assert.equal(calls[0].args.p_guest_revision,0);
 response={...response,guest_link:{...response.guest_link,guest_id:id(99)}};await assert.rejects(isolated.createBooking(id(8),booking));
 response={...response,guest_link:{reservation_id:id(1),guest_id:null,revision:0}};
 assert.equal(await isolated.createBooking(id(8),{...booking,guestContext:{actorId:id(7),card:null}}),id(1));assert.equal(calls.at(-1).args.p_guest_id,null);
 const count=calls.length;await assert.rejects(isolated.createBooking(id(8),{...booking,slot:{...slot,table_ids:undefined}}));assert.equal(calls.length,count);
});
