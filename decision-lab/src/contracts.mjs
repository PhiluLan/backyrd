const requiredIdentity = ["worldId", "worldHash", "split", "seedId", "generatorVersion", "groundTruthVersion", "scenarioVersion", "evaluationVersion", "gateVersion", "gitSha", "migrationHash", "engineSourceHash", "embeddingMode", "runId", "inputHash", "outputHash"];
export const SPLITS = ["DEVELOPMENT", "REGRESSION", "LOCKED_HOLDOUT"];
export const FAILURE_CLASSES = ["LAB_INVALIDITY", "DATA_OR_SPLIT_LEAKAGE", "TRACE_OR_CONTRACT_FAILURE", "ELIGIBILITY_FAILURE", "DISTRIBUTION_FAILURE", "RETRIEVAL_FAILURE", "RANKING_FAILURE", "CONTEXT_UNDERREACTION", "CONTEXT_OVERREACTION", "PERSONALIZATION_MISSED_LIFT", "PERSONALIZATION_HARM", "COLD_START_FAILURE", "MATURE_USER_FAILURE", "DIVERSITY_FAILURE", "NOVELTY_FAILURE", "REPETITION_FAILURE", "FALLBACK_FAILURE", "EXPLANATION_UNSUPPORTED", "EXPLANATION_MISALIGNED", "LATENCY_OR_RELIABILITY_FAILURE", "OUTCOME_POTENTIAL_FAILURE", "KNOWN_ENGINE_DEFECT", "EVALUATOR_FAILURE"];

export function assertIdentity(value) {
  for (const key of requiredIdentity) if (value[key] === undefined || value[key] === null || value[key] === "") throw new Error(`Missing identity field: ${key}`);
  if (!SPLITS.includes(value.split)) throw new Error(`Unknown split: ${value.split}`);
  return value;
}

export function assertScenario(value) {
  for (const key of ["id", "version", "split", "family", "worldId", "seedId", "userId", "maturity", "persona", "request", "context", "hardConstraints", "softPreferences", "relevanceRule", "invariants", "applicableMetrics", "tags", "rationale", "provenance", "hash"]) if (value[key] === undefined) throw new Error(`Scenario missing ${key}`);
  if (!SPLITS.includes(value.split)) throw new Error(`Unknown scenario split: ${value.split}`);
  return value;
}

export function assertTrace(trace) {
  if (!trace || !Array.isArray(trace.stages) || !Array.isArray(trace.results)) throw new Error("Trace contract incomplete");
  for (const stage of trace.stages) if (!stage.name || !Array.isArray(stage.candidates)) throw new Error("Trace stage incomplete");
  return trace;
}

export function failureRecord(input) {
  if (!FAILURE_CLASSES.includes(input.primaryClass)) throw new Error(`Unknown failure class: ${input.primaryClass}`);
  return { secondaryClasses: [], severity: "P2", ownership: "ENGINE", status: "OPEN", ...input };
}
