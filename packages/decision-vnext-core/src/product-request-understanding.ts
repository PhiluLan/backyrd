import { PRODUCT_V1_INTENT_IDS, type ProductV1Intent } from "./product-intent-ids.js";
import { isPublicMunicipality } from "./product-public-municipalities.js";
import { accessibilityRequestScope } from "./product-request-context.js";
import { contentHash, deepFreeze } from "./canonical.js";
import { schema, type Infer } from "./schema.js";
import type { DecisionProductRequest } from "./product-v1-contracts.js";
import { PRODUCT_QUERY_CATALOG, validWorldPreference } from "./product-query-semantics.js";

export const PRODUCT_UNDERSTANDING_VERSION = "backyrd.decision-vnext.request-understanding@1.2" as const;
export const PRODUCT_UNDERSTANDING_POLICY = "request-understanding-policy-v25" as const;
const nullable = <T>(value: import("./schema.js").Schema<T>) => schema.union([value, schema.literal(null)] as const);
const ageValue = schema.object({ kind: schema.literal("AGE"), minimumAge: schema.number({ integer: true, min: 0, max: 120 }) });
const companyValue = schema.object({ kind: schema.literal("COMPANY"), size: nullable(schema.number({ integer: true, min: 1, max: 100 })), adultPresent: nullable(schema.boolean()), companionType: nullable(schema.enum(["ALONE", "FRIENDS_GROUP", "FAMILY", "DATE_PAIR", "BUSINESS", "CELEBRATION", "CONVERSATION"] as const)) });
export const REQUEST_NEED_CODES = ["HALAL", "DAIRY_FREE", "LACTOSE_FREE", "VEGAN", "VEGETARIAN", "ALCOHOL_FREE", "DOG_ACCESS", "STEP_FREE_ENTRANCE", "STEP_FREE_ROUTE", "CHANGING_TABLE", "GUIDED_TOUR", "BOAT_RIDE", "RIVERSIDE_WALK", "POTTERY", "DANCING", "SEATING"] as const;
// One meaning has one owning dimension at both provider and cache boundaries.
const needDimension: Readonly<Record<(typeof REQUEST_NEED_CODES)[number], "ACCESS" | "OFFERING" | "EXPERIENCE">> = {
  HALAL: "OFFERING", DAIRY_FREE: "OFFERING", LACTOSE_FREE: "OFFERING", VEGAN: "OFFERING", VEGETARIAN: "OFFERING", ALCOHOL_FREE: "OFFERING",
  DOG_ACCESS: "ACCESS", STEP_FREE_ENTRANCE: "ACCESS", STEP_FREE_ROUTE: "ACCESS", CHANGING_TABLE: "ACCESS", SEATING: "ACCESS",
  GUIDED_TOUR: "EXPERIENCE", BOAT_RIDE: "EXPERIENCE", RIVERSIDE_WALK: "EXPERIENCE", POTTERY: "EXPERIENCE", DANCING: "EXPERIENCE",
};
const priceComponents = ["TIP", "MATERIALS", "TRANSPORT", "ADMISSION", "FOOD", "DRINKS"] as const;
const eventNames = ["CHECK_IN", "WORK_END", "FILM_START", "MEAL_END"] as const;
export const requestedPlaceName = schema.string({ min: 1, max: 80, pattern: /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .’'()&/\-]*$/u });
const placeReference = schema.object({ referenceHash: schema.string({ pattern: /^[0-9a-f]{64}$/ }), kind: schema.enum(["RAIL_STATION", "CINEMA", "UNRESOLVED_PLACE"] as const), city: nullable(requestedPlaceName), relation: schema.enum(["NEAR", "RETURN_TO", "AT"] as const) });
const eventReference = schema.object({ event: schema.enum(eventNames), relation: schema.enum(["AFTER", "BEFORE"] as const),
  clockTime: schema.optional(schema.string({ pattern: /^(?:[01]\d|2[0-3]):[0-5]\d$/ })),
  dayPhase: schema.optional(schema.enum(["MORNING", "MIDDAY", "AFTERNOON", "EVENING", "NIGHT"] as const)),
  phasePosition: schema.optional(schema.enum(["EARLY", "LATE"] as const)),
});
const needValue = schema.object({ kind: schema.literal("NEED"), code: schema.enum(REQUEST_NEED_CODES), scope: schema.enum(["ONE_PERSON", "GROUP", "UNSPECIFIED"] as const), accessArea: schema.optional(schema.enum(["OUTDOOR_ONLY_ACCEPTABLE"] as const)) });
const durationValue = schema.object({ kind: schema.literal("DURATION"), minutes: nullable(schema.number({ integer: true, min: 1, max: 1440 })), length: nullable(schema.enum(["SHORT", "MEDIUM", "LONG"] as const)) });
const budgetValue = schema.object({ kind: schema.literal("BUDGET"), amountMinor: schema.number({ integer: true, min: 0, max: 10_000_000 }), currency: schema.enum(["CHF", "EUR", "USD", "GBP", "UNSPECIFIED"] as const), comparison: schema.enum(["LT", "LTE"] as const), basis: schema.enum(["PER_PERSON", "TOTAL", "UNSPECIFIED"] as const), includes: schema.optional(schema.array(schema.enum(priceComponents), { max: 6 })) });
const timeValue = schema.object({ kind: schema.literal("TIME"), openNow: schema.boolean(), localDate: nullable(schema.string({ pattern: /^\d{4}-\d{2}-\d{2}$/ })), relativeDays: nullable(schema.number({ integer: true, min: 0, max: 366 })), weekday: nullable(schema.number({ integer: true, min: 0, max: 6 })), dayPhase: nullable(schema.enum(["MORNING", "MIDDAY", "AFTERNOON", "EVENING", "NIGHT"] as const)), clockTime: nullable(schema.string({ pattern: /^(?:[01]\d|2[0-3]):[0-5]\d$/ })), monthDay: schema.optional(schema.string({ pattern: /^\d{2}-\d{2}$/ })), clockRelation: schema.optional(schema.enum(["AT", "AFTER", "BEFORE", "START_NOT_BEFORE", "END_NOT_AFTER"] as const)), event: schema.optional(eventReference), reference: schema.optional(placeReference), phasePosition: schema.optional(schema.enum(["EARLY", "LATE"] as const)) });
const locationValue = schema.object({ kind: schema.literal("LOCATION"), city: nullable(requestedPlaceName), role: schema.optional(schema.enum(["DESTINATION", "ORIGIN", "REFERENCE"] as const)), cityHash: schema.optional(schema.string({ pattern: /^[0-9a-f]{64}$/ })), reference: schema.optional(placeReference) });
const mobilityValue = schema.object({ kind: schema.literal("MOBILITY"), maximumMeters: nullable(schema.number({ integer: true, min: 1, max: 1_000_000 })), maximumMinutes: nullable(schema.number({ integer: true, min: 1, max: 1440 })), mode: schema.enum(["WALK", "BIKE", "TRANSIT", "CAR", "UNSPECIFIED"] as const), reference: schema.optional(placeReference) });
const facetValue = schema.object({ kind: schema.literal("FACET"), key: schema.string({ min: 1, max: 80 }), value: schema.string({ min: 1, max: 80 }) });
const waitingValue = schema.object({ kind: schema.literal("WAITING"), maximumMinutes: schema.number({ integer: true, min: 0, max: 1440 }), comparison: schema.enum(["LT", "LTE"] as const) });
const settingValue = schema.object({ kind: schema.literal("SETTING"), environment: schema.enum(["INDOOR", "OUTDOOR", "COVERED_OUTDOOR"] as const) });
const valueSchema = schema.union([ageValue, companyValue, budgetValue, timeValue, locationValue, mobilityValue, facetValue, waitingValue, settingValue, needValue, durationValue] as const);
export const productRequirementSchema = schema.object({
  dimension: schema.enum(["EXPERIENCE", "ATMOSPHERE", "COMPANY", "AGE", "TIME", "LOCATION", "MOBILITY", "BUDGET", "ACCESS", "OFFERING", "OTHER", "WAITING", "SETTING", "DURATION", "AMENITY"] as const),
  importance: schema.enum(["HARD", "ESSENTIAL", "PREFERRED"] as const), operator: schema.enum(["REQUIRE", "EXCLUDE", "ALLOW"] as const),
  origin: schema.enum(["EXPLICIT", "INFERRED"] as const), interpretationState: schema.enum(["UNDERSTOOD", "AMBIGUOUS", "UNSUPPORTED"] as const),
  value: nullable(valueSchema), alternatives: schema.array(valueSchema, { max: 3 }),
  group: nullable(schema.string({ pattern: /^R[1-9][0-9]?$/ })), condition: schema.optional(schema.enum(["RAIN", "DRY"] as const)),
});
export type ProductRequirement = Infer<typeof productRequirementSchema>;
export type ProductBudgetRequirement = Infer<typeof budgetValue>;
export type ProductTimeRequirement = Infer<typeof timeValue>;
export type ProductVisitAlternative = { readonly id: string; readonly intent: ProductV1Intent; readonly preferred: boolean; readonly requirements: readonly ProductRequirement[]; readonly unresolved: boolean };
export type ProductUnderstanding = {
  readonly contractVersion: typeof PRODUCT_UNDERSTANDING_VERSION; readonly policyVersion: typeof PRODUCT_UNDERSTANDING_POLICY;
  readonly requestHash: string; readonly requirements: readonly ProductRequirement[]; readonly understandingHash: string; readonly interpretationSource?: "MEANING_PLAN"; readonly knownAgesPartial?: true; readonly visitAlternatives?: readonly ProductVisitAlternative[];
};
export type ProductInterpretation = { readonly request: DecisionProductRequest; readonly understanding: ProductUnderstanding | null };
const facetDimensions: Readonly<Record<string, readonly string[]>> = {
  EXPERIENCE: ["classification.", "purpose."], ATMOSPHERE: ["context.atmosphere"], OFFERING: ["offering."], AMENITY: ["amenity."], BUDGET: ["operation.price_level"],
};
function validateRequirement(input: unknown): ProductRequirement {
  const row = productRequirementSchema.parse(input);
  if (row.interpretationState === "UNDERSTOOD" ? row.value === null || row.alternatives.length > 0
    : row.value !== null || (row.interpretationState === "AMBIGUOUS" ? row.alternatives.length < 2 : row.alternatives.length > 0)) throw new Error("product_understanding_state_invalid");
  if (row.operator === "ALLOW" && row.importance !== "PREFERRED") throw new Error("product_understanding_allow_strength_invalid");
  for (const value of [...(row.value ? [row.value] : []), ...row.alternatives]) {
    if (value.kind === "FACET") {
      if (!facetDimensions[row.dimension]?.some(prefix => value.key.startsWith(prefix)) || !validWorldPreference(value.key, value.value)) throw new Error("product_understanding_facet_invalid");
    } else if (value.kind === "NEED") {
      if (value.accessArea && value.code !== "DOG_ACCESS") throw new Error("product_understanding_access_area_invalid");
      if (needDimension[value.code] !== row.dimension) throw new Error("product_understanding_need_dimension_invalid");
    } else if (value.kind !== row.dimension) throw new Error("product_understanding_dimension_invalid");
    if (value.kind === "MOBILITY" && value.maximumMeters === null && value.maximumMinutes === null && value.mode === "UNSPECIFIED") throw new Error("product_understanding_mobility_empty");
    if (value.kind === "DURATION" && (value.minutes === null) === (value.length === null)) throw new Error("product_understanding_duration_invalid");
    if (value.kind === "LOCATION" && (value.city === "UNSUPPORTED_CITY" || !value.city && !value.cityHash && !value.reference)) throw new Error("product_understanding_location_empty");
    if (value.kind === "LOCATION" && value.city !== null && !isPublicMunicipality(value.city)) throw new Error("product_understanding_city_not_public");
    if ("reference" in value && value.reference?.city !== null && value.reference?.city !== undefined && !isPublicMunicipality(value.reference.city)) throw new Error("product_understanding_city_not_public");
    if (value.kind === "TIME") {
      if (!value.openNow && [value.localDate, value.relativeDays, value.weekday, value.dayPhase, value.clockTime, value.monthDay ?? null, value.event ?? null].every(v => v === null)) throw new Error("product_understanding_time_empty");
      if (value.event?.phasePosition && !value.event.dayPhase) throw new Error("product_understanding_event_phase_position_invalid");
      if (value.phasePosition && value.dayPhase === null) throw new Error("product_understanding_phase_position_invalid");
      if (value.clockRelation && value.clockTime === null) throw new Error("product_understanding_clock_relation_invalid");
      if (value.monthDay && (!Number.isFinite(Date.parse(`2000-${value.monthDay}T12:00:00Z`)) || new Date(`2000-${value.monthDay}T12:00:00Z`).toISOString().slice(5, 10) !== value.monthDay)) throw new Error("product_understanding_month_day_invalid");
      if (value.openNow && (value.localDate !== null || value.relativeDays !== null && value.relativeDays !== 0 || value.weekday !== null || value.monthDay !== undefined || value.dayPhase !== null || value.clockTime !== null || value.event !== undefined)) throw new Error("product_understanding_date_conflict");
      if ([value.localDate, value.relativeDays, value.weekday, value.monthDay ?? null].filter(v => v !== null).length > 1) throw new Error("product_understanding_date_conflict");
      if (value.localDate && (!Number.isFinite(Date.parse(`${value.localDate}T12:00:00Z`)) || new Date(`${value.localDate}T12:00:00Z`).toISOString().slice(0, 10) !== value.localDate)) throw new Error("product_understanding_date_invalid");
    }
    if (row.origin !== "EXPLICIT" && value.kind !== "FACET") throw new Error("product_understanding_inferred_context_prohibited");
  }
  if (row.origin === "INFERRED" && (row.importance !== "PREFERRED" || row.operator === "EXCLUDE")) throw new Error("product_understanding_inferred_constraint_prohibited");
  return row;
}

/** Validate source evidence before discarding it. A literal quote establishes
 * provenance, not semantic correctness; model accuracy still requires evals. */
function hasCurrentSelfAge(evidence: string, age: number): boolean {
  // Narrow exception to the birthday guard, not a general age extractor.
  // Present-tense self statements must name this exact age. Negation, units,
  // future/past tense and a bare anniversary number do not match.
  const text = evidence.normalize("NFKC").toLocaleLowerCase("de-CH");
  return new RegExp(`(?:^|[.,;!?])\\s*(?:(?:aber|but)\\s+)?(?:ich\\s+bin|bin|i\\s+am|i['’]m)\\s+(?:(?:jetzt|derzeit|noch|currently|still)\\s+)*${age}(?=\\s*(?:[,;.!?]|$|jahre?\\s+alt\\b|years?\\s+old\\b|und\\b|and\\b))`, "u").test(text);
}

// Source grounding is deliberately narrower than age interpretation: it
// prevents invented numbers, but does not prove whose age a stated number is.
// Cardinal spellings cover the supported DE/EN/FR evaluation languages.
const normalizeNumberText = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replaceAll("ß", "ss").replace(/[\s‐‑–-]+/gu, " ");
let ageNumberLexicon: { readonly pattern: RegExp; readonly values: ReadonlyMap<string, number> } | null = null;
function statedAgeNumbers(source: string): ReadonlySet<number> {
  if (!ageNumberLexicon) {
    const de = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
    const en = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
    const fr = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix sept", "dix huit", "dix neuf"];
    const german = (n: number): string => n < 20 ? de[n]! : n >= 100 ? `${n < 200 ? "" : german(Math.floor(n / 100))}hundert${n % 100 === 0 ? "" : german(n % 100)}`
      : `${n % 10 ? (n % 10 === 1 ? "ein" : de[n % 10]) + "und" : ""}${["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"][Math.floor(n / 10)]}`;
    const english = (n: number): string => n < 20 ? en[n]! : n >= 100 ? `${english(Math.floor(n / 100))} hundred${n % 100 === 0 ? "" : ` ${english(n % 100)}`}`
      : `${["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"][Math.floor(n / 10)]}${n % 10 ? ` ${en[n % 10]}` : ""}`;
    const french = (n: number): string => n < 20 ? fr[n]! : n >= 100 ? `${n < 200 ? "" : `${french(Math.floor(n / 100))} `}cent${n % 100 === 0 ? (n >= 200 ? "s" : "") : ` ${french(n % 100)}`}`
      : n >= 80 ? `quatre vingt${n === 80 ? "s" : ` ${french(n - 80)}`}`
      : n >= 70 ? `soixante${n === 71 ? " et" : ""} ${french(n - 60)}`
      : `${["", "", "vingt", "trente", "quarante", "cinquante", "soixante"][Math.floor(n / 10)]}${n % 10 ? `${n % 10 === 1 ? " et" : ""} ${fr[n % 10]}` : ""}`;
    const values = new Map<string, number>();
    // Include larger cardinals while matching, so 121 cannot supply 120 or 1.
    // Match maximal spans, then retain only values valid for participant ages.
    for (let number = 0; number <= 999; number++) {
      const forms = [String(number), german(number), english(number), french(number)];
      if (number >= 100) {
        if (number < 200) forms.push(`ein${german(number)}`, english(number).replace("one hundred", "a hundred"), english(number).replace("one hundred", "hundred"));
        forms.push(...forms.filter(form => form.includes("hundred ")).map(form => form.replace("hundred ", "hundred and ")));
      }
      if (number === 1) forms.push("ein", "eine", "une");
      if (number >= 70 && number < 100) {
        const decade = ["septante", "huitante", "nonante"][Math.floor(number / 10) - 7]!;
        forms.push(`${decade}${number % 10 ? `${number % 10 === 1 ? " et" : ""} ${fr[number % 10]}` : ""}`);
      }
      if (number <= 120) {
        for (const base of [String(number), number === 1 ? "ein" : german(number)]) {
          for (const ending of ["", "e", "en", "er", "es", "em"]) forms.push(`${base}jährig${ending}`);
        }
      }
      forms.push(...forms.map(form => form.replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue")));
      for (const form of forms) values.set(normalizeNumberText(form), number);
    }
    const alternatives = [...values.keys()].sort((a, b) => b.length - a.length).join("|");
    ageNumberLexicon = { values, pattern: new RegExp(`(?<![\\p{L}\\p{N}]|[0-9][.,])(?:${alternatives})(?![\\p{L}\\p{N}]|[.,][0-9])`, "gu") };
  }
  const grounded = normalizeNumberText(source);
  return new Set([...grounded.matchAll(ageNumberLexicon.pattern)].map(match => ageNumberLexicon!.values.get(match[0])!).filter(number => number <= 120));
}

export function parseModelRequirements(value: unknown, text: string, maximumEvidenceLength: 240 | 2000 = 240): readonly ProductRequirement[] {
  if (![240, 2000].includes(maximumEvidenceLength)) throw new Error("product_understanding_evidence_limit_invalid");
  if (!Array.isArray(value) || value.length > 12) throw new Error("product_understanding_bounds_invalid");
  let sourceAgeNumbers: ReadonlySet<number> | null = null;
  const parsed = value.map(input => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("product_understanding_requirement_invalid");
    const { evidence, ...body } = input as Record<string, unknown>;
    if (typeof evidence !== "string" || evidence.trim().length < 1 || evidence.length > maximumEvidenceLength || !text.includes(evidence)) throw new Error("product_understanding_evidence_invalid");
    // Provider-only age lists are minimized before cache or transport. No age
    // list, source quote or evidence offset crosses that persistence boundary.
    const minimizeValue = (rawValue: unknown): unknown => {
      if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) && (rawValue as Record<string, unknown>).kind === "AGE") {
        const age = schema.object({ kind: schema.literal("AGE"), ages: schema.array(schema.number({ integer: true, min: 0, max: 120 }), { min: 1, max: 16 }) }).parse(rawValue);
        // One AGE row may combine participants stated in separate source
        // clauses. Require every number in the original request, not within
        // the single bounded evidence excerpt. Role correctness remains semantic.
        const stated = sourceAgeNumbers ??= statedAgeNumbers(text);
        if (!age.ages.every(number => stated.has(number))) throw new Error("product_understanding_age_not_grounded");
        return { kind: "AGE", minimumAge: Math.min(...age.ages) };
      }
      return rawValue;
    };
    if (body.condition === null) delete body.condition;
    const normalizeModelValue = (value: unknown): unknown => {
      const minimized = minimizeValue(value);
      if (!minimized || typeof minimized !== "object" || Array.isArray(minimized)) return minimized;
      const row = { ...minimized } as Record<string, unknown>;
      if (row.kind === "FACET" && (row.key === "classification.primary_category" || row.key === "purpose.primary_visit" || row.key === "classification.place_types" && row.value === "OTHER_PLACE")) {
        throw new Error("product_understanding_internal_classification");
      }
      for (const key of ["role", "reference", "event", "accessArea", "phasePosition"]) if (row[key] === null) delete row[key];
      if (Array.isArray(row.includes) && row.includes.length === 0) delete row.includes;
      const groundedName = (name: unknown, source = evidence, wholeName = false) => {
        if (typeof name !== "string") return;
        const canonical = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
        const escaped = canonical(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const grounded = !wholeName ? canonical(source).includes(canonical(name))
          : new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(canonical(source));
        if (!grounded) throw new Error("product_understanding_place_not_grounded");
      };
      if (row.kind === "LOCATION") {
        groundedName(row.city, typeof row.city === "string" && isPublicMunicipality(row.city) ? text : evidence, typeof row.city === "string" && isPublicMunicipality(row.city));
        if (typeof row.city === "string" && !isPublicMunicipality(row.city)) {
          row.cityHash = contentHash({ text, name: row.city }); row.city = null;
        }
        if (row.role === "DESTINATION") delete row.role;
      }
      if (row.reference && typeof row.reference === "object") {
        const ref = schema.object({ name: requestedPlaceName, city: nullable(requestedPlaceName), relation: schema.enum(["NEAR", "RETURN_TO", "AT"] as const) }).parse(row.reference);
        groundedName(ref.name);
        // A reference can inherit a city stated elsewhere in this same request.
        // Only allowlisted public municipalities use that wider source scope;
        // source presence does not prove the geographical relationship.
        groundedName(ref.city, ref.city !== null && isPublicMunicipality(ref.city) ? text : evidence, ref.city !== null && isPublicMunicipality(ref.city));
        // Grounding proves source attribution, not that a name is public. No
        // arbitrary label/address crosses the cache or public-context boundary.
        // The request-bound fingerprint preserves identity for a future verified
        // Places resolver; it is pseudonymous, not proof of anonymization.
        row.reference = { referenceHash: contentHash({ text, name: ref.name }),
          kind: /bahnhof|railway station|train station/iu.test(ref.name) ? "RAIL_STATION" : /kino|cinema/iu.test(ref.name) ? "CINEMA" : "UNRESOLVED_PLACE",
          city: ref.city !== null && isPublicMunicipality(ref.city) ? ref.city : null, relation: ref.relation };
      }
      if (row.kind === "TIME") {
        if (row.event && typeof row.event === "object" && !Array.isArray(row.event)) {
          row.event = Object.fromEntries(Object.entries(row.event).filter(([, value]) => value !== null));
        }
        if (row.openNow === true && (!/\b(?:jetzt|gerade|sofort|now|currently|immediately|maintenant|actuellement|immédiatement|tout de suite|right away|at the moment)\b/iu.test(evidence)
          || /\b(?:nicht\s+jetzt|not\s+now|pas\s+maintenant)\b/iu.test(text))) throw new Error("product_understanding_open_now_not_grounded");
        if (row.monthDay === null) delete row.monthDay;
        if (row.clockRelation === null || row.clockRelation === "AT") delete row.clockRelation;
        // Absolute years must come from source, not the model's remembered date.
        if (typeof row.localDate === "string" && !evidence.match(/\b\d{4}\b/gu)?.includes(row.localDate.slice(0, 4))) throw new Error("product_understanding_date_year_not_grounded");
      }
      if (row.kind === "AGE" && /geburtstag|birthday|anniversaire/iu.test(evidence)
        && !hasCurrentSelfAge(evidence, Number(row.minimumAge))
        && !/\b(?:jahre? alt|years? old|aged|jährig|jaehrig)\b/iu.test(evidence)) throw new Error("product_understanding_birthday_not_group_age");
      if (row.kind === "MOBILITY" && /warte|warten|wartezeit|wait|queue/iu.test(evidence)
        && !/anreise|fahrt|fahrzeit|weg|travel|journey|walk|drive|transit/iu.test(evidence)) throw new Error("product_understanding_waiting_not_mobility");
      return row;
    };
    // A concrete participant age is factual context, never an optional venue
    // preference. Do not upgrade model guesses into a fact: request repair.
    if (body.dimension === "AGE" && body.interpretationState === "UNDERSTOOD"
      && (body.importance === "PREFERRED" || body.operator === "ALLOW")) throw new Error("product_understanding_participant_age_optional");
    body.value = normalizeModelValue(body.value);
    if (Array.isArray(body.alternatives)) body.alternatives = body.alternatives.map(normalizeModelValue);
    const row = validateRequirement(body);
    const scope = accessibilityRequestScope(evidence);
    // Discard only a requirement whose entire evidence is a recognized access
    // disclaimer. Other access needs, including unknown facilities, survive.
    return row.dimension === "ACCESS" && scope.explicitlyDisclaimed && /^[\s.,;:!?]*$/u.test(scope.text) ? null : row;
  });
  // An explicit essential exclusion is a veto, not a positive wish whose
  // absence of evidence can merely reduce confidence. Optional exclusions stay
  // optional; inferred exclusions were already rejected above.
  const normalized = parsed.filter((row): row is ProductRequirement => row !== null).map(row => row.origin === "EXPLICIT" && row.operator === "EXCLUDE" && row.importance === "ESSENTIAL"
    ? { ...row, importance: "HARD" as const } : row);
  return deepFreeze(normalized.map(row => row.group !== null && normalized.filter(other => other.group === row.group).length === 1
    ? { ...row, group: null } : row));
}

/** Compact positional encoding only at the private cache boundary. */
export function encodeRequirementCache(requirements: readonly ProductRequirement[]): readonly unknown[] {
  if (requirements.length > 12 || requirements.filter(r => r.dimension === "AGE").length > 1) throw new Error("product_understanding_bounds_invalid");
  return requirements.map(r => [r.dimension, r.importance, r.operator, r.origin, r.interpretationState, r.value, r.alternatives, r.group, ...(r.condition ? [r.condition] : [])]);
}
export function decodeRequirementCache(value: unknown): readonly ProductRequirement[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error("product_understanding_cache_invalid");
  return deepFreeze(value.map(row => {
    if (!Array.isArray(row) || (row.length !== 8 && row.length !== 9)) throw new Error("product_understanding_cache_invalid");
    return validateRequirement({ dimension: row[0], importance: row[1], operator: row[2], origin: row[3], interpretationState: row[4], value: row[5], alternatives: row[6], group: row[7], ...(row.length === 9 ? { condition: row[8] } : {}) });
  }));
}
export function bindProductUnderstanding(request: DecisionProductRequest, requirements: readonly ProductRequirement[], interpretationSource?: "MEANING_PLAN", knownAgesPartial?: true, visitAlternatives?: readonly ProductVisitAlternative[]): ProductUnderstanding {
  if (requirements.length > 12 || requirements.filter(r => r.dimension === "AGE").length > 1) throw new Error("product_understanding_bounds_invalid");
  if (interpretationSource !== undefined && interpretationSource !== "MEANING_PLAN") throw new Error("product_understanding_source_invalid");
  if (knownAgesPartial !== undefined && (knownAgesPartial !== true || interpretationSource !== "MEANING_PLAN")) throw new Error("product_understanding_source_invalid");
  if (visitAlternatives !== undefined && (interpretationSource !== "MEANING_PLAN" || !visitAlternatives.length || visitAlternatives.length > 4
    || new Set(visitAlternatives.map(branch => branch.id)).size !== visitAlternatives.length
    || requirements.length + visitAlternatives.reduce((sum, branch) => sum + branch.requirements.length, 0) > 24)) throw new Error("product_visit_alternatives_invalid");
  const branches = visitAlternatives?.map(branch => {
    if (Object.keys(branch).sort().join() !== "id,intent,preferred,requirements,unresolved" || !/^A[1-9][0-9]?$/.test(branch.id)
      || !(PRODUCT_V1_INTENT_IDS as readonly string[]).includes(branch.intent) || typeof branch.preferred !== "boolean" || typeof branch.unresolved !== "boolean"
      || !Array.isArray(branch.requirements) || branch.requirements.length + requirements.length > 12) throw new Error("product_visit_alternatives_invalid");
    return { ...branch, requirements: branch.requirements.map(validateRequirement) };
  });
  const body = { contractVersion: PRODUCT_UNDERSTANDING_VERSION, policyVersion: PRODUCT_UNDERSTANDING_POLICY, requestHash: contentHash(request), requirements: requirements.map(validateRequirement), ...(interpretationSource ? { interpretationSource } : {}), ...(knownAgesPartial ? { knownAgesPartial } : {}), ...(branches ? { visitAlternatives: branches } : {}) };
  return deepFreeze({ ...body, understandingHash: contentHash(body) });
}
export function validateProductUnderstanding(value: ProductUnderstanding, request: DecisionProductRequest): ProductUnderstanding {
  if (!value || value.contractVersion !== PRODUCT_UNDERSTANDING_VERSION || value.policyVersion !== PRODUCT_UNDERSTANDING_POLICY || !Array.isArray(value.requirements) || value.requirements.length > 12
    || Object.keys(value).sort().join() !== ["contractVersion", "policyVersion", "requestHash", "requirements", "understandingHash", ...(Object.hasOwn(value, "interpretationSource") ? ["interpretationSource"] : []), ...(Object.hasOwn(value, "knownAgesPartial") ? ["knownAgesPartial"] : []), ...(Object.hasOwn(value, "visitAlternatives") ? ["visitAlternatives"] : [])].sort().join()) throw new Error("product_understanding_binding_invalid");
  if (Object.hasOwn(value, "interpretationSource") && value.interpretationSource !== "MEANING_PLAN") throw new Error("product_understanding_source_invalid");
  if (Object.hasOwn(value, "knownAgesPartial") && value.knownAgesPartial !== true) throw new Error("product_understanding_source_invalid");
  const expected = bindProductUnderstanding(request, value.requirements, value.interpretationSource, value.knownAgesPartial, value.visitAlternatives);
  if (expected.requestHash !== value.requestHash || expected.understandingHash !== value.understandingHash) throw new Error("product_understanding_binding_invalid");
  return expected;
}

const enumJson = (values: readonly string[]) => ({ type: "string", enum: values });
const nullableJson = (value: object) => ({ anyOf: [value, { type: "null" }] });
const intJson = (minimum: number, maximum: number) => ({ type: "integer", minimum, maximum });
const objectJson = (properties: Record<string, object>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const typed = (kind: string, properties: Record<string, object>) => objectJson({ kind: { type: "string", const: kind }, ...properties });
const placeJson = objectJson({ name: { type: "string", minLength: 1, maxLength: 80 }, city: nullableJson({ type: "string", minLength: 1, maxLength: 80 }), relation: enumJson(["NEAR", "RETURN_TO", "AT"]) });
const needJson = (dimension: string) => typed("NEED", { code: enumJson(REQUEST_NEED_CODES.filter(code => needDimension[code] === dimension)), scope: enumJson(["ONE_PERSON", "GROUP", "UNSPECIFIED"]), accessArea: nullableJson(enumJson(["OUTDOOR_ONLY_ACCEPTABLE"])) });
const modelValues = [
  typed("AGE", { ages: { type: "array", minItems: 1, maxItems: 16, items: intJson(0, 120) } }),
  typed("COMPANY", { size: nullableJson(intJson(1, 100)), adultPresent: nullableJson({ type: "boolean" }), companionType: nullableJson(enumJson(["ALONE", "FRIENDS_GROUP", "FAMILY", "DATE_PAIR", "BUSINESS", "CELEBRATION", "CONVERSATION"])) }),
  typed("BUDGET", { amountMinor: intJson(0, 10_000_000), currency: enumJson(["CHF", "EUR", "USD", "GBP", "UNSPECIFIED"]), comparison: enumJson(["LT", "LTE"]), basis: enumJson(["PER_PERSON", "TOTAL", "UNSPECIFIED"]), includes: { type: "array", maxItems: 6, items: enumJson(priceComponents) } }),
  typed("TIME", { openNow: { type: "boolean" }, localDate: nullableJson({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), relativeDays: nullableJson(intJson(0, 366)), weekday: nullableJson(intJson(0, 6)), dayPhase: nullableJson(enumJson(["MORNING", "MIDDAY", "AFTERNOON", "EVENING", "NIGHT"])), clockTime: nullableJson({ type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }), monthDay: nullableJson({ type: "string", pattern: "^\\d{2}-\\d{2}$" }), clockRelation: nullableJson(enumJson(["AT", "AFTER", "BEFORE", "START_NOT_BEFORE", "END_NOT_AFTER"])), event: nullableJson(objectJson({ event: enumJson(eventNames), relation: enumJson(["AFTER", "BEFORE"]), clockTime: nullableJson({ type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }), dayPhase: nullableJson(enumJson(["MORNING", "MIDDAY", "AFTERNOON", "EVENING", "NIGHT"])), phasePosition: nullableJson(enumJson(["EARLY", "LATE"])) })), reference: nullableJson(placeJson), phasePosition: nullableJson(enumJson(["EARLY", "LATE"])) }),
  typed("LOCATION", { city: nullableJson({ type: "string", minLength: 1, maxLength: 80 }), role: nullableJson(enumJson(["DESTINATION", "ORIGIN", "REFERENCE"])), reference: nullableJson(placeJson) }),
  typed("MOBILITY", { maximumMeters: nullableJson(intJson(1, 1_000_000)), maximumMinutes: nullableJson(intJson(1, 1440)), mode: enumJson(["WALK", "BIKE", "TRANSIT", "CAR", "UNSPECIFIED"]), reference: nullableJson(placeJson) }),
];
// Internal primary classifications describe venues, not a user's exclusive
// requirement. Explicit place types and visit intents express that distinction.
export const PRODUCT_MODEL_QUERY_CATALOG = PRODUCT_QUERY_CATALOG.filter(field =>
  field.key !== "classification.primary_category" && field.key !== "purpose.primary_visit")
  .map(field => ({ ...field, values: field.values.filter(value => field.key !== "classification.place_types" || value !== "OTHER_PLACE") }));
const dimensionValues: Readonly<Record<string, readonly object[]>> = {
  AGE: [modelValues[0]!], COMPANY: [modelValues[1]!], BUDGET: [modelValues[2]!],
  TIME: [modelValues[3]!], LOCATION: [modelValues[4]!], MOBILITY: [modelValues[5]!],
  ...Object.fromEntries(Object.entries(facetDimensions).map(([dimension, prefixes]) => [dimension,
    [...(dimension === "BUDGET" ? [modelValues[2]!] : []), ...PRODUCT_MODEL_QUERY_CATALOG.filter(field => prefixes.some(prefix => field.key.startsWith(prefix))).map(field =>
      typed("FACET", { key: { type: "string", const: field.key }, value: enumJson(field.values) })), ...(["EXPERIENCE", "OFFERING"].includes(dimension) ? [needJson(dimension)] : [])],
  ])), ACCESS: [needJson("ACCESS")], OTHER: [],
  DURATION: [typed("DURATION", { minutes: nullableJson(intJson(1, 1440)), length: nullableJson(enumJson(["SHORT", "MEDIUM", "LONG"])) })],
  WAITING: [typed("WAITING", { maximumMinutes: intJson(0, 1440), comparison: enumJson(["LT", "LTE"]) })],
  SETTING: [typed("SETTING", { environment: enumJson(["INDOOR", "OUTDOOR", "COVERED_OUTDOOR"]) })],
};
/** Mapping chooses only canonical values. Modality, scope and relationships
 * belong to the immutable meaning graph and are assigned by the server. */
export const PRODUCT_MODEL_MEANING_TARGET_SCHEMA = { anyOf: Object.entries(dimensionValues)
  .filter(([dimension]) => dimension !== "AGE" && dimension !== "COMPANY")
  .flatMap(([dimension, values]) => values.map(value => objectJson({
    dimension: { type: "string", const: dimension }, value,
  }))) };

// Discriminate by dimension in the provider schema too. Arbitrary facet keys,
// values or a company-shaped value in an atmosphere requirement are impossible
// in schema-conforming output; the runtime still revalidates every boundary.
export const PRODUCT_MODEL_REQUIREMENTS_SCHEMA = { type: "array", maxItems: 12, items: { anyOf:
  Object.entries(dimensionValues).flatMap(([dimension, values]) => {
    const states = [
      ...(values.length ? [
        { state: "UNDERSTOOD", value: { anyOf: values }, alternatives: { type: "array", maxItems: 0, items: { anyOf: values } } },
        { state: "AMBIGUOUS", value: { type: "null" }, alternatives: { type: "array", minItems: 2, maxItems: 3, items: { anyOf: values } } },
      ] : []),
      { state: "UNSUPPORTED", value: { type: "null" }, alternatives: { type: "array", maxItems: 0, items: { type: "null" } } },
    ];
    return states.map(state => objectJson({
      dimension: { type: "string", const: dimension },
      importance: enumJson(["HARD", "ESSENTIAL", "PREFERRED"]), operator: enumJson(["REQUIRE", "EXCLUDE", "ALLOW"]),
      origin: Object.hasOwn(facetDimensions, dimension) ? enumJson(["EXPLICIT", "INFERRED"]) : { type: "string", const: "EXPLICIT" },
      interpretationState: { type: "string", const: state.state }, value: state.value, alternatives: state.alternatives,
      group: nullableJson({ type: "string", pattern: "^R[1-9][0-9]?$" }), condition: nullableJson(enumJson(["RAIN", "DRY"])), evidence: { type: "string", minLength: 1, maxLength: 240 },
    }));
  }),
} };

/** Resolve only an explicit calendar reference, never an implicit "today". */
function explicitCalendarDate(value: ProductTimeRequirement, localToday: string): string | null {
  if (value.localDate !== null) return value.localDate;
  if (value.monthDay) {
    // With no supplied year, use the next real occurrence, including leap days.
    for (let year = Number(localToday.slice(0, 4)); year <= Number(localToday.slice(0, 4)) + 8; year++) {
      const date = `${year}-${value.monthDay}`;
      if (date >= localToday && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date) return date;
    }
    throw new Error("product_understanding_month_day_unresolved");
  }
  if (value.relativeDays === null && value.weekday === null) return null;
  const date = new Date(`${localToday}T12:00:00Z`);
  if (value.relativeDays !== null) date.setUTCDate(date.getUTCDate() + value.relativeDays);
  else if (value.weekday !== null) date.setUTCDate(date.getUTCDate() + (value.weekday - date.getUTCDay() + 7) % 7);
  return date.toISOString().slice(0, 10);
}

/** A different explicitly excluded calendar day is satisfied by the selected
 * date. Clock/daypart exclusions and OR groups need richer interval semantics. */
export function calendarExclusionSatisfied(requirement: ProductRequirement, selectedDate: string | null, localToday: string): boolean {
  const value = requirement.value;
  if (!selectedDate || requirement.condition || requirement.dimension !== "TIME" || requirement.operator !== "EXCLUDE"
    || requirement.interpretationState !== "UNDERSTOOD" || requirement.group !== null || value?.kind !== "TIME"
    || value.openNow || value.clockTime !== null || value.dayPhase !== null || value.event || value.reference) return false;
  const excluded = explicitCalendarDate(value, localToday);
  return excluded !== null && excluded !== selectedDate;
}

/** Normalize known city aliases without converting arbitrary places to a catalog city. */
export function canonicalRequestedCity(city: string): string {
  const normalized = city.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
  return ({ zurich: "Zurich", basel: "Basel", genf: "Geneva", geneve: "Geneva", geneva: "Geneva" } as Readonly<Record<string, string>>)[normalized] ?? city.trim();
}

/** Requested destination is distinct from the subsequently authorized retrieval area.
 * Explicit UI selection keeps precedence; origin/reference cities never redirect it. */
export function requestedProductCity(understanding: ProductUnderstanding | null | undefined, request: DecisionProductRequest): string | null {
  const fallback = request.explicit.targetCity ? canonicalRequestedCity(request.explicit.targetCity) : null;
  if (fallback && (request.explicit.targetCitySource !== "PROFILE_DEFAULT" || understanding?.interpretationSource !== "MEANING_PLAN")) return fallback;
  const rows = understanding ? validateProductUnderstanding(understanding, request).requirements.filter(r => r.dimension === "LOCATION"
    && r.operator === "REQUIRE" && !r.condition && r.importance !== "PREFERRED"
    && !(r.value?.kind === "LOCATION" && r.value.role && r.value.role !== "DESTINATION")) : [];
  if (!rows.length) return fallback;
  if (rows.some(r => r.group || r.interpretationState !== "UNDERSTOOD" || r.value?.kind !== "LOCATION" || !r.value.city)) return null;
  const cities = [...new Set(rows.map(r => canonicalRequestedCity((r.value as Infer<typeof locationValue>).city!)))];
  return cities.length === 1 ? cities[0]! : null;
}

/** Project representable fields without discarding the full typed requirements.
 * Interpretation and World verification are deliberately separate. */
export function projectProductUnderstanding(understanding: ProductUnderstanding | null | undefined, request: DecisionProductRequest, localToday: string, authorizedCity: string) {
  const requirements = understanding ? validateProductUnderstanding(understanding, request).requirements : [];
  const unresolved = new Set<string>();
  const forDimension = (dimension: ProductRequirement["dimension"]) => requirements.filter(r => r.dimension === dimension);
  const single = (dimension: ProductRequirement["dimension"]) => {
    const requested = forDimension(dimension).filter(r => r.importance !== "PREFERRED");
    let rows = requested.filter(r => !r.condition && r.operator !== "ALLOW");
    if (requested.length && !rows.length) { unresolved.add(`${dimension}_REQUEST_UNRESOLVED`); return null; }
    if (dimension === "TIME") {
      const positive = rows.filter(row => row.operator === "REQUIRE");
      const excluded = rows.filter(row => row.operator === "EXCLUDE");
      const chosen = positive[0];
      const chosenDate = chosen?.value?.kind === "TIME" ? explicitCalendarDate(chosen.value, localToday) : null;
      if (positive.length === 1 && chosen?.interpretationState === "UNDERSTOOD" && chosen.group === null && chosen.value?.kind === "TIME"
        && excluded.every(row => calendarExclusionSatisfied(row, chosenDate, localToday))) rows = positive;
    }
    if (!rows.length) return undefined;
    const signatures = new Set(rows.map(r => contentHash(r)));
    if (signatures.size !== 1 || rows[0]!.interpretationState !== "UNDERSTOOD" || rows[0]!.operator !== "REQUIRE" || rows[0]!.group !== null) {
      unresolved.add(`${dimension}_REQUEST_UNRESOLVED`); return null;
    }
    return rows[0]!.value;
  };
  const age = single("AGE"); const company = single("COMPANY"); let money = single("BUDGET"); let time = single("TIME");
  // An unspecified price basis does not erase a shared known amount/currency.
  // Keep the alternatives and unresolved flag; it is still not comparable to a venue price.
  if (money === null) {
    const rows = forDimension("BUDGET").filter(r => r.importance !== "PREFERRED" && r.operator === "REQUIRE" && !r.condition && !r.group);
    const alternatives = rows.length === 1 ? rows[0]!.alternatives : [];
    if (alternatives.length >= 2 && alternatives.every(v => v.kind === "BUDGET")) {
      const values = alternatives as ProductBudgetRequirement[]; const first = values[0]!;
      if (values.every(v => v.amountMinor === first.amountMinor && v.currency === first.currency && v.comparison === first.comparison && contentHash(v.includes ?? []) === contentHash(first.includes ?? []))) money = { ...first, basis: "UNSPECIFIED" };
    }
  }
  // Several bounds of the same visit can share a date without one overwriting
  // the other. Full start/end bounds remain in requirements, never flattened away.
  const times = forDimension("TIME").filter(r => r.importance !== "PREFERRED");
  if (time === null && times.length && times.every(r => !r.condition && !r.group && r.operator === "REQUIRE" && r.interpretationState === "UNDERSTOOD" && r.value?.kind === "TIME")) {
    const values = times.map(r => r.value as ProductTimeRequirement);
    const dates = [...new Set(values.map(v => explicitCalendarDate(v, localToday)).filter(v => v !== null))];
    const phases = [...new Set(values.map(v => v.dayPhase).filter(v => v !== null))];
    if (dates.length <= 1 && phases.length <= 1 && !values.some(v => v.openNow)) {
      time = { ...(values.find(v => explicitCalendarDate(v, localToday)) ?? values[0]!), dayPhase: phases[0] ?? null };
      unresolved.delete("TIME_REQUEST_UNRESOLVED");
    }
  }
  const adultFromAge = age?.kind === "AGE" && age.minimumAge >= 18;
  const group = age !== undefined || company !== undefined ? {
    ...(age !== undefined ? { minimumAge: age?.kind === "AGE" ? age.minimumAge : null } : {}),
    ...(company !== undefined ? { size: company?.kind === "COMPANY" ? company.size ?? (company.companionType === "ALONE" ? 1 : null) : null,
      adultPresent: adultFromAge ? true : company?.kind === "COMPANY" ? company.adultPresent : null,
      companionType: company?.kind === "COMPANY" ? company.companionType : null } : adultFromAge ? { adultPresent: true } : {}),
  } : undefined;
  if (company?.kind === "COMPANY" && company.size !== null) unresolved.add("GROUP_CAPACITY_UNVERIFIED");
  const budget = money !== undefined ? {
    state: money?.kind === "BUDGET" && money.currency !== "UNSPECIFIED" ? "KNOWN" as const : "UNKNOWN" as const,
    amount: money?.kind === "BUDGET" ? money.amountMinor / 100 : null,
    currency: money?.kind === "BUDGET" && money.currency !== "UNSPECIFIED" ? money.currency : null,
    perPerson: money?.kind === "BUDGET" && money.basis !== "UNSPECIFIED" ? money.basis === "PER_PERSON" : null, calibrationLabel: null,
  } : undefined;
  if (money !== undefined && !(money?.kind === "BUDGET" && money.currency === "CHF" && money.basis === "PER_PERSON" && !(money.includes?.length))) unresolved.add("BUDGET_SEMANTICS_UNVERIFIED");
  let dateTime: DecisionProductRequest["explicit"]["dateTime"];
  if (time !== undefined) {
    const localDate = time?.kind === "TIME" ? explicitCalendarDate(time, localToday) ?? (time.openNow ? localToday : null) : null;
    dateTime = { state: localDate ? "KNOWN" : "UNKNOWN", localDate, dayPhase: time?.kind === "TIME" ? time.dayPhase : null, timeZone: "Europe/Zurich" };
  }
  if (times.some(r => [r.value, ...r.alternatives].some(v => v?.kind === "TIME" && (v.clockTime !== null || v.event || v.phasePosition)))) unresolved.add("PRECISE_TIME_UNVERIFIED");
  const locations = forDimension("LOCATION").filter(r => r.importance !== "PREFERRED" && !(r.value?.kind === "LOCATION" && r.value.role === "ORIGIN"));
  for (const r of locations) {
    const value = r.value;
    if (r.condition || r.group || r.operator !== "REQUIRE" || r.interpretationState !== "UNDERSTOOD" || value?.kind !== "LOCATION"
      || !value.city || canonicalRequestedCity(value.city).toLowerCase() !== canonicalRequestedCity(authorizedCity).toLowerCase() || value.reference) unresolved.add("LOCATION_REQUEST_UNVERIFIED");
  }
  for (const requirement of requirements) {
    if (requirement.importance === "PREFERRED") continue;
    const value = requirement.value;
    if (requirement.dimension === "MOBILITY") unresolved.add("DISTANCE_UNVERIFIED");
    if (value?.kind === "NEED" && !(value.code === "STEP_FREE_ENTRANCE" && requirement.operator === "REQUIRE" && !requirement.group && !requirement.condition)) unresolved.add(`NEED_${value.code}_UNVERIFIED`);
    if (requirement.condition || ["MOBILITY", "OTHER", "WAITING", "DURATION"].includes(requirement.dimension)
      || value?.kind === "TIME" && value.reference
      || requirement.dimension === "SETTING" && !(requirement.group === null && requirement.operator === "REQUIRE" && value?.kind === "SETTING" && value.environment === "INDOOR") || requirement.interpretationState !== "UNDERSTOOD") unresolved.add(`${requirement.dimension}_REQUEST_UNRESOLVED`);
  }
  const duration = single("DURATION");
  if (group && request.explicit.group && Object.entries(group).some(([key, value]) => value !== null
    && !(key === "minimumAge" && understanding?.knownAgesPartial && typeof value === "number" && typeof request.explicit.group!.minimumAge === "number" && request.explicit.group!.minimumAge <= value)
    && (key !== "adultPresent" || company?.kind === "COMPANY" && company.adultPresent !== null || adultFromAge)
    && request.explicit.group![key as keyof typeof group] !== value)) unresolved.add("GROUP_CONTEXT_CONFLICT");
  if (budget && request.explicit.budget && Object.entries(budget).some(([key, value]) => key !== "calibrationLabel" && request.explicit.budget![key as keyof typeof budget] !== value)) unresolved.add("BUDGET_CONTEXT_CONFLICT");
  if (dateTime && request.explicit.dateTime && contentHash(dateTime) !== contentHash(request.explicit.dateTime)) unresolved.add("TIME_CONTEXT_CONFLICT");
  return { requirements, group, budget, dateTime, stayDuration: duration?.kind === "DURATION" ? duration.length : undefined,
    openNow: time?.kind === "TIME" && time.openNow, budgetMentioned: forDimension("BUDGET").length > 0, timeMentioned: forDimension("TIME").length > 0, unresolvedTerms: [...unresolved].sort() };
}
