import test from "node:test";
import assert from "node:assert/strict";
import {
  DecisionExecutionEnvelopeSchema,
  SituationalContextSnapshotSchema,
  applyPhase1Eligibility,
  createSyntheticExecution,
  evaluateOpeningState,
  generateNeutralCandidatePool,
  resolveSituationalContext,
  runPhase1Decision,
  validateDecisionResultIntegrity,
  validateSituationalContext,
  withContentHash,
} from "../dist/index.js";
import { execution, request, world } from "./helpers.mjs";

const authority = (city = "Fixture Basel") => ({ decisionId: "decision-authority-test", sessionId: "session-authority-test", executedAt: "2026-01-15T12:00:00.000Z", actorSubjectBindingHash: "a".repeat(64), authorizedLocationScope: { kind: "city", city } });

test("location authority is explicit, server-bound and fail-closed", () => {
  const client = request();
  assert.equal(resolveSituationalContext(client, authority()).serverBound.locationAuthority.comparison, "MATCH");
  assert.throws(() => resolveSituationalContext(client, authority("Fixture Zurich")), /context_location_authority_mismatch/);
  assert.throws(() => resolveSituationalContext(client, { decisionId: "decision-authority-test", sessionId: "session-authority-test", executedAt: client.clientRequestedAt, authenticatedActor: { subjectBindingHash: "a".repeat(64) } }), /context_authorized_location_scope_required/);
  assert.throws(() => createSyntheticExecution({ request: client, world: world(), baseline: "baseline-a-open-distance-popularity", sourceSha: "phase1-test-source" }), /context_authorized_location_scope_required/);

  const context = resolveSituationalContext(client, authority());
  const changed = structuredClone(context);
  changed.serverBound.authorizedLocationScope.city = "Fixture Zurich";
  changed.serverBound.locationAuthority.authorizedScopeHash = withContentHash({ location: changed.serverBound.authorizedLocationScope }, "hash").hash;
  const rehashed = withContentHash(Object.fromEntries(Object.entries(changed).filter(([key]) => key !== "contextHash")), "contextHash");
  assert.throws(() => validateSituationalContext(rehashed), /context_location_authority_mismatch/);
});

test("explicit placeholders remain explicit and derived values require provenance", () => {
  const explicit = { ...request(), budget: { state: "KNOWN", namespace: "fixture.budget", values: ["fixture.value.one"] }, availableTime: { state: "KNOWN", namespace: "fixture.available-time", values: ["fixture.value.short"] }, weather: { state: "KNOWN", namespace: "fixture.weather", values: ["fixture.value.rain"] }, exploration: { state: "UNKNOWN", namespace: "fixture.exploration" } };
  const first = resolveSituationalContext(explicit, authority());
  const second = resolveSituationalContext({ ...explicit, budget: { ...explicit.budget, values: ["fixture.value.two"] } }, authority());
  assert.notEqual(first.contextHash, second.contextHash);
  assert.equal(first.explicit.weather.state, "KNOWN");
  assert.equal(first.explicit.availableTime.values[0], "fixture.value.short");
  assert.equal(first.derived.some((entry) => entry.namespace === "fixture.weather"), false);
  assert.notDeepEqual(first.explicit.exploration, resolveSituationalContext({ ...explicit, exploration: { state: "NOT_CONFIGURED", namespace: "fixture.exploration" } }, authority()).explicit.exploration);
  assert.throws(() => SituationalContextSnapshotSchema.parse({ ...first, derived: [{ namespace: "fixture.derived", state: "DERIVED", sourceHashes: [] }] }), /minimum items 1/);
});

const entry = (key, value, overrides = {}) => ({ key, scope: "SPOT", resolution: "KNOWN_VALUE", freshness: "CURRENT", trust: "VERIFIED", value, observedAt: "2026-01-01T00:00:00.000Z", validFrom: null, validUntil: null, basisClaimRefs: [`claim:${key}`], entryHash: `${key === "state.current" ? "c" : key === "hours.special" ? "b" : "a"}`.repeat(64), ...overrides });
const schedule = (day, start, end) => [{ day, intervals: [{ start, end }] }];
const openingSnapshot = ({ timeZone = "Europe/Zurich", regular, special, states = [], conflicts = [], exclusions = [] } = {}) => ({ spot: { location: { timezone: timeZone } }, operationalRules: [...(regular === undefined ? [] : [entry("hours.regular", regular)]), ...(special === undefined ? [] : [entry("hours.special", special)])], currentStates: states, conflicts, exclusions });
const policy = { version: "fixture-policy-v1", configured: true, authorizedTrustStates: ["REFERENCED", "VERIFIED"] };
const status = (snapshot, at, sourcePolicy = policy) => evaluateOpeningState(snapshot, at, sourcePolicy).status;

test("opening state uses spot-local time, DST, special precedence and overnight intervals", () => {
  assert.equal(status(openingSnapshot({ regular: schedule("WEDNESDAY", "08:00", "09:00") }), "2026-07-01T06:30:00.000Z"), "open");
  assert.equal(status(openingSnapshot({ timeZone: "UTC", regular: schedule("WEDNESDAY", "08:00", "09:00") }), "2026-07-01T06:30:00.000Z"), "closed");
  assert.equal(status(openingSnapshot({ regular: schedule("THURSDAY", "08:00", "09:00") }), "2026-01-15T07:30:00.000Z"), "open");
  assert.equal(status(openingSnapshot({ regular: schedule("MONDAY", "22:00", "02:00") }), "2026-01-13T00:30:00.000Z"), "open");
  assert.equal(status(openingSnapshot({ regular: schedule("MONDAY", "22:00", "02:00") }), "2026-01-12T22:30:00.000Z"), "open");
  assert.equal(status(openingSnapshot({ regular: schedule("THURSDAY", "09:00", "18:00"), special: [{ date: "2026-01-15", status: "CLOSED", intervals: [] }] }), "2026-01-15T12:00:00.000Z"), "closed");
  assert.equal(status(openingSnapshot({ regular: [], special: [{ date: "2026-01-15", status: "OPEN", intervals: [{ start: "12:00", end: "15:00" }] }] }), "2026-01-15T12:30:00.000Z"), "open");
});

test("opening state separates venue, kitchen, scoped states, trust and conflicts", () => {
  const venue = openingSnapshot({ regular: schedule("THURSDAY", "10:00", "23:00") });
  venue.operationalRules.push(entry("hours.kitchen", schedule("THURSDAY", "12:00", "12:30")));
  assert.equal(status(venue, "2026-01-15T12:00:00.000Z"), "open");
  assert.equal(status(openingSnapshot({ regular: schedule("THURSDAY", "10:00", "23:00"), states: [entry("state.current", { kind: "TEMPORARILY_CLOSED", scope: "SPOT" })] }), "2026-01-15T12:00:00.000Z"), "closed");
  assert.equal(status(openingSnapshot({ regular: schedule("THURSDAY", "10:00", "23:00"), states: [entry("state.current", { kind: "AREA_CLOSED", scope: "AREA:TERRACE" }, { scope: "AREA:TERRACE" })] }), "2026-01-15T12:00:00.000Z"), "open");
  assert.equal(status(openingSnapshot({ exclusions: [{ code: "EXPIRED_CURRENT_STATES", count: 1 }] }), "2026-01-15T12:00:00.000Z"), "expired");
  assert.equal(status(openingSnapshot({ regular: schedule("THURSDAY", "10:00", "23:00") }), "2026-01-15T12:00:00.000Z", { ...policy, configured: false }), "not_authorized");
  assert.equal(status(openingSnapshot({ regular: schedule("THURSDAY", "10:00", "23:00") }), "2026-01-15T12:00:00.000Z", policy), "open");
  assert.equal(status({ ...openingSnapshot({ regular: schedule("THURSDAY", "10:00", "23:00") }), operationalRules: [entry("hours.regular", schedule("THURSDAY", "10:00", "23:00"), { trust: "ASSERTED" })] }, "2026-01-15T12:00:00.000Z"), "not_authorized");
  assert.equal(status(openingSnapshot(), "2026-01-15T12:00:00.000Z"), "unknown");
  assert.equal(status(openingSnapshot({ regular: schedule("THURSDAY", "10:00", "23:00"), conflicts: [{ severity: "BLOCKING", attributeKeys: ["hours.regular"] }] }), "2026-01-15T12:00:00.000Z"), "disputed");
});

test("open-now hard constraint fails closed for every non-open status with evidence", () => {
  const synthetic = world(); const envelope = execution(undefined, synthetic); const context = resolveSituationalContext(request(), envelope);
  const original = generateNeutralCandidatePool({ world: synthetic, context, serverRequestId: envelope.serverRequestId, limit: 1 }).candidates[0];
  for (const opening of ["open", "closed", "unknown", "not_authorized", "expired", "disputed"]) {
    const evidence = original.candidate.evidence.map((item) => { if (item.signal !== "temporal.open_status") return item; const copy = { ...item, value: { kind: "open_status", value: opening } }; delete copy.evidenceHash; return withContentHash(copy, "evidenceHash"); });
    const candidateBody = { ...original.candidate, openStatus: opening, evidence }; delete candidateBody.candidateHash;
    const candidate = withContentHash(candidateBody, "candidateHash");
    const evaluated = applyPhase1Eligibility({ ...generateNeutralCandidatePool({ world: synthetic, context, serverRequestId: envelope.serverRequestId, limit: 1 }), candidates: [{ ...original, candidate }] }, context);
    const result = [...evaluated.eligible.map((value) => value.eligibility), ...evaluated.rejected][0];
    assert.equal(result.checks[2].evidenceIds.length, 1);
    assert.equal(result.checks[2].outcome, opening === "open" ? "pass" : opening === "closed" ? "fail" : "unknown");
    if (opening !== "open") assert.equal(result.eligible, false);
  }
});

const resultFixture = () => { const synthetic = world(); return runPhase1Decision({ request: request(), execution: execution(undefined, synthetic), world: synthetic, baseline: "baseline-a-open-distance-popularity", candidatePoolSize: 36, resultLimit: 3 }); };
const rehashResult = (value) => { const body = structuredClone(value); delete body.resultHash; return withContentHash(body, "resultHash"); };

test("recursive integrity rejects fully rehashed evidence, eligibility, confidence and manifest tampering", () => {
  const original = resultFixture(); validateDecisionResultIntegrity(original);

  const evidenceAttack = structuredClone(original); const candidate = evidenceAttack.candidatePool.candidates[0].candidate; const evidenceIndex = candidate.evidence.findIndex((item) => item.signal === "fixture.popularity");
  const evidenceBody = { ...candidate.evidence[evidenceIndex], value: { kind: "number", value: 0.999, unit: "normalized" } }; delete evidenceBody.evidenceHash; candidate.evidence[evidenceIndex] = withContentHash(evidenceBody, "evidenceHash");
  const candidateBody = { ...candidate }; delete candidateBody.candidateHash; evidenceAttack.candidatePool.candidates[0].candidate = withContentHash(candidateBody, "candidateHash");
  const poolBody = { ...evidenceAttack.candidatePool }; delete poolBody.candidatePoolHash; evidenceAttack.candidatePool = withContentHash(poolBody, "candidatePoolHash"); evidenceAttack.candidatePoolBinding.hash = evidenceAttack.candidatePool.candidatePoolHash;
  assert.throws(() => validateDecisionResultIntegrity(rehashResult(evidenceAttack)), /candidate_evidence_semantic_mismatch/);

  const eligibilityAttack = structuredClone(original); const stored = eligibilityAttack.eligibilityResults[0]; const checkBody = { ...stored.checks[0], outcome: stored.checks[0].outcome === "pass" ? "fail" : "pass" }; delete checkBody.proofHash; stored.checks[0] = withContentHash(checkBody, "proofHash"); const eligibilityBody = { ...stored, eligible: stored.checks.every((item) => item.outcome === "pass") }; delete eligibilityBody.resultHash; eligibilityAttack.eligibilityResults[0] = withContentHash(eligibilityBody, "resultHash");
  assert.throws(() => validateDecisionResultIntegrity(rehashResult(eligibilityAttack)), /eligibility_semantic_replay_mismatch/);

  const confidenceAttack = structuredClone(original); const confidenceBody = { ...confidenceAttack.recommendations[0].confidence, components: confidenceAttack.recommendations[0].confidence.components.map((item, index) => index === 0 ? { ...item, evaluationValue: 0.123 } : item) }; delete confidenceBody.confidenceHash; confidenceAttack.recommendations[0].confidence = withContentHash(confidenceBody, "confidenceHash"); const recommendationBody = { ...confidenceAttack.recommendations[0] }; delete recommendationBody.recommendationHash; confidenceAttack.recommendations[0] = withContentHash(recommendationBody, "recommendationHash");
  assert.throws(() => validateDecisionResultIntegrity(rehashResult(confidenceAttack)), /recommendation_confidence_replay_mismatch/);

  const manifestAttack = structuredClone(original); const manifestBody = { ...manifestAttack.engineManifest, confidenceVersion: "backyrd-vnext-confidence-future-v9" }; delete manifestBody.manifestHash; manifestAttack.engineManifest = withContentHash(manifestBody, "manifestHash");
  assert.throws(() => validateDecisionResultIntegrity(rehashResult(manifestAttack)), /engine_manifest_unsupported_version:confidenceVersion/);
});

test("recursive integrity rejects duplicate identities and recommendations outside the replayed rank", () => {
  const original = resultFixture();
  const duplicate = structuredClone(original); duplicate.candidatePool.candidates[1] = { ...duplicate.candidatePool.candidates[0], retrievalPosition: 2 }; const poolBody = { ...duplicate.candidatePool }; delete poolBody.candidatePoolHash; duplicate.candidatePool = withContentHash(poolBody, "candidatePoolHash"); duplicate.candidatePoolBinding.hash = duplicate.candidatePool.candidatePoolHash;
  assert.throws(() => validateDecisionResultIntegrity(rehashResult(duplicate)), /duplicate_candidate_spot_id/);
  const outside = structuredClone(original); const recommendationBody = { ...outside.recommendations[0], spotId: "synthetic-spot-outside-pool" }; delete recommendationBody.recommendationHash; outside.recommendations[0] = withContentHash(recommendationBody, "recommendationHash");
  assert.throws(() => validateDecisionResultIntegrity(rehashResult(outside)), /recommendation_ranking_replay_mismatch/);
});
