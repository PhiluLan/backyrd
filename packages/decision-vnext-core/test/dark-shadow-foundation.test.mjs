import assert from "node:assert/strict";
import test from "node:test";
import {
  DARK_SHADOW_CONTROL, DARK_SHADOW_ENGINE_REGISTRY, DARK_SHADOW_ORACLE_CATALOG, DARK_SHADOW_RELEASE,
  DarkShadowControlSchema, DarkShadowReportSchema, FounderLabRequestSchema, PHASE3C_LAB_VERSIONS,
  createDarkShadowEnvelope, evaluateDarkShadow, replayDarkShadow, runFounderDecisionLab,
  validateDarkShadowAuthority, validateDarkShadowOracleCatalog,
} from "../dist/index.js";
import { provisionLocalDarkShadowAuthority } from "../dist/shadow-fixtures.js";
import { contentHash, withContentHash } from "../dist/canonical.js";

const sourceSha = "a".repeat(40);
const sourceTreeHash = "b".repeat(40);
const request = FounderLabRequestSchema.parse({
  contractVersion: PHASE3C_LAB_VERSIONS.request,
  requestId: "week1-shadow-request",
  ephemeralText: "Ich möchte in Zürich ruhig Kaffee trinken.",
  deviceLocation: { state: "AVAILABLE", city: "Zurich" },
  userMode: "NEUTRAL_MISSING",
  alternativeRequested: false,
  rejectedCandidateIds: [],
});
const rehash = (value, field) => {
  const body = { ...value };
  delete body[field];
  return withContentHash(body, field);
};

async function fixture() {
  const canonicalResult = await runFounderDecisionLab({ request });
  const { authority, trustAnchor } = provisionLocalDarkShadowAuthority({ sourceSha, sourceTreeHash });
  const envelope = createDarkShadowEnvelope({ executionId: "week1-shadow-execution", evaluationTime: "2026-09-16T12:00:00.000Z", authority, trustAnchor, canonicalResult });
  return { canonicalResult, authority, trustAnchor, envelope };
}

test("dark shadow defaults are permanently off and missing or relabelled activation fails closed", () => {
  assert.equal(DARK_SHADOW_CONTROL.state, "DISABLED");
  assert.equal(DARK_SHADOW_CONTROL.killSwitch, "ENGAGED");
  assert.equal(DARK_SHADOW_CONTROL.executionAuthorized, false);
  assert.equal(DARK_SHADOW_CONTROL.productRankingAuthorized, false);
  assert.throws(() => DarkShadowControlSchema.parse({}), /required field missing/);
  assert.throws(() => DarkShadowControlSchema.parse({ ...DARK_SHADOW_CONTROL, state: "ENABLED" }), /expected "DISABLED"/);
  assert.throws(() => DarkShadowControlSchema.parse({ ...DARK_SHADOW_CONTROL, executionAuthorized: true }), /expected false/);
});

test("closed founder oracle matrix binds exactly the approved Week-1 scenarios without ranking claims", () => {
  const catalog = validateDarkShadowOracleCatalog(DARK_SHADOW_ORACLE_CATALOG);
  assert.equal(catalog.scenarioIds.length, 10);
  assert.equal(new Set(catalog.scenarioIds).size, 10);
  assert.deepEqual(catalog.scenarioIds, [
    "quiet-first-date", "family-age12-with-adult", "wheelchair-confirmed-vs-unknown", "target-zurich-device-basel",
    "founder-family-outing-afternoon", "founder-bouldering-family", "context-flip", "alternative-request", "spot-not-fit", "full-replay",
  ]);
  assert.equal(catalog.oracles.every((oracle) => oracle.rankingExpectation === "NOT_CONFIGURED" && oracle.productQualityClaim === false), true);
  assert.equal(DARK_SHADOW_RELEASE.shadowActivationAuthorized, false);
  assert.equal(DARK_SHADOW_RELEASE.rankingCandidate.state, "NOT_CONFIGURED");
  assert.equal(DARK_SHADOW_RELEASE.confidenceCandidate.state, "NOT_CONFIGURED");
});

test("canonical World, User and Context bindings enter one disabled read-only envelope", async () => {
  const { canonicalResult, envelope } = await fixture();
  assert.equal(envelope.input.contextHash, canonicalResult.interpretation.interpretationHash);
  assert.equal(envelope.input.worldCohortHash, canonicalResult.worldCohort.cohortHash);
  assert.equal(envelope.input.userProjectionHash, canonicalResult.userProjectionHash);
  assert.equal(envelope.input.candidateIds.length, canonicalResult.candidates.length);
  assert.equal(envelope.engine.engineRegistryHash, DARK_SHADOW_ENGINE_REGISTRY.engineRegistryHash);
  assert.equal(envelope.visibleDecisionMutation, false);
  assert.equal(envelope.writesWorldState, false);
  assert.equal(envelope.writesUserState, false);
});

test("mirror fixture produces deterministic zero-deviation technical metrics and byte-identical replay", async () => {
  const { envelope, trustAnchor } = await fixture();
  const first = evaluateDarkShadow({ envelope, trustAnchor, measuredMilliseconds: 12.5 });
  const second = evaluateDarkShadow({ envelope, trustAnchor, measuredMilliseconds: 99.5 });
  assert.equal(first.reportHash, second.reportHash, "non-semantic latency must not change semantic identity");
  assert.equal(first.metrics.interpretationParity, "IDENTICAL");
  assert.deepEqual(first.metrics.hardConstraintDeviations, []);
  assert.deepEqual(first.metrics.candidateTierDeviations, []);
  assert.deepEqual(first.metrics.falseConfirmationCandidateIds, []);
  assert.deepEqual(first.metrics.falseExclusionCandidateIds, []);
  assert.equal(replayDarkShadow(envelope, first, trustAnchor).reportHash, first.reportHash);
});

test("false confirmations, false exclusions and tier deviations are structural metrics, never Product quality claims", async () => {
  const { canonicalResult, envelope, trustAnchor } = await fixture();
  const candidates = canonicalResult.candidates.map((candidate, index) => {
    if (index > 1) return candidate;
    const tier = index === 0 ? "ELIGIBLE_CONFIRMED" : "INELIGIBLE";
    return rehash({ ...candidate, tier }, "assessmentHash");
  });
  const shadowResult = rehash({ ...canonicalResult, candidates }, "resultHash");
  const report = evaluateDarkShadow({ envelope, trustAnchor, shadowResult });
  assert.ok(report.metrics.candidateTierDeviations.length >= 1);
  assert.equal(report.metrics.productQualityClaim, false);
  assert.equal(report.boundaries.eligibilityAuthorityCreated, false);
  assert.equal(report.boundaries.rankingAuthorityCreated, false);
});

test("tampered inner report fails replay even after every reachable outer hash is recomputed", async () => {
  const { envelope, trustAnchor } = await fixture();
  const report = evaluateDarkShadow({ envelope, trustAnchor });
  const metrics = rehash({ ...report.metrics, falseConfirmationCandidateIds: [report.shadowResult.candidates[0].candidateId] }, "metricsHash");
  const semantic = { ...report, metrics };
  delete semantic.runtime; delete semantic.reportHash;
  const forged = DarkShadowReportSchema.parse({ ...semantic, runtime: report.runtime, reportHash: contentHash(semantic) });
  assert.throws(() => replayDarkShadow(envelope, forged, trustAnchor), /dark_shadow_replay_mismatch/);
});

test("mismatched authority cannot cross the externally supplied trust boundary", async () => {
  const { authority, trustAnchor } = await fixture();
  const forged = rehash({ ...authority, authorityId: "attacker-authority" }, "authorityHash");
  assert.throws(() => validateDarkShadowAuthority(forged, trustAnchor), /dark_shadow_authority_not_trusted/);
});

test("input-binding tamper and candidate substitution fail closed", async () => {
  const { canonicalResult, envelope, trustAnchor } = await fixture();
  const changed = rehash({ ...canonicalResult, requestHash: "c".repeat(64) }, "resultHash");
  assert.throws(() => evaluateDarkShadow({ envelope, trustAnchor, shadowResult: changed }), /dark_shadow_result_input_binding_mismatch/);
  const removedCandidate = rehash({ ...canonicalResult, candidates: canonicalResult.candidates.slice(1) }, "resultHash");
  assert.throws(() => evaluateDarkShadow({ envelope, trustAnchor, shadowResult: removedCandidate }), /dark_shadow_result_input_binding_mismatch|candidate_set_mismatch/);
});

test("the public runtime index exposes validation and evaluation but no fixture provisioning helper", async () => {
  const runtime = await import("../dist/index.js");
  assert.equal("provisionLocalDarkShadowAuthority" in runtime, false);
  assert.equal(typeof runtime.evaluateDarkShadow, "function");
  assert.equal(typeof runtime.validateDarkShadowAuthority, "function");
});
