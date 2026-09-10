import { assertContentHash, deepFreeze, withContentHash } from "./canonical.js";
import { CandidatePoolSnapshotSchema, CONTRACT_VERSIONS, type CandidatePoolSnapshot, type DecisionContextSnapshot } from "./contracts.js";
import { PHASE1_VERSIONS } from "./manifest.js";
import type { SyntheticWorld } from "./sandbox.js";
import { adaptWorldKnowledgeSnapshot } from "./world-adapter.js";

export function generateNeutralCandidatePool(input: { world: SyntheticWorld; context: DecisionContextSnapshot; serverRequestId: string; limit?: number }): CandidatePoolSnapshot {
  const ordered = [...input.world.spots].sort((left, right) => left.id.localeCompare(right.id)).slice(0, input.limit ?? 24).map((spot, index) => ({ candidate: adaptWorldKnowledgeSnapshot(spot.snapshot, spot.retrieval), retrievalSource: { kind: "versioned_adapter" as const, sourceId: "synthetic-neutral-world-adapter-v1", personalized: false as const }, retrievalPosition: index + 1 }));
  const snapshot = CandidatePoolSnapshotSchema.parse(withContentHash({ contractVersion: CONTRACT_VERSIONS.candidatePool, serverRequestId: input.serverRequestId, worldVersion: input.world.version, candidateGeneratorVersion: PHASE1_VERSIONS.candidateGenerator, candidates: ordered }, "candidatePoolHash"));
  return deepFreeze(snapshot) as CandidatePoolSnapshot;
}

export function validateCandidatePool(pool: CandidatePoolSnapshot): void {
  CandidatePoolSnapshotSchema.parse(pool); assertContentHash(pool as unknown as Record<string, unknown>, "candidatePoolHash");
  pool.candidates.forEach((entry, index) => { if (entry.retrievalPosition !== index + 1) throw new Error("candidate_pool_position_invalid"); if (entry.retrievalSource.personalized !== false) throw new Error("candidate_pool_personalized"); assertContentHash(entry.candidate as unknown as Record<string, unknown>, "candidateHash"); });
}
