import { canonicalSort, hashBody, sha256 } from "./canonical.js";
import type { ClaimValue } from "./contracts.js";
import type { KnowledgeConflict, ResolvedKnowledge, ResolutionResult } from "./resolver.js";
import { ContractValidationError, array, enumValue, hash, identifier, object, required, string } from "./schema.js";

export const RULE_REGISTRY_VERSION = "backyrd.world-knowledge.derived-rules@1.0" as const;
export const DERIVED_CONTRACT_VERSION = "backyrd.world-knowledge.derived-result@1.0" as const;

export const DERIVED_RULES = Object.freeze([
  { ruleId: "world.derived.outdoor_infrastructure@1.0", outputKey: "capability.outdoor_infrastructure", kind: "CAPABILITY", labels: { de: "Außenbereich-Infrastruktur vorhanden", en: "Outdoor infrastructure present" } },
  { ruleId: "world.derived.work_infrastructure@1.0", outputKey: "capability.work_infrastructure", kind: "CAPABILITY", labels: { de: "Arbeitsinfrastruktur vorhanden", en: "Work infrastructure present" } },
  { ruleId: "world.derived.supported_group_range@1.0", outputKey: "capability.supported_group_range", kind: "CAPABILITY", labels: { de: "Unterstützter Gruppenbereich dokumentiert", en: "Supported group range documented" } },
  { ruleId: "world.derived.family_infrastructure@1.0", outputKey: "capability.family_infrastructure", kind: "CAPABILITY", labels: { de: "Familieninfrastruktur vorhanden", en: "Family infrastructure present" } },
  { ruleId: "world.derived.step_free_visit_path@1.0", outputKey: "capability.step_free_visit_path", kind: "INFORMATION", labels: { de: "Stufenfreier Besuchspfad dokumentiert", en: "Step-free visit path documented" } },
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
  readonly factRefs: readonly { readonly attributeKey: string; readonly resolutionHash: string; readonly claimRefs: readonly string[] }[];
  readonly constraints: readonly string[];
  readonly missingPrerequisites: readonly string[];
  readonly derivedHash: string;
}

type RuleBody = Omit<DerivedKnowledgeResult, "derivedHash">;
const finish = (body: RuleBody): DerivedKnowledgeResult => ({ ...body, derivedHash: hashBody(body, []) });

function currentFacts(resolution: ResolutionResult): Map<string, ResolvedKnowledge> {
  return new Map(resolution.resolved.filter((item) => item.freshness === "CURRENT" && !["DISPUTED", "UNKNOWN"].includes(item.resolution)).map((item) => [item.attributeKey, item]));
}

function factRef(item: ResolvedKnowledge) { return { attributeKey: item.attributeKey, resolutionHash: item.resolutionHash, claimRefs: item.claimRefs }; }
function rule(ruleId: DerivedRuleId, resolution: ResolutionResult, evaluator: (facts: Map<string, ResolvedKnowledge>, blockers: readonly KnowledgeConflict[]) => { result: ClaimValue; used: readonly ResolvedKnowledge[]; constraints: readonly string[]; missing: readonly string[] }): DerivedKnowledgeResult {
  const metadata = DERIVED_RULES.find((item) => item.ruleId === ruleId); if (!metadata) throw new Error(`unknown_rule:${ruleId}`);
  const evaluated = evaluator(currentFacts(resolution), resolution.conflicts.filter((conflict) => conflict.severity === "BLOCKING"));
  const body: RuleBody = {
    contractVersion: DERIVED_CONTRACT_VERSION, ruleRegistryVersion: RULE_REGISTRY_VERSION, ruleId, outputKey: metadata.outputKey, kind: metadata.kind,
    status: evaluated.missing.length ? "NOT_DERIVED" : "DERIVED", result: evaluated.missing.length ? null : evaluated.result,
    factRefs: canonicalSort(evaluated.used.map(factRef), (item) => item.attributeKey), constraints: [...evaluated.constraints].sort(), missingPrerequisites: [...evaluated.missing].sort(),
  };
  return finish(body);
}

const arrayValue = (facts: Map<string, ResolvedKnowledge>, key: string): readonly string[] => facts.get(key)?.value as readonly string[] ?? [];
const booleanTrue = (facts: Map<string, ResolvedKnowledge>, key: string) => facts.get(key)?.resolution === "KNOWN_TRUE" && facts.get(key)?.value === true;

export function deriveKnowledge(resolution: ResolutionResult): readonly DerivedKnowledgeResult[] {
  return [
    rule("world.derived.outdoor_infrastructure@1.0", resolution, (facts) => {
      const amenities = facts.get("amenity.features"); const hasOutdoor = arrayValue(facts, "amenity.features").some((value) => ["TERRACE", "GARDEN", "OUTDOOR_SEATING"].includes(value));
      return { result: true, used: amenities && hasOutdoor ? [amenities] : [], constraints: ["Does not assert weather protection or current availability."], missing: hasOutdoor ? [] : ["amenity.features:TERRACE_OR_GARDEN_OR_OUTDOOR_SEATING"] };
    }),
    rule("world.derived.work_infrastructure@1.0", resolution, (facts) => {
      const amenities = facts.get("amenity.features"); const laptopPolicy = facts.get("operation.laptop_policy"); const stayPolicy = facts.get("operation.stay_policy"); const values = arrayValue(facts, "amenity.features");
      const missing = [...(!values.includes("WIFI") ? ["amenity.features:WIFI"] : []), ...(!values.includes("POWER_OUTLETS") ? ["amenity.features:POWER_OUTLETS"] : []), ...(!values.includes("WORK_TABLES") ? ["amenity.features:WORK_TABLES"] : []), ...(!booleanTrue(facts, "operation.laptop_policy") ? ["operation.laptop_policy:KNOWN_TRUE"] : []), ...(stayPolicy?.value !== "ALLOWED" ? ["operation.stay_policy:ALLOWED"] : [])];
      return { result: true, used: [amenities, laptopPolicy, stayPolicy].filter((item): item is ResolvedKnowledge => Boolean(item)), constraints: ["Does not assert quietness, business suitability, or unlimited stay."], missing };
    }),
    rule("world.derived.supported_group_range@1.0", resolution, (facts, blockers) => {
      const total = facts.get("capacity.seats_total"); const group = facts.get("capacity.group_size_supported"); const reservation = facts.get("rule.reservation");
      const blocked = blockers.some((item) => item.attributeKeys.some((key) => ["capacity.seats_total", "capacity.group_size_supported", "rule.reservation"].includes(key)));
      const missing = [...(!total ? ["capacity.seats_total"] : []), ...(!group ? ["capacity.group_size_supported"] : []), ...(!reservation ? ["rule.reservation"] : []), ...(blocked ? ["conflict:capacity_or_reservation"] : [])];
      return { result: (group?.value as ClaimValue | undefined) ?? null, used: [total, group, reservation].filter((item): item is ResolvedKnowledge => Boolean(item)), constraints: ["Range is descriptive and does not promise live availability."], missing };
    }),
    rule("world.derived.family_infrastructure@1.0", resolution, (facts) => {
      const amenities = facts.get("amenity.features"); const values = arrayValue(facts, "amenity.features"); const missing = [...(!values.includes("HIGH_CHAIR") ? ["amenity.features:HIGH_CHAIR"] : []), ...(!values.includes("STROLLER_SPACE") ? ["amenity.features:STROLLER_SPACE"] : [])];
      return { result: true, used: amenities ? [amenities] : [], constraints: ["Does not assert atmosphere, child supervision, or general family suitability."], missing };
    }),
    rule("world.derived.step_free_visit_path@1.0", resolution, (facts) => {
      const required = ["accessibility.step_free_entrance", "accessibility.wheelchair_paths", "accessibility.accessible_seating", "accessibility.accessible_toilet"];
      const missing = required.filter((key) => !booleanTrue(facts, key)).map((key) => `${key}:KNOWN_TRUE`); const used = required.map((key) => facts.get(key)).filter((item): item is ResolvedKnowledge => Boolean(item));
      return { result: true, used, constraints: ["Does not assert every accessibility need or accessible outdoor areas."], missing };
    }),
  ];
}

export function parseDerivedKnowledge(value: unknown): DerivedKnowledgeResult {
  const input = object(value, "$", ["contractVersion", "ruleRegistryVersion", "ruleId", "outputKey", "kind", "status", "result", "factRefs", "constraints", "missingPrerequisites", "derivedHash"]);
  if (required(input, "contractVersion") !== DERIVED_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown derived contract version");
  if (required(input, "ruleRegistryVersion") !== RULE_REGISTRY_VERSION) throw new ContractValidationError("$.ruleRegistryVersion", "unknown rule registry version");
  const ruleId = required(input, "ruleId"); const metadata = DERIVED_RULES.find((item) => item.ruleId === ruleId); if (!metadata) throw new ContractValidationError("$.ruleId", "unknown rule version");
  if (required(input, "outputKey") !== metadata.outputKey || required(input, "kind") !== metadata.kind) throw new ContractValidationError("$.outputKey", "does not match registered rule output");
  const status = enumValue(required(input, "status"), ["DERIVED", "NOT_DERIVED"] as const, "$.status"); if ((status === "NOT_DERIVED") !== (required(input, "result") === null)) throw new ContractValidationError("$.result", "result must be null exactly when rule is not derived");
  array(required(input, "factRefs"), "$.factRefs").forEach((entry, index) => { const path = `$.factRefs[${index}]`; const ref = object(entry, path, ["attributeKey", "resolutionHash", "claimRefs"]); identifier(required(ref, "attributeKey", path), `${path}.attributeKey`); hash(required(ref, "resolutionHash", path), `${path}.resolutionHash`); array(required(ref, "claimRefs", path), `${path}.claimRefs`).forEach((claimRef, claimIndex) => identifier(claimRef, `${path}.claimRefs[${claimIndex}]`)); });
  for (const field of ["constraints", "missingPrerequisites"] as const) array(required(input, field), `$.${field}`).forEach((entry, index) => string(entry, `$.${field}[${index}]`, { min: 1 }));
  const supplied = hash(required(input, "derivedHash"), "$.derivedHash"); const body = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "derivedHash")) as unknown as RuleBody;
  const parsed = finish(body); if (parsed.derivedHash !== supplied) throw new ContractValidationError("$.derivedHash", "derived hash mismatch"); return parsed;
}
