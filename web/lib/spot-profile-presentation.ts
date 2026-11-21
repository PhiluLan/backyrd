import {
  SPOT_TYPE_CATALOG,
  FOOD_SPECIALITY_AUTHORING_OPTIONS,
  AMENITY_AUTHORING_OPTIONS,
  CUISINE_AUTHORING_OPTIONS,
  PRIMARY_CATEGORY_LABELS,
} from "@backyrd/world-knowledge-core/browser";
import type { PublicWorldSpotProfile } from "./spot-world-profile";

type Field = PublicWorldSpotProfile["fields"][number];
const words: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    SPOT_TYPE_CATALOG.map((item) => [item.kind, item.label]),
  ),
  ...Object.fromEntries(
    [
      ...FOOD_SPECIALITY_AUTHORING_OPTIONS,
      ...AMENITY_AUTHORING_OPTIONS,
      ...CUISINE_AUTHORING_OPTIONS,
    ]
      .filter((item) => item.state === "CANONICAL")
      .map((item) => [item.value, item.label]),
  ),
  ...Object.fromEntries(
    Object.entries(PRIMARY_CATEGORY_LABELS).map(([key, label]) => [
      key,
      label.de,
    ]),
  ),
  COFFEE_DAYTIME: "Café & Tageszeit",
  DRINKS: "Getränke",
  EAT: "Essen",
  EAT_DRINK: "Essen & Trinken",
  ACTIVITY_PLAY: "Aktivitäten & Spiel",
  SPORT_MOVEMENT: "Sport & Bewegung",
  CULTURE_ARTS: "Kultur & Kunst",
  OVERNIGHT_STAY: "Übernachten",
  BAR: "Bar",
  BREWERY: "Brauerei",
  PUB: "Pub",
  RESTAURANT: "Restaurant",
  CAFE: "Café",
  BAKERY: "Bäckerei",
  BEER_GARDEN: "Biergarten",
  TAPROOM: "Ausschank",
  WINE_BAR: "Weinbar",
  COCKTAIL_BAR: "Cocktailbar",
  VERY_LOW: "Sehr günstig",
  LOW: "Günstig",
  MEDIUM: "Mittel",
  HIGH: "Gehoben",
  PREMIUM: "Premium",
  ROMANTIC: "Romantisch",
  CREATIVE: "Kreativ",
  RELAXED: "Entspannt",
  ELEGANT: "Elegant",
  QUIET: "Ruhig",
  LIVELY: "Lebendig",
  COZY: "Gemütlich",
  CASUAL: "Locker",
  SOCIABLE: "Gesellig",
  MORNING: "Morgens",
  MIDDAY: "Mittags",
  AFTERNOON: "Nachmittags",
  EVENING: "Abends",
  NIGHT: "Nachts",
  FAMILY_FRIENDLY: "Familienfreundlich",
  BUSINESS_SUITABLE: "Für geschäftliche Treffen",
  BICYCLE_PARKING: "Velostellplätze",
  HIGH_CHAIR: "Kinderstühle",
  OUTDOOR_SEATING: "Sitzplätze draussen",
  POWER_OUTLETS: "Steckdosen",
  PUBLIC_TRANSPORT_NEARBY: "ÖV in der Nähe",
  STROLLER_SPACE: "Platz für Kinderwagen",
  WATER_BOWL: "Wassernapf",
  WIFI: "WLAN",
  PLAY_AREA: "Spielbereich",
  TERRACE: "Terrasse",
  GARDEN: "Garten",
  FAMILY: "Familien",
  FRIENDS_GROUP: "Mit Freunden",
  DATE_PAIR: "Zu zweit",
  ALONE: "Alleine",
  BUSINESS: "Geschäftlich",
  ADULTS: "Erwachsene",
  CHILDREN: "Kinder",
  MIXED_AGES: "Alle Altersgruppen",
  EVENT: "Bei Veranstaltungen",
  ALLOWED: "Erlaubt",
  NOT_ALLOWED: "Nicht erlaubt",
  UNKNOWN: "Noch nicht bekannt",
  BURGER: "Burger",
  PIZZA: "Pizza",
  VEGETARIAN_DISHES: "Vegetarische Gerichte",
};
export const weekDays = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];
const dayTokens = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const clean = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
// Unknown enums/objects are deliberately not made into plausible visitor facts.
function token(value: unknown): string | null {
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "number" && Number.isFinite(value))
    return new Intl.NumberFormat("de-CH").format(value);
  return typeof value === "string" ? (words[value] ?? null) : null;
}
function values(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).flatMap(
    (item) => token(item) ?? [],
  );
}
export function fieldValue(field: Field | undefined): string | null {
  if (
    !field ||
    !["KNOWN_VALUE", "KNOWN_TRUE", "KNOWN_FALSE"].includes(field.knowledgeState)
  )
    return null;
  return values(field.value).join(" · ") || null;
}
export const contactLabels: Readonly<Record<string, string>> = {
  "contact.website": "Webseite",
  "contact.phone": "Telefon",
  "contact.public_email": "E-Mail",
  "contact.instagram": "Instagram",
  "contact.facebook": "Facebook",
  "contact.linkedin": "LinkedIn",
  "contact.tiktok": "TikTok",
};
export function contactHref(key: string, value: unknown): string | null {
  const text = clean(value);
  if (!text || /[\r\n]/.test(text)) return null;
  if (key === "contact.phone") {
    const phone = text.replace(/[\s().-]/g, "");
    return /^\+?\d{5,20}$/.test(phone) ? `tel:${phone}` : null;
  }
  if (key === "contact.public_email")
    return /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(text)
      ? `mailto:${text}`
      : null;
  const hosts: Readonly<Record<string, string>> = {
    "contact.instagram": "instagram.com",
    "contact.facebook": "facebook.com",
    "contact.linkedin": "linkedin.com/in",
    "contact.tiktok": "tiktok.com/@",
  };
  let href = text;
  if (text.startsWith("@") && hosts[key] && /^@[\w.-]+$/.test(text))
    href = `https://${hosts[key]}/${text.slice(1)}`.replace("/@/", "/@");
  else if (key === "contact.website" && !/^[a-z][a-z\d+.-]*:/i.test(text))
    href = `https://${text}`;
  try {
    const url = new URL(href);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function specialHours(
  value: unknown,
): { date: string; hours: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = object(item);
    if (
      !row ||
      typeof row.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
    )
      return [];
    const date = new Date(`${row.date}T12:00:00Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== row.date
    )
      return [];
    const label = new Intl.DateTimeFormat("de-CH", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
    if (row.status === "CLOSED") return [{ date: label, hours: "Geschlossen" }];
    const hours =
      row.status === "OPEN" && Array.isArray(row.intervals)
        ? row.intervals.flatMap((item) => {
            const window = object(item);
            return window && validTime(window.start) && validTime(window.end)
              ? [`${window.start.slice(0, 5)}–${window.end.slice(0, 5)}`]
              : [];
          })
        : [];
    return hours.length ? [{ date: label, hours: hours.join(" · ") }] : [];
  });
}
function validTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
  );
}
export function regularHours(
  rows: {
    day_of_week: string;
    open_time: string | null;
    close_time: string | null;
  }[],
) {
  return weekDays.map((day) => {
    const slots = rows.filter((row) => row.day_of_week === day);
    const times = slots.flatMap((slot) =>
      validTime(slot.open_time) && validTime(slot.close_time)
        ? [`${slot.open_time.slice(0, 5)}–${slot.close_time.slice(0, 5)}`]
        : !slot.open_time && !slot.close_time
          ? ["Geschlossen"]
          : [],
    );
    return { day, hours: times.join(" · ") || "Nicht bekannt" };
  });
}
const moreLabels: Readonly<Record<string, string>> = {
  "context.typical_dayparts": "Passt in deinen Tag",
  "context.atmosphere": "Atmosphäre",
  "context.visit_situations": "Mit wem du kommst",
  "amenity.features": "Ausstattung",
  "accessibility.accessible_toilet": "Barrierefreies WC",
  "accessibility.elevator": "Lift",
  "accessibility.step_free_entrance": "Stufenfreier Eingang",
  "offering.food_specialities": "Spezialitäten",
  "offering.cuisines": "Küche",
  "rule.pet_access": "Mit Tieren unterwegs",
};
export function moreInfo(
  fields: Field[],
): { label: string; lines: string[] }[] {
  return Object.entries(moreLabels).flatMap(([key, label]) => {
    const field = fields.find(
      (field) =>
        field.attributeKey === key &&
        ["KNOWN_VALUE", "KNOWN_TRUE", "KNOWN_FALSE"].includes(
          field.knowledgeState,
        ),
    );
    if (!field) return [];
    let lines = values(field.value);
    if (key.startsWith("context.") && Array.isArray(field.value)) {
      lines = field.value.flatMap((item) => {
        const row = object(item);
        if (!row) return token(item) ?? [];
        const title = token(row.atmosphere ?? row.daypart ?? row.situation);
        if (!title) return [];
        const condition = object(row.conditions);
        // Preserve qualifiers; unsupported conditions must not become unconditional claims.
        if (
          condition &&
          Object.keys(condition).some(
            (key) => !["days", "dayparts", "area", "occasion"].includes(key),
          )
        )
          return [];
        if (row.conditions != null && !condition) return [];
        if (
          condition?.days != null &&
          (!Array.isArray(condition.days) ||
            condition.days.some(
              (day) => typeof day !== "string" || !dayTokens.includes(day),
            ))
        )
          return [];
        if (
          condition?.dayparts != null &&
          (!Array.isArray(condition.dayparts) ||
            condition.dayparts.some((daypart) => !token(daypart)))
        )
          return [];
        if (
          [condition?.area, condition?.occasion].some(
            (value) => value != null && !clean(value),
          )
        )
          return [];
        const days = Array.isArray(condition?.days)
          ? condition.days
              .map((day) =>
                typeof day === "string"
                  ? weekDays[dayTokens.indexOf(day)]
                  : null,
              )
              .filter(Boolean)
          : [];
        const qualifiers = [
          ...days,
          ...values(condition?.dayparts),
          clean(condition?.area),
          clean(condition?.occasion),
        ].filter(Boolean);
        return [[title, ...qualifiers].join(" · ")];
      });
    }
    if (key === "rule.pet_access") {
      const row = object(field.value);
      lines = row
        ? [
            ["Drinnen", row.indoor],
            ["Draussen", row.outdoor],
            ["Assistenztiere", row.assistanceAnimals],
          ].flatMap(([label, value]) =>
            token(value) ? [`${label}: ${token(value)}`] : [],
          )
        : [];
      if (row && clean(row.notes)) lines.push(clean(row.notes)!);
    }
    return lines.length ? [{ label, lines }] : [];
  });
}
