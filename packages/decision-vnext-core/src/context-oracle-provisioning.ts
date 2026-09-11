/**
 * Synthetic release provisioning only. This module is intentionally not exported
 * by the package root and must never be used by a workbench run to mint trust.
 */
import { deepFreeze, withContentHash } from "./canonical.js";
import {
  CONTEXT_KERNEL_VERSIONS,
  OracleAuthorityCatalogEntrySchema,
  OracleAuthorityCatalogSchema,
  OracleAuthorityRecordSchema,
  OracleCatalogReleaseRecordSchema,
  OracleTrustAnchorCatalogEntrySchema,
  OracleTrustAnchorCatalogSchema,
  type OracleAuthorityCatalog,
  type OracleAuthorityRecord,
  type OracleCatalogReleaseRecord,
  type OracleTrustAnchorCatalog,
} from "./context-kernel-contracts.js";

export interface OracleAuthorityFixtureSpec {
  readonly scenarioId: string;
  readonly baseContextHash: string;
  readonly flippedContextHash: string;
  readonly baseContextIdentity: string;
  readonly flippedContextIdentity: string;
  readonly baseEnvelopeHash: string;
  readonly flippedEnvelopeHash: string;
  readonly changes: readonly string[];
  readonly inputs: readonly OracleAuthorityRecord["allowedInputChanges"][number][];
  readonly hardChanged: boolean;
  readonly softChanged: boolean;
  readonly eligibility: OracleAuthorityRecord["eligibilityExpectation"];
  readonly expectedAuthorityHash: string;
}

export const ORACLE_FIXTURE_VALID_FROM = "2026-01-15T00:00:00.000Z";
export const ORACLE_FIXTURE_VALID_UNTIL = "2027-01-15T00:00:00.000Z";
export const ORACLE_WORKBENCH_VERSION = "backyrd-vnext-context-flip-workbench-phase3a-v1";
export const ORACLE_AUTHORITY_CATALOG_VERSION = "backyrd-vnext-context-oracle-authority-catalog-phase3a-v1";
export const ORACLE_TRUST_CATALOG_VERSION = "backyrd-vnext-context-oracle-trust-anchor-catalog-phase3a-v1";

function authorityFromSpec(spec: OracleAuthorityFixtureSpec): OracleAuthorityRecord {
  const oracleId = `oracle-${spec.scenarioId}`;
  const body = {
    contractVersion: CONTEXT_KERNEL_VERSIONS.oracleAuthority,
    authorityRecordId: `technical-authority-${oracleId}`,
    issuer: "BACKYRD_TECHNICAL_EVALUATION_FIXTURE" as const,
    oracleId,
    oracleVersion: "backyrd-vnext-context-structural-oracle-v1" as const,
    scenarioId: spec.scenarioId,
    baseContextHash: spec.baseContextHash,
    flippedContextHash: spec.flippedContextHash,
    baseContextIdentity: spec.baseContextIdentity,
    flippedContextIdentity: spec.flippedContextIdentity,
    baseEnvelopeHash: spec.baseEnvelopeHash,
    flippedEnvelopeHash: spec.flippedEnvelopeHash,
    expectationClass: "STRUCTURAL_INVARIANT" as const,
    allowedStructuralChanges: [...new Set(spec.changes)].sort(),
    allowedInputChanges: [...new Set(spec.inputs)].sort(),
    expectedHardConstraintSetChanged: spec.hardChanged,
    expectedSoftPreferenceSetChanged: spec.softChanged,
    eligibilityExpectation: spec.eligibility,
    rankingExpectation: "NOT_CONFIGURED" as const,
    approvalClass: "NOT_REQUIRED_STRUCTURAL" as const,
    validFrom: ORACLE_FIXTURE_VALID_FROM,
    validUntil: ORACLE_FIXTURE_VALID_UNTIL,
    allowedScenarioIds: [spec.scenarioId],
  };
  const authority = OracleAuthorityRecordSchema.parse(withContentHash(body, "authorityHash"));
  if (authority.authorityHash !== spec.expectedAuthorityHash) throw new Error(`oracle_fixture_authority_release_drift:${spec.scenarioId}`);
  return authority;
}

export function provisionSyntheticAuthorityCatalog(
  specs: readonly OracleAuthorityFixtureSpec[],
  registry: { readonly version: string; readonly hash: string },
  policy: { readonly version: string; readonly hash: string },
): OracleAuthorityCatalog {
  const entries = specs.map((spec) => {
    const authority = authorityFromSpec(spec);
    return OracleAuthorityCatalogEntrySchema.parse(withContentHash({
      scenarioId: spec.scenarioId,
      oracleId: authority.oracleId,
      oracleVersion: authority.oracleVersion,
      authorityRecordId: authority.authorityRecordId,
      authorityRecordHash: authority.authorityHash,
      baseScenarioIdentity: authority.baseContextIdentity,
      flippedScenarioIdentity: authority.flippedContextIdentity,
      expectedStructuralChanges: authority.allowedStructuralChanges,
      expectedInputChanges: authority.allowedInputChanges,
      expectedHardConstraintSetChanged: authority.expectedHardConstraintSetChanged,
      expectedSoftPreferenceSetChanged: authority.expectedSoftPreferenceSetChanged,
      eligibilityExpectation: authority.eligibilityExpectation,
      rankingExpectation: authority.rankingExpectation,
      approvalClass: authority.approvalClass,
      validFrom: authority.validFrom,
      validUntil: authority.validUntil,
      allowedScenarioIds: authority.allowedScenarioIds,
      registryVersion: registry.version,
      registryHash: registry.hash,
      contextPolicyVersion: policy.version,
      contextPolicyHash: policy.hash,
      workbenchVersion: ORACLE_WORKBENCH_VERSION,
      productionAuthorized: false as const,
      productQualityClaim: false as const,
      authority,
    }, "entryHash"));
  });
  return deepFreeze(OracleAuthorityCatalogSchema.parse(withContentHash({
    contractVersion: CONTEXT_KERNEL_VERSIONS.oracleAuthorityCatalog,
    catalogVersion: ORACLE_AUTHORITY_CATALOG_VERSION,
    scenarioAllowlist: specs.map((spec) => spec.scenarioId),
    entries,
  }, "catalogHash")));
}

export function provisionSyntheticTrustAnchorCatalog(specs: readonly OracleAuthorityFixtureSpec[], authorityCatalogVersion: string, authorityCatalogHash: string): OracleTrustAnchorCatalog {
  const entries = specs.map((spec) => OracleTrustAnchorCatalogEntrySchema.parse(withContentHash({
    trustAnchorId: `phase3a-oracle-trust-anchor-${spec.scenarioId}`,
    scenarioId: spec.scenarioId,
    authorityRecordId: `technical-authority-oracle-${spec.scenarioId}`,
    acceptedAuthorityHash: spec.expectedAuthorityHash,
    acceptedIssuer: "BACKYRD_TECHNICAL_EVALUATION_FIXTURE" as const,
    acceptedOracleId: `oracle-${spec.scenarioId}`,
    acceptedOracleVersion: "backyrd-vnext-context-structural-oracle-v1" as const,
    authorityClass: "SYNTHETIC_FIXTURE_ONLY" as const,
    productionCapable: false as const,
    productApproved: false as const,
  }, "anchorHash")));
  return deepFreeze(OracleTrustAnchorCatalogSchema.parse(withContentHash({
    contractVersion: CONTEXT_KERNEL_VERSIONS.oracleTrustAnchorCatalog,
    catalogVersion: ORACLE_TRUST_CATALOG_VERSION,
    authorityCatalogVersion,
    authorityCatalogHash,
    scenarioAllowlist: specs.map((spec) => spec.scenarioId),
    entries,
  }, "catalogHash")));
}

export function provisionSyntheticOracleRelease(authorityCatalog: OracleAuthorityCatalog, trustAnchorCatalog: OracleTrustAnchorCatalog): OracleCatalogReleaseRecord {
  return deepFreeze(OracleCatalogReleaseRecordSchema.parse(withContentHash({
    contractVersion: CONTEXT_KERNEL_VERSIONS.oracleRelease,
    releaseId: "backyrd-vnext-context-oracle-release-phase3a-v1" as const,
    authorityCatalogVersion: authorityCatalog.catalogVersion,
    authorityCatalogHash: authorityCatalog.catalogHash,
    trustAnchorCatalogVersion: trustAnchorCatalog.catalogVersion,
    trustAnchorCatalogHash: trustAnchorCatalog.catalogHash,
    workbenchVersion: ORACLE_WORKBENCH_VERSION,
    reportContractVersion: CONTEXT_KERNEL_VERSIONS.flipReport,
    scenarioAllowlist: authorityCatalog.scenarioAllowlist,
    authorityClass: "SYNTHETIC_FIXTURE_ONLY" as const,
    productionCapable: false as const,
    productApproved: false as const,
  }, "releaseHash")));
}
