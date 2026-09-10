import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTEXT_AUTHORITIES, CONTEXT_DEGRADATION_MATRIX, CONTEXT_KERNEL_VERSIONS,
  ContextAuthorityRecordSchema, ContextDimensionValueSchema, ContextKernelClientInputSchema,
  SyntheticContextWeatherProvider, canonicalJson, contentHash, createFixtureContextPolicy,
  buildContextFlipReport, createFixtureContextRegistry, createServerSessionState, createStructuralOracle,
  createStructuralOracleAuthority,
  createSyntheticContextAuthority, phase3AClientInput, phase3ARequest, projectContextForConsumer,
  resolveContextKernel, runContextFlipScenario, runContextFlipWorkbench, runPhase3AContextFixture,
  trustSyntheticContextAuthority, trustSyntheticOracleAuthorityForLocalEvaluation,
  unknownConstraintDisposition, validateContextFlipReport, validateOracleAuthority,
  validateContextSnapshotIntegrity, validateScenarioOracle, validateContextExecutionEnvelope,
  verifyContextForConsumers,
} from "../dist/index.js";

const rehash = (value, field) => { value[field] = contentHash(Object.fromEntries(Object.entries(value).filter(([key]) => key !== field))); };

test("identical semantic inputs produce byte-identical minimized snapshots", async () => {
  const first = await runPhase3AContextFixture(); const second = await runPhase3AContextFixture();
  assert.equal(canonicalJson(first.snapshot), canonicalJson(second.snapshot)); assert.equal(first.snapshot.contextHash, second.snapshot.contextHash);
  assert.equal(first.snapshot.privacy.rawLocationPersisted, false); assert.equal(first.snapshot.writesUserIntelligence, false); assert.equal(first.snapshot.writesWorldState, false);
});

test("all seven authority states remain distinct and runtime-validatable", () => {
  assert.deepEqual(CONTEXT_AUTHORITIES, ["EXPLICIT", "SERVER_AUTHORIZED", "DERIVED", "UNKNOWN", "NOT_CONFIGURED", "NOT_AVAILABLE", "DENIED"]);
  const at = "2026-01-15T12:00:00.000Z";
  for (const state of ["UNKNOWN", "NOT_CONFIGURED", "NOT_AVAILABLE", "DENIED"]) {
    const body = { dimensionKey: "context.test", state, authority: state, reasonCode: `fixture-${state.toLowerCase()}`, consideredAt: at };
    assert.equal(ContextDimensionValueSchema.parse({ ...body, dimensionHash: contentHash(body) }).state, state);
  }
});

test("explicit values remain EXPLICIT and independent dimensions keep stable identities", async () => {
  const first = await runPhase3AContextFixture(); const changed = phase3AClientInput({ request: phase3ARequest({ budget: { state: "KNOWN", namespace: "fixture.context.budget-v1", values: ["fixture.budget.broad"] } }) }); const second = await runPhase3AContextFixture({ client: changed });
  const byKey = (snapshot, key) => snapshot.dimensions.find((item) => item.dimensionKey === key);
  assert.equal(byKey(second.snapshot, "context.budget.explicit").authority, "EXPLICIT");
  assert.notEqual(byKey(first.snapshot, "context.budget.explicit").dimensionHash, byKey(second.snapshot, "context.budget.explicit").dimensionHash);
  assert.equal(byKey(first.snapshot, "context.mood.current.explicit").dimensionHash, byKey(second.snapshot, "context.mood.current.explicit").dimensionHash);
});

test("derived values require sources and accepted deterministic rules", async () => {
  const run = await runPhase3AContextFixture(); const local = structuredClone(run.snapshot.dimensions.find((item) => item.authority === "DERIVED"));
  local.sourceHashes = []; rehash(local, "dimensionHash");
  assert.throws(() => ContextDimensionValueSchema.parse(local), /minimum items 1/);
  const snapshot = structuredClone(run.snapshot); const index = snapshot.dimensions.findIndex((item) => item.authority === "DERIVED"); snapshot.dimensions[index].proofHash = "0".repeat(64); rehash(snapshot.dimensions[index], "dimensionHash"); rehash(snapshot, "contextHash");
  assert.throws(() => validateContextSnapshotIntegrity(snapshot, run.authority, run.trustAnchor, run.registry, run.policy, run.client), /context_derived_proof_invalid/);
});

test("client cannot create server authority, policies, time, identities, commercial influence, or derived claims", () => {
  const base = phase3AClientInput();
  for (const field of ["serverTime", "userId", "registryVersion", "unknownPolicy", "ownerTier", "payment", "sponsored", "derived"]) assert.throws(() => ContextKernelClientInputSchema.parse({ ...base, [field]: "attacker" }), /unknown field/);
});

test("external trust anchor binds actor, decision, session, registry, policy and source domains", async () => {
  const run = await runPhase3AContextFixture(); const manipulated = structuredClone(run.authority); manipulated.decisionId = "other-decision"; rehash(manipulated, "authorityHash");
  await assert.rejects(resolveContextKernel(run.client, manipulated, run.trustAnchor, run.registry, run.policy), /context_authority_not_trusted/);
  const selfTrust = trustSyntheticContextAuthority(manipulated, "attacker-self-trust");
  const snapshot = await resolveContextKernel(run.client, manipulated, selfTrust, run.registry, run.policy, { weatherProvider: new SyntheticContextWeatherProvider("fixture.weather.dry") });
  assert.equal(snapshot.decisionId, "other-decision", "synthetic helper is explicitly a local trust root, never production-capable"); assert.equal(selfTrust.productionCapable, false);
});

test("Context execution envelope recursively binds request, actor, Decision, Session, World, User and Candidate Pool", async () => {
  const run = await runPhase3AContextFixture(); validateContextExecutionEnvelope(run.envelope, run.trustAnchor, run.registry, run.policy, run.client);
  for (const field of ["decisionId", "sessionId", "actorSubjectBindingHash"]) {
    const changed = structuredClone(run.envelope); changed.contextSnapshot[field] = field === "actorSubjectBindingHash" ? "1".repeat(64) : `other-${field}`; rehash(changed.contextSnapshot, "contextHash"); rehash(changed, "envelopeHash");
    assert.throws(() => validateContextExecutionEnvelope(changed, run.trustAnchor, run.registry, run.policy, run.client), /context_snapshot_identity_mismatch/);
  }
  const source = structuredClone(run.envelope); source.worldSnapshotBindingHash = "2".repeat(64); rehash(source, "envelopeHash"); assert.throws(() => validateContextExecutionEnvelope(source, run.trustAnchor, run.registry, run.policy, run.client), /context_execution_envelope_binding_mismatch/);
  const policy = structuredClone(run.envelope); policy.degradationPolicyBindingHash = "5".repeat(64); rehash(policy, "envelopeHash"); assert.throws(() => validateContextExecutionEnvelope(policy, run.trustAnchor, run.registry, run.policy, run.client), /context_execution_envelope_binding_mismatch/);
});

test("missing, mismatched, expired, and manipulated location authority fail closed", async () => {
  const run = await runPhase3AContextFixture();
  const missing = structuredClone(run.authority); delete missing.authorizedLocationScope; assert.throws(() => ContextAuthorityRecordSchema.parse(missing), /required field missing/);
  const basel = phase3AClientInput({ request: phase3ARequest({ location: { kind: "city", city: "Fixture Basel" } }) }); await assert.rejects(resolveContextKernel(basel, run.authority, run.trustAnchor, run.registry, run.policy), /context_location_authority_mismatch|context_location_scope_mismatch/);
  const expired = createSyntheticContextAuthority({ ...Object.fromEntries(Object.entries(run.authority).filter(([key]) => !["contractVersion", "authorityKind", "authorityHash", "expiresAt"].includes(key))), expiresAt: "2026-01-15T11:59:59.000Z" }); const expiredTrust = trustSyntheticContextAuthority(expired); await assert.rejects(resolveContextKernel(run.client, expired, expiredTrust, run.registry, run.policy), /context_authority_expired/);
  const manipulated = structuredClone(run.authority); manipulated.authorizedLocationScope.radiusMeters = 1; rehash(manipulated, "authorityHash"); await assert.rejects(resolveContextKernel(run.client, manipulated, run.trustAnchor, run.registry, run.policy), /context_authority_not_trusted/);
});

test("precise client coordinates are hash-bound but never persisted in the Context snapshot", async () => {
  const request = phase3ARequest({ location: { kind: "coordinate", latitude: 47.376887, longitude: 8.541694 } }); const client = phase3AClientInput({ request });
  const run = await runPhase3AContextFixture({ client, locationCity: "Fixture Zurich" });
  assert.equal(run.snapshot.location.clientRepresentation, "PRECISE_COORDINATE_MINIMIZED"); assert.equal(run.snapshot.location.rawCoordinatesPersisted, false);
  assert.ok(!canonicalJson(run.snapshot).includes("47.376887")); assert.ok(!canonicalJson(run.snapshot).includes("8.541694"));
});

test("companion context accepts registry concepts but rejects concrete identity-like values", async () => {
  const valid = await runPhase3AContextFixture(); assert.equal(valid.snapshot.dimensions.find((item) => item.dimensionKey === "context.companion.explicit").authority, "EXPLICIT");
  const invalid = phase3AClientInput({ request: phase3ARequest({ socialContext: "person.alice" }) }); await assert.rejects(runPhase3AContextFixture({ client: invalid }), /context_companion_identity_forbidden/);
});

test("hard constraints and soft preferences remain distinct and only hard constraints carry rule-wise unknown policy", async () => {
  const hard = { constraintId: "fixture-accessibility", dimensionKey: "fixture.constraint.accessibility", operator: "REQUIRE_TRUE", expectedValue: { kind: "BOOLEAN", value: true } };
  const soft = { preferenceId: "fixture-distance-soft", dimensionKey: "context.distance-willingness.explicit", preferredValue: { kind: "DISTANCE_METERS", meters: 3_000 } };
  const run = await runPhase3AContextFixture({ client: phase3AClientInput({ hardConstraints: [hard], softPreferences: [soft] }) });
  const accessibility = run.snapshot.hardConstraints.find((item) => item.constraintId === hard.constraintId); assert.equal(accessibility.kind, "HARD"); assert.equal(unknownConstraintDisposition(accessibility), "EXCLUDE");
  assert.equal(run.snapshot.softPreferences[0].kind, "SOFT"); assert.equal(run.snapshot.softPreferences[0].eligibilityAuthority, false);
});

test("unknown constraint policy is visible and never becomes an implicit decision", async () => {
  const hard = { constraintId: "unconfigured-budget", dimensionKey: "context.budget.explicit", operator: "MAXIMUM", expectedValue: { kind: "CONCEPT_REFS", registryVersion: "fixture.context.budget-v1", conceptIds: ["fixture.budget.narrow"] } };
  const run = await runPhase3AContextFixture({ client: phase3AClientInput({ hardConstraints: [hard] }) }); const constraint = run.snapshot.hardConstraints.find((item) => item.constraintId === hard.constraintId);
  assert.equal(constraint.status, "NOT_CONFIGURED"); assert.equal(constraint.unknownPolicy, "NOT_CONFIGURED"); assert.equal(unknownConstraintDisposition(constraint), "NOT_CONFIGURED"); assert.ok(run.snapshot.limitations.includes("constraint-policy-not-configured"));
});

test("irrelevant UNKNOWN does not create a hard constraint or ranking value", async () => {
  const request = phase3ARequest({ exploration: { state: "UNKNOWN", namespace: "fixture.context.exploration-v1" } }); const run = await runPhase3AContextFixture({ client: phase3AClientInput({ request }) });
  assert.equal(run.snapshot.dimensions.find((item) => item.dimensionKey === "context.exploration.explicit").state, "UNKNOWN"); assert.ok(!run.snapshot.hardConstraints.some((item) => item.dimensionKey === "context.exploration.explicit"));
});

test("consumer projection follows registry permissions without granting Context ranking authority", async () => {
  const run = await runPhase3AContextFixture(); const verified = verifyContextForConsumers(run.envelope, run.trustAnchor, run.registry, run.policy, run.client);
  const eligibility = projectContextForConsumer(verified, "ELIGIBILITY"); const ranking = projectContextForConsumer(verified, "RANKING"); const explanation = projectContextForConsumer(verified, "EXPLANATION");
  assert.ok(eligibility.dimensions.some((item) => item.dimensionKey === "context.constraint.open-now")); assert.ok(!ranking.dimensions.some((item) => item.dimensionKey === "context.constraint.open-now"));
  assert.equal(ranking.dimensions.length, 0); assert.equal(explanation.dimensions.length, 0); assert.equal(run.snapshot.writesUserIntelligence, false);
});

test("consumer projection requires a process-local recursively verified capability", async () => {
  const run = await runPhase3AContextFixture(); const verified = verifyContextForConsumers(run.envelope, run.trustAnchor, run.registry, run.policy, run.client);
  assert.throws(() => projectContextForConsumer(run.snapshot, "RANKING"), /context_consumer_requires_verified_envelope/);
  assert.throws(() => projectContextForConsumer(structuredClone(verified), "RANKING"), /context_consumer_requires_verified_envelope/);
  assert.throws(() => projectContextForConsumer({ ...verified }, "RANKING"), /context_consumer_requires_verified_envelope/);
  const stale = structuredClone(run.envelope); stale.contextSnapshot.dimensions.find((item) => item.dimensionKey === "context.budget.explicit").value.conceptIds = ["fixture.budget.broad"];
  assert.throws(() => verifyContextForConsumers(stale, run.trustAnchor, run.registry, run.policy, run.client), /Hash_mismatch|hash_mismatch/);
  const changed = structuredClone(run.envelope); const budget = changed.contextSnapshot.dimensions.find((item) => item.dimensionKey === "context.budget.explicit"); budget.value.conceptIds = ["fixture.budget.broad"]; rehash(budget, "dimensionHash"); rehash(changed.contextSnapshot, "contextHash"); rehash(changed, "envelopeHash");
  assert.throws(() => verifyContextForConsumers(changed, run.trustAnchor, run.registry, run.policy, run.client), /context_explicit_claim_binding_mismatch/);
  const registry = structuredClone(run.registry); registry.registryVersion = "attacker-registry"; rehash(registry, "registryHash"); assert.throws(() => verifyContextForConsumers(run.envelope, run.trustAnchor, registry, run.policy, run.client), /context_policy_registry_mismatch|context_authority_not_trusted/);
  const policy = structuredClone(run.policy); policy.policyVersion = "attacker-policy"; rehash(policy, "policyHash"); assert.throws(() => verifyContextForConsumers(run.envelope, run.trustAnchor, run.registry, policy, run.client), /context_authority_not_trusted/);
});

test("per-dimension policy decisions preserve fixture, state and consumer boundaries", async () => {
  const hard = { constraintId: "fixture-accessibility", dimensionKey: "fixture.constraint.accessibility", operator: "REQUIRE_TRUE", expectedValue: { kind: "BOOLEAN", value: true } };
  const soft = { preferenceId: "fixture-distance-soft", dimensionKey: "context.distance-willingness.explicit", preferredValue: { kind: "DISTANCE_METERS", meters: 3_000 } };
  const run = await runPhase3AContextFixture({ client: phase3AClientInput({ hardConstraints: [hard], softPreferences: [soft] }) }); const verified = verifyContextForConsumers(run.envelope, run.trustAnchor, run.registry, run.policy, run.client);
  const ranking = projectContextForConsumer(verified, "RANKING"); const eligibility = projectContextForConsumer(verified, "ELIGIBILITY"); const evaluation = projectContextForConsumer(verified, "EVALUATION");
  for (const key of ["context.intent.explicit", "context.mood.current.explicit", "context.budget.explicit"]) assert.equal(ranking.decisions.find((item) => item.dimensionKey === key).decision, "WITHHELD_NOT_CONFIGURED", key);
  assert.equal(ranking.fixtureOnly, true); assert.equal(ranking.productSemanticsConfigured, false); assert.equal(ranking.dimensions.length, 0);
  assert.deepEqual(ranking.limitations, run.snapshot.limitations);
  assert.equal(eligibility.softPreferencesIncluded, false); assert.ok(!eligibility.dimensions.some((item) => item.dimensionKey === soft.dimensionKey)); assert.ok(!eligibility.hardConstraints.some((item) => item.constraintId === hard.constraintId), "DRAFT fixture accessibility is not product-authorized Eligibility");
  assert.equal(eligibility.decisions.find((item) => item.dimensionKey === soft.dimensionKey).decision, "WITHHELD_POLICY");
  assert.ok(evaluation.decisions.some((item) => item.decision === "EVALUATION_ONLY")); assert.equal(evaluation.productSemanticsConfigured, false);
});

test("verified consumer boundary rejects rebound authority and cross-domain identities after rehash", async () => {
  const run = await runPhase3AContextFixture();
  const mutations = [
    ["decision", (value) => { value.authority.decisionId = "attacker-decision"; value.contextSnapshot.decisionId = "attacker-decision"; }],
    ["session", (value) => { value.authority.sessionId = "attacker-session"; value.contextSnapshot.sessionId = "attacker-session"; }],
    ["subject", (value) => { value.authority.actorSubjectBindingHash = "1".repeat(64); value.contextSnapshot.actorSubjectBindingHash = "1".repeat(64); }],
    ["world", (value) => { value.authority.worldSnapshotBindingHash = "2".repeat(64); value.worldSnapshotBindingHash = "2".repeat(64); value.contextSnapshot.sourceBindings.worldSnapshotBindingHash = "2".repeat(64); }],
    ["user", (value) => { value.authority.userProjectionBindingHash = "3".repeat(64); value.userProjectionBindingHash = "3".repeat(64); value.contextSnapshot.sourceBindings.userProjectionBindingHash = "3".repeat(64); }],
    ["pool", (value) => { value.authority.candidatePoolBindingHash = "4".repeat(64); value.candidatePoolBindingHash = "4".repeat(64); value.contextSnapshot.sourceBindings.candidatePoolBindingHash = "4".repeat(64); }],
    ["eligibility", (value) => { value.authority.eligibilityPolicyBindingHash = "5".repeat(64); value.eligibilityPolicyBindingHash = "5".repeat(64); value.contextSnapshot.sourceBindings.eligibilityPolicyBindingHash = "5".repeat(64); }],
  ];
  for (const [label, mutate] of mutations) {
    const value = structuredClone(run.envelope); mutate(value); rehash(value.authority, "authorityHash"); rehash(value.contextSnapshot, "contextHash"); rehash(value, "envelopeHash");
    assert.throws(() => verifyContextForConsumers(value, run.trustAnchor, run.registry, run.policy, run.client), /context_authority_not_trusted|context_snapshot_source_binding_mismatch|context_snapshot_identity_mismatch/, label);
  }
});

test("unknown derived rules and Context-to-User writes cannot cross a consumer boundary", async () => {
  const run = await runPhase3AContextFixture(); const derived = structuredClone(run.envelope); const local = derived.contextSnapshot.dimensions.find((item) => item.dimensionKey === "context.time.local"); local.ruleId = "attacker-derived-rule"; const proof = { dimensionKey: local.dimensionKey, value: local.value, ruleId: local.ruleId, ruleVersion: local.ruleVersion, sourceHashes: [...local.sourceHashes].sort(), derivedAt: local.derivedAt, limitations: [...local.limitations].sort() }; local.proofHash = contentHash(proof); rehash(local, "dimensionHash"); rehash(derived.contextSnapshot, "contextHash"); rehash(derived, "envelopeHash");
  assert.throws(() => verifyContextForConsumers(derived, run.trustAnchor, run.registry, run.policy, run.client), /context_derived_proof_invalid|context_derived_rule_not_accepted|context_local_time_dimension_mismatch/);
  const write = structuredClone(run.envelope); write.writesUserIntelligence = true; rehash(write, "envelopeHash"); assert.throws(() => verifyContextForConsumers(write, run.trustAnchor, run.registry, run.policy, run.client), /expected false/);
});

test("DST, timezone, day rollover and local clock are deterministic", async () => {
  const winterClient = phase3AClientInput({ request: phase3ARequest({ clientRequestedAt: "2026-01-15T23:30:00.000Z" }) }); const summerClient = phase3AClientInput({ request: phase3ARequest({ clientRequestedAt: "2026-07-15T22:30:00.000Z" }) });
  const winter = await runPhase3AContextFixture({ client: winterClient, serverTime: "2026-01-15T23:30:00.000Z", weatherProvider: new SyntheticContextWeatherProvider("fixture.weather.dry", "2026-01-15T23:00:00.000Z", "2026-01-16T02:00:00.000Z") }); const summer = await runPhase3AContextFixture({ client: summerClient, serverTime: "2026-07-15T22:30:00.000Z", weatherProvider: new SyntheticContextWeatherProvider("fixture.weather.dry", "2026-07-15T22:00:00.000Z", "2026-07-16T01:00:00.000Z") });
  assert.equal(winter.snapshot.temporal.localTime, "00:30:00"); assert.equal(winter.snapshot.temporal.localDate, "2026-01-16"); assert.equal(summer.snapshot.temporal.localTime, "00:30:00"); assert.equal(summer.snapshot.temporal.localDate, "2026-07-16");
  const ny = await runPhase3AContextFixture({ timeZone: "America/New_York" }); assert.notEqual(ny.snapshot.temporal.localTime, "12:00:00");
});

test("late/offline requests are explicit limitations and excessive age or future skew rejects", async () => {
  const lateClient = phase3AClientInput({ request: phase3ARequest({ clientRequestedAt: "2026-01-15T10:00:00.000Z" }) }); const late = await runPhase3AContextFixture({ client: lateClient }); assert.equal(late.snapshot.temporal.requestTiming.state, "LATE_WITH_LIMITATION"); assert.ok(late.snapshot.limitations.includes("late-client-request"));
  const oldClient = phase3AClientInput({ request: phase3ARequest({ clientRequestedAt: "2026-01-13T10:00:00.000Z" }) }); await assert.rejects(runPhase3AContextFixture({ client: oldClient }), /context_request_too_old/);
  const futureClient = phase3AClientInput({ request: phase3ARequest({ clientRequestedAt: "2026-01-15T12:10:00.000Z" }) }); await assert.rejects(runPhase3AContextFixture({ client: futureClient }), /context_client_time_ahead/);
});

test("weather is server-observed, scope-bound, freshness-bound, and absence states remain honest", async () => {
  const fresh = await runPhase3AContextFixture(); assert.equal(fresh.snapshot.dimensions.find((item) => item.dimensionKey === "context.weather.observed").authority, "SERVER_AUTHORIZED");
  const stale = await runPhase3AContextFixture({ weatherProvider: new SyntheticContextWeatherProvider("fixture.weather.rain", "2026-01-14T01:00:00.000Z", "2026-01-14T02:00:00.000Z") }); assert.equal(stale.snapshot.dimensions.find((item) => item.dimensionKey === "context.weather.observed").state, "NOT_AVAILABLE");
  const absent = await runPhase3AContextFixture({ weatherProvider: null }); assert.equal(absent.snapshot.dimensions.find((item) => item.dimensionKey === "context.weather.observed").authority, "NOT_AVAILABLE");
});

test("session state is canonical, deduplicated and bound; rejected and alternative actions never write User Intelligence", async () => {
  const state = createServerSessionState({ shownCandidateIds: ["a", "a"], openedCandidateIds: ["b", "b"], rejectedCandidateIds: ["a", "a"], alternativeRequestCount: 1 }); assert.deepEqual(state.shownCandidateIds, ["a"]); assert.deepEqual(state.rejectedCandidateIds, ["a"]);
  const client = phase3AClientInput({ request: phase3ARequest({ shownCandidateIds: ["a"], rejectedCandidateIds: ["a"] }) }); const run = await runPhase3AContextFixture({ client, openedCandidateIds: ["b"], alternativeRequestCount: 1 }); assert.equal(run.snapshot.sessionState.alternativeRequestCount, 1); assert.equal(run.snapshot.writesUserIntelligence, false);
  const manipulated = structuredClone(run.snapshot); manipulated.sessionState.rejectedCandidateIds = ["other"]; rehash(manipulated.sessionState, "stateHash"); rehash(manipulated, "contextHash"); assert.throws(() => validateContextSnapshotIntegrity(manipulated, run.authority, run.trustAnchor, run.registry, run.policy, run.client), /session_binding_mismatch/);
});

test("unknown registry and policy identities fail closed", async () => {
  const run = await runPhase3AContextFixture(); const registry = structuredClone(run.registry); registry.registryVersion = "unknown-registry"; rehash(registry, "registryHash"); await assert.rejects(resolveContextKernel(run.client, run.authority, run.trustAnchor, registry, run.policy), /context_policy_registry_mismatch|context_authority_not_trusted/);
  const policy = structuredClone(run.policy); policy.policyVersion = "unknown-policy"; rehash(policy, "policyHash"); await assert.rejects(resolveContextKernel(run.client, run.authority, run.trustAnchor, run.registry, policy), /context_authority_not_trusted/);
});

test("commercial counterfactual has no contract channel and cannot change Context identity", async () => {
  const first = await runPhase3AContextFixture(); const externalCommercialRecord = { ownerTier: "gold", payment: true, advertising: true, sponsored: true, subscription: "premium" }; assert.ok(externalCommercialRecord);
  const second = await runPhase3AContextFixture(); assert.equal(first.snapshot.contextHash, second.snapshot.contextHash);
  assert.ok(!canonicalJson(first.snapshot).match(/owner|payment|advert|sponsor|subscription/i));
});

test("degradation matrix has no silent fallback action", () => {
  assert.ok(Object.values(CONTEXT_DEGRADATION_MATRIX).every((entry) => ["FAIL_CLOSED", "REQUEST_REJECTED", "USER_CLARIFICATION_REQUIRED", "DIMENSION_IGNORED_WITH_LIMITATION", "CANDIDATE_EXCLUDED", "NEUTRAL_DEFAULT", "EVALUATION_NOT_CONFIGURED"].includes(entry.action)));
});

test("all fifteen Context flips are deterministic, structural-only, and produce no ranking claim", async () => {
  const first = await runContextFlipWorkbench(); const second = await runContextFlipWorkbench(); assert.equal(first.scenarios.length, 15); assert.equal(canonicalJson(first), canonicalJson(second)); assert.equal(first.productRankingQualityConfigured, false);
  for (const report of first.scenarios) { assert.notEqual(report.baseContextHash, report.flippedContextHash); assert.notEqual(report.baseDecisionIdentity, report.flippedDecisionIdentity); assert.equal(report.writesUserIntelligence, false); assert.equal(report.rankingQualityClaim, false); assert.equal(report.oracle.rankingDirection, "NOT_CONFIGURED"); }
});

test("structural Oracle replay is recursive and unapproved Oracles cannot claim ranking direction", async () => {
  const { baseVerified, flippedVerified, oracleAuthority, oracleTrustAnchor, report } = await runContextFlipScenario("budget-narrow-vs-broad"); validateContextFlipReport(report, baseVerified, flippedVerified, oracleAuthority, oracleTrustAnchor);
  const tampered = structuredClone(report); tampered.changedDimensionKeys = []; rehash(tampered, "reportHash"); assert.throws(() => validateContextFlipReport(tampered, baseVerified, flippedVerified, oracleAuthority, oracleTrustAnchor), /context_flip_replay_mismatch|context_oracle_structural_expectation_failed/);
  const oracle = structuredClone(report.oracle); oracle.rankingDirection = "FOUNDER_APPROVED_DIRECTION"; rehash(oracle, "oracleHash"); assert.throws(() => validateScenarioOracle(oracle, oracleAuthority, oracleTrustAnchor), /context_oracle_product_claim_not_authorized|expected/);
  const forged = structuredClone(report.oracle); forged.expectationClass = "FOUNDER_APPROVED_EXPECTATION"; forged.productApprovalStatus = "FOUNDER_APPROVED"; rehash(forged, "oracleHash"); assert.throws(() => validateScenarioOracle(forged, oracleAuthority, oracleTrustAnchor), /context_oracle_product_claim_not_authorized|expected/);
});

test("Oracle authority is external, injected and cannot self-authorize", async () => {
  const run = await runContextFlipScenario("budget-narrow-vs-broad"); validateOracleAuthority(run.oracleAuthority, run.oracleTrustAnchor);
  const forgedAuthority = structuredClone(run.oracleAuthority); forgedAuthority.scenarioId = "attacker-scenario"; forgedAuthority.allowedScenarioIds = ["attacker-scenario"]; rehash(forgedAuthority, "authorityHash");
  const attackerAnchor = trustSyntheticOracleAuthorityForLocalEvaluation(forgedAuthority, "attacker-local-anchor");
  assert.throws(() => validateOracleAuthority(forgedAuthority, run.oracleTrustAnchor), /context_oracle_authority_not_trusted/);
  assert.throws(() => validateOracleAuthority(run.oracleAuthority, attackerAnchor), /context_oracle_authority_not_trusted/);
  const embedded = { ...run.report, oracleTrustAnchor: attackerAnchor }; assert.throws(() => validateContextFlipReport(embedded, run.baseVerified, run.flippedVerified, run.oracleAuthority, run.oracleTrustAnchor), /unknown field/);
  const expired = structuredClone(run.oracleAuthority); expired.validFrom = "2025-01-01T00:00:00.000Z"; expired.validUntil = "2025-12-31T23:59:59.000Z"; rehash(expired, "authorityHash"); const expiredAnchor = trustSyntheticOracleAuthorityForLocalEvaluation(expired, "expired-local-anchor");
  const expectation = { oracleId: expired.oracleId, scenarioId: expired.scenarioId, expectedStructuralChanges: expired.allowedStructuralChanges, expectedInputChanges: expired.allowedInputChanges, expectedHardConstraintSetChanged: expired.expectedHardConstraintSetChanged, expectedSoftPreferenceSetChanged: expired.expectedSoftPreferenceSetChanged, expectedEligibilityEffect: expired.eligibilityExpectation, validFrom: expired.validFrom, validUntil: expired.validUntil, allowedScenarioIds: expired.allowedScenarioIds };
  const expiredOracle = createStructuralOracle(expectation, expired, expiredAnchor); assert.throws(() => buildContextFlipReport(run.baseVerified, run.flippedVerified, expiredOracle, expired, expiredAnchor), /context_oracle_authority_not_valid_for_context/);
});

test("rehashing Oracle and report cannot authorize changed expectations or Product claims", async () => {
  const run = await runContextFlipScenario("budget-narrow-vs-broad");
  const mutations = [
    ["scenario", (oracle) => { oracle.scenarioId = "renamed-scenario"; }],
    ["dimensions", (oracle) => { oracle.expectedStructuralChanges = []; }],
    ["eligibility", (oracle) => { oracle.expectedEligibilityEffect = "UNCHANGED"; }],
    ["explanation", (oracle) => { oracle.expectedExplanationEvidence = ["invented-evidence"]; }],
    ["founder", (oracle) => { oracle.expectationClass = "FOUNDER_APPROVED_EXPECTATION"; oracle.productApprovalStatus = "FOUNDER_APPROVED"; }],
    ["version", (oracle) => { oracle.oracleVersion = "syntactically-valid-unknown-version"; }],
  ];
  for (const [label, mutate] of mutations) {
    const report = structuredClone(run.report); mutate(report.oracle); rehash(report.oracle, "oracleHash"); rehash(report, "reportHash");
    assert.throws(() => validateContextFlipReport(report, run.baseVerified, run.flippedVerified, run.oracleAuthority, run.oracleTrustAnchor), /context_oracle_|expected/, label);
  }
});

test("flip comparison accepts only verified contexts and exact authorized changes", async () => {
  const run = await runContextFlipScenario("budget-narrow-vs-broad");
  assert.throws(() => buildContextFlipReport(run.base.snapshot, run.flipped.snapshot, run.report.oracle, run.oracleAuthority, run.oracleTrustAnchor), /context_consumer_requires_verified_envelope/);
  assert.throws(() => buildContextFlipReport(run.flippedVerified, run.baseVerified, run.report.oracle, run.oracleAuthority, run.oracleTrustAnchor), /context_oracle_snapshot_binding_mismatch/);
  const other = await runContextFlipScenario("weather-dry-vs-rain");
  assert.throws(() => buildContextFlipReport(run.baseVerified, other.flippedVerified, run.report.oracle, run.oracleAuthority, run.oracleTrustAnchor), /context_flip_cross_domain_binding_changed|context_oracle_snapshot_binding_mismatch/);
  const authority = structuredClone(run.oracleAuthority); authority.allowedStructuralChanges = ["context.budget.explicit", "context.intent.explicit"]; rehash(authority, "authorityHash"); const anchor = trustSyntheticOracleAuthorityForLocalEvaluation(authority, "local-exact-set-test");
  const expectation = { oracleId: authority.oracleId, scenarioId: authority.scenarioId, expectedStructuralChanges: authority.allowedStructuralChanges, expectedInputChanges: authority.allowedInputChanges, expectedHardConstraintSetChanged: authority.expectedHardConstraintSetChanged, expectedSoftPreferenceSetChanged: authority.expectedSoftPreferenceSetChanged, expectedEligibilityEffect: authority.eligibilityExpectation, validFrom: authority.validFrom, validUntil: authority.validUntil, allowedScenarioIds: authority.allowedScenarioIds };
  const oracle = createStructuralOracle(expectation, authority, anchor);
  assert.throws(() => buildContextFlipReport(run.baseVerified, run.flippedVerified, oracle, authority, anchor), /context_oracle_structural_expectation_failed/);
});

test("recursive integrity rejects rehashed inner semantic manipulation", async () => {
  const run = await runPhase3AContextFixture(); const snapshot = structuredClone(run.snapshot); const budget = snapshot.dimensions.find((item) => item.dimensionKey === "context.budget.explicit"); budget.value.conceptIds = ["fixture.budget.broad"]; rehash(budget, "dimensionHash"); rehash(snapshot, "contextHash");
  assert.throws(() => validateContextSnapshotIntegrity(snapshot, run.authority, run.trustAnchor, run.registry, run.policy, run.client), /context_explicit_claim_binding_mismatch/);
});

test("recursive integrity rejects rehashed server-authorized value and removed constraints", async () => {
  const run = await runPhase3AContextFixture(); const changed = structuredClone(run.snapshot); const serverTime = changed.dimensions.find((item) => item.dimensionKey === "context.time.server"); serverTime.value.value = "2026-01-15T13:00:00Z"; rehash(serverTime, "dimensionHash"); rehash(changed, "contextHash"); assert.throws(() => validateContextSnapshotIntegrity(changed, run.authority, run.trustAnchor, run.registry, run.policy, run.client), /context_server_time_dimension_mismatch/);
  const removed = structuredClone(run.snapshot); removed.hardConstraints = []; rehash(removed, "contextHash"); assert.throws(() => validateContextSnapshotIntegrity(removed, run.authority, run.trustAnchor, run.registry, run.policy, run.client), /context_hard_constraint_set_mismatch/);
});

test("recursive integrity binds full location, timing, source domains, missing states and soft-preference sources", async () => {
  const client = phase3AClientInput({ softPreferences: [{ preferenceId: "fixture-distance", dimensionKey: "context.distance-willingness.explicit", preferredValue: { kind: "DISTANCE_METERS", meters: 3_000 } }] });
  const run = await runPhase3AContextFixture({ client });
  const mutations = [
    ["location", (snapshot) => { snapshot.location.authorizedScope.radiusMeters = 1; }, /context_snapshot_location_binding_mismatch/],
    ["timing", (snapshot) => { snapshot.temporal.requestTiming.ageSeconds = 42; }, /context_snapshot_temporal_binding_mismatch/],
    ["derived-local", (snapshot) => { const local = snapshot.dimensions.find((item) => item.dimensionKey === "context.time.local"); local.value.value = "2099-01-01T00:00:00@Europe\/Zurich"; const proof = { dimensionKey: local.dimensionKey, value: local.value, ruleId: local.ruleId, ruleVersion: local.ruleVersion, sourceHashes: [...local.sourceHashes].sort(), derivedAt: local.derivedAt, limitations: [...local.limitations].sort() }; local.proofHash = contentHash(proof); rehash(local, "dimensionHash"); }, /context_local_time_dimension_mismatch/],
    ["world", (snapshot) => { snapshot.sourceBindings.worldSnapshotBindingHash = "3".repeat(64); }, /context_snapshot_source_binding_mismatch/],
    ["eligibility-policy", (snapshot) => { snapshot.sourceBindings.eligibilityPolicyBindingHash = "6".repeat(64); }, /context_snapshot_source_binding_mismatch/],
    ["missing", (snapshot) => { const occasion = snapshot.dimensions.find((item) => item.dimensionKey === "context.occasion.explicit"); occasion.state = "UNKNOWN"; occasion.authority = "UNKNOWN"; occasion.reasonCode = "value-not-known"; rehash(occasion, "dimensionHash"); }, /context_missing_dimension_binding_mismatch/],
    ["soft-source", (snapshot) => { snapshot.softPreferences[0].sourceDimensionHash = "4".repeat(64); rehash(snapshot.softPreferences[0], "preferenceHash"); }, /context_soft_preference_source_mismatch/],
    ["limitation", (snapshot) => { snapshot.limitations = []; }, /context_snapshot_limitation_binding_mismatch/],
  ];
  for (const [label, mutate, expected] of mutations) {
    const snapshot = structuredClone(run.snapshot); mutate(snapshot); rehash(snapshot, "contextHash");
    assert.throws(() => validateContextSnapshotIntegrity(snapshot, run.authority, run.trustAnchor, run.registry, run.policy, run.client), expected, label);
  }
});

test("unsupported constraints and preferences never gain a silent Context channel", async () => {
  const unknownHard = phase3AClientInput({ hardConstraints: [{ constraintId: "unsupported-hard", dimensionKey: "context.unknown", operator: "REQUIRE_TRUE", expectedValue: { kind: "BOOLEAN", value: true } }] });
  await assert.rejects(runPhase3AContextFixture({ client: unknownHard }), /context_dimension_not_registered/);
  const unknownSoft = phase3AClientInput({ softPreferences: [{ preferenceId: "unsupported-soft", dimensionKey: "context.unknown", preferredValue: { kind: "BOOLEAN", value: true } }] });
  await assert.rejects(runPhase3AContextFixture({ client: unknownSoft }), /context_soft_preference_not_registered/);
});

test("contract versions reject unknown values fail closed", () => {
  const input = phase3AClientInput(); assert.throws(() => ContextKernelClientInputSchema.parse({ ...input, contractVersion: "unknown" }), /expected/); assert.equal(input.contractVersion, CONTEXT_KERNEL_VERSIONS.clientInput);
});
