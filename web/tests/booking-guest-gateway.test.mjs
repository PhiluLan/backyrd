import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { createBookingTsLoader } from "./helpers/booking-ts-runtime.mjs";
const compile = createBookingTsLoader(import.meta.url);
const contract = compile("../lib/booking-guest-contract.ts");
const security = compile("../lib/booking-guest-security.ts", { "./booking-guest-contract": contract });
const rpcModule = compile("../lib/booking-service-rpc.ts", { "./booking-guest-security": security, "./booking-guest-contract": contract });
const handler = compile("../lib/booking-guest-handler.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security, "./booking-service-rpc": rpcModule });
const spot = "00000000-0000-4000-8000-000000000001", requestId = "00000000-0000-4000-8000-000000000002", reservationId = "00000000-0000-4000-8000-000000000003";
const key = randomBytes(32).toString("base64url"), origin = "https://booking.example";
const receipt = { id: reservationId, spot_id: spot, name: "Test Restaurant", guest_name: "Ada", party_size: 2, starts_at: "2030-10-27T18:00:00+00:00", ends_at: "2030-10-27T20:00:00+00:00", status: "confirmed", revision: 0, cancellation_deadline: "2030-10-27T16:00:00+00:00" };
const create = { operation: "create", spotId: spot, requestId, policyRevision: 1, startsAt: receipt.starts_at, partySize: 2, name: "Ada", email: "ada@example.test", key, note: "", challenge: "synthetic-challenge" };
const read = { operation: "read", reservationId, key };
const cancel = { operation: "cancel", reservationId, requestId, revision: 0, key };
const availability = { spot_id: spot, name: receipt.name, date: "2030-10-27", party_size: 2, policy_revision: 1, notice_minutes: 60, horizon_days: 90, cancellation_minutes: 120, confirmation_status: "confirmed", privacy_contact: "privacy@example.test", guest_notice: "Bitte pünktlich kommen.\nDanke!", slots: [{ starts_at: receipt.starts_at, ends_at: receipt.ends_at }] };
function request(body, extra = {}) {
  return new Request(`${origin}/api/booking/guest`, { method: "POST", headers: { origin, "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
}
function fixture(overrides = {}) {
  const calls = [];
  const dependencies = { origin, newIntakeReady: true, subject: () => "opaque-subject", seal: () => "opaque-seal", verifyChallenge: async () => true, rpc: async (name, args) => { calls.push({ name, args }); return name === "backyrd_consume_launch_cost_boundary_v1" ? { allowed: true } : name === "booking_guest_availability_v1" ? availability : receipt; }, ...overrides };
  return { dependencies, calls, run: body => handler.handleGuestRequest(request(body), dependencies) };
}

test("strict request contracts reject extra authority fields and coercion, normalize identity", () => {
  for (const value of [{ ...create, tableId: reservationId }, { ...create, email: "a\n@example.test" }, { ...create, key: key + "=" }, { ...create, policyRevision: "1" }, { ...create, name: "  " }, { ...create, partySize: 0 }, { ...create, key: "A".repeat(42) + "B" }]) assert.throws(() => contract.parseGuestRequest(value));
  assert.equal(contract.parseGuestRequest({ ...create, email: " ADA@EXAMPLE.TEST ", name: " Ada ", note: "Outside\nplease" }).email, "ada@example.test");
  assert.throws(() => contract.parseGuestRequest({ operation: "availability", spotId: spot, date: "2030-02-30", partySize: 2 }));
});
test("receipt and availability project away contact, notes, tables and future private fields", () => {
  const result = contract.parseGuestReceipt({ ...receipt, guest_contact: "private", note: "private", table_ids: [spot] });
  assert.equal(result.guest_contact, undefined); assert.equal(result.table_ids, undefined); assert.equal(result.note, undefined);
  const slots = contract.parseGuestAvailability({ ...availability, services: [spot] });
  assert.equal(slots.services, undefined); assert.equal(slots.slots.length, 1);
  assert.throws(() => contract.parseGuestAvailability({ ...availability, slots: [...availability.slots, ...availability.slots] }));
  assert.throws(() => contract.parseGuestReceipt({ ...receipt, ends_at: receipt.starts_at }));
});
test("seals are authenticated, randomized and bound to restaurant, request and credential", () => {
  const encoded = JSON.stringify({ first: randomBytes(32).toString("base64") });
  const ring = security.guestSealKeys("first", encoded);
  const a = security.sealGuestKey(key, spot, requestId, ring), b = security.sealGuestKey(key, spot, requestId, ring);
  assert.notEqual(a, b); assert.ok(!a.includes(key));
  const hash = security.hashGuestKey(key);
  assert.equal(security.openGuestKey(a, spot, requestId, hash, ring), key);
  assert.throws(() => security.openGuestKey(a, requestId, requestId, hash, ring));
  assert.throws(() => security.openGuestKey(a, spot, spot, hash, ring));
  assert.throws(() => security.openGuestKey(a, spot, requestId, "0".repeat(64), ring));
  const parts = a.split("."); parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
  assert.throws(() => security.openGuestKey(parts.join("."), spot, requestId, hash, ring));
  const rotated = security.guestSealKeys("next", JSON.stringify({ ...JSON.parse(encoded), next: randomBytes(32).toString("base64") }));
  assert.equal(security.openGuestKey(a, spot, requestId, hash, rotated), key);
  assert.throws(() => security.guestSealKeys("missing", encoded));
  assert.throws(() => security.guestSealKeys("short", JSON.stringify({ short: "AA==" })));
});
test("spoofed proxy headers cannot allocate new quota buckets outside the verified deployment", () => {
  const secret = "synthetic-test-salt-at-least-32-bytes";
  const a = new Headers({ "x-forwarded-for": "192.0.2.1", "x-vercel-forwarded-for": "192.0.2.1" });
  const b = new Headers({ "x-forwarded-for": "192.0.2.2", "x-vercel-forwarded-for": "192.0.2.2" });
  assert.equal(security.guestRateSubject(a, false, secret), security.guestRateSubject(b, false, secret));
  assert.notEqual(security.guestRateSubject(a, true, secret), security.guestRateSubject(b, true, secret));
  assert.equal(security.guestRateSubject(new Headers({ "x-vercel-forwarded-for": "192.0.2.1, 192.0.2.2" }), true, secret), security.guestRateSubject(new Headers(), true, secret));
  assert.throws(() => security.guestRateSubject(a, true, "short"));
});
test("chunked bodies are capped in bytes and do not need a Content-Length", async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('"' + "🦉".repeat(20))); }, cancel() { cancelled = true; } });
  await assert.rejects(security.boundedJson(new Response(body), 32, 100));
  assert.equal(cancelled, true);
  await assert.rejects(security.boundedJson(new Response("{}", { headers: { "Content-Length": "100000" } }), 32));
  await assert.rejects(security.boundedJson(new Response(new Uint8Array([0xff])), 32));
});
test("stalled body readers time out and are cancelled", async () => {
  let cancelled = false;
  await assert.rejects(security.boundedJson(new Response(new ReadableStream({ cancel() { cancelled = true; } })), 32, 10));
  assert.equal(cancelled, true);
});
test("human proof needs provider success, exact hostname and the booking action", async () => {
  for (const result of [{ success: false, hostname: "booking.example", action: "booking_create" }, { success: true, hostname: "attacker.example", action: "booking_create" }, { success: true, hostname: "booking.example", action: "other" }]) {
    assert.equal(await security.verifyGuestChallenge("token", origin, "synthetic-secret", async () => Response.json(result)), false);
  }
  let sent;
  assert.equal(await security.verifyGuestChallenge("token", origin, "synthetic-secret", async (url, init) => { sent = { url, init }; return Response.json({ success: true, hostname: "booking.example", action: "booking_create" }); }), true);
  assert.equal(sent.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(sent.init.redirect, "error"); assert.equal(JSON.parse(sent.init.body).response, "token");
});
test("cross-origin, query-string credentials, wrong content types and unknown fields never reach the backend", async () => {
  const f = fixture();
  for (const input of [request(read, { origin: "https://evil.example" }), request(read, { "sec-fetch-site": "cross-site" }), request(read, { "content-type": "text/plain" }), new Request(`${origin}/api/booking/guest?key=${key}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(read) }), request({ ...read, ownerId: spot })]) {
    assert.ok((await handler.handleGuestRequest(input, f.dependencies)).status >= 400);
  }
  assert.equal(f.calls.length, 0);
});
test("creation sends only a hash and opaque seal to the database, and returns no secret", async () => {
  const f = fixture(); const response = await f.run(create);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(!body.includes(key)); assert.ok(!body.includes(create.email));
  assert.equal(f.calls[0].name, "backyrd_consume_launch_cost_boundary_v1");
  const args = f.calls[1].args;
  assert.equal(args.p_key_hash, security.hashGuestKey(key)); assert.equal(args.p_sealed_key, "opaque-seal");
  assert.ok(!JSON.stringify(args).includes(key)); assert.equal(args.p_request_id, requestId);
  assert.match(response.headers.get("cache-control"), /no-store/); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
});
test("paused/unready intake closes new searches and creates, but keeps proof-bound read/recovery/cancel reachable", async () => {
  const f = fixture({ newIntakeReady: false, verifyChallenge: async () => { throw new Error("must not run"); }, seal: () => { throw new Error("must not run"); } });
  assert.equal((await f.run(create)).status, 503);
  assert.equal((await f.run({ operation: "availability", spotId: spot, date: "2030-10-27", partySize: 2 })).status, 503);
  for (const body of [read, { operation: "recover", spotId: spot, requestId, key }, cancel]) assert.equal((await f.run(body)).status, 200);
  assert.equal(f.calls.filter(call => call.name.startsWith("booking_guest_")).length, 3);
});
test("blocked quota and failed human proof do not write or seal guest credentials", async () => {
  let sealed = false;
  const f = fixture({ rpc: async () => ({ allowed: false }), seal: () => { sealed = true; } });
  const blocked = await f.run(create); assert.equal(blocked.status, 429); assert.equal(blocked.headers.get("retry-after"), "60"); assert.equal(sealed, false);
  const g = fixture({ verifyChallenge: async () => false });
  assert.equal((await g.run(create)).status, 403); assert.equal(g.calls.length, 1);
});
test("network loss after dispatch is explicitly uncertain for writes, never a fabricated rejection", async () => {
  for (const body of [create, cancel]) {
    const f = fixture({ rpc: async name => { if (name === "backyrd_consume_launch_cost_boundary_v1") return { allowed: true }; throw new Error("transport with private details"); } });
    const response = await f.run(body), result = await response.json();
    assert.equal(result.error, "outcome_unknown"); assert.equal(result.outcome, "unknown"); assert.ok(!JSON.stringify(result).includes("private"));
  }
});
test("invalid or cross-restaurant responses disclose no guest data and leave writes uncertain", async () => {
  for (const [data, input] of [[{ ...receipt, spot_id: requestId }, create], [{ ...receipt, revision: "1" }, cancel], [{ ...receipt, id: requestId }, cancel]]) {
    const f = fixture({ rpc: async name => name === "backyrd_consume_launch_cost_boundary_v1" ? { allowed: true } : data });
    const response = await f.run(input), body = await response.text();
    assert.equal(response.status, 503); assert.ok(!body.includes(receipt.guest_name)); assert.match(body, /outcome_unknown/);
  }
});
test("known database conflicts are safely mapped without SQL details", async () => {
  for (const [code, message, status, expected] of [["40001", "booking_changed_reload", 409, "changed"], ["22023", "booking_slot_unavailable", 409, "slot_unavailable"], ["P0002", "booking_guest_link_unavailable", 404, "link_unavailable"], ["42501", "safety restriction with private data", 404, "link_unavailable"], ["22023", "booking_request_reused", 409, "request_reused"]]) {
    const f = fixture({ rpc: async name => { if (name === "backyrd_consume_launch_cost_boundary_v1") return { allowed: true }; throw new handler.GuestRpcRejection(code, message); } });
    const response = await f.run(cancel);
    assert.equal(response.status, status); assert.equal((await response.json()).error, expected);
  }
});
test("a retry retains the logical request and key even when the encryption nonce and human proof change", async () => {
  let sealed = 0;
  const f = fixture({ seal: () => `seal-${++sealed}` });
  assert.equal((await f.run(create)).status, 200);
  assert.equal((await f.run({ ...create, challenge: "renewed-human-proof" })).status, 200);
  const calls = f.calls.filter(call => call.name === "booking_guest_create_v1");
  assert.notEqual(calls[0].args.p_sealed_key, calls[1].args.p_sealed_key);
  const withoutSeal = ({ p_sealed_key, ...rest }) => rest;
  assert.deepEqual(withoutSeal(calls[0].args), withoutSeal(calls[1].args));
});
test("production cannot open intake with environment switches before the mail dispatcher exists", async () => {
  const environment = { BOOKING_GUEST_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: "https://database.example", SUPABASE_SERVICE_ROLE_KEY: "synthetic-server-key", BOOKING_GUEST_RATE_SECRET: "synthetic-test-salt-at-least-32-bytes", BOOKING_PUBLIC_CREATE_ENABLED: "true", BOOKING_GUEST_MAIL_READY: "true" };
  let upstream;
  const transport = async (url, init) => { upstream = { url, init }; return Response.json(receipt); };
  const service = compile("../lib/booking-service-rpc.ts", { "./booking-guest-security": security, "./booking-guest-contract": contract }, { fetch: transport });
  const server = compile("../lib/booking-guest-server.ts", { "./booking-guest-contract": contract, "./booking-guest-security": security, "./booking-guest-handler": handler, "./booking-service-rpc": service }, { process: { env: environment } });
  const d = server.guestDependencies(); assert.equal(d.newIntakeReady, false);
  await d.rpc("booking_guest_read_v1", { p_reservation_id: reservationId, p_key_hash: security.hashGuestKey(key) });
  assert.equal(upstream.init.headers.Authorization, "Bearer synthetic-server-key"); assert.equal(upstream.init.redirect, "error");
  await assert.rejects(d.rpc("some_other_privileged_rpc", {}));
  assert.equal((await handler.handleGuestRequest(request(create), d)).status, 503);
});

test("browser transport treats proxy failures and malformed write responses as uncertain", async () => {
  for (const upstream of [() => new Response("<html>proxy timeout</html>", { status: 502 }), () => Response.json({ data: { ...receipt, id: requestId } }), () => Response.json({ error: "unstructured" }, { status: 500 })]) {
    const client = compile("../lib/booking-guest-client.ts", { "./booking-guest-contract": contract }, { fetch: async () => upstream() });
    await assert.rejects(client.guestRequest(cancel), error => error instanceof client.GuestRequestError && error.uncertain && error.code === "outcome_unknown");
  }
});
test("browser transport sends no account cookies or referrer and retains definite conflicts", async () => {
  let options;
  const client = compile("../lib/booking-guest-client.ts", { "./booking-guest-contract": contract }, { fetch: async (_, init) => { options = init; return Response.json({ error: "changed", outcome: "rejected" }, { status: 409 }); } });
  await assert.rejects(client.guestRequest(cancel), error => error instanceof client.GuestRequestError && !error.uncertain && error.code === "changed");
  assert.equal(options.credentials, "omit"); assert.equal(options.referrerPolicy, "no-referrer"); assert.equal(options.redirect, "error");
  assert.deepEqual(JSON.parse(options.body), cancel);
});
test("unavailable infrastructure and sealing failures cannot claim a dispatched write", async () => {
  assert.equal((await handler.handleGuestRequest(request(create), null)).status, 503);
  const f = fixture({ seal: () => { throw new Error("missing private key"); } });
  const response = await f.run(create);
  assert.equal((await response.json()).outcome, "rejected");
  assert.equal(f.calls.filter(call => call.name === "booking_guest_create_v1").length, 0);
});
