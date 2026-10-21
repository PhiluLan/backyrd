import assert from 'node:assert/strict';
import test from 'node:test';
import {randomBytes} from 'node:crypto';
import {createBookingTsLoader} from './helpers/booking-ts-runtime.mjs';
const load=createBookingTsLoader(import.meta.url),guest=load('../lib/booking-guest-contract.ts');
const security=load('../lib/booking-guest-security.ts',{'./booking-guest-contract':guest});
const rpcModule=load('../lib/booking-service-rpc.ts',{'./booking-guest-contract':guest,'./booking-guest-security':security});
const common=load('../lib/booking-mail-reissue-contract.ts',{'./booking-guest-contract':guest});
const contract=load('../lib/booking-mail-summary-contract.ts',{'./booking-guest-contract':guest,'./booking-mail-reissue-contract':common});
const http=load('../lib/booking-mail-summary-http.ts',{'./booking-guest-contract':guest,'./booking-guest-security':security,'./booking-service-rpc':rpcModule,'./booking-mail-summary-contract':contract});
const mail=load('../lib/booking-mail.ts',{'./booking-guest-contract':guest,'./booking-guest-security':security});
const spot='51000000-0000-4000-8000-000000000001',res='51000000-0000-4000-8000-000000000002',actor='51000000-0000-4000-8000-000000000003',nonce='51000000-0000-4000-8000-000000000004',message='51000000-0000-4000-8000-000000000005',lease='51000000-0000-4000-8000-000000000006';
const intent={spotId:spot,reservationId:res,requestId:nonce,revision:0,email:'Guest@booking.invalid'};
const queued={id:res,revision:1,message_id:message,queued_at:'2026-10-21T12:00:00Z'};
const request=(body={...intent,operation:'prepare'},headers={})=>new Request('https://booking.example/api/booking/mail/summary',{method:'POST',headers:{origin:'https://booking.example','Content-Type':'application/json',Authorization:'Bearer synthetic-staff-bearer',...headers},body:JSON.stringify(body)});
function fixture(overrides={}){
 const calls=[];
 const d={origin:'https://booking.example',actor:async()=>actor,senderReady:async()=>true,rpc:async(name,args)=>{calls.push({name,args});if(name==='backyrd_consume_launch_cost_boundary_v1')return{allowed:true};if(name==='booking_mail_summary_recover_v1')return null;if(name==='booking_mail_summary_context_v1')return{reservation_id:res,revision:0,email:intent.email,message_mode:'manual_summary'};if(name==='booking_mail_summary_v1')return queued;throw Error('unexpected RPC');},...overrides};return{d,calls};
}
test('manual confirmation accepts only a bounded explicit recipient and a scoped revision/nonce',()=>{
 const parsed=contract.parseMailSummaryRequest({...intent,operation:'prepare',email:' Guest@booking.invalid '});assert.equal(parsed.email,intent.email);
 for(const body of [{...intent,operation:'prepare',actorId:actor},{...intent,operation:'prepare',revision:-1},{...intent,operation:'prepare',revision:0.5},{...intent,operation:'prepare',email:'guest@booking.invalid\r\nBcc:x@test.invalid'},{...intent,operation:'prepare',email:'phone +41'},{...intent,operation:'prepare',email:'a'.repeat(255)},{...intent,operation:'send'},{...intent,operation:'prepare',policyAccepted:true}])assert.throws(()=>contract.parseMailSummaryRequest(body));
 assert.equal(contract.parseMailSummaryResult(queued,intent).revision,1);assert.throws(()=>contract.parseMailSummaryResult({...queued,id:spot},intent));assert.throws(()=>contract.parseMailSummaryResult({...queued,revision:0},intent));assert.equal(contract.parseMailSummaryResult({not_committed:true,id:res,revision:2},intent).not_committed,true);
});
test('same-origin JSON/body boundaries reject requests before invoking actor or RPC',async()=>{
 let actors=0;const f=fixture({actor:async()=>{actors++;return actor;}});
 for(const headers of [{origin:'https://evil.test'},{'sec-fetch-site':'cross-site'},{'Content-Type':'text/plain'},{'content-encoding':'gzip'}])assert.notEqual((await http.handleMailSummary(request(undefined,headers),f.d)).status,200);
 assert.equal((await http.handleMailSummary(request({...intent,operation:'prepare',email:'x'.repeat(5000)}),f.d)).status,400);assert.equal(actors,0);assert.equal(f.calls.length,0);
});
test('fresh actor identity and canonical write scope precede any message preparation',async()=>{
 assert.equal((await http.handleMailSummary(request(),fixture({actor:async()=>null}).d)).status,401);
 const f=fixture();const response=await http.handleMailSummary(request(),f.d);assert.equal(response.status,200);const body=await response.json();assert.deepEqual(body.data,queued);
 const write=f.calls.find(call=>call.name==='booking_mail_summary_v1');assert.equal(write.args.p_actor,actor);assert.equal(write.args.p_email,intent.email);assert.equal(write.args.p_expected_revision,0);assert.ok(!JSON.stringify(body).includes('key_hash'));
});
test('sender readiness failure never dispatches the mutation and leaves prior recovery readable',async()=>{
 const f=fixture({senderReady:async()=>false});const response=await http.handleMailSummary(request(),f.d);assert.equal(response.status,503);assert.equal((await response.json()).outcome,'rejected');assert.equal(f.calls.some(c=>c.name==='booking_mail_summary_v1'),false);
 const prior=fixture({rpc:async name=>name==='backyrd_consume_launch_cost_boundary_v1'?{allowed:true}:queued,senderReady:async()=>{throw Error('must not run');}});assert.equal((await http.handleMailSummary(request({...intent,operation:'recover'}),prior.d)).status,200);
});
test('post-dispatch loss and malformed prior commit evidence stay unknown rather than claiming noncommit',async()=>{
 for(const priorInvalid of [false,true]){
  const f=fixture();const original=f.d.rpc;f.d.rpc=async(name,args)=>{if(priorInvalid&&name==='booking_mail_summary_recover_v1')return{...queued,id:spot};if(!priorInvalid&&name==='booking_mail_summary_v1')throw Error('synthetic_lost_ack');return original(name,args);};
  const response=await http.handleMailSummary(request(),f.d);assert.equal(response.status,503);const body=await response.json();assert.equal(body.outcome,'unknown');assert.ok(!JSON.stringify(body).includes(intent.email));
 }
});
test('empty recovery does not submit and a scoped later revision settles without sender readiness',async()=>{
 const f=fixture();const response=await http.handleMailSummary(request({...intent,operation:'recover'}),f.d);assert.deepEqual(await response.json(),{data:null});assert.equal(f.calls.length,2);
 const later=fixture({rpc:async name=>name==='backyrd_consume_launch_cost_boundary_v1'?{allowed:true}:{not_committed:true,id:res,revision:2},senderReady:async()=>{throw Error('must not run');}});const result=await http.handleMailSummary(request(),later.d);assert.equal((await result.json()).data.not_committed,true);
});
test('SQL denial, Safety, recipient suppression and conflict are typed refusals without raw details',async()=>{
 for(const [code,detail,status,expected]of[['42501','booking_operator_required',403,'access_denied'],['P0001','SAFETY_WRITE_RESTRICTED',403,'access_denied'],['40001','booking_changed_reload',409,'changed'],['22023','booking_mail_recipient_blocked',409,'recipient_blocked'],['22023','booking_request_reused',409,'request_reused'],['22023','booking_mail_summary_rate_limited',429,'rate_limited']]){
  const f=fixture();f.d.rpc=async name=>{if(name==='backyrd_consume_launch_cost_boundary_v1')return{allowed:true};throw new rpcModule.BookingRpcRejection(code,detail);};const response=await http.handleMailSummary(request(),f.d);assert.equal(response.status,status);assert.equal((await response.json()).error,expected);
 }
});
const ring=id=>security.guestSealKeys(id,JSON.stringify({[id]:randomBytes(32).toString('base64')}));
const config={origin:'https://booking.example',from:'booking@booking.example',scope:'summary-tests',apiKey:'synthetic-provider-key',guestKeys:{active:'missing',keys:{}},payloadKeys:ring('payload'),bindingKeys:ring('binding')};
const summary=(status='confirmed',starts='2030-10-27T00:30:00Z')=>({id:message,spot_id:spot,reservation_id:res,reservation_revision:1,event_kind:'changed',lease_id:lease,payload_sealed:null,payload_digest:null,payload_context:null,context_hash:'a'.repeat(64),snapshot:{message_mode:'manual_summary',reservation_id:res,spot_id:spot,revision:1,restaurant_name:'Restaurant <script>',guest_name:'Guest <script>',email:intent.email,party_size:2,starts_at:starts,ends_at:new Date(Date.parse(starts)+3600000).toISOString(),status,guest_notice:'INVENTED_POLICY',note:'PRIVATE_NOTE'}});
test('manual mail uses actual booking facts without credentials, invented terms or internal text',()=>{
 const claim=mail.parseMailClaim(summary(),lease);const envelope=mail.buildMailEnvelope(claim,config),body=JSON.parse(envelope.body);assert.deepEqual(body.to,[intent.email]);assert.ok(body.html.includes('&lt;script&gt;'));assert.match(body.text,/bestätigt/);assert.doesNotMatch(envelope.body,/PRIVATE_NOTE|INVENTED_POLICY|booking\/manage|Online-Stornierungsfrist:|key_hash|sealed_key/);assert.match(body.text,/GMT\+2/);
 const sealed=mail.sealMailEnvelope(envelope,config.payloadKeys);assert.equal(mail.openMailEnvelope(sealed.sealed,message,sealed.digest,config).body,envelope.body);
});
test('pending, declined and cancelled manual messages never fabricate a confirmed table',()=>{
 for(const [status,word]of[['pending','noch nicht bestätigt'],['declined','abgelehnt'],['cancelled','storniert']]){const body=JSON.parse(mail.buildMailEnvelope(mail.parseMailClaim(summary(status),lease),config).body);assert.ok(body.text.includes(word));assert.ok(!body.text.includes('Deine Reservierung ist bestätigt.'));}
});
test('both autumn-fold instants are distinguished in the email and wrong mode/revision fails closed',()=>{
 const a=JSON.parse(mail.buildMailEnvelope(mail.parseMailClaim(summary('confirmed','2030-10-27T00:30:00Z'),lease),config).body),b=JSON.parse(mail.buildMailEnvelope(mail.parseMailClaim(summary('confirmed','2030-10-27T01:30:00Z'),lease),config).body);assert.match(a.text,/02:30 GMT\+2/);assert.match(b.text,/02:30 GMT\+1/);
 const bad=summary();bad.snapshot.revision=0;assert.throws(()=>mail.parseMailClaim(bad,lease));const unknown=summary();unknown.snapshot.message_mode='marketing';assert.throws(()=>mail.parseMailClaim(unknown,lease));
});
test('native staff recipient projection validates mode and only the canonical scoped manual address',()=>{
 const api=load('../lib/booking-api.ts',{'@/lib/supabase/client':{supabase:{}}});
 const messageRow={id:message,revision:1,kind:'changed',state:'pending',created_at:'2026-10-21T12:00:00Z',updated_at:'2026-10-21T12:00:00Z',attempts:0,prepared:false,first_attempt_at:null,next_attempt_at:'2026-10-21T12:00:00Z',superseded:false,delayed:false,message_mode:'manual_summary',recipient:intent.email};
 const body={reservation_id:res,revision:1,observed_at:'2026-10-21T12:00:00Z',guest_access:'none',delivery_blocked:false,messages:[messageRow],next_cursor:null};
 assert.equal(api.parseBookingMail(body,res).messages[0].recipient,intent.email);assert.throws(()=>api.parseBookingMail({...body,messages:[{...messageRow,recipient:'phone text'}]},res));assert.throws(()=>api.parseBookingMail({...body,messages:[{...messageRow,message_mode:'self_service'}]},res));
});
