import { assertContentHash, deepFreeze, withContentHash } from "./canonical.js";
import { CandidatePoolSnapshotSchema, CONTRACT_VERSIONS, WorldCandidateSchema, WorldKnowledgeSchema, type CandidatePoolSnapshot, type DecisionContextSnapshot, type EvidenceItem, type WorldCandidate } from "./contracts.js";
import { createEvidence } from "./evidence.js";
import { PHASE1_VERSIONS } from "./manifest.js";
import type { SyntheticSpot, SyntheticWorld } from "./sandbox.js";
import { createDerivedSituationFit, createWorldConceptRelation, createWorldFact, PHASE1_WORLD_REGISTRY_VERSION, validateWorldKnowledge } from "./world-knowledge.js";

const evidenceId = (spotId: string, kind: string) => `ev-${spotId.slice(4)}-${kind}`;

export function toWorldCandidate(spot: SyntheticSpot, observedAt: string): WorldCandidate {
  const source = { kind: "synthetic_world" as const, sourceId: spot.sourceId, observedAt };
  const base = { contractVersion: CONTRACT_VERSIONS.evidence, spotId: spot.id, source };
  const concept = (conceptId: string) => ({ registryVersion: PHASE1_WORLD_REGISTRY_VERSION, conceptId });
  const conceptEvidence = (group: string, keys: readonly string[]): EvidenceItem[] => keys.map((key, index) => createEvidence({
    ...base,
    evidenceId: evidenceId(spot.id, `${group}-${index + 1}`),
    kind: "world_concept",
    value: { concept: concept(key) },
    confidence: spot.dataQuality,
  }));
  const categoryEvidence = conceptEvidence("category", spot.categoryKeys);
  const subcategoryEvidence = conceptEvidence("subcategory", spot.subcategoryKeys);
  const capabilityEvidence = conceptEvidence("capability", spot.capabilityKeys);
  const evidence: EvidenceItem[] = [
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "distribution"), kind: "distribution", value: { allowed: spot.distributionAllowed }, confidence: 1 }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "city"), kind: "city", value: { city: spot.city }, confidence: 1 }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "open"), kind: "open_status", value: { status: spot.openStatus }, confidence: spot.openStatus === "unknown" ? 0 : 1 }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "distance"), kind: "distance", value: { meters: spot.distanceMeters }, confidence: 1 }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "popularity"), kind: "popularity", value: { normalized: spot.popularity }, confidence: spot.dataQuality }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "intents"), kind: "intent_tags", value: { keys: [...spot.intentKeys] }, confidence: spot.dataQuality }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "moods"), kind: "mood_tags", value: { keys: [...spot.situationFitKeys] }, confidence: spot.dataQuality }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "quality"), kind: "data_quality", value: { normalized: spot.dataQuality, state: spot.dataQuality >= 0.75 ? "complete" : spot.dataQuality >= 0.4 ? "partial" : "weak" }, confidence: 1 }),
    ...categoryEvidence,
    ...subcategoryEvidence,
    ...capabilityEvidence,
  ];
  const factSource = { kind: "synthetic_fixture" as const, sourceId: spot.sourceId, sourceVersion: "backyrd-vnext-synthetic-facts-v1" };
  const verification = { status: "synthetic_fixture" as const, methodVersion: "backyrd-vnext-synthetic-verification-v1", verifiedAt: observedAt };
  const fact = (suffix: string, conceptId: string, value: Record<string, unknown>, evidenceIds: readonly string[], state: "known" | "known_false" | "unknown" = "known") => createWorldFact({
    factId: `fact-${spot.id.slice(4)}-${suffix}`,
    concept: concept(conceptId),
    state,
    value,
    source: factSource,
    verification,
    observedAt,
    validFrom: observedAt,
    validUntil: null,
    confidence: spot.dataQuality,
    evidenceIds,
  });
  const categoryAssignments = spot.categoryKeys.map((key, index) => fact(`category-${index + 1}`, key, { kind: "boolean", value: true }, [categoryEvidence[index]!.evidenceId]));
  const subcategories = spot.subcategoryKeys.map((key, index) => fact(`subcategory-${index + 1}`, key, { kind: "boolean", value: true }, [subcategoryEvidence[index]!.evidenceId]));
  const intentFacts = spot.intentKeys.map((key, index) => fact(`intent-${index + 1}`, key, { kind: "boolean", value: true }, [evidenceId(spot.id, "intents")]));
  const capabilityFacts = spot.capabilityKeys.map((key, index) => fact(`capability-${index + 1}`, key, { kind: "boolean", value: true }, [capabilityEvidence[index]!.evidenceId]));
  const situationFacts = spot.situationFitKeys.map((key, index) => fact(`situation-${index + 1}`, key, { kind: "boolean", value: true }, [evidenceId(spot.id, "moods")]));
  const capabilityRelations = intentFacts.map((intentFact, index) => {
    const capabilityFact = capabilityFacts[index % capabilityFacts.length]!;
    return createWorldConceptRelation({
      relationId: `relation-${spot.id}-intent-capability-${index + 1}`,
      relationConcept: concept("fixture.relation.intent-capability"),
      fromConcept: intentFact.concept,
      toConcept: capabilityFact.concept,
      evidenceIds: [...intentFact.evidenceIds, ...capabilityFact.evidenceIds],
    });
  });
  const derivedFits = capabilityFacts.length === 0 || situationFacts.length === 0 ? [] : [createDerivedSituationFit({
    derivedFitId: `derived-${spot.id}-situation-1`,
    fitConcept: concept(`fixture.derived.${situationFacts[0]!.concept.conceptId}`),
    derivationVersion: "backyrd-vnext-synthetic-situation-derivation-v1-unapproved",
    derivedFromFactIds: [capabilityFacts[0]!.factId],
    evidenceIds: capabilityFacts[0]!.evidenceIds,
    confidence: spot.dataQuality,
  })];
  const amenitiesAndConstraints = [
    fact("distribution", "fixture.world.distribution-allowed", { kind: "boolean", value: spot.distributionAllowed }, [evidenceId(spot.id, "distribution")], spot.distributionAllowed ? "known" : "known_false"),
    fact("city", "fixture.world.city", { kind: "text", value: spot.city }, [evidenceId(spot.id, "city")]),
    fact("distance", "fixture.world.distance", { kind: "number", value: spot.distanceMeters, unit: "meters" }, [evidenceId(spot.id, "distance")]),
  ];
  const temporalAndCurrentState = [
    spot.openStatus === "unknown"
      ? fact("open", "fixture.world.open-status", { kind: "unavailable" }, [evidenceId(spot.id, "open")], "unknown")
      : fact("open", "fixture.world.open-status", { kind: "open_status", value: spot.openStatus }, [evidenceId(spot.id, "open")]),
    fact("popularity", "fixture.world.popularity", { kind: "number", value: spot.popularity, unit: "normalized" }, [evidenceId(spot.id, "popularity")]),
    fact("quality", "fixture.world.data-quality", { kind: "number", value: spot.dataQuality, unit: "normalized" }, [evidenceId(spot.id, "quality")]),
  ];
  const worldKnowledge = WorldKnowledgeSchema.parse(withContentHash({
    registryVersion: PHASE1_WORLD_REGISTRY_VERSION,
    spotEntity: { entityType: "spot", entityId: spot.id },
    categoryAssignments,
    subcategories,
    decisionIntents: { facts: intentFacts, capabilityRelations },
    capabilities: capabilityFacts,
    situationFit: { directClaims: situationFacts, derivedFits },
    amenitiesAndConstraints,
    temporalAndCurrentState,
    evidenceAndConfidence: {
      evidence,
      status: "uncalibrated-phase1",
      coverage: spot.dataQuality,
      limitations: ["fixture-world-vocabulary-not-canonical"],
    },
    relatedEntities: [],
  }, "knowledgeHash"));
  validateWorldKnowledge(worldKnowledge);
  return WorldCandidateSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.worldCandidate,
    spotId: spot.id,
    city: spot.city,
    distanceMeters: spot.distanceMeters,
    distributionAllowed: spot.distributionAllowed,
    openStatus: spot.openStatus,
    fixturePopularity: spot.popularity,
    fixtureDataQuality: spot.dataQuality,
    worldKnowledge,
  }, "candidateHash"));
}

export function generateNeutralCandidatePool(input: {
  world: SyntheticWorld;
  context: DecisionContextSnapshot;
  serverRequestId: string;
  limit?: number;
}): CandidatePoolSnapshot {
  const limit = input.limit ?? 24;
  const ordered = [...input.world.spots]
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, limit)
    .map((spot, index) => ({
      candidate: toWorldCandidate(spot, input.world.observedAt),
      retrievalSource: { kind: "synthetic_fixture" as const, sourceId: "synthetic-neutral-rule-v1", personalized: false as const },
      retrievalPosition: index + 1,
    }));
  const snapshot = CandidatePoolSnapshotSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.candidatePool,
    serverRequestId: input.serverRequestId,
    worldVersion: input.world.version,
    candidateGeneratorVersion: PHASE1_VERSIONS.candidateGenerator,
    candidates: ordered,
  }, "candidatePoolHash"));
  return deepFreeze(snapshot) as CandidatePoolSnapshot;
}

export function validateCandidatePool(pool: CandidatePoolSnapshot): void {
  CandidatePoolSnapshotSchema.parse(pool);
  assertContentHash(pool as unknown as Record<string, unknown>, "candidatePoolHash");
  pool.candidates.forEach((entry, index) => {
    if (entry.retrievalPosition !== index + 1) throw new Error("candidate_pool_position_invalid");
    assertContentHash(entry.candidate as unknown as Record<string, unknown>, "candidateHash");
    validateWorldKnowledge(entry.candidate.worldKnowledge);
  });
}
