import type { Metadata } from "next";
import { BookingEntry } from "@/components/booking/team-invitation";

export const metadata: Metadata = { title: "Booking Console", robots: { index: false, follow: false } };

export default function BookingConsolePage() { return <BookingEntry />; }
