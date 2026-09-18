#!/usr/bin/env node
import {
  FOUNDER_LIVE_UUID_ARTIFACT_MANIFEST_HASH,
  FOUNDER_LIVE_UUID_AUTHORITY_RELEASE,
  FOUNDER_LIVE_UUID_AUTHORITY_TRUST_ANCHOR,
  FOUNDER_LIVE_UUID_FLAGS,
  FOUNDER_LIVE_UUID_NO_WRITE_PROOF,
  FOUNDER_LIVE_UUID_RETENTION_TEMPLATE,
  FOUNDER_LIVE_UUID_RETENTION_TEMPLATE_HASH,
  canonicalJson,
  contentHash,
} from "../../packages/user-intelligence-vnext-core/dist/index.js";

const body = Object.freeze({
  contractVersion: "backyrd.user-intelligence.founder-live-uuid-authority-report@1.0",
  canonicalBaseSha: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.canonicalBaseSha,
  canonicalBaseTree: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.canonicalBaseTree,
  releaseId: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.releaseId,
  releaseHash: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.releaseHash,
  trustAnchorId: FOUNDER_LIVE_UUID_AUTHORITY_TRUST_ANCHOR.anchorId,
  trustAnchorHash: FOUNDER_LIVE_UUID_AUTHORITY_TRUST_ANCHOR.anchorHash,
  artifactManifestHash: FOUNDER_LIVE_UUID_ARTIFACT_MANIFEST_HASH,
  noWriteProofHash: FOUNDER_LIVE_UUID_NO_WRITE_PROOF.proofHash,
  retentionTemplateHash: FOUNDER_LIVE_UUID_RETENTION_TEMPLATE_HASH,
  retentionStatus: FOUNDER_LIVE_UUID_RETENTION_TEMPLATE.status,
  expectedMemberCount: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.expectedMemberCount,
  acceptedIdentifierKind: FOUNDER_LIVE_UUID_AUTHORITY_RELEASE.acceptedIdentifierKind,
  identifierValuesIncluded: false,
  personalDataIncluded: false,
  privateProviderRequired: true,
  providerEnumerationExposed: false,
  flags: FOUNDER_LIVE_UUID_FLAGS,
  productionPlan: {
    migrations: [], functions: [], authChanges: [], productWiring: false,
    runtimeDeploymentRequired: false, executionAuthorized: false,
  },
});

const report = Object.freeze({ ...body, reportHash: contentHash(body) });
process.stdout.write(`${canonicalJson(report)}\n`);
