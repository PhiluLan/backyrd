import {
  REGISTRY_HASH, REGISTRY_VERSION, RULE_REGISTRY_HASH, RULE_REGISTRY_VERSION, WORLD_KNOWLEDGE_PORT_VERSION,
  parseWorldKnowledgeSnapshot, type WorldKnowledgeReaderPort, type WorldKnowledgeSnapshot,
} from "@backyrd/world-knowledge-core";
import { contentHash, withContentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, EvidenceItemSchema, WorldCandidateSchema, type EvidenceItem, type WorldCandidate } from "./contracts.js";

export const WORLD_ADAPTER_VERSION = CONTRACT_VERSIONS.worldAdapter;
export interface SyntheticRetrievalFacts {
  readonly distanceMeters: number; readonly distributionAllowed: boolean; readonly fixturePopularity: number; readonly fixtureDataQuality: number;
  readonly fixtureIntentKeys: readonly string[]; readonly fixtureMoodKeys: readonly string[];
}

const weekday = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
function openingStatus(snapshot: WorldKnowledgeSnapshot): WorldCandidate["openStatus"] {
  if (snapshot.conflicts.some((item) => item.severity === "BLOCKING" && item.attributeKeys.some((key) => key.startsWith("hours.") || key === "state.current"))) return "disputed";
  const current = snapshot.currentStates.find((item) => item.key === "state.current");
  if (current?.freshness === "EXPIRED") return "expired";
  if (current && typeof current.value === "object" && current.value !== null && !Array.isArray(current.value) && "kind" in current.value) {
    const kind = String(current.value.kind); if (kind === "OPEN") return "open"; if (["CLOSED", "TEMPORARILY_CLOSED"].includes(kind)) return "closed";
  }
  const hours = snapshot.operationalRules.find((item) => item.key === "hours.regular");
  if (!hours) return snapshot.exclusions.some((item) => ["ASSERTED_OPENING_HOURS", "EXPIRED_CURRENT_STATES", "CURRENT_STATE_WITHOUT_EXPIRY"].includes(item.code)) ? "not_authorized" : "unknown";
  const date = new Date(snapshot.resolvedAt); const local = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  const rows = Array.isArray(hours.value) ? hours.value : [];
  const row = rows.find((item) => typeof item === "object" && item !== null && "day" in item && item.day === weekday[date.getUTCDay()]);
  if (!row || !("intervals" in row) || !Array.isArray(row.intervals)) return "closed";
  return row.intervals.some((interval: unknown) => typeof interval === "object" && interval !== null && "start" in interval && "end" in interval && String(interval.start) <= local && local < String(interval.end)) ? "open" : "closed";
}

function ev(base: Omit<EvidenceItem, "evidenceHash" | "evidenceId" | "signal" | "value" | "influence" | "sourceReference">, suffix: string, signal: string, sourceReference: string, value: EvidenceItem["value"], influence: EvidenceItem["influence"] = "NEUTRAL"): EvidenceItem {
  return EvidenceItemSchema.parse(withContentHash({ ...base, evidenceId: `ev-${base.spotId.slice(4)}-${suffix}`, signal, sourceReference, value, influence }, "evidenceHash"));
}

export function adaptWorldKnowledgeSnapshot(snapshotValue: unknown, fixture: SyntheticRetrievalFacts): WorldCandidate {
  const snapshot = parseWorldKnowledgeSnapshot(snapshotValue);
  if (snapshot.registryVersion !== REGISTRY_VERSION || snapshot.registryHash !== REGISTRY_HASH || snapshot.ruleRegistryVersion !== RULE_REGISTRY_VERSION || snapshot.ruleRegistryHash !== RULE_REGISTRY_HASH) throw new Error("world_registry_binding_mismatch");
  const city = snapshot.spot.location.locality; if (!city) throw new Error("world_location_not_ready");
  const base = { contractVersion: CONTRACT_VERSIONS.evidence, spotId: snapshot.spot.spotId, sourceDomain: "WORLD" as const, sourceHash: snapshot.snapshotHash, observedAt: snapshot.resolvedAt, confidenceState: "FIXTURE" as const, trustState: "CANONICAL_WORLD_SNAPSHOT", policyVersion: WORLD_ADAPTER_VERSION, limitations: ["phase1-synthetic-adapter-policy"] };
  const open = openingStatus(snapshot);
  const hoursRef = snapshot.operationalRules.find((item) => item.key === "hours.regular")?.entryHash ?? snapshot.snapshotHash;
  const evidence = [
    ev(base, "distribution", "distribution.allowed", snapshot.snapshotHash, { kind: "boolean", value: fixture.distributionAllowed }),
    ev(base, "city", "location.city", snapshot.snapshotHash, { kind: "text", value: city }),
    ev(base, "open", "temporal.open_status", hoursRef, { kind: "open_status", value: open }, open === "open" ? "POSITIVE" : "LIMITATION"),
    ev({ ...base, sourceDomain: "CONTEXT" as const, sourceHash: contentHash({ spotId: snapshot.spot.spotId, distanceMeters: fixture.distanceMeters }) }, "distance", "location.distance", "synthetic-distance-policy-v1", { kind: "number", value: fixture.distanceMeters, unit: "meters" }),
    ev(base, "popularity", "fixture.popularity", snapshot.snapshotHash, { kind: "number", value: fixture.fixturePopularity, unit: "normalized" }),
    ev(base, "intents", "fixture.intent_tags", snapshot.snapshotHash, { kind: "keys", values: fixture.fixtureIntentKeys }),
    ev(base, "moods", "fixture.mood_tags", snapshot.snapshotHash, { kind: "keys", values: fixture.fixtureMoodKeys }),
    ev(base, "quality", "world.data_quality", snapshot.snapshotHash, { kind: "number", value: fixture.fixtureDataQuality, unit: "normalized" }, fixture.fixtureDataQuality < 0.4 ? "LIMITATION" : "NEUTRAL"),
  ];
  return WorldCandidateSchema.parse(withContentHash({ contractVersion: CONTRACT_VERSIONS.worldCandidate, spotId: snapshot.spot.spotId, city, distanceMeters: fixture.distanceMeters, distributionAllowed: fixture.distributionAllowed, openStatus: open, fixturePopularity: fixture.fixturePopularity, fixtureDataQuality: fixture.fixtureDataQuality, fixtureIntentKeys: fixture.fixtureIntentKeys, fixtureMoodKeys: fixture.fixtureMoodKeys, worldReference: { contractVersion: snapshot.contractVersion, registryVersion: snapshot.registryVersion, registryHash: snapshot.registryHash, ruleRegistryVersion: snapshot.ruleRegistryVersion, ruleRegistryHash: snapshot.ruleRegistryHash, snapshotHash: snapshot.snapshotHash, resolvedAt: snapshot.resolvedAt, readiness: snapshot.readiness, exclusions: snapshot.exclusions }, evidence }, "candidateHash"));
}

export async function readCanonicalWorld(reader: WorldKnowledgeReaderPort, spotId: string): Promise<WorldKnowledgeSnapshot> {
  if (reader.contractVersion !== "backyrd.world-knowledge.reader-port@1.0") throw new Error("world_reader_port_version_unknown");
  return parseWorldKnowledgeSnapshot(await reader.readSnapshot({ spotId, contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH }));
}
