import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestCheckout } from "@/components/booking/guest-checkout";
import { guestUuid } from "@/lib/booking-guest-contract";
export const metadata: Metadata = { title: "Tisch reservieren · Backyrd Booking", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";
export default async function BookingCheckoutPage({ params }: { params: Promise<{ spotId: string }> }) {
  const { spotId } = await params;
  let id: string;
  try { id = guestUuid(spotId); } catch { notFound(); }
  return <GuestCheckout key={id} spotId={id} siteKey={process.env.NEXT_PUBLIC_BOOKING_TURNSTILE_SITE_KEY ?? ""} />;
}
