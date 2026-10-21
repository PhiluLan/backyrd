import "server-only";
import { bookingStaffMailDependencies } from "./booking-mail-staff-server";
export function mailSummaryDependencies() {
  return bookingStaffMailDependencies(new Set(["backyrd_consume_launch_cost_boundary_v1","booking_mail_summary_recover_v1","booking_mail_summary_context_v1","booking_mail_summary_v1"]));
}
