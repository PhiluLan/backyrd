import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  ACCEPTED_SOURCE_POLICY, WORLD_KNOWLEDGE_PORT_VERSION, buildWorldKnowledgeSnapshot,
  createWorldDarkReader, parseBuildWorldKnowledgeInput, resolutionRequest, resolveWorldKnowledge,
} from "@backyrd/world-knowledge-core";
import {
  FounderLabRequestSchema, PHASE3C_LAB_VERSIONS, SyntheticUserProjectionReader,
  contentHash, withContentHash,
  INTERNAL_DARK_ALLOWLIST, INTERNAL_DARK_CONTROL, INTERNAL_DARK_RELEASE,
  InternalDarkPostDeployEvidenceSchema,
  createInternalDarkPostDeployEvidence, handleInternalDarkShadowRequest,
  validateInternalDarkEnvelope, validateInternalDarkReport,
} from "../dist/index.js";
import {
  createLocalInternalDarkController, enableLocalInternalDarkTestOn,
  provisionLocalInternalDarkEnvelope, replayLocalInternalDarkShadow,
  runLocalInternalDarkShadow,
} from "../dist/internal-dark-shadow-fixtures.js";
import {
  createLocalSyntheticDarkRequestManifest, provisionLocalDarkRequestAuthority,
  runLocalDarkRequestRehearsal,
} from "../dist/dark-request-fixtures.js";

const sourceSha = "a".repeat(40); const sourceTreeHash = "b".repeat(40);
const userProjectionPort = new SyntheticUserProjectionReader("MISSING_SNAPSHOT");
const resolution = resolveWorldKnowledge({ ...resolutionRequest([]), sourcePolicy: ACCEPTED_SOURCE_POLICY }, [ACCEPTED_SOURCE_POLICY]);
const canonicalSnapshots = Array.from({ length: 8 }, (_, index) => buildWorldKnowledgeSnapshot(parseBuildWorldKnowledgeInput({ contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, spotId: `week3-spot-${String(index + 1).padStart(2, "0")}`, resolution }, [ACCEPTED_SOURCE_POLICY]), [ACCEPTED_SOURCE_POLICY]));
const manifest = createLocalSyntheticDarkRequestManifest({ cohortId: "week3-internal-dark-shadow", frozenAt: "2026-01-15T12:00:00.000Z", snapshots: canonicalSnapshots });
const snapshots = new Map(canonicalSnapshots.map((snapshot) => [snapshot.spot.spotId, snapshot]));
const canonicalReader = { contractVersion: "backyrd.world-knowledge.reader-port@1.0", async readSnapshot({ spotId }) { const snapshot = snapshots.get(spotId); if (!snapshot) throw new Error("snapshot_not_found"); return snapshot; } };
const createDarkReader = (environment = "PROD_LIKE_TEST") => createWorldDarkReader({ configuration: { WORLD_PRODUCT_READ: "true", WORLD_PRODUCT_READ_KILL_SWITCH: "DISENGAGED", WORLD_PRODUCT_READ_ENVIRONMENT: environment }, loadSnapshot: async ({ spotId }) => snapshots.get(spotId) });
const requestFor = (requestId, ephemeralText, deviceCity = "Zurich", extra = {}) => FounderLabRequestSchema.parse({ contractVersion: PHASE3C_LAB_VERSIONS.request, requestId, ephemeralText, deviceLocation: { state: "AVAILABLE", city: deviceCity }, userMode: "NEUTRAL_MISSING", alternativeRequested: false, rejectedCandidateIds: [], ...extra });
const rehash = (value, field) => { const body = structuredClone(value); delete body[field]; return withContentHash(body, field); };

async function setup(request = requestFor("week3-base", "Ich möchte in Zürich ruhig Kaffee trinken."), city = "Zurich", environment = "PROD_LIKE_TEST") {
  const darkReader = createDarkReader(environment); const referenceAuthority = provisionLocalDarkRequestAuthority({ request, city, manifest, sourceSha, sourceTreeHash });
  const referenceReport = await runLocalDarkRequestRehearsal({ request, ...referenceAuthority, worldReader: canonicalReader, manifest, userProjectionPort });
  const reference = { report: referenceReport, ...referenceAuthority };
  const provisioned = provisionLocalInternalDarkEnvelope({ request, city, environment: environment === "LOCAL_TEST" ? "LOCAL_SYNTHETIC" : "PROD_LIKE_TEST", manifest, worldDarkReader: darkReader, reference, sourceSha, sourceTreeHash });
  return { request, darkReader, reference, ...provisioned };
}

async function execute(prepared, hooks = {}) {
  const controller = createLocalInternalDarkController(); enableLocalInternalDarkTestOn(controller);
  return runLocalInternalDarkShadow({ ...prepared, manifest, worldDarkReader: prepared.darkReader, userProjectionPort, controller, ...hooks });
}

test("public default remains OFF and an activation attempt performs zero reads, evaluation, writes, network or output", async () => {
  let calls = 0; const exploding = new Proxy({}, { get() { calls += 1; throw new Error("dependency_must_not_be_read"); } });
  const receipt = await handleInternalDarkShadowRequest({ userId: "attacker" }, { requestedMode: "TEST_ON", worldReader: exploding, userProjectionPort: exploding });
  assert.equal(calls, 0); assert.equal(receipt.status, "DISABLED"); assert.equal(receipt.reason, "ACTIVATION_NOT_AUTHORIZED");
  assert.deepEqual(receipt.counters, { worldReads: 0, userReads: 0, evaluations: 0, persistenceWrites: 0, networkCalls: 0, productOutputs: 0, mutations: 0 });
  assert.equal(INTERNAL_DARK_CONTROL.enabled, false); assert.equal(INTERNAL_DARK_CONTROL.sampleRateBasisPoints, 0); assert.equal(INTERNAL_DARK_CONTROL.killSwitch, "ENGAGED");
  for (const key of ["executionAuthorized", "persistenceAuthorized", "networkAuthorized", "productOutputAuthorized", "rankingAuthorized", "eligibilityAuthorized", "confidenceAuthorized", "learningAuthorized", "mutationAuthorized"]) assert.equal(INTERNAL_DARK_CONTROL[key], false);
});

test("Test-ON is local-only, reads the exact bound World set and one minimized User projection, then discards the result", async () => {
  const prepared = await setup(); const report = await execute(prepared);
  assert.equal(report.counters.worldReads, manifest.spots.length); assert.equal(report.counters.userReads, 1); assert.equal(report.counters.evaluations, 1);
  assert.equal(report.counters.persistenceWrites, 0); assert.equal(report.counters.networkCalls, 0); assert.equal(report.counters.productOutputs, 0); assert.equal(report.counters.mutations, 0);
  assert.equal(report.boundaries.resultDiscarded, true); assert.equal(report.boundaries.persisted, false); assert.equal(report.boundaries.clientResponseProduced, false);
  assert.equal(report.metrics.classification, "TECHNICAL_PARITY_ONLY"); assert.equal(report.metrics.productQualityClaim, false); assert.equal(report.metrics.latencyIncludedInSemanticIdentity, false);
  assert.equal(report.metrics.interpretationParity, "IDENTICAL"); assert.equal(report.metrics.hardConstraintDeviationCount, 0); assert.equal(report.metrics.candidateTierDeviationCount, 0);
});

test("allowlist, purpose, environment, source, World and User bindings fail before dependency reads even after outer rehash", async () => {
  const prepared = await setup(); const mutations = [
    ["subject", (e) => ({ ...e, actor: { ...e.actor, subjectBindingHash: "0".repeat(64) } }), /allowlist_mismatch/],
    ["purpose", (e) => ({ ...e, purpose: "WRONG_PURPOSE" }), /expected .*INTERNAL_DECISION_DARK_EVALUATION|allowlist_mismatch/],
    ["environment", (e) => ({ ...e, environment: "PRODUCTION" }), /expected .*LOCAL_SYNTHETIC|allowlist_mismatch/],
    ["source", (e) => ({ ...e, source: { ...e.source, sourceSha: "0".repeat(40) } }), /artifact_identity_mismatch|artifact_not_trusted/],
    ["world", (e) => ({ ...e, world: { ...e.world, registryHash: "0".repeat(64) } }), /world_release_mismatch/],
    ["user", (e) => ({ ...e, user: { ...e.user, projectionReleaseHash: "0".repeat(64) } }), /user_release_mismatch/],
  ];
  for (const [, mutate, pattern] of mutations) {
    const forgedEnvelope = rehash(mutate(structuredClone(prepared.envelope)), "envelopeHash");
    const forgedTrust = rehash({ ...prepared.artifactTrust, acceptedEnvelopeHash: forgedEnvelope.envelopeHash, acceptedSourceSha: forgedEnvelope.source.sourceSha, acceptedArtifactHash: forgedEnvelope.source.artifactHash }, "trustHash");
    assert.throws(() => validateInternalDarkEnvelope(forgedEnvelope, forgedTrust), pattern);
  }
});

test("client input cannot declare server authority, release, policy, output or unknown privileged fields", () => {
  const request = requestFor("week3-client", "Kaffee in Zürich");
  for (const field of ["userId", "purpose", "environment", "worldRelease", "userProjection", "candidateSet", "eligibilityPolicy", "rankingPolicy", "confidence", "productOutput"]) assert.throws(() => FounderLabRequestSchema.parse({ ...request, [field]: "attacker" }), /unknown field/);
});

test("recursive report integrity and replay reject fully rehashed inner semantics and cross-request reuse", async () => {
  const prepared = await setup(); const report = await execute(prepared);
  const forgedSummary = rehash({ ...report.candidateSummaries[0], tier: "ELIGIBLE_CONFIRMED" }, "summaryHash");
  const forged = rehash({ ...report, candidateSummaries: [forgedSummary, ...report.candidateSummaries.slice(1)] }, "reportHash");
  await assert.rejects(() => replayLocalInternalDarkShadow({ ...prepared, manifest, worldDarkReader: prepared.darkReader, userProjectionPort, controller: (() => { const value = createLocalInternalDarkController(); enableLocalInternalDarkTestOn(value); return value; })() }, forged), /internal_dark_replay_mismatch/);
  const other = await setup(requestFor("week3-other", "Lebhaft etwas trinken in Zürich mit Freunden."));
  assert.throws(() => validateInternalDarkReport(report, other.envelope, other.artifactTrust), /report_envelope_mismatch/);
});

test("OFF to Test-ON to emergency-OFF aborts an in-flight request without evaluation or state/output leakage", async () => {
  const prepared = await setup(); const controller = createLocalInternalDarkController();
  await assert.rejects(() => runLocalInternalDarkShadow({ ...prepared, manifest, worldDarkReader: prepared.darkReader, userProjectionPort, controller }), /test_on_not_authorized/);
  enableLocalInternalDarkTestOn(controller);
  const aborted = await runLocalInternalDarkShadow({ ...prepared, manifest, worldDarkReader: prepared.darkReader, userProjectionPort, controller, onWorldRead(count) { if (count === 1) controller.emergencyOff(); } });
  assert.equal(aborted.status, "ABORTED_EMERGENCY_OFF"); assert.equal(aborted.counters.worldReads, 1); assert.ok(aborted.counters.userReads <= 1); assert.equal(aborted.counters.evaluations, 0);
  assert.equal(aborted.counters.persistenceWrites, 0); assert.equal(aborted.counters.networkCalls, 0); assert.equal(aborted.counters.productOutputs, 0); assert.equal(aborted.counters.mutations, 0); assert.equal(aborted.stateLeakDetected, false);
  assert.throws(() => enableLocalInternalDarkTestOn(controller), /not_authorized/);
});

test("Founder A-D and degradation scenarios retain zero Product authority; alternative and reject create no learning or negative World claim", async () => {
  const cases = [
    ["a", "Ich suche nächste Woche in Zürich ein ruhiges Restaurant für ein erstes Date, höchstens 40 CHF pro Person."],
    ["b", "Ich suche nächste Woche in Zürich einen Ort für ein Familienessen für mich und meine zwölfjährige Tochter."],
    ["c", "Ich möchte in Zürich gemütlich Kaffee trinken und brauche einen rollstuhlgerechten Zugang."],
    ["d", "Ich bin in Basel und suche für nächste Woche ein Restaurant in Zürich.", "Basel"],
    ["family", "Familienausflug am Nachmittag in Zürich mit 12-jährigem Kind und Erwachsenen"],
    ["boulder", "Bouldern mit Familie am Nachmittag in Zürich"],
    ["flip", "Lebhaft etwas trinken in Zürich mit Freunden"],
    ["alternative", "Ruhiges Café in Zürich", "Zurich", { alternativeRequested: true }],
    ["reject", "Ruhiges Café in Zürich", "Zurich", { rejectedCandidateIds: [manifest.spots[0].spotId] }],
    ["unknown", "Rollstuhlgerechtes Café in Zürich"],
    ["disputed", "Umstrittenes Café in Zürich"],
    ["notconfigured", "Flirrblaues Erlebnis in Zürich"],
    ["closed", "Jetzt geöffnetes Café in Zürich"],
  ];
  for (const [id, text, deviceCity = "Zurich", extra = {}] of cases) {
    const prepared = await setup(requestFor(`week3-${id}`, text, deviceCity, extra), "Zurich"); const report = await execute(prepared);
    assert.equal(report.boundaries.learningAuthorized, false); assert.equal(report.boundaries.worldMutation, false); assert.equal(report.boundaries.userMutation, false); assert.equal(report.counters.productOutputs, 0);
  }
});

test("identical semantic inputs replay byte-identically while latency remains outside identity", async () => {
  const prepared = await setup(); const first = await execute(prepared); const second = await execute(prepared);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const controller = createLocalInternalDarkController(); enableLocalInternalDarkTestOn(controller);
  const replay = await replayLocalInternalDarkShadow({ ...prepared, manifest, worldDarkReader: prepared.darkReader, userProjectionPort, controller }, first);
  assert.equal(replay.reportHash, first.reportHash); assert.equal("latency" in first, false); assert.equal("duration" in first, false);
});

test("post-deploy evidence is explicitly not executed and cannot be relabeled", async () => {
  const prepared = await setup(); const report = await execute(prepared); const productionPlanHash = contentHash({ executionAuthorized: false, status: "PLAN_ONLY" });
  const evidence = createInternalDarkPostDeployEvidence({ envelope: prepared.envelope, trust: prepared.artifactTrust, report, productionPlanHash });
  assert.equal(evidence.status, "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY"); assert.equal(evidence.executionAuthorized, false); assert.equal(evidence.deploymentExecuted, false); assert.equal(evidence.migrationExecuted, false); assert.equal(evidence.shadowTrafficActivated, false);
  assert.throws(() => InternalDarkPostDeployEvidenceSchema.parse(rehash({ ...evidence, executionAuthorized: true }, "evidenceHash")), /expected false/);
});

test("fixtures and activation capability are absent from the public runtime API and no persistence/network path exists", async () => {
  const runtime = await import("../dist/index.js");
  for (const key of ["enableLocalInternalDarkTestOn", "createLocalInternalDarkController", "runLocalInternalDarkShadow", "provisionLocalInternalDarkEnvelope"]) assert.equal(key in runtime, false);
  const source = fs.readFileSync(new URL("../src/internal-dark-shadow.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\s*\(|supabase|postgres|writeFile|localStorage|publishRecommendation|service_role/i);
  assert.equal(INTERNAL_DARK_ALLOWLIST.productionAuthorized, false); assert.equal(INTERNAL_DARK_RELEASE.productionAuthorized, false); assert.equal(INTERNAL_DARK_RELEASE.productOutputAuthorized, false);
});
