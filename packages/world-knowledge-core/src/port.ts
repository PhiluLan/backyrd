import { canonicalSort, hashBody } from "./canonical.js";
import { parseDerivedKnowledge, RULE_REGISTRY_HASH, RULE_REGISTRY_VERSION, deriveKnowledge, type DerivedKnowledgeResult } from "./derived.js";
import { FRESHNESS_STATES, RESOLUTION_STATES, TRUST_STATES, WORLD_KNOWLEDGE_PORT_VERSION, parseAttributeValue, type ClaimValue, type FreshnessState, type ResolutionState, type TrustState } from "./contracts.js";
import { getAttributeDefinition, REGISTRY_HASH, REGISTRY_VERSION } from "./registry.js";
import { parseResolutionResult, type KnowledgeConflict, type ResolvedKnowledge, type ResolutionResult } from "./resolver.js";
import { ContractValidationError, array, enumValue, hash, identifier, number, object, required, string, timestamp } from "./schema.js";

export const READINESS_USE_CASES = ["BASE_PROFILE", "CLASSIFICATION", "DISCOVERY", "OPENING_HOURS_ELIGIBILITY", "PRICE", "HARD_CONSTRAINTS", "ACCESSIBILITY", "INTENT_MATCHING", "TRUST_FRESHNESS"] as const;
export const READINESS_STATES = ["READY", "PARTIAL", "NOT_READY"] as const;
export type ReadinessUseCase = typeof READINESS_USE_CASES[number];
export type ReadinessState = typeof READINESS_STATES[number];

export interface PortKnowledgeEntry {
  readonly key: string;
  readonly scope: string;
  readonly resolution: ResolutionState;
  readonly freshness: FreshnessState;
  readonly trust: TrustState;
  readonly value: ClaimValue | readonly ClaimValue[];
  readonly observedAt: string;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly basisClaimRefs: readonly string[];
  readonly entryHash: string;
}

export interface UseCaseReadiness {
  readonly useCase: ReadinessUseCase;
  readonly state: ReadinessState;
  readonly reasonCodes: readonly string[];
}

export interface NonKnowledgeContext {
  readonly ownerTier?: string;
  readonly subscription?: string;
  readonly payment?: string;
  readonly advertising?: string;
  readonly sponsorship?: string;
  readonly adminNotes?: string;
  readonly privateSourceUrls?: readonly string[];
  readonly rawAiOutputs?: readonly string[];
  readonly userIntents?: readonly string[];
  readonly userTaste?: readonly string[];
}

export interface WorldKnowledgeSnapshot {
  readonly contractVersion: typeof WORLD_KNOWLEDGE_PORT_VERSION;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly registryHash: string;
  readonly ruleRegistryVersion: typeof RULE_REGISTRY_VERSION;
  readonly ruleRegistryHash: string;
  readonly resolvedAt: string;
  readonly spot: {
    readonly spotId: string;
    readonly identity: { readonly name: string | null };
    readonly location: { readonly addressLine1: string | null; readonly locality: string | null; readonly neighborhood: string | null; readonly countryCode: string | null; readonly latitude: number | null; readonly longitude: number | null; readonly timezone: string | null };
    readonly classification: { readonly primaryCategory: string | null; readonly placeTypes: readonly string[] };
    readonly publicContact: { readonly website: string | null; readonly phone: string | null; readonly instagram: string | null; readonly facebook: string | null; readonly linkedin: string | null; readonly tiktok: string | null };
  };
  readonly facts: readonly PortKnowledgeEntry[];
  readonly operationalRules: readonly PortKnowledgeEntry[];
  readonly currentStates: readonly PortKnowledgeEntry[];
  readonly capabilities: readonly { readonly key: string; readonly value: ClaimValue; readonly basis: readonly string[]; readonly derivedHash: string }[];
  readonly derivedKnowledge: readonly DerivedKnowledgeResult[];
  readonly conflicts: readonly KnowledgeConflict[];
  readonly explicitUnknowns: readonly { readonly key: string; readonly scope: string }[];
  readonly freshness: { readonly current: number; readonly stale: number; readonly expired: number };
  readonly readiness: readonly UseCaseReadiness[];
  readonly exclusions: readonly { readonly code: string; readonly count: number }[];
  readonly snapshotHash: string;
}

export interface BuildWorldKnowledgeInput {
  readonly contractVersion: typeof WORLD_KNOWLEDGE_PORT_VERSION;
  readonly spotId: string;
  readonly resolution: ResolutionResult;
  readonly nonKnowledgeContext?: NonKnowledgeContext;
}

const trusted = (item: ResolvedKnowledge) => ["REFERENCED", "VERIFIED"].includes(item.trust);
const usable = (item: ResolvedKnowledge) => item.freshness !== "EXPIRED" && !["DISPUTED", "UNKNOWN"].includes(item.resolution);

function portEntry(item: ResolvedKnowledge, resolution: ResolutionResult): PortKnowledgeEntry {
  const claims = resolution.history.filter((claim) => item.claimRefs.includes(claim.claimId));
  const observedAt = claims.map((claim) => claim.observedAt).sort().at(-1) ?? resolution.asOf;
  const validFrom = claims.map((claim) => claim.validFrom).filter((value): value is string => value !== null).sort()[0] ?? null;
  const validUntil = claims.map((claim) => claim.validUntil).filter((value): value is string => value !== null).sort()[0] ?? null;
  const body = { key: item.attributeKey, scope: item.scope.area, resolution: item.resolution, freshness: item.freshness, trust: item.trust, value: item.value, observedAt, validFrom, validUntil, basisClaimRefs: item.claimRefs };
  return { ...body, entryHash: hashBody(body, []) };
}

function readiness(resolution: ResolutionResult): readonly UseCaseReadiness[] {
  const current = new Map(resolution.resolved.filter((item) => usable(item) && item.freshness === "CURRENT").map((item) => [item.attributeKey, item])); const blocking = resolution.conflicts.some((item) => item.severity === "BLOCKING");
  const has = (...keys: string[]) => keys.every((key) => current.has(key)); const referenced = (...keys: string[]) => keys.every((key) => { const item = current.get(key); return item ? trusted(item) : false; });
  const row = (useCase: ReadinessUseCase, state: ReadinessState, reasonCodes: readonly string[]): UseCaseReadiness => ({ useCase, state, reasonCodes: [...reasonCodes].sort() });
  const profileKeys = ["identity.name", "location.address_line1", "location.locality"];
  const locationKeys = ["location.latitude", "location.longitude", "location.timezone"];
  const hardKeys = ["operation.takeaway", "rule.reservation", "rule.external_food", "rule.external_drink"];
  const accessKeys = ["accessibility.step_free_entrance", "accessibility.wheelchair_paths", "accessibility.accessible_seating", "accessibility.accessible_toilet"];
  const rows: UseCaseReadiness[] = [];
  rows.push(has(...profileKeys) ? row("BASE_PROFILE", "READY", ["CORE_IDENTITY_PRESENT"]) : row("BASE_PROFILE", current.size ? "PARTIAL" : "NOT_READY", ["CORE_IDENTITY_INCOMPLETE"]));
  rows.push(has("classification.primary_category", "classification.place_types") ? row("CLASSIFICATION", "READY", ["PRIMARY_CATEGORY_AND_PLACE_TYPE_PRESENT"]) : row("CLASSIFICATION", current.has("classification.primary_category") ? "PARTIAL" : "NOT_READY", ["CLASSIFICATION_INCOMPLETE"]));
  rows.push(has(...profileKeys, ...locationKeys, "classification.primary_category") ? referenced(...locationKeys) ? row("DISCOVERY", "READY", ["DISCOVERY_LOCATION_REFERENCED"]) : row("DISCOVERY", "PARTIAL", ["LOCATION_ASSERTED_ONLY"]) : row("DISCOVERY", "NOT_READY", ["DISCOVERY_CORE_MISSING"]));
  const hours = current.get("hours.regular"); rows.push(hours ? trusted(hours) ? row("OPENING_HOURS_ELIGIBILITY", "READY", ["OPENING_HOURS_REFERENCED"]) : row("OPENING_HOURS_ELIGIBILITY", "NOT_READY", ["OPENING_HOURS_ASSERTED_ONLY"]) : row("OPENING_HOURS_ELIGIBILITY", "NOT_READY", ["OPENING_HOURS_MISSING"]));
  const price = current.get("operation.price_range"); rows.push(price ? trusted(price) ? row("PRICE", "READY", ["PRICE_REFERENCED"]) : row("PRICE", "PARTIAL", ["PRICE_ASSERTED_ONLY"]) : row("PRICE", "NOT_READY", ["PRICE_MISSING"]));
  const hardBlocking = resolution.conflicts.some((item) => item.severity === "BLOCKING" && item.attributeKeys.some((key) => [...hardKeys, "offering.groups"].includes(key)));
  const hardCount = hardKeys.filter((key) => current.has(key)).length; rows.push(hardBlocking ? row("HARD_CONSTRAINTS", "NOT_READY", ["HARD_CONSTRAINT_CONFLICT_PRESENT"]) : hardCount === hardKeys.length && referenced(...hardKeys) ? row("HARD_CONSTRAINTS", "READY", ["CORE_CONSTRAINTS_REFERENCED"]) : row("HARD_CONSTRAINTS", hardCount ? "PARTIAL" : "NOT_READY", [hardCount ? "CORE_CONSTRAINTS_INCOMPLETE_OR_ASSERTED" : "CORE_CONSTRAINTS_MISSING"]));
  const accessCount = accessKeys.filter((key) => current.has(key)).length; rows.push(accessCount === accessKeys.length && referenced(...accessKeys) ? row("ACCESSIBILITY", "READY", ["ACCESSIBILITY_PATH_REFERENCED"]) : row("ACCESSIBILITY", accessCount ? "PARTIAL" : "NOT_READY", [accessCount ? "ACCESSIBILITY_COMPONENTS_INCOMPLETE_OR_ASSERTED" : "ACCESSIBILITY_COMPONENTS_MISSING"]));
  rows.push(row("INTENT_MATCHING", "NOT_READY", ["CAPABILITY_INTENT_REGISTRY_NOT_CONFIGURED"]));
  const stale = resolution.resolved.some((item) => item.freshness !== "CURRENT"); const asserted = resolution.resolved.some((item) => item.trust === "ASSERTED"); rows.push(blocking ? row("TRUST_FRESHNESS", "NOT_READY", ["BLOCKING_CONFLICT_PRESENT"]) : stale ? row("TRUST_FRESHNESS", "PARTIAL", ["STALE_OR_EXPIRED_KNOWLEDGE_PRESENT"]) : asserted ? row("TRUST_FRESHNESS", "PARTIAL", ["ASSERTED_ONLY_KNOWLEDGE_PRESENT"]) : row("TRUST_FRESHNESS", "READY", ["CURRENT_REFERENCED_KNOWLEDGE"]));
  return rows;
}

const structuralKeys = new Set(["identity.name", "location.address_line1", "location.locality", "location.neighborhood", "location.country_code", "location.latitude", "location.longitude", "location.timezone", "classification.primary_category", "classification.place_types", "contact.website", "contact.phone", "contact.instagram", "contact.facebook", "contact.linkedin", "contact.tiktok"]);

export function buildWorldKnowledgeSnapshot(input: BuildWorldKnowledgeInput): WorldKnowledgeSnapshot {
  if (input.contractVersion !== WORLD_KNOWLEDGE_PORT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown world knowledge port version");
  const resolution = parseResolutionResult(input.resolution); const all = resolution.resolved; const blockedKeys = new Set(resolution.conflicts.filter((conflict) => conflict.severity === "BLOCKING").flatMap((conflict) => conflict.attributeKeys)); const current = new Map(all.filter((item) => usable(item) && !blockedKeys.has(item.attributeKey)).map((item) => [item.attributeKey, item])); const value = <T>(key: string): T | null => current.get(key)?.value as T ?? null;
  if (resolution.history.some((claim) => claim.scope.spotId !== input.spotId)) throw new ContractValidationError("$.spotId", "does not match resolved claim scope");
  const derivedKnowledge = deriveKnowledge(resolution); const facts = all.filter((item) => usable(item) && !blockedKeys.has(item.attributeKey) && getAttributeDefinition(item.attributeKey).kind === "FACT" && !structuralKeys.has(item.attributeKey)).map((item) => portEntry(item, resolution));
  const operationalRules = all.filter((item) => usable(item) && item.freshness === "CURRENT" && !blockedKeys.has(item.attributeKey) && getAttributeDefinition(item.attributeKey).kind === "OPERATIONAL_RULE" && !(item.attributeKey.startsWith("hours.") && !trusted(item))).map((item) => portEntry(item, resolution));
  const currentStates = all.filter((item) => usable(item) && !blockedKeys.has(item.attributeKey) && getAttributeDefinition(item.attributeKey).kind === "CURRENT_STATE" && item.reasonCodes.every((code) => code !== "CURRENT_STATE_MISSING_VALID_UNTIL")).map((item) => portEntry(item, resolution));
  const context = input.nonKnowledgeContext ?? {}; const excludedCounts = [
    ["USER_INTENTS", context.userIntents?.length ?? 0], ["USER_TASTE", context.userTaste?.length ?? 0], ["PRIVATE_SOURCE_URLS", context.privateSourceUrls?.length ?? 0], ["RAW_AI_OUTPUTS", context.rawAiOutputs?.length ?? 0],
    ["OWNER_SUBSCRIPTION_PAYMENT_ADVERTISING", [context.ownerTier, context.subscription, context.payment, context.advertising, context.sponsorship].filter(Boolean).length], ["ADMIN_NOTES", context.adminNotes ? 1 : 0],
    ["SUBJECTIVE_EXPLANATION_ONLY", all.filter((item) => getAttributeDefinition(item.attributeKey).engineAuthorization === "EXPLANATION_ONLY").length], ["ASSERTED_OPENING_HOURS", all.filter((item) => item.attributeKey.startsWith("hours.") && usable(item) && !trusted(item)).length],
    ["CURRENT_STATE_WITHOUT_EXPIRY", all.filter((item) => item.attributeKey === "state.current" && item.reasonCodes.includes("CURRENT_STATE_MISSING_VALID_UNTIL")).length], ["EXPIRED_CURRENT_STATES", all.filter((item) => item.attributeKey === "state.current" && item.freshness === "EXPIRED").length],
    ["BLOCKING_CONFLICT_VALUES", blockedKeys.size],
  ] as const;
  const body = {
    contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, ruleRegistryVersion: RULE_REGISTRY_VERSION, ruleRegistryHash: RULE_REGISTRY_HASH, resolvedAt: resolution.asOf,
    spot: { spotId: input.spotId, identity: { name: value<string>("identity.name") }, location: { addressLine1: value<string>("location.address_line1"), locality: value<string>("location.locality"), neighborhood: value<string>("location.neighborhood"), countryCode: value<string>("location.country_code"), latitude: value<number>("location.latitude"), longitude: value<number>("location.longitude"), timezone: value<string>("location.timezone") }, classification: { primaryCategory: value<string>("classification.primary_category"), placeTypes: value<readonly string[]>("classification.place_types") ?? [] }, publicContact: { website: value<string>("contact.website"), phone: value<string>("contact.phone"), instagram: value<string>("contact.instagram"), facebook: value<string>("contact.facebook"), linkedin: value<string>("contact.linkedin"), tiktok: value<string>("contact.tiktok") } },
    facts: canonicalSort(facts, (item) => `${item.key}:${item.scope}`), operationalRules: canonicalSort(operationalRules, (item) => `${item.key}:${item.scope}`), currentStates: canonicalSort(currentStates, (item) => `${item.key}:${item.scope}`),
    capabilities: canonicalSort(derivedKnowledge.filter((item) => item.status === "DERIVED" && item.kind === "CAPABILITY").map((item) => ({ key: item.outputKey, value: item.result, basis: item.factRefs.map((ref) => ref.resolutionHash).sort(), derivedHash: item.derivedHash })), (item) => item.key), derivedKnowledge,
    conflicts: resolution.conflicts, explicitUnknowns: canonicalSort(all.filter((item) => item.resolution === "UNKNOWN").map((item) => ({ key: item.attributeKey, scope: item.scope.area })), (item) => `${item.key}:${item.scope}`),
    freshness: { current: all.filter((item) => item.freshness === "CURRENT").length, stale: all.filter((item) => item.freshness === "STALE").length, expired: all.filter((item) => item.freshness === "EXPIRED").length }, readiness: readiness(resolution), exclusions: excludedCounts.filter(([, count]) => count > 0).map(([code, count]) => ({ code, count })),
  };
  return { ...body, snapshotHash: hashBody(body, []) };
}

function parseEntry(value: unknown, path: string): PortKnowledgeEntry {
  const input = object(value, path, ["key", "scope", "resolution", "freshness", "trust", "value", "observedAt", "validFrom", "validUntil", "basisClaimRefs", "entryHash"]);
  const key = identifier(required(input, "key", path), `${path}.key`); const definition = getAttributeDefinition(key);
  const resolution = enumValue(required(input, "resolution", path), RESOLUTION_STATES, `${path}.resolution`); enumValue(required(input, "freshness", path), FRESHNESS_STATES, `${path}.freshness`); enumValue(required(input, "trust", path), TRUST_STATES, `${path}.trust`);
  if (resolution === "UNKNOWN") { if (required(input, "value", path) !== null) throw new ContractValidationError(`${path}.value`, "UNKNOWN requires null"); }
  else if (resolution !== "DISPUTED") parseAttributeValue(definition, required(input, "value", path), `${path}.value`);
  timestamp(required(input, "observedAt", path), `${path}.observedAt`);
  for (const temporalKey of ["validFrom", "validUntil"] as const) { const temporal = required(input, temporalKey, path); if (temporal !== null) timestamp(temporal, `${path}.${temporalKey}`); }
  array(required(input, "basisClaimRefs", path), `${path}.basisClaimRefs`).forEach((entry, index) => identifier(entry, `${path}.basisClaimRefs[${index}]`));
  const body = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "entryHash")); const suppliedHash = hash(required(input, "entryHash", path), `${path}.entryHash`);
  if (hashBody(body, []) !== suppliedHash) throw new ContractValidationError(`${path}.entryHash`, "entry hash mismatch");
  return input as unknown as PortKnowledgeEntry;
}

export function parseWorldKnowledgeSnapshot(value: unknown): WorldKnowledgeSnapshot {
  const input = object(value, "$", ["contractVersion", "registryVersion", "registryHash", "ruleRegistryVersion", "ruleRegistryHash", "resolvedAt", "spot", "facts", "operationalRules", "currentStates", "capabilities", "derivedKnowledge", "conflicts", "explicitUnknowns", "freshness", "readiness", "exclusions", "snapshotHash"]);
  if (required(input, "contractVersion") !== WORLD_KNOWLEDGE_PORT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown world knowledge port version");
  if (required(input, "registryVersion") !== REGISTRY_VERSION || required(input, "registryHash") !== REGISTRY_HASH) throw new ContractValidationError("$.registryVersion", "unknown registry identity");
  if (required(input, "ruleRegistryVersion") !== RULE_REGISTRY_VERSION || required(input, "ruleRegistryHash") !== RULE_REGISTRY_HASH) throw new ContractValidationError("$.ruleRegistryVersion", "unknown rule registry identity");
  timestamp(required(input, "resolvedAt"), "$.resolvedAt");
  const spot = object(required(input, "spot"), "$.spot", ["spotId", "identity", "location", "classification", "publicContact"]); identifier(required(spot, "spotId", "$.spot"), "$.spot.spotId");
  const identity = object(required(spot, "identity", "$.spot"), "$.spot.identity", ["name"]); const name = required(identity, "name", "$.spot.identity"); if (name !== null) string(name, "$.spot.identity.name", { min: 1, max: 160 });
  const location = object(required(spot, "location", "$.spot"), "$.spot.location", ["addressLine1", "locality", "neighborhood", "countryCode", "latitude", "longitude", "timezone"]);
  for (const key of ["addressLine1", "locality", "neighborhood", "countryCode", "timezone"] as const) { const member = required(location, key, "$.spot.location"); if (member !== null) string(member, `$.spot.location.${key}`, { min: 1 }); }
  for (const key of ["latitude", "longitude"] as const) { const member = required(location, key, "$.spot.location"); if (member !== null) number(member, `$.spot.location.${key}`, { min: key === "latitude" ? -90 : -180, max: key === "latitude" ? 90 : 180 }); }
  const classification = object(required(spot, "classification", "$.spot"), "$.spot.classification", ["primaryCategory", "placeTypes"]); const category = required(classification, "primaryCategory", "$.spot.classification"); if (category !== null) string(category, "$.spot.classification.primaryCategory", { min: 1 }); array(required(classification, "placeTypes", "$.spot.classification"), "$.spot.classification.placeTypes").forEach((entry, index) => string(entry, `$.spot.classification.placeTypes[${index}]`, { min: 1 }));
  const publicContact = object(required(spot, "publicContact", "$.spot"), "$.spot.publicContact", ["website", "phone", "instagram", "facebook", "linkedin", "tiktok"]); for (const key of ["website", "phone", "instagram", "facebook", "linkedin", "tiktok"] as const) { const member = required(publicContact, key, "$.spot.publicContact"); if (member !== null) string(member, `$.spot.publicContact.${key}`, { min: 1 }); }
  array(required(input, "facts"), "$.facts").forEach((entry, index) => parseEntry(entry, `$.facts[${index}]`)); array(required(input, "operationalRules"), "$.operationalRules").forEach((entry, index) => parseEntry(entry, `$.operationalRules[${index}]`)); array(required(input, "currentStates"), "$.currentStates").forEach((entry, index) => parseEntry(entry, `$.currentStates[${index}]`));
  array(required(input, "capabilities"), "$.capabilities").forEach((entry, index) => { const path = `$.capabilities[${index}]`; const row = object(entry, path, ["key", "value", "basis", "derivedHash"]); identifier(required(row, "key", path), `${path}.key`); array(required(row, "basis", path), `${path}.basis`).forEach((basis, basisIndex) => hash(basis, `${path}.basis[${basisIndex}]`)); hash(required(row, "derivedHash", path), `${path}.derivedHash`); });
  array(required(input, "derivedKnowledge"), "$.derivedKnowledge").forEach(parseDerivedKnowledge);
  array(required(input, "conflicts"), "$.conflicts").forEach((entry, index) => { const path = `$.conflicts[${index}]`; const row = object(entry, path, ["code", "severity", "attributeKeys", "claimRefs", "explanation"]); identifier(required(row, "code", path), `${path}.code`); enumValue(required(row, "severity", path), ["INFO", "WARNING", "BLOCKING"] as const, `${path}.severity`); array(required(row, "attributeKeys", path), `${path}.attributeKeys`).forEach((key, keyIndex) => identifier(key, `${path}.attributeKeys[${keyIndex}]`)); array(required(row, "claimRefs", path), `${path}.claimRefs`).forEach((ref, refIndex) => identifier(ref, `${path}.claimRefs[${refIndex}]`)); string(required(row, "explanation", path), `${path}.explanation`, { min: 1 }); });
  array(required(input, "explicitUnknowns"), "$.explicitUnknowns").forEach((entry, index) => { const path = `$.explicitUnknowns[${index}]`; const row = object(entry, path, ["key", "scope"]); identifier(required(row, "key", path), `${path}.key`); identifier(required(row, "scope", path), `${path}.scope`); });
  const freshness = object(required(input, "freshness"), "$.freshness", ["current", "stale", "expired"]); for (const key of ["current", "stale", "expired"] as const) number(required(freshness, key, "$.freshness"), `$.freshness.${key}`, { min: 0, integer: true });
  array(required(input, "readiness"), "$.readiness").forEach((entry, index) => { const row = object(entry, `$.readiness[${index}]`, ["useCase", "state", "reasonCodes"]); enumValue(required(row, "useCase", `$.readiness[${index}]`), READINESS_USE_CASES, `$.readiness[${index}].useCase`); enumValue(required(row, "state", `$.readiness[${index}]`), READINESS_STATES, `$.readiness[${index}].state`); array(required(row, "reasonCodes", `$.readiness[${index}]`), `$.readiness[${index}].reasonCodes`).forEach((code, codeIndex) => identifier(code, `$.readiness[${index}].reasonCodes[${codeIndex}]`)); });
  array(required(input, "exclusions"), "$.exclusions").forEach((entry, index) => { const path = `$.exclusions[${index}]`; const row = object(entry, path, ["code", "count"]); identifier(required(row, "code", path), `${path}.code`); number(required(row, "count", path), `${path}.count`, { min: 1, integer: true }); });
  const supplied = hash(required(input, "snapshotHash"), "$.snapshotHash"); const body = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "snapshotHash")); if (hashBody(body, []) !== supplied) throw new ContractValidationError("$.snapshotHash", "snapshot hash mismatch");
  return input as unknown as WorldKnowledgeSnapshot;
}

export interface WorldKnowledgeReaderPort {
  readonly contractVersion: "backyrd.world-knowledge.reader-port@1.0";
  readSnapshot(input: { readonly spotId: string; readonly contractVersion: typeof WORLD_KNOWLEDGE_PORT_VERSION; readonly registryVersion: typeof REGISTRY_VERSION; readonly registryHash: string }): Promise<WorldKnowledgeSnapshot>;
}

export interface CapabilityIntentRelationReaderPort {
  readonly contractVersion: "backyrd.world-knowledge.capability-intent-relation-port@1.0";
  readRelationRegistry(input: { readonly relationRegistryVersion: string }): Promise<{ readonly version: string; readonly hash: string; readonly relations: readonly unknown[] }>;
}
