import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { contentHash } from "../src/canonical-json.mjs";
import { aggregatePilot, assertSecretFree, listTemporaryArtifacts, loadPilot, removeExperiment } from "../src/n6a3-atomic-checkpointing.mjs";
import { buildCanonicalN6A3PilotDefinition } from "../src/n6a3-pilot-contract.mjs";
import { inspectAtomicPilot, runAtomicPilot } from "../src/n6a3-pilot-runner.mjs";
import { validateN6A2Output } from "../src/n6a2-reason-authorization.mjs";

const BUDGET = 100;
const estimate = () => 0.04;

function fakePayload(record, { rejected = false } = {}) {
  const input = record.input;
  const authorized = input.authorizedReasons.candidates;
  const ranked = input.n6a1Input.baseInput.candidates.map((candidate, index) => {
    const allowed = authorized.find(({ spot_id }) => spot_id === candidate.spotId);
    const reason = (family) => allowed?.[family]?.[0] ? [{ ...allowed[family][0] }] : [];
    const output = { spot_id: candidate.spotId, rank: index + 1, buddy_fit: 0.5, confidence: 0.5, why_for_you: reason("why_for_you"), why_now: reason("why_now"), uncertainty: reason("uncertainty") };
    if (rejected && index === 0) output.why_for_you = [{ code: "RELEVANT_TASTE_MATCH", evidence_refs: ["forged-evidence"] }];
    return output;
  });
  const parsedOutput = { ranked_candidates: ranked, decision_confidence: 0.5, user_knowledge_sufficiency: input.n6a1Input.baseInput.relevantUserProjection.sufficiency.level, moment_understanding_sufficiency: input.n6a1Input.baseInput.currentMoment.confidenceLevel };
  const validatorDisposition = validateN6A2Output(parsedOutput, input);
  const audit = validatorDisposition.audit ?? [];
  const externalAudit = audit.map(({ authorization, ...row }) => ({ ...row, authorized: authorization === "AUTHORIZED" }));
  return {
    slotId: record.identity.slotId, inputHash: record.identity.inputHash, sanitizedInput: input, model: "gpt-5.6-sol",
    modelConfig: { reasoningEffort: "medium", maxOutputTokens: 2400 }, rawOutput: { id: `fake-${record.identity.slotId}`, output: [{ content: [{ type: "output_text", text: JSON.stringify(parsedOutput) }] }] },
    parsedOutput, candidateIds: input.n6a1Input.baseInput.candidates.map(({ spotId }) => spotId), authorizedReasonSets: input.authorizedReasons,
    evidenceReferences: [...new Set(externalAudit.flatMap(({ evidenceRefs }) => evidenceRefs ?? []))].sort(),
    whyForYouAudit: externalAudit.filter(({ scope }) => scope === "WHY_FOR_YOU"), whyNowAudit: externalAudit.filter(({ scope }) => scope === "WHY_NOW"), uncertaintyAudit: externalAudit.filter(({ scope }) => scope === "UNCERTAINTY"),
    validatorDisposition, failureReason: validatorDisposition.valid ? null : validatorDisposition.reason, inputTokens: 1000, outputTokens: 500, latencyMs: 5, verifiedCostUsd: 0.04,
    startedAt: "2026-08-18T00:00:00.000Z", completedAt: "2026-08-18T00:00:01.000Z", execution: "FAKE_FIXTURE",
    freezeIds: { experimentIdentityHash: record.identity.experimentIdentityHash, n3: record.identity.relevantHashes.n3, n4: record.identity.relevantHashes.n4, n5: record.identity.relevantHashes.n5 }
  };
}

async function runRehearsal({ stopAfter = null, label, experimentId = `n6a5-${label}` }) {
  const dir = await mkdtemp(join(tmpdir(), `n6a5-${label}-`));
  const calls = new Map(); let completed = 0; let interruptionInjected = false; let transportFailureInjected = false;
  const executeSlot = async (record) => {
    const slotId = record.identity.slotId; calls.set(slotId, (calls.get(slotId) ?? 0) + 1);
    if (stopAfter !== null && completed === stopAfter && !interruptionInjected) {
      interruptionInjected = true; throw Object.assign(new Error("synthetic process interruption"), { failureType: "ABORT" });
    }
    if (record.scenario.scenarioId === "6101-13" && !transportFailureInjected) {
      transportFailureInjected = true; throw Object.assign(new Error("synthetic network failure"), { failureType: "NETWORK_FAILURE" });
    }
    const payload = fakePayload(record, { rejected: record.scenario.scenarioId === "6101-14" }); completed += 1; return payload;
  };
  const options = { experimentDir: dir, experimentId, budgetUsd: BUDGET, initialVerifiedCostUsd: 0, initialPossibleUnverifiedCostUsd: 0, estimateWorstCaseCost: estimate, executeSlot, now: () => "2026-08-18T00:00:00.000Z" };
  let first = true; let partial = null; let result;
  while (!result) {
    try { result = await runAtomicPilot({ ...options, resume: !first }); }
    catch (error) {
      if (!/N6A3_PILOT_TECHNICAL_STOP/.test(error.message)) throw error;
      if (!partial) partial = await inspectAtomicPilot({ experimentDir: dir, expectedIdentity: (await buildCanonicalN6A3PilotDefinition()).experimentIdentity });
      first = false;
    }
  }
  const definition = await buildCanonicalN6A3PilotDefinition();
  const manifest = await loadPilot({ experimentDir: dir, expectedIdentity: definition.experimentIdentity });
  assert.equal(manifest.summary.committed, 72); assert.equal(manifest.summary.remaining, 0); assert.equal(manifest.summary.rejected, 3);
  assert.equal(manifest.cost.verifiedCommittedUsd.toFixed(2), "2.88"); assert.ok(Number.isFinite(manifest.cost.possibleUnverifiedUsd));
  assert.equal((await listTemporaryArtifacts(dir)).length, 0);
  const artifact = JSON.parse(await readFile(join(dir, "final", "result.json"), "utf8")); assertSecretFree(artifact); assert.equal(artifact.coverage, "72/72");
  assert.equal(result.result.resultHash, artifact.resultHash);
  const counts = [...calls.values()]; assert.ok(counts.every((count) => count <= 2)); assert.ok(counts.filter((count) => count === 2).length >= (stopAfter === null ? 1 : 2));
  return { dir, result, manifest, artifact, partial, calls };
}

test("N6A.5 completes the full synthetic 72-slot E2E path and preserves rejected output", async () => {
  const rehearsal = await runRehearsal({ label: "direct" });
  assert.equal(rehearsal.partial.status, "PARTIAL_NON_CERTIFIABLE");
  assert.equal(rehearsal.partial.qualityVerdict, "PROHIBITED_UNTIL_72_OF_72");
  await removeExperiment(rehearsal.dir);
});

for (const stopAfter of [1, 10, 36, 61, 71]) test(`N6A.5 resumes atomically after synthetic interruption at slot ${stopAfter}`, async () => {
  const rehearsal = await runRehearsal({ stopAfter, label: `resume-${stopAfter}` });
  assert.equal(rehearsal.partial.status, "PARTIAL_NON_CERTIFIABLE");
  await removeExperiment(rehearsal.dir);
});

test("N6A.5 direct and resumed synthetic runs produce identical scientific result hashes", async () => {
  const direct = await runRehearsal({ label: "hash-direct", experimentId: "n6a5-hash-equivalence" }); const resumed = await runRehearsal({ stopAfter: 36, label: "hash-resumed", experimentId: "n6a5-hash-equivalence" });
  assert.equal(direct.artifact.resultHash, resumed.artifact.resultHash);
  await removeExperiment(direct.dir); await removeExperiment(resumed.dir);
});
