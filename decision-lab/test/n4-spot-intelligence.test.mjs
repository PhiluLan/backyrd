import test from "node:test";
import assert from "node:assert/strict";
import {
  N4_CONTRACT_HASH, N4_EVIDENCE_CONTRACT_HASH, N4_OWNER_CONTRACT_HASH, N4_SCHEMA_HASH,
  N4_VERSIONS, OWNER_FIELD_BOUNDARY, SPOT_CONCEPT_KEYS, buildSpotIntelligence,
  ownerClaimAudit, serializeRelevantSpotIntelligence, validateSpotEvidence
} from "../src/n4-spot-intelligence.mjs";
import { buildN4ValidationResult } from "../src/n4-validation.mjs";

const NOW = "2026-08-17T12:00:00.000Z";
const row = (id, dimension, value, options = {}) => ({
  id, spotId: options.spotId ?? "spot-1", dimension, value,
  kind: options.kind ?? "INTERPRETATION", sourceFamily: options.sourceFamily ?? "community_derived",
  sourceId: options.sourceId ?? id, independentSubject: options.subject ?? id,
  observedAt: options.observedAt ?? "2026-08-10T12:00:00.000Z", context: options.context,
  ownerId: options.ownerId, ownerTier: options.ownerTier, ownerVerified: options.ownerVerified,
  model: options.model, sourceInputHash: options.sourceInputHash
});
const facts = (spotId = "spot-1", city = "Basel") => [
  row("category", "category", "bar", { spotId, kind: "FACT", sourceFamily: "canonical_spot_data" }),
  row("place", "place_type", "bar", { spotId, kind: "FACT", sourceFamily: "canonical_spot_data" }),
  row("city", "city", city, { spotId, kind: "FACT", sourceFamily: "canonical_spot_data" })
];

test("N4 contracts are independently versioned and deterministically hashed", () => {
  assert.equal(Object.keys(N4_VERSIONS).length, 9);
  assert.equal(SPOT_CONCEPT_KEYS.length, 52);
  for (const hash of [N4_CONTRACT_HASH, N4_SCHEMA_HASH, N4_EVIDENCE_CONTRACT_HASH, N4_OWNER_CONTRACT_HASH]) assert.match(hash, /^[a-f0-9]{64}$/);
});

test("facts, interpretations and UNKNOWN remain distinct", () => {
  const profile = buildSpotIntelligence([...facts(), row("cozy", "vibe.cozy", 0.9)], { spotId: "spot-1", asOf: NOW });
  assert.equal(profile.facts.city.value, "Basel");
  assert.ok(profile.concepts["vibe.cozy"].value > 0);
  assert.ok(profile.unknownConcepts.includes("vibe.lively"));
  assert.equal(Object.hasOwn(profile.facts, "vibe.cozy"), false);
});

test("Owner Premium unlocks evidence fields but never a Decision feature", () => {
  assert.throws(() => validateSpotEvidence(row("free", "vibe.cozy", 1, { sourceFamily: "owner_provided", ownerId: "owner", ownerTier: "FREE" }), { asOf: NOW }), /entitled/);
  const claim = ownerClaimAudit(row("premium", "vibe.cozy", 1, { sourceFamily: "owner_provided", ownerId: "owner", ownerTier: "PREMIUM" }));
  assert.equal(claim.status, "PENDING_EVIDENCE");
  assert.ok(OWNER_FIELD_BOUNDARY.prohibitedDecisionFeatures.includes("ranking_bonus"));
});

test("independent community and Outcome evidence can outweigh an Owner claim", () => {
  const profile = buildSpotIntelligence([...facts(),
    row("owner", "social_style.family_friendly", 1, { sourceFamily: "owner_provided", ownerId: "owner", ownerTier: "PREMIUM" }),
    row("community", "social_style.family_friendly", -1),
    row("outcome", "social_style.family_friendly", -0.9, { sourceFamily: "outcome_derived" })
  ], { spotId: "spot-1", asOf: NOW });
  assert.ok(profile.concepts["social_style.family_friendly"].value < 0);
  assert.equal(Object.hasOwn(profile, "ownerTier"), false);
});

test("same-subject flooding is not independent confidence", () => {
  const repeated = buildSpotIntelligence([...facts(), ...[1, 2, 3, 4].map((n) => row(`r${n}`, "vibe.cozy", 1, { subject: "same-user" }))], { spotId: "spot-1", asOf: NOW });
  const independent = buildSpotIntelligence([...facts(), ...[1, 2, 3, 4].map((n) => row(`i${n}`, "vibe.cozy", 1, { subject: `user-${n}` }))], { spotId: "spot-1", asOf: NOW });
  assert.ok(independent.concepts["vibe.cozy"].confidence > repeated.concepts["vibe.cozy"].confidence);
});

test("contradictory claims remain observable and confidence-bounded", () => {
  const profile = buildSpotIntelligence([...facts(), row("quiet", "vibe.quiet", 1), row("lively", "vibe.lively", 1)], { spotId: "spot-1", asOf: NOW });
  assert.ok(profile.contradictions.some(({ type }) => type === "INCOMPATIBLE_CLAIMS"));
  assert.ok(profile.concepts["vibe.quiet"].confidence < 0.25);
});

test("context adjustments do not create parallel Spot profiles", () => {
  const rows = [...facts(), row("early", "social_style.conversation_friendly", 0.9, { context: { time: "evening" } }), row("late", "vibe.lively", 0.9, { context: { time: "night" } })];
  const early = buildSpotIntelligence(rows, { spotId: "spot-1", asOf: NOW, context: { time: "evening" } });
  const late = buildSpotIntelligence(rows, { spotId: "spot-1", asOf: NOW, context: { time: "night" } });
  assert.ok(early.concepts["social_style.conversation_friendly"]);
  assert.equal(early.concepts["vibe.lively"], undefined);
  assert.ok(late.concepts["vibe.lively"]);
});

test("stale evidence decays to UNKNOWN", () => {
  const profile = buildSpotIntelligence([...facts(), row("old", "vibe.cozy", 1, { observedAt: "2020-01-01T00:00:00.000Z" })], { spotId: "spot-1", asOf: NOW });
  assert.equal(profile.concepts["vibe.cozy"].state, "UNKNOWN");
});

test("AI-derived evidence requires reconstructable provenance", () => {
  assert.throws(() => validateSpotEvidence(row("ai", "vibe.cozy", 1, { sourceFamily: "ai_derived" }), { asOf: NOW }), /provenance/);
  assert.doesNotThrow(() => validateSpotEvidence(row("ai-ok", "vibe.cozy", 1, { sourceFamily: "ai_derived", model: { name: "fixture", version: "1" }, sourceInputHash: "a".repeat(64) }), { asOf: NOW }));
});

test("forbidden truth, payment and ranking features fail closed", () => {
  assert.throws(() => validateSpotEvidence({ ...row("bad", "vibe.cozy", 1), ranking_bonus: 1 }, { asOf: NOW }), /forbidden/);
  assert.throws(() => validateSpotEvidence({ ...row("bad2", "vibe.cozy", 1), latentTruth: true }, { asOf: NOW }), /forbidden/);
});

test("idempotent replay is stable while conflicts and cross-Spot input fail", () => {
  const input = [...facts(), row("cozy", "vibe.cozy", 0.9)];
  const replay = buildSpotIntelligence([...input, structuredClone(input[3])], { spotId: "spot-1", asOf: NOW });
  assert.equal(replay.evidenceCount, 4);
  assert.throws(() => buildSpotIntelligence([...input, { ...row("cozy", "vibe.cozy", -0.9) }], { spotId: "spot-1", asOf: NOW }), /conflict/);
  assert.throws(() => buildSpotIntelligence([row("other", "vibe.cozy", 1, { spotId: "spot-2" })], { spotId: "spot-1", asOf: NOW }), /cross_spot/);
});

test("N6 serialization is compact, private and payment-neutral", () => {
  const profile = buildSpotIntelligence([...facts(), row("owner", "vibe.cozy", 0.9, { sourceFamily: "owner_provided", ownerId: "private-owner", ownerTier: "PREMIUM" })], { spotId: "spot-1", asOf: NOW });
  const compact = serializeRelevantSpotIntelligence(profile);
  assert.equal(compact.version, N4_VERSIONS.serialization);
  assert.doesNotMatch(JSON.stringify(compact), /private-owner|ownerTier|payment|premium/i);
  assert.equal(Object.hasOwn(compact, "completeness"), false);
});

test("profiles are immutable and deterministic", () => {
  const input = [...facts(), row("cozy", "vibe.cozy", 0.9)];
  const first = buildSpotIntelligence(input, { spotId: "spot-1", asOf: NOW });
  const second = buildSpotIntelligence(structuredClone(input), { spotId: "spot-1", asOf: NOW });
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.concepts["vibe.cozy"]), true);
});

test("prospectively frozen N4 validation passes every mandatory arm", async () => {
  const result = await buildN4ValidationResult({ includePerformance: false });
  assert.equal(result.scenarioCount, 30);
  assert.deepEqual(result.scenarioFailures, []);
  assert.equal(result.allMandatoryGatesPass, true, JSON.stringify(result.gateMatrix));
  assert.equal(result.scientificValidity, "PASS");
});
