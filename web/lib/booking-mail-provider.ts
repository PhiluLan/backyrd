import "server-only";
import { guestUuid, record } from "./booking-guest-contract";
import { boundedJson } from "./booking-guest-security";
import { mailEmail, type MailOutcome } from "./booking-mail";
import { timingSafeEqual } from "node:crypto";

export const requiredMailEvents = ["email.sent", "email.delivery_delayed", "email.delivered", "email.bounced", "email.complained", "email.failed", "email.suppressed"] as const;

export async function verifiedMailSender(domainId: string, from: string, verificationKey: string, transport: typeof fetch = fetch): Promise<boolean> {
  const id = guestUuid(domainId), email = mailEmail(from);
  const response = await transport(`https://api.resend.com/domains/${id}`, { headers: { Authorization: `Bearer ${verificationKey}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!response.ok) return false;
  const domain = record(await boundedJson(response, 65536, 5000));
  const capabilities = record(domain.capabilities);
  // Tracking would send a guest capability through an additional redirect service.
  return domain.id === id && domain.name === email.slice(email.lastIndexOf("@") + 1) && domain.status === "verified" && capabilities.sending === "enabled" && domain.open_tracking === false && domain.click_tracking === false;
}

export async function verifiedMailCallback(webhookId: string, origin: string, secrets: readonly string[], apiKey: string, transport: typeof fetch = fetch): Promise<boolean> {
  const id = guestUuid(webhookId), base = new URL(origin);
  if (base.protocol !== "https:" || base.origin !== origin) return false;
  const response = await transport(`https://api.resend.com/webhooks/${id}`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!response.ok) return false;
  const hook = record(await boundedJson(response, 65536, 5000));
  if (hook.id !== id || hook.endpoint !== new URL("/api/booking/mail/events", base).href || hook.status !== "enabled" || !Array.isArray(hook.events) || !requiredMailEvents.every(event => (hook.events as unknown[]).includes(event)) || typeof hook.signing_secret !== "string") return false;
  const actual = Buffer.from(hook.signing_secret);
  return secrets.some(secret => { const expected = Buffer.from(secret); return actual.length === expected.length && timingSafeEqual(actual, expected); });
}

export async function sendBookingMail(body: string, idempotencyKey: string, apiKey: string, transport: typeof fetch = fetch): Promise<MailOutcome> {
  if (!/^backyrd-booking\/[0-9a-f-]{36}$/.test(idempotencyKey) || Buffer.byteLength(body, "utf8") > 32000) return { outcome: "review" };
  let response: Response;
  try {
    response = await transport("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
  } catch { return { outcome: "retry" }; }
  try {
    const result = record(await boundedJson(response, 16384));
    if (response.ok) return { outcome: "accepted", providerId: guestUuid(result.id) };
    if (response.status === 409) return { outcome: result.name === "concurrent_idempotent_requests" ? "retry" : "review" };
    if (response.status === 429 || response.status >= 500 || response.status === 408) return { outcome: "retry" };
    if ([400, 401, 403, 404, 405, 422].includes(response.status)) return { outcome: "rejected" };
    return { outcome: "review" };
  } catch { return { outcome: "retry" }; } // A malformed success/proxy response cannot prove non-delivery.
}
