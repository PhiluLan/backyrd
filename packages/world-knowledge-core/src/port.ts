import { canonicalJson, canonicalSort, hashBody } from "./canonical.js";
import { DERIVED_RULES, parseDerivedKnowledge, RULE_REGISTRY_HASH, RULE_REGISTRY_VERSION, deriveKnowledge, type DerivedKnowledgeResult } from "./derived.js";
import { FRESHNESS_STATES, RESOLUTION_STATES, TRUST_STATES, WORLD_KNOWLEDGE_PORT_VERSION, parseAttributeValue, type ClaimValue, type FreshnessState, type ResolutionState, type TrustState } from "./contracts.js";
import { getAttributeDefinition, REGISTRY_HASH, REGISTRY_VERSION, type PlaceType, type PrimaryCategory } from "./registry.js";
import { KNOWLEDGE_CONFLICT_CODES, parseResolutionResult, type KnowledgeConflict, type ResolvedKnowledge, type ResolutionResult } from "./resolver.js";
import { SOURCE_USE_CASES, UNCONFIGURED_SOURCE_POLICY, type SourcePolicy, type SourceUseCase } from "./source-policy.js";
import type { AcceptedVerificationContext } from "./verification.js";
import { ContractValidationError, array, enumValue, hash, identifier, number, object, required, string, timestamp } from "./schema.js";

export const READINESS_USE_CASES = ["BASE_PROFILE", "CLASSIFICATION", "DISCOVERY", "OPENING_HOURS_ELIGIBILITY", "PRICE", "HARD_CONSTRAINTS", "ACCESSIBILITY", "INTENT_MATCHING", "TRUST_FRESHNESS"] as const;
export const READINESS_STATES = ["READY", "PARTIAL", "NOT_READY"] as const;
export const READINESS_REASON_CODES = ["CORE_IDENTITY_PRESENT", "CORE_IDENTITY_INCOMPLETE", "PRIMARY_CATEGORY_AND_PLACE_TYPE_PRESENT", "CLASSIFICATION_INCOMPLETE", "DISCOVERY_CORE_PRESENT", "DISCOVERY_CORE_MISSING", "OPENING_HOURS_PRESENT", "OPENING_HOURS_MISSING", "OPENING_HOURS_ASSERTED_ONLY", "PRICE_PRESENT", "PRICE_MISSING", "HARD_CONSTRAINT_CONFLICT_PRESENT", "CORE_CONSTRAINTS_PRESENT", "CORE_CONSTRAINTS_INCOMPLETE", "CORE_CONSTRAINTS_MISSING", "ACCESSIBILITY_COMPONENTS_PRESENT", "ACCESSIBILITY_COMPONENTS_INCOMPLETE", "ACCESSIBILITY_COMPONENTS_MISSING", "CAPABILITY_INTENT_REGISTRY_NOT_CONFIGURED", "BLOCKING_CONFLICT_PRESENT", "STALE_OR_EXPIRED_KNOWLEDGE_PRESENT", "ASSERTED_ONLY_KNOWLEDGE_PRESENT", "CURRENT_KNOWLEDGE_PRESENT", "SOURCE_POLICY_NOT_CONFIGURED", "CLAIM_POLICY_REQUIREMENTS_UNMET", "CLAIMS_POLICY_AUTHORIZED", "SOURCE_POLICY_REJECTED"] as const;
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
  readonly sourceAssessmentHashes: readonly string[];
  readonly authorizedUseCases: readonly SourceUseCase[];
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
  readonly sourcePolicyVersion: string;
  readonly sourcePolicyHash: string;
  readonly spot: {
    readonly spotId: string;
    readonly identity: { readonly name: string | null };
    readonly location: { readonly addressLine1: string | null; readonly locality: string | null; readonly neighborhood: string | null; readonly countryCode: string | null; readonly latitude: number | null; readonly longitude: number | null; readonly timezone: string | null };
    readonly classification: { readonly primaryCategory: PrimaryCategory | null; readonly placeTypes: readonly PlaceType[] };
    readonly publicContact: { readonly website: string | null; readonly phone: string | null; readonly instagram: string | null; readonly facebook: string | null; readonly linkedin: string | null; readonly tiktok: string | null };
  };
  readonly facts: readonly PortKnowledgeEntry[];
  readonly operationalRules: readonly PortKnowledgeEntry[];
  readonly currentStates: readonly PortKnowledgeEntry[];
  readonly capabilities: readonly { readonly key: string; readonly value: ClaimValue; readonly basisResolutionHashes: readonly string[]; readonly basisClaimHashes: readonly string[]; readonly basisTrustStates: readonly TrustState[]; readonly basisFreshnessStates: readonly FreshnessState[]; readonly weakestTrust: TrustState; readonly limitingFreshness: FreshnessState; readonly oldestObservedAt: string; readonly constraints: readonly string[]; readonly missingPrerequisites: readonly string[]; readonly derivedHash: string }[];
  readonly derivedKnowledge: readonly DerivedKnowledgeResult[];
  readonly structuralAuthorizations: readonly { readonly key: string; readonly authorizedUseCases: readonly SourceUseCase[]; readonly sourceAssessmentHashes: readonly string[] }[];
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
  const assessments = resolution.sourceAssessments.filter((assessment) => item.claimRefs.includes(assessment.claimId));
  const authorizedUseCases = SOURCE_USE_CASES.filter((useCase) => assessments.length > 0 && assessments.every((assessment) => assessment.useCaseAuthorizations[useCase] === "AUTHORIZED"));
  const body = { key: item.attributeKey, scope: item.scope.area, resolution: item.resolution, freshness: item.freshness, trust: item.trust, value: item.value, observedAt, validFrom, validUntil, basisClaimRefs: item.claimRefs, sourceAssessmentHashes: assessments.map((assessment) => assessment.assessmentHash).sort(), authorizedUseCases };
  return { ...body, entryHash: hashBody(body, []) };
}

function readiness(resolution: ResolutionResult): readonly UseCaseReadiness[] {
  const current = new Map(resolution.resolved.filter((item) => usable(item) && item.freshness === "CURRENT").map((item) => [item.attributeKey, item])); const blocking = resolution.conflicts.some((item) => item.severity === "BLOCKING");
  const has = (...keys: string[]) => keys.every((key) => current.has(key));
  const policy = (keys: readonly string[], useCase: SourceUseCase): "READY" | "PARTIAL" | "NOT_READY" => {
    const items = keys.map((key) => current.get(key)); if (items.some((item) => !item)) return "NOT_READY";
    const assessments = items.flatMap((item) => resolution.sourceAssessments.filter((assessment) => item?.claimRefs.includes(assessment.claimId)));
    if (assessments.some((item) => item.useCaseAuthorizations[useCase] === "PROHIBITED")) return "NOT_READY";
    return assessments.length > 0 && assessments.every((item) => item.useCaseAuthorizations[useCase] === "AUTHORIZED") ? "READY" : "PARTIAL";
  };
  const policyReasons = (keys: readonly string[], useCase: SourceUseCase): string[] => { const items = keys.map((key) => current.get(key)).filter((item): item is ResolvedKnowledge => Boolean(item)); const assessments = items.flatMap((item) => resolution.sourceAssessments.filter((assessment) => item.claimRefs.includes(assessment.claimId))); if (assessments.some((item) => item.status === "REJECTED" || item.useCaseAuthorizations[useCase] === "PROHIBITED")) return ["SOURCE_POLICY_REJECTED"]; if (assessments.some((item) => item.reasonCodes.includes("SOURCE_POLICY_NOT_CONFIGURED"))) return ["SOURCE_POLICY_NOT_CONFIGURED"]; return assessments.every((item) => item.useCaseAuthorizations[useCase] === "AUTHORIZED") && assessments.length ? ["CLAIMS_POLICY_AUTHORIZED"] : ["CLAIM_POLICY_REQUIREMENTS_UNMET"]; };
  const row = (useCase: ReadinessUseCase, state: ReadinessState, reasonCodes: readonly string[]): UseCaseReadiness => ({ useCase, state, reasonCodes: [...reasonCodes].sort() });
  const profileKeys = ["identity.name", "location.address_line1", "location.locality"];
  const locationKeys = ["location.latitude", "location.longitude", "location.timezone"];
  const hardKeys = ["operation.takeaway", "rule.reservation", "rule.external_food", "rule.external_drink"];
  const accessKeys = ["accessibility.step_free_entrance", "accessibility.wheelchair_paths", "accessibility.accessible_seating", "accessibility.accessible_toilet"];
  const rows: UseCaseReadiness[] = [];
  rows.push(has(...profileKeys) ? row("BASE_PROFILE", "READY", ["CORE_IDENTITY_PRESENT"]) : row("BASE_PROFILE", current.size ? "PARTIAL" : "NOT_READY", ["CORE_IDENTITY_INCOMPLETE"]));
  rows.push(has("classification.primary_category", "classification.place_types") ? row("CLASSIFICATION", "READY", ["PRIMARY_CATEGORY_AND_PLACE_TYPE_PRESENT"]) : row("CLASSIFICATION", current.has("classification.primary_category") ? "PARTIAL" : "NOT_READY", ["CLASSIFICATION_INCOMPLETE"]));
  const discoveryKeys = [...profileKeys, ...locationKeys, "classification.primary_category"]; rows.push(has(...discoveryKeys) ? row("DISCOVERY", policy(discoveryKeys, "DISCOVERY"), ["DISCOVERY_CORE_PRESENT", ...policyReasons(discoveryKeys, "DISCOVERY")]) : row("DISCOVERY", "NOT_READY", ["DISCOVERY_CORE_MISSING", ...policyReasons(discoveryKeys, "DISCOVERY")]));
  const hours = current.get("hours.regular"); rows.push(hours ? row("OPENING_HOURS_ELIGIBILITY", policy(["hours.regular"], "OPENING_HOURS_ELIGIBILITY"), [hours.trust === "ASSERTED" ? "OPENING_HOURS_ASSERTED_ONLY" : "OPENING_HOURS_PRESENT", ...policyReasons(["hours.regular"], "OPENING_HOURS_ELIGIBILITY")]) : row("OPENING_HOURS_ELIGIBILITY", "NOT_READY", ["OPENING_HOURS_MISSING", ...policyReasons(["hours.regular"], "OPENING_HOURS_ELIGIBILITY")]));
  const price = current.get("operation.price_range"); rows.push(price ? row("PRICE", policy(["operation.price_range"], "PRICE"), ["PRICE_PRESENT", ...policyReasons(["operation.price_range"], "PRICE")]) : row("PRICE", "NOT_READY", ["PRICE_MISSING", ...policyReasons(["operation.price_range"], "PRICE")]));
  const hardBlocking = resolution.conflicts.some((item) => item.severity === "BLOCKING" && item.attributeKeys.some((key) => [...hardKeys, "offering.groups"].includes(key)));
  const hardCount = hardKeys.filter((key) => current.has(key)).length; rows.push(hardBlocking ? row("HARD_CONSTRAINTS", "NOT_READY", ["HARD_CONSTRAINT_CONFLICT_PRESENT", ...policyReasons(hardKeys, "HARD_CONSTRAINTS")]) : hardCount === hardKeys.length ? row("HARD_CONSTRAINTS", policy(hardKeys, "HARD_CONSTRAINTS"), ["CORE_CONSTRAINTS_PRESENT", ...policyReasons(hardKeys, "HARD_CONSTRAINTS")]) : row("HARD_CONSTRAINTS", hardCount ? "PARTIAL" : "NOT_READY", [hardCount ? "CORE_CONSTRAINTS_INCOMPLETE" : "CORE_CONSTRAINTS_MISSING", ...policyReasons(hardKeys, "HARD_CONSTRAINTS")]));
  const accessCount = accessKeys.filter((key) => current.has(key)).length; rows.push(accessCount === accessKeys.length ? row("ACCESSIBILITY", policy(accessKeys, "ACCESSIBILITY"), ["ACCESSIBILITY_COMPONENTS_PRESENT", ...policyReasons(accessKeys, "ACCESSIBILITY")]) : row("ACCESSIBILITY", accessCount ? "PARTIAL" : "NOT_READY", [accessCount ? "ACCESSIBILITY_COMPONENTS_INCOMPLETE" : "ACCESSIBILITY_COMPONENTS_MISSING", ...policyReasons(accessKeys, "ACCESSIBILITY")]));
  rows.push(row("INTENT_MATCHING", "NOT_READY", ["CAPABILITY_INTENT_REGISTRY_NOT_CONFIGURED"]));
  const allKeys = [...current.keys()]; const trustPolicy = policy(allKeys, "GENERAL_WORLD"); const trustReasons = policyReasons(allKeys, "GENERAL_WORLD"); const stale = resolution.resolved.some((item) => item.freshness !== "CURRENT"); const asserted = resolution.resolved.some((item) => item.trust === "ASSERTED"); rows.push(blocking ? row("TRUST_FRESHNESS", "NOT_READY", ["BLOCKING_CONFLICT_PRESENT", ...trustReasons]) : stale ? row("TRUST_FRESHNESS", "PARTIAL", ["STALE_OR_EXPIRED_KNOWLEDGE_PRESENT", ...trustReasons]) : asserted ? row("TRUST_FRESHNESS", trustPolicy === "READY" ? "READY" : "PARTIAL", ["ASSERTED_ONLY_KNOWLEDGE_PRESENT", ...trustReasons]) : row("TRUST_FRESHNESS", trustPolicy, ["CURRENT_KNOWLEDGE_PRESENT", ...trustReasons]));
  return rows;
}

const structuralKeys = new Set(["identity.name", "location.address_line1", "location.locality", "location.neighborhood", "location.country_code", "location.latitude", "location.longitude", "location.timezone", "classification.primary_category", "classification.place_types", "contact.website", "contact.phone", "contact.instagram", "contact.facebook", "contact.linkedin", "contact.tiktok"]);

function parseNonKnowledgeContext(value: unknown): NonKnowledgeContext {
  const input = object(value, "$.nonKnowledgeContext", ["ownerTier", "subscription", "payment", "advertising", "sponsorship", "adminNotes", "privateSourceUrls", "rawAiOutputs", "userIntents", "userTaste"]); const result: Record<string, string | readonly string[]> = {};
  for (const key of ["ownerTier", "subscription", "payment", "advertising", "sponsorship", "adminNotes"] as const) if (key in input) result[key] = string(required(input, key, "$.nonKnowledgeContext"), `$.nonKnowledgeContext.${key}`, { min: 1, max: 1000 });
  for (const key of ["privateSourceUrls", "rawAiOutputs", "userIntents", "userTaste"] as const) if (key in input) result[key] = array(required(input, key, "$.nonKnowledgeContext"), `$.nonKnowledgeContext.${key}`, { max: 100 }).map((item, index) => string(item, `$.nonKnowledgeContext.${key}[${index}]`, { min: 1, max: 2000 }));
  return result as NonKnowledgeContext;
}

export function parseBuildWorldKnowledgeInput(value: unknown, acceptedPolicies: readonly Pick<SourcePolicy, "policyVersion" | "policyHash">[] = [UNCONFIGURED_SOURCE_POLICY], verificationContext?: AcceptedVerificationContext): BuildWorldKnowledgeInput {
  const input = object(value, "$", ["contractVersion", "spotId", "resolution", "nonKnowledgeContext"]);
  if (required(input, "contractVersion") !== WORLD_KNOWLEDGE_PORT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown world knowledge port version");
  const base = { contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, spotId: identifier(required(input, "spotId"), "$.spotId"), resolution: parseResolutionResult(required(input, "resolution"), acceptedPolicies, verificationContext) };
  return "nonKnowledgeContext" in input ? { ...base, nonKnowledgeContext: parseNonKnowledgeContext(required(input, "nonKnowledgeContext")) } : base;
}

export function buildWorldKnowledgeSnapshot(input: BuildWorldKnowledgeInput, acceptedPolicies?: readonly Pick<SourcePolicy, "policyVersion" | "policyHash">[], verificationContext?: AcceptedVerificationContext): WorldKnowledgeSnapshot;
export function buildWorldKnowledgeSnapshot(inputValue: unknown, acceptedPolicies: readonly Pick<SourcePolicy, "policyVersion" | "policyHash">[] = [UNCONFIGURED_SOURCE_POLICY], verificationContext?: AcceptedVerificationContext): WorldKnowledgeSnapshot {
  const input = parseBuildWorldKnowledgeInput(inputValue, acceptedPolicies, verificationContext);
  const resolution = parseResolutionResult(input.resolution, acceptedPolicies, verificationContext); const all = resolution.resolved; const blockedKeys = new Set(resolution.conflicts.filter((conflict) => conflict.severity === "BLOCKING").flatMap((conflict) => conflict.attributeKeys)); const current = new Map(all.filter((item) => usable(item) && !blockedKeys.has(item.attributeKey)).map((item) => [item.attributeKey, item])); const value = <T>(key: string): T | null => current.get(key)?.value as T ?? null;
  if (resolution.history.some((claim) => claim.scope.spotId !== input.spotId)) throw new ContractValidationError("$.spotId", "does not match resolved claim scope");
  const derivedKnowledge = deriveKnowledge(resolution, acceptedPolicies, verificationContext); const facts = all.filter((item) => usable(item) && !blockedKeys.has(item.attributeKey) && getAttributeDefinition(item.attributeKey).kind === "FACT" && !structuralKeys.has(item.attributeKey)).map((item) => portEntry(item, resolution));
  const operationalRules = all.filter((item) => usable(item) && item.freshness === "CURRENT" && !blockedKeys.has(item.attributeKey) && getAttributeDefinition(item.attributeKey).kind === "OPERATIONAL_RULE").map((item) => portEntry(item, resolution));
  const currentStates = all.filter((item) => usable(item) && !blockedKeys.has(item.attributeKey) && getAttributeDefinition(item.attributeKey).kind === "CURRENT_STATE" && item.reasonCodes.every((code) => code !== "CURRENT_STATE_MISSING_VALID_UNTIL")).map((item) => portEntry(item, resolution));
  const context = input.nonKnowledgeContext ?? {}; const excludedCounts = [
    ["USER_INTENTS", context.userIntents?.length ?? 0], ["USER_TASTE", context.userTaste?.length ?? 0], ["PRIVATE_SOURCE_URLS", context.privateSourceUrls?.length ?? 0], ["RAW_AI_OUTPUTS", context.rawAiOutputs?.length ?? 0],
    ["OWNER_SUBSCRIPTION_PAYMENT_ADVERTISING", [context.ownerTier, context.subscription, context.payment, context.advertising, context.sponsorship].filter(Boolean).length], ["ADMIN_NOTES", context.adminNotes ? 1 : 0],
    ["SUBJECTIVE_EXPLANATION_ONLY", all.filter((item) => getAttributeDefinition(item.attributeKey).engineAuthorization === "EXPLANATION_ONLY").length], ["ASSERTED_OPENING_HOURS", all.filter((item) => item.attributeKey.startsWith("hours.") && usable(item) && !trusted(item)).length],
    ["CURRENT_STATE_WITHOUT_EXPIRY", all.filter((item) => item.attributeKey === "state.current" && item.reasonCodes.includes("CURRENT_STATE_MISSING_VALID_UNTIL")).length], ["EXPIRED_CURRENT_STATES", all.filter((item) => item.attributeKey === "state.current" && item.freshness === "EXPIRED").length],
    ["BLOCKING_CONFLICT_VALUES", blockedKeys.size],
  ] as const;
  const structuralAuthorizations = canonicalSort([...structuralKeys].flatMap((key) => { const item = all.find((entry) => entry.attributeKey === key && usable(entry)); if (!item) return []; const assessments = resolution.sourceAssessments.filter((assessment) => item.claimRefs.includes(assessment.claimId)); return [{ key, authorizedUseCases: SOURCE_USE_CASES.filter((useCase) => assessments.length > 0 && assessments.every((assessment) => assessment.useCaseAuthorizations[useCase] === "AUTHORIZED")), sourceAssessmentHashes: assessments.map((assessment) => assessment.assessmentHash).sort() }]; }), (item) => item.key);
  const body = {
    contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, ruleRegistryVersion: RULE_REGISTRY_VERSION, ruleRegistryHash: RULE_REGISTRY_HASH, resolvedAt: resolution.asOf, sourcePolicyVersion: resolution.sourcePolicy.policyVersion, sourcePolicyHash: resolution.sourcePolicy.policyHash,
    spot: { spotId: input.spotId, identity: { name: value<string>("identity.name") }, location: { addressLine1: value<string>("location.address_line1"), locality: value<string>("location.locality"), neighborhood: value<string>("location.neighborhood"), countryCode: value<string>("location.country_code"), latitude: value<number>("location.latitude"), longitude: value<number>("location.longitude"), timezone: value<string>("location.timezone") }, classification: { primaryCategory: value<PrimaryCategory>("classification.primary_category"), placeTypes: value<readonly PlaceType[]>("classification.place_types") ?? [] }, publicContact: { website: value<string>("contact.website"), phone: value<string>("contact.phone"), instagram: value<string>("contact.instagram"), facebook: value<string>("contact.facebook"), linkedin: value<string>("contact.linkedin"), tiktok: value<string>("contact.tiktok") } },
    facts: canonicalSort(facts, (item) => `${item.key}:${item.scope}`), operationalRules: canonicalSort(operationalRules, (item) => `${item.key}:${item.scope}`), currentStates: canonicalSort(currentStates, (item) => `${item.key}:${item.scope}`),
    capabilities: canonicalSort(derivedKnowledge.filter((item): item is DerivedKnowledgeResult & { readonly weakestTrust: TrustState; readonly limitingFreshness: FreshnessState; readonly oldestObservedAt: string } => item.status === "DERIVED" && item.kind === "CAPABILITY" && item.weakestTrust !== null && item.limitingFreshness !== null && item.oldestObservedAt !== null).map((item) => ({ key: item.outputKey, value: item.result, basisResolutionHashes: item.factRefs.map((ref) => ref.resolutionHash).sort(), basisClaimHashes: item.factRefs.flatMap((ref) => ref.claimHashes).sort(), basisTrustStates: item.basisTrustStates, basisFreshnessStates: item.basisFreshnessStates, weakestTrust: item.weakestTrust, limitingFreshness: item.limitingFreshness, oldestObservedAt: item.oldestObservedAt, constraints: item.constraints, missingPrerequisites: item.missingPrerequisites, derivedHash: item.derivedHash })), (item) => item.key), derivedKnowledge, structuralAuthorizations,
    conflicts: resolution.conflicts, explicitUnknowns: canonicalSort(all.filter((item) => item.resolution === "UNKNOWN").map((item) => ({ key: item.attributeKey, scope: item.scope.area })), (item) => `${item.key}:${item.scope}`),
    freshness: { current: all.filter((item) => item.freshness === "CURRENT").length, stale: all.filter((item) => item.freshness === "STALE").length, expired: all.filter((item) => item.freshness === "EXPIRED").length }, readiness: readiness(resolution), exclusions: excludedCounts.filter(([, count]) => count > 0).map(([code, count]) => ({ code, count })),
  };
  return { ...body, snapshotHash: hashBody(body, []) };
}

function parseEntry(value: unknown, path: string, expectedKind: "FACT" | "OPERATIONAL_RULE" | "CURRENT_STATE"): PortKnowledgeEntry {
  const input = object(value, path, ["key", "scope", "resolution", "freshness", "trust", "value", "observedAt", "validFrom", "validUntil", "basisClaimRefs", "sourceAssessmentHashes", "authorizedUseCases", "entryHash"]);
  const key = identifier(required(input, "key", path), `${path}.key`); const definition = getAttributeDefinition(key);
  if (definition.kind !== expectedKind || definition.engineAuthorization !== "AUTHORIZED" || (expectedKind === "FACT" && structuralKeys.has(key))) throw new ContractValidationError(`${path}.key`, `attribute is not an authorized ${expectedKind} port entry`);
  const resolution = enumValue(required(input, "resolution", path), RESOLUTION_STATES, `${path}.resolution`); if (["UNKNOWN", "DISPUTED"].includes(resolution)) throw new ContractValidationError(`${path}.resolution`, "unknown and disputed values use dedicated snapshot sections");
  const freshness = enumValue(required(input, "freshness", path), FRESHNESS_STATES, `${path}.freshness`); const trust = enumValue(required(input, "trust", path), TRUST_STATES, `${path}.trust`); if (trust === "CONFLICTING") throw new ContractValidationError(`${path}.trust`, "conflicting value cannot be emitted as resolved entry");
  const parsedValue = parseAttributeValue(key, required(input, "value", path), `${path}.value`);
  if (resolution === "KNOWN_TRUE" && parsedValue !== true || resolution === "KNOWN_FALSE" && parsedValue !== false) throw new ContractValidationError(`${path}.value`, "boolean resolution does not match value");
  const observedAt = timestamp(required(input, "observedAt", path), `${path}.observedAt`); const temporal: Record<"validFrom" | "validUntil", string | null> = { validFrom: null, validUntil: null };
  for (const temporalKey of ["validFrom", "validUntil"] as const) { const raw = required(input, temporalKey, path); temporal[temporalKey] = raw === null ? null : timestamp(raw, `${path}.${temporalKey}`); }
  if (expectedKind === "CURRENT_STATE" && (freshness !== "CURRENT" || temporal.validUntil === null)) throw new ContractValidationError(path, "current-state port entry requires CURRENT freshness and validUntil");
  if (expectedKind === "OPERATIONAL_RULE" && freshness !== "CURRENT") throw new ContractValidationError(path, "operational-rule port entry must be current");
  const basisClaimRefs = array(required(input, "basisClaimRefs", path), `${path}.basisClaimRefs`, { min: 1 }).map((entry, index) => identifier(entry, `${path}.basisClaimRefs[${index}]`));
  const body = { key, scope: identifier(required(input, "scope", path), `${path}.scope`), resolution, freshness, trust, value: parsedValue, observedAt, validFrom: temporal.validFrom, validUntil: temporal.validUntil, basisClaimRefs, sourceAssessmentHashes: array(required(input, "sourceAssessmentHashes", path), `${path}.sourceAssessmentHashes`, { min: 1 }).map((entry, index) => hash(entry, `${path}.sourceAssessmentHashes[${index}]`)), authorizedUseCases: array(required(input, "authorizedUseCases", path), `${path}.authorizedUseCases`).map((entry, index) => enumValue(entry, SOURCE_USE_CASES, `${path}.authorizedUseCases[${index}]`)) };
  if (canonicalJson(body) !== canonicalJson(Object.fromEntries(Object.entries(input).filter(([field]) => field !== "entryHash")))) throw new ContractValidationError(path, "port entry is not canonical");
  const suppliedHash = hash(required(input, "entryHash", path), `${path}.entryHash`);
  if (hashBody(body, []) !== suppliedHash) throw new ContractValidationError(`${path}.entryHash`, "entry hash mismatch");
  return { ...body, entryHash: suppliedHash };
}

function parseStructuralValue(attributeKey: string, value: unknown, path: string): ClaimValue | null {
  if (value === null) return null;
  const parsed = parseAttributeValue(attributeKey, value, path);
  if (canonicalJson(parsed) !== canonicalJson(value)) throw new ContractValidationError(path, "structural value is not canonical");
  return parsed;
}

function parseCapability(value: unknown, path: string, derived: readonly DerivedKnowledgeResult[]): void {
  const input = object(value, path, ["key", "value", "basisResolutionHashes", "basisClaimHashes", "basisTrustStates", "basisFreshnessStates", "weakestTrust", "limitingFreshness", "oldestObservedAt", "constraints", "missingPrerequisites", "derivedHash"]);
  const key = identifier(required(input, "key", path), `${path}.key`); const metadata = DERIVED_RULES.find((item) => item.outputKey === key && item.kind === "CAPABILITY"); if (!metadata) throw new ContractValidationError(`${path}.key`, "unknown capability rule output");
  const source = derived.find((item) => item.outputKey === key && item.status === "DERIVED" && item.kind === "CAPABILITY"); if (!source || source.weakestTrust === null || source.limitingFreshness === null || source.oldestObservedAt === null) throw new ContractValidationError(path, "capability has no matching derived proof");
  const expected = { key: source.outputKey, value: source.result, basisResolutionHashes: source.factRefs.map((ref) => ref.resolutionHash).sort(), basisClaimHashes: source.factRefs.flatMap((ref) => ref.claimHashes).sort(), basisTrustStates: source.basisTrustStates, basisFreshnessStates: source.basisFreshnessStates, weakestTrust: source.weakestTrust, limitingFreshness: source.limitingFreshness, oldestObservedAt: source.oldestObservedAt, constraints: source.constraints, missingPrerequisites: source.missingPrerequisites, derivedHash: source.derivedHash };
  if (canonicalJson(input) !== canonicalJson(expected)) throw new ContractValidationError(path, "capability does not exactly preserve its registered derived proof");
}

export function parseWorldKnowledgeSnapshot(value: unknown, acceptedPolicies: readonly { readonly policyVersion: string; readonly policyHash: string }[] = [UNCONFIGURED_SOURCE_POLICY]): WorldKnowledgeSnapshot {
  const input = object(value, "$", ["contractVersion", "registryVersion", "registryHash", "ruleRegistryVersion", "ruleRegistryHash", "resolvedAt", "sourcePolicyVersion", "sourcePolicyHash", "spot", "facts", "operationalRules", "currentStates", "capabilities", "derivedKnowledge", "structuralAuthorizations", "conflicts", "explicitUnknowns", "freshness", "readiness", "exclusions", "snapshotHash"]);
  if (required(input, "contractVersion") !== WORLD_KNOWLEDGE_PORT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown world knowledge port version");
  if (required(input, "registryVersion") !== REGISTRY_VERSION || required(input, "registryHash") !== REGISTRY_HASH) throw new ContractValidationError("$.registryVersion", "unknown registry identity");
  if (required(input, "ruleRegistryVersion") !== RULE_REGISTRY_VERSION || required(input, "ruleRegistryHash") !== RULE_REGISTRY_HASH) throw new ContractValidationError("$.ruleRegistryVersion", "unknown rule registry identity");
  timestamp(required(input, "resolvedAt"), "$.resolvedAt");
  const sourcePolicyVersion = string(required(input, "sourcePolicyVersion"), "$.sourcePolicyVersion", { min: 1 }); const sourcePolicyHash = hash(required(input, "sourcePolicyHash"), "$.sourcePolicyHash"); if (!acceptedPolicies.some((policy) => policy.policyVersion === sourcePolicyVersion && policy.policyHash === sourcePolicyHash)) throw new ContractValidationError("$.sourcePolicyVersion", "snapshot source policy is not accepted by caller");
  const spot = object(required(input, "spot"), "$.spot", ["spotId", "identity", "location", "classification", "publicContact"]); identifier(required(spot, "spotId", "$.spot"), "$.spot.spotId");
  const identity = object(required(spot, "identity", "$.spot"), "$.spot.identity", ["name"]); parseStructuralValue("identity.name", required(identity, "name", "$.spot.identity"), "$.spot.identity.name");
  const location = object(required(spot, "location", "$.spot"), "$.spot.location", ["addressLine1", "locality", "neighborhood", "countryCode", "latitude", "longitude", "timezone"]);
  const locationKeys = { addressLine1: "location.address_line1", locality: "location.locality", neighborhood: "location.neighborhood", countryCode: "location.country_code", latitude: "location.latitude", longitude: "location.longitude", timezone: "location.timezone" } as const; for (const [field, key] of Object.entries(locationKeys)) parseStructuralValue(key, required(location, field, "$.spot.location"), `$.spot.location.${field}`);
  const classification = object(required(spot, "classification", "$.spot"), "$.spot.classification", ["primaryCategory", "placeTypes"]); parseStructuralValue("classification.primary_category", required(classification, "primaryCategory", "$.spot.classification"), "$.spot.classification.primaryCategory"); parseStructuralValue("classification.place_types", required(classification, "placeTypes", "$.spot.classification"), "$.spot.classification.placeTypes");
  const publicContact = object(required(spot, "publicContact", "$.spot"), "$.spot.publicContact", ["website", "phone", "instagram", "facebook", "linkedin", "tiktok"]); for (const key of ["website", "phone", "instagram", "facebook", "linkedin", "tiktok"] as const) parseStructuralValue(`contact.${key}`, required(publicContact, key, "$.spot.publicContact"), `$.spot.publicContact.${key}`);
  const factRows = array(required(input, "facts"), "$.facts").map((entry, index) => parseEntry(entry, `$.facts[${index}]`, "FACT")); const operationalRows = array(required(input, "operationalRules"), "$.operationalRules").map((entry, index) => parseEntry(entry, `$.operationalRules[${index}]`, "OPERATIONAL_RULE")); const currentStateRows = array(required(input, "currentStates"), "$.currentStates").map((entry, index) => parseEntry(entry, `$.currentStates[${index}]`, "CURRENT_STATE"));
  const derived = array(required(input, "derivedKnowledge"), "$.derivedKnowledge", { min: DERIVED_RULES.length, max: DERIVED_RULES.length }).map(parseDerivedKnowledge); if (new Set(derived.map((item) => item.ruleId)).size !== DERIVED_RULES.length) throw new ContractValidationError("$.derivedKnowledge", "each registered rule must occur exactly once");
  const structuralRows = array(required(input, "structuralAuthorizations"), "$.structuralAuthorizations").map((entry, index) => { const path = `$.structuralAuthorizations[${index}]`; const row = object(entry, path, ["key", "authorizedUseCases", "sourceAssessmentHashes"]); const key = identifier(required(row, "key", path), `${path}.key`); if (!structuralKeys.has(key)) throw new ContractValidationError(`${path}.key`, "not a structural key"); const authorizedUseCases = array(required(row, "authorizedUseCases", path), `${path}.authorizedUseCases`).map((useCase, useCaseIndex) => enumValue(useCase, SOURCE_USE_CASES, `${path}.authorizedUseCases[${useCaseIndex}]`)); const sourceAssessmentHashes = array(required(row, "sourceAssessmentHashes", path), `${path}.sourceAssessmentHashes`, { min: 1 }).map((item, hashIndex) => hash(item, `${path}.sourceAssessmentHashes[${hashIndex}]`)); return { key, authorizedUseCases, sourceAssessmentHashes }; });
  const capabilityInputs = array(required(input, "capabilities"), "$.capabilities"); capabilityInputs.forEach((entry, index) => parseCapability(entry, `$.capabilities[${index}]`, derived));
  const expectedCapabilityKeys = derived.filter((item) => item.status === "DERIVED" && item.kind === "CAPABILITY").map((item) => item.outputKey).sort(); const actualCapabilityKeys = capabilityInputs.map((entry, index) => identifier(required(object(entry, `$.capabilities[${index}]`), "key", `$.capabilities[${index}]`), `$.capabilities[${index}].key`)).sort(); if (canonicalJson(expectedCapabilityKeys) !== canonicalJson(actualCapabilityKeys)) throw new ContractValidationError("$.capabilities", "capabilities must exactly match derived capability results");
  array(required(input, "conflicts"), "$.conflicts").forEach((entry, index) => { const path = `$.conflicts[${index}]`; const row = object(entry, path, ["code", "severity", "attributeKeys", "claimRefs", "explanation"]); enumValue(required(row, "code", path), KNOWLEDGE_CONFLICT_CODES, `${path}.code`); enumValue(required(row, "severity", path), ["INFO", "WARNING", "BLOCKING"] as const, `${path}.severity`); array(required(row, "attributeKeys", path), `${path}.attributeKeys`, { min: 1 }).forEach((key, keyIndex) => getAttributeDefinition(identifier(key, `${path}.attributeKeys[${keyIndex}]`))); array(required(row, "claimRefs", path), `${path}.claimRefs`).forEach((ref, refIndex) => identifier(ref, `${path}.claimRefs[${refIndex}]`)); string(required(row, "explanation", path), `${path}.explanation`, { min: 1 }); });
  array(required(input, "explicitUnknowns"), "$.explicitUnknowns").forEach((entry, index) => { const path = `$.explicitUnknowns[${index}]`; const row = object(entry, path, ["key", "scope"]); getAttributeDefinition(identifier(required(row, "key", path), `${path}.key`)); identifier(required(row, "scope", path), `${path}.scope`); });
  const freshness = object(required(input, "freshness"), "$.freshness", ["current", "stale", "expired"]); for (const key of ["current", "stale", "expired"] as const) number(required(freshness, key, "$.freshness"), `$.freshness.${key}`, { min: 0, integer: true });
  const readinessRows = array(required(input, "readiness"), "$.readiness", { min: READINESS_USE_CASES.length, max: READINESS_USE_CASES.length }).map((entry, index) => { const path = `$.readiness[${index}]`; const row = object(entry, path, ["useCase", "state", "reasonCodes"]); const useCase = enumValue(required(row, "useCase", path), READINESS_USE_CASES, `${path}.useCase`); const state = enumValue(required(row, "state", path), READINESS_STATES, `${path}.state`); const reasonCodes = array(required(row, "reasonCodes", path), `${path}.reasonCodes`, { min: 1 }).map((code, codeIndex) => enumValue(code, READINESS_REASON_CODES, `${path}.reasonCodes[${codeIndex}]`)); return { useCase, state, reasonCodes }; });
  if (new Set(readinessRows.map((row) => row.useCase)).size !== READINESS_USE_CASES.length) throw new ContractValidationError("$.readiness", "each readiness use case must occur exactly once");
  const ready = new Set(readinessRows.filter((row) => row.state === "READY").map((row) => row.useCase)); const allPortRows = [...factRows, ...operationalRows, ...currentStateRows]; const entryAuthorized = (key: string, useCase: SourceUseCase) => allPortRows.some((row) => row.key === key && row.authorizedUseCases.includes(useCase)); const structuralAuthorized = (key: string, useCase: SourceUseCase) => structuralRows.some((row) => row.key === key && row.authorizedUseCases.includes(useCase));
  if (sourcePolicyVersion === UNCONFIGURED_SOURCE_POLICY.policyVersion && [...ready].some((useCase) => !["BASE_PROFILE", "CLASSIFICATION"].includes(useCase))) throw new ContractValidationError("$.readiness", "unconfigured source policy cannot authorize trust-dependent readiness");
  if (ready.has("OPENING_HOURS_ELIGIBILITY") && !entryAuthorized("hours.regular", "OPENING_HOURS_ELIGIBILITY")) throw new ContractValidationError("$.readiness", "opening-hours readiness lacks policy-authorized hours");
  if (ready.has("PRICE") && !entryAuthorized("operation.price_range", "PRICE")) throw new ContractValidationError("$.readiness", "price readiness lacks policy-authorized value");
  if (ready.has("HARD_CONSTRAINTS") && !["operation.takeaway", "rule.reservation", "rule.external_food", "rule.external_drink"].every((key) => entryAuthorized(key, "HARD_CONSTRAINTS"))) throw new ContractValidationError("$.readiness", "hard-constraint readiness lacks policy-authorized values");
  if (ready.has("ACCESSIBILITY") && !["accessibility.step_free_entrance", "accessibility.wheelchair_paths", "accessibility.accessible_seating", "accessibility.accessible_toilet"].every((key) => entryAuthorized(key, "ACCESSIBILITY"))) throw new ContractValidationError("$.readiness", "accessibility readiness lacks policy-authorized values");
  if (ready.has("DISCOVERY") && !["identity.name", "location.address_line1", "location.locality", "location.latitude", "location.longitude", "location.timezone", "classification.primary_category"].every((key) => structuralAuthorized(key, "DISCOVERY"))) throw new ContractValidationError("$.readiness", "discovery readiness lacks policy-authorized structural values");
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
