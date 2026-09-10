import assert from "node:assert/strict";
import test from "node:test";
import {
  CALIBRATION_CONCEPT_REGISTRY_HASH, CALIBRATION_CONCEPT_REGISTRY_VERSION,
  CALIBRATION_EVENT_TYPES, CALIBRATION_MODEL_DIMENSIONS, CALIBRATION_POLICY_CANDIDATES, CalibrationEvidenceSchema,
  CANONICAL_SIGNAL_SEMANTICS_REGISTRY, CONTRACT_VERSIONS, PHASE3B_CALIBRATION_SCENARIOS,
  PHASE3B_SYNTHETIC_SUBJECT, REQUIRED_LIFECYCLE_STORES, USER_INTELLIGENCE_LIFECYCLE_MANIFEST,
  USER_INTELLIGENCE_VNEXT_SCHEMA_CATALOG, canonicalJson, contentHash, createSyntheticCalibrationTrustContext,
  parseSignalSemanticsRegistry, planLifecycleImpact, runCalibrationScenario, signalSemantics,
  syntheticCalibrationEvidence, syntheticTrustForScenario, verifyCalibrationEvidence, verifyCalibrationPolicy,
  verifyCalibrationReport, withCalibrationScenarioHash,
} from "../dist/index.js";

const run = (index) => {
  const scenario = PHASE3B_CALIBRATION_SCENARIOS[index];
  const trust = syntheticTrustForScenario(scenario);
  return { scenario, trust, report: runCalibrationScenario(scenario, trust, trust) };
};

function rehashReport(report) {
  for (const result of report.results) {
    for (const interpretation of result.interpretations) {
      const body = { ...interpretation }; delete body.interpretationHash; interpretation.interpretationHash = contentHash(body);
    }
    const body = { ...result }; delete body.resultHash; result.resultHash = contentHash(body);
  }
  const body = { ...report }; delete body.reportHash; report.reportHash = contentHash(body);
  return report;
}

test("Phase 3B registry covers every requested signal exactly once and is canonical", () => {
  const registry = parseSignalSemanticsRegistry(CANONICAL_SIGNAL_SEMANTICS_REGISTRY);
  assert.equal(registry.entries.length, CALIBRATION_EVENT_TYPES.length);
  assert.deepEqual([...registry.entries.map((entry) => entry.eventType)].sort(), [...CALIBRATION_EVENT_TYPES].sort());
  assert.equal(registry.productionPolicyConfigured, false);
  assert.equal(new Set(registry.entries.map((entry) => entry.eventType)).size, registry.entries.length);
});

test("Standard and Smart Review have byte-equivalent learning semantics apart from event identity", () => {
  const standard = structuredClone(signalSemantics("STANDARD_REVIEW"));
  const smart = structuredClone(signalSemantics("SMART_REVIEW"));
  standard.eventType = "REVIEW"; smart.eventType = "REVIEW";
  assert.equal(canonicalJson(standard), canonicalJson(smart));
  assert.ok(standard.prohibitedConclusions.includes("REVIEW_IS_SATISFACTION"));
});

test("non-negotiable neutral semantics remain explicit", () => {
  assert.ok(signalSemantics("OPENED").prohibitedConclusions.includes("OPEN_IS_LIKE"));
  assert.ok(signalSemantics("SAVE_REMOVED").prohibitedConclusions.includes("SAVE_REMOVAL_IS_DISLIKE"));
  assert.ok(signalSemantics("VISITED").prohibitedConclusions.includes("VISIT_IS_POSITIVE_SATISFACTION"));
  assert.equal(signalSemantics("DWELL").status, "NOT_CONFIGURED");
  assert.equal(signalSemantics("QUICK_SKIP").status, "NOT_CONFIGURED");
});

test("all three policy candidates are calibration-only, hash-bound and independently accepted", () => {
  assert.equal(CALIBRATION_POLICY_CANDIDATES.length, 3);
  const trust = createSyntheticCalibrationTrustContext();
  for (const policy of CALIBRATION_POLICY_CANDIDATES) {
    assert.equal(verifyCalibrationPolicy(policy, trust).policyHash, policy.policyHash);
    assert.equal(policy.authority, "CALIBRATION_ONLY"); assert.equal(policy.productionAuthorized, false);
    assert.equal(policy.sufficiencyStrategy.productCalibrated, false);
    assert.equal(policy.sufficiencyStrategy.productionAuthorized, false);
    assert.equal(policy.reducer.productionRelease, false);
    assert.equal(policy.conceptRegistry.registryVersion, CALIBRATION_CONCEPT_REGISTRY_VERSION);
    assert.equal(policy.conceptRegistry.registryHash, CALIBRATION_CONCEPT_REGISTRY_HASH);
    assert.equal(policy.conceptRegistry.productionAuthorized, false);
  }
});

test("policy and evidence concepts are fail-closed against the accepted synthetic registry", () => {
  const policy = structuredClone(CALIBRATION_POLICY_CANDIDATES[0]);
  policy.conceptRegistry.registryHash = contentHash("foreign-registry");
  const policyBody = { ...policy }; delete policyBody.policyHash; policy.policyHash = contentHash(policyBody);
  assert.throws(() => verifyCalibrationPolicy(policy, createSyntheticCalibrationTrustContext()), /expected|unknown or altered/i);

  const foreign = syntheticCalibrationEvidence({ id: "foreign-concept", eventType: "EXPLICIT_SATISFACTION", concepts: [{ registryVersion: "foreign.registry@1", conceptId: "foreign-concept", certainty: "VERIFIED" }] });
  assert.throws(() => verifyCalibrationEvidence(foreign, PHASE3B_SYNTHETIC_SUBJECT, createSyntheticCalibrationTrustContext([foreign])), /accepted synthetic registry/i);
});

test("the external evidence boundary rejects client-selected model semantics", () => {
  const evidence = syntheticCalibrationEvidence({ id: "strict-boundary", eventType: "OPENED" });
  for (const field of ["signalStrength", "policyId", "dimension", "satisfaction"]) {
    assert.throws(() => CalibrationEvidenceSchema.parse({ ...evidence, [field]: "attacker-value" }), /unknown field/i);
  }
});

test("a renamed and fully rehashed policy cannot become Production authority", () => {
  const trust = createSyntheticCalibrationTrustContext();
  const forged = structuredClone(CALIBRATION_POLICY_CANDIDATES[0]);
  forged.policyId = "production-policy"; forged.policyVersion = "production-v1";
  const body = { ...forged }; delete body.policyHash; forged.policyHash = contentHash(body);
  assert.throws(() => verifyCalibrationPolicy(forged, trust), /unknown or altered|expected CALIBRATION_ONLY/i);
  const relabeled = structuredClone(CALIBRATION_POLICY_CANDIDATES[0]); relabeled.authority = "PRODUCTION";
  assert.throws(() => verifyCalibrationPolicy(relabeled, trust), /CALIBRATION_ONLY/i);
});

test("unaccepted or modified evidence fails against the external evidence trust anchor", () => {
  const evidence = syntheticCalibrationEvidence({ id: "authority-proof", eventType: "EXPLICIT_SATISFACTION" });
  const trust = createSyntheticCalibrationTrustContext([evidence]);
  assert.equal(verifyCalibrationEvidence(evidence, PHASE3B_SYNTHETIC_SUBJECT, trust).recordId, evidence.recordId);
  const changed = { ...evidence, spotId: "foreign-spot" }; const body = { ...changed }; delete body.recordHash; changed.recordHash = contentHash(body);
  assert.throws(() => verifyCalibrationEvidence(changed, PHASE3B_SYNTHETIC_SUBJECT, trust), /independently accepted/);
  assert.throws(() => verifyCalibrationEvidence(evidence, contentHash("foreign-subject"), trust), /foreign subject/);
  assert.throws(() => verifyCalibrationEvidence(evidence, PHASE3B_SYNTHETIC_SUBJECT, createSyntheticCalibrationTrustContext()), /expected object/i);
});

test("events cannot self-declare satisfaction, authority or independence", () => {
  const save = syntheticCalibrationEvidence({ id: "self-declared-save", eventType: "SAVED" });
  for (const change of [
    { explicitOutcome: "POSITIVE" }, { authority: "CLIENT_OBSERVATION" },
    { journeyId: null, independenceEligible: true },
  ]) {
    const forged = { ...save, ...change }; const body = { ...forged }; delete body.recordHash; forged.recordHash = contentHash(body);
    const trust = createSyntheticCalibrationTrustContext([forged]);
    assert.throws(() => verifyCalibrationEvidence(forged, PHASE3B_SYNTHETIC_SUBJECT, trust), /self-declare|not permitted|unresolved journey/i);
  }
});

test("the complete 34-scenario lab is deterministic and compares A, B and C", () => {
  assert.equal(PHASE3B_CALIBRATION_SCENARIOS.length, 34);
  for (const scenario of PHASE3B_CALIBRATION_SCENARIOS) {
    const trust = syntheticTrustForScenario(scenario);
    const first = runCalibrationScenario(scenario, trust, trust); const replay = runCalibrationScenario(scenario, trust, trust);
    assert.equal(first.reportHash, replay.reportHash, scenario.scenarioId);
    assert.equal(canonicalJson(first), canonicalJson(replay), scenario.scenarioId);
    assert.deepEqual(first.results.map((result) => result.policyId), ["candidate-a-conservative", "candidate-b-balanced", "candidate-c-context"]);
    assert.equal(first.productionProjection.status, "NEUTRAL"); assert.equal(first.productionProjection.containsPersonalModelData, false);
  }
});

test("single save distinguishes candidates without becoming satisfaction or concept taste", () => {
  const { report } = run(1); const [a, b, c] = report.results;
  assert.equal(a.interpretations.length, 0);
  assert.deepEqual(b.interpretations.map((item) => item.dimension), ["DIRECT_SPOT_AFFINITY"]);
  assert.deepEqual(c.interpretations.map((item) => item.dimension), ["RECENT_PREFERENCE"]);
  assert.ok([...b.interpretations, ...c.interpretations].every((item) => item.direction === "UNKNOWN"));
});

test("save removal, open, navigation, visit and review never manufacture satisfaction", () => {
  for (const index of [2, 3, 4, 5, 6]) {
    const { report } = run(index);
    assert.ok(report.results.flatMap((result) => result.interpretations).every((item) => item.direction === "UNKNOWN"), report.scenarioId);
    assert.ok(report.results.flatMap((result) => result.interpretations).every((item) => item.dimension !== "AVERSION"), report.scenarioId);
  }
});

test("explicit positive and negative outcomes remain separate and conflicts survive", () => {
  const positive = run(7).report.results[0]; const negative = run(8).report.results[0]; const mixed = run(9).report.results[0];
  assert.ok(positive.interpretations.some((item) => item.direction === "POSITIVE"));
  assert.ok(negative.interpretations.some((item) => item.dimension === "AVERSION" && item.direction === "NEGATIVE"));
  assert.equal(mixed.sufficiency.conflictLevel, "CONFLICTING"); assert.equal(mixed.sufficiency.state, "CONFLICTING");
});

test("three events in one journey create at most one independent unit", () => {
  const { report } = run(10);
  for (const result of report.results) assert.ok(result.sufficiency.independentExperienceCount <= 1);
});

test("independent visits and repeat visits can inform only their configured candidate dimensions", () => {
  const visits = run(11).report.results; const repeats = run(12).report.results;
  assert.equal(visits[1].sufficiency.independentExperienceCount, 3);
  assert.ok(repeats[1].interpretations.every((item) => item.dimension === "EXPLORATION_FAMILIARITY"));
  assert.equal(repeats[0].interpretations.length, 0);
});

test("many concepts in one experience share attribution and independence", () => {
  const { report } = run(14);
  for (const result of report.results) {
    if (result.interpretations.length < 2) continue;
    assert.equal(new Set(result.interpretations.map((item) => item.attributionUnitId)).size, 1);
    assert.equal(new Set(result.interpretations.map((item) => item.independenceUnit)).size, 1);
    assert.equal(result.sufficiency.independentExperienceCount, 1);
  }
});

test("context-sensitive candidate never transfers context into long-term taste", () => {
  const contextFlip = run(15).report.results[2];
  assert.ok(contextFlip.interpretations.length > 0);
  assert.ok(contextFlip.interpretations.every((item) => item.dimension === "CONTEXTUAL_TASTE"));
  assert.ok(contextFlip.interpretations.every((item) => item.contextHash));
  assert.equal(new Set(contextFlip.interpretations.map((item) => item.key)).size, 2);
  assert.equal(contextFlip.domainSufficiency.find((item) => item.dimension === "LONG_TERM_CONCEPT_TASTE").state, "NOTHING_KNOWN");
});

test("fixture recency separates stale evidence without changing history", () => {
  const oldSave = syntheticCalibrationEvidence({ id: "old-save", eventType: "SAVED", occurredAt: "2025-12-31T23:59:59.000Z" });
  const scenario = withCalibrationScenarioHash({ contractVersion: CONTRACT_VERSIONS.calibrationScenario, scenarioId: "fixture-recency", title: "fixture-recency", subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT, lifecycle: "ACTIVE", killSwitch: false, interpretedAt: "2026-02-01T12:00:00.000Z", evidence: [oldSave] });
  const trust = createSyntheticCalibrationTrustContext([oldSave]);
  const report = runCalibrationScenario(scenario, trust, trust);
  assert.ok(report.results[2].ignoredEvidence.some((item) => item.reason === "OUTSIDE_FIXTURE_RECENCY_WINDOW"));
  assert.equal(report.results[0].policyVersion !== report.results[2].policyVersion, true);
  assert.equal(scenario.evidence[0].recordHash, oldSave.recordHash);
});

test("large weak volume cannot erase an explicit negative outcome", () => {
  const negative = syntheticCalibrationEvidence({ id: "strong-negative", eventType: "EXPLICIT_DISSATISFACTION", journey: "journey-strong-negative", context: { contextHash: contentHash("weak-vs-explicit-context"), dimensions: ["friends"], authority: "EXPLICIT_USER" } });
  const opens = Array.from({ length: 64 }, (_, index) => syntheticCalibrationEvidence({ id: `weak-open-${index}`, eventType: "OPENED", journey: `journey-weak-${index}` }));
  const scenario = withCalibrationScenarioHash({ contractVersion: CONTRACT_VERSIONS.calibrationScenario, scenarioId: "weak-vs-explicit", title: "weak-vs-explicit", subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT, lifecycle: "ACTIVE", killSwitch: false, interpretedAt: "2026-02-01T12:00:00.000Z", evidence: [negative, ...opens] });
  const trust = createSyntheticCalibrationTrustContext(scenario.evidence);
  for (const result of runCalibrationScenario(scenario, trust, trust).results) {
    assert.ok(result.interpretations.some((item) => item.direction === "NEGATIVE"));
    assert.equal(result.interpretations.some((item) => item.evidenceRecordId.startsWith("calibration-evidence-weak-open")), false);
  }
});

test("practical, direct spot and concept domains remain structurally separate", () => {
  const practical = run(17).report.results[1]; const direct = run(18).report.results[1];
  assert.ok(practical.interpretations.some((item) => item.dimension === "PRACTICAL_PREFERENCE"));
  assert.ok(practical.interpretations.some((item) => item.dimension === "LONG_TERM_CONCEPT_TASTE"));
  assert.ok(direct.interpretations.every((item) => item.dimension === "DIRECT_SPOT_AFFINITY"));
  assert.ok(direct.interpretations.every((item) => item.key.startsWith("spot:")));
});

test("uncertain World attribution stays unresolved instead of becoming concept taste", () => {
  const { report } = run(26);
  for (const result of report.results) {
    assert.ok(result.interpretations.every((item) => !item.key.includes("vibe.synthetic-cozy")));
    if (result.interpretations.length) assert.equal(result.sufficiency.worldKnowledgeCertainty, "CONFLICTING");
  }
});

test("correction is append-only and removes the target from active interpretation", () => {
  const { scenario, report } = run(22); const target = scenario.evidence[0]; const correction = scenario.evidence[1];
  for (const result of report.results) {
    assert.ok(!result.usedEvidenceRecordIds.includes(target.recordId));
    assert.ok(result.ignoredEvidence.some((item) => item.recordId === target.recordId && item.reason === "CORRECTED_OR_INACTIVE"));
    assert.ok(result.usedEvidenceRecordIds.includes(correction.recordId));
  }
});

test("correction targets must be unique, present and temporally prior", () => {
  const target = syntheticCalibrationEvidence({ id: "correction-integrity-target", eventType: "EXPLICIT_SATISFACTION", journey: "journey-correction-integrity", occurredAt: "2026-01-02T00:00:00.000Z" });
  for (const correction of [
    syntheticCalibrationEvidence({ id: "missing-correction-target", eventType: "CORRECTION", journey: "journey-correction-integrity", spot: null, supersedesRecordId: "evidence-missing" }),
    syntheticCalibrationEvidence({ id: "early-correction", eventType: "CORRECTION", journey: "journey-correction-integrity", spot: null, supersedesRecordId: target.recordId, occurredAt: "2026-01-01T00:00:00.000Z" }),
  ]) {
    const scenario = withCalibrationScenarioHash({ contractVersion: CONTRACT_VERSIONS.calibrationScenario, scenarioId: `invalid-${correction.recordId}`, title: `invalid-${correction.recordId}`, subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT, lifecycle: "ACTIVE", killSwitch: false, interpretedAt: "2026-02-01T12:00:00.000Z", evidence: [target, correction] });
    const trust = createSyntheticCalibrationTrustContext(scenario.evidence);
    assert.throws(() => runCalibrationScenario(scenario, trust, trust), /correction target|correction cannot precede/i);
  }
});

test("temporal and sufficiency strategies are visible, versioned and fixture-only", () => {
  const { report } = run(23);
  assert.ok(report.results.every((result) => result.ignoredEvidence.some((item) => item.reason === "TECHNICAL_DUPLICATE")));
  assert.deepEqual(report.results.map((result) => result.calibrationBasis.temporalStrategy.strategy), ["NO_TEMPORAL_INFERENCE", "FIXTURE_RECENCY_SEPARATION", "FIXTURE_CONTEXT_RECENCY_SEPARATION"]);
  for (const result of report.results) {
    assert.equal(result.calibrationBasis.temporalStrategy.decay, "NOT_CONFIGURED");
    assert.equal(result.calibrationBasis.syntheticThresholds.authority, "CALIBRATION_FIXTURE_ONLY");
    assert.equal(result.calibrationBasis.syntheticThresholds.productCalibrated, false);
  }
});

test("policy change produces a new deterministic interpretation without changing evidence", () => {
  const { report } = run(24);
  assert.equal(new Set(report.results.map((result) => result.policyHash)).size, 3);
  assert.equal(new Set(report.results.map((result) => result.resultHash)).size, 3);
  assert.equal(new Set(report.results.flatMap((result) => result.usedEvidenceRecordIds)).size, 1);
});

test("exploration research and familiarity remain distinct and never gain ranking authority", () => {
  const { report } = run(25); const c = report.results[2];
  assert.ok(c.interpretations.some((item) => item.key === "exploration:alternative-requested"));
  assert.ok(c.interpretations.some((item) => item.key.startsWith("familiarity:")));
  assert.ok(c.calibrationProjection.items.every((item) => item.key !== "exploration:alternative-requested"));
  assert.equal(c.calibrationProjection.rankingAuthority, false); assert.equal(c.calibrationProjection.eligibilityAuthority, false);
});

test("withdrawal, reset and erasure carry no subject, evidence or personal projection", () => {
  for (const index of [27, 28, 29]) {
    const { scenario, report } = run(index);
    assert.equal(scenario.subjectBindingHash, null); assert.deepEqual(scenario.evidence, []);
    assert.ok(report.results.every((result) => result.status === "NEUTRAL" && result.usedEvidenceRecordIds.length === 0 && result.interpretations.length === 0));
    assert.equal(canonicalJson(report).includes(PHASE3B_SYNTHETIC_SUBJECT), false);
  }
  const personal = syntheticCalibrationEvidence({ id: "forbidden-withdrawal", eventType: "SAVED" });
  const invalid = withCalibrationScenarioHash({ contractVersion: CONTRACT_VERSIONS.calibrationScenario, scenarioId: "invalid-withdrawal", title: "invalid-withdrawal", subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT, lifecycle: "WITHDRAWN", killSwitch: false, interpretedAt: "2026-02-01T12:00:00.000Z", evidence: [personal] });
  const trust = createSyntheticCalibrationTrustContext([personal]);
  assert.throws(() => runCalibrationScenario(invalid, trust, trust), /suppressed scenario contains/);
});

test("no consent and kill switch remain neutral and produce no personal projection", () => {
  for (const index of [32, 33]) {
    const { report } = run(index);
    assert.ok(report.results.every((result) => result.status === "NEUTRAL" && result.interpretations.length === 0));
    assert.equal(report.productionProjection.status, "NEUTRAL"); assert.equal(report.productionProjection.containsPersonalModelData, false);
  }
});

test("commercial, ranking and eligibility fields are rejected at the runtime boundary", () => {
  const { scenario, trust } = run(30);
  for (const field of ["ownerTier", "payment", "subscription", "advertising", "sponsorship", "rankingInstruction", "eligibilityInstruction"]) assert.throws(() => runCalibrationScenario({ ...scenario, [field]: "forbidden" }, trust, trust), /unknown field/);
});

test("large low-diversity interaction volume creates no strong model statement", () => {
  const { report } = run(31);
  for (const result of report.results) {
    assert.equal(result.interpretations.length, 0);
    assert.equal(result.sufficiency.state, "NOTHING_KNOWN");
    assert.equal(result.calibrationProjection.items.length, 0);
  }
});

test("recursive verification rejects inner manipulation after complete outer rehash", () => {
  const { scenario, trust, report } = run(7);
  const forged = structuredClone(report); forged.results[0].interpretations[0].key = "concept:forged:commercial"; rehashReport(forged);
  assert.throws(() => verifyCalibrationReport(forged, scenario, trust, trust), /authoritative deterministic replay/);
  assert.equal(verifyCalibrationReport(report, scenario, trust, trust).reportHash, report.reportHash);
});

test("Phase 3B lifecycle stores are canonical and Account Erasure requires DELETE", () => {
  for (const store of ["calibration_reports_subject_bound", "calibration_rebuild_material"]) {
    assert.ok(REQUIRED_LIFECYCLE_STORES.includes(store));
    assert.ok(USER_INTELLIGENCE_LIFECYCLE_MANIFEST.stores.some((row) => row.store === store && row.privacyClass !== "NON_PERSONAL_TECHNICAL"));
    assert.equal(planLifecycleImpact("ACCOUNT_ERASURE").find((row) => row.store === store).effect, "DELETE");
  }
});

test("schema catalog exposes each new runtime and authority boundary", () => {
  const names = new Set(USER_INTELLIGENCE_VNEXT_SCHEMA_CATALOG.contracts.map(({ name }) => name));
  for (const name of ["SignalSemanticsRegistry", "CalibrationPolicy", "CalibrationPolicyTrustAnchor", "CalibrationEvidence", "CalibrationEvidenceTrustAnchor", "CalibrationScenario", "CalibrationReport"]) assert.ok(names.has(name));
  assert.equal(CALIBRATION_MODEL_DIMENSIONS.length, 7);
});
