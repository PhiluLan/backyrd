/** Local/CI provisioning only. This module is deliberately not exported from the package runtime index. */
import { contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { DARK_SHADOW_VERSIONS, DarkShadowAuthoritySchema, DarkShadowTrustAnchorSchema, type DarkShadowAuthority, type DarkShadowTrustAnchor } from "./shadow-contracts.js";
import { DARK_SHADOW_ENGINE_REGISTRY, DARK_SHADOW_ORACLE_CATALOG, DARK_SHADOW_RELEASE } from "./shadow.js";
import { PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY, PHASE3C_FOUNDER_LAB_RELEASE } from "./phase3c-lab.js";
import { PHASE3C_LAB_VERSIONS } from "./phase3c-lab-contracts.js";
import { CONTRACT_VERSIONS as USER_CONTRACT_VERSIONS } from "@backyrd/user-intelligence-vnext-core";
import { WORLD_KNOWLEDGE_PORT_VERSION } from "@backyrd/world-knowledge-core";

export function provisionLocalDarkShadowAuthority(input: { sourceSha: string; sourceTreeHash: string }): { authority: DarkShadowAuthority; trustAnchor: DarkShadowTrustAnchor } {
  const artifactIdentityHash = contentHash({ releaseHash: DARK_SHADOW_RELEASE.releaseHash, oracleCatalogHash: DARK_SHADOW_ORACLE_CATALOG.catalogHash, engineRegistryHash: DARK_SHADOW_ENGINE_REGISTRY.engineRegistryHash });
  const authority = deepFreeze(DarkShadowAuthoritySchema.parse(withContentHash({
    contractVersion: DARK_SHADOW_VERSIONS.authority,
    authorityId: "decision-vnext-dark-shadow-local-ci-authority-week1-1",
    scope: "SYNTHETIC_LOCAL_EVALUATION_ONLY" as const,
    sourceIdentity: { sourceSha: input.sourceSha, sourceTreeHash: input.sourceTreeHash, artifactIdentityHash },
    releaseHash: DARK_SHADOW_RELEASE.releaseHash,
    oracleCatalogHash: DARK_SHADOW_ORACLE_CATALOG.catalogHash,
    engineRegistryHash: DARK_SHADOW_ENGINE_REGISTRY.engineRegistryHash,
    phase3CReleaseHash: PHASE3C_FOUNDER_LAB_RELEASE.releaseHash,
    phase3CPolicyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash,
    worldPortVersion: WORLD_KNOWLEDGE_PORT_VERSION,
    userProjectionVersion: USER_CONTRACT_VERSIONS.projection,
    contextVersion: PHASE3C_LAB_VERSIONS.interpretation,
    validFrom: "2026-09-16T00:00:00.000Z",
    validUntil: "2027-09-16T00:00:00.000Z",
    productionCapable: false as const,
  }, "authorityHash")));
  const trustAnchor = deepFreeze(DarkShadowTrustAnchorSchema.parse({
    contractVersion: DARK_SHADOW_VERSIONS.trustAnchor,
    trustAnchorId: "decision-vnext-dark-shadow-local-ci-trust-week1-1",
    acceptedAuthorityId: authority.authorityId,
    acceptedAuthorityHash: authority.authorityHash,
    acceptedSourceSha: authority.sourceIdentity.sourceSha,
    acceptedSourceTreeHash: authority.sourceIdentity.sourceTreeHash,
    acceptedArtifactIdentityHash: authority.sourceIdentity.artifactIdentityHash,
    acceptedReleaseHash: authority.releaseHash,
    scope: "SYNTHETIC_FIXTURE_ONLY" as const,
    productionCapable: false as const,
  }));
  return { authority, trustAnchor };
}
