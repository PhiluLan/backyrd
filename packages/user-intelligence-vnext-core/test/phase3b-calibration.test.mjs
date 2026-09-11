import assert from "node:assert/strict";
import test from "node:test";
import {
  CALIBRATION_CONCEPT_REGISTRY_HASH, CALIBRATION_CONCEPT_REGISTRY_VERSION,
  CALIBRATION_EVENT_TYPES, CALIBRATION_MODEL_DIMENSIONS, CALIBRATION_POLICY_CANDIDATES, CalibrationEvidenceSchema,
  CANONICAL_SIGNAL_SEMANTICS_REGISTRY, CONTRACT_VERSIONS, PHASE3B_CALIBRATION_SCENARIOS,
  PHASE3B_SYNTHETIC_SUBJECT, REQUIRED_LIFECYCLE_STORES, USER_INTELLIGENCE_LIFECYCLE_MANIFEST,
  USER_INTELLIGENCE_VNEXT_SCHEMA_CATALOG, canonicalJson, contentHash, createSyntheticCalibrationTrustContext,
  createSyntheticEvidenceEvaluationAnchor, deriveCalibrationEvidenceFromPhase2, parseSignalSemanticsRegistry, planLifecycleImpact, runCalibrationScenario, signalSemantics,
  syntheticCalibrationEvidence, syntheticCorrectionPair, syntheticPhase2SourceForEvidence, syntheticTrustForEvidence, syntheticTrustForScenario, verifyCalibrationEvidence, verifyCalibrationPolicy,
  verifyCalibrationReport, withCalibrationEvidenceHash, withCalibrationScenarioHash,
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
    for (const conflict of result.conflictsAndAmbivalences) {
      const body = { ...conflict }; delete body.conflictHash; conflict.conflictHash = contentHash(body);
    }
    const projectionBody = { ...result.calibrationProjection }; delete projectionBody.projectionHash; result.calibrationProjection.projectionHash = contentHash(projectionBody);
    const body = { ...result }; delete body.resultHash; result.resultHash = contentHash(body);
  }
  const body = { ...report }; delete body.reportHash; report.reportHash = contentHash(body);
  return report;
}

const calibrationContext = (name) => ({ contextHash: contentHash(`semantic-context:${name}`), dimensions: [name], authority: "EXPLICIT_USER" });
const scenarioForEvidence = (id, evidence) => withCalibrationScenarioHash({ contractVersion: CONTRACT_VERSIONS.calibrationScenario, scenarioId: id, title: id, subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT, lifecycle: "ACTIVE", killSwitch: false, interpretedAt: "2026-02-01T12:00:00.000Z", evidence });
const runEvidence = (id, evidence) => {
  const scenario = scenarioForEvidence(id, evidence); const trust = syntheticTrustForEvidence(...evidence);
  return { scenario, trust, report: runCalibrationScenario(scenario, trust, trust) };
};

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

  const accepted = syntheticCalibrationEvidence({ id: "foreign-concept", eventType: "EXPLICIT_SATISFACTION" });
  const foreign = structuredClone(accepted); foreign.worldConcepts[0].registryVersion = "foreign.registry@1";
  assert.throws(() => verifyCalibrationEvidence(foreign, PHASE3B_SYNTHETIC_SUBJECT, syntheticTrustForEvidence(accepted)), /hash|expected|registry/i);
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
  const trust = syntheticTrustForEvidence(evidence);
  assert.equal(verifyCalibrationEvidence(evidence, PHASE3B_SYNTHETIC_SUBJECT, trust).recordId, evidence.recordId);
  const changed = { ...evidence, spotId: "foreign-spot" }; const body = { ...changed }; delete body.recordHash; changed.recordHash = contentHash(body);
  assert.throws(() => verifyCalibrationEvidence(changed, PHASE3B_SYNTHETIC_SUBJECT, trust), /binding|independently accepted/);
  assert.throws(() => verifyCalibrationEvidence(evidence, contentHash("foreign-subject"), trust), /foreign subject/);
  assert.throws(() => verifyCalibrationEvidence(evidence, PHASE3B_SYNTHETIC_SUBJECT, createSyntheticCalibrationTrustContext()), /expected object/i);
});

test("events cannot self-declare satisfaction, authority or independence", () => {
  const save = syntheticCalibrationEvidence({ id: "self-declared-save", eventType: "SAVED" });
  for (const change of [
    { explicitOutcome: "POSITIVE" }, { authorityProofs: [] },
    { journeyId: null, independenceEligible: true },
  ]) {
    const forged = { ...save, ...change }; const body = { ...forged }; delete body.recordHash; forged.recordHash = contentHash(body);
    const trust = syntheticTrustForEvidence(save);
    assert.throws(() => verifyCalibrationEvidence(forged, PHASE3B_SYNTHETIC_SUBJECT, trust), /authority proofs|binding|minimum items|self-declare|not permitted|unresolved journey/i);
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

test("explicit positive and negative outcomes remain separate without forced conflict", () => {
  const positive = run(7).report.results[0]; const negative = run(8).report.results[0]; const mixed = run(9).report.results[0];
  assert.ok(positive.interpretations.some((item) => item.direction === "POSITIVE"));
  assert.ok(negative.interpretations.some((item) => item.dimension === "AVERSION" && item.direction === "NEGATIVE"));
  assert.equal(mixed.sufficiency.directionState, "POSITIVE_AND_NEGATIVE");
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
  const trust = syntheticTrustForEvidence(oldSave);
  const report = runCalibrationScenario(scenario, trust, trust);
  assert.ok(report.results[2].ignoredEvidence.some((item) => item.reason === "OUTSIDE_FIXTURE_RECENCY_WINDOW"));
  assert.equal(report.results[0].policyVersion !== report.results[2].policyVersion, true);
  assert.equal(scenario.evidence[0].recordHash, oldSave.recordHash);
});

test("large weak volume cannot erase an explicit negative outcome", () => {
  const negative = syntheticCalibrationEvidence({ id: "strong-negative", eventType: "EXPLICIT_DISSATISFACTION", journey: "journey-strong-negative", context: { contextHash: contentHash("weak-vs-explicit-context"), dimensions: ["friends"], authority: "EXPLICIT_USER" } });
  const opens = Array.from({ length: 64 }, (_, index) => syntheticCalibrationEvidence({ id: `weak-open-${index}`, eventType: "OPENED", journey: `journey-weak-${index}` }));
  const scenario = withCalibrationScenarioHash({ contractVersion: CONTRACT_VERSIONS.calibrationScenario, scenarioId: "weak-vs-explicit", title: "weak-vs-explicit", subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT, lifecycle: "ACTIVE", killSwitch: false, interpretedAt: "2026-02-01T12:00:00.000Z", evidence: [negative, ...opens] });
  const trust = syntheticTrustForEvidence(...scenario.evidence);
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
    assert.equal(result.sufficiency.worldKnowledgeCertainty, "NOT_APPLICABLE");
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

test("correction targets must be unique, present and bound to canonical hashes", () => {
  const [target, correction] = syntheticCorrectionPair({ id: "correction-integrity-target", eventType: "EXPLICIT_SATISFACTION", journey: "journey-correction-integrity" }, "correction-integrity-record");
  const trust = syntheticTrustForEvidence(target, correction);
  const missing = withCalibrationScenarioHash({ contractVersion: CONTRACT_VERSIONS.calibrationScenario, scenarioId: "invalid-missing-target", title: "invalid-missing-target", subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT, lifecycle: "ACTIVE", killSwitch: false, interpretedAt: "2026-02-01T12:00:00.000Z", evidence: [correction] });
  assert.throws(() => runCalibrationScenario(missing, trust, trust), /correction target/i);
  const forged = structuredClone(correction); forged.correctionTarget.recordHash = contentHash("forged-target"); const forgedBody = { ...forged }; delete forgedBody.recordHash; forged.recordHash = contentHash(forgedBody);
  const invalid = withCalibrationScenarioHash({ contractVersion: CONTRACT_VERSIONS.calibrationScenario, scenarioId: "invalid-target-hash", title: "invalid-target-hash", subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT, lifecycle: "ACTIVE", killSwitch: false, interpretedAt: "2026-02-01T12:00:00.000Z", evidence: [target, forged] });
  assert.throws(() => runCalibrationScenario(invalid, trust, trust), /independently accepted|target hashes/i);
});

test("closure: correction semantics reject cross-spot, cross-journey, temporal, correction-target and duplicate-target attacks", () => {
  const [target, correction] = syntheticCorrectionPair({ id: "correction-closure-target", eventType: "EXPLICIT_SATISFACTION", journey: "journey-correction-closure", spot: "spot-correction-closure" }, "correction-closure-record");
  const acceptedTrust = (records) => createSyntheticCalibrationTrustContext(records, records.map(createSyntheticEvidenceEvaluationAnchor));
  const scenarioFor = (suffix, records) => withCalibrationScenarioHash({ contractVersion: CONTRACT_VERSIONS.calibrationScenario, scenarioId: `correction-${suffix}`, title: `correction-${suffix}`, subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT, lifecycle: "ACTIVE", killSwitch: false, interpretedAt: "2026-02-01T12:00:00.000Z", evidence: records });
  const rebindCorrection = (change) => {
    const forged = structuredClone(correction); Object.assign(forged, change);
    for (const proof of forged.authorityProofs) {
      if (change.spotId !== undefined) proof.spotId = change.spotId;
      if (change.journeyId !== undefined) proof.journeyId = change.journeyId;
      const proofBody = { ...proof }; delete proofBody.proofHash; proof.proofHash = contentHash(proofBody);
    }
    const body = { ...forged }; delete body.recordHash; return withCalibrationEvidenceHash(body);
  };
  for (const [suffix, forged, pattern] of [
    ["cross-spot", rebindCorrection({ spotId: "foreign-spot" }), /cross-user, cross-spot or cross-journey/i],
    ["cross-journey", rebindCorrection({ journeyId: "foreign-journey" }), /cross-user, cross-spot or cross-journey/i],
    ["early", rebindCorrection({ occurredAt: target.occurredAt }), /must occur after/i],
  ]) {
    const records = [target, forged]; const trust = acceptedTrust(records);
    assert.throws(() => runCalibrationScenario(scenarioFor(suffix, records), trust, trust), pattern);
  }

  const [otherTarget, otherCorrection] = syntheticCorrectionPair({ id: "correction-target-is-correction", eventType: "EXPLICIT_DISSATISFACTION", journey: "journey-correction-target-is-correction" }, "correction-target-is-correction-record");
  const correctionOfCorrectionBody = { ...otherCorrection, correctionTarget: { recordId: correction.recordId, recordHash: correction.recordHash, eventHash: correction.eventHash, chainHash: correction.chainHash } }; delete correctionOfCorrectionBody.recordHash;
  const correctionOfCorrection = withCalibrationEvidenceHash(correctionOfCorrectionBody);
  const correctionRecords = [target, correction, otherTarget, correctionOfCorrection]; const correctionTrust = acceptedTrust(correctionRecords);
  assert.throws(() => runCalibrationScenario(scenarioFor("correction-target", correctionRecords), correctionTrust, correctionTrust), /target is missing or invalid/i);

  const duplicateBody = { ...correction, recordId: "calibration-duplicate-correction" }; delete duplicateBody.recordHash;
  const duplicate = withCalibrationEvidenceHash(duplicateBody); const duplicateRecords = [target, correction, duplicate]; const duplicateTrust = acceptedTrust(duplicateRecords);
  assert.throws(() => runCalibrationScenario(scenarioFor("duplicate-target", duplicateRecords), duplicateTrust, duplicateTrust), /duplicate correction target/i);
});

test("temporal and sufficiency strategies are visible, versioned and fixture-only", () => {
  const { report } = run(23);
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

test("research-only exploration is excluded while familiarity remains authority-free", () => {
  const { report } = run(25); const c = report.results[2];
  assert.ok(c.interpretations.some((item) => item.key.startsWith("familiarity:")));
  assert.ok(c.calibrationProjection.items.every((item) => !item.key.startsWith("exploration:")));
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
  const trust = syntheticTrustForEvidence(personal);
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

test("closure: explicit outcomes require jointly bound user-action and Product-State proofs", () => {
  const evidence = syntheticCalibrationEvidence({ id: "composite-authority", eventType: "EXPLICIT_SATISFACTION" });
  const trust = syntheticTrustForEvidence(evidence);
  assert.deepEqual(evidence.authorityProofs.map(({ authority }) => authority).sort(), ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"]);
  assert.equal(verifyCalibrationEvidence(evidence, PHASE3B_SYNTHETIC_SUBJECT, trust).recordHash, evidence.recordHash);
  for (const retained of evidence.authorityProofs) {
    const body = { ...evidence, authorityProofs: [retained] }; delete body.recordHash;
    assert.throws(() => verifyCalibrationEvidence(withCalibrationEvidenceHash(body), PHASE3B_SYNTHETIC_SUBJECT, trust), /composite authority/i);
  }
});

test("closure: composite proofs reject divergent subject, spot, journey, experience and authority version after rehash", () => {
  const evidence = syntheticCalibrationEvidence({ id: "composite-mismatch", eventType: "EXPLICIT_DISSATISFACTION" });
  const trust = syntheticTrustForEvidence(evidence);
  for (const mutation of [
    { subjectBindingHash: contentHash("foreign-subject") }, { spotId: "foreign-spot" }, { journeyId: "foreign-journey" },
    { experienceEventId: "foreign-experience" }, { authorityVersion: "unknown-authority-version" },
  ]) {
    const forged = structuredClone(evidence); const proof = forged.authorityProofs[1]; Object.assign(proof, mutation);
    const proofBody = { ...proof }; delete proofBody.proofHash; proof.proofHash = contentHash(proofBody);
    const body = { ...forged }; delete body.recordHash; forged.recordHash = contentHash(body);
    assert.throws(() => verifyCalibrationEvidence(forged, PHASE3B_SYNTHETIC_SUBJECT, trust), /authority|binding|expected/i);
  }
});

test("closure: every multi-authority registry entry declares ALL_OF or ANY_OF explicitly", () => {
  for (const entry of CANONICAL_SIGNAL_SEMANTICS_REGISTRY.entries.filter(({ authorityRequirement }) => authorityRequirement.authorities.length > 1)) assert.ok(["ALL_OF", "ANY_OF"].includes(entry.authorityRequirement.mode));
  assert.equal(signalSemantics("EXPLICIT_SATISFACTION").authorityRequirement.mode, "ALL_OF");
  assert.equal(signalSemantics("SAVED").authorityRequirement.mode, "ANY_OF");
});

test("closure: Phase 2 adapter recursively verifies source and is deterministic", () => {
  const evidence = syntheticCalibrationEvidence({ id: "phase2-adapter", eventType: "EXPLICIT_SATISFACTION" });
  const source = syntheticPhase2SourceForEvidence(evidence.recordId); assert.ok(source);
  const first = deriveCalibrationEvidenceFromPhase2({ phase2: source.phase2, eventId: evidence.sourceBinding.phase2EventId }, source.authority);
  const replay = deriveCalibrationEvidenceFromPhase2({ phase2: source.phase2, eventId: evidence.sourceBinding.phase2EventId }, source.authority);
  assert.equal(canonicalJson(first), canonicalJson(replay)); assert.equal(first.recordHash, evidence.recordHash);
  const tampered = structuredClone(source.phase2); tampered.rebuildMaterial.worldEvidence[0].stateHash = contentHash("replacement-world-state");
  assert.throws(() => deriveCalibrationEvidenceFromPhase2({ phase2: tampered, eventId: evidence.sourceBinding.phase2EventId }, source.authority), /authoritative|hash|binding|state/i);
});

test("closure: free Calibration Evidence and replacement anchors fail against unchanged evaluation authority", () => {
  const accepted = syntheticCalibrationEvidence({ id: "anchor-bound", eventType: "SAVED" }); const trust = syntheticTrustForEvidence(accepted);
  const forgedBody = { ...accepted, recordId: "freely-constructed-calibration-record", sourceBinding: { ...accepted.sourceBinding, phase2StateHash: contentHash("invented-phase2-state") } }; delete forgedBody.recordHash;
  const sourceBody = { ...forgedBody.sourceBinding }; delete sourceBody.bindingHash; forgedBody.sourceBinding.bindingHash = contentHash(sourceBody);
  const forged = withCalibrationEvidenceHash(forgedBody); const replacement = createSyntheticEvidenceEvaluationAnchor(forged);
  assert.ok(replacement.productionAuthorized === false);
  assert.throws(() => verifyCalibrationEvidence(forged, PHASE3B_SYNTHETIC_SUBJECT, trust), /expected object|independently accepted/i);
});

test("closure: projection cross-validation excludes NEVER, RESEARCH_ONLY and insufficient domains", () => {
  for (const scenario of PHASE3B_CALIBRATION_SCENARIOS) {
    const trust = syntheticTrustForScenario(scenario); const report = runCalibrationScenario(scenario, trust, trust);
    for (const result of report.results) for (const item of result.calibrationProjection.items) {
      const sources = result.interpretations.filter((row) => row.dimension === item.dimension && row.key === item.key);
      assert.ok(sources.length > 0 && sources.every(({ calibrationProjectionEligible }) => calibrationProjectionEligible));
      assert.ok(sources.every(({ sourceEventType }) => signalSemantics(sourceEventType).status === "CONFIGURED" && signalSemantics(sourceEventType).decisionProjection !== "NEVER"));
    }
    assert.equal(report.productionProjection.containsPersonalModelData, false);
  }
});

test("closure: one-sided direction, semantic conflict and World denominators are truthful", () => {
  const positive = run(7).report.results[0].sufficiency; const negative = run(8).report.results[0].sufficiency; const conflicting = run(9).report.results[0].sufficiency;
  assert.equal(positive.directionState, "POSITIVE_ONLY"); assert.equal(positive.semanticConflict, false);
  assert.equal(negative.directionState, "NEGATIVE_ONLY"); assert.equal(negative.semanticConflict, false);
  assert.equal(conflicting.directionState, "POSITIVE_AND_NEGATIVE");
  const noWorld = run(3).report.results[1].sufficiency; assert.equal(noWorld.worldRelevantEvidenceCount, 0); assert.equal(noWorld.worldKnowledgeCertainty, "NOT_APPLICABLE");
});

test("closure: synthetic thresholds constrain global and domain sufficiency", () => {
  const save = run(1).report.results[1];
  assert.equal(save.sufficiency.state, "INSUFFICIENT_INDEPENDENCE");
  assert.equal(save.domainSufficiency.find(({ dimension }) => dimension === "DIRECT_SPOT_AFFINITY").state, "INSUFFICIENT_INDEPENDENCE");
  assert.equal(save.calibrationProjection.items.length, 0);
  assert.equal(save.calibrationBasis.syntheticThresholds.productCalibrated, false);
});

test("semantic closure: scenarios 10 and 22 distinguish mixed evidence from a true conflict", () => {
  const mixed = run(9).report; const conflicting = run(21).report;
  assert.notEqual(mixed.scenarioHash, conflicting.scenarioHash);
  for (const result of mixed.results) {
    assert.equal(result.sufficiency.directionState, "POSITIVE_AND_NEGATIVE");
    assert.equal(result.sufficiency.semanticConflict, false);
    assert.equal(result.sufficiency.state, "MIXED_NON_CONFLICTING");
    assert.deepEqual(result.conflictsAndAmbivalences.map(({ classification }) => classification), ["MIXED_NON_CONFLICTING"]);
  }
  for (const result of conflicting.results) {
    assert.equal(result.sufficiency.directionState, "POSITIVE_AND_NEGATIVE");
    assert.equal(result.sufficiency.semanticConflict, true);
    assert.equal(result.sufficiency.state, "CONFLICTING");
    assert.deepEqual(result.conflictsAndAmbivalences.map(({ classification }) => classification), ["SEMANTIC_CONFLICT"]);
    assert.equal(result.calibrationProjection.items.length, 0);
    assert.deepEqual(result.calibrationProjection.withheldConflictIds, result.conflictsAndAmbivalences.map(({ conflictId }) => conflictId));
  }
});

test("semantic closure: cross-dimensional positive taste and negative aversion share a canonical conflict target", () => {
  const result = run(21).report.results[0]; const record = result.conflictsAndAmbivalences[0];
  assert.deepEqual(record.dimensions, ["AVERSION", "LONG_TERM_CONCEPT_TASTE"]);
  assert.equal(record.semanticTargets.length, 1);
  assert.ok(record.positiveInterpretations.length > 0 && record.negativeInterpretations.length > 0);
  const positive = result.interpretations.find(({ direction }) => direction === "POSITIVE");
  const negative = result.interpretations.find(({ direction }) => direction === "NEGATIVE");
  assert.notEqual(positive.dimension, negative.dimension);
  assert.equal(positive.semanticTarget.targetHash, negative.semanticTarget.targetHash);
});

test("semantic closure: same concept conflicts without context but distinct contexts remain non-conflicting", () => {
  const noContext = runEvidence("same-concept-no-context", [
    syntheticCalibrationEvidence({ id: "same-concept-positive", eventType: "EXPLICIT_SATISFACTION", journey: "journey-same-concept-positive" }),
    syntheticCalibrationEvidence({ id: "same-concept-negative", eventType: "EXPLICIT_DISSATISFACTION", journey: "journey-same-concept-negative" }),
  ]).report;
  assert.ok(noContext.results.slice(0, 2).every(({ sufficiency }) => sufficiency.state === "CONFLICTING"));
  assert.equal(noContext.results[2].sufficiency.state, "NOTHING_KNOWN");

  const distinctContexts = runEvidence("same-concept-distinct-context", [
    syntheticCalibrationEvidence({ id: "context-positive", eventType: "EXPLICIT_SATISFACTION", journey: "journey-context-positive", context: calibrationContext("friends") }),
    syntheticCalibrationEvidence({ id: "context-negative", eventType: "EXPLICIT_DISSATISFACTION", journey: "journey-context-negative", context: calibrationContext("alone") }),
  ]).report;
  for (const result of distinctContexts.results) {
    assert.equal(result.sufficiency.state, "MIXED_NON_CONFLICTING");
    assert.equal(result.sufficiency.semanticConflict, false);
    assert.equal(result.conflictsAndAmbivalences[0].classification, "MIXED_NON_CONFLICTING");
  }
});

test("semantic closure: repeated one-sided is restricted to one direction", () => {
  const positive = runEvidence("two-positive", [
    syntheticCalibrationEvidence({ id: "two-positive-a", eventType: "EXPLICIT_SATISFACTION", journey: "journey-two-positive-a" }),
    syntheticCalibrationEvidence({ id: "two-positive-b", eventType: "EXPLICIT_SATISFACTION", journey: "journey-two-positive-b" }),
  ]).report.results[0].sufficiency;
  const negative = runEvidence("two-negative", [
    syntheticCalibrationEvidence({ id: "two-negative-a", eventType: "EXPLICIT_DISSATISFACTION", journey: "journey-two-negative-a" }),
    syntheticCalibrationEvidence({ id: "two-negative-b", eventType: "EXPLICIT_DISSATISFACTION", journey: "journey-two-negative-b" }),
  ]).report.results[0].sufficiency;
  assert.deepEqual([positive.state, positive.directionState], ["REPEATED_ONE_SIDED", "POSITIVE_ONLY"]);
  assert.deepEqual([negative.state, negative.directionState], ["REPEATED_ONE_SIDED", "NEGATIVE_ONLY"]);

  const { scenario, trust, report } = run(9); const forged = structuredClone(report);
  forged.results[0].sufficiency.state = "REPEATED_ONE_SIDED"; rehashReport(forged);
  assert.throws(() => verifyCalibrationReport(forged, scenario, trust, trust), /REPEATED_ONE_SIDED requires/);
});

test("semantic closure: corrected and inactive directed evidence cannot create an active conflict", () => {
  const [negativeTarget, correction] = syntheticCorrectionPair({ id: "corrected-negative", eventType: "EXPLICIT_DISSATISFACTION", journey: "journey-corrected-negative" }, "corrected-negative-correction");
  const positive = syntheticCalibrationEvidence({ id: "remaining-positive", eventType: "EXPLICIT_SATISFACTION", journey: "journey-remaining-positive" });
  for (const result of runEvidence("corrected-conflict-side", [negativeTarget, correction, positive]).report.results) {
    assert.equal(result.sufficiency.semanticConflict, false);
    assert.equal(result.conflictsAndAmbivalences.length, 0);
  }

  const activeNegative = syntheticCalibrationEvidence({ id: "inactive-negative", eventType: "EXPLICIT_DISSATISFACTION", journey: "journey-inactive-negative" });
  const inactiveBody = { ...activeNegative, active: false }; delete inactiveBody.recordHash;
  const inactiveNegative = withCalibrationEvidenceHash(inactiveBody);
  const records = [positive, inactiveNegative]; const scenario = scenarioForEvidence("inactive-conflict-side", records);
  const trust = createSyntheticCalibrationTrustContext(records, records.map(createSyntheticEvidenceEvaluationAnchor));
  for (const result of runCalibrationScenario(scenario, trust, trust).results) {
    assert.equal(result.sufficiency.semanticConflict, false);
    assert.equal(result.conflictsAndAmbivalences.length, 0);
  }
});

test("semantic closure: recursive verification rejects incomplete or foreign conflict records after full rehash", () => {
  const { scenario, trust, report } = run(21);
  const missing = structuredClone(report); missing.results[0].conflictsAndAmbivalences[0].positiveInterpretations = []; rehashReport(missing);
  assert.throws(() => verifyCalibrationReport(missing, scenario, trust, trust), /expected at least|conflict/i);

  for (const mutation of [
    (record) => { record.subjectBindingHash = contentHash("foreign-conflict-subject"); },
    (record) => { record.policyHash = contentHash("foreign-conflict-policy"); },
    (record) => { record.semanticTargets[0].targetKey = "concept:foreign-registry:foreign-target"; const target = { ...record.semanticTargets[0] }; delete target.targetHash; record.semanticTargets[0].targetHash = contentHash(target); for (const reference of [...record.positiveInterpretations, ...record.negativeInterpretations]) reference.semanticTargetHash = record.semanticTargets[0].targetHash; },
    (record) => { record.semanticTargets[0].contextHash = contentHash("foreign-conflict-context"); const target = { ...record.semanticTargets[0] }; delete target.targetHash; record.semanticTargets[0].targetHash = contentHash(target); for (const reference of [...record.positiveInterpretations, ...record.negativeInterpretations]) reference.semanticTargetHash = record.semanticTargets[0].targetHash; },
  ]) {
    const forged = structuredClone(report); mutation(forged.results[0].conflictsAndAmbivalences[0]); rehashReport(forged);
    assert.throws(() => verifyCalibrationReport(forged, scenario, trust, trust), /conflict|semantic target|authoritative deterministic replay/i);
  }
});

test("semantic closure: research-only, unconfigured and privacy-suppressed paths emit no personal conflict", () => {
  for (const index of [25, 30]) assert.ok(run(index).report.results.every(({ conflictsAndAmbivalences }) => conflictsAndAmbivalences.length === 0));
  for (const index of [27, 28, 29, 32, 33]) {
    const { report } = run(index);
    assert.ok(report.results.every(({ conflictsAndAmbivalences, calibrationProjection }) => conflictsAndAmbivalences.length === 0 && calibrationProjection.withheldConflictIds.length === 0));
    assert.equal(canonicalJson(report).includes(PHASE3B_SYNTHETIC_SUBJECT), false);
  }
});

test("semantic closure: conflict, result and report hashes replay byte-identically", () => {
  const first = run(21); const replay = run(21);
  assert.equal(canonicalJson(first.report), canonicalJson(replay.report));
  assert.equal(first.report.reportHash, replay.report.reportHash);
  assert.deepEqual(first.report.results.map(({ resultHash }) => resultHash), replay.report.results.map(({ resultHash }) => resultHash));
  assert.deepEqual(first.report.results.map(({ conflictsAndAmbivalences }) => conflictsAndAmbivalences.map(({ conflictHash }) => conflictHash)), replay.report.results.map(({ conflictsAndAmbivalences }) => conflictsAndAmbivalences.map(({ conflictHash }) => conflictHash)));
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
  for (const name of ["SignalSemanticsRegistry", "CalibrationPolicy", "CalibrationPolicyTrustAnchor", "CalibrationEvidence", "CalibrationEvidenceTrustAnchor", "CalibrationScenario", "CalibrationSemanticTarget", "CalibrationConflictRecord", "CalibrationReport"]) assert.ok(names.has(name));
  assert.equal(CALIBRATION_MODEL_DIMENSIONS.length, 7);
});
