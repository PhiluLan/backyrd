import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { guestUuid, parseGuestBookingSummary, parseGuestReceipt, record } from "./booking-guest-contract";
import { openGuestKey, type GuestSealKeys } from "./booking-guest-security";
import { guestWhen } from "./booking-guest-time";
import type { BookingRpc } from "./booking-service-rpc";

export type MailConfig = {
  origin: string; from: string; scope: string; apiKey: string;
  guestKeys: GuestSealKeys; payloadKeys: GuestSealKeys; bindingKeys: GuestSealKeys;
};
export type MailOutcome = { outcome: "accepted"; providerId: string } | { outcome: "retry" | "rejected" | "review" };
type Envelope = { version: 1; id: string; scope: string; providerKeyHash: string; sender: string; origin: string; body: string };
export type MailClaim = {
  id: string; lease: string; context: string; sealed: string | null; digest: string | null;
  kind: "created" | "changed" | "cancelled";
  snapshot: ReturnType<typeof snapshot>;
};
export function mailText(value: unknown, max = 1000): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("invalid_mail_content");
  return value;
}
export function mailHash(value: unknown): string {
  const hash = mailText(value, 64);
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("invalid_mail_content");
  return hash;
}
export function mailDigest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
export function mailEmail(value: unknown): string {
  const email = mailText(value, 254);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)) throw new Error("invalid_mail_content");
  return email;
}
function snapshot(value: unknown) {
  const s = record(value);
  if (s.message_mode === "manual_summary") {
    const summary = parseGuestBookingSummary({ id: s.reservation_id, spot_id: s.spot_id, name: s.restaurant_name, guest_name: s.guest_name, party_size: s.party_size, starts_at: s.starts_at, ends_at: s.ends_at, status: s.status, revision: s.revision });
    if (!["pending", "confirmed", "cancelled", "declined"].includes(summary.status)) throw new Error("invalid_mail_content");
    return { ...summary, email: mailEmail(s.email), messageMode: "manual_summary" as const };
  }
  if (s.message_mode !== undefined && s.message_mode !== "self_service") throw new Error("invalid_mail_content");
  const receipt = parseGuestReceipt({ id: s.reservation_id, spot_id: s.spot_id, name: s.restaurant_name, guest_name: s.guest_name, party_size: s.party_size, starts_at: s.starts_at, ends_at: s.ends_at, status: s.status, revision: 0, cancellation_deadline: s.cancellation_deadline });
  if (receipt.status !== "confirmed" && receipt.status !== "pending" && receipt.status !== "declined" && receipt.status !== "cancelled") throw new Error("invalid_mail_content");
  return { ...receipt, creationRequestId: guestUuid(s.creation_request_id), email: mailEmail(s.email), keyHash: mailHash(s.key_hash), sealedKey: mailText(s.sealed_key, 2048), messageMode: "self_service" as const };
}
export function parseMailClaim(value: unknown, lease: string): MailClaim {
  const c = record(value), s = snapshot(c.snapshot);
  const kind = c.event_kind;
  if (s.messageMode === "manual_summary" && c.reservation_revision !== s.revision) throw new Error("invalid_mail_content");
  if (c.lease_id !== lease || guestUuid(c.spot_id) !== s.spot_id || guestUuid(c.reservation_id) !== s.id || (kind !== "created" && kind !== "changed" && kind !== "cancelled")) throw new Error("invalid_mail_content");
  const sealed = c.payload_sealed === null ? null : mailText(c.payload_sealed, 65536);
  const digest = c.payload_digest === null ? null : mailHash(c.payload_digest);
  if ((sealed === null) !== (digest === null)) throw new Error("invalid_mail_content");
  if (sealed !== null && mailHash(c.payload_context) !== mailHash(c.context_hash)) throw new Error("invalid_mail_content");
  return { id: guestUuid(c.id), lease, context: mailHash(c.context_hash), sealed, digest, kind, snapshot: s };
}
function binding(id: string, scope: string, key: Buffer): string {
  return createHmac("sha256", key).update(`backyrd-booking-mail:v1:${guestUuid(id)}:${scope}`).digest("hex");
}
export function mailBinding(id: string, config: Pick<MailConfig, "scope" | "bindingKeys">): string {
  return `${config.bindingKeys.active}_${binding(id, config.scope, config.bindingKeys.keys[config.bindingKeys.active])}`;
}
export function verifyMailBinding(id: string, proof: unknown, config: Pick<MailConfig, "scope" | "bindingKeys">): boolean {
  if (typeof proof !== "string") return false;
  const split = proof.lastIndexOf("_"), kid = proof.slice(0, split), mac = proof.slice(split + 1);
  if (!Object.hasOwn(config.bindingKeys.keys, kid) || !/^[a-f0-9]{64}$/.test(mac)) return false;
  return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(binding(id, config.scope, config.bindingKeys.keys[kid]), "hex"));
}
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
export function buildMailEnvelope(claim: MailClaim, config: MailConfig): Envelope {
  const s = claim.snapshot;
  const origin = new URL(config.origin);
  if (origin.protocol !== "https:" || origin.origin !== config.origin) throw new Error("invalid_mail_origin");
  mailEmail(config.from);
  let link: URL | null = null, deadline = "";
  if (s.messageMode === "self_service") {
    const rawKey = openGuestKey(s.sealedKey, s.spot_id, s.creationRequestId, s.keyHash, config.guestKeys);
    link = new URL("/booking/manage", origin); link.hash = `id=${s.id}&key=${rawKey}`;
    if (s.status === "confirmed" || s.status === "pending") deadline = `Online-Stornierungsfrist: ${guestWhen(s.cancellation_deadline)} (Schweizer Zeit).`;
  }
  const restaurantLink = new URL(`/spots/${s.spot_id}`, origin).href;
  const when = guestWhen(s.starts_at);
  const heading = s.status === "pending" ? claim.kind === "changed" && s.messageMode === "self_service" ? "Aktualisierte Reservierungsanfrage" : "Deine Reservierungsanfrage" : s.status === "cancelled" ? "Deine Reservierung wurde storniert" : s.status === "declined" ? "Deine Anfrage wurde abgelehnt" : claim.kind === "changed" && s.messageMode === "self_service" ? "Aktualisierte Reservierung" : "Deine Reservierung";
  const status = s.status === "pending" ? "Das Restaurant prüft deine Anfrage. Der Platz ist noch nicht bestätigt." : s.status === "cancelled" ? "Diese Reservierung ist storniert." : s.status === "declined" ? "Das Restaurant hat deine Anfrage abgelehnt." : "Deine Reservierung ist bestätigt.";
  const summary = `${s.name}\n${when} (Schweizer Zeit)\n${s.party_size} ${s.party_size === 1 ? "Person" : "Personen"}`;
  const footer = link ? "Dieser persönliche Link zeigt den aktuellen Stand deiner Reservierung. Teile ihn nur mit Personen, denen du vertraust. Für Änderungen oder Absagen nach der Online-Frist kontaktiere bitte das Restaurant." : "Für Änderungen oder Absagen kontaktiere bitte direkt das Restaurant. Diese Nachricht fügt keine neuen Buchungsbedingungen oder Online-Stornierungsfristen hinzu.";
  const accessText = link ? `Reservierung ansehen und verwalten:\n${link.href}\n\n` : "";
  const accessHtml = link ? `<p><a href="${escape(link.href)}">Reservierung ansehen und verwalten</a></p>` : "";
  const body = JSON.stringify({
    from: `Backyrd Booking <${config.from}>`, to: [s.email], subject: `${heading} · ${s.name}`,
    text: `Hallo ${s.guest_name}\n\n${status}\n\n${summary}\n\n${deadline}\n\n${accessText}Restaurantinformationen:\n${restaurantLink}\n\n${footer}`,
    html: `<html lang="de"><body><h1>${escape(heading)}</h1><p>Hallo ${escape(s.guest_name)}</p><p>${escape(status)}</p><p>${escape(summary).replaceAll("\n", "<br>")}</p>${deadline ? `<p>${escape(deadline)}</p>` : ""}${accessHtml}<p><a href="${escape(restaurantLink)}">Restaurantinformationen</a></p><p>${escape(footer)}</p></body></html>`,
    tags: [{ name: "booking_outbox", value: claim.id }, { name: "booking_proof", value: mailBinding(claim.id, config) }],
  });
  if (Buffer.byteLength(body, "utf8") > 32000) throw new Error("invalid_mail_content");
  return { version: 1, id: claim.id, scope: config.scope, providerKeyHash: mailDigest(config.apiKey), sender: config.from, origin: config.origin, body };
}
function envelopeAad(id: string, digest: string) { return Buffer.from(`backyrd-booking-mail-envelope:v1:${guestUuid(id)}:${mailHash(digest)}`, "utf8"); }
export function sealMailEnvelope(envelope: Envelope, keys: GuestSealKeys): { sealed: string; digest: string } {
  const digest = mailDigest(envelope.body), iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", keys.keys[keys.active], iv);
  cipher.setAAD(envelopeAad(envelope.id, digest));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(envelope), "utf8"), cipher.final()]);
  const sealed = ["m1", keys.active, iv.toString("base64url"), encrypted.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
  if (sealed.length > 65536) throw new Error("invalid_mail_content");
  return { sealed, digest };
}
export function openMailEnvelope(sealed: string, id: string, digest: string, config: MailConfig): Envelope {
  const parts = sealed.split(".");
  if (sealed.length > 65536 || parts.length !== 5 || parts[0] !== "m1" || !Object.hasOwn(config.payloadKeys.keys, parts[1]) || !/^[A-Za-z0-9_-]{16}$/.test(parts[2]) || !/^[A-Za-z0-9_-]+$/.test(parts[3]) || !/^[A-Za-z0-9_-]{22}$/.test(parts[4])) throw new Error("invalid_mail_content");
  const cipher = createDecipheriv("aes-256-gcm", config.payloadKeys.keys[parts[1]], Buffer.from(parts[2], "base64url"));
  cipher.setAAD(envelopeAad(id, digest)); cipher.setAuthTag(Buffer.from(parts[4], "base64url"));
  const e = record(JSON.parse(Buffer.concat([cipher.update(Buffer.from(parts[3], "base64url")), cipher.final()]).toString("utf8")));
  if (e.version !== 1 || e.id !== id || e.scope !== config.scope || e.providerKeyHash !== mailDigest(config.apiKey) || e.sender !== config.from || e.origin !== config.origin || typeof e.body !== "string" || Buffer.byteLength(e.body, "utf8") > 32000 || mailDigest(e.body) !== digest) throw new Error("invalid_mail_content");
  return { version: 1, id, scope: config.scope, providerKeyHash: String(e.providerKeyHash), sender: config.from, origin: config.origin, body: e.body };
}

export type MailWorkerDependencies = { rpc: BookingRpc; config: MailConfig; send: (body: string, idempotencyKey: string) => Promise<MailOutcome>; now?: () => number; deadline?: number };
export async function dispatchOneMail(d: MailWorkerDependencies): Promise<"idle" | "accepted" | "deferred" | "review" | "rejected" | "superseded"> {
  const lease = randomUUID();
  const raw = await d.rpc("booking_mail_claim_v1", { p_lease_id: lease });
  if (raw === null) return "idle";
  const id = guestUuid(record(raw).id);
  let c: MailClaim, prepared: { sealed: string; digest: string };
  try {
    c = parseMailClaim(raw, lease);
    prepared = c.sealed !== null && c.digest !== null ? { sealed: c.sealed, digest: c.digest } : sealMailEnvelope(buildMailEnvelope(c, d.config), d.config.payloadKeys);
    // A stale key/account configuration must never reconstruct or re-encrypt an existing request.
    openMailEnvelope(prepared.sealed, id, prepared.digest, d.config);
  } catch {
    return await d.rpc("booking_mail_finish_v1", { p_id: id, p_lease_id: lease, p_outcome: "review", p_provider_id: null }) === true ? "review" : "deferred";
  }
  if (c.sealed === null) {
    const ready = await d.rpc("booking_mail_prepare_v1", { p_id: id, p_lease_id: lease, p_context: c.context, p_payload: prepared.sealed, p_digest: prepared.digest });
    if (ready !== true) return "superseded";
  }
  if (d.deadline !== undefined && d.deadline - (d.now?.() ?? Date.now()) < 26000) return "deferred";
  const permission = await d.rpc("booking_mail_begin_v1", { p_id: id, p_lease_id: lease, p_digest: prepared.digest });
  if (permission === null) return "superseded";
  let envelope: Envelope, key: string;
  try {
    const p = record(permission);
    key = `backyrd-booking/${id}`;
    if (p.id !== id || p.lease_id !== lease || p.idempotency_key !== key || p.payload_digest !== prepared.digest || p.payload_sealed !== prepared.sealed || typeof p.retry_until !== "string" || !Number.isFinite(Date.parse(p.retry_until)) || Date.parse(p.retry_until) <= (d.now?.() ?? Date.now()) + 10000) throw new Error("invalid_mail_permission");
    envelope = openMailEnvelope(prepared.sealed, id, prepared.digest, d.config);
  } catch {
    await d.rpc("booking_mail_finish_v1", { p_id: id, p_lease_id: lease, p_outcome: "review", p_provider_id: null });
    return "review";
  }
  let result: MailOutcome;
  try { result = await d.send(envelope.body, key); } catch { result = { outcome: "retry" }; }
  const saved = await d.rpc("booking_mail_finish_v1", { p_id: id, p_lease_id: lease, p_outcome: result.outcome, p_provider_id: result.outcome === "accepted" ? result.providerId : null });
  if (saved !== true) return "deferred"; // A callback or newer lease may already own the authoritative state.
  return result.outcome === "retry" ? "deferred" : result.outcome;
}
