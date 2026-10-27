import { AUTHORING_FIELDS, AREA_CATALOG, OFFER_CATALOG, EXPERIENCE_QUESTIONS, parseExperienceProfile, parseDiscoveryProfile, type ExperienceConditions, type ExperienceProperty } from "@backyrd/world-knowledge-core/browser";
import { researchEvidenceReason } from "@/lib/researchSaveFeedback";
import styles from "./WorldResearchBatchPanel.module.css";

const weekdays = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const dayKeys = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export const researchFieldLabel = (key: string) => key === "offering.food_specialities" ? "Gerichte und Spezialitäten" : AUTHORING_FIELDS.find(field => field.attributeKey === key)?.label ?? "Weitere Angabe";
const terms: Record<string, string> = {
  ...Object.fromEntries(AUTHORING_FIELDS.flatMap(field=>field.allowedValues.map(option=>[option.value,option.label]))),
  RECOMMENDED:"Empfohlen", REQUIRED:"Erforderlich", NOT_REQUIRED:"Nicht erforderlich", CONDITIONAL:"Unter bestimmten Bedingungen", ALLOWED:"Erlaubt", NOT_ALLOWED:"Nicht erlaubt", UNKNOWN:"Noch unbekannt", ALL_AGES:"Für jedes Alter", NO_MINIMUM:"Keine Altersbeschränkung",
  OPEN:"Geöffnet",CLOSED:"Geschlossen",TEMPORARILY_CLOSED:"Vorübergehend geschlossen",LIMITED:"Eingeschränkt",FULL:"Ausgelastet",KITCHEN_CLOSED:"Küche geschlossen",AREA_CLOSED:"Bereich geschlossen",
  GENERAL_MINIMUM:"Mindestalter",UNACCOMPANIED_MINIMUM:"Ohne Begleitung",NONE:"Ohne Begleitung",ADULT:"Mit einer erwachsenen Person",LEGAL_GUARDIAN:"Mit einer erziehungsberechtigten Person",ALONE:"Allein",GROUP:"In einer Gruppe",ADULTS:"Erwachsene",CHILDREN:"Kinder",MIXED_AGES:"Kinder und Erwachsene",NORMAL_OPERATION:"Im regulären Betrieb",EVENT:"Bei Veranstaltungen",PART_OF_SPOT:"Gehört zum Ort",EMBEDDED_FACILITY:"Zusätzliches Angebot vor Ort",
  MEAL:"Mahlzeit",DRINK:"Getränk",SNACK:"Snack oder Kuchen",ADMISSION:"Eintritt",ACTIVITY:"Aktivität",OVERNIGHT:"Übernachtung",PER_PERSON:"pro Person",PER_GROUP:"pro Gruppe",PER_PERSON_PER_NIGHT:"pro Person und Nacht",PER_ITEM:"pro Stück",PER_ROOM_NIGHT:"pro Zimmer und Nacht",PER_SITE_NIGHT:"pro Stellplatz und Nacht",PER_PERSON_NIGHT:"pro Person und Nacht",
  EUROPE_ZURICH:"Schweizer Ortszeit",WITH_ACTIVE_CONSUMPTION:"Solange etwas konsumiert wird",TIME_LIMITED:"Zeitlich begrenzt",BYO_FEE:"Gegen eine Gebühr",
};
function text(value: unknown, key: string): string {
  const field = AUTHORING_FIELDS.find(field => field.attributeKey === key);
  if (value === null || value === undefined) return "Noch keine Angabe";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "string") {
    if(key === "location.country_code") { try {return new Intl.DisplayNames(["de"],{type:"region"}).of(value) ?? value;}catch{return value;} }
    if(key === "location.timezone" && value === "Europe/Zurich")return "Schweizer Ortszeit";
    return field?.allowedValues.find(item => item.value === value)?.label ?? terms[value] ?? (dayKeys.includes(value) ? weekdays[dayKeys.indexOf(value)]! : /^[A-Z][A-Z0-9_]+$/.test(value) && value.includes("_") ? "Bedeutung bitte anhand der Quelle klären" : value);
  }
  if (typeof value === "number") return new Intl.NumberFormat("de-CH").format(value);
  if (Array.isArray(value)) return value.map(item=>text(item,key)).join(" · ") || "Keine";
  return "Bitte anhand der Quelle klären";
}
export function researchDate(value: unknown): string {
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))return "Datum bitte prüfen";
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value ? new Intl.DateTimeFormat("de-CH",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(date) : "Datum bitte prüfen";
}
const dateNumber=(value:string)=>Date.parse(`${value}T00:00:00Z`);
function timeRanges(value:unknown):string {
  if(!Array.isArray(value))return "Uhrzeiten bitte prüfen";
  return value.map(item=>record(item) && typeof item.start==="string" && typeof item.end==="string" ? `${item.start}–${item.end} Uhr${item.end<item.start?" (bis zum nächsten Tag)":""}` : "Uhrzeiten bitte prüfen").join(" und ");
}
export function specialHoursSentences(value:unknown):string[] {
  if(!Array.isArray(value))return ["Die besonderen Öffnungszeiten müssen noch geklärt werden."];
  if(!value.length)return ["Keine besonderen Öffnungszeiten eingetragen."];
  const rows=value.filter(record).filter(row=>typeof row.date==="string").sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(rows.length!==value.length)return ["Ein Sonderdatum ist unvollständig. Bitte anhand der Quelle korrigieren."];
  const groups:Array<{first:string;last:string;status:unknown;intervals:unknown}>=[];
  for(const row of rows){
    if(researchDate(row.date)==="Datum bitte prüfen")return ["Ein Sonderdatum ist ungültig. Bitte anhand der Quelle korrigieren."];
    const previous=groups.at(-1),date=String(row.date);
    if(previous && dateNumber(date)-dateNumber(previous.last)===86_400_000 && previous.status===row.status && JSON.stringify(previous.intervals)===JSON.stringify(row.intervals))previous.last=date;
    else groups.push({first:date,last:date,status:row.status,intervals:row.intervals});
  }
  return groups.map(group=>{
    const when=group.first===group.last?`Am ${researchDate(group.first)}`:`Vom ${researchDate(group.first)} bis ${researchDate(group.last)}`;
    return `${when} ${group.status==="CLOSED"?"geschlossen":group.status==="OPEN"?`geöffnet${Array.isArray(group.intervals)&&group.intervals.length?`: ${timeRanges(group.intervals)}`:"; genaue Uhrzeiten fehlen noch"}`:"ist die Öffnung noch ungeklärt"}.`;
  });
}
function contextLines(value:unknown):string[] {
  if(!record(value))return [];
  const result:string[]=[];
  if(Array.isArray(value.days) && value.days.length)result.push([...value.days].sort((a,b)=>dayKeys.indexOf(String(a))-dayKeys.indexOf(String(b))).map(day=>text(day,"")).join(", "));
  if(Array.isArray(value.dayparts) && value.dayparts.length)result.push(value.dayparts.map(day=>text(day,"")).join(", "));
  for(const [key,label] of [["area","Bereich"],["occasion","Anlass"],["ageContext","Für"],["accompaniment","Begleitung"],["eventMode","Gilt"]] as const)if(value[key])result.push(`${label}: ${text(value[key],"")}`);
  if(record(value.groupSize))result.push(`Gruppen mit ${value.groupSize.min}–${value.groupSize.max} Personen`);
  return result;
}
/** Human descriptions only: unknown structures never expose database keys or enum codes. */
export function researchValueSentences(attributeKey:string,value:unknown):string[] {
  const control=AUTHORING_FIELDS.find(field=>field.attributeKey===attributeKey)?.control;
  if(value===undefined || value===null)return ["Noch keine Angabe hinterlegt."];
  if(control==="SPECIAL_HOURS")return specialHoursSentences(value);
  if(control==="RESERVATION_RULE" && record(value))return [
    value.mode==="RECOMMENDED"?"Eine Reservation wird empfohlen.":value.mode==="REQUIRED"?"Eine Reservation ist erforderlich.":value.mode==="NOT_REQUIRED"?"Eine Reservation ist nicht erforderlich.":"Eine Reservation ist unter bestimmten Bedingungen nötig.",
    ...(typeof value.minimumPartySize==="number"?[`Gilt ab ${value.minimumPartySize} Personen.`]:[]),
    ...contextLines(value),...(value.fromTime?[`${value.fromTime}${value.toTime?`–${value.toTime}`:""} Uhr`]:[]),
  ];
  if(control==="CONSUMPTION_RULE" && record(value))return [`${attributeKey==="rule.external_food"?"Eigene Speisen":"Eigene Getränke"}: ${text(value.policy,attributeKey)}.`,...(Array.isArray(value.exceptions)&&value.exceptions.length?[`Ausnahmen: ${value.exceptions.join("; ")}`]:[])];
  if(control==="PET_ACCESS_RULE" && record(value))return [`Drinnen: ${text(value.indoor,"")}`,`Draussen: ${text(value.outdoor,"")}`,`Assistenztiere: ${text(value.assistanceAnimals,"")}`,...(typeof value.notes==="string"&&value.notes?[value.notes]:[])];
  if((control==="AGE_ACCESS_RULE_V2" || control==="AGE_ACCESS_RULE") && record(value)){
    const rules=Array.isArray(value.rules)?value.rules.filter(record):[value];
    return [...rules.flatMap(rule=>[rule.mode==="NO_MINIMUM" || rule.policy==="ALL_AGES"?"Keine Altersbeschränkung.":rule.mode==="UNACCOMPANIED_MINIMUM"?`Ohne Begleitung ab ${rule.minimumAge} Jahren. Jüngere Personen dürfen mit ${rule.accompaniment==="LEGAL_GUARDIAN"?"einer erziehungsberechtigten":"einer erwachsenen"} Person kommen.`:`Zutritt ab ${rule.minimumAge} Jahren.`,...(rule.appliesFromTime?[`Gilt ab ${rule.appliesFromTime} Uhr.`]:[]),...contextLines(rule),...(rule.event?[`Bei: ${String(rule.event)}`]:[])]),...(typeof value.notes==="string"&&value.notes?[value.notes]:[])];
  }
  if(control==="CURRENT_STATE" && record(value))return [text(value.kind,attributeKey),...(value.scope?[`Betrifft: ${text(value.scope,"")}`]:[])];
  if(control==="INTEGER_RANGE" && record(value))return [`${value.min===value.max?value.min:`${value.min}–${value.max}`} Personen`];
  if(control==="PRICE_OPTIONS" && Array.isArray(value))return value.length?value.filter(record).flatMap(price=>[
    `${Array.isArray(price.purposes)?price.purposes.map(p=>text(p,"")).join(", "):"Preis"}: ${price.min}${price.max!==price.min?`–${price.max}`:""} ${price.currency} ${text(price.basis,"")}.`,
    ...(price.minimumAge!==null&&price.minimumAge!==undefined?[`Ab ${price.minimumAge} Jahren.`]:[]),...(price.maximumAge!==null&&price.maximumAge!==undefined?[`Bis ${price.maximumAge} Jahre.`]:[]),
    price.mandatoryFeesIncluded===true?"Verpflichtende Zusatzkosten sind enthalten.":"Ob verpflichtende Zusatzkosten enthalten sind, ist noch nicht bestätigt.",price.allOfferingsCovered===true?"Gilt für alle Angebote dieses Preisbereichs.":"Gilt nur für die beschriebenen Angebote.",...contextLines(price.conditions),
  ]):["Noch keine konkreten Preise eingetragen."];
  if(["ONSITE_OFFERINGS","VISIT_SITUATIONS","ATMOSPHERE_CONTEXTS","DAYPART_CONTEXTS"].includes(control ?? "") && Array.isArray(value))return value.length?value.filter(record).map(row=>[text(row.kind ?? row.situation ?? row.atmosphere ?? row.daypart,attributeKey),...(row.relationship?[text(row.relationship,"")]:[]),...(row.area?[`Bereich: ${row.area}`]:[]),...contextLines(row.conditions)].join(" · ")):["Keine zusätzlichen Angaben eingetragen."];
  if(control==="DISCOVERY_PROFILE"){
    try {
      const profile=parseDiscoveryProfile(value,false);
      return [profile.description,...profile.offerings.flatMap(offer=>[`${offer.name}: ${offer.description}`,...(offer.price?[`${offer.price.min}${offer.price.max!==offer.price.min?`–${offer.price.max}`:""} ${offer.price.currency} ${text(offer.price.basis,"")}. ${offer.price.mandatoryFeesIncluded===true?"Pflichtgebühren enthalten.":offer.price.mandatoryFeesIncluded===false?"Pflichtgebühren nicht vollständig enthalten.":"Pflichtgebühren noch ungeklärt."}`]:[])]),...profile.assertions.flatMap(assertion=>[`${assertion.state==="ABSENT"?"Nicht vorhanden":"Vorhanden"}: ${assertion.concepts.join(", ")}${assertion.offeringId?` · Gilt für ${profile.offerings.find(offer=>offer.id===assertion.offeringId)?.name ?? "Zuordnung bitte prüfen"}`:" · Gilt für den gesamten Ort"}.`, `Beleg: „${assertion.evidence}“`,...(assertion.conditions?[`Bedingungen: ${assertion.conditions}`]:[]),...(assertion.validFrom?[`Gültig ab ${researchDate(assertion.validFrom.slice(0,10))}.`]:[]),...(assertion.validUntil?[`Gültig bis ${researchDate(assertion.validUntil.slice(0,10))}.`]:[])])];
    }catch{return ["Für diese Angabe fehlt eine zuverlässige Vorschau. Bitte öffne die Quelle und trage die richtige Angabe über „Ändern“ ein."];}
  }
  if(Array.isArray(value) && value.every(item=>!record(item)))return [text(value,attributeKey)];
  if(record(value) || Array.isArray(value))return ["Für diese Angabe fehlt eine zuverlässige Vorschau. Bitte öffne die Quelle und trage die richtige Angabe über „Ändern“ ein."];
  return [text(value,attributeKey)];
}
function Conditions({ value }: { value: ExperienceConditions }) {
  const parts = [value.weekdays.map(day => weekdays[day-1]).join(", "), value.dayparts.map(day => ({MORNING:"vormittags",MIDDAY:"mittags",AFTERNOON:"nachmittags",EVENING:"abends",NIGHT:"nachts"})[day as "MORNING"] ?? day).join(", "), value.event ? `Bei: ${value.event}` : "", value.validFrom ? `Ab ${researchDate(value.validFrom)}` : "", value.validUntil ? `Bis ${researchDate(value.validUntil)}` : ""].filter(Boolean);
  return parts.length ? <small className={styles.note}>Gilt: {parts.join(" · ")}</small> : null;
}
function Properties({ items, scope = "SPOT" }: { items: readonly ExperienceProperty[]; scope?: "SPOT" | "AREA" | "OFFER" }) {
  return items.length ? <dl className={styles.valueList}>{items.map((property,index) => <div key={`${property.key}-${index}`}><dt>{property.key === "offer.capacity" && scope === "AREA" ? "Plätze" : EXPERIENCE_QUESTIONS.find(question => question.key === property.key)?.label ?? property.label ?? "Weiteres Merkmal"}</dt><dd>{property.state === "UNKNOWN" ? "Noch unbekannt" : property.state === "NOT_APPLICABLE" ? "Nicht zutreffend" : text(property.value,property.key)}<Conditions value={property.conditions}/></dd></div>)}</dl> : null;
}
export function ResearchValue({ attributeKey, value }: { attributeKey: string; value: unknown }) {
  if (attributeKey === "experience.profile") {
    let profile: ReturnType<typeof parseExperienceProfile> | null = null;
    try { profile = parseExperienceProfile(value,false); } catch { /* Invalid drafts stay visible for review. */ }
    if (!profile) return <p className={styles.error}>Dieser Vorschlag lässt sich noch nicht zuverlässig anzeigen. Bitte öffne die Quelle und trage die richtige Angabe über „Ändern“ ein.</p>;
      const units = {PER_PERSON:"pro Person",PER_GROUP:"pro Gruppe",PER_ITEM:"pro Stück",PER_ROOM_NIGHT:"pro Zimmer und Nacht",PER_PERSON_NIGHT:"pro Person und Nacht",PER_SITE_NIGHT:"pro Stellplatz und Nacht"};
      return <div className={styles.profileValue}>
        {!!profile.properties.length && <section><h5>Für den gesamten Ort</h5><Properties items={profile.properties}/></section>}
        <section><h5>Angebote <span>{profile.offers.length}</span></h5>{profile.offers.length ? <ul className={styles.entityList}>{profile.offers.map(offer => <li key={offer.id}><details><summary><strong>{offer.name}</strong></summary><small>{OFFER_CATALOG.find(item => item.kind === offer.kind)?.label ?? "Angebot"}</small><Properties items={offer.properties} scope="OFFER"/>{!!offer.prices.length && <ul>{offer.prices.map((price,index) => <li key={index}>{price.label}: {price.min}{price.max === null || price.max === price.min ? "" : `–${price.max}`} {price.currency} · {units[price.basis]}{price.includes ? ` · ${price.includes}` : ""}{price.minimumAge !== null ? ` · ab ${price.minimumAge} Jahren` : ""}{price.maximumAge !== null ? ` · bis ${price.maximumAge} Jahre` : ""}{price.mandatoryFeesIncluded === true ? " · Pflichtgebühren enthalten" : price.mandatoryFeesIncluded === false ? " · Pflichtgebühren nicht vollständig enthalten" : ""}<Conditions value={price.conditions}/></li>)}</ul>}{!!offer.schedule.length && <p>{offer.schedule.map(item => `${weekdays[item.weekday-1]} ${item.start}–${item.end}`).join(" · ")}</p>}{(offer.validFrom || offer.validUntil) && <p>Gültigkeit: {offer.validFrom ? researchDate(offer.validFrom) : "Beginn offen"} bis {offer.validUntil ? researchDate(offer.validUntil) : "Ende offen"}</p>}{!!offer.areaIds.length && <p>Bereiche: {offer.areaIds.map(id => profile.areas.find(area => area.id === id)?.name ?? "Zuordnung prüfen").join(", ")}</p>}</details></li>)}</ul> : <p className={styles.note}>Keine Angebote in diesem Entwurf belegt. Vorhandene Angebote bleiben erhalten.</p>}</section>
        <section><h5>Räume & Bereiche <span>{profile.areas.length}</span></h5>{profile.areas.length ? <ul className={styles.entityList}>{profile.areas.map(area => <li key={area.id}><details><summary><strong>{area.name}</strong></summary><small>{AREA_CATALOG.find(item => item.kind === area.kind)?.label ?? "Bereich"}</small><Properties items={area.properties} scope="AREA"/></details></li>)}</ul> : <p className={styles.note}>Noch keine Bereiche in diesem Entwurf belegt.</p>}</section>
      </div>;
  }
  if (attributeKey === "hours.regular" || attributeKey === "hours.kitchen") {
    if (Array.isArray(value)) return <dl className={styles.weekValue}>{dayKeys.map((day,index) => {
      const entry = value.find(item => record(item) && item.day === day);
      const intervals = record(entry) && Array.isArray(entry.intervals) ? entry.intervals : null;
      return <div key={day}><dt>{weekdays[index]}</dt><dd>{intervals === null ? "Nicht belegt – noch keine Zeiten angegeben" : intervals.length === 0 ? "Geschlossen" : timeRanges(intervals)}</dd></div>;
    })}</dl>;
  }
  const sentences=researchValueSentences(attributeKey,value);
  return <div className={styles.scalarValue}>{sentences.map((line,index)=><p key={index}>{line}</p>)}</div>;
}

export function researchGapReason(reason?: string): string {
  const reasons: Record<string,string> = {
    PHONE_COUNTRY_REQUIRED:"Die Telefonnummer wurde gefunden. Bitte prüfe die Landesvorwahl und ergänze die vollständige Nummer.",
    NO_SUPPORTED_SCOPED_FACT:"Für diesen Bereich hat die Recherche keine eindeutige Angabe gefunden.",
    NO_SUPPORTED_TARGET_FACT:"Die Recherche hat dazu keine eindeutige Angabe gefunden.",
    ENTITY_NAME_NOT_LITERAL:"Bitte prüfe in der Quelle, ob die vorgeschlagene Bezeichnung zu diesem Ort gehört.",
  };
  if(!reason)return "Die Recherche hat diese Angabe noch nicht eindeutig geklärt.";
  if(reasons[reason])return reasons[reason];
  if(/^[A-Z][A-Z_:.@0-9-]+$/.test(reason))return researchEvidenceReason(reason).replaceAll("strukturierten Auswahlfeldern","passenden Angaben im Formular").replaceAll("Übernahmeregel","automatische Prüfung");
  if(/research_|world_|manifest|claimId/.test(reason))return "Die automatische Prüfung konnte den Vorschlag noch nicht eindeutig zuordnen. Vergleiche ihn mit der Quelle und entscheide, was richtig ist.";
  return reason.replaceAll("Profil-Editor","Bearbeitung").replaceAll("Spotprofil","Ortprofil").replaceAll("kanonisch","bestätigt").replaceAll("stabilen IDs","bisherigen Zuordnungen").replaceAll("Eigentümerschaft des Hinweises administrativ klären","Bitte prüfe, für welchen Ort der Hinweis gilt").replaceAll("generische Angebot","Angebot").replace(/\b[A-Z][A-Z_]+\b/g,token=>terms[token] ?? token);
}
