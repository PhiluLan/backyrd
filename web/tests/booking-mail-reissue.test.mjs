import assert from "node:assert/strict";
import test from "node:test";
import { createHash, webcrypto } from "node:crypto";
import { createBookingTsLoader } from "./helpers/booking-ts-runtime.mjs";
const load = createBookingTsLoader(import.meta.url);
const guest = load("../lib/booking-guest-contract.ts");
const security = load("../lib/booking-guest-security.ts", { "./booking-guest-contract": guest });
const transport = load("../lib/booking-service-rpc.ts", { "./booking-guest-contract": guest, "./booking-guest-security": security });
const mail = load("../lib/booking-mail.ts", { "./booking-guest-contract": guest, "./booking-guest-security": security });
const contract = load("../lib/booking-mail-reissue-contract.ts", { "./booking-guest-contract": guest });
const http = load("../lib/booking-mail-reissue-http.ts", { "./booking-guest-contract": guest, "./booking-guest-security": security, "./booking-service-rpc": transport, "./booking-mail": mail, "./booking-mail-reissue-contract": contract });
const spot = "51000000-0000-4000-8000-000000000001", res = "51000000-0000-4000-8000-000000000002", actor = "51000000-0000-4000-8000-000000000003", nonce = "51000000-0000-4000-8000-000000000004", creation = "51000000-0000-4000-8000-000000000005", message = "51000000-0000-4000-8000-000000000006";
const digest = s => createHash("sha256").update(s,"utf8").digest("hex");
const intent = { spotId: spot, reservationId: res, requestId: nonce, revision: 0, contactHash: digest("guest@booking.invalid") };
const queued = { id: res, revision: 1, message_id: message, queued_at: "2026-10-21T12:00:00Z" };
const request = (body = { ...intent, operation: "issue" }, headers = {}) => new Request("https://booking.example/api/booking/mail/reissue", { method: "POST", headers: { origin: "https://booking.example", "Content-Type": "application/json", Authorization: "Bearer synthetic-test-bearer", ...headers }, body: JSON.stringify(body) });
function fixture(overrides = {}) {
  const calls = [], seals = [];
  const d = { origin: "https://booking.example", actor: async () => actor, senderReady: async () => true,
    seal(key, spotId, creationId) { seals.push({ key, spotId, creationId }); return "sealed_test_guest_key"; },
    async rpc(name,args) { calls.push({name,args});
      if (name === "backyrd_consume_launch_cost_boundary_v1") return { allowed: true };
      if (name === "booking_mail_reissue_recover_v1") return null;
      if (name === "booking_mail_reissue_context_v1") return { reservation_id: res, creation_request_id: creation, revision: 0, email: "guest@booking.invalid" };
      if (name === "booking_mail_reissue_v1") return queued;
      throw new Error("unexpected_rpc");
    }, ...overrides };
  return { d, calls, seals };
}

test("reissue contract strips extras from outcomes and fences identity revision and unexpected body fields", () => {
  assert.equal(contract.parseMailReissueRequest({ ...intent, operation: "issue" }).revision,0);
  assert.throws(() => contract.parseMailReissueRequest({ ...intent, operation: "issue", actorId: actor }));
  for (const invalid of [{ ...queued, id: spot }, { ...queued, revision: 0 }, { ...queued, message_id: "invalid" }, { ...queued, queued_at: "never" }]) assert.throws(() => contract.parseMailReissueResult(invalid,intent));
  const safe = contract.parseMailReissueResult({ ...queued, key: "SECRET", sealed_key: "SECRET" },intent);
  assert.equal(JSON.stringify(safe).includes("SECRET"),false);
  assert.equal(contract.parseMailReissueResult({ not_committed:true,id:res,revision:2 },intent).not_committed,true);
  assert.throws(() => contract.parseMailReissueResult({ not_committed:true,id:res,revision:0 },intent));
});

test("reissue gateway binds verified actor current contact and original creation nonce without returning credentials", async () => {
  const f = fixture(); const r = await http.handleMailReissue(request(),f.d);
  assert.equal(r.status,200); const result = await r.text(); assert.equal(result.includes("sealed_"),false);
  assert.equal(f.seals.length,1); assert.equal(f.seals[0].creationId,creation); assert.equal(f.seals[0].spotId,spot);
  const commit = f.calls.at(-1); assert.equal(commit.args.p_actor,actor); assert.equal(commit.args.p_key_hash,security.hashGuestKey(f.seals[0].key)); assert.equal(commit.args.p_sealed_key,"sealed_test_guest_key");
  assert.match(r.headers.get("cache-control"),/no-store/); assert.equal(r.headers.get("referrer-policy"),"no-referrer");
});

test("reissue replay and read-only recovery require no sender or encryption readiness", async () => {
  for (const operation of ["issue","recover"]) {
    const f = fixture({ senderReady: async()=>{ throw new Error("must_not_check"); }, seal:()=>{throw new Error("must_not_seal");} });
    const rpc = f.d.rpc;
    f.d.rpc = async(name,args)=>name === "booking_mail_reissue_recover_v1" ? queued : rpc(name,args);
    const r = await http.handleMailReissue(request({...intent,operation}),f.d);
    assert.equal(r.status,200); assert.equal((await r.json()).data.message_id,message);
    assert.equal(f.calls.some(c=>c.name === "booking_mail_reissue_v1"),false);
  }
  const f = fixture({senderReady:async()=>{throw new Error("must_not_check");}});
  const r = await http.handleMailReissue(request({...intent,operation:"recover"}),f.d);
  assert.equal((await r.json()).data,null); assert.equal(f.seals.length,0);
});

test("reissue permanently obsolete intent settles only from canonical monotonic-revision evidence", async () => {
  const f=fixture(); const rpc=f.d.rpc;
  f.d.rpc=async(name,args)=>name === "booking_mail_reissue_recover_v1" ? {not_committed:true,id:res,revision:3} : rpc(name,args);
  const r=await http.handleMailReissue(request(),f.d);
  assert.equal(r.status,200); assert.equal((await r.json()).data.not_committed,true); assert.equal(f.seals.length,0);
});

test("unready sender bad contact or sealing failure cannot rotate a guest capability", async () => {
  for (const mode of ["sender","seal","contact","context"]) {
    const f=fixture({senderReady:async()=>mode!=="sender", seal:()=>{throw new Error("seal_unavailable");}});
    const rpc=f.d.rpc;
    if(mode==="contact" || mode==="context") f.d.rpc=async(name,args)=>name === "booking_mail_reissue_context_v1" ? { reservation_id: mode === "context" ? spot : res, creation_request_id:creation, revision:0,email:"different@booking.invalid" } : rpc(name,args);
    const r=await http.handleMailReissue(request(),f.d); assert.equal(r.status,503); assert.equal((await r.json()).outcome,"rejected"); assert.equal(f.calls.some(c=>c.name==="booking_mail_reissue_v1"),false);
  }
});

test("lost commit reply and malformed committed output remain explicitly unknown", async () => {
  for(const mode of ["lost","malformed"]){
    const f=fixture();const rpc=f.d.rpc;
    f.d.rpc=async(name,args)=>name === "booking_mail_reissue_v1" ? (mode === "lost" ? Promise.reject(new Error("lost")) : {...queued,id:spot}) : rpc(name,args);
    const r=await http.handleMailReissue(request(),f.d); assert.equal(r.status,503); assert.equal((await r.json()).outcome,"unknown");
  }
});

test("reissue gateway rejects authentication origin oversized body actor injection and exhausted quotas", async () => {
  const f=fixture({actor:async()=>null});assert.equal((await http.handleMailReissue(request(),f.d)).status,401);
  const normal=fixture();assert.equal((await http.handleMailReissue(request(undefined,{origin:"https://attacker.invalid"}),normal.d)).status,403);
  assert.equal((await http.handleMailReissue(request({...intent,operation:"issue",actorId:actor}),normal.d)).status,400);
  assert.equal((await http.handleMailReissue(request({...intent,operation:"issue",extra:"x".repeat(5000)}),normal.d)).status,400);
  const quota=fixture({rpc:async()=>({allowed:false})});assert.equal((await http.handleMailReissue(request(),quota.d)).status,429);
  assert.equal(normal.calls.length,0);
});

test("canonical role Safety stale recipient and legacy-review refusals are honest non-writes", async () => {
  for(const [code,message,status,error] of [["42501","booking_operator_required",403,"access_denied"],["P0001","SAFETY_WRITE_RESTRICTED",403,"access_denied"],["40001","booking_changed_reload",409,"changed"],["22023","booking_mail_recipient_blocked",409,"recipient_blocked"],["22023","booking_mail_legacy_review_required",409,"review_required"],["22023","booking_mail_reissue_rate_limited",429,"rate_limited"]]) {
    const f=fixture({rpc:async name=>name === "backyrd_consume_launch_cost_boundary_v1" ? {allowed:true} : Promise.reject(new transport.BookingRpcRejection(code,message))});
    const r=await http.handleMailReissue(request(),f.d); assert.equal(r.status,status);assert.equal((await r.json()).error,error);assert.equal(f.seals.length,0);
  }
});

test("browser hashes exact Unicode contact bytes and prevents a switched actor from sending", async () => {
  let actorId=actor,requests=0;
  const client=load("../lib/booking-mail-reissue-client.ts",{"./owner-api":{requireOwnerSession:async()=>({user:{id:actorId},access_token:"synthetic-bearer"})},"./booking-mail-reissue-contract":contract},{crypto:webcrypto,TextEncoder,fetch:async()=>{requests++;return Response.json({data:queued});}});
  assert.equal(await client.mailContactHash("İnfo@booking.invalid"),digest("İnfo@booking.invalid"));
  assert.equal((await client.reissueBookingMail(intent,actor)).message_id,message);
  actorId=spot; await assert.rejects(client.reissueBookingMail(intent,actor),e=>e.status === 401);assert.equal(requests,1);
});

test("reissue factory preserves recovery with dispatch disabled and verifies a bounded bearer afresh", async () => {
  let authCalls=0;
  const env={BOOKING_GUEST_ORIGIN:"https://booking.example",NEXT_PUBLIC_SUPABASE_URL:"https://backend.example",SUPABASE_SERVICE_ROLE_KEY:"synthetic-service-key",NODE_ENV:"production"};
  const factory=load("../lib/booking-mail-reissue-server.ts",{"./owner-billing/server":{ownerActor:async req=>{authCalls++; assert.match(req.headers.get("authorization"),/^Bearer /);return {id:actor};}},"./booking-mail-server":{mailJobDependencies:()=>null},"./booking-service-rpc":transport,"./booking-guest-security":security},{process:{env}});
  const d=factory.mailReissueDependencies(); assert.ok(d); assert.equal(await d.senderReady(),false);
  assert.equal(await d.actor(new Request("https://booking.example",{headers:{authorization:"Bearer short"}})),null);assert.equal(authCalls,0);
  assert.equal(await d.actor(new Request("https://booking.example",{headers:{authorization:"Bearer valid_synthetic_bearer_token"}})),actor);assert.equal(authCalls,1);
  env.BOOKING_GUEST_ORIGIN="http://attacker.example";assert.equal(factory.mailReissueDependencies(),null);
});
