export const PRODUCT_MOOD_CONTRACT_VERSION = "backyrd-product-mood-v2" as const;
export const PRODUCT_MOOD_MAX_SELECTIONS = 2 as const;
export const PRODUCT_MOOD_MAX_EXPRESSION_LENGTH = 40 as const;
export const PRODUCT_MOOD_PERCENTAGE_MIN_CONTRIBUTORS = 3 as const;

export type MoodResolutionStatus = "RESOLVED" | "UNRESOLVED" | "INVALID";
export type MoodEvidenceState = "EARLY" | "ESTABLISHED";

export type MoodInput = { rawExpression: string };

export type MoodResolution = {
  status: MoodResolutionStatus;
  rawExpression?: string;
  normalizedExpression: string;
  conceptKey?: string;
  label?: string;
  resolutionKind: "EXACT" | "ALIAS" | "ADMIN" | "UNRESOLVED" | "INVALID" | "DUPLICATE_CONCEPT";
  reason?: string;
  contractVersion: typeof PRODUCT_MOOD_CONTRACT_VERSION;
};

export type SpotMoodProfileItem = {
  spot_id: string;
  concept_key: string;
  label: string;
  canonical_label: string;
  concept_contributors: number | null;
  eligible_contributors: number | null;
  percentage: number | null;
  evidence_state: MoodEvidenceState;
  rank: number;
};

export type MoodSuggestion = {
  concept_key: string;
  label: string;
  matched_expression: string;
  match_type: "CANONICAL" | "ALIAS";
  usage_count: number;
};

export function validateMoodExpressions(values: readonly string[]): string[] {
  const expressions = values.map((value) => value.trim()).filter(Boolean);
  if (expressions.length > PRODUCT_MOOD_MAX_SELECTIONS) throw new Error("MAX_TWO_MOODS");
  if (expressions.some((value) => [...value].length > PRODUCT_MOOD_MAX_EXPRESSION_LENGTH)) {
    throw new Error("MOOD_TOO_LONG");
  }
  return expressions;
}
