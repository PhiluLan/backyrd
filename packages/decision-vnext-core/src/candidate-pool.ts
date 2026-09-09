import { assertContentHash, deepFreeze, withContentHash } from "./canonical.js";
import { CandidatePoolSnapshotSchema, CONTRACT_VERSIONS, WorldCandidateSchema, type CandidatePoolSnapshot, type DecisionContextSnapshot, type WorldCandidate } from "./contracts.js";
import { createEvidence } from "./evidence.js";
import { PHASE1_VERSIONS } from "./manifest.js";
import type { SyntheticSpot, SyntheticWorld } from "./sandbox.js";

const evidenceId = (spotId: string, kind: string) => `ev-${spotId.slice(4)}-${kind}`;

export function toWorldCandidate(spot: SyntheticSpot, observedAt: string): WorldCandidate {
  const source = { kind: "synthetic_world" as const, sourceId: spot.sourceId, observedAt };
  const base = { contractVersion: CONTRACT_VERSIONS.evidence, spotId: spot.id, source };
  const evidence = [
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "distribution"), kind: "distribution", value: { allowed: spot.distributionAllowed }, confidence: 1 }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "city"), kind: "city", value: { city: spot.city }, confidence: 1 }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "open"), kind: "open_status", value: { status: spot.openStatus }, confidence: spot.openStatus === "unknown" ? 0 : 1 }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "distance"), kind: "distance", value: { meters: spot.distanceMeters }, confidence: 1 }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "popularity"), kind: "popularity", value: { normalized: spot.popularity }, confidence: spot.dataQuality }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "intents"), kind: "intent_tags", value: { keys: [...spot.intentKeys] }, confidence: spot.dataQuality }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "moods"), kind: "mood_tags", value: { keys: [...spot.moodKeys] }, confidence: spot.dataQuality }),
    createEvidence({ ...base, evidenceId: evidenceId(spot.id, "quality"), kind: "data_quality", value: { normalized: spot.dataQuality, state: spot.dataQuality >= 0.75 ? "complete" : spot.dataQuality >= 0.4 ? "partial" : "weak" }, confidence: 1 }),
  ];
  return WorldCandidateSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.worldCandidate,
    spotId: spot.id,
    city: spot.city,
    distanceMeters: spot.distanceMeters,
    distributionAllowed: spot.distributionAllowed,
    openStatus: spot.openStatus,
    fixturePlaceType: spot.placeType,
    fixtureIntentKeys: [...spot.intentKeys],
    fixtureMoodKeys: [...spot.moodKeys],
    fixturePopularity: spot.popularity,
    fixtureDataQuality: spot.dataQuality,
    evidence,
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
  });
}
