export type OpenAIModerationResult = {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
  category_applied_input_types?: Record<string, string[]>;
};

type ContentTypePolicy = {
  review_threshold?: number;
  temporary_hide_threshold?: number;
};

type PolicyCategory = {
  severity_default?: number;
  default_action?: string;
  shadow_action?: string;
  subcategories?: string[];
};

export type SafetyPolicy = {
  policy_id?: string;
  version?: string;
  status?: "shadow" | "active";
  content_types?: Record<string, ContentTypePolicy>;
  protected_characteristics?: string[];
  policy_categories?: Record<string, PolicyCategory>;
  business_context_exceptions?: {
    allowed_access_rules?: string[];
    not_allowed_access_rules?: string[];
  };
};

type CategorySignal = {
  category: string;
  score: number;
  flagged: boolean;
  threshold: number;
};

type LocalPolicySignal = {
  matched: boolean;
  policyCategory: string;
  subcategory: string;
  modelCategory: string;
  severity: number;
  confidence: number;
  reasonCodes: string[];
};

const DEFAULT_CATEGORY_THRESHOLDS: Record<string, number> = {
  hate: 0.10,
  hate_threatening: 0.08,
  harassment: 0.30,
  harassment_threatening: 0.12,
  self_harm: 0.20,
  self_harm_intent: 0.10,
  self_harm_instructions: 0.08,
  violence: 0.35,
  violence_graphic: 0.18,
  sexual: 0.55,
  sexual_minors: 0.05,
  illicit: 0.40,
  illicit_violent: 0.15,
};

const LEGITIMATE_ACCESS_RULES: RegExp[] = [
  /\beinlass\s+ab\s+\d{1,2}\b/iu,
  /\bab\s+\d{1,2}\s+jahren\b/iu,
  /\bgeschlossene\s+gesellschaft\b/iu,
  /\bzutritt\s+nur\s+mit\s+einladung\b/iu,
  /\bnur\s+mit\s+reservation\b/iu,
  /\breservierung\s+erforderlich\b/iu,
  /\bdresscode\b/iu,
  /\bkeine\s+haustiere\b/iu,
  /\bkapazität\s+erreicht\b/iu,
];

const PROTECTED_CHARACTERISTIC_TERMS: RegExp[] = [
  /\bherkunft\b/iu,
  /\bnationalität\b/iu,
  /\bethnie\b/iu,
  /\breligion\b/iu,
  /\bgeschlecht\b/iu,
  /\bsexuelle[rn]?\s+orientierung\b/iu,
  /\bgeschlechtsidentität\b/iu,
  /\bbehinderung\b/iu,
  /\brollstuhlfahrer(?:in|innen)?\b/iu,
  /\bkrankheit\b/iu,
  /\bausländer(?:in|innen)?\b/iu,
  /\bmuslime?\b/iu,
  /\bjuden?\b/iu,
  /\bchristen?\b/iu,
  /\bschwarze[nr]?\b/iu,
  /\bweisse[nr]?\b/iu,
  /\basiaten?\b/iu,
];

const EXCLUSION_TERMS: RegExp[] = [
  /\bnicht\s+willkommen\b/iu,
  /\bunerwünscht\b/iu,
  /\bkein(?:e|en|er|es)?\s+zutritt\b/iu,
  /\berhalten\s+keinen\s+zutritt\b/iu,
  /\bdürfen\s+nicht\s+(?:rein|hinein|eintreten)\b/iu,
  /\bwir\s+bedienen\s+(?:keine|keinen|nicht)\b/iu,
  /\bwerden\s+nicht\s+bedient\b/iu,
  /\bkein(?:e|en|er|es)?\s+service\b/iu,
];

const AMBIGUOUS_GROUP_EXCLUSION: RegExp[] = [
  /\bbestimmte(?:n|r|s)?\s+gruppen?\b/iu,
  /\bgewisse(?:n|r|s)?\s+gruppen?\b/iu,
  /\bbestimmte(?:n|r|s)?\s+personengruppen?\b/iu,
  /\bsolche\s+leute\b/iu,
];

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

  return map[category] ?? 0;
}

function categorySignals(
  result: OpenAIModerationResult,
): CategorySignal[] {
  return Object.entries(result.category_scores ?? {})
    .map(([rawCategory, rawScore]) => {
      const category = normalizeCategory(rawCategory);

      return {
        category,
        score: Number(rawScore ?? 0),
        flagged: Boolean(result.categories?.[rawCategory]),
        threshold:
          DEFAULT_CATEGORY_THRESHOLDS[category] ??
          Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function chooseDominant(
  result: OpenAIModerationResult,
): CategorySignal {
  return categorySignals(result)[0] ?? {
    category: "none",
    score: 0,
    flagged: false,
    threshold: Number.POSITIVE_INFINITY,
  };
}

function choosePolicyRelevant(
  result: OpenAIModerationResult,
): CategorySignal | null {
  const relevant = categorySignals(result)
    .filter((entry) => entry.flagged || entry.score >= entry.threshold)
    .sort((a, b) => {
      if (a.flagged !== b.flagged) {
        return a.flagged ? -1 : 1;
      }

      const aRatio = Number.isFinite(a.threshold)
        ? a.score / a.threshold
        : a.score;
      const bRatio = Number.isFinite(b.threshold)
        ? b.score / b.threshold
        : b.score;

      return bRatio - aRatio;
    });

  return relevant[0] ?? null;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function detectLocalPolicy(
  textContent: string | null | undefined,
): LocalPolicySignal {
  const text = (textContent ?? "").trim();

  if (!text) {
    return {
      matched: false,
      policyCategory: "none",
      subcategory: "none",
      modelCategory: "none",
      severity: 0,
      confidence: 0,
      reasonCodes: [],
    };
  }

  const legitimateAccessRule = matchesAny(
    text,
    LEGITIMATE_ACCESS_RULES,
  );

  const protectedCharacteristic = matchesAny(
    text,
    PROTECTED_CHARACTERISTIC_TERMS,
  );

  const exclusion = matchesAny(text, EXCLUSION_TERMS);

  if (
    protectedCharacteristic &&
    exclusion &&
    !legitimateAccessRule
  ) {
    return {
      matched: true,
      policyCategory: "hate_and_discrimination",
      subcategory: "discriminatory_exclusion",
      modelCategory: "hate",
      severity: 4,
      confidence: 0.96,
      reasonCodes: [
        "PROTECTED_CHARACTERISTIC",
        "DENIAL_OF_ACCESS_OR_SERVICE",
        "DISCRIMINATORY_EXCLUSION",
      ],
    };
  }

  const ambiguousGroup =
    matchesAny(text, AMBIGUOUS_GROUP_EXCLUSION) &&
    exclusion;

  if (ambiguousGroup && !legitimateAccessRule) {
    return {
      matched: true,
      policyCategory: "harassment_and_bullying",
      subcategory: "ambiguous_group_exclusion",
      modelCategory: "harassment",
      severity: 3,
      confidence: 0.82,
      reasonCodes: [
        "AMBIGUOUS_GROUP_TARGET",
        "EXCLUSION_LANGUAGE",
        "HUMAN_CONTEXT_REQUIRED",
      ],
    };
  }

  return {
    matched: false,
    policyCategory: "none",
    subcategory: "none",
    modelCategory: "none",
    severity: 0,
    confidence: 0,
    reasonCodes: legitimateAccessRule
      ? ["LEGITIMATE_BUSINESS_ACCESS_RULE"]
      : [],
  };
}

export function orchestrate(input: {
  result: OpenAIModerationResult;
  policy: SafetyPolicy;
  contentType: string;
  textContent?: string | null;
}) {
  const status = input.policy.status ?? "shadow";

  const contentTypePolicy =
    input.policy.content_types?.[input.contentType] ?? {};

  const genericReviewThreshold =
    contentTypePolicy.review_threshold ?? 0.65;

  const temporaryHideThreshold =
    contentTypePolicy.temporary_hide_threshold ?? 0.95;

  const dominant = chooseDominant(input.result);
  const policyRelevant = choosePolicyRelevant(input.result);
  const local = detectLocalPolicy(input.textContent);

  const genericThresholdReached =
    dominant.score >= genericReviewThreshold;

  const requiresReview =
    input.result.flagged ||
    policyRelevant !== null ||
    genericThresholdReached ||
    local.matched;

  if (!requiresReview) {
    return {
      finalAction: "allow",
      recommendedAction: "allow",
      caseStatus: "decided",
      category: "none",
      policyCategory: "none",
      subcategory: "none",
      severity: 0,
      confidence: dominant.score,
      reasonCodes: [
        "NO_POLICY_VIOLATION",
        ...local.reasonCodes,
        status === "shadow"
          ? "SHADOW_MODE"
          : "ACTIVE_POLICY",
      ],
    };
  }

  const selectedCategory = local.matched
    ? local.modelCategory
    : policyRelevant?.category ?? dominant.category;

  const policyCategory = local.matched
    ? local.policyCategory
    : selectedCategory.startsWith("hate")
      ? "hate_and_discrimination"
      : selectedCategory.startsWith("harassment")
        ? "harassment_and_bullying"
        : selectedCategory.startsWith("violence")
          ? "violence_and_incitement"
          : selectedCategory.startsWith("sexual")
            ? "sexual_safety"
            : selectedCategory.startsWith("self_harm")
              ? "self_harm"
              : selectedCategory.startsWith("illicit")
                ? "regulated_and_dangerous_commerce"
                : "other";

  const selectedScore = local.matched
    ? Math.max(
        local.confidence,
        policyRelevant?.score ?? 0,
      )
    : policyRelevant?.score ?? dominant.score;

  const severity = local.matched
    ? local.severity
    : severityFor(selectedCategory);

  let recommendedAction = "allow_log";

  if (
    selectedScore >= temporaryHideThreshold &&
    severity >= 4
  ) {
    recommendedAction = "temporary_hide";
  }

  const finalAction =
    status === "shadow"
      ? "allow_log"
      : recommendedAction;

  const reasonCodes = [
    `PRIMARY_${selectedCategory.toUpperCase()}`,
    `POLICY_${policyCategory.toUpperCase()}`,
    ...(local.subcategory !== "none"
      ? [`SUBCATEGORY_${local.subcategory.toUpperCase()}`]
      : []),
    ...local.reasonCodes,
    input.result.flagged
      ? "MODEL_FLAGGED"
      : policyRelevant
        ? "CATEGORY_THRESHOLD_REACHED"
        : local.matched
          ? "LOCAL_POLICY_MATCH"
          : "GENERIC_REVIEW_THRESHOLD_REACHED",
    status === "shadow"
      ? "SHADOW_MODE"
      : "ACTIVE_POLICY",
  ];

  return {
    finalAction,
    recommendedAction,
    caseStatus: "needs_review",
    category: selectedCategory,
    policyCategory,
    subcategory: local.subcategory,
    severity,
    confidence: selectedScore,
    reasonCodes: [...new Set(reasonCodes)],
  };
}
