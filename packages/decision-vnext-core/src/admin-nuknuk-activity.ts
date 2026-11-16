export type NuknukActivityOutcome =
  | "MATCHES" | "PROVISIONAL" | "EMPTY" | "CLARIFICATION" | "NEW_PLAN"
  | "OFF_TOPIC" | "UNRESOLVED" | "TIMEOUT" | "ERROR";

export interface NuknukActivityRow {
  id: string;
  recorded_at: string;
  outcome: NuknukActivityOutcome;
  path: "SIMPLE" | "FULL" | "SIMPLE_TO_FULL" | "DIALOGUE" | "NO_MODEL_CALL";
  clarification: boolean;
  candidate_count: number | null;
  model_calls: number;
  model_ms: number | null;
  librarian_ms: number | null;
  total_ms: number;
  failure_stage: "INTERPRETATION" | "EVALUATION" | "RESPONSE_BUILD" | "IDEMPOTENCY" | "LEARNING" | "FINAL_OUTPUT" | null;
}

export interface NuknukActivityOverview {
  checkedAt: string;
  totals: {
    requests: number;
    matches: number;
    provisional: number;
    clarifications: number;
    errors: number;
    medianMs: number | null;
    p95Ms: number | null;
  };
  recent: NuknukActivityRow[];
}
