import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_VERSIONS, PHASE2_ENGINE_IDS, SYNTHETIC_WORLD_SOURCE_POLICY, SyntheticPhase2UserProjectionPort,
  SyntheticWorldKnowledgeReader, canonicalJson, contentHash, generateSyntheticWorld, replayPhase2Evaluation,
  runPhase2Evaluation, validatePhase2EvaluationIntegrity, validatePhase2ExecutionEnvelope,
} from "../dist/index.js";

const config = Object.freeze({ configVersion: "backyrd-vnext-sandbox-config-v1", worldVersion: "backyrd-vnext-synthetic-world-phase2-test-v1", seed: 2202, observedAt: "2026-01-15T12:00:00.000Z", spotCount: 48, userCount: 12, cities: ["Fixture Zurich", "Fixture Basel", "Fixture Bern"], candidatePoolSize: 48 });
const sourceSha = "983cd7b3a3c11dd3e549c256850749b07b52eadf";
const request = (overrides = {}) => ({ contractVersion: CONTRACT_VERSIONS.decisionRequest, idempotencyKey: "phase2-test-request", clientRequestedAt: config.observedAt, location: { kind: "city", city: "Fixture Zurich" }, intentKeys: ["fixture.intent.eat"], moodKeys: ["fixture.mood.calm"], budget: { state: "KNOWN", namespace: "fixture.context.budget", values: ["fixture.budget.flexible"] }, availableTime: { state: "KNOWN", namespace: "fixture.context.available-time", values: ["fixture.time.90-minutes"] }, weather: { state: "NOT_CONFIGURED", namespace: "fixture.context.weather" }, exploration: { state: "UNKNOWN", namespace: "fixture.context.exploration" }, shownCandidateIds: [], rejectedCandidateIds: [], hardConstraints: [{ kind: "open_now", value: true }], softPreferences: [], client: { surface: "synthetic", version: "phase2-test-v1" }, ...overrides });
const authority = (overrides = {}) => ({ decisionId: "phase2-decision-test", serverRequestId: "phase2-server-test", sessionId: "phase2-session-test", serverTime: config.observedAt, idempotencyIdentity: "phase2-server-idempotency", authorizedLocationScope: { kind: "city", city: "Fixture Zurich" }, actor: { kind: "AUTHENTICATED_USER", userId: "syn-user-0001", subjectBindingHash: contentHash("phase2-subject"), authenticationContextHash: contentHash("phase2-auth") }, userSnapshot: { snapshotId: "phase2-snapshot", snapshotHash: contentHash("phase2-snapshot") }, ...overrides });

const execute = async (overrides = {}) => {
  const world = overrides.world ?? generateSyntheticWorld(config);
  return runPhase2Evaluation({ scenarioId: overrides.scenarioId ?? "phase2-integration", seed: overrides.seed ?? config.seed, sourceSha, request: overrides.request ?? request(), authority: overrides.authority ?? authority(), world, worldReader: overrides.worldReader ?? new SyntheticWorldKnowledgeReader(world), acceptedWorldSourcePolicy: overrides.acceptedWorldSourcePolicy ?? SYNTHETIC_WORLD_SOURCE_POLICY, userProjectionPort: "userProjectionPort" in overrides ? overrides.userProjectionPort : new SyntheticPhase2UserProjectionPort("ACTIVE", "syn-spot-0013"), candidatePoolSize: overrides.candidatePoolSize ?? 48 });
};

test("canonical envelope binds server authority, accepted world policy, minimized user projection and one neutral pool", async () => {
  const { envelope, report } = await execute();
  validatePhase2ExecutionEnvelope(envelope); validatePhase2EvaluationIntegrity(envelope, report);
  assert.equal(envelope.request.location.city, envelope.authorizedLocationScope.city);
  assert.equal(envelope.context.serverBound.locationAuthority.comparison, "MATCH");
  assert.equal(envelope.world.sourcePolicyHash, SYNTHETIC_WORLD_SOURCE_POLICY.policyHash);
  assert.equal(envelope.userProjectionValue.projection.boundaries.rawEventsIncluded, false);
  assert.equal(envelope.userProjectionValue.projection.boundaries.eligibilityAuthority, false);
  assert.equal(envelope.writesUserState, false);
  assert.deepEqual(report.engineResults.map((entry) => entry.engineId), PHASE2_ENGINE_IDS);
  assert.ok(report.engineResults.every((entry) => entry.candidatePoolHash === report.candidatePoolHash));
});

test("client cannot provide authority and location mismatch or missing authority fail closed", async () => {
  await assert.rejects(execute({ request: request({ userId: "attacker" }) }), /unknown field/);
  await assert.rejects(execute({ authority: authority({ authorizedLocationScope: { kind: "city", city: "Fixture Basel" } }) }), /LOCATION_AUTHORITY_MISMATCH/);
  const missing = authority(); delete missing.authorizedLocationScope;
  await assert.rejects(execute({ authority: missing }), /LOCATION_AUTHORITY_MISSING/);
});

test("unaccepted source policy and missing or corrupt world snapshots stop fail closed", async () => {
  await assert.rejects(execute({ acceptedWorldSourcePolicy: { policyVersion: SYNTHETIC_WORLD_SOURCE_POLICY.policyVersion, policyHash: "0".repeat(64) } }), /SOURCE_POLICY_NOT_ACCEPTED/);
  const world = generateSyntheticWorld(config);
  const missing = { contractVersion: "backyrd.world-knowledge.reader-port@1.0", readSnapshot: async () => { throw new Error("missing"); } };
  await assert.rejects(execute({ world, worldReader: missing }), /WORLD_SNAPSHOT_MISSING/);
  const corrupt = { contractVersion: "backyrd.world-knowledge.reader-port@1.0", readSnapshot: async (input) => ({ ...(await new SyntheticWorldKnowledgeReader(world).readSnapshot(input)), registryHash: "0".repeat(64) }) };
  await assert.rejects(execute({ world, worldReader: corrupt }), /WORLD_REGISTRY_UNKNOWN|WORLD_SNAPSHOT_MISSING/);
});

test("eligibility is central, all rankings contain only eligible candidates, and high fixture fit cannot rescue exclusions", async () => {
  const { envelope, report } = await execute();
  assert.equal(report.eligibilityResults.length, report.candidateCountBeforeEligibility);
  assert.ok(report.eligibilityResults.every((result) => result.checks.every((check) => check.proofHash && check.evidenceIds.length > 0)));
  const rejected = new Set(report.eligibilityExclusions.map((entry) => entry.candidateId));
  assert.ok(rejected.size > 0);
  for (const engine of report.engineResults) assert.ok(engine.rankings.every((entry) => !rejected.has(entry.candidateId)));
  const blocked = envelope.candidatePool.candidates.find((entry) => !entry.candidate.distributionAllowed)?.candidate.spotId;
  assert.ok(blocked && report.engineResults.every((engine) => !engine.rankings.some((entry) => entry.candidateId === blocked)));
});

test("no consent, missing projection, cold user, and kill switch deterministically neutralize personalization", async () => {
  const cases = [
    ["NO_CONSENT", new SyntheticPhase2UserProjectionPort("NO_CONSENT")],
    ["MISSING_SNAPSHOT", undefined],
    ["COLD_START", new SyntheticPhase2UserProjectionPort("COLD_USER")],
    ["KILL_SWITCH", new SyntheticPhase2UserProjectionPort("KILL_SWITCH")],
  ];
  for (const [reason, port] of cases) {
    const bound = reason === "COLD_START" ? authority() : authority({ userSnapshot: null, ...(reason === "KILL_SWITCH" ? { userKillSwitch: true } : {}) });
    const { envelope, report } = await execute({ authority: bound, userProjectionPort: port });
    assert.equal(envelope.userProjection.status, "NEUTRAL");
    assert.equal(envelope.userProjection.neutralReason, reason);
    assert.equal(envelope.userProjectionValue.projection.taste.length, 0);
    assert.ok(report.engineResults.every((engine) => engine.confidence.components.find((item) => item.key === "USER_SUFFICIENCY")?.state === "UNKNOWN"));
  }
});

test("active projection keeps taste, aversion, practical behavior, and direct affinity semantically separate", async () => {
  const { envelope, report } = await execute(); const projection = envelope.userProjectionValue.projection;
  assert.equal(projection.status, "ACTIVE"); assert.ok(projection.taste.some((item) => item.affinity < 0)); assert.equal(projection.practical.length, 1); assert.equal(projection.directSpot.length, 1);
  const target = report.engineResults.find((entry) => entry.engineId === "vnext-fixture");
  assert.ok(target.rankings.some((entry) => entry.fit.dimensions.some((dimension) => dimension.key === "fixture.user_taste_match" && dimension.fixtureValue < 0)));
  assert.ok(!target.evidence.some((item) => item.signal.includes("practical")), "practical observation is not silently interpreted as taste");
  assert.ok(projection.directSpot.every((item) => !projection.taste.some((taste) => taste.concept.conceptId === item.spotId)));
});

test("context changes identity without writing user intelligence", async () => {
  const first = await execute();
  const secondRequest = request({ moodKeys: ["fixture.mood.lively"], budget: { state: "KNOWN", namespace: "fixture.context.budget", values: ["fixture.budget.other"] } });
  const second = await execute({ request: secondRequest });
  assert.notEqual(first.report.contextHash, second.report.contextHash);
  assert.notEqual(first.report.reportHash, second.report.reportHash);
  assert.equal(second.envelope.context.writesUserIntelligence, false);
  assert.equal(second.envelope.writesUserState, false);
});

test("same user with another server time or authorized location produces a distinct Context while retrieval stays neutral", async () => {
  const first = await execute();
  const later = await execute({ authority: authority({ serverTime: "2026-01-15T18:00:00.000Z" }) });
  assert.notEqual(first.report.contextHash, later.report.contextHash);
  const baselRequest = request({ location: { kind: "city", city: "Fixture Basel" } });
  const basel = await execute({ request: baselRequest, authority: authority({ authorizedLocationScope: { kind: "city", city: "Fixture Basel" } }) });
  assert.notEqual(first.report.contextHash, basel.report.contextHash);
  assert.equal(first.report.candidatePoolHash, basel.report.candidatePoolHash, "location does not personalize retrieval");
  assert.notEqual(first.report.candidateCountAfterEligibility, basel.report.candidateCountAfterEligibility);
});

test("same explicit Context with another bound user preserves retrieval and binds the new subject", async () => {
  const first = await execute();
  const second = await execute({ authority: authority({ actor: { kind: "AUTHENTICATED_USER", userId: "syn-user-0002", subjectBindingHash: contentHash("phase2-subject-2"), authenticationContextHash: contentHash("phase2-auth-2") } }) });
  assert.deepEqual(first.envelope.context.explicit, second.envelope.context.explicit);
  assert.notEqual(first.report.contextHash, second.report.contextHash, "the authoritative Context snapshot binds its subject");
  assert.equal(first.report.candidatePoolHash, second.report.candidatePoolHash);
  assert.notEqual(first.report.userProjectionHash, second.report.userProjectionHash);
  assert.notEqual(first.report.reportHash, second.report.reportHash);
  for (const engineId of ["baseline-a-open-distance-popularity", "baseline-b-mood-intent", "legacy-v13-frozen-fixture"]) {
    assert.deepEqual(first.report.engineResults.find((entry) => entry.engineId === engineId)?.rankings, second.report.engineResults.find((entry) => entry.engineId === engineId)?.rankings);
  }
});

test("oracles remain NOT_CONFIGURED while deterministic safety metrics are explicit", async () => {
  const { report } = await execute();
  const quality = report.metrics.find((item) => item.metricId === "TOP_1_RELEVANCE");
  const hard = report.metrics.find((item) => item.metricId === "HARD_CONSTRAINT_VIOLATION_RATE");
  assert.deepEqual(quality, { metricId: "TOP_1_RELEVANCE", state: "NOT_CONFIGURED", value: null, oracleVersion: null });
  assert.deepEqual(hard, { metricId: "HARD_CONSTRAINT_VIOLATION_RATE", state: "DETERMINISTIC", value: 0, oracleVersion: null });
});

test("every explanation is evidence-authorized and confidence remains uncalibrated", async () => {
  const { report } = await execute();
  for (const result of report.engineResults) {
    const ids = new Set(result.evidence.map((entry) => entry.evidenceId));
    assert.ok(result.explanation.every((reason) => reason.evidenceIds.length > 0 && reason.evidenceIds.every((id) => ids.has(id))));
    assert.equal(result.confidence.state, "UNCALIBRATED");
    assert.equal(result.confidence.components.find((item) => item.key === "OVERALL")?.state, "NOT_CONFIGURED");
  }
});

test("replay is byte-identical and non-semantic runtime metadata does not change semantic identity", async () => {
  const { envelope, report } = await execute();
  const replayed = replayPhase2Evaluation(envelope, report);
  assert.equal(canonicalJson(replayed), canonicalJson(report));
  const timed = structuredClone(report); timed.runtime.measuredMilliseconds = 12.5;
  validatePhase2EvaluationIntegrity(envelope, timed);
  assert.equal(timed.reportHash, report.reportHash);
});

test("recursive validation rejects rehashed inner ranking and evidence manipulation", async () => {
  const { envelope, report } = await execute();
  const rankingAttack = structuredClone(report); const fit = rankingAttack.engineResults[0].rankings[0].fit; fit.fixtureScore = fit.fixtureScore === 0 ? 0.1 : 0; fit.fitHash = contentHash(Object.fromEntries(Object.entries(fit).filter(([key]) => key !== "fitHash")));
  const engineBody = Object.fromEntries(Object.entries(rankingAttack.engineResults[0]).filter(([key]) => key !== "resultHash")); rankingAttack.engineResults[0].resultHash = contentHash(engineBody);
  rankingAttack.reportHash = contentHash(Object.fromEntries(Object.entries(rankingAttack).filter(([key]) => key !== "reportHash" && key !== "runtime")));
  assert.throws(() => validatePhase2EvaluationIntegrity(envelope, rankingAttack), /EVALUATION_SEMANTIC_REPLAY_MISMATCH/);
  const evidenceAttack = structuredClone(report); evidenceAttack.engineResults[0].evidence[0].signal = "fixture.forged";
  const evidence = evidenceAttack.engineResults[0].evidence[0]; evidence.evidenceHash = contentHash(Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== "evidenceHash")));
  const attackedEngine = evidenceAttack.engineResults[0]; attackedEngine.resultHash = contentHash(Object.fromEntries(Object.entries(attackedEngine).filter(([key]) => key !== "resultHash")));
  evidenceAttack.reportHash = contentHash(Object.fromEntries(Object.entries(evidenceAttack).filter(([key]) => key !== "reportHash" && key !== "runtime")));
  assert.throws(() => validatePhase2EvaluationIntegrity(envelope, evidenceAttack), /EVALUATION_SEMANTIC_REPLAY_MISMATCH/);
  const eligibilityAttack = structuredClone(report); const check = eligibilityAttack.eligibilityResults[0].checks[0]; check.reasonCodes = ["forged-reason"]; check.proofHash = contentHash(Object.fromEntries(Object.entries(check).filter(([key]) => key !== "proofHash")));
  const attackedEligibility = eligibilityAttack.eligibilityResults[0]; attackedEligibility.resultHash = contentHash(Object.fromEntries(Object.entries(attackedEligibility).filter(([key]) => key !== "resultHash")));
  eligibilityAttack.reportHash = contentHash(Object.fromEntries(Object.entries(eligibilityAttack).filter(([key]) => key !== "reportHash" && key !== "runtime")));
  assert.throws(() => validatePhase2EvaluationIntegrity(envelope, eligibilityAttack), /EVALUATION_SEMANTIC_REPLAY_MISMATCH/);
});

test("unknown engine versions and duplicate bindings fail closed", async () => {
  const { envelope } = await execute();
  const unknown = structuredClone(envelope); unknown.engineManifests[0].engineVersion = "unknown-but-syntactically-valid"; unknown.engineManifests[0].manifestHash = contentHash(Object.fromEntries(Object.entries(unknown.engineManifests[0]).filter(([key]) => key !== "manifestHash"))); unknown.envelopeHash = contentHash(Object.fromEntries(Object.entries(unknown).filter(([key]) => key !== "envelopeHash")));
  assert.throws(() => validatePhase2ExecutionEnvelope(unknown), /ENGINE_MANIFEST_BINDING_MISMATCH/);
  const duplicate = structuredClone(envelope); duplicate.world.snapshots[1].spotId = duplicate.world.snapshots[0].spotId; duplicate.world.snapshotSetHash = contentHash(duplicate.world.snapshots.map((item) => item.snapshotHash)); duplicate.envelopeHash = contentHash(Object.fromEntries(Object.entries(duplicate).filter(([key]) => key !== "envelopeHash")));
  assert.throws(() => validatePhase2ExecutionEnvelope(duplicate), /WORLD_SNAPSHOT_BINDING_MISMATCH/);
});

test("commercial counterfactuals have no contract channel and no result influence", async () => {
  const world = generateSyntheticWorld(config); const first = await execute({ world });
  const counterfactual = { ...world, spots: world.spots.map((spot) => ({ ...spot, owner: "changed", ownerTier: "premium", subscription: "paid", payment: "active", advertising: true, sponsored: true, commercialPackage: "max" })) };
  const second = await execute({ world: counterfactual, worldReader: new SyntheticWorldKnowledgeReader(counterfactual) });
  assert.equal(first.envelope.candidatePool.candidatePoolHash, second.envelope.candidatePool.candidatePoolHash);
  assert.equal(first.report.reportHash, second.report.reportHash);
  assert.ok(!canonicalJson(second.report).match(/ownerTier|subscription|payment|advertising|sponsored|commercialPackage/));
});

test("empty pool is a controlled limitation and never an uncontrolled failure", async () => {
  const { report } = await execute({ candidatePoolSize: 0 });
  assert.equal(report.candidateCountBeforeEligibility, 0); assert.equal(report.candidateCountAfterEligibility, 0);
  assert.ok(report.engineResults.every((engine) => engine.top1 === null && engine.degradation.some((entry) => entry.code === "CANDIDATE_POOL_EMPTY")));
});
