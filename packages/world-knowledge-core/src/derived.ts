import { canonicalJson, canonicalSort, hashBody, sha256 } from "./canonical.js";
import { FRESHNESS_STATES, TRUST_STATES, type ClaimValue, type FreshnessState, type TrustState } from "./contracts.js";
import { getAttributeDefinition } from "./registry.js";
import { parseResolutionResult, type KnowledgeConflict, type ResolvedKnowledge, type ResolutionResult } from "./resolver.js";
import { ContractValidationError, array, boolean, enumValue, hash, identifier, number, object, required, string, timestamp } from "./schema.js";

export const RULE_REGISTRY_VERSION = "backyrd.world-knowledge.derived-rules@1.0" as const;
export const DERIVED_CONTRACT_VERSION = "backyrd.world-knowledge.derived-result@1.0" as const;

export const DERIVED_RULES = Object.freeze([
  { ruleId: "world.derived.outdoor_infrastructure@1.0", outputKey: "capability.outdoor_infrastructure", outputValueType: "BOOLEAN", kind: "CAPABILITY", reasonCodes: ["OUTDOOR_INFRASTRUCTURE_FACT_PRESENT", "OUTDOOR_INFRASTRUCTURE_PREREQUISITE_MISSING"], labels: { de: "Außenbereich-Infrastruktur vorhanden", en: "Outdoor infrastructure present" } },
  { ruleId: "world.derived.work_infrastructure@1.0", outputKey: "capability.work_infrastructure", outputValueType: "BOOLEAN", kind: "CAPABILITY", reasonCodes: ["WORK_INFRASTRUCTURE_PREREQUISITE_MISSING", "WORK_INFRASTRUCTURE_PREREQUISITES_PRESENT"], labels: { de: "Arbeitsinfrastruktur vorhanden", en: "Work infrastructure present" } },
  { ruleId: "world.derived.supported_group_range@1.0", outputKey: "capability.supported_group_range", outputValueType: "INTEGER_RANGE", kind: "CAPABILITY", reasonCodes: ["GROUP_RANGE_BLOCKED_BY_CONFLICT", "GROUP_RANGE_PREREQUISITE_MISSING", "GROUP_RANGE_PREREQUISITES_PRESENT"], labels: { de: "Unterstützter Gruppenbereich dokumentiert", en: "Supported group range documented" } },
  { ruleId: "world.derived.family_infrastructure@1.0", outputKey: "capability.family_infrastructure", outputValueType: "BOOLEAN", kind: "CAPABILITY", reasonCodes: ["FAMILY_EQUIPMENT_INCOMPLETE", "FAMILY_ACCESS_PATH_INCOMPLETE", "FAMILY_AGE_RULE_MISSING", "FAMILY_AGE_RULE_CONFLICT", "FAMILY_INFRASTRUCTURE_PREREQUISITES_PRESENT"], labels: { de: "Familieninfrastruktur vorhanden", en: "Family infrastructure present" } },
  { ruleId: "world.derived.step_free_visit_path@1.0", outputKey: "capability.step_free_visit_path", outputValueType: "BOOLEAN", kind: "INFORMATION", reasonCodes: ["STEP_FREE_PATH_PREREQUISITE_MISSING", "STEP_FREE_PATH_PREREQUISITES_PRESENT"], labels: { de: "Stufenfreier Besuchspfad dokumentiert", en: "Step-free visit path documented" } },
] as const);

export const RULE_REGISTRY_HASH = sha256({ version: RULE_REGISTRY_VERSION, rules: DERIVED_RULES });
export type DerivedRuleId = typeof DERIVED_RULES[number]["ruleId"];

export interface DerivedKnowledgeResult {
  readonly contractVersion: typeof DERIVED_CONTRACT_VERSION;
  readonly ruleRegistryVersion: typeof RULE_REGISTRY_VERSION;
  readonly ruleId: DerivedRuleId;
  readonly outputKey: string;
  readonly kind: "CAPABILITY" | "INFORMATION";
  readonly status: "DERIVED" | "NOT_DERIVED";
  readonly result: ClaimValue;
  readonly factRefs: readonly { readonly attributeKey: string; readonly resolutionHash: string; readonly claimRefs: readonly string[]; readonly claimHashes: readonly string[]; readonly trust: TrustState; readonly freshness: FreshnessState; readonly oldestObservedAt: string }[];
  readonly basisTrustStates: readonly TrustState[];
  readonly basisFreshnessStates: readonly FreshnessState[];
  readonly weakestTrust: TrustState | null;
  readonly limitingFreshness: FreshnessState | null;
  readonly oldestObservedAt: string | null;
  readonly constraints: readonly string[];
  readonly missingPrerequisites: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly derivedHash: string;
}

type RuleBody = Omit<DerivedKnowledgeResult, "derivedHash">;
const finish = (body: RuleBody): DerivedKnowledgeResult => ({ ...body, derivedHash: hashBody(body, []) });

function currentFacts(resolution: ResolutionResult): Map<string, ResolvedKnowledge> {
  return new Map(resolution.resolved.filter((item) => item.freshness === "CURRENT" && !["DISPUTED", "UNKNOWN"].includes(item.resolution)).map((item) => [item.attributeKey, item]));
}

const trustOrder: readonly TrustState[] = ["CONFLICTING", "ASSERTED", "REFERENCED", "VERIFIED"];
const freshnessOrder: readonly FreshnessState[] = ["EXPIRED", "STALE", "CURRENT"];
const weakest = <T extends string>(values: readonly T[], order: readonly T[]): T | null => values.length ? [...values].sort((left, right) => order.indexOf(left) - order.indexOf(right))[0] ?? null : null;
function factRef(item: ResolvedKnowledge, claims: ReadonlyMap<string, { readonly contentHash: string; readonly observedAt: string }>) {
  const basis = item.claimRefs.map((claimId) => { const value = claims.get(claimId); if (!value) throw new Error(`missing_claim_hash:${claimId}`); return value; });
  return { attributeKey: item.attributeKey, resolutionHash: item.resolutionHash, claimRefs: item.claimRefs, claimHashes: basis.map((claim) => claim.contentHash).sort(), trust: item.trust, freshness: item.freshness, oldestObservedAt: basis.map((claim) => claim.observedAt).sort()[0] ?? (() => { throw new Error("missing_observation_time"); })() };
}
function rule(ruleId: DerivedRuleId, resolution: ResolutionResult, evaluator: (facts: Map<string, ResolvedKnowledge>, blockers: readonly KnowledgeConflict[]) => { result: ClaimValue; used: readonly ResolvedKnowledge[]; constraints: readonly string[]; missing: readonly string[]; reasons: readonly string[] }): DerivedKnowledgeResult {
  const metadata = DERIVED_RULES.find((item) => item.ruleId === ruleId); if (!metadata) throw new Error(`unknown_rule:${ruleId}`);
  const evaluated = evaluator(currentFacts(resolution), resolution.conflicts.filter((conflict) => conflict.severity === "BLOCKING"));
  const claims = new Map(resolution.history.map((claim) => [claim.claimId, { contentHash: claim.contentHash, observedAt: claim.observedAt }])); const refs = canonicalSort(evaluated.used.map((item) => factRef(item, claims)), (item) => item.attributeKey);
  const trustStates = [...new Set(refs.map((item) => item.trust))].sort(); const freshnessStates = [...new Set(refs.map((item) => item.freshness))].sort();
  const observed = refs.map((item) => item.oldestObservedAt).sort();
  const body: RuleBody = {
    contractVersion: DERIVED_CONTRACT_VERSION, ruleRegistryVersion: RULE_REGISTRY_VERSION, ruleId, outputKey: metadata.outputKey, kind: metadata.kind,
    status: evaluated.missing.length ? "NOT_DERIVED" : "DERIVED", result: evaluated.missing.length ? null : evaluated.result,
    factRefs: refs, basisTrustStates: trustStates, basisFreshnessStates: freshnessStates, weakestTrust: weakest(trustStates, trustOrder), limitingFreshness: weakest(freshnessStates, freshnessOrder), oldestObservedAt: observed[0] ?? null,
    constraints: [...evaluated.constraints].sort(), missingPrerequisites: [...evaluated.missing].sort(), reasonCodes: [...evaluated.reasons].sort(),
  };
  return finish(body);
}

const arrayValue = (facts: Map<string, ResolvedKnowledge>, key: string): readonly string[] => facts.get(key)?.value as readonly string[] ?? [];
const booleanTrue = (facts: Map<string, ResolvedKnowledge>, key: string) => facts.get(key)?.resolution === "KNOWN_TRUE" && facts.get(key)?.value === true;

export function deriveKnowledge(resolution: ResolutionResult): readonly DerivedKnowledgeResult[];
export function deriveKnowledge(resolutionValue: unknown): readonly DerivedKnowledgeResult[] {
  const resolution = parseResolutionResult(resolutionValue);
  return [
    rule("world.derived.outdoor_infrastructure@1.0", resolution, (facts) => {
      const amenities = facts.get("amenity.features"); const hasOutdoor = arrayValue(facts, "amenity.features").some((value) => ["TERRACE", "GARDEN", "OUTDOOR_SEATING"].includes(value));
      return { result: true, used: amenities && hasOutdoor ? [amenities] : [], constraints: ["Does not assert weather protection or current availability."], missing: hasOutdoor ? [] : ["amenity.features:TERRACE_OR_GARDEN_OR_OUTDOOR_SEATING"], reasons: hasOutdoor ? ["OUTDOOR_INFRASTRUCTURE_FACT_PRESENT"] : ["OUTDOOR_INFRASTRUCTURE_PREREQUISITE_MISSING"] };
    }),
    rule("world.derived.work_infrastructure@1.0", resolution, (facts) => {
      const amenities = facts.get("amenity.features"); const laptopPolicy = facts.get("operation.laptop_policy"); const stayPolicy = facts.get("operation.stay_policy"); const values = arrayValue(facts, "amenity.features");
      const missing = [...(!values.includes("WIFI") ? ["amenity.features:WIFI"] : []), ...(!values.includes("POWER_OUTLETS") ? ["amenity.features:POWER_OUTLETS"] : []), ...(!values.includes("WORK_TABLES") ? ["amenity.features:WORK_TABLES"] : []), ...(!booleanTrue(facts, "operation.laptop_policy") ? ["operation.laptop_policy:KNOWN_TRUE"] : []), ...(stayPolicy?.value !== "ALLOWED" ? ["operation.stay_policy:ALLOWED"] : [])];
      return { result: true, used: [amenities, laptopPolicy, stayPolicy].filter((item): item is ResolvedKnowledge => Boolean(item)), constraints: ["Does not assert quietness, business suitability, or unlimited stay."], missing, reasons: missing.length ? ["WORK_INFRASTRUCTURE_PREREQUISITE_MISSING"] : ["WORK_INFRASTRUCTURE_PREREQUISITES_PRESENT"] };
    }),
    rule("world.derived.supported_group_range@1.0", resolution, (facts, blockers) => {
      const total = facts.get("capacity.seats_total"); const group = facts.get("capacity.group_size_supported"); const reservation = facts.get("rule.reservation");
      const blocked = blockers.some((item) => item.attributeKeys.some((key) => ["capacity.seats_total", "capacity.group_size_supported", "rule.reservation"].includes(key)));
      const missing = [...(!total ? ["capacity.seats_total"] : []), ...(!group ? ["capacity.group_size_supported"] : []), ...(!reservation ? ["rule.reservation"] : []), ...(blocked ? ["conflict:capacity_or_reservation"] : [])];
      return { result: (group?.value as ClaimValue | undefined) ?? null, used: [total, group, reservation].filter((item): item is ResolvedKnowledge => Boolean(item)), constraints: ["Range is descriptive and does not promise live availability."], missing, reasons: blocked ? ["GROUP_RANGE_BLOCKED_BY_CONFLICT"] : missing.length ? ["GROUP_RANGE_PREREQUISITE_MISSING"] : ["GROUP_RANGE_PREREQUISITES_PRESENT"] };
    }),
    rule("world.derived.family_infrastructure@1.0", resolution, (facts) => {
      const amenities = facts.get("amenity.features"); const stepFree = facts.get("accessibility.step_free_entrance"); const paths = facts.get("accessibility.wheelchair_paths"); const ageRule = facts.get("rule.age_access"); const values = arrayValue(facts, "amenity.features");
      const agePolicy = (ageRule?.value as { policy?: string } | undefined)?.policy;
      const equipmentMissing = !values.includes("HIGH_CHAIR") || !values.includes("STROLLER_SPACE"); const accessMissing = !booleanTrue(facts, "accessibility.step_free_entrance") || !booleanTrue(facts, "accessibility.wheelchair_paths"); const ageMissing = !ageRule; const ageContradiction = Boolean(ageRule && agePolicy !== "ALL_AGES");
      const missing = [...(!values.includes("HIGH_CHAIR") ? ["amenity.features:HIGH_CHAIR"] : []), ...(!values.includes("STROLLER_SPACE") ? ["amenity.features:STROLLER_SPACE"] : []), ...(!booleanTrue(facts, "accessibility.step_free_entrance") ? ["accessibility.step_free_entrance:KNOWN_TRUE"] : []), ...(!booleanTrue(facts, "accessibility.wheelchair_paths") ? ["accessibility.wheelchair_paths:KNOWN_TRUE"] : []), ...(ageMissing ? ["rule.age_access:ALL_AGES"] : []), ...(ageContradiction ? ["rule.age_access:NO_CONTRADICTING_AGE_RESTRICTION"] : [])];
      const reasons = [...(equipmentMissing ? ["FAMILY_EQUIPMENT_INCOMPLETE"] : []), ...(accessMissing ? ["FAMILY_ACCESS_PATH_INCOMPLETE"] : []), ...(ageMissing ? ["FAMILY_AGE_RULE_MISSING"] : []), ...(ageContradiction ? ["FAMILY_AGE_RULE_CONFLICT"] : []), ...(!missing.length ? ["FAMILY_INFRASTRUCTURE_PREREQUISITES_PRESENT"] : [])];
      return { result: true, used: [amenities, stepFree, paths, ageRule].filter((item): item is ResolvedKnowledge => Boolean(item)), constraints: ["Does not assert atmosphere, child supervision, or general family suitability."], missing, reasons };
    }),
    rule("world.derived.step_free_visit_path@1.0", resolution, (facts) => {
      const required = ["accessibility.step_free_entrance", "accessibility.wheelchair_paths", "accessibility.accessible_seating", "accessibility.accessible_toilet"];
      const missing = required.filter((key) => !booleanTrue(facts, key)).map((key) => `${key}:KNOWN_TRUE`); const used = required.map((key) => facts.get(key)).filter((item): item is ResolvedKnowledge => Boolean(item));
      return { result: true, used, constraints: ["Does not assert every accessibility need or accessible outdoor areas."], missing, reasons: missing.length ? ["STEP_FREE_PATH_PREREQUISITE_MISSING"] : ["STEP_FREE_PATH_PREREQUISITES_PRESENT"] };
    }),
  ];
}

export function parseDerivedKnowledge(value: unknown): DerivedKnowledgeResult {
  const input = object(value, "$", ["contractVersion", "ruleRegistryVersion", "ruleId", "outputKey", "kind", "status", "result", "factRefs", "basisTrustStates", "basisFreshnessStates", "weakestTrust", "limitingFreshness", "oldestObservedAt", "constraints", "missingPrerequisites", "reasonCodes", "derivedHash"]);
  if (required(input, "contractVersion") !== DERIVED_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown derived contract version");
  if (required(input, "ruleRegistryVersion") !== RULE_REGISTRY_VERSION) throw new ContractValidationError("$.ruleRegistryVersion", "unknown rule registry version");
  const ruleId = required(input, "ruleId"); const metadata = DERIVED_RULES.find((item) => item.ruleId === ruleId); if (!metadata) throw new ContractValidationError("$.ruleId", "unknown rule version");
  if (required(input, "outputKey") !== metadata.outputKey || required(input, "kind") !== metadata.kind) throw new ContractValidationError("$.outputKey", "does not match registered rule output");
  const status = enumValue(required(input, "status"), ["DERIVED", "NOT_DERIVED"] as const, "$.status"); const rawResult = required(input, "result");
  let result: ClaimValue;
  if (status === "NOT_DERIVED") { if (rawResult !== null) throw new ContractValidationError("$.result", "NOT_DERIVED requires null result"); result = null; }
  else if (metadata.outputValueType === "BOOLEAN") result = boolean(rawResult, "$.result");
  else { const range = object(rawResult, "$.result", ["min", "max"]); const min = number(required(range, "min", "$.result"), "$.result.min", { min: 1, max: 100000, integer: true }); const max = number(required(range, "max", "$.result"), "$.result.max", { min: 1, max: 100000, integer: true }); if (min > max) throw new ContractValidationError("$.result", "min exceeds max"); result = { min, max }; }
  const factRefs = array(required(input, "factRefs"), "$.factRefs").map((entry, index) => {
    const path = `$.factRefs[${index}]`; const ref = object(entry, path, ["attributeKey", "resolutionHash", "claimRefs", "claimHashes", "trust", "freshness", "oldestObservedAt"]);
    const attributeKey = getAttributeDefinition(identifier(required(ref, "attributeKey", path), `${path}.attributeKey`)).key;
    const claimRefs = array(required(ref, "claimRefs", path), `${path}.claimRefs`, { min: 1 }).map((claimRef, claimIndex) => identifier(claimRef, `${path}.claimRefs[${claimIndex}]`));
    const claimHashes = array(required(ref, "claimHashes", path), `${path}.claimHashes`, { min: 1 }).map((claimHash, claimIndex) => hash(claimHash, `${path}.claimHashes[${claimIndex}]`));
    if (claimRefs.length !== claimHashes.length) throw new ContractValidationError(path, "claimRefs and claimHashes must have equal length");
    return { attributeKey, resolutionHash: hash(required(ref, "resolutionHash", path), `${path}.resolutionHash`), claimRefs, claimHashes, trust: enumValue(required(ref, "trust", path), TRUST_STATES, `${path}.trust`), freshness: enumValue(required(ref, "freshness", path), FRESHNESS_STATES, `${path}.freshness`), oldestObservedAt: timestamp(required(ref, "oldestObservedAt", path), `${path}.oldestObservedAt`) };
  });
  if (new Set(factRefs.map((item) => item.attributeKey)).size !== factRefs.length) throw new ContractValidationError("$.factRefs", "duplicate attribute reference");
  const basisTrustStates = array(required(input, "basisTrustStates"), "$.basisTrustStates").map((entry, index) => enumValue(entry, TRUST_STATES, `$.basisTrustStates[${index}]`));
  const basisFreshnessStates = array(required(input, "basisFreshnessStates"), "$.basisFreshnessStates").map((entry, index) => enumValue(entry, FRESHNESS_STATES, `$.basisFreshnessStates[${index}]`));
  const weakestTrustValue = required(input, "weakestTrust"); const weakestTrust = weakestTrustValue === null ? null : enumValue(weakestTrustValue, TRUST_STATES, "$.weakestTrust");
  const limitingFreshnessValue = required(input, "limitingFreshness"); const limitingFreshness = limitingFreshnessValue === null ? null : enumValue(limitingFreshnessValue, FRESHNESS_STATES, "$.limitingFreshness");
  const oldestObservedAtValue = required(input, "oldestObservedAt"); const oldestObservedAt = oldestObservedAtValue === null ? null : timestamp(oldestObservedAtValue, "$.oldestObservedAt");
  const expectedTrustStates = [...new Set(factRefs.map((item) => item.trust))].sort(); const expectedFreshnessStates = [...new Set(factRefs.map((item) => item.freshness))].sort(); const expectedOldest = factRefs.map((item) => item.oldestObservedAt).sort()[0] ?? null;
  if (canonicalJson(basisTrustStates) !== canonicalJson(expectedTrustStates) || canonicalJson(basisFreshnessStates) !== canonicalJson(expectedFreshnessStates) || weakestTrust !== weakest(expectedTrustStates, trustOrder) || limitingFreshness !== weakest(expectedFreshnessStates, freshnessOrder) || oldestObservedAt !== expectedOldest) throw new ContractValidationError("$.factRefs", "derived basis aggregates do not match fact references");
  const constraints = array(required(input, "constraints"), "$.constraints", { min: 1 }).map((entry, index) => string(entry, `$.constraints[${index}]`, { min: 1 }));
  const missingPrerequisites = array(required(input, "missingPrerequisites"), "$.missingPrerequisites").map((entry, index) => string(entry, `$.missingPrerequisites[${index}]`, { min: 1 }));
  const reasonCodes = array(required(input, "reasonCodes"), "$.reasonCodes", { min: 1 }).map((entry, index) => enumValue(entry, metadata.reasonCodes, `$.reasonCodes[${index}]`));
  if (status === "DERIVED" && missingPrerequisites.length) throw new ContractValidationError("$.missingPrerequisites", "DERIVED cannot have missing prerequisites");
  if (status === "NOT_DERIVED" && !missingPrerequisites.length) throw new ContractValidationError("$.missingPrerequisites", "NOT_DERIVED requires concrete missing prerequisites");
  const body: RuleBody = { contractVersion: DERIVED_CONTRACT_VERSION, ruleRegistryVersion: RULE_REGISTRY_VERSION, ruleId: metadata.ruleId, outputKey: metadata.outputKey, kind: metadata.kind, status, result, factRefs, basisTrustStates, basisFreshnessStates, weakestTrust, limitingFreshness, oldestObservedAt, constraints, missingPrerequisites, reasonCodes };
  if (canonicalJson(body) !== canonicalJson(Object.fromEntries(Object.entries(input).filter(([key]) => key !== "derivedHash")))) throw new ContractValidationError("$", "derived payload is not canonical or registered");
  const supplied = hash(required(input, "derivedHash"), "$.derivedHash"); const parsed = finish(body); if (parsed.derivedHash !== supplied) throw new ContractValidationError("$.derivedHash", "derived hash mismatch"); return parsed;
}
