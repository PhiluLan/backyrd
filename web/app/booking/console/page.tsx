import type { Metadata } from "next";
import { BookingConsole } from "@/components/booking/booking-console";

export const metadata: Metadata = { title: "Booking Console", robots: { index: false, follow: false } };

export default function BookingConsolePage() { return <BookingConsole />; }
