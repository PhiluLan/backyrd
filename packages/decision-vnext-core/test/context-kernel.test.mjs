import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTEXT_AUTHORITIES, CONTEXT_DEGRADATION_MATRIX, CONTEXT_KERNEL_VERSIONS,
  ContextAuthorityRecordSchema, ContextDimensionValueSchema, ContextKernelClientInputSchema,
  SyntheticContextWeatherProvider, canonicalJson, contentHash, createFixtureContextPolicy,
  buildContextFlipReport, createFixtureContextRegistry, createServerSessionState, createStructuralOracle,
  createSyntheticContextAuthority, phase3AClientInput, phase3ARequest, projectContextForConsumer,
  replayContextFlipWorkbench, resolveContextKernel, runContextFlipScenario, runContextFlipWorkbench, runPhase3AContextFixture,
  loadAcceptedPhase3AOracleRelease, selectAcceptedOracleArtifacts, trustSyntheticContextAuthority, validateOracleCatalogStructure,
  unknownConstraintDisposition, validateContextFlipReport, validateOracleAuthority,
  validateContextSnapshotIntegrity, validateScenarioOracle, validateContextExecutionEnvelope,
  verifyContextForConsumers,
} from "../dist/index.js";
import {
  PHASE3A_ORACLE_AUTHORITY_CATALOG,
  PHASE3A_ORACLE_RELEASE,
  PHASE3A_ORACLE_TRUST_ANCHOR_CATALOG,
  PHASE3A_RELEASE_SCENARIO_IDS,
} from "../dist/context-oracle-release-fixture.js";

const rehash = (value, field) => { value[field] = contentHash(Object.fromEntries(Object.entries(value).filter(([key]) => key !== field))); };
const rehashWorkbench = (value) => rehash(value, "workbenchHash");
const rehashReportAndWorkbench = (value, index = 5) => { rehash(value.scenarios[index], "reportHash"); rehashWorkbench(value); return value; };
const acceptedOracleCatalogs = () => loadAcceptedPhase3AOracleRelease();
const cloneOracleRelease = () => ({ authority: structuredClone(PHASE3A_ORACLE_AUTHORITY_CATALOG), trust: structuredClone(PHASE3A_ORACLE_TRUST_ANCHOR_CATALOG), release: structuredClone(PHASE3A_ORACLE_RELEASE) });
const fullyRehashOracleRelease = (value, index = 5) => {
  const entry = value.authority.entries[index]; const authority = entry.authority;
  rehash(authority, "authorityHash");
  Object.assign(entry, {
    scenarioId: authority.scenarioId, oracleId: authority.oracleId, oracleVersion: authority.oracleVersion,
    authorityRecordId: authority.authorityRecordId, authorityRecordHash: authority.authorityHash,
    baseScenarioIdentity: authority.baseContextIdentity, flippedScenarioIdentity: authority.flippedContextIdentity,
    expectedStructuralChanges: authority.allowedStructuralChanges, expectedInputChanges: authority.allowedInputChanges,
    expectedHardConstraintSetChanged: authority.expectedHardConstraintSetChanged, expectedSoftPreferenceSetChanged: authority.expectedSoftPreferenceSetChanged,
    eligibilityExpectation: authority.eligibilityExpectation, rankingExpectation: authority.rankingExpectation,
    approvalClass: authority.approvalClass, validFrom: authority.validFrom, validUntil: authority.validUntil,
    allowedScenarioIds: authority.allowedScenarioIds,
  });
  rehash(entry, "entryHash"); rehash(value.authority, "catalogHash");
  const anchor = value.trust.entries[index]; Object.assign(anchor, { scenarioId: authority.scenarioId, authorityRecordId: authority.authorityRecordId, acceptedAuthorityHash: authority.authorityHash, acceptedIssuer: authority.issuer, acceptedOracleId: authority.oracleId, acceptedOracleVersion: authority.oracleVersion }); rehash(anchor, "anchorHash");
  value.trust.authorityCatalogHash = value.authority.catalogHash; rehash(value.trust, "catalogHash");
  value.release.authorityCatalogHash = value.authority.catalogHash; value.release.trustAnchorCatalogHash = value.trust.catalogHash; rehash(value.release, "releaseHash");
  return value;
};

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
  const catalogs = acceptedOracleCatalogs(); const { baseVerified, flippedVerified, report } = await runContextFlipScenario("budget-narrow-vs-broad"); validateContextFlipReport(report, baseVerified, flippedVerified, catalogs);
  const tampered = structuredClone(report); tampered.changedDimensionKeys = []; rehash(tampered, "reportHash"); assert.throws(() => validateContextFlipReport(tampered, baseVerified, flippedVerified, catalogs), /context_flip_replay_mismatch|context_oracle_structural_expectation_failed/);
  const oracle = structuredClone(report.oracle); oracle.rankingDirection = "FOUNDER_APPROVED_DIRECTION"; rehash(oracle, "oracleHash"); assert.throws(() => validateScenarioOracle(oracle, catalogs), /context_oracle_product_claim_not_authorized|expected/);
  const forged = structuredClone(report.oracle); forged.expectationClass = "FOUNDER_APPROVED_EXPECTATION"; forged.productApprovalStatus = "FOUNDER_APPROVED"; rehash(forged, "oracleHash"); assert.throws(() => validateScenarioOracle(forged, catalogs), /context_oracle_product_claim_not_authorized|expected/);
});

test("accepted Oracle catalogs are separately hashed, closed, and cannot self-authorize", async () => {
  const catalogs = acceptedOracleCatalogs(); const run = await runContextFlipScenario("budget-narrow-vs-broad"); validateOracleAuthority(run.oracleAuthority, run.oracleTrustAnchor);
  assert.equal(catalogs.authorityCatalog.entries.length, 15); assert.equal(catalogs.trustAnchorCatalog.entries.length, 15); assert.deepEqual(catalogs.release.scenarioAllowlist, PHASE3A_RELEASE_SCENARIO_IDS);
  const publicCore = await import("../dist/index.js"); assert.equal("trustSyntheticOracleAuthorityForLocalEvaluation" in publicCore, false); assert.equal("createStructuralOracleAuthority" in publicCore, false); assert.equal("validateAcceptedOracleCatalogs" in publicCore, false);
  const forgedAuthority = structuredClone(run.oracleAuthority); forgedAuthority.scenarioId = "attacker-scenario"; forgedAuthority.allowedScenarioIds = ["attacker-scenario"]; rehash(forgedAuthority, "authorityHash");
  assert.throws(() => validateOracleAuthority(forgedAuthority, run.oracleTrustAnchor), /context_oracle_authority_not_trusted/);
  const fakeAnchor = structuredClone(run.oracleTrustAnchor); fakeAnchor.acceptedAuthorityHash = "0".repeat(64); rehash(fakeAnchor, "anchorHash"); assert.throws(() => validateOracleAuthority(run.oracleAuthority, fakeAnchor), /context_oracle_authority_not_trusted/);
  const selfAuthorized = cloneOracleRelease(); selfAuthorized.authority.entries[5].authority.allowedStructuralChanges = ["context.budget.explicit", "context.intent.explicit"]; const fullyRehashed = fullyRehashOracleRelease(selfAuthorized);
  const structural = validateOracleCatalogStructure(fullyRehashed.authority, fullyRehashed.trust, fullyRehashed.release, PHASE3A_RELEASE_SCENARIO_IDS);
  assert.throws(() => selectAcceptedOracleArtifacts(structural, "budget-narrow-vs-broad"), /require_verified_release_capability/);
  assert.throws(() => createStructuralOracle({ oracleId: structural.authorityCatalog.entries[5].oracleId, scenarioId: "budget-narrow-vs-broad", expectedStructuralChanges: structural.authorityCatalog.entries[5].expectedStructuralChanges, expectedInputChanges: structural.authorityCatalog.entries[5].expectedInputChanges, expectedHardConstraintSetChanged: false, expectedSoftPreferenceSetChanged: false, expectedEligibilityEffect: "NOT_CONFIGURED", validFrom: structural.authorityCatalog.entries[5].validFrom, validUntil: structural.authorityCatalog.entries[5].validUntil, allowedScenarioIds: ["budget-narrow-vs-broad"] }, structural), /require_verified_release_capability/);
});

test("rehashing Oracle and report cannot authorize changed expectations or Product claims", async () => {
  const catalogs = acceptedOracleCatalogs(); const run = await runContextFlipScenario("budget-narrow-vs-broad");
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
    assert.throws(() => validateContextFlipReport(report, run.baseVerified, run.flippedVerified, catalogs), /context_oracle_|expected/, label);
  }
});

test("flip comparison accepts only verified contexts and exact authorized changes", async () => {
  const catalogs = acceptedOracleCatalogs(); const run = await runContextFlipScenario("budget-narrow-vs-broad");
  assert.throws(() => buildContextFlipReport(run.base.snapshot, run.flipped.snapshot, run.report.oracle, catalogs), /context_consumer_requires_verified_envelope/);
  assert.throws(() => buildContextFlipReport(run.flippedVerified, run.baseVerified, run.report.oracle, catalogs), /context_oracle_snapshot_binding_mismatch/);
  const other = await runContextFlipScenario("weather-dry-vs-rain");
  assert.throws(() => buildContextFlipReport(run.baseVerified, other.flippedVerified, run.report.oracle, catalogs), /context_flip_cross_domain_binding_changed|context_oracle_snapshot_binding_mismatch/);
  const extra = structuredClone(run.report); extra.changedDimensionKeys.push("context.intent.explicit"); rehash(extra, "reportHash"); assert.throws(() => validateContextFlipReport(extra, run.baseVerified, run.flippedVerified, catalogs), /context_flip_replay_mismatch/);
  const missing = structuredClone(run.report); missing.changedDimensionKeys = []; rehash(missing, "reportHash"); assert.throws(() => validateContextFlipReport(missing, run.baseVerified, run.flippedVerified, catalogs), /context_flip_replay_mismatch/);
  const constraint = structuredClone(run.report); constraint.hardConstraintSetChanged = true; constraint.softPreferenceSetChanged = true; rehash(constraint, "reportHash"); assert.throws(() => validateContextFlipReport(constraint, run.baseVerified, run.flippedVerified, catalogs), /context_flip_replay_mismatch/);
});

test("catalog release rejects missing, additional, duplicate, unknown, and relabeled artifacts", () => {
  const validate = (value) => validateOracleCatalogStructure(value.authority, value.trust, value.release, PHASE3A_RELEASE_SCENARIO_IDS);
  const missingAuthority = cloneOracleRelease(); missingAuthority.authority.entries.pop(); rehash(missingAuthority.authority, "catalogHash"); assert.throws(() => validate(missingAuthority), /minimum items|entry_count|release_catalog/);
  const missingAnchor = cloneOracleRelease(); missingAnchor.trust.entries.pop(); rehash(missingAnchor.trust, "catalogHash"); assert.throws(() => validate(missingAnchor), /minimum items|entry_count|release_catalog/);
  const additional = cloneOracleRelease(); additional.authority.entries.push(structuredClone(additional.authority.entries[0])); rehash(additional.authority, "catalogHash"); assert.throws(() => validate(additional), /maximum items/);
  for (const field of ["scenarioId", "oracleId", "authorityRecordId"]) { const duplicate = cloneOracleRelease(); duplicate.authority.entries[1][field] = duplicate.authority.entries[0][field]; rehash(duplicate.authority.entries[1], "entryHash"); rehash(duplicate.authority, "catalogHash"); duplicate.trust.authorityCatalogHash = duplicate.authority.catalogHash; rehash(duplicate.trust, "catalogHash"); duplicate.release.authorityCatalogHash = duplicate.authority.catalogHash; duplicate.release.trustAnchorCatalogHash = duplicate.trust.catalogHash; rehash(duplicate.release, "releaseHash"); assert.throws(() => validate(duplicate), /duplicate|entry_binding|catalog_order/); }
  const unknown = cloneOracleRelease(); unknown.authority.catalogVersion = "unknown-authority-catalog-version"; rehash(unknown.authority, "catalogHash"); assert.throws(() => validate(unknown), /expected/);
  const relabeled = cloneOracleRelease(); relabeled.authority.entries[5].authority.rankingExpectation = "FOUNDER_APPROVED_DIRECTION"; assert.throws(() => validate(relabeled), /expected/);
  const production = cloneOracleRelease(); production.release.productionCapable = true; rehash(production.release, "releaseHash"); assert.throws(() => validate(production), /expected/);
});

test("accepted release pins expectations, inputs, sides, constraints, and approval state despite complete rehash", () => {
  const mutations = [
    ["dimensions", (entry) => { entry.authority.allowedStructuralChanges = ["context.budget.explicit", "context.intent.explicit"]; }],
    ["inputs", (entry) => { entry.authority.allowedInputChanges = ["CLIENT_REQUEST", "AUTHORITY_LOCATION"]; }],
    ["base identity", (entry) => { entry.authority.baseContextIdentity = "1".repeat(64); }],
    ["flip identity", (entry) => { entry.authority.flippedContextIdentity = "2".repeat(64); }],
    ["hard set", (entry) => { entry.authority.expectedHardConstraintSetChanged = true; }],
    ["soft set", (entry) => { entry.authority.expectedSoftPreferenceSetChanged = true; }],
  ];
  for (const [label, mutate] of mutations) {
    const value = cloneOracleRelease(); mutate(value.authority.entries[5]); fullyRehashOracleRelease(value);
    const structural = validateOracleCatalogStructure(value.authority, value.trust, value.release, PHASE3A_RELEASE_SCENARIO_IDS);
    assert.throws(() => selectAcceptedOracleArtifacts(structural, "budget-narrow-vs-broad"), /require_verified_release_capability/, label);
  }
  for (const [label, mutate, error] of [
    ["registry", (entry) => { entry.registryVersion = "unknown-registry-version"; }, /registry_version_unknown/],
    ["policy", (entry) => { entry.contextPolicyVersion = "unknown-policy-version"; }, /policy_version_unknown/],
    ["workbench", (entry) => { entry.workbenchVersion = "unknown-workbench-version"; }, /workbench_version_unknown/],
  ]) {
    const value = cloneOracleRelease(); mutate(value.authority.entries[5]); fullyRehashOracleRelease(value);
    assert.throws(() => validateOracleCatalogStructure(value.authority, value.trust, value.release, PHASE3A_RELEASE_SCENARIO_IDS), error, label);
  }
  const product = cloneOracleRelease(); product.authority.entries[5].productQualityClaim = true; rehash(product.authority.entries[5], "entryHash"); rehash(product.authority, "catalogHash"); assert.throws(() => validateOracleCatalogStructure(product.authority, product.trust, product.release, PHASE3A_RELEASE_SCENARIO_IDS), /expected/);
  const approvedAnchor = cloneOracleRelease(); approvedAnchor.trust.entries[5].productApproved = true; rehash(approvedAnchor.trust.entries[5], "anchorHash"); rehash(approvedAnchor.trust, "catalogHash"); assert.throws(() => validateOracleCatalogStructure(approvedAnchor.authority, approvedAnchor.trust, approvedAnchor.release, PHASE3A_RELEASE_SCENARIO_IDS), /expected/);
});

test("catalog, report, side, and release identities are recursively bound", async () => {
  const catalogs = acceptedOracleCatalogs(); const run = await runContextFlipScenario("budget-narrow-vs-broad");
  const changedIdentity = structuredClone(run.report); changedIdentity.baseDecisionIdentity = "0".repeat(64); rehash(changedIdentity, "reportHash"); assert.throws(() => validateContextFlipReport(changedIdentity, run.baseVerified, run.flippedVerified, catalogs), /context_flip_replay_mismatch/);
  assert.throws(() => validateContextFlipReport(run.report, run.flippedVerified, run.baseVerified, catalogs), /context_oracle_snapshot_binding_mismatch/);
  const oldReportNewCatalog = structuredClone(catalogs); oldReportNewCatalog.authorityCatalog.catalogHash = "0".repeat(64); assert.throws(() => validateContextFlipReport(run.report, run.baseVerified, run.flippedVerified, oldReportNewCatalog), /release_binding_mismatch/);
  const newReportOldAnchor = structuredClone(run.report); newReportOldAnchor.oracleTrustAnchorCatalogHash = "0".repeat(64); rehash(newReportOldAnchor, "reportHash"); assert.throws(() => validateContextFlipReport(newReportOldAnchor, run.baseVerified, run.flippedVerified, catalogs), /release_binding_mismatch/);
  const workbench = await runContextFlipWorkbench(); const replay = await replayContextFlipWorkbench(workbench); assert.equal(canonicalJson(workbench), canonicalJson(replay));
});

test("recursive Workbench replay rejects inner semantic manipulation after every reachable rehash", async () => {
  const canonical = await runContextFlipWorkbench();
  const mutations = [
    ["dimension with outer hash only", (value) => { value.scenarios[5].changedDimensionKeys = []; rehashWorkbench(value); }],
    ["dimension with report and outer hash", (value) => { value.scenarios[5].changedDimensionKeys = []; rehashReportAndWorkbench(value); }],
    ["input classes", (value) => { value.scenarios[5].changedInputClasses = ["AUTHORITY_LOCATION"]; rehashReportAndWorkbench(value); }],
    ["hard constraint set", (value) => { value.scenarios[5].hardConstraintSetChanged = true; rehashReportAndWorkbench(value); }],
    ["soft preference set", (value) => { value.scenarios[5].softPreferenceSetChanged = true; rehashReportAndWorkbench(value); }],
    ["base and flip identities", (value) => { value.scenarios[5].baseDecisionIdentity = "1".repeat(64); value.scenarios[5].flippedDecisionIdentity = "2".repeat(64); rehashReportAndWorkbench(value); }],
    ["swapped base and flip", (value) => {
      const report = value.scenarios[5];
      for (const [baseKey, flipKey] of [["baseContextHash", "flippedContextHash"], ["baseDecisionIdentity", "flippedDecisionIdentity"], ["baseEnvelopeHash", "flippedEnvelopeHash"]]) [report[baseKey], report[flipKey]] = [report[flipKey], report[baseKey]];
      [report.oracle.baseContextHash, report.oracle.flippedContextHash] = [report.oracle.flippedContextHash, report.oracle.baseContextHash]; rehash(report.oracle, "oracleHash"); rehashReportAndWorkbench(value);
    }],
    ["oracle expectation", (value) => { value.scenarios[5].oracle.expectedStructuralChanges = ["context.intent.explicit"]; rehash(value.scenarios[5].oracle, "oracleHash"); rehashReportAndWorkbench(value); }],
    ["authority binding", (value) => { value.scenarios[5].oracle.authorityBinding.authorityHash = "3".repeat(64); value.scenarios[5].oracleAuthorityHash = "3".repeat(64); rehash(value.scenarios[5].oracle, "oracleHash"); rehashReportAndWorkbench(value); }],
    ["report from another scenario", (value) => { value.scenarios[5] = structuredClone(value.scenarios[4]); rehashWorkbench(value); }],
    ["unchanged inner report hash", (value) => { value.scenarios[5].changedDimensionKeys = []; rehashWorkbench(value); }],
    ["new runtime-valid report", (value) => { value.scenarios[5].unchangedDimensionKeys = value.scenarios[5].unchangedDimensionKeys.slice(1); rehashReportAndWorkbench(value); }],
  ];
  for (const [label, mutate] of mutations) {
    const forged = structuredClone(canonical); mutate(forged);
    await assert.rejects(replayContextFlipWorkbench(forged), /context_(?:flip|oracle)_|Hash_mismatch|content hash mismatch|expected/, label);
  }
});

test("recursive Workbench replay requires the exact released Scenario order and unique inner identities", async () => {
  const canonical = await runContextFlipWorkbench();
  const mutations = [
    ["missing", (value) => { value.scenarios.pop(); rehashWorkbench(value); }],
    ["additional", (value) => { value.scenarios.push(structuredClone(value.scenarios[0])); rehashWorkbench(value); }],
    ["duplicate", (value) => { value.scenarios[5] = structuredClone(value.scenarios[4]); rehashWorkbench(value); }],
    ["reordered", (value) => { [value.scenarios[4], value.scenarios[5]] = [value.scenarios[5], value.scenarios[4]]; rehashWorkbench(value); }],
    ["foreign", (value) => { value.scenarios[5].scenarioId = "foreign-context-scenario"; rehashReportAndWorkbench(value); }],
    ["duplicate report identity", (value) => { value.scenarios[5].reportHash = value.scenarios[4].reportHash; rehashWorkbench(value); }],
    ["duplicate oracle and authority", (value) => { const target = value.scenarios[5]; const source = value.scenarios[4]; target.oracle.oracleId = source.oracle.oracleId; target.oracle.authorityBinding.authorityRecordId = source.oracle.authorityBinding.authorityRecordId; rehash(target.oracle, "oracleHash"); rehashReportAndWorkbench(value); }],
  ];
  for (const [label, mutate] of mutations) {
    const forged = structuredClone(canonical); mutate(forged);
    await assert.rejects(replayContextFlipWorkbench(forged), /context_flip_|items|expected/, label);
  }
});

test("only the pinned loader can mint an Accepted Oracle capability", async () => {
  const attacker = cloneOracleRelease(); attacker.authority.entries[5].authority.allowedStructuralChanges = ["context.budget.explicit", "context.intent.explicit"];
  const selfSigned = fullyRehashOracleRelease(attacker);
  const structural = validateOracleCatalogStructure(selfSigned.authority, selfSigned.trust, selfSigned.release, PHASE3A_RELEASE_SCENARIO_IDS);
  for (const [label, candidate] of [
    ["structural", structural],
    ["cast-shaped", { authorityCatalog: structural.authorityCatalog, trustAnchorCatalog: structural.trustAnchorCatalog, release: structural.release }],
    ["spread", { ...loadAcceptedPhase3AOracleRelease() }],
    ["structured clone", structuredClone(loadAcceptedPhase3AOracleRelease())],
    ["serialized", JSON.parse(JSON.stringify(loadAcceptedPhase3AOracleRelease()))],
  ]) assert.throws(() => selectAcceptedOracleArtifacts(candidate, "budget-narrow-vs-broad"), /require_verified_release_capability/, label);
  assert.equal(loadAcceptedPhase3AOracleRelease.length, 0, "the capability loader accepts no caller-selected artifacts or hash");
  const accepted = loadAcceptedPhase3AOracleRelease(); assert.equal(selectAcceptedOracleArtifacts(accepted, "budget-narrow-vs-broad").authorityEntry.scenarioId, "budget-narrow-vs-broad");
  const stale = cloneOracleRelease(); stale.release.releaseId = "backyrd-vnext-context-oracle-release-phase3a-v0"; rehash(stale.release, "releaseHash"); assert.throws(() => validateOracleCatalogStructure(stale.authority, stale.trust, stale.release, PHASE3A_RELEASE_SCENARIO_IDS), /expected/);
});

test("positive Workbench replay rebuilds all fifteen reports byte-identically", async () => {
  const first = await runContextFlipWorkbench(); const rebuilt = await replayContextFlipWorkbench(first); const second = await runContextFlipWorkbench();
  assert.equal(canonicalJson(rebuilt), canonicalJson(first)); assert.equal(canonicalJson(second), canonicalJson(first));
  assert.equal(new Set(rebuilt.scenarios.map((report) => report.reportHash)).size, 15);
  assert.equal(new Set(rebuilt.scenarios.map((report) => report.oracle.oracleHash)).size, 15);
  assert.equal(new Set(rebuilt.scenarios.map((report) => report.oracleAuthorityHash)).size, 15);
  assert.ok(rebuilt.scenarios.every((report) => report.oracleReleaseHash === rebuilt.oracleReleaseHash));
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
