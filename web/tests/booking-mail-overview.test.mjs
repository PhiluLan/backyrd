import assert from "node:assert/strict";
import test from "node:test";
import { createBookingTsLoader } from "./helpers/booking-ts-runtime.mjs";
const load = createBookingTsLoader(import.meta.url);
const { parseBookingMail } = load("../lib/booking-api.ts", { "./booking-table-layout": {}, "./owner-api": {}, "@/lib/supabase/client": {} });
const reservation = "51000000-0000-4000-8000-000000000020";
const id = n => `51000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const message = (n = 1, state = "accepted") => ({ id: id(n), revision: 0, kind: "created", state, created_at: "2026-10-21T10:00:00Z", updated_at: "2026-10-21T10:01:00Z", attempts: 1, prepared: true, first_attempt_at: "2026-10-21T10:00:30Z", next_attempt_at: state === "pending" ? "2026-10-21T10:02:00Z" : null, superseded: false, delayed: false });
const page = (messages = [message()]) => ({ reservation_id: reservation, revision: 0, observed_at: "2026-10-21T10:02:00Z", guest_access: "active", delivery_blocked: false, messages, next_cursor: null });

test("mail overview accepts revision zero and preserves distinct delivery evidence", () => {
  for (const state of ["pending", "leased", "sending", "accepted", "delivered", "bounced", "complained", "failed", "suppressed", "review_required"]) assert.equal(parseBookingMail(page([message(1, state)]), reservation).messages[0].state, state);
  const pending = { ...message(1, "pending"), attempts: 0, first_attempt_at: null, prepared: false };
  assert.equal(parseBookingMail(page([pending]), reservation).messages[0].revision, 0);
  assert.equal(parseBookingMail(page([]), reservation).messages.length, 0);
});

test("mail overview rejects foreign reservation, invented states and contradictory dispatch claims", () => {
  for (const invalid of [
    { ...page(), reservation_id: id(8) }, { ...page(), revision: -1 }, { ...page(), guest_access: "unknown" },
    page([{ ...message(), state: "read" }]), page([{ ...message(), first_attempt_at: null }]),
    page([{ ...message(), prepared: false }]), page([{ ...message(), attempts: -1 }]), page([{ ...message(), attempts: 0 }]),
    page([{ ...message(1, "pending"), first_attempt_at: null }]),
    page([{ ...message(), delayed: true, state: "delivered" }]), page([{ ...message(), next_attempt_at: "2026-10-21T10:02:00Z" }]),
    page([{ ...message(1, "pending"), next_attempt_at: null }]), page([{ ...message(), revision: 1 }]),
    page([{ ...message(), updated_at: "2026-10-20T10:02:00Z" }]), page([{ ...message(), kind: "newsletter" }]),
  ]) assert.throws(() => parseBookingMail(invalid, reservation), /booking_invalid_response/);
});

test("mail overview validates bounded pagination and never forwards credential fields", () => {
  const rows = Array.from({ length: 50 }, (_, i) => message(i + 1));
  const p = { ...page(rows), next_cursor: rows.at(-1).id };
  assert.equal(parseBookingMail(p, reservation).nextCursor, rows.at(-1).id);
  for (const bad of [{ ...p, next_cursor: id(200) }, { ...p, messages: rows.slice(1) }, page([...rows, message(100)]), page([message(), message()])]) assert.throws(() => parseBookingMail(bad, reservation), /booking_invalid_response/);
  assert.throws(() => parseBookingMail(p, reservation, p.next_cursor), /booking_invalid_response/);
  const result = parseBookingMail({ ...page(), sealed_key: "SECRET", messages: [{ ...message(), payload_sealed: "SECRET", provider_id: "SECRET", email: "SECRET" }] }, reservation);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
});
