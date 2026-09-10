import { buildWorldKnowledgeSnapshot, createClaim, REGISTRY_VERSION, RESOLUTION_CONTRACT_VERSION, resolveWorldKnowledge, WORLD_KNOWLEDGE_PORT_VERSION, type ClaimValue, type Weekday, type WeeklyScheduleDay, type WorldKnowledgeReaderPort, type WorldKnowledgeSnapshot } from "@backyrd/world-knowledge-core";
import { buildRelevantUserProjection, CONTRACT_VERSIONS as USER_CONTRACT_VERSIONS, GRANTED_CONSENT, NO_CONSENT, SYNTHETIC_MANIFEST, type DecisionVNextUserProjectionPort, type RelevantUserProjection, type RelevantUserProjectionRequest } from "@backyrd/user-intelligence-vnext-core";
import { contentHash, deepFreeze } from "./canonical.js";
import { CONTRACT_VERSIONS as DECISION_CONTRACT_VERSIONS } from "./contracts.js";
import { schema, type Infer } from "./schema.js";
import type { SyntheticRetrievalFacts } from "./world-adapter.js";
import { SYNTHETIC_WORLD_SOURCE_POLICY } from "./synthetic-world-policy.js";

export const SyntheticWorldConfigSchema = schema.object({ configVersion: schema.literal("backyrd-vnext-sandbox-config-v1"), worldVersion: schema.string({ pattern: /^backyrd-vnext-synthetic-world-[a-z0-9-]+$/ }), seed: schema.number({ integer: true, min: 1 }), observedAt: schema.string({ pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/ }), spotCount: schema.number({ integer: true, min: 8, max: 2_000 }), userCount: schema.number({ integer: true, min: 1, max: 1_000 }), cities: schema.array(schema.string({ min: 1, max: 80 }), { max: 20 }), candidatePoolSize: schema.number({ integer: true, min: 4, max: 500 }) });
export type SyntheticWorldConfig = Infer<typeof SyntheticWorldConfigSchema>;
export interface SyntheticSpot { readonly id: string; readonly snapshot: WorldKnowledgeSnapshot; readonly retrieval: SyntheticRetrievalFacts }
export interface SyntheticUser { readonly id: string; readonly subjectBindingHash: string; readonly fixtureTasteKeys: readonly string[]; readonly fixtureAversionKeys: readonly string[] }
export interface SyntheticWorld { readonly version: string; readonly observedAt: string; readonly seed: number; readonly spots: readonly SyntheticSpot[]; readonly users: readonly SyntheticUser[]; readonly worldHash: string }

function seeded(seed: number): () => number { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x1_0000_0000; }; }
const pick = <T>(values: readonly T[], index: number): T => { const value = values[index % values.length]; if (value === undefined) throw new Error("synthetic_fixture_empty_choice"); return value; };
const rounded = (value: number) => Number(value.toFixed(6));

function claim(spotId: string, attributeKey: string, value: ClaimValue, observedAt: string, index: number) {
  return createClaim({ claimId: `${spotId}:claim:${index}`, attributeKey, scope: { spotId, area: "SPOT" }, knowledgeState: value === true ? "KNOWN_TRUE" : value === false ? "KNOWN_FALSE" : "KNOWN_VALUE", value, actorType: "SYSTEM", sourceType: "OFFICIAL_SOURCE", sourceReferenceId: `source:${spotId}`, provenanceSessionId: `${spotId}:fixture-session`, verificationState: "UNVERIFIED", observedAt, validFrom: observedAt, validUntil: null, stance: "SUPPORTS", visibility: "INTERNAL", supersedesClaimId: null });
}

function snapshotFor(id: string, city: string, status: "open" | "closed" | "unknown", observedAt: string): WorldKnowledgeSnapshot {
  const day = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][new Date(observedAt).getUTCDay()]! as Weekday;
  const claims = [claim(id, "identity.name", `Synthetic Spot ${id}`, observedAt, 1), claim(id, "location.address_line1", `Fixture Street ${id}`, observedAt, 2), claim(id, "location.locality", city, observedAt, 3), claim(id, "location.country_code", "CH", observedAt, 4), claim(id, "location.latitude", 47.0, observedAt, 5), claim(id, "location.longitude", 8.0, observedAt, 6), claim(id, "location.timezone", "UTC", observedAt, 7), claim(id, "classification.primary_category", "EAT", observedAt, 8), claim(id, "classification.place_types", ["CAFE"], observedAt, 9)];
  if (status !== "unknown") claims.push(claim(id, "hours.regular", [{ day, intervals: status === "open" ? [{ start: "00:00", end: "23:59" }] : [{ start: "00:00", end: "00:01" }] }] as readonly WeeklyScheduleDay[], observedAt, 10));
  const acceptedPolicies = [SYNTHETIC_WORLD_SOURCE_POLICY];
  const resolution = resolveWorldKnowledge({ contractVersion: RESOLUTION_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, asOf: observedAt, claims, sourcePolicy: SYNTHETIC_WORLD_SOURCE_POLICY, verificationRecords: [] }, acceptedPolicies);
  return buildWorldKnowledgeSnapshot({ contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, spotId: id, resolution }, acceptedPolicies);
}

export function generateSyntheticWorld(raw: unknown): SyntheticWorld {
  const config = SyntheticWorldConfigSchema.parse(raw); if (config.cities.length < 2) throw new Error("synthetic_world_requires_multiple_cities"); const random = seeded(config.seed);
  const intents = ["fixture.intent.eat", "fixture.intent.drink", "fixture.intent.talk", "fixture.intent.explore"] as const; const moods = ["fixture.mood.calm", "fixture.mood.lively", "fixture.mood.cozy", "fixture.mood.outdoors"] as const;
  const spots: SyntheticSpot[] = Array.from({ length: config.spotCount }, (_, index) => { const id = `syn-spot-${String(index + 1).padStart(4, "0")}`; const openStatus = pick(["open", "closed", "unknown"] as const, index + config.seed); return { id, snapshot: snapshotFor(id, pick(config.cities, index), openStatus, config.observedAt), retrieval: { distanceMeters: Math.round(100 + random() * 19_900), distributionAllowed: index % 17 !== 0, fixturePopularity: rounded(random()), fixtureDataQuality: rounded(0.2 + random() * 0.8), fixtureIntentKeys: [pick(intents, index), pick(intents, index + 1)].sort(), fixtureMoodKeys: [pick(moods, index + config.seed), pick(moods, index + config.seed + 1)].sort() } }; });
  const users: SyntheticUser[] = Array.from({ length: config.userCount }, (_, index) => ({ id: `syn-user-${String(index + 1).padStart(4, "0")}`, subjectBindingHash: contentHash(`subject:${config.seed}:${index}`), fixtureTasteKeys: [pick(moods, index), pick(intents, index + 2)].sort(), fixtureAversionKeys: [pick(moods, index + 2)] }));
  const body = { version: config.worldVersion, observedAt: config.observedAt, seed: config.seed, spots, users }; return deepFreeze({ ...body, worldHash: contentHash(body) }) as SyntheticWorld;
}

export class SyntheticWorldKnowledgeReader implements WorldKnowledgeReaderPort { readonly contractVersion = "backyrd.world-knowledge.reader-port@1.0" as const; constructor(private readonly world: SyntheticWorld) {} async readSnapshot(input: Parameters<WorldKnowledgeReaderPort["readSnapshot"]>[0]): Promise<WorldKnowledgeSnapshot> { const spot = this.world.spots.find((item) => item.id === input.spotId); if (!spot) throw new Error("world_snapshot_missing"); return spot.snapshot; } }

export class SyntheticUserProjectionReader implements DecisionVNextUserProjectionPort {
  readonly contractVersion = "backyrd.user-intelligence.decision-projection-port@1.0" as const;
  constructor(private readonly mode: "NO_CONSENT" | "MISSING_SNAPSHOT" | "KILL_SWITCH" = "MISSING_SNAPSHOT") {}
  async project(request: RelevantUserProjectionRequest): Promise<RelevantUserProjection> {
    const effectiveRequest = { ...request, contractVersion: USER_CONTRACT_VERSIONS.projectionRequest, snapshot: null, killSwitch: this.mode === "KILL_SWITCH" };
    return buildRelevantUserProjection({ request: effectiveRequest, consent: this.mode === "NO_CONSENT" ? NO_CONSENT : GRANTED_CONSENT, manifest: { manifestId: SYNTHETIC_MANIFEST.manifestId, manifestHash: SYNTHETIC_MANIFEST.manifestHash }, snapshot: null, content: { taste: [], practical: [], directSpot: [], domainSufficiency: [], knowledgeLevel: "UNKNOWN", suppression: { total: 0, byReason: [] } }, identity: { projectionId: `projection-${request.requestId}` }, clock: { now: "2026-01-15T12:00:00.000Z" }, forcedNeutralReason: this.mode });
  }
}

export function buildSyntheticNeutralProjection(input: { requestId: string; decisionId: string; userId: string; subjectBindingHash: string; contextHash: string; intentKeys: readonly string[]; killSwitch?: boolean }): RelevantUserProjection {
  const request: RelevantUserProjectionRequest = { contractVersion: USER_CONTRACT_VERSIONS.projectionRequest, requestId: input.requestId, actor: { kind: "AUTHENTICATED_USER", userId: input.userId, subjectBindingHash: input.subjectBindingHash, authenticationContextHash: contentHash(`auth:${input.userId}`), boundBy: "SERVER" }, decisionId: input.decisionId, snapshot: null, context: { contextContractVersion: DECISION_CONTRACT_VERSIONS.contextSnapshot, contextHash: input.contextHash, placeTypes: [], domainKeys: [...input.intentKeys], rawLocationIncluded: false, socialDetailsIncluded: false }, requestedDomains: [...input.intentKeys], budgets: { maxItems: 16, maxBytes: 8192 }, projectionPolicyVersion: "phase1-projection-policy-not-configured", killSwitch: input.killSwitch ?? false };
  return buildRelevantUserProjection({ request, consent: NO_CONSENT, manifest: { manifestId: SYNTHETIC_MANIFEST.manifestId, manifestHash: SYNTHETIC_MANIFEST.manifestHash }, snapshot: null, content: { taste: [], practical: [], directSpot: [], domainSufficiency: [], knowledgeLevel: "UNKNOWN", suppression: { total: 0, byReason: [] } }, identity: { projectionId: `projection-${input.requestId}` }, clock: { now: "2026-01-15T12:00:00.000Z" } });
}
