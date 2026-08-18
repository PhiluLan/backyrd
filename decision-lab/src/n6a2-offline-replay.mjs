import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash, canonicalJson } from "./canonical-json.mjs";
import { repoRoot } from "./io.mjs";
import { buildN6AScenario } from "./n6a-scenarios.mjs";
import { buildN6A2Input, validateN6A2Output } from "./n6a2-reason-authorization.mjs";

const RESULT_PATH = resolve(repoRoot, "decision-lab/baselines/n6a1-new-smoke-result-v1.json");
export const N6A2_REPLAY_VERSION = "backyrd-n6a2-offline-replay-v1";

export async function replayN6A2Authorization({ write = false } = {}) {
  const smoke = JSON.parse(await readFile(RESULT_PATH, "utf8"));
  const runs = smoke.runs.map((run) => {
    const [, seed, index] = run.scenarioId.match(/^(\d+)-(\d+)$/).map(Number);
    const scenario = buildN6AScenario({ seed, index, arm: "ACTUAL" });
    const input = buildN6A2Input(scenario.input);
    const validation = validateN6A2Output(run.capture.parsedStructuredOutput, input);
    const reasons = run.capture.parsedStructuredOutput.ranked_candidates.flatMap((candidate) => [
      ...candidate.why_for_you.map((reason) => ({ spotId: candidate.spot_id, family: "why_for_you", ...reason })),
      ...candidate.why_now.map((reason) => ({ spotId: candidate.spot_id, family: "why_now", ...reason })),
      ...candidate.uncertainty.map((reason) => ({ spotId: candidate.spot_id, family: "uncertainty", ...reason }))
    ]);
    const contradiction = reasons.filter(({ code }) => code === "CONTRADICTORY_EVIDENCE").map((reason) => {
      const authorized = input.authorizedReasons.candidates.find(({ spot_id }) => spot_id === reason.spotId).uncertainty.some((entry) => entry.code === reason.code && JSON.stringify([...entry.evidence_refs].sort()) === JSON.stringify([...reason.evidence_refs].sort()));
      return { ...reason, authorized, canonicalContradictionMarkers: input.n6a1Input.reasonEvidence.entries.filter((entry) => entry.kind === "CONTRADICTION" && (!entry.spotId || entry.spotId === reason.spotId)).map(({ ref }) => ref) };
    });
    return { scenarioId: run.scenarioId, originalValidatorDisposition: run.validation, n6a2ValidatorDisposition: { valid: validation.valid, reason: validation.reason ?? null }, reasonCount: reasons.length, contradiction };
  });
  const contradictions = runs.flatMap(({ contradiction }) => contradiction);
  const body = { version: N6A2_REPLAY_VERSION, sourceSmokeResultHash: contentHash(smoke), externalAiCalls: 0, runs, summary: { originalAccepted: smoke.acceptedOutputs, allEightContradictionsNotAuthorized: contradictions.length === 8 && contradictions.every(({ authorized }) => !authorized), contradictionCount: contradictions.length, authorizedReasonCount: smoke.reasonAudit.supported, offlineReplayIsNotQualityRun: true } };
  const result = { ...body, resultHash: contentHash(body) };
  if (write) await writeFile(resolve(repoRoot, "decision-lab/baselines/n6a2-authorization-offline-replay-v1.json"), `${canonicalJson(result)}\n`);
  return result;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await replayN6A2Authorization({ write: process.argv.includes("--write") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
