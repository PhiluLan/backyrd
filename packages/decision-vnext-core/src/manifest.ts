import { CONTRACT_VERSIONS as USER_VERSIONS } from "@backyrd/user-intelligence-vnext-core";
import { REGISTRY_HASH, REGISTRY_VERSION, RULE_REGISTRY_HASH, RULE_REGISTRY_VERSION, WORLD_KNOWLEDGE_PORT_VERSION } from "@backyrd/world-knowledge-core";
import { assertContentHash, withContentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, EngineManifestSchema, type EngineManifest } from "./contracts.js";
import { BASELINE_FIXTURES } from "./baselines.js";

export const PHASE1_VERSIONS = Object.freeze({ engine: "backyrd-decision-vnext-phase1-integrity-v3", context: CONTRACT_VERSIONS.contextSnapshot, candidateGenerator: "backyrd-vnext-synthetic-neutral-candidates-v3", eligibility: "backyrd-vnext-eligibility-phase1-v1", unknownPolicy: "backyrd-vnext-rule-local-unknown-policies-v1", features: "backyrd-vnext-phase1-fixture-features-v1", openingState: "backyrd-vnext-opening-state-evaluator-v1", openingSourcePolicy: "backyrd-vnext-synthetic-opening-source-policy-v1-unapproved", confidence: "backyrd-vnext-confidence-uncalibrated-v2", evidence: "backyrd-vnext-evidence-assembly-v2", explanation: "backyrd-vnext-deterministic-explanation-v2" } as const);

export function createEngineManifest(input: { sourceSha: string; sandboxWorldVersion: string; rankingVersion: string; weightFixtureVersion: string }): EngineManifest {
  return EngineManifestSchema.parse(withContentHash({ contractVersion: CONTRACT_VERSIONS.engineManifest, contractSetVersion: "backyrd-vnext-contract-set-v3", decisionRequestVersion: CONTRACT_VERSIONS.decisionRequest, executionEnvelopeVersion: CONTRACT_VERSIONS.executionEnvelope, decisionResultVersion: CONTRACT_VERSIONS.decisionResult, engineVersion: PHASE1_VERSIONS.engine, sourceSha: input.sourceSha, sandboxWorldVersion: input.sandboxWorldVersion, worldPortVersion: WORLD_KNOWLEDGE_PORT_VERSION, worldRegistryVersion: REGISTRY_VERSION, worldRegistryHash: REGISTRY_HASH, worldRuleRegistryVersion: RULE_REGISTRY_VERSION, worldRuleRegistryHash: RULE_REGISTRY_HASH, userProjectionVersion: USER_VERSIONS.projection, userManifestVersion: USER_VERSIONS.manifest, contextVersion: PHASE1_VERSIONS.context, candidateGeneratorVersion: PHASE1_VERSIONS.candidateGenerator, candidatePoolVersion: CONTRACT_VERSIONS.candidatePool, eligibilityRulesetVersion: PHASE1_VERSIONS.eligibility, unknownPolicyVersion: PHASE1_VERSIONS.unknownPolicy, featureSetVersion: PHASE1_VERSIONS.features, openingStateVersion: PHASE1_VERSIONS.openingState, openingSourcePolicyVersion: PHASE1_VERSIONS.openingSourcePolicy, rankingVersion: input.rankingVersion, weightFixtureVersion: input.weightFixtureVersion, confidenceVersion: PHASE1_VERSIONS.confidence, evidenceVersion: PHASE1_VERSIONS.evidence, explanationVersion: PHASE1_VERSIONS.explanation, explorationPolicyVersion: "NOT_CONFIGURED" }, "manifestHash"));
}

export function validateEngineManifest(manifest: EngineManifest): void {
  EngineManifestSchema.parse(manifest);
  assertContentHash(manifest as unknown as Record<string, unknown>, "manifestHash");
  const supported = {
    contractSetVersion: "backyrd-vnext-contract-set-v3", decisionRequestVersion: CONTRACT_VERSIONS.decisionRequest, executionEnvelopeVersion: CONTRACT_VERSIONS.executionEnvelope,
    decisionResultVersion: CONTRACT_VERSIONS.decisionResult, engineVersion: PHASE1_VERSIONS.engine, worldPortVersion: WORLD_KNOWLEDGE_PORT_VERSION,
    worldRegistryVersion: REGISTRY_VERSION, worldRuleRegistryVersion: RULE_REGISTRY_VERSION, userProjectionVersion: USER_VERSIONS.projection,
    userManifestVersion: USER_VERSIONS.manifest, contextVersion: PHASE1_VERSIONS.context, candidateGeneratorVersion: PHASE1_VERSIONS.candidateGenerator,
    candidatePoolVersion: CONTRACT_VERSIONS.candidatePool, eligibilityRulesetVersion: PHASE1_VERSIONS.eligibility, unknownPolicyVersion: PHASE1_VERSIONS.unknownPolicy,
    featureSetVersion: PHASE1_VERSIONS.features, openingStateVersion: PHASE1_VERSIONS.openingState, openingSourcePolicyVersion: PHASE1_VERSIONS.openingSourcePolicy,
    confidenceVersion: PHASE1_VERSIONS.confidence, evidenceVersion: PHASE1_VERSIONS.evidence, explanationVersion: PHASE1_VERSIONS.explanation,
    explorationPolicyVersion: "NOT_CONFIGURED",
  } as const;
  for (const [field, expected] of Object.entries(supported)) if (manifest[field as keyof EngineManifest] !== expected) throw new Error(`engine_manifest_unsupported_version:${field}`);
  const fixture = Object.values(BASELINE_FIXTURES).find((item) => item.rankingVersion === manifest.rankingVersion && item.weightFixtureVersion === manifest.weightFixtureVersion);
  if (!fixture) throw new Error("engine_manifest_unsupported_ranking_fixture");
  if (manifest.worldRegistryHash !== REGISTRY_HASH || manifest.worldRuleRegistryHash !== RULE_REGISTRY_HASH) throw new Error("engine_manifest_world_binding_mismatch");
}
