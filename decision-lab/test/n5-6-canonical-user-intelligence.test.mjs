import test from "node:test";
import assert from "node:assert/strict";
import { buildN5_5Evaluation } from "../src/n5-5-longitudinal-user-world.mjs";
import { EVIDENCE_MODEL_HASH } from "../src/taste-engine.mjs";
import { N5_6_EVIDENCE_CONTRACT, buildCanonicalUserCard, buildCanonicalUserCardIncrementally, buildEvidenceChains, verifyUserCardRebuild } from "../src/n5-6-canonical-user-intelligence.mjs";
import { N5_6_PROJECTION_CONTRACT, buildSignedRelevantUserProjection } from "../src/n5-6-signed-projection.mjs";
import { buildN5_6World } from "../src/n5-6-world.mjs";
import { buildN5_6ValidationResult } from "../src/n5-6-validation.mjs";
import { buildProductLikeHistories } from "../src/n5-6-product-like-histories.mjs";

const inherited = buildN5_5Evaluation();
const northEvents = inherited.world.users.find(({ id }) => id === "NORTH_STAR_EXPLORER_01").events;
const northProjection = (key) => inherited.projections.find(({ userId, momentKey }) => userId === "NORTH_STAR_EXPLORER_01" && momentKey === key);

test("N5.6 protects frozen Wave-3B.1 weights and builds a signed evidence graph", () => {
  assert.equal(N5_6_EVIDENCE_CONTRACT.frozenWave3B1EvidenceModelHash, EVIDENCE_MODEL_HASH);
  const result = buildCanonicalUserCard(northEvents, { asOf: inherited.world.asOf });
  const hidden = result.userCard.nodes.find(({ nodeKey }) => nodeKey === "GLOBAL:global:discovery.hidden_gem");
  const mainstream = result.userCard.nodes.find(({ nodeKey }) => nodeKey === "GLOBAL:global:discovery.mainstream");
  assert.equal(hidden.polarity, "POSITIVE"); assert(hidden.affinity > 0); assert(hidden.evidenceDepth.independentSessions > 20);
  assert.equal(mainstream.polarity, "NEGATIVE"); assert(mainstream.affinity < 0); assert(mainstream.negativeEvidence > 0);
  assert(result.userCard.contradictions.length >= 1); assert(result.userCard.nodes.some(({ trend }) => trend !== "STABLE"));
});

test("one journey cannot inflate a concept through event flooding", () => {
  const original = northEvents[1];
  const flooded = Array.from({ length: 20 }, (_, index) => ({ ...original, id: `${original.id}:flood:${index}`, idempotencyKey: `${original.idempotencyKey}:flood:${index}`, provenance: { ...original.provenance, sourceEventId: `${original.id}:flood:${index}` } }));
  const chains = buildEvidenceChains(flooded, { asOf: inherited.world.asOf });
  assert.equal(chains.length, 1);
  assert.equal(chains[0].samples.filter(({ concept, scope }) => concept === original.spotEvidence.concepts[0] && scope.kind === "GLOBAL").length, 1);
});

test("replay, duplicates and out-of-order input are deterministic", () => {
  const baseline = buildCanonicalUserCard(northEvents, { asOf: inherited.world.asOf });
  const replay = buildCanonicalUserCard([...northEvents, ...northEvents], { asOf: inherited.world.asOf });
  assert.equal(replay.userCard.userCardHash, baseline.userCard.userCardHash);
  assert.equal(verifyUserCardRebuild(northEvents, { asOf: inherited.world.asOf }).pass, true);
});

test("incremental batches equal a full deterministic rebuild", () => {
  const pivot = 37;
  const incremental = buildCanonicalUserCardIncrementally([northEvents.slice(0, pivot), northEvents.slice(pivot)], { asOf: inherited.world.asOf });
  const full = buildCanonicalUserCard(northEvents, { asOf: inherited.world.asOf });
  assert.equal(incremental.userCard.userCardHash, full.userCard.userCardHash);
  assert.equal(incremental.incrementalAudit.affectedJourneyKeys, northEvents.length);
});

test("conflicting evidence is preserved instead of averaged away", () => {
  const result = buildCanonicalUserCard(northEvents, { asOf: inherited.world.asOf });
  const quiet = result.userCard.nodes.find(({ nodeKey }) => nodeKey === "GLOBAL:global:vibe.quiet");
  assert(quiet.positiveEvidence > 0); assert(quiet.negativeEvidence > 0); assert.equal(quiet.contradictions.length, 1);
  assert(result.changeLedger.some(({ nodeKey, reasonCode }) => nodeKey === quiet.nodeKey && reasonCode === "CONTRADICTION_ADDED"));
});

test("cold, developing and deep maturity depend on evidence depth", () => {
  const cold = inherited.world.users.find(({ id }) => id === "n55-user-cold");
  const developing = inherited.world.users.find(({ id }) => id === "n55-user-developing");
  assert.equal(buildCanonicalUserCard(cold.events, { asOf: inherited.world.asOf }).userCard.maturity.state, "COLD");
  assert.equal(buildCanonicalUserCard(developing.events, { asOf: inherited.world.asOf }).userCard.maturity.state, "DEVELOPING");
  assert.equal(buildCanonicalUserCard(northEvents, { asOf: inherited.world.asOf }).userCard.maturity.state, "DEEP");
});

test("signed projection respects current intent and keeps wrong-context patterns out", () => {
  const card = buildCanonicalUserCard(northEvents, { asOf: inherited.world.asOf }).userCard;
  const row = northProjection("FRIENDS_FRIDAY");
  const projection = buildSignedRelevantUserProjection({ userCard: card, currentMoment: row.currentMoment, currentIntent: { requiredPlaceTypes: ["bar"], conceptDirections: [{ concept: "vibe.lively", direction: 1 }, { concept: "vibe.quiet", direction: -1 }] } });
  assert(!projection.positiveTaste.some(({ concept }) => concept === "vibe.quiet"));
  assert(projection.suppressionAudit.some(({ concept, reasonCode }) => concept === "vibe.quiet" && reasonCode === "EXPLICIT_CURRENT_INTENT_OVERRIDE"));
  assert(projection.occasionPatterns.every(({ contextSignature }) => !contextSignature.audience || projection.applicableContexts.includes(`audience.${contextSignature.audience}`)));
});

test("projection is bounded, signed and candidate-independent", () => {
  const world = buildN5_6World();
  for (const { projection } of world.projections) {
    assert(projection.positiveTaste.length <= N5_6_PROJECTION_CONTRACT.maximum.positiveTaste);
    assert(projection.negativeTaste.length <= N5_6_PROJECTION_CONTRACT.maximum.negativeTaste);
    assert(projection.positiveTaste.every(({ affinity }) => affinity > 0));
    assert(projection.negativeTaste.every(({ affinity }) => affinity < 0));
    assert.equal(projection.boundaries.candidateIndependent, true); assert.equal(projection.boundaries.n6, "NOT_AUTHORIZED");
  }
});

test("cross-user projection and missing consent fail closed", () => {
  const card = buildCanonicalUserCard(northEvents, { asOf: inherited.world.asOf }).userCard;
  const otherMoment = inherited.projections.find(({ userId }) => userId === "n55-user-social").currentMoment;
  assert.throws(() => buildSignedRelevantUserProjection({ userCard: card, currentMoment: otherMoment }), /cross_user/);
  assert.throws(() => buildCanonicalUserCard([{ ...northEvents[1], consentState: "withdrawn" }], { asOf: inherited.world.asOf }), /consent/);
});

test("product-like journeys preserve selection, satisfaction and exposure boundaries", () => {
  const fixture = buildProductLikeHistories();
  const result = buildCanonicalUserCard(fixture.events, { asOf: inherited.world.asOf });
  assert(!result.userCard.nodes.some(({ evidenceRefs }) => evidenceRefs.some(({ eventId }) => eventId.includes("ignored-"))));
  const lively = result.userCard.nodes.find(({ nodeKey }) => nodeKey === "GLOBAL:global:vibe.lively");
  assert(lively.positiveEvidence > 0); assert(lively.negativeEvidence > 0);
  assert(result.userCard.behavioralPreferences.some(({ key }) => key === "behavior.repeat_tendency"));
  assert(result.userCard.behavioralPreferences.every(({ key }) => !key.includes("hidden_gem")));
});

test("price and distance remain descriptive without comparative opportunity evidence", () => {
  const result = buildCanonicalUserCard(northEvents, { asOf: inherited.world.asOf });
  assert(result.userCard.practicalPreferences.length > 0);
  assert(result.userCard.practicalPreferences.every(({ opportunityControlled, interpretation }) => opportunityControlled === false && interpretation === "OBSERVED_BEHAVIOR_NOT_CAUSAL_PREFERENCE"));
  assert(result.userCard.uncertainty.unavailableFamilies.includes("causal_price_sensitivity"));
  assert(result.userCard.uncertainty.unavailableFamilies.includes("causal_distance_preference"));
});

test("one negative outcome lowers affinity and repeated independent negatives strengthen the change", () => {
  const fixture = buildProductLikeHistories();
  const positive = fixture.events.find(({ eventType, spotId }) => eventType === "verified_visit" && spotId === "spot-friends");
  const negative = fixture.events.find(({ eventType }) => eventType === "negative_post_visit");
  const row = (events) => buildCanonicalUserCard(events, { asOf: inherited.world.asOf }).userCard.nodes.find(({ nodeKey }) => nodeKey === "GLOBAL:global:vibe.lively");
  const before = row([positive]); const afterOne = row([positive, negative]);
  const repeated = Array.from({ length: 4 }, (_, index) => ({ ...negative, id: `${negative.id}:repeat:${index}`, idempotencyKey: `${negative.idempotencyKey}:repeat:${index}`, decisionId: `${negative.decisionId}:repeat:${index}`, sessionId: `${negative.sessionId}:repeat:${index}`, spotId: `${negative.spotId}:repeat:${index}`, provenance: { ...negative.provenance, sourceEventId: `${negative.id}:repeat:${index}` } }));
  const afterMany = row([positive, ...repeated]);
  assert(afterOne.affinity < before.affinity); assert(afterOne.affinity > -0.1); assert(afterMany.affinity < afterOne.affinity);
});

test("unsupported spot concepts cannot create evidence", () => {
  const event = { ...northEvents[1], spotEvidence: { ...northEvents[1].spotEvidence, concepts: ["secret.unbounded_profile"] } };
  assert.throws(() => buildCanonicalUserCard([event], { asOf: inherited.world.asOf }), /unknown_spot_evidence_concept/);
});

test("identity conflicts, sensitive fields and deletion residue fail closed", () => {
  const source = northEvents[1];
  assert.throws(() => buildCanonicalUserCard([source, { ...source, eventType: source.eventType === "saved" ? "explicit_negative" : "saved" }], { asOf: inherited.world.asOf }), /identity_conflict/);
  assert.throws(() => buildCanonicalUserCard([{ ...source, trust_score: 0.9 }], { asOf: inherited.world.asOf }), /forbidden_memory_field/);
  const withEvidence = buildCanonicalUserCard([source], { asOf: inherited.world.asOf });
  assert(withEvidence.userCard.nodes.length > 0);
  assert.throws(() => buildCanonicalUserCard([], { asOf: inherited.world.asOf }), /single_user_required/);
});

test("official validation contract is complete and requires human review", async () => {
  const result = await buildN5_6ValidationResult();
  assert.equal(result.gateMatrix.negativePreferenceAccuracy, false);
  assert.equal(result.scientificValidity, "FAIL"); assert.equal(result.allMandatoryGatesPass, false);
  assert.equal(result.humanReview, "REQUIRED"); assert.equal(result.n6, "NOT_AUTHORIZED"); assert.equal(result.scientificBoundary.externalAiCalls, 0);
});
