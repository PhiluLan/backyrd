import { assertContentHash, withContentHash } from "./canonical.js";
import {
  DerivedSituationFitSchema,
  WorldConceptRelationSchema,
  WorldEntityRelationSchema,
  WorldFactSchema,
  WorldKnowledgeSchema,
  type DerivedSituationFit,
  type EvidenceItem,
  type WorldCandidate,
  type WorldConceptRelation,
  type WorldEntityRelation,
  type WorldFact,
  type WorldKnowledge,
} from "./contracts.js";

export const PHASE1_WORLD_REGISTRY_VERSION = "backyrd-vnext-world-registry-fixture-v1-unapproved";

export function createWorldFact(value: Record<string, unknown>): WorldFact {
  return WorldFactSchema.parse(withContentHash(value, "factHash"));
}

export function createWorldConceptRelation(value: Record<string, unknown>): WorldConceptRelation {
  return WorldConceptRelationSchema.parse(withContentHash(value, "relationHash"));
}

export function createDerivedSituationFit(value: Record<string, unknown>): DerivedSituationFit {
  return DerivedSituationFitSchema.parse(withContentHash(value, "derivedFitHash"));
}

export function createWorldEntityRelation(value: Record<string, unknown>): WorldEntityRelation {
  return WorldEntityRelationSchema.parse(withContentHash(value, "relationHash"));
}

export function candidateEvidence(candidate: WorldCandidate): readonly EvidenceItem[] {
  return candidate.worldKnowledge.evidenceAndConfidence.evidence;
}

export function knownConceptIds(facts: readonly WorldFact[]): readonly string[] {
  return facts
    .filter((fact) => fact.state === "known" && (fact.value.kind !== "boolean" || fact.value.value))
    .map((fact) => fact.concept.conceptId)
    .sort();
}

export function allWorldFacts(knowledge: WorldKnowledge): readonly WorldFact[] {
  return [
    ...knowledge.categoryAssignments,
    ...knowledge.subcategories,
    ...knowledge.decisionIntents.facts,
    ...knowledge.capabilities,
    ...knowledge.situationFit.directClaims,
    ...knowledge.amenitiesAndConstraints,
    ...knowledge.temporalAndCurrentState,
  ];
}

export function validateWorldKnowledge(knowledge: WorldKnowledge): void {
  WorldKnowledgeSchema.parse(knowledge);
  assertContentHash(knowledge as unknown as Record<string, unknown>, "knowledgeHash");
  const evidenceIds = new Set(knowledge.evidenceAndConfidence.evidence.map((item) => item.evidenceId));
  if (evidenceIds.size !== knowledge.evidenceAndConfidence.evidence.length) throw new Error("duplicate_world_evidence_id");
  for (const item of knowledge.evidenceAndConfidence.evidence) {
    assertContentHash(item as unknown as Record<string, unknown>, "evidenceHash");
    if (item.spotId !== knowledge.spotEntity.entityId) throw new Error("world_evidence_entity_mismatch");
  }
  const facts = allWorldFacts(knowledge);
  const factIds = new Set(facts.map((fact) => fact.factId));
  if (factIds.size !== facts.length) throw new Error("duplicate_world_fact_id");
  for (const fact of facts) {
    assertContentHash(fact as unknown as Record<string, unknown>, "factHash");
    if (fact.concept.registryVersion !== knowledge.registryVersion) throw new Error("world_fact_registry_mismatch");
    for (const id of fact.evidenceIds) if (!evidenceIds.has(id)) throw new Error(`world_fact_unknown_evidence:${id}`);
  }
  for (const relation of knowledge.decisionIntents.capabilityRelations) {
    assertContentHash(relation as unknown as Record<string, unknown>, "relationHash");
    if (relation.fromConcept.registryVersion !== knowledge.registryVersion || relation.toConcept.registryVersion !== knowledge.registryVersion) {
      throw new Error("world_concept_relation_registry_mismatch");
    }
    for (const id of relation.evidenceIds) if (!evidenceIds.has(id)) throw new Error(`world_relation_unknown_evidence:${id}`);
  }
  for (const fit of knowledge.situationFit.derivedFits) {
    assertContentHash(fit as unknown as Record<string, unknown>, "derivedFitHash");
    for (const id of fit.derivedFromFactIds) if (!factIds.has(id)) throw new Error(`derived_fit_unknown_fact:${id}`);
    for (const id of fit.evidenceIds) if (!evidenceIds.has(id)) throw new Error(`derived_fit_unknown_evidence:${id}`);
  }
  for (const relation of knowledge.relatedEntities) {
    assertContentHash(relation as unknown as Record<string, unknown>, "relationHash");
    if (relation.fromEntity.entityType !== "spot" || relation.fromEntity.entityId !== knowledge.spotEntity.entityId) {
      throw new Error("world_entity_relation_subject_mismatch");
    }
    for (const id of relation.evidenceIds) if (!evidenceIds.has(id)) throw new Error(`world_entity_relation_unknown_evidence:${id}`);
  }
}
