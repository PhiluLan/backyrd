import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { estimateRequestCost, estimateTokens } from "./n6a-ai-decision-buddy.mjs";
import { n6A2Instructions, n6A2OutputSchema, validateN6A2Output } from "./n6a2-reason-authorization.mjs";
import { canonicalizeProviderResponse } from "./n6a7-provider-response.mjs";
import { repoRoot } from "./io.mjs";

const readConfig = async (path) => JSON.parse(await readFile(resolve(repoRoot, path), "utf8"));
const outputText = (raw) => { for (const item of raw.output ?? []) for (const content of item.content ?? []) if (content.type === "output_text") return content.text; return null; };
const reasonFamilies = [["why_for_you", "WHY_FOR_YOU"], ["why_now", "WHY_NOW"], ["uncertainty", "UNCERTAINTY"]];

const emptyPayload = (input) => ({
  ranked_candidates: input.n6a1Input.baseInput.candidates.map((candidate, index) => ({ spot_id: candidate.spotId, rank: index + 1, buddy_fit: 0.5, confidence: 0.5, why_for_you: [], why_now: [], uncertainty: [] })),
  decision_confidence: 0.5,
  user_knowledge_sufficiency: input.n6a1Input.baseInput.relevantUserProjection.sufficiency.level,
  moment_understanding_sufficiency: input.n6a1Input.baseInput.currentMoment.confidenceLevel
});

function fullReasonAudit(parsed, input) {
  return (parsed?.ranked_candidates ?? []).flatMap((candidateOutput) => reasonFamilies.flatMap(([field, family]) => (candidateOutput[field] ?? []).map((reason) => {
    const probe = emptyPayload(input); probe.ranked_candidates.find(({ spot_id }) => spot_id === candidateOutput.spot_id)[field] = [reason];
    const disposition = validateN6A2Output(probe, input); const authorization = disposition.audit?.findLast((row) => row.authorization);
    return { spotId: candidateOutput.spot_id, family, code: reason.code, evidenceRefs: reason.evidence_refs, authorized: authorization?.authorization === "AUTHORIZED", validatorDisposition: disposition.valid ? "PASS" : disposition.reason };
  })));
}

export async function createN6A3LiveExecution({ env = process.env, fetchImpl = globalThis.fetch, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  const [base, n6a1, n6a2] = await Promise.all([
    readConfig("decision-lab/config/n6a-ai-decision-buddy-v1.json"), readConfig("decision-lab/config/n6a1-reason-evidence-integrity-v1.json"), readConfig("decision-lab/config/n6a2-reason-authorization-v1.json")
  ]);
  const config = { ...base, model: n6a2.baseModel, modelConfig: n6a1.modelConfig, promptVersion: n6a2.instructionVersion };
  const estimateWorstCaseCost = ({ input }) => {
    const candidateIds = input.n6a1Input.baseInput.candidates.map(({ spotId }) => spotId); const schema = n6A2OutputSchema(candidateIds);
    const inputTokens = estimateTokens({ instructions: n6A2Instructions(), input, schema }, config.tokenEstimateSafetyMultiplier);
    return estimateRequestCost(config, inputTokens, config.modelConfig.maxOutputTokens);
  };
  const executeSlot = async ({ identity, input }) => {
    if (!env.DECISION_LAB_OPENAI_API_KEY) throw Object.assign(new Error("N6A3_API_KEY_REQUIRED"), { failureType: "API_FAILURE" });
    const candidateIds = input.n6a1Input.baseInput.candidates.map(({ spotId }) => spotId); const schema = n6A2OutputSchema(candidateIds);
    const startedAt = new Date().toISOString(); const started = performance.now(); const controller = new AbortController(); const timer = setTimeoutImpl(() => controller.abort(), config.modelConfig.timeoutMs);
    let response;
    try {
      response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST", signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${env.DECISION_LAB_OPENAI_API_KEY}` },
        body: JSON.stringify({ model: config.model, instructions: n6A2Instructions(), input: JSON.stringify(input), reasoning: { effort: config.modelConfig.reasoningEffort }, max_output_tokens: config.modelConfig.maxOutputTokens, text: { format: { type: "json_schema", name: "backyrd_n6a2_buddy", strict: true, schema } } })
      });
    } catch (error) {
      if (error?.name === "AbortError") error.failureType = "ABORT"; else error.failureType = "NETWORK_FAILURE";
      throw error;
    } finally { clearTimeoutImpl(timer); }
    const latencyMs = performance.now() - started;
    if (!response.ok) throw Object.assign(new Error(`OPENAI_API_ERROR:${response.status}`), { failureType: "API_FAILURE" });
    const rawOutput = await response.json(); const canonicalProviderResponse = canonicalizeProviderResponse(rawOutput); let parsedOutput = null;
    try { parsedOutput = JSON.parse(canonicalProviderResponse.output.text); } catch { /* validator records malformed output */ }
    const validatorDisposition = validateN6A2Output(parsedOutput, input); const audit = fullReasonAudit(parsedOutput, input);
    const inputTokens = Number(rawOutput.usage?.input_tokens ?? 0); const outputTokens = Number(rawOutput.usage?.output_tokens ?? 0);
    return {
      slotId: identity.slotId, inputHash: identity.inputHash, sanitizedInput: input, model: config.model, modelConfig: config.modelConfig,
      canonicalProviderResponse, checkpointContractVersion: "backyrd-n6a7-checkpoint-compatibility-v1", parsedOutput, candidateIds, authorizedReasonSets: input.authorizedReasons, evidenceReferences: [...new Set(audit.flatMap(({ evidenceRefs }) => evidenceRefs))].sort(),
      whyForYouAudit: audit.filter(({ family }) => family === "WHY_FOR_YOU"), whyNowAudit: audit.filter(({ family }) => family === "WHY_NOW"), uncertaintyAudit: audit.filter(({ family }) => family === "UNCERTAINTY"),
      validatorDisposition, failureReason: validatorDisposition.valid ? null : validatorDisposition.reason, inputTokens, outputTokens, latencyMs,
      verifiedCostUsd: estimateRequestCost(config, inputTokens, outputTokens), startedAt, completedAt: new Date().toISOString(), execution: "LIVE",
      freezeIds: { experimentIdentityHash: identity.experimentIdentityHash, n3: identity.relevantHashes.n3, n4: identity.relevantHashes.n4, n5: identity.relevantHashes.n5 }
    };
  };
  return { config, estimateWorstCaseCost, executeSlot };
}
