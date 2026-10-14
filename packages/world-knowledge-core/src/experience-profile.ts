import { array, boolean, date, enumValue, number, object, required, string } from "./schema.js";
import { hashBody } from "./canonical.js";

export const EXPERIENCE_PROFILE_VERSION = "backyrd.world-knowledge.experience-profile@1.0" as const;
export const EXPERIENCE_CATALOG_VERSION = "backyrd.world-knowledge.experience-catalog@1.1" as const;
export const EXPERIENCE_CATEGORIES = ["RESTAURANT", "ZOO", "MUSEUM", "BAR", "SPORT"] as const;
export type ExperienceCategory = typeof EXPERIENCE_CATEGORIES[number];
export type ExperienceScope = "SPOT" | "OFFER" | "AREA";
export type ExperienceQuestion = { readonly key: string; readonly label: string; readonly group: string; readonly control: "TEXT" | "YES_NO" | "NUMBER"; readonly unit: string | null; readonly scopes: readonly ExperienceScope[]; readonly categories: readonly ExperienceCategory[]; readonly offerKinds: readonly string[] };
const all = EXPERIENCE_CATEGORIES;
const food = ["RESTAURANT", "BAR"] as const;
const q = (key: string, label: string, group: string, control: ExperienceQuestion["control"] = "TEXT", scopes: readonly ExperienceScope[] = ["OFFER", "AREA"], categories: readonly ExperienceCategory[] = all, unit: string | null = null, offerKinds: readonly string[] = []): ExperienceQuestion => ({ key, label, group, control, scopes, categories, unit, offerKinds });
/** Questions use the frozen request-language families where the meaning is shared.
 * Spot measurements are facts, never user requests, inferred suitability or ranking weights. */
export const EXPERIENCE_QUESTIONS: readonly ExperienceQuestion[] = Object.freeze([
  q("experience.activity", "Was kann man hier machen?", "Erlebnis", "TEXT", ["OFFER"]),
  q("experience.theme", "Themen, Tiere oder Sammlungen", "Erlebnis", "TEXT", ["OFFER"], ["ZOO", "MUSEUM"]),
  q("participation.format", "Selbstständig, geführt oder betreut?", "Teilnahme", "TEXT", ["OFFER"]),
  q("participation.language", "Verfügbare Sprachen", "Teilnahme", "TEXT", ["OFFER"]),
  q("participation.age_suitability", "Empfohlene Altersgruppen (keine Zutrittsgrenze)", "Teilnahme", "TEXT", ["OFFER"]),
  q("participation.prerequisite", "Voraussetzungen und nötige Begleitung", "Teilnahme", "TEXT", ["OFFER"]),
  q("participation.permission", "Zutrittsregeln und Ausnahmen", "Teilnahme", "TEXT", ["SPOT", "OFFER", "AREA"]),
  q("participation.entry_mode", "Ticket nötig oder unabhängig zugänglich?", "Teilnahme", "TEXT", ["OFFER", "AREA"]),
  q("participation.booking", "Reservation, Anmeldung oder Vorbestellung", "Teilnahme", "TEXT", ["OFFER"]),
  q("participation.consumption_obligation", "Mindestkonsumation oder Bestellpflicht", "Teilnahme", "TEXT", ["OFFER"], food),
  q("food.cuisine", "Küche", "Essen und Trinken", "TEXT", ["OFFER"], all, null, ["LUNCH", "DINNER", "BREAKFAST", "GASTRONOMY", "CAFE", "FULL_MEAL", "PRIVATE_CELEBRATION"]),
  q("food.dish", "Gerichte und Spezialitäten", "Essen und Trinken", "TEXT", ["OFFER"], all, null, ["LUNCH", "DINNER", "BREAKFAST", "GASTRONOMY", "CAFE", "FULL_MEAL", "APERITIF", "PRIVATE_CELEBRATION"]),
  q("food.diet", "Vegetarische und vegane Angebote", "Essen und Trinken", "TEXT", ["OFFER"], all, null, ["LUNCH", "DINNER", "BREAKFAST", "GASTRONOMY", "CAFE", "FULL_MEAL", "APERITIF", "PRIVATE_CELEBRATION"]),
  q("food.option", "Allergene und Anpassungsmöglichkeiten", "Essen und Trinken", "TEXT", ["OFFER"], all, null, ["LUNCH", "DINNER", "BREAKFAST", "GASTRONOMY", "CAFE", "FULL_MEAL", "APERITIF", "PRIVATE_CELEBRATION"]),
  q("food.meal_extent", "Vollständige Mahlzeit oder nur Snacks?", "Essen und Trinken", "TEXT", ["OFFER"], all, null, ["LUNCH", "DINNER", "BREAKFAST", "GASTRONOMY", "CAFE", "FULL_MEAL", "APERITIF", "PRIVATE_CELEBRATION"]),
  q("food.drink", "Getränke einschließlich alkoholfreier Auswahl", "Essen und Trinken", "TEXT", ["OFFER"], all, null, ["DRINKS", "APERITIF", "CAFE", "GASTRONOMY", "PRIVATE_CELEBRATION"]),
  q("condition.children", "Kinderangebote, Kindermenü und Betreuung", "Kinder", "TEXT", ["OFFER", "AREA"]),
  q("offer.service", "Bedienung oder Selbstbedienung", "Service", "TEXT", ["OFFER"], all, null, ["LUNCH", "DINNER", "BREAKFAST", "GASTRONOMY", "CAFE", "FULL_MEAL", "APERITIF", "DRINKS"]),
  q("offer.capacity", "Kapazität / maximale Teilnehmerzahl", "Teilnahme", "NUMBER", ["OFFER", "AREA"], all, "Personen"),
  q("time.duration", "Typische Dauer", "Zeiten", "NUMBER", ["OFFER"], all, "Minuten"),
  q("route.length", "Weglänge", "Wege", "NUMBER", ["OFFER", "AREA"], ["ZOO", "MUSEUM"], "Meter"),
  q("condition.terrain", "Wegbeschaffenheit und Steigungen", "Wege", "TEXT", ["OFFER", "AREA"], ["ZOO", "MUSEUM"]),
  q("sport.level", "Für welche Erfahrungsstufen geeignet?", "Sport", "TEXT", ["OFFER"], ["SPORT"], null, ["BOULDERING", "CLIMBING", "TRAINING", "COURSE", "CHILDREN_COURSE"]),
  q("sport.equipment", "Benötigte Ausrüstung", "Sport", "TEXT", ["OFFER"], ["SPORT"], null, ["BOULDERING", "CLIMBING", "TRAINING", "COURSE", "CHILDREN_COURSE"]),
  q("sport.rental", "Ausrüstung vor Ort ausleihbar?", "Sport", "YES_NO", ["OFFER"], ["SPORT"], null, ["BOULDERING", "CLIMBING", "TRAINING", "COURSE", "CHILDREN_COURSE"]),
  q("sport.registration", "Erstregistrierung erforderlich?", "Besuchsregeln", "YES_NO", ["OFFER"], ["SPORT"], null, ["BOULDERING", "CLIMBING", "TRAINING", "MOVEMENT_PLAY", "COURSE", "CHILDREN_COURSE"]),
  q("sport.induction", "Sicherheitseinweisung erforderlich?", "Sport", "YES_NO", ["OFFER"], ["SPORT"], null, ["BOULDERING", "CLIMBING", "TRAINING", "COURSE", "CHILDREN_COURSE"]),
  q("participation.minimum_age", "Mindestalter für dieses Angebot", "Besuchsregeln", "NUMBER", ["OFFER"], all, "Jahre"),
  q("amenity.shower", "Duschen vorhanden?", "Ausstattung", "YES_NO", ["SPOT", "AREA"], ["SPORT"]),
  q("participation.accessibility", "Zugänglichkeit und Einschränkungen", "Zugang", "TEXT", ["SPOT", "OFFER", "AREA"]),
  q("location.setting", "Lage und Umgebung", "Lage", "TEXT", ["SPOT", "AREA"]),
  q("location.view", "Was sieht man tatsächlich von hier?", "Lage", "TEXT", ["AREA"]),
  q("location.waterbody", "Welches Gewässer liegt hier?", "Lage", "TEXT", ["AREA"]),
  q("atmosphere.character", "Atmosphäre", "Atmosphäre", "TEXT", ["AREA"]),
  q("atmosphere.noise", "Geräuschpegel", "Atmosphäre", "TEXT", ["AREA"]),
  q("atmosphere.music", "Hintergrundmusik, Live-Musik oder DJ", "Atmosphäre", "TEXT", ["OFFER", "AREA"]),
  q("atmosphere.privacy", "Privatsphäre / separat nutzbar", "Atmosphäre", "TEXT", ["AREA"]),
  q("atmosphere.conversation", "Bedingungen für Gespräche", "Atmosphäre", "TEXT", ["AREA"]),
  q("offer.shade", "Schatten verfügbar?", "Ausstattung", "YES_NO", ["AREA"]),
  q("condition.weather_protection", "Überdacht / vor Regen geschützt?", "Ausstattung", "YES_NO", ["AREA"]),
  q("offer.temperature", "Heizung und Kühlung", "Ausstattung", "TEXT", ["AREA"]),
  q("offer.feature", "Besondere Ausstattung", "Ausstattung", "TEXT", ["SPOT", "OFFER", "AREA"]),
  q("offer.usage", "Sitzen, Stehen und Nutzungsmöglichkeiten", "Ausstattung", "TEXT", ["AREA"]),
  q("amenity.toilet", "WC vorhanden?", "Ausstattung", "YES_NO", ["SPOT", "AREA"]),
  q("amenity.changing_table", "Wickeltisch vorhanden?", "Kinder", "YES_NO", ["SPOT", "AREA"]),
  q("amenity.high_chair", "Kinderhochstuhl vorhanden?", "Kinder", "YES_NO", ["AREA"], food),
  q("amenity.playground", "Spielplatz vorhanden?", "Kinder", "YES_NO", ["AREA"]),
  q("amenity.rest_seating", "Ruhe- und Sitzmöglichkeiten?", "Ausstattung", "YES_NO", ["AREA"]),
  q("amenity.stroller", "Mit Kinderwagen zugänglich?", "Zugang", "YES_NO", ["AREA"]),
  q("amenity.step_free", "Stufenlos zugänglich?", "Zugang", "YES_NO", ["AREA"]),
  q("amenity.parking", "Parkplätze vorhanden?", "Anreise", "YES_NO", ["SPOT"]),
  q("travel.mode", "Anreise, Eingang und Treffpunkt", "Anreise", "TEXT", ["SPOT"]),
]);
export const EXPERIENCE_TEMPLATES: Readonly<Record<ExperienceCategory, { readonly offers: readonly { readonly kind: string; readonly label: string }[]; readonly areas: readonly { readonly kind: string; readonly label: string }[] }>> = Object.freeze({
  RESTAURANT: { offers: [{kind:"LUNCH",label:"Mittagessen"},{kind:"DINNER",label:"Abendessen"},{kind:"APERITIF",label:"Apéro"},{kind:"BREAKFAST",label:"Frühstück"},{kind:"PRIVATE_CELEBRATION",label:"Private Feier"}], areas: [{kind:"INDOOR",label:"Gastraum"},{kind:"TERRACE",label:"Terrasse"},{kind:"PRIVATE_ROOM",label:"Privater Raum"}] },
  ZOO: { offers: [{kind:"VISIT",label:"Zoobesuch"},{kind:"GUIDED_TOUR",label:"Führung"},{kind:"ANIMAL_OBSERVATION",label:"Tierbeobachtung"},{kind:"EVENT",label:"Veranstaltung"},{kind:"GASTRONOMY",label:"Gastronomie"}], areas: [{kind:"OUTDOOR",label:"Außengelände"},{kind:"INDOOR",label:"Tierhaus"},{kind:"PLAYGROUND",label:"Spielplatz"},{kind:"REST_AREA",label:"Ruhebereich"},{kind:"CAFE",label:"Gastronomiebereich"}] },
  MUSEUM: { offers: [{kind:"PERMANENT_EXHIBITION",label:"Dauerausstellung"},{kind:"SPECIAL_EXHIBITION",label:"Sonderausstellung"},{kind:"GUIDED_TOUR",label:"Führung"},{kind:"WORKSHOP",label:"Workshop"},{kind:"SELF_GUIDED_VISIT",label:"Besuch ohne Führung"},{kind:"CAFE",label:"Café"}], areas: [{kind:"EXHIBITION",label:"Ausstellungsraum"},{kind:"WORKSHOP",label:"Workshopraum"},{kind:"OUTDOOR",label:"Außenbereich"},{kind:"CAFE",label:"Cafébereich"}] },
  SPORT: { offers: [{kind:"BOULDERING",label:"Bouldern"},{kind:"CLIMBING",label:"Klettern"},{kind:"TRAINING",label:"Freies Training"},{kind:"COURSE",label:"Kurs / Einführung"},{kind:"CHILDREN_COURSE",label:"Kinderkurs"},{kind:"MOVEMENT_PLAY",label:"Bewegungslandschaft für Kinder"},{kind:"CAFE",label:"Café / Bistro"}], areas: [{kind:"BOULDER_AREA",label:"Boulderbereich"},{kind:"CLIMBING_AREA",label:"Kletterbereich"},{kind:"TRAINING_AREA",label:"Trainingsbereich"},{kind:"CHILDREN_AREA",label:"Kinderbereich"},{kind:"CHANGING_ROOM",label:"Garderobe"},{kind:"CAFE",label:"Cafébereich"},{kind:"OUTDOOR",label:"Aussenbereich"}] },
  BAR: { offers: [{kind:"DRINKS",label:"Getränke"},{kind:"APERITIF",label:"Apéro / Snacks"},{kind:"FULL_MEAL",label:"Vollständige Mahlzeiten"},{kind:"MUSIC_EVENT",label:"Musikveranstaltung"},{kind:"PRIVATE_CELEBRATION",label:"Private Feier"}], areas: [{kind:"INDOOR",label:"Barraum"},{kind:"TERRACE",label:"Terrasse"},{kind:"LOUNGE",label:"Lounge"},{kind:"EVENT_AREA",label:"Veranstaltungsbereich"}] },
});
const mealOffers = ["LUNCH", "DINNER", "BREAKFAST", "FULL_MEAL", "GASTRONOMY", "CAFE", "APERITIF", "DRINKS", "PRIVATE_CELEBRATION"];
const instructedOffers = ["GUIDED_TOUR", "WORKSHOP", "COURSE", "CHILDREN_COURSE"];
const sportOffers = ["BOULDERING", "CLIMBING", "TRAINING", "MOVEMENT_PLAY", "COURSE", "CHILDREN_COURSE"];
/** Presentation relevance only. Existing stored properties remain valid and are never deleted. */
export function getExperienceQuestions(category: ExperienceCategory, scope: ExperienceScope, offerKind?: string, areaKind?: string): readonly ExperienceQuestion[] {
  return EXPERIENCE_QUESTIONS.filter(question => {
    const key = question.key;
    const meal = !!offerKind && mealOffers.includes(offerKind);
    const instructed = !!offerKind && instructedOffers.includes(offerKind);
    const sport = category === "SPORT" && !!offerKind && sportOffers.includes(offerKind);
    if (!question.categories.includes(category) || !question.scopes.includes(scope) || question.offerKinds.length && (!offerKind || !question.offerKinds.includes(offerKind))) return false;
    if (scope === "OFFER") {
      if (["participation.format", "participation.language"].includes(key) && !instructed) return false;
      if (key === "participation.age_suitability" && (meal || offerKind === "MUSIC_EVENT" || offerKind === "PRIVATE_CELEBRATION")) return false;
      if (key === "participation.prerequisite" && !instructed && !sport) return false;
      if (key === "participation.permission") return false; // actual rules are explicit age/access facts, never an unexplained allowed/denied flag
      if (key === "participation.entry_mode" && meal) return false;
      if (key === "participation.minimum_age" && !sport && !instructed && !["MUSIC_EVENT", "EVENT"].includes(offerKind ?? "")) return false;
      if (key === "condition.children" && !instructed && !meal && offerKind !== "CHILDREN_COURSE") return false;
      if (["route.length", "condition.terrain"].includes(key) && (meal || instructed || !["VISIT", "SELF_GUIDED_VISIT", "ANIMAL_OBSERVATION"].includes(offerKind ?? ""))) return false;
      if (key === "atmosphere.music" && !meal && !["MUSIC_EVENT", "EVENT", "TRAINING"].includes(offerKind ?? "")) return false;
      if (key === "time.duration" && meal && offerKind !== "PRIVATE_CELEBRATION") return false;
      if (key === "offer.capacity" && !instructed && !["PRIVATE_CELEBRATION", "EVENT", "MUSIC_EVENT"].includes(offerKind ?? "")) return false;
    }
    if (scope !== "OFFER" && key === "participation.permission") return false;
    if (scope === "AREA") {
      const dining = ["INDOOR", "TERRACE", "PRIVATE_ROOM", "LOUNGE", "CAFE", "EVENT_AREA"].includes(areaKind ?? "") && (category === "RESTAURANT" || category === "BAR" || areaKind === "CAFE");
      const outside = ["TERRACE", "OUTDOOR", "PLAYGROUND", "REST_AREA"].includes(areaKind ?? "");
      if (["offer.shade", "condition.weather_protection", "location.waterbody"].includes(key) && !outside) return false;
      if (["route.length", "condition.terrain"].includes(key) && (dining || !["OUTDOOR", "EXHIBITION", "INDOOR"].includes(areaKind ?? ""))) return false;
      if (key === "participation.entry_mode" && dining) return false;
      if (key === "amenity.high_chair" && !dining) return false;
      if (["atmosphere.conversation", "atmosphere.privacy", "offer.usage"].includes(key) && ["CHANGING_ROOM", "BOULDER_AREA", "CLIMBING_AREA", "TRAINING_AREA", "CHILDREN_AREA"].includes(areaKind ?? "")) return false;
      if (key === "amenity.shower" && areaKind !== "CHANGING_ROOM") return false;
      if (key === "condition.children" && !["CHILDREN_AREA", "PLAYGROUND", "CAFE"].includes(areaKind ?? "")) return false;
    }
    return true;
  }).map(question => {
    const labels: Record<string, string> = {
      "participation.booking": mealOffers.includes(offerKind ?? "") ? "Reservation erforderlich?" : "Anmeldung oder Buchung erforderlich?",
      "participation.entry_mode": "Eintrittsticket erforderlich?",
      "condition.children": mealOffers.includes(offerKind ?? "") || areaKind === "CAFE" ? "Angebote für Kinder beim Essen" : "Angebote für Kinder",
      "offer.capacity": scope === "AREA" ? "Anzahl Plätze in diesem Bereich" : "Maximale Gruppengrösse",
    };
    return {...question, label:labels[question.key] ?? question.label, group:question.group === "Teilnahme" ? "Besuchsregeln" : question.group};
  });
}
/** Uses confirmed explicit classification only; names/descriptions are not guessed. */
export function experienceCategoryFromAnswers(answers: Readonly<Record<string, unknown>>): ExperienceCategory | null {
  const value = (key: string): unknown => {
    const raw = answers[key];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const answer = raw as Record<string, unknown>;
    return answer.knowledgeState === "KNOWN_VALUE" ? answer.value : null;
  };
  const types = value("classification.place_types");
  const selected = Array.isArray(types) ? types.filter((v): v is string => typeof v === "string") : [];
  if (selected.includes("ZOO") || selected.includes("AQUARIUM")) return "ZOO";
  if (selected.includes("CLIMBING_GYM")) return "SPORT";
  if (selected.includes("MUSEUM") || selected.includes("GALLERY")) return "MUSEUM";
  if (selected.some(v => ["WINE_BAR", "COCKTAIL_BAR", "BAR", "PUB", "BREWERY", "TAPROOM", "LOUNGE"].includes(v))) return "BAR";
  if (["EAT", "COFFEE_DAYTIME"].includes(String(value("classification.primary_category")))) return "RESTAURANT";
  if (["DRINKS", "NIGHTLIFE"].includes(String(value("classification.primary_category")))) return "BAR";
  return null;
}
export type ExperienceConditions = { readonly weekdays: readonly number[]; readonly dayparts: readonly string[]; readonly event: string | null; readonly validFrom: string | null; readonly validUntil: string | null };
export type ExperienceProperty = { readonly key: string; readonly label: string | null; readonly state: "KNOWN" | "UNKNOWN" | "NOT_APPLICABLE"; readonly value: string | number | boolean | null; readonly conditions: ExperienceConditions };
export type ExperienceArea = { readonly id: string; readonly kind: string; readonly name: string; readonly properties: readonly ExperienceProperty[] };
export type ExperiencePrice = { readonly label: string; readonly currency: string; readonly min: number; readonly max: number | null; readonly basis: "PER_PERSON" | "PER_GROUP" | "PER_ITEM"; readonly minimumAge: number | null; readonly maximumAge: number | null; readonly mandatoryFeesIncluded: boolean | null; readonly includes: string; readonly conditions: ExperienceConditions };
export type ExperienceSchedule = { readonly weekday: number; readonly start: string; readonly end: string };
export type ExperienceOffer = { readonly id: string; readonly kind: string; readonly name: string; readonly areaIds: readonly string[]; readonly properties: readonly ExperienceProperty[]; readonly prices: readonly ExperiencePrice[]; readonly schedule: readonly ExperienceSchedule[]; readonly validFrom: string | null; readonly validUntil: string | null };
export type ExperienceProfile = { readonly contractVersion: typeof EXPERIENCE_PROFILE_VERSION; readonly category: ExperienceCategory; readonly properties: readonly ExperienceProperty[]; readonly areas: readonly ExperienceArea[]; readonly offers: readonly ExperienceOffer[]; readonly reviewed: boolean };
export const emptyExperienceConditions = (): ExperienceConditions => ({ weekdays: [], dayparts: [], event: null, validFrom: null, validUntil: null });
export const emptyExperienceProfile = (category: ExperienceCategory): ExperienceProfile => ({ contractVersion: EXPERIENCE_PROFILE_VERSION, category, properties: [], areas: [], offers: [], reviewed: false });
const id = (v: unknown, p: string) => string(v,p,{min:1,max:60,pattern:/^[a-zA-Z0-9_-]+$/});
const text = (v: unknown, p: string, max=1000) => { const s=string(v,p,{min:1,max}); if (!s.trim()) throw new Error(`${p}:empty_text`); return s; };
const nullableDate = (v: unknown,p: string) => v===null?null:date(v,p);
const window = (from: string|null,until: string|null) => { if(from && until && from>until) throw new Error("experience_validity_order"); };
const unique = <T>(values: readonly T[],p: string) => { if(new Set(values).size!==values.length)throw new Error(`${p}:duplicate`); return values; };
function parseConditions(v: unknown,p: string): ExperienceConditions {
  const r=object(v,p,["weekdays","dayparts","event","validFrom","validUntil"]);
  const weekdays=unique(array(r.weekdays,p+".weekdays",{max:7}).map(v=>number(v,p,{integer:true,min:1,max:7})),p);
  const dayparts=unique(array(r.dayparts,p+".dayparts",{max:5}).map(v=>enumValue(v,["MORNING","MIDDAY","AFTERNOON","EVENING","NIGHT"] as const,p)),p);
  const validFrom=nullableDate(r.validFrom,p),validUntil=nullableDate(r.validUntil,p);window(validFrom,validUntil);
  return {weekdays,dayparts,event:r.event===null?null:text(r.event,p,160),validFrom,validUntil};
}
function parseProperties(v: unknown,p: string,scope: ExperienceScope): readonly ExperienceProperty[] {
  return array(v,p,{max:100}).map((v,i)=>{
    const r=object(v,`${p}[${i}]`,["key","label","state","value","conditions"]),key=text(r.key,p,100),question=EXPERIENCE_QUESTIONS.find(q=>q.key===key);
    if(!question && key!=="custom.detail")throw new Error("experience_unknown_property_key");
    if(question && !question.scopes.includes(scope))throw new Error("experience_property_scope_invalid");
    const label=r.label===null?null:text(r.label,p,160);if(key==="custom.detail"&&!label)throw new Error("experience_custom_label_required");
    const state=enumValue(r.state,["KNOWN","UNKNOWN","NOT_APPLICABLE"] as const,p);
    let value: ExperienceProperty["value"] = null;
    if(state!=="KNOWN"){if(r.value!==null)throw new Error("experience_unknown_value_must_be_null");}
    else if(question?.control==="NUMBER")value=number(r.value,p,{min:0,max:question.unit==="Jahre"?130:100000,integer:true});
    else if(question?.control==="YES_NO")value=boolean(r.value,p);
    else value=text(r.value,p,1000);
    return {key,label,state,value,conditions:parseConditions(r.conditions,p)};
  });
}
export function parseExperienceProfile(v: unknown,requireReviewed=true): ExperienceProfile {
  if(JSON.stringify(v)?.length>160000)throw new Error("experience_profile_too_large");
  const r=object(v,"experience",["contractVersion","category","properties","areas","offers","reviewed"]);
  if(r.contractVersion!==EXPERIENCE_PROFILE_VERSION)throw new Error("experience_version_invalid");
  const category=enumValue(r.category,EXPERIENCE_CATEGORIES,"experience.category"),reviewed=boolean(r.reviewed,"experience.reviewed");
  if(requireReviewed&&!reviewed)throw new Error("experience_review_required");
  const areas=array(r.areas,"experience.areas",{max:30}).map((v,i):ExperienceArea=>{
    const p=`experience.areas[${i}]`,a=object(v,p,["id","kind","name","properties"]);
    return{id:id(a.id,p),kind:enumValue(a.kind,[...EXPERIENCE_TEMPLATES[category].areas.map(a=>a.kind),"OTHER"],p),name:text(a.name,p,160),properties:parseProperties(a.properties,p,"AREA")};
  });unique(areas.map(a=>a.id),"experience.areas");
  const offers=array(r.offers,"experience.offers",{max:30}).map((v,i):ExperienceOffer=>{
    const p=`experience.offers[${i}]`,o=object(v,p,["id","kind","name","areaIds","properties","prices","schedule","validFrom","validUntil"]);
    const areaIds=unique(array(o.areaIds,p,{max:30}).map(v=>id(v,p)),p);if(areaIds.some(id=>!areas.some(a=>a.id===id)))throw new Error("experience_area_reference_invalid");
    const prices=array(o.prices,p,{max:30}).map((v):ExperiencePrice=>{
      const r=object(v,p,["label","currency","min","max","basis","minimumAge","maximumAge","mandatoryFeesIncluded","includes","conditions"]);
      const money=(v:unknown)=>{const n=number(v,p,{min:0,max:100000});if(Math.abs(n*100-Math.round(n*100))>1e-7)throw new Error("experience_price_minor_units");return n;};
      const min=money(r.min),max=r.max===null?null:money(r.max);if(max!==null&&min>max)throw new Error("experience_price_order");
      const age=(v:unknown)=>v===null?null:number(v,p,{min:0,max:130,integer:true});const minimumAge=age(r.minimumAge),maximumAge=age(r.maximumAge);
      if(minimumAge!==null&&maximumAge!==null&&minimumAge>maximumAge)throw new Error("experience_age_order");
      return {label:text(r.label,p,160),currency:string(r.currency,p,{pattern:/^[A-Z]{3}$/}),min,max,basis:enumValue(r.basis,["PER_PERSON","PER_GROUP","PER_ITEM"] as const,p),minimumAge,maximumAge,mandatoryFeesIncluded:r.mandatoryFeesIncluded===null?null:boolean(r.mandatoryFeesIncluded,p),includes:string(r.includes,p,{max:1000}),conditions:parseConditions(r.conditions,p)};
    });
    const schedule=array(o.schedule,p,{max:56}).map((v):ExperienceSchedule=>{const s=object(v,p,["weekday","start","end"]);const start=string(s.start,p,{pattern:/^(?:[01]\d|2[0-3]):[0-5]\d$/}),end=string(s.end,p,{pattern:/^(?:[01]\d|2[0-3]):[0-5]\d$/});if(start===end)throw new Error("experience_schedule_empty");return{weekday:number(s.weekday,p,{min:1,max:7,integer:true}),start,end};});
    const validFrom=nullableDate(o.validFrom,p),validUntil=nullableDate(o.validUntil,p);window(validFrom,validUntil);
    return {id:id(o.id,p),kind:enumValue(o.kind,[...EXPERIENCE_TEMPLATES[category].offers.map(o=>o.kind),"OTHER"],p),name:text(o.name,p,160),areaIds,properties:parseProperties(o.properties,p,"OFFER"),prices,schedule,validFrom,validUntil};
  });unique(offers.map(o=>o.id),"experience.offers");
  return {contractVersion:EXPERIENCE_PROFILE_VERSION,category,properties:parseProperties(required(r,"properties"),"experience.properties","SPOT"),areas,offers,reviewed};
}
/** Exact scope only: no area/offer values are promoted to the entire spot.
 * Conditions must be evaluated by the consuming engine; prose is not interpreted. */
export function experienceEvidence(profileValue: unknown) {
  const profile=parseExperienceProfile(profileValue);
  return {version:EXPERIENCE_PROFILE_VERSION,profileHash:hashBody(profile,[]),facts:[
    ...profile.properties.map(property=>({scope:"SPOT" as const,subjectId:null,property})),
    ...profile.areas.flatMap(area=>area.properties.map(property=>({scope:"AREA" as const,subjectId:area.id,property}))),
    ...profile.offers.flatMap(offer=>offer.properties.map(property=>({scope:"OFFER" as const,subjectId:offer.id,property}))),
  ],offers:profile.offers,areas:profile.areas};
}
