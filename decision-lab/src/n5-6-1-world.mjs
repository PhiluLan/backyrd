import { contentHash } from "./canonical-json.mjs";
import { buildCurrentMoment } from "./n3-moment-intelligence.mjs";
import { buildN5_6World, N5_6_INTENTS } from "./n5-6-world.mjs";
import { buildMomentAwareRelevantUserProjection } from "./n5-6-1-moment-aware-projection.mjs";

export const N5_6_1_WORLD_VERSION = "backyrd-n5-6-1-moment-aware-projection-world-v1";

export const N5_6_1_EXTRA_MOMENTS = Object.freeze([
  Object.freeze({
    key: "NEW_CITY_BROAD_UNKNOWN",
    query: "Gerade in Kopenhagen. Was machen?",
    explicit: { activity_intent: ["broad"] },
    at: "2026-08-18T12:00:00.000Z",
    city: "Copenhagen",
    timeZone: "Europe/Copenhagen",
    intent: { activityBroad: true }
  }),
  Object.freeze({
    key: "MUSEUM_CULTURE_FAMILY",
    query: "Mit den Kindern heute etwas Kultur oder ein Museum",
    explicit: { social_context: "family_with_kids", activity_intent: ["culture"], vibe: ["inspiring"], planning_tolerance: "low" },
    at: "2026-08-16T13:00:00.000Z",
    city: "Basel",
    timeZone: "Europe/Zurich",
    intent: { preferredPlaceTypes: ["culture"] }
  })
]);

function buildExtraMoment(userId, definition) {
  return buildCurrentMoment({
    decisionId: `n561:${userId}:${definition.key}`,
    userId,
    request: { requestId: `n561-request:${userId}:${definition.key}`, query: definition.query },
    explicit: definition.explicit,
    context: {
      now: definition.at,
      timeZone: definition.timeZone,
      location: { city: definition.city, source: "explicit_selected", id: `city:${definition.city}` }
    },
    memoryPatterns: [],
    memoryConsentState: "granted",
    observedAt: definition.at
  }).currentMoment;
}

export function buildN5_6_1World() {
  const control = buildN5_6World();
  const projections = control.projections.map((row) => {
    const profile = control.profiles.find(({ user }) => user.id === row.userId);
    return {
      userId: row.userId,
      momentKey: row.momentKey,
      city: row.city,
      currentMoment: row.currentMoment,
      currentIntent: N5_6_INTENTS[row.momentKey] ?? {},
      controlProjection: row.projection,
      projection: buildMomentAwareRelevantUserProjection({ userCard: profile.userCard, currentMoment: row.currentMoment, currentIntent: N5_6_INTENTS[row.momentKey] ?? {} })
    };
  });
  const north = control.profiles.find(({ user }) => user.id === "NORTH_STAR_EXPLORER_01");
  for (const definition of N5_6_1_EXTRA_MOMENTS) {
    const currentMoment = buildExtraMoment(north.user.id, definition);
    projections.push({
      userId: north.user.id,
      momentKey: definition.key,
      city: definition.city,
      currentMoment,
      currentIntent: definition.intent,
      controlProjection: null,
      projection: buildMomentAwareRelevantUserProjection({ userCard: north.userCard, currentMoment, currentIntent: definition.intent })
    });
  }
  const body = {
    version: N5_6_1_WORLD_VERSION,
    parentWorldHash: control.worldHash,
    userCardHashes: control.profiles.map(({ userCard }) => userCard.userCardHash),
    projectionHashes: projections.map(({ projection }) => projection.projectionHash),
    scenarioPopulation: projections.map(({ userId, momentKey, city }) => ({ userId, momentKey, city })),
    syntheticHistoryTreatment: "UNCHANGED_N5_6_FROZEN_WORLD"
  };
  return Object.freeze({ ...body, profiles: control.profiles, projections, control, worldHash: contentHash(body) });
}
