import type { BookingStatus } from "@/lib/booking-api";

export const statusLabels: Record<BookingStatus, string> = { pending: "Anfrage offen", confirmed: "Bestätigt", arrived: "Angekommen", seated: "Am Tisch", completed: "Besuch beendet", cancelled: "Storniert", declined: "Abgelehnt", no_show: "Nicht erschienen" };
