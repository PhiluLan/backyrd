import type { Metadata } from "next";
import { GuestManage } from "@/components/booking/guest-manage";

export const metadata: Metadata = { title: "Deine Reservierung", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";
export default function BookingManagePage() { return <GuestManage />; }
