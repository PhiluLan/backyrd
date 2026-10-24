import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, randomBytes } from "node:crypto";
import { createBookingTsLoader } from "./helpers/booking-ts-runtime.mjs";
const compile = createBookingTsLoader(import.meta.url);
const contract = compile("../lib/booking-guest-contract.ts");
const security = compile("../lib/booking-guest-security.ts", { "./booking-guest-contract": contract });
const rpcModule = compile("../lib/booking-service-rpc.ts", { "./booking-guest-security": security, "./booking-guest-contract": contract });
const mail = compile("../lib/booking-mail.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security });
const provider = compile("../lib/booking-mail-provider.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security, "./booking-mail": mail });
const webhook = compile("../lib/booking-mail-webhook.ts", { "./booking-guest-contract": contract, "./booking-mail": mail });
const http = compile("../lib/booking-mail-http.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security, "./booking-mail": mail, "./booking-mail-webhook": webhook });
const spot = "70000000-0000-4000-8000-000000000001", reservation = "70000000-0000-4000-8000-000000000002", creation = "70000000-0000-4000-8000-000000000003", outbox = "70000000-0000-4000-8000-000000000004", providerId = "70000000-0000-4000-8000-000000000005";
const ring = id => security.guestSealKeys(id, JSON.stringify({ [id]: randomBytes(32).toString("base64") }));
const config = { origin: "https://booking.example", from: "booking@booking.example", scope: "booking-fixture", apiKey: "synthetic-provider-key", guestKeys: ring("guest"), payloadKeys: ring("mail"), bindingKeys: ring("binding") };
const key = randomBytes(32).toString("base64url");
const snapshot = { spot_id: spot, reservation_id: reservation, creation_request_id: creation, restaurant_name: "Restaurant <script>", guest_name: "Ada <script>", email: "ada@booking.invalid", party_size: 2, starts_at: "2030-10-27T18:00:00.000000Z", ends_at: "2030-10-27T20:00:00.000000Z", status: "confirmed", cancellation_deadline: "2030-10-27T16:00:00.000000Z", key_hash: security.hashGuestKey(key), sealed_key: security.sealGuestKey(key, spot, creation, config.guestKeys) };
function fixture(overrides = {}) {
  const calls = [], sent = [];
  let state = "pending", stored = null, currentLease = null, firstAttempt = null;
  const d = { config, send: async (body, idempotencyKey) => { sent.push({ body, idempotencyKey }); return { outcome: "accepted", providerId }; }, rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === "backyrd_consume_launch_cost_boundary_v1") return { allowed: true };
    if (name === "booking_mail_claim_v1") {
      if (state !== "pending") return null;
      state = "leased"; currentLease = args.p_lease_id;
      return { id: outbox, lease_id: currentLease, spot_id: spot, reservation_id: reservation, context_hash: "a".repeat(64), payload_context: stored?.context ?? null, event_kind: "created", payload_sealed: stored?.sealed ?? null, payload_digest: stored?.digest ?? null, snapshot };
    }
    if (name === "booking_mail_prepare_v1") { stored = { sealed: args.p_payload, digest: args.p_digest, context: args.p_context }; return true; }
    if (name === "booking_mail_begin_v1") {
      state = "sending"; firstAttempt ??= Date.now();
      return { id: outbox, lease_id: currentLease, idempotency_key: `backyrd-booking/${outbox}`, payload_sealed: stored.sealed, payload_digest: stored.digest, retry_until: new Date(firstAttempt + 23 * 3600000).toISOString() };
    }
    if (name === "booking_mail_finish_v1") { state = args.p_outcome === "retry" ? "pending" : args.p_outcome; return true; }
    throw new Error("unexpected fixture RPC");
  }, ...overrides };
  return { d, calls, sent, setState: value => { state = value; }, getStored: () => stored };
}
const webhookSecret = `whsec_${randomBytes(32).toString("base64")}`;
function signed(raw, { id = "msg_booking_fixture", time = Math.floor(Date.now() / 1000), secret = webhookSecret } = {}) {
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${time}.${raw}`).digest("base64");
  return new Headers({ "content-type": "application/json", "svix-id": id, "svix-timestamp": String(time), "svix-signature": `v1,${signature}` });
}
const event = (type = "email.delivered", tags = { booking_outbox: outbox, booking_proof: mail.mailBinding(outbox, config) }) => ({ type, created_at: new Date().toISOString(), data: { email_id: providerId, tags, to: [snapshot.email], subject: "PRIVATE SUBJECT" } });

test("new zero-revision reservations can be read, cancelled and rendered into mail", () => {
  const receipt = contract.parseGuestReceipt({ ...snapshot, id: reservation, spot_id: spot, name: snapshot.restaurant_name, revision: 0 });
  assert.equal(receipt.revision, 0);
  assert.equal(contract.parseGuestRequest({ operation: "cancel", reservationId: reservation, requestId: creation, revision: 0, key }).revision, 0);
  assert.throws(() => contract.parseGuestRequest({ operation: "cancel", reservationId: reservation, requestId: creation, revision: -1, key }));
});
test("worker encrypts the full frozen provider body, escapes guest HTML and sends only after preparation and permission", async () => {
  const f = fixture(); assert.equal(await mail.dispatchOneMail(f.d), "accepted");
  assert.deepEqual(f.calls.map(call => call.name), ["booking_mail_claim_v1", "booking_mail_prepare_v1", "booking_mail_begin_v1", "booking_mail_finish_v1"]);
  assert.equal(f.sent.length, 1);
  const body = JSON.parse(f.sent[0].body);
  assert.ok(body.html.includes("Ada &lt;script&gt;")); assert.ok(!body.html.includes("<script>"));
  assert.ok(body.text.includes(`${config.origin}/booking/manage#id=${reservation}&key=${key}`));
  assert.ok(!JSON.stringify(f.getStored()).includes(key)); assert.ok(!JSON.stringify(f.getStored()).includes(snapshot.email));
  assert.ok(!JSON.stringify(f.calls).includes(key));
  assert.equal(f.calls.at(-1).args.p_outcome, "accepted"); assert.equal(f.sent[0].idempotencyKey, `backyrd-booking/${outbox}`);
});
test("unknown provider outcomes reuse exactly the same frozen body, seal and provider key", async () => {
  let attempts = 0; const sent = [];
  const f = fixture({ send: async (body, idempotencyKey) => { sent.push({ body, idempotencyKey }); return ++attempts === 1 ? { outcome: "retry" } : { outcome: "accepted", providerId }; } });
  assert.equal(await mail.dispatchOneMail(f.d), "deferred");
  const seal = f.getStored().sealed;
  assert.equal(await mail.dispatchOneMail(f.d), "accepted");
  assert.deepEqual(sent[1], sent[0]); assert.equal(f.getStored().sealed, seal);
  assert.equal(f.calls.filter(call => call.name === "booking_mail_prepare_v1").length, 1);
});
test("provider-account, sender or origin changes quarantine an existing request instead of rebuilding it", async () => {
  for (const changed of [{ apiKey: "rotated-key" }, { from: "changed@booking.example" }, { origin: "https://changed.example" }, { scope: "different-account" }]) {
    const f = fixture({ send: async () => ({ outcome: "retry" }) });
    await mail.dispatchOneMail(f.d);
    const previous = f.getStored().sealed;
    const sent = [];
    assert.equal(await mail.dispatchOneMail({ ...f.d, config: { ...config, ...changed }, send: async body => { sent.push(body); return { outcome: "accepted", providerId }; } }), "review");
    assert.equal(f.getStored().sealed, previous); assert.equal(sent.length, 0);
  }
});
test("invalid key material/snapshot goes to pre-dispatch review without pretending a provider attempt", async () => {
  const f = fixture();
  assert.equal(await mail.dispatchOneMail({ ...f.d, config: { ...config, guestKeys: ring("missing") } }), "review");
  assert.equal(f.calls.filter(call => call.name === "booking_mail_begin_v1").length, 0); assert.equal(f.sent.length, 0);
});
test("a denied dispatch or insufficient remaining job budget never contacts the provider", async () => {
  const f = fixture(); const original = f.d.rpc;
  f.d.rpc = (name, args) => name === "booking_mail_begin_v1" ? Promise.resolve(null) : original(name, args);
  assert.equal(await mail.dispatchOneMail(f.d), "superseded"); assert.equal(f.sent.length, 0);
  const g = fixture(); assert.equal(await mail.dispatchOneMail({ ...g.d, deadline: Date.now() + 1000 }), "deferred"); assert.equal(g.sent.length, 0);
});
test("lost prepare/begin responses cannot cause a speculative provider request", async () => {
  for (const stage of ["booking_mail_prepare_v1", "booking_mail_begin_v1"]) {
    const f = fixture(); const rpc = f.d.rpc;
    f.d.rpc = (name, args) => name === stage ? Promise.reject(new Error("lost response")) : rpc(name, args);
    await assert.rejects(mail.dispatchOneMail(f.d)); assert.equal(f.sent.length, 0);
  }
});
test("envelope authentication fences another job, changed ciphertext and unavailable old keys", async () => {
  const f = fixture(); await mail.dispatchOneMail(f.d); const stored = f.getStored();
  assert.equal(mail.openMailEnvelope(stored.sealed, outbox, stored.digest, config).body, f.sent[0].body);
  const rotated = { ...config, payloadKeys: { active: "next", keys: { ...config.payloadKeys.keys, next: randomBytes(32) } } };
  assert.equal(mail.openMailEnvelope(stored.sealed, outbox, stored.digest, rotated).body, f.sent[0].body);
  assert.throws(() => mail.openMailEnvelope(stored.sealed, reservation, stored.digest, config));
  assert.throws(() => mail.openMailEnvelope(stored.sealed, outbox, "b".repeat(64), config));
  const parts = stored.sealed.split("."); parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
  assert.throws(() => mail.openMailEnvelope(parts.join("."), outbox, stored.digest, config));
  assert.throws(() => mail.openMailEnvelope(stored.sealed, outbox, stored.digest, { ...config, payloadKeys: ring("missing") }));
});
test("pending mail explicitly distinguishes a request from a confirmed reservation", async () => {
  const f = fixture(); const raw = await f.d.rpc("booking_mail_claim_v1", { p_lease_id: creation }); raw.snapshot = { ...snapshot, status: "pending" };
  const envelope = mail.buildMailEnvelope(mail.parseMailClaim(raw, creation), config);
  assert.match(JSON.parse(envelope.body).text, /Der Platz ist noch nicht bestätigt/);
});
test("sender readiness requires the exact verified domain, enabled sending and disabled tracking", async () => {
  const domain = { id: spot, name: "booking.example", status: "verified", capabilities: { sending: "enabled" }, open_tracking: false, click_tracking: false };
  for (const change of [{ status: "pending" }, { name: "another.example" }, { capabilities: { sending: "disabled" } }, { open_tracking: true }, { click_tracking: true }, { open_tracking: undefined }]) assert.equal(await provider.verifiedMailSender(spot, config.from, "test-key", async () => Response.json({ ...domain, ...change })), false);
  assert.equal(await provider.verifiedMailSender(spot, config.from, "test-key", async () => Response.json(domain)), true);
});
test("provider transport preserves raw bytes and key, separates acceptance and interprets documented conflicts", async () => {
  const body = '{"text":"exact bytes"}'; let options;
  assert.deepEqual(JSON.parse(JSON.stringify(await provider.sendBookingMail(body, `backyrd-booking/${outbox}`, "test-key", async (url, init) => { options = init; assert.equal(url, "https://api.resend.com/emails"); return Response.json({ id: providerId }); }))), { outcome: "accepted", providerId });
  assert.equal(options.body, body); assert.equal(options.headers["Idempotency-Key"], `backyrd-booking/${outbox}`); assert.equal(options.redirect, "error");
  for (const [status, value, expected] of [[409, { name: "concurrent_idempotent_requests" }, "retry"], [409, { name: "invalid_idempotent_request" }, "review"], [429, {}, "retry"], [503, {}, "retry"], [422, {}, "rejected"], [200, {}, "retry"]]) assert.equal((await provider.sendBookingMail(body, `backyrd-booking/${outbox}`, "test-key", async () => Response.json(value, { status }))).outcome, expected);
});
test("callback readiness verifies provider endpoint, subscribed event types and the actual signing secret", async () => {
  const hook = { id: spot, status: "enabled", endpoint: `${config.origin}/api/booking/mail/events`, events: [...provider.requiredMailEvents], signing_secret: webhookSecret };
  for (const changed of [{ status: "disabled" }, { endpoint: "https://another.example/callback" }, { events: ["email.sent"] }, { signing_secret: "wrong-secret" }]) assert.equal(await provider.verifiedMailCallback(spot, config.origin, [webhookSecret], "synthetic-api-key", async () => Response.json({ ...hook, ...changed })), false);
  assert.equal(await provider.verifiedMailCallback(spot, config.origin, [webhookSecret], "synthetic-api-key", async () => Response.json(hook)), true);
});
test("Svix's official known vector verifies, while changed raw bytes and stale timestamps fail", () => {
  const secret = "whsec_plJ3nmyCDGBKInavdOK15jsl", raw = '{"event_type":"ping","data":{"success":true}}';
  const headers = new Headers({ "svix-id": "msg_loFOjxBNrRLzqYUf", "svix-timestamp": "1731705121", "svix-signature": "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=" });
  assert.equal(webhook.verifyMailWebhook(raw, headers, [secret], 1731705121000), "msg_loFOjxBNrRLzqYUf");
  assert.throws(() => webhook.verifyMailWebhook(raw + " ", headers, [secret], 1731705121000));
  assert.throws(() => webhook.verifyMailWebhook(raw, headers, [secret], 1731705422000));
});
test("authenticated callback forwards only minimal bound event fields and supports signature rotation", async () => {
  const raw = JSON.stringify(event()); const calls = [];
  const d = { config, secrets: [`whsec_${randomBytes(32).toString("base64")}`, webhookSecret], rpc: async (name, args) => { calls.push({ name, args }); return true; } };
  assert.equal(await webhook.ingestMailWebhook(raw, signed(raw), d), "recorded");
  assert.equal(calls[0].args.p_kind, "delivered"); assert.equal(calls[0].args.p_id, outbox);
  assert.ok(!JSON.stringify(calls).includes(snapshot.email)); assert.ok(!JSON.stringify(calls).includes("PRIVATE SUBJECT"));
  const suppressed = JSON.stringify(event("email.suppressed")); await webhook.ingestMailWebhook(suppressed, signed(suppressed), d); assert.equal(calls.at(-1).args.p_kind, "suppressed");
});
test("forged/modified/unbound callbacks cannot write and unrelated provider mail is ignored", async () => {
  const calls = []; const d = { config, secrets: [webhookSecret], rpc: async (...args) => { calls.push(args); return true; } };
  const raw = JSON.stringify(event()); await assert.rejects(webhook.ingestMailWebhook(raw + " ", signed(raw), d));
  const bad = JSON.stringify(event("email.delivered", { booking_outbox: outbox, booking_proof: "forged" })); await assert.rejects(webhook.ingestMailWebhook(bad, signed(bad), d));
  const other = JSON.stringify(event("email.delivered", {})); assert.equal(await webhook.ingestMailWebhook(other, signed(other), d), "ignored");
  assert.equal(calls.length, 0);
});
test("callback HTTP rejects malformed bodies, retries database failures and acknowledges only recorded/ignored events", async () => {
  const raw = JSON.stringify(event()), d = { config, secrets: [webhookSecret], rpc: async () => true };
  const req = () => new Request("https://booking.example/api/booking/mail/events", { method: "POST", headers: signed(raw), body: raw });
  const ok = await http.handleMailCallback(req(), d); assert.equal(ok.status, 200); assert.match(ok.headers.get("cache-control"), /no-store/);
  assert.equal((await http.handleMailCallback(req(), { ...d, rpc: async () => false })).status, 503);
  assert.equal((await http.handleMailCallback(req(), { ...d, rpc: async () => { throw new Error("private backend details"); } })).status, 503);
  assert.equal((await http.handleMailCallback(req(), null)).status, 503);
  assert.equal((await http.handleMailCallback(new Request("https://booking.example/api/booking/mail/events", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), d)).status, 400);
});
test("worker HTTP requires its secret before sender checks, respects quotas and never claims with unready sender", async () => {
  let checks = 0; const f = fixture();
  const d = { ...f.d, secret: "synthetic-worker-secret-at-least-32-bytes", senderReady: async () => { checks++; return false; } };
  const req = auth => new Request("https://booking.example/api/booking/mail/dispatch", { headers: auth ? { Authorization: `Bearer ${d.secret}` } : {} });
  assert.equal((await http.handleMailJob(req(false), d)).status, 401); assert.equal(checks, 0); assert.equal(f.calls.length, 0);
  assert.equal((await http.handleMailJob(req(true), d)).status, 503); assert.equal(checks, 1); assert.equal(f.calls.filter(call => call.name === "booking_mail_claim_v1").length, 0);
  assert.equal((await http.handleMailJob(req(true), { ...d, rpc: async () => ({ allowed: false }) })).status, 429);
});
test("common privileged transport rejects non-TLS/credential URLs and unknown RPC names", async () => {
  for (const url of ["http://database.example", "https://user:secret@database.example", "https://database.example/path", "https://database.example?key=secret"]) assert.throws(() => rpcModule.createBookingServiceRpc({ url, key: "server-key", development: false }, new Set(["allowed"])));
  let called = false; const rpc = rpcModule.createBookingServiceRpc({ url: "https://database.example", key: "server-key", development: false }, new Set(["allowed"]), async () => { called = true; return Response.json({}); });
  await assert.rejects(rpc("not_allowed", {})); assert.equal(called, false);
});
test("capability/provider ingress is independent of consumer Auth refresh; operator surfaces retain it", async () => {
  let calls = 0;
  const proxy = compile("../proxy.ts", { "next/server": { NextResponse: { next: () => new Response(null) } }, "@/lib/supabase/proxy": { refreshSession: async () => { calls++; throw new Error("consumer Auth unavailable"); } } });
  for (const path of ["/booking/manage", "/api/booking/guest", "/api/booking/mail/dispatch", "/api/booking/mail/events"]) {
    const response = await proxy.proxy({ nextUrl: new URL(`https://booking.example${path}`) });
    assert.match(response.headers.get("cache-control"), /no-store/); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  }
  assert.equal(calls, 0);
  for (const path of ["/booking/console", "/owner"]) await assert.rejects(proxy.proxy({ nextUrl: new URL(`https://booking.example${path}`) }));
  assert.equal(calls, 2);
});
