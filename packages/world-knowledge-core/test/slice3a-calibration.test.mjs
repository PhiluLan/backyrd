import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORITY_MATRIX, FRESHNESS_CLASS_CANDIDATES, POLICY_CALIBRATION_MATRIX,
  POLICY_CALIBRATION_STATE, RESOLUTION_CONTRACT_VERSION, SOURCE_LANDSCAPE,
  UNCONFIGURED_SOURCE_POLICY,
  createClaim, createDraftCalibrationPolicy, parseWorldKnowledgeSnapshot, simulateDraftPolicy,
} from "../dist/index.js";

test("calibration inventories every foundation area without claiming product approval", () => {
  assert.equal(POLICY_CALIBRATION_MATRIX.length, 25);
  assert.equal(new Set(POLICY_CALIBRATION_MATRIX.map((row) => row.area)).size, 25);
  assert.equal(Object.keys(FRESHNESS_CLASS_CANDIDATES).length, 25);
  assert.ok(POLICY_CALIBRATION_MATRIX.every((row) => row.status === "DRAFT_CANDIDATE"));
  assert.equal(SOURCE_LANDSCAPE.length, 13);
  assert.ok(SOURCE_LANDSCAPE.every((source) => source.verifiedAlone === false));
  assert.equal(AUTHORITY_MATRIX.find((row) => row.actor === "VERIFIED_OWNER")?.verify, false);
  assert.equal(AUTHORITY_MATRIX.find((row) => row.actor === "ADMIN")?.verify, false);
});

const observedAt = "2026-09-10T15:00:00.000Z";
const asOf = "2026-09-10T16:00:00.000Z";
const claim = (id, key, value, overrides = {}) => createClaim({
  claimId: id, attributeKey: key, scope: { spotId: "synthetic:calibration", area: "SPOT" },
  knowledgeState: value === true ? "KNOWN_TRUE" : value === false ? "KNOWN_FALSE" : value === null ? "UNKNOWN" : "KNOWN_VALUE",
  value, actorType: "ADMIN", sourceType: "ADMIN_OBSERVATION", sourceReferenceId: null,
  provenanceSessionId: "session:calibration", verificationState: "UNVERIFIED", observedAt,
  validFrom: null, validUntil: null, stance: "SUPPORTS", visibility: "INTERNAL", supersedesClaimId: null,
  ...overrides,
});

const simulate = (scenarioId, claims, policy = createDraftCalibrationPolicy("BALANCED_REFERENCE")) => simulateDraftPolicy({ scenarioId, asOf, claims, policy });

test("draft policy simulations are deterministic and cannot masquerade as production policy", () => {
  const policy = createDraftCalibrationPolicy("BALANCED_REFERENCE");
  const claims = [claim("claim:name", "identity.name", "Synthetic Calibration Spot", { sourceType: "OFFICIAL_SOURCE", sourceReferenceId: "source:official-page" })];
  const first = simulate("determinism", claims, policy); const second = simulate("determinism", claims, policy);
  assert.equal(first.resultHash, second.resultHash); assert.equal(first.state, POLICY_CALIBRATION_STATE);
  const resolution = first.resolutionHash; assert.match(resolution, /^[a-f0-9]{64}$/);
  assert.throws(() => parseWorldKnowledgeSnapshot({}), /required field missing/);
  assert.notEqual(policy.policyVersion, UNCONFIGURED_SOURCE_POLICY.policyVersion);
});

test("owner assertion remains asserted while a bound official source may be referenced", () => {
  const owner = simulate("owner-hours", [claim("claim:owner-hours", "hours.regular", [{ day: "MONDAY", intervals: [{ start: "09:00", end: "18:00" }] }], { actorType: "VERIFIED_OWNER", sourceType: "OWNER_ASSERTION" })]);
  assert.equal(owner.sourceAssessments[0].trust, "ASSERTED");
  assert.equal(owner.sourceAssessments[0].useCaseAuthorizations.OPENING_HOURS_ELIGIBILITY, "REQUIRES_POLICY");
  const official = simulate("official-hours", [claim("claim:official-hours", "hours.regular", [{ day: "MONDAY", intervals: [{ start: "09:00", end: "18:00" }] }], { sourceType: "OFFICIAL_SOURCE", sourceReferenceId: "source:official-hours" })]);
  assert.equal(official.sourceAssessments[0].trust, "REFERENCED");
  assert.equal(official.sourceAssessments[0].useCaseAuthorizations.OPENING_HOURS_ELIGIBILITY, "AUTHORIZED");
});

test("conservative policy with no accepted verification never grants sensitive readiness", () => {
  const policy = createDraftCalibrationPolicy("CONSERVATIVE_VERIFICATION");
  const result = simulate("conservative-price", [claim("claim:price", "operation.price_range", { currency: "CHF", min: 20, max: 40 }, { sourceType: "OFFICIAL_SOURCE", sourceReferenceId: "source:menu" })], policy);
  assert.equal(result.sourceAssessments[0].trust, "REFERENCED");
  assert.equal(result.sourceAssessments[0].useCaseAuthorizations.PRICE, "REQUIRES_POLICY");
  assert.notEqual(result.readiness.find((row) => row.useCase === "PRICE")?.state, "READY");
});

test("invalid current state, AI-only research and contradictory sources fail closed", () => {
  const current = simulate("current-state-without-expiry", [claim("claim:state", "state.current", { kind: "CLOSED", scope: "SPOT" })]);
  assert.ok(current.sourceAssessments[0].reasonCodes.includes("VALID_UNTIL_REQUIRED"));
  assert.notEqual(current.readiness.find((row) => row.useCase === "OPENING_HOURS_ELIGIBILITY")?.state, "READY");
  const ai = simulate("ai-only", [claim("claim:ai", "description.highlight", "Model guess", { actorType: "SYSTEM", sourceType: "AI_INFERENCE" })]);
  assert.equal(ai.sourceAssessments[0].status, "REJECTED");
  const contradiction = simulate("official-conflict", [
    claim("claim:takeaway-yes", "operation.takeaway", true, { sourceType: "OFFICIAL_SOURCE", sourceReferenceId: "source:official-a" }),
    claim("claim:takeaway-no", "operation.takeaway", false, { sourceType: "OFFICIAL_SOURCE", sourceReferenceId: "source:official-b" }),
  ]);
  assert.ok(contradiction.conflicts.includes("OVERLAPPING_CONTRADICTORY_CLAIMS"));
});

test("commercial counterfactual has no simulation or hash path", () => {
  const claims = [claim("claim:takeaway", "operation.takeaway", true, { sourceType: "OFFICIAL_SOURCE", sourceReferenceId: "source:official" })];
  const baseline = simulate("commercial-counterfactual", claims);
  const replay = simulate("commercial-counterfactual", structuredClone(claims));
  assert.equal(baseline.resultHash, replay.resultHash);
  assert.equal(Object.hasOwn(baseline, "subscription"), false);
  assert.equal(Object.hasOwn(baseline, "payment"), false);
});

test("calibration rejects canonical/unconfigured policies and cross-spot scenarios", () => {
  assert.throws(() => simulateDraftPolicy({ scenarioId: "bad-policy", asOf, claims: [], policy: UNCONFIGURED_SOURCE_POLICY }), /only Slice 3A draft policies/);
  const policy = createDraftCalibrationPolicy("BALANCED_REFERENCE");
  const other = claim("claim:other", "identity.name", "Other", { scope: { spotId: "synthetic:other", area: "SPOT" } });
  assert.throws(() => simulateDraftPolicy({ scenarioId: "cross-spot", asOf, claims: [claim("claim:first", "identity.name", "First"), other], policy }), /one synthetic spot/);
  assert.equal(RESOLUTION_CONTRACT_VERSION, "backyrd.world-knowledge.resolution@2.0");
});
