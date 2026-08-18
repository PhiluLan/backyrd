import { contentHash } from "./canonical-json.mjs";
import { buildN5_5Evaluation } from "./n5-5-longitudinal-user-world.mjs";
import { buildCanonicalUserCard } from "./n5-6-canonical-user-intelligence.mjs";
import { buildSignedRelevantUserProjection } from "./n5-6-signed-projection.mjs";
import { N2_VERSIONS } from "./n2-memory-user-intelligence.mjs";

export const N5_6_WORLD_VERSION = "backyrd-n5-6-canonical-user-intelligence-world-v1";

const INTENTS = Object.freeze({
  FAMILY_SUNDAY: { preferredPlaceTypes: ["activity"] },
  FRIENDS_FRIDAY: { requiredPlaceTypes: ["bar"], conceptDirections: [{ concept: "vibe.lively", direction: 1 }, { concept: "vibe.quiet", direction: -1 }] },
  DATE_EVENING: { preferredPlaceTypes: ["bar"] },
  SOLO_AFTERWORK: { requiredPlaceTypes: ["bar"] },
  CROSS_CITY_COPENHAGEN: { preferredPlaceTypes: ["bar"] },
  BROAD_UNKNOWN: { activityBroad: true }
});

function spotIntelligence(events) {
  const result = {};
  for (const event of events) if (event.spotId) {
    if (!result[event.spotId]) result[event.spotId] = { spotId: event.spotId, concepts: {}, provenance: "N5_5_SEALED_SYNTHETIC_N4_EVIDENCE" };
    for (const concept of event.spotEvidence.concepts) result[event.spotId].concepts[concept] = { confidence: 0.82, source: "N4_CANONICAL_SPOT_INTELLIGENCE" };
  }
  return result;
}

function enhanceNorthStar(user) {
  if (user.id !== "NORTH_STAR_EXPLORER_01") return user.events;
  const templates = user.events.filter(({ eventType }) => ["verified_visit", "positive_post_visit", "explicit_positive"].includes(eventType)).slice(0, 30);
  const start = new Date("2025-02-15T12:00:00.000Z").valueOf();
  const extension = templates.map((template, index) => {
    const occurredAt = new Date(start + index * 9 * 86_400_000).toISOString();
    const id = `${user.id}:n56-extension:${String(index).padStart(3, "0")}`;
    return { ...template, id, idempotencyKey: `idem:${id}`, contractVersion: N2_VERSIONS.memoryEventContract, occurredAt, observedAt: occurredAt, ingestedAt: occurredAt, decisionId: `${user.id}:n56-decision:${String(index).padStart(3, "0")}`, sessionId: `${user.id}:n56-session:${String(index).padStart(3, "0")}`, spotId: `${user.id}:n56-spot:${String(index % 15).padStart(3, "0")}`, provenance: { source: "n5_6_longitudinal_extension", sourceEventId: id, sourceVersion: N5_6_WORLD_VERSION } };
  });
  return [...extension, ...user.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
}

export function buildN5_6World() {
  const inherited = buildN5_5Evaluation();
  const profiles = inherited.world.users.map((user) => {
    const events = enhanceNorthStar(user);
    const options = { asOf: inherited.world.asOf, spotIntelligence: spotIntelligence(events) };
    const built = buildCanonicalUserCard(events, options);
    const first = new Date(events[0].occurredAt).valueOf(); const targets = [30, 180, 365].map((days) => first + days * 86_400_000);
    const counts = targets.map((target) => Math.max(1, events.filter(({ occurredAt }) => new Date(occurredAt).valueOf() <= target).length)); counts.push(events.length);
    const checkpoints = counts.filter((count, index, values) => values.indexOf(count) === index)
      .map((count, index) => ({ stage: ["ONE_MONTH", "SIX_MONTHS", "ONE_YEAR", "FINAL"][index] ?? "FINAL", eventCount: count, asOf: events[count - 1].occurredAt, userCard: buildCanonicalUserCard(events.slice(0, count), { asOf: events[count - 1].occurredAt, spotIntelligence: options.spotIntelligence }).userCard }));
    return { user: { id: user.id, label: user.label, declaredLifecycle: user.declaredLifecycle, city: user.city }, events, userCard: built.userCard, evidenceChains: built.evidenceChains, changeLedger: built.changeLedger, checkpoints };
  });
  const projections = [];
  for (const row of inherited.projections) {
    const profile = profiles.find(({ user }) => user.id === row.userId);
    projections.push({ userId: row.userId, momentKey: row.momentKey, city: row.city, currentMoment: row.currentMoment, projection: buildSignedRelevantUserProjection({ userCard: profile.userCard, currentMoment: row.currentMoment, currentIntent: INTENTS[row.momentKey] }) });
  }
  const body = { version: N5_6_WORLD_VERSION, parentWorldHash: inherited.world.worldHash, asOf: inherited.world.asOf, userCardHashes: profiles.map(({ userCard }) => userCard.userCardHash), projectionHashes: projections.map(({ projection }) => projection.projectionHash) };
  return Object.freeze({ ...body, profiles, projections, worldHash: contentHash(body), evaluatorReferenceHash: contentHash(inherited.world.evaluatorReference) });
}

export const N5_6_INTENTS = INTENTS;
