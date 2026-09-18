#!/usr/bin/env node
import {
  PRODUCTION_PROJECTION_ARTIFACT_HASH,
  PRODUCTION_PROJECTION_PORT_FLAGS,
  PRODUCTION_PROJECTION_PORT_NO_WRITE_PROOF,
  PRODUCTION_PROJECTION_PORT_RELEASE,
  PRODUCTION_PROJECTION_PORT_TRUST_ANCHOR,
  PRODUCTION_PROJECTION_PROJECT_BINDING_HASH,
  PRODUCTION_PROJECTION_SOURCE_SET_HASH,
  canonicalJson,
  contentHash,
} from "../../packages/user-intelligence-vnext-core/dist/index.js";

const body = Object.freeze({
  contractVersion: "backyrd.user-intelligence.production-projection-port-report@1.0",
  canonicalBaseSha: PRODUCTION_PROJECTION_PORT_RELEASE.canonicalBaseSha,
  canonicalBaseTree: PRODUCTION_PROJECTION_PORT_RELEASE.canonicalBaseTree,
  releaseId: PRODUCTION_PROJECTION_PORT_RELEASE.releaseId,
  releaseHash: PRODUCTION_PROJECTION_PORT_RELEASE.releaseHash,
  trustAnchorId: PRODUCTION_PROJECTION_PORT_TRUST_ANCHOR.anchorId,
  trustAnchorHash: PRODUCTION_PROJECTION_PORT_TRUST_ANCHOR.anchorHash,
  projectBindingHash: PRODUCTION_PROJECTION_PROJECT_BINDING_HASH,
  sourceSetHash: PRODUCTION_PROJECTION_SOURCE_SET_HASH,
  artifactHash: PRODUCTION_PROJECTION_ARTIFACT_HASH,
  purpose: PRODUCTION_PROJECTION_PORT_RELEASE.purpose,
  noWriteProofHash: PRODUCTION_PROJECTION_PORT_NO_WRITE_PROOF.proofHash,
  personalIdentifiersIncluded: false,
  privateMetadataIncluded: false,
  rawEvidenceIncluded: false,
  syntheticOrEmptyFallback: false,
  flags: PRODUCTION_PROJECTION_PORT_FLAGS,
  productionPlan: {
    migrations: [], functions: [], authChanges: [], productWiring: false,
    runtimeDeploymentRequired: false, executionAuthorized: false,
  },
});

process.stdout.write(`${canonicalJson({ ...body, reportHash: contentHash(body) })}\n`);
