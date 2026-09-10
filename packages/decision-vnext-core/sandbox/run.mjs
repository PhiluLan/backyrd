import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONTRACT_VERSIONS,
  createSyntheticExecution,
  generateSyntheticWorld,
  runPhase1Decision,
  validateDecisionResultIntegrity,
} from "../dist/index.js";

const configPath = resolve(process.argv[2] ?? "sandbox/config/world-smoke-v1.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const world = generateSyntheticWorld(config);
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const request = {
  contractVersion: CONTRACT_VERSIONS.decisionRequest,
  idempotencyKey: `sandbox-${config.seed}`,
  clientRequestedAt: config.observedAt,
  location: { kind: "city", city: config.cities[0] },
  intentKeys: ["fixture.intent.eat"],
  moodKeys: ["fixture.mood.calm"],
  shownCandidateIds: [],
  rejectedCandidateIds: [],
  hardConstraints: [{ kind: "open_now", value: true }],
  softPreferences: [],
  client: { surface: "synthetic", version: "phase1-cli-v1" },
};

for (const baseline of ["baseline-a-open-distance-popularity", "baseline-b-mood-intent"]) {
  const execution = createSyntheticExecution({ request, world, baseline, sourceSha, candidatePoolSize: config.candidatePoolSize });
  const result = runPhase1Decision({ request, execution, world, baseline, candidatePoolSize: config.candidatePoolSize, resultLimit: 3 });
  validateDecisionResultIntegrity(result);
  process.stdout.write(`${JSON.stringify({ baseline, worldHash: world.worldHash, candidatePoolHash: result.candidatePool.candidatePoolHash, resultHash: result.resultHash, recommendations: result.recommendations.map(({ spotId }) => spotId) })}\n`);
}
