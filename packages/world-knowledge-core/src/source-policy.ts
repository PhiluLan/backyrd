import { hashBody } from "./canonical.js";
import { ACTOR_TYPES, SOURCE_TYPES, type ActorType, type SourceType, type WorldKnowledgeClaim } from "./contracts.js";
import { ATTRIBUTE_DEFINITIONS, REGISTRY_HASH, REGISTRY_VERSION } from "./registry.js";
import { array, boolean, ContractValidationError, enumValue, hash, identifier, object, required, string, timestamp } from "./schema.js";

export const SOURCE_POLICY_CONTRACT_VERSION = "backyrd.world-knowledge.source-policy@1.0" as const;
export const SOURCE_POLICY_VERSION = "backyrd.world-knowledge.source-policy@1.0-unconfigured" as const;
export const POLICY_STATES = ["CONFIGURED", "NOT_CONFIGURED"] as const;
export const FRESHNESS_MODES = ["PERMANENT_UNTIL_CONTRADICTED", "KNOWN_VALID_UNTIL", "REVERIFICATION_REQUIRED", "REQUIRES_VALID_UNTIL", "SCHEDULE_BOUND", "NOT_CONFIGURED"] as const;
export const CONFLICT_POLICY_MODES = ["UNRESOLVED_FAIL_CLOSED", "RETAIN_ALTERNATIVES", "POLICY_SELECTED_WITH_ALTERNATIVES"] as const;
export const SOURCE_USE_CASES = ["GENERAL_WORLD", "DISCOVERY", "OPENING_HOURS_ELIGIBILITY", "PRICE", "HARD_CONSTRAINTS", "ACCESSIBILITY", "INTENT_MATCHING", "EXPLANATION", "RESEARCH"] as const;
export type SourceUseCase = typeof SOURCE_USE_CASES[number];

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

const defaultUseCases = (attributeKey: string): Record<SourceUseCase, "ALLOWED" | "REQUIRES_POLICY" | "PROHIBITED"> => {
  const contact = attributeKey.startsWith("contact."); const explanation = attributeKey === "description.highlight" || attributeKey === "research.subjective_fits";
  return {
    GENERAL_WORLD: contact || explanation ? "ALLOWED" : "REQUIRES_POLICY", DISCOVERY: "REQUIRES_POLICY", OPENING_HOURS_ELIGIBILITY: "REQUIRES_POLICY", PRICE: "REQUIRES_POLICY", HARD_CONSTRAINTS: "REQUIRES_POLICY", ACCESSIBILITY: "REQUIRES_POLICY", INTENT_MATCHING: "REQUIRES_POLICY",
    EXPLANATION: contact || explanation ? "ALLOWED" : "REQUIRES_POLICY", RESEARCH: "ALLOWED",
  };
};

export function createSourcePolicy(inputValue: unknown): SourcePolicy {
  const input = object(inputValue, "$", ["policyVersion", "registryVersion", "registryHash", "createdAt", "entries"]);
  if (required(input, "registryVersion") !== REGISTRY_VERSION) throw new ContractValidationError("$.registryVersion", "unknown registry version");
  if (hash(required(input, "registryHash"), "$.registryHash") !== REGISTRY_HASH) throw new ContractValidationError("$.registryHash", "registry hash mismatch");
  const entries = array(required(input, "entries"), "$.entries", { min: 1 }).map((value, index): SourcePolicyEntry => {
    const path = `$.entries[${index}]`; const item = object(value, path, ["attributeKey", "state", "allowedSourceTypes", "allowedActorTypes", "sourceReference", "selfAssertionAllowed", "verificationProcess", "freshness", "conflictPolicy", "useCases"]);
    const attributeKey = identifier(required(item, "attributeKey", path), `${path}.attributeKey`);
    if (!ATTRIBUTE_DEFINITIONS.some((definition) => definition.key === attributeKey)) throw new ContractValidationError(`${path}.attributeKey`, "unknown attribute key");
    const process = object(required(item, "verificationProcess", path), `${path}.verificationProcess`, ["requirement", "allowedProcessIds"]); const freshness = object(required(item, "freshness", path), `${path}.freshness`, ["policyRef", "mode"]); const useCasesInput = object(required(item, "useCases", path), `${path}.useCases`, SOURCE_USE_CASES);
    const useCases = Object.fromEntries(SOURCE_USE_CASES.map((useCase) => [useCase, enumValue(required(useCasesInput, useCase, `${path}.useCases`), ["ALLOWED", "REQUIRES_POLICY", "PROHIBITED"] as const, `${path}.useCases.${useCase}`)])) as unknown as SourcePolicyEntry["useCases"];
    return { attributeKey, state: enumValue(required(item, "state", path), POLICY_STATES, `${path}.state`), allowedSourceTypes: array(required(item, "allowedSourceTypes", path), `${path}.allowedSourceTypes`).map((entry, i) => enumValue(entry, SOURCE_TYPES, `${path}.allowedSourceTypes[${i}]`)).sort(), allowedActorTypes: array(required(item, "allowedActorTypes", path), `${path}.allowedActorTypes`).map((entry, i) => enumValue(entry, ACTOR_TYPES, `${path}.allowedActorTypes[${i}]`)).sort(), sourceReference: enumValue(required(item, "sourceReference", path), ["OPTIONAL", "REQUIRED", "FORBIDDEN"] as const, `${path}.sourceReference`), selfAssertionAllowed: boolean(required(item, "selfAssertionAllowed", path), `${path}.selfAssertionAllowed`), verificationProcess: { requirement: enumValue(required(process, "requirement", `${path}.verificationProcess`), ["NONE", "PROCESS_REQUIRED", "NOT_CONFIGURED"] as const, `${path}.verificationProcess.requirement`), allowedProcessIds: array(required(process, "allowedProcessIds", `${path}.verificationProcess`), `${path}.verificationProcess.allowedProcessIds`).map((entry, i) => identifier(entry, `${path}.verificationProcess.allowedProcessIds[${i}]`)).sort() }, freshness: { policyRef: identifier(required(freshness, "policyRef", `${path}.freshness`), `${path}.freshness.policyRef`), mode: enumValue(required(freshness, "mode", `${path}.freshness`), FRESHNESS_MODES, `${path}.freshness.mode`) }, conflictPolicy: enumValue(required(item, "conflictPolicy", path), CONFLICT_POLICY_MODES, `${path}.conflictPolicy`), useCases };
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

export const UNCONFIGURED_SOURCE_POLICY = createSourcePolicy({ policyVersion: SOURCE_POLICY_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, createdAt: "2026-09-10T12:00:00.000Z", entries: ATTRIBUTE_DEFINITIONS.map((definition) => ({ attributeKey: definition.key, state: "NOT_CONFIGURED", allowedSourceTypes: SOURCE_TYPES, allowedActorTypes: ACTOR_TYPES, sourceReference: "OPTIONAL", selfAssertionAllowed: true, verificationProcess: { requirement: "NOT_CONFIGURED", allowedProcessIds: [] }, freshness: { policyRef: `freshness:not-configured:${definition.key}`, mode: definition.kind === "CURRENT_STATE" ? "REQUIRES_VALID_UNTIL" : "NOT_CONFIGURED" }, conflictPolicy: "UNRESOLVED_FAIL_CLOSED", useCases: defaultUseCases(definition.key) })) });

export function evaluateClaimSource(claim: WorldKnowledgeClaim, policyValue: unknown): { readonly status: "ASSERTED" | "REFERENCED" | "REQUIRES_REVIEW" | "REJECTED"; readonly reasonCodes: readonly string[] } {
  const policy = parseSourcePolicy(policyValue); const entry = policy.entries.find((item) => item.attributeKey === claim.attributeKey); if (!entry) throw new ContractValidationError("$.attributeKey", "source policy missing attribute");
  const reasons: string[] = []; if (entry.state === "NOT_CONFIGURED") reasons.push("SOURCE_POLICY_NOT_CONFIGURED"); if (!entry.allowedSourceTypes.includes(claim.sourceType)) reasons.push("SOURCE_TYPE_NOT_ALLOWED"); if (!entry.allowedActorTypes.includes(claim.actorType)) reasons.push("ACTOR_TYPE_NOT_ALLOWED"); if (entry.sourceReference === "REQUIRED" && !claim.sourceReferenceId) reasons.push("SOURCE_REFERENCE_REQUIRED"); if (entry.sourceReference === "FORBIDDEN" && claim.sourceReferenceId) reasons.push("SOURCE_REFERENCE_FORBIDDEN");
  if (reasons.some((code) => code.endsWith("NOT_ALLOWED") || code.endsWith("REQUIRED") || code.endsWith("FORBIDDEN"))) return { status: "REJECTED", reasonCodes: reasons.sort() };
  if (entry.state === "NOT_CONFIGURED") return { status: "REQUIRES_REVIEW", reasonCodes: reasons.sort() };
  return { status: claim.sourceReferenceId ? "REFERENCED" : "ASSERTED", reasonCodes: [claim.sourceReferenceId ? "BOUND_SOURCE_REFERENCE" : "SELF_ASSERTION" ] };
}

export function sourceReadiness(attributeKeys: readonly string[], useCase: SourceUseCase, policyValue: unknown): { readonly status: "READY" | "PARTIAL" | "NOT_READY"; readonly reasonCodes: readonly string[] } {
  const policy = parseSourcePolicy(policyValue); const entries = attributeKeys.map((key) => policy.entries.find((entry) => entry.attributeKey === key));
  if (entries.some((entry) => !entry)) return { status: "NOT_READY", reasonCodes: ["ATTRIBUTE_POLICY_MISSING"] };
  if (entries.some((entry) => entry!.useCases[useCase] === "PROHIBITED")) return { status: "NOT_READY", reasonCodes: ["USE_CASE_PROHIBITED"] };
  if (entries.some((entry) => entry!.state === "NOT_CONFIGURED" || entry!.useCases[useCase] === "REQUIRES_POLICY" || entry!.freshness.mode === "NOT_CONFIGURED")) return { status: "PARTIAL", reasonCodes: ["SOURCE_OR_FRESHNESS_POLICY_NOT_CONFIGURED"] };
  return { status: "READY", reasonCodes: ["POLICY_REQUIREMENTS_CONFIGURED"] };
}
