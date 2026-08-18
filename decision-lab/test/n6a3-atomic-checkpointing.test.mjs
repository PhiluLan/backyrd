import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { contentHash } from "../src/canonical-json.mjs";
import {
  aggregatePilot, assertResumeBudget, beginSlotAttempt, buildExperimentIdentity, buildSlotIdentity,
  commitSlot, failSlotAttempt, initializePilot, listTemporaryArtifacts, loadPilot, markRetryable, removeExperiment
} from "../src/n6a3-atomic-checkpointing.mjs";
import { buildCanonicalN6A3PilotDefinition } from "../src/n6a3-pilot-contract.mjs";
import { runAtomicPilot } from "../src/n6a3-pilot-runner.mjs";
import { createN6A3LiveExecution } from "../src/n6a3-live-executor.mjs";

const identity = (overrides = {}) => buildExperimentIdentity({
  n6InputContract: "n6a2-input", outputContract: "n6a2-output", buddyInstruction: "n6a2-instruction",
  reasonAuthorizationContract: "n6a2-reasons", validator: "n6a2-validator", n3Freeze: "n3", n4Freeze: "n4",
  n5Freeze: "n5", candidateContract: "candidate-10", treatmentContract: "d2.2", model: "gpt-5.6-sol",
  modelConfig: { reasoningEffort: "medium", maxOutputTokens: 2400 }, validationContract: "n6a-validation-v1",
  groundTruthEvaluator: "n6a-evaluator-v1", ...overrides
});

const slots = (experimentIdentity = identity()) => Array.from({ length: 24 }, (_, index) => ["ACTUAL", "NEUTRAL", "OPPOSING"].map((arm) => {
  const candidateIds = Array.from({ length: 10 }, (__, candidate) => `spot-${index}-${candidate}`);
  return buildSlotIdentity({ scenarioId: `6101-${index}`, seed: 6101, worldHash: `world-${index}`, arm, candidateIds,
    inputHash: contentHash({ index, arm }), relevantHashes: { n3: `n3-${index}`, n4: `n4-${index}`, n5: `n5-${arm}` }, experimentIdentity });
})).flat();

const checkpoint = (slot, { valid = true, attempt = 1 } = {}) => ({
  slotId: slot.slotId, inputHash: slot.inputHash, sanitizedInput: { decision: slot.scenarioId, arm: slot.arm },
  model: "gpt-5.6-sol", modelConfig: { reasoningEffort: "medium", maxOutputTokens: 2400 },
  rawOutput: { id: `fake-${slot.slotId}`, output: [] }, parsedOutput: { ranked_candidates: [{ spot_id: `spot-${slot.scenarioId.split("-")[1]}-0`, rank: 1 }] },
  candidateIds: Array.from({ length: 10 }, (_, candidate) => `spot-${slot.scenarioId.split("-")[1]}-${candidate}`),
  authorizedReasonSets: { candidates: [] }, evidenceReferences: [], whyForYouAudit: [], whyNowAudit: [], uncertaintyAudit: [],
  validatorDisposition: valid ? { valid: true } : { valid: false, reason: "UNSUPPORTED_REASON_EVIDENCE" },
  failureReason: valid ? null : "UNSUPPORTED_REASON_EVIDENCE", inputTokens: 1000, outputTokens: 500,
  latencyMs: 1200, verifiedCostUsd: 0.04, startedAt: `2026-08-18T00:00:0${attempt}.000Z`, completedAt: `2026-08-18T00:00:1${attempt}.000Z`,
  execution: "FAKE_FIXTURE", freezeIds: { n3: "n3", n4: "n4", n5: "n5", n6a2: "n6a2" }
});

async function setup(name = "case", experimentId = `experiment-${name}`) {
  const dir = await mkdtemp(join(tmpdir(), `n6a3-${name}-`)); const experimentIdentity = identity(); const slotIdentities = slots(experimentIdentity);
  await initializePilot({ experimentDir: dir, experimentId, experimentIdentity, slotIdentities, now: "2026-08-18T00:00:00.000Z" });
  return { dir, experimentIdentity, slotIdentities };
}

async function commitOne(context, slot, options = {}) {
  await beginSlotAttempt({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: slot.slotId, estimatedWorstCaseCostUsd: 0.1, budgetUsd: 100, now: "2026-08-18T00:00:01.000Z" });
  return commitSlot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: slot.slotId, payload: checkpoint(slot, options), now: "2026-08-18T00:00:02.000Z" });
}

async function complete(context, { crashAt = null } = {}) {
  for (let index = 0; index < context.slotIdentities.length; index += 1) {
    const slot = context.slotIdentities[index];
    if (crashAt === index) {
      await beginSlotAttempt({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: slot.slotId, estimatedWorstCaseCostUsd: 0.1, budgetUsd: 100 });
      let manifest = await loadPilot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, recoverInterrupted: true });
      assert.equal(manifest.slots[slot.slotId].state, "INTERRUPTED");
      assert.equal(manifest.cost.possibleUnverifiedUsd, 0.1);
      await markRetryable({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: slot.slotId });
    }
    await commitOne(context, slot, { attempt: crashAt === index ? 2 : 1 });
  }
  return aggregatePilot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, now: "2026-08-18T01:00:00.000Z" });
}

test("N6A.3 builds 72 order-independent, treatment-complete slot identities", async () => {
  const experimentIdentity = identity(); const built = slots(experimentIdentity);
  assert.equal(built.length, 72); assert.equal(new Set(built.map(({ slotId }) => slotId)).size, 72);
  assert.deepEqual([...built].reverse().map(({ slotId }) => slotId).sort(), built.map(({ slotId }) => slotId).sort());
  const context = await setup("identity"); const manifest = await loadPilot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity });
  assert.deepEqual(manifest.summary, { expected: 72, committed: 0, inFlight: 0, failed: 0, interrupted: 0, remaining: 72, rejected: 0 });
  await removeExperiment(context.dir);
});

test("N6A.3 binds the exact canonical N3-N6A.2 pilot without changing protected freezes", async () => {
  const definition = await buildCanonicalN6A3PilotDefinition();
  assert.equal(definition.records.length, 72); assert.equal(definition.preflight.treatmentParity, true);
  assert.equal(definition.preflight.allProtectedFreezesValid, true); assert.equal(definition.preflight.externalAiCalls, 0);
  assert.equal(definition.experimentIdentity.model, "gpt-5.6-sol"); assert.equal(definition.experimentIdentity.modelConfig.reasoningEffort, "medium");
});

test("N6A.3 canonical runner commits all 72 fake observations before producing a result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "n6a3-canonical-runner-")); let calls = 0;
  const result = await runAtomicPilot({ experimentDir: dir, experimentId: "canonical-fake-pilot", budgetUsd: 20,
    initialVerifiedCostUsd: 9.97842, initialPossibleUnverifiedCostUsd: 0.1, estimateWorstCaseCost: () => 0.1,
    executeSlot: async ({ identity: slot, input }) => {
      calls += 1; const candidateIds = input.n6a1Input.baseInput.candidates.map(({ spotId }) => spotId);
      return { slotId: slot.slotId, inputHash: slot.inputHash, sanitizedInput: input, model: "gpt-5.6-sol", modelConfig: { reasoningEffort: "medium", maxOutputTokens: 2400 },
        rawOutput: { id: `fake-${slot.slotId}`, output: [] }, parsedOutput: { ranked_candidates: candidateIds.map((spot_id, index) => ({ spot_id, rank: index + 1 })) }, candidateIds,
        authorizedReasonSets: input.authorizedReasons, evidenceReferences: [], whyForYouAudit: [], whyNowAudit: [], uncertaintyAudit: [], validatorDisposition: { valid: true }, failureReason: null,
        inputTokens: 1000, outputTokens: 500, latencyMs: 100, verifiedCostUsd: 0.04, startedAt: "2026-08-18T00:00:00.000Z", completedAt: "2026-08-18T00:00:01.000Z",
        execution: "FAKE_FIXTURE", freezeIds: { n3: "n3", n4: "n4", n5: "n5", n6a2: "n6a2" } };
    }, now: () => "2026-08-18T00:00:00.000Z" });
  assert.equal(calls, 72); assert.equal(result.result.coverage, "72/72");
  const definition = await buildCanonicalN6A3PilotDefinition(); const manifest = await loadPilot({ experimentDir: dir, expectedIdentity: definition.experimentIdentity });
  assert.equal(manifest.summary.committed, 72); assert.equal(manifest.cost.priorVerifiedUsd, 9.97842); assert.equal(manifest.cost.verifiedCommittedUsd.toFixed(2), "2.88");
  await removeExperiment(dir);
});

test("N6A.3 live executor remains frozen and is testable without an external call", async () => {
  const definition = await buildCanonicalN6A3PilotDefinition(); const record = definition.records[0]; let fakeCalls = 0;
  const candidateIds = record.input.n6a1Input.baseInput.candidates.map(({ spotId }) => spotId);
  const parsed = { ranked_candidates: candidateIds.map((spot_id, index) => ({ spot_id, rank: index + 1, buddy_fit: 0.5, confidence: 0.5, why_for_you: [], why_now: [], uncertainty: [] })), decision_confidence: 0.5,
    user_knowledge_sufficiency: record.input.n6a1Input.baseInput.relevantUserProjection.sufficiency.level,
    moment_understanding_sufficiency: record.input.n6a1Input.baseInput.currentMoment.confidenceLevel };
  const fetchImpl = async () => { fakeCalls += 1; return { ok: true, json: async () => ({ id: "fake-response", output: [{ content: [{ type: "output_text", text: JSON.stringify(parsed) }] }], usage: { input_tokens: 1000, output_tokens: 500 } }) }; };
  const live = await createN6A3LiveExecution({ env: { DECISION_LAB_OPENAI_API_KEY: "fixture-only-not-a-real-key" }, fetchImpl });
  const payload = await live.executeSlot(record);
  assert.equal(fakeCalls, 1); assert.equal(payload.execution, "LIVE"); assert.equal(payload.validatorDisposition.valid, true);
  assert.equal(payload.inputTokens, 1000); assert.equal(payload.outputTokens, 500); assert.equal(live.config.model, "gpt-5.6-sol");
});

test("N6A.3 commits accepted and rejected model outputs atomically and immutably", async () => {
  const context = await setup("commit"); const [accepted, rejected] = context.slotIdentities;
  await commitOne(context, accepted); await commitOne(context, rejected, { valid: false });
  const manifest = await loadPilot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity });
  assert.equal(manifest.summary.committed, 2); assert.equal(manifest.summary.rejected, 1);
  await assert.rejects(() => commitOne(context, accepted), /N6A3_COMMITTED_SLOT_IMMUTABLE/);
  assert.equal((await listTemporaryArtifacts(context.dir)).length, 0); await removeExperiment(context.dir);
});

test("N6A.3 refuses every scientific identity mismatch and corrupted committed evidence", async () => {
  const context = await setup("corruption"); const slot = context.slotIdentities[0]; await commitOne(context, slot);
  for (const changed of [
    { model: "other" }, { buddyInstruction: "changed" }, { candidateContract: "changed" },
    { validator: "changed" }, { treatmentContract: "changed" }, { validationContract: "changed" },
    { groundTruthEvaluator: "changed" }
  ]) await assert.rejects(() => loadPilot({ experimentDir: context.dir, expectedIdentity: identity(changed) }), /N6A3_RESUME_IDENTITY_MISMATCH/);
  const path = join(context.dir, "slots", `${slot.slotId}.json`); const artifact = JSON.parse(await readFile(path, "utf8")); artifact.inputTokens += 1; await writeFile(path, JSON.stringify(artifact));
  await assert.rejects(() => loadPilot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity }), /N6A3_CHECKPOINT_CORRUPT/);
  await removeExperiment(context.dir);
});

test("N6A.3 makes interrupted and technical-failure costs explicit and blocks unsafe resume budgets", async () => {
  const context = await setup("budget"); const [aborted, failed] = context.slotIdentities;
  await beginSlotAttempt({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: aborted.slotId, estimatedWorstCaseCostUsd: 0.25, budgetUsd: 100 });
  let manifest = await loadPilot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, recoverInterrupted: true });
  assert.equal(manifest.cost.possibleUnverifiedUsd, 0.25); await markRetryable({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: aborted.slotId });
  await beginSlotAttempt({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: failed.slotId, estimatedWorstCaseCostUsd: 0.25, budgetUsd: 100 });
  manifest = await failSlotAttempt({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: failed.slotId, failureType: "ABORT", possibleUnverifiedCostUsd: 0.2 });
  assert.equal(manifest.cost.possibleUnverifiedUsd, 0.45);
  assert.throws(() => assertResumeBudget({ manifest, budgetUsd: 1, remainingWorstCaseCostUsd: 0.56 }), /N6A3_RESUME_BUDGET_BLOCKED/);
  assert.deepEqual(assertResumeBudget({ manifest, budgetUsd: 2, remainingWorstCaseCostUsd: 0.56 }), { priorVerifiedUsd: 0, verifiedCommittedUsd: 0, possibleUnverifiedUsd: 0.45, remainingWorstCaseCostUsd: 0.56, projectedUsd: 1.01, budgetUsd: 2 });
  await removeExperiment(context.dir);
});

test("N6A.3 refuses partial aggregation and requires exact 72/72 treatment parity", async () => {
  const context = await setup("partial"); await commitOne(context, context.slotIdentities[0]);
  await assert.rejects(() => aggregatePilot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity }), /N6A3_PILOT_INCOMPLETE:1:72/);
  const invalid = slots(context.experimentIdentity); invalid[2] = { ...invalid[2], arm: "ACTUAL" };
  await assert.rejects(() => initializePilot({ experimentDir: `${context.dir}-bad`, experimentId: "bad", experimentIdentity: context.experimentIdentity, slotIdentities: invalid }), /N6A3_SLOT_IDENTITY_HASH_MISMATCH|N6A3_TREATMENT_PARITY_FAILED|N6A3_DUPLICATE_SLOT/);
  await removeExperiment(context.dir); await removeExperiment(`${context.dir}-bad`);
});

for (const crashAfter of [1, 10, 61, 71]) test(`N6A.3 safely resumes a process crash at slot ${crashAfter}`, async () => {
  const context = await setup(`crash-${crashAfter}`); const result = await complete(context, { crashAt: crashAfter - 1 });
  const manifest = await loadPilot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity });
  assert.equal(manifest.summary.committed, 72); assert.equal(manifest.summary.remaining, 0); assert.equal(result.coverage, "72/72");
  assert.equal(manifest.slots[context.slotIdentities[crashAfter - 1].slotId].attempts, 2); await removeExperiment(context.dir);
});

for (const phase of ["BEFORE_CHECKPOINT_WRITE", "BEFORE_CHECKPOINT_RENAME", "AFTER_CHECKPOINT_RENAME", "BEFORE_MANIFEST_COMMIT"]) test(`N6A.3 never false-commits a crash at ${phase}`, async () => {
  const context = await setup(`checkpoint-${phase}`); const slot = context.slotIdentities[0];
  await beginSlotAttempt({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: slot.slotId, estimatedWorstCaseCostUsd: 0.1, budgetUsd: 100 });
  await assert.rejects(() => commitSlot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: slot.slotId, payload: checkpoint(slot), crashHook: (current) => { if (current === phase) throw new Error("SIMULATED_CRASH"); } }), /SIMULATED_CRASH/);
  const manifest = await loadPilot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, recoverInterrupted: true });
  assert.equal(manifest.slots[slot.slotId].state, "INTERRUPTED"); assert.equal(manifest.summary.committed, 0);
  await markRetryable({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: slot.slotId }); await commitOne(context, slot, { attempt: 2 });
  assert.equal((await loadPilot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity })).summary.committed, 1); await removeExperiment(context.dir);
});

test("N6A.3 produces the same scientific result hash for uninterrupted and resumed fixture runs", async () => {
  const direct = await setup("equivalence-direct", "experiment-equivalence"); const resumed = await setup("equivalence-resumed", "experiment-equivalence");
  const directResult = await complete(direct); const resumedResult = await complete(resumed, { crashAt: 60 });
  assert.equal(directResult.resultHash, resumedResult.resultHash);
  await removeExperiment(direct.dir); await removeExperiment(resumed.dir);
});

test("N6A.3 rejects malformed cost, partial JSON, duplicate slots, and secret material", async () => {
  const context = await setup("malformed"); const slot = context.slotIdentities[0];
  await beginSlotAttempt({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: slot.slotId, estimatedWorstCaseCostUsd: 0.1, budgetUsd: 100 });
  await assert.rejects(() => commitSlot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: slot.slotId, payload: { ...checkpoint(slot), verifiedCostUsd: "bad" } }), /N6A3_CHECKPOINT_NUMERIC_INVALID/);
  await assert.rejects(() => commitSlot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity, slotId: slot.slotId, payload: { ...checkpoint(slot), rawOutput: { api_key: "forbidden" } } }), /N6A3_SECRET_FIELD/);
  await writeFile(join(context.dir, "manifest.json"), "{partial");
  await assert.rejects(() => loadPilot({ experimentDir: context.dir, expectedIdentity: context.experimentIdentity }), /N6A3_MANIFEST_UNREADABLE/);
  const duplicate = slots(identity()); duplicate[1] = duplicate[0];
  await assert.rejects(() => initializePilot({ experimentDir: `${context.dir}-duplicate`, experimentId: "duplicate", experimentIdentity: identity(), slotIdentities: duplicate }), /N6A3_DUPLICATE_SLOT/);
  await removeExperiment(context.dir); await removeExperiment(`${context.dir}-duplicate`);
});
