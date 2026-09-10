import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPhase1Eligibility,
  authorizeReasons,
  buildPhase1Confidence,
  candidateEvidence,
  generateNeutralCandidatePool,
  rankBaselineA,
  renderAuthorizedReasons,
  resolvePhase1Context,
  validateEvidence,
  validateExplanation,
} from "../dist/index.js";
import { execution, request, world } from "./helpers.mjs";

const rankedFixture = () => {
  const syntheticWorld = world();
  const executionValue = execution(undefined, syntheticWorld);
  const context = resolvePhase1Context(request(), executionValue);
  const pool = generateNeutralCandidatePool({ world: syntheticWorld, context, serverRequestId: executionValue.serverRequestId, limit: 36 });
  const ranked = rankBaselineA(applyPhase1Eligibility(pool, context).eligible);
  const entry = ranked[0];
  if (!entry) throw new Error("fixture_has_no_eligible_candidate");
  const confidence = buildPhase1Confidence({ candidate: entry.eligibleCandidate, context, fixtureScore: entry.fixtureScore, nextFixtureScore: ranked[1]?.fixtureScore });
  return { entry, context, confidence };
};

test("every rendered reason is authorized and evidence-bound", () => {
  const { entry, confidence } = rankedFixture();
  const claims = authorizeReasons(entry.eligibleCandidate.candidate, entry.fit, confidence);
  const reasons = renderAuthorizedReasons(claims, candidateEvidence(entry.eligibleCandidate.candidate));
  assert.ok(reasons.length > 0);
  assert.ok(reasons.every((reason) => reason.evidenceIds.length > 0));
  validateExplanation(reasons, entry.eligibleCandidate.candidate);
});

test("unknown, wrong-kind and changed evidence fail closed", () => {
  const { entry } = rankedFixture();
  const candidate = entry.eligibleCandidate.candidate;
  const evidence = candidateEvidence(candidate);
  assert.throws(() => renderAuthorizedReasons([{ reasonCode: "popularity_fixture", evidenceIds: ["ev-does-not-exist"] }], evidence), /unknown_evidence_id/);
  const distance = evidence.find((item) => item.signal === "location.distance");
  assert.ok(distance);
  assert.throws(() => renderAuthorizedReasons([{ reasonCode: "popularity_fixture", evidenceIds: [distance.evidenceId] }], evidence), /evidence_kind_not_authorized/);
  const changed = { ...distance, value: { kind: "number", value: distance.value.value + 1, unit: "meters" } };
  assert.throws(() => validateEvidence(changed), /evidenceHash_mismatch/);
});

test("renderer cannot add or change a claim", () => {
  const { entry, confidence } = rankedFixture();
  const candidate = entry.eligibleCandidate.candidate;
  const reasons = renderAuthorizedReasons(authorizeReasons(candidate, entry.fit, confidence), candidateEvidence(candidate));
  assert.throws(() => validateExplanation([{ ...reasons[0], renderedText: "A newly invented claim." }], candidate), /renderer_introduced_or_changed_claim/);
});

test("absence of a popularity fit signal prevents a popularity reason", () => {
  const { entry, confidence } = rankedFixture();
  const withoutPopularity = {
    ...entry.fit,
    dimensions: entry.fit.dimensions.filter((dimension) => dimension.key !== "fixture.popularity"),
  };
  const claims = authorizeReasons(entry.eligibleCandidate.candidate, withoutPopularity, confidence);
  assert.ok(claims.every((claim) => claim.reasonCode !== "popularity_fixture"));
});

test("weak world evidence creates a structured limitation", () => {
  const syntheticWorld = world();
  const executionValue = execution(undefined, syntheticWorld);
  const context = resolvePhase1Context(request(), executionValue);
  const pool = generateNeutralCandidatePool({ world: syntheticWorld, context, serverRequestId: executionValue.serverRequestId, limit: 36 });
  const eligible = applyPhase1Eligibility(pool, context).eligible;
  const weak = eligible.find((entry) => entry.candidate.fixtureDataQuality < 0.4);
  assert.ok(weak, "fixture must contain eligible weak evidence");
  const confidence = buildPhase1Confidence({ candidate: weak, context, fixtureScore: 0.5 });
  assert.ok(confidence.limitations.some((limitation) => limitation.code === "weak-world-evidence" && limitation.evidenceIds.length > 0));
});
