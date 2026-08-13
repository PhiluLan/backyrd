#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { loadCanonicalDecisionHandler } from "./canonical-engine.mjs";
import { createCanonicalV13Executor, createIsolatedPostgresTreatmentAdapters, createTreatmentMaterializer } from "./d3.1-canonical-adapters.mjs";
import { coverageReport, runCounterfactualEvaluation, runExplanationAlignment, runPersonalizationTreatmentComparison, runRemixEvaluation } from "./d3.1-diagnostic-runners.mjs";
import { buildPersonalizationTreatment } from "./personalization-treatment.mjs";
import { counterfactualPairs, scenarioLibrary } from "./scenarios.mjs";
import { assertSafeEnvironment } from "./safety.mjs";
import { latentUtility } from "./utility.mjs";

for (const key of ["DECISION_LAB_WORLD_PATH", "DECISION_LAB_DB_URL", "DECISION_LAB_SUPABASE_URL", "DECISION_LAB_SERVICE_ROLE_KEY", "DECISION_LAB_JWT_SECRET", "DECISION_LAB_WORKDIR"]) if (!process.env[key]) throw new Error(`${key} missing`);
assertSafeEnvironment(process.env, process.env.DECISION_LAB_WORKDIR);
const world = JSON.parse(await readFile(process.env.DECISION_LAB_WORLD_PATH, "utf8"));
const contract = JSON.parse(await readFile(new URL("../config/d3.1-diagnostic-coverage-v1.json", import.meta.url), "utf8"));
const scenarios = scenarioLibrary(world);
const defaultContext = world.contexts[0];
const utilityMap = (userId, context = defaultContext) => {
  const user = world.users.find((item) => item.id === userId);
  if (!user) throw new Error(`Latent evaluator user missing: ${userId}`);
  return Object.fromEntries(world.spots.map((spot) => [spot.id, latentUtility(user, spot, context).utility]));
};
const canonical = await loadCanonicalDecisionHandler({ env: process.env, embeddingMode: "FAST_SIMULATION" });
if (canonical.sourceHash !== contract.engineSourceHash) throw new Error("Canonical V13 source hash drift");
const executor = createCanonicalV13Executor({ canonical, jwtSecret: process.env.DECISION_LAB_JWT_SECRET });
const adapters = createIsolatedPostgresTreatmentAdapters({ dbUrl: process.env.DECISION_LAB_DB_URL });
const materialize = createTreatmentMaterializer(adapters);

try {
  const pairs = counterfactualPairs(scenarios);
  const counterfactual = await runCounterfactualEvaluation({ pairs, executor, engineSourceHash: contract.engineSourceHash, utilityFor: (scenario) => utilityMap(scenario.userId) });
  const maturities = contract.arms.personalization.maturities;
  const bundles = maturities.map((maturity) => {
    const source = world.users.find((user) => user.maturity === maturity);
    if (!source) throw new Error(`World has no ${maturity} user`);
    return buildPersonalizationTreatment(world, { userId: source.id, scenarioId: `d3.1-${maturity}`, currentRequest: scenarios[1].request, currentContext: defaultContext });
  });
  const personalization = await runPersonalizationTreatmentComparison({ bundles, materialize, executor, engineSourceHash: contract.engineSourceHash, utilityFor: (userId, context) => utilityMap(userId, context) });
  const remixCases = contract.arms.remix.families.map((family, index) => ({ ...scenarios[index % scenarios.length], id: `d3.1-remix-${family}`, family, context: defaultContext, request: { ...scenarios[index % scenarios.length].request, limit: family.includes("few") || family.includes("sparse") ? 6 : 10 } }));
  const remix = await runRemixEvaluation({ cases: remixCases, executor, engineSourceHash: contract.engineSourceHash, utilityFor: (item) => utilityMap(item.userId, item.context) });
  const explanationCases = scenarios.slice(0, 4).map((scenario) => ({ ...scenario, context: defaultContext }));
  const explanation = await runExplanationAlignment({ cases: explanationCases, executor, engineSourceHash: contract.engineSourceHash });
  const coverage = coverageReport({ expected: contract, results: { counterfactual, personalization, remix, explanation } });
  if (!coverage.ready) throw new Error(`D3.1 coverage incomplete: ${JSON.stringify(coverage.rows)}`);
  process.stdout.write(`${JSON.stringify({ valid: true, environment: "DISPOSABLE_LOCAL_SUPABASE", fullD3ARun: false, embeddingMode: "FAST_SIMULATION", engineSourceHash: canonical.sourceHash, coverage, resultHashes: { counterfactual: counterfactual.hash, personalization: personalization.hash, remix: remix.hash, explanation: explanation.hash }, productionAccess: "NONE" }, null, 2)}\n`);
} finally {
  canonical.restore();
}
