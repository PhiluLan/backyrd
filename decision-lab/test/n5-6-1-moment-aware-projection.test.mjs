import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { buildN5_6_1World } from "../src/n5-6-1-world.mjs";
import {
  N5_6_1_CONCEPT_METADATA, N5_6_1_PROJECTION_CONTRACT,
  assessMomentCompatibility, buildMomentAwareRelevantUserProjection,
  validateConceptMetadataCompleteness
} from "../src/n5-6-1-moment-aware-projection.mjs";
import { buildN5_6_1ValidationResult } from "../src/n5-6-1-validation.mjs";
import { TASTE_SPACE } from "../src/taste-engine.mjs";

const world = buildN5_6_1World();
const row = (userId, momentKey) => world.projections.find((item) => item.userId === userId && item.momentKey === momentKey);
const north = (momentKey) => row("NORTH_STAR_EXPLORER_01", momentKey);

test("N5.6.1 concept compatibility metadata covers the frozen taste space", () => {
  assert.equal(validateConceptMetadataCompleteness(), true);
  assert.equal(Object.keys(N5_6_1_CONCEPT_METADATA).length, TASTE_SPACE.length);
  assert.deepEqual(N5_6_1_CONCEPT_METADATA["social_style.solo_friendly"].compatibleSocialContexts, ["solo"]);
  assert.equal(N5_6_1_CONCEPT_METADATA["character.authentic_character"].portableByDefault, true);
});

test("DEEP overall maturity does not leak into Family-specific sufficiency", () => {
  const projection = north("FAMILY_SUNDAY").projection;
  assert.equal(projection.knowledgeSufficiency.overallUserMaturity, "DEEP");
  assert.equal(projection.knowledgeSufficiency.finalPersonalizationSufficiency.level, "LOW");
  assert.equal(projection.knowledgeSufficiency.contextKnowledge, 0);
  assert(!projection.taste.some(({ concept, scope }) => concept === "social_style.solo_friendly" || scope.key === "audience.solo" || scope.key === "bar"));
});

test("broad moments stay sparse and explicitly uncertain", () => {
  for (const key of ["BROAD_UNKNOWN", "NEW_CITY_BROAD_UNKNOWN"]) {
    const projection = north(key).projection;
    assert(projection.taste.length <= 2);
    assert(["LOW", "UNKNOWN"].includes(projection.knowledgeSufficiency.finalPersonalizationSufficiency.level));
    assert(projection.uncertainties.includes("USER_KNOWN_MOMENT_RELEVANCE_UNCLEAR"));
  }
});

test("matching Solo Afterwork retains rich knowledge and the exact pattern", () => {
  const projection = north("SOLO_AFTERWORK").projection;
  assert.equal(projection.knowledgeSufficiency.finalPersonalizationSufficiency.level, "HIGH");
  assert(projection.taste.length >= 4);
  assert(projection.taste.some(({ concept, scope }) => concept === "social_style.solo_friendly" && scope.key === "audience.solo"));
  assert.equal(projection.occasionPatterns.length, 1);
  assert.equal(projection.occasionPatterns[0].contextSignature.occasion, "afterwork");
});

test("Copenhagen carries portable personality but not the wrong occasion or Basel spot identity", () => {
  const projection = north("CROSS_CITY_COPENHAGEN").projection;
  assert(projection.taste.length > 0);
  assert.equal(projection.occasionPatterns.length, 0);
  assert(!JSON.stringify(projection).includes("NORTH_STAR_EXPLORER_01:spot"));
  assert.equal(projection.knowledgeSufficiency.finalPersonalizationSufficiency.level, "HIGH");
});

test("socially bound knowledge cannot leak into an incompatible explicit context", () => {
  for (const key of ["FAMILY_SUNDAY", "FRIENDS_FRIDAY", "DATE_EVENING", "MUSEUM_CULTURE_FAMILY"]) {
    assert(!north(key).projection.taste.some(({ concept }) => concept === "social_style.solo_friendly"));
  }
  const node = world.profiles.find(({ user }) => user.id === "NORTH_STAR_EXPLORER_01").userCard.nodes.find(({ nodeKey }) => nodeKey === "GLOBAL:global:social_style.solo_friendly");
  assert.equal(assessMomentCompatibility(node, north("FAMILY_SUNDAY").currentMoment, north("FAMILY_SUNDAY").currentIntent).compatibility, "CONFLICT");
});

test("Place-Type knowledge cannot leak from Bars into activity or culture decisions", () => {
  for (const key of ["FAMILY_SUNDAY", "MUSEUM_CULTURE_FAMILY"]) {
    assert(!north(key).projection.taste.some(({ scope }) => scope.kind === "PLACE_TYPE" && scope.key === "bar"));
  }
});

test("Current Intent remains authoritative and corroboration requires independent support", () => {
  const projection = north("FRIENDS_FRIDAY").projection;
  assert(!projection.taste.some(({ concept, affinity }) => concept === "vibe.quiet" && affinity > 0));
  assert(projection.projectionAudit.nodes.some(({ concept, reasonCode }) => concept === "vibe.quiet" && reasonCode === "CURRENT_INTENT_CONFLICT"));
  assert(projection.taste.filter(({ signalType }) => signalType === "CORROBORATIVE").every(({ confidence, evidenceDepth }) => confidence >= 0.75 && evidenceDepth.independentSessions >= 3));
});

test("projection capacity is a maximum rather than a fill target", () => {
  const sizes = world.projections.map(({ projection }) => projection.taste.length);
  assert(sizes.every((size) => size <= N5_6_1_PROJECTION_CONTRACT.maximumTasteNodes));
  assert.equal(sizes.filter((size) => size === N5_6_1_PROJECTION_CONTRACT.maximumTasteNodes).length, 0);
  assert(new Set(sizes).size >= 5);
  assert(sizes.some((size) => size === 0));
  assert(sizes.some((size) => size >= 6));
});

test("positive and negative signals share no fixed quota", () => {
  assert(world.projections.some(({ projection }) => projection.positiveTaste.length > 0 && projection.negativeTaste.length === 0));
  assert(world.projections.some(({ projection }) => projection.positiveTaste.length > 0 && projection.negativeTaste.length > 0));
  assert(world.projections.every(({ projection }) => projection.positiveTaste.length + projection.negativeTaste.length === projection.taste.length));
});

test("cold and developing knowledge remain calibrated despite clear moments", () => {
  const cold = row("n55-user-cold", "SOLO_AFTERWORK").projection;
  const developing = row("n55-user-developing", "SOLO_AFTERWORK").projection;
  assert.equal(cold.taste.length, 0); assert.equal(cold.knowledgeSufficiency.finalPersonalizationSufficiency.level, "UNKNOWN");
  assert.equal(developing.knowledgeSufficiency.finalPersonalizationSufficiency.level, "PARTIAL");
  assert(developing.taste.length <= 3);
});

test("same User has semantically different moment projections", () => {
  const sets = ["FAMILY_SUNDAY", "SOLO_AFTERWORK", "FRIENDS_FRIDAY", "DATE_EVENING", "BROAD_UNKNOWN"].map((key) => new Set(north(key).projection.taste.map(({ concept, polarity }) => `${concept}:${polarity}`)));
  assert(sets.some((left, index) => sets.slice(index + 1).some((right) => left.size !== right.size || [...left].some((key) => !right.has(key)))));
  assert.equal(north("FAMILY_SUNDAY").projection.knowledgeSufficiency.finalPersonalizationSufficiency.level, "LOW");
  assert.equal(north("SOLO_AFTERWORK").projection.knowledgeSufficiency.finalPersonalizationSufficiency.level, "HIGH");
});

test("different Users remain distinct in the same Moment", () => {
  const social = row("n55-user-social", "FRIENDS_FRIDAY").projection.taste.map(({ concept }) => concept);
  const budget = row("n55-user-budget", "FRIENDS_FRIDAY").projection.taste.map(({ concept }) => concept);
  const premium = row("n55-user-premium", "FRIENDS_FRIDAY").projection.taste.map(({ concept }) => concept);
  assert(social.includes("energy.energetic")); assert(budget.includes("price.budget")); assert(premium.includes("character.design_led"));
});

test("every considered User-Card node has a deterministic selection disposition", () => {
  for (const { projection } of world.projections) {
    const audit = projection.projectionAudit;
    assert.equal(audit.fullUserCardNodeCount, audit.consideredCount);
    assert.equal(audit.consideredCount, audit.selectedCount + audit.suppressedCount);
    assert(audit.nodes.every(({ disposition, reasonCode, compatibility, relevance }) => disposition && reasonCode && compatibility && Number.isFinite(relevance)));
  }
});

test("N5.6.1 is deterministic and leaves the canonical User Card unchanged", () => {
  const replay = buildN5_6_1World();
  assert.equal(replay.worldHash, world.worldHash);
  assert.deepEqual(replay.profiles.map(({ userCard }) => userCard.userCardHash), world.profiles.map(({ userCard }) => userCard.userCardHash));
  assert.deepEqual(replay.projections.map(({ projection }) => projection.projectionHash), world.projections.map(({ projection }) => projection.projectionHash));
});

test("cross-user projection fails closed", () => {
  const card = world.profiles.find(({ user }) => user.id === "NORTH_STAR_EXPLORER_01").userCard;
  assert.throws(() => buildMomentAwareRelevantUserProjection({ userCard: card, currentMoment: row("n55-user-social", "FRIENDS_FRIDAY").currentMoment }), /cross_user/);
});

test("the historical negative-preference failure remains preserved and diagnosed", async () => {
  const result = await buildN5_6_1ValidationResult();
  assert.equal(result.negativePreferenceDiagnosis.classification, "WORLD_GROUND_TRUTH_MISMATCH");
  assert.equal(result.negativePreferenceDiagnosis.historicalN56Metric, 0.888889);
  assert.equal(result.negativePreferenceDiagnosis.historicalFrozenGate, 0.9);
  assert.equal(result.negativePreferenceDiagnosis.resultingNode.polarity, "UNKNOWN");
});

test("official N5.6.1 projection gates pass but N6 remains unauthorized", async () => {
  const result = await buildN5_6_1ValidationResult();
  assert.equal(result.scientificValidity, "PASS");
  assert(Object.values(result.gateMatrix).every(Boolean));
  assert.equal(result.humanReview, "READY");
  assert.equal(result.n6, "NOT_AUTHORIZED");
  assert.equal(result.boundaries.externalDecisionAiCalls, 0);
});

test("projection remains cheap on the complete offline population", () => {
  const profileByUser = new Map(world.profiles.map((profile) => [profile.user.id, profile]));
  const samples = [];
  for (let iteration = 0; iteration < 20; iteration += 1) for (const item of world.projections) {
    const started = performance.now();
    buildMomentAwareRelevantUserProjection({ userCard: profileByUser.get(item.userId).userCard, currentMoment: item.currentMoment, currentIntent: item.currentIntent });
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  assert(samples[Math.floor(samples.length * 0.95)] < 20);
  assert(samples.at(-1) < 100);
});
