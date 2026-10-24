import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { guestUuid, record } from "./booking-guest-contract";
import { mailText, verifyMailBinding, type MailConfig } from "./booking-mail";
import type { BookingRpc } from "./booking-service-rpc";

export class MailWebhookError extends Error {
  constructor(readonly code: "signature" | "secret" | "event" | "binding") { super(`invalid_mail_${code}`); }
}

/** Svix's published raw-body protocol. No JSON parsing before authentication. */
export function verifyMailWebhook(raw: string, headers: Headers, secrets: readonly string[], now = Date.now()): string {
  const id = headers.get("svix-id"), timestamp = headers.get("svix-timestamp"), signatures = headers.get("svix-signature");
  if (!id || !/^[A-Za-z0-9_.-]{1,200}$/.test(id) || !timestamp || !/^\d{1,12}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !signatures || signatures.length > 2048 || secrets.length < 1 || secrets.length > 8) throw new MailWebhookError("signature");
  let verified = false;
  for (const secret of secrets) {
    if (!secret.startsWith("whsec_")) throw new MailWebhookError("secret");
    const encoded = secret.slice(6), key = Buffer.from(encoded, "base64");
    if (key.length < 16 || key.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) throw new MailWebhookError("secret");
    const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`, "utf8").digest();
    for (const versioned of signatures.split(" ")) {
      if (!/^v1,[A-Za-z0-9+/]{43}=$/.test(versioned)) continue;
      const candidate = Buffer.from(versioned.slice(3), "base64");
      if (candidate.length === expected.length && timingSafeEqual(expected, candidate)) verified = true;
    }
  }
  if (!verified) throw new MailWebhookError("signature");
  return id;
}
const kinds: Record<string, string> = { "email.sent": "accepted", "email.delivery_delayed": "delayed", "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complained", "email.failed": "failed", "email.suppressed": "suppressed" };
export async function ingestMailWebhook(raw: string, headers: Headers, d: { secrets: readonly string[]; config: Pick<MailConfig, "scope" | "bindingKeys">; rpc: BookingRpc; now?: number }): Promise<"recorded" | "ignored" | "unmatched"> {
  const eventId = verifyMailWebhook(raw, headers, d.secrets, d.now);
  let args: Record<string, string>;
  try {
    const event = record(JSON.parse(raw));
    if (typeof event.type !== "string" || !Object.hasOwn(kinds, event.type)) return "ignored";
    const data = record(event.data);
    if (data.tags === undefined || data.tags === null) return "ignored";
    const tags = record(data.tags);
    // Other messages on the same provider account must not become Booking events.
    if (typeof tags.booking_outbox !== "string") return "ignored";
    const id = guestUuid(tags.booking_outbox);
    if (!verifyMailBinding(id, tags.booking_proof, d.config)) throw new MailWebhookError("binding");
    const occurred = mailText(event.created_at, 40);
    if (!Number.isFinite(Date.parse(occurred))) throw new MailWebhookError("event");
    args = { p_event_id: eventId, p_id: id, p_provider_id: guestUuid(data.email_id), p_kind: kinds[event.type], p_occurred_at: occurred };
  } catch (error) { if (error instanceof MailWebhookError) throw error; throw new MailWebhookError("event"); }
  const result = await d.rpc("booking_mail_event_v1", args);
  return result === true ? "recorded" : "unmatched";
}
