import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash, canonicalJson } from "./canonical-json.mjs";
import { repoRoot } from "./io.mjs";
import { buildN6AScenario } from "./n6a-scenarios.mjs";
import { buildN6A1Input } from "./n6a1-reason-evidence-integrity.mjs";

const SMOKE_PATH = resolve(repoRoot, "decision-lab/baselines/n6a-ai-decision-buddy-smoke-v1.json");
export const FORENSIC_VERSION = "backyrd-n6a1-reason-evidence-forensics-v1";

function oldReasonAudit(code, candidate, input) {
  const concepts = new Set(candidate.concepts.map(({ concept }) => concept));
  const intent = new Set((input.currentIntent.conceptDirections ?? []).filter(({ direction }) => direction === 1).map(({ concept }) => concept));
  const taste = input.relevantUserProjection.relevantTaste ?? [];
  if (code === "USER_TASTE_MATCH") return taste.some((row) => row.sourceLayer !== "CONTEXT" && row.confidence >= 0.65 && row.relevance >= 0.65 && concepts.has(row.concept)) ? "SUPPORTED" : "UNSUPPORTED";
  if (code === "CONTEXTUAL_TASTE_MATCH") return taste.some((row) => row.sourceLayer === "CONTEXT" && row.confidence >= 0.65 && row.relevance >= 0.65 && concepts.has(row.concept)) ? "SUPPORTED" : "UNSUPPORTED";
  if (code === "PLACE_TYPE_TASTE_MATCH" || code === "OCCASION_PATTERN_MATCH") return "AMBIGUOUS_CONTRACT";
  if (code === "CURRENT_INTENT_MATCH") return [...intent].some((concept) => concepts.has(concept)) ? "SUPPORTED" : "VALIDATOR_FALSE_POSITIVE";
  if (["CURRENT_MOMENT_MATCH", "CONTEXTUAL_SPOT_MATCH", "PRACTICAL_FIT"].includes(code)) return "AMBIGUOUS_CONTRACT";
  if (code === "LOW_USER_KNOWLEDGE") return input.relevantUserProjection.sufficiency.level === "LOW" ? "SUPPORTED" : "UNSUPPORTED";
  if (code === "LOW_MOMENT_UNDERSTANDING") return input.currentMoment.confidenceLevel !== "HIGH" ? "SUPPORTED" : "UNSUPPORTED";
  if (code === "SPARSE_SPOT_INTELLIGENCE") return candidate.evidenceSufficiency === "SPARSE" ? "SUPPORTED" : "UNSUPPORTED";
  if (code === "CONTRADICTORY_EVIDENCE") return candidate.contradictions.length || input.relevantUserProjection.contradictions.length ? "SUPPORTED" : "UNSUPPORTED";
  return "UNSUPPORTED";
}

function runForensics(smoke) {
  const cases = smoke.runs.map((run) => {
    const [, seedText, indexText] = run.scenarioId.match(/^(\d+)-(\d+)$/) ?? [];
    const scenario = buildN6AScenario({ seed: Number(seedText), index: Number(indexText), arm: run.arm });
    const n6a1Input = buildN6A1Input(scenario.input);
    if (!run.validation.valid) return {
      scenarioId: run.scenarioId,
      family: run.family,
      historicalOutcome: "REJECTED",
      replay: "UNREPLAYABLE_MISSING_PARSED_OUTPUT",
      classification: "OTHER_MEASUREMENT_ARTIFACT_GAP",
      reason: "The original runner retained only UNSUPPORTED_REASON_EVIDENCE, ranking:null, and no parsed response/reason codes for invalid output.",
      upstreamAndInputPresent: Boolean(n6a1Input.reasonEvidence.entries.length),
      exactModelContractSerializationValidatorClassification: "UNKNOWN_NOT_RECOVERABLE"
    };
    const audits = run.ranking.flatMap((ranked) => {
      const candidate = scenario.input.candidates.find(({ spotId }) => spotId === ranked.spot_id);
      return [
        ...ranked.why_for_you_reason_codes.map((code) => ({ spotId: candidate.spotId, scope: "WHY_FOR_YOU", code, result: oldReasonAudit(code, candidate, scenario.input) })),
        ...ranked.why_now_reason_codes.map((code) => ({ spotId: candidate.spotId, scope: "WHY_NOW", code, result: oldReasonAudit(code, candidate, scenario.input) })),
        ...ranked.uncertainty_codes.map((code) => ({ spotId: candidate.spotId, scope: "UNCERTAINTY", code, result: oldReasonAudit(code, candidate, scenario.input) }))
      ];
    });
    return {
      scenarioId: run.scenarioId,
      family: run.family,
      historicalOutcome: "ACCEPTED",
      replay: "FAIL_NEW_CONTRACT_MISSING_EVIDENCE_REFS_AND_LEGACY_VOCABULARY",
      classification: "ACCEPT_REQUIRES_HARDENED_REVIEW",
      reasonAudits: audits,
      oldValidatorSummary: Object.fromEntries(["SUPPORTED", "UNSUPPORTED", "VALIDATOR_FALSE_POSITIVE", "AMBIGUOUS_CONTRACT"].map((key) => [key, audits.filter((row) => row.result === key).length]))
    };
  });
  return {
    version: FORENSIC_VERSION,
    sourceSmokeHash: contentHash(smoke),
    noExternalAiCalls: true,
    cases,
    rootCauseDistribution: {
      modelClaimFailureProven: 0,
      contractFailureObserved: cases.filter((row) => row.historicalOutcome === "ACCEPTED").length,
      serializationLossProven: 0,
      validatorFalsePositiveObserved: cases.flatMap((row) => row.reasonAudits ?? []).filter((row) => row.result === "VALIDATOR_FALSE_POSITIVE").length,
      ambiguousContractObserved: cases.flatMap((row) => row.reasonAudits ?? []).filter((row) => row.result === "AMBIGUOUS_CONTRACT").length,
      measurementArtifactGap: cases.filter((row) => row.classification === "OTHER_MEASUREMENT_ARTIFACT_GAP").length
    },
    interpretation: "Three historical rejects cannot be assigned to model, contract, serialization, or validator without their missing parsed outputs. The retained accepts expose broad legacy validator semantics; they are not proof that an evidence-closed reason was supplied."
  };
}

export async function generateN6A1Forensics({ write = false } = {}) {
  const smoke = JSON.parse(await readFile(SMOKE_PATH, "utf8"));
  const body = runForensics(smoke);
  const result = { ...body, resultHash: contentHash(body) };
  if (write) await writeFile(resolve(repoRoot, "decision-lab/baselines/n6a1-reason-evidence-forensics-v1.json"), `${canonicalJson(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const result = await generateN6A1Forensics({ write: process.argv.includes("--write") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
