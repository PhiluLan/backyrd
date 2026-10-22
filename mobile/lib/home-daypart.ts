/** Local device time determines the Home headline; boundaries are inclusive by minute. */
export function homeDaypart(now: Date): "Morgen" | "Vormittag" | "Mittag" | "Nachmittag" | "Abend" | "Nacht" {
  const minute = now.getHours() * 60 + now.getMinutes();
  if (minute >= 5 * 60 && minute <= 9 * 60) return "Morgen";
  if (minute <= 11 * 60 + 59 && minute > 9 * 60) return "Vormittag";
  if (minute >= 12 * 60 && minute <= 14 * 60) return "Mittag";
  if (minute <= 17 * 60 && minute > 14 * 60) return "Nachmittag";
  if (minute <= 22 * 60 && minute > 17 * 60) return "Abend";
  return "Nacht";
}
