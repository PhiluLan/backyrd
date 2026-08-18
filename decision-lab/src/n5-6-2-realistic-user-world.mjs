import { contentHash } from "./canonical-json.mjs";
import { N2_VERSIONS, validateMemoryEvent } from "./n2-memory-user-intelligence.mjs";
import { TASTE_SPACE } from "./taste-engine.mjs";

export const N5_6_2_WORLD_VERSION = "backyrd-n5-6-2-realistic-longitudinal-world-v1";
export const N5_6_2_AS_OF = "2026-08-18T12:00:00.000Z";
export const N5_6_2_SEEDS = Object.freeze([56201, 56202, 56203]);

const DAY = 86_400_000;
const conceptSet = new Set(TASTE_SPACE.map(({ key }) => key));
const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const round = (value) => Number(value.toFixed(6));
const weighted = (rng, rows) => {
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  let cursor = rng() * total;
  for (const [value, weight] of rows) { cursor -= weight; if (cursor <= 0) return value; }
  return rows.at(-1)[0];
};
const pick = (rng, rows) => rows[Math.floor(rng() * rows.length) % rows.length];
const unique = (rows) => [...new Set(rows.filter(Boolean))];

function rngFor(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

const P = (global, context = {}, place = {}) => ({ global, context, place });
const USER_SPECS = freeze([
  { id: "NORTH_STAR_REALISTIC_01", label: "Nuanced explorer", cohort: "LONG_TERM", months: 36, sessions: 118, cadence: "REGULAR_BURSTY", home: "Basel", onboarding: ["discovery.hidden_gem", "vibe.lively"], contexts: [["solo", .34], ["friends", .31], ["date", .18], ["family", .07], ["work", .07], ["other", .03]], places: [["bar", .3], ["restaurant", .25], ["cafe", .17], ["activity", .12], ["culture", .1], ["outing", .06]], prefs: P({ "character.authentic_character": .82, "discovery.hidden_gem": .62, "discovery.mainstream": -.38, "price.premium": -.32, "price.balanced_price": .48, "social_style.conversation_friendly": .54, "discovery.novel": .42 }, { friends: { "vibe.lively": .7, "vibe.quiet": -.45 }, solo: { "vibe.quiet": .38, "vibe.cozy": .45 }, date: { "vibe.cozy": .55, "social_style.conversation_friendly": .72, "price.premium": .18 } }, { bar: { "vibe.lively": .45 }, restaurant: { "vibe.cozy": .42 }, cafe: { "vibe.quiet": .4 }, culture: { "vibe.inspiring": .35 } }), drift: { concept: "vibe.lively", start: .55, end: -.12, from: .52, to: .95 }, temporary: { concept: "energy.energetic", from: .34, to: .39, delta: .65 }, travelRate: .1, explore: .72 },
  { id: "n562-user-social", label: "Social nightlife regular", cohort: "LONG_TERM", months: 28, sessions: 92, cadence: "HEAVY_WEEKEND", home: "Basel", contexts: [["friends", .56], ["solo", .16], ["date", .15], ["work", .08], ["other", .05]], places: [["nightlife", .34], ["bar", .32], ["restaurant", .14], ["cafe", .08], ["activity", .07], ["culture", .05]], prefs: P({ "vibe.social": .75, "energy.energetic": .68, "social_style.group_friendly": .72, "vibe.quiet": -.48, "occasion.evening_friendly": .55, "discovery.novel": .35 }, { date: { "vibe.lively": -.18, "social_style.conversation_friendly": .45 }, friends: { "vibe.lively": .84 } }, { nightlife: { "vibe.lively": .82 }, restaurant: { "vibe.elegant": .22 } }), drift: { concept: "energy.energetic", start: .72, end: .25, from: .62, to: .94 }, travelRate: .05, explore: .67 },
  { id: "n562-user-family", label: "Family planner", cohort: "LONG_TERM", months: 32, sessions: 96, cadence: "REGULAR", home: "Basel", contexts: [["family", .55], ["friends", .14], ["solo", .12], ["work", .1], ["date", .06], ["other", .03]], places: [["activity", .27], ["restaurant", .24], ["outing", .18], ["cafe", .13], ["culture", .1], ["bar", .05], ["other", .03]], prefs: P({ "social_style.family_friendly": .82, "price.balanced_price": .58, "energy.calm": .45, "environment.outdoor": .42, "energy.energetic": -.4 }, { family: { "vibe.cozy": .68, "social_style.family_friendly": .9 }, friends: { "vibe.social": .38 } }, { activity: { "environment.outdoor": .6 }, restaurant: { "vibe.cozy": .5 } }), drift: { concept: "environment.outdoor", start: .2, end: .72, from: .48, to: .92 }, travelRate: .04, explore: .46 },
  { id: "n562-user-budget", label: "Price-context pragmatist", cohort: "LONG_TERM", months: 26, sessions: 78, cadence: "REGULAR", home: "Basel", contexts: [["friends", .32], ["solo", .27], ["date", .18], ["family", .11], ["work", .09], ["other", .03]], places: [["bar", .27], ["restaurant", .25], ["cafe", .2], ["activity", .12], ["outing", .09], ["culture", .07]], prefs: P({ "price.budget": .68, "price.premium": -.62, "vibe.relaxed": .48, "social_style.conversation_friendly": .44 }, { date: { "price.premium": .42, "vibe.elegant": .5 }, friends: { "price.budget": .78 } }, { cafe: { "price.budget": .62 }, restaurant: { "price.balanced_price": .52 } }), travelRate: .03, explore: .58 },
  { id: "n562-user-premium", label: "Design and special-occasion seeker", cohort: "LONG_TERM", months: 22, sessions: 70, cadence: "SEASONAL", home: "Basel", onboarding: ["character.design_led"], contexts: [["date", .37], ["friends", .22], ["solo", .16], ["work", .14], ["family", .06], ["other", .05]], places: [["restaurant", .35], ["bar", .2], ["culture", .16], ["cafe", .12], ["activity", .09], ["nightlife", .08]], prefs: P({ "price.premium": .65, "character.design_led": .76, "character.distinctive": .6, "price.budget": -.5, "vibe.elegant": .52 }, { date: { "social_style.romantic_friendly": .72, "vibe.romantic": .55 }, solo: { "vibe.quiet": .32 } }, { restaurant: { "vibe.elegant": .72 }, culture: { "vibe.inspiring": .5 } }), drift: { concept: "character.design_led", start: .75, end: .42, from: .68, to: .98 }, travelRate: .08, explore: .76 },
  { id: "n562-user-chameleon", label: "Social-context chameleon", cohort: "LONG_TERM", months: 30, sessions: 86, cadence: "BURSTY", home: "Basel", contexts: [["solo", .29], ["friends", .31], ["date", .25], ["family", .06], ["work", .06], ["other", .03]], places: [["bar", .27], ["restaurant", .25], ["cafe", .17], ["nightlife", .12], ["culture", .1], ["activity", .09]], prefs: P({ "character.authentic_character": .48, "discovery.hidden_gem": .38 }, { solo: { "vibe.quiet": .72, "energy.calm": .62, "vibe.lively": -.55 }, friends: { "vibe.lively": .82, "vibe.quiet": -.65 }, date: { "vibe.cozy": .72, "social_style.conversation_friendly": .74 } }, { cafe: { "vibe.quiet": .58 }, bar: { "vibe.lively": .45 } }), travelRate: .05, explore: .64 },
  { id: "n562-user-repeater", label: "Known-favorite repeater", cohort: "LONG_TERM", months: 34, sessions: 82, cadence: "REGULAR", home: "Basel", contexts: [["solo", .38], ["friends", .28], ["date", .12], ["family", .1], ["work", .09], ["other", .03]], places: [["cafe", .31], ["bar", .25], ["restaurant", .22], ["outing", .09], ["culture", .07], ["activity", .06]], prefs: P({ "vibe.cozy": .58, "character.authentic_character": .5, "discovery.novel": -.28, "price.balanced_price": .4 }, { solo: { "social_style.solo_friendly": .7 }, friends: { "social_style.conversation_friendly": .5 } }, { cafe: { "vibe.cozy": .72 }, bar: { "vibe.relaxed": .54 } }), temporary: { concept: "discovery.novel", from: .42, to: .48, delta: .55 }, travelRate: .02, explore: .22 },
  { id: "n562-user-traveler", label: "Portable travel explorer", cohort: "LONG_TERM", months: 25, sessions: 76, cadence: "SEASONAL", home: "Basel", contexts: [["solo", .28], ["friends", .25], ["date", .18], ["work", .17], ["family", .07], ["other", .05]], places: [["restaurant", .25], ["bar", .2], ["culture", .18], ["cafe", .14], ["outing", .12], ["activity", .11]], prefs: P({ "discovery.novel": .72, "character.authentic_character": .64, "discovery.mainstream": -.35, "environment.outdoor": .38 }, { work: { "vibe.quiet": .58, "occasion.work_friendly": .65 }, date: { "vibe.cozy": .45 } }, { culture: { "vibe.inspiring": .68 }, restaurant: { "character.authentic_character": .6 } }), drift: { concept: "environment.outdoor", start: .12, end: .65, from: .55, to: .96 }, travelRate: .28, explore: .88 },
  { id: "n562-user-developing", label: "Developing mixed-evidence user", cohort: "DEVELOPING", months: 10, sessions: 18, cadence: "LIGHT", home: "Basel", contexts: [["solo", .42], ["friends", .3], ["date", .12], ["work", .1], ["other", .06]], places: [["cafe", .35], ["bar", .24], ["restaurant", .18], ["activity", .13], ["culture", .1]], prefs: P({ "vibe.cozy": .62, "price.balanced_price": .4, "vibe.lively": -.3 }, { solo: { "energy.calm": .52 } }, { cafe: { "vibe.cozy": .65 } }), travelRate: .02, explore: .67 },
  { id: "n562-user-heavy-new", label: "High-quality new user", cohort: "DEVELOPING", months: 3, sessions: 42, cadence: "HEAVY", home: "Basel", onboarding: ["vibe.relaxed"], contexts: [["friends", .34], ["solo", .3], ["date", .16], ["work", .12], ["other", .08]], places: [["restaurant", .27], ["bar", .25], ["cafe", .2], ["activity", .13], ["culture", .08], ["outing", .07]], prefs: P({ "vibe.relaxed": .58, "character.authentic_character": .48, "price.premium": -.3 }, { friends: { "vibe.social": .55 } }, { restaurant: { "social_style.conversation_friendly": .48 } }), travelRate: .02, explore: .74 },
  { id: "n562-user-long-light", label: "Long-account light user", cohort: "LIGHT", months: 36, sessions: 8, cadence: "LIGHT", home: "Basel", contexts: [["solo", .38], ["friends", .25], ["date", .15], ["work", .12], ["other", .1]], places: [["restaurant", .3], ["cafe", .25], ["bar", .2], ["activity", .15], ["culture", .1]], prefs: P({ "vibe.cozy": .45, "price.balanced_price": .35 }, {}, {}), travelRate: .05, explore: .65 },
  { id: "n562-user-cold", label: "Cold control", cohort: "COLD", months: 1, sessions: 2, cadence: "LIGHT", home: "Basel", contexts: [["solo", .5], ["friends", .3], ["other", .2]], places: [["cafe", .4], ["bar", .3], ["restaurant", .3]], prefs: P({ "vibe.relaxed": .3 }, {}, {}), travelRate: 0, explore: .8 }
]);

const TYPE_CONCEPTS = freeze({
  bar: ["place_type.bar", "vibe.lively", "vibe.cozy", "vibe.social", "social_style.conversation_friendly", "discovery.hidden_gem", "price.balanced_price", "price.premium", "character.authentic_character"],
  restaurant: ["place_type.restaurant", "vibe.cozy", "vibe.elegant", "social_style.conversation_friendly", "social_style.romantic_friendly", "price.balanced_price", "price.premium", "character.authentic_character", "character.design_led"],
  cafe: ["place_type.cafe", "vibe.cozy", "vibe.quiet", "energy.calm", "social_style.solo_friendly", "occasion.morning_friendly", "price.budget", "character.authentic_character"],
  nightlife: ["place_type.nightlife", "vibe.lively", "vibe.social", "energy.energetic", "social_style.group_friendly", "occasion.evening_friendly", "discovery.mainstream", "discovery.novel"],
  culture: ["place_type.culture", "vibe.inspiring", "vibe.quiet", "character.distinctive", "character.design_led", "discovery.novel", "environment.indoor"],
  activity: ["place_type.activity", "vibe.playful", "energy.energetic", "social_style.group_friendly", "social_style.family_friendly", "environment.outdoor", "discovery.novel"],
  outing: ["place_type.outing", "vibe.relaxed", "environment.outdoor", "social_style.family_friendly", "energy.balanced", "discovery.hidden_gem", "price.budget"],
  other: ["place_type.other", "vibe.relaxed", "energy.balanced", "price.balanced_price"]
});
const CITIES = ["Basel", "Zurich", "Copenhagen", "Berlin"];

function buildSpots(seed) {
  const rng = rngFor(seed ^ 0x51A7);
  const spots = [];
  for (const city of CITIES) for (const [placeType, concepts] of Object.entries(TYPE_CONCEPTS)) {
    const count = city === "Basel" ? 5 : 2;
    for (let index = 0; index < count; index += 1) {
      const shuffled = [...concepts].sort(() => rng() - .5);
      const size = 2 + Math.floor(rng() * Math.min(4, concepts.length - 1));
      const selected = unique([`place_type.${placeType}`, ...shuffled.slice(0, size)]).slice(0, 6);
      const id = `n562:${seed}:spot:${city.toLowerCase()}:${placeType}:${index}`;
      spots.push({
        id, city, placeType,
        concepts: Object.fromEntries(selected.map((concept, conceptIndex) => [concept, { confidence: round(conceptIndex === selected.length - 1 && index % 4 === 0 ? .28 : .48 + rng() * .48), provenance: conceptIndex === 0 ? "CANONICAL_SPOT_DATA" : index % 3 === 0 ? "COMMUNITY_DERIVED" : "BACKYRD_DERIVED" }])),
        quality: round(.35 + rng() * .6)
      });
    }
  }
  return spots;
}

function effectiveAffinity(spec, concept, audience, placeType, progress) {
  let value = spec.prefs.global[concept] ?? 0;
  value += spec.prefs.context[audience]?.[concept] ?? 0;
  value += spec.prefs.place[placeType]?.[concept] ?? 0;
  if (spec.drift?.concept === concept) {
    const t = clamp((progress - spec.drift.from) / Math.max(.01, spec.drift.to - spec.drift.from));
    value += spec.drift.start + (spec.drift.end - spec.drift.start) * t;
  }
  if (spec.temporary?.concept === concept && progress >= spec.temporary.from && progress <= spec.temporary.to) value += spec.temporary.delta;
  return clamp(value, -1, 1);
}

function sessionTimes(spec, seed) {
  const rng = rngFor(seed ^ [...spec.id].reduce((sum, char) => sum + char.charCodeAt(0), 0));
  const end = new Date(N5_6_2_AS_OF).valueOf() - (1 + Math.floor(rng() * 5)) * DAY;
  const start = end - spec.months * 30.44 * DAY;
  const weights = Array.from({ length: spec.sessions }, (_, index) => {
    const season = 1 + .65 * Math.sin((index / Math.max(1, spec.sessions - 1)) * Math.PI * 5 + rng());
    const gap = -Math.log(Math.max(.0001, 1 - rng())) * (spec.cadence.includes("HEAVY") ? .65 : spec.cadence === "LIGHT" ? 1.8 : 1);
    return Math.max(.05, season + gap);
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  return weights.map((weight, index) => {
    cursor += weight;
    const jitter = (rng() - .5) * DAY * 1.8;
    const at = Math.min(end, start + cursor / total * (end - start) + jitter + index * 1_000);
    return new Date(at).toISOString();
  }).sort();
}

function contextFor(rng, audience, placeType, sessionIndex) {
  const weekend = rng() < (audience === "friends" || audience === "date" || audience === "family" ? .67 : .38);
  const daypart = placeType === "cafe" ? weighted(rng, [["morning", .45], ["afternoon", .4], ["evening", .15]])
    : placeType === "nightlife" ? "night" : audience === "family" ? weighted(rng, [["afternoon", .65], ["morning", .22], ["evening", .13]]) : weighted(rng, [["evening", .55], ["afternoon", .25], ["night", .12], ["morning", .08]]);
  return { audience: audience === "group" ? "other" : audience, daypart, calendar: weekend ? "weekend" : "weekday", occasion: audience === "work" ? "business" : daypart === "night" ? "late_night" : sessionIndex % 7 === 0 ? "special" : daypart === "evening" ? "afterwork" : "casual", placeType, friction: weighted(rng, [["low", .45], ["medium", .42], ["high", .13]]), distanceWillingness: weighted(rng, [["near", .42], ["moderate", .45], ["far", .13]]) };
}

function event({ spec, sessionId, decisionId, spot, signature, eventType, index, occurredAt, provenance, exposure = null }) {
  const id = `${sessionId}:event:${String(index).padStart(2, "0")}:${eventType}`;
  return {
    id, idempotencyKey: `idem:${id}`, userId: spec.id, eventType,
    contractVersion: N2_VERSIONS.memoryEventContract,
    occurredAt, observedAt: occurredAt, ingestedAt: occurredAt,
    decisionId, sessionId, spotId: spot?.id ?? null,
    momentSignature: signature ?? {},
    spotEvidence: { placeType: spot?.placeType ?? signature?.placeType ?? null, concepts: spot ? Object.keys(spot.concepts) : [] },
    provenance: { source: provenance, sourceEventId: id, sourceVersion: N5_6_2_WORLD_VERSION },
    consentPurpose: "personalized_recommendations", consentState: "granted",
    ...(exposure ? { exposure } : {})
  };
}

function buildSessions(spec, seed, spots) {
  const rng = rngFor(seed ^ contentHash(spec.id).slice(0, 8).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0));
  const times = sessionTimes(spec, seed);
  const sessions = [];
  const favorites = [];
  for (let sessionIndex = 0; sessionIndex < times.length; sessionIndex += 1) {
    const progress = sessionIndex / Math.max(1, times.length - 1);
    const audience = weighted(rng, spec.contexts);
    const placeType = weighted(rng, spec.places);
    const travel = rng() < spec.travelRate;
    const city = travel ? pick(rng, CITIES.filter((value) => value !== spec.home)) : spec.home;
    const signature = contextFor(rng, audience, placeType, sessionIndex);
    const sessionType = weighted(rng, [["DECISION_BROWSE", .25], ["DECISION_COMMIT", .29], ["DIRECT_MAP", .12], ["SEARCH_RESERVE", .1], ["IGNORED_RESULTS", .1], ["REPEAT_FAVORITE", .09], ["SHARED_LINK", .05]]);
    const compromise = ["friends", "family", "work", "group"].includes(audience) && rng() < .14;
    const logistics = rng() < .18;
    const noise = sessionType === "SHARED_LINK" || rng() < .07;
    const pool = spots.filter((spot) => spot.city === city && spot.placeType === placeType);
    const opportunity = [...pool].sort(() => rng() - .5).slice(0, Math.min(5, pool.length));
    const scored = opportunity.map((spot) => {
      const concepts = Object.keys(spot.concepts);
      const fit = concepts.reduce((sum, concept) => sum + effectiveAffinity(spec, concept, audience, placeType, progress), 0) / Math.max(1, concepts.length);
      return { spot, fit: fit + (rng() - .5) * .7 + (logistics ? rng() * .55 : 0) + (compromise ? (rng() - .5) * 1.1 : 0) };
    }).sort((a, b) => b.fit - a.fit || a.spot.id.localeCompare(b.spot.id));
    let chosen = scored[0]?.spot ?? pick(rng, pool);
    if (sessionType === "REPEAT_FAVORITE" && favorites.length) chosen = pick(rng, favorites.filter((spot) => spot.city === city && spot.placeType === placeType).length ? favorites.filter((spot) => spot.city === city && spot.placeType === placeType) : favorites);
    if (noise && scored.length > 1) chosen = scored.at(-1).spot;
    const known = favorites.some(({ id }) => id === chosen.id);
    const latentFit = Object.keys(chosen.concepts).reduce((sum, concept) => sum + effectiveAffinity(spec, concept, audience, placeType, progress), 0) / Math.max(1, Object.keys(chosen.concepts).length);
    const outcomeKnown = !["IGNORED_RESULTS", "DECISION_BROWSE", "SHARED_LINK"].includes(sessionType) && rng() > .34;
    const outcomeScore = latentFit + (rng() - .5) * 1.25 - (compromise ? .12 : 0);
    const outcome = !outcomeKnown ? "unknown" : outcomeScore > .68 ? "strong_positive" : outcomeScore > .18 ? "positive" : outcomeScore > -.18 ? "neutral" : outcomeScore > -.58 ? "negative" : "strong_negative";
    const explicitRate = ["negative", "strong_negative"].includes(outcome) ? .72 : ["positive", "strong_positive"].includes(outcome) ? .26 : .08;
    const explicit = outcomeKnown && rng() < explicitRate;
    const sessionId = `n562:${seed}:${spec.id}:session:${String(sessionIndex).padStart(3, "0")}`;
    const decisionId = ["DIRECT_MAP", "SHARED_LINK"].includes(sessionType) ? null : `n562:${seed}:${spec.id}:decision:${String(sessionIndex).padStart(3, "0")}`;
    const base = new Date(times[sessionIndex]).valueOf();
    let eventIndex = 0;
    const events = [];
    const add = (eventType, spot = chosen, provenance = "n5_6_2_product_session", exposure = null) => events.push(event({ spec, sessionId, decisionId, spot, signature, eventType, index: eventIndex++, occurredAt: new Date(base + eventIndex * 1_000).toISOString(), provenance, exposure }));
    if (spec.onboarding?.length && sessionIndex === 0) {
      const onboardingSpot = { id: `${sessionId}:onboarding`, placeType: null, concepts: Object.fromEntries(spec.onboarding.map((concept) => [concept, { confidence: .7 }])) };
      add("onboarding_preference", onboardingSpot, "n5_6_2_onboarding");
    }
    if (decisionId) { add("decision_request", null); add("decision_results_shown", null); }
    for (let rank = 0; rank < Math.min(3, opportunity.length); rank += 1) add("candidate_exposed", opportunity[rank], "n5_6_2_candidate_exposure", { rank: rank + 1, propensity: round(.72 / (rank + 1)) });
    if (sessionType !== "IGNORED_RESULTS") add(sessionType === "SEARCH_RESERVE" ? "search_result_opened" : "spot_opened", chosen, noise ? "n5_6_2_low_value_interaction" : "n5_6_2_product_interaction");
    if (["DECISION_COMMIT", "REPEAT_FAVORITE"].includes(sessionType) && !noise && rng() < .38) add("saved", chosen);
    if (["DECISION_COMMIT", "REPEAT_FAVORITE", "DIRECT_MAP"].includes(sessionType) && !noise) add("navigation_intent", chosen, logistics ? "n5_6_2_logistics_driven_choice" : compromise ? "n5_6_2_group_compromise" : "n5_6_2_product_commitment");
    if (sessionType === "SEARCH_RESERVE") add("reservation_intent", chosen);
    if (outcomeKnown) {
      add("verified_visit", chosen, sessionType === "DIRECT_MAP" ? "n5_6_2_organic_direct_visit" : "n5_6_2_confirmed_visit");
      if (explicit && ["strong_positive", "positive"].includes(outcome)) add(outcome === "strong_positive" ? "explicit_positive" : "positive_post_visit", chosen, "n5_6_2_explicit_outcome");
      if (explicit && ["strong_negative", "negative"].includes(outcome)) add(outcome === "strong_negative" ? "explicit_negative" : "negative_post_visit", chosen, "n5_6_2_explicit_outcome");
    }
    if (["strong_positive", "positive"].includes(outcome) && !favorites.some(({ id }) => id === chosen.id) && rng() < .55) favorites.push(chosen);
    sessions.push({ sessionId, decisionId, occurredAt: times[sessionIndex], city, travel, sessionType, audience, placeType, signature, chosenSpotId: chosen.id, knownSpotRepeat: known, compromise, logistics, noise, outcome, explicitFeedback: explicit, opportunitySpotIds: opportunity.map(({ id }) => id), observableEvents: events });
  }
  return sessions;
}

export function buildN5_6_2World(seed = N5_6_2_SEEDS[0]) {
  if (!N5_6_2_SEEDS.includes(seed)) throw new Error("n562_unfrozen_seed");
  const spots = buildSpots(seed);
  const users = USER_SPECS.map((spec) => {
    const sessions = buildSessions(spec, seed, spots);
    const events = sessions.flatMap(({ observableEvents }) => observableEvents);
    for (const input of events) validateMemoryEvent(input, { asOf: N5_6_2_AS_OF, allowExpired: true });
    return { id: spec.id, cohort: spec.cohort, homeCity: spec.home, accountMonths: spec.months, sessions, events };
  });
  const engineInputs = users.map(({ id, events }) => ({ userId: id, events }));
  const runtimeSerialized = JSON.stringify(engineInputs);
  if (/(latent|ground[_-]?truth|oracle|expected[_-]?utility)/i.test(runtimeSerialized)) throw new Error("n562_latent_truth_runtime_leakage");
  const evaluatorOnly = USER_SPECS.map(({ id, label, prefs, drift, temporary, explore }) => ({ id, label, latentTendencies: prefs, drift: drift ?? null, temporaryPhase: temporary ?? null, explorationTendency: explore }));
  const body = {
    version: N5_6_2_WORLD_VERSION, seed, asOf: N5_6_2_AS_OF,
    population: users.map(({ id, cohort, homeCity, accountMonths, sessions, events }) => ({ id, cohort, homeCity, accountMonths, sessionCount: sessions.length, eventCount: events.length, eventHash: contentHash(events) })),
    spotUniverseHash: contentHash(spots), engineInputHash: contentHash(engineInputs), evaluatorOnlyHash: contentHash(evaluatorOnly)
  };
  return freeze({ ...body, spots, users, engineInputs, evaluatorOnly, worldHash: contentHash(body) });
}

export const N5_6_2_USER_SPEC_SUMMARY = freeze(USER_SPECS.map(({ id, label, cohort, months, sessions, cadence, home, travelRate, explore, drift, temporary }) => ({ id, label, cohort, months, sessions, cadence, home, travelRate, explore, drift: drift ?? null, temporary: temporary ?? null })));
