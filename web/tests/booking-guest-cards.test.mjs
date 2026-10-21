import assert from 'node:assert/strict';
import test from 'node:test';
import {createBookingTsLoader} from './helpers/booking-ts-runtime.mjs';
const load=createBookingTsLoader(import.meta.url);
const api=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{}});
const id=n=>`55000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const card=(n=1,changes={})=>({id:id(n),name:'Ada Example',email:'ada@booking.invalid',phone:'+41 61 000 00 00',revision:0,is_archived:false,created_at:'2026-10-21T00:00:00Z',updated_at:'2026-10-21T05:00:00.123456+00:00',...changes});
const intent=(changes={})=>({kind:'save',id:id(1),revision:null,name:'Ada Example',email:'ada@booking.invalid',phone:null,...changes});
const page=rows=>({guests:rows,next_cursor:null});
test('guest cards accept explicit names and optional separate contact fields without identity inference',()=>{
 assert.equal(api.validateGuestCardIntent(intent({name:' Li ',phone:'  +41 61 000 00 00  '})).name,'Li');
 assert.equal(api.validateGuestCardIntent(intent({name:'王',email:'',phone:''})).email,null);
 assert.equal(api.parseGuestCard(card(1,{owner_id:id(99)})).owner_id,undefined);
 assert.equal(api.parseGuestCardPage(page([card(2),card(1)]),false).guests.length,2);
});
test('guest card fields and request shapes are bounded, typed and exact',()=>{
 for(const change of [{name:' '},{name:'a'.repeat(121)},{name:'a\nb'},{email:'not-email'},{phone:'1'.repeat(81)},{revision:-1},{revision:0.5},{revision:9007199254740992},{owner_id:id(99)},{is_archived:true}])assert.throws(()=>api.validateGuestCardIntent(intent(change)));
 assert.throws(()=>api.validateGuestCardIntent({kind:'archive',id:id(1),revision:null,archived:true}));
 assert.doesNotThrow(()=>api.validateGuestCardIntent({kind:'archive',id:id(1),revision:3,archived:false}));
 for(const change of [{revision:-1},{is_archived:'false'},{created_at:'invalid'},{updated_at:'2026-10-21T05:00:00.1234567Z'},{phone:4}])assert.throws(()=>api.parseGuestCard(card(1,change)));
});
test('guest pages preserve microsecond ordering rather than comparing truncated milliseconds',()=>{
 const newer=card(1),older=card(9,{updated_at:'2026-10-21T05:00:00.123123Z'});
 assert.doesNotThrow(()=>api.parseGuestCardPage(page([newer,older]),false));
 assert.throws(()=>api.parseGuestCardPage(page([older,newer]),false));
 const equalOffset=card(9,{updated_at:'2026-10-21T07:00:00.123456+02:00'});
 assert.doesNotThrow(()=>api.parseGuestCardPage(page([equalOffset,newer]),false));
});
test('guest page cursors cannot skip validation, repeat a row or cross archive mode',()=>{
 const rows=Array.from({length:25},(_,i)=>card(26-i)),last=rows.at(-1),cursor={updated_at:last.updated_at,id:last.id};
 assert.equal(api.parseGuestCardPage({guests:rows,next_cursor:cursor},false).next_cursor.id,last.id);
 assert.doesNotThrow(()=>api.parseGuestCardPage(page([card(1)]),false,cursor));
 assert.throws(()=>api.parseGuestCardPage(page([last]),false,cursor));
 for(const invalid of [{guests:rows,next_cursor:{...cursor,id:id(99)}},page([...rows,card(1)]),page([card(1),card(1)]),page([card(1,{is_archived:true})]),{guests:[]}])assert.throws(()=>api.parseGuestCardPage(invalid,false));
});
test('guest audit details are bounded metadata with stable event ordering',()=>{
 const event=n=>({id:id(n),actor_id:null,action:'updated',changed_fields:['name'],created_at:'2026-10-21T05:00:00.123456Z'});
 assert.equal(api.parseGuestCardDetails({guest:card(),events:[event(3),event(2)]},id(1)).events.length,2);
 for(const events of [[event(2),event(3)],[event(2),event(2)],[{...event(2),changed_fields:['email','email']}],[{...event(2),changed_fields:['guest@booking.invalid']}],[{...event(2),action:'merged'}],Array.from({length:21},(_,i)=>event(30-i))])assert.throws(()=>api.parseGuestCardDetails({guest:card(),events},id(1)));
 assert.throws(()=>api.parseGuestCardDetails({guest:card(),events:[]},id(99)));
});
test('guest write acknowledgements bind identity, expected revision and archive state',()=>{
 const result={id:id(1),revision:0,is_archived:false,updated_at:card().updated_at};
 assert.equal(api.parseGuestCardOutcome(result,intent()).revision,0);
 for(const change of [{id:id(2)},{revision:1},{is_archived:true},{updated_at:'not-a-time'}])assert.throws(()=>api.parseGuestCardOutcome({...result,...change},intent()));
 assert.doesNotThrow(()=>api.parseGuestCardOutcome({...result,revision:4},intent({revision:3})));
 assert.throws(()=>api.parseGuestCardOutcome({...result,revision:5},intent({revision:3})));
 assert.doesNotThrow(()=>api.parseGuestCardOutcome({...result,revision:4,is_archived:true},{kind:'archive',id:id(1),revision:3,archived:true}));
});
test('recovery calls transmit the exact intent and never treat a missing write acknowledgement as success',async()=>{
 const calls=[];let response=null;
 const client={rpc:(method,args)=>({abortSignal:()=>{calls.push({method,args});return Promise.resolve({data:response,error:null,status:200});}})};
 const isolated=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{supabase:client}});
 assert.equal(await isolated.writeGuestCard(id(90),id(91),intent(),id(80),true),null);
 assert.equal(calls[0].method,'booking_console_guest_write_v1');assert.equal(calls[0].args.p_recover,true);assert.equal(calls[0].args.p_actor,id(80));assert.equal(calls[0].args.p_intent.email,'ada@booking.invalid');
 await assert.rejects(isolated.writeGuestCard(id(90),id(91),intent(),id(80),false));
 response={id:id(1),revision:0,is_archived:false,updated_at:card().updated_at};
 assert.equal((await isolated.writeGuestCard(id(90),id(91),intent(),id(80),true)).id,id(1));
 const count=calls.length;await assert.rejects(isolated.writeGuestCard(id(90),id(91),intent(),'invalid-actor',false));assert.equal(calls.length,count);
});
