// Explicitly invoked against a disposable canonical Supabase boot; never part
// of normal unit discovery. Provider sends are always intercepted in this file.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
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
assert.equal(sql("select max(version) from supabase_migrations.schema_migrations;"), "20261021001358");
const load = createBookingTsLoader(import.meta.url);
const contract = load("../lib/booking-guest-contract.ts");
const security = load("../lib/booking-guest-security.ts", { "./booking-guest-contract": contract });
const transport = load("../lib/booking-service-rpc.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security });
const guest = load("../lib/booking-guest-handler.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security, "./booking-service-rpc": transport });
const mail = load("../lib/booking-mail.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security });
const provider = load("../lib/booking-mail-provider.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security, "./booking-mail": mail });
const webhook = load("../lib/booking-mail-webhook.ts", { "./booking-guest-contract": contract, "./booking-mail": mail });
const http = load("../lib/booking-mail-http.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security, "./booking-mail": mail, "./booking-mail-webhook": webhook });
const owner = randomUUID(), spot = randomUUID(), area = randomUUID(), table = randomUUID(), service = randomUUID();
const startsAt = sql(`select to_char((((clock_timestamp() at time zone 'Europe/Zurich')::date+1+time '18:00') at time zone 'Europe/Zurich') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');`);
sql(`
begin;
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('${owner}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${owner}@booking.invalid',clock_timestamp(),'','{}','{}',now(),now());
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
const rpc = transport.createBookingServiceRpc({ url: api.origin, key: serviceKey, development: true }, new Set(["backyrd_consume_launch_cost_boundary_v1", "booking_guest_availability_v1", "booking_guest_create_v1", "booking_guest_recover_v1", "booking_guest_read_v1", "booking_guest_cancel_v1", "booking_mail_claim_v1", "booking_mail_prepare_v1", "booking_mail_begin_v1", "booking_mail_finish_v1", "booking_mail_event_v1"]));
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
const create = { operation: "create", spotId: spot, requestId: createId, policyRevision: 1, startsAt, partySize: 2, name: "HTTP Guest <script>", email, key: rawKey, note: "PRIVATE_HTTP_NOTE", challenge: "synthetic-proof-for-isolated-test" };
const receipt = await guestCall(create);
assert.equal(receipt.revision, 0); assert.equal(receipt.status, "confirmed");
assert.equal((await guestCall({ operation: "read", reservationId: receipt.id, key: rawKey })).revision, 0);
const sent = [];
const worker = { rpc, config, send: (body, idempotencyKey) => provider.sendBookingMail(body, idempotencyKey, config.apiKey, async (url, init) => {
  assert.equal(url, "https://api.resend.com/emails"); assert.equal(init.method, "POST");
  const content = JSON.parse(init.body);
  assert.deepEqual(content.to, [email]); assert.ok(!init.body.includes("PRIVATE_HTTP_NOTE")); assert.ok(content.html.includes("&lt;script&gt;"));
  const id = randomUUID(); sent.push({ id, content, body: init.body, idempotencyKey });
  return Response.json({ id }); // Only this mock sees the outbound email.
}) };
assert.equal(await mail.dispatchOneMail(worker), "accepted");
assert.equal(sql(`select state from booking_private.guest_mail_outbox_v1 where reservation_id='${receipt.id}';`), "accepted");
const secret = `whsec_${randomBytes(32).toString("base64")}`;
let eventIndex = 0;
async function callback(message, kind, eventId = `integration_${spot}_${++eventIndex}`) {
  const raw = JSON.stringify({ type: kind, created_at: new Date().toISOString(), data: { email_id: message.id, tags: Object.fromEntries(message.content.tags.map(tag => [tag.name, tag.value])), to: [email] } });
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
console.log("BOOKING_REAL_HTTP_RPC_MAIL_INTEGRATION_PASS: revision-zero create/read/cancel/replay/recovery; encrypted preparation; mocked acceptance; signed delivery and suppression; two intents and no real provider requests.");
