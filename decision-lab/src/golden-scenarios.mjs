import { deterministicUuid } from "./random.mjs";
import { contentHash } from "./canonical-json.mjs";
import { assertScenario } from "./contracts.mjs";

const families = ["product_eligibility", "distribution", "exact_name", "broad_query", "category_intent", "negation", "open_now", "geo", "cold_start", "mature_personalization", "audience", "quiet_lively", "price", "semantic_only", "fallback", "zero_result", "repetition", "explanation"];
const maturities = ["cold", "onboarding", "sparse", "developing", "mature", "power"];
const splits = [{ name: "DEVELOPMENT", count: 18 }, { name: "REGRESSION", count: 12 }, { name: "LOCKED_HOLDOUT", count: 12 }];

export function buildGoldenScenarios(world, version = "golden-scenarios-v1.1") {
  let cursor = 0;
  const scenarios = [];
  for (const [splitIndex, split] of splits.entries()) for (let local = 0; local < split.count; local += 1) {
    const family = families[cursor % families.length];
    const user = world.users[(splitIndex * 14 + (local % 14)) % world.users.length];
    const maturity = user.maturity;
    const context = world.contexts[cursor % world.contexts.length];
    const category = world.spots[cursor % world.spots.length].category;
    const id = deterministicUuid(`${world.manifest.worldId}:${version}:${split.name}`, local);
    const hardConstraints = { productStatus: "approved", distributionEligible: true, city: "Synthetic Basel", category: ["category_intent", "exact_name"].includes(family) ? category : null, openNow: family === "open_now", exclusions: family === "negation" ? ["bar"] : [], mustPass: ["product_eligibility", "distribution", "negation", "open_now", "zero_result"].includes(family) };
    const applicableHardGates = ["PRODUCT_ELIGIBILITY", "DISTRIBUTION_ELIGIBILITY", "ENTITY_INTEGRITY", "LATENT_LEAKAGE", "CITY", ...(hardConstraints.category ? ["HARD_CATEGORY"] : []), ...(hardConstraints.exclusions.length ? ["CATEGORY_EXCLUSION"] : []), ...(hardConstraints.openNow ? ["OPEN_NOW"] : []), "DUPLICATE_RESULTS"];
    const draft = { id, version, split: split.name, family, worldId: world.manifest.worldId, seedId: world.manifest.seed, userId: user.id, maturity: user.maturity, persona: user.persona, historyRef: `world:user:${user.id}:observed`, request: { city: "Synthetic Basel", query: family.replaceAll("_", " "), preferredPlaceTypes: hardConstraints.category ? [category] : [], audience: [context.audience], limit: 10 }, context: { contextId: context.id, audience: context.audience, timeBucket: context.timeBucket, weekday: context.weekday, weather: context.weather, indoorRequired: context.indoorRequired, requiresOpen: context.requiresOpen }, hardConstraints, applicableHardGates, hardGateScope: "FULL_RETURNED_SET", softPreferences: { moods: context.moods, novelty: family === "semantic_only" }, eligibleUniverseRule: "approved && distribution not in [quarantined,excluded] && declared hard constraints", relevanceRule: { utilityAtLeast: 0.6, source: "latent-utility-v1" }, invariants: ["latent-not-visible-to-engine", "trace-complete", ...(hardConstraints.mustPass ? ["hard-constraints-100-percent"] : [])], counterfactualRelation: ["audience", "quiet_lively", "price", "open_now"].includes(family) ? { expected: "directional_utility_gain", stability: "non-tested dimensions stable" } : null, applicableMetrics: ["recall", "ranking", "hard_correctness", "diversity", "explanation"], tags: { city: "Synthetic Basel", category, density: world.spots[cursor % world.spots.length].density, source: family.includes("semantic") ? "semantic" : family.includes("fallback") ? "fallback" : "mixed", fallback: family.includes("fallback"), finding: family === "distribution" ? "D0-F-002" : null }, rationale: `Independent ${family} contract derived from product invariants and latent utility, never V13 output.`, provenance: { generator: "d2-golden-scenario-generator-v1.1", worldId: world.manifest.worldId, semanticChangeFromV1: "none; structured hard-gate declarations added" } };
    draft.hash = contentHash(draft);
    scenarios.push(assertScenario(draft)); cursor += 1;
  }
  return scenarios;
}

export function splitRegistry(scenarios) {
  const entries = scenarios.map((scenario) => ({ scenarioId: scenario.id, split: scenario.split, family: scenario.family, userId: scenario.userId, hash: scenario.hash }));
  return { version: "decision-splits-v1", entries, hash: contentHash(entries), custody: { development: "open", regression: "reviewed-and-versioned", lockedHoldout: "separate bundle; explicit unlock after freeze; repository visibility is a documented limitation" } };
}

export function validateSplitIntegrity(scenarios, minimums) {
  const failures = [];
  const ids = new Set(); const users = new Map();
  for (const scenario of scenarios) { if (ids.has(scenario.id)) failures.push(`duplicate:${scenario.id}`); ids.add(scenario.id); const prior = users.get(scenario.userId); if (prior && prior !== scenario.split) failures.push(`cross-split-user:${scenario.userId}`); users.set(scenario.userId, scenario.split); }
  for (const [split, min] of [["DEVELOPMENT", minimums.development], ["REGRESSION", minimums.regression], ["LOCKED_HOLDOUT", minimums.lockedHoldout]]) if (scenarios.filter((s) => s.split === split).length < min) failures.push(`count:${split}`);
  const families = new Set(scenarios.map((s) => s.family)); if (families.size < minimums.scenarioFamilies) failures.push("family-coverage");
  return { valid: failures.length === 0, failures, familyCount: families.size, counts: Object.fromEntries(["DEVELOPMENT", "REGRESSION", "LOCKED_HOLDOUT"].map((s) => [s, scenarios.filter((x) => x.split === s).length])) };
}

export function d0f002Fixture() {
  return { id: "d0-f-002-semantic-distribution", finding: "D0-F-002", expectedDetection: "KNOWN_ENGINE_DEFECT", candidates: [{ id: "normal", source: "semantic", distribution: "normal", distributionPriority: null, combinedScore: 0.7, utility: 0.82 }, { id: "reduced", source: "semantic", distribution: "reduced", distributionPriority: null, combinedScore: 0.9, utility: 0.55 }], actualRanking: ["reduced", "normal"] };
}
