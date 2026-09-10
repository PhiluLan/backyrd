import { assertContentHash, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { CandidatePoolSnapshotSchema, CONTRACT_VERSIONS, type CandidatePoolSnapshot, type DecisionContextSnapshot } from "./contracts.js";
import { PHASE1_VERSIONS } from "./manifest.js";
import type { SyntheticWorld } from "./sandbox.js";
import { adaptWorldKnowledgeSnapshot } from "./world-adapter.js";
import { evidenceMap } from "./evidence.js";

export function generateNeutralCandidatePool(input: { world: SyntheticWorld; context: DecisionContextSnapshot; serverRequestId: string; limit?: number }): CandidatePoolSnapshot {
  const ordered = [...input.world.spots].sort((left, right) => left.id.localeCompare(right.id)).slice(0, input.limit ?? 24).map((spot, index) => ({ candidate: adaptWorldKnowledgeSnapshot(spot.snapshot, spot.retrieval), retrievalSource: { kind: "versioned_adapter" as const, sourceId: "synthetic-neutral-world-adapter-v2", personalized: false as const }, retrievalPosition: index + 1 }));
  const snapshot = CandidatePoolSnapshotSchema.parse(withContentHash({ contractVersion: CONTRACT_VERSIONS.candidatePool, serverRequestId: input.serverRequestId, worldVersion: input.world.version, candidateGeneratorVersion: PHASE1_VERSIONS.candidateGenerator, candidates: ordered }, "candidatePoolHash"));
  return deepFreeze(snapshot) as CandidatePoolSnapshot;
}

export function validateCandidatePool(pool: CandidatePoolSnapshot): void {
  CandidatePoolSnapshotSchema.parse(pool); assertContentHash(pool as unknown as Record<string, unknown>, "candidatePoolHash");
  const spotIds = new Set<string>(); const candidateHashes = new Set<string>(); const evidenceIds = new Set<string>();
  pool.candidates.forEach((entry, index) => {
    if (entry.retrievalPosition !== index + 1) throw new Error("candidate_pool_position_invalid");
    if (entry.retrievalSource.personalized !== false) throw new Error("candidate_pool_personalized");
    assertContentHash(entry.candidate as unknown as Record<string, unknown>, "candidateHash");
    if (spotIds.has(entry.candidate.spotId)) throw new Error("duplicate_candidate_spot_id"); spotIds.add(entry.candidate.spotId);
    if (candidateHashes.has(entry.candidate.candidateHash)) throw new Error("duplicate_candidate_hash"); candidateHashes.add(entry.candidate.candidateHash);
    const evidence = evidenceMap(entry.candidate);
    if (evidence.size !== 8 || new Set([...evidence.values()].map((item) => item.signal)).size !== evidence.size) throw new Error("candidate_evidence_set_invalid");
    for (const id of evidence.keys()) { if (evidenceIds.has(id)) throw new Error("duplicate_evidence_identity"); evidenceIds.add(id); }
    for (const item of evidence.values()) {
      const isDistance = item.signal === "location.distance";
      if (item.sourceDomain !== (isDistance ? "CONTEXT" : "WORLD")) throw new Error(`candidate_evidence_source_domain_mismatch:${item.signal}`);
      if (!isDistance && item.sourceHash !== entry.candidate.worldReference.snapshotHash) throw new Error(`candidate_evidence_world_binding_mismatch:${item.signal}`);
      if (isDistance && (item.sourceHash !== contentHash({ spotId: entry.candidate.spotId, distanceMeters: entry.candidate.distanceMeters }) || item.sourceReference !== "synthetic-distance-policy-v1")) throw new Error("candidate_distance_evidence_binding_mismatch");
    }
    const requireValue = (signal: string, predicate: (value: unknown) => boolean) => { const item = [...evidence.values()].find((value) => value.signal === signal); if (!item || !predicate(item.value)) throw new Error(`candidate_evidence_semantic_mismatch:${signal}`); };
    requireValue("distribution.allowed", (value) => typeof value === "object" && value !== null && "kind" in value && value.kind === "boolean" && "value" in value && value.value === entry.candidate.distributionAllowed);
    requireValue("location.city", (value) => typeof value === "object" && value !== null && "kind" in value && value.kind === "text" && "value" in value && value.value === entry.candidate.city);
    requireValue("temporal.open_status", (value) => typeof value === "object" && value !== null && "kind" in value && value.kind === "open_status" && "value" in value && value.value === entry.candidate.openStatus);
    requireValue("location.distance", (value) => typeof value === "object" && value !== null && "kind" in value && value.kind === "number" && "value" in value && value.value === entry.candidate.distanceMeters);
    requireValue("fixture.popularity", (value) => typeof value === "object" && value !== null && "kind" in value && value.kind === "number" && "value" in value && value.value === entry.candidate.fixturePopularity);
    requireValue("fixture.intent_tags", (value) => typeof value === "object" && value !== null && "kind" in value && value.kind === "keys" && "values" in value && JSON.stringify(value.values) === JSON.stringify(entry.candidate.fixtureIntentKeys));
    requireValue("fixture.mood_tags", (value) => typeof value === "object" && value !== null && "kind" in value && value.kind === "keys" && "values" in value && JSON.stringify(value.values) === JSON.stringify(entry.candidate.fixtureMoodKeys));
    requireValue("world.data_quality", (value) => typeof value === "object" && value !== null && "kind" in value && value.kind === "number" && "value" in value && value.value === entry.candidate.fixtureDataQuality);
  });
}
