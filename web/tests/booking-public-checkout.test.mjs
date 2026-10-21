import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { createBookingTsLoader } from "./helpers/booking-ts-runtime.mjs";
const load=createBookingTsLoader(import.meta.url);
const contract=load("../lib/booking-guest-contract.ts");
const state=load("../lib/booking-checkout-state.ts",{"./booking-guest-contract":contract},{crypto:webcrypto,btoa});
const time=load("../lib/booking-guest-time.ts");
const routes=load("../lib/booking-guest-routes.ts");
const spot="51000000-0000-4000-8000-000000000001", res="51000000-0000-4000-8000-000000000002", nonce="51000000-0000-4000-8000-000000000003", other="51000000-0000-4000-8000-000000000004";
const key=state.newGuestCheckoutKey();
const intent={operation:"create",spotId:spot,requestId:nonce,policyRevision:1,startsAt:"2026-10-25T00:30:00Z",partySize:2,name:"Synthetic guest",email:"guest@booking.invalid",key,note:"",acceptedPolicy:true};
const policy={policy_revision:1,cancellation_minutes:120,confirmation_status:"pending",privacy_contact:"privacy@booking.invalid",guest_notice:"Bitte rechtzeitig absagen."};
const pending={kind:"pending",intent,policy,restaurantName:"Synthetic Restaurant"};
const receipt={id:res,spot_id:spot,name:"Synthetic Restaurant",guest_name:"Synthetic guest",party_size:2,starts_at:intent.startsAt,ends_at:"2026-10-25T01:30:00Z",status:"confirmed",revision:0,cancellation_deadline:"2026-10-24T22:30:00Z"};

test("checkout requires explicit reviewed policy and strips transient human proof from tab intents",()=>{
  assert.throws(()=>contract.parseGuestRequest({...intent,challenge:"proof",acceptedPolicy:false}));
  const {acceptedPolicy,...missing}=intent;void acceptedPolicy;assert.throws(()=>contract.parseGuestRequest({...missing,challenge:"proof"}));
  assert.equal(state.parseCheckoutStored(pending,spot).intent.requestId,nonce);
  assert.throws(()=>state.parseCheckoutStored({...pending,intent:{...intent,challenge:"SINGLE_USE_SECRET"}},spot));
  for(const bad of [{...pending,intent:{...intent,spotId:other}},{...pending,policy:{...policy,policy_revision:2}},{...pending,intent:{...intent,key:"bad"}}])assert.throws(()=>state.parseCheckoutStored(bad,spot));
  assert.notEqual(state.newGuestCheckoutKey(),key);assert.equal(contract.guestKey(key),key);
});

test("terminal checkout recovery is bound to exact nonce policy and start, while current receipts remain authoritative",()=>{
  const r={operation:"checkout_recover",spotId:spot,requestId:nonce,key,policyRevision:1,startsAt:intent.startsAt};
  const terminal={not_committed:true,spot_id:spot,request_id:nonce,policy_revision:1,starts_at:"2026-10-25T02:30:00+02:00"};
  assert.equal(contract.parseGuestCheckoutRecovery(terminal,r).not_committed,true);
  for(const bad of [{...terminal,spot_id:other},{...terminal,request_id:other},{...terminal,policy_revision:2},{...terminal,starts_at:"2026-10-25T01:30:00Z"}])assert.throws(()=>contract.parseGuestCheckoutRecovery(bad,r));
  assert.equal(contract.parseGuestCheckoutRecovery({...receipt,status:"cancelled",revision:3},r).status,"cancelled");
  const safe=contract.parseGuestCheckoutRecovery({...terminal,email:"PRIVATE",sealed_key:"PRIVATE"},r);assert.equal(JSON.stringify(safe).includes("PRIVATE"),false);
});

test("guest receipt preserves accepted text and accepts honest legacy missing snapshots",()=>{
  assert.equal(contract.parseGuestReceipt({...receipt,policy_snapshot:policy}).policy_snapshot.guest_notice,policy.guest_notice);
  assert.equal(contract.parseGuestReceipt({...receipt,policy_snapshot:null}).policy_snapshot,null);
  assert.equal(Object.hasOwn(contract.parseGuestReceipt(receipt),"policy_snapshot"),false);
  assert.throws(()=>contract.parseGuestReceipt({...receipt,policy_snapshot:{...policy,cancellation_minutes:-1}}));
  const safe=contract.parseGuestReceipt({...receipt,policy_snapshot:{...policy,owner_id:"PRIVATE"}});assert.equal(JSON.stringify(safe).includes("PRIVATE"),false);
});

test("guest cancellation recovery survives switching bookings and forgetting one link does not erase another",()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const api=load("../lib/booking-guest-storage.ts",{"./booking-guest-contract":contract},{sessionStorage:storage});
  const a={reservationId:res,key,cancellation:{requestId:nonce,revision:0}},b={reservationId:other,key:state.newGuestCheckoutKey(),cancellation:null};
  assert.equal(api.storeGuestCredential(a),true);assert.equal(api.storeGuestCredential(b),true);
  assert.equal(api.readGuestCredential().reservationId,other);assert.equal(api.readGuestCredential(res).cancellation.requestId,nonce);
  assert.equal(api.forgetGuestCredential(other),true);assert.equal(api.readGuestCredential(res).cancellation.revision,0);
  api.clearLatestGuestCredential();assert.equal(api.readGuestCredential(),null);assert.equal(api.readGuestCredential(res).key,key);
  storage.setItem("backyrd.booking.guest-link.v1",JSON.stringify(a));assert.equal(api.readGuestCredential().reservationId,res);
});

test("checkout durable storage has an explicit failure result and completion drops guest names and contacts",()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const api=load("../lib/booking-checkout-state.ts",{"./booking-guest-contract":contract},{sessionStorage:storage,crypto:webcrypto,btoa});
  assert.equal(api.saveCheckoutStored(spot,pending),true);assert.equal(api.readCheckoutStored(spot).intent.requestId,nonce);
  assert.equal(api.saveCheckoutStored(spot,{kind:"complete",reservationId:res,key}),true);
  const raw=storage.getItem(api.checkoutStorageKey(spot));assert.equal(raw.includes("guest@booking.invalid"),false);assert.equal(raw.includes("Synthetic guest"),false);
  assert.equal(api.clearCheckoutStored(spot),true);
  storage.setItem=()=>{throw new Error("storage_denied");};assert.equal(api.saveCheckoutStored(spot,pending),false);
});

test("guest routes bypass unrelated consumer auth only for exact public paths",()=>{
  for(const path of ["/booking/manage",`/booking/${spot}`,`/booking/${spot.toUpperCase()}`,`/booking/%35${spot.slice(1)}`])assert.equal(routes.isGuestBookingPath(path),true);
  for(const path of ["/booking/console","/booking/console/team",`/booking/${spot}/team`,"/booking/%63onsole","/booking/%2fconsole","/booking/%","/owner"])assert.equal(routes.isGuestBookingPath(path),false);
});

test("Swiss dates and repeated autumn times remain distinct with actual offsets",()=>{
  const slots=[{starts_at:"2026-10-25T00:30:00Z"},{starts_at:"2026-10-25T01:30:00Z"}];
  assert.match(time.guestSlotTime(slots[0].starts_at,slots),/GMT\+2/);assert.match(time.guestSlotTime(slots[1].starts_at,slots),/GMT\+1/);
  assert.equal(time.guestDate(new Date("2026-10-20T22:30:00Z")),"2026-10-21");
  assert.match(time.guestWhen(slots[1].starts_at),/GMT\+1/);
});

test("operator rule intents validate real values without fabricated response metadata",()=>{
  const api=load("../lib/booking-api.ts",{"./booking-table-layout":{},"./owner-api":{},"@/lib/supabase/client":{}});
  const values={enabled:true,serviceIds:[other],noticeMinutes:60,horizonDays:90,cancellationMinutes:0,confirmationStatus:"pending",privacyContact:"privacy@booking.invalid",guestNotice:"Hinweise"};
  assert.equal(api.parseBookingPublicIntent({requestId:nonce,revision:0,settings:values}).settings.cancellationMinutes,0);
  for(const bad of [{...values,serviceIds:[other,other]},{...values,horizonDays:0},{...values,cancellationMinutes:-1},{...values,noticeMinutes:1.5}])assert.throws(()=>api.parseBookingPublicIntent({requestId:nonce,revision:1,settings:bad}));
  const cfg=api.parseBookingPublicConfig({actor_id:res,restaurant_revision:2,observed_at:"2026-10-21T12:00:00Z",settings:null},spot);assert.equal(cfg.actorId,res);assert.equal(cfg.settings,null);
});
