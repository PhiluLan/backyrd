import { supabase } from "./supabase";

export type SpotProductField = {
  attributeKey: string;
  sectionKey: string;
  sortOrder: number;
  scope: string;
  knowledgeState: string;
  value: unknown;
  trust: string;
  freshness: string;
};
export type SpotProductProfile = {
  contractVersion: "backyrd.spot-detail-product-profile@1.0";
  surface: "MOBILE";
  worldManifestHash: string | null;
  spot: {
    spotId: string;
    name: string;
    addressLine1: string | null;
    locality: string | null;
    countryCode: string | null;
    latitude: number | null;
    longitude: number | null;
    regularHours: unknown;
    source: "WORLD_KNOWLEDGE" | "LEGACY_COMPATIBILITY";
    headerPhotoPath: string | null;
  };
  fields: SpotProductField[];
};

export type SpotProductOpeningHour = {
  day_of_week: string;
  open_time: string;
  close_time: string;
  idx: number;
};

const dayNames: Record<string,string> = {
  MONDAY:"Montag",TUESDAY:"Dienstag",WEDNESDAY:"Mittwoch",THURSDAY:"Donnerstag",
  FRIDAY:"Freitag",SATURDAY:"Samstag",SUNDAY:"Sonntag",
};

export function spotProductOpeningHours(profile: SpotProductProfile): SpotProductOpeningHour[] {
  if (profile.spot.source !== "WORLD_KNOWLEDGE" || !Array.isArray(profile.spot.regularHours)) return [];
  const rows: SpotProductOpeningHour[] = [];
  for (const day of profile.spot.regularHours) {
    if (!day || typeof day !== "object") continue;
    const value = day as { day?: unknown; intervals?: unknown };
    const label = typeof value.day === "string" ? dayNames[value.day] : undefined;
    if (!label || !Array.isArray(value.intervals)) continue;
    for (const interval of value.intervals) {
      if (!interval || typeof interval !== "object") continue;
      const window = interval as { start?: unknown; end?: unknown };
      if (typeof window.start !== "string" || typeof window.end !== "string") continue;
      rows.push({ day_of_week: label, open_time: window.start, close_time: window.end, idx: rows.length });
    }
  }
  return rows;
}

export async function getMobileSpotProductProfile(spotId: string): Promise<SpotProductProfile | null> {
  const { data, error } = await supabase.rpc("spot_detail_product_profile_v1", { p_spot_id: spotId, p_surface: "MOBILE" });
  if (error) throw error;
  if (!data || data.contractVersion !== "backyrd.spot-detail-product-profile@1.0" || data.surface !== "MOBILE"
    || !data.spot || typeof data.spot !== "object" || typeof data.spot.name !== "string"
    || !["WORLD_KNOWLEDGE","LEGACY_COMPATIBILITY"].includes(data.spot.source)
    || !Array.isArray(data.fields)) return null;
  return data as SpotProductProfile;
}

const words: Record<string,string> = { TRUE:"Ja",FALSE:"Nein",COFFEE_DAYTIME:"Café & Tageszeit",DRINKS:"Getränke",EAT:"Essen",EAT_DRINK:"Essen & Trinken",ACTIVITY_PLAY:"Aktivitäten & Spiel",SPORT_MOVEMENT:"Sport & Bewegung",CULTURE_ARTS:"Kultur & Kunst",OVERNIGHT_STAY:"Übernachten",QUIET:"Ruhig",LIVELY:"Lebendig",COZY:"Gemütlich",MORNING:"Morgens",MIDDAY:"Mittags",AFTERNOON:"Nachmittags",EVENING:"Abends",NIGHT:"Nachts",VERY_LOW:"Sehr günstig",LOW:"Günstig",MEDIUM:"Mittel",HIGH:"Gehoben",PREMIUM:"Premium",FAMILY_FRIENDLY:"Familienfreundlich",BUSINESS_SUITABLE:"Für geschäftliche Treffen",BICYCLE_PARKING:"Fahrradstellplätze",HIGH_CHAIR:"Kinderstühle",OUTDOOR_SEATING:"Sitzplätze draussen",POWER_OUTLETS:"Steckdosen",PUBLIC_TRANSPORT_NEARBY:"ÖV in der Nähe",STROLLER_SPACE:"Platz für Kinderwagen",WATER_BOWL:"Wassernapf",WIFI:"WLAN",PLAY_AREA:"Spielbereich",TERRACE:"Terrasse",GARDEN:"Garten",RESTAURANT:"Restaurant",CAFE:"Café",BAR:"Bar",PUB:"Pub",BAKERY:"Bäckerei",STAY:"Übernachten",FAMILY:"Familien",FRIENDS_GROUP:"Freundesgruppen",DATE_PAIR:"Zu zweit",ALONE:"Alleine",BUSINESS:"Geschäftlich",ADULTS:"Erwachsene",CHILDREN:"Kinder",MIXED_AGES:"Alle Altersgruppen",EVENT:"Bei Veranstaltungen",ALLOWED:"Erlaubt",NOT_ALLOWED:"Nicht erlaubt",UNKNOWN:"Noch nicht bekannt" };
const labels:Record<string,string>={"description.highlight":"Beschreibung","classification.primary_category":"Hauptkategorie","classification.place_types":"Art des Ortes","purpose.primary_visit":"Hauptzweck","offering.cuisines":"Küche","offering.food_specialities":"Spezialitäten","offering.groups":"Angebot","offering.onsite":"Angebote vor Ort","context.visit_situations":"Passt zu","context.atmosphere":"Atmosphäre","context.typical_dayparts":"Typische Tageszeit","operation.price_level":"Preisniveau","hours.regular":"Öffnungszeiten","hours.special":"Sonderöffnungszeiten","state.current":"Aktueller Zustand","amenity.features":"Ausstattung","accessibility.step_free_entrance":"Stufenfreier Eingang","accessibility.accessible_toilet":"Barrierefreies WC","accessibility.elevator":"Lift","rule.pet_access":"Tiere","rule.age_access_conditions":"Altersregeln","contact.website":"Webseite","contact.phone":"Telefon","contact.public_email":"E-Mail","contact.instagram":"Instagram","contact.facebook":"Facebook","contact.linkedin":"LinkedIn","contact.tiktok":"TikTok"};
export function spotProductLabel(key:string):string{return labels[key]??key.split(".").at(-1)!.replaceAll("_"," ").replace(/^./,(letter)=>letter.toLocaleUpperCase("de-CH"))}
const title = (value:string) => words[value] ?? value.replaceAll("_"," ").toLocaleLowerCase("de-CH").replace(/^./, (letter) => letter.toLocaleUpperCase("de-CH"));
export const SPOT_DETAIL_PRIMARY_KEYS = ["classification.primary_category","classification.place_types","operation.price_level","contact.website","contact.phone","contact.public_email","contact.instagram","contact.facebook","contact.linkedin","contact.tiktok","description.highlight","hours.regular","hours.special"] as const;
export const SPOT_DETAIL_MORE_KEYS = ["context.typical_dayparts","context.atmosphere","amenity.features","accessibility.accessible_toilet","accessibility.elevator","accessibility.step_free_entrance","context.visit_situations","offering.food_specialities","rule.pet_access"] as const;
const presentedKeys = new Set<string>([...SPOT_DETAIL_PRIMARY_KEYS, ...SPOT_DETAIL_MORE_KEYS]);
export function spotProductField(profile: SpotProductProfile | null, key: string): SpotProductField | undefined { return profile?.fields.find((field) => field.attributeKey === key); }
export function spotProductAdditionalFields(profile: SpotProductProfile | null): SpotProductField[] { return profile?.fields.filter((field) => !presentedKeys.has(field.attributeKey)) ?? []; }
const contextValue = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const token = row.atmosphere ?? row.daypart ?? row.situation;
  if (typeof token !== "string") return null;
  const conditions = row.conditions && typeof row.conditions === "object" ? row.conditions as Record<string, unknown> : {};
  const parts = [
    Array.isArray(conditions.days) && conditions.days.length ? conditions.days.map((day) => typeof day === "string" ? dayNames[day] ?? title(day) : "").filter(Boolean).join(", ") : null,
    Array.isArray(conditions.dayparts) && conditions.dayparts.length ? conditions.dayparts.map((daypart) => typeof daypart === "string" ? title(daypart) : "").filter(Boolean).join(", ") : null,
    typeof conditions.area === "string" ? conditions.area : null,
    typeof conditions.occasion === "string" ? conditions.occasion : null,
    conditions.groupSize && typeof conditions.groupSize === "object" && typeof (conditions.groupSize as { min?: unknown }).min === "number" && typeof (conditions.groupSize as { max?: unknown }).max === "number" ? `${(conditions.groupSize as { min: number }).min}–${(conditions.groupSize as { max: number }).max} Personen` : null,
    typeof conditions.ageContext === "string" ? title(conditions.ageContext) : null,
    typeof conditions.accompaniment === "string" ? title(conditions.accompaniment) : null,
    conditions.eventMode === "EVENT" ? "Bei Veranstaltungen" : null,
  ].filter((part): part is string => Boolean(part));
  return `${title(token)}${parts.length ? ` · ${parts.join(" · ")}` : ""}`;
};
export function presentSpotProductField(field: SpotProductField): string {
  if (field.knowledgeState === "UNKNOWN") return "Noch nicht bekannt";
  if (field.attributeKey.startsWith("contact.") && typeof field.value === "string") return field.value;
  if (["context.atmosphere","context.typical_dayparts","context.visit_situations"].includes(field.attributeKey) && Array.isArray(field.value)) return field.value.map((row) => contextValue(row) ?? presentSpotProductValue(row)).join(" · ");
  if (field.attributeKey === "offering.onsite" && Array.isArray(field.value)) return field.value.map((row) => row && typeof row === "object" && typeof (row as { kind?: unknown }).kind === "string" ? title((row as { kind: string }).kind) : presentSpotProductValue(row)).join(" · ");
  if (field.attributeKey === "rule.pet_access" && field.value && typeof field.value === "object" && !Array.isArray(field.value)) {
    const pet = field.value as Record<string, unknown>;
    const parts = [["Drinnen", pet.indoor], ["Draussen", pet.outdoor], ["Assistenztiere", pet.assistanceAnimals]].filter((entry): entry is [string, string] => typeof entry[1] === "string").map(([label, value]) => `${label}: ${title(value)}`);
    if (typeof pet.notes === "string" && pet.notes.trim()) parts.push(pet.notes);
    return parts.join(" · ");
  }
  return presentSpotProductValue(field.value);
}
export function presentSpotProductValue(value: unknown): string {
  if (value === null || value === undefined) return "Noch unbekannt";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "string") return title(value);
  if (typeof value === "number") return new Intl.NumberFormat("de-CH").format(value);
  if (Array.isArray(value)) return value.length ? value.map((item) => typeof item === "string" ? title(item) : presentSpotProductValue(item)).join(" · ") : "Keine Einträge";
  if (typeof value === "object") {
    const record = value as Record<string,unknown>;
    if (Array.isArray(record.rules)) return record.rules.map(presentSpotProductValue).join(" · ");
    return Object.entries(record).filter(([,item]) => item !== null && item !== undefined && item !== "").map(([key,item]) => `${title(key)}: ${presentSpotProductValue(item)}`).join(" · ");
  }
  return String(value);
}
