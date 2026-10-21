import type { BookingStatus, BookingSource } from "@/lib/booking-api";

export const statusLabels: Record<BookingStatus, string> = { pending: "Anfrage offen", confirmed: "Bestätigt", arrived: "Angekommen", seated: "Am Tisch", completed: "Besuch beendet", cancelled: "Storniert", declined: "Abgelehnt", no_show: "Nicht erschienen" };

export const sourceLabels: Record<BookingSource,string> = { phone: "Telefon", email: "E-Mail", walk_in: "Vor Ort", operator: "Betreiber", website: "Online-Buchung" };
