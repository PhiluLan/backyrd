import "server-only";
import { guestUuid } from "./booking-guest-contract";
import { guestSealKeys } from "./booking-guest-security";
import { createBookingServiceRpc } from "./booking-service-rpc";
import { mailEmail, mailText, type MailConfig } from "./booking-mail";
import { sendBookingMail, verifiedMailCallback, verifiedMailSender } from "./booking-mail-provider";

function service(allowed: ReadonlySet<string>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("booking_backend_unavailable");
  return createBookingServiceRpc({ url, key, development: process.env.NODE_ENV === "development" }, allowed);
}
function bindingConfiguration() {
  const scope = process.env.BOOKING_MAIL_SCOPE;
  if (!scope || !/^[A-Za-z0-9_-]{1,64}$/.test(scope)) throw new Error("mail_unavailable");
  const bindingKeys = guestSealKeys(process.env.BOOKING_MAIL_BINDING_ACTIVE ?? "", process.env.BOOKING_MAIL_BINDING_KEYS ?? "");
  return { scope, bindingKeys };
}
export function mailJobDependencies() {
  if (process.env.BOOKING_MAIL_DISPATCH_ENABLED !== "true") return null;
  try {
    const callback = mailCallbackDependencies();
    if (!callback) return null;
    const apiKey = mailText(process.env.BOOKING_RESEND_API_KEY, 500);
    const secret = mailText(process.env.BOOKING_MAIL_WORKER_SECRET, 500);
    if (Buffer.byteLength(secret, "utf8") < 32) return null;
    const origin = mailText(process.env.BOOKING_GUEST_ORIGIN, 300), parsed = new URL(origin);
    if (parsed.protocol !== "https:" || parsed.origin !== origin) return null;
    const config: MailConfig = {
      ...bindingConfiguration(), apiKey, origin, from: mailEmail(process.env.BOOKING_MAIL_FROM),
      guestKeys: guestSealKeys(process.env.BOOKING_GUEST_SEAL_ACTIVE ?? "", process.env.BOOKING_GUEST_SEAL_KEYS ?? ""),
      payloadKeys: guestSealKeys(process.env.BOOKING_MAIL_SEAL_ACTIVE ?? "", process.env.BOOKING_MAIL_SEAL_KEYS ?? ""),
    };
    const domainId = guestUuid(process.env.BOOKING_MAIL_DOMAIN_ID);
    const webhookId = guestUuid(process.env.BOOKING_MAIL_WEBHOOK_ID);
    const rpc = service(new Set(["backyrd_consume_launch_cost_boundary_v1", "booking_mail_claim_v1", "booking_mail_prepare_v1", "booking_mail_begin_v1", "booking_mail_finish_v1"]));
    let lastProviderCall = 0;
    return {
      config, rpc, secret,
      async senderReady() {
        const domainReady = await verifiedMailSender(domainId, config.from, apiKey);
        lastProviderCall = Date.now();
        if (!domainReady) return false;
        await new Promise(resolve => setTimeout(resolve, 600));
        const callbackReady = await verifiedMailCallback(webhookId, config.origin, callback.secrets, apiKey);
        lastProviderCall = Date.now();
        return callbackReady;
      },
      async send(body: string, idempotencyKey: string) {
        const wait = Math.max(0, lastProviderCall + 600 - Date.now());
        if (wait) await new Promise(resolve => setTimeout(resolve, wait));
        lastProviderCall = Date.now();
        return sendBookingMail(body, idempotencyKey, apiKey);
      },
    };
  } catch { return null; }
}
export function mailCallbackDependencies() {
  try {
    const secrets: unknown = JSON.parse(process.env.BOOKING_MAIL_WEBHOOK_SECRETS ?? "");
    if (!Array.isArray(secrets) || secrets.length < 1 || secrets.length > 8 || secrets.some(secret => typeof secret !== "string" || !/^whsec_[A-Za-z0-9+/]{22,}={0,2}$/.test(secret))) return null;
    return { config: bindingConfiguration(), secrets: secrets as string[], rpc: service(new Set(["booking_mail_event_v1"])) };
  } catch { return null; }
}
