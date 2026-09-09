import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACT_VERSIONS,
  PHASE1_WORLD_REGISTRY_VERSION,
  WorldConceptRefSchema,
  WorldCandidateSchema,
  WorldKnowledgePortResultSchema,
  WorldKnowledgeQuerySchema,
  candidateEvidence,
  createWorldEntityRelation,
  createWorldFact,
  generateNeutralCandidatePool,
  resolvePhase1Context,
  validateWorldKnowledge,
  validateWorldKnowledgePortResult,
  withContentHash,
} from "../dist/index.js";
import { execution, request, world } from "./helpers.mjs";

const fixtureCandidate = () => {
  const syntheticWorld = world();
  const envelope = execution(undefined, syntheticWorld);
  const context = resolvePhase1Context(request(), envelope);
  const pool = generateNeutralCandidatePool({ world: syntheticWorld, context, serverRequestId: envelope.serverRequestId, limit: 36 });
  return { envelope, pool, candidate: pool.candidates[0].candidate };
};

test("world knowledge preserves structural domains without canonicalizing fixture vocabulary", () => {
  const { envelope, candidate } = fixtureCandidate();
  const knowledge = candidate.worldKnowledge;
  assert.equal(knowledge.registryVersion, PHASE1_WORLD_REGISTRY_VERSION);
  assert.equal(envelope.engineManifest.worldRegistryVersion, knowledge.registryVersion);
  assert.equal(knowledge.spotEntity.entityType, "spot");
  assert.ok(knowledge.categoryAssignments.length > 1, "fixture proves multi-category support");
  assert.ok(knowledge.subcategories.length > 0);
  assert.ok(knowledge.decisionIntents.facts.length > 0);
  assert.ok(knowledge.capabilities.length > 0);
  assert.ok(knowledge.decisionIntents.capabilityRelations.length > 0);
  assert.notDeepEqual(knowledge.decisionIntents.facts.map((fact) => fact.concept), knowledge.capabilities.map((fact) => fact.concept));
  assert.ok(knowledge.situationFit.directClaims.length > 0);
  assert.ok(knowledge.situationFit.derivedFits.length > 0);
  assert.ok(knowledge.amenitiesAndConstraints.length > 0);
  assert.ok(knowledge.temporalAndCurrentState.length > 0);
  assert.ok(candidateEvidence(candidate).length > 0);
  validateWorldKnowledge(knowledge);
  assert.deepEqual(WorldConceptRefSchema.parse({ registryVersion: "future-registry-v17", conceptId: "future.concept.opaque-id" }), {
    registryVersion: "future-registry-v17",
    conceptId: "future.concept.opaque-id",
  });
});

test("typed facts preserve false, unknown, not-applicable, disputed and expired semantics", () => {
  const base = {
    concept: { registryVersion: "test-registry-v1", conceptId: "test.fact" },
    source: { kind: "synthetic_fixture", sourceId: "test-source", sourceVersion: "test-source-v1" },
    verification: { status: "synthetic_fixture", methodVersion: "test-method-v1", verifiedAt: "2026-01-01T00:00:00.000Z" },
    observedAt: "2026-01-01T00:00:00.000Z",
    validFrom: null,
    validUntil: null,
    confidence: 0.5,
    evidenceIds: [],
  };
  const variants = [
    createWorldFact({ ...base, factId: "fact-test-false", state: "known_false", value: { kind: "boolean", value: false } }),
    createWorldFact({ ...base, factId: "fact-test-unknown", state: "unknown", value: { kind: "unavailable" } }),
    createWorldFact({ ...base, factId: "fact-test-na", state: "not_applicable", value: { kind: "unavailable" } }),
    createWorldFact({ ...base, factId: "fact-test-disputed", state: "disputed", value: { kind: "text", value: "conflicting-source-claims" } }),
    createWorldFact({ ...base, factId: "fact-test-expired", state: "expired", value: { kind: "number", value: 1, unit: "fixture" } }),
  ];
  assert.deepEqual(variants.map((fact) => fact.state), ["known_false", "unknown", "not_applicable", "disputed", "expired"]);
  assert.equal(new Set(variants.map((fact) => fact.factHash)).size, variants.length);
  assert.ok(variants.every((fact) => "source" in fact && "verification" in fact && "observedAt" in fact && "validFrom" in fact && "validUntil" in fact && "confidence" in fact && "evidenceIds" in fact));
  assert.throws(() => createWorldFact({ ...base, factId: "fact-test-collapsed-false", state: "known", value: { kind: "boolean", value: false } }), /no union variant matched/);
  assert.throws(() => createWorldFact({ ...base, factId: "fact-test-collapsed-unknown", state: "known", value: { kind: "unavailable" } }), /no union variant matched/);
});

test("events and temporary places remain separate relation targets", () => {
  const concept = { registryVersion: "future-registry-v1", conceptId: "future.relation" };
  const common = { relationConcept: concept, fromEntity: { entityType: "spot", entityId: "spot-1" }, evidenceIds: [] };
  const event = createWorldEntityRelation({ ...common, relationId: "relation-event-1", toEntity: { entityType: "event", entityId: "event-1" } });
  const temporary = createWorldEntityRelation({ ...common, relationId: "relation-temporary-1", toEntity: { entityType: "temporary_place", entityId: "temporary-1" } });
  assert.equal(event.toEntity.entityType, "event");
  assert.equal(temporary.toEntity.entityType, "temporary_place");
});

test("WorldKnowledgePort is strict, versioned and carries opaque registry concepts", () => {
  const { candidate } = fixtureCandidate();
  const query = WorldKnowledgeQuerySchema.parse({
    contractVersion: CONTRACT_VERSIONS.worldKnowledgePort,
    requestId: "request-1",
    asOf: "2026-01-01T00:00:00.000Z",
    registryVersion: candidate.worldKnowledge.registryVersion,
    candidateIds: [candidate.spotId],
  });
  assert.equal(query.candidateIds[0], candidate.spotId);
  const result = WorldKnowledgePortResultSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.worldKnowledgePort,
    portVersion: "test-port-v1",
    registryVersion: candidate.worldKnowledge.registryVersion,
    candidates: [candidate],
  }, "resultHash"));
  assert.equal(result.candidates.length, 1);
  validateWorldKnowledgePortResult(result);
  assert.throws(() => WorldKnowledgeQuerySchema.parse({ ...query, ownerTier: "premium" }), /unknown field/);
  assert.throws(() => WorldCandidateSchema.parse({ ...candidate, sponsored: true }), /unknown field/);
});
