import { WEEKDAYS } from "./contracts.js";
import { getAttributeDefinition, DAYPARTS, ONSITE_OFFERING_RELATIONSHIPS, RESERVATION_MODES, CONSUMPTION_POLICIES, PET_ACCESS_STATES } from "./registry.js";

type Schema = Record<string, unknown>;
const text = (maxLength = 160): Schema => ({ type: "string", minLength: 1, maxLength });
const enumeration = (values: readonly string[]): Schema => ({ type: "string", enum: values });
const list = (items: Schema, maxItems: number): Schema => ({ type: "array", items, maxItems });
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: "null" }] });
const record = (properties: Record<string, Schema>): Schema => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const time = { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" };
const days = list(enumeration(WEEKDAYS), 7);
const interval = record({ start: time, end: time });
const range = record({ min: { type: "integer", minimum: 1, maximum: 100000 }, max: { type: "integer", minimum: 1, maximum: 100000 } });
const conditions = (withDayparts: boolean) => record({
  ...(withDayparts ? { dayparts: list(enumeration(DAYPARTS), DAYPARTS.length) } : {}),
  days, area: nullable(text(120)), occasion: nullable(text()), groupSize: nullable(range),
  ageContext: nullable(enumeration(["ADULTS", "CHILDREN", "MIXED_AGES"])),
  accompaniment: nullable(enumeration(["ALONE", "ADULT", "LEGAL_GUARDIAN", "GROUP"])),
  eventMode: nullable(enumeration(["NORMAL_OPERATION", "EVENT"])),
});

/** Export guidance; canonical parseAttributeValue remains the runtime authority. */
export function researchValueContract(attributeKey: string): { valueSchema: Schema; valueRules: string[]; valueExample?: unknown } {
  const field = getAttributeDefinition(attributeKey);
  const allowed = field.allowedValues ?? [];
  const numeric = { ...(field.min !== undefined ? { minimum: field.min } : {}), ...(field.max !== undefined ? { maximum: field.max } : {}) };
  const rules = ["Nur belegte Werte eintragen. Beispiele sind Formatbeispiele, keine Fakten dieses Spots."];
  let schema: Schema;
  let example: unknown;
  switch (field.valueType) {
    case "TEXT": schema = { type: "string", ...(field.min !== undefined ? { minLength: field.min } : {}), ...(field.max !== undefined ? { maxLength: field.max } : {}) }; break;
    case "EMAIL": schema = { type: "string", format: "email", minLength: 3, maxLength: 254 }; break;
    case "URL": schema = { type: "string", format: "uri", pattern: "^https?://", maxLength: 500 }; break;
    case "PHONE": schema = { type: "string", pattern: "^\\+[1-9]\\d{6,14}$" }; break;
    case "COUNTRY_CODE": schema = { type: "string", pattern: "^[A-Z]{2}$" }; break;
    case "IANA_TIMEZONE": schema = { type: "string", minLength: 3, maxLength: 80 }; rules.push("Gültige IANA-Zeitzone; belegter Standort Schweiz (CH) erlaubt Europe/Zurich. Keine feste UTC-Verschiebung und keine Ableitung nur aus einem mehrdeutigen Ortsnamen."); example = "Europe/Zurich"; break;
    case "DECIMAL": schema = { type: "number", ...numeric }; break;
    case "INTEGER": schema = { type: "integer", ...numeric }; break;
    case "BOOLEAN": schema = { type: "boolean" }; break;
    case "ENUM": schema = enumeration(allowed); break;
    case "ENUM_SET": schema = { ...list(enumeration(allowed), allowed.length), uniqueItems: true }; break;
    case "MONEY_RANGE": schema = record({ currency: { type: "string", pattern: "^[A-Z]{3}$" }, min: { type: "number", ...numeric }, max: { type: "number", ...numeric } }); rules.push("min <= max; keine erfundenen Preise."); break;
    case "INTEGER_RANGE": schema = record({ min: { type: "integer", ...numeric }, max: { type: "integer", ...numeric } }); rules.push("min <= max."); break;
    case "WEEKLY_SCHEDULE":
      schema = list(record({ day: enumeration(WEEKDAYS), intervals: list(interval, 8) }), 7);
      rules.push("Jeder Tag höchstens einmal. Fehlender Tag = unbekannt; intervals: [] ausschließlich bei ausdrücklich geschlossenem Tag.", "Uhrzeiten HH:mm. 24:00 als Ende wird 00:00 des Folgetags. Ende vor Beginn bedeutet über Mitternacht; Start und Ende dürfen nicht gleich sein.", "Öffnungszeiten und Küchenzeiten getrennt erfassen. Alle veröffentlichten Tage und Zeitfenster übernehmen.");
      example = [{ day: "MONDAY", intervals: [{ start: "11:30", end: "14:00" }, { start: "18:00", end: "22:00" }] }]; break;
    case "SPECIAL_HOURS":
      schema = list(record({ date: { type: "string", format: "date" }, status: enumeration(["OPEN", "CLOSED"]), intervals: list(interval, 8) }), 366);
      rules.push("Datum YYYY-MM-DD, eindeutig. CLOSED benötigt []; OPEN mindestens ein Intervall. Keine regelmäßigen Wochenzeiten hier eintragen. 24:00 als Ende = 00:00 des Folgetags; Start ungleich Ende.");
      example = [{ date: "2026-12-25", status: "CLOSED", intervals: [] }]; break;
    case "RESERVATION_RULE": schema = record({ mode: enumeration(RESERVATION_MODES), minimumPartySize: nullable({ type: "integer", minimum: 1, maximum: 100000 }), days, fromTime: nullable(time), toTime: nullable(time) }); rules.push("fromTime/toTime beide null oder beide gesetzt. CONDITIONAL benötigt Gruppengröße, Tage oder Zeitfenster."); break;
    case "CONSUMPTION_RULE": schema = record({ policy: enumeration(CONSUMPTION_POLICIES), exceptions: list(text(), 20) }); break;
    case "PET_ACCESS_RULE": schema = record({ indoor: enumeration(PET_ACCESS_STATES), outdoor: enumeration(PET_ACCESS_STATES), assistanceAnimals: enumeration(PET_ACCESS_STATES), notes: nullable(text(500)) }); break;
    case "AGE_ACCESS_RULE": schema = record({ policy: enumeration(["ALL_AGES", "MINIMUM_AGE"]), minimumAge: nullable({ type: "integer", minimum: 0, maximum: 120 }), appliesFromTime: nullable(time) }); rules.push("ALL_AGES benötigt minimumAge und appliesFromTime null. MINIMUM_AGE benötigt minimumAge."); break;
    case "AGE_ACCESS_RULE_V2": schema = record({ rules: { ...list(record({ mode: enumeration(["NO_MINIMUM", "GENERAL_MINIMUM", "UNACCOMPANIED_MINIMUM"]), minimumAge: nullable({ type: "integer", minimum: 0, maximum: 120 }), accompaniment: enumeration(["NONE", "ADULT", "LEGAL_GUARDIAN"]), appliesFromTime: nullable(time), days, area: nullable(text()), event: nullable(text()) }), 12), minItems: 1 }, notes: nullable(text(500)) }); rules.push("NO_MINIMUM: minimumAge=null, accompaniment=NONE. GENERAL_MINIMUM: Alter erforderlich, accompaniment=NONE. UNACCOMPANIED_MINIMUM: Alter und ADULT oder LEGAL_GUARDIAN erforderlich."); break;
    case "ONSITE_OFFERINGS": schema = { ...list(record({ kind: enumeration(allowed), relationship: enumeration(ONSITE_OFFERING_RELATIONSHIPS), area: nullable(text(120)) }), 30), uniqueItems: true }; break;
    case "VISIT_SITUATIONS": case "ATMOSPHERE_CONTEXTS": case "DAYPART_CONTEXTS": {
      const key = field.valueType === "VISIT_SITUATIONS" ? "situation" : field.valueType === "ATMOSPHERE_CONTEXTS" ? "atmosphere" : "daypart";
      schema = { ...list(record({ [key]: enumeration(allowed), conditions: conditions(key !== "daypart") }), 50), uniqueItems: true };
      rules.push("Alle conditions-Schlüssel angeben. Leere Tageslisten/null bedeuten keine Einschränkung der belegten Aussage, keine pauschale Bestätigung. Nur tatsächlich belegte Kontexte erfassen."); break;
    }
    case "CURRENT_STATE": schema = record({ kind: enumeration(allowed), scope: text() }); rules.push("Nicht über diesen Recherche-Import schreibbar: zeitlich begrenzte Zustände benötigen ein Gültigkeitsende im Spot-Editor. Unter unresolved erklären."); break;
  }
  if (attributeKey === "classification.place_types") rules.push("Benötigt eine bestätigte, kompatible classification.primary_category; ungelöste Kategorie zuerst im Import-Review bestätigen.");
  return { valueSchema: schema, valueRules: rules, ...(example === undefined ? {} : { valueExample: example }) };
}
