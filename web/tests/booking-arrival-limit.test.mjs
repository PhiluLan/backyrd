import assert from 'node:assert/strict';
import test from 'node:test';
import {createBookingTsLoader} from './helpers/booking-ts-runtime.mjs';
const load=createBookingTsLoader(import.meta.url),id=n=>`59000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const api=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{}});
const raw=(changes={})=>({spot_id:id(1),revision:1,window_minutes:30,max_guests:8,...changes});
const intent=(changes={})=>({revision:0,windowMinutes:30,maxGuests:8,...changes});
test('arrival policy binds restaurant, integer limits, default and actual interval',()=>{
 assert.equal(api.parseArrivalLimit(raw(),id(1)).maxGuests,8);
 assert.equal(api.parseArrivalLimit(raw({revision:0,window_minutes:15,max_guests:null}),id(1)).maxGuests,null);
 assert.equal(api.parseArrivalLimit(raw({window_minutes:60,max_guests:null}),id(1)).windowMinutes,60);
 for(const change of [{spot_id:id(2)},{revision:-1},{revision:0},{revision:'1'},{window_minutes:20},{max_guests:0},{max_guests:1001},{max_guests:2.5},{max_guests:'8'},{max_guests:undefined},{revision:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>api.parseArrivalLimit(raw(change),id(1)));
});
test('arrival intents preserve explicit disable and reject unknown/type-coerced writes',()=>{
 assert.equal(api.validateArrivalLimitIntent(intent({maxGuests:null})).maxGuests,null);
 for(const change of [{revision:null},{windowMinutes:'30'},{maxGuests:0},{maxGuests:''},{maxGuests:1001},{extra:true}])assert.throws(()=>api.validateArrivalLimitIntent(intent(change)));
});
test('arrival save validates original exact outcome and only accepts null for recovery',async()=>{
 const calls=[];let value=raw();const client={rpc:(method,args)=>({abortSignal:async()=>{calls.push({method,args});return {data:value,error:null};}})};
 const api=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{supabase:client}});
 assert.equal((await api.saveArrivalLimit(id(1),id(3),intent(),id(4))).revision,1);
 assert.equal(calls[0].args.p_actor,id(4));assert.equal(calls[0].args.p_recover,false);
 value=null;assert.equal(await api.saveArrivalLimit(id(1),id(3),intent(),id(4),true),null);
 await assert.rejects(api.saveArrivalLimit(id(1),id(3),intent(),id(4)));
 for(const change of [{revision:2},{window_minutes:15},{max_guests:9},{spot_id:id(2)}]){value=raw(change);await assert.rejects(api.saveArrivalLimit(id(1),id(3),intent(),id(4),true));}
 const before=calls.length;await assert.rejects(api.saveArrivalLimit(id(1),id(3),intent({maxGuests:0}),id(4)));assert.equal(calls.length,before);
});
test('arrival read binds actual scoped wire JSON and no-op recovery keeps its revision',async()=>{
 let value=raw({revision:2});const calls=[];
 const api=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{supabase:{rpc:(method,args)=>({abortSignal:async()=>{calls.push({method,args});return {data:value,error:null};}})}}});
 assert.equal((await api.readArrivalLimit(id(1))).revision,2);
 assert.equal((await api.saveArrivalLimit(id(1),id(3),intent({revision:2}),id(4),true)).revision,2);
 value=raw({spot_id:id(9)});await assert.rejects(api.readArrivalLimit(id(1)));
 assert.equal(calls[0].method,'booking_console_arrival_limit_v1');
});
