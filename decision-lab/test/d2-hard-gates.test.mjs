import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HARD_GATE_REGISTRY, aggregateHardGates, evaluateHardGates, hardGateCoverage } from "../src/hard-gates.mjs";
import { d3Readiness, frameworkGuards, independentHardGateFixture, independentScenario, runHardGateAdversarialSuite, traceFor } from "../src/hard-gate-acceptance.mjs";
import { assertEvaluationResult } from "../src/contracts.mjs";
import { computeD21Identity, validateD21Freeze, validateEngineRecertification } from "../src/d2-freeze.mjs";
import { evaluateTrace } from "../src/evaluator.mjs";

const constitution = JSON.parse(await readFile(new URL("../config/decision-quality-v1.1.json", import.meta.url)));

test("constitution, registry, evaluator and adversarial coverage are complete", () => {
  const coverage = hardGateCoverage(constitution);
  assert.equal(coverage.pass, true, JSON.stringify(coverage));
  assert.equal(coverage.rows.length, 9);
});

test("all 45 independent hard-gate fixtures have zero false outcomes", () => {
  const result = runHardGateAdversarialSuite(constitution);
  assert.equal(result.pass, true, JSON.stringify(result.cases.filter((entry) => !entry.pass)));
  assert.deepEqual(result.summary, { total: 45, valid: 9, violations: 18, boundaries: 9, multiViolations: 9, missingEvidence: 9, falsePasses: 0, falseFails: 0, notEvaluatedLeakage: 0 });
});

test("D3-CONSTITUTION-ISSUE-001 original four false-pass traces now fail", () => {
  const world = independentHardGateFixture();
  const cases = [
    [independentScenario({ version: constitution.scenarioVersion, hardConstraints: { exclusions: ["bar"] } }), traceFor(["bar"]), "CATEGORY_EXCLUSION"],
    [independentScenario({ version: constitution.scenarioVersion, hardConstraints: { category: "cafe" } }), traceFor(["bar"]), "HARD_CATEGORY"],
    [independentScenario({ version: constitution.scenarioVersion, hardConstraints: { openNow: true } }), traceFor(["closed"]), "OPEN_NOW"],
    [independentScenario({ version: constitution.scenarioVersion }), traceFor(["good", "good"]), "DUPLICATE_RESULTS"]
  ];
  for (const [scenario, trace, gateId] of cases) {
    const gate = evaluateHardGates({ world, scenario, trace, constitution }).find((entry) => entry.gateId === gateId);
    assert.equal(gate.status, "FAIL", JSON.stringify(gate));
    assert.equal(aggregateHardGates(evaluateHardGates({ world, scenario, trace, constitution })).pass, false);
  }
});

test("valid equivalents of the original false-pass traces pass", () => {
  const world = independentHardGateFixture();
  for (const scenario of [
    independentScenario({ version: constitution.scenarioVersion, hardConstraints: { exclusions: ["bar"] } }),
    independentScenario({ version: constitution.scenarioVersion, hardConstraints: { category: "cafe" } }),
    independentScenario({ version: constitution.scenarioVersion, hardConstraints: { openNow: true } }),
    independentScenario({ version: constitution.scenarioVersion })
  ]) assert.equal(aggregateHardGates(evaluateHardGates({ world, scenario, trace: traceFor(["good"]), constitution })).pass, true);
});

test("missing evaluator and every always-pass placeholder block acceptance and readiness", () => {
  const missing = HARD_GATE_REGISTRY.slice(1);
  const guards = frameworkGuards(constitution, missing);
  assert.equal(guards.pass, false);
  assert.equal(d3Readiness({ integrity: { valid: true }, acceptance: { pass: false, guards }, freezeValid: true, engineUnchanged: true }).status, "NOT_READY");
  for (const target of HARD_GATE_REGISTRY) {
    const placeholder = HARD_GATE_REGISTRY.map((gate) => gate.id === target.id ? { ...gate, evaluate() { return { gateId: gate.id, status: "PASS", applicable: true, severity: "hard" }; } } : gate);
    assert.equal(frameworkGuards(constitution, placeholder).pass, false, target.id);
  }
});

test("unknown Constitution or Scenario gates fail closed", () => {
  const world = independentHardGateFixture(); const scenario = independentScenario({ version: constitution.scenarioVersion }); const trace = traceFor(["good"]);
  assert.throws(() => evaluateHardGates({ world, scenario, trace, constitution: { ...constitution, hardGates: { ...constitution.hardGates, UNKNOWN: {} } } }), /Unknown Constitution/);
  assert.throws(() => evaluateHardGates({ world, scenario: { ...scenario, applicableHardGates: [...scenario.applicableHardGates, "UNKNOWN"] }, trace, constitution }), /Unknown Scenario/);
});

test("result invariant guard rejects contradictory and incomplete certification", () => {
  const base = { frameworkValidity: "PASS", engineQuality: "FAIL", certifiable: false, hardGates: { pass: false, complete: true, status: "FAIL", results: [] } };
  assert.doesNotThrow(() => assertEvaluationResult(base));
  assert.throws(() => assertEvaluationResult({ ...base, engineQuality: "PASS" }), /cannot PASS/);
  assert.throws(() => assertEvaluationResult({ ...base, certifiable: true }), /cannot be certifiable/);
  assert.throws(() => assertEvaluationResult({ ...base, hardGates: { ...base.hardGates, complete: false, status: "NOT_EVALUATED" }, certifiable: true }), /Incomplete/);
});

test("empty returned set is hard-valid and unknown evidence never defaults to PASS", () => {
  const world = independentHardGateFixture(); const scenario = independentScenario({ version: constitution.scenarioVersion });
  assert.equal(aggregateHardGates(evaluateHardGates({ world, scenario, trace: traceFor([]), constitution })).pass, true);
  const open = independentScenario({ version: constitution.scenarioVersion, hardConstraints: { openNow: true } });
  const aggregate = aggregateHardGates(evaluateHardGates({ world, scenario: open, trace: traceFor(["missing-opening"]), constitution }));
  assert.equal(aggregate.status, "NOT_EVALUATED"); assert.equal(aggregate.pass, false); assert.equal(aggregate.complete, false);
});

test("all Product and Distribution enum boundaries are explicit", () => {
  const world = independentHardGateFixture(); const scenario = independentScenario({ version: constitution.scenarioVersion });
  const status = (id, gateId) => evaluateHardGates({ world, scenario, trace: traceFor([id]), constitution }).find((gate) => gate.gateId === gateId).status;
  assert.equal(status("good", "PRODUCT_ELIGIBILITY"), "PASS");
  for (const id of ["pending", "rejected", "archived"]) assert.equal(status(id, "PRODUCT_ELIGIBILITY"), "FAIL");
  for (const id of ["good", "reduced"]) assert.equal(status(id, "DISTRIBUTION_ELIGIBILITY"), "PASS");
  for (const id of ["quarantined", "excluded"]) assert.equal(status(id, "DISTRIBUTION_ELIGIBILITY"), "FAIL");
  assert.equal(status("unknown-distribution", "DISTRIBUTION_ELIGIBILITY"), "NOT_EVALUATED");
});

test("freeze identity is deterministic and validator rejects tampering", async () => {
  const first = await computeD21Identity(); const second = await computeD21Identity();
  assert.deepEqual(first, second);
  const recertification = await validateEngineRecertification();
  assert.equal(recertification.valid, true, JSON.stringify(recertification.reasons));
  assert.equal(recertification.contract.version, "decision-v13-production-recertification-v22");
  assert.equal(recertification.identity.authorizedSourceCommit, "7351604805a713a5b4221d39360e3e0ec2ef83f1");
  assert.equal(recertification.identity.productionFunctionVersion, 124);
  assert.equal(recertification.identity.productionBundleHash, "a920d38405534f8fdd02e13934988b97fcd4dec12e9c93d8f8dd8bed8d4dac13");
  const changedProduction = await validateEngineRecertification({
    ...recertification.contract,
    production: { ...recertification.contract.production, activeVersion: 76 }
  });
  assert.equal(changedProduction.valid, false);
  assert.ok(changedProduction.reasons.includes("PRODUCTION_IDENTITY_NOT_CERTIFIED"));
  for (const production of [
    { ...recertification.contract.production, bundleHash: "0".repeat(64) },
    { ...recertification.contract.production, entrypointPath: "supabase/functions/decision-v13/index.ts" },
    { ...recertification.contract.production, entrypointSource: "import \"./index.ts\";\n" },
    { ...recertification.contract.production, entrypointSha256: "0".repeat(64) },
    { ...recertification.contract.production, deployedFileCount: 42 },
    { ...recertification.contract.production, repositoryMatchedFileCount: 37 },
    { ...recertification.contract.production, sourceIdentity: "EXACT_REPOSITORY_SOURCE_SET_PLUS_PINNED_ENTRYPOINT" }
  ]) {
    const changedIdentity = await validateEngineRecertification({ ...recertification.contract, production });
    assert.equal(changedIdentity.valid, false);
    assert.ok(changedIdentity.reasons.includes("PRODUCTION_IDENTITY_NOT_CERTIFIED"));
  }
  const changedSourceSet = await validateEngineRecertification({
    ...recertification.contract,
    protectedSemanticSourceSet: {
      ...recertification.contract.protectedSemanticSourceSet,
      paths: [...recertification.contract.protectedSemanticSourceSet.paths, "package.json"]
    }
  });
  assert.equal(changedSourceSet.valid, false);
  assert.ok(changedSourceSet.reasons.includes("PROTECTED_SEMANTIC_SOURCE_SET_MISMATCH"));
  const changedEvidenceSet = await validateEngineRecertification({
    ...recertification.contract,
    certificationEvidenceSet: {
      ...recertification.contract.certificationEvidenceSet,
      paths: [...recertification.contract.certificationEvidenceSet.paths, "package.json"]
    }
  });
  assert.equal(changedEvidenceSet.valid, false);
  assert.ok(changedEvidenceSet.reasons.includes("CERTIFICATION_EVIDENCE_SET_MISMATCH"));
  const changedAuthorization = await validateEngineRecertification({
    ...recertification.contract,
    authorization: { ...recertification.contract.authorization, authorizedSourceCommit: "0".repeat(40) }
  });
  assert.equal(changedAuthorization.valid, false);
  assert.ok(changedAuthorization.reasons.includes("AUTHORIZED_SOURCE_COMMIT_MISMATCH"));
  assert.equal(first.engineMutation, "AUTHORIZED_RECERTIFICATION");
  assert.equal((await validateD21Freeze(first)).valid, true);
  assert.equal((await validateD21Freeze({ ...first, constitutionHash: "tampered" })).valid, false);
  assert.equal((await validateD21Freeze({ ...first, engineRecertificationHash: "tampered" })).valid, false);
});

test("hard-gate result is independent of registry evaluation order", () => {
  const world = independentHardGateFixture(); const scenario = independentScenario({ version: constitution.scenarioVersion, hardConstraints: { category: "cafe", exclusions: ["bar"], openNow: true } }); const trace = traceFor(["bar", "closed", "pending", "pending"]);
  const normal = evaluateHardGates({ world, scenario, trace, constitution });
  const reversed = evaluateHardGates({ world, scenario, trace, constitution }, [...HARD_GATE_REGISTRY].reverse());
  const normalize = (rows) => rows.map(({ gateId, status }) => ({ gateId, status })).sort((a, b) => a.gateId.localeCompare(b.gateId));
  assert.deepEqual(normalize(normal), normalize(reversed));
  assert.deepEqual(aggregateHardGates(normal).failures.sort(), aggregateHardGates(reversed).failures.sort());
});

test("multiple hard violations are all diagnosed and cannot be compensated by soft quality", () => {
  const world = independentHardGateFixture();
  const pending = world.spots.find((entry) => entry.id === "pending"); pending.category = "bar"; pending.latent.openByContext.evening = false;
  const scenario = independentScenario({ version: constitution.scenarioVersion, hardConstraints: { category: "cafe", exclusions: ["bar"], openNow: true } });
  const trace = traceFor(["pending", "pending"]);
  const identity = { worldId: world.manifest.worldId, worldHash: "fixture", split: scenario.split, seedId: world.manifest.seed, generatorVersion: "fixture", groundTruthVersion: constitution.groundTruthVersion, scenarioVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion, gateVersion: constitution.gateVersion, gitSha: "fixture", migrationHash: "fixture", engineSourceHash: "fixture", embeddingMode: "FAST_SIMULATION", runId: "fixture", inputHash: "fixture", outputHash: "pending" };
  const record = evaluateTrace({ world, scenario, trace, constitution, identity });
  assert.equal(record.engineQuality, "FAIL"); assert.equal(record.certifiable, false); assert.equal(record.hardGates.pass, false);
  for (const gateId of ["PRODUCT_ELIGIBILITY", "HARD_CATEGORY", "CATEGORY_EXCLUSION", "OPEN_NOW", "DUPLICATE_RESULTS"]) assert.ok(record.hardGates.failures.includes(gateId), gateId);
});
