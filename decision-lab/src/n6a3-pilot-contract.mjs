import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { repoRoot } from "./io.mjs";
import { buildN6AScenarioMatrix } from "./n6a-scenarios.mjs";
import { buildN6A2Input, n6A2Instructions } from "./n6a2-reason-authorization.mjs";
import { buildExperimentIdentity, buildSlotIdentity } from "./n6a3-atomic-checkpointing.mjs";
import { validateN3Freeze } from "./n3-freeze.mjs";
import { validateN4Freeze } from "./n4-freeze.mjs";
import { validateN5Freeze } from "./n5-freeze.mjs";
import { validateN6A1Freeze } from "./n6a1-freeze.mjs";
import { validateN6A2Freeze } from "./n6a2-freeze.mjs";

const readConfig = async (path) => JSON.parse(await readFile(resolve(repoRoot, path), "utf8"));
const sourceHash = async (path) => createHash("sha256").update(await readFile(resolve(repoRoot, path))).digest("hex");

export async function buildCanonicalN6A3PilotDefinition() {
  const [base, n6a1, n6a2, validation, n6a3, n3, n4, n5, freeze1, freeze2, evaluatorHash, scenarioHash] = await Promise.all([
    readConfig("decision-lab/config/n6a-ai-decision-buddy-v1.json"),
    readConfig("decision-lab/config/n6a1-reason-evidence-integrity-v1.json"),
    readConfig("decision-lab/config/n6a2-reason-authorization-v1.json"),
    readConfig("decision-lab/config/n6a-validation-contract-v1.json"),
    readConfig("decision-lab/config/n6a3-atomic-checkpointing-v1.json"),
    validateN3Freeze(), validateN4Freeze(), validateN5Freeze(), validateN6A1Freeze(), validateN6A2Freeze(),
    sourceHash("decision-lab/src/n6a-evaluator.mjs"), sourceHash("decision-lab/src/n6a-scenarios.mjs")
  ]);
  const freezes = { n3, n4, n5, n6a1: freeze1, n6a2: freeze2 };
  if (!Object.values(freezes).every(({ valid }) => valid)) throw new Error(`N6A3_PROTECTED_FREEZE_INVALID:${JSON.stringify(Object.fromEntries(Object.entries(freezes).map(([key, value]) => [key, value.reasons])))}`);
  const stage = base.stages.PILOT;
  const scenarios = buildN6AScenarioMatrix({ count: stage.scenarioCount, seeds: validation.seeds.slice(0, 1), arms: stage.arms });
  if (scenarios.length !== n6a3.expectedPilotSlots || scenarios.length !== stage.maxRequests) throw new Error("N6A3_CANONICAL_PILOT_COVERAGE_MISMATCH");
  const experimentIdentity = buildExperimentIdentity({
    n6InputContract: n6a2.inputContractVersion,
    outputContract: n6a1.outputContractVersion,
    buddyInstruction: { version: n6a2.instructionVersion, hash: contentHash(n6A2Instructions()) },
    reasonAuthorizationContract: n6a2.reasonAuthorizationContractVersion,
    validator: n6a2.validatorVersion,
    n3Freeze: n3.frozen,
    n4Freeze: n4.frozen,
    n5Freeze: n5.frozen,
    candidateContract: { count: base.candidateCount, sourceHash: scenarioHash },
    treatmentContract: { arms: stage.arms, scenarioCount: stage.scenarioCount, sameCandidateUniverseAcrossArms: base.scientificControls.sameCandidateUniverseAcrossArms, sameMomentAcrossTreatmentArms: base.scientificControls.sameMomentAcrossTreatmentArms },
    model: n6a2.baseModel,
    modelConfig: n6a1.modelConfig,
    validationContract: contentHash(validation),
    groundTruthEvaluator: evaluatorHash
  });
  const records = scenarios.map((scenario) => {
    const input = buildN6A2Input(scenario.input); const candidateIds = scenario.input.candidates.map(({ spotId }) => spotId);
    const identity = buildSlotIdentity({
      scenarioId: scenario.scenarioId, seed: scenario.seed, worldHash: contentHash({ family: scenario.family, currentIntent: scenario.input.currentIntent, currentMoment: scenario.input.currentMoment, candidates: scenario.input.candidates, truth: scenario.evaluator.truth }),
      arm: scenario.arm, candidateIds, inputHash: input.inputHash,
      relevantHashes: { n3: scenario.input.currentMoment.projectionHash, n4: contentHash(scenario.input.candidates), n5: scenario.input.relevantUserProjection.serializationHash },
      experimentIdentity
    });
    return { identity, scenario, input };
  });
  const scenarioGroups = new Map();
  for (const record of records) { const group = scenarioGroups.get(record.scenario.scenarioId) ?? []; group.push(record); scenarioGroups.set(record.scenario.scenarioId, group); }
  const parity = [...scenarioGroups.values()].every((group) => {
    const first = group[0].scenario.input;
    const firstTruth = group[0].scenario.evaluator.truth;
    return group.length === 3 && group.every(({ scenario }) => contentHash(scenario.input.candidates) === contentHash(first.candidates)
      && scenario.input.currentMoment.projectionHash === first.currentMoment.projectionHash
      && contentHash(scenario.input.currentIntent) === contentHash(first.currentIntent)
      && contentHash(scenario.evaluator.truth) === contentHash(firstTruth));
  });
  if (!parity) throw new Error("N6A3_CANONICAL_TREATMENT_PARITY_FAILED");
  return { config: n6a3, baseConfig: base, experimentIdentity, records, preflight: { externalAiCalls: 0, slots: records.length, treatmentParity: true, allProtectedFreezesValid: true, oldInterruptedPilotReusable: false, production: "UNCHANGED" } };
}
