import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CALIBRATION_POLICY_CANDIDATES, CANONICAL_SIGNAL_SEMANTICS_REGISTRY,
  PHASE3B_CALIBRATION_SCENARIOS, canonicalJson, runCalibrationScenario, syntheticTrustForScenario,
} from "../../packages/user-intelligence-vnext-core/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? resolve(process.cwd(), process.argv[outputIndex + 1]) : null;
const reports = PHASE3B_CALIBRATION_SCENARIOS.map((scenario) => {
  const trust = syntheticTrustForScenario(scenario);
  const first = runCalibrationScenario(scenario, trust, trust);
  const replay = runCalibrationScenario(scenario, trust, trust);
  if (canonicalJson(first) !== canonicalJson(replay)) throw new Error(`non_deterministic_calibration:${scenario.scenarioId}`);
  return first;
});
const artifact = {
  contractVersion: "backyrd.user-intelligence.calibration-artifact@3b.0",
  classification: "SYNTHETIC_FIXTURE_ONLY",
  productionAuthorized: false,
  productionDataUsed: false,
  signalRegistry: CANONICAL_SIGNAL_SEMANTICS_REGISTRY,
  policies: CALIBRATION_POLICY_CANDIDATES.map(({ policyId, policyVersion, name, authority, productionAuthorized, productCalibrationStatus, policyHash, limitations }) => ({ policyId, policyVersion, name, authority, productionAuthorized, productCalibrationStatus, policyHash, limitations })),
  scenarioCount: reports.length,
  reportHashes: reports.map(({ scenarioId, reportHash }) => ({ scenarioId, reportHash })),
  reports,
};
const bytes = `${JSON.stringify(artifact, null, 2)}\n`;
if (output) {
  if (!output.startsWith(root)) throw new Error("output_must_be_inside_repository");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, bytes);
} else process.stdout.write(bytes);
