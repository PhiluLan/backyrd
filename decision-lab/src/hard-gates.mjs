import { CATEGORIES } from "./model.mjs";

export const GATE_STATUS = Object.freeze({ PASS: "PASS", FAIL: "FAIL", NOT_EVALUATED: "NOT_EVALUATED", NOT_APPLICABLE: "NOT_APPLICABLE" });
export const CERTIFIED_EVALUATION_MODE = "CERTIFIED";

const result = (gateId, status, expected, observed, reason, evidence = {}) => ({ gateId, status, applicable: status !== GATE_STATUS.NOT_APPLICABLE, expected, observed, reason, evidence, severity: "hard" });
const fullResults = ({ trace }) => trace.results;
const resolved = ({ trace, world }) => trace.results.map((item, index) => ({ item, rank: index + 1, spot: world.spots.find((spot) => spot.id === item?.id) ?? null }));
const violations = (rows, predicate, observed) => rows.filter(({ spot }) => spot && predicate(spot)).map(({ item, rank, spot }) => ({ spotId: item.id, rank, ...observed(spot) }));
const unresolved = (rows) => rows.filter(({ item, spot }) => !item || typeof item.id !== "string" || !spot).map(({ item, rank }) => ({ spotId: item?.id ?? null, rank }));
const missingField = (rows, read) => rows.filter(({ spot }) => spot && (read(spot) === undefined || read(spot) === null)).map(({ item, rank }) => ({ spotId: item.id, rank }));
const hasForbiddenKey = (value, forbidden, path = "$", found = []) => {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) { value.forEach((entry, index) => hasForbiddenKey(entry, forbidden, `${path}[${index}]`, found)); return found; }
  for (const [key, entry] of Object.entries(value)) { const next = `${path}.${key}`; if (forbidden.has(key)) found.push(next); hasForbiddenKey(entry, forbidden, next, found); }
  return found;
};

const coverage = (id) => ({ valid: `${id}:valid`, violation: `${id}:single-violation`, boundary: `${id}:boundary`, multiViolation: `${id}:multi-violation`, missingEvidence: `${id}:missing-evidence` });

export const HARD_GATE_REGISTRY = Object.freeze([
  {
    id: "PRODUCT_ELIGIBILITY", version: "1.1", constitutionKey: "PRODUCT_ELIGIBILITY", description: "Every returned Spot is approved.", testCoverage: coverage("PRODUCT_ELIGIBILITY"),
    applicable: () => true,
    evaluate(input) { const rows = resolved(input); const missing = missingField(rows, (spot) => spot.observed?.status); if (missing.length) return result(this.id, GATE_STATUS.NOT_EVALUATED, "approved", missing, "Canonical Product state is unavailable", { candidates: missing }); const bad = violations(rows, (spot) => spot.observed.status !== "approved", (spot) => ({ status: spot.observed.status })); return result(this.id, bad.length ? GATE_STATUS.FAIL : GATE_STATUS.PASS, "approved", bad.length ? bad : "all returned Spots approved", bad.length ? "Non-approved Spot returned" : "Product eligibility satisfied", { candidates: bad }); }
  },
  {
    id: "DISTRIBUTION_ELIGIBILITY", version: "1.1", constitutionKey: "DISTRIBUTION_ELIGIBILITY", description: "Every returned Spot has NORMAL or REDUCED Distribution.", testCoverage: coverage("DISTRIBUTION_ELIGIBILITY"),
    applicable: () => true,
    evaluate(input) { const rows = resolved(input); const missing = missingField(rows, (spot) => spot.observed?.distribution); if (missing.length) return result(this.id, GATE_STATUS.NOT_EVALUATED, ["normal", "reduced"], missing, "Canonical Distribution state is unavailable", { candidates: missing }); const unknown = violations(rows, (spot) => !["normal", "reduced", "quarantined", "excluded"].includes(spot.observed.distribution), (spot) => ({ distribution: spot.observed.distribution })); if (unknown.length) return result(this.id, GATE_STATUS.NOT_EVALUATED, ["normal", "reduced"], unknown, "Unknown Distribution state", { candidates: unknown }); const bad = violations(rows, (spot) => ["quarantined", "excluded"].includes(spot.observed.distribution), (spot) => ({ distribution: spot.observed.distribution })); return result(this.id, bad.length ? GATE_STATUS.FAIL : GATE_STATUS.PASS, ["normal", "reduced"], bad.length ? bad : "all returned Spots distribution-eligible", bad.length ? "Distribution-ineligible Spot returned" : "Distribution eligibility satisfied", { candidates: bad }); }
  },
  {
    id: "ENTITY_INTEGRITY", version: "1.1", constitutionKey: "ENTITY_INTEGRITY", description: "Every result resolves to exactly one well-formed synthetic World entity.", testCoverage: coverage("ENTITY_INTEGRITY"),
    applicable: () => true,
    evaluate(input) { const rows = resolved(input); const bad = unresolved(rows); const incomplete = rows.filter(({ spot }) => spot && (!spot.observed || !CATEGORIES.includes(spot.category) || typeof spot.observed.city !== "string" || typeof spot.observed.status !== "string" || typeof spot.observed.distribution !== "string")).map(({ item, rank, spot }) => ({ spotId: item.id, rank, category: spot.category })); const evidence = [...bad, ...incomplete]; return result(this.id, evidence.length ? GATE_STATUS.FAIL : GATE_STATUS.PASS, "all result IDs resolve to complete synthetic World Spots", evidence.length ? evidence : "all entities resolved", evidence.length ? "Missing or malformed canonical entity" : "Entity integrity satisfied", { candidates: evidence }); }
  },
  {
    id: "LATENT_LEAKAGE", version: "1.1", constitutionKey: "LATENT_LEAKAGE", description: "Evaluation-only latent fields never enter request or Decision trace.", testCoverage: coverage("LATENT_LEAKAGE"),
    applicable: () => true,
    evaluate({ trace, scenario, constitution }) { const forbidden = new Set(constitution.hardGates.LATENT_LEAKAGE.forbiddenKeys); if (!scenario.request || !trace) return result(this.id, GATE_STATUS.NOT_EVALUATED, "request and trace available", null, "Leakage evidence unavailable"); const paths = [...hasForbiddenKey(scenario.request, forbidden, "$.request"), ...hasForbiddenKey(trace, forbidden, "$.trace")]; return result(this.id, paths.length ? GATE_STATUS.FAIL : GATE_STATUS.PASS, "no forbidden evaluation-truth keys", paths, paths.length ? "Evaluation truth leaked into engine-visible contract" : "No latent leakage detected", { paths }); }
  },
  {
    id: "CITY", version: "1.1", constitutionKey: "CITY", description: "Returned Spots match a declared hard city.", testCoverage: coverage("CITY"),
    applicable: ({ scenario }) => typeof scenario.hardConstraints.city === "string" && scenario.hardConstraints.city.length > 0,
    evaluate(input) { const expected = input.scenario.hardConstraints.city; const rows = resolved(input); const missing = missingField(rows, (spot) => spot.observed?.city); if (missing.length) return result(this.id, GATE_STATUS.NOT_EVALUATED, expected, missing, "Canonical city evidence unavailable", { candidates: missing }); const bad = violations(rows, (spot) => spot.observed.city !== expected, (spot) => ({ city: spot.observed.city })); return result(this.id, bad.length ? GATE_STATUS.FAIL : GATE_STATUS.PASS, expected, bad.length ? bad : "all returned Spots in declared city", bad.length ? "Spot outside declared city returned" : "City constraint satisfied", { candidates: bad }); }
  },
  {
    id: "HARD_CATEGORY", version: "1.1", constitutionKey: "HARD_CATEGORY", description: "Returned Spots match a declared hard category exactly.", testCoverage: coverage("HARD_CATEGORY"),
    applicable: ({ scenario }) => typeof scenario.hardConstraints.category === "string" && scenario.hardConstraints.category.length > 0,
    evaluate(input) { const expected = input.scenario.hardConstraints.category; if (!CATEGORIES.includes(expected)) return result(this.id, GATE_STATUS.NOT_EVALUATED, "known canonical category", expected, "Scenario category is outside canonical taxonomy"); const rows = resolved(input); const missing = missingField(rows, (spot) => spot.category); if (missing.length) return result(this.id, GATE_STATUS.NOT_EVALUATED, expected, missing, "Canonical category evidence unavailable", { candidates: missing }); const bad = violations(rows, (spot) => spot.category !== expected, (spot) => ({ category: spot.category })); return result(this.id, bad.length ? GATE_STATUS.FAIL : GATE_STATUS.PASS, expected, bad.length ? bad : "all returned Spots match hard category", bad.length ? "Wrong category returned" : "Hard category satisfied", { candidates: bad }); }
  },
  {
    id: "CATEGORY_EXCLUSION", version: "1.1", constitutionKey: "CATEGORY_EXCLUSION", description: "No returned Spot belongs to a declared excluded category.", testCoverage: coverage("CATEGORY_EXCLUSION"),
    applicable: ({ scenario }) => Array.isArray(scenario.hardConstraints.exclusions) && scenario.hardConstraints.exclusions.length > 0,
    evaluate(input) { const excluded = input.scenario.hardConstraints.exclusions; if (excluded.some((category) => !CATEGORIES.includes(category))) return result(this.id, GATE_STATUS.NOT_EVALUATED, "known canonical excluded categories", excluded, "Scenario exclusion is outside canonical taxonomy"); const rows = resolved(input); const missing = missingField(rows, (spot) => spot.category); if (missing.length) return result(this.id, GATE_STATUS.NOT_EVALUATED, { excludedCategories: excluded }, missing, "Canonical category evidence unavailable", { candidates: missing }); const bad = violations(rows, (spot) => excluded.includes(spot.category), (spot) => ({ category: spot.category })); return result(this.id, bad.length ? GATE_STATUS.FAIL : GATE_STATUS.PASS, { excludedCategories: excluded }, bad.length ? bad : "no excluded category returned", bad.length ? "Explicitly excluded category returned" : "Category exclusions satisfied", { candidates: bad }); }
  },
  {
    id: "OPEN_NOW", version: "1.1", constitutionKey: "OPEN_NOW", description: "Returned Spots are open in the scenario's declared D2 time bucket.", testCoverage: coverage("OPEN_NOW"),
    applicable: ({ scenario }) => scenario.hardConstraints.openNow === true,
    evaluate(input) { const bucket = input.scenario.context?.timeBucket; if (typeof bucket !== "string") return result(this.id, GATE_STATUS.NOT_EVALUATED, "declared time bucket", bucket ?? null, "Scenario time bucket unavailable"); const rows = resolved(input); const missing = rows.filter(({ spot }) => spot && typeof spot.latent?.openByContext?.[bucket] !== "boolean").map(({ item, rank }) => ({ spotId: item.id, rank })); if (missing.length) return result(this.id, GATE_STATUS.NOT_EVALUATED, { open: true, timeBucket: bucket }, missing, "Opening-hours evaluation truth unavailable", { candidates: missing }); const bad = violations(rows, (spot) => spot.latent.openByContext[bucket] !== true, () => ({ open: false, timeBucket: bucket })); return result(this.id, bad.length ? GATE_STATUS.FAIL : GATE_STATUS.PASS, { open: true, timeBucket: bucket }, bad.length ? bad : "all returned Spots open in time bucket", bad.length ? "Closed Spot returned for open-now constraint" : "Open-now constraint satisfied", { candidates: bad }); }
  },
  {
    id: "DUPLICATE_RESULTS", version: "1.1", constitutionKey: "DUPLICATE_RESULTS", description: "Spot-ID duplicate rate across the full returned set does not exceed the Constitution limit.", testCoverage: coverage("DUPLICATE_RESULTS"),
    applicable: () => true,
    evaluate({ trace, constitution }) { const ids = fullResults({ trace }).map((item) => item?.id); const duplicates = ids.map((id, index) => ({ id, rank: index + 1 })).filter((entry, index) => entry.id !== undefined && ids.indexOf(entry.id) !== index); const rate = ids.length ? 1 - new Set(ids).size / ids.length : 0; const max = constitution.hardGates.DUPLICATE_RESULTS.duplicateRateMax; return result(this.id, rate > max ? GATE_STATUS.FAIL : GATE_STATUS.PASS, { duplicateRateMax: max, identity: "spot-id" }, { duplicateRate: rate, duplicates }, rate > max ? "Duplicate Spot ID returned" : "Duplicate limit satisfied", { candidates: duplicates }); }
  }
]);

export function evaluateHardGates(input, registry = HARD_GATE_REGISTRY) {
  const declared = Object.keys(input.constitution.hardGates);
  const known = new Set(registry.map((gate) => gate.constitutionKey));
  const unknown = declared.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`Unknown Constitution hard gate: ${unknown.join(",")}`);
  const scenarioDeclared = new Set(input.scenario.applicableHardGates);
  const registryIds = new Set(registry.map((gate) => gate.id));
  const unknownScenario = [...scenarioDeclared].filter((id) => !registryIds.has(id));
  if (unknownScenario.length) throw new Error(`Unknown Scenario hard gate: ${unknownScenario.join(",")}`);
  return registry.map((gate) => {
    const applies = gate.applicable(input);
    if (applies !== scenarioDeclared.has(gate.id)) return result(gate.id, GATE_STATUS.NOT_EVALUATED, scenarioDeclared.has(gate.id), applies, "Scenario applicability declaration disagrees with evaluator");
    return applies ? gate.evaluate(input) : result(gate.id, GATE_STATUS.NOT_APPLICABLE, null, null, "Gate does not apply to this scenario");
  });
}

export function aggregateHardGates(gates) {
  const applicable = gates.filter((gate) => gate.status !== GATE_STATUS.NOT_APPLICABLE);
  const counts = Object.fromEntries(Object.values(GATE_STATUS).map((status) => [status, gates.filter((gate) => gate.status === status).length]));
  const failed = applicable.filter((gate) => gate.status === GATE_STATUS.FAIL);
  const notEvaluated = applicable.filter((gate) => gate.status === GATE_STATUS.NOT_EVALUATED);
  return { status: failed.length ? "FAIL" : notEvaluated.length ? "NOT_EVALUATED" : "PASS", pass: failed.length === 0 && notEvaluated.length === 0, complete: notEvaluated.length === 0, applicableCount: applicable.length, counts, failures: failed.map((gate) => gate.gateId), notEvaluated: notEvaluated.map((gate) => gate.gateId), results: gates };
}

export function hardGateCoverage(constitution, registry = HARD_GATE_REGISTRY) {
  const declared = Object.keys(constitution.hardGates); const registered = registry.map((gate) => gate.constitutionKey);
  const rows = [...new Set([...declared, ...registered])].sort().map((id) => { const gate = registry.find((entry) => entry.constitutionKey === id); const tests = gate?.testCoverage ?? {}; return { gateId: id, declared: declared.includes(id), registered: Boolean(gate), implemented: typeof gate?.evaluate === "function", validTest: Boolean(tests.valid), violationTest: Boolean(tests.violation), boundaryTest: Boolean(tests.boundary), multiViolationTest: Boolean(tests.multiViolation), missingEvidenceTest: Boolean(tests.missingEvidence) }; });
  return { rows, pass: rows.every((row) => Object.entries(row).filter(([key]) => key !== "gateId").every(([, value]) => value === true)) };
}
