import assert from 'node:assert/strict';import test from 'node:test';import {createBookingTsLoader} from './helpers/booking-ts-runtime.mjs';
const load=createBookingTsLoader(import.meta.url),id='5a000000-0000-4000-8000-000000000001',other='5a000000-0000-4000-8000-000000000002';
const api=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{}});
function wire({date='2026-10-25',start='2026-10-24T22:00:00Z',hours=25,minutes=30,max=8}={}){
 const zero=()=>({reservations:0,guests:0,excluded_reservations:0,excluded_guests:0});
 const windows=Array.from({length:hours*60/minutes},(_,n)=>({starts_at:new Date(Date.parse(start)+n*minutes*60000).toISOString(),ends_at:new Date(Date.parse(start)+(n+1)*minutes*60000).toISOString(),...zero()}));
 windows[4].reservations=2;windows[4].guests=6;windows[4].excluded_reservations=1;windows[4].excluded_guests=3;
 return {spot_id:id,date,timezone:'Europe/Zurich',observed_at:'2026-10-21T12:00:00.123456Z',policy:{spot_id:id,revision:1,window_minutes:minutes,max_guests:max},totals:{reservations:2,guests:6,excluded_reservations:1,excluded_guests:3},windows};
}
test('arrival review keeps complete DST grids and distinct repeated hours without guest projection',()=>{
 const raw=wire();raw.windows[4].guest_name='PRIVATE';const result=api.parseArrivalReview(raw,id,raw.date);
 assert.equal(result.windows.length,50);assert.equal(result.totals.guests,6);assert.equal(result.windows[4].guest_name,undefined);
 assert.equal(api.parseArrivalReview(wire({date:'2026-03-29',start:'2026-03-28T23:00:00Z',hours:23}),id,'2026-03-29').windows.length,46);
 assert.equal(api.parseArrivalReview(wire({minutes:15,max:null}),id,'2026-10-25').windows.length,100);
 assert.equal(api.parseArrivalReview(wire({minutes:60}),id,'2026-10-25').windows.length,25);
});
test('arrival review binds restaurant day timezone and full midnight boundaries',()=>{
 for(const change of [{spot_id:other},{date:'2026-10-26'},{timezone:'UTC'},{policy:{spot_id:other,revision:1,window_minutes:30,max_guests:8}}])assert.throws(()=>api.parseArrivalReview({...wire(),...change},id,'2026-10-25'));
 const missing=wire();missing.windows.pop();assert.throws(()=>api.parseArrivalReview(missing,id,missing.date));
 const duplicate=wire();duplicate.windows[1]={...duplicate.windows[0]};assert.throws(()=>api.parseArrivalReview(duplicate,id,duplicate.date));
 const micro=wire();micro.windows[0].starts_at='2026-10-24T22:00:00.000001Z';assert.throws(()=>api.parseArrivalReview(micro,id,micro.date));
});
test('arrival review reconciles both counted and excluded party facts',()=>{
 for(const field of ['reservations','guests','excluded_reservations','excluded_guests']){const raw=wire();raw.totals[field]++;assert.throws(()=>api.parseArrivalReview(raw,id,raw.date));}
 const impossible=wire();impossible.windows[0].guests=1;impossible.totals.guests++;assert.throws(()=>api.parseArrivalReview(impossible,id,impossible.date));
 const huge=wire();huge.windows[4].guests=61;huge.totals.guests=61;assert.throws(()=>api.parseArrivalReview(huge,id,huge.date));
});
test('arrival review rejects normalized impossible timestamps and invalid calendar scope',()=>{
 for(const date of ['1969-12-31','2026-02-30','9999-12-31','',null])assert.throws(()=>api.validateArrivalReviewDate(date));
 const raw=wire({date:'2026-03-02',start:'2026-03-01T23:00:00Z',hours:24});raw.windows[2].starts_at='2026-02-30T00:00:00Z';assert.throws(()=>api.parseArrivalReview(raw,id,raw.date));
});
test('arrival review RPC validates scope before dispatch and binds returned facts',async()=>{
 const calls=[];let data=wire();const api=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{supabase:{rpc:(method,args)=>({abortSignal:async()=>{calls.push({method,args});return {data,error:null};}})}}});
 assert.equal((await api.readArrivalReview(id,'2026-10-25')).windows.length,50);assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{method:'booking_console_arrival_review_v1',args:{p_spot_id:id,p_date:'2026-10-25'}});
 await assert.rejects(api.readArrivalReview(id,'1960-01-01'));assert.equal(calls.length,1);data=wire({date:'2026-10-26'});await assert.rejects(api.readArrivalReview(id,'2026-10-25'));
});
