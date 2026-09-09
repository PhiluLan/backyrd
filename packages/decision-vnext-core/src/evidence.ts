import { assertContentHash, contentHash, withContentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, EvidenceItemSchema, type EvidenceItem, type WorldCandidate } from "./contracts.js";
import { candidateEvidence } from "./world-knowledge.js";

type EvidenceWithoutHash = Omit<EvidenceItem, "evidenceHash">;

export function createEvidence(value: EvidenceWithoutHash): EvidenceItem {
  return EvidenceItemSchema.parse(withContentHash(value, "evidenceHash"));
}

export function validateEvidence(item: EvidenceItem): void {
  EvidenceItemSchema.parse(item);
  assertContentHash(item as unknown as Record<string, unknown>, "evidenceHash");
}

export function evidenceMap(candidate: WorldCandidate): ReadonlyMap<string, EvidenceItem> {
  const entries = candidateEvidence(candidate).map((item) => {
    validateEvidence(item);
    if (item.spotId !== candidate.spotId) throw new Error("cross_spot_evidence");
    return [item.evidenceId, item] as const;
  });
  if (new Set(entries.map(([id]) => id)).size !== entries.length) throw new Error("duplicate_evidence_id");
  return new Map(entries);
}

export const EVIDENCE_VERSION = CONTRACT_VERSIONS.evidence;
export const evidenceSetHash = (items: readonly EvidenceItem[]) => contentHash(items.map((item) => item.evidenceHash));
