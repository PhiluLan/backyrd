import { handleGuestRequest } from "@/lib/booking-guest-handler";
import { guestDependencies } from "@/lib/booking-guest-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleGuestRequest(request, guestDependencies());
}
