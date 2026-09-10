import { REGISTRY_HASH, REGISTRY_VERSION, RULE_REGISTRY_HASH, RULE_REGISTRY_VERSION, WORLD_KNOWLEDGE_PORT_VERSION } from "@backyrd/world-knowledge-core";
import { CONTRACT_VERSIONS as USER_CONTRACT_VERSIONS } from "@backyrd/user-intelligence-vnext-core";
import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { CONTRACT_VERSIONS } from "./contracts.js";
import { PHASE2_ENGINE_REGISTRY_VERSION } from "./engine-registry.js";
import { PHASE1_VERSIONS } from "./manifest.js";
import {
  EvaluationAuthorityRecordSchema, EvaluationAuthorityTrustAnchorSchema, PHASE2_CONTRACT_VERSIONS, PHASE2_ENGINE_IDS,
  type EvaluationAuthorityRecord, type EvaluationAuthorityTrustAnchor,
} from "./phase2-contracts.js";
import { SyntheticWorldConfigSchema, generateSyntheticWorld, type SyntheticWorld, type SyntheticWorldConfig } from "./sandbox.js";
import { SYNTHETIC_WORLD_SOURCE_POLICY } from "./synthetic-world-policy.js";

export const PHASE2_CANDIDATE_SOURCE_ID = "synthetic-neutral-world-reader-phase2-v1" as const;

export function createSyntheticEvaluationAuthority(input: {
  readonly authorityId: string;
  readonly scenarioId: string;
  readonly sandboxConfig: SyntheticWorldConfig;
  readonly worldHash: string;
  readonly sourceSha: string;
  readonly sourceTreeHash: string;
  readonly artifactIdentityHash: string;
  readonly candidatePoolLimit?: number;
}): EvaluationAuthorityRecord {
  const sandboxConfig = SyntheticWorldConfigSchema.parse(input.sandboxConfig);
  const body = {
    contractVersion: PHASE2_CONTRACT_VERSIONS.evaluationAuthority,
    authorityId: input.authorityId,
    authorityKind: "SYNTHETIC_LOCAL_EVALUATION" as const,
    scenario: { scenarioId: input.scenarioId, seed: sandboxConfig.seed, sandboxConfig, sandboxConfigHash: contentHash(sandboxConfig), worldVersion: sandboxConfig.worldVersion, worldHash: input.worldHash },
    sourceIdentity: { sourceSha: input.sourceSha, sourceTreeHash: input.sourceTreeHash, artifactIdentityHash: input.artifactIdentityHash },
    worldIdentity: { portVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, ruleRegistryVersion: RULE_REGISTRY_VERSION, ruleRegistryHash: RULE_REGISTRY_HASH, sourcePolicyVersion: SYNTHETIC_WORLD_SOURCE_POLICY.policyVersion, sourcePolicyHash: SYNTHETIC_WORLD_SOURCE_POLICY.policyHash },
    userProjectionContractVersion: USER_CONTRACT_VERSIONS.projection,
    contextContractVersion: CONTRACT_VERSIONS.contextSnapshot,
    candidatePoolOrigin: { generatorVersion: PHASE1_VERSIONS.candidateGenerator, sourceId: PHASE2_CANDIDATE_SOURCE_ID, limit: input.candidatePoolLimit ?? sandboxConfig.candidatePoolSize },
    engineRegistryVersion: PHASE2_ENGINE_REGISTRY_VERSION,
    engineIds: PHASE2_ENGINE_IDS,
    productionCapable: false as const,
  };
  return deepFreeze(EvaluationAuthorityRecordSchema.parse(withContentHash(body, "authorityHash"))) as EvaluationAuthorityRecord;
}

/** Local/CI fixture helper only. A Production verifier must receive its trust anchor from independent deployment authority. */
export function trustSyntheticEvaluationAuthorityForLocalExecution(authority: EvaluationAuthorityRecord, trustAnchorId = "phase2-local-ci-trust-anchor"): EvaluationAuthorityTrustAnchor {
  return deepFreeze(EvaluationAuthorityTrustAnchorSchema.parse({ contractVersion: PHASE2_CONTRACT_VERSIONS.evaluationTrustAnchor, trustAnchorId, acceptedAuthorityId: authority.authorityId, acceptedAuthorityHash: authority.authorityHash, acceptedSourceSha: authority.sourceIdentity.sourceSha, acceptedSourceTreeHash: authority.sourceIdentity.sourceTreeHash, acceptedArtifactIdentityHash: authority.sourceIdentity.artifactIdentityHash, acceptedEngineRegistryVersion: authority.engineRegistryVersion, authorityKind: "SYNTHETIC_LOCAL_EVALUATION", productionCapable: false })) as EvaluationAuthorityTrustAnchor;
}

export function validateEvaluationAuthority(authorityValue: unknown, trustAnchorValue: unknown): EvaluationAuthorityRecord {
  const authority = EvaluationAuthorityRecordSchema.parse(authorityValue);
  const trust = EvaluationAuthorityTrustAnchorSchema.parse(trustAnchorValue);
  assertContentHash(authority as unknown as Record<string, unknown>, "authorityHash");
  if (authority.scenario.sandboxConfigHash !== contentHash(authority.scenario.sandboxConfig) || authority.scenario.seed !== authority.scenario.sandboxConfig.seed || authority.scenario.worldVersion !== authority.scenario.sandboxConfig.worldVersion) throw new Error("evaluation_scenario_binding_mismatch");
  if (canonicalJson(authority.engineIds) !== canonicalJson(PHASE2_ENGINE_IDS) || authority.engineRegistryVersion !== PHASE2_ENGINE_REGISTRY_VERSION) throw new Error("evaluation_engine_registry_binding_mismatch");
  if (authority.candidatePoolOrigin.generatorVersion !== PHASE1_VERSIONS.candidateGenerator || authority.worldIdentity.portVersion !== WORLD_KNOWLEDGE_PORT_VERSION || authority.worldIdentity.registryVersion !== REGISTRY_VERSION || authority.worldIdentity.registryHash !== REGISTRY_HASH || authority.worldIdentity.ruleRegistryVersion !== RULE_REGISTRY_VERSION || authority.worldIdentity.ruleRegistryHash !== RULE_REGISTRY_HASH || authority.worldIdentity.sourcePolicyVersion !== SYNTHETIC_WORLD_SOURCE_POLICY.policyVersion || authority.worldIdentity.sourcePolicyHash !== SYNTHETIC_WORLD_SOURCE_POLICY.policyHash || authority.userProjectionContractVersion !== USER_CONTRACT_VERSIONS.projection || authority.contextContractVersion !== CONTRACT_VERSIONS.contextSnapshot) throw new Error("evaluation_authority_contract_binding_mismatch");
  if (trust.acceptedAuthorityId !== authority.authorityId || trust.acceptedAuthorityHash !== authority.authorityHash || trust.acceptedSourceSha !== authority.sourceIdentity.sourceSha || trust.acceptedSourceTreeHash !== authority.sourceIdentity.sourceTreeHash || trust.acceptedArtifactIdentityHash !== authority.sourceIdentity.artifactIdentityHash || trust.acceptedEngineRegistryVersion !== authority.engineRegistryVersion) throw new Error("evaluation_authority_not_trusted");
  return authority;
}

export function validateSyntheticWorldAuthority(world: SyntheticWorld, authority: EvaluationAuthorityRecord): void {
  const expected = generateSyntheticWorld(authority.scenario.sandboxConfig);
  const identity = (value: SyntheticWorld) => ({ version: value.version, observedAt: value.observedAt, seed: value.seed, worldHash: value.worldHash, spots: value.spots.map((spot) => ({ id: spot.id, snapshotHash: spot.snapshot.snapshotHash, retrieval: spot.retrieval })), users: value.users.map((user) => user) });
  if (authority.scenario.worldHash !== expected.worldHash || canonicalJson(identity(world)) !== canonicalJson(identity(expected))) throw new Error("evaluation_scenario_world_config_mismatch");
}
