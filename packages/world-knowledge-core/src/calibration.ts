import { hashBody } from "./canonical.js";
import { parseClaim, RESOLUTION_CONTRACT_VERSION, WORLD_KNOWLEDGE_PORT_VERSION, type WorldKnowledgeClaim } from "./contracts.js";
import { projectForDecision } from "./legacy-adapter.js";
import { buildWorldKnowledgeSnapshot, parseBuildWorldKnowledgeInput } from "./port.js";
import { ATTRIBUTE_DEFINITIONS, REGISTRY_HASH, REGISTRY_VERSION, type FoundationArea } from "./registry.js";
import { resolveWorldKnowledge } from "./resolver.js";
import {
  SOURCE_USE_CASES, UNCONFIGURED_SOURCE_POLICY, createSourcePolicy, parseSourcePolicy,
  type SourcePolicy, type SourceUseCase,
} from "./source-policy.js";
import { ContractValidationError, enumValue, object, required, timestamp } from "./schema.js";

export const POLICY_CALIBRATION_CONTRACT_VERSION = "backyrd.world-knowledge.policy-calibration@1.0" as const;
export const POLICY_CALIBRATION_STATE = "DRAFT_CANDIDATE" as const;
export const DRAFT_POLICY_STRATEGIES = ["BALANCED_REFERENCE", "CONSERVATIVE_VERIFICATION"] as const;
export type DraftPolicyStrategy = typeof DRAFT_POLICY_STRATEGIES[number];

export const SOURCE_LANDSCAPE = Object.freeze([
  { key: "OWNER_ASSERTION", proves: "An authorized owner asserted a value", referenced: false, verifiedAlone: false, risks: ["self-interest", "staleness"] },
  { key: "ADMIN_OBSERVATION", proves: "An admin recorded an observation", referenced: false, verifiedAlone: false, risks: ["human error", "staleness"] },
  { key: "OFFICIAL_WEBSITE", proves: "The official spot page published matching content", referenced: true, verifiedAlone: false, risks: ["outdated page", "identity mismatch"] },
  { key: "OFFICIAL_SOCIAL", proves: "An official social profile published matching content", referenced: true, verifiedAlone: false, risks: ["ephemeral content", "account impersonation"] },
  { key: "OFFICIAL_DOCUMENT", proves: "A bound official document contains the value", referenced: true, verifiedAlone: false, risks: ["document expiry", "scope ambiguity"] },
  { key: "PUBLIC_PROVIDER", proves: "A named provider returned the value", referenced: true, verifiedAlone: false, risks: ["provider lag", "record mismatch"] },
  { key: "MUNICIPAL_SOURCE", proves: "A public authority record contains the value", referenced: true, verifiedAlone: false, risks: ["different legal scope", "update lag"] },
  { key: "INDEPENDENT_MANUAL_CHECK", proves: "An independent verifier observed or cross-checked the value", referenced: true, verifiedAlone: false, risks: ["execution quality", "limited observation window"] },
  { key: "SYSTEM_CHECK", proves: "A deterministic consistency or reachability check passed", referenced: true, verifiedAlone: false, risks: ["checks syntax, not full reality"] },
  { key: "RESEARCH_IMPORT", proves: "Research supplied a candidate with lineage", referenced: true, verifiedAlone: false, risks: ["transformation error", "source licensing"] },
  { key: "USER_REPORT", proves: "A public contributor reported an observation", referenced: false, verifiedAlone: false, risks: ["abuse", "context loss"] },
  { key: "LEGACY_IMPORT", proves: "A value existed in a named legacy system", referenced: false, verifiedAlone: false, risks: ["missing provenance", "semantic drift"] },
  { key: "AI_INFERENCE", proves: "A model proposed a candidate", referenced: false, verifiedAlone: false, risks: ["hallucination", "non-reproducible external context"] },
]);

export const VERIFICATION_PROCESS_CANDIDATES = Object.freeze([
  { processId: "draft:owner-relationship-assertion", attributeFamilies: ["SPOT_IDENTITY", "PUBLIC_CONTACT"], authorityClass: "OWNER_RELATIONSHIP_AUTHORITY", independent: false, outcomes: ["INCONCLUSIVE", "REQUIRES_REVIEW"] },
  { processId: "draft:official-source-reference", attributeFamilies: ["PUBLIC_CONTACT", "REGULAR_HOURS", "SPECIAL_HOURS", "SERVICE_HOURS"], authorityClass: "SOURCE_IDENTITY_AUTHORITY", independent: false, outcomes: ["INCONCLUSIVE", "REQUIRES_REVIEW"] },
  { processId: "draft:admin-source-cross-check", attributeFamilies: ["PRIMARY_CATEGORY", "PLACE_TYPES", "OFFERING_GROUPS", "PRICE", "PAYMENT"], authorityClass: "PRODUCT_APPROVED_HUMAN_PROCESS", independent: true, outcomes: ["VERIFIED", "REJECTED", "INCONCLUSIVE", "REQUIRES_REVIEW"] },
  { processId: "draft:independent-manual-inspection", attributeFamilies: ["ACCESSIBILITY", "AMENITIES", "CAPACITY"], authorityClass: "PRODUCT_APPROVED_HUMAN_PROCESS", independent: true, outcomes: ["VERIFIED", "REJECTED", "INCONCLUSIVE", "REQUIRES_REVIEW"] },
  { processId: "draft:provider-record-match", attributeFamilies: ["LOCATION", "PUBLIC_CONTACT"], authorityClass: "PRODUCT_APPROVED_INDEPENDENT_CHECK", independent: true, outcomes: ["VERIFIED", "REJECTED", "INCONCLUSIVE"] },
  { processId: "draft:current-state-observation", attributeFamilies: ["CURRENT_STATE"], authorityClass: "PRODUCT_APPROVED_HUMAN_PROCESS", independent: false, outcomes: ["VERIFIED", "REJECTED", "REQUIRES_REVIEW"] },
]);

export const FRESHNESS_CLASS_CANDIDATES: Readonly<Record<FoundationArea, string>> = Object.freeze({
  SPOT_IDENTITY: "LONG_LIVED_RECHECK", LOCATION: "LONG_LIVED_RECHECK", PUBLIC_CONTACT: "MEDIUM_TERM_RECHECK", DESCRIPTION: "NOT_AUTOMATICALLY_ASSESSABLE",
  PRIMARY_CATEGORY: "LONG_LIVED_RECHECK", PLACE_TYPES: "LONG_LIVED_RECHECK", CUISINES: "MEDIUM_TERM_RECHECK", FOOD_SPECIALITIES: "MEDIUM_TERM_RECHECK",
  OFFERING_GROUPS: "MEDIUM_TERM_RECHECK", PRICE: "SHORT_TERM_RECHECK", PAYMENT: "MEDIUM_TERM_RECHECK", TAKEAWAY: "MEDIUM_TERM_RECHECK",
  SERVICE: "MEDIUM_TERM_RECHECK", CAPACITY: "LONG_LIVED_RECHECK", GROUP_SIZE: "MEDIUM_TERM_RECHECK", RESERVATION: "MEDIUM_TERM_RECHECK",
  EXTERNAL_CONSUMPTION: "MEDIUM_TERM_RECHECK", AMENITIES: "LONG_LIVED_RECHECK", ACCESSIBILITY: "LONG_LIVED_RECHECK", PET_ACCESS: "MEDIUM_TERM_RECHECK",
  AGE_ACCESS: "MEDIUM_TERM_RECHECK", REGULAR_HOURS: "SCHEDULE_BOUND_RECHECK", SPECIAL_HOURS: "DATE_BOUND", SERVICE_HOURS: "SCHEDULE_BOUND_RECHECK",
  CURRENT_STATE: "VALID_UNTIL_REQUIRED",
});

export const POLICY_CALIBRATION_MATRIX = Object.freeze(Object.entries(FRESHNESS_CLASS_CANDIDATES).map(([area, freshnessClass]) => ({
  area: area as FoundationArea,
  status: POLICY_CALIBRATION_STATE,
  freshnessClass,
  missingBehavior: "ABSENT_NOT_FALSE",
  unknownBehavior: "EXPLICIT_UNKNOWN_RETAINED",
  options: [
    {
      optionId: `draft:${area.toLowerCase()}:referenced`,
      actors: ["ADMIN", "VERIFIED_OWNER", "SYSTEM", "PUBLIC_CONTRIBUTOR"],
      sources: ["OFFICIAL_SOURCE", "OWNER_ASSERTION", "ADMIN_OBSERVATION", "PUBLIC_SOURCE", "LEGACY_IMPORT"],
      minimumTrust: "REFERENCED",
      effect: "A bound and policy-allowed reference can authorize only the configured use cases.",
    },
    {
      optionId: `draft:${area.toLowerCase()}:verified-sensitive`,
      actors: ["ADMIN", "VERIFIED_OWNER", "SYSTEM", "PUBLIC_CONTRIBUTOR"],
      sources: ["OFFICIAL_SOURCE", "OWNER_ASSERTION", "ADMIN_OBSERVATION", "PUBLIC_SOURCE", "LEGACY_IMPORT"],
      minimumTrust: "VERIFIED",
      effect: "Sensitive use requires a separately accepted process, execution authority and verification record.",
    },
  ],
})));

export const AUTHORITY_MATRIX = Object.freeze([
  { actor: "ANONYMOUS", read: ["PUBLIC_RESOLUTION"], assert: [], verify: false, resolveConflict: false, changeRegistry: false },
  { actor: "AUTHENTICATED_USER", read: ["PUBLIC_RESOLUTION"], assert: ["USER_REPORT"], verify: false, resolveConflict: false, changeRegistry: false },
  { actor: "VERIFIED_OWNER", read: ["OWN_SPOT_CLAIMS", "PUBLIC_RESOLUTION"], assert: ["OWN_SPOT_ALLOWED_FIELDS", "CURRENT_STATE_IF_ENTITLED"], verify: false, resolveConflict: false, changeRegistry: false },
  { actor: "ADMIN", read: ["AUTHORIZED_OPERATIONAL_SCOPE"], assert: ["ADMIN_OBSERVATION", "SOURCE_REFERENCE"], verify: false, resolveConflict: false, changeRegistry: false },
  { actor: "MODERATION_VERIFICATION", read: ["ASSIGNED_EVIDENCE"], assert: ["VERIFICATION_EXECUTION"], verify: true, resolveConflict: true, changeRegistry: false },
  { actor: "RESEARCH_IMPORT", read: ["ALLOWLISTED_SOURCE_INPUT"], assert: ["RESEARCH_CANDIDATE"], verify: false, resolveConflict: false, changeRegistry: false },
  { actor: "INTERNAL_RESOLVER", read: ["POLICY_AUTHORIZED_LEDGER"], assert: ["DERIVED_PROJECTION"], verify: false, resolveConflict: false, changeRegistry: false },
  { actor: "DECISION_CONSUMER", read: ["SANITIZED_AUTHORIZED_PROJECTION"], assert: [], verify: false, resolveConflict: false, changeRegistry: false },
  { actor: "WORLD_GOVERNANCE", read: ["REGISTRY_RELEASE_INPUTS"], assert: ["REGISTRY_RELEASE_AFTER_SEPARATE_APPROVAL"], verify: false, resolveConflict: false, changeRegistry: true },
]);

export const CONFLICT_SENSITIVITY_CANDIDATES = Object.freeze([
  { key: "OWNER_VS_OFFICIAL", selectAutomatically: false, preserveAlternatives: true, blocks: ["attribute-dependent-use-case"], moderation: "RISK_BASED" },
  { key: "ADMIN_VS_OWNER", selectAutomatically: false, preserveAlternatives: true, blocks: ["attribute-dependent-use-case"], moderation: "RISK_BASED" },
  { key: "TWO_OFFICIAL_SOURCES", selectAutomatically: false, preserveAlternatives: true, blocks: ["sensitive-use-case"], moderation: "REQUIRED_FOR_SENSITIVE_FACTS" },
  { key: "CURRENT_STATE_VS_DURABLE_FACT", selectAutomatically: true, preserveAlternatives: true, blocks: [], moderation: "ONLY_IF_SCOPE_OR_TIME_AMBIGUOUS" },
  { key: "OVERLAPPING_SCHEDULES", selectAutomatically: false, preserveAlternatives: true, blocks: ["OPENING_HOURS_ELIGIBILITY"], moderation: "REQUIRED" },
  { key: "ACCESSIBILITY_CONFLICT", selectAutomatically: false, preserveAlternatives: true, blocks: ["ACCESSIBILITY", "HARD_CONSTRAINTS"], moderation: "REQUIRED" },
  { key: "DUPLICATE_EXTERNAL_REFERENCE", selectAutomatically: false, preserveAlternatives: true, blocks: ["IDENTITY_MUTATION"], moderation: "REQUIRED" },
]);

const useCasesForKey = (key: string): readonly SourceUseCase[] => {
  if (key.startsWith("contact.")) return ["GENERAL_WORLD", "EXPLANATION", "RESEARCH"];
  if (key.startsWith("hours.") || key === "state.current") return ["GENERAL_WORLD", "OPENING_HOURS_ELIGIBILITY", "RESEARCH"];
  if (key === "operation.price_range") return ["GENERAL_WORLD", "PRICE", "RESEARCH"];
  if (key.startsWith("accessibility.")) return ["GENERAL_WORLD", "ACCESSIBILITY", "HARD_CONSTRAINTS", "RESEARCH"];
  if (["operation.takeaway", "rule.reservation", "rule.external_food", "rule.external_drink", "rule.age_access", "rule.pet_access"].includes(key)) return ["GENERAL_WORLD", "HARD_CONSTRAINTS", "RESEARCH"];
  if (key === "description.highlight" || key === "research.subjective_fits") return ["EXPLANATION", "RESEARCH"];
  return ["GENERAL_WORLD", "DISCOVERY", "RESEARCH"];
};

function freshnessModeFor(key: string): SourcePolicy["entries"][number]["freshness"]["mode"] {
  if (key === "state.current") return "REQUIRES_VALID_UNTIL";
  if (key.startsWith("hours.")) return "SCHEDULE_BOUND";
  if (["operation.price_range", "operation.payment_methods", "operation.takeaway", "rule.reservation", "rule.pet_access", "rule.age_access"].includes(key)) return "REVERIFICATION_REQUIRED";
  return "PERMANENT_UNTIL_CONTRADICTED";
}

export function createDraftCalibrationPolicy(strategyValue: unknown): SourcePolicy {
  const strategy = enumValue(strategyValue, DRAFT_POLICY_STRATEGIES, "$.strategy");
  return createSourcePolicy({
    policyVersion: `draft:world-knowledge-slice-3a:${strategy.toLowerCase()}:1`, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH,
    createdAt: "2026-09-10T16:00:00.000Z",
    entries: UNCONFIGURED_SOURCE_POLICY.entries.map((entry) => {
      const allowed = useCasesForKey(entry.attributeKey);
      const minimum = strategy === "CONSERVATIVE_VERIFICATION" && allowed.some((useCase) => ["OPENING_HOURS_ELIGIBILITY", "PRICE", "HARD_CONSTRAINTS", "ACCESSIBILITY"].includes(useCase)) ? "VERIFIED" : "REFERENCED";
      return {
        ...entry, state: "CONFIGURED", allowedSourceTypes: ["OFFICIAL_SOURCE", "OWNER_ASSERTION", "ADMIN_OBSERVATION", "PUBLIC_SOURCE", "LEGACY_IMPORT"],
        allowedActorTypes: ["ADMIN", "VERIFIED_OWNER", "SYSTEM", "PUBLIC_CONTRIBUTOR"], sourceReference: "OPTIONAL", selfAssertionAllowed: true,
        verificationProcess: { requirement: minimum === "VERIFIED" ? "PROCESS_REQUIRED" : "NONE", allowedProcessIds: minimum === "VERIFIED" ? VERIFICATION_PROCESS_CANDIDATES.filter((process) => process.outcomes.includes("VERIFIED")).map((process) => process.processId) : [] },
        freshness: { policyRef: `draft:freshness:${FRESHNESS_CLASS_CANDIDATES[ATTRIBUTE_DEFINITIONS.find((definition) => definition.key === entry.attributeKey)?.area ?? "DESCRIPTION"]}`, mode: freshnessModeFor(entry.attributeKey) },
        conflictPolicy: "UNRESOLVED_FAIL_CLOSED",
        useCases: Object.fromEntries(SOURCE_USE_CASES.map((useCase) => [useCase, allowed.includes(useCase) ? "ALLOWED" : "PROHIBITED"])),
        minimumTrustByUseCase: Object.fromEntries(SOURCE_USE_CASES.map((useCase) => [useCase, allowed.includes(useCase) ? minimum : null])),
      };
    }),
  });
}

export interface PolicyCalibrationResult {
  readonly contractVersion: typeof POLICY_CALIBRATION_CONTRACT_VERSION;
  readonly state: typeof POLICY_CALIBRATION_STATE;
  readonly scenarioId: string;
  readonly policyVersion: string;
  readonly policyHash: string;
  readonly resolutionHash: string;
  readonly snapshotHash: string;
  readonly projectionHash: string;
  readonly sourceAssessments: SourcePolicySimulationAssessment[];
  readonly readiness: readonly { readonly useCase: string; readonly state: string; readonly reasonCodes: readonly string[] }[];
  readonly conflicts: readonly string[];
  readonly exclusions: readonly { readonly code: string; readonly count: number }[];
  readonly resultHash: string;
}

export interface SourcePolicySimulationAssessment {
  readonly claimId: string;
  readonly attributeKey: string;
  readonly status: string;
  readonly trust: string;
  readonly useCaseAuthorizations: Readonly<Record<string, string>>;
  readonly reasonCodes: readonly string[];
  readonly assessmentHash: string;
}

export function simulateDraftPolicy(inputValue: unknown): PolicyCalibrationResult {
  const input = object(inputValue, "$", ["scenarioId", "asOf", "claims", "policy"]);
  const scenarioId = String(required(input, "scenarioId", "$"));
  const asOf = timestamp(required(input, "asOf", "$"), "$.asOf");
  const claimsValue = required(input, "claims", "$");
  if (!Array.isArray(claimsValue)) throw new ContractValidationError("$.claims", "expected array");
  const claims: WorldKnowledgeClaim[] = claimsValue.map(parseClaim);
  const policy = parseSourcePolicy(required(input, "policy", "$"));
  if (!policy.policyVersion.startsWith("draft:world-knowledge-slice-3a:")) throw new ContractValidationError("$.policy.policyVersion", "calibration accepts only Slice 3A draft policies");
  const accepted = [{ policyVersion: policy.policyVersion, policyHash: policy.policyHash }];
  const resolution = resolveWorldKnowledge({ contractVersion: RESOLUTION_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, asOf, claims, sourcePolicy: policy, verificationRecords: [] }, accepted);
  const spotId = claims[0]?.scope.spotId ?? `synthetic:${scenarioId}`;
  if (claims.some((claim) => claim.scope.spotId !== spotId)) throw new ContractValidationError("$.claims", "scenario claims must belong to one synthetic spot");
  const snapshot = buildWorldKnowledgeSnapshot(parseBuildWorldKnowledgeInput({ contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, spotId, resolution }, accepted), accepted);
  const projection = projectForDecision(snapshot, accepted);
  const body = {
    contractVersion: POLICY_CALIBRATION_CONTRACT_VERSION, state: POLICY_CALIBRATION_STATE, scenarioId,
    policyVersion: policy.policyVersion, policyHash: policy.policyHash, resolutionHash: resolution.resultHash, snapshotHash: snapshot.snapshotHash, projectionHash: projection.projectionHash,
    sourceAssessments: resolution.sourceAssessments.map(({ claimId, attributeKey, status, trust, useCaseAuthorizations, reasonCodes, assessmentHash }) => ({ claimId, attributeKey, status, trust, useCaseAuthorizations, reasonCodes, assessmentHash })),
    readiness: snapshot.readiness, conflicts: snapshot.conflicts.map((conflict) => conflict.code).sort(), exclusions: snapshot.exclusions,
  };
  return { ...body, resultHash: hashBody(body, []) };
}
