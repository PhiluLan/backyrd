import assert from 'node:assert/strict';
import test from 'node:test';
import {createBookingTsLoader} from './helpers/booking-ts-runtime.mjs';
const load=createBookingTsLoader(import.meta.url),api=load('../lib/booking-report.ts');
const id=n=>`55000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={from:'2026-10-25',to:'2026-10-25',serviceId:null};
const count=(status='confirmed',n=1,guests=2)=>({reservations:n,guests,statuses:api.reportStatuses.map(s=>({status:s,reservations:s===status?n:0,guests:s===status?guests:0}))});
const raw=(name='Service')=>({spot_id:id(1),scope:{from_date:scope.from,to_date:scope.to,service_id:null},observed_at:'2026-10-25T12:00:00.123456Z',totals:count(),days:[{date:scope.from,...count()}],services:[{id:id(2),name,is_active:true,...count()}],sources:api.reportSources.map(s=>({source:s,reservations:s==='phone'?1:0,guests:s==='phone'?2:0}))});
const labels={statuses:Object.fromEntries(api.reportStatuses.map(s=>[s,s])),sources:Object.fromEntries(api.reportSources.map(s=>[s,s]))};
test('reports use real calendar days across both Zurich DST changes and bound periods to 31 inclusive days',()=>{
 assert.equal(api.reportDates({from:'2026-03-28',to:'2026-03-30'}).length,3);assert.equal(api.reportDates({from:'2026-10-24',to:'2026-10-26'}).length,3);
 assert.equal(api.reportDates({from:'2026-01-01',to:'2026-01-31'}).length,31);
 for(const value of [{from:'2026-01-01',to:'2026-02-01'},{from:'2026-02-30',to:'2026-03-02'},{from:'',to:'2026-03-02'},{from:'2026-02-02',to:'2026-02-01'},{from:'0000-01-01',to:'0000-01-02'}])assert.throws(()=>api.validateReportScope({...value,serviceId:null}));
});
test('report parser binds venue and exact requested scope rather than accepting a stale report',()=>{
 assert.equal(api.parseBookingReport(raw(),id(1),scope).totals.guests,2);
 for(const change of [{spot_id:id(9)},{scope:{from_date:scope.from,to_date:scope.to,service_id:id(2)}},{observed_at:'not-time'}])assert.throws(()=>api.parseBookingReport({...raw(),...change},id(1),scope));
 assert.throws(()=>api.parseBookingReport(raw(),id(1),{...scope,to:'2026-10-26'}));
});
test('every report dimension reconciles reservations and party totals, including each status',()=>{
 const changed=()=>structuredClone(raw());
 let r=changed();r.totals.reservations=2;assert.throws(()=>api.parseBookingReport(r,id(1),scope));
 r=changed();r.days[0].statuses.reverse();assert.throws(()=>api.parseBookingReport(r,id(1),scope));
 r=changed();r.services[0].statuses[0]={status:'pending',reservations:1,guests:2};r.services[0].statuses[1]={status:'confirmed',reservations:0,guests:0};assert.throws(()=>api.parseBookingReport(r,id(1),scope));
 r=changed();r.sources[0].guests=3;assert.throws(()=>api.parseBookingReport(r,id(1),scope));
 r=changed();r.days.push(r.days[0]);assert.throws(()=>api.parseBookingReport(r,id(1),scope));
 r=changed();r.services.push(r.services[0]);assert.throws(()=>api.parseBookingReport(r,id(1),scope));
});
test('cancelled/future counts stay saved facts and raw guest fields never enter the parsed report or CSV',()=>{
 const r=raw();r.guest_name='PRIVATE_NAME';r.guest_contact='PRIVATE_CONTACT';r.services[0].note='PRIVATE_NOTE';
 r.totals=count('cancelled');r.days[0]={date:scope.from,...count('cancelled')};r.services[0]={...r.services[0],...count('cancelled')};
 const parsed=api.parseBookingReport(r,id(1),scope);assert.equal(parsed.totals.statuses.completed.reservations,0);assert.equal(parsed.totals.statuses.cancelled.reservations,1);
 assert.doesNotMatch(JSON.stringify(parsed),/PRIVATE_/);assert.doesNotMatch(api.bookingReportCsv(parsed,labels),/PRIVATE_|guest_contact|guest_name/);
});
test('zero reports are complete, while missing status/source/day fields and impossible party totals are rejected',()=>{
 const r=raw();r.totals=count('pending',0,0);r.days=[{date:scope.from,...count('pending',0,0)}];r.services=[];r.sources=api.reportSources.map(source=>({source,reservations:0,guests:0}));
 assert.equal(api.parseBookingReport(r,id(1),scope).totals.reservations,0);
 for(const value of [{...r,days:[]},{...r,sources:[]},{...r,totals:{reservations:1,guests:0,statuses:r.totals.statuses}},{...r,totals:{...r.totals,statuses:[]}},{...r,totals:{...r.totals,reservations:Number.MAX_SAFE_INTEGER+1}}])assert.throws(()=>api.parseBookingReport(value,id(1),scope));
});
test('a filtered report retains its explicitly selected historical service and no unrelated service',()=>{
 const r=raw();r.scope.service_id=id(2);r.services[0].is_active=false;
 assert.equal(api.parseBookingReport(r,id(1),{...scope,serviceId:id(2)}).services[0].isActive,false);
 r.services[0].id=id(3);assert.throws(()=>api.parseBookingReport(r,id(1),{...scope,serviceId:id(2)}));
});
test('CSV quotes configured service names and neutralizes spreadsheet formulas and control prefixes',()=>{
 for(const name of ['=HYPERLINK("https://invalid")',' +1','\t@SUM(1)','\u0000-1','Name; "quote"\nsecond line']){
  const csv=api.bookingReportCsv(api.parseBookingReport(raw(name),id(1),scope),labels);
  assert.ok(csv.startsWith('\ufeff"Zeitraum von";'));assert.ok(csv.endsWith('\r\n'));assert.match(csv,/2026-10-25T12:00:00.123456Z/);
  if(/^[\s\u0000]*[=+\-@]/.test(name))assert.ok(csv.includes('"\''+name.replace(/\u0000/g,'').replaceAll('"','""')+'"'));
  else assert.ok(csv.includes('"Name; ""quote""\nsecond line"'));
 }
});
test('report RPC calls only carry the bounded period and optional service and validate actual replies',async()=>{
 const calls=[],client={rpc:(method,args)=>({abortSignal:()=>{calls.push({method,args});return Promise.resolve({data:raw(),error:null,status:200});}})};
 const actual=load('../lib/booking-api.ts',{'./owner-api':{},'@/lib/supabase/client':{supabase:client}});
 assert.equal((await actual.readBookingReport(id(1),scope)).totals.reservations,1);assert.equal(calls[0].method,'booking_console_report_v1');assert.deepEqual(Object.keys(calls[0].args).sort(),['p_from','p_service_id','p_spot_id','p_to']);
 const count=calls.length;await assert.rejects(actual.readBookingReport(id(1),{...scope,to:'2026-12-31'}));assert.equal(calls.length,count);
});
