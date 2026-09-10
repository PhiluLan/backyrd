import { canonicalJson, contentHash } from "./canonical.js";
import { CONTRACT_VERSIONS } from "./contracts.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";

const count = schema.number({ min: 0, integer: true });
const withoutHash = (value: Readonly<Record<string, unknown>>, field: string) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
const uniqueSorted = (values: readonly string[]) => [...new Set(values)].sort();
const same = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);

export const CALIBRATION_EVENT_TYPES = [
  "SHOWN", "OPENED", "DISMISSED", "REJECTED", "REJECT_REASON", "ALTERNATIVE_REQUESTED",
  "SAVED", "SAVE_REMOVED", "NAVIGATION_STARTED", "RESERVATION_INTENT", "VISITED",
  "STANDARD_REVIEW", "SMART_REVIEW", "EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION",
  "REVIEW_MOODS", "MOMENT_CREATED", "SEARCH", "DWELL", "QUICK_SKIP", "REPEAT_VISIT", "CORRECTION",
] as const;
export type CalibrationEventType = typeof CALIBRATION_EVENT_TYPES[number];

export const CALIBRATION_MODEL_DIMENSIONS = [
  "LONG_TERM_CONCEPT_TASTE", "RECENT_PREFERENCE", "CONTEXTUAL_TASTE", "AVERSION",
  "PRACTICAL_PREFERENCE", "DIRECT_SPOT_AFFINITY", "EXPLORATION_FAMILIARITY",
] as const;
export type CalibrationModelDimension = typeof CALIBRATION_MODEL_DIMENSIONS[number];

export const CALIBRATION_CONCEPT_REGISTRY_VERSION = "backyrd.synthetic-user-concepts@phase3b.1";
export const CALIBRATION_CONCEPT_IDS = Object.freeze([
  "vibe.synthetic-cozy", "environment.synthetic-outdoor", "place.synthetic-cafe",
] as const);
export const CALIBRATION_CONCEPT_REGISTRY_HASH = contentHash({
  registryVersion: CALIBRATION_CONCEPT_REGISTRY_VERSION,
  conceptIds: [...CALIBRATION_CONCEPT_IDS].sort(),
});

const EVENT_AUTHORITIES = [
  "CLIENT_OBSERVATION", "AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE",
  "DATABASE_DERIVED_EVENT", "VERIFIED_OUTCOME", "SERVER_EVENT_LEDGER",
] as const;
const SEMANTIC_CLASSES = ["EXPOSURE", "INTERACTION", "SEARCH", "INTENT", "EXPERIENCE", "SATISFACTION", "STATE_CHANGE", "CORRECTION", "SOCIAL_OBSERVATION"] as const;
const STATUS = ["CONFIGURED", "NOT_CONFIGURED", "RESEARCH_ONLY"] as const;

const SignalSemanticsEntrySchema = schema.object({
  eventType: schema.enum(CALIBRATION_EVENT_TYPES),
  canonicalEventType: schema.nullable(identifier),
  status: schema.enum(STATUS),
  semanticClass: schema.enum(SEMANTIC_CLASSES),
  requiredAuthorities: schema.array(schema.enum(EVENT_AUTHORITIES), { min: 1, max: 6 }),
  experienceRelation: schema.enum(["NONE", "POSSIBLE_SAME_JOURNEY", "CONFIRMED_EXPERIENCE", "EXPLICIT_EXPERIENCE_OUTCOME", "CORRECTION_ONLY"] as const),
  journeyRule: schema.enum(["REQUIRED_SERVER_RESOLVED", "OPTIONAL", "TARGET_JOURNEY", "NOT_APPLICABLE"] as const),
  independenceRule: schema.enum(["NEVER", "ONE_UNIT_PER_SERVER_JOURNEY", "INDEPENDENT_VERIFIED_JOURNEY_ONLY", "TARGET_INHERITS"] as const),
  possibleDimensions: schema.array(schema.enum(CALIBRATION_MODEL_DIMENSIONS), { max: 7 }),
  allowedInterpretations: schema.array(schema.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"] as const), { min: 1, max: 3 }),
  prohibitedConclusions: schema.array(identifier, { min: 1, max: 16 }),
  requiredAdditionalEvidence: schema.array(identifier, { max: 12 }),
  repetitionRule: schema.enum(["DEDUPE_TECHNICAL_RETRIES", "ONE_PER_JOURNEY", "INDEPENDENT_JOURNEYS_ONLY", "APPEND_ONLY_TARGET"] as const),
  correctionBehavior: schema.enum(["SUPERSEDABLE", "APPEND_ONLY_CORRECTION"] as const),
  contextBinding: schema.enum(["NONE", "OPTIONAL_SEPARATE", "REQUIRED_FOR_CONTEXTUAL", "PRESERVE_TARGET"] as const),
  sufficiencyContribution: schema.enum(["NONE", "CONDITIONAL", "QUALIFYING_EXPLICIT_ONLY"] as const),
  decisionProjection: schema.enum(["NEVER", "CALIBRATION_ONLY", "ELIGIBLE_AFTER_PRODUCT_APPROVAL"] as const),
});

export const SignalSemanticsRegistrySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.signalSemanticsRegistry),
  registryId: identifier,
  registryVersion: identifier,
  authority: schema.literal("CALIBRATION_CONTRACT_RELEASE"),
  productionPolicyConfigured: schema.literal(false),
  entries: schema.array(SignalSemanticsEntrySchema, { min: CALIBRATION_EVENT_TYPES.length, max: CALIBRATION_EVENT_TYPES.length }),
  forbiddenInputFields: schema.array(schema.enum(["ownerTier", "payment", "subscription", "advertising", "sponsorship", "rankingInstruction", "eligibilityInstruction"] as const), { min: 7, max: 7 }),
  registryHash: sha256,
});
export type SignalSemanticsRegistry = Infer<typeof SignalSemanticsRegistrySchema>;
export type SignalSemanticsEntry = Infer<typeof SignalSemanticsEntrySchema>;

const CANONICAL_EVENT_MAPPING: Readonly<Record<CalibrationEventType, string | null>> = Object.freeze({
  SHOWN: "CANDIDATE_EXPOSED", OPENED: "SPOT_OPENED", DISMISSED: null, REJECTED: null, REJECT_REASON: null,
  ALTERNATIVE_REQUESTED: "ALTERNATIVE_REQUESTED", SAVED: "SAVED", SAVE_REMOVED: "SAVE_REMOVED", NAVIGATION_STARTED: "NAVIGATION_INTENT",
  RESERVATION_INTENT: "RESERVATION_INTENT", VISITED: "VERIFIED_VISIT", STANDARD_REVIEW: "REVIEW_RECORDED", SMART_REVIEW: "REVIEW_RECORDED",
  EXPLICIT_SATISFACTION: "SATISFACTION_RECORDED", EXPLICIT_DISSATISFACTION: "SATISFACTION_RECORDED", REVIEW_MOODS: null,
  MOMENT_CREATED: "MOMENT_RECORDED", SEARCH: "SEARCH_RECORDED", DWELL: "DWELL_OBSERVED", QUICK_SKIP: "QUICK_SKIP_OBSERVED",
  REPEAT_VISIT: "VERIFIED_VISIT", CORRECTION: "USER_CORRECTION",
});
type EntryInput = Omit<SignalSemanticsEntry, "eventType" | "canonicalEventType" | "correctionBehavior"> & { readonly correctionBehavior?: SignalSemanticsEntry["correctionBehavior"] };
const entry = (eventType: CalibrationEventType, input: EntryInput): SignalSemanticsEntry => ({ eventType, canonicalEventType: CANONICAL_EVENT_MAPPING[eventType], correctionBehavior: "SUPERSEDABLE", ...input });
const neutral = (eventType: CalibrationEventType, semanticClass: SignalSemanticsEntry["semanticClass"], authorities: SignalSemanticsEntry["requiredAuthorities"], prohibitedConclusions: readonly string[], overrides: Partial<EntryInput> = {}): SignalSemanticsEntry => entry(eventType, {
  status: "CONFIGURED", semanticClass, requiredAuthorities: authorities, experienceRelation: "POSSIBLE_SAME_JOURNEY",
  journeyRule: "REQUIRED_SERVER_RESOLVED", independenceRule: "NEVER", possibleDimensions: [], allowedInterpretations: ["NEUTRAL"],
  prohibitedConclusions, requiredAdditionalEvidence: [], repetitionRule: "ONE_PER_JOURNEY", contextBinding: "OPTIONAL_SEPARATE",
  sufficiencyContribution: "NONE", decisionProjection: "NEVER", ...overrides,
});
const unknown = (eventType: CalibrationEventType, semanticClass: SignalSemanticsEntry["semanticClass"], prohibitedConclusions: readonly string[], status: "NOT_CONFIGURED" | "RESEARCH_ONLY" = "NOT_CONFIGURED"): SignalSemanticsEntry => entry(eventType, {
  status, semanticClass, requiredAuthorities: ["SERVER_VERIFIED_PRODUCT_STATE"], experienceRelation: "POSSIBLE_SAME_JOURNEY",
  journeyRule: "REQUIRED_SERVER_RESOLVED", independenceRule: "NEVER", possibleDimensions: status === "RESEARCH_ONLY" ? ["EXPLORATION_FAMILIARITY"] : [],
  allowedInterpretations: ["NEUTRAL"], prohibitedConclusions, requiredAdditionalEvidence: ["PRODUCT_SEMANTICS_DECISION"],
  repetitionRule: "DEDUPE_TECHNICAL_RETRIES", contextBinding: "OPTIONAL_SEPARATE", sufficiencyContribution: "NONE", decisionProjection: "NEVER",
});

const SEMANTICS_ENTRIES: readonly SignalSemanticsEntry[] = [
  neutral("SHOWN", "EXPOSURE", ["CLIENT_OBSERVATION"], ["SHOWN_IS_INTEREST", "MISSING_ACTION_IS_AVERSION"]),
  neutral("OPENED", "INTERACTION", ["CLIENT_OBSERVATION", "AUTHENTICATED_USER_ACTION"], ["OPEN_IS_LIKE", "OPEN_IS_EXPERIENCE", "OPEN_IS_SATISFACTION"]),
  unknown("DISMISSED", "INTERACTION", ["DISMISS_IS_DISLIKE", "DISMISS_IS_AVERSION"]),
  unknown("REJECTED", "INTERACTION", ["REJECT_IS_GENERAL_AVERSION", "REJECT_IS_DISSATISFACTION"]),
  unknown("REJECT_REASON", "INTERACTION", ["REASON_IS_LONG_TERM_TASTE", "REASON_IS_WORLD_FACT"]),
  unknown("ALTERNATIVE_REQUESTED", "INTENT", ["ALTERNATIVE_IS_REJECTION", "ALTERNATIVE_IS_DISLIKE"], "RESEARCH_ONLY"),
  neutral("SAVED", "STATE_CHANGE", ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], ["SAVE_IS_SATISFACTION", "SAVE_IS_VISIT", "SAVE_IS_CONCEPT_TASTE"], { possibleDimensions: ["RECENT_PREFERENCE", "DIRECT_SPOT_AFFINITY"], decisionProjection: "CALIBRATION_ONLY" }),
  neutral("SAVE_REMOVED", "STATE_CHANGE", ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], ["SAVE_REMOVAL_IS_DISLIKE", "SAVE_REMOVAL_IS_NEGATIVE_TASTE", "SAVE_REMOVAL_IS_DISSATISFACTION"]),
  neutral("NAVIGATION_STARTED", "INTENT", ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"], ["NAVIGATION_IS_VISIT", "NAVIGATION_IS_SATISFACTION", "NAVIGATION_IS_LIKE"], { possibleDimensions: ["PRACTICAL_PREFERENCE"] }),
  neutral("RESERVATION_INTENT", "INTENT", ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], ["RESERVATION_IS_VISIT", "RESERVATION_IS_SATISFACTION"], { possibleDimensions: ["PRACTICAL_PREFERENCE"] }),
  neutral("VISITED", "EXPERIENCE", ["VERIFIED_OUTCOME"], ["VISIT_IS_LIKE", "VISIT_IS_POSITIVE_SATISFACTION", "MULTIPLE_CONCEPTS_ARE_MULTIPLE_EXPERIENCES"], { experienceRelation: "CONFIRMED_EXPERIENCE", independenceRule: "INDEPENDENT_VERIFIED_JOURNEY_ONLY", possibleDimensions: ["DIRECT_SPOT_AFFINITY", "EXPLORATION_FAMILIARITY"], repetitionRule: "INDEPENDENT_JOURNEYS_ONLY", sufficiencyContribution: "CONDITIONAL", decisionProjection: "CALIBRATION_ONLY" }),
  neutral("STANDARD_REVIEW", "EXPERIENCE", ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], ["REVIEW_IS_SATISFACTION", "REVIEW_MOOD_IS_QUALITY", "REVIEW_TEXT_IS_AUTOMATIC_TASTE", "REVIEW_ENTRY_PATH_CHANGES_STRENGTH"], { experienceRelation: "CONFIRMED_EXPERIENCE", independenceRule: "ONE_UNIT_PER_SERVER_JOURNEY", possibleDimensions: ["DIRECT_SPOT_AFFINITY"], sufficiencyContribution: "CONDITIONAL" }),
  neutral("SMART_REVIEW", "EXPERIENCE", ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], ["REVIEW_IS_SATISFACTION", "REVIEW_MOOD_IS_QUALITY", "REVIEW_TEXT_IS_AUTOMATIC_TASTE", "REVIEW_ENTRY_PATH_CHANGES_STRENGTH"], { experienceRelation: "CONFIRMED_EXPERIENCE", independenceRule: "ONE_UNIT_PER_SERVER_JOURNEY", possibleDimensions: ["DIRECT_SPOT_AFFINITY"], sufficiencyContribution: "CONDITIONAL" }),
  entry("EXPLICIT_SATISFACTION", { status: "CONFIGURED", semanticClass: "SATISFACTION", requiredAuthorities: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"], experienceRelation: "EXPLICIT_EXPERIENCE_OUTCOME", journeyRule: "REQUIRED_SERVER_RESOLVED", independenceRule: "ONE_UNIT_PER_SERVER_JOURNEY", possibleDimensions: ["LONG_TERM_CONCEPT_TASTE", "RECENT_PREFERENCE", "CONTEXTUAL_TASTE", "DIRECT_SPOT_AFFINITY"], allowedInterpretations: ["POSITIVE"], prohibitedConclusions: ["SATISFACTION_ATTRIBUTES_ALL_CONCEPTS", "SATISFACTION_IS_RANKING_AUTHORITY"], requiredAdditionalEvidence: ["QUALIFIED_EXPERIENCE", "EVENT_TIME_WORLD_FOR_CONCEPT_ATTRIBUTION"], repetitionRule: "ONE_PER_JOURNEY", contextBinding: "OPTIONAL_SEPARATE", sufficiencyContribution: "QUALIFYING_EXPLICIT_ONLY", decisionProjection: "ELIGIBLE_AFTER_PRODUCT_APPROVAL" }),
  entry("EXPLICIT_DISSATISFACTION", { status: "CONFIGURED", semanticClass: "SATISFACTION", requiredAuthorities: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"], experienceRelation: "EXPLICIT_EXPERIENCE_OUTCOME", journeyRule: "REQUIRED_SERVER_RESOLVED", independenceRule: "ONE_UNIT_PER_SERVER_JOURNEY", possibleDimensions: ["AVERSION", "CONTEXTUAL_TASTE", "DIRECT_SPOT_AFFINITY"], allowedInterpretations: ["NEGATIVE"], prohibitedConclusions: ["DISSATISFACTION_IS_GLOBAL_SPOT_BAN", "DISSATISFACTION_IS_ELIGIBILITY_AUTHORITY"], requiredAdditionalEvidence: ["QUALIFIED_EXPERIENCE", "EVENT_TIME_WORLD_FOR_CONCEPT_ATTRIBUTION"], repetitionRule: "ONE_PER_JOURNEY", contextBinding: "OPTIONAL_SEPARATE", sufficiencyContribution: "QUALIFYING_EXPLICIT_ONLY", decisionProjection: "ELIGIBLE_AFTER_PRODUCT_APPROVAL" }),
  unknown("REVIEW_MOODS", "SATISFACTION", ["MOOD_IS_QUALITY", "MOOD_IS_GENERAL_SATISFACTION"], "RESEARCH_ONLY"),
  unknown("MOMENT_CREATED", "SOCIAL_OBSERVATION", ["MOMENT_IS_REVIEW", "MOMENT_IS_SATISFACTION", "MOMENT_PROPAGATES_SOCIAL_TASTE"], "RESEARCH_ONLY"),
  unknown("SEARCH", "SEARCH", ["RAW_SEARCH_TEXT_IS_DURABLE_PROFILE", "SEARCH_IS_SATISFACTION"], "RESEARCH_ONLY"),
  unknown("DWELL", "INTERACTION", ["DWELL_IS_ATTENTION", "DWELL_IS_INTEREST", "DWELL_IS_POSITIVE_TASTE"]),
  unknown("QUICK_SKIP", "INTERACTION", ["QUICK_SKIP_IS_DISLIKE", "QUICK_SKIP_IS_AVERSION"]),
  neutral("REPEAT_VISIT", "EXPERIENCE", ["VERIFIED_OUTCOME"], ["SAME_JOURNEY_REPETITION_IS_INDEPENDENT", "REPEAT_VISIT_IS_SATISFACTION"], { experienceRelation: "CONFIRMED_EXPERIENCE", independenceRule: "INDEPENDENT_VERIFIED_JOURNEY_ONLY", possibleDimensions: ["DIRECT_SPOT_AFFINITY", "EXPLORATION_FAMILIARITY"], repetitionRule: "INDEPENDENT_JOURNEYS_ONLY", sufficiencyContribution: "CONDITIONAL", decisionProjection: "CALIBRATION_ONLY" }),
  entry("CORRECTION", { status: "CONFIGURED", semanticClass: "CORRECTION", requiredAuthorities: ["SERVER_EVENT_LEDGER"], experienceRelation: "CORRECTION_ONLY", journeyRule: "TARGET_JOURNEY", independenceRule: "TARGET_INHERITS", possibleDimensions: [], allowedInterpretations: ["NEUTRAL"], prohibitedConclusions: ["CORRECTION_IS_NEGATIVE_TASTE", "CORRECTION_REWRITES_HISTORY"], requiredAdditionalEvidence: ["AUTHORITATIVE_TARGET_RECORD"], repetitionRule: "APPEND_ONLY_TARGET", correctionBehavior: "APPEND_ONLY_CORRECTION", contextBinding: "PRESERVE_TARGET", sufficiencyContribution: "NONE", decisionProjection: "NEVER" }),
];

const registryBody = {
  contractVersion: CONTRACT_VERSIONS.signalSemanticsRegistry,
  registryId: "backyrd-user-signal-semantics-calibration",
  registryVersion: "backyrd.user-intelligence.signal-semantics@3b-candidate-1",
  authority: "CALIBRATION_CONTRACT_RELEASE" as const,
  productionPolicyConfigured: false as const,
  entries: SEMANTICS_ENTRIES,
  forbiddenInputFields: ["ownerTier", "payment", "subscription", "advertising", "sponsorship", "rankingInstruction", "eligibilityInstruction"] as const,
};
export const CANONICAL_SIGNAL_SEMANTICS_REGISTRY: SignalSemanticsRegistry = SignalSemanticsRegistrySchema.parse({ ...registryBody, registryHash: contentHash(registryBody) });

export function parseSignalSemanticsRegistry(value: unknown): SignalSemanticsRegistry {
  const parsed = SignalSemanticsRegistrySchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "registryHash")) !== parsed.registryHash) throw new ContractValidationError("$.registryHash", "signal semantics registry hash mismatch");
  if (!same(parsed, CANONICAL_SIGNAL_SEMANTICS_REGISTRY)) throw new ContractValidationError("$", "unknown signal semantics registry");
  const eventTypes = parsed.entries.map(({ eventType }) => eventType);
  if (new Set(eventTypes).size !== CALIBRATION_EVENT_TYPES.length || CALIBRATION_EVENT_TYPES.some((eventType) => !eventTypes.includes(eventType))) throw new ContractValidationError("$.entries", "registry must cover every calibration event exactly once");
  const standard = parsed.entries.find(({ eventType }) => eventType === "STANDARD_REVIEW")!;
  const smart = parsed.entries.find(({ eventType }) => eventType === "SMART_REVIEW")!;
  const normalizeReview = (review: SignalSemanticsEntry) => ({ ...review, eventType: "REVIEW" });
  if (!same(normalizeReview(standard), normalizeReview(smart))) throw new ContractValidationError("$.entries", "standard and smart review learning semantics differ");
  return parsed;
}

export function signalSemantics(eventType: CalibrationEventType): SignalSemanticsEntry {
  return parseSignalSemanticsRegistry(CANONICAL_SIGNAL_SEMANTICS_REGISTRY).entries.find((entry) => entry.eventType === eventType)!;
}

const POLICY_ACTIONS = ["IGNORE", "OBSERVE_ONLY", "DIRECT_SPOT_HYPOTHESIS", "CONCEPT_HYPOTHESIS", "CONTEXTUAL_CONCEPT_HYPOTHESIS", "PRACTICAL_HYPOTHESIS", "FAMILIARITY_HYPOTHESIS", "EXPLORATION_RESEARCH_HYPOTHESIS"] as const;
const PolicyRuleSchema = schema.object({
  eventType: schema.enum(CALIBRATION_EVENT_TYPES), action: schema.enum(POLICY_ACTIONS),
  dimension: schema.nullable(schema.enum(CALIBRATION_MODEL_DIMENSIONS)),
  direction: schema.enum(["FROM_EXPLICIT_OUTCOME", "NEUTRAL_ONLY", "UNKNOWN"] as const),
  evidenceBand: schema.enum(["NONE", "OBSERVATIONAL", "CONDITIONAL", "EXPLICIT"] as const),
  requiresIndependentJourney: schema.boolean(), requiresConfirmedExperience: schema.boolean(), requiresContext: schema.boolean(), requiresCertainWorldAttribution: schema.boolean(),
  projectionEligible: schema.literal(false), limitations: schema.array(identifier, { min: 1, max: 16 }),
});
const SyntheticThresholdSchema = schema.object({
  authority: schema.literal("CALIBRATION_FIXTURE_ONLY"), productCalibrated: schema.literal(false), productionAuthorized: schema.literal(false),
  firstHintsIndependentUnits: count, limitedProjectionIndependentUnits: count, minimumEvidenceDiversity: count,
});
export const CalibrationPolicySchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.calibrationPolicy), policyId: identifier, policyVersion: identifier,
  name: schema.enum(["CONSERVATIVE_EXPLICIT_EVIDENCE", "BALANCED_BEHAVIORAL_EVIDENCE", "CONTEXT_SENSITIVE_ADAPTIVE"] as const),
  authority: schema.literal("CALIBRATION_ONLY"), productionAuthorized: schema.literal(false), productCalibrationStatus: schema.literal("CANDIDATE_NOT_APPROVED"),
  signalRegistry: schema.object({ registryVersion: schema.literal(CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryVersion), registryHash: schema.literal(CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryHash) }),
  conceptRegistry: schema.object({ registryVersion: schema.literal(CALIBRATION_CONCEPT_REGISTRY_VERSION), registryHash: schema.literal(CALIBRATION_CONCEPT_REGISTRY_HASH), authority: schema.literal("SYNTHETIC_REGISTRY_FIXTURE"), productionAuthorized: schema.literal(false) }),
  reducer: schema.object({ reducerVersion: schema.literal("backyrd.user-intelligence.calibration-reducer@3b.0"), releaseHash: sha256, productionRelease: schema.literal(false) }),
  rules: schema.array(PolicyRuleSchema, { min: CALIBRATION_EVENT_TYPES.length, max: CALIBRATION_EVENT_TYPES.length }),
  attributionStrategy: schema.enum(["EXPLICIT_OUTCOME_COMPETING_CONCEPTS", "OUTCOME_AND_SPOT_SEPARATE", "CONTEXT_FIRST_COMPETING_CONCEPTS"] as const),
  independenceStrategy: schema.literal("ONE_UNIT_PER_SERVER_RESOLVED_JOURNEY"),
  conflictStrategy: schema.literal("PRESERVE_POSITIVE_AND_NEGATIVE"),
  sufficiencyStrategy: SyntheticThresholdSchema,
  temporalStrategy: schema.object({ strategy: schema.enum(["NO_TEMPORAL_INFERENCE", "FIXTURE_RECENCY_SEPARATION", "FIXTURE_CONTEXT_RECENCY_SEPARATION"] as const), fixtureCutoff: schema.nullable(timestamp), decay: schema.literal("NOT_CONFIGURED") }),
  explorationStrategy: schema.enum(["NOT_CONFIGURED", "VERIFIED_REPEAT_FAMILIARITY_ONLY", "RESEARCH_CONTEXT_FLIP_AND_ALTERNATIVE"] as const),
  projectionStrategy: schema.literal("CALIBRATION_PROJECTION_ONLY_PRODUCTION_NEUTRAL"),
  limitations: schema.array(identifier, { min: 1, max: 32 }), policyHash: sha256,
});
export type CalibrationPolicy = Infer<typeof CalibrationPolicySchema>;

const allRules = (overrides: Readonly<Partial<Record<CalibrationEventType, Omit<Infer<typeof PolicyRuleSchema>, "eventType">>>>): Infer<typeof PolicyRuleSchema>[] => CALIBRATION_EVENT_TYPES.map((eventType) => ({
  eventType, action: "IGNORE", dimension: null, direction: "UNKNOWN", evidenceBand: "NONE", requiresIndependentJourney: false,
  requiresConfirmedExperience: false, requiresContext: false, requiresCertainWorldAttribution: false, projectionEligible: false,
  limitations: ["NO_CALIBRATED_PRODUCT_SEMANTICS"], ...overrides[eventType],
}));
const reducerReleaseHash = contentHash("backyrd.user-intelligence.calibration-reducer@3b.0:fixture-only");
const policy = (body: Omit<CalibrationPolicy, "contractVersion" | "authority" | "productionAuthorized" | "productCalibrationStatus" | "signalRegistry" | "conceptRegistry" | "reducer" | "independenceStrategy" | "conflictStrategy" | "projectionStrategy" | "policyHash">): CalibrationPolicy => {
  const full = { contractVersion: CONTRACT_VERSIONS.calibrationPolicy, authority: "CALIBRATION_ONLY" as const, productionAuthorized: false as const, productCalibrationStatus: "CANDIDATE_NOT_APPROVED" as const, signalRegistry: { registryVersion: CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryVersion, registryHash: CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryHash }, conceptRegistry: { registryVersion: CALIBRATION_CONCEPT_REGISTRY_VERSION, registryHash: CALIBRATION_CONCEPT_REGISTRY_HASH, authority: "SYNTHETIC_REGISTRY_FIXTURE" as const, productionAuthorized: false as const }, reducer: { reducerVersion: "backyrd.user-intelligence.calibration-reducer@3b.0" as const, releaseHash: reducerReleaseHash, productionRelease: false as const }, independenceStrategy: "ONE_UNIT_PER_SERVER_RESOLVED_JOURNEY" as const, conflictStrategy: "PRESERVE_POSITIVE_AND_NEGATIVE" as const, projectionStrategy: "CALIBRATION_PROJECTION_ONLY_PRODUCTION_NEUTRAL" as const, ...body };
  return CalibrationPolicySchema.parse({ ...full, policyHash: contentHash(full) });
};

const explicitPositive = { action: "CONCEPT_HYPOTHESIS", dimension: "LONG_TERM_CONCEPT_TASTE", direction: "FROM_EXPLICIT_OUTCOME", evidenceBand: "EXPLICIT", requiresIndependentJourney: true, requiresConfirmedExperience: true, requiresContext: false, requiresCertainWorldAttribution: false, projectionEligible: false, limitations: ["CALIBRATION_ONLY", "COMPETING_CONCEPT_ATTRIBUTION"] } as const;
const explicitNegative = { ...explicitPositive, dimension: "AVERSION" as const };
const sharedLimitations = ["NO_PRODUCTION_AUTHORITY", "NO_FINAL_SIGNAL_WEIGHTS", "NO_PRODUCT_DECAY", "NO_RANKING_OR_ELIGIBILITY_AUTHORITY", "RETENTION_NOT_CONFIGURED"] as const;

export const CALIBRATION_POLICY_CANDIDATES: readonly CalibrationPolicy[] = Object.freeze([
  policy({ policyId: "candidate-a-conservative", policyVersion: "backyrd.user-intelligence.policy-candidate-a@3b.0", name: "CONSERVATIVE_EXPLICIT_EVIDENCE", rules: allRules({ EXPLICIT_SATISFACTION: explicitPositive, EXPLICIT_DISSATISFACTION: explicitNegative, CORRECTION: { action: "OBSERVE_ONLY", dimension: null, direction: "NEUTRAL_ONLY", evidenceBand: "OBSERVATIONAL", requiresIndependentJourney: false, requiresConfirmedExperience: false, requiresContext: false, requiresCertainWorldAttribution: false, projectionEligible: false, limitations: ["APPEND_ONLY_CORRECTION"] } }), attributionStrategy: "EXPLICIT_OUTCOME_COMPETING_CONCEPTS", sufficiencyStrategy: { authority: "CALIBRATION_FIXTURE_ONLY", productCalibrated: false, productionAuthorized: false, firstHintsIndependentUnits: 1, limitedProjectionIndependentUnits: 3, minimumEvidenceDiversity: 1 }, temporalStrategy: { strategy: "NO_TEMPORAL_INFERENCE", fixtureCutoff: null, decay: "NOT_CONFIGURED" }, explorationStrategy: "NOT_CONFIGURED", limitations: [...sharedLimitations, "BEHAVIORAL_SIGNALS_IGNORED"] }),
  policy({ policyId: "candidate-b-balanced", policyVersion: "backyrd.user-intelligence.policy-candidate-b@3b.0", name: "BALANCED_BEHAVIORAL_EVIDENCE", rules: allRules({ EXPLICIT_SATISFACTION: explicitPositive, EXPLICIT_DISSATISFACTION: explicitNegative, SAVED: { action: "DIRECT_SPOT_HYPOTHESIS", dimension: "DIRECT_SPOT_AFFINITY", direction: "UNKNOWN", evidenceBand: "CONDITIONAL", requiresIndependentJourney: false, requiresConfirmedExperience: false, requiresContext: false, requiresCertainWorldAttribution: false, projectionEligible: false, limitations: ["SAVE_IS_NOT_SATISFACTION", "SPOT_ONLY_NO_CONCEPT_PROPAGATION"] }, VISITED: { action: "DIRECT_SPOT_HYPOTHESIS", dimension: "DIRECT_SPOT_AFFINITY", direction: "UNKNOWN", evidenceBand: "CONDITIONAL", requiresIndependentJourney: true, requiresConfirmedExperience: true, requiresContext: false, requiresCertainWorldAttribution: false, projectionEligible: false, limitations: ["VISIT_IS_NOT_SATISFACTION", "SPOT_ONLY_NO_CONCEPT_PROPAGATION"] }, REPEAT_VISIT: { action: "FAMILIARITY_HYPOTHESIS", dimension: "EXPLORATION_FAMILIARITY", direction: "UNKNOWN", evidenceBand: "CONDITIONAL", requiresIndependentJourney: true, requiresConfirmedExperience: true, requiresContext: false, requiresCertainWorldAttribution: false, projectionEligible: false, limitations: ["FAMILIARITY_IS_NOT_POSITIVE_TASTE"] }, NAVIGATION_STARTED: { action: "PRACTICAL_HYPOTHESIS", dimension: "PRACTICAL_PREFERENCE", direction: "UNKNOWN", evidenceBand: "OBSERVATIONAL", requiresIndependentJourney: false, requiresConfirmedExperience: false, requiresContext: false, requiresCertainWorldAttribution: false, projectionEligible: false, limitations: ["NAVIGATION_IS_NOT_VISIT_OR_SATISFACTION"] } }), attributionStrategy: "OUTCOME_AND_SPOT_SEPARATE", sufficiencyStrategy: { authority: "CALIBRATION_FIXTURE_ONLY", productCalibrated: false, productionAuthorized: false, firstHintsIndependentUnits: 1, limitedProjectionIndependentUnits: 3, minimumEvidenceDiversity: 2 }, temporalStrategy: { strategy: "FIXTURE_RECENCY_SEPARATION", fixtureCutoff: "2026-01-01T00:00:00.000Z", decay: "NOT_CONFIGURED" }, explorationStrategy: "VERIFIED_REPEAT_FAMILIARITY_ONLY", limitations: [...sharedLimitations, "BEHAVIORAL_MEANING_IS_CANDIDATE_ONLY"] }),
  policy({ policyId: "candidate-c-context", policyVersion: "backyrd.user-intelligence.policy-candidate-c@3b.0", name: "CONTEXT_SENSITIVE_ADAPTIVE", rules: allRules({ EXPLICIT_SATISFACTION: { ...explicitPositive, action: "CONTEXTUAL_CONCEPT_HYPOTHESIS", dimension: "CONTEXTUAL_TASTE", requiresContext: true }, EXPLICIT_DISSATISFACTION: { ...explicitNegative, action: "CONTEXTUAL_CONCEPT_HYPOTHESIS", dimension: "CONTEXTUAL_TASTE", requiresContext: true }, SAVED: { action: "DIRECT_SPOT_HYPOTHESIS", dimension: "RECENT_PREFERENCE", direction: "UNKNOWN", evidenceBand: "CONDITIONAL", requiresIndependentJourney: false, requiresConfirmedExperience: false, requiresContext: false, requiresCertainWorldAttribution: false, projectionEligible: false, limitations: ["RECENT_FIXTURE_ONLY", "SAVE_IS_NOT_SATISFACTION"] }, REPEAT_VISIT: { action: "FAMILIARITY_HYPOTHESIS", dimension: "EXPLORATION_FAMILIARITY", direction: "UNKNOWN", evidenceBand: "CONDITIONAL", requiresIndependentJourney: true, requiresConfirmedExperience: true, requiresContext: true, requiresCertainWorldAttribution: false, projectionEligible: false, limitations: ["CONTEXT_BOUND_FAMILIARITY_ONLY"] }, ALTERNATIVE_REQUESTED: { action: "EXPLORATION_RESEARCH_HYPOTHESIS", dimension: "EXPLORATION_FAMILIARITY", direction: "UNKNOWN", evidenceBand: "OBSERVATIONAL", requiresIndependentJourney: false, requiresConfirmedExperience: false, requiresContext: true, requiresCertainWorldAttribution: false, projectionEligible: false, limitations: ["RESEARCH_ONLY", "ALTERNATIVE_IS_NOT_REJECTION"] } }), attributionStrategy: "CONTEXT_FIRST_COMPETING_CONCEPTS", sufficiencyStrategy: { authority: "CALIBRATION_FIXTURE_ONLY", productCalibrated: false, productionAuthorized: false, firstHintsIndependentUnits: 1, limitedProjectionIndependentUnits: 2, minimumEvidenceDiversity: 2 }, temporalStrategy: { strategy: "FIXTURE_CONTEXT_RECENCY_SEPARATION", fixtureCutoff: "2026-01-01T00:00:00.000Z", decay: "NOT_CONFIGURED" }, explorationStrategy: "RESEARCH_CONTEXT_FLIP_AND_ALTERNATIVE", limitations: [...sharedLimitations, "CONTEXT_ALLOWLIST_NOT_PRODUCT_APPROVED", "RESEARCH_SIGNALS_NEVER_PROJECTED"] }),
]);

export const CalibrationPolicyTrustAnchorSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.calibrationPolicyTrustAnchor), anchorId: identifier, acceptedPolicyId: identifier, acceptedPolicyVersion: identifier, acceptedPolicyHash: sha256, acceptedRegistryHash: schema.literal(CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryHash), acceptedConceptRegistryHash: schema.literal(CALIBRATION_CONCEPT_REGISTRY_HASH), issuer: schema.literal("SYNTHETIC_CALIBRATION_RELEASE_AUTHORITY"), environment: schema.literal("SYNTHETIC_FIXTURE_ONLY"), productionAuthorized: schema.literal(false), anchorHash: sha256 });
export type CalibrationPolicyTrustAnchor = Infer<typeof CalibrationPolicyTrustAnchorSchema>;
export interface CalibrationPolicyTrustContext { getAcceptedPolicyAnchor(policyId: string): unknown; }
export const withCalibrationPolicyTrustAnchorHash = (value: Omit<CalibrationPolicyTrustAnchor, "anchorHash">): CalibrationPolicyTrustAnchor => CalibrationPolicyTrustAnchorSchema.parse({ ...value, anchorHash: contentHash(value) });

export function verifyCalibrationPolicy(value: unknown, trust: CalibrationPolicyTrustContext): CalibrationPolicy {
  const parsed = CalibrationPolicySchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "policyHash")) !== parsed.policyHash) throw new ContractValidationError("$.policyHash", "calibration policy hash mismatch");
  const canonical = CALIBRATION_POLICY_CANDIDATES.find(({ policyId }) => policyId === parsed.policyId);
  if (!canonical || !same(canonical, parsed)) throw new ContractValidationError("$", "unknown or altered calibration policy");
  const anchor = CalibrationPolicyTrustAnchorSchema.parse(trust.getAcceptedPolicyAnchor(parsed.policyId));
  if (contentHash(withoutHash(anchor as unknown as Record<string, unknown>, "anchorHash")) !== anchor.anchorHash || anchor.acceptedPolicyId !== parsed.policyId || anchor.acceptedPolicyVersion !== parsed.policyVersion || anchor.acceptedPolicyHash !== parsed.policyHash || anchor.acceptedRegistryHash !== parsed.signalRegistry.registryHash || anchor.acceptedConceptRegistryHash !== parsed.conceptRegistry.registryHash) throw new ContractValidationError("$.policyTrustAnchor", "policy is not independently accepted");
  return parsed;
}

const WorldConceptSchema = schema.object({ registryVersion: identifier, registryHash: schema.literal(CALIBRATION_CONCEPT_REGISTRY_HASH), conceptId: identifier, certainty: schema.enum(["VERIFIED", "SUPPORTED", "CONFLICTING", "UNKNOWN"] as const) });
export const CalibrationEvidenceSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.calibrationEvidence), recordId: identifier, subjectBindingHash: sha256,
  eventType: schema.enum(CALIBRATION_EVENT_TYPES), eventHash: sha256, chainId: identifier, chainHash: sha256,
  journeyId: schema.nullable(identifier), independenceEligible: schema.boolean(), spotId: schema.nullable(identifier),
  authority: schema.enum(EVENT_AUTHORITIES), direction: schema.enum(["POSITIVE", "NEGATIVE", "UNKNOWN", "NOT_APPLICABLE"] as const),
  experienceConfirmed: schema.boolean(), explicitOutcome: schema.enum(["POSITIVE", "NEGATIVE", "NONE"] as const),
  worldConcepts: schema.array(WorldConceptSchema, { max: 32 }),
  context: schema.nullable(schema.object({ contextHash: sha256, dimensions: schema.array(identifier, { min: 1, max: 16 }), authority: schema.enum(["EXPLICIT_USER", "SERVER_AUTHORIZED", "CAUTIOUSLY_DERIVED"] as const) })),
  occurredAt: timestamp, retryOfRecordId: schema.nullable(identifier), supersedesRecordId: schema.nullable(identifier), active: schema.boolean(), recordHash: sha256,
});
export type CalibrationEvidence = Infer<typeof CalibrationEvidenceSchema>;
export const withCalibrationEvidenceHash = (value: Omit<CalibrationEvidence, "recordHash">): CalibrationEvidence => CalibrationEvidenceSchema.parse({ ...value, recordHash: contentHash(value) });

export const CalibrationEvidenceTrustAnchorSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.calibrationEvidenceTrustAnchor), anchorId: identifier, acceptedRecordId: identifier, acceptedRecordHash: sha256, subjectBindingHash: sha256, issuer: schema.literal("SYNTHETIC_PHASE2_EVIDENCE_AUTHORITY"), environment: schema.literal("SYNTHETIC_FIXTURE_ONLY"), productionAuthorized: schema.literal(false), anchorHash: sha256 });
export type CalibrationEvidenceTrustAnchor = Infer<typeof CalibrationEvidenceTrustAnchorSchema>;
export const withCalibrationEvidenceTrustAnchorHash = (value: Omit<CalibrationEvidenceTrustAnchor, "anchorHash">): CalibrationEvidenceTrustAnchor => CalibrationEvidenceTrustAnchorSchema.parse({ ...value, anchorHash: contentHash(value) });
export interface CalibrationEvidenceTrustContext { getAcceptedEvidenceAnchor(recordId: string): unknown; }

export function verifyCalibrationEvidence(value: unknown, expectedSubject: string, trust: CalibrationEvidenceTrustContext): CalibrationEvidence {
  const parsed = CalibrationEvidenceSchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "recordHash")) !== parsed.recordHash) throw new ContractValidationError("$.recordHash", "calibration evidence hash mismatch");
  if (parsed.subjectBindingHash !== expectedSubject) throw new ContractValidationError("$.subjectBindingHash", "foreign subject evidence");
  const semantics = signalSemantics(parsed.eventType);
  if (!semantics.requiredAuthorities.includes(parsed.authority)) throw new ContractValidationError("$.authority", "evidence authority is not permitted by signal semantics");
  if (parsed.independenceEligible && parsed.journeyId === null) throw new ContractValidationError("$.independenceEligible", "unresolved journey cannot create independence");
  if (parsed.eventType === "EXPLICIT_SATISFACTION" && (parsed.explicitOutcome !== "POSITIVE" || parsed.direction !== "POSITIVE" || !parsed.experienceConfirmed)) throw new ContractValidationError("$.explicitOutcome", "positive satisfaction requires a qualified explicit outcome");
  if (parsed.eventType === "EXPLICIT_DISSATISFACTION" && (parsed.explicitOutcome !== "NEGATIVE" || parsed.direction !== "NEGATIVE" || !parsed.experienceConfirmed)) throw new ContractValidationError("$.explicitOutcome", "negative satisfaction requires a qualified explicit outcome");
  if (!["EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION"].includes(parsed.eventType) && parsed.explicitOutcome !== "NONE") throw new ContractValidationError("$.explicitOutcome", "event cannot self-declare satisfaction");
  for (const concept of parsed.worldConcepts) {
    if (concept.registryVersion !== CALIBRATION_CONCEPT_REGISTRY_VERSION || !(CALIBRATION_CONCEPT_IDS as readonly string[]).includes(concept.conceptId)) throw new ContractValidationError("$.worldConcepts", "concept is not bound to the accepted synthetic registry");
  }
  if (parsed.eventType === "CORRECTION" && parsed.supersedesRecordId === null) throw new ContractValidationError("$.supersedesRecordId", "correction requires authoritative target");
  const anchor = CalibrationEvidenceTrustAnchorSchema.parse(trust.getAcceptedEvidenceAnchor(parsed.recordId));
  if (contentHash(withoutHash(anchor as unknown as Record<string, unknown>, "anchorHash")) !== anchor.anchorHash || anchor.acceptedRecordId !== parsed.recordId || anchor.acceptedRecordHash !== parsed.recordHash || anchor.subjectBindingHash !== parsed.subjectBindingHash) throw new ContractValidationError("$.evidenceTrustAnchor", "evidence is not independently accepted");
  return parsed;
}

export const CalibrationScenarioSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.calibrationScenario), scenarioId: identifier, title: identifier, subjectBindingHash: schema.nullable(sha256), lifecycle: schema.enum(["ACTIVE", "NO_CONSENT", "WITHDRAWN", "RESET", "ERASED"] as const), killSwitch: schema.boolean(), interpretedAt: timestamp, evidence: schema.array(CalibrationEvidenceSchema, { max: 4096 }), scenarioHash: sha256 });
export type CalibrationScenario = Infer<typeof CalibrationScenarioSchema>;
export const withCalibrationScenarioHash = (value: Omit<CalibrationScenario, "scenarioHash">): CalibrationScenario => CalibrationScenarioSchema.parse({ ...value, scenarioHash: contentHash(value) });

const SufficiencyMetricsSchema = schema.object({ evidenceQuantity: count, evidenceDiversity: count, independentExperienceCount: count, conceptCoverage: count, contextCoverage: count, positiveCount: count, negativeCount: count, conflictLevel: schema.enum(["NONE", "MIXED", "CONFLICTING"] as const), attributionCertainty: schema.enum(["UNKNOWN", "LOW", "MIXED", "HIGH"] as const), worldKnowledgeCertainty: schema.enum(["UNKNOWN", "CONFLICTING", "PARTIAL", "SUPPORTED"] as const), state: schema.enum(["NOTHING_KNOWN", "FIRST_HINTS", "REPEATED_ONE_SIDED", "CONFLICTING", "LIMITED_CALIBRATION_ONLY"] as const) });
const CalibrationInterpretationSchema = schema.object({ interpretationId: identifier, evidenceRecordId: identifier, evidenceRecordHash: sha256, chainHash: sha256, policyHash: sha256, dimension: schema.enum(CALIBRATION_MODEL_DIMENSIONS), key: identifier, direction: schema.enum(["POSITIVE", "NEGATIVE", "UNKNOWN"] as const), evidenceBand: schema.enum(["OBSERVATIONAL", "CONDITIONAL", "EXPLICIT"] as const), attributionUnitId: identifier, independenceUnit: schema.nullable(identifier), contextHash: schema.nullable(sha256), limitations: schema.array(identifier, { min: 1, max: 16 }), interpretationHash: sha256 });
const CalibrationProjectionSchema = schema.object({ mode: schema.literal("CALIBRATION_ONLY"), productionAuthorized: schema.literal(false), eligibilityAuthority: schema.literal(false), rankingAuthority: schema.literal(false), policyHash: sha256, items: schema.array(schema.object({ dimension: schema.enum(CALIBRATION_MODEL_DIMENSIONS), key: identifier, direction: schema.enum(["POSITIVE", "NEGATIVE", "UNKNOWN"] as const), sufficiency: schema.enum(["FIRST_HINTS", "REPEATED_ONE_SIDED", "CONFLICTING", "LIMITED_CALIBRATION_ONLY"] as const), uncertaintyPreserved: schema.literal(true) }), { max: 256 }), limitations: schema.array(identifier, { min: 1, max: 16 }), projectionHash: sha256 });
const PolicyResultSchema = schema.object({ policyId: identifier, policyVersion: identifier, policyHash: sha256, status: schema.enum(["ACTIVE_CALIBRATION", "NEUTRAL"] as const), neutralReason: schema.nullable(schema.enum(["NO_CONSENT", "WITHDRAWN", "RESET", "ERASED", "KILL_SWITCH", "NO_EVIDENCE"] as const)), calibrationBasis: schema.object({ conceptRegistry: schema.object({ registryVersion: schema.literal(CALIBRATION_CONCEPT_REGISTRY_VERSION), registryHash: schema.literal(CALIBRATION_CONCEPT_REGISTRY_HASH) }), attributionStrategy: schema.enum(["EXPLICIT_OUTCOME_COMPETING_CONCEPTS", "OUTCOME_AND_SPOT_SEPARATE", "CONTEXT_FIRST_COMPETING_CONCEPTS"] as const), independenceStrategy: schema.literal("ONE_UNIT_PER_SERVER_RESOLVED_JOURNEY"), conflictStrategy: schema.literal("PRESERVE_POSITIVE_AND_NEGATIVE"), temporalStrategy: schema.object({ strategy: schema.enum(["NO_TEMPORAL_INFERENCE", "FIXTURE_RECENCY_SEPARATION", "FIXTURE_CONTEXT_RECENCY_SEPARATION"] as const), fixtureCutoff: schema.nullable(timestamp), decay: schema.literal("NOT_CONFIGURED") }), explorationStrategy: schema.enum(["NOT_CONFIGURED", "VERIFIED_REPEAT_FAMILIARITY_ONLY", "RESEARCH_CONTEXT_FLIP_AND_ALTERNATIVE"] as const), syntheticThresholds: SyntheticThresholdSchema }), usedEvidenceRecordIds: schema.array(identifier, { max: 4096 }), ignoredEvidence: schema.array(schema.object({ recordId: identifier, reason: identifier }), { max: 4096 }), interpretations: schema.array(CalibrationInterpretationSchema, { max: 4096 }), sufficiency: SufficiencyMetricsSchema, domainSufficiency: schema.array(schema.object({ dimension: schema.enum(CALIBRATION_MODEL_DIMENSIONS), state: schema.enum(["NOTHING_KNOWN", "FIRST_HINTS", "REPEATED_ONE_SIDED", "CONFLICTING", "LIMITED_CALIBRATION_ONLY"] as const), independentUnits: count, conflict: schema.boolean() }), { max: 7 }), calibrationProjection: CalibrationProjectionSchema, resultHash: sha256 });
export const CalibrationReportSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.calibrationReport), scenarioId: identifier, scenarioHash: sha256, signalRegistryHash: schema.literal(CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryHash), results: schema.array(PolicyResultSchema, { min: 3, max: 3 }), productionProjection: schema.object({ status: schema.literal("NEUTRAL"), reason: schema.literal("NO_PRODUCTION_INTERPRETATION_POLICY"), containsPersonalModelData: schema.literal(false), eligibilityAuthority: schema.literal(false), rankingAuthority: schema.literal(false), projectionHash: sha256 }), reportHash: sha256 });
export type CalibrationReport = Infer<typeof CalibrationReportSchema>;
type PolicyResult = Infer<typeof PolicyResultSchema>;
type CalibrationInterpretation = Infer<typeof CalibrationInterpretationSchema>;

function parseScenario(value: unknown): CalibrationScenario {
  const parsed = CalibrationScenarioSchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "scenarioHash")) !== parsed.scenarioHash) throw new ContractValidationError("$.scenarioHash", "scenario hash mismatch");
  if (parsed.lifecycle !== "ACTIVE" && (parsed.subjectBindingHash !== null || parsed.evidence.length > 0)) throw new ContractValidationError("$", "suppressed scenario contains persistable personal calibration input");
  if (parsed.lifecycle === "ACTIVE" && parsed.subjectBindingHash === null) throw new ContractValidationError("$.subjectBindingHash", "active calibration requires server-bound subject");
  return parsed;
}

function canonicalActiveEvidence(scenario: CalibrationScenario, trust: CalibrationEvidenceTrustContext): { active: CalibrationEvidence[]; ignored: { recordId: string; reason: string }[] } {
  const verified = scenario.evidence.map((evidence) => verifyCalibrationEvidence(evidence, scenario.subjectBindingHash!, trust));
  const recordIds = verified.map(({ recordId }) => recordId); const hashes = verified.map(({ recordHash }) => recordHash);
  if (new Set(recordIds).size !== recordIds.length || new Set(hashes).size !== hashes.length) throw new ContractValidationError("$.evidence", "duplicate evidence identity");
  const recordsById = new Map(verified.map((record) => [record.recordId, record]));
  const correctionTargets = verified.filter(({ eventType }) => eventType === "CORRECTION").map(({ supersedesRecordId }) => supersedesRecordId!);
  if (new Set(correctionTargets).size !== correctionTargets.length) throw new ContractValidationError("$.evidence", "duplicate correction target");
  for (const correction of verified.filter(({ eventType }) => eventType === "CORRECTION")) {
    const target = recordsById.get(correction.supersedesRecordId!);
    if (!target || target.eventType === "CORRECTION") throw new ContractValidationError("$.evidence", "correction target is missing or invalid");
    if (correction.occurredAt < target.occurredAt) throw new ContractValidationError("$.evidence", "correction cannot precede its target");
  }
  const correctedTargets = new Set(verified.filter(({ eventType, active }) => eventType === "CORRECTION" && active).map(({ supersedesRecordId }) => supersedesRecordId!));
  const seenEvents = new Set<string>(); const seenRetries = new Set<string>(); const active: CalibrationEvidence[] = []; const ignored: { recordId: string; reason: string }[] = [];
  for (const evidence of [...verified].sort((a, b) => a.recordId.localeCompare(b.recordId))) {
    if (!evidence.active || correctedTargets.has(evidence.recordId)) { ignored.push({ recordId: evidence.recordId, reason: "CORRECTED_OR_INACTIVE" }); continue; }
    if (evidence.eventType === "CORRECTION") { active.push(evidence); continue; }
    if (seenEvents.has(evidence.eventHash) || (evidence.retryOfRecordId !== null && (seenRetries.has(evidence.retryOfRecordId) || recordIds.includes(evidence.retryOfRecordId)))) { ignored.push({ recordId: evidence.recordId, reason: "TECHNICAL_DUPLICATE" }); continue; }
    seenEvents.add(evidence.eventHash); if (evidence.retryOfRecordId) seenRetries.add(evidence.retryOfRecordId); active.push(evidence);
  }
  return { active, ignored };
}

function sufficiency(interpretations: readonly CalibrationInterpretation[], used: readonly CalibrationEvidence[], policy: CalibrationPolicy): Infer<typeof SufficiencyMetricsSchema> {
  const units = uniqueSorted(interpretations.flatMap((item) => item.independenceUnit ? [item.independenceUnit] : []));
  const concepts = uniqueSorted(interpretations.filter(({ key }) => key.startsWith("concept:")) .map(({ key }) => key));
  const contexts = uniqueSorted(interpretations.flatMap(({ contextHash }) => contextHash ? [contextHash] : []));
  const positiveCount = interpretations.filter(({ direction }) => direction === "POSITIVE").length;
  const negativeCount = interpretations.filter(({ direction }) => direction === "NEGATIVE").length;
  const conflict = positiveCount > 0 && negativeCount > 0;
  const diversity = new Set(used.map(({ eventType }) => eventType)).size;
  const conflictingWorld = used.some(({ worldConcepts }) => worldConcepts.some(({ certainty }) => certainty === "CONFLICTING"));
  const certainWorld = used.flatMap(({ worldConcepts }) => worldConcepts).filter(({ certainty }) => certainty === "VERIFIED" || certainty === "SUPPORTED").length;
  const state = interpretations.length === 0 ? "NOTHING_KNOWN" : conflict ? "CONFLICTING" : units.length >= policy.sufficiencyStrategy.limitedProjectionIndependentUnits && diversity >= policy.sufficiencyStrategy.minimumEvidenceDiversity ? "LIMITED_CALIBRATION_ONLY" : units.length >= 2 ? "REPEATED_ONE_SIDED" : "FIRST_HINTS";
  return { evidenceQuantity: used.length, evidenceDiversity: diversity, independentExperienceCount: units.length, conceptCoverage: concepts.length, contextCoverage: contexts.length, positiveCount, negativeCount, conflictLevel: conflict ? "CONFLICTING" : positiveCount || negativeCount ? "MIXED" : "NONE", attributionCertainty: concepts.length === 0 ? "UNKNOWN" : conflictingWorld ? "LOW" : concepts.length > units.length ? "MIXED" : "HIGH", worldKnowledgeCertainty: conflictingWorld ? "CONFLICTING" : certainWorld === 0 ? "UNKNOWN" : certainWorld < used.length ? "PARTIAL" : "SUPPORTED", state };
}

function buildPolicyResult(scenario: CalibrationScenario, policy: CalibrationPolicy, policyTrust: CalibrationPolicyTrustContext, evidenceTrust: CalibrationEvidenceTrustContext): PolicyResult {
  const verifiedPolicy = verifyCalibrationPolicy(policy, policyTrust);
  const suppressedReason = scenario.killSwitch ? "KILL_SWITCH" as const : scenario.lifecycle === "NO_CONSENT" ? "NO_CONSENT" as const : scenario.lifecycle === "WITHDRAWN" ? "WITHDRAWN" as const : scenario.lifecycle === "RESET" ? "RESET" as const : scenario.lifecycle === "ERASED" ? "ERASED" as const : null;
  const evidenceState = suppressedReason ? { active: [] as CalibrationEvidence[], ignored: [] as { recordId: string; reason: string }[] } : canonicalActiveEvidence(scenario, evidenceTrust);
  const rules = new Map(verifiedPolicy.rules.map((rule) => [rule.eventType, rule]));
  const used: CalibrationEvidence[] = []; const ignored = [...evidenceState.ignored]; const interpretations: CalibrationInterpretation[] = [];
  const journeyAction = new Set<string>();
  for (const evidence of evidenceState.active) {
    const semantics = signalSemantics(evidence.eventType); const rule = rules.get(evidence.eventType)!;
    if (evidence.eventType === "CORRECTION") { used.push(evidence); continue; }
    if (semantics.status === "NOT_CONFIGURED" || rule.action === "IGNORE" || rule.action === "OBSERVE_ONLY") { ignored.push({ recordId: evidence.recordId, reason: semantics.status === "NOT_CONFIGURED" ? "SEMANTICS_NOT_CONFIGURED" : rule.action === "IGNORE" ? "POLICY_IGNORES_EVENT" : "OBSERVATION_ONLY" }); continue; }
    if (rule.requiresIndependentJourney && (!evidence.independenceEligible || evidence.journeyId === null)) { ignored.push({ recordId: evidence.recordId, reason: "INDEPENDENCE_NOT_PROVEN" }); continue; }
    if (rule.requiresConfirmedExperience && !evidence.experienceConfirmed) { ignored.push({ recordId: evidence.recordId, reason: "EXPERIENCE_NOT_CONFIRMED" }); continue; }
    if (rule.requiresContext && evidence.context === null) { ignored.push({ recordId: evidence.recordId, reason: "CONTEXT_REQUIRED" }); continue; }
    if (rule.dimension === "RECENT_PREFERENCE" && verifiedPolicy.temporalStrategy.fixtureCutoff !== null && evidence.occurredAt < verifiedPolicy.temporalStrategy.fixtureCutoff) { ignored.push({ recordId: evidence.recordId, reason: "OUTSIDE_FIXTURE_RECENCY_WINDOW" }); continue; }
    const journeyKey = evidence.journeyId ?? evidence.chainId; const dedupeKey = `${journeyKey}|${rule.action}|${evidence.spotId ?? "none"}`;
    if (semantics.repetitionRule === "ONE_PER_JOURNEY" && journeyAction.has(dedupeKey)) { ignored.push({ recordId: evidence.recordId, reason: "SAME_JOURNEY_ALREADY_REPRESENTED" }); continue; }
    journeyAction.add(dedupeKey); used.push(evidence);
    if (rule.dimension === null) continue;
    const certainConcepts = evidence.worldConcepts.filter(({ certainty }) => certainty === "VERIFIED" || certainty === "SUPPORTED");
    const uncertainConcepts = evidence.worldConcepts.filter(({ certainty }) => certainty === "CONFLICTING" || certainty === "UNKNOWN");
    const keys = rule.action === "CONCEPT_HYPOTHESIS" || rule.action === "CONTEXTUAL_CONCEPT_HYPOTHESIS"
      ? certainConcepts.length ? certainConcepts.map(({ registryVersion, conceptId }) => `concept:${registryVersion}:${conceptId}`) : ["attribution:unknown"]
      : rule.action === "PRACTICAL_HYPOTHESIS" ? ["practical:navigation-or-reservation"]
      : rule.action === "FAMILIARITY_HYPOTHESIS" ? [`familiarity:${evidence.spotId ?? "unknown"}`]
      : rule.action === "EXPLORATION_RESEARCH_HYPOTHESIS" ? ["exploration:alternative-requested"]
      : [`spot:${evidence.spotId ?? "unknown"}`];
    const attributionUnitId = `attribution-${contentHash({ chainHash: evidence.chainHash, recordHash: evidence.recordHash, keys })}`;
    for (const rawKey of keys) {
      const key = rule.dimension === "CONTEXTUAL_TASTE" && evidence.context !== null ? `${rawKey}:context:${evidence.context.contextHash}` : rawKey;
      const direction = rule.direction === "FROM_EXPLICIT_OUTCOME" ? (evidence.explicitOutcome === "POSITIVE" ? "POSITIVE" as const : evidence.explicitOutcome === "NEGATIVE" ? "NEGATIVE" as const : "UNKNOWN" as const) : "UNKNOWN" as const;
      const body = { interpretationId: `calibration-interpretation-${contentHash({ policyHash: verifiedPolicy.policyHash, recordHash: evidence.recordHash, key })}`, evidenceRecordId: evidence.recordId, evidenceRecordHash: evidence.recordHash, chainHash: evidence.chainHash, policyHash: verifiedPolicy.policyHash, dimension: rule.dimension, key, direction, evidenceBand: rule.evidenceBand === "NONE" ? "OBSERVATIONAL" as const : rule.evidenceBand, attributionUnitId, independenceUnit: evidence.independenceEligible ? journeyKey : null, contextHash: evidence.context?.contextHash ?? null, limitations: uniqueSorted([...rule.limitations, ...(keys.length > 1 ? ["MULTI_CONCEPT_ONE_EXPERIENCE_UNIT"] : []), ...(uncertainConcepts.length ? ["WORLD_ATTRIBUTION_UNCERTAINTY_PRESERVED"] : []), ...(semantics.status === "RESEARCH_ONLY" ? ["RESEARCH_ONLY_NOT_PROJECTABLE"] : [])]) };
      interpretations.push(CalibrationInterpretationSchema.parse({ ...body, interpretationHash: contentHash(body) }));
    }
  }
  const metrics = sufficiency(interpretations, used, verifiedPolicy);
  const grouped = new Map<string, CalibrationInterpretation[]>();
  for (const item of interpretations) { const key = `${item.dimension}|${item.key}|${item.contextHash ?? "none"}`; const group = grouped.get(key) ?? []; group.push(item); grouped.set(key, group); }
  const domainSufficiency = CALIBRATION_MODEL_DIMENSIONS.map((dimension) => {
    const rows = interpretations.filter((item) => item.dimension === dimension); const units = uniqueSorted(rows.flatMap((item) => item.independenceUnit ? [item.independenceUnit] : [])); const conflict = rows.some(({ direction }) => direction === "POSITIVE") && rows.some(({ direction }) => direction === "NEGATIVE");
    const state = rows.length === 0 ? "NOTHING_KNOWN" as const : conflict ? "CONFLICTING" as const : units.length >= verifiedPolicy.sufficiencyStrategy.limitedProjectionIndependentUnits ? "LIMITED_CALIBRATION_ONLY" as const : units.length >= 2 ? "REPEATED_ONE_SIDED" as const : "FIRST_HINTS" as const;
    return { dimension, state, independentUnits: units.length, conflict };
  });
  const projectionItems = [...grouped.values()].filter((rows) => !rows.some(({ limitations }) => limitations.includes("RESEARCH_ONLY_NOT_PROJECTABLE"))).map((rows) => { const positive = rows.some(({ direction }) => direction === "POSITIVE"); const negative = rows.some(({ direction }) => direction === "NEGATIVE"); const ds = domainSufficiency.find(({ dimension }) => dimension === rows[0]!.dimension)!; return { dimension: rows[0]!.dimension, key: rows[0]!.key, direction: positive && negative ? "UNKNOWN" as const : positive ? "POSITIVE" as const : negative ? "NEGATIVE" as const : "UNKNOWN" as const, sufficiency: ds.state === "NOTHING_KNOWN" ? "FIRST_HINTS" as const : ds.state, uncertaintyPreserved: true as const }; });
  const projectionBody = { mode: "CALIBRATION_ONLY" as const, productionAuthorized: false as const, eligibilityAuthority: false as const, rankingAuthority: false as const, policyHash: verifiedPolicy.policyHash, items: projectionItems.sort((a, b) => `${a.dimension}|${a.key}`.localeCompare(`${b.dimension}|${b.key}`)), limitations: ["CALIBRATION_ONLY", "NO_PRODUCTION_POLICY", "NO_RANKING_OR_ELIGIBILITY_AUTHORITY"] };
  const calibrationProjection = CalibrationProjectionSchema.parse({ ...projectionBody, projectionHash: contentHash(projectionBody) });
  const neutralReason = suppressedReason ?? (scenario.evidence.length === 0 ? "NO_EVIDENCE" as const : null);
  const body = { policyId: verifiedPolicy.policyId, policyVersion: verifiedPolicy.policyVersion, policyHash: verifiedPolicy.policyHash, status: neutralReason ? "NEUTRAL" as const : "ACTIVE_CALIBRATION" as const, neutralReason, calibrationBasis: { conceptRegistry: { registryVersion: verifiedPolicy.conceptRegistry.registryVersion, registryHash: verifiedPolicy.conceptRegistry.registryHash }, attributionStrategy: verifiedPolicy.attributionStrategy, independenceStrategy: verifiedPolicy.independenceStrategy, conflictStrategy: verifiedPolicy.conflictStrategy, temporalStrategy: verifiedPolicy.temporalStrategy, explorationStrategy: verifiedPolicy.explorationStrategy, syntheticThresholds: verifiedPolicy.sufficiencyStrategy }, usedEvidenceRecordIds: used.map(({ recordId }) => recordId).sort(), ignoredEvidence: ignored.sort((a, b) => a.recordId.localeCompare(b.recordId)), interpretations: interpretations.sort((a, b) => a.interpretationId.localeCompare(b.interpretationId)), sufficiency: metrics, domainSufficiency, calibrationProjection };
  return PolicyResultSchema.parse({ ...body, resultHash: contentHash(body) });
}

export function runCalibrationScenario(rawScenario: unknown, policyTrust: CalibrationPolicyTrustContext, evidenceTrust: CalibrationEvidenceTrustContext): CalibrationReport {
  parseSignalSemanticsRegistry(CANONICAL_SIGNAL_SEMANTICS_REGISTRY);
  const scenario = parseScenario(rawScenario);
  const results = CALIBRATION_POLICY_CANDIDATES.map((candidate) => buildPolicyResult(scenario, candidate, policyTrust, evidenceTrust));
  const productionProjectionBody = { status: "NEUTRAL" as const, reason: "NO_PRODUCTION_INTERPRETATION_POLICY" as const, containsPersonalModelData: false as const, eligibilityAuthority: false as const, rankingAuthority: false as const };
  const productionProjection = { ...productionProjectionBody, projectionHash: contentHash({ ...productionProjectionBody, scenarioId: scenario.scenarioId, contractVersion: CONTRACT_VERSIONS.calibrationReport }) };
  const body = { contractVersion: CONTRACT_VERSIONS.calibrationReport, scenarioId: scenario.scenarioId, scenarioHash: scenario.scenarioHash, signalRegistryHash: CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryHash, results, productionProjection };
  return CalibrationReportSchema.parse({ ...body, reportHash: contentHash(body) });
}

export function verifyCalibrationReport(value: unknown, scenario: unknown, policyTrust: CalibrationPolicyTrustContext, evidenceTrust: CalibrationEvidenceTrustContext): CalibrationReport {
  const parsed = CalibrationReportSchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "reportHash")) !== parsed.reportHash) throw new ContractValidationError("$.reportHash", "calibration report hash mismatch");
  for (const result of parsed.results) {
    if (contentHash(withoutHash(result as unknown as Record<string, unknown>, "resultHash")) !== result.resultHash) throw new ContractValidationError("$.results.resultHash", "policy result hash mismatch");
    for (const interpretation of result.interpretations) if (contentHash(withoutHash(interpretation as unknown as Record<string, unknown>, "interpretationHash")) !== interpretation.interpretationHash) throw new ContractValidationError("$.interpretations.interpretationHash", "interpretation hash mismatch");
    if (contentHash(withoutHash(result.calibrationProjection as unknown as Record<string, unknown>, "projectionHash")) !== result.calibrationProjection.projectionHash) throw new ContractValidationError("$.calibrationProjection.projectionHash", "calibration projection hash mismatch");
  }
  const rebuilt = runCalibrationScenario(scenario, policyTrust, evidenceTrust);
  if (!same(parsed, rebuilt)) throw new ContractValidationError("$", "calibration report differs from authoritative deterministic replay");
  return parsed;
}

/** Explicitly synthetic convenience only. It cannot create Production authority. */
export function createSyntheticCalibrationTrustContext(evidence: readonly CalibrationEvidence[] = []): CalibrationPolicyTrustContext & CalibrationEvidenceTrustContext {
  const policyAnchors = new Map(CALIBRATION_POLICY_CANDIDATES.map((candidate) => {
    const body = { contractVersion: CONTRACT_VERSIONS.calibrationPolicyTrustAnchor, anchorId: `policy-anchor-${candidate.policyId}`, acceptedPolicyId: candidate.policyId, acceptedPolicyVersion: candidate.policyVersion, acceptedPolicyHash: candidate.policyHash, acceptedRegistryHash: CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryHash, acceptedConceptRegistryHash: CALIBRATION_CONCEPT_REGISTRY_HASH, issuer: "SYNTHETIC_CALIBRATION_RELEASE_AUTHORITY" as const, environment: "SYNTHETIC_FIXTURE_ONLY" as const, productionAuthorized: false as const };
    return [candidate.policyId, withCalibrationPolicyTrustAnchorHash(body)] as const;
  }));
  const evidenceAnchors = new Map(evidence.map((record) => {
    const body = { contractVersion: CONTRACT_VERSIONS.calibrationEvidenceTrustAnchor, anchorId: `evidence-anchor-${record.recordId}`, acceptedRecordId: record.recordId, acceptedRecordHash: record.recordHash, subjectBindingHash: record.subjectBindingHash, issuer: "SYNTHETIC_PHASE2_EVIDENCE_AUTHORITY" as const, environment: "SYNTHETIC_FIXTURE_ONLY" as const, productionAuthorized: false as const };
    return [record.recordId, withCalibrationEvidenceTrustAnchorHash(body)] as const;
  }));
  return { getAcceptedPolicyAnchor: (policyId) => policyAnchors.get(policyId) ?? null, getAcceptedEvidenceAnchor: (recordId) => evidenceAnchors.get(recordId) ?? null };
}
