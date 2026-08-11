import { createHash } from "node:crypto";
import { buildGoldenScenarios, splitRegistry, validateSplitIntegrity } from "./golden-scenarios.mjs";
import { contentHash } from "./canonical-json.mjs";
import { evaluateTrace, groundTruth, aggregate } from "./evaluator.mjs";
import { sealTrace, replayTrace } from "./replay.mjs";
import { selfValidate } from "./acceptance.mjs";

const engineIdentity = (world, constitution) => ({ worldId: world.manifest.worldId, worldHash: world.manifest.worldHash, seedId: world.manifest.seed, generatorVersion: world.manifest.generatorVersion, groundTruthVersion: constitution.groundTruthVersion, scenarioVersion: constitution.scenarioVersion, evaluationVersion: constitution.evaluationVersion, gateVersion: constitution.gateVersion, gitSha: world.manifest.gitSha, migrationHash: world.manifest.migrationHash, engineSourceHash: world.manifest.engineSourceHash, embeddingMode: world.manifest.embeddingMode });
const resultRows = (world, ids) => ids.map((id) => { const spot = world.spots.find((item) => item.id === id); return { id, status: spot.observed.status, distribution: spot.observed.distribution, explanation: { claims: spot.observed.moods, evidence: ["observed.moods"], unsupportedClaims: [], constraintCorrect: true } }; });

export function syntheticFrameworkTrace(world, scenario, variant = "ORACLE") {
  const truth = groundTruth(world, scenario); let ids = Object.entries(truth).sort((a,b) => b[1]-a[1]).map(([id]) => id);
  if (variant === "REVERSE") ids.reverse(); if (variant === "MISSING_BEST") ids = ids.slice(1); if (variant === "BAD_RANK" && ids.length > 3) ids = [...ids.slice(1,4), ids[0], ...ids.slice(4)]; ids = ids.slice(0, 10);
  const results = resultRows(world, ids); return sealTrace({ traceVersion: "decision-flight-recorder-v1", scenarioId: scenario.id, variant, stages: [{ name: "eligible", candidates: resultRows(world, Object.keys(truth)) }, { name: "final", candidates: results }], results });
}

export function runSplit({ world, constitution, split, variant = "ORACLE" }) {
  const scenarios = buildGoldenScenarios(world, constitution.scenarioVersion).filter((item) => item.split === split); const base = engineIdentity(world, constitution);
  const records = scenarios.map((scenario) => { const trace = syntheticFrameworkTrace(world, scenario, variant); const inputHash = contentHash({ scenario: scenario.hash, trace: trace.traceHash }); const identity = { ...base, split, runId: createHash("sha256").update(`${inputHash}:${base.engineSourceHash}`).digest("hex"), inputHash, outputHash: "pending" }; return replayTrace(trace, (verified) => evaluateTrace({ world, scenario, trace: verified, constitution, identity })); });
  return { split, scenarioCount: scenarios.length, records, aggregate: aggregate(records, constitution), traceHashes: records.map((record) => record.inputHash) };
}

export function runFramework({ world, constitution }) { const all = buildGoldenScenarios(world, constitution.scenarioVersion); const integrity = validateSplitIntegrity(all, constitution.minimums); const registry = splitRegistry(all); const acceptance = selfValidate(); return { integrity, registry, acceptance, development: runSplit({ world, constitution, split: "DEVELOPMENT" }), regression: runSplit({ world, constitution, split: "REGRESSION" }) }; }
