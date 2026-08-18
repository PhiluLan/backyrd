import { N2_VERSIONS } from "./n2-memory-user-intelligence.mjs";

export const N5_6_PRODUCT_HISTORY_VERSION = "backyrd-n5-6-product-like-histories-v1";
const at = (day, hour = 18) => `2026-07-${String(day + 20).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;

function event({ userId, journey, index, eventType, spotId, concepts = [], placeType = "bar", signature = {}, occurredAt }) {
  const id = `${userId}:${journey}:${index}:${eventType}`;
  return { id, idempotencyKey: `idem:${id}`, userId, eventType, contractVersion: N2_VERSIONS.memoryEventContract, occurredAt, observedAt: occurredAt, ingestedAt: occurredAt, decisionId: `${userId}:decision:${journey}`, sessionId: `${userId}:session:${journey}`, spotId, momentSignature: { audience: "solo", daypart: "evening", calendar: "weekday", occasion: "afterwork", placeType, friction: "low", distanceWillingness: "near", ...signature }, spotEvidence: { placeType, concepts }, provenance: { source: "n5_6_product_like_fixture", sourceEventId: id, sourceVersion: N5_6_PRODUCT_HISTORY_VERSION }, consentPurpose: "personalized_recommendations", consentState: "granted" };
}

export function buildProductLikeHistories() {
  const userId = "n56-product-like-user";
  const journeys = [
    // Search → exposure → opens → save → visit, without satisfaction feedback.
    ["decision_request", "candidate_exposed", "candidate_exposed", "candidate_exposed", "spot_opened", "spot_opened", "saved", "verified_visit"].map((eventType, index) => event({ userId, journey: "search-save-visit", index, eventType, spotId: index < 2 ? `spot-${index}` : "spot-a", concepts: eventType === "decision_request" || eventType === "candidate_exposed" ? [] : ["vibe.cozy", "character.authentic_character"], occurredAt: at(1) })),
    // Repeated recommendations ignored: exposure never becomes preference.
    Array.from({ length: 8 }, (_, index) => event({ userId, journey: `ignored-${index}`, index: 0, eventType: "candidate_exposed", spotId: `ignored-${index}`, concepts: [], occurredAt: at(index + 1) })),
    // Friends chose it; a visit is selection evidence, not satisfaction proof.
    [event({ userId, journey: "friends-choice", index: 0, eventType: "verified_visit", spotId: "spot-friends", concepts: ["vibe.lively"], signature: { audience: "friends" }, occurredAt: at(3) })],
    // Explicit “not my thing.”
    [event({ userId, journey: "explicit-negative", index: 0, eventType: "negative_post_visit", spotId: "spot-loud", concepts: ["vibe.lively"], occurredAt: at(4) })],
    // Repeated favourite across independent sessions.
    ...Array.from({ length: 4 }, (_, index) => [event({ userId, journey: `repeat-${index}`, index: 0, eventType: "positive_post_visit", spotId: "spot-favorite", concepts: ["vibe.cozy"], occurredAt: at(index + 5) })]),
    // Travel preserves the user but not local spot identity in the profile.
    [event({ userId, journey: "travel", index: 0, eventType: "positive_post_visit", spotId: "copenhagen-spot", concepts: ["character.authentic_character"], signature: { placeType: "bar" }, occurredAt: at(10) })]
  ];
  return { version: N5_6_PRODUCT_HISTORY_VERSION, userId, events: journeys.flat(), expectedBoundaries: { ignoredExposureCreatesTaste: false, visitMeansSatisfaction: false, explicitNegativeSigned: true, repeatedSpotIndependentSessions: 4, cityInGlobalTruth: false } };
}
