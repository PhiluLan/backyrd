import { EXPERIENCE_LANGUAGE_CONCEPTS, SPOT_TYPE_CATALOG, WORLD_VALUE_LABELS } from "@backyrd/world-knowledge-core";
import { createHash } from "node:crypto";
import { contentHash, deepFreeze } from "./canonical.js";
import { ContractValidationError, schema, type Infer, type Schema } from "./schema.js";
import {
  LUNA_LIBRARIAN_CATALOG, LUNA_LIBRARIAN_CONTRACT_VERSION, LUNA_LIBRARIAN_FACT_KEYS,
  LUNA_LIBRARIAN_FREEZE, LUNA_LIBRARIAN_MODEL, LUNA_LIBRARIAN_MODEL_SCHEMA,
  LUNA_LIBRARIAN_PROMPT, LUNA_LIBRARIAN_REASONING,
} from "./product-luna-librarian-assets.js";

export { LUNA_LIBRARIAN_CONTRACT_VERSION } from "./product-luna-librarian-assets.js";

const text = schema.string({ min: 1, max: 4096, pattern: /\S/u });
const id = schema.string({ min: 1, max: 128, pattern: /^[A-Za-z][A-Za-z0-9_.:-]*$/ });
const ids = schema.array(id, { max: 128 });
const nullable = <T>(inner: Schema<T>) => schema.union([inner, schema.literal(null)] as const);
const operator = schema.enum(["EQ", "NEQ", "LT", "LTE", "GT", "GTE", "APPROX"] as const);
const orderedOperator = schema.enum(["EQ", "LT", "LTE", "GT", "GTE"] as const);
const modality = schema.enum(["REQUIRED", "PREFERRED", "EXCLUDED", "NOT_REQUIRED", "CONTEXT"] as const);
const basis = schema.enum(["EXPLICIT", "INFERRED"] as const);
const timezone = schema.string({ min: 1, max: 100 });
const amount = schema.number({ min: 0 });
const values = {
  COUNT: schema.object({ amount: schema.number({ integer: true, min: 0 }), operator, unit: schema.enum(["PEOPLE", "ITEMS"] as const) }),
  AGE: schema.object({ amount: schema.number({ integer: true, min: 0, max: 130 }), operator, unit: schema.literal("YEARS") }),
  MONEY: schema.object({ amount, operator, currency: schema.enum(["CHF", "EUR", "USD", "GBP", "UNSPECIFIED"] as const) }),
  DURATION: schema.object({ amount, operator, unit: schema.literal("MINUTES"), measurementScope: schema.enum(["AVAILABLE_TOTAL", "ACTIVITY", "WALKING", "TRAVEL", "VISIT", "UNSPECIFIED"] as const), includes: schema.array(schema.enum(["ACTIVITY", "TRAVEL", "RETURN", "PAUSES", "CHECK_IN", "UNSPECIFIED"] as const), { max: 6 }) }),
  LENGTH: schema.object({ amount, operator, unit: schema.literal("METERS"), referenceEntityId: nullable(id) }),
  DATE: schema.object({ date: schema.string({ pattern: /^\d{4}-\d{2}-\d{2}$/ }), operator: orderedOperator, timezone }),
  CLOCK: schema.object({ time: schema.string({ pattern: /^(?:[01]\d|2[0-3]):[0-5]\d$/ }), operator: schema.enum(["EQ", "LT", "LTE", "GT", "GTE", "APPROX"] as const), timezone }),
  DAY_PHASE: schema.object({ phase: schema.enum(["MORNING", "MIDDAY", "AFTERNOON", "EVENING", "NIGHT"] as const), timezone }),
  BUDGET_SCOPE: schema.object({ scope: schema.enum(["PER_PERSON", "PER_CHILD", "GROUP_TOTAL", "PER_ITEM", "COMPONENT_TOTAL", "UNSPECIFIED"] as const) }),
  TEXT: schema.object({ text }),
} as const;
export type LunaValueKind = keyof typeof values;
export type LunaFactKey = (typeof LUNA_LIBRARIAN_FACT_KEYS)[LunaValueKind][number];
const meta = { id, modality, basis, subjectIds: ids } as const;
type FactMeta = { readonly id: string; readonly modality: Infer<typeof modality>; readonly basis: Infer<typeof basis>; readonly subjectIds: readonly string[] };
export type LunaFact = { [K in LunaValueKind]: FactMeta & {
  readonly key: (typeof LUNA_LIBRARIAN_FACT_KEYS)[K][number]; readonly value: Infer<(typeof values)[K]>;
} }[LunaValueKind];
export type LibrarianFact = { [K in LunaValueKind]: FactMeta & {
  readonly key: (typeof LUNA_LIBRARIAN_FACT_KEYS)[K][number]; readonly value: Infer<(typeof values)[K]> & { readonly kind: K };
} }[LunaValueKind];
const factSchema = schema.union([
  schema.object({ ...meta, key: schema.enum(LUNA_LIBRARIAN_FACT_KEYS.COUNT), value: values.COUNT }),
  schema.object({ ...meta, key: schema.enum(LUNA_LIBRARIAN_FACT_KEYS.AGE), value: values.AGE }),
  schema.object({ ...meta, key: schema.enum(LUNA_LIBRARIAN_FACT_KEYS.MONEY), value: values.MONEY }),
  schema.object({ ...meta, key: schema.enum(LUNA_LIBRARIAN_FACT_KEYS.DURATION), value: values.DURATION }),
  schema.object({ ...meta, key: schema.enum(LUNA_LIBRARIAN_FACT_KEYS.LENGTH), value: values.LENGTH }),
  schema.object({ ...meta, key: schema.enum(LUNA_LIBRARIAN_FACT_KEYS.DATE), value: values.DATE }),
  schema.object({ ...meta, key: schema.enum(LUNA_LIBRARIAN_FACT_KEYS.CLOCK), value: values.CLOCK }),
  schema.object({ ...meta, key: schema.enum(LUNA_LIBRARIAN_FACT_KEYS.DAY_PHASE), value: values.DAY_PHASE }),
  schema.object({ ...meta, key: schema.enum(LUNA_LIBRARIAN_FACT_KEYS.BUDGET_SCOPE), value: values.BUDGET_SCOPE }),
  schema.object({ ...meta, key: schema.enum(LUNA_LIBRARIAN_FACT_KEYS.TEXT), value: values.TEXT }),
] as const);
const entitySchema = schema.object({ id, kind: schema.enum(["PERSON", "GROUP", "ANIMAL", "ACTIVITY", "AREA", "OFFER", "COST_COMPONENT", "PLACE"] as const), label: text, members: ids });
const extensionSchema = schema.object({ ...meta, description: text });
const bindingSchema = schema.object({ kind: schema.enum(["SAME_PLACE", "SIMULTANEOUS", "SEQUENCE"] as const), factIds: schema.array(id, { min: 2, max: 128 }) });
const uncertaintySchema = schema.object({ description: text, relatedIds: ids });
const conditionSchema = schema.object({ id, basis, subjectIds: ids, state: schema.enum(["RAIN", "DRY", "SNOW", "SUITABLE", "UNSUITABLE", "OTHER"] as const), detail: nullable(text) });
export type LunaEntity = Infer<typeof entitySchema>;
export type LunaExtension = Infer<typeof extensionSchema>;
export type LunaBinding = Infer<typeof bindingSchema>;
export type LunaWeatherCondition = Infer<typeof conditionSchema>;
export type LunaExpression =
  | { readonly kind: "FACT"; readonly factId: string }
  | { readonly kind: "ALL"; readonly children: readonly LunaExpression[] }
  | { readonly kind: "ANY"; readonly strength: "REQUIRED" | "PREFERRED"; readonly children: readonly LunaExpression[] }
  | { readonly kind: "IF"; readonly conditionFactId: string; readonly then: LunaExpression; readonly else: LunaExpression | null }
  | { readonly kind: "FALLBACK"; readonly options: readonly LunaExpression[] };

function expression(value: unknown, path = "$.logic", depth = 0): LunaExpression {
  if (depth > 24) throw new ContractValidationError(path, "maximum expression depth exceeded");
  const next: Schema<LunaExpression> = { parse: (entry, entryPath) => expression(entry, entryPath, depth + 1) };
  return schema.union([
    schema.object({ kind: schema.literal("FACT"), factId: id }),
    schema.object({ kind: schema.literal("ALL"), children: schema.array(next, { min: 1, max: 256 }) }),
    schema.object({ kind: schema.literal("ANY"), strength: schema.enum(["REQUIRED", "PREFERRED"] as const), children: schema.array(next, { min: 2, max: 256 }) }),
    schema.object({ kind: schema.literal("IF"), conditionFactId: id, then: next, else: nullable(next) }),
    schema.object({ kind: schema.literal("FALLBACK"), options: schema.array(next, { min: 2, max: 256 }) }),
  ] as const).parse(value, path);
}
const wireSchema = schema.object({
  entities: schema.array(entitySchema, { max: 128 }), facts: schema.array(factSchema, { max: 256 }),
  logic: nullable<LunaExpression>({ parse: expression }), bindings: schema.array(bindingSchema, { max: 128 }),
  extensions: schema.array(extensionSchema, { max: 128 }), uncertainties: schema.array(uncertaintySchema, { max: 128 }),
  weatherConditions: schema.array(conditionSchema, { max: 128 }),
});
export type LunaMeaningOutput = Infer<typeof wireSchema>;
export type LibrarianReference = { readonly now: string; readonly timezone: "Europe/Zurich" };
const referenceSchema = schema.object({ now: schema.string({ min: 20, max: 40, pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/ }), timezone: schema.literal("Europe/Zurich") });
const sourceSchema = schema.object({ sourceText: schema.string({ min: 1, max: 8000, pattern: /\S/u }), reference: referenceSchema });
const keyKinds = new Map<LunaFactKey, LunaValueKind>();
for (const kind of Object.keys(values) as LunaValueKind[]) for (const key of LUNA_LIBRARIAN_FACT_KEYS[kind]) keyKinds.set(key, kind);

export class LibrarianContractError extends Error {
  constructor(readonly code: string, readonly path: string = "$") {
    // IDs, user text and provider payloads never enter the error message.
    super(`librarian_contract_${code}:${path}`); this.name = "LibrarianContractError";
  }
}
function fail(code: string, path = "$"): never { throw new LibrarianContractError(code, path); }
const unique = (entries: readonly string[], path: string): void => { if (new Set(entries).size !== entries.length) fail("duplicate_reference", path); };
function dateValid(date: string): boolean {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
function checkTimezone(value: string, path: string): void {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); } catch { fail("timezone_invalid", path); }
}
function source(input: unknown): Infer<typeof sourceSchema> {
  const parsed = sourceSchema.parse(input);
  if (!Number.isFinite(Date.parse(parsed.reference.now)) || !dateValid(parsed.reference.now.slice(0, 10))) fail("reference_invalid");
  return parsed;
}

/** Structural validation only. It deliberately cannot prove semantic fidelity
 * to the original prose. Never infer a missing fact or repair an output here. */
function preflight(input: unknown): void {
  let nodes = 0; let characters = 0;
  const active = new Set<object>();
  const walk = (value: unknown, depth: number): void => {
    if (++nodes > 12_000 || depth > 64) fail("payload_limit");
    if (typeof value === "string") { characters += value.length; if (characters > 65_536) fail("payload_limit"); return; }
    if (value === null || typeof value === "boolean") return;
    if (typeof value === "number") { if (!Number.isFinite(value)) fail("non_json_payload"); return; }
    if (typeof value !== "object") fail("non_json_payload");
    if (active.has(value)) fail("cyclic_payload");
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)) fail("non_json_payload");
    active.add(value);
    for (const item of Array.isArray(value) ? value : Object.values(value)) walk(item, depth + 1);
    active.delete(value);
  };
  walk(input, 0);
}
export function parseLunaMeaningOutput(input: unknown): Readonly<LunaMeaningOutput> {
  preflight(input);
  const output = wireSchema.parse(input);
  if (!output.facts.length && !output.extensions.length) fail("empty_meaning");
  const all = [...output.entities, ...output.facts, ...output.extensions, ...output.weatherConditions];
  if (new Set(all.map(row => row.id)).size !== all.length) fail("duplicate_id");
  const entities = new Map(output.entities.map(row => [row.id, row]));
  const facts = new Map([...output.facts, ...output.extensions].map(row => [row.id, row]));
  const conditions = new Map(output.weatherConditions.map(row => [row.id, row]));
  const known = new Set(all.map(row => row.id));
  const entityRefs = (refs: readonly string[], path: string) => {
    unique(refs, path); if (refs.some(ref => !entities.has(ref))) fail("unknown_entity", path);
  };
  output.entities.forEach((row, i) => {
    entityRefs(row.members, `$.entities[${i}].members`);
    if (row.members.length && row.kind !== "GROUP") fail("non_group_members", `$.entities[${i}]`);
  });
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (entityId: string, depth: number): void => {
    if (depth > 128 || visiting.has(entityId)) fail("group_cycle");
    if (visited.has(entityId)) return;
    visiting.add(entityId);
    for (const member of entities.get(entityId)!.members) visit(member, depth + 1);
    visiting.delete(entityId); visited.add(entityId);
  };
  for (const entityId of entities.keys()) visit(entityId, 0);
  [...output.facts, ...output.extensions, ...output.weatherConditions].forEach((row, i) => entityRefs(row.subjectIds, `$.scopes[${i}]`));
  output.facts.forEach((fact, i) => {
    const path = `$.facts[${i}].value`;
    const kind = keyKinds.get(fact.key)!;
    if (kind === "LENGTH") {
      const value = fact.value as Infer<typeof values.LENGTH>;
      if (value.referenceEntityId !== null && !entities.has(value.referenceEntityId)) fail("unknown_distance_reference", path);
    }
    if (kind === "DATE" && !dateValid((fact.value as Infer<typeof values.DATE>).date)) fail("date_invalid", path);
    if (["DATE", "CLOCK", "DAY_PHASE"].includes(kind)) checkTimezone((fact.value as { readonly timezone: string }).timezone, path);
    if (fact.key === "people.count" && fact.value.unit !== "PEOPLE" || fact.key === "offer.quantity" && fact.value.unit !== "ITEMS" || fact.key === "offer.capacity" && fact.value.unit !== "PEOPLE") fail("count_unit_invalid", path);
    if (kind === "DURATION") unique((fact.value as Infer<typeof values.DURATION>).includes, path);
  });
  let nodes = 0;
  const usedConditions = new Set<string>();
  function references(node: LunaExpression): Set<string> {
    if (++nodes > 1024) fail("expression_nodes_exceeded");
    if (node.kind === "FACT") { if (!facts.has(node.factId)) fail("unknown_fact"); return new Set([node.factId]); }
    if (node.kind === "IF") {
      // Existing non-weather CONTEXT facts may be explicit conditions too.
      const condition = conditions.get(node.conditionFactId) ?? facts.get(node.conditionFactId);
      if (!condition || "modality" in condition && condition.modality !== "CONTEXT") fail("condition_invalid");
      usedConditions.add(node.conditionFactId);
      const thenRefs = references(node.then); const elseRefs = node.else ? references(node.else) : new Set<string>();
      if (thenRefs.has(node.conditionFactId) || elseRefs.has(node.conditionFactId)) fail("condition_self_reference");
      if (node.else && contentHash(node.then) === contentHash(node.else)) fail("identical_condition_branches");
      return new Set([node.conditionFactId, ...thenRefs, ...elseRefs]);
    }
    const children = node.kind === "FALLBACK" ? node.options : node.children;
    return new Set(children.flatMap(child => [...references(child)]));
  }
  if (output.logic) references(output.logic);
  if (output.weatherConditions.some(condition => !usedConditions.has(condition.id))) fail("condition_unbound");
  output.bindings.forEach((binding, i) => {
    unique(binding.factIds, `$.bindings[${i}]`);
    if (binding.factIds.some(ref => !facts.has(ref))) fail("binding_reference_invalid", `$.bindings[${i}]`);
  });
  output.uncertainties.forEach((row, i) => {
    unique(row.relatedIds, `$.uncertainties[${i}]`);
    if (row.relatedIds.some(ref => !known.has(ref))) fail("uncertainty_reference_invalid", `$.uncertainties[${i}]`);
  });
  return deepFreeze(output);
}

/** Versioned clarification of executable duties versus visit context. The
 * frozen schema, catalog, model and original prompt remain intact. */
export const LUNA_LIBRARIAN_PROMPT_REVISION = "backyrd.luna-prompt@7" as const;
const activePrompt = LUNA_LIBRARIAN_PROMPT + "\nAUSFÜHRBARER AUFTRAG:\n"
  + "Eigenständig prüfbare Tätigkeiten getrennt als experience.activity ausgeben. Echte gemeinsame Pflichten bleiben REQUIRED, Alternativen ANY. Ein gewünschtes Erleben oder allgemeiner Besuchszweck ist keine zusätzliche Leistung: bloßes Geniessen, Zeit verbringen oder einen schönen Abend haben als experience.purpose CONTEXT erhalten. Konkrete Eigenschaften wie romantisch, ruhig oder am Rhein bleiben eigenständige verbindliche Fakten; keine davon abschwächen. Konkrete Tätigkeiten wie Tanzen, Klettern oder Lernen bleiben prüfbar und dürfen nicht in CONTEXT verschwinden. Eine reine Zweckanfrage ohne konkrete Tätigkeit nicht durch eine erfundene Aktivität ersetzen.\n"
  + "Begleitung ausschließlich people.relationship CONTEXT, Alter einer mitkommenden Person immer als people.age CONTEXT mit genau ihrem PERSON-Bezug, niemals EXCLUDED, PREFERRED oder NOT_REQUIRED; ein Ausschlusswort für Angebote gilt nicht für ihr Alter. Auch Kinderalter ist Besuchskontext, kein Ausschluss dieser Person. participation.partner bezeichnet eine Anforderung an die Durchführungsform (z.B. ohne eigenen Spielpartner teilnehmen), niemals mitgebrachte Freunde, Kinder oder Ehepartner. Keine Personengruppe mit unvollständiger Mitgliederliste als vollständige Gruppe darstellen: bei nur einer benannten Begleitperson genügt ihre PERSON-Entity, Beziehung global. Gruppenmitglieder sind keine automatisch vollständige Personenzahl. Tätigkeits-Entities sind keine Personen; Alters- und Tätigkeitsfakten über subjectIds gezielt zuordnen, wenn unterschiedliche Personen unterschiedliche Leistungen nutzen.\n"
  + "Innen-/Außen-Nutzung unter offer.area. Einen benannten Fluss oder See nur unter location.waterbody, Aussicht separat unter location.view, eine andere Lageart unter location.setting. Dieselbe räumliche Bedeutung nicht zusätzlich als freie Lagephrase wiederholen; am Rhein verlangt das Gewässer Rhein, keine weitere gleichbedeutende Angebotsleistung. Tagesphase bleibt ohne Datum offen; aus einer Mahlzeit niemals einen Kalendertag ableiten. food.meal und experience.activity müssen dieselbe Mahlzeit bezeichnen. Für bekannte Begriffe die nachstehenden gemeinsamen text-Werte verwenden, sofern bedeutungsgleich; unbekannte Inhalte frei erhalten, niemals auf einen ähnlichen bekannten Begriff zwingen. Keine Tätigkeit, Eigenschaft, Uhrzeit oder Zahl ergänzen.\nGEMEINSAME BEGRIFFE (Wert=Bedeutung): "
  + EXPERIENCE_LANGUAGE_CONCEPTS.map(concept => `${concept.id}=${concept.labels[0]}`).join("; ")
  + "\nORTSTYPEN (offer.kind; spezifischen gewünschten Typ erhalten, keinen Obertyp zusätzlich verlangen): "
  + SPOT_TYPE_CATALOG.map(type => `${type.kind}=${type.label}`).join("; ")
  + "\nSPEISEN/GETRÄNKE (food.dish/food.drink, nur den benannten Gegenstand als text): "
  + Object.entries(WORLD_VALUE_LABELS).map(([token, label]) => `${token}=${label}`).join("; ")
  + "\nÜBERGABE: Bei bekannten Katalogbegriffen ist text exakt die angegebene ID (linke Seite), auch bei anderssprachiger Eingabe; etwa WINE_BAR statt Weinbar/wine bar, WINE statt Wein. Nur nicht vorhandene Begriffe frei erhalten. Konsumhandlung und Gegenstand trennen: Wein trinken / ein Glas Wein => experience.activity text=drinks und food.drink text=WINE; Bier trinken => drinks und BEER. Mengen nur bei ausdrücklich numerischer Vorgabe separat erhalten. Daraus keinen gewünschten Ortstyp erfinden. Ein ausdrücklich benannter Ortstyp ist dagegen offer.kind, keine zusätzliche unprüfbare Besuchstätigkeit: Weinbar besuchen => offer.kind text=WINE_BAR, nicht bar, nicht experience.activity Weinbar besuchen. Diese Regel gilt für sämtliche spezifischen Ortstypen. Keine Speise oder Getränkesorte nur aus dem Ortstyp ergänzen.\n"
  + "ANLASS UND BESUCH: Ein Date, Geburtstag oder Treffen beschreibt unter experience.occasion den CONTEXT, solange keine organisierte Leistung verlangt wird. Eine Geburtstagsfeier buchen oder einen Raum für eine Feier mieten bleibt dagegen eine konkrete REQUIRED Leistung. Eigenschaften wie gemütlich, ruhig oder gut unterhalten können bleiben unabhängig davon REQUIRED; den Anlass niemals als Ersatz dafür verwenden. Unspezifische Besuchsverben wie besuchen, stöbern oder durch eine Ausstellung schlendern erzeugen keine zusätzliche Bewegungs- oder Gehpflicht. Die konkrete Ausstellung, Marktart oder Leistung bleibt vollständig erhalten. Ausdrücklich gewünschtes Wandern, Spazieren oder Joggen bleibt eine eigenständige Tätigkeit.\n"
  + "PERSÖNLICHE VORAUSSETZUNGEN: people.mobility_aid, people.capability und people.experience beschreiben ausschliesslich Personen und bleiben CONTEXT. Daraus notwendige Anforderungen separat erhalten: Wer einen Rollstuhl nutzt und einen Ort sucht, braucht participation.accessibility text=rollstuhlgängig REQUIRED (basis INFERRED), zusätzlich zum unveränderten konkreten Erlebnis. Den Rollstuhl selbst niemals als REQUIRED Eigenschaft eines Ortes behandeln. Persönlicher Kontext ersetzt niemals die daraus notwendige Zugangsprüfung.\n"
  + "ERLEBNIS UND ZUGANG: Eine Unternehmung mit Kindern verlangt ein passendes Kindererlebnis (condition.children text=children_activity REQUIRED), nicht bloss eine familienfreundliche Gastronomie. Kinderzahl und gesamte Gruppenzahl unterscheiden: zwei Kinder sind nicht automatisch eine Gruppe von zwei Personen. Explizite vollständige Gruppengrösse als people.count REQUIRED mit GROUP-Bezug erhalten; das ist eine Kapazitätsanforderung, keine Aussage über freie Buchungstermine. Unvollständige Teilgruppen bleiben CONTEXT. Live-Jazz als live_jazz REQUIRED erhalten: Jazz allein und allgemeine Live-Musik ersetzen diesen Wunsch nicht. Spontaner Besuch ohne Buchung als participation.booking text=spontaneous REQUIRED; ohne Hotelübernachtung verlangt participation.permission text=public_day_access REQUIRED. Diese Wünsche nicht als NOT_REQUIRED verlieren. Gratis, kostenlos und free sind budget.maximum MONEY amount=0 operator=LTE; möglichst oder bevorzugt kostenlos bleibt PREFERRED, ohne diese Einschränkung REQUIRED. Ohne ausdrücklich genannte Währung currency=UNSPECIFIED, niemals eine Währung aus dem Ort ergänzen; kein Ausschluss einer unspezifischen Kostenvokabel. Preisbasis und Kostenumfang nur bei ausdrücklicher Nennung ergänzen.\n"
  + "KALENDER: calendar wird serverseitig aus reference.now in reference.timezone berechnet. today und tomorrow sind lokale Kalendertage, niemals das UTC-Datum abschneiden. Relative Tage und eindeutig bevorstehende Wochentage als time.date normalisieren; calendar.days enthält heute und die folgenden 13 lokalen Tage. Bei heute passender künftiger Tagesphase bleibt der Wochentag heute. Ohne Datumswunsch kein Datum ergänzen. Beispiele sind Übersetzungsmuster, keine zusätzlichen Wünsche.\nABSCHLIESSENDE PRÄZISION: Spezifische Mahlzeiten niemals zu meal verallgemeinern: Mittagessen => lunch, Abendessen => dinner, Frühstück => breakfast (jeweils experience.activity und food.meal, soweit beide ausgegeben werden). Ein Mahlzeitname allein erzeugt keine zusätzliche Tagesphase, kein Datum und keine Uhrzeit. Ein ausdrücklich verlangter Zielort (in Basel, in Zürich) bleibt location.destination REQUIRED, niemals CONTEXT. Kanonische Werte dürfen weder Genauigkeit noch Verbindlichkeit reduzieren oder einen allgemeineren Wunsch verengen: Klettern => climbing, nur ausdrücklich Bouldern => bouldering. Die gerichtete Beziehung Bouldern erfüllt Klettern wird erst beim Spotabgleich geprüft; sie ist keine Synonymie. Atmosphäre (etwa romantisch => romantic) gehört ausschließlich unter atmosphere.character, nicht experience.character.";
export const LUNA_LIBRARIAN_CONFIGURATION = deepFreeze({
  contractVersion: LUNA_LIBRARIAN_CONTRACT_VERSION, model: LUNA_LIBRARIAN_MODEL,
  reasoningEffort: LUNA_LIBRARIAN_REASONING, store: false, maxOutputTokens: 7500,
  basePromptHash: contentHash(LUNA_LIBRARIAN_PROMPT), promptRevision: LUNA_LIBRARIAN_PROMPT_REVISION, promptHash: contentHash(activePrompt), schemaHash: contentHash(LUNA_LIBRARIAN_MODEL_SCHEMA),
  catalogHash: contentHash(LUNA_LIBRARIAN_CATALOG), sourceFreeze: LUNA_LIBRARIAN_FREEZE,
});
/** Body only: credentials, transport, authentication and rate limits belong to
 * the existing server orchestration. No client SDK or second model call. */
function localCalendar(reference: LibrarianReference) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: reference.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(reference.now));
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  // Advance calendar dates at UTC noon, not elapsed local hours across DST.
  const days = Array.from({ length: 14 }, (_, offset) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return { date: date.toISOString().slice(0, 10), weekday: new Intl.DateTimeFormat("de-CH", { timeZone: "UTC", weekday: "long" }).format(date) };
  });
  return { today, tomorrow: days[1]!.date, localTime: `${part("hour")}:${part("minute")}`, days };
}
export function buildLunaLibrarianModelRequest(input: { readonly sourceText: string; readonly reference: LibrarianReference; readonly explicitContext?: unknown }) {
  const parsed = source({ sourceText: input.sourceText, reference: input.reference });
  return deepFreeze({ model: LUNA_LIBRARIAN_MODEL, reasoning: { effort: LUNA_LIBRARIAN_REASONING }, store: false,
    max_output_tokens: 7500, instructions: activePrompt,
    input: JSON.stringify({ request: parsed.sourceText, reference: parsed.reference, calendar: localCalendar(parsed.reference), ...(input.explicitContext === undefined ? {} : { explicitContext: input.explicitContext }) }),
    text: { format: { type: "json_schema", name: "backyrd_luna_meaning_v7", strict: true, schema: LUNA_LIBRARIAN_MODEL_SCHEMA } },
  });
}
export type LibrarianDiagnostic = {
  readonly code: "CROSS_BRANCH_BINDING" | "DISTANCE_ENDPOINTS_UNRESOLVED" | "UNUSED_ENTITY" | "MODEL_UNCERTAINTY";
  readonly relatedIds: readonly string[];
};
export type LibrarianRequest = {
  readonly contractVersion: typeof LUNA_LIBRARIAN_CONTRACT_VERSION;
  readonly configuration: typeof LUNA_LIBRARIAN_CONFIGURATION;
  /** Private request-local data; never serialize into public responses/cache. */
  readonly source: { readonly sourceText: string; readonly reference: LibrarianReference };
  readonly raw: LunaMeaningOutput;
  readonly facts: readonly LibrarianFact[];
  readonly entities: readonly LunaEntity[];
  readonly weatherConditions: readonly LunaWeatherCondition[];
  readonly extensions: readonly LunaExtension[];
  readonly bindings: readonly LunaBinding[];
  readonly logic: LunaExpression;
  readonly diagnostics: readonly LibrarianDiagnostic[];
  readonly sourceTextHash: string;
  readonly requestHash: string;
};

/** The only compilation is fixed type tagging and implicit global ALL. All
 * amounts, roles, polarities, scopes, text values and branches are unchanged. */
export function prepareLibrarianRequest(input: {
  readonly contractVersion: string; readonly output: unknown;
  readonly sourceText: string; readonly reference: LibrarianReference;
}): Readonly<LibrarianRequest> {
  if (input.contractVersion !== LUNA_LIBRARIAN_CONTRACT_VERSION) fail("version_mismatch");
  const original = source({ sourceText: input.sourceText, reference: input.reference });
  const raw = parseLunaMeaningOutput(input.output);
  const references = new Set<string>();
  const paths = new Map<string, Set<string>>();
  const walk = (node: LunaExpression, branch: string): void => {
    if (node.kind === "FACT") { references.add(node.factId); paths.set(node.factId, new Set([...(paths.get(node.factId) ?? []), branch])); return; }
    if (node.kind === "IF") {
      references.add(node.conditionFactId); walk(node.then, `${branch}/if:${node.conditionFactId}:then`);
      if (node.else) walk(node.else, `${branch}/if:${node.conditionFactId}:else`); return;
    }
    const children = node.kind === "FALLBACK" ? node.options : node.children;
    children.forEach((child, index) => walk(child, node.kind === "ALL" ? branch : `${branch}/${node.kind}:${index}`));
  };
  if (raw.logic) walk(raw.logic, "root");
  const global = [...raw.facts, ...raw.extensions].filter(fact => fact.modality !== "CONTEXT" && !references.has(fact.id)).map(fact => ({ kind: "FACT" as const, factId: fact.id }));
  const children = [...global, ...(raw.logic ? [raw.logic] : [])];
  // Empty executable requests are rejected rather than matching every spot.
  if (!children.length) fail("empty_instructions");
  const logic: LunaExpression = children.length === 1 ? children[0]! : { kind: "ALL", children };
  const facts = raw.facts.map(fact => ({ ...fact, value: { ...fact.value, kind: keyKinds.get(fact.key)! } }) as LibrarianFact);
  const diagnostics: LibrarianDiagnostic[] = raw.bindings.flatMap(binding => {
    const branches = new Set(binding.factIds.flatMap(ref => [...(paths.get(ref) ?? [])]));
    return branches.size > 1 ? [{ code: "CROSS_BRANCH_BINDING" as const, relatedIds: binding.factIds }] : [];
  });
  for (const fact of raw.facts) if (fact.key === "location.distance" && (fact.value.referenceEntityId === null || !fact.subjectIds.length)) diagnostics.push({ code: "DISTANCE_ENDPOINTS_UNRESOLVED", relatedIds: [fact.id] });
  const referencedEntities = new Set([
    ...raw.entities.flatMap(entity => entity.members), ...raw.facts.flatMap(fact => fact.subjectIds),
    ...raw.extensions.flatMap(fact => fact.subjectIds), ...raw.weatherConditions.flatMap(condition => condition.subjectIds),
    ...raw.facts.flatMap(fact => fact.key === "location.distance" || fact.key === "route.length" || fact.key === "offer.dimension" ? fact.value.referenceEntityId ? [fact.value.referenceEntityId] : [] : []),
  ]);
  for (const entity of raw.entities) if (!referencedEntities.has(entity.id)) diagnostics.push({ code: "UNUSED_ENTITY", relatedIds: [entity.id] });
  for (const uncertainty of raw.uncertainties) diagnostics.push({ code: "MODEL_UNCERTAINTY", relatedIds: uncertainty.relatedIds });
  const body = { contractVersion: LUNA_LIBRARIAN_CONTRACT_VERSION, configuration: LUNA_LIBRARIAN_CONFIGURATION,
    source: original, raw, facts, entities: raw.entities, weatherConditions: raw.weatherConditions,
    extensions: raw.extensions, bindings: raw.bindings, logic, diagnostics,
    sourceTextHash: createHash("sha256").update(original.sourceText, "utf8").digest("hex") };
  return deepFreeze({ ...body, requestHash: contentHash(body) });
}
