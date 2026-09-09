import { assertContentHash, withContentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, EngineManifestSchema, type EngineManifest } from "./contracts.js";
import { PHASE1_WORLD_REGISTRY_VERSION } from "./world-knowledge.js";

export const PHASE1_VERSIONS = Object.freeze({
  engine: "backyrd-decision-vnext-phase1-spine-v1",
  context: "backyrd-vnext-context-resolver-phase1-v1",
  candidateGenerator: "backyrd-vnext-synthetic-neutral-candidates-v1",
  eligibility: "backyrd-vnext-eligibility-phase1-v1",
  features: "backyrd-vnext-phase1-fixture-features-v1",
  confidence: "backyrd-vnext-confidence-uncalibrated-v1",
  evidence: "backyrd-vnext-evidence-assembly-v1",
  explanation: "backyrd-vnext-deterministic-explanation-v1",
  taxonomyFixture: "backyrd-vnext-taxonomy-fixture-v1-unapproved",
} as const);

export function createEngineManifest(input: {
  sourceSha: string;
  sandboxWorldVersion: string;
  rankingVersion: string;
  weightFixtureVersion: string;
}): EngineManifest {
  return EngineManifestSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.engineManifest,
    contractSetVersion: "backyrd-vnext-contract-set-v1",
    decisionRequestVersion: CONTRACT_VERSIONS.decisionRequest,
    decisionResultVersion: CONTRACT_VERSIONS.decisionResult,
    engineVersion: PHASE1_VERSIONS.engine,
    sourceSha: input.sourceSha,
    sandboxWorldVersion: input.sandboxWorldVersion,
    worldRegistryVersion: PHASE1_WORLD_REGISTRY_VERSION,
    contextVersion: PHASE1_VERSIONS.context,
    candidateGeneratorVersion: PHASE1_VERSIONS.candidateGenerator,
    eligibilityRulesetVersion: PHASE1_VERSIONS.eligibility,
    featureSetVersion: PHASE1_VERSIONS.features,
    rankingVersion: input.rankingVersion,
    weightFixtureVersion: input.weightFixtureVersion,
    taxonomyFixtureVersion: PHASE1_VERSIONS.taxonomyFixture,
    confidenceVersion: PHASE1_VERSIONS.confidence,
    evidenceVersion: PHASE1_VERSIONS.evidence,
    explanationVersion: PHASE1_VERSIONS.explanation,
  }, "manifestHash"));
}

export function validateEngineManifest(manifest: EngineManifest): void {
  EngineManifestSchema.parse(manifest);
  assertContentHash(manifest as unknown as Record<string, unknown>, "manifestHash");
}
