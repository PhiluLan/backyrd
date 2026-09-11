import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildPhase3DFounderLabReport,
  canonicalJson,
  contentHash,
  createPhase3DCanonicalReleaseTrust,
  createPhase3DLocalEvidenceTrust,
  createPhase3DLocalObservation,
  createPhase3DRepositoryTrust,
  PHASE3D_CALIBRATION_CANDIDATES,
  PHASE3D_CALIBRATION_RELEASE,
  PHASE3D_CALIBRATION_TRUST_ANCHOR,
  PHASE3D_CANDIDATE_SET_HASH,
  PHASE3D_OPEN_RULES,
  PHASE3D_SCENARIO_IDS,
  PHASE3D_SCENARIO_SET_HASH,
  provePhase3DFullIncrementalParity,
  readPhase3DFounderSpots,
  verifyPhase3DCalibrationCandidates,
  verifyPhase3DFounderLabReport,
  PRODUCT_INTERPRETATION_POLICY_3C,
  PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C,
} from "../dist/index.js";

const subject = contentHash("phase3d-local-founder-user");
const context = contentHash({ dayPhase: "morning", companyType: "alone" });
const releaseTrust = createPhase3DCanonicalReleaseTrust();
const calibrationTrust = createPhase3DRepositoryTrust();

function event(recordId, eventType, overrides = {}) {
  return createPhase3DLocalObservation({ recordId, subjectBindingHash: subject, eventType, occurredAt: "2026-09-12T08:00:00.000Z", journeyId: `journey-${recordId}`, contextHash: context, contextDimensions: ["DAY_PHASE", "COMPANY_TYPE"], ...overrides });
}
function run(items, lifecycle = "ACTIVE") {
  const evidenceTrust = createPhase3DLocalEvidenceTrust(items);
  const input = lifecycle === "ACTIVE" ? { evaluationId: "phase3d-test-evaluation", subjectBindingHash: subject, lifecycle, observations: items.map(({ observation }) => observation) } : { evaluationId: "phase3d-test-evaluation", subjectBindingHash: null, lifecycle, observations: [] };
  return { report: buildPhase3DFounderLabReport(input, releaseTrust, evidenceTrust, calibrationTrust), evidenceTrust, input };
}
const search = (id, overrides = {}) => event(id, "SEARCH", { spotId: `spot-${id}`, conceptIds: ["vibe.cozy", "place_type.cafe"], worldAttribution: "CERTAIN", authorityProofs: ["AUTHENTICATED_USER_ACTION", "SERVER_MINIMIZATION_SERVICE"], ...overrides });
const positive = (id, overrides = {}) => event(id, "EXPLICIT_SATISFACTION", { spotId: `spot-${id}`, conceptIds: ["vibe.cozy"], worldAttribution: "CERTAIN", experienceConfirmed: true, satisfactionResponse: "HAS_MATCHED", authorityProofs: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"], ...overrides });
const skip = (id, overrides = {}) => event(id, "QUICK_SKIP", { spotId: "spot-skip", decisionId: "decision-skip", ...overrides });

test("candidate set exposes exactly five open rules and three non-production profiles", () => {
  assert.equal(PHASE3D_OPEN_RULES.length, 5); assert.equal(PHASE3D_CALIBRATION_CANDIDATES.length, 3);
  for (const row of PHASE3D_CALIBRATION_CANDIDATES) { assert.equal(row.authority, "CALIBRATION_ONLY"); assert.equal(row.productionAuthorized, false); assert.equal(row.rules.retention.durationsConfigured, false); }
});
test("Phase 3C policy and registry remain frozen and runtime inactive", () => { assert.equal(PRODUCT_INTERPRETATION_POLICY_3C.policyHash, "e6cecdd5107285eae1cb91b9ff29d2b4b8f2756cc3fff05bda14eb0fd6bb7be4"); assert.equal(PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.registryHash, "2b6b502d14d68edb0f060708d456c119103e1af4823d37e67d18b674be6f4f13"); assert.equal(PRODUCT_INTERPRETATION_POLICY_3C.runtimeActivated, false); });
test("external repository trust accepts the canonical candidate set", () => assert.equal(verifyPhase3DCalibrationCandidates(PHASE3D_CALIBRATION_CANDIDATES, calibrationTrust).length, 3));
test("self-created replacement trust root does not authorize rehashed candidates", () => {
  const forged = structuredClone(PHASE3D_CALIBRATION_CANDIDATES); forged[0].rules.searchContextualMaturity.independentJourneys = 1; forged[0].candidateHash = contentHash(Object.fromEntries(Object.entries(forged[0]).filter(([key]) => key !== "candidateHash")));
  const fake = { verifiedAt: calibrationTrust.verifiedAt, getRelease: () => ({ ...PHASE3D_CALIBRATION_RELEASE, candidateSetHash: contentHash(forged) }), getTrustAnchor: () => ({ ...PHASE3D_CALIBRATION_TRUST_ANCHOR, acceptedCandidateSetHash: contentHash(forged) }) };
  assert.throws(() => verifyPhase3DCalibrationCandidates(forged, fake));
});
test("production relabeling fails closed even after local rehash", () => { const forged = structuredClone(PHASE3D_CALIBRATION_CANDIDATES); forged[0].productionAuthorized = true; assert.throws(() => verifyPhase3DCalibrationCandidates(forged, calibrationTrust)); });
test("single search remains current intent under all candidates", () => { const { report } = run([search("search-1")]); assert.ok(report.candidateOutcomes.every((row) => row.searchContextualTargets.length === 0)); });
test("repeated searches compare conservative balanced and learning thresholds", () => { const items = [1,2,3].map((n) => search(`search-${n}`, { spotId: `spot-${n}` })); const { report } = run(items); assert.deepEqual(report.candidateOutcomes.map((row) => row.searchContextualTargets.length), [0, 2, 2]); });
test("technical search retries in one journey do not increase maturity", () => { const items = [1,2,3,4,5].map((n) => search(`retry-${n}`, { journeyId: "journey-one" })); const { report } = run(items); assert.ok(report.candidateOutcomes.every((row) => row.searchContextualTargets.length === 0)); });
test("different search contexts never collapse into one target", () => { const items = [search("ctx-a"), search("ctx-b", { contextHash: contentHash("evening"), contextDimensions: ["DAY_PHASE"] })]; const { report } = run(items); assert.ok(report.candidateOutcomes.every((row) => row.searchContextualTargets.length === 0)); });
test("uncertain world attribution blocks search maturity", () => { const items = [1,2,3,4,5].map((n) => search(`unknown-${n}`, { worldAttribution: "UNKNOWN" })); const { report } = run(items); assert.ok(report.candidateOutcomes.every((row) => row.searchContextualTargets.length === 0)); });
test("a negative outcome for the same concept and context withholds search promotion", () => { const negative = event("search-negative", "EXPLICIT_DISSATISFACTION", { spotId: "spot-negative", conceptIds: ["vibe.cozy"], worldAttribution: "CERTAIN", experienceConfirmed: true, satisfactionResponse: "HAS_NOT_MATCHED", authorityProofs: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"] }); const { report } = run([search("search-a"), search("search-b"), search("search-c"), negative]); assert.ok(report.candidateOutcomes.every((row) => !row.searchContextualTargets.some((target) => target.includes(contentHash(`vibe.cozy|${context}`))))); });
test("raw search text is rejected by the strict local action boundary", () => assert.throws(() => createPhase3DLocalObservation({ ...search("raw").observation, rawSearchText: "private name and location" })));
test("a single skip remains non-mature and target-bound", () => { const { report } = run([skip("skip-1")]); assert.ok(report.candidateOutcomes.every((row) => row.maturedSkipTargets.length === 0)); });
test("many skips in the same journey do not mature", () => { const items = [1,2,3,4,5,6,7,8].map((n) => skip(`skip-${n}`, { journeyId: "one-skip-journey" })); const { report } = run(items); assert.ok(report.candidateOutcomes.every((row) => row.maturedSkipTargets.length === 0)); });
test("skip maturity remains a lab comparison and never authorizes projection", () => { const items = [1,2,3,4,5,6,7,8].map((n) => skip(`independent-skip-${n}`)); const { report } = run(items); assert.ok(report.candidateOutcomes.some((row) => row.maturedSkipTargets.length > 0)); assert.ok(report.candidateOutcomes.every((row) => !row.productionProjectionAuthorized)); });
test("later positive experience blocks a matured skip target", () => { const items = [1,2,3,4,5,6,7,8].map((n) => skip(`skip-positive-${n}`)); items.push(positive("positive-after-skip", { spotId: "spot-skip" })); const { report } = run(items); assert.ok(report.candidateOutcomes.every((row) => row.maturedSkipTargets.length === 0)); });
test("alternative request creates no negative candidate output", () => { const { report } = run([event("alternative", "ALTERNATIVE_REQUESTED", { decisionId: "decision-1", contextHash: null, contextDimensions: [] })]); assert.ok(report.candidateOutcomes.every((row) => row.maturedSkipTargets.length === 0)); });
test("one positive spot never promotes concept taste", () => { const { report } = run([positive("positive-1")]); assert.ok(report.candidateOutcomes.every((row) => row.conceptTasteTargets.length === 0)); });
test("distinct certain spots expose only calibration comparisons", () => { const items = [1,2,3,4,5].map((n) => positive(`positive-${n}`, { spotId: `distinct-spot-${n}` })); const { report } = run(items); assert.deepEqual(report.candidateOutcomes.map((row) => row.conceptTasteTargets.length), [1,1,1]); assert.equal(report.rankingAuthority, false); });
test("repeated experiences at one spot do not promote a concept", () => { const items = [1,2,3,4,5].map((n) => positive(`same-${n}`, { spotId: "same-spot" })); const { report } = run(items); assert.ok(report.candidateOutcomes.every((row) => row.conceptTasteTargets.length === 0)); });
test("uncertain concept attribution never promotes concept taste", () => { const items = [1,2,3,4,5].map((n) => positive(`uncertain-${n}`, { spotId: `spot-${n}`, worldAttribution: "UNKNOWN" })); const { report } = run(items); assert.ok(report.candidateOutcomes.every((row) => row.conceptTasteTargets.length === 0)); });
test("dwell remains visible only as non-decision attention observation", () => { const item = event("dwell-1", "DWELL", { authorityProofs: ["CLIENT_OBSERVATION", "SERVER_MINIMIZATION_SERVICE"], contextHash: null, contextDimensions: [] }); const { report } = run([item]); assert.ok(report.primaryView.some(({ section }) => section === "NICHT_FUER_DECISION_FREIGEGEBEN")); assert.ok(report.candidateOutcomes.every((row) => !row.searchContextualTargets.length && !row.conceptTasteTargets.length)); });
test("no-consent withdrawal reset and erasure reports contain no subject or source state", () => { for (const lifecycle of ["NO_CONSENT", "WITHDRAWN", "RESET", "ERASED"]) { const { report } = run([], lifecycle); assert.equal(report.subjectBindingHash, null); assert.equal(report.sourceStateHash, null); assert.equal(report.expert.observationHashes.length, 0); } });
test("commercial fields are rejected instead of influencing lab output", () => assert.throws(() => createPhase3DLocalObservation({ recordId: "commercial", subjectBindingHash: subject, eventType: "SAVED", occurredAt: "2026-09-12T08:00:00.000Z", ownerTier: "premium" })));
test("full and genuine incremental reducers are byte-identical", () => { const items = [search("parity-search"), positive("parity-positive")]; const evidenceTrust = createPhase3DLocalEvidenceTrust(items); const input = { evaluationId: "phase3d-parity", subjectBindingHash: subject, lifecycle: "ACTIVE", observations: items.map(({ observation }) => observation) }; const proof = provePhase3DFullIncrementalParity(input, 1, releaseTrust, evidenceTrust); assert.equal(proof.byteIdentical, true); assert.equal(canonicalJson(proof.full), canonicalJson(proof.incremental)); });
test("report replay is byte-identical and recursively verified", () => { const result = run([search("replay-1"), positive("replay-2")]); const replay = buildPhase3DFounderLabReport(result.input, releaseTrust, result.evidenceTrust, calibrationTrust); assert.equal(canonicalJson(replay), canonicalJson(result.report)); assert.equal(verifyPhase3DFounderLabReport(result.report, result.input, releaseTrust, result.evidenceTrust, calibrationTrust).reportHash, result.report.reportHash); });
test("inner report manipulation fails after complete outer rehash", () => { const result = run([search("tamper")]); const forged = structuredClone(result.report); forged.candidateOutcomes[0].searchContextualTargets.push("contextual-search:forged"); forged.candidateOutcomes[0].outcomeHash = contentHash(Object.fromEntries(Object.entries(forged.candidateOutcomes[0]).filter(([key]) => key !== "outcomeHash"))); forged.reportHash = contentHash(Object.fromEntries(Object.entries(forged).filter(([key]) => key !== "reportHash"))); assert.throws(() => verifyPhase3DFounderLabReport(forged, result.input, releaseTrust, result.evidenceTrust, calibrationTrust)); });
test("scenario catalog covers every required search skip concept lifecycle and integrity family", () => { assert.equal(PHASE3D_SCENARIO_IDS.length, 35); assert.match(PHASE3D_SCENARIO_SET_HASH, /^[a-f0-9]{64}$/); for (const prefix of ["search-", "skip-", "concept-"]) assert.ok(PHASE3D_SCENARIO_IDS.some((id) => id.startsWith(prefix))); });
test("checked-in scenario matrix and release summary bind canonical identities", () => { const matrix = JSON.parse(fs.readFileSync(new URL("../../../docs/user-intelligence-vnext/phase3d/PHASE3D_SCENARIO_MATRIX.json", import.meta.url), "utf8")); const ids = Object.values(matrix.families).flat(); assert.deepEqual([...ids].sort(), [...PHASE3D_SCENARIO_IDS].sort()); const summary = JSON.parse(fs.readFileSync(new URL("../../../docs/user-intelligence-vnext/phase3d/phase3d-release-summary.json", import.meta.url), "utf8")); assert.equal(summary.scenarioSetHash, PHASE3D_SCENARIO_SET_HASH); assert.equal(summary.candidateSetHash, PHASE3D_CANDIDATE_SET_HASH); assert.equal(summary.productionPlan.executionAuthorized, false); });
test("synthetic fallback spots require no production or unmerged cohort", async () => { const spots = await readPhase3DFounderSpots(null, null); assert.equal(spots.length, 3); assert.ok(spots.every(({ source, uncertaintyVisible }) => source === "SYNTHETIC_FIXTURE" && uncertaintyVisible)); });
test("cohort manifests cannot bypass the canonical reader port", async () => { const body = { contractVersion: "backyrd.user-intelligence.world-cohort-consumer@3d-1", manifestId: "cohort-1", authority: "EXPLICIT_FOUNDER_COHORT", spotIds: ["spot-1"], registryVersion: "world-registry", registryHash: contentHash("registry"), productionAuthorized: false }; const manifest = { ...body, manifestHash: contentHash(body) }; await assert.rejects(() => readPhase3DFounderSpots(null, manifest)); });
