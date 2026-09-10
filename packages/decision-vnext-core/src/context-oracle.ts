import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import {
  CONTEXT_KERNEL_VERSIONS,
  ContextFlipReportSchema,
  OracleAuthorityRecordSchema,
  OracleAuthorityTrustAnchorSchema,
  ScenarioOracleSchema,
  type ContextFlipReport,
  type OracleAuthorityRecord,
  type OracleAuthorityTrustAnchor,
  type ScenarioOracle,
} from "./context-kernel-contracts.js";
import { contextExecutionIdentity, requireVerifiedContext, type VerifiedContextSnapshot } from "./context-kernel.js";

const STRUCTURAL_ORACLE_VERSION = "backyrd-vnext-context-structural-oracle-v1" as const;

export interface StructuralOracleExpectation {
  readonly oracleId: string;
  readonly scenarioId: string;
  readonly expectedStructuralChanges: readonly string[];
  readonly expectedInputChanges: readonly OracleAuthorityRecord["allowedInputChanges"][number][];
  readonly expectedHardConstraintSetChanged: boolean;
  readonly expectedSoftPreferenceSetChanged: boolean;
  readonly expectedEligibilityEffect?: "UNCHANGED" | "MAY_CHANGE_BY_CONFIGURED_HARD_CONSTRAINT" | "NOT_CONFIGURED";
  readonly validFrom: string;
  readonly validUntil: string;
  readonly allowedScenarioIds: readonly string[];
}

export function createStructuralOracleAuthority(input: StructuralOracleExpectation & { readonly base: VerifiedContextSnapshot; readonly flipped: VerifiedContextSnapshot }): OracleAuthorityRecord {
  const base = requireVerifiedContext(input.base); const flipped = requireVerifiedContext(input.flipped);
  const body = {
    contractVersion: CONTEXT_KERNEL_VERSIONS.oracleAuthority,
    authorityRecordId: `technical-authority-${input.oracleId}`,
    issuer: "BACKYRD_TECHNICAL_EVALUATION_FIXTURE" as const,
    oracleId: input.oracleId,
    oracleVersion: STRUCTURAL_ORACLE_VERSION,
    scenarioId: input.scenarioId,
    baseContextHash: base.snapshot.contextHash,
    flippedContextHash: flipped.snapshot.contextHash,
    baseContextIdentity: contextExecutionIdentity(base.snapshot),
    flippedContextIdentity: contextExecutionIdentity(flipped.snapshot),
    baseEnvelopeHash: base.envelope.envelopeHash,
    flippedEnvelopeHash: flipped.envelope.envelopeHash,
    expectationClass: "STRUCTURAL_INVARIANT" as const,
    allowedStructuralChanges: [...new Set(input.expectedStructuralChanges)].sort(),
    allowedInputChanges: [...new Set(input.expectedInputChanges)].sort(),
    expectedHardConstraintSetChanged: input.expectedHardConstraintSetChanged,
    expectedSoftPreferenceSetChanged: input.expectedSoftPreferenceSetChanged,
    eligibilityExpectation: input.expectedEligibilityEffect ?? "NOT_CONFIGURED",
    rankingExpectation: "NOT_CONFIGURED" as const,
    approvalClass: "NOT_REQUIRED_STRUCTURAL" as const,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    allowedScenarioIds: [...new Set(input.allowedScenarioIds)].sort(),
  };
  return deepFreeze(OracleAuthorityRecordSchema.parse(withContentHash(body, "authorityHash"))) as OracleAuthorityRecord;
}

/** Local-only provisioning helper. The anchor is injected and is never read from an Oracle or report. */
export function trustSyntheticOracleAuthorityForLocalEvaluation(authorityValue: unknown, trustAnchorId = "phase3a-local-oracle-trust-anchor"): OracleAuthorityTrustAnchor {
  const authority = OracleAuthorityRecordSchema.parse(authorityValue); assertContentHash(authority as unknown as Record<string, unknown>, "authorityHash");
  return OracleAuthorityTrustAnchorSchema.parse({
    contractVersion: CONTEXT_KERNEL_VERSIONS.oracleTrustAnchor, trustAnchorId,
    acceptedAuthorityRecordId: authority.authorityRecordId, acceptedAuthorityHash: authority.authorityHash, acceptedIssuer: authority.issuer,
    acceptedOracleId: authority.oracleId, acceptedOracleVersion: authority.oracleVersion, acceptedScenarioId: authority.scenarioId,
    acceptedBaseContextIdentity: authority.baseContextIdentity, acceptedFlippedContextIdentity: authority.flippedContextIdentity,
    acceptedBaseEnvelopeHash: authority.baseEnvelopeHash, acceptedFlippedEnvelopeHash: authority.flippedEnvelopeHash,
    acceptedExpectationClass: authority.expectationClass, acceptedStructuralChanges: authority.allowedStructuralChanges,
    acceptedInputChanges: authority.allowedInputChanges, acceptedEligibilityExpectation: authority.eligibilityExpectation,
    acceptedRankingExpectation: authority.rankingExpectation, acceptedApprovalClass: authority.approvalClass,
    acceptedValidFrom: authority.validFrom, acceptedValidUntil: authority.validUntil, acceptedScenarioIds: authority.allowedScenarioIds,
    productionCapable: false,
  });
}

export function validateOracleAuthority(authorityValue: unknown, trustAnchorValue: unknown): OracleAuthorityRecord {
  const authority = OracleAuthorityRecordSchema.parse(authorityValue); const trust = OracleAuthorityTrustAnchorSchema.parse(trustAnchorValue);
  assertContentHash(authority as unknown as Record<string, unknown>, "authorityHash");
  const expected = {
    acceptedAuthorityRecordId: authority.authorityRecordId, acceptedAuthorityHash: authority.authorityHash, acceptedIssuer: authority.issuer,
    acceptedOracleId: authority.oracleId, acceptedOracleVersion: authority.oracleVersion, acceptedScenarioId: authority.scenarioId,
    acceptedBaseContextIdentity: authority.baseContextIdentity, acceptedFlippedContextIdentity: authority.flippedContextIdentity,
    acceptedBaseEnvelopeHash: authority.baseEnvelopeHash, acceptedFlippedEnvelopeHash: authority.flippedEnvelopeHash,
    acceptedExpectationClass: authority.expectationClass, acceptedStructuralChanges: authority.allowedStructuralChanges,
    acceptedInputChanges: authority.allowedInputChanges, acceptedEligibilityExpectation: authority.eligibilityExpectation,
    acceptedRankingExpectation: authority.rankingExpectation, acceptedApprovalClass: authority.approvalClass,
    acceptedValidFrom: authority.validFrom, acceptedValidUntil: authority.validUntil, acceptedScenarioIds: authority.allowedScenarioIds,
  };
  const actual = Object.fromEntries(Object.entries(trust).filter(([field]) => !["contractVersion", "trustAnchorId", "productionCapable"].includes(field)));
  if (trust.productionCapable || canonicalJson(actual) !== canonicalJson(expected)) throw new Error("context_oracle_authority_not_trusted");
  if (authority.oracleVersion !== STRUCTURAL_ORACLE_VERSION || !authority.allowedScenarioIds.includes(authority.scenarioId)) throw new Error("context_oracle_scenario_not_authorized");
  if (Date.parse(authority.validFrom) > Date.parse(authority.validUntil)) throw new Error("context_oracle_authority_validity_invalid");
  return authority;
}

export function createStructuralOracle(input: StructuralOracleExpectation, authorityValue: unknown, trustAnchorValue: unknown): ScenarioOracle {
  const authority = validateOracleAuthority(authorityValue, trustAnchorValue); const eligibility = input.expectedEligibilityEffect ?? "NOT_CONFIGURED";
  if (input.oracleId !== authority.oracleId || input.scenarioId !== authority.scenarioId || canonicalJson([...new Set(input.expectedStructuralChanges)].sort()) !== canonicalJson(authority.allowedStructuralChanges) || canonicalJson([...new Set(input.expectedInputChanges)].sort()) !== canonicalJson(authority.allowedInputChanges) || input.expectedHardConstraintSetChanged !== authority.expectedHardConstraintSetChanged || input.expectedSoftPreferenceSetChanged !== authority.expectedSoftPreferenceSetChanged || eligibility !== authority.eligibilityExpectation || canonicalJson([...new Set(input.allowedScenarioIds)].sort()) !== canonicalJson(authority.allowedScenarioIds) || input.validFrom !== authority.validFrom || input.validUntil !== authority.validUntil) throw new Error("context_oracle_expectation_not_authorized");
  const body = {
    contractVersion: CONTEXT_KERNEL_VERSIONS.oracle, oracleId: input.oracleId, scenarioId: input.scenarioId,
    baseContextHash: authority.baseContextHash, flippedContextHash: authority.flippedContextHash,
    expectedStructuralChanges: authority.allowedStructuralChanges, expectedInputChanges: authority.allowedInputChanges,
    expectedHardConstraintSetChanged: authority.expectedHardConstraintSetChanged, expectedSoftPreferenceSetChanged: authority.expectedSoftPreferenceSetChanged,
    expectedEligibilityEffect: authority.eligibilityExpectation, rankingDirection: "NOT_CONFIGURED" as const,
    allowedUncertainty: [], expectedExplanationEvidence: [], expectationClass: "STRUCTURAL_INVARIANT" as const,
    productApprovalStatus: "NOT_REQUIRED_STRUCTURAL" as const, oracleVersion: STRUCTURAL_ORACLE_VERSION,
    authorityBinding: { authorityRecordId: authority.authorityRecordId, authorityHash: authority.authorityHash },
  };
  return deepFreeze(ScenarioOracleSchema.parse(withContentHash(body, "oracleHash"))) as ScenarioOracle;
}

export function validateScenarioOracle(oracleValue: unknown, authorityValue: unknown, trustAnchorValue: unknown): ScenarioOracle {
  const oracle = ScenarioOracleSchema.parse(oracleValue); const authority = validateOracleAuthority(authorityValue, trustAnchorValue);
  assertContentHash(oracle as unknown as Record<string, unknown>, "oracleHash");
  if (oracle.oracleVersion !== STRUCTURAL_ORACLE_VERSION) throw new Error("context_oracle_version_unknown");
  if (oracle.authorityBinding.authorityRecordId !== authority.authorityRecordId || oracle.authorityBinding.authorityHash !== authority.authorityHash || oracle.oracleId !== authority.oracleId || oracle.scenarioId !== authority.scenarioId || oracle.baseContextHash !== authority.baseContextHash || oracle.flippedContextHash !== authority.flippedContextHash || canonicalJson(oracle.expectedStructuralChanges) !== canonicalJson(authority.allowedStructuralChanges) || canonicalJson(oracle.expectedInputChanges) !== canonicalJson(authority.allowedInputChanges) || oracle.expectedHardConstraintSetChanged !== authority.expectedHardConstraintSetChanged || oracle.expectedSoftPreferenceSetChanged !== authority.expectedSoftPreferenceSetChanged || oracle.expectedEligibilityEffect !== authority.eligibilityExpectation) throw new Error("context_oracle_authority_binding_mismatch");
  if (oracle.expectationClass !== "STRUCTURAL_INVARIANT" || oracle.productApprovalStatus !== "NOT_REQUIRED_STRUCTURAL" || oracle.rankingDirection !== "NOT_CONFIGURED" || oracle.expectedExplanationEvidence.length !== 0) throw new Error("context_oracle_product_claim_not_authorized");
  return oracle;
}

function dimensionMap(value: VerifiedContextSnapshot): Map<string, string> { return new Map(value.snapshot.dimensions.map((item) => [item.dimensionKey, item.dimensionHash])); }

function changedInputClasses(base: VerifiedContextSnapshot, flipped: VerifiedContextSnapshot): OracleAuthorityRecord["allowedInputChanges"] {
  const changed: OracleAuthorityRecord["allowedInputChanges"][number][] = [];
  if (canonicalJson(base.client.request) !== canonicalJson(flipped.client.request)) changed.push("CLIENT_REQUEST");
  if (canonicalJson(base.client.explicitDimensions) !== canonicalJson(flipped.client.explicitDimensions)) changed.push("CLIENT_EXPLICIT_DIMENSIONS");
  if (canonicalJson(base.client.hardConstraints) !== canonicalJson(flipped.client.hardConstraints)) changed.push("CLIENT_HARD_CONSTRAINTS");
  if (canonicalJson(base.client.softPreferences) !== canonicalJson(flipped.client.softPreferences)) changed.push("CLIENT_SOFT_PREFERENCES");
  if (base.envelope.authority.serverTime !== flipped.envelope.authority.serverTime || base.envelope.authority.expiresAt !== flipped.envelope.authority.expiresAt) changed.push("AUTHORITY_SERVER_TIME");
  const location = (value: VerifiedContextSnapshot) => ({ clientLocationInputHash: value.envelope.authority.clientLocationInputHash, authorizedLocationScope: value.envelope.authority.authorizedLocationScope, locationComparison: value.envelope.authority.locationComparison, locationSource: value.envelope.authority.locationSource });
  if (canonicalJson(location(base)) !== canonicalJson(location(flipped))) changed.push("AUTHORITY_LOCATION");
  if (base.envelope.authority.locationPermission !== flipped.envelope.authority.locationPermission) changed.push("AUTHORITY_PERMISSION");
  if (base.envelope.authority.timeZone !== flipped.envelope.authority.timeZone) changed.push("AUTHORITY_TIME_ZONE");
  if (canonicalJson(base.envelope.authority.weatherObservationBinding) !== canonicalJson(flipped.envelope.authority.weatherObservationBinding)) changed.push("AUTHORITY_WEATHER");
  if (canonicalJson(base.envelope.authority.sessionState) !== canonicalJson(flipped.envelope.authority.sessionState)) changed.push("AUTHORITY_SESSION_STATE");
  return changed.sort();
}

function assertStableFlipBindings(base: VerifiedContextSnapshot, flipped: VerifiedContextSnapshot): void {
  const stable = (value: VerifiedContextSnapshot) => ({ decisionId: value.snapshot.decisionId, sessionId: value.snapshot.sessionId, actorSubjectBindingHash: value.snapshot.actorSubjectBindingHash, registryBinding: value.snapshot.registryBinding, policyBinding: value.snapshot.policyBinding, worldSnapshotBindingHash: value.snapshot.sourceBindings.worldSnapshotBindingHash, userProjectionBindingHash: value.snapshot.sourceBindings.userProjectionBindingHash, candidatePoolBindingHash: value.snapshot.sourceBindings.candidatePoolBindingHash, eligibilityPolicyBindingHash: value.snapshot.sourceBindings.eligibilityPolicyBindingHash, degradationPolicyBindingHash: value.snapshot.sourceBindings.degradationPolicyBindingHash });
  if (canonicalJson(stable(base)) !== canonicalJson(stable(flipped))) throw new Error("context_flip_cross_domain_binding_changed");
}

export function buildContextFlipReport(baseValue: VerifiedContextSnapshot, flippedValue: VerifiedContextSnapshot, oracleValue: unknown, authorityValue: unknown, trustAnchorValue: unknown): ContextFlipReport {
  const base = requireVerifiedContext(baseValue); const flipped = requireVerifiedContext(flippedValue); const authority = validateOracleAuthority(authorityValue, trustAnchorValue); const oracle = validateScenarioOracle(oracleValue, authority, trustAnchorValue);
  assertStableFlipBindings(base, flipped);
  const validFrom = Date.parse(authority.validFrom), validUntil = Date.parse(authority.validUntil);
  if ([base.snapshot.temporal.serverTime, flipped.snapshot.temporal.serverTime].some((at) => Date.parse(at) < validFrom || Date.parse(at) > validUntil)) throw new Error("context_oracle_authority_not_valid_for_context");
  if (authority.baseEnvelopeHash !== base.envelope.envelopeHash || authority.flippedEnvelopeHash !== flipped.envelope.envelopeHash || authority.baseContextIdentity !== contextExecutionIdentity(base.snapshot) || authority.flippedContextIdentity !== contextExecutionIdentity(flipped.snapshot) || oracle.baseContextHash !== base.snapshot.contextHash || oracle.flippedContextHash !== flipped.snapshot.contextHash) throw new Error("context_oracle_snapshot_binding_mismatch");
  const baseDimensions = dimensionMap(base), flippedDimensions = dimensionMap(flipped); const keys = [...new Set([...baseDimensions.keys(), ...flippedDimensions.keys()])].sort();
  const changedDimensionKeys = keys.filter((dimensionKey) => baseDimensions.get(dimensionKey) !== flippedDimensions.get(dimensionKey)); const unchangedDimensionKeys = keys.filter((dimensionKey) => baseDimensions.get(dimensionKey) === flippedDimensions.get(dimensionKey)); const inputChanges = changedInputClasses(base, flipped);
  const hardConstraintSetChanged = canonicalJson(base.snapshot.hardConstraints) !== canonicalJson(flipped.snapshot.hardConstraints); const softPreferenceSetChanged = canonicalJson(base.snapshot.softPreferences) !== canonicalJson(flipped.snapshot.softPreferences);
  if (canonicalJson(changedDimensionKeys) !== canonicalJson(oracle.expectedStructuralChanges) || canonicalJson(inputChanges) !== canonicalJson(oracle.expectedInputChanges) || hardConstraintSetChanged !== oracle.expectedHardConstraintSetChanged || softPreferenceSetChanged !== oracle.expectedSoftPreferenceSetChanged) {
    throw new Error(`context_oracle_structural_expectation_failed:${canonicalJson({ actual: { changedDimensionKeys, inputChanges, hardConstraintSetChanged, softPreferenceSetChanged }, expected: { changedDimensionKeys: oracle.expectedStructuralChanges, inputChanges: oracle.expectedInputChanges, hardConstraintSetChanged: oracle.expectedHardConstraintSetChanged, softPreferenceSetChanged: oracle.expectedSoftPreferenceSetChanged } })}`);
  }
  const body = { contractVersion: CONTEXT_KERNEL_VERSIONS.flipReport, scenarioId: oracle.scenarioId, baseContextHash: base.snapshot.contextHash, flippedContextHash: flipped.snapshot.contextHash, baseDecisionIdentity: contextExecutionIdentity(base.snapshot), flippedDecisionIdentity: contextExecutionIdentity(flipped.snapshot), baseEnvelopeHash: base.envelope.envelopeHash, flippedEnvelopeHash: flipped.envelope.envelopeHash, oracleAuthorityHash: authority.authorityHash, changedDimensionKeys, unchangedDimensionKeys, changedInputClasses: inputChanges, hardConstraintSetChanged, softPreferenceSetChanged, writesUserIntelligence: false as const, rankingQualityClaim: false as const, oracle };
  return deepFreeze(ContextFlipReportSchema.parse(withContentHash(body, "reportHash"))) as ContextFlipReport;
}

export function validateContextFlipReport(reportValue: unknown, baseValue: VerifiedContextSnapshot, flippedValue: VerifiedContextSnapshot, authorityValue: unknown, trustAnchorValue: unknown): ContextFlipReport {
  const report = ContextFlipReportSchema.parse(reportValue); assertContentHash(report as unknown as Record<string, unknown>, "reportHash");
  const expected = buildContextFlipReport(baseValue, flippedValue, report.oracle, authorityValue, trustAnchorValue);
  if (canonicalJson(expected) !== canonicalJson(report)) throw new Error("context_flip_replay_mismatch");
  return report;
}

export function contextFlipReportHash(report: ContextFlipReport): string { return contentHash(report); }
