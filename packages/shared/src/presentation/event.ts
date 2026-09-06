import type { EventCategoryDTO } from "../dto/event";

const BASEL_TIME_ZONE = "Europe/Zurich";

const CATEGORY_LABELS: Readonly<Record<EventCategoryDTO, string>> = {
  MUSIC: "Musik",
  NIGHTLIFE: "Nightlife",
  ART: "Kunst",
  THEATRE: "Bühne",
  FILM: "Film",
  FOOD_DRINK: "Food & Drinks",
  FAMILY: "Familie",
  SPORT: "Sport",
  ACTIVITY: "Aktivität",
  LEISURE: "Freizeit",
  MARKET: "Markt",
  WORKSHOP: "Workshop",
  COMMUNITY: "Quartier & Community",
  OTHER: "Event",
};

const WEEKDAYS = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

const WEEKDAY_ADVERBS: Readonly<Record<(typeof WEEKDAYS)[number], string>> = {
  Montag: "montags",
  Dienstag: "dienstags",
  Mittwoch: "mittwochs",
  Donnerstag: "donnerstags",
  Freitag: "freitags",
  Samstag: "samstags",
  Sonntag: "sonntags",
};

const RRULE_WEEKDAYS: Readonly<Record<string, (typeof WEEKDAYS)[number]>> = {
  MO: "Montag",
  TU: "Dienstag",
  WE: "Mittwoch",
  TH: "Donnerstag",
  FR: "Freitag",
  SA: "Samstag",
  SU: "Sonntag",
};

function clean(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-CH")
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function joinNatural(values: string[]): string {
  if (values.length < 2) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} und ${values.at(-1)}`;
}

function numberWord(value: number): string {
  return value === 2 ? "zwei" : String(value);
}

function weekdayNames(value: string): (typeof WEEKDAYS)[number][] {
  const normalizedValue = normalized(value);
  return WEEKDAYS.filter((weekday) =>
    new RegExp(`\\b${normalized(weekday)}(?:s)?\\b`, "i").test(normalizedValue),
  );
}

function weeklyCopy(interval: number, weekdays: (typeof WEEKDAYS)[number][]): string {
  if (weekdays.length === 1 && interval === 1) return `Jeden ${weekdays[0]}`;
  if (weekdays.length === 1 && interval === 2) return `Jeden zweiten ${weekdays[0]}`;
  if (weekdays.length > 0) {
    const days = joinNatural(weekdays.map((weekday) => WEEKDAY_ADVERBS[weekday]));
    if (interval === 1) return `Wöchentlich, jeweils ${days}`;
    return `Alle ${numberWord(interval)} Wochen, jeweils ${days}`;
  }
  if (interval === 1) return "Wöchentlich";
  return `Alle ${numberWord(interval)} Wochen`;
}

function rruleCopy(value: string): string | null {
  const raw = value.replace(/^RRULE:/i, "");
  if (!/FREQ=/i.test(raw)) return null;
  const parts = Object.fromEntries(
    raw.split(";").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key?.toUpperCase(), rest.join("=")];
    }),
  );
  const interval = Math.max(1, Number(parts.INTERVAL) || 1);
  if (parts.FREQ === "DAILY") {
    return interval === 1 ? "Täglich" : `Alle ${numberWord(interval)} Tage`;
  }
  if (parts.FREQ === "WEEKLY") {
    const weekdays = (parts.BYDAY ?? "")
      .split(",")
      .map((day) => RRULE_WEEKDAYS[day.toUpperCase()])
      .filter((day): day is (typeof WEEKDAYS)[number] => Boolean(day));
    return weeklyCopy(interval, weekdays);
  }
  if (parts.FREQ === "MONTHLY") {
    if (interval === 1) return "Monatlich";
    return interval === 2 ? "Jeden zweiten Monat" : `Alle ${interval} Monate`;
  }
  return null;
}

export function eventCategoryLabel(value: string): string {
  return CATEGORY_LABELS[value as EventCategoryDTO] ?? value;
}

export function isManualEventSource(source: string): boolean {
  return normalized(source).replace(/[ -]/g, "_") === "manual_admin";
}

export function eventSourceLabel(source: string): string {
  if (isManualEventSource(source)) return "Angaben vom Veranstalter";
  return clean(source);
}

export function eventSourceDisclaimer(source: string): string {
  if (isManualEventSource(source)) {
    return "Angaben vom Veranstalter. Bitte prüfe Änderungen vor dem Losgehen über den Event-Link.";
  }
  const label = eventSourceLabel(source);
  return `Angaben von ${label || "der Originalquelle"}. Bitte prüfe Änderungen vor dem Losgehen an der Originalquelle.`;
}

export function eventImageCredit(source: string, credit: string | null): string | null {
  const value = clean(credit);
  if (
    !value ||
    isManualEventSource(source) ||
    /manual[_ -]?admin|founder|für dieses event hochgeladen/i.test(value)
  ) {
    return null;
  }
  return value;
}

export function humanizeRecurrence(summary: string | null): string | null {
  const value = clean(summary);
  if (!value) return null;
  const fromRrule = rruleCopy(value);
  if (fromRrule) return fromRrule;

  const weekly = value.match(/^(?:Alle\s+(\d+)\s+Wochen|Wöchentlich|Jede Woche)(?:\s*[,·-]\s*(.+))?$/i);
  if (weekly) {
    const interval = weekly[1] ? Math.max(1, Number(weekly[1])) : 1;
    return weeklyCopy(interval, weekdayNames(weekly[2] ?? ""));
  }

  const daily = value.match(/^Alle\s+(\d+)\s+Tage$/i);
  if (daily) {
    const interval = Math.max(1, Number(daily[1]));
    return interval === 1 ? "Täglich" : `Alle ${numberWord(interval)} Tage`;
  }

  const monthly = value.match(/^Alle\s+(\d+)\s+Monate$/i);
  if (monthly) {
    const interval = Math.max(1, Number(monthly[1]));
    if (interval === 1) return "Monatlich";
    return interval === 2 ? "Jeden zweiten Monat" : `Alle ${interval} Monate`;
  }

  return value;
}

function dateKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BASEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function dateLabel(value: Date): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: BASEL_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value);
}

function timeLabel(value: Date): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: BASEL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

export function formatEventDateTime(startAt: string, endAt: string | null): string {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return "Zeit noch nicht bestätigt";
  const startCopy = `${dateLabel(start)} · ${timeLabel(start)}`;
  if (!endAt) return startCopy;
  const end = new Date(endAt);
  if (Number.isNaN(end.getTime())) return startCopy;
  if (dateKey(start) === dateKey(end)) return `${startCopy}–${timeLabel(end)}`;
  return `${startCopy} – ${dateLabel(end)} · ${timeLabel(end)}`;
}

export function formatCompactOccurrenceDate(startAt: string): string {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return "Termin offen";
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: BASEL_TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(start);
}

export function eventPropertyLabels(
  minimumAge: number | null,
  familyFriendly: boolean | null,
): string[] {
  const labels: string[] = [];
  if (minimumAge !== null) labels.push(`Ab ${minimumAge} Jahren`);
  if (familyFriendly === true) labels.push("Familiengeeignet");
  if (familyFriendly === false) labels.push("Nicht familiengeeignet");
  return labels;
}

export type EventAddressInput = {
  addressLine: string | null;
  postalCode?: string | null;
  city?: string | null;
  countryCode?: string | null;
};

export function formatEventAddress(input: EventAddressInput): string | null {
  const postalCode = clean(input.postalCode);
  const city = clean(input.city);
  const locality = clean([postalCode, city].filter(Boolean).join(" "));
  const country = normalized(clean(input.countryCode)) === "ch" ? "Schweiz" : "";
  const rawParts = clean(input.addressLine)
    .split(",")
    .map((part) => clean(part))
    .filter(Boolean)
    .map((part) => {
      const key = normalized(part);
      if (key === "switzerland" || key === "suisse" || key === "svizzera" || key === "ch") {
        return "Schweiz";
      }
      if (city && postalCode && key === normalized(city)) return locality;
      return part;
    });

  if (locality) {
    const hasLocality = rawParts.some((part) => {
      const key = normalized(part);
      return (!postalCode || key.includes(normalized(postalCode))) &&
        (!city || key.includes(normalized(city)));
    });
    if (!hasLocality) rawParts.push(locality);
  } else if (city && !rawParts.some((part) => normalized(part).includes(normalized(city)))) {
    rawParts.push(city);
  }

  if (country && !rawParts.some((part) => normalized(part) === normalized(country))) {
    rawParts.push(country);
  }

  const parts: string[] = [];
  for (const part of rawParts) {
    const key = normalized(part);
    if (parts.some((existing) => normalized(existing) === key)) continue;
    if (city && key === normalized(city) && parts.some((existing) => normalized(existing).includes(normalized(city)))) {
      continue;
    }
    parts.push(part);
  }
  return parts.join(", ") || null;
}
