export type Preset = "today" | "yesterday" | "week" | "last_week" | "month" | "last_month" | "year" | "last_year";

export const presets: Array<[Preset, string]> = [
  ["today", "Heute"], ["yesterday", "Gestern"], ["week", "Diese Woche"],
  ["last_week", "Letzte Woche"], ["month", "Dieser Monat"], ["last_month", "Letzter Monat"],
  ["year", "Dieses Jahr"], ["last_year", "Letztes Jahr"],
];

export function rangeFor(preset: Preset) {
  const now = new Date();
  const startDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let from: Date; let to: Date;
  switch (preset) {
    case "today": from = startDay(now); to = now; break;
    case "yesterday": to = startDay(now); from = new Date(to); from.setDate(from.getDate() - 1); break;
    case "week": from = startDay(now); from.setDate(from.getDate() - ((from.getDay() + 6) % 7)); to = now; break;
    case "last_week": to = startDay(now); to.setDate(to.getDate() - ((to.getDay() + 6) % 7)); from = new Date(to); from.setDate(from.getDate() - 7); break;
    case "month": from = new Date(now.getFullYear(), now.getMonth(), 1); to = now; break;
    case "last_month": from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "year": from = new Date(now.getFullYear(), 0, 1); to = now; break;
    case "last_year": from = new Date(now.getFullYear() - 1, 0, 1); to = new Date(now.getFullYear(), 0, 1); break;
  }
  return { from: from!.toISOString(), to: to!.toISOString() };
}

export function number(value: unknown, digits = 0) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? new Intl.NumberFormat("de-CH", { maximumFractionDigits: digits }).format(n) : "—";
}

export function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" }) : "—";
}
