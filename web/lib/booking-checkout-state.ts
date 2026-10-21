import { guestKey, guestUuid, parseGuestPolicy, parseGuestRequest, record, type GuestPolicySnapshot, type GuestRequest } from "./booking-guest-contract";
export type CheckoutIntent = Omit<Extract<GuestRequest, { operation: "create" }>, "challenge">;
export type CheckoutStored = { kind: "pending"; intent: CheckoutIntent; policy: GuestPolicySnapshot; restaurantName: string } | { kind: "complete"; reservationId: string; key: string };
export const checkoutStorageKey = (spot: string) => `backyrd.booking.checkout.v1:${guestUuid(spot)}`;
export function parseCheckoutStored(value: unknown, spot: string): CheckoutStored {
  const s = record(value);
  if (s.kind === "complete") return { kind: "complete", reservationId: guestUuid(s.reservationId), key: guestKey(s.key) };
  if (s.kind !== "pending") throw new Error("invalid_checkout_storage");
  const raw = record(s.intent);
  if (Object.hasOwn(raw, "challenge")) throw new Error("invalid_checkout_storage");
  const parsed = parseGuestRequest({ ...raw, challenge: "storage-validation-only" });
  if (parsed.operation !== "create" || parsed.spotId !== spot) throw new Error("invalid_checkout_storage");
  const { challenge: transientProof, ...intent } = parsed; void transientProof;
  const policy = parseGuestPolicy(s.policy);
  if (policy.policy_revision !== intent.policyRevision || typeof s.restaurantName !== "string" || s.restaurantName.length < 1 || s.restaurantName.length > 300) throw new Error("invalid_checkout_storage");
  return { kind: "pending", intent, policy, restaurantName: s.restaurantName };
}
export function readCheckoutStored(spot: string): CheckoutStored | null {
  const raw = sessionStorage.getItem(checkoutStorageKey(spot));
  if (raw === null) return null;
  if (raw.length > 8192) throw new Error("invalid_checkout_storage");
  return parseCheckoutStored(JSON.parse(raw), spot);
}
export function saveCheckoutStored(spot: string, value: CheckoutStored): boolean {
  try {
    const key = checkoutStorageKey(spot), raw = JSON.stringify(value);
    sessionStorage.setItem(key, raw);
    return sessionStorage.getItem(key) === raw;
  } catch { return false; }
}
export function clearCheckoutStored(spot: string) {
  try { const key = checkoutStorageKey(spot); sessionStorage.removeItem(key); return sessionStorage.getItem(key) === null; } catch { return false; }
}
export function newGuestCheckoutKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
