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
  fields: SpotProductField[];
};

export async function getMobileSpotProductProfile(spotId: string): Promise<SpotProductProfile | null> {
  const { data, error } = await supabase.rpc("spot_detail_product_profile_v1", { p_spot_id: spotId, p_surface: "MOBILE" });
  if (error) throw error;
  if (!data || data.contractVersion !== "backyrd.spot-detail-product-profile@1.0" || data.surface !== "MOBILE" || !Array.isArray(data.fields)) return null;
  return data as SpotProductProfile;
}

const words: Record<string,string> = { TRUE:"Ja",FALSE:"Nein",COFFEE_DAYTIME:"Café & Tageszeit",DRINKS:"Getränke",EAT:"Essen",QUIET:"Ruhig",LIVELY:"Lebendig",COZY:"Gemütlich",MORNING:"Vormittag",MIDDAY:"Mittag",AFTERNOON:"Nachmittag",EVENING:"Abend",NIGHT:"Nacht",LOW:"Günstig",MEDIUM:"Mittel",HIGH:"Hoch",PREMIUM:"Premium" };
const labels:Record<string,string>={"description.highlight":"Über diesen Ort","classification.primary_category":"Hauptkategorie","classification.place_types":"Art des Ortes","purpose.primary_visit":"Hauptzweck","offering.cuisines":"Küche","offering.food_specialities":"Spezialitäten","offering.groups":"Angebot","offering.onsite":"Angebote vor Ort","context.visit_situations":"Passt zu","context.atmosphere":"Atmosphäre","context.typical_dayparts":"Typische Tageszeit","operation.price_level":"Preisniveau","hours.regular":"Reguläre Öffnungszeiten","hours.special":"Sonderöffnungszeiten","state.current":"Aktueller Zustand","amenity.features":"Ausstattung","accessibility.step_free_entrance":"Stufenfreier Eingang","accessibility.accessible_toilet":"Barrierefreies WC","accessibility.elevator":"Lift","rule.pet_access":"Tiere","rule.age_access_conditions":"Altersregeln","contact.website":"Website","contact.phone":"Telefon"};
export function spotProductLabel(key:string):string{return labels[key]??key.split(".").at(-1)!.replaceAll("_"," ").replace(/^./,(letter)=>letter.toLocaleUpperCase("de-CH"))}
const title = (value:string) => words[value] ?? value.replaceAll("_"," ").toLocaleLowerCase("de-CH").replace(/^./, (letter) => letter.toLocaleUpperCase("de-CH"));
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
