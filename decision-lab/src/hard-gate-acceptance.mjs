import { contentHash } from "./canonical-json.mjs";
import { HARD_GATE_REGISTRY, GATE_STATUS, aggregateHardGates, evaluateHardGates, hardGateCoverage } from "./hard-gates.mjs";
import { CATEGORIES, MOODS } from "./model.mjs";

const moods = Object.fromEntries(MOODS.map((key) => [key, 0.5]));
const categories = Object.fromEntries(CATEGORIES.map((key) => [key, 0.5]));
const spot = (id, overrides = {}) => ({
  id, category: "cafe", density: "dense", synthetic: true,
  observed: { name: id, city: "Synthetic Basel", status: "approved", distribution: "normal", priceLevel: 2, moods: ["cozy"], description: "fixture", ...(overrides.observed ?? {}) },
  latent: { mood: moods, quality: 0.9, price: 2, social: 0.5, indoor: 1, novelty: 0.5, distanceKm: 1, openByContext: { morning: true, afternoon: true, evening: true, night: true }, ...(overrides.latent ?? {}) },
  ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !["observed", "latent"].includes(key)))
});

export function independentHardGateFixture() {
  const spots = [
    spot("good"), spot("reduced", { observed: { distribution: "reduced" } }),
    spot("pending", { observed: { status: "pending" } }), spot("rejected", { observed: { status: "rejected" } }), spot("archived", { observed: { status: "archived" } }),
    spot("quarantined", { observed: { distribution: "quarantined" } }), spot("excluded", { observed: { distribution: "excluded" } }),
    spot("bar", { category: "bar" }), spot("closed", { latent: { openByContext: { morning: false, afternoon: false, evening: false, night: false } } }),
    spot("other-city", { observed: { city: "Bern" } }), spot("unknown-distribution", { observed: { distribution: "mystery" } }),
    spot("unknown-category", { category: "mystery" }), spot("missing-category", { category: null }), spot("missing-opening", { latent: { openByContext: {} } }),
    spot("missing-status", { observed: { status: null } }), spot("missing-city", { observed: { city: null } })
  ];
  const user = { id: "user", observed: { city: "Synthetic Basel" }, latent: { mood: moods, category: categories, priceTarget: 2, novelty: 0.5, distanceToleranceKm: 4, social: { solo: 0.5, date: 0.5, friends: 0.5, family: 0.5 } } };
  const context = { id: "context", audience: "solo", timeBucket: "evening", moods, indoorRequired: false, requiresOpen: true, weekday: 2, weather: "dry" };
  return { manifest: { worldId: "hard-gate-fixture", seed: "hard-gate-fixture" }, users: [user], contexts: [context], spots, reviews: [], interactions: [], decisions: [] };
}

export function independentScenario(overrides = {}) {
  const hardConstraints = { productStatus: "approved", distributionEligible: true, city: "Synthetic Basel", category: null, openNow: false, exclusions: [], mustPass: true, ...(overrides.hardConstraints ?? {}) };
  const applicableHardGates = ["PRODUCT_ELIGIBILITY", "DISTRIBUTION_ELIGIBILITY", "ENTITY_INTEGRITY", "LATENT_LEAKAGE", ...(hardConstraints.city ? ["CITY"] : []), ...(hardConstraints.category ? ["HARD_CATEGORY"] : []), ...(hardConstraints.exclusions.length ? ["CATEGORY_EXCLUSION"] : []), ...(hardConstraints.openNow ? ["OPEN_NOW"] : []), "DUPLICATE_RESULTS"];
  const scenario = { id: "hard-gate-scenario", version: "golden-scenarios-v1.1", split: "DEVELOPMENT", family: "hard_gate_acceptance", worldId: "hard-gate-fixture", seedId: "hard-gate-fixture", userId: "user", maturity: "cold", persona: "fixture", historyRef: "fixture", request: { city: "Synthetic Basel", query: "fixture", limit: 10 }, context: { contextId: "context", audience: "solo", timeBucket: "evening", weekday: 2, weather: "dry", indoorRequired: false, requiresOpen: true }, hardConstraints, applicableHardGates, hardGateScope: "FULL_RETURNED_SET", softPreferences: {}, eligibleUniverseRule: "declared hard constraints", relevanceRule: { utilityAtLeast: 0.6, source: "latent-utility-v1" }, invariants: ["latent-not-visible-to-engine", "trace-complete", "hard-constraints-100-percent"], counterfactualRelation: null, applicableMetrics: ["hard_correctness"], tags: {}, rationale: "Independent adversarial fixture", provenance: { generator: "independent-hard-gate-fixtures-v1.1" }, ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "hardConstraints")) };
  scenario.hash = contentHash(scenario);
  return scenario;
}

export const traceFor = (ids, extra = {}) => ({ traceVersion: "decision-flight-recorder-v1", stages: [{ name: "retrieval", candidates: ids.map((id) => ({ id })) }], results: ids.map((id) => ({ id })), ...extra });

const caseFor = (name, gateId, world, scenario, trace, expected, registry = HARD_GATE_REGISTRY) => {
  let actual;
  try { actual = evaluateHardGates({ world, scenario, trace, constitution: caseFor.constitution }, registry).find((gate) => gate.gateId === gateId)?.status ?? "MISSING"; } catch { actual = "ERROR"; }
  return { name, gateId, expected, actual, pass: actual === expected };
};

export function runHardGateAdversarialSuite(constitution, registry = HARD_GATE_REGISTRY) {
  caseFor.constitution = constitution;
  const base = independentHardGateFixture();
  const baseScenario = independentScenario({ version: constitution.scenarioVersion });
  const cases = [];
  const add = (name, gateId, world, scenario, ids, expected, traceExtra) => cases.push(caseFor(name, gateId, world, scenario, traceFor(ids, traceExtra), expected, registry));
  const addTrace = (name, gateId, world, scenario, trace, expected) => cases.push(caseFor(name, gateId, world, scenario, trace, expected, registry));
  const clone = () => structuredClone(base);
  const hardCategory = independentScenario({ version: constitution.scenarioVersion, hardConstraints: { category: "cafe" } });
  const exclusion = independentScenario({ version: constitution.scenarioVersion, hardConstraints: { exclusions: ["bar"] } });
  const open = independentScenario({ version: constitution.scenarioVersion, hardConstraints: { openNow: true } });

  for (const [gateId, violation, boundary, missing, scenario = baseScenario] of [
    ["PRODUCT_ELIGIBILITY", "pending", "reduced", "missing-status"],
    ["DISTRIBUTION_ELIGIBILITY", "quarantined", "reduced", "unknown-distribution"],
    ["ENTITY_INTEGRITY", "missing-id", null, "unknown-category"],
    ["CITY", "other-city", null, "missing-city"],
    ["HARD_CATEGORY", "bar", null, "missing-category", hardCategory],
    ["CATEGORY_EXCLUSION", "bar", null, "missing-category", exclusion],
    ["OPEN_NOW", "closed", null, "missing-opening", open],
    ["DUPLICATE_RESULTS", "good", null, null]
  ]) {
    add(`${gateId}:valid`, gateId, clone(), scenario, gateId === "DUPLICATE_RESULTS" ? ["good"] : ["good"], GATE_STATUS.PASS);
    add(`${gateId}:single-violation`, gateId, clone(), scenario, gateId === "ENTITY_INTEGRITY" ? ["does-not-exist"] : gateId === "DUPLICATE_RESULTS" ? ["good", "good"] : [violation], GATE_STATUS.FAIL);
    add(`${gateId}:boundary`, gateId, clone(), scenario, boundary ? [boundary] : [], GATE_STATUS.PASS);
    if (gateId === "DUPLICATE_RESULTS") addTrace(`${gateId}:missing-evidence`, gateId, clone(), scenario, { stages: [], results: null }, "ERROR");
    else add(`${gateId}:missing-evidence`, gateId, clone(), scenario, missing ? [missing] : gateId === "ENTITY_INTEGRITY" ? ["does-not-exist"] : ["good"], gateId === "ENTITY_INTEGRITY" ? GATE_STATUS.FAIL : GATE_STATUS.NOT_EVALUATED);
  }

  add("LATENT_LEAKAGE:valid", "LATENT_LEAKAGE", clone(), baseScenario, ["good"], GATE_STATUS.PASS);
  add("LATENT_LEAKAGE:single-violation", "LATENT_LEAKAGE", clone(), baseScenario, ["good"], GATE_STATUS.FAIL, { latent: { utility: 1 } });
  add("LATENT_LEAKAGE:boundary", "LATENT_LEAKAGE", clone(), { ...baseScenario, request: { ...baseScenario.request, query: "the word latent is not a field" } }, ["good"], GATE_STATUS.PASS);
  const missingRequest = { ...baseScenario, request: null };
  add("LATENT_LEAKAGE:missing-evidence", "LATENT_LEAKAGE", clone(), missingRequest, ["good"], GATE_STATUS.NOT_EVALUATED);

  for (const gate of registry) {
    const scenario = gate.id === "HARD_CATEGORY" ? hardCategory : gate.id === "CATEGORY_EXCLUSION" ? exclusion : gate.id === "OPEN_NOW" ? open : baseScenario;
    const ids = gate.id === "PRODUCT_ELIGIBILITY" ? ["pending", "quarantined"] : gate.id === "DISTRIBUTION_ELIGIBILITY" ? ["quarantined", "pending"] : gate.id === "CITY" ? ["other-city", "pending"] : gate.id === "HARD_CATEGORY" || gate.id === "CATEGORY_EXCLUSION" ? ["bar", "pending"] : gate.id === "OPEN_NOW" ? ["closed", "pending"] : gate.id === "DUPLICATE_RESULTS" ? ["pending", "pending"] : ["pending", "does-not-exist"];
    const evaluated = evaluateHardGates({ world: clone(), scenario, trace: traceFor(ids, gate.id === "LATENT_LEAKAGE" ? { latent: true } : {}), constitution }, registry);
    const gateResult = evaluated.find((entry) => entry.gateId === gate.id);
    cases.push({ name: `${gate.id}:multi-violation`, gateId: gate.id, expected: GATE_STATUS.FAIL, actual: gateResult.status, pass: gateResult.status === GATE_STATUS.FAIL });
  }

  const valid = cases.filter((entry) => entry.name.endsWith(":valid"));
  const invalid = cases.filter((entry) => entry.name.includes("single-violation") || entry.name.includes("multi-violation"));
  const notEvaluated = cases.filter((entry) => [GATE_STATUS.NOT_EVALUATED, "ERROR"].includes(entry.expected));
  const summary = { total: cases.length, valid: valid.length, violations: invalid.length, boundaries: cases.filter((entry) => entry.name.endsWith(":boundary")).length, multiViolations: cases.filter((entry) => entry.name.endsWith(":multi-violation")).length, missingEvidence: cases.filter((entry) => entry.name.endsWith(":missing-evidence")).length, falsePasses: invalid.filter((entry) => entry.actual === GATE_STATUS.PASS).length, falseFails: valid.filter((entry) => entry.actual !== GATE_STATUS.PASS).length, notEvaluatedLeakage: notEvaluated.filter((entry) => entry.actual === GATE_STATUS.PASS).length };
  return { version: "hard-gate-adversarial-v1.1", cases, summary, pass: cases.every((entry) => entry.pass) && summary.falsePasses === 0 && summary.falseFails === 0 && summary.notEvaluatedLeakage === 0, hash: contentHash({ cases, summary }) };
}

export function frameworkGuards(constitution, registry = HARD_GATE_REGISTRY) {
  const coverage = hardGateCoverage(constitution, registry);
  let adversarial;
  try { adversarial = runHardGateAdversarialSuite(constitution, registry); }
  catch (error) { adversarial = { version: "hard-gate-adversarial-v1.1", cases: [], summary: { total: 0, falsePasses: 0, falseFails: 0, notEvaluatedLeakage: 0 }, pass: false, error: error instanceof Error ? error.message : String(error) }; }
  return { coverage, adversarial, pass: coverage.pass && adversarial.pass };
}

export function d3Readiness({ integrity, acceptance, freezeValid, engineUnchanged }) {
  const reasons = [];
  if (!integrity.valid) reasons.push("SCENARIO_REGISTRY_INVALID");
  if (!acceptance.pass) reasons.push("FRAMEWORK_ACCEPTANCE_FAILED");
  if (!acceptance.guards.coverage.pass) reasons.push("HARD_GATE_COVERAGE_INCOMPLETE");
  if (!acceptance.guards.adversarial.pass) reasons.push("HARD_GATE_ADVERSARIAL_FAILURE");
  if (!freezeValid) reasons.push("FREEZE_INVALID");
  if (!engineUnchanged) reasons.push("ENGINE_MUTATION_DETECTED");
  return { status: reasons.length ? "NOT_READY" : "READY", reasons };
}
