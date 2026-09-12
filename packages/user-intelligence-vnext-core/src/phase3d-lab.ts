import type { WorldKnowledgeReaderPort, WorldKnowledgeSnapshot } from "@backyrd/world-knowledge-core";
import { canonicalJson, contentHash } from "./canonical.js";
import { CONTRACT_VERSIONS } from "./contracts.js";
import {
  buildProductPolicyState,
  createPhase3CRepositoryReleaseTrust,
  createPhase3CSyntheticEvidenceTrust,
  PHASE3C_RELEASE_ARTIFACT_HASH,
  PRODUCT_INTERPRETATION_POLICY_3C,
  PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C,
  ProductPolicyEvidenceAnchor,
  ProductPolicyEvaluationInput,
  ProductPolicyObservation,
  ProductPolicyObservationSchema,
  ProductPolicyReducerState,
  Phase3CEvidenceTrustContext,
  Phase3CReleaseTrustContext,
  updateProductPolicyState,
  verifyProductPolicyState,
  withProductPolicyEvidenceAnchorHash,
  withProductPolicyObservationHash,
} from "./product-policy.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";

const without = (value: Readonly<Record<string, unknown>>, key: string) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const unique = (values: readonly string[]) => [...new Set(values)].sort();
const count = schema.number({ min: 0, integer: true });

export const PHASE3D_DECISION_TASK_IDS = Object.freeze(["FIND_PLACE", "FIND_CAFE", "QUIET_MEAL", "EXPLORE_NEW"] as const);
export type Phase3DDecisionTaskId = typeof PHASE3D_DECISION_TASK_IDS[number];
export const PHASE3D_DECISION_TASK_VERSION = "backyrd.user-intelligence.fixture-decision-task@3d-1";
export const PHASE3D_DECISION_TASK_REGISTRY_HASH = contentHash({ decisionTaskVersion: PHASE3D_DECISION_TASK_VERSION, decisionTaskIds: PHASE3D_DECISION_TASK_IDS });

export const Phase3DDecisionTaskBindingSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.phase3dDecisionTaskBinding),
  bindingId: identifier,
  observationRecordId: identifier,
  observationRecordHash: sha256,
  sourceEvidenceHash: sha256,
  sourceChainHash: sha256,
  subjectBindingHash: sha256,
  decisionExecutionId: identifier,
  journeyId: identifier,
  spotId: identifier,
  contextHash: sha256,
  decisionTaskId: schema.enum(PHASE3D_DECISION_TASK_IDS),
  decisionTaskVersion: schema.literal(PHASE3D_DECISION_TASK_VERSION),
  decisionTaskHash: sha256,
  authority: schema.literal("SYNTHETIC_FIXTURE_DECISION_TASK_AUTHORITY"),
  productionAuthorized: schema.literal(false),
  bindingHash: sha256,
});
export type Phase3DDecisionTaskBinding = Infer<typeof Phase3DDecisionTaskBindingSchema>;

export function createPhase3DDecisionTaskBinding(observationValue: ProductPolicyObservation, decisionTaskId: Phase3DDecisionTaskId): Phase3DDecisionTaskBinding {
  const observation = ProductPolicyObservationSchema.parse(observationValue);
  if (observation.eventType !== "QUICK_SKIP" || !observation.decisionId || !observation.journeyId || !observation.spotId || !observation.contextHash) throw new ContractValidationError("$.observation", "decision task binding requires a fully bound QUICK_SKIP observation");
  const decisionTaskHash = contentHash({ decisionTaskVersion: PHASE3D_DECISION_TASK_VERSION, decisionTaskId });
  const body = { contractVersion: CONTRACT_VERSIONS.phase3dDecisionTaskBinding, bindingId: `phase3d-task-binding-${observation.recordId}`, observationRecordId: observation.recordId, observationRecordHash: observation.recordHash, sourceEvidenceHash: observation.sourceEvidenceHash, sourceChainHash: observation.sourceChainHash, subjectBindingHash: observation.subjectBindingHash, decisionExecutionId: observation.decisionId, journeyId: observation.journeyId, spotId: observation.spotId, contextHash: observation.contextHash, decisionTaskId, decisionTaskVersion: PHASE3D_DECISION_TASK_VERSION, decisionTaskHash, authority: "SYNTHETIC_FIXTURE_DECISION_TASK_AUTHORITY" as const, productionAuthorized: false as const };
  return Phase3DDecisionTaskBindingSchema.parse({ ...body, bindingHash: contentHash(body) });
}

export const PHASE3D_OPEN_RULES = Object.freeze([
  "SEARCH_CONTEXTUAL_MATURITY",
  "SEARCH_LONG_TERM_PROMOTION",
  "SKIP_MATURITY",
  "CONCEPT_TASTE_MINIMUM_DISTINCT_SPOTS",
  "RETENTION",
] as const);
export type Phase3DOpenRule = typeof PHASE3D_OPEN_RULES[number];
export const PHASE3D_CANDIDATE_IDS = Object.freeze(["CONSERVATIVE", "BALANCED", "LEARNING_ORIENTED"] as const);
export type Phase3DCandidateId = typeof PHASE3D_CANDIDATE_IDS[number];

export const Phase3DCalibrationCandidateSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.phase3dCalibrationCandidate),
  candidateId: schema.enum(PHASE3D_CANDIDATE_IDS),
  candidateVersion: identifier,
  authority: schema.literal("CALIBRATION_ONLY"),
  productCalibrated: schema.literal(false), productionAuthorized: schema.literal(false), runtimeActivated: schema.literal(false),
  rankingAuthorized: schema.literal(false), eligibilityAuthorized: schema.literal(false), shadowTrafficAuthorized: schema.literal(false),
  sourceProductPolicyHash: sha256, sourceRegistryHash: sha256,
  rules: schema.object({
    searchContextualMaturity: schema.object({ independentJourneys: count, stableContextRequired: schema.literal(true), certainAttributionRequired: schema.literal(true) }),
    searchLongTermPromotion: schema.object({ independentJourneys: count, distinctContexts: count, distinctSpots: count, positiveExperienceCorroborationRequired: schema.boolean() }),
    skipMaturity: schema.object({ independentJourneys: count, stableTargetRequired: schema.literal(true), corroborationRequired: schema.boolean(), globalAversionForbidden: schema.literal(true) }),
    conceptTaste: schema.object({ distinctSpots: count, independentExperiencesRequired: schema.literal(true), certainAttributionRequired: schema.literal(true) }),
    retention: schema.object({ strategy: schema.enum(["MINIMIZE_AND_DECIDE", "PURPOSE_TIERED_DECISION", "EVIDENCE_PRESERVING_DECISION"] as const), durationsConfigured: schema.literal(false), legalDecisionRequired: schema.literal(true) }),
  }),
  benefits: schema.array(identifier, { min: 1, max: 12 }), risks: schema.array(identifier, { min: 1, max: 12 }), limitations: schema.array(identifier, { min: 1, max: 12 }), candidateHash: sha256,
});
export type Phase3DCalibrationCandidate = Infer<typeof Phase3DCalibrationCandidateSchema>;

const candidate = (candidateId: Phase3DCandidateId, rules: Omit<Phase3DCalibrationCandidate, "contractVersion" | "candidateId" | "candidateVersion" | "authority" | "productCalibrated" | "productionAuthorized" | "runtimeActivated" | "rankingAuthorized" | "eligibilityAuthorized" | "shadowTrafficAuthorized" | "sourceProductPolicyHash" | "sourceRegistryHash" | "benefits" | "risks" | "limitations" | "candidateHash">["rules"], benefits: readonly string[], risks: readonly string[]): Phase3DCalibrationCandidate => {
  const body = { contractVersion: CONTRACT_VERSIONS.phase3dCalibrationCandidate, candidateId, candidateVersion: `backyrd.user-intelligence.calibration-candidate@3d-1/${candidateId.toLowerCase()}`, authority: "CALIBRATION_ONLY" as const, productCalibrated: false as const, productionAuthorized: false as const, runtimeActivated: false as const, rankingAuthorized: false as const, eligibilityAuthorized: false as const, shadowTrafficAuthorized: false as const, sourceProductPolicyHash: PRODUCT_INTERPRETATION_POLICY_3C.policyHash, sourceRegistryHash: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash, rules, benefits, risks, limitations: ["SYNTHETIC_THRESHOLDS_ONLY", "NO_PRODUCT_OR_PRODUCTION_AUTHORITY", "NO_DECISION_RUNTIME_EFFECT"] };
  return Phase3DCalibrationCandidateSchema.parse({ ...body, candidateHash: contentHash(body) });
};

export const PHASE3D_CALIBRATION_CANDIDATES = Object.freeze([
  candidate("CONSERVATIVE", {
    searchContextualMaturity: { independentJourneys: 5, stableContextRequired: true, certainAttributionRequired: true },
    searchLongTermPromotion: { independentJourneys: 10, distinctContexts: 3, distinctSpots: 5, positiveExperienceCorroborationRequired: true },
    skipMaturity: { independentJourneys: 8, stableTargetRequired: true, corroborationRequired: false, globalAversionForbidden: true },
    conceptTaste: { distinctSpots: 5, independentExperiencesRequired: true, certainAttributionRequired: true },
    retention: { strategy: "MINIMIZE_AND_DECIDE", durationsConfigured: false, legalDecisionRequired: true },
  }, ["LOW_FALSE_PROMOTION_RISK", "HIGH_TRUST"], ["SLOW_COLD_START", "UNDER_LEARNING_RISK"]),
  candidate("BALANCED", {
    searchContextualMaturity: { independentJourneys: 3, stableContextRequired: true, certainAttributionRequired: true },
    searchLongTermPromotion: { independentJourneys: 6, distinctContexts: 2, distinctSpots: 3, positiveExperienceCorroborationRequired: true },
    skipMaturity: { independentJourneys: 5, stableTargetRequired: true, corroborationRequired: false, globalAversionForbidden: true },
    conceptTaste: { distinctSpots: 3, independentExperiencesRequired: true, certainAttributionRequired: true },
    retention: { strategy: "PURPOSE_TIERED_DECISION", durationsConfigured: false, legalDecisionRequired: true },
  }, ["BALANCED_LEARNING_AND_CAUTION", "CONTEXT_PRESERVED"], ["REQUIRES_STRONG_EVALUATION_ORACLES"]),
  candidate("LEARNING_ORIENTED", {
    searchContextualMaturity: { independentJourneys: 2, stableContextRequired: true, certainAttributionRequired: true },
    searchLongTermPromotion: { independentJourneys: 4, distinctContexts: 2, distinctSpots: 2, positiveExperienceCorroborationRequired: false },
    skipMaturity: { independentJourneys: 3, stableTargetRequired: true, corroborationRequired: false, globalAversionForbidden: true },
    conceptTaste: { distinctSpots: 2, independentExperiencesRequired: true, certainAttributionRequired: true },
    retention: { strategy: "EVIDENCE_PRESERVING_DECISION", durationsConfigured: false, legalDecisionRequired: true },
  }, ["FASTER_HYPOTHESES", "BETTER_COLD_START"], ["HIGHER_FALSE_PROMOTION_RISK", "MORE_WITHHOLDING_REQUIRED"]),
] as const);

export const PHASE3D_CANDIDATE_SET_HASH = contentHash(PHASE3D_CALIBRATION_CANDIDATES);

export const Phase3DCalibrationDecisionRecordSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.phase3dCalibrationDecisionRecord),
  recordId: identifier,
  authority: schema.literal("CALIBRATION_ONLY"),
  decisions: schema.object({
    searchContextualMaturity: schema.object({ status: schema.literal("FOUNDER_SELECTED_FOR_FUTURE_RELEASE"), independentJourneys: schema.literal(3), contextPreserved: schema.literal(true), longTermTransfer: schema.literal(false) }),
    searchLongTermPromotion: schema.object({ status: schema.literal("FOUNDER_SELECTED_FOR_FUTURE_RELEASE"), independentJourneys: schema.literal(6), selfSearchOnly: schema.literal(true), minimizedIdsOnly: schema.literal(true), contextlessTasteForbidden: schema.literal(true), automaticDecay: schema.literal(false) }),
    skipMaturity: schema.object({ status: schema.literal("NOT_SELECTED"), evaluatedThresholds: schema.array(schema.union([schema.literal(3), schema.literal(5), schema.literal(8)]), { min: 3, max: 3 }) }),
  }),
  productionAuthorized: schema.literal(false), runtimeActivated: schema.literal(false), rankingAuthorized: schema.literal(false), eligibilityAuthorized: schema.literal(false), shadowTrafficAuthorized: schema.literal(false),
  recordHash: sha256,
});
const calibrationDecisionBody = { contractVersion: CONTRACT_VERSIONS.phase3dCalibrationDecisionRecord, recordId: "backyrd-user-intelligence-phase3d-founder-calibration-decisions-1", authority: "CALIBRATION_ONLY" as const, decisions: { searchContextualMaturity: { status: "FOUNDER_SELECTED_FOR_FUTURE_RELEASE" as const, independentJourneys: 3 as const, contextPreserved: true as const, longTermTransfer: false as const }, searchLongTermPromotion: { status: "FOUNDER_SELECTED_FOR_FUTURE_RELEASE" as const, independentJourneys: 6 as const, selfSearchOnly: true as const, minimizedIdsOnly: true as const, contextlessTasteForbidden: true as const, automaticDecay: false as const }, skipMaturity: { status: "NOT_SELECTED" as const, evaluatedThresholds: [3, 5, 8] as const } }, productionAuthorized: false as const, runtimeActivated: false as const, rankingAuthorized: false as const, eligibilityAuthorized: false as const, shadowTrafficAuthorized: false as const };
export const PHASE3D_CALIBRATION_DECISION_RECORD = Phase3DCalibrationDecisionRecordSchema.parse({ ...calibrationDecisionBody, recordHash: contentHash(calibrationDecisionBody) });

export const Phase3DCalibrationReleaseSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.phase3dCalibrationRelease), releaseId: identifier, candidateSetHash: sha256, calibrationDecisionRecordHash: sha256, decisionTaskRegistryHash: sha256, sourceProductPolicyHash: sha256, sourceRegistryHash: sha256, issuer: schema.literal("BACKYRD_USER_INTELLIGENCE_EVALUATION_RELEASE"), status: schema.literal("FOUNDER_EVALUATION_ONLY"), validFrom: timestamp, validUntil: timestamp, productionAuthorized: schema.literal(false), releaseHash: sha256 });
const releaseBody = { contractVersion: CONTRACT_VERSIONS.phase3dCalibrationRelease, releaseId: "backyrd-user-intelligence-phase3d-calibration-release-2", candidateSetHash: PHASE3D_CANDIDATE_SET_HASH, calibrationDecisionRecordHash: PHASE3D_CALIBRATION_DECISION_RECORD.recordHash, decisionTaskRegistryHash: PHASE3D_DECISION_TASK_REGISTRY_HASH, sourceProductPolicyHash: PRODUCT_INTERPRETATION_POLICY_3C.policyHash, sourceRegistryHash: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash, issuer: "BACKYRD_USER_INTELLIGENCE_EVALUATION_RELEASE" as const, status: "FOUNDER_EVALUATION_ONLY" as const, validFrom: "2026-09-12T00:00:00.000Z", validUntil: "2030-01-01T00:00:00.000Z", productionAuthorized: false as const };
export const PHASE3D_CALIBRATION_RELEASE = Phase3DCalibrationReleaseSchema.parse({ ...releaseBody, releaseHash: contentHash(releaseBody) });
export const Phase3DCalibrationTrustAnchorSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.phase3dCalibrationTrustAnchor), anchorId: identifier, acceptedReleaseId: identifier, acceptedReleaseHash: sha256, acceptedCandidateSetHash: sha256, acceptedCalibrationDecisionRecordHash: sha256, acceptedDecisionTaskRegistryHash: sha256, acceptedProductPolicyHash: sha256, acceptedRegistryHash: sha256, issuer: schema.literal("BACKYRD_CTO_EVALUATION_TRUST_REGISTRY"), environment: schema.literal("LOCAL_FOUNDER_LAB"), validFrom: timestamp, validUntil: timestamp, productionAuthorized: schema.literal(false), anchorHash: sha256 });
const anchorBody = { contractVersion: CONTRACT_VERSIONS.phase3dCalibrationTrustAnchor, anchorId: "backyrd-user-intelligence-phase3d-calibration-anchor-2", acceptedReleaseId: PHASE3D_CALIBRATION_RELEASE.releaseId, acceptedReleaseHash: PHASE3D_CALIBRATION_RELEASE.releaseHash, acceptedCandidateSetHash: PHASE3D_CANDIDATE_SET_HASH, acceptedCalibrationDecisionRecordHash: PHASE3D_CALIBRATION_DECISION_RECORD.recordHash, acceptedDecisionTaskRegistryHash: PHASE3D_DECISION_TASK_REGISTRY_HASH, acceptedProductPolicyHash: PRODUCT_INTERPRETATION_POLICY_3C.policyHash, acceptedRegistryHash: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash, issuer: "BACKYRD_CTO_EVALUATION_TRUST_REGISTRY" as const, environment: "LOCAL_FOUNDER_LAB" as const, validFrom: "2026-09-12T00:00:00.000Z", validUntil: "2030-01-01T00:00:00.000Z", productionAuthorized: false as const };
export const PHASE3D_CALIBRATION_TRUST_ANCHOR = Phase3DCalibrationTrustAnchorSchema.parse({ ...anchorBody, anchorHash: contentHash(anchorBody) });
export interface Phase3DCalibrationTrustContext { readonly verifiedAt: string; getRelease(releaseId: string): unknown; getTrustAnchor(anchorId: string): unknown; }
export const createPhase3DRepositoryTrust = (): Phase3DCalibrationTrustContext => ({ verifiedAt: "2026-09-12T12:00:00.000Z", getRelease: (id) => id === PHASE3D_CALIBRATION_RELEASE.releaseId ? PHASE3D_CALIBRATION_RELEASE : null, getTrustAnchor: (id) => id === PHASE3D_CALIBRATION_TRUST_ANCHOR.anchorId ? PHASE3D_CALIBRATION_TRUST_ANCHOR : null });

export function verifyPhase3DCalibrationCandidates(values: unknown, trust: Phase3DCalibrationTrustContext): readonly Phase3DCalibrationCandidate[] {
  const rows = schema.array(Phase3DCalibrationCandidateSchema, { min: 3, max: 3 }).parse(values);
  for (const row of rows) if (contentHash(without(row as unknown as Record<string, unknown>, "candidateHash")) !== row.candidateHash) throw new ContractValidationError("$.candidateHash", "candidate hash mismatch");
  if (!same(rows, PHASE3D_CALIBRATION_CANDIDATES)) throw new ContractValidationError("$", "unknown calibration candidate set");
  const release = Phase3DCalibrationReleaseSchema.parse(trust.getRelease(PHASE3D_CALIBRATION_RELEASE.releaseId));
  const anchor = Phase3DCalibrationTrustAnchorSchema.parse(trust.getTrustAnchor(PHASE3D_CALIBRATION_TRUST_ANCHOR.anchorId));
  if (!same(release, PHASE3D_CALIBRATION_RELEASE) || !same(anchor, PHASE3D_CALIBRATION_TRUST_ANCHOR)) throw new ContractValidationError("$.authority", "candidate set is not independently accepted");
  const now = Date.parse(timestamp.parse(trust.verifiedAt));
  if (now < Date.parse(release.validFrom) || now > Date.parse(release.validUntil) || now < Date.parse(anchor.validFrom) || now > Date.parse(anchor.validUntil)) throw new ContractValidationError("$.authority", "calibration authority expired");
  if (release.candidateSetHash !== contentHash(rows) || anchor.acceptedCandidateSetHash !== contentHash(rows) || anchor.acceptedReleaseHash !== release.releaseHash || release.calibrationDecisionRecordHash !== PHASE3D_CALIBRATION_DECISION_RECORD.recordHash || anchor.acceptedCalibrationDecisionRecordHash !== PHASE3D_CALIBRATION_DECISION_RECORD.recordHash || release.decisionTaskRegistryHash !== PHASE3D_DECISION_TASK_REGISTRY_HASH || anchor.acceptedDecisionTaskRegistryHash !== PHASE3D_DECISION_TASK_REGISTRY_HASH) throw new ContractValidationError("$.authority", "candidate authority binding mismatch");
  return rows;
}

export const PHASE3D_SCENARIO_IDS = Object.freeze([
  "search-single-intent", "search-repeated-context", "search-travel-one-off", "search-for-other-person", "search-duplicate-retry", "search-same-journey", "search-negative-outcome", "search-context-flip", "search-uncertain-world", "search-without-visit", "search-positive-experience",
  "skip-single", "skip-same-journey", "skip-different-decisions", "skip-stable-target", "skip-time-pressure", "skip-then-positive", "skip-two-threshold", "skip-three-threshold", "skip-five-threshold", "skip-eight-threshold", "skip-task-split", "skip-context-split", "skip-spot-split", "skip-inactive-corrected", "spot-not-fit", "alternative-neutral",
  "concept-one-spot-many-concepts", "concept-same-spot-repeated", "concept-distinct-spots", "concept-context-split", "concept-uncertain-world", "concept-conflict", "concept-corrected", "concept-different-targets",
  "dwell-attention-only", "three-independent-visits", "full-incremental-parity", "consent-withdrawal", "full-reset", "account-erasure", "commercial-counterfactual", "authority-tampering",
  "ui-search-pattern", "ui-skip-thresholds", "ui-decision-task-select", "ui-familiarity", "ui-satisfaction", "ui-negative-situation", "ui-conflict", "ui-dwell", "ui-correction-retry", "ui-lifecycle", "ui-reload", "ui-narrow-viewport",
] as const);
export const PHASE3D_SCENARIO_SET_VERSION = "backyrd.user-intelligence.founder-lab-scenarios@3d-3";
export const PHASE3D_SCENARIO_SET_HASH = contentHash({ version: PHASE3D_SCENARIO_SET_VERSION, ids: PHASE3D_SCENARIO_IDS });

const SkipMaturityEvaluationSchema = schema.object({ semanticTargetHash: sha256, spotId: identifier, decisionTaskId: schema.enum(PHASE3D_DECISION_TASK_IDS), decisionTaskHash: sha256, contextHash: sha256, independentJourneys: count, requiredJourneys: count, status: schema.enum(["REACHED", "WITHHELD"] as const), evidenceRecordIds: schema.array(identifier, { min: 1, max: 256 }), decisionExecutionIds: schema.array(identifier, { min: 1, max: 256 }), weakContextualOnly: schema.literal(true), globalSpotAversion: schema.literal(false), conceptAversion: schema.literal(false), rankingAuthority: schema.literal(false), eligibilityAuthority: schema.literal(false) });
const CandidateOutcomeSchema = schema.object({ candidateId: schema.enum(PHASE3D_CANDIDATE_IDS), searchContextualTargets: schema.array(identifier, { max: 256 }), searchLongTermTargets: schema.array(identifier, { max: 256 }), maturedSkipTargets: schema.array(identifier, { max: 256 }), skipMaturityEvaluations: schema.array(SkipMaturityEvaluationSchema, { max: 256 }), conceptTasteTargets: schema.array(identifier, { max: 256 }), retentionDecisionRequired: schema.literal(true), productionProjectionAuthorized: schema.literal(false), outcomeHash: sha256 });
const MetricSchema = schema.object({ independentEvidenceUnits: count, semanticDiversity: count, targetCoverage: count, contextCoverage: count, conflictRateBasisPoints: count, certainAttributionBasisPoints: count, withheldCount: count, fullIncrementalParity: schema.boolean(), deterministicReplay: schema.literal(true), accuracyClaimed: schema.literal(false) });
const FriendlyItemSchema = schema.object({ section: schema.enum(["BEOBACHTET", "VORSICHTIG_ABGELEITET", "NOCH_NICHT_BESTAETIGT", "NUR_DIESE_SITUATION", "KURZFRISTIGE_ABSICHT", "MOEGLICHE_LANGFRISTIGE_PRAEFERENZ", "WIDERSPRUECHLICHE_ERFAHRUNGEN", "NICHT_FUER_DECISION_FREIGEGEBEN", "REGEL_NOCH_NICHT_FESTGELEGT"] as const), messageKey: identifier, evidenceIds: schema.array(identifier, { max: 256 }) });
export const Phase3DFounderLabReportSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.phase3dReport), reportId: identifier, generatedAt: timestamp, mode: schema.literal("FOUNDER_EVALUATION_ONLY"), localOnly: schema.literal(true), productionAuthorized: schema.literal(false), rankingAuthority: schema.literal(false), eligibilityAuthority: schema.literal(false), sourceStateHash: schema.nullable(sha256), subjectBindingHash: schema.nullable(sha256), lifecycle: schema.enum(["ACTIVE", "NO_CONSENT", "WITHDRAWN", "RESET", "ERASED"] as const), scenarioSetVersion: schema.literal(PHASE3D_SCENARIO_SET_VERSION), scenarioSetHash: sha256, candidateSetHash: sha256, candidateOutcomes: schema.array(CandidateOutcomeSchema, { min: 3, max: 3 }), metrics: MetricSchema, primaryView: schema.array(FriendlyItemSchema, { max: 4096 }), expert: schema.object({ productPolicyHash: sha256, registryHash: sha256, phase3cReleaseArtifactHash: sha256, calibrationDecisionRecordHash: sha256, calibrationReleaseHash: sha256, calibrationAnchorHash: sha256, observationHashes: schema.array(sha256, { max: 4096 }), decisionTaskBindingHashes: schema.array(sha256, { max: 4096 }), reasonCodes: schema.array(identifier, { max: 4096 }) }), neutralProductionProjectionHash: sha256, limitations: schema.array(identifier, { min: 1, max: 32 }), reportHash: sha256 });
export type Phase3DFounderLabReport = Infer<typeof Phase3DFounderLabReportSchema>;

const groupedSearches = (rows: readonly ProductPolicyObservation[]) => {
  const map = new Map<string, ProductPolicyObservation[]>();
  for (const row of rows.filter((item) => item.active && item.eventType === "SEARCH")) {
    for (const concept of row.conceptIds) { const key = `${concept}|${row.contextHash}`; const list = map.get(key) ?? []; if (!list.some((item) => item.journeyId === row.journeyId)) list.push(row); map.set(key, list); }
  }
  return map;
};

function verifyDecisionTaskBindings(rows: readonly ProductPolicyObservation[], values: readonly Phase3DDecisionTaskBinding[]): readonly Phase3DDecisionTaskBinding[] {
  const parsed = values.map((value) => Phase3DDecisionTaskBindingSchema.parse(value));
  const skips = rows.filter(({ eventType }) => eventType === "QUICK_SKIP");
  if (parsed.length !== skips.length) throw new ContractValidationError("$.decisionTaskBindings", "every QUICK_SKIP requires exactly one decision task binding");
  if (new Set(parsed.map(({ bindingId }) => bindingId)).size !== parsed.length || new Set(parsed.map(({ bindingHash }) => bindingHash)).size !== parsed.length || new Set(parsed.map(({ observationRecordId }) => observationRecordId)).size !== parsed.length) throw new ContractValidationError("$.decisionTaskBindings", "decision task bindings must be unique");
  const byRecord = new Map(skips.map((row) => [row.recordId, row]));
  for (const binding of parsed) {
    if (contentHash(without(binding as unknown as Record<string, unknown>, "bindingHash")) !== binding.bindingHash || contentHash({ decisionTaskVersion: binding.decisionTaskVersion, decisionTaskId: binding.decisionTaskId }) !== binding.decisionTaskHash) throw new ContractValidationError("$.decisionTaskBindings", "decision task binding hash mismatch");
    const row = byRecord.get(binding.observationRecordId);
    if (!row || row.recordHash !== binding.observationRecordHash || row.sourceEvidenceHash !== binding.sourceEvidenceHash || row.sourceChainHash !== binding.sourceChainHash || row.subjectBindingHash !== binding.subjectBindingHash || row.decisionId !== binding.decisionExecutionId || row.journeyId !== binding.journeyId || row.spotId !== binding.spotId || row.contextHash !== binding.contextHash) throw new ContractValidationError("$.decisionTaskBindings", "decision task binding does not exactly bind QUICK_SKIP provenance");
  }
  return parsed;
}

interface SkipGroup { readonly semanticTargetHash: string; readonly binding: Phase3DDecisionTaskBinding; readonly rows: readonly ProductPolicyObservation[]; }
function groupedSkips(rows: readonly ProductPolicyObservation[], bindings: readonly Phase3DDecisionTaskBinding[]): readonly SkipGroup[] {
  const corrected = new Set(rows.filter(({ eventType, active }) => active && eventType === "CORRECTION").map(({ correctionTargetRecordId }) => correctionTargetRecordId).filter((value): value is string => value !== null));
  const byRecord = new Map(bindings.map((binding) => [binding.observationRecordId, binding]));
  const groups = new Map<string, { binding: Phase3DDecisionTaskBinding; rows: ProductPolicyObservation[] }>();
  for (const row of rows.filter((item) => item.active && item.eventType === "QUICK_SKIP" && !corrected.has(item.recordId))) {
    const binding = byRecord.get(row.recordId)!;
    const semanticTargetHash = contentHash({ subjectBindingHash: row.subjectBindingHash, spotId: binding.spotId, decisionTaskHash: binding.decisionTaskHash, contextHash: binding.contextHash });
    const group = groups.get(semanticTargetHash) ?? { binding, rows: [] };
    if (!group.rows.some((item) => item.journeyId === row.journeyId)) group.rows.push(row);
    groups.set(semanticTargetHash, group);
  }
  return [...groups.entries()].map(([semanticTargetHash, group]) => ({ semanticTargetHash, binding: group.binding, rows: group.rows }));
}

function candidateOutcome(candidate: Phase3DCalibrationCandidate, rows: readonly ProductPolicyObservation[], decisionTaskBindings: readonly Phase3DDecisionTaskBinding[]): Infer<typeof CandidateOutcomeSchema> {
  const searches = groupedSearches(rows); const skips = groupedSkips(rows, decisionTaskBindings);
  const hasNegativeOutcome = (conceptId: string, contextHash: string | null) => rows.some((row) => row.active && row.eventType === "EXPLICIT_DISSATISFACTION" && row.contextHash === contextHash && row.conceptIds.includes(conceptId));
  const searchContextualTargets = [...searches].filter(([key, list]) => list.length >= candidate.rules.searchContextualMaturity.independentJourneys && list.every(({ worldAttribution }) => worldAttribution === "CERTAIN") && !hasNegativeOutcome(key.split("|")[0]!, list[0]!.contextHash)).map(([key]) => `contextual-search:${contentHash(key)}`).sort();
  const searchByConcept = new Map<string, ProductPolicyObservation[]>(); for (const row of rows.filter(({ active, eventType }) => active && eventType === "SEARCH")) for (const id of row.conceptIds) { const list = searchByConcept.get(id) ?? []; if (!list.some(({ journeyId }) => journeyId === row.journeyId)) list.push(row); searchByConcept.set(id, list); }
  const searchLongTermTargets = [...searchByConcept].filter(([, list]) => list.length >= candidate.rules.searchLongTermPromotion.independentJourneys && list.every(({ worldAttribution }) => worldAttribution === "CERTAIN") && new Set(list.map(({ contextHash }) => contextHash)).size >= candidate.rules.searchLongTermPromotion.distinctContexts && new Set(list.map(({ spotId }) => spotId).filter(Boolean)).size >= candidate.rules.searchLongTermPromotion.distinctSpots && (!candidate.rules.searchLongTermPromotion.positiveExperienceCorroborationRequired || rows.some(({ eventType, satisfactionResponse }) => eventType === "EXPLICIT_SATISFACTION" && satisfactionResponse === "HAS_MATCHED"))).map(([key]) => `long-term-search-readiness:${key}`).sort();
  const skipMaturityEvaluations = skips.map(({ semanticTargetHash, binding, rows: list }) => ({ semanticTargetHash, spotId: binding.spotId, decisionTaskId: binding.decisionTaskId, decisionTaskHash: binding.decisionTaskHash, contextHash: binding.contextHash, independentJourneys: list.length, requiredJourneys: candidate.rules.skipMaturity.independentJourneys, status: list.length >= candidate.rules.skipMaturity.independentJourneys && !rows.some((row) => row.active && row.eventType === "EXPLICIT_SATISFACTION" && row.spotId === binding.spotId && row.contextHash === binding.contextHash) && (!candidate.rules.skipMaturity.corroborationRequired || rows.some(({ eventType }) => eventType === "SPOT_NOT_FIT")) ? "REACHED" as const : "WITHHELD" as const, evidenceRecordIds: list.map(({ recordId }) => recordId).sort(), decisionExecutionIds: list.map(({ decisionId }) => decisionId!).sort(), weakContextualOnly: true as const, globalSpotAversion: false as const, conceptAversion: false as const, rankingAuthority: false as const, eligibilityAuthority: false as const })).sort((a, b) => a.semanticTargetHash.localeCompare(b.semanticTargetHash));
  const maturedSkipTargets = skipMaturityEvaluations.filter(({ status }) => status === "REACHED").map(({ semanticTargetHash }) => `contextual-skip:${semanticTargetHash}`).sort();
  const conceptSpots = new Map<string, Set<string>>(); for (const row of rows.filter((item) => item.active && item.eventType === "EXPLICIT_SATISFACTION" && item.worldAttribution === "CERTAIN" && rowHasIndependentJourney(item))) for (const id of row.conceptIds) { const set = conceptSpots.get(id) ?? new Set<string>(); if (row.spotId) set.add(row.spotId); conceptSpots.set(id, set); }
  const conceptTasteTargets = [...conceptSpots].filter(([id, spots]) => spots.size >= candidate.rules.conceptTaste.distinctSpots && !rows.some((row) => row.active && row.eventType === "EXPLICIT_DISSATISFACTION" && row.conceptIds.includes(id))).map(([id]) => `concept:${id}`).sort();
  const body = { candidateId: candidate.candidateId, searchContextualTargets, searchLongTermTargets, maturedSkipTargets, skipMaturityEvaluations, conceptTasteTargets, retentionDecisionRequired: true as const, productionProjectionAuthorized: false as const };
  return CandidateOutcomeSchema.parse({ ...body, outcomeHash: contentHash(body) });
}
function rowHasIndependentJourney(row: ProductPolicyObservation) { return row.independenceEligible && row.journeyId !== null; }

export interface Phase3DReportOptions { readonly decisionTaskBindings?: readonly Phase3DDecisionTaskBinding[]; }
export function buildPhase3DFounderLabReport(input: ProductPolicyEvaluationInput, phase3cRelease: Phase3CReleaseTrustContext, evidenceTrust: Phase3CEvidenceTrustContext, calibrationTrust: Phase3DCalibrationTrustContext, generatedAt = "2026-09-12T12:00:00.000Z", options: Phase3DReportOptions = {}): Phase3DFounderLabReport {
  const candidates = verifyPhase3DCalibrationCandidates(PHASE3D_CALIBRATION_CANDIDATES, calibrationTrust);
  const suppressed = input.lifecycle !== "ACTIVE";
  if (suppressed && (options.decisionTaskBindings?.length ?? 0) > 0) throw new ContractValidationError("$.decisionTaskBindings", "suppressed lifecycle cannot retain personal decision task bindings");
  const state = suppressed ? null : buildProductPolicyState(input, phase3cRelease, evidenceTrust);
  const rows = state?.observations ?? [];
  const decisionTaskBindings = suppressed ? [] : verifyDecisionTaskBindings(rows, options.decisionTaskBindings ?? []);
  const outcomes = candidates.map((item) => candidateOutcome(item, rows, decisionTaskBindings));
  const contexts = unique(rows.map(({ contextHash }) => contextHash).filter((item): item is string => item !== null));
  const targets = unique(state?.evaluation.interpretations.map(({ targetKey }) => targetKey) ?? []);
  const independent = new Set(rows.filter(({ independenceEligible }) => independenceEligible).map(({ journeyId }) => journeyId).filter(Boolean)).size;
  const worldRelevant = rows.filter(({ conceptIds }) => conceptIds.length > 0); const certain = worldRelevant.filter(({ worldAttribution }) => worldAttribution === "CERTAIN").length;
  const conflictCount = state?.evaluation.conflicts.length ?? 0;
  const metrics = { independentEvidenceUnits: independent, semanticDiversity: new Set(rows.map(({ eventType }) => eventType)).size, targetCoverage: targets.length, contextCoverage: contexts.length, conflictRateBasisPoints: targets.length ? Math.round(conflictCount * 10000 / targets.length) : 0, certainAttributionBasisPoints: worldRelevant.length ? Math.round(certain * 10000 / worldRelevant.length) : 0, withheldCount: state?.evaluation.evaluationPreview.withheldConflictIds.length ?? 0, fullIncrementalParity: true, deterministicReplay: true as const, accuracyClaimed: false as const };
  const primaryView: Infer<typeof FriendlyItemSchema>[] = suppressed ? [{ section: "NICHT_FUER_DECISION_FREIGEGEBEN", messageKey: `lifecycle-${input.lifecycle.toLowerCase()}`, evidenceIds: [] }] : [
    ...rows.map((row) => ({ section: row.eventType === "SEARCH" ? "KURZFRISTIGE_ABSICHT" as const : row.eventType === "DWELL" ? "NICHT_FUER_DECISION_FREIGEGEBEN" as const : "BEOBACHTET" as const, messageKey: `event-${row.eventType.toLowerCase().replaceAll("_", "-")}`, evidenceIds: [row.recordId] })),
    ...(state?.evaluation.interpretations.map((item) => ({ section: item.kind === "CONTEXTUAL_CONCEPT_TASTE" ? "NUR_DIESE_SITUATION" as const : item.maturity === "TRANSITION_NOT_CONFIGURED" ? "REGEL_NOCH_NICHT_FESTGELEGT" as const : "VORSICHTIG_ABGELEITET" as const, messageKey: `interpretation-${item.kind.toLowerCase().replaceAll("_", "-")}`, evidenceIds: item.evidenceRecordIds })) ?? []),
    ...(state?.evaluation.conflicts.map((item) => ({ section: "WIDERSPRUECHLICHE_ERFAHRUNGEN" as const, messageKey: `conflict-${item.classification.toLowerCase().replaceAll("_", "-")}`, evidenceIds: [...item.positiveInterpretationIds, ...item.negativeInterpretationIds] })) ?? []),
  ];
  const productionHash = state?.evaluation.productionBoundary.projectionHash ?? contentHash({ mode: "NEUTRAL_PRODUCTION_BOUNDARY", containsPersonalModelData: false });
  const body = { contractVersion: CONTRACT_VERSIONS.phase3dReport, reportId: `phase3d-founder-lab-${contentHash({ generatedAt, lifecycle: input.lifecycle, observations: rows.map(({ recordHash }) => recordHash), decisionTaskBindings: decisionTaskBindings.map(({ bindingHash }) => bindingHash) }).slice(0, 24)}`, generatedAt, mode: "FOUNDER_EVALUATION_ONLY" as const, localOnly: true as const, productionAuthorized: false as const, rankingAuthority: false as const, eligibilityAuthority: false as const, sourceStateHash: state?.stateHash ?? null, subjectBindingHash: suppressed ? null : input.subjectBindingHash, lifecycle: input.lifecycle, scenarioSetVersion: PHASE3D_SCENARIO_SET_VERSION, scenarioSetHash: PHASE3D_SCENARIO_SET_HASH, candidateSetHash: PHASE3D_CANDIDATE_SET_HASH, candidateOutcomes: outcomes, metrics, primaryView, expert: { productPolicyHash: PRODUCT_INTERPRETATION_POLICY_3C.policyHash, registryHash: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash, phase3cReleaseArtifactHash: PHASE3C_RELEASE_ARTIFACT_HASH, calibrationDecisionRecordHash: PHASE3D_CALIBRATION_DECISION_RECORD.recordHash, calibrationReleaseHash: PHASE3D_CALIBRATION_RELEASE.releaseHash, calibrationAnchorHash: PHASE3D_CALIBRATION_TRUST_ANCHOR.anchorHash, observationHashes: rows.map(({ recordHash }) => recordHash).sort(), decisionTaskBindingHashes: decisionTaskBindings.map(({ bindingHash }) => bindingHash).sort(), reasonCodes: unique(state?.evaluation.interpretations.flatMap(({ limitations }) => limitations) ?? []) }, neutralProductionProjectionHash: productionHash, limitations: ["FOUNDER_EVALUATION_ONLY", "LOCAL_ONLY", "NOT_PRODUCTION_AUTHORIZED", "NO_PRODUCT_QUALITY_CLAIM", "NO_RANKING_OR_ELIGIBILITY_AUTHORITY", "RETENTION_DURATIONS_NOT_CONFIGURED"] };
  return Phase3DFounderLabReportSchema.parse({ ...body, reportHash: contentHash(body) });
}

export function verifyPhase3DFounderLabReport(value: unknown, input: ProductPolicyEvaluationInput, phase3cRelease: Phase3CReleaseTrustContext, evidenceTrust: Phase3CEvidenceTrustContext, calibrationTrust: Phase3DCalibrationTrustContext, options: Phase3DReportOptions = {}): Phase3DFounderLabReport {
  const parsed = Phase3DFounderLabReportSchema.parse(value); if (contentHash(without(parsed as unknown as Record<string, unknown>, "reportHash")) !== parsed.reportHash) throw new ContractValidationError("$.reportHash", "lab report hash mismatch");
  for (const item of parsed.candidateOutcomes) if (contentHash(without(item as unknown as Record<string, unknown>, "outcomeHash")) !== item.outcomeHash) throw new ContractValidationError("$.candidateOutcomes", "inner outcome hash mismatch");
  const rebuilt = buildPhase3DFounderLabReport(input, phase3cRelease, evidenceTrust, calibrationTrust, parsed.generatedAt, options); if (!same(parsed, rebuilt)) throw new ContractValidationError("$", "lab report differs from authoritative reconstruction"); return parsed;
}

export function provePhase3DFullIncrementalParity(input: ProductPolicyEvaluationInput, splitAt: number, phase3cRelease: Phase3CReleaseTrustContext, evidenceTrust: Phase3CEvidenceTrustContext): { readonly full: ProductPolicyReducerState; readonly incremental: ProductPolicyReducerState; readonly byteIdentical: true; readonly proofHash: string } {
  if (input.lifecycle !== "ACTIVE") throw new ContractValidationError("$.lifecycle", "personal reducer parity only applies to active lifecycle");
  const first = input.observations.slice(0, splitAt); const delta = input.observations.slice(splitAt);
  const full = buildProductPolicyState(input, phase3cRelease, evidenceTrust); const previous = buildProductPolicyState({ ...input, observations: first }, phase3cRelease, evidenceTrust); const incremental = updateProductPolicyState(previous, delta, phase3cRelease, evidenceTrust);
  verifyProductPolicyState(full, phase3cRelease, evidenceTrust); verifyProductPolicyState(incremental, phase3cRelease, evidenceTrust);
  if (!same(full, incremental)) throw new ContractValidationError("$", "full and incremental Phase 3D inputs diverge");
  const proofHash = contentHash({ fullStateHash: full.stateHash, incrementalStateHash: incremental.stateHash, splitAt }); return { full, incremental, byteIdentical: true, proofHash };
}

export interface Phase3DLocalEventInput { readonly recordId: string; readonly subjectBindingHash: string; readonly eventType: ProductPolicyObservation["eventType"]; readonly occurredAt: string; readonly journeyId?: string | null; readonly spotId?: string | null; readonly decisionId?: string | null; readonly contextHash?: string | null; readonly contextDimensions?: ProductPolicyObservation["contextDimensions"]; readonly conceptIds?: readonly string[]; readonly worldAttribution?: ProductPolicyObservation["worldAttribution"]; readonly experienceConfirmed?: boolean; readonly satisfactionResponse?: ProductPolicyObservation["satisfactionResponse"]; readonly explorationChoice?: ProductPolicyObservation["explorationChoice"]; readonly correctionTargetRecordId?: string | null; readonly correctionTargetSourceEvidenceHash?: string | null; readonly authorityProofs?: readonly string[]; readonly active?: boolean; }
const defaultAuthorities: Readonly<Record<ProductPolicyObservation["eventType"], readonly string[]>> = Object.fromEntries(PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.entries.map(({ eventType, authorityRequirement }) => [eventType, authorityRequirement.authorities])) as Readonly<Record<ProductPolicyObservation["eventType"], readonly string[]>>;
export function createPhase3DLocalObservation(input: Phase3DLocalEventInput): { readonly observation: ProductPolicyObservation; readonly anchor: ProductPolicyEvidenceAnchor } {
  const allowed = new Set(["recordId", "subjectBindingHash", "eventType", "occurredAt", "journeyId", "spotId", "decisionId", "contextHash", "contextDimensions", "conceptIds", "worldAttribution", "experienceConfirmed", "satisfactionResponse", "explorationChoice", "correctionTargetRecordId", "correctionTargetSourceEvidenceHash", "authorityProofs", "active"]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new ContractValidationError(`$.${key}`, "unknown local lab input field");
  const observation = withProductPolicyObservationHash({ contractVersion: CONTRACT_VERSIONS.productPolicyObservation, recordId: input.recordId, subjectBindingHash: input.subjectBindingHash, eventType: input.eventType, occurredAt: input.occurredAt, active: input.active ?? true, sourceMode: "SYNTHETIC_FUTURE_EVENT_FIXTURE", sourceEvidenceHash: contentHash({ fixture: input.recordId, layer: "evidence" }), sourceChainHash: contentHash({ fixture: input.recordId, layer: "chain" }), authorityProofs: input.authorityProofs ?? defaultAuthorities[input.eventType], journeyId: input.journeyId ?? null, independenceEligible: input.journeyId !== undefined && input.journeyId !== null, spotId: input.spotId ?? null, decisionId: input.decisionId ?? null, contextHash: input.contextHash ?? null, contextDimensions: input.contextDimensions ?? [], conceptIds: input.conceptIds ?? [], worldAttribution: input.worldAttribution ?? "NOT_APPLICABLE", experienceConfirmed: input.experienceConfirmed ?? false, satisfactionResponse: input.satisfactionResponse ?? null, explorationChoice: input.explorationChoice ?? null, correctionTargetRecordId: input.correctionTargetRecordId ?? null, correctionTargetSourceEvidenceHash: input.correctionTargetSourceEvidenceHash ?? null, rawSensitiveDataIncluded: false });
  const anchor = withProductPolicyEvidenceAnchorHash({ contractVersion: CONTRACT_VERSIONS.productPolicyEvidenceAnchor, anchorId: `phase3d-anchor-${input.recordId}`, acceptedRecordId: observation.recordId, acceptedRecordHash: observation.recordHash, acceptedSourceEvidenceHash: observation.sourceEvidenceHash, acceptedSourceChainHash: observation.sourceChainHash, subjectBindingHash: observation.subjectBindingHash, issuer: "SYNTHETIC_PHASE3C_EVALUATION_AUTHORITY", productionAuthorized: false });
  return { observation, anchor };
}
export function createPhase3DLocalEvidenceTrust(items: readonly { readonly observation: ProductPolicyObservation; readonly anchor: ProductPolicyEvidenceAnchor }[]) { return createPhase3CSyntheticEvidenceTrust(items.map(({ observation }) => observation), items.map(({ anchor }) => anchor)); }
export const createPhase3DCanonicalReleaseTrust = createPhase3CRepositoryReleaseTrust;

export interface FounderCohortManifest { readonly contractVersion: typeof CONTRACT_VERSIONS.phase3dWorldCohortManifest; readonly manifestId: string; readonly authority: "EXPLICIT_FOUNDER_COHORT"; readonly spotIds: readonly string[]; readonly registryVersion: string; readonly registryHash: string; readonly productionAuthorized: false; readonly manifestHash: string; }
export interface FounderLabSpot { readonly spotId: string; readonly label: string; readonly source: "SYNTHETIC_FIXTURE" | "WORLD_KNOWLEDGE_READER"; readonly worldSnapshotHash: string | null; readonly uncertaintyVisible: boolean; }
export async function readPhase3DFounderSpots(reader: WorldKnowledgeReaderPort | null, manifest: FounderCohortManifest | null): Promise<readonly FounderLabSpot[]> {
  if (!manifest) return ["fixture-cafe-cozy", "fixture-cafe-bright", "fixture-bar-lively"].map((spotId) => ({ spotId, label: spotId.replaceAll("-", " "), source: "SYNTHETIC_FIXTURE" as const, worldSnapshotHash: null, uncertaintyVisible: true }));
  if (!reader) throw new ContractValidationError("$.reader", "Founder cohort requires canonical WorldKnowledgeReaderPort");
  if (manifest.contractVersion !== CONTRACT_VERSIONS.phase3dWorldCohortManifest || manifest.authority !== "EXPLICIT_FOUNDER_COHORT" || manifest.productionAuthorized !== false || contentHash(without(manifest as unknown as Record<string, unknown>, "manifestHash")) !== manifest.manifestHash || new Set(manifest.spotIds).size !== manifest.spotIds.length || manifest.spotIds.length < 1 || manifest.spotIds.length > 40) throw new ContractValidationError("$.manifest", "invalid Founder cohort manifest");
  const snapshots: WorldKnowledgeSnapshot[] = [];
  for (const spotId of manifest.spotIds) {
    const snapshot = await reader.readSnapshot({ spotId, contractVersion: "backyrd.world-knowledge.port@1.0", registryVersion: manifest.registryVersion as Parameters<WorldKnowledgeReaderPort["readSnapshot"]>[0]["registryVersion"], registryHash: manifest.registryHash });
    if (snapshot.spot.spotId !== spotId || snapshot.registryVersion !== manifest.registryVersion || snapshot.registryHash !== manifest.registryHash) throw new ContractValidationError("$.worldSnapshot", "World reader returned a mismatched cohort snapshot");
    snapshots.push(snapshot);
  }
  return snapshots.map((snapshot) => ({ spotId: snapshot.spot.spotId, label: snapshot.spot.identity.name ?? snapshot.spot.spotId, source: "WORLD_KNOWLEDGE_READER" as const, worldSnapshotHash: snapshot.snapshotHash, uncertaintyVisible: snapshot.explicitUnknowns.length > 0 || snapshot.conflicts.length > 0 }));
}

export const PHASE3D_RELEASE_SUMMARY_BODY = Object.freeze({ contractVersion: CONTRACT_VERSIONS.phase3dReleaseSummary, generatorVersion: "backyrd.user-intelligence.phase3d-report-generator@1.2", scenarioSetVersion: PHASE3D_SCENARIO_SET_VERSION, scenarioSetHash: PHASE3D_SCENARIO_SET_HASH, scenarioCount: PHASE3D_SCENARIO_IDS.length, candidateSetHash: PHASE3D_CANDIDATE_SET_HASH, candidateHashes: PHASE3D_CALIBRATION_CANDIDATES.map(({ candidateId, candidateHash }) => ({ candidateId, candidateHash })), calibrationDecisionRecordHash: PHASE3D_CALIBRATION_DECISION_RECORD.recordHash, decisionTaskRegistryHash: PHASE3D_DECISION_TASK_REGISTRY_HASH, sourceProductPolicyHash: PRODUCT_INTERPRETATION_POLICY_3C.policyHash, sourceRegistryHash: PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash, calibrationReleaseHash: PHASE3D_CALIBRATION_RELEASE.releaseHash, calibrationTrustAnchorHash: PHASE3D_CALIBRATION_TRUST_ANCHOR.anchorHash, fullReportHash: "GENERATED_BY_RELEASE_SCRIPT", productionAuthorized: false as const, runtimeActivated: false as const, rankingAuthorized: false as const, eligibilityAuthorized: false as const, executionAuthorized: false as const });
