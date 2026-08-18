import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { aggregatePilot, assertResumeBudget, beginSlotAttempt, commitSlot, failSlotAttempt, initializePilot, loadPilot, markRetryable } from "./n6a3-atomic-checkpointing.mjs";
import { buildCanonicalN6A3PilotDefinition } from "./n6a3-pilot-contract.mjs";

const technicalFailure = (error) => {
  if (["API_FAILURE", "TIMEOUT", "ABORT", "NETWORK_FAILURE"].includes(error?.failureType)) return error.failureType;
  if (error?.name === "AbortError" || /ABORT/i.test(error?.message ?? "")) return "ABORT";
  if (/TIMEOUT/i.test(error?.message ?? "")) return "TIMEOUT";
  if (/NETWORK|FETCH_FAILED/i.test(error?.message ?? "")) return "NETWORK_FAILURE";
  if (/OPENAI_API_ERROR/i.test(error?.message ?? "")) return "API_FAILURE";
  return null;
};

export async function inspectAtomicPilot({ experimentDir, expectedIdentity }) {
  const manifest = await loadPilot({ experimentDir, expectedIdentity });
  return { status: manifest.summary.committed === 72 ? "COMPLETE" : "PARTIAL_NON_CERTIFIABLE", summary: manifest.summary, cost: manifest.cost, qualityVerdict: "PROHIBITED_UNTIL_72_OF_72" };
}

export async function runAtomicPilot({
  experimentDir, experimentId, budgetUsd, initialVerifiedCostUsd = 0, initialPossibleUnverifiedCostUsd = 0,
  estimateWorstCaseCost, executeSlot, resume = false, now = () => new Date().toISOString()
}) {
  const definition = await buildCanonicalN6A3PilotDefinition();
  let manifest;
  if (resume) {
    manifest = await loadPilot({ experimentDir, expectedIdentity: definition.experimentIdentity, recoverInterrupted: true, now: now() });
    for (const [slotId, slot] of Object.entries(manifest.slots)) if (["INTERRUPTED", "FAILED"].includes(slot.state)) {
      manifest = await markRetryable({ experimentDir, expectedIdentity: definition.experimentIdentity, slotId, now: now() });
    }
  } else {
    manifest = await initializePilot({ experimentDir, experimentId, experimentIdentity: definition.experimentIdentity, slotIdentities: definition.records.map(({ identity }) => identity), initialVerifiedCostUsd, initialPossibleUnverifiedCostUsd, now: now() });
  }
  const bySlot = new Map(definition.records.map((record) => [record.identity.slotId, record]));
  const pending = Object.entries(manifest.slots).filter(([, slot]) => slot.state === "PENDING");
  const remainingWorstCaseCostUsd = pending.reduce((sum, [slotId]) => sum + estimateWorstCaseCost(bySlot.get(slotId)), 0);
  const budget = assertResumeBudget({ manifest, budgetUsd, remainingWorstCaseCostUsd });
  if (!executeSlot) return { stage: "DRY_RUN", externalAiCalls: 0, preflight: definition.preflight, manifest: manifest.summary, budget };
  for (const [slotId] of pending) {
    const record = bySlot.get(slotId); const estimate = estimateWorstCaseCost(record);
    const current = await loadPilot({ experimentDir, expectedIdentity: definition.experimentIdentity });
    const exactRemainingWorstCase = Object.entries(current.slots).filter(([, slot]) => slot.state !== "COMMITTED").reduce((sum, [remainingSlotId]) => sum + estimateWorstCaseCost(bySlot.get(remainingSlotId)), 0);
    await beginSlotAttempt({ experimentDir, expectedIdentity: definition.experimentIdentity, slotId, estimatedWorstCaseCostUsd: estimate, remainingWorstCaseCostUsd: exactRemainingWorstCase, budgetUsd, now: now() });
    let payload;
    try {
      payload = await executeSlot(record);
    } catch (error) {
      const failureType = technicalFailure(error);
      if (!failureType) throw new Error(`N6A3_MEASUREMENT_INTEGRITY_STOP:${slotId}:${error?.name ?? "Error"}:${error?.message ?? "unknown"}`);
      await failSlotAttempt({ experimentDir, expectedIdentity: definition.experimentIdentity, slotId, failureType, possibleUnverifiedCostUsd: estimate, now: now() });
      throw new Error(`N6A3_PILOT_TECHNICAL_STOP:${slotId}:${error?.name ?? "Error"}:${error?.message ?? "unknown"}`);
    }
    await commitSlot({ experimentDir, expectedIdentity: definition.experimentIdentity, slotId, payload, now: now() });
  }
  const result = await aggregatePilot({ experimentDir, expectedIdentity: definition.experimentIdentity, now: now() });
  return { stage: "PILOT", externalAiCalls: pending.length, result };
}

export async function readCommittedSlot(experimentDir, slotId) { return JSON.parse(await readFile(join(experimentDir, "slots", `${slotId}.json`), "utf8")); }

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.argv.includes("--live")) throw new Error("N6A3_LIVE_EXECUTOR_REQUIRES_EXPLICIT_SEPARATE_AUTHORIZATION");
  const definition = await buildCanonicalN6A3PilotDefinition();
  process.stdout.write(`${JSON.stringify({ mode: "PREFLIGHT_ONLY", externalAiCalls: 0, identityHash: definition.experimentIdentity.identityHash, ...definition.preflight }, null, 2)}\n`);
}
