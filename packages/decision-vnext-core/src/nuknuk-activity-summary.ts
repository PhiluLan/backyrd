import type { DecisionProductRuntimeTiming } from "./product-decision.js";
import type { DecisionProductResponse } from "./product-v1-contracts.js";
import type { NuknukActivityOutcome, NuknukActivityRow } from "./admin-nuknuk-activity.js";

const failureStages = ["INTERPRETATION", "EVALUATION", "RESPONSE_BUILD", "IDEMPOTENCY", "LEARNING", "FINAL_OUTPUT"] as const;

function failureOutcome(code: string | undefined): NuknukActivityOutcome {
  switch (code) {
    case "DECISION_NEEDS_CLARIFICATION": return "CLARIFICATION";
    case "DECISION_NUKNUK_NEW_PLAN": return "NEW_PLAN";
    case "DECISION_NUKNUK_OFF_TOPIC": return "OFF_TOPIC";
    case "DECISION_NUKNUK_UNRESOLVED": return "UNRESOLVED";
    case "REQUEST_TIMEOUT": return "TIMEOUT";
    default: return "ERROR";
  }
}

export function summarizeNuknukActivity(input: {
  response?: Pick<DecisionProductResponse, "primaryCandidateId" | "candidates" | "clarification">;
  failure?: { stage: string; code: string };
  stages: readonly DecisionProductRuntimeTiming[];
  calls: readonly ("full" | "dialogue" | "simple")[];
  dialogue: boolean;
  elapsedMs: number;
}): Omit<NuknukActivityRow, "id" | "recorded_at"> {
  const { response, failure, stages, calls } = input;
  const count = response ? response.candidates.length : null;
  const outcome = response
    ? response.primaryCandidateId ? "MATCHES" : count ? "PROVISIONAL" : response.clarification ? "CLARIFICATION" : "EMPTY"
    : failureOutcome(failure?.code);
  const path = !calls.length ? "NO_MODEL_CALL" : input.dialogue ? "DIALOGUE"
    : calls[0] === "simple" ? calls.length > 1 ? "SIMPLE_TO_FULL" : "SIMPLE" : "FULL";
  return {
    outcome,
    path,
    clarification: Boolean(response?.clarification) || outcome === "CLARIFICATION",
    candidate_count: count,
    model_calls: calls.length,
    model_ms: stages.find(stage => stage.stage === "INTERPRETATION")?.operationMs ?? null,
    librarian_ms: stages.find(stage => stage.stage === "EVALUATION")?.operationMs ?? null,
    total_ms: Math.round(input.elapsedMs),
    failure_stage: outcome === "TIMEOUT" || outcome === "ERROR"
      ? failureStages.find(stage => stage === failure?.stage) ?? null : null,
  };
}
