export type OpenAIModerationResult = {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
  category_applied_input_types?: Record<string, string[]>;
};

export type SafetyPolicy = {
  policy_id: string;
  version: string;
  status: "shadow" | "active";
  content_types: Record<string, {
    review_threshold: number;
    temporary_hide_threshold: number;
  }>;
};

export function normalizeCategory(key: string): string {
  return key.replaceAll("/", "_").replaceAll("-", "_");
}

export function severityFor(category: string): number {
  const map: Record<string, number> = {
    sexual_minors: 5,
    hate_threatening: 5,
    harassment_threatening: 5,
    self_harm_intent: 5,
    self_harm_instructions: 5,
    illicit_violent: 5,
    violence_graphic: 4,
    hate: 4,
    harassment: 3,
    sexual: 3,
    violence: 3,
    illicit: 3,
    self_harm: 4,
  };
  return map[category] ?? 2;
}

export function chooseDominant(result: OpenAIModerationResult) {
  const entries = Object.entries(result.category_scores ?? {})
    .map(([key, score]) => ({
      category: normalizeCategory(key),
      score: Number(score ?? 0),
      flagged: Boolean(result.categories?.[key]),
    }))
    .sort((a, b) => b.score - a.score);

  return entries[0] ?? { category: "none", score: 0, flagged: false };
}

export function orchestrate(input: {
  result: OpenAIModerationResult;
  policy: SafetyPolicy;
  contentType: string;
}) {
  const dominant = chooseDominant(input.result);
  const cfg = input.policy.content_types[input.contentType] ?? {
    review_threshold: 0.65,
    temporary_hide_threshold: 0.95,
  };
  const severity = severityFor(dominant.category);

  let recommendedAction = "allow";
  let caseStatus = "decided";

  if (dominant.score >= cfg.temporary_hide_threshold && severity >= 4) {
    recommendedAction = "temporary_hide";
    caseStatus = "needs_review";
  } else if (input.result.flagged || dominant.score >= cfg.review_threshold) {
    recommendedAction = "allow_log";
    caseStatus = "needs_review";
  }

  // Shadow mode never enforces automatically.
  const finalAction = input.policy.status === "shadow" ? "allow_log" : recommendedAction;

  return {
    finalAction,
    recommendedAction,
    caseStatus,
    category: dominant.category,
    severity,
    confidence: dominant.score,
    reasonCodes: [
      `PRIMARY_${dominant.category.toUpperCase()}`,
      input.policy.status === "shadow" ? "SHADOW_MODE" : "ACTIVE_POLICY",
    ],
  };
}
