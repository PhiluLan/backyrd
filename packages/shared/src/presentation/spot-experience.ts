/** Public display adapter only: no eligibility, inference or raw-object rendering. */
export type PublicSpotFact = { label: string; value: string; condition: string | null };
export type PublicSpotCard = { id: string; name: string; prices: string[]; facts: PublicSpotFact[]; places: string[]; times: string[] };
export type PublicSpotExperience = { offers: PublicSpotCard[]; areas: PublicSpotCard[]; shared: PublicSpotFact[] };
// Public presentation copy is separate from matching rules and catalogue codes.
const labels: Readonly<Record<string,string>> = {
  "stay.check_in": "Check-in ab",
  "stay.check_out": "Check-out bis",
  "stay.minimum_booking_age": "Mindestalter der buchenden Person",
  "stay.minimum_nights": "Mindestaufenthalt",
  "stay.maximum_occupancy": "Maximale Belegung",
  "stay.room_type": "Zimmer- oder Unterkunftsart",
  "stay.meal_inclusion": "Enthaltene Verpflegung",
  "participation.audience": "Wer kann dieses Angebot nutzen?",
  "experience.activity": "Was kann man hier machen?",
  "experience.theme": "Themen, Tiere oder Sammlungen",
  "participation.format": "Selbstständig, geführt oder betreut?",
  "participation.language": "Verfügbare Sprachen",
  "participation.age_suitability": "Empfohlene Altersgruppen (keine Zutrittsgrenze)",
  "participation.prerequisite": "Voraussetzungen und nötige Begleitung",
  "participation.permission": "Zutrittsregeln und Ausnahmen",
  "participation.entry_mode": "Ticket nötig oder unabhängig zugänglich?",
  "participation.booking": "Reservation, Anmeldung oder Vorbestellung",
  "participation.consumption_obligation": "Mindestkonsumation oder Bestellpflicht",
  "food.cuisine": "Küche",
  "food.dish": "Gerichte und Spezialitäten",
  "food.diet": "Vegetarische und vegane Angebote",
  "food.option": "Allergene und Anpassungsmöglichkeiten",
  "food.meal_extent": "Vollständige Mahlzeit oder nur Snacks?",
  "food.drink": "Getränke einschließlich alkoholfreier Auswahl",
  "condition.children": "Kinderangebote, Kindermenü und Betreuung",
  "offer.service": "Bedienung oder Selbstbedienung",
  "offer.capacity": "Kapazität / maximale Teilnehmerzahl",
  "time.duration": "Typische Dauer",
  "route.length": "Weglänge",
  "condition.terrain": "Wegbeschaffenheit und Steigungen",
  "sport.level": "Für welche Erfahrungsstufen geeignet?",
  "sport.equipment": "Benötigte Ausrüstung",
  "sport.rental": "Ausrüstung vor Ort ausleihbar?",
  "sport.registration": "Erstregistrierung erforderlich?",
  "sport.induction": "Sicherheitseinweisung erforderlich?",
  "participation.minimum_age": "Mindestalter für dieses Angebot",
  "amenity.shower": "Duschen vorhanden?",
  "participation.accessibility": "Zugänglichkeit und Einschränkungen",
  "location.setting": "Lage und Umgebung",
  "location.view": "Was sieht man tatsächlich von hier?",
  "location.waterbody": "Welches Gewässer liegt hier?",
  "atmosphere.character": "Atmosphäre",
  "atmosphere.noise": "Geräuschpegel",
  "atmosphere.music": "Hintergrundmusik, Live-Musik oder DJ",
  "atmosphere.privacy": "Privatsphäre / separat nutzbar",
  "atmosphere.conversation": "Bedingungen für Gespräche",
  "offer.shade": "Schatten verfügbar?",
  "condition.weather_protection": "Überdacht / vor Regen geschützt?",
  "offer.temperature": "Heizung und Kühlung",
  "offer.feature": "Besondere Ausstattung",
  "offer.usage": "Sitzen, Stehen und Nutzungsmöglichkeiten",
  "amenity.toilet": "WC vorhanden?",
  "amenity.changing_table": "Wickeltisch vorhanden?",
  "amenity.high_chair": "Kinderhochstuhl vorhanden?",
  "amenity.playground": "Spielplatz vorhanden?",
  "amenity.rest_seating": "Ruhe- und Sitzmöglichkeiten?",
  "amenity.stroller": "Mit Kinderwagen zugänglich?",
  "amenity.step_free": "Stufenlos zugänglich?",
  "amenity.parking": "Parkplätze vorhanden?",
  "travel.mode": "Anreise, Eingang und Treffpunkt"
};
const units: Readonly<Record<string,string>> = {"stay.minimum_booking_age": "Jahre", "stay.minimum_nights": "Nächte", "stay.maximum_occupancy": "Personen", "offer.capacity": "Personen", "time.duration": "Minuten", "route.length": "Meter", "participation.minimum_age": "Jahre"};
const days = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
const parts: Readonly<Record<string,string>> = {MORNING:"vormittags",MIDDAY:"mittags",AFTERNOON:"nachmittags",EVENING:"abends",NIGHT:"nachts"};
const row = (value: unknown): Record<string,unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
const list = (value: unknown, max = 100): unknown[] => Array.isArray(value) ? value.slice(0,max) : [];
const text = (value: unknown, max = 1000): string => typeof value === "string" ? value.trim().slice(0,max) : "";
const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100000;
const money = (value: number) => new Intl.NumberFormat("de-CH",{maximumFractionDigits:2}).format(value);
function conditions(value: unknown): string | null {
 const c=row(value),labels=[...list(c.weekdays,7).flatMap(day=>typeof day==="number" && Number.isInteger(day) && day>=1 && day<=7?[days[day-1]]:[]),...list(c.dayparts,5).flatMap(part=>typeof part==="string"&&parts[part]?[parts[part]]:[])];
 if(text(c.event))labels.push(`Bei ${text(c.event,160)}`);
 if(text(c.validFrom))labels.push(`Ab ${text(c.validFrom,40)}`);
 if(text(c.validUntil))labels.push(`Bis ${text(c.validUntil,40)}`);
 return labels.length?labels.join(" · "):null;
}
function facts(input: unknown): PublicSpotFact[] {
 const grouped=new Map<string,PublicSpotFact>();
 for(const inputProperty of list(input,300)){
  const p=row(inputProperty),key=text(p.key,100);
  if(p.state!=="KNOWN")continue;
  const label=key==="custom.detail"?text(p.label,160):labels[key];
  if(!label)continue;
  const value=typeof p.value==="boolean"?(p.value?"Ja":"Nein"):numeric(p.value)?`${money(p.value)}${units[key]?` ${units[key]}`:""}`:text(p.value);
  if(!value)continue;
  const condition=conditions(p.conditions),id=JSON.stringify([key,label,condition]),prior=grouped.get(id);
  if(prior){if(!prior.value.split(" · ").includes(value))prior.value+=` · ${value}`;}else grouped.set(id,{label,value,condition});
 }
 return [...grouped.values()];
}
function price(input: unknown): string | null {
 const p=row(input);if(!numeric(p.min)||!(p.max===null||numeric(p.max))||typeof p.currency!=="string"||!/^([A-Z]{3})$/.test(p.currency)||(numeric(p.max)&&p.max<p.min))return null;
 const amount=p.min===0&&p.max===0?"Kostenlos":p.max===null?`ab ${money(p.min)} ${p.currency}`:p.max===p.min?`${money(p.min)} ${p.currency}`:`${money(p.min)}–${money(p.max as number)} ${p.currency}`;
 const basis:Readonly<Record<string,string>>={PER_PERSON:"pro Person",PER_GROUP:"für die Gruppe",PER_ITEM:"pro Artikel",PER_ROOM_NIGHT:"pro Zimmer/Nacht",PER_PERSON_NIGHT:"pro Person/Nacht",PER_SITE_NIGHT:"pro Stellplatz/Nacht"};
 const age=numeric(p.minimumAge)&&numeric(p.maximumAge)?`${p.minimumAge}–${p.maximumAge} Jahre`:numeric(p.minimumAge)?`ab ${p.minimumAge} Jahren`:numeric(p.maximumAge)?`bis einschließlich ${p.maximumAge} Jahre`:null;
 const included=text(p.includes,1000),fees=p.mandatoryFeesIncluded===false?"zusätzliche Pflichtkosten":p.mandatoryFeesIncluded===null?"Pflichtkosten noch nicht bestätigt":null;
 return [text(p.label,160),amount,typeof p.basis==="string"?basis[p.basis]:null,age,included?`für ${included}`:null,fees,conditions(p.conditions)].filter(Boolean).join(" · ");
}
function times(input: unknown): string[] {
 return list(input,56).flatMap(item => {
  const interval=row(item);
  const day=typeof interval.weekday === "number" && Number.isInteger(interval.weekday) ? days[interval.weekday-1] : null;
  const start=text(interval.start,5),end=text(interval.end,5);
  return day && /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) ? [`${day} ${start}–${end}`] : [];
 });
}
export function presentSpotExperience(input: unknown): PublicSpotExperience {
 const profile=row(input);if(profile.contractVersion!=="backyrd.world-knowledge.experience-profile@1.0"||profile.reviewed!==true)return {offers:[],areas:[],shared:[]};
 const offers=list(profile.offers,30).map(row).filter(o=>text(o.id,100)&&text(o.name,160));
 const areas=list(profile.areas,30).map(row).filter(a=>text(a.id,100)&&text(a.name,160));
 return {
  offers:offers.map(o=>({id:text(o.id,100),name:text(o.name,160),prices:list(o.prices,30).flatMap(p=>{const label=price(p);return label?[label]:[];}),facts:facts(o.properties),places:areas.filter(a=>list(o.areaIds,30).includes(a.id)).map(a=>text(a.name,160)),times:[...times(o.schedule),...([conditions({validFrom:o.validFrom,validUntil:o.validUntil})].filter((value): value is string => value !== null))]})),
  areas:areas.map(a=>({id:text(a.id,100),name:text(a.name,160),prices:[],facts:facts(a.properties),places:offers.filter(o=>list(o.areaIds,30).includes(a.id)).map(o=>text(o.name,160)),times:[]})),
  shared:facts(profile.properties),
 };
}
