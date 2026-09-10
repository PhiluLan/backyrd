import { canonicalJson, hashBody } from "./canonical.js";
import { ACTOR_TYPES, SOURCE_TYPES, type ActorType, type SourceType, type TrustState, type WorldKnowledgeClaim } from "./contracts.js";
import { ATTRIBUTE_DEFINITIONS, REGISTRY_HASH, REGISTRY_VERSION } from "./registry.js";
import { array, boolean, ContractValidationError, enumValue, hash, identifier, object, required, string, timestamp } from "./schema.js";

export const SOURCE_POLICY_CONTRACT_VERSION = "backyrd.world-knowledge.source-policy@1.0" as const;
export const SOURCE_POLICY_VERSION = "backyrd.world-knowledge.source-policy@1.0-unconfigured" as const;
export const SOURCE_ASSESSMENT_CONTRACT_VERSION = "backyrd.world-knowledge.source-assessment@1.0" as const;
export const POLICY_STATES = ["CONFIGURED", "NOT_CONFIGURED"] as const;
export const FRESHNESS_MODES = ["PERMANENT_UNTIL_CONTRADICTED", "KNOWN_VALID_UNTIL", "REVERIFICATION_REQUIRED", "REQUIRES_VALID_UNTIL", "SCHEDULE_BOUND", "NOT_CONFIGURED"] as const;
export const CONFLICT_POLICY_MODES = ["UNRESOLVED_FAIL_CLOSED", "RETAIN_ALTERNATIVES", "POLICY_SELECTED_WITH_ALTERNATIVES"] as const;
export const SOURCE_USE_CASES = ["GENERAL_WORLD", "DISCOVERY", "OPENING_HOURS_ELIGIBILITY", "PRICE", "HARD_CONSTRAINTS", "ACCESSIBILITY", "INTENT_MATCHING", "EXPLANATION", "RESEARCH"] as const;
export const SOURCE_ASSESSMENT_STATUSES = ["AUTHORIZED", "REQUIRES_REVIEW", "REJECTED"] as const;
export const USE_CASE_AUTHORIZATIONS = ["AUTHORIZED", "REQUIRES_POLICY", "PROHIBITED"] as const;
export type SourceUseCase = typeof SOURCE_USE_CASES[number];
export type SourceAssessmentStatus = typeof SOURCE_ASSESSMENT_STATUSES[number];
export type UseCaseAuthorization = typeof USE_CASE_AUTHORIZATIONS[number];
type MinimumTrust = Exclude<TrustState, "CONFLICTING"> | null;

export interface SourcePolicyEntry {
  readonly attributeKey: string;
  readonly state: typeof POLICY_STATES[number];
  readonly allowedSourceTypes: readonly SourceType[];
  readonly allowedActorTypes: readonly ActorType[];
  readonly sourceReference: "OPTIONAL" | "REQUIRED" | "FORBIDDEN";
  readonly selfAssertionAllowed: boolean;
  readonly verificationProcess: { readonly requirement: "NONE" | "PROCESS_REQUIRED" | "NOT_CONFIGURED"; readonly allowedProcessIds: readonly string[] };
  readonly freshness: { readonly policyRef: string; readonly mode: typeof FRESHNESS_MODES[number] };
  readonly conflictPolicy: typeof CONFLICT_POLICY_MODES[number];
  readonly useCases: Readonly<Record<SourceUseCase, "ALLOWED" | "REQUIRES_POLICY" | "PROHIBITED">>;
  readonly minimumTrustByUseCase: Readonly<Record<SourceUseCase, MinimumTrust>>;
}

export interface SourcePolicy {
  readonly contractVersion: typeof SOURCE_POLICY_CONTRACT_VERSION;
  readonly policyVersion: string;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly registryHash: string;
  readonly createdAt: string;
  readonly entries: readonly SourcePolicyEntry[];
  readonly policyHash: string;
}

export interface ClaimSourceAssessment {
  readonly contractVersion: typeof SOURCE_ASSESSMENT_CONTRACT_VERSION;
  readonly policyVersion: string;
  readonly policyHash: string;
  readonly claimId: string;
  readonly claimHash: string;
  readonly attributeKey: string;
  readonly status: SourceAssessmentStatus;
  readonly trust: Exclude<TrustState, "CONFLICTING">;
  readonly freshnessPolicyRef: string;
  readonly freshnessMode: typeof FRESHNESS_MODES[number];
  readonly useCaseAuthorizations: Readonly<Record<SourceUseCase, UseCaseAuthorization>>;
  readonly reasonCodes: readonly string[];
  readonly assessmentHash: string;
}

const trustRank: Readonly<Record<Exclude<TrustState, "CONFLICTING">, number>> = { ASSERTED: 0, REFERENCED: 1, VERIFIED: 2 };
const assertionSources = new Set<SourceType>(["OWNER_ASSERTION", "ADMIN_OBSERVATION", "USER_REPORT", "AI_INFERENCE", "LEGACY_IMPORT"]);

const defaultUseCases = (attributeKey: string): Record<SourceUseCase, "ALLOWED" | "REQUIRES_POLICY" | "PROHIBITED"> => {
  const contact = attributeKey.startsWith("contact."); const explanation = attributeKey === "description.highlight" || attributeKey === "research.subjective_fits";
  return {
    GENERAL_WORLD: contact || explanation ? "ALLOWED" : "REQUIRES_POLICY", DISCOVERY: "REQUIRES_POLICY", OPENING_HOURS_ELIGIBILITY: "REQUIRES_POLICY", PRICE: "REQUIRES_POLICY", HARD_CONSTRAINTS: "REQUIRES_POLICY", ACCESSIBILITY: "REQUIRES_POLICY", INTENT_MATCHING: "REQUIRES_POLICY",
    EXPLANATION: contact || explanation ? "ALLOWED" : "REQUIRES_POLICY", RESEARCH: "ALLOWED",
  };
};

const defaultMinimumTrust = (): Record<SourceUseCase, MinimumTrust> => Object.fromEntries(SOURCE_USE_CASES.map((useCase) => [useCase, null])) as Record<SourceUseCase, MinimumTrust>;

function parseUseCaseRecord<T extends string | null>(value: unknown, path: string, parse: (entry: unknown, entryPath: string) => T): Readonly<Record<SourceUseCase, T>> {
  const input = object(value, path, SOURCE_USE_CASES);
  return Object.fromEntries(SOURCE_USE_CASES.map((useCase) => [useCase, parse(required(input, useCase, path), `${path}.${useCase}`)])) as Readonly<Record<SourceUseCase, T>>;
}

export function createSourcePolicy(inputValue: unknown): SourcePolicy {
  const input = object(inputValue, "$", ["policyVersion", "registryVersion", "registryHash", "createdAt", "entries"]);
  if (required(input, "registryVersion") !== REGISTRY_VERSION) throw new ContractValidationError("$.registryVersion", "unknown registry version");
  if (hash(required(input, "registryHash"), "$.registryHash") !== REGISTRY_HASH) throw new ContractValidationError("$.registryHash", "registry hash mismatch");
  const entries = array(required(input, "entries"), "$.entries", { min: 1 }).map((value, index): SourcePolicyEntry => {
    const path = `$.entries[${index}]`; const item = object(value, path, ["attributeKey", "state", "allowedSourceTypes", "allowedActorTypes", "sourceReference", "selfAssertionAllowed", "verificationProcess", "freshness", "conflictPolicy", "useCases", "minimumTrustByUseCase"]);
    const attributeKey = identifier(required(item, "attributeKey", path), `${path}.attributeKey`);
    if (!ATTRIBUTE_DEFINITIONS.some((definition) => definition.key === attributeKey)) throw new ContractValidationError(`${path}.attributeKey`, "unknown attribute key");
    const process = object(required(item, "verificationProcess", path), `${path}.verificationProcess`, ["requirement", "allowedProcessIds"]); const freshness = object(required(item, "freshness", path), `${path}.freshness`, ["policyRef", "mode"]);
    const useCases = parseUseCaseRecord(required(item, "useCases", path), `${path}.useCases`, (entry, entryPath) => enumValue(entry, ["ALLOWED", "REQUIRES_POLICY", "PROHIBITED"] as const, entryPath));
    const minimumTrustByUseCase = parseUseCaseRecord(required(item, "minimumTrustByUseCase", path), `${path}.minimumTrustByUseCase`, (entry, entryPath) => entry === null ? null : enumValue(entry, ["ASSERTED", "REFERENCED", "VERIFIED"] as const, entryPath));
    const state = enumValue(required(item, "state", path), POLICY_STATES, `${path}.state`);
    if (state === "NOT_CONFIGURED" && SOURCE_USE_CASES.some((useCase) => useCases[useCase] === "ALLOWED" && !["GENERAL_WORLD", "EXPLANATION", "RESEARCH"].includes(useCase))) throw new ContractValidationError(`${path}.useCases`, "unconfigured policy cannot authorize trust-dependent use cases");
    return { attributeKey, state, allowedSourceTypes: array(required(item, "allowedSourceTypes", path), `${path}.allowedSourceTypes`).map((entry, i) => enumValue(entry, SOURCE_TYPES, `${path}.allowedSourceTypes[${i}]`)).sort(), allowedActorTypes: array(required(item, "allowedActorTypes", path), `${path}.allowedActorTypes`).map((entry, i) => enumValue(entry, ACTOR_TYPES, `${path}.allowedActorTypes[${i}]`)).sort(), sourceReference: enumValue(required(item, "sourceReference", path), ["OPTIONAL", "REQUIRED", "FORBIDDEN"] as const, `${path}.sourceReference`), selfAssertionAllowed: boolean(required(item, "selfAssertionAllowed", path), `${path}.selfAssertionAllowed`), verificationProcess: { requirement: enumValue(required(process, "requirement", `${path}.verificationProcess`), ["NONE", "PROCESS_REQUIRED", "NOT_CONFIGURED"] as const, `${path}.verificationProcess.requirement`), allowedProcessIds: array(required(process, "allowedProcessIds", `${path}.verificationProcess`), `${path}.verificationProcess.allowedProcessIds`).map((entry, i) => identifier(entry, `${path}.verificationProcess.allowedProcessIds[${i}]`)).sort() }, freshness: { policyRef: identifier(required(freshness, "policyRef", `${path}.freshness`), `${path}.freshness.policyRef`), mode: enumValue(required(freshness, "mode", `${path}.freshness`), FRESHNESS_MODES, `${path}.freshness.mode`) }, conflictPolicy: enumValue(required(item, "conflictPolicy", path), CONFLICT_POLICY_MODES, `${path}.conflictPolicy`), useCases, minimumTrustByUseCase };
  }).sort((a, b) => a.attributeKey.localeCompare(b.attributeKey));
  if (new Set(entries.map((entry) => entry.attributeKey)).size !== entries.length) throw new ContractValidationError("$.entries", "duplicate attribute policy");
  const body = { contractVersion: SOURCE_POLICY_CONTRACT_VERSION, policyVersion: string(required(input, "policyVersion"), "$.policyVersion", { min: 1 }), registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, createdAt: timestamp(required(input, "createdAt"), "$.createdAt"), entries };
  return { ...body, policyHash: hashBody(body, []) };
}

export function parseSourcePolicy(value: unknown): SourcePolicy {
  const input = object(value, "$", ["contractVersion", "policyVersion", "registryVersion", "registryHash", "createdAt", "entries", "policyHash"]);
  if (required(input, "contractVersion") !== SOURCE_POLICY_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown source policy contract");
  const { contractVersion: _contract, policyHash: supplied, ...draft } = input; const parsed = createSourcePolicy(draft);
  if (parsed.policyHash !== hash(supplied, "$.policyHash")) throw new ContractValidationError("$.policyHash", "policy hash mismatch"); return parsed;
}

export const UNCONFIGURED_SOURCE_POLICY = createSourcePolicy({ policyVersion: SOURCE_POLICY_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, createdAt: "2026-09-10T12:00:00.000Z", entries: ATTRIBUTE_DEFINITIONS.map((definition) => ({ attributeKey: definition.key, state: "NOT_CONFIGURED", allowedSourceTypes: SOURCE_TYPES, allowedActorTypes: ACTOR_TYPES, sourceReference: "OPTIONAL", selfAssertionAllowed: true, verificationProcess: { requirement: "NOT_CONFIGURED", allowedProcessIds: [] }, freshness: { policyRef: `freshness:not-configured:${definition.key}`, mode: definition.kind === "CURRENT_STATE" ? "REQUIRES_VALID_UNTIL" : "NOT_CONFIGURED" }, conflictPolicy: "UNRESOLVED_FAIL_CLOSED", useCases: defaultUseCases(definition.key), minimumTrustByUseCase: defaultMinimumTrust() })) });

function freshnessReasons(claim: WorldKnowledgeClaim, entry: SourcePolicyEntry): string[] {
  if (entry.freshness.mode === "NOT_CONFIGURED") return ["FRESHNESS_POLICY_NOT_CONFIGURED"];
  if (["KNOWN_VALID_UNTIL", "REQUIRES_VALID_UNTIL"].includes(entry.freshness.mode) && claim.validUntil === null) return ["VALID_UNTIL_REQUIRED"];
  return [];
}

export function evaluateClaimSource(claim: WorldKnowledgeClaim, policyValue: unknown, verified = false): ClaimSourceAssessment {
  const policy = parseSourcePolicy(policyValue); const entry = policy.entries.find((item) => item.attributeKey === claim.attributeKey); if (!entry) throw new ContractValidationError("$.attributeKey", "source policy missing attribute");
  const reasons: string[] = [];
  if (entry.state === "NOT_CONFIGURED") reasons.push("SOURCE_POLICY_NOT_CONFIGURED");
  if (!entry.allowedSourceTypes.includes(claim.sourceType)) reasons.push("SOURCE_TYPE_NOT_ALLOWED");
  if (!entry.allowedActorTypes.includes(claim.actorType)) reasons.push("ACTOR_TYPE_NOT_ALLOWED");
  if (entry.sourceReference === "REQUIRED" && !claim.sourceReferenceId) reasons.push("SOURCE_REFERENCE_REQUIRED");
  if (entry.sourceReference === "FORBIDDEN" && claim.sourceReferenceId) reasons.push("SOURCE_REFERENCE_FORBIDDEN");
  if (assertionSources.has(claim.sourceType) && !entry.selfAssertionAllowed) reasons.push("SELF_ASSERTION_NOT_ALLOWED");
  reasons.push(...freshnessReasons(claim, entry));
  const rejected = reasons.some((code) => ["SOURCE_TYPE_NOT_ALLOWED", "ACTOR_TYPE_NOT_ALLOWED", "SOURCE_REFERENCE_REQUIRED", "SOURCE_REFERENCE_FORBIDDEN", "SELF_ASSERTION_NOT_ALLOWED"].includes(code));
  const status: SourceAssessmentStatus = rejected ? "REJECTED" : entry.state === "NOT_CONFIGURED" ? "REQUIRES_REVIEW" : "AUTHORIZED";
  const trust: Exclude<TrustState, "CONFLICTING"> = verified ? "VERIFIED" : claim.sourceReferenceId && !assertionSources.has(claim.sourceType) && status === "AUTHORIZED" ? "REFERENCED" : "ASSERTED";
  const useCaseAuthorizations = Object.fromEntries(SOURCE_USE_CASES.map((useCase): [SourceUseCase, UseCaseAuthorization] => {
    const configured = entry.state === "CONFIGURED" && entry.freshness.mode !== "NOT_CONFIGURED";
    const minimum = entry.minimumTrustByUseCase[useCase];
    if (status === "REJECTED" || entry.useCases[useCase] === "PROHIBITED") return [useCase, "PROHIBITED"];
    if (!configured || entry.useCases[useCase] !== "ALLOWED" || minimum === null || trustRank[trust] < trustRank[minimum]) return [useCase, "REQUIRES_POLICY"];
    return [useCase, "AUTHORIZED"];
  })) as Readonly<Record<SourceUseCase, UseCaseAuthorization>>;
  const finalReasons = [...new Set([...reasons, ...(status === "AUTHORIZED" ? [trust === "VERIFIED" ? "AUTHORIZED_VERIFICATION" : trust === "REFERENCED" ? "AUTHORIZED_BOUND_REFERENCE" : "AUTHORIZED_ASSERTION"] : [])])].sort();
  const body = { contractVersion: SOURCE_ASSESSMENT_CONTRACT_VERSION, policyVersion: policy.policyVersion, policyHash: policy.policyHash, claimId: claim.claimId, claimHash: claim.contentHash, attributeKey: claim.attributeKey, status, trust, freshnessPolicyRef: entry.freshness.policyRef, freshnessMode: entry.freshness.mode, useCaseAuthorizations, reasonCodes: finalReasons };
  return { ...body, assessmentHash: hashBody(body, []) };
}

export function parseClaimSourceAssessment(value: unknown, claim: WorldKnowledgeClaim, policy: SourcePolicy, verified = false): ClaimSourceAssessment {
  const input = object(value, "$", ["contractVersion", "policyVersion", "policyHash", "claimId", "claimHash", "attributeKey", "status", "trust", "freshnessPolicyRef", "freshnessMode", "useCaseAuthorizations", "reasonCodes", "assessmentHash"]);
  if (required(input, "contractVersion") !== SOURCE_ASSESSMENT_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown source assessment contract");
  hash(required(input, "assessmentHash"), "$.assessmentHash");
  const expected = evaluateClaimSource(claim, policy, verified);
  if (canonicalJson(input) !== canonicalJson(expected)) throw new ContractValidationError("$", "source assessment does not match deterministic policy evaluation");
  return expected;
}

export function sourceReadiness(claims: readonly WorldKnowledgeClaim[], useCase: SourceUseCase, policyValue: unknown, verifiedClaimIds: ReadonlySet<string> = new Set()): { readonly status: "READY" | "PARTIAL" | "NOT_READY"; readonly reasonCodes: readonly string[] } {
  if (!claims.length) return { status: "NOT_READY", reasonCodes: ["REQUIRED_CLAIMS_MISSING"] };
  const assessments = claims.map((claim) => evaluateClaimSource(claim, policyValue, verifiedClaimIds.has(claim.claimId)));
  if (assessments.some((item) => item.useCaseAuthorizations[useCase] === "PROHIBITED")) return { status: "NOT_READY", reasonCodes: [...new Set(assessments.flatMap((item) => item.reasonCodes))].sort() };
  if (assessments.some((item) => item.useCaseAuthorizations[useCase] !== "AUTHORIZED")) return { status: "PARTIAL", reasonCodes: [...new Set(assessments.flatMap((item) => item.reasonCodes).concat("CLAIM_POLICY_REQUIREMENTS_UNMET"))].sort() };
  return { status: "READY", reasonCodes: ["CLAIMS_POLICY_AUTHORIZED"] };
}
