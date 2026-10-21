import "server-only";
import { ownerActor } from "./owner-billing/server";
import { mailJobDependencies } from "./booking-mail-server";
import { createBookingServiceRpc } from "./booking-service-rpc";
import type { BookingRpc } from "./booking-service-rpc";
export type BookingStaffMailDependencies = { origin: string; actor(request: Request): Promise<string | null>; rpc: BookingRpc; senderReady(): Promise<boolean> };
export function bookingStaffMailDependencies(allowed: ReadonlySet<string>): BookingStaffMailDependencies | null {
  try {
    const origin = process.env.BOOKING_GUEST_ORIGIN, url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!origin || !url || !key) return null;
    const parsed = new URL(origin);
    if (parsed.origin !== origin || (parsed.protocol !== "https:" && !(process.env.NODE_ENV === "development" && ["127.0.0.1", "localhost"].includes(parsed.hostname)))) return null;
    const worker = mailJobDependencies();
    return {
      origin,
      // Fresh verified identity; current Booking roles and Safety are checked again in SQL.
      async actor(request) {
        const token = request.headers.get("authorization") ?? "";
        if (!/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(token)) return null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { return await Promise.race([ownerActor(request).then(actor => actor?.id ?? null), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("booking_auth_unavailable")), 8000); })]); }
        finally { clearTimeout(timer); }
      },
      rpc: createBookingServiceRpc({ url, key, development: process.env.NODE_ENV === "development" }, allowed),
      senderReady: () => worker ? worker.senderReady() : Promise.resolve(false),
    };
  } catch { return null; }
}
