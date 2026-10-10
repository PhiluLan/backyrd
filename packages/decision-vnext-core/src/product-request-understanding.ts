import { accessibilityRequestScope } from "./product-request-context.js";
import { contentHash, deepFreeze } from "./canonical.js";
import { schema, type Infer } from "./schema.js";
import type { DecisionProductRequest } from "./product-v1-contracts.js";
import { PRODUCT_QUERY_CATALOG, validWorldPreference } from "./product-query-semantics.js";

export const PRODUCT_UNDERSTANDING_VERSION = "backyrd.decision-vnext.request-understanding@1.0" as const;
export const PRODUCT_UNDERSTANDING_POLICY = "request-understanding-policy-v7" as const;
const nullable = <T>(value: import("./schema.js").Schema<T>) => schema.union([value, schema.literal(null)] as const);
const ageValue = schema.object({ kind: schema.literal("AGE"), minimumAge: schema.number({ integer: true, min: 0, max: 120 }) });
const companyValue = schema.object({ kind: schema.literal("COMPANY"), size: nullable(schema.number({ integer: true, min: 1, max: 100 })), adultPresent: nullable(schema.boolean()), companionType: nullable(schema.enum(["ALONE", "FRIENDS_GROUP", "FAMILY", "DATE_PAIR", "BUSINESS", "CELEBRATION", "CONVERSATION"] as const)) });
const budgetValue = schema.object({ kind: schema.literal("BUDGET"), amountMinor: schema.number({ integer: true, min: 0, max: 10_000_000 }), currency: schema.enum(["CHF", "EUR", "USD", "GBP", "UNSPECIFIED"] as const), comparison: schema.enum(["LT", "LTE"] as const), basis: schema.enum(["PER_PERSON", "TOTAL", "UNSPECIFIED"] as const) });
const timeValue = schema.object({ kind: schema.literal("TIME"), openNow: schema.boolean(), localDate: nullable(schema.string({ pattern: /^\d{4}-\d{2}-\d{2}$/ })), relativeDays: nullable(schema.number({ integer: true, min: 0, max: 366 })), weekday: nullable(schema.number({ integer: true, min: 0, max: 6 })), dayPhase: nullable(schema.enum(["MORNING", "MIDDAY", "AFTERNOON", "EVENING", "NIGHT"] as const)), clockTime: nullable(schema.string({ pattern: /^(?:[01]\d|2[0-3]):[0-5]\d$/ })) });
const locationValue = schema.object({ kind: schema.literal("LOCATION"), city: schema.enum(["Basel", "Zurich", "UNSUPPORTED_CITY"] as const) });
const mobilityValue = schema.object({ kind: schema.literal("MOBILITY"), maximumMeters: nullable(schema.number({ integer: true, min: 1, max: 1_000_000 })), maximumMinutes: nullable(schema.number({ integer: true, min: 1, max: 1440 })), mode: schema.enum(["WALK", "BIKE", "TRANSIT", "CAR", "UNSPECIFIED"] as const) });
const facetValue = schema.object({ kind: schema.literal("FACET"), key: schema.string({ min: 1, max: 80 }), value: schema.string({ min: 1, max: 80 }) });
const valueSchema = schema.union([ageValue, companyValue, budgetValue, timeValue, locationValue, mobilityValue, facetValue] as const);
const requirementSchema = schema.object({
  dimension: schema.enum(["EXPERIENCE", "ATMOSPHERE", "COMPANY", "AGE", "TIME", "LOCATION", "MOBILITY", "BUDGET", "ACCESS", "OFFERING", "OTHER"] as const),
  importance: schema.enum(["HARD", "ESSENTIAL", "PREFERRED"] as const), operator: schema.enum(["REQUIRE", "EXCLUDE"] as const),
  origin: schema.enum(["EXPLICIT", "INFERRED"] as const), interpretationState: schema.enum(["UNDERSTOOD", "AMBIGUOUS", "UNSUPPORTED"] as const),
  value: nullable(valueSchema), alternatives: schema.array(valueSchema, { max: 3 }),
  group: nullable(schema.string({ pattern: /^R[1-9][0-9]?$/ })),
});
export type ProductRequirement = Infer<typeof requirementSchema>;
export type ProductBudgetRequirement = Infer<typeof budgetValue>;
export type ProductTimeRequirement = Infer<typeof timeValue>;
export type ProductUnderstanding = {
  readonly contractVersion: typeof PRODUCT_UNDERSTANDING_VERSION; readonly policyVersion: typeof PRODUCT_UNDERSTANDING_POLICY;
  readonly requestHash: string; readonly requirements: readonly ProductRequirement[]; readonly understandingHash: string;
};
export type ProductInterpretation = { readonly request: DecisionProductRequest; readonly understanding: ProductUnderstanding | null };
const facetDimensions: Readonly<Record<string, readonly string[]>> = {
  EXPERIENCE: ["classification.", "purpose."], ATMOSPHERE: ["context.atmosphere"], OFFERING: ["offering."],
};
function validateRequirement(input: unknown): ProductRequirement {
  const row = requirementSchema.parse(input);
  if (row.interpretationState === "UNDERSTOOD" ? row.value === null || row.alternatives.length > 0
    : row.value !== null || (row.interpretationState === "AMBIGUOUS" ? row.alternatives.length < 2 : row.alternatives.length > 0)) throw new Error("product_understanding_state_invalid");
  for (const value of [...(row.value ? [row.value] : []), ...row.alternatives]) {
    if (value.kind === "FACET") {
      if (!facetDimensions[row.dimension]?.some(prefix => value.key.startsWith(prefix)) || !validWorldPreference(value.key, value.value)) throw new Error("product_understanding_facet_invalid");
    } else if (value.kind !== row.dimension) throw new Error("product_understanding_dimension_invalid");
    if (value.kind === "TIME") {
      if (value.openNow && (value.localDate !== null || value.relativeDays !== null && value.relativeDays !== 0 || value.weekday !== null || value.dayPhase !== null || value.clockTime !== null)) throw new Error("product_understanding_date_conflict");
      if ([value.localDate, value.relativeDays, value.weekday].filter(v => v !== null).length > 1) throw new Error("product_understanding_date_conflict");
      if (value.localDate && (!Number.isFinite(Date.parse(`${value.localDate}T12:00:00Z`)) || new Date(`${value.localDate}T12:00:00Z`).toISOString().slice(0, 10) !== value.localDate)) throw new Error("product_understanding_date_invalid");
    }
    if (row.origin !== "EXPLICIT" && value.kind !== "FACET") throw new Error("product_understanding_inferred_context_prohibited");
  }
  if (row.origin === "INFERRED" && (row.importance !== "PREFERRED" || row.operator === "EXCLUDE")) throw new Error("product_understanding_inferred_constraint_prohibited");
  return row;
}

/** Validate source evidence before discarding it. A literal quote establishes
 * provenance, not semantic correctness; model accuracy still requires evals. */
export function parseModelRequirements(value: unknown, text: string): readonly ProductRequirement[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error("product_understanding_bounds_invalid");
  const parsed = value.map(input => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("product_understanding_requirement_invalid");
    const { evidence, ...body } = input as Record<string, unknown>;
    if (typeof evidence !== "string" || evidence.trim().length < 1 || evidence.length > 240 || !text.includes(evidence)) throw new Error("product_understanding_evidence_invalid");
    // Provider-only age lists are minimized before cache or transport. No age
    // list, source quote or evidence offset crosses that persistence boundary.
    const minimizeValue = (rawValue: unknown): unknown => {
      if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) && (rawValue as Record<string, unknown>).kind === "AGE") {
        const age = schema.object({ kind: schema.literal("AGE"), ages: schema.array(schema.number({ integer: true, min: 0, max: 120 }), { min: 1, max: 16 }) }).parse(rawValue);
        return { kind: "AGE", minimumAge: Math.min(...age.ages) };
      }
      return rawValue;
    };
    body.value = minimizeValue(body.value);
    if (Array.isArray(body.alternatives)) body.alternatives = body.alternatives.map(minimizeValue);
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
  return requirements.map(r => [r.dimension, r.importance, r.operator, r.origin, r.interpretationState, r.value, r.alternatives, r.group]);
}
export function decodeRequirementCache(value: unknown): readonly ProductRequirement[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error("product_understanding_cache_invalid");
  return deepFreeze(value.map(row => {
    if (!Array.isArray(row) || row.length !== 8) throw new Error("product_understanding_cache_invalid");
    return validateRequirement({ dimension: row[0], importance: row[1], operator: row[2], origin: row[3], interpretationState: row[4], value: row[5], alternatives: row[6], group: row[7] });
  }));
}
export function bindProductUnderstanding(request: DecisionProductRequest, requirements: readonly ProductRequirement[]): ProductUnderstanding {
  if (requirements.length > 12 || requirements.filter(r => r.dimension === "AGE").length > 1) throw new Error("product_understanding_bounds_invalid");
  const body = { contractVersion: PRODUCT_UNDERSTANDING_VERSION, policyVersion: PRODUCT_UNDERSTANDING_POLICY, requestHash: contentHash(request), requirements: requirements.map(validateRequirement) };
  return deepFreeze({ ...body, understandingHash: contentHash(body) });
}
export function validateProductUnderstanding(value: ProductUnderstanding, request: DecisionProductRequest): ProductUnderstanding {
  if (!value || value.contractVersion !== PRODUCT_UNDERSTANDING_VERSION || value.policyVersion !== PRODUCT_UNDERSTANDING_POLICY || !Array.isArray(value.requirements) || value.requirements.length > 12
    || Object.keys(value).sort().join() !== ["contractVersion", "policyVersion", "requestHash", "requirements", "understandingHash"].sort().join()) throw new Error("product_understanding_binding_invalid");
  const expected = bindProductUnderstanding(request, value.requirements);
  if (expected.requestHash !== value.requestHash || expected.understandingHash !== value.understandingHash) throw new Error("product_understanding_binding_invalid");
  return expected;
}

const enumJson = (values: readonly string[]) => ({ type: "string", enum: values });
const nullableJson = (value: object) => ({ anyOf: [value, { type: "null" }] });
const intJson = (minimum: number, maximum: number) => ({ type: "integer", minimum, maximum });
const objectJson = (properties: Record<string, object>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const typed = (kind: string, properties: Record<string, object>) => objectJson({ kind: { type: "string", const: kind }, ...properties });
const modelValues = [
  typed("AGE", { ages: { type: "array", minItems: 1, maxItems: 16, items: intJson(0, 120) } }),
  typed("COMPANY", { size: nullableJson(intJson(1, 100)), adultPresent: nullableJson({ type: "boolean" }), companionType: nullableJson(enumJson(["ALONE", "FRIENDS_GROUP", "FAMILY", "DATE_PAIR", "BUSINESS", "CELEBRATION", "CONVERSATION"])) }),
  typed("BUDGET", { amountMinor: intJson(0, 10_000_000), currency: enumJson(["CHF", "EUR", "USD", "GBP", "UNSPECIFIED"]), comparison: enumJson(["LT", "LTE"]), basis: enumJson(["PER_PERSON", "TOTAL", "UNSPECIFIED"]) }),
  typed("TIME", { openNow: { type: "boolean" }, localDate: nullableJson({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), relativeDays: nullableJson(intJson(0, 366)), weekday: nullableJson(intJson(0, 6)), dayPhase: nullableJson(enumJson(["MORNING", "MIDDAY", "AFTERNOON", "EVENING", "NIGHT"])), clockTime: nullableJson({ type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }) }),
  typed("LOCATION", { city: enumJson(["Basel", "Zurich", "UNSUPPORTED_CITY"]) }),
  typed("MOBILITY", { maximumMeters: nullableJson(intJson(1, 1_000_000)), maximumMinutes: nullableJson(intJson(1, 1440)), mode: enumJson(["WALK", "BIKE", "TRANSIT", "CAR", "UNSPECIFIED"]) }),
];
const dimensionValues: Readonly<Record<string, readonly object[]>> = {
  AGE: [modelValues[0]!], COMPANY: [modelValues[1]!], BUDGET: [modelValues[2]!],
  TIME: [modelValues[3]!], LOCATION: [modelValues[4]!], MOBILITY: [modelValues[5]!],
  ...Object.fromEntries(Object.entries(facetDimensions).map(([dimension, prefixes]) => [dimension,
    PRODUCT_QUERY_CATALOG.filter(field => prefixes.some(prefix => field.key.startsWith(prefix))).map(field =>
      typed("FACET", { key: { type: "string", const: field.key }, value: enumJson(field.values) })),
  ])), ACCESS: [], OTHER: [],
};
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
      importance: enumJson(["HARD", "ESSENTIAL", "PREFERRED"]), operator: enumJson(["REQUIRE", "EXCLUDE"]),
      origin: Object.hasOwn(facetDimensions, dimension) ? enumJson(["EXPLICIT", "INFERRED"]) : { type: "string", const: "EXPLICIT" },
      interpretationState: { type: "string", const: state.state }, value: state.value, alternatives: state.alternatives,
      group: nullableJson({ type: "string", pattern: "^R[1-9][0-9]?$" }), evidence: { type: "string", minLength: 1, maxLength: 240 },
    }));
  }),
} };

/** Project only supported context into the stable public v1 shape. Rich values
 * remain typed internally; an unrepresentable value is never rounded or erased
 * into a claim of complete understanding. World eligibility is separate. */
export function projectProductUnderstanding(understanding: ProductUnderstanding | null | undefined, request: DecisionProductRequest, localToday: string, authorizedCity: string) {
  const requirements = understanding ? validateProductUnderstanding(understanding, request).requirements : [];
  const unresolved = new Set<string>();
  const forDimension = (dimension: ProductRequirement["dimension"]) => requirements.filter(r => r.dimension === dimension);
  const single = (dimension: ProductRequirement["dimension"]) => {
    const rows = forDimension(dimension).filter(r => r.importance !== "PREFERRED");
    if (!rows.length) return undefined;
    const signatures = new Set(rows.map(r => contentHash(r)));
    if (signatures.size !== 1 || rows[0]!.interpretationState !== "UNDERSTOOD" || rows[0]!.operator !== "REQUIRE" || rows[0]!.group !== null) {
      unresolved.add(`${dimension}_REQUEST_UNRESOLVED`); return null;
    }
    return rows[0]!.value;
  };
  const age = single("AGE"); const company = single("COMPANY"); const money = single("BUDGET"); const time = single("TIME");
  const group = age !== undefined || company !== undefined ? {
    ...(age !== undefined ? { minimumAge: age?.kind === "AGE" ? age.minimumAge : null } : {}),
    ...(company !== undefined ? { size: company?.kind === "COMPANY" ? company.size ?? (company.companionType === "ALONE" ? 1 : null) : null,
      adultPresent: company?.kind === "COMPANY" ? company.adultPresent === true : false,
      companionType: company?.kind === "COMPANY" ? company.companionType : null } : {}),
  } : undefined;
  if (company?.kind === "COMPANY" && company.size !== null) unresolved.add("GROUP_CAPACITY_UNVERIFIED");
  const budget = money !== undefined ? {
    state: money?.kind === "BUDGET" && money.currency === "CHF" && money.amountMinor % 100 === 0 ? "KNOWN" as const : "UNKNOWN" as const,
    amount: money?.kind === "BUDGET" && money.amountMinor % 100 === 0 ? money.amountMinor / 100 : null,
    currency: money?.kind === "BUDGET" && money.currency === "CHF" ? "CHF" as const : null,
    perPerson: money?.kind === "BUDGET" && money.basis === "PER_PERSON", calibrationLabel: null,
  } : undefined;
  if (money !== undefined && !(money?.kind === "BUDGET" && money.currency === "CHF" && money.amountMinor % 100 === 0 && money.comparison === "LTE" && money.basis === "PER_PERSON")) unresolved.add("BUDGET_SEMANTICS_UNVERIFIED");
  let dateTime: DecisionProductRequest["explicit"]["dateTime"];
  if (time !== undefined) {
    const date = new Date(`${localToday}T12:00:00Z`);
    if (time?.kind === "TIME") {
      if (time.relativeDays !== null) date.setUTCDate(date.getUTCDate() + time.relativeDays);
      if (time.weekday !== null) date.setUTCDate(date.getUTCDate() + (time.weekday - date.getUTCDay() + 7) % 7);
      dateTime = { state: "KNOWN", localDate: time.localDate ?? date.toISOString().slice(0, 10), dayPhase: time.dayPhase, timeZone: "Europe/Zurich" };
      if (time.clockTime !== null) unresolved.add("PRECISE_TIME_UNVERIFIED");
    } else dateTime = { state: "UNKNOWN", localDate: null, dayPhase: null, timeZone: "Europe/Zurich" };
  }
  const location = single("LOCATION");
  const normalizeCity = (city: string) => city.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  if (location !== undefined && !(location?.kind === "LOCATION" && normalizeCity(location.city) === normalizeCity(authorizedCity))) unresolved.add("LOCATION_REQUEST_UNVERIFIED");
  for (const requirement of requirements) {
    if (requirement.importance === "PREFERRED") continue;
    if (["MOBILITY", "OTHER"].includes(requirement.dimension) || requirement.interpretationState !== "UNDERSTOOD") unresolved.add(`${requirement.dimension}_REQUEST_UNRESOLVED`);
  }
  if (group && request.explicit.group && Object.entries(group).some(([key, value]) => value !== null
    && (key !== "adultPresent" || company?.kind === "COMPANY" && company.adultPresent !== null)
    && request.explicit.group![key as keyof typeof group] !== value)) unresolved.add("GROUP_CONTEXT_CONFLICT");
  if (budget && request.explicit.budget && Object.entries(budget).some(([key, value]) => key !== "calibrationLabel" && request.explicit.budget![key as keyof typeof budget] !== value)) unresolved.add("BUDGET_CONTEXT_CONFLICT");
  if (dateTime && request.explicit.dateTime && contentHash(dateTime) !== contentHash(request.explicit.dateTime)) unresolved.add("TIME_CONTEXT_CONFLICT");
  return { requirements, group, budget, dateTime, openNow: time?.kind === "TIME" && time.openNow, budgetMentioned: forDimension("BUDGET").length > 0, timeMentioned: forDimension("TIME").length > 0, unresolvedTerms: [...unresolved].sort() };
}
