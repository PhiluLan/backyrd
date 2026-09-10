import {
  REGISTRY_HASH, REGISTRY_VERSION, RULE_REGISTRY_HASH, RULE_REGISTRY_VERSION, UNCONFIGURED_SOURCE_POLICY, WORLD_KNOWLEDGE_PORT_VERSION,
  parseWorldKnowledgeSnapshot, type WorldKnowledgeReaderPort, type WorldKnowledgeSnapshot,
} from "@backyrd/world-knowledge-core";
import { contentHash, withContentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, EvidenceItemSchema, WorldCandidateSchema, type EvidenceItem, type WorldCandidate } from "./contracts.js";
import { evaluateOpeningState, SYNTHETIC_OPENING_SOURCE_POLICY } from "./opening-state.js";
import { SYNTHETIC_WORLD_SOURCE_POLICY } from "./synthetic-world-policy.js";

export const WORLD_ADAPTER_VERSION = CONTRACT_VERSIONS.worldAdapter;
export interface SyntheticRetrievalFacts {
  readonly distanceMeters: number; readonly distributionAllowed: boolean; readonly fixturePopularity: number; readonly fixtureDataQuality: number;
  readonly fixtureIntentKeys: readonly string[]; readonly fixtureMoodKeys: readonly string[];
}

function ev(base: Omit<EvidenceItem, "evidenceHash" | "evidenceId" | "signal" | "value" | "influence" | "sourceReference">, suffix: string, signal: string, sourceReference: string, value: EvidenceItem["value"], influence: EvidenceItem["influence"] = "NEUTRAL"): EvidenceItem {
  return EvidenceItemSchema.parse(withContentHash({ ...base, evidenceId: `ev-${base.spotId.slice(4)}-${suffix}`, signal, sourceReference, value, influence }, "evidenceHash"));
}

export function adaptWorldKnowledgeSnapshot(snapshotValue: unknown, fixture: SyntheticRetrievalFacts): WorldCandidate {
  const snapshot = parseWorldKnowledgeSnapshot(snapshotValue, [SYNTHETIC_WORLD_SOURCE_POLICY]);
  if (snapshot.registryVersion !== REGISTRY_VERSION || snapshot.registryHash !== REGISTRY_HASH || snapshot.ruleRegistryVersion !== RULE_REGISTRY_VERSION || snapshot.ruleRegistryHash !== RULE_REGISTRY_HASH) throw new Error("world_registry_binding_mismatch");
  const city = snapshot.spot.location.locality; if (!city) throw new Error("world_location_not_ready");
  const base = { contractVersion: CONTRACT_VERSIONS.evidence, spotId: snapshot.spot.spotId, sourceDomain: "WORLD" as const, sourceHash: snapshot.snapshotHash, observedAt: snapshot.resolvedAt, confidenceState: "FIXTURE" as const, trustState: "CANONICAL_WORLD_SNAPSHOT", policyVersion: WORLD_ADAPTER_VERSION, limitations: ["phase1-synthetic-adapter-policy"] };
  const opening = evaluateOpeningState(snapshot, snapshot.resolvedAt, SYNTHETIC_OPENING_SOURCE_POLICY);
  const open = opening.status;
  const hoursRef = opening.basisEntryHashes.length ? contentHash(opening.basisEntryHashes) : snapshot.snapshotHash;
  const evidence = [
    ev(base, "distribution", "distribution.allowed", snapshot.snapshotHash, { kind: "boolean", value: fixture.distributionAllowed }),
    ev(base, "city", "location.city", snapshot.snapshotHash, { kind: "text", value: city }),
    ev({ ...base, policyVersion: opening.evaluatorVersion, limitations: [...base.limitations, ...opening.limitations] }, "open", "temporal.open_status", hoursRef, { kind: "open_status", value: open }, open === "open" ? "POSITIVE" : "LIMITATION"),
    ev({ ...base, sourceDomain: "CONTEXT" as const, sourceHash: contentHash({ spotId: snapshot.spot.spotId, distanceMeters: fixture.distanceMeters }) }, "distance", "location.distance", "synthetic-distance-policy-v1", { kind: "number", value: fixture.distanceMeters, unit: "meters" }),
    ev(base, "popularity", "fixture.popularity", snapshot.snapshotHash, { kind: "number", value: fixture.fixturePopularity, unit: "normalized" }),
    ev(base, "intents", "fixture.intent_tags", snapshot.snapshotHash, { kind: "keys", values: fixture.fixtureIntentKeys }),
    ev(base, "moods", "fixture.mood_tags", snapshot.snapshotHash, { kind: "keys", values: fixture.fixtureMoodKeys }),
    ev(base, "quality", "world.data_quality", snapshot.snapshotHash, { kind: "number", value: fixture.fixtureDataQuality, unit: "normalized" }, fixture.fixtureDataQuality < 0.4 ? "LIMITATION" : "NEUTRAL"),
  ];
  return WorldCandidateSchema.parse(withContentHash({ contractVersion: CONTRACT_VERSIONS.worldCandidate, spotId: snapshot.spot.spotId, city, distanceMeters: fixture.distanceMeters, distributionAllowed: fixture.distributionAllowed, openStatus: open, fixturePopularity: fixture.fixturePopularity, fixtureDataQuality: fixture.fixtureDataQuality, fixtureIntentKeys: fixture.fixtureIntentKeys, fixtureMoodKeys: fixture.fixtureMoodKeys, worldReference: { contractVersion: snapshot.contractVersion, registryVersion: snapshot.registryVersion, registryHash: snapshot.registryHash, ruleRegistryVersion: snapshot.ruleRegistryVersion, ruleRegistryHash: snapshot.ruleRegistryHash, snapshotHash: snapshot.snapshotHash, resolvedAt: snapshot.resolvedAt, readiness: snapshot.readiness, exclusions: snapshot.exclusions }, evidence }, "candidateHash"));
}

export async function readCanonicalWorld(reader: WorldKnowledgeReaderPort, spotId: string, acceptedPolicies: readonly { readonly policyVersion: string; readonly policyHash: string }[] = [UNCONFIGURED_SOURCE_POLICY]): Promise<WorldKnowledgeSnapshot> {
  if (reader.contractVersion !== "backyrd.world-knowledge.reader-port@1.0") throw new Error("world_reader_port_version_unknown");
  return parseWorldKnowledgeSnapshot(await reader.readSnapshot({ spotId, contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH }), acceptedPolicies);
}
