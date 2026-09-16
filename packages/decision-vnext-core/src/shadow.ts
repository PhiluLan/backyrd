import { CONTRACT_VERSIONS as USER_CONTRACT_VERSIONS } from "@backyrd/user-intelligence-vnext-core";
import { WORLD_KNOWLEDGE_PORT_VERSION } from "@backyrd/world-knowledge-core";
import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY, PHASE3C_FOUNDER_LAB_RELEASE } from "./phase3c-lab.js";
import { FounderLabCandidateAssessmentSchema, FounderLabResultSchema, PHASE3C_LAB_VERSIONS, type FounderLabCandidateAssessment, type FounderLabResult } from "./phase3c-lab-contracts.js";
import {
  DARK_SHADOW_VERSIONS, DarkShadowAuthoritySchema, DarkShadowControlSchema, DarkShadowEnvelopeSchema,
  DarkShadowMetricsSchema, DarkShadowOracleCatalogSchema, DarkShadowOracleSchema, DarkShadowReleaseSchema,
  DarkShadowReportSchema, DarkShadowTrustAnchorSchema,
  type DarkShadowAuthority, type DarkShadowEnvelope, type DarkShadowOracle, type DarkShadowOracleCatalog,
  type DarkShadowReport, type DarkShadowTrustAnchor,
} from "./shadow-contracts.js";

export const DARK_SHADOW_ENGINE_REGISTRY = deepFreeze(withContentHash({
  registryId: "decision-vnext-dark-shadow-engine-registry-week1-1",
  engines: [{ engineId: "decision-vnext-dark-shadow-mirror-fixture", fixtureOnly: true, productWeightsConfigured: false }],
  productionAuthorized: false,
}, "engineRegistryHash"));

export const DARK_SHADOW_CONTROL = deepFreeze(DarkShadowControlSchema.parse(withContentHash({
  contractVersion: DARK_SHADOW_VERSIONS.control,
  state: "DISABLED" as const,
  killSwitch: "ENGAGED" as const,
  sampleRateBasisPoints: 0 as const,
  executionAuthorized: false as const,
  productionDataAuthorized: false as const,
  persistenceAuthorized: false as const,
  productAuthority: false as const,
  productRankingAuthorized: false as const,
  productEligibilityAuthorized: false as const,
  userLearningAuthorized: false as const,
  visibleMutationAuthorized: false as const,
}, "controlHash")));

const oracleDefinitions = [
  ["shadow-oracle-a-composite-date", "quiet-first-date", "FOUNDER_A_COMPOSITE_DATE", "TARGET_LOCATION_EXCLUSION"],
  ["shadow-oracle-b-family-age", "family-age12-with-adult", "FOUNDER_B_FAMILY_AND_AGE", "CORE_INTENT_GATE"],
  ["shadow-oracle-c-accessibility", "wheelchair-confirmed-vs-unknown", "FOUNDER_C_COFFEE_ACCESSIBILITY", "UNKNOWN_HARD_CONSTRAINT_FALLBACK"],
  ["shadow-oracle-d-location", "target-zurich-device-basel", "FOUNDER_D_TARGET_CITY_OVERRIDES_DEVICE", "TARGET_LOCATION_EXCLUSION"],
  ["shadow-oracle-family-outing", "founder-family-outing-afternoon", "FAMILY_OUTING_AFTERNOON", "CORE_INTENT_GATE"],
  ["shadow-oracle-bouldering", "founder-bouldering-family", "BOULDERING_WITH_FAMILY", "CORE_INTENT_GATE"],
  ["shadow-oracle-context-flip", "context-flip", "CONTROLLED_CONTEXT_FLIP", "CONTEXT_ONLY_CHANGE"],
  ["shadow-oracle-alternative", "alternative-request", "ALTERNATIVE_HAS_NO_NEGATIVE_MEANING", "ALTERNATIVE_IS_NEUTRAL"],
  ["shadow-oracle-reject", "spot-not-fit", "REJECT_IS_SPOT_DECISION_CONTEXT_SCOPED", "REJECT_IS_CONTEXTUAL"],
  ["shadow-oracle-replay", "full-replay", "UNCHANGED_INPUT_REPLAYS_BYTE_IDENTICALLY", "BYTE_IDENTICAL_REPLAY"],
] as const;

const oracles: readonly DarkShadowOracle[] = oracleDefinitions.map(([oracleId, scenarioId, founderSemantics, expectedStructuralEffect]) =>
  DarkShadowOracleSchema.parse(withContentHash({
    oracleId, scenarioId, founderSemantics, expectedStructuralEffect,
    candidateSetMustRemainIdentical: true as const,
    visibleResultMustRemainUnchanged: true as const,
    rankingExpectation: "NOT_CONFIGURED" as const,
    confidenceExpectation: "NOT_CONFIGURED" as const,
    productionAuthorized: false as const,
    productQualityClaim: false as const,
  }, "oracleHash"))
);

export const DARK_SHADOW_ORACLE_CATALOG: DarkShadowOracleCatalog = deepFreeze(DarkShadowOracleCatalogSchema.parse(withContentHash({
  contractVersion: DARK_SHADOW_VERSIONS.oracleCatalog,
  catalogId: "decision-vnext-dark-shadow-founder-oracles-week1-1",
  scenarioIds: oracles.map((oracle) => oracle.scenarioId),
  oracles,
  closedScenarioSet: true as const,
  productionAuthorized: false as const,
  productQualityClaim: false as const,
}, "catalogHash")));

export const DARK_SHADOW_RELEASE = deepFreeze(DarkShadowReleaseSchema.parse(withContentHash({
  contractVersion: DARK_SHADOW_VERSIONS.release,
  releaseId: "decision-vnext-dark-shadow-foundation-week1-1",
  controlHash: DARK_SHADOW_CONTROL.controlHash,
  oracleCatalogHash: DARK_SHADOW_ORACLE_CATALOG.catalogHash,
  engineRegistryHash: DARK_SHADOW_ENGINE_REGISTRY.engineRegistryHash,
  phase3CReleaseHash: PHASE3C_FOUNDER_LAB_RELEASE.releaseHash,
  phase3CPolicyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash,
  rankingCandidate: { state: "NOT_CONFIGURED" as const, productWeightsConfigured: false as const },
  confidenceCandidate: { state: "NOT_CONFIGURED" as const, calibrated: false as const },
  productionAuthorized: false as const,
  shadowActivationAuthorized: false as const,
}, "releaseHash")));

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`dark_shadow_duplicate_${label}`);
}

export function validateDarkShadowOracleCatalog(value: unknown): DarkShadowOracleCatalog {
  const catalog = DarkShadowOracleCatalogSchema.parse(value);
  assertContentHash(catalog as unknown as Record<string, unknown>, "catalogHash");
  assertUnique(catalog.scenarioIds, "scenario_id");
  assertUnique(catalog.oracles.map((oracle) => oracle.oracleId), "oracle_id");
  assertUnique(catalog.oracles.map((oracle) => oracle.scenarioId), "oracle_scenario_id");
  for (const oracle of catalog.oracles) assertContentHash(oracle as unknown as Record<string, unknown>, "oracleHash");
  if (canonicalJson(catalog.scenarioIds) !== canonicalJson(DARK_SHADOW_ORACLE_CATALOG.scenarioIds) || catalog.catalogHash !== DARK_SHADOW_ORACLE_CATALOG.catalogHash) throw new Error("dark_shadow_oracle_catalog_not_accepted");
  return catalog;
}

export function validateDarkShadowAuthority(authorityValue: unknown, trustValue: unknown, now = "2026-09-16T12:00:00.000Z"): DarkShadowAuthority {
  const authority = DarkShadowAuthoritySchema.parse(authorityValue);
  const trust = DarkShadowTrustAnchorSchema.parse(trustValue);
  assertContentHash(authority as unknown as Record<string, unknown>, "authorityHash");
  if (Date.parse(authority.validFrom) > Date.parse(now) || Date.parse(authority.validUntil) < Date.parse(now)) throw new Error("dark_shadow_authority_not_current");
  if (authority.releaseHash !== DARK_SHADOW_RELEASE.releaseHash || authority.oracleCatalogHash !== DARK_SHADOW_ORACLE_CATALOG.catalogHash || authority.engineRegistryHash !== DARK_SHADOW_ENGINE_REGISTRY.engineRegistryHash || authority.phase3CReleaseHash !== PHASE3C_FOUNDER_LAB_RELEASE.releaseHash || authority.phase3CPolicyHash !== PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash || authority.worldPortVersion !== WORLD_KNOWLEDGE_PORT_VERSION || authority.userProjectionVersion !== USER_CONTRACT_VERSIONS.projection || authority.contextVersion !== PHASE3C_LAB_VERSIONS.interpretation) throw new Error("dark_shadow_authority_contract_binding_mismatch");
  if (trust.acceptedAuthorityId !== authority.authorityId || trust.acceptedAuthorityHash !== authority.authorityHash || trust.acceptedSourceSha !== authority.sourceIdentity.sourceSha || trust.acceptedSourceTreeHash !== authority.sourceIdentity.sourceTreeHash || trust.acceptedArtifactIdentityHash !== authority.sourceIdentity.artifactIdentityHash || trust.acceptedReleaseHash !== authority.releaseHash) throw new Error("dark_shadow_authority_not_trusted");
  return authority;
}

function validateCandidate(candidateValue: unknown): FounderLabCandidateAssessment {
  const candidate = FounderLabCandidateAssessmentSchema.parse(candidateValue);
  assertContentHash(candidate as unknown as Record<string, unknown>, "assessmentHash");
  return candidate;
}

export function validateShadowFounderResult(value: unknown): FounderLabResult {
  const result = FounderLabResultSchema.parse(value);
  assertContentHash(result.interpretation as unknown as Record<string, unknown>, "interpretationHash");
  assertContentHash(result.worldCohort as unknown as Record<string, unknown>, "cohortHash");
  assertContentHash(result as unknown as Record<string, unknown>, "resultHash");
  assertUnique(result.candidates.map((candidate) => candidate.candidateId), "candidate_id");
  result.candidates.forEach(validateCandidate);
  if (result.phase3BReleaseHash !== PHASE3C_FOUNDER_LAB_RELEASE.phase3BReleaseHash || result.compatibilityHash !== PHASE3C_FOUNDER_LAB_RELEASE.compatibilityHash || result.contextualWorldPolicyHash !== PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash) throw new Error("dark_shadow_phase3c_result_binding_mismatch");
  if (result.evaluationOnly !== true || result.productionAuthorized !== false || result.productRankingAuthorized !== false || result.writesUserIntelligence !== false) throw new Error("dark_shadow_phase3c_result_authority_violation");
  return result;
}

function candidateSetHash(result: FounderLabResult): string {
  return contentHash(result.candidates.map((candidate) => candidate.candidateId));
}

export function createDarkShadowEnvelope(input: {
  executionId: string;
  evaluationTime: string;
  authority: unknown;
  trustAnchor: unknown;
  canonicalResult: unknown;
}): DarkShadowEnvelope {
  const authority = validateDarkShadowAuthority(input.authority, input.trustAnchor, input.evaluationTime);
  const canonicalResult = validateShadowFounderResult(input.canonicalResult);
  const candidateIds = canonicalResult.candidates.map((candidate) => candidate.candidateId);
  const body = {
    contractVersion: DARK_SHADOW_VERSIONS.envelope,
    executionId: input.executionId,
    evaluationTime: input.evaluationTime,
    authority,
    control: DARK_SHADOW_CONTROL,
    input: {
      requestHash: canonicalResult.requestHash,
      contextVersion: canonicalResult.interpretation.contractVersion,
      contextHash: canonicalResult.interpretation.interpretationHash,
      worldCohortHash: canonicalResult.worldCohort.cohortHash,
      worldRegistryVersion: canonicalResult.worldCohort.worldRegistryVersion,
      worldRegistryHash: canonicalResult.worldCohort.worldRegistryHash,
      worldHandoffHash: canonicalResult.worldCohort.sourceHandoffHash,
      userProjectionHash: canonicalResult.userProjectionHash,
      userProjectionState: canonicalResult.userProjectionState,
      userNeutralReason: canonicalResult.userNeutralReason,
      candidateSetHash: candidateSetHash(canonicalResult),
      candidateIds,
      phase3CReleaseHash: PHASE3C_FOUNDER_LAB_RELEASE.releaseHash,
      phase3CPolicyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash,
    },
    canonicalResult,
    engine: {
      engineId: "decision-vnext-dark-shadow-mirror-fixture" as const,
      engineRegistryHash: DARK_SHADOW_ENGINE_REGISTRY.engineRegistryHash,
      fixtureOnly: true as const,
      productWeightsConfigured: false as const,
      rankingState: "NOT_CONFIGURED" as const,
      confidenceState: "NOT_CONFIGURED" as const,
    },
    visibleDecisionMutation: false as const,
    writesWorldState: false as const,
    writesUserState: false as const,
  };
  return deepFreeze(DarkShadowEnvelopeSchema.parse(withContentHash(body, "envelopeHash")));
}

export function validateDarkShadowEnvelope(envelopeValue: unknown, trustValue: unknown): DarkShadowEnvelope {
  const envelope = DarkShadowEnvelopeSchema.parse(envelopeValue);
  assertContentHash(envelope as unknown as Record<string, unknown>, "envelopeHash");
  validateDarkShadowAuthority(envelope.authority, trustValue, envelope.evaluationTime);
  const result = validateShadowFounderResult(envelope.canonicalResult);
  const expected = createDarkShadowEnvelope({ executionId: envelope.executionId, evaluationTime: envelope.evaluationTime, authority: envelope.authority, trustAnchor: trustValue, canonicalResult: result });
  if (canonicalJson(expected) !== canonicalJson(envelope)) throw new Error("dark_shadow_envelope_binding_mismatch");
  return envelope;
}

const hardConstraintSignature = (candidate: FounderLabCandidateAssessment) => contentHash({ confirmed: candidate.confirmedHardConstraints, unknown: candidate.unknownHardConstraints, failed: candidate.failedHardConstraints, rejectionClass: candidate.rejectionClass });
const unknownCandidate = (candidate: FounderLabCandidateAssessment) => candidate.coreIntentCoverage.state === "UNKNOWN" || candidate.unknownHardConstraints.length > 0;

function buildMetrics(canonical: FounderLabResult, shadow: FounderLabResult) {
  const canonicalById = new Map(canonical.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const shadowById = new Map(shadow.candidates.map((candidate) => [candidate.candidateId, candidate]));
  if (canonicalById.size !== shadowById.size || [...canonicalById.keys()].some((candidateId) => !shadowById.has(candidateId))) throw new Error("dark_shadow_candidate_set_mismatch");
  const tierDeviations = [];
  const hardDeviations = [];
  const falseConfirmations = [];
  const falseExclusions = [];
  for (const [candidateId, baseline] of canonicalById) {
    const candidate = shadowById.get(candidateId)!;
    if (baseline.tier !== candidate.tier) tierDeviations.push({ candidateId, canonical: baseline.tier, shadow: candidate.tier });
    const baselineHard = hardConstraintSignature(baseline); const shadowHard = hardConstraintSignature(candidate);
    if (baselineHard !== shadowHard) hardDeviations.push({ candidateId, canonical: baselineHard, shadow: shadowHard });
    if (baseline.tier !== "ELIGIBLE_CONFIRMED" && candidate.tier === "ELIGIBLE_CONFIRMED") falseConfirmations.push(candidateId);
    if (baseline.tier !== "INELIGIBLE" && candidate.tier === "INELIGIBLE") falseExclusions.push(candidateId);
  }
  const interpretationChangedFields = canonical.interpretation.interpretationHash === shadow.interpretation.interpretationHash ? [] : ["interpretationHash"];
  const unknownCount = shadow.candidates.filter(unknownCandidate).length;
  const fallbackCount = shadow.candidates.filter((candidate) => candidate.tier === "UNCONFIRMED_FALLBACK").length;
  const denominator = shadow.candidates.length || 1;
  return DarkShadowMetricsSchema.parse(withContentHash({
    contractVersion: DARK_SHADOW_VERSIONS.metrics,
    interpretationParity: interpretationChangedFields.length ? "DIFFERENT" as const : "IDENTICAL" as const,
    interpretationChangedFields,
    hardConstraintDeviations: hardDeviations,
    candidateTierDeviations: tierDeviations,
    unknownCandidateCount: unknownCount,
    fallbackCandidateCount: fallbackCount,
    unknownFallbackRateBasisPoints: Math.round(((unknownCount + fallbackCount) / (2 * denominator)) * 10_000),
    falseConfirmationCandidateIds: falseConfirmations,
    falseExclusionCandidateIds: falseExclusions,
    replayParity: "BYTE_IDENTICAL" as const,
    productQualityClaim: false as const,
  }, "metricsHash"));
}

export function evaluateDarkShadow(input: { envelope: unknown; trustAnchor: unknown; shadowResult?: unknown; measuredMilliseconds?: number | null }): DarkShadowReport {
  const envelope = validateDarkShadowEnvelope(input.envelope, input.trustAnchor);
  const shadowResult = validateShadowFounderResult(input.shadowResult ?? envelope.canonicalResult);
  if (shadowResult.requestHash !== envelope.input.requestHash || shadowResult.worldCohort.cohortHash !== envelope.input.worldCohortHash || shadowResult.userProjectionHash !== envelope.input.userProjectionHash || candidateSetHash(shadowResult) !== envelope.input.candidateSetHash) throw new Error("dark_shadow_result_input_binding_mismatch");
  const metrics = buildMetrics(envelope.canonicalResult, shadowResult);
  const semantic = {
    contractVersion: DARK_SHADOW_VERSIONS.report,
    envelopeHash: envelope.envelopeHash,
    canonicalResultHash: envelope.canonicalResult.resultHash,
    shadowResult,
    metrics,
    boundaries: {
      visibleDecisionChanged: false as const,
      eligibilityAuthorityCreated: false as const,
      rankingAuthorityCreated: false as const,
      confidenceAuthorityCreated: false as const,
      userIntelligenceWriteCreated: false as const,
      worldWriteCreated: false as const,
      productionDataUsed: false as const,
    },
  };
  return deepFreeze(DarkShadowReportSchema.parse({ ...semantic, runtime: { classification: "NON_SEMANTIC_DIAGNOSTIC", measuredMilliseconds: input.measuredMilliseconds ?? null }, reportHash: contentHash(semantic) }));
}

export function replayDarkShadow(envelopeValue: unknown, reportValue: unknown, trustValue: unknown): DarkShadowReport {
  const supplied = DarkShadowReportSchema.parse(reportValue);
  const expected = evaluateDarkShadow({ envelope: envelopeValue, trustAnchor: trustValue, shadowResult: supplied.shadowResult, measuredMilliseconds: supplied.runtime.measuredMilliseconds });
  if (canonicalJson(expected) !== canonicalJson(supplied)) throw new Error("dark_shadow_replay_mismatch");
  return expected;
}

export type { DarkShadowTrustAnchor };
