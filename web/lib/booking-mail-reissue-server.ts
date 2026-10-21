import "server-only";
import { bookingStaffMailDependencies } from "./booking-mail-staff-server";
import { guestSealKeys, sealGuestKey } from "./booking-guest-security";
import type { MailReissueDependencies } from "./booking-mail-reissue-http";
export function mailReissueDependencies(): MailReissueDependencies | null {
  const base = bookingStaffMailDependencies(new Set(["backyrd_consume_launch_cost_boundary_v1", "booking_mail_reissue_recover_v1", "booking_mail_reissue_context_v1", "booking_mail_reissue_v1"]));
  return base ? { ...base, seal: (guestKey, spot, request) => sealGuestKey(guestKey, spot, request, guestSealKeys(process.env.BOOKING_GUEST_SEAL_ACTIVE ?? "", process.env.BOOKING_GUEST_SEAL_KEYS ?? "")) } : null;
}
