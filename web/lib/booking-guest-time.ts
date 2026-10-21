export const guestDate = (at = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
export const guestWhen = (value: string) => new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(value));
export function guestSlotTime(value: string, slots: readonly { starts_at: string }[]) {
  const clock = (at: string) => new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" }).format(new Date(at));
  const same = slots.filter(s => guestDate(new Date(s.starts_at)) === guestDate(new Date(value)) && clock(s.starts_at) === clock(value));
  return new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", ...(same.length > 1 ? { timeZoneName: "shortOffset" as const } : {}) }).format(new Date(value));
}
