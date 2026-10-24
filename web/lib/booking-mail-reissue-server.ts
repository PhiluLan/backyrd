import "server-only";
import { ownerActor } from "./owner-billing/server";
import { mailJobDependencies } from "./booking-mail-server";
import { createBookingServiceRpc } from "./booking-service-rpc";
import { guestSealKeys, sealGuestKey } from "./booking-guest-security";
import type { MailReissueDependencies } from "./booking-mail-reissue-http";
export function mailReissueDependencies(): MailReissueDependencies | null {
  try {
    const origin = process.env.BOOKING_GUEST_ORIGIN, url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!origin || !url || !key) return null;
    const parsed = new URL(origin);
    if (parsed.origin !== origin || (parsed.protocol !== "https:" && !(process.env.NODE_ENV === "development" && ["127.0.0.1", "localhost"].includes(parsed.hostname)))) return null;
    const worker = mailJobDependencies();
    return {
      origin,
      // Reuse the existing fresh getUser(Bearer) verification. No Billing or
      // Owner-only authorization is invoked; current Booking roles decide in SQL.
      async actor(request) {
        const token = request.headers.get("authorization") ?? "";
        if (!/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(token)) return null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { return await Promise.race([ownerActor(request).then(actor => actor?.id ?? null), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("booking_auth_unavailable")), 8000); })]); }
        finally { clearTimeout(timer); }
      },
      rpc: createBookingServiceRpc({ url, key, development: process.env.NODE_ENV === "development" }, new Set(["backyrd_consume_launch_cost_boundary_v1", "booking_mail_reissue_recover_v1", "booking_mail_reissue_context_v1", "booking_mail_reissue_v1"])),
      senderReady: () => worker ? worker.senderReady() : Promise.resolve(false),
      seal: (guestKey, spot, request) => sealGuestKey(guestKey, spot, request, guestSealKeys(process.env.BOOKING_GUEST_SEAL_ACTIVE ?? "", process.env.BOOKING_GUEST_SEAL_KEYS ?? "")),
    };
  } catch { return null; }
}
