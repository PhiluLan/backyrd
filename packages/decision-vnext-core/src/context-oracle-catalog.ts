import { assertContentHash, canonicalJson, deepFreeze } from "./canonical.js";
import {
  OracleAuthorityCatalogSchema,
  OracleCatalogReleaseRecordSchema,
  OracleTrustAnchorCatalogSchema,
  type OracleAuthorityCatalog,
  type OracleAuthorityCatalogEntry,
  type OracleCatalogReleaseRecord,
  type OracleTrustAnchorCatalog,
  type OracleTrustAnchorCatalogEntry,
} from "./context-kernel-contracts.js";

const PHASE3A_ORACLE_SUPPORTED_BINDINGS = Object.freeze({
  registryVersion: "backyrd-vnext-context-fixture-registry-v1",
  registryHash: "048b794a9072c3c52ba5186bc604c455b8aef20cf3c7dbe07dfbc190bb531042",
  policyVersion: "backyrd-vnext-context-fixture-policy-v1",
  policyHash: "b1ad89e7b4b3d81165767c608bffcf5eb2b7cbd43e5f255effed10620999cce4",
  workbenchVersion: "backyrd-vnext-context-flip-workbench-phase3a-v1",
});

declare const acceptedOracleCatalogsBrand: unique symbol;
export interface AcceptedOracleCatalogs {
  readonly authorityCatalog: OracleAuthorityCatalog;
  readonly trustAnchorCatalog: OracleTrustAnchorCatalog;
  readonly release: OracleCatalogReleaseRecord;
  readonly [acceptedOracleCatalogsBrand]: true;
}

const acceptedCatalogCapabilities = new WeakSet<object>();

function assertExactSet(actual: readonly string[], expected: readonly string[], code: string): void {
  if (new Set(actual).size !== actual.length || canonicalJson(actual) !== canonicalJson(expected)) throw new Error(code);
}

function assertUnique(values: readonly string[], code: string): void {
  if (new Set(values).size !== values.length) throw new Error(code);
}

function validateAuthorityEntry(entry: OracleAuthorityCatalogEntry): void {
  assertContentHash(entry as unknown as Record<string, unknown>, "entryHash");
  assertContentHash(entry.authority as unknown as Record<string, unknown>, "authorityHash");
  const authority = entry.authority;
  const expected = {
    scenarioId: authority.scenarioId,
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
  };
  const actual = Object.fromEntries(Object.entries(entry).filter(([field]) => Object.hasOwn(expected, field)));
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error("context_oracle_authority_catalog_entry_binding_mismatch");
  if (entry.productionAuthorized || entry.productQualityClaim || entry.rankingExpectation !== "NOT_CONFIGURED" || entry.approvalClass !== "NOT_REQUIRED_STRUCTURAL") throw new Error("context_oracle_catalog_product_claim_not_authorized");
  if (canonicalJson(entry.allowedScenarioIds) !== canonicalJson([entry.scenarioId])) throw new Error("context_oracle_catalog_scenario_scope_invalid");
  if (entry.registryVersion !== PHASE3A_ORACLE_SUPPORTED_BINDINGS.registryVersion || entry.registryHash !== PHASE3A_ORACLE_SUPPORTED_BINDINGS.registryHash) throw new Error("context_oracle_registry_version_unknown");
  if (entry.contextPolicyVersion !== PHASE3A_ORACLE_SUPPORTED_BINDINGS.policyVersion || entry.contextPolicyHash !== PHASE3A_ORACLE_SUPPORTED_BINDINGS.policyHash) throw new Error("context_oracle_policy_version_unknown");
  if (entry.workbenchVersion !== PHASE3A_ORACLE_SUPPORTED_BINDINGS.workbenchVersion) throw new Error("context_oracle_workbench_version_unknown");
}

function validateAnchorEntry(entry: OracleTrustAnchorCatalogEntry): void {
  assertContentHash(entry as unknown as Record<string, unknown>, "anchorHash");
  if (entry.productionCapable || entry.productApproved || entry.authorityClass !== "SYNTHETIC_FIXTURE_ONLY") throw new Error("context_oracle_anchor_scope_invalid");
}

export function validateAcceptedOracleCatalogs(
  authorityValue: unknown,
  trustAnchorValue: unknown,
  releaseValue: unknown,
  acceptedReleaseHash: string,
  expectedScenarioIds: readonly string[],
): AcceptedOracleCatalogs {
  const authorityCatalog = OracleAuthorityCatalogSchema.parse(authorityValue);
  const trustAnchorCatalog = OracleTrustAnchorCatalogSchema.parse(trustAnchorValue);
  const release = OracleCatalogReleaseRecordSchema.parse(releaseValue);
  assertContentHash(authorityCatalog as unknown as Record<string, unknown>, "catalogHash");
  assertContentHash(trustAnchorCatalog as unknown as Record<string, unknown>, "catalogHash");
  assertContentHash(release as unknown as Record<string, unknown>, "releaseHash");
  if (release.releaseHash !== acceptedReleaseHash) throw new Error("context_oracle_release_not_accepted");
  assertExactSet(authorityCatalog.scenarioAllowlist, expectedScenarioIds, "context_oracle_authority_catalog_scenario_set_mismatch");
  assertExactSet(trustAnchorCatalog.scenarioAllowlist, expectedScenarioIds, "context_oracle_anchor_catalog_scenario_set_mismatch");
  assertExactSet(release.scenarioAllowlist, expectedScenarioIds, "context_oracle_release_scenario_set_mismatch");
  if (authorityCatalog.entries.length !== expectedScenarioIds.length || trustAnchorCatalog.entries.length !== expectedScenarioIds.length) throw new Error("context_oracle_catalog_entry_count_mismatch");
  for (const entry of authorityCatalog.entries) validateAuthorityEntry(entry);
  for (const entry of trustAnchorCatalog.entries) validateAnchorEntry(entry);
  assertUnique(authorityCatalog.entries.map((entry) => entry.scenarioId), "context_oracle_duplicate_scenario_id");
  assertUnique(authorityCatalog.entries.map((entry) => entry.oracleId), "context_oracle_duplicate_oracle_id");
  assertUnique(authorityCatalog.entries.map((entry) => entry.authorityRecordId), "context_oracle_duplicate_authority_id");
  assertUnique(trustAnchorCatalog.entries.map((entry) => entry.trustAnchorId), "context_oracle_duplicate_trust_anchor_id");
  assertUnique(trustAnchorCatalog.entries.map((entry) => entry.scenarioId), "context_oracle_duplicate_anchor_scenario_id");
  if (canonicalJson(authorityCatalog.entries.map((entry) => entry.scenarioId)) !== canonicalJson(expectedScenarioIds) || canonicalJson(trustAnchorCatalog.entries.map((entry) => entry.scenarioId)) !== canonicalJson(expectedScenarioIds)) throw new Error("context_oracle_catalog_order_mismatch");
  if (trustAnchorCatalog.authorityCatalogVersion !== authorityCatalog.catalogVersion || trustAnchorCatalog.authorityCatalogHash !== authorityCatalog.catalogHash) throw new Error("context_oracle_catalog_cross_binding_mismatch");
  if (release.authorityCatalogVersion !== authorityCatalog.catalogVersion || release.authorityCatalogHash !== authorityCatalog.catalogHash || release.trustAnchorCatalogVersion !== trustAnchorCatalog.catalogVersion || release.trustAnchorCatalogHash !== trustAnchorCatalog.catalogHash) throw new Error("context_oracle_release_catalog_binding_mismatch");
  if (release.productionCapable || release.productApproved || release.authorityClass !== "SYNTHETIC_FIXTURE_ONLY") throw new Error("context_oracle_release_scope_invalid");
  for (let index = 0; index < expectedScenarioIds.length; index += 1) {
    const authority = authorityCatalog.entries[index]; const anchor = trustAnchorCatalog.entries[index];
    if (!authority || !anchor || authority.scenarioId !== anchor.scenarioId || authority.authorityRecordId !== anchor.authorityRecordId || authority.authorityRecordHash !== anchor.acceptedAuthorityHash || authority.oracleId !== anchor.acceptedOracleId || authority.oracleVersion !== anchor.acceptedOracleVersion || authority.authority.issuer !== anchor.acceptedIssuer) throw new Error("context_oracle_anchor_authority_binding_mismatch");
  }
  const accepted = deepFreeze({ authorityCatalog, trustAnchorCatalog, release }) as unknown as AcceptedOracleCatalogs;
  acceptedCatalogCapabilities.add(accepted);
  return accepted;
}

export function selectAcceptedOracleArtifacts(catalogs: AcceptedOracleCatalogs, scenarioId: string): { readonly authorityEntry: OracleAuthorityCatalogEntry; readonly trustAnchor: OracleTrustAnchorCatalogEntry } {
  if (!catalogs || typeof catalogs !== "object" || !acceptedCatalogCapabilities.has(catalogs)) throw new Error("context_oracle_catalogs_require_verified_release_capability");
  if (!catalogs.release.scenarioAllowlist.includes(scenarioId)) throw new Error("context_oracle_scenario_not_in_release");
  const authorityEntry = catalogs.authorityCatalog.entries.find((entry) => entry.scenarioId === scenarioId);
  const trustAnchor = catalogs.trustAnchorCatalog.entries.find((entry) => entry.scenarioId === scenarioId);
  if (!authorityEntry) throw new Error("context_oracle_authority_missing_from_catalog");
  if (!trustAnchor) throw new Error("context_oracle_trust_anchor_missing_from_catalog");
  if (authorityEntry.authorityRecordHash !== trustAnchor.acceptedAuthorityHash) throw new Error("context_oracle_selected_artifact_binding_mismatch");
  return deepFreeze({ authorityEntry, trustAnchor });
}
