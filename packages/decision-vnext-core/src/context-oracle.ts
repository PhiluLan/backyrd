import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { CONTEXT_KERNEL_VERSIONS, ContextFlipReportSchema, ContextSnapshotSchema, ScenarioOracleSchema, type ContextFlipReport, type ContextSnapshot, type ScenarioOracle } from "./context-kernel-contracts.js";
import { contextExecutionIdentity } from "./context-kernel.js";

export function createStructuralOracle(input: {
  readonly oracleId: string;
  readonly scenarioId: string;
  readonly baseContextHash: string;
  readonly flippedContextHash: string;
  readonly expectedStructuralChanges: readonly string[];
  readonly expectedEligibilityEffect?: "UNCHANGED" | "MAY_CHANGE_BY_CONFIGURED_HARD_CONSTRAINT" | "NOT_CONFIGURED";
  readonly expectedExplanationEvidence?: readonly string[];
  readonly allowedUncertainty?: readonly string[];
  readonly approvedAt: string;
}): ScenarioOracle {
  const authorityBody = { contractVersion: CONTEXT_KERNEL_VERSIONS.oracleAuthority, authorityId: `technical-${input.oracleId}`, authorityKind: "TECHNICAL_ARCHITECTURE" as const, approvedAt: input.approvedAt };
  const authorityRecord = withContentHash(authorityBody, "authorityHash");
  const body = { contractVersion: CONTEXT_KERNEL_VERSIONS.oracle, oracleId: input.oracleId, scenarioId: input.scenarioId, baseContextHash: input.baseContextHash, flippedContextHash: input.flippedContextHash, expectedStructuralChanges: [...input.expectedStructuralChanges].sort(), expectedEligibilityEffect: input.expectedEligibilityEffect ?? "NOT_CONFIGURED", rankingDirection: "NOT_CONFIGURED" as const, allowedUncertainty: [...(input.allowedUncertainty ?? [])].sort(), expectedExplanationEvidence: [...(input.expectedExplanationEvidence ?? [])].sort(), expectationClass: "STRUCTURAL_INVARIANT" as const, productApprovalStatus: "NOT_REQUIRED_STRUCTURAL" as const, oracleVersion: "backyrd-vnext-context-structural-oracle-v1", authorityRecord };
  return deepFreeze(ScenarioOracleSchema.parse(withContentHash(body, "oracleHash"))) as ScenarioOracle;
}

export function validateScenarioOracle(oracleValue: unknown): ScenarioOracle {
  const oracle = ScenarioOracleSchema.parse(oracleValue);
  assertContentHash(oracle as unknown as Record<string, unknown>, "oracleHash"); assertContentHash(oracle.authorityRecord as unknown as Record<string, unknown>, "authorityHash");
  if (oracle.expectationClass === "FOUNDER_APPROVED_EXPECTATION" || oracle.productApprovalStatus === "FOUNDER_APPROVED" || oracle.authorityRecord.authorityKind === "FOUNDER_PRODUCT") throw new Error("context_oracle_founder_authority_not_configured");
  // Phase 3A intentionally has no externally trusted Founder authority root.
  // A ranking direction is therefore never authorized by this package, even
  // when an attacker recomputes the surrounding hashes.
  if (oracle.rankingDirection !== "NOT_CONFIGURED") throw new Error("context_oracle_ranking_claim_not_authorized");
  if (oracle.expectationClass === "STRUCTURAL_INVARIANT" && (oracle.productApprovalStatus !== "NOT_REQUIRED_STRUCTURAL" || oracle.authorityRecord.authorityKind !== "TECHNICAL_ARCHITECTURE")) throw new Error("context_oracle_structural_authority_invalid");
  return oracle;
}

function dimensionMap(snapshot: ContextSnapshot): Map<string, string> { return new Map(snapshot.dimensions.map((item) => [item.dimensionKey, item.dimensionHash])); }

export function buildContextFlipReport(baseValue: unknown, flippedValue: unknown, oracleValue: unknown): ContextFlipReport {
  const base = ContextSnapshotSchema.parse(baseValue); const flipped = ContextSnapshotSchema.parse(flippedValue); const oracle = validateScenarioOracle(oracleValue);
  if (oracle.baseContextHash !== base.contextHash || oracle.flippedContextHash !== flipped.contextHash) throw new Error("context_oracle_snapshot_binding_mismatch");
  const baseDimensions = dimensionMap(base), flippedDimensions = dimensionMap(flipped); const keys = [...new Set([...baseDimensions.keys(), ...flippedDimensions.keys()])].sort();
  const changedDimensionKeys = keys.filter((key) => baseDimensions.get(key) !== flippedDimensions.get(key)); const unchangedDimensionKeys = keys.filter((key) => baseDimensions.get(key) === flippedDimensions.get(key));
  if (!oracle.expectedStructuralChanges.every((key) => changedDimensionKeys.includes(key))) throw new Error("context_oracle_structural_expectation_failed");
  const body = { contractVersion: CONTEXT_KERNEL_VERSIONS.flipReport, scenarioId: oracle.scenarioId, baseContextHash: base.contextHash, flippedContextHash: flipped.contextHash, baseDecisionIdentity: contextExecutionIdentity(base), flippedDecisionIdentity: contextExecutionIdentity(flipped), changedDimensionKeys, unchangedDimensionKeys, hardConstraintSetChanged: canonicalJson(base.hardConstraints) !== canonicalJson(flipped.hardConstraints), softPreferenceSetChanged: canonicalJson(base.softPreferences) !== canonicalJson(flipped.softPreferences), writesUserIntelligence: false as const, rankingQualityClaim: false as const, oracle };
  return deepFreeze(ContextFlipReportSchema.parse(withContentHash(body, "reportHash"))) as ContextFlipReport;
}

export function validateContextFlipReport(reportValue: unknown, baseValue: unknown, flippedValue: unknown): ContextFlipReport {
  const report = ContextFlipReportSchema.parse(reportValue); const base = ContextSnapshotSchema.parse(baseValue); const flipped = ContextSnapshotSchema.parse(flippedValue);
  assertContentHash(report as unknown as Record<string, unknown>, "reportHash"); validateScenarioOracle(report.oracle);
  const expected = buildContextFlipReport(base, flipped, report.oracle);
  if (canonicalJson(expected) !== canonicalJson(report)) throw new Error("context_flip_replay_mismatch");
  return report;
}

export function contextFlipReportHash(report: ContextFlipReport): string { return contentHash(report); }
