// Explicitly invoked against a disposable canonical Supabase boot; never part
// of normal unit discovery. Provider sends are always intercepted in this file.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { createBookingTsLoader } from "../tests/helpers/booking-ts-runtime.mjs";

if (process.env.BACKYRD_BOOKING_INTEGRATION_EPHEMERAL !== "1") throw new Error("disposable_database_opt_in_required");
const api = new URL(process.env.API_URL ?? ""), database = new URL(process.env.DB_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(api.hostname) || !["127.0.0.1", "localhost"].includes(database.hostname) || api.protocol !== "http:" || database.protocol !== "postgresql:" || Number(database.port) !== Number(api.port) + 1) throw new Error("loopback_canonical_database_required");
const serviceKey = process.env.SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error("local_service_key_required");
function sql(statement) {
  // Credentials stay in the child environment, never in argv or printed output.
  return execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { input: statement, encoding: "utf8", env: { ...process.env, PGHOST: database.hostname, PGPORT: database.port, PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: database.pathname.slice(1) } }).trim();
}
assert.equal(sql("select max(version) from supabase_migrations.schema_migrations;"), "20261021015302");
const load = createBookingTsLoader(import.meta.url);
const contract = load("../lib/booking-guest-contract.ts");
const security = load("../lib/booking-guest-security.ts", { "./booking-guest-contract": contract });
const transport = load("../lib/booking-service-rpc.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security });
const guest = load("../lib/booking-guest-handler.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security, "./booking-service-rpc": transport });
const mail = load("../lib/booking-mail.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security });
const provider = load("../lib/booking-mail-provider.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security, "./booking-mail": mail });
const webhook = load("../lib/booking-mail-webhook.ts", { "./booking-guest-contract": contract, "./booking-mail": mail });
const http = load("../lib/booking-mail-http.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security, "./booking-mail": mail, "./booking-mail-webhook": webhook });
const authEmail = `${randomUUID()}@booking.invalid`, authPassword = randomBytes(32).toString("base64url");
const createdUserResponse = await fetch(new URL("/auth/v1/admin/users", api), { method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: authEmail, password: authPassword, email_confirm: true }) });
assert.equal(createdUserResponse.status, 200, "local_auth_admin_fixture_failed");
const createdUser = await createdUserResponse.json();
const sessionResponse = await fetch(new URL("/auth/v1/token?grant_type=password", api), { method: "POST", headers: { apikey: process.env.ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: authEmail, password: authPassword }) });
assert.equal(sessionResponse.status, 200, "local_auth_fixture_login_failed");
const session = await sessionResponse.json();
const verifiedActor = load("../lib/owner-billing/server.ts", {}, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: api.origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: serviceKey } } });
const reissueContract = load("../lib/booking-mail-reissue-contract.ts", { "./booking-guest-contract": contract });
const reissue = load("../lib/booking-mail-reissue-http.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security, "./booking-service-rpc": transport, "./booking-mail": mail, "./booking-mail-reissue-contract": reissueContract });
const owner = createdUser.id, spot = randomUUID(), area = randomUUID(), table = randomUUID(), service = randomUUID();
const startsAt = sql(`select to_char((((clock_timestamp() at time zone 'Europe/Zurich')::date+1+time '18:00') at time zone 'Europe/Zurich') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');`);
sql(`
begin;
insert into public.spots(id,name,lat,lng,owner_id,status) values('${spot}','HTTP mail integration fixture',47.5,7.5,'${owner}','approved');
set local role authenticated;
select set_config('request.jwt.claim.sub','${owner}',true);
select set_config('request.jwt.claims','{"sub":"${owner}","role":"authenticated"}',true);
select public.booking_console_save_setup_v1('${spot}',0,jsonb_build_object('duration_minutes',60,'max_party_size',4,
 'areas',jsonb_build_array(jsonb_build_object('id','${area}','name','Room','is_active',true)),
 'tables',jsonb_build_array(jsonb_build_object('id','${table}','area_id','${area}','label','1','seats',4,'is_active',true)),
 'services',jsonb_build_array(jsonb_build_object('id','${service}','name','Day','weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','00:00','closes_at','23:59','interval_minutes',30,'is_active',true))));
select public.booking_console_save_public_settings_v1('${spot}',1,true,array['${service}'::uuid],60,90,120,'confirmed','privacy@booking.invalid');
commit;
`);
const rpc = transport.createBookingServiceRpc({ url: api.origin, key: serviceKey, development: true }, new Set(["backyrd_consume_launch_cost_boundary_v1", "booking_guest_availability_v1", "booking_guest_create_v1", "booking_guest_recover_v1", "booking_guest_checkout_recover_v1", "booking_guest_read_v1", "booking_guest_cancel_v1", "booking_mail_claim_v1", "booking_mail_prepare_v1", "booking_mail_begin_v1", "booking_mail_finish_v1", "booking_mail_event_v1", "booking_mail_reissue_recover_v1", "booking_mail_reissue_context_v1", "booking_mail_reissue_v1"]));
const ring = id => security.guestSealKeys(id, JSON.stringify({ [id]: randomBytes(32).toString("base64") }));
const config = { origin: "https://booking.example", from: "booking@booking.example", scope: "isolated-integration", apiKey: "synthetic-provider-key-never-sent", guestKeys: ring("guest"), payloadKeys: ring("mail"), bindingKeys: ring("binding") };
const dependencies = { origin: config.origin, newIntakeReady: true, rpc, subject: () => `integration-${spot}`, verifyChallenge: async () => true, seal: (key, spot, request) => security.sealGuestKey(key, spot, request, config.guestKeys) };
async function guestCall(body) {
  const response = await guest.handleGuestRequest(new Request(`${config.origin}/api/booking/guest`, { method: "POST", headers: { origin: config.origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }), dependencies);
  const result = await response.json();
  assert.equal(response.status, 200, `guest_${body.operation}_${result.error ?? "invalid"}`);
  return result.data;
}
const rawKey = randomBytes(32).toString("base64url"), createId = randomUUID(), email = `${randomUUID()}@booking.invalid`;
const create = { operation: "create", acceptedPolicy: true, spotId: spot, requestId: createId, policyRevision: 1, startsAt, partySize: 2, name: "HTTP Guest <script>", email, key: rawKey, note: "PRIVATE_HTTP_NOTE", challenge: "synthetic-proof-for-isolated-test" };
const deniedPolicy = await guest.handleGuestRequest(new Request(`${config.origin}/api/booking/guest`, { method: "POST", headers: { origin: config.origin, "Content-Type": "application/json" }, body: JSON.stringify({ ...create, acceptedPolicy: false }) }), dependencies);
assert.equal(deniedPolicy.status, 400);
assert.equal(sql(`select count(*) from public.booking_reservations where spot_id='${spot}';`),"0");
const publicAvailability = await guestCall({ operation: "availability", spotId: spot, date: startsAt.slice(0,10), partySize: 2 });
assert.equal(publicAvailability.max_party_size,4);
const receipt = await guestCall(create);
assert.equal(receipt.policy_snapshot.policy_revision,1);
assert.equal(receipt.revision, 0); assert.equal(receipt.status, "confirmed");
assert.equal((await guestCall({ operation: "read", reservationId: receipt.id, key: rawKey })).revision, 0);
let expectedEmail = email;
const sent = [];
const worker = { rpc, config, send: (body, idempotencyKey) => provider.sendBookingMail(body, idempotencyKey, config.apiKey, async (url, init) => {
  assert.equal(url, "https://api.resend.com/emails"); assert.equal(init.method, "POST");
  const content = JSON.parse(init.body);
  assert.deepEqual(content.to, [expectedEmail]); assert.ok(!init.body.includes("PRIVATE_HTTP_NOTE")); assert.ok(content.html.includes("&lt;script&gt;"));
  const id = randomUUID(); sent.push({ id, content, body: init.body, idempotencyKey });
  return Response.json({ id }); // Only this mock sees the outbound email.
}) };
assert.equal(await mail.dispatchOneMail(worker), "accepted");
assert.equal(sql(`select state from booking_private.guest_mail_outbox_v1 where reservation_id='${receipt.id}';`), "accepted");
const secret = `whsec_${randomBytes(32).toString("base64")}`;
let eventIndex = 0;
async function callback(message, kind, eventId = `integration_${spot}_${++eventIndex}`) {
  const raw = JSON.stringify({ type: kind, created_at: new Date().toISOString(), data: { email_id: message.id, tags: Object.fromEntries(message.content.tags.map(tag => [tag.name, tag.value])), to: message.content.to } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${eventId}.${timestamp}.${raw}`).digest("base64");
  const response = await http.handleMailCallback(new Request(`${config.origin}/api/booking/mail/events`, { method: "POST", body: raw, headers: { "Content-Type": "application/json", "svix-id": eventId, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` } }), { config, secrets: [secret], rpc });
  assert.equal(response.status, 200);
}
await callback(sent[0], "email.delivered");
await callback(sent[0], "email.sent");
assert.equal(sql(`select state from booking_private.guest_mail_outbox_v1 where reservation_id='${receipt.id}';`), "delivered");
const cancelId = randomUUID();
const cancel = { operation: "cancel", reservationId: receipt.id, requestId: cancelId, revision: 0, key: rawKey };
const cancelled = await guestCall(cancel);
assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.revision, 1);
assert.equal((await guestCall(cancel)).revision, 1);
assert.equal(sql(`select count(*) from booking_private.guest_mail_outbox_v1 where reservation_id='${receipt.id}';`), "2");
assert.equal(await mail.dispatchOneMail(worker), "accepted");
assert.equal(sent.length, 2); assert.ok(sent[1].content.text.includes("Diese Reservierung ist storniert")); assert.notEqual(sent[0].idempotencyKey, sent[1].idempotencyKey);
await callback(sent[1], "email.suppressed");
assert.equal(sql(`select state from booking_private.guest_mail_outbox_v1 where reservation_id='${receipt.id}' and event_kind='cancelled';`), "suppressed");
assert.equal((await guestCall({ operation: "read", reservationId: receipt.id, key: rawKey })).status, "cancelled");
// Creation replay deliberately returns its original result; recovery must read current state.
assert.equal((await guestCall({ ...create, challenge: "renewed-synthetic-proof" })).status, "confirmed");
assert.equal((await guestCall({ operation: "recover", spotId: spot, requestId: createId, key: rawKey })).status, "cancelled");
assert.equal(sql(`select count(*) from booking_private.guest_mail_outbox_v1 where reservation_id='${receipt.id}';`), "2");

// A second booking exercises real Auth verification and all reissue RPCs over
// PostgREST. Only provider acceptance/readiness remain deliberate test doubles.
const secondCreate = { ...create, requestId: randomUUID(), key: randomBytes(32).toString("base64url"), email: `${randomUUID()}@booking.invalid` };
const second = await guestCall(secondCreate);
const reissueDependencies = { origin: config.origin, rpc, actor: async request => (await verifiedActor.ownerActor(request))?.id ?? null, senderReady: async () => true, seal: dependencies.seal };
const intent = { spotId: spot, reservationId: second.id, requestId: randomUUID(), revision: 0, contactHash: createHash("sha256").update(secondCreate.email,"utf8").digest("hex") };
function reissueRequest(intent, operation = "issue", token = session.access_token) { return new Request(`${config.origin}/api/booking/mail/reissue`, { method: "POST", headers: { origin: config.origin, "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...intent, operation }) }); }
const missingAuth = await reissue.handleMailReissue(reissueRequest(intent, "issue", "forged-not-a-valid-access-token"), reissueDependencies);
assert.equal(missingAuth.status, 401);
let lost = true;
const lostDependencies = { ...reissueDependencies, async rpc(name, args) { const result = await rpc(name, args); if (name === "booking_mail_reissue_v1" && lost) { lost = false; throw new Error("simulated_lost_after_commit"); } return result; } };
const unknown = await reissue.handleMailReissue(reissueRequest(intent), lostDependencies);
assert.equal(unknown.status, 503); assert.equal((await unknown.json()).outcome, "unknown");
const recovered = await reissue.handleMailReissue(reissueRequest(intent), { ...reissueDependencies, senderReady: async () => { throw new Error("recovery_must_not_need_sender"); }, seal: () => { throw new Error("recovery_must_not_rotate"); } });
assert.equal(recovered.status, 200); const firstIssue = (await recovered.json()).data;
assert.equal(firstIssue.revision, 1); assert.equal(JSON.stringify(firstIssue).includes("sealed"), false);
const readNewKey = () => { const access = JSON.parse(sql(`select json_build_object('sealed',sealed_key,'hash',key_hash) from booking_private.guest_access_v1 where reservation_id='${second.id}';`)); return security.openGuestKey(access.sealed, spot, secondCreate.requestId, access.hash, config.guestKeys); };
const secondKey = readNewKey(); assert.notEqual(secondKey, secondCreate.key);
assert.equal((await guestCall({ operation: "read", reservationId: second.id, key: secondKey })).cancellation_deadline, second.cancellation_deadline);
const oldRead = await guest.handleGuestRequest(new Request(`${config.origin}/api/booking/guest`, { method: "POST", headers: { origin: config.origin, "Content-Type": "application/json" }, body: JSON.stringify({ operation: "read", reservationId: second.id, key: secondCreate.key }) }), dependencies);
assert.equal(oldRead.status, 404);
expectedEmail = secondCreate.email;
assert.equal(await mail.dispatchOneMail(worker), "accepted");
assert.ok(sent.at(-1).content.text.includes(`key=${secondKey}`));
const actualActor = await verifiedActor.ownerActor(reissueRequest(intent)); assert.equal(actualActor.id, owner);
const current = await actualActor.client.rpc("booking_console_read_v1", { p_spot_id: spot, p_date: startsAt.slice(0,10) });
assert.equal(current.error, null); const currentReservation = current.data.reservations.find(r => r.id === second.id); assert.ok(currentReservation);
const correctedEmail = `${randomUUID()}@booking.invalid`;
const amendment = await actualActor.client.rpc("booking_console_amend_v2", { p_spot_id: spot, p_reservation_id: second.id, p_request_id: randomUUID(), p_expected_revision: 1, p_service_id: currentReservation.service_id, p_table_id: currentReservation.table_id, p_table_ids: currentReservation.table_ids, p_combination_id: currentReservation.combination_id, p_starts_at: currentReservation.starts_at, p_duration_minutes: 60, p_party_size: 2, p_guest_name: currentReservation.guest_name, p_guest_contact: correctedEmail, p_note: null });
assert.equal(amendment.error, null);
const correctedIntent = { ...intent, requestId: randomUUID(), revision: 2, contactHash: createHash("sha256").update(correctedEmail,"utf8").digest("hex") };
const corrected = await reissue.handleMailReissue(reissueRequest(correctedIntent), reissueDependencies); assert.equal(corrected.status, 200);
const correctedKey = readNewKey(); assert.notEqual(correctedKey, secondKey);
await callback(sent[2], "email.bounced");
assert.equal(sql(`select delivery_blocked_at is null from booking_private.guest_access_v1 where reservation_id='${second.id}';`), "t");
expectedEmail = correctedEmail;
assert.equal(await mail.dispatchOneMail(worker), "accepted");
assert.ok(sent.at(-1).content.text.includes(`key=${correctedKey}`));
await callback(sent.at(-1), "email.delivered");
assert.equal((await guestCall({ operation: "read", reservationId: second.id, key: correctedKey })).revision, 3);
const originalOutcome = await reissue.handleMailReissue(reissueRequest(intent,"recover"), { ...reissueDependencies, senderReady: async()=>false });
assert.equal((await originalOutcome.json()).data.message_id, firstIssue.message_id);
assert.equal(sql(`select count(*) from booking_private.reservation_requests_v2 where reservation_id='${second.id}' and request_kind='guest_reissue';`), "2");
assert.equal(sql(`select count(*) from booking_private.guest_mail_outbox_v1 where reservation_id='${second.id}';`), "3");
assert.equal(sent.length,4);

// Actual user-JWT publication intents keep their nonce across retries. New
// public text cannot replace the policy saved with an existing guest booking.
const publicRead = await actualActor.client.rpc("booking_console_public_settings_v2", { p_spot_id: spot });
assert.equal(publicRead.error,null);assert.equal(publicRead.data.actor_id,owner);
const rules = publicRead.data.settings;
const nextRules = { enabled: true, service_ids: rules.service_ids, notice_minutes: rules.notice_minutes, horizon_days: rules.horizon_days, cancellation_minutes: 0, confirmation_status: "pending", privacy_contact: rules.privacy_contact, guest_notice: "New rules for future guests" };
const settingsRequest = { p_spot_id: spot, p_request_id: randomUUID(), p_revision: publicRead.data.restaurant_revision, p_settings: nextRules };
const savedRules = await actualActor.client.rpc("booking_console_save_public_settings_v2", settingsRequest);assert.equal(savedRules.error,null);
const replayRules = await actualActor.client.rpc("booking_console_save_public_settings_v2",settingsRequest);assert.equal(replayRules.error,null);assert.deepEqual(replayRules.data,savedRules.data);
const recoveredRules = await actualActor.client.rpc("booking_console_public_settings_recover_v1",settingsRequest);assert.equal(recoveredRules.error,null);assert.deepEqual(recoveredRules.data,savedRules.data);
const badRules = await actualActor.client.rpc("booking_console_save_public_settings_v2", { ...settingsRequest, p_settings: { ...nextRules, enabled: false } });assert.equal(badRules.error.code,"22023");
const retained = await guestCall({ operation: "read", reservationId: second.id, key: correctedKey });
assert.equal(retained.policy_snapshot.cancellation_minutes,120);assert.equal(retained.policy_snapshot.guest_notice,"");
const uncommittedRequest = { operation: "checkout_recover", spotId: spot, requestId: randomUUID(), key: randomBytes(32).toString("base64url"), policyRevision: 1, startsAt };
const terminal = await guestCall(uncommittedRequest);assert.equal(terminal.not_committed,true);assert.equal(terminal.request_id,uncommittedRequest.requestId);
const pause = await actualActor.client.rpc("booking_console_save_public_settings_v1", { p_spot_id: spot, p_revision: savedRules.data.restaurant_revision, p_enabled: false, p_service_ids: rules.service_ids, p_notice_minutes:60, p_horizon_days:90, p_cancellation_minutes:0, p_confirmation_status:"pending", p_privacy_contact:rules.privacy_contact, p_guest_notice: "Paused rule fixture" });assert.equal(pause.error,null);
const privateProbe = await guest.handleGuestRequest(new Request(`${config.origin}/api/booking/guest`,{method:"POST",headers:{origin:config.origin,"Content-Type":"application/json"},body:JSON.stringify({...uncommittedRequest,requestId:randomUUID(),policyRevision:2})}),{...dependencies,newIntakeReady:false});assert.equal(privateProbe.status,404);
const committedWhilePaused = await guest.handleGuestRequest(new Request(`${config.origin}/api/booking/guest`,{method:"POST",headers:{origin:config.origin,"Content-Type":"application/json"},body:JSON.stringify({operation:"checkout_recover",spotId:spot,requestId:secondCreate.requestId,key:correctedKey,policyRevision:1,startsAt})}),{...dependencies,newIntakeReady:false});assert.equal(committedWhilePaused.status,200);assert.equal((await committedWhilePaused.json()).data.id,second.id);
console.log("BOOKING_REAL_HTTP_RPC_MAIL_INTEGRATION_PASS: revision-zero guest lifecycle, explicit policy review and frozen terms; real Auth-verified reissue and recipient-bound callbacks; user-JWT publication intents/replay/recovery and public checkout settlement without paused-policy disclosure; four intercepted provider requests, no real provider send.");
