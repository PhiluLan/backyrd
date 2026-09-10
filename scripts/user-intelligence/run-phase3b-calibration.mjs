import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CALIBRATION_POLICY_CANDIDATES, CANONICAL_SIGNAL_SEMANTICS_REGISTRY,
  CONTRACT_VERSIONS, PHASE3B_CALIBRATION_SCENARIOS, canonicalJson, contentHash, runCalibrationScenario, syntheticTrustForScenario,
} from "../../packages/user-intelligence-vnext-core/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argument = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? resolve(process.cwd(), process.argv[index + 1]) : null; };
const summaryOutput = argument("--summary-output"); const fullOutput = argument("--full-output"); const verifySummary = argument("--verify-summary");
const reports = PHASE3B_CALIBRATION_SCENARIOS.map((scenario) => {
  const trust = syntheticTrustForScenario(scenario);
  const first = runCalibrationScenario(scenario, trust, trust);
  const replay = runCalibrationScenario(scenario, trust, trust);
  if (canonicalJson(first) !== canonicalJson(replay)) throw new Error(`non_deterministic_calibration:${scenario.scenarioId}`);
  return first;
});
const artifact = {
  contractVersion: "backyrd.user-intelligence.calibration-artifact@3b.1",
  classification: "SYNTHETIC_FIXTURE_ONLY",
  productionAuthorized: false,
  productionDataUsed: false,
  signalRegistry: CANONICAL_SIGNAL_SEMANTICS_REGISTRY,
  policies: CALIBRATION_POLICY_CANDIDATES.map(({ policyId, policyVersion, name, authority, productionAuthorized, productCalibrationStatus, policyHash, limitations }) => ({ policyId, policyVersion, name, authority, productionAuthorized, productCalibrationStatus, policyHash, limitations })),
  scenarioCount: reports.length,
  reportHashes: reports.map(({ scenarioId, reportHash }) => ({ scenarioId, reportHash })),
  reports,
};
const fullReportHash = contentHash(artifact);
const scenarioSet = PHASE3B_CALIBRATION_SCENARIOS.map(({ scenarioId, scenarioHash }) => ({ scenarioId, scenarioHash }));
const summaryBody = {
  contractVersion: CONTRACT_VERSIONS.calibrationReleaseSummary, classification: "SYNTHETIC_FIXTURE_ONLY", productionAuthorized: false, productionDataUsed: false,
  generatorVersion: "backyrd.user-intelligence.calibration-report-generator@3b.1", scenarioSetVersion: "backyrd.user-intelligence.calibration-scenarios@3b.1",
  scenarioSetHash: contentHash(scenarioSet), scenarioCount: reports.length,
  signalRegistry: { registryVersion: CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryVersion, registryHash: CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryHash },
  policies: CALIBRATION_POLICY_CANDIDATES.map(({ policyId, policyVersion, policyHash }) => ({ policyId, policyVersion, policyHash })),
  centralComparisons: reports.map((report) => ({ scenarioId: report.scenarioId, reportHash: report.reportHash, signatures: report.results.map((result) => `${result.policyId}:${result.usedEvidenceRecordIds.length}/${result.interpretations.length}/${result.calibrationProjection.items.length}:${result.sufficiency.state}:${result.sufficiency.directionState}`) })),
  fullReportHash,
};
const summary = { ...summaryBody, summaryHash: contentHash(summaryBody) };
const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };
if (summaryOutput) { if (!summaryOutput.startsWith(root)) throw new Error("summary_output_must_be_inside_repository"); write(summaryOutput, summary); }
if (fullOutput) write(fullOutput, artifact);
if (verifySummary) {
  const expected = JSON.parse(readFileSync(verifySummary, "utf8"));
  if (canonicalJson(expected) !== canonicalJson(summary)) throw new Error("calibration_release_summary_mismatch");
}
if (!summaryOutput && !fullOutput && !verifySummary) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
