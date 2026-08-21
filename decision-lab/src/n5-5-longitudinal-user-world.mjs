import { contentHash } from "./canonical-json.mjs";
import { N2_MEMORY_CONTRACT_HASH, N2_VERSIONS, buildUserIntelligence, validateMemoryEvent } from "./n2-memory-user-intelligence.mjs";
import { N3_CONTRACT_HASH, buildCurrentMoment } from "./n3-moment-intelligence.mjs";
import { N5_CONTRACT_HASH, buildRelevantUserProjection, validateN5ScientificBoundary } from "./n5-relevant-user-projection.mjs";

export const N5_5_WORLD_VERSION = "backyrd-n5-5-longitudinal-user-world-v1";
export const N5_5_AS_OF = "2026-08-17T12:00:00.000Z";

const DAY = 86_400_000;
const isoDaysBefore = (days) => new Date(new Date(N5_5_AS_OF).valueOf() - days * DAY).toISOString();
const stable = (value) => Object.freeze(value);
const contexts = (signature) => ({
  audience: signature.audience, daypart: signature.daypart, calendar: signature.calendar,
  occasion: signature.occasion, placeType: signature.placeType,
  friction: signature.friction, distanceWillingness: signature.distanceWillingness
});

// This is an evaluator-only behavioral generator. Its entries are never passed
// into N2/N3/N5; only the emitted canonical Memory events cross that boundary.
const EVALUATOR_PERSONAS = stable([
  { id: "n55-user-explorer", label: "Explorer", lifecycle: "LONG_TERM", sessions: 104, city: "Basel", primary: { audience: "date", daypart: "evening", calendar: "weekend", occasion: "dinner", placeType: "restaurant", friction: "medium", distanceWillingness: "moderate" }, concepts: ["discovery.hidden_gem", "discovery.novel", "character.authentic_character", "vibe.cozy", "social_style.conversation_friendly"], negative: ["discovery.mainstream"], drift: ["vibe.quiet", "vibe.lively"] },
  { id: "n55-user-social", label: "Social / nightlife", lifecycle: "LONG_TERM", sessions: 102, city: "Basel", primary: { audience: "friends", daypart: "night", calendar: "weekend", occasion: "late_night", placeType: "nightlife", friction: "low", distanceWillingness: "moderate" }, concepts: ["vibe.lively", "energy.energetic", "vibe.social", "social_style.group_friendly", "occasion.evening_friendly"], negative: ["vibe.quiet"] },
  { id: "n55-user-family", label: "Family planner", lifecycle: "LONG_TERM", sessions: 100, city: "Basel", primary: { audience: "family", daypart: "afternoon", calendar: "weekend", occasion: "casual", placeType: "activity", friction: "low", distanceWillingness: "near" }, concepts: ["social_style.family_friendly", "vibe.cozy", "energy.calm", "price.balanced_price", "environment.outdoor"], negative: ["energy.energetic"] },
  { id: "n55-user-date", label: "Date / couple", lifecycle: "MATURE", sessions: 84, city: "Basel", primary: { audience: "date", daypart: "evening", calendar: "weekend", occasion: "dinner", placeType: "restaurant", friction: "medium", distanceWillingness: "moderate" }, concepts: ["social_style.romantic_friendly", "social_style.conversation_friendly", "vibe.romantic", "vibe.elegant", "price.balanced_price"], negative: ["social_style.group_friendly"] },
  { id: "n55-user-budget", label: "Budget conscious", lifecycle: "MATURE", sessions: 80, city: "Basel", primary: { audience: "friends", daypart: "evening", calendar: "weekday", occasion: "afterwork", placeType: "bar", friction: "low", distanceWillingness: "near" }, concepts: ["price.budget", "vibe.social", "vibe.relaxed", "energy.balanced", "social_style.conversation_friendly"], negative: ["price.premium"] },
  { id: "n55-user-premium", label: "Premium / design", lifecycle: "MATURE", sessions: 78, city: "Basel", primary: { audience: "date", daypart: "evening", calendar: "weekend", occasion: "dinner", placeType: "restaurant", friction: "high", distanceWillingness: "far" }, concepts: ["price.premium", "character.design_led", "vibe.elegant", "character.distinctive", "social_style.romantic_friendly"], negative: ["price.budget"] },
  { id: "n55-user-developing", label: "Developing café user", lifecycle: "DEVELOPING", sessions: 8, city: "Basel", primary: { audience: "solo", daypart: "afternoon", calendar: "weekday", occasion: "casual", placeType: "cafe", friction: "low", distanceWillingness: "near" }, concepts: ["vibe.cozy", "energy.calm", "social_style.solo_friendly"], negative: ["vibe.lively"] },
  { id: "n55-user-cold", label: "Cold user", lifecycle: "COLD", sessions: 0, city: "Basel", primary: null, concepts: [], negative: [] },
  { id: "NORTH_STAR_EXPLORER_01", label: "North Star explorer", lifecycle: "LONG_TERM", sessions: 108, city: "Basel", primary: { audience: "solo", daypart: "evening", calendar: "weekday", occasion: "afterwork", placeType: "bar", friction: "low", distanceWillingness: "near" }, concepts: ["discovery.hidden_gem", "character.authentic_character", "vibe.cozy", "social_style.solo_friendly", "social_style.conversation_friendly", "price.balanced_price"], negative: ["discovery.mainstream", "price.premium"], drift: ["vibe.quiet", "vibe.lively"] }
]);

const secondarySignature = (primary, index) => ({
  ...primary,
  audience: index % 2 ? primary.audience : "friends",
  daypart: index % 3 ? primary.daypart : "evening",
  calendar: index % 2 ? primary.calendar : "weekday",
  occasion: index % 2 ? primary.occasion : "casual",
  placeType: index % 2 ? primary.placeType : "bar",
  friction: index % 2 ? primary.friction : "medium",
  distanceWillingness: index % 2 ? primary.distanceWillingness : "moderate"
});

function eventFor({ persona, index, eventType, signature, concepts: eventConcepts, occurredAt }) {
  const id = `${persona.id}:memory:${String(index).padStart(3, "0")}`;
  return {
    id, idempotencyKey: `idem:${id}`, userId: persona.id, eventType,
    contractVersion: N2_VERSIONS.memoryEventContract,
    occurredAt, observedAt: occurredAt, ingestedAt: occurredAt,
    decisionId: `${persona.id}:decision:${String(index).padStart(3, "0")}`,
    sessionId: `${persona.id}:session:${String(index).padStart(3, "0")}`,
    spotId: `${persona.id}:spot:${String(index % 46).padStart(3, "0")}`,
    momentSignature: contexts(signature),
    spotEvidence: { placeType: signature.placeType, concepts: eventConcepts },
    provenance: { source: "n5_5_synthetic_first_party_outcome", sourceEventId: id, sourceVersion: N5_5_WORLD_VERSION },
    consentPurpose: "personalized_recommendations", consentState: "granted"
  };
}

function eventStream(persona) {
  if (!persona.sessions) {
    const occurredAt = N5_5_AS_OF;
    return [{
      id: `${persona.id}:memory:cold-request`, idempotencyKey: `idem:${persona.id}:cold-request`, userId: persona.id, eventType: "decision_request",
      contractVersion: N2_VERSIONS.memoryEventContract, occurredAt, observedAt: occurredAt, ingestedAt: occurredAt,
      decisionId: `${persona.id}:decision:cold`, sessionId: `${persona.id}:session:cold`, spotId: null,
      momentSignature: {}, spotEvidence: { placeType: null, concepts: [] },
      provenance: { source: "n5_5_synthetic_first_party_request", sourceEventId: `${persona.id}:cold-request`, sourceVersion: N5_5_WORLD_VERSION },
      consentPurpose: "personalized_recommendations", consentState: "granted"
    }];
  }
  const events = [eventFor({ persona, index: "onboarding", eventType: "onboarding_preference", signature: persona.primary, concepts: persona.concepts.slice(0, 1), occurredAt: isoDaysBefore(270) })];
  for (let index = 0; index < persona.sessions; index += 1) {
    // Nine months, with a regular cadence and no stale raw Memory under N2's
    // outcome/explicit-feedback retention windows.
    const occurredAt = isoDaysBefore(270 - Math.floor(index * 268 / Math.max(1, persona.sessions - 1)));
    const isPrimary = index % 5 !== 4;
    const signature = isPrimary ? persona.primary : secondarySignature(persona.primary, index);
    let eventType = index % 7 === 0 ? "explicit_positive" : index % 5 === 0 ? "positive_post_visit" : "verified_visit";
    let eventConcepts = [...persona.concepts];
    if (persona.drift && index < Math.floor(persona.sessions * 0.28)) eventConcepts = [...eventConcepts, persona.drift[0]];
    if (persona.drift && index >= Math.floor(persona.sessions * 0.72)) eventConcepts = [...eventConcepts, persona.drift[1]];
    if (persona.drift && index >= Math.floor(persona.sessions * 0.72) && index % 17 === 1) { eventType = "explicit_negative"; eventConcepts = [persona.drift[0]]; }
    else if (index % 13 === 0 && persona.negative.length) { eventType = "explicit_negative"; eventConcepts = [persona.negative[index % persona.negative.length]]; }
    events.push(eventFor({ persona, index, eventType, signature, concepts: eventConcepts, occurredAt }));
  }
  return events;
}

export function buildN5_5World() {
  const users = EVALUATOR_PERSONAS.map((persona) => ({ id: persona.id, label: persona.label, declaredLifecycle: persona.lifecycle, city: persona.city, events: eventStream(persona) }));
  const engineInputs = users.map(({ id, events }) => ({ userId: id, events }));
  const evaluatorReference = EVALUATOR_PERSONAS.map(({ id, label, lifecycle, concepts, negative, drift }) => ({ id, label, lifecycle, concepts, negative, drift: drift ?? [] }));
  const engineInputSerialized = JSON.stringify(engineInputs);
  if (/(latent|ground[_-]?truth|oracle|expected[_-]?utility)/i.test(engineInputSerialized)) throw new Error("n5_5_evaluator_leak_to_engine_input");
  for (const { events } of engineInputs) for (const event of events) {
    try { validateMemoryEvent(event, { asOf: N5_5_AS_OF }); }
    catch (error) { throw new Error(`n5_5_invalid_canonical_event:${event.id}:${error.message}`); }
  }
  const body = { version: N5_5_WORLD_VERSION, asOf: N5_5_AS_OF, users: users.map(({ id, label, declaredLifecycle, city, events }) => ({ id, label, declaredLifecycle, city, eventCount: events.length, eventHash: contentHash(events) })), engineInputHash: contentHash(engineInputs) };
  return stable({ ...body, users, engineInputs, evaluatorReference, worldHash: contentHash(body) });
}

const MOMENTS = stable([
  { key: "FAMILY_SUNDAY", query: "Mit meinen Kindern gemütlich etwas machen", explicit: { social_context: "family_with_kids", vibe: ["cozy"], activity_intent: ["activity"], planning_tolerance: "low" }, at: "2026-08-16T13:00:00.000Z", intent: { preferredPlaceTypes: ["activity"] } },
  { key: "FRIENDS_FRIDAY", query: "Mit Freunden heute laut und lebendig etwas trinken", explicit: { social_context: "friends", vibe: ["lively", "social"], activity_intent: ["drink"] }, at: "2026-08-14T21:00:00.000Z", intent: { requiredPlaceTypes: ["bar"], conceptDirections: [{ concept: "vibe.lively", direction: 1 }, { concept: "vibe.quiet", direction: -1 }] } },
  { key: "DATE_EVENING", query: "Date, gemütlich etwas trinken", explicit: { social_context: "date", vibe: ["cozy", "romantic"], activity_intent: ["drink"] }, at: "2026-08-15T19:00:00.000Z", intent: { preferredPlaceTypes: ["bar"] } },
  { key: "SOLO_AFTERWORK", query: "Alleine nach Feierabend, unkompliziert etwas trinken", explicit: { social_context: "solo", occasion: "afterwork", activity_intent: ["drink"], planning_tolerance: "low", distance_willingness: "near" }, at: "2026-08-18T17:30:00.000Z", intent: { requiredPlaceTypes: ["bar"] } },
  { key: "CROSS_CITY_COPENHAGEN", query: "Gerade angekommen, zwei Stunden entspannt rumlaufen und etwas trinken", explicit: { social_context: "solo", activity_intent: ["walk", "drink"], vibe: ["relaxed"], duration: "one_to_two_hours", spontaneity: "spontaneous" }, at: "2026-08-18T12:00:00.000Z", city: "Copenhagen", timeZone: "Europe/Copenhagen", intent: { preferredPlaceTypes: ["bar"] } },
  { key: "BROAD_UNKNOWN", query: "Irgendwas cooles", explicit: { activity_intent: ["broad"] }, at: "2026-08-18T12:00:00.000Z", intent: { activityBroad: true } }
]);

function profileAt(events, userId, asOf, city) { return buildUserIntelligence(events.filter((event) => event.occurredAt <= asOf), { asOf, consentState: "granted", queryCity: city }); }
// N2's granted-state profile intentionally does not repeat a consent snapshot.
// N5 requires the already-authorized call boundary to state it explicitly.
function n5AuthorizedProfile(profile) { return stable({ ...profile, consentState: "granted" }); }
function momentFor(userId, definition, patterns) {
  return buildCurrentMoment({
    decisionId: `n55:${userId}:${definition.key}`, userId,
    request: { requestId: `n55-request:${userId}:${definition.key}`, query: definition.query }, explicit: definition.explicit,
    context: { now: definition.at, timeZone: definition.timeZone ?? "Europe/Zurich", location: { city: definition.city ?? "Basel", source: "explicit_selected", id: `city:${definition.city ?? "Basel"}` } },
    memoryPatterns: patterns, memoryConsentState: "granted", observedAt: definition.at
  }).currentMoment;
}

export function buildN5_5Evaluation() {
  const world = buildN5_5World();
  const profiles = [];
  const projections = [];
  for (const user of world.users) {
    const snapshots = user.events.length ? [1, Math.min(3, user.events.length), Math.min(9, user.events.length), user.events.length].map((count, index) => ({ stage: ["DAY_0", "EARLY", "DEVELOPING", "MATURE"][index], count, asOf: user.events[count - 1].occurredAt })) : [{ stage: "DAY_0", count: 0, asOf: N5_5_AS_OF }];
    const finalProfile = profileAt(user.events, user.id, N5_5_AS_OF, user.city);
    profiles.push({ user: { id: user.id, label: user.label, declaredLifecycle: user.declaredLifecycle, city: user.city, eventCount: user.events.length }, snapshots: snapshots.map((snapshot) => ({ ...snapshot, profile: profileAt(user.events.slice(0, snapshot.count), user.id, snapshot.asOf, user.city) })), profile: finalProfile });
    for (const definition of MOMENTS) {
      const currentMoment = momentFor(user.id, definition, finalProfile.patterns);
      const output = buildRelevantUserProjection({ userIntelligence: n5AuthorizedProfile(finalProfile), currentMoment, currentIntent: definition.intent });
      projections.push({ userId: user.id, momentKey: definition.key, city: definition.city ?? "Basel", currentMoment, projection: output.projection, flightRecorder: output.flightRecorder });
    }
  }
  const projectionSurface = projections.map(({ projection }) => ({ relevantTaste: projection.relevantTaste, relevantPatterns: projection.relevantPatterns, uncertainties: projection.uncertainties }));
  if (!validateN5ScientificBoundary(projectionSurface)) throw new Error("n5_5_scientific_boundary_failure");
  return stable({ world, profiles, projections, evaluationHash: contentHash({ worldHash: world.worldHash, profileHashes: profiles.map(({ profile }) => profile.intelligenceHash), projectionHashes: projections.map(({ projection }) => projection.projectionHash) }) });
}

export const N5_5_CONTRACT_IDENTITIES = stable({ worldVersion: N5_5_WORLD_VERSION, n2MemoryContractHash: N2_MEMORY_CONTRACT_HASH, n3ContractHash: N3_CONTRACT_HASH, n5ContractHash: N5_CONTRACT_HASH });
