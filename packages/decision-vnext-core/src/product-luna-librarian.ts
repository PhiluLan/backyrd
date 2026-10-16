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

/** Revision 2 keeps the accepted schema/catalog/model and the original prompt
 * intact. Only semantic atomization is clarified; no second provider call. */
export const LUNA_LIBRARIAN_PROMPT_REVISION = "backyrd.luna-prompt@2" as const;
const activePrompt = LUNA_LIBRARIAN_PROMPT + "\nAUSFÜHRBARE TÄTIGKEITEN: Jede eigenständig prüfbare Tätigkeit als eigenes experience.activity-Faktum ausgeben, mit kurzem positivem Tätigkeitswert, nicht mehrere Tätigkeiten in einem Textwert bündeln. Gemeinsame Pflichten bleiben gemeinsam REQUIRED; echtes entweder/oder bleibt ANY. Eigenschaften wie drinnen dem betroffenen gemeinsamen Besuch oder der jeweiligen Tätigkeit zuordnen. Keine Tätigkeit durch eine ähnliche ersetzen und keine zusätzliche Tätigkeit erfinden. Oberbegriffe dürfen neben einer ausdrücklich genannten konkreten Tätigkeit erhalten bleiben; der Host interpretiert oder zerlegt keine Textwerte.";
export const LUNA_LIBRARIAN_CONFIGURATION = deepFreeze({
  contractVersion: LUNA_LIBRARIAN_CONTRACT_VERSION, model: LUNA_LIBRARIAN_MODEL,
  reasoningEffort: LUNA_LIBRARIAN_REASONING, store: false, maxOutputTokens: 7500,
  basePromptHash: contentHash(LUNA_LIBRARIAN_PROMPT), promptRevision: LUNA_LIBRARIAN_PROMPT_REVISION, promptHash: contentHash(activePrompt), schemaHash: contentHash(LUNA_LIBRARIAN_MODEL_SCHEMA),
  catalogHash: contentHash(LUNA_LIBRARIAN_CATALOG), sourceFreeze: LUNA_LIBRARIAN_FREEZE,
});
/** Body only: credentials, transport, authentication and rate limits belong to
 * the existing server orchestration. No client SDK or second model call. */
export function buildLunaLibrarianModelRequest(input: { readonly sourceText: string; readonly reference: LibrarianReference }) {
  const parsed = source(input);
  return deepFreeze({ model: LUNA_LIBRARIAN_MODEL, reasoning: { effort: LUNA_LIBRARIAN_REASONING }, store: false,
    max_output_tokens: 7500, instructions: activePrompt,
    input: JSON.stringify({ request: parsed.sourceText, reference: parsed.reference }),
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
