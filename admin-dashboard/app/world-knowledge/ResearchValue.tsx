import { AUTHORING_FIELDS, AREA_CATALOG, OFFER_CATALOG, EXPERIENCE_QUESTIONS, parseExperienceProfile, type ExperienceConditions, type ExperienceProperty } from "@backyrd/world-knowledge-core/browser";
import styles from "./WorldResearchBatchPanel.module.css";

const weekdays = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const dayKeys = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export const researchFieldLabel = (key: string) => AUTHORING_FIELDS.find(field => field.attributeKey === key)?.label ?? "Weitere Angabe";
const labels: Record<string, string> = { mode:"Regel", days:"Wochentage", fromTime:"Ab", toTime:"Bis", minimumPartySize:"Ab Gruppengrösse", policy:"Regel", exceptions:"Ausnahmen", currency:"Währung", min:"Ab", max:"Bis", indoor:"Drinnen", outdoor:"Draussen", notes:"Hinweise", assistanceAnimals:"Assistenztiere", purposes:"Gilt für", basis:"Preis pro", mandatoryFeesIncluded:"Pflichtgebühren enthalten", allOfferingsCovered:"Alle Angebote eingeschlossen", maximumAge:"Höchstalter", conditions:"Bedingungen", ageContext:"Altersgruppe", groupSize:"Gruppengrösse", area:"Bereich", occasion:"Anlass", accompaniment:"Begleitung", eventMode:"Besuchsart", dayparts:"Tageszeiten", minimumAge:"Mindestalter", appliesFromTime:"Ab Uhrzeit", value:"Angabe", start:"Von", end:"Bis" };
const terms: Record<string, string> = { RECOMMENDED:"Empfohlen", REQUIRED:"Erforderlich", NOT_REQUIRED:"Nicht erforderlich", CONDITIONAL:"Unter bestimmten Bedingungen", ALLOWED:"Erlaubt", NOT_ALLOWED:"Nicht erlaubt", UNKNOWN:"Noch unbekannt", ALL_AGES:"Für jedes Alter", NO_MINIMUM:"Keine Altersbeschränkung" };
function text(value: unknown, key: string): string {
  const field = AUTHORING_FIELDS.find(field => field.attributeKey === key);
  if (value === null || value === undefined) return "Nicht angegeben";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "string") return field?.allowedValues.find(item => item.value === value)?.label ?? terms[value] ?? (dayKeys.includes(value) ? weekdays[dayKeys.indexOf(value)]! : value);
  if (typeof value === "number") return new Intl.NumberFormat("de-CH").format(value);
  if (Array.isArray(value)) {
    const items = value.every(item => typeof item === "string" && dayKeys.includes(item)) ? [...value].sort((a,b) => dayKeys.indexOf(String(a)) - dayKeys.indexOf(String(b))) : value;
    return items.map(item => text(item, key)).join(" · ") || "Keine";
  }
  return "Weitere Details";
}
function Conditions({ value }: { value: ExperienceConditions }) {
  const parts = [value.weekdays.map(day => weekdays[day-1]).join(", "), value.dayparts.map(day => ({MORNING:"vormittags",MIDDAY:"mittags",AFTERNOON:"nachmittags",EVENING:"abends",NIGHT:"nachts"})[day as "MORNING"] ?? day).join(", "), value.event ? `Bei: ${value.event}` : "", value.validFrom ? `Ab ${value.validFrom}` : "", value.validUntil ? `Bis ${value.validUntil}` : ""].filter(Boolean);
  return parts.length ? <small className={styles.note}>Gilt: {parts.join(" · ")}</small> : null;
}
function Properties({ items, scope = "SPOT" }: { items: readonly ExperienceProperty[]; scope?: "SPOT" | "AREA" | "OFFER" }) {
  return items.length ? <dl className={styles.valueList}>{items.map((property,index) => <div key={`${property.key}-${index}`}><dt>{property.key === "offer.capacity" && scope === "AREA" ? "Plätze" : EXPERIENCE_QUESTIONS.find(question => question.key === property.key)?.label ?? property.label ?? "Weiteres Merkmal"}</dt><dd>{property.state === "UNKNOWN" ? "Noch unbekannt" : property.state === "NOT_APPLICABLE" ? "Nicht zutreffend" : text(property.value,property.key)}<Conditions value={property.conditions}/></dd></div>)}</dl> : null;
}
export function ResearchValue({ attributeKey, value }: { attributeKey: string; value: unknown }) {
  if (attributeKey === "experience.profile") {
    let profile: ReturnType<typeof parseExperienceProfile> | null = null;
    try { profile = parseExperienceProfile(value,false); } catch { /* Invalid drafts stay visible for review. */ }
    if (!profile) return <p className={styles.error}>Dieses Teilprofil entspricht nicht dem aktuellen Format. Bitte anhand der Originalquellen prüfen.</p>;
      const units = {PER_PERSON:"pro Person",PER_GROUP:"pro Gruppe",PER_ITEM:"pro Stück",PER_ROOM_NIGHT:"pro Zimmer und Nacht",PER_PERSON_NIGHT:"pro Person und Nacht",PER_SITE_NIGHT:"pro Stellplatz und Nacht"};
      return <div className={styles.profileValue}>
        {!!profile.properties.length && <section><h5>Für den gesamten Ort</h5><Properties items={profile.properties}/></section>}
        <section><h5>Angebote <span>{profile.offers.length}</span></h5>{profile.offers.length ? <ul className={styles.entityList}>{profile.offers.map(offer => <li key={offer.id}><strong>{offer.name}</strong><small>{OFFER_CATALOG.find(item => item.kind === offer.kind)?.label ?? "Angebot"}</small><Properties items={offer.properties} scope="OFFER"/>{!!offer.prices.length && <ul>{offer.prices.map((price,index) => <li key={index}>{price.label}: {price.min}{price.max === null ? "" : `–${price.max}`} {price.currency} · {units[price.basis]}{price.includes ? ` · ${price.includes}` : ""}{price.minimumAge !== null ? ` · ab ${price.minimumAge} Jahren` : ""}{price.maximumAge !== null ? ` · bis ${price.maximumAge} Jahre` : ""}{price.mandatoryFeesIncluded === true ? " · Pflichtgebühren enthalten" : price.mandatoryFeesIncluded === false ? " · Pflichtgebühren nicht vollständig enthalten" : ""}<Conditions value={price.conditions}/></li>)}</ul>}{!!offer.schedule.length && <p>{offer.schedule.map(item => `${weekdays[item.weekday-1]} ${item.start}–${item.end}`).join(" · ")}</p>}{(offer.validFrom || offer.validUntil) && <p>Gültigkeit: {offer.validFrom ?? "Beginn offen"} bis {offer.validUntil ?? "Ende offen"}</p>}{!!offer.areaIds.length && <p>Bereiche: {offer.areaIds.map(id => profile.areas.find(area => area.id === id)?.name ?? "Zuordnung prüfen").join(", ")}</p>}</li>)}</ul> : <p className={styles.note}>Keine Angebote in diesem Entwurf belegt. Vorhandene Angebote bleiben erhalten.</p>}</section>
        <section><h5>Räume & Bereiche <span>{profile.areas.length}</span></h5>{profile.areas.length ? <ul className={styles.entityList}>{profile.areas.map(area => <li key={area.id}><strong>{area.name}</strong><small>{AREA_CATALOG.find(item => item.kind === area.kind)?.label ?? "Bereich"}</small><Properties items={area.properties} scope="AREA"/></li>)}</ul> : <p className={styles.note}>Noch keine Bereiche in diesem Entwurf belegt.</p>}</section>
      </div>;
  }
  if (attributeKey === "hours.regular" || attributeKey === "hours.kitchen") {
    if (Array.isArray(value)) return <dl className={styles.weekValue}>{dayKeys.map((day,index) => {
      const entry = value.find(item => record(item) && item.day === day);
      const intervals = record(entry) && Array.isArray(entry.intervals) ? entry.intervals : null;
      return <div key={day}><dt>{weekdays[index]}</dt><dd>{intervals === null ? "Nicht belegt" : intervals.length === 0 ? "Geschlossen" : intervals.map(item => record(item) ? `${String(item.start)}–${String(item.end)}` : "Bitte prüfen").join(" · ")}</dd></div>;
    })}</dl>;
  }
  if (Array.isArray(value) && value.some(record)) return <ul className={styles.entityList}>{value.map((item,index) => <li key={index}><ResearchValue attributeKey={attributeKey} value={item}/></li>)}</ul>;
  if (record(value)) return <dl className={styles.valueList}>{Object.entries(value).filter(([,item]) => item !== null && item !== undefined).map(([key,item]) => <div key={key}><dt>{labels[key] ?? key.replaceAll("_"," ").replace(/([a-z])([A-Z])/g,"$1 $2")}</dt><dd>{record(item) ? <ResearchValue attributeKey={attributeKey} value={item}/> : text(item,attributeKey)}</dd></div>)}</dl>;
  return <p className={styles.scalarValue}>{text(value,attributeKey)}</p>;
}

export function researchGapReason(reason?: string): string {
  const reasons: Record<string,string> = {
    PHONE_COUNTRY_REQUIRED:"Die Telefonnummer wurde gefunden. Für das internationale Format fehlt im Rechercheauftrag die Länderzuordnung.",
    NO_SUPPORTED_SCOPED_FACT:"Keine ausreichend belegte Angabe für diesen Bereich gefunden.",
    NO_SUPPORTED_TARGET_FACT:"Keine ausreichend belegte Angabe gefunden.",
    ENTITY_NAME_NOT_LITERAL:"Die vorgeschlagene Bezeichnung konnte nicht ausreichend mit dem Quellentext belegt werden.",
  };
  return reason ? reasons[reason] ?? (/^[A-Z_]+$/.test(reason) ? "Die Recherche konnte diese Angabe noch nicht ausreichend belegen." : reason) : "Noch nicht ausreichend belegt.";
}
