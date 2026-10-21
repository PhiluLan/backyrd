/** Public guest DTOs. No owner client, credentials, physical inventory or guest contact. */
export type GuestOperation = "availability" | "create" | "read" | "recover" | "checkout_recover" | "cancel";
export type GuestPolicySnapshot = { policy_revision: number; cancellation_minutes: number; confirmation_status: "pending" | "confirmed"; privacy_contact: string; guest_notice: string };
export type GuestReceipt = {
  id: string; spot_id: string; name: string; guest_name: string; party_size: number;
  starts_at: string; ends_at: string; status: "pending" | "confirmed" | "arrived" | "seated" | "completed" | "cancelled" | "declined" | "no_show";
  revision: number; cancellation_deadline: string; policy_snapshot?: GuestPolicySnapshot | null;
};
export type GuestAvailability = {
  spot_id: string; name: string; date: string; party_size: number; policy_revision: number;
  notice_minutes: number; horizon_days: number; cancellation_minutes: number;
  max_party_size?: number; confirmation_status: "pending" | "confirmed"; privacy_contact: string; guest_notice: string;
  slots: { starts_at: string; ends_at: string }[];
};
export type GuestCheckoutTerminal = { not_committed: true; spot_id: string; request_id: string; policy_revision: number; starts_at: string };
/** Current root-locked receipt: the older compare-and-set can no longer change this state. */
export function guestCancellationFenced(receipt: GuestReceipt, expectedRevision: number) {
  return receipt.status === "cancelled" || receipt.revision > expectedRevision;
}
export type GuestRequest =
  | { operation: "availability"; spotId: string; date: string; partySize: number }
  | { operation: "create"; spotId: string; requestId: string; policyRevision: number; startsAt: string; partySize: number; name: string; email: string; key: string; note: string; challenge: string; acceptedPolicy: true }
  | { operation: "read"; reservationId: string; key: string }
  | { operation: "recover"; spotId: string; requestId: string; key: string }
  | { operation: "checkout_recover"; spotId: string; requestId: string; key: string; policyRevision: number; startsAt: string }
  | { operation: "cancel"; reservationId: string; requestId: string; revision: number; key: string };

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_guest_contract");
  return value as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number, multiline = false): string {
  const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u;
  if (typeof value !== "string" || value.length < min || value.length > max || controls.test(value)) throw new Error("invalid_guest_contract");
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new Error("invalid_guest_contract");
  return value;
}
export function guestUuid(value: unknown): string {
  const id = text(value, 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error("invalid_guest_contract");
  return id.toLowerCase();
}
export function guestKey(value: unknown): string {
  const key = text(value, 43, 43);
  // Canonical unpadded base64url for exactly 32 random bytes (last two bits zero).
  if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(key)) throw new Error("invalid_guest_contract");
  return key;
}
function date(value: unknown): string {
  const result = text(value, 10, 10);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(result) || new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result) throw new Error("invalid_guest_contract");
  return result;
}
function instant(value: unknown): string {
  const result = text(value, 20, 40);
  if (!/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error("invalid_guest_contract");
  date(result.slice(0, 10));
  if (Number(result.slice(11, 13)) > 23 || Number(result.slice(14, 16)) > 59 || Number(result.slice(17, 19)) > 59) throw new Error("invalid_guest_contract");
  return result;
}
function exact(input: Record<string, unknown>, keys: string[]) {
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) throw new Error("invalid_guest_contract");
}
export function parseGuestRequest(value: unknown): GuestRequest {
  const r = record(value);
  switch (r.operation) {
    case "availability":
      exact(r, ["operation", "spotId", "date", "partySize"]);
      return { operation: r.operation, spotId: guestUuid(r.spotId), date: date(r.date), partySize: integer(r.partySize, 1, 500) };
    case "create": {
      exact(r, ["operation", "spotId", "requestId", "policyRevision", "startsAt", "partySize", "name", "email", "key", "note", "challenge", "acceptedPolicy"]);
      if (r.acceptedPolicy !== true) throw new Error("invalid_guest_contract");
      const email = text(r.email, 3, 254).trim().toLowerCase();
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)) throw new Error("invalid_guest_contract");
      const name = text(r.name, 1, 120).trim();
      if (!name) throw new Error("invalid_guest_contract");
      return { operation: r.operation, spotId: guestUuid(r.spotId), requestId: guestUuid(r.requestId), policyRevision: integer(r.policyRevision, 1, Number.MAX_SAFE_INTEGER), startsAt: instant(r.startsAt), partySize: integer(r.partySize, 1, 500), name, email, key: guestKey(r.key), acceptedPolicy: true, note: text(r.note, 0, 1000, true).trim(), challenge: text(r.challenge, 1, 2048) };
    }
    case "read":
      exact(r, ["operation", "reservationId", "key"]);
      return { operation: r.operation, reservationId: guestUuid(r.reservationId), key: guestKey(r.key) };
    case "recover":
      exact(r, ["operation", "spotId", "requestId", "key"]);
      return { operation: r.operation, spotId: guestUuid(r.spotId), requestId: guestUuid(r.requestId), key: guestKey(r.key) };
    case "checkout_recover":
      exact(r, ["operation", "spotId", "requestId", "key", "policyRevision", "startsAt"]);
      return { operation: r.operation, spotId: guestUuid(r.spotId), requestId: guestUuid(r.requestId), key: guestKey(r.key), policyRevision: integer(r.policyRevision, 1, Number.MAX_SAFE_INTEGER), startsAt: instant(r.startsAt) };
    case "cancel":
      exact(r, ["operation", "reservationId", "requestId", "revision", "key"]);
      return { operation: r.operation, reservationId: guestUuid(r.reservationId), requestId: guestUuid(r.requestId), revision: integer(r.revision, 0, Number.MAX_SAFE_INTEGER), key: guestKey(r.key) };
    default: throw new Error("invalid_guest_contract");
  }
}
export type GuestBookingSummary = Pick<GuestReceipt, "id" | "spot_id" | "name" | "guest_name" | "party_size" | "starts_at" | "ends_at" | "status" | "revision">;
export function parseGuestBookingSummary(value: unknown): GuestBookingSummary {
  const r = record(value);
  const status = r.status;
  if (status !== "pending" && status !== "confirmed" && status !== "arrived" && status !== "seated" && status !== "completed" && status !== "cancelled" && status !== "declined" && status !== "no_show") throw new Error("invalid_guest_contract");
  const starts = instant(r.starts_at), ends = instant(r.ends_at);
  if (Date.parse(ends) <= Date.parse(starts)) throw new Error("invalid_guest_contract");
  return { id: guestUuid(r.id), spot_id: guestUuid(r.spot_id), name: text(r.name, 1, 300), guest_name: text(r.guest_name, 1, 120), party_size: integer(r.party_size, 1, 500), starts_at: starts, ends_at: ends, status, revision: integer(r.revision, 0, Number.MAX_SAFE_INTEGER) };
}
export function parseGuestReceipt(value: unknown): GuestReceipt {
  const r = record(value);
  return { ...parseGuestBookingSummary(r), cancellation_deadline: instant(r.cancellation_deadline), ...(r.policy_snapshot === undefined ? {} : { policy_snapshot: r.policy_snapshot === null ? null : parseGuestPolicy(r.policy_snapshot) }) };
}
export function parseGuestPolicy(value: unknown): GuestPolicySnapshot {
  const p = record(value);
  if (p.confirmation_status !== "confirmed" && p.confirmation_status !== "pending") throw new Error("invalid_guest_contract");
  return { policy_revision: integer(p.policy_revision, 1, Number.MAX_SAFE_INTEGER), cancellation_minutes: integer(p.cancellation_minutes, 0, 10080), confirmation_status: p.confirmation_status, privacy_contact: text(p.privacy_contact, 1, 254), guest_notice: text(p.guest_notice, 0, 1000, true) };
}
export function parseGuestAvailability(value: unknown): GuestAvailability {
  const r = record(value);
  if (r.confirmation_status !== "pending" && r.confirmation_status !== "confirmed") throw new Error("invalid_guest_contract");
  if (!Array.isArray(r.slots) || r.slots.length > 10000) throw new Error("invalid_guest_contract");
  const seen = new Set<number>();
  const slots = r.slots.map(value => {
    const slot = record(value), start = instant(slot.starts_at), end = instant(slot.ends_at), stamp = Date.parse(start);
    if (Date.parse(end) <= stamp || seen.has(stamp)) throw new Error("invalid_guest_contract");
    seen.add(stamp);
    return { starts_at: start, ends_at: end };
  });
  return { spot_id: guestUuid(r.spot_id), name: text(r.name, 1, 300), date: date(r.date), party_size: integer(r.party_size, 1, 500), policy_revision: integer(r.policy_revision, 1, Number.MAX_SAFE_INTEGER), notice_minutes: integer(r.notice_minutes, 15, 10080), horizon_days: integer(r.horizon_days, 1, 365), cancellation_minutes: integer(r.cancellation_minutes, 0, 10080), confirmation_status: r.confirmation_status, privacy_contact: text(r.privacy_contact, 1, 254), guest_notice: text(r.guest_notice, 0, 1000, true), ...(r.max_party_size === undefined ? {} : { max_party_size: integer(r.max_party_size, 1, 30) }), slots };
}

export function parseGuestCheckoutRecovery(value: unknown, r: Extract<GuestRequest, { operation: "checkout_recover" }>): GuestCheckoutTerminal | GuestReceipt {
  const row = record(value);
  if (row.not_committed !== true) return parseGuestReceipt(value);
  const result: GuestCheckoutTerminal = { not_committed: true, spot_id: guestUuid(row.spot_id), request_id: guestUuid(row.request_id), policy_revision: integer(row.policy_revision, 1, Number.MAX_SAFE_INTEGER), starts_at: instant(row.starts_at) };
  if (result.spot_id !== r.spotId || result.request_id !== r.requestId || result.policy_revision !== r.policyRevision || Date.parse(result.starts_at) !== Date.parse(r.startsAt)) throw new Error("invalid_guest_contract");
  return result;
}
