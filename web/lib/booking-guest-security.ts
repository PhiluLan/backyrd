import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { guestKey, guestUuid, record } from "./booking-guest-contract";

export type GuestSealKeys = { active: string; keys: Readonly<Record<string, Buffer>> };
export function guestSealKeys(active: string, encoded: string): GuestSealKeys {
  const values = record(JSON.parse(encoded));
  const keys: Record<string, Buffer> = {};
  if (Object.keys(values).length > 8) throw new Error("guest_keys_unavailable");
  for (const [id, value] of Object.entries(values)) {
    if (!/^[a-zA-Z0-9_-]{1,24}$/.test(id) || typeof value !== "string") throw new Error("guest_keys_unavailable");
    const bytes = Buffer.from(value, "base64");
    if (bytes.length !== 32 || bytes.toString("base64") !== value) throw new Error("guest_keys_unavailable");
    keys[id] = bytes;
  }
  if (!Object.hasOwn(keys, active)) throw new Error("guest_keys_unavailable");
  return { active, keys };
}
export function hashGuestKey(key: string): string {
  return createHash("sha256").update(Buffer.from(guestKey(key), "base64url")).digest("hex");
}
function aad(spot: string, request: string, hash: string) {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("invalid_guest_key_context");
  return Buffer.from(`backyrd-booking-guest:v1:${guestUuid(spot)}:${guestUuid(request)}:${hash}`, "utf8");
}
export function sealGuestKey(key: string, spot: string, request: string, keyring: GuestSealKeys): string {
  const raw = guestKey(key), iv = randomBytes(12), context = aad(spot, request, hashGuestKey(raw));
  const cipher = createCipheriv("aes-256-gcm", keyring.keys[keyring.active], iv);
  cipher.setAAD(context);
  const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  return ["v1", keyring.active, iv.toString("base64url"), encrypted.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}
export function openGuestKey(sealed: string, spot: string, request: string, hash: string, keyring: GuestSealKeys): string {
  const parts = sealed.split(".");
  if (parts.length !== 5 || parts[0] !== "v1" || !Object.hasOwn(keyring.keys, parts[1]) || !/^[A-Za-z0-9_-]{16}$/.test(parts[2]) || !/^[A-Za-z0-9_-]{58}$/.test(parts[3]) || !/^[A-Za-z0-9_-]{22}$/.test(parts[4])) throw new Error("invalid_guest_seal");
  const cipher = createDecipheriv("aes-256-gcm", keyring.keys[parts[1]], Buffer.from(parts[2], "base64url"));
  cipher.setAAD(aad(spot, request, hash));
  cipher.setAuthTag(Buffer.from(parts[4], "base64url"));
  const raw = guestKey(Buffer.concat([cipher.update(Buffer.from(parts[3], "base64url")), cipher.final()]).toString("utf8"));
  if (hashGuestKey(raw) !== hash) throw new Error("invalid_guest_seal");
  return raw;
}

/** Only Vercel's platform-controlled header is trusted, and only on Vercel.
 * Other deployments share a conservative bucket; arbitrary XFF never creates a fresh quota. */
export function guestRateSubject(headers: Headers, vercel: boolean, secret: string): string {
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("guest_rate_unavailable");
  const supplied = vercel ? headers.get("x-vercel-forwarded-for")?.trim() : null;
  const address = supplied && isIP(supplied) ? supplied.toLowerCase() : "unattributed";
  return createHmac("sha256", secret).update(`booking-guest:v1:${address}`).digest("hex");
}

/** Enforce the limit while streaming, including chunked requests with no Content-Length. */
export async function boundedJson(response: Request | Response, maximum: number, timeoutMs = 8000): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("guest_body_limit");
  }
  if (!response.body) throw new Error("guest_body_missing");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => undefined); reject(new Error("guest_body_timeout")); }, timeoutMs); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (done) break;
      total += value.byteLength;
      if (total > maximum) throw new Error("guest_body_limit");
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks, total);
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } finally {
    clearTimeout(timer);
    // Do not wait for a misbehaving client to acknowledge cancellation.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function verifyGuestChallenge(token: string, origin: string, secret: string, transport: typeof fetch = fetch): Promise<boolean> {
  const response = await transport("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ secret, response: token }), signal: AbortSignal.timeout(5000), redirect: "error",
  });
  if (!response.ok) return false;
  const result = record(await boundedJson(response, 8192, 5000));
  return result.success === true && result.hostname === new URL(origin).hostname && result.action === "booking_create";
}
