import { REGISTRY_HASH, REGISTRY_VERSION, RULE_REGISTRY_HASH, RULE_REGISTRY_VERSION, WORLD_KNOWLEDGE_PORT_VERSION } from "@backyrd/world-knowledge-core";
import { contentHash, withContentHash } from "./canonical.js";
import { BASELINE_FIXTURES, type BaselineId } from "./baselines.js";
import { generateNeutralCandidatePool } from "./candidate-pool.js";
import { CONTRACT_VERSIONS, DecisionExecutionEnvelopeSchema, DecisionRequestSchema, type DecisionExecutionEnvelope } from "./contracts.js";
import { resolveSituationalContext } from "./context.js";
import { createEngineManifest } from "./manifest.js";
import { buildSyntheticNeutralProjection, type SyntheticWorld } from "./sandbox.js";

export function createSyntheticExecution(input: { request: unknown; world: SyntheticWorld; baseline: BaselineId; sourceSha: string; candidatePoolSize?: number; actor?: { kind: "user"; userId: string; subjectBindingHash: string } | { kind: "anonymous"; subjectBindingHash: string }; personalizationKillSwitch?: boolean }): DecisionExecutionEnvelope {
  const request = DecisionRequestSchema.parse(input.request); const actor = input.actor ?? { kind: "anonymous" as const, subjectBindingHash: contentHash("phase1-anonymous-subject") };
  const decisionId = `decision-${request.idempotencyKey}`; const serverRequestId = `server-${request.idempotencyKey}`; const sessionId = `session-${request.idempotencyKey}`;
  if (request.location.kind !== "city") throw new Error("phase1_city_location_required");
  const context = resolveSituationalContext(request, { decisionId, sessionId, executedAt: input.world.observedAt, actorSubjectBindingHash: actor.subjectBindingHash, authorizedLocationScope: request.location });
  const pool = generateNeutralCandidatePool({ world: input.world, context, serverRequestId, ...(input.candidatePoolSize === undefined ? {} : { limit: input.candidatePoolSize }) });
  const userId = actor.kind === "user" ? actor.userId : "synthetic-anonymous-user";
  const projection = buildSyntheticNeutralProjection({ requestId: serverRequestId, decisionId, userId, subjectBindingHash: actor.subjectBindingHash, contextHash: context.contextHash, intentKeys: context.explicit.intentKeys, ...(input.personalizationKillSwitch === undefined ? {} : { killSwitch: input.personalizationKillSwitch }) });
  const fixture = input.baseline === "baseline-a-open-distance-popularity" ? BASELINE_FIXTURES.a : BASELINE_FIXTURES.b;
  const manifest = createEngineManifest({ sourceSha: input.sourceSha, sandboxWorldVersion: input.world.version, rankingVersion: fixture.rankingVersion, weightFixtureVersion: fixture.weightFixtureVersion });
  const worldBinding = { portContractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, ruleRegistryVersion: RULE_REGISTRY_VERSION, ruleRegistryHash: RULE_REGISTRY_HASH, snapshotSetHash: contentHash(pool.candidates.map((item) => item.candidate.worldReference.snapshotHash)) };
  const userBinding = { projectionContractVersion: projection.contractVersion, projectionId: projection.projectionId, projectionHash: projection.projectionHash, manifestId: projection.manifest.manifestId, manifestHash: projection.manifest.manifestHash, subjectBindingHash: projection.subjectBindingHash };
  return DecisionExecutionEnvelopeSchema.parse(withContentHash({ contractVersion: CONTRACT_VERSIONS.executionEnvelope, authenticatedActor: actor, decisionId, serverRequestId, sessionId, executedAt: input.world.observedAt, rolloutMode: "evaluation", deadlineAt: new Date(new Date(input.world.observedAt).getTime() + 5_000).toISOString(), serverIdempotencyKey: `server-${request.idempotencyKey}`, contextBinding: { contractVersion: context.contractVersion, id: context.decisionId, hash: context.contextHash }, worldBinding, userBinding, candidatePoolBinding: { contractVersion: pool.contractVersion, id: pool.serverRequestId, hash: pool.candidatePoolHash }, engineManifest: manifest, degradationState: ["CAPABILITY_INTENT_REGISTRY_NOT_CONFIGURED", `USER_${projection.neutralReason ?? "ACTIVE"}`], personalizationKillSwitch: input.personalizationKillSwitch ?? false, commercialInfluence: "FORBIDDEN" }, "envelopeHash"));
}
