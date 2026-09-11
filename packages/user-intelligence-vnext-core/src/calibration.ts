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

const AuthorityRequirementSchema = schema.object({
  mode: schema.enum(["ALL_OF", "ANY_OF"] as const),
  authorities: schema.array(schema.enum(EVENT_AUTHORITIES), { min: 1, max: 6 }),
});

const SignalSemanticsEntrySchema = schema.object({
  eventType: schema.enum(CALIBRATION_EVENT_TYPES),
  canonicalEventType: schema.nullable(identifier),
  status: schema.enum(STATUS),
  semanticClass: schema.enum(SEMANTIC_CLASSES),
  authorityRequirement: AuthorityRequirementSchema,
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
const neutral = (eventType: CalibrationEventType, semanticClass: SignalSemanticsEntry["semanticClass"], authorities: readonly typeof EVENT_AUTHORITIES[number][], prohibitedConclusions: readonly string[], overrides: Partial<EntryInput> = {}): SignalSemanticsEntry => entry(eventType, {
  status: "CONFIGURED", semanticClass, authorityRequirement: { mode: authorities.length > 1 ? "ANY_OF" : "ALL_OF", authorities }, experienceRelation: "POSSIBLE_SAME_JOURNEY",
  journeyRule: "REQUIRED_SERVER_RESOLVED", independenceRule: "NEVER", possibleDimensions: [], allowedInterpretations: ["NEUTRAL"],
  prohibitedConclusions, requiredAdditionalEvidence: [], repetitionRule: "ONE_PER_JOURNEY", contextBinding: "OPTIONAL_SEPARATE",
  sufficiencyContribution: "NONE", decisionProjection: "NEVER", ...overrides,
});
const unknown = (eventType: CalibrationEventType, semanticClass: SignalSemanticsEntry["semanticClass"], prohibitedConclusions: readonly string[], status: "NOT_CONFIGURED" | "RESEARCH_ONLY" = "NOT_CONFIGURED"): SignalSemanticsEntry => entry(eventType, {
  status, semanticClass, authorityRequirement: { mode: "ALL_OF", authorities: ["SERVER_VERIFIED_PRODUCT_STATE"] }, experienceRelation: "POSSIBLE_SAME_JOURNEY",
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
  neutral("SAVED", "STATE_CHANGE", ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], ["SAVE_IS_SATISFACTION", "SAVE_IS_VISIT", "SAVE_IS_CONCEPT_TASTE"], { possibleDimensions: ["RECENT_PREFERENCE", "DIRECT_SPOT_AFFINITY"], sufficiencyContribution: "CONDITIONAL", decisionProjection: "CALIBRATION_ONLY" }),
  neutral("SAVE_REMOVED", "STATE_CHANGE", ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], ["SAVE_REMOVAL_IS_DISLIKE", "SAVE_REMOVAL_IS_NEGATIVE_TASTE", "SAVE_REMOVAL_IS_DISSATISFACTION"]),
  neutral("NAVIGATION_STARTED", "INTENT", ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"], ["NAVIGATION_IS_VISIT", "NAVIGATION_IS_SATISFACTION", "NAVIGATION_IS_LIKE"], { possibleDimensions: ["PRACTICAL_PREFERENCE"], sufficiencyContribution: "CONDITIONAL", decisionProjection: "CALIBRATION_ONLY" }),
  neutral("RESERVATION_INTENT", "INTENT", ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], ["RESERVATION_IS_VISIT", "RESERVATION_IS_SATISFACTION"], { possibleDimensions: ["PRACTICAL_PREFERENCE"] }),
  neutral("VISITED", "EXPERIENCE", ["VERIFIED_OUTCOME"], ["VISIT_IS_LIKE", "VISIT_IS_POSITIVE_SATISFACTION", "MULTIPLE_CONCEPTS_ARE_MULTIPLE_EXPERIENCES"], { experienceRelation: "CONFIRMED_EXPERIENCE", independenceRule: "INDEPENDENT_VERIFIED_JOURNEY_ONLY", possibleDimensions: ["DIRECT_SPOT_AFFINITY", "EXPLORATION_FAMILIARITY"], repetitionRule: "INDEPENDENT_JOURNEYS_ONLY", sufficiencyContribution: "CONDITIONAL", decisionProjection: "CALIBRATION_ONLY" }),
  neutral("STANDARD_REVIEW", "EXPERIENCE", ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], ["REVIEW_IS_SATISFACTION", "REVIEW_MOOD_IS_QUALITY", "REVIEW_TEXT_IS_AUTOMATIC_TASTE", "REVIEW_ENTRY_PATH_CHANGES_STRENGTH"], { experienceRelation: "CONFIRMED_EXPERIENCE", independenceRule: "ONE_UNIT_PER_SERVER_JOURNEY", possibleDimensions: ["DIRECT_SPOT_AFFINITY"], sufficiencyContribution: "CONDITIONAL" }),
  neutral("SMART_REVIEW", "EXPERIENCE", ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], ["REVIEW_IS_SATISFACTION", "REVIEW_MOOD_IS_QUALITY", "REVIEW_TEXT_IS_AUTOMATIC_TASTE", "REVIEW_ENTRY_PATH_CHANGES_STRENGTH"], { experienceRelation: "CONFIRMED_EXPERIENCE", independenceRule: "ONE_UNIT_PER_SERVER_JOURNEY", possibleDimensions: ["DIRECT_SPOT_AFFINITY"], sufficiencyContribution: "CONDITIONAL" }),
  entry("EXPLICIT_SATISFACTION", { status: "CONFIGURED", semanticClass: "SATISFACTION", authorityRequirement: { mode: "ALL_OF", authorities: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"] }, experienceRelation: "EXPLICIT_EXPERIENCE_OUTCOME", journeyRule: "REQUIRED_SERVER_RESOLVED", independenceRule: "ONE_UNIT_PER_SERVER_JOURNEY", possibleDimensions: ["LONG_TERM_CONCEPT_TASTE", "RECENT_PREFERENCE", "CONTEXTUAL_TASTE", "DIRECT_SPOT_AFFINITY"], allowedInterpretations: ["POSITIVE"], prohibitedConclusions: ["SATISFACTION_ATTRIBUTES_ALL_CONCEPTS", "SATISFACTION_IS_RANKING_AUTHORITY"], requiredAdditionalEvidence: ["QUALIFIED_EXPERIENCE", "EVENT_TIME_WORLD_FOR_CONCEPT_ATTRIBUTION"], repetitionRule: "ONE_PER_JOURNEY", contextBinding: "OPTIONAL_SEPARATE", sufficiencyContribution: "QUALIFYING_EXPLICIT_ONLY", decisionProjection: "ELIGIBLE_AFTER_PRODUCT_APPROVAL" }),
  entry("EXPLICIT_DISSATISFACTION", { status: "CONFIGURED", semanticClass: "SATISFACTION", authorityRequirement: { mode: "ALL_OF", authorities: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"] }, experienceRelation: "EXPLICIT_EXPERIENCE_OUTCOME", journeyRule: "REQUIRED_SERVER_RESOLVED", independenceRule: "ONE_UNIT_PER_SERVER_JOURNEY", possibleDimensions: ["AVERSION", "CONTEXTUAL_TASTE", "DIRECT_SPOT_AFFINITY"], allowedInterpretations: ["NEGATIVE"], prohibitedConclusions: ["DISSATISFACTION_IS_GLOBAL_SPOT_BAN", "DISSATISFACTION_IS_ELIGIBILITY_AUTHORITY"], requiredAdditionalEvidence: ["QUALIFIED_EXPERIENCE", "EVENT_TIME_WORLD_FOR_CONCEPT_ATTRIBUTION"], repetitionRule: "ONE_PER_JOURNEY", contextBinding: "OPTIONAL_SEPARATE", sufficiencyContribution: "QUALIFYING_EXPLICIT_ONLY", decisionProjection: "ELIGIBLE_AFTER_PRODUCT_APPROVAL" }),
  unknown("REVIEW_MOODS", "SATISFACTION", ["MOOD_IS_QUALITY", "MOOD_IS_GENERAL_SATISFACTION"], "RESEARCH_ONLY"),
  unknown("MOMENT_CREATED", "SOCIAL_OBSERVATION", ["MOMENT_IS_REVIEW", "MOMENT_IS_SATISFACTION", "MOMENT_PROPAGATES_SOCIAL_TASTE"], "RESEARCH_ONLY"),
  unknown("SEARCH", "SEARCH", ["RAW_SEARCH_TEXT_IS_DURABLE_PROFILE", "SEARCH_IS_SATISFACTION"], "RESEARCH_ONLY"),
  unknown("DWELL", "INTERACTION", ["DWELL_IS_ATTENTION", "DWELL_IS_INTEREST", "DWELL_IS_POSITIVE_TASTE"]),
  unknown("QUICK_SKIP", "INTERACTION", ["QUICK_SKIP_IS_DISLIKE", "QUICK_SKIP_IS_AVERSION"]),
  neutral("REPEAT_VISIT", "EXPERIENCE", ["VERIFIED_OUTCOME"], ["SAME_JOURNEY_REPETITION_IS_INDEPENDENT", "REPEAT_VISIT_IS_SATISFACTION"], { experienceRelation: "CONFIRMED_EXPERIENCE", independenceRule: "INDEPENDENT_VERIFIED_JOURNEY_ONLY", possibleDimensions: ["DIRECT_SPOT_AFFINITY", "EXPLORATION_FAMILIARITY"], repetitionRule: "INDEPENDENT_JOURNEYS_ONLY", sufficiencyContribution: "CONDITIONAL", decisionProjection: "CALIBRATION_ONLY" }),
  entry("CORRECTION", { status: "CONFIGURED", semanticClass: "CORRECTION", authorityRequirement: { mode: "ALL_OF", authorities: ["AUTHENTICATED_USER_ACTION", "SERVER_EVENT_LEDGER"] }, experienceRelation: "CORRECTION_ONLY", journeyRule: "TARGET_JOURNEY", independenceRule: "TARGET_INHERITS", possibleDimensions: [], allowedInterpretations: ["NEUTRAL"], prohibitedConclusions: ["CORRECTION_IS_NEGATIVE_TASTE", "CORRECTION_REWRITES_HISTORY"], requiredAdditionalEvidence: ["AUTHORITATIVE_TARGET_RECORD"], repetitionRule: "APPEND_ONLY_TARGET", correctionBehavior: "APPEND_ONLY_CORRECTION", contextBinding: "PRESERVE_TARGET", sufficiencyContribution: "NONE", decisionProjection: "NEVER" }),
];

const registryBody = {
  contractVersion: CONTRACT_VERSIONS.signalSemanticsRegistry,
  registryId: "backyrd-user-signal-semantics-calibration",
  registryVersion: "backyrd.user-intelligence.signal-semantics@3b-candidate-3",
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
  calibrationProjectionEligible: schema.boolean(), productionProjectionEligible: schema.literal(false), limitations: schema.array(identifier, { min: 1, max: 16 }),
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
  reducer: schema.object({ reducerVersion: schema.literal("backyrd.user-intelligence.calibration-reducer@3b.2"), releaseHash: sha256, productionRelease: schema.literal(false) }),
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
  requiresConfirmedExperience: false, requiresContext: false, requiresCertainWorldAttribution: false, calibrationProjectionEligible: false, productionProjectionEligible: false,
  limitations: ["NO_CALIBRATED_PRODUCT_SEMANTICS"], ...overrides[eventType],
}));
const reducerReleaseHash = contentHash("backyrd.user-intelligence.calibration-reducer@3b.2:fixture-only");
const policy = (body: Omit<CalibrationPolicy, "contractVersion" | "authority" | "productionAuthorized" | "productCalibrationStatus" | "signalRegistry" | "conceptRegistry" | "reducer" | "independenceStrategy" | "conflictStrategy" | "projectionStrategy" | "policyHash">): CalibrationPolicy => {
  const full = { contractVersion: CONTRACT_VERSIONS.calibrationPolicy, authority: "CALIBRATION_ONLY" as const, productionAuthorized: false as const, productCalibrationStatus: "CANDIDATE_NOT_APPROVED" as const, signalRegistry: { registryVersion: CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryVersion, registryHash: CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryHash }, conceptRegistry: { registryVersion: CALIBRATION_CONCEPT_REGISTRY_VERSION, registryHash: CALIBRATION_CONCEPT_REGISTRY_HASH, authority: "SYNTHETIC_REGISTRY_FIXTURE" as const, productionAuthorized: false as const }, reducer: { reducerVersion: "backyrd.user-intelligence.calibration-reducer@3b.2" as const, releaseHash: reducerReleaseHash, productionRelease: false as const }, independenceStrategy: "ONE_UNIT_PER_SERVER_RESOLVED_JOURNEY" as const, conflictStrategy: "PRESERVE_POSITIVE_AND_NEGATIVE" as const, projectionStrategy: "CALIBRATION_PROJECTION_ONLY_PRODUCTION_NEUTRAL" as const, ...body };
  return CalibrationPolicySchema.parse({ ...full, policyHash: contentHash(full) });
};

const explicitPositive = { action: "CONCEPT_HYPOTHESIS", dimension: "LONG_TERM_CONCEPT_TASTE", direction: "FROM_EXPLICIT_OUTCOME", evidenceBand: "EXPLICIT", requiresIndependentJourney: true, requiresConfirmedExperience: true, requiresContext: false, requiresCertainWorldAttribution: true, calibrationProjectionEligible: true, productionProjectionEligible: false, limitations: ["CALIBRATION_ONLY", "COMPETING_CONCEPT_ATTRIBUTION"] } as const;
const explicitNegative = { ...explicitPositive, dimension: "AVERSION" as const };
const sharedLimitations = ["NO_PRODUCTION_AUTHORITY", "NO_FINAL_SIGNAL_WEIGHTS", "NO_PRODUCT_DECAY", "NO_RANKING_OR_ELIGIBILITY_AUTHORITY", "RETENTION_NOT_CONFIGURED"] as const;

export const CALIBRATION_POLICY_CANDIDATES: readonly CalibrationPolicy[] = Object.freeze([
  policy({ policyId: "candidate-a-conservative", policyVersion: "backyrd.user-intelligence.policy-candidate-a@3b.2", name: "CONSERVATIVE_EXPLICIT_EVIDENCE", rules: allRules({ EXPLICIT_SATISFACTION: explicitPositive, EXPLICIT_DISSATISFACTION: explicitNegative, CORRECTION: { action: "OBSERVE_ONLY", dimension: null, direction: "NEUTRAL_ONLY", evidenceBand: "OBSERVATIONAL", requiresIndependentJourney: false, requiresConfirmedExperience: false, requiresContext: false, requiresCertainWorldAttribution: false, calibrationProjectionEligible: false, productionProjectionEligible: false, limitations: ["APPEND_ONLY_CORRECTION"] } }), attributionStrategy: "EXPLICIT_OUTCOME_COMPETING_CONCEPTS", sufficiencyStrategy: { authority: "CALIBRATION_FIXTURE_ONLY", productCalibrated: false, productionAuthorized: false, firstHintsIndependentUnits: 1, limitedProjectionIndependentUnits: 3, minimumEvidenceDiversity: 1 }, temporalStrategy: { strategy: "NO_TEMPORAL_INFERENCE", fixtureCutoff: null, decay: "NOT_CONFIGURED" }, explorationStrategy: "NOT_CONFIGURED", limitations: [...sharedLimitations, "BEHAVIORAL_SIGNALS_IGNORED"] }),
  policy({ policyId: "candidate-b-balanced", policyVersion: "backyrd.user-intelligence.policy-candidate-b@3b.2", name: "BALANCED_BEHAVIORAL_EVIDENCE", rules: allRules({ EXPLICIT_SATISFACTION: explicitPositive, EXPLICIT_DISSATISFACTION: explicitNegative, SAVED: { action: "DIRECT_SPOT_HYPOTHESIS", dimension: "DIRECT_SPOT_AFFINITY", direction: "UNKNOWN", evidenceBand: "CONDITIONAL", requiresIndependentJourney: false, requiresConfirmedExperience: false, requiresContext: false, requiresCertainWorldAttribution: false, calibrationProjectionEligible: true, productionProjectionEligible: false, limitations: ["SAVE_IS_NOT_SATISFACTION", "SPOT_ONLY_NO_CONCEPT_PROPAGATION"] }, VISITED: { action: "DIRECT_SPOT_HYPOTHESIS", dimension: "DIRECT_SPOT_AFFINITY", direction: "UNKNOWN", evidenceBand: "CONDITIONAL", requiresIndependentJourney: true, requiresConfirmedExperience: true, requiresContext: false, requiresCertainWorldAttribution: false, calibrationProjectionEligible: true, productionProjectionEligible: false, limitations: ["VISIT_IS_NOT_SATISFACTION", "SPOT_ONLY_NO_CONCEPT_PROPAGATION"] }, REPEAT_VISIT: { action: "FAMILIARITY_HYPOTHESIS", dimension: "EXPLORATION_FAMILIARITY", direction: "UNKNOWN", evidenceBand: "CONDITIONAL", requiresIndependentJourney: true, requiresConfirmedExperience: true, requiresContext: false, requiresCertainWorldAttribution: false, calibrationProjectionEligible: true, productionProjectionEligible: false, limitations: ["FAMILIARITY_IS_NOT_POSITIVE_TASTE"] }, NAVIGATION_STARTED: { action: "PRACTICAL_HYPOTHESIS", dimension: "PRACTICAL_PREFERENCE", direction: "UNKNOWN", evidenceBand: "OBSERVATIONAL", requiresIndependentJourney: false, requiresConfirmedExperience: false, requiresContext: false, requiresCertainWorldAttribution: false, calibrationProjectionEligible: true, productionProjectionEligible: false, limitations: ["NAVIGATION_IS_NOT_VISIT_OR_SATISFACTION"] } }), attributionStrategy: "OUTCOME_AND_SPOT_SEPARATE", sufficiencyStrategy: { authority: "CALIBRATION_FIXTURE_ONLY", productCalibrated: false, productionAuthorized: false, firstHintsIndependentUnits: 1, limitedProjectionIndependentUnits: 3, minimumEvidenceDiversity: 2 }, temporalStrategy: { strategy: "FIXTURE_RECENCY_SEPARATION", fixtureCutoff: "2026-01-01T00:00:00.000Z", decay: "NOT_CONFIGURED" }, explorationStrategy: "VERIFIED_REPEAT_FAMILIARITY_ONLY", limitations: [...sharedLimitations, "BEHAVIORAL_MEANING_IS_CANDIDATE_ONLY"] }),
  policy({ policyId: "candidate-c-context", policyVersion: "backyrd.user-intelligence.policy-candidate-c@3b.2", name: "CONTEXT_SENSITIVE_ADAPTIVE", rules: allRules({ EXPLICIT_SATISFACTION: { ...explicitPositive, action: "CONTEXTUAL_CONCEPT_HYPOTHESIS", dimension: "CONTEXTUAL_TASTE", requiresContext: true }, EXPLICIT_DISSATISFACTION: { ...explicitNegative, action: "CONTEXTUAL_CONCEPT_HYPOTHESIS", dimension: "CONTEXTUAL_TASTE", requiresContext: true }, SAVED: { action: "DIRECT_SPOT_HYPOTHESIS", dimension: "RECENT_PREFERENCE", direction: "UNKNOWN", evidenceBand: "CONDITIONAL", requiresIndependentJourney: false, requiresConfirmedExperience: false, requiresContext: false, requiresCertainWorldAttribution: false, calibrationProjectionEligible: true, productionProjectionEligible: false, limitations: ["RECENT_FIXTURE_ONLY", "SAVE_IS_NOT_SATISFACTION"] }, REPEAT_VISIT: { action: "FAMILIARITY_HYPOTHESIS", dimension: "EXPLORATION_FAMILIARITY", direction: "UNKNOWN", evidenceBand: "CONDITIONAL", requiresIndependentJourney: true, requiresConfirmedExperience: true, requiresContext: true, requiresCertainWorldAttribution: false, calibrationProjectionEligible: true, productionProjectionEligible: false, limitations: ["CONTEXT_BOUND_FAMILIARITY_ONLY"] }, ALTERNATIVE_REQUESTED: { action: "OBSERVE_ONLY", dimension: null, direction: "NEUTRAL_ONLY", evidenceBand: "OBSERVATIONAL", requiresIndependentJourney: false, requiresConfirmedExperience: false, requiresContext: true, requiresCertainWorldAttribution: false, calibrationProjectionEligible: false, productionProjectionEligible: false, limitations: ["RESEARCH_ONLY", "ALTERNATIVE_IS_NOT_REJECTION"] } }), attributionStrategy: "CONTEXT_FIRST_COMPETING_CONCEPTS", sufficiencyStrategy: { authority: "CALIBRATION_FIXTURE_ONLY", productCalibrated: false, productionAuthorized: false, firstHintsIndependentUnits: 1, limitedProjectionIndependentUnits: 2, minimumEvidenceDiversity: 2 }, temporalStrategy: { strategy: "FIXTURE_CONTEXT_RECENCY_SEPARATION", fixtureCutoff: "2026-01-01T00:00:00.000Z", decay: "NOT_CONFIGURED" }, explorationStrategy: "RESEARCH_CONTEXT_FLIP_AND_ALTERNATIVE", limitations: [...sharedLimitations, "CONTEXT_ALLOWLIST_NOT_PRODUCT_APPROVED", "RESEARCH_SIGNALS_NEVER_PROJECTED"] }),
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
  const ruleTypes = parsed.rules.map(({ eventType }) => eventType);
  if (new Set(ruleTypes).size !== CALIBRATION_EVENT_TYPES.length) throw new ContractValidationError("$.rules", "policy must bind every registry event exactly once");
  for (const rule of parsed.rules) {
    const semantics = signalSemantics(rule.eventType);
    const interprets = rule.action !== "IGNORE" && rule.action !== "OBSERVE_ONLY";
    if (semantics.status === "NOT_CONFIGURED" && rule.action !== "IGNORE") throw new ContractValidationError("$.rules", "NOT_CONFIGURED semantics cannot be activated by policy");
    if (semantics.status === "RESEARCH_ONLY" && !["IGNORE", "OBSERVE_ONLY"].includes(rule.action)) throw new ContractValidationError("$.rules", "RESEARCH_ONLY semantics cannot become model evidence");
    if (interprets && (rule.dimension === null || !semantics.possibleDimensions.includes(rule.dimension))) throw new ContractValidationError("$.rules.dimension", "policy dimension is outside signal semantics");
    if (!interprets && rule.dimension !== null) throw new ContractValidationError("$.rules.dimension", "non-interpreting rule cannot name a model dimension");
    const requiredDirection = rule.direction === "FROM_EXPLICIT_OUTCOME" ? (rule.eventType === "EXPLICIT_DISSATISFACTION" ? "NEGATIVE" : "POSITIVE") : "NEUTRAL";
    if (interprets && !semantics.allowedInterpretations.includes(requiredDirection)) throw new ContractValidationError("$.rules.direction", "policy direction is outside signal semantics");
    if (rule.productionProjectionEligible) throw new ContractValidationError("$.rules.productionProjectionEligible", "calibration policy cannot authorize Production projection");
    if (rule.calibrationProjectionEligible && (semantics.decisionProjection === "NEVER" || !interprets)) throw new ContractValidationError("$.rules.calibrationProjectionEligible", "signal semantics prohibit calibration projection");
    if (rule.requiresCertainWorldAttribution && !["CONCEPT_HYPOTHESIS", "CONTEXTUAL_CONCEPT_HYPOTHESIS"].includes(rule.action)) throw new ContractValidationError("$.rules.requiresCertainWorldAttribution", "certain World attribution is meaningful only for concept hypotheses");
    if (semantics.experienceRelation === "EXPLICIT_EXPERIENCE_OUTCOME" && (!rule.requiresConfirmedExperience || !rule.requiresIndependentJourney)) throw new ContractValidationError("$.rules", "explicit outcome policy cannot weaken experience or independence requirements");
    if (semantics.contextBinding === "REQUIRED_FOR_CONTEXTUAL" && interprets && !rule.requiresContext) throw new ContractValidationError("$.rules.requiresContext", "policy cannot weaken registry context binding");
    if (semantics.sufficiencyContribution === "NONE" && rule.evidenceBand !== "NONE" && rule.action !== "OBSERVE_ONLY") throw new ContractValidationError("$.rules.evidenceBand", "policy cannot expand a non-contributing signal");
  }
  return parsed;
}

const WorldConceptSchema = schema.object({ registryVersion: identifier, registryHash: schema.literal(CALIBRATION_CONCEPT_REGISTRY_HASH), conceptId: identifier, certainty: schema.enum(["VERIFIED", "SUPPORTED", "CONFLICTING", "UNKNOWN"] as const) });
export const CalibrationAuthorityProofSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.calibrationAuthorityProof), authority: schema.enum(EVENT_AUTHORITIES), authorityVersion: identifier,
  recordId: identifier, recordHash: sha256, subjectBindingHash: sha256, boundUserHash: sha256,
  spotId: schema.nullable(identifier), journeyId: schema.nullable(identifier), experienceEventId: schema.nullable(identifier),
  policyVersion: identifier, proofHash: sha256,
});
export type CalibrationAuthorityProof = Infer<typeof CalibrationAuthorityProofSchema>;
export const withCalibrationAuthorityProofHash = (value: Omit<CalibrationAuthorityProof, "proofHash">): CalibrationAuthorityProof => CalibrationAuthorityProofSchema.parse({ ...value, proofHash: contentHash(value) });

export const Phase2CalibrationSourceBindingSchema = schema.object({
  adapterContractVersion: schema.literal(CONTRACT_VERSIONS.calibrationEvidenceAdapter), phase2StateHash: sha256,
  phase2ChainId: identifier, phase2ChainHash: sha256, phase2EventId: identifier, phase2EventHash: sha256,
  journeyProofHash: sha256, journeyAuthorityProofHashes: schema.array(sha256, { min: 1, max: 32 }),
  worldBindingHashes: schema.array(sha256, { max: 32 }), contextBindingHashes: schema.array(sha256, { max: 32 }),
  correctionResolutionHash: schema.nullable(sha256), consentEnvelopeHash: sha256,
  lifecycleState: schema.literal("ACTIVE"), productionAuthorized: schema.literal(false), bindingHash: sha256,
});
export type Phase2CalibrationSourceBinding = Infer<typeof Phase2CalibrationSourceBindingSchema>;
export const CalibrationEvidenceSchema = schema.object({
  contractVersion: schema.literal(CONTRACT_VERSIONS.calibrationEvidence), recordId: identifier, subjectBindingHash: sha256,
  eventType: schema.enum(CALIBRATION_EVENT_TYPES), eventHash: sha256, chainId: identifier, chainHash: sha256,
  journeyId: schema.nullable(identifier), independenceEligible: schema.boolean(), spotId: schema.nullable(identifier), experienceEventId: schema.nullable(identifier),
  authorityProofs: schema.array(CalibrationAuthorityProofSchema, { min: 1, max: 6 }), direction: schema.enum(["POSITIVE", "NEGATIVE", "UNKNOWN", "NOT_APPLICABLE"] as const),
  experienceConfirmed: schema.boolean(), explicitOutcome: schema.enum(["POSITIVE", "NEGATIVE", "NONE"] as const),
  worldConcepts: schema.array(WorldConceptSchema, { max: 32 }),
  context: schema.nullable(schema.object({ contextHash: sha256, dimensions: schema.array(identifier, { min: 1, max: 16 }), authority: schema.enum(["EXPLICIT_USER", "SERVER_AUTHORIZED", "CAUTIOUSLY_DERIVED"] as const) })),
  occurredAt: timestamp, retryOfRecordId: schema.nullable(identifier),
  correctionTarget: schema.nullable(schema.object({ recordId: identifier, recordHash: sha256, eventHash: sha256, chainHash: sha256 })),
  sourceBinding: Phase2CalibrationSourceBindingSchema, active: schema.boolean(), recordHash: sha256,
});
export type CalibrationEvidence = Infer<typeof CalibrationEvidenceSchema>;
export const withCalibrationEvidenceHash = (value: Omit<CalibrationEvidence, "recordHash">): CalibrationEvidence => CalibrationEvidenceSchema.parse({ ...value, recordHash: contentHash(value) });

export const CalibrationEvidenceTrustAnchorSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.calibrationEvidenceTrustAnchor), anchorId: identifier, acceptedRecordId: identifier, acceptedRecordHash: sha256, subjectBindingHash: sha256, acceptedSourceBindingHash: sha256, acceptedPhase2StateHash: sha256, acceptedPhase2ChainHash: sha256, acceptedPhase2EventHash: sha256, issuer: schema.literal("SYNTHETIC_EVALUATION_AUTHORITY"), environment: schema.literal("SYNTHETIC_FIXTURE_ONLY"), productionAuthorized: schema.literal(false), anchorHash: sha256 });
export type CalibrationEvidenceTrustAnchor = Infer<typeof CalibrationEvidenceTrustAnchorSchema>;
export const withCalibrationEvidenceTrustAnchorHash = (value: Omit<CalibrationEvidenceTrustAnchor, "anchorHash">): CalibrationEvidenceTrustAnchor => CalibrationEvidenceTrustAnchorSchema.parse({ ...value, anchorHash: contentHash(value) });
export interface CalibrationEvidenceTrustContext { getAcceptedEvidenceAnchor(recordId: string): unknown; }

export function verifyCalibrationEvidence(value: unknown, expectedSubject: string, trust: CalibrationEvidenceTrustContext): CalibrationEvidence {
  const parsed = CalibrationEvidenceSchema.parse(value);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "recordHash")) !== parsed.recordHash) throw new ContractValidationError("$.recordHash", "calibration evidence hash mismatch");
  if (parsed.subjectBindingHash !== expectedSubject) throw new ContractValidationError("$.subjectBindingHash", "foreign subject evidence");
  const semantics = signalSemantics(parsed.eventType);
  const proofAuthorities = parsed.authorityProofs.map(({ authority }) => authority);
  if (new Set(proofAuthorities).size !== proofAuthorities.length) throw new ContractValidationError("$.authorityProofs", "duplicate authority proof kind");
  if (new Set(parsed.authorityProofs.map(({ boundUserHash }) => boundUserHash)).size !== 1) throw new ContractValidationError("$.authorityProofs.boundUserHash", "composite authority proofs belong to different users");
  for (const proof of parsed.authorityProofs) {
    if (contentHash(withoutHash(proof as unknown as Record<string, unknown>, "proofHash")) !== proof.proofHash) throw new ContractValidationError("$.authorityProofs.proofHash", "authority proof hash mismatch");
    if (proof.authorityVersion !== CONTRACT_VERSIONS.calibrationAuthorityProof || proof.subjectBindingHash !== parsed.subjectBindingHash || proof.spotId !== parsed.spotId || proof.journeyId !== parsed.journeyId || proof.experienceEventId !== parsed.experienceEventId) throw new ContractValidationError("$.authorityProofs", "authority proofs do not share the evidence binding");
  }
  const requirement = semantics.authorityRequirement;
  const authoritySatisfied = requirement.mode === "ALL_OF" ? requirement.authorities.every((authority) => proofAuthorities.includes(authority)) : requirement.authorities.some((authority) => proofAuthorities.includes(authority));
  if (!authoritySatisfied || proofAuthorities.some((authority) => !requirement.authorities.includes(authority))) throw new ContractValidationError("$.authorityProofs", "composite authority requirement is not satisfied");
  if (semantics.journeyRule === "REQUIRED_SERVER_RESOLVED" && parsed.journeyId === null) throw new ContractValidationError("$.journeyId", "signal semantics require a server-resolved journey");
  if (semantics.requiredAdditionalEvidence.includes("QUALIFIED_EXPERIENCE") && (!parsed.experienceConfirmed || parsed.experienceEventId === null)) throw new ContractValidationError("$.experienceEventId", "qualified Experience evidence is required");
  if (semantics.requiredAdditionalEvidence.includes("EVENT_TIME_WORLD_FOR_CONCEPT_ATTRIBUTION") && parsed.worldConcepts.length === 0) throw new ContractValidationError("$.worldConcepts", "event-time World evidence is required for concept attribution");
  if (parsed.independenceEligible && parsed.journeyId === null) throw new ContractValidationError("$.independenceEligible", "unresolved journey cannot create independence");
  if (parsed.eventType === "EXPLICIT_SATISFACTION" && (parsed.explicitOutcome !== "POSITIVE" || parsed.direction !== "POSITIVE" || !parsed.experienceConfirmed)) throw new ContractValidationError("$.explicitOutcome", "positive satisfaction requires a qualified explicit outcome");
  if (parsed.eventType === "EXPLICIT_DISSATISFACTION" && (parsed.explicitOutcome !== "NEGATIVE" || parsed.direction !== "NEGATIVE" || !parsed.experienceConfirmed)) throw new ContractValidationError("$.explicitOutcome", "negative satisfaction requires a qualified explicit outcome");
  if (!["EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION"].includes(parsed.eventType) && parsed.explicitOutcome !== "NONE") throw new ContractValidationError("$.explicitOutcome", "event cannot self-declare satisfaction");
  for (const concept of parsed.worldConcepts) {
    if (concept.registryVersion !== CALIBRATION_CONCEPT_REGISTRY_VERSION || !(CALIBRATION_CONCEPT_IDS as readonly string[]).includes(concept.conceptId)) throw new ContractValidationError("$.worldConcepts", "concept is not bound to the accepted synthetic registry");
  }
  if (contentHash(withoutHash(parsed.sourceBinding as unknown as Record<string, unknown>, "bindingHash")) !== parsed.sourceBinding.bindingHash || parsed.sourceBinding.phase2EventHash !== parsed.eventHash || parsed.sourceBinding.phase2ChainHash !== parsed.chainHash || parsed.sourceBinding.phase2ChainId !== parsed.chainId) throw new ContractValidationError("$.sourceBinding", "Phase 2 adapter binding is invalid");
  if (parsed.eventType === "CORRECTION" && (parsed.correctionTarget === null || parsed.sourceBinding.correctionResolutionHash === null)) throw new ContractValidationError("$.correctionTarget", "correction requires authoritative Phase 2 ledger target");
  if (parsed.eventType !== "CORRECTION" && parsed.correctionTarget !== null) throw new ContractValidationError("$.correctionTarget", "non-correction cannot carry a correction target");
  const anchor = CalibrationEvidenceTrustAnchorSchema.parse(trust.getAcceptedEvidenceAnchor(parsed.recordId));
  if (contentHash(withoutHash(anchor as unknown as Record<string, unknown>, "anchorHash")) !== anchor.anchorHash || anchor.acceptedRecordId !== parsed.recordId || anchor.acceptedRecordHash !== parsed.recordHash || anchor.subjectBindingHash !== parsed.subjectBindingHash || anchor.acceptedSourceBindingHash !== parsed.sourceBinding.bindingHash || anchor.acceptedPhase2StateHash !== parsed.sourceBinding.phase2StateHash || anchor.acceptedPhase2ChainHash !== parsed.chainHash || anchor.acceptedPhase2EventHash !== parsed.eventHash) throw new ContractValidationError("$.evidenceTrustAnchor", "evidence is not independently accepted by the evaluation authority");
  return parsed;
}

export const CalibrationScenarioSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.calibrationScenario), scenarioId: identifier, title: identifier, subjectBindingHash: schema.nullable(sha256), lifecycle: schema.enum(["ACTIVE", "NO_CONSENT", "WITHDRAWN", "RESET", "ERASED"] as const), killSwitch: schema.boolean(), interpretedAt: timestamp, evidence: schema.array(CalibrationEvidenceSchema, { max: 4096 }), scenarioHash: sha256 });
export type CalibrationScenario = Infer<typeof CalibrationScenarioSchema>;
export const withCalibrationScenarioHash = (value: Omit<CalibrationScenario, "scenarioHash">): CalibrationScenario => CalibrationScenarioSchema.parse({ ...value, scenarioHash: contentHash(value) });

const SUFFICIENCY_STATES = ["NOTHING_KNOWN", "INSUFFICIENT_INDEPENDENCE", "INSUFFICIENT_DIVERSITY", "FIRST_HINTS", "REPEATED_ONE_SIDED", "MIXED_NON_CONFLICTING", "CONFLICTING", "LIMITED_CALIBRATION_ONLY"] as const;
const SufficiencyMetricsSchema = schema.object({ evidenceQuantity: count, evidenceDiversity: count, independentExperienceCount: count, conceptCoverage: count, contextCoverage: count, positiveCount: count, negativeCount: count, directionState: schema.enum(["NO_DIRECTED_EVIDENCE", "POSITIVE_ONLY", "NEGATIVE_ONLY", "POSITIVE_AND_NEGATIVE"] as const), semanticConflict: schema.boolean(), diversitySufficient: schema.boolean(), independenceSufficient: schema.boolean(), attributionCertainty: schema.enum(["UNKNOWN", "LOW", "MIXED", "HIGH"] as const), worldRelevantEvidenceCount: count, worldKnowledgeCertainty: schema.enum(["NOT_APPLICABLE", "UNKNOWN", "CONFLICTING", "PARTIAL", "SUPPORTED"] as const), state: schema.enum(SUFFICIENCY_STATES) });
export const CalibrationSemanticTargetSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.calibrationSemanticTarget), entityType: schema.enum(["CONCEPT", "DIRECT_SPOT", "PRACTICAL_PREFERENCE", "EXPLORATION_FAMILIARITY"] as const), targetKey: identifier, registryVersion: schema.nullable(identifier), contextScope: schema.enum(["UNSCOPED", "CONTEXT_BOUND"] as const), contextHash: schema.nullable(sha256), attributionScope: schema.literal("CANONICAL_TARGET"), targetHash: sha256 });
const CalibrationInterpretationSchema = schema.object({ interpretationId: identifier, evidenceRecordId: identifier, evidenceRecordHash: sha256, chainHash: sha256, policyHash: sha256, sourceEventType: schema.enum(CALIBRATION_EVENT_TYPES), dimension: schema.enum(CALIBRATION_MODEL_DIMENSIONS), key: identifier, semanticTarget: CalibrationSemanticTargetSchema, direction: schema.enum(["POSITIVE", "NEGATIVE", "UNKNOWN"] as const), evidenceBand: schema.enum(["OBSERVATIONAL", "CONDITIONAL", "EXPLICIT"] as const), attributionUnitId: identifier, independenceUnit: schema.nullable(identifier), contextHash: schema.nullable(sha256), calibrationProjectionEligible: schema.boolean(), limitations: schema.array(identifier, { min: 1, max: 16 }), interpretationHash: sha256 });
const ConflictInterpretationReferenceSchema = schema.object({ interpretationId: identifier, interpretationHash: sha256, evidenceRecordId: identifier, evidenceRecordHash: sha256, semanticTargetHash: sha256 });
export const CalibrationConflictRecordSchema = schema.object({ contractVersion: schema.literal(CONTRACT_VERSIONS.calibrationConflictRecord), conflictId: identifier, subjectBindingHash: sha256, policyHash: sha256, semanticTargets: schema.array(CalibrationSemanticTargetSchema, { min: 1, max: 32 }), contextScope: schema.enum(["UNSCOPED", "CONTEXT_BOUND", "MULTIPLE"] as const), dimensions: schema.array(schema.enum(CALIBRATION_MODEL_DIMENSIONS), { min: 1, max: 7 }), positiveInterpretations: schema.array(ConflictInterpretationReferenceSchema, { min: 1, max: 4096 }), negativeInterpretations: schema.array(ConflictInterpretationReferenceSchema, { min: 1, max: 4096 }), classification: schema.enum(["SEMANTIC_CONFLICT", "MIXED_NON_CONFLICTING"] as const), resolution: schema.literal("UNRESOLVED"), limitations: schema.array(identifier, { min: 1, max: 16 }), conflictHash: sha256 });
const CalibrationProjectionSchema = schema.object({ mode: schema.literal("CALIBRATION_ONLY"), productionAuthorized: schema.literal(false), eligibilityAuthority: schema.literal(false), rankingAuthority: schema.literal(false), policyHash: sha256, items: schema.array(schema.object({ dimension: schema.enum(CALIBRATION_MODEL_DIMENSIONS), key: identifier, direction: schema.enum(["POSITIVE", "NEGATIVE", "UNKNOWN"] as const), sufficiency: schema.enum(SUFFICIENCY_STATES), uncertaintyPreserved: schema.literal(true) }), { max: 256 }), withheldConflictIds: schema.array(identifier, { max: 256 }), limitations: schema.array(identifier, { min: 1, max: 16 }), projectionHash: sha256 });
const PolicyResultSchema = schema.object({ policyId: identifier, policyVersion: identifier, policyHash: sha256, status: schema.enum(["ACTIVE_CALIBRATION", "NEUTRAL"] as const), neutralReason: schema.nullable(schema.enum(["NO_CONSENT", "WITHDRAWN", "RESET", "ERASED", "KILL_SWITCH", "NO_EVIDENCE"] as const)), calibrationBasis: schema.object({ conceptRegistry: schema.object({ registryVersion: schema.literal(CALIBRATION_CONCEPT_REGISTRY_VERSION), registryHash: schema.literal(CALIBRATION_CONCEPT_REGISTRY_HASH) }), attributionStrategy: schema.enum(["EXPLICIT_OUTCOME_COMPETING_CONCEPTS", "OUTCOME_AND_SPOT_SEPARATE", "CONTEXT_FIRST_COMPETING_CONCEPTS"] as const), independenceStrategy: schema.literal("ONE_UNIT_PER_SERVER_RESOLVED_JOURNEY"), conflictStrategy: schema.literal("PRESERVE_POSITIVE_AND_NEGATIVE"), temporalStrategy: schema.object({ strategy: schema.enum(["NO_TEMPORAL_INFERENCE", "FIXTURE_RECENCY_SEPARATION", "FIXTURE_CONTEXT_RECENCY_SEPARATION"] as const), fixtureCutoff: schema.nullable(timestamp), decay: schema.literal("NOT_CONFIGURED") }), explorationStrategy: schema.enum(["NOT_CONFIGURED", "VERIFIED_REPEAT_FAMILIARITY_ONLY", "RESEARCH_CONTEXT_FLIP_AND_ALTERNATIVE"] as const), syntheticThresholds: SyntheticThresholdSchema }), usedEvidenceRecordIds: schema.array(identifier, { max: 4096 }), ignoredEvidence: schema.array(schema.object({ recordId: identifier, reason: identifier }), { max: 4096 }), interpretations: schema.array(CalibrationInterpretationSchema, { max: 4096 }), conflictsAndAmbivalences: schema.array(CalibrationConflictRecordSchema, { max: 256 }), sufficiency: SufficiencyMetricsSchema, domainSufficiency: schema.array(schema.object({ dimension: schema.enum(CALIBRATION_MODEL_DIMENSIONS), state: schema.enum(SUFFICIENCY_STATES), independentUnits: count, evidenceDiversity: count, conceptCoverage: count, contextCoverage: count, directionState: schema.enum(["NO_DIRECTED_EVIDENCE", "POSITIVE_ONLY", "NEGATIVE_ONLY", "POSITIVE_AND_NEGATIVE"] as const), conflict: schema.boolean() }), { max: 7 }), calibrationProjection: CalibrationProjectionSchema, resultHash: sha256 });
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
  const correctionTargets = verified.filter(({ eventType }) => eventType === "CORRECTION").map(({ correctionTarget }) => correctionTarget!.recordId);
  if (new Set(correctionTargets).size !== correctionTargets.length) throw new ContractValidationError("$.evidence", "duplicate correction target");
  for (const correction of verified.filter(({ eventType }) => eventType === "CORRECTION")) {
    const target = recordsById.get(correction.correctionTarget!.recordId);
    if (!target || target.eventType === "CORRECTION") throw new ContractValidationError("$.evidence", "correction target is missing or invalid");
    if (target.subjectBindingHash !== correction.subjectBindingHash || target.spotId !== correction.spotId || target.journeyId !== correction.journeyId) throw new ContractValidationError("$.evidence", "cross-user, cross-spot or cross-journey correction is forbidden");
    if (target.recordHash !== correction.correctionTarget!.recordHash || target.eventHash !== correction.correctionTarget!.eventHash || target.chainHash !== correction.correctionTarget!.chainHash) throw new ContractValidationError("$.evidence", "correction target hashes differ from the canonical Phase 2 target");
    if (Date.parse(correction.occurredAt) <= Date.parse(target.occurredAt)) throw new ContractValidationError("$.evidence", "correction must occur after its target");
  }
  const correctedTargets = new Set(verified.filter(({ eventType, active }) => eventType === "CORRECTION" && active).map(({ correctionTarget }) => correctionTarget!.recordId));
  const seenEvents = new Set<string>(); const seenRetries = new Set<string>(); const active: CalibrationEvidence[] = []; const ignored: { recordId: string; reason: string }[] = [];
  for (const evidence of [...verified].sort((a, b) => a.recordId.localeCompare(b.recordId))) {
    if (!evidence.active || correctedTargets.has(evidence.recordId)) { ignored.push({ recordId: evidence.recordId, reason: "CORRECTED_OR_INACTIVE" }); continue; }
    if (evidence.eventType === "CORRECTION") { active.push(evidence); continue; }
    if (seenEvents.has(evidence.eventHash) || (evidence.retryOfRecordId !== null && (seenRetries.has(evidence.retryOfRecordId) || recordIds.includes(evidence.retryOfRecordId)))) { ignored.push({ recordId: evidence.recordId, reason: "TECHNICAL_DUPLICATE" }); continue; }
    seenEvents.add(evidence.eventHash); if (evidence.retryOfRecordId) seenRetries.add(evidence.retryOfRecordId); active.push(evidence);
  }
  return { active, ignored };
}

type CalibrationSemanticTarget = Infer<typeof CalibrationSemanticTargetSchema>;
type CalibrationConflictRecord = Infer<typeof CalibrationConflictRecordSchema>;
type SufficiencyState = Infer<typeof SufficiencyMetricsSchema>["state"];
type DirectionState = Infer<typeof SufficiencyMetricsSchema>["directionState"];

function semanticTarget(rawKey: string, contextHash: string | null): CalibrationSemanticTarget {
  const entityType = rawKey.startsWith("concept:") ? "CONCEPT" as const
    : rawKey.startsWith("spot:") ? "DIRECT_SPOT" as const
    : rawKey.startsWith("practical:") ? "PRACTICAL_PREFERENCE" as const
    : "EXPLORATION_FAMILIARITY" as const;
  const targetKey = rawKey;
  const body = {
    contractVersion: CONTRACT_VERSIONS.calibrationSemanticTarget,
    entityType,
    targetKey,
    registryVersion: entityType === "CONCEPT" ? CALIBRATION_CONCEPT_REGISTRY_VERSION : null,
    contextScope: contextHash === null ? "UNSCOPED" as const : "CONTEXT_BOUND" as const,
    contextHash,
    attributionScope: "CANONICAL_TARGET" as const,
  };
  return CalibrationSemanticTargetSchema.parse({ ...body, targetHash: contentHash(body) });
}

function interpretationReference(item: CalibrationInterpretation) {
  return { interpretationId: item.interpretationId, interpretationHash: item.interpretationHash, evidenceRecordId: item.evidenceRecordId, evidenceRecordHash: item.evidenceRecordHash, semanticTargetHash: item.semanticTarget.targetHash };
}

function buildConflictsAndAmbivalences(interpretations: readonly CalibrationInterpretation[], subjectBindingHash: string | null, policyHash: string): CalibrationConflictRecord[] {
  if (subjectBindingHash === null) return [];
  const positive = interpretations.filter(({ direction }) => direction === "POSITIVE");
  const negative = interpretations.filter(({ direction }) => direction === "NEGATIVE");
  if (positive.length === 0 || negative.length === 0) return [];
  const byTarget = new Map<string, CalibrationInterpretation[]>();
  for (const item of [...positive, ...negative]) {
    const rows = byTarget.get(item.semanticTarget.targetHash) ?? [];
    rows.push(item); byTarget.set(item.semanticTarget.targetHash, rows);
  }
  const conflicts: CalibrationConflictRecord[] = [];
  for (const [targetHash, rows] of [...byTarget.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const positiveRows = rows.filter(({ direction }) => direction === "POSITIVE");
    const negativeRows = rows.filter(({ direction }) => direction === "NEGATIVE");
    if (positiveRows.length === 0 || negativeRows.length === 0) continue;
    const target = rows[0]!.semanticTarget;
    const body = {
      contractVersion: CONTRACT_VERSIONS.calibrationConflictRecord,
      conflictId: `semantic-conflict-${contentHash({ subjectBindingHash, policyHash, targetHash })}`,
      subjectBindingHash, policyHash, semanticTargets: [target], contextScope: target.contextScope,
      dimensions: uniqueSorted(rows.map(({ dimension }) => dimension)),
      positiveInterpretations: positiveRows.map(interpretationReference).sort((a, b) => a.interpretationId.localeCompare(b.interpretationId)),
      negativeInterpretations: negativeRows.map(interpretationReference).sort((a, b) => a.interpretationId.localeCompare(b.interpretationId)),
      classification: "SEMANTIC_CONFLICT" as const, resolution: "UNRESOLVED" as const,
      limitations: ["UNRESOLVED_NO_DIRECTION_WINS", "CALIBRATION_ONLY", "NO_RANKING_OR_ELIGIBILITY_AUTHORITY"],
    };
    conflicts.push(CalibrationConflictRecordSchema.parse({ ...body, conflictHash: contentHash(body) }));
  }
  if (conflicts.length > 0) return conflicts;
  const targets = [...new Map([...positive, ...negative].map((item) => [item.semanticTarget.targetHash, item.semanticTarget])).values()].sort((a, b) => a.targetHash.localeCompare(b.targetHash));
  const scopes = new Set(targets.map(({ contextScope, contextHash }) => `${contextScope}:${contextHash ?? "none"}`));
  const contextScope = scopes.size === 1 ? targets[0]!.contextScope : "MULTIPLE" as const;
  const body = {
    contractVersion: CONTRACT_VERSIONS.calibrationConflictRecord,
    conflictId: `mixed-non-conflicting-${contentHash({ subjectBindingHash, policyHash, targetHashes: targets.map(({ targetHash }) => targetHash) })}`,
    subjectBindingHash, policyHash, semanticTargets: targets, contextScope,
    dimensions: uniqueSorted([...positive, ...negative].map(({ dimension }) => dimension)),
    positiveInterpretations: positive.map(interpretationReference).sort((a, b) => a.interpretationId.localeCompare(b.interpretationId)),
    negativeInterpretations: negative.map(interpretationReference).sort((a, b) => a.interpretationId.localeCompare(b.interpretationId)),
    classification: "MIXED_NON_CONFLICTING" as const, resolution: "UNRESOLVED" as const,
    limitations: ["DIRECTIONS_DESCRIBE_DISTINCT_SEMANTIC_TARGETS", "CALIBRATION_ONLY", "NO_RANKING_OR_ELIGIBILITY_AUTHORITY"],
  };
  return [CalibrationConflictRecordSchema.parse({ ...body, conflictHash: contentHash(body) })];
}

function selectSufficiencyState(input: { interpretationCount: number; directionState: DirectionState; semanticConflict: boolean; independenceSufficient: boolean; diversitySufficient: boolean; independentUnits: number; policy: CalibrationPolicy }): SufficiencyState {
  if (input.interpretationCount === 0) return "NOTHING_KNOWN";
  if (input.semanticConflict) return "CONFLICTING";
  if (input.directionState === "POSITIVE_AND_NEGATIVE") return "MIXED_NON_CONFLICTING";
  if (!input.independenceSufficient) return "INSUFFICIENT_INDEPENDENCE";
  if (!input.diversitySufficient) return "INSUFFICIENT_DIVERSITY";
  if (input.independentUnits >= input.policy.sufficiencyStrategy.limitedProjectionIndependentUnits) return "LIMITED_CALIBRATION_ONLY";
  if (["POSITIVE_ONLY", "NEGATIVE_ONLY"].includes(input.directionState) && input.independentUnits > input.policy.sufficiencyStrategy.firstHintsIndependentUnits) return "REPEATED_ONE_SIDED";
  return "FIRST_HINTS";
}

function assertSufficiencyState(directionState: DirectionState, semanticConflict: boolean, state: SufficiencyState, path: string): void {
  if (state === "REPEATED_ONE_SIDED" && !["POSITIVE_ONLY", "NEGATIVE_ONLY"].includes(directionState)) throw new ContractValidationError(path, "REPEATED_ONE_SIDED requires exactly one directed evidence side");
  if (directionState === "POSITIVE_AND_NEGATIVE" && !["MIXED_NON_CONFLICTING", "CONFLICTING"].includes(state)) throw new ContractValidationError(path, "positive and negative evidence must be mixed or conflicting");
  if (state === "MIXED_NON_CONFLICTING" && (directionState !== "POSITIVE_AND_NEGATIVE" || semanticConflict)) throw new ContractValidationError(path, "mixed non-conflicting state is inconsistent");
  if (state === "CONFLICTING" && !semanticConflict) throw new ContractValidationError(path, "conflicting state requires a semantic conflict");
}

function sufficiency(interpretations: readonly CalibrationInterpretation[], used: readonly CalibrationEvidence[], policy: CalibrationPolicy, conflicts: readonly CalibrationConflictRecord[]): Infer<typeof SufficiencyMetricsSchema> {
  const units = uniqueSorted(interpretations.flatMap((item) => item.independenceUnit ? [item.independenceUnit] : []));
  const concepts = uniqueSorted(interpretations.filter(({ key }) => key.startsWith("concept:")) .map(({ key }) => key));
  const contexts = uniqueSorted(interpretations.flatMap(({ contextHash }) => contextHash ? [contextHash] : []));
  const positiveCount = interpretations.filter(({ direction }) => direction === "POSITIVE").length;
  const negativeCount = interpretations.filter(({ direction }) => direction === "NEGATIVE").length;
  const directionState = positiveCount > 0 && negativeCount > 0 ? "POSITIVE_AND_NEGATIVE" as const : positiveCount > 0 ? "POSITIVE_ONLY" as const : negativeCount > 0 ? "NEGATIVE_ONLY" as const : "NO_DIRECTED_EVIDENCE" as const;
  const semanticConflict = conflicts.some(({ classification }) => classification === "SEMANTIC_CONFLICT");
  const diversity = new Set(used.map(({ eventType }) => eventType)).size;
  const worldRelevant = used.filter(({ worldConcepts }) => worldConcepts.length > 0);
  const conflictingWorld = worldRelevant.some(({ worldConcepts }) => worldConcepts.some(({ certainty }) => certainty === "CONFLICTING"));
  const certainWorldRecords = worldRelevant.filter(({ worldConcepts }) => worldConcepts.some(({ certainty }) => certainty === "VERIFIED" || certainty === "SUPPORTED")).length;
  const diversitySufficient = diversity >= policy.sufficiencyStrategy.minimumEvidenceDiversity;
  const independenceSufficient = units.length >= policy.sufficiencyStrategy.firstHintsIndependentUnits;
  const state = selectSufficiencyState({ interpretationCount: interpretations.length, directionState, semanticConflict, independenceSufficient, diversitySufficient, independentUnits: units.length, policy });
  assertSufficiencyState(directionState, semanticConflict, state, "$.sufficiency.state");
  return { evidenceQuantity: used.length, evidenceDiversity: diversity, independentExperienceCount: units.length, conceptCoverage: concepts.length, contextCoverage: contexts.length, positiveCount, negativeCount, directionState, semanticConflict, diversitySufficient, independenceSufficient, attributionCertainty: concepts.length === 0 ? "UNKNOWN" : conflictingWorld ? "LOW" : concepts.length > units.length ? "MIXED" : "HIGH", worldRelevantEvidenceCount: worldRelevant.length, worldKnowledgeCertainty: worldRelevant.length === 0 ? "NOT_APPLICABLE" : conflictingWorld ? "CONFLICTING" : certainWorldRecords === 0 ? "UNKNOWN" : certainWorldRecords < worldRelevant.length ? "PARTIAL" : "SUPPORTED", state };
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
    if (rule.requiresCertainWorldAttribution && (certainConcepts.length === 0 || uncertainConcepts.length > 0)) { used.pop(); ignored.push({ recordId: evidence.recordId, reason: "CERTAIN_WORLD_ATTRIBUTION_REQUIRED" }); continue; }
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
      const target = semanticTarget(rawKey, evidence.context?.contextHash ?? null);
      const body = { interpretationId: `calibration-interpretation-${contentHash({ policyHash: verifiedPolicy.policyHash, recordHash: evidence.recordHash, key })}`, evidenceRecordId: evidence.recordId, evidenceRecordHash: evidence.recordHash, chainHash: evidence.chainHash, policyHash: verifiedPolicy.policyHash, sourceEventType: evidence.eventType, dimension: rule.dimension, key, semanticTarget: target, direction, evidenceBand: rule.evidenceBand === "NONE" ? "OBSERVATIONAL" as const : rule.evidenceBand, attributionUnitId, independenceUnit: evidence.independenceEligible ? journeyKey : null, contextHash: evidence.context?.contextHash ?? null, calibrationProjectionEligible: rule.calibrationProjectionEligible, limitations: uniqueSorted([...rule.limitations, ...(keys.length > 1 ? ["MULTI_CONCEPT_ONE_EXPERIENCE_UNIT"] : []), ...(uncertainConcepts.length ? ["WORLD_ATTRIBUTION_UNCERTAINTY_NON_PROJECTABLE"] : []), ...(semantics.status === "RESEARCH_ONLY" ? ["RESEARCH_ONLY_NOT_PROJECTABLE"] : [])]) };
      interpretations.push(CalibrationInterpretationSchema.parse({ ...body, interpretationHash: contentHash(body) }));
    }
  }
  const conflictsAndAmbivalences = buildConflictsAndAmbivalences(interpretations, scenario.subjectBindingHash, verifiedPolicy.policyHash);
  const metrics = sufficiency(interpretations, used, verifiedPolicy, conflictsAndAmbivalences);
  const grouped = new Map<string, CalibrationInterpretation[]>();
  for (const item of interpretations) { const key = `${item.dimension}|${item.key}|${item.contextHash ?? "none"}`; const group = grouped.get(key) ?? []; group.push(item); grouped.set(key, group); }
  const domainSufficiency = CALIBRATION_MODEL_DIMENSIONS.map((dimension) => {
    const rows = interpretations.filter((item) => item.dimension === dimension); const units = uniqueSorted(rows.flatMap((item) => item.independenceUnit ? [item.independenceUnit] : []));
    const directions = new Set(rows.filter(({ direction }) => direction !== "UNKNOWN").map(({ direction }) => direction)); const directionState = directions.size === 0 ? "NO_DIRECTED_EVIDENCE" as const : directions.size === 2 ? "POSITIVE_AND_NEGATIVE" as const : directions.has("POSITIVE") ? "POSITIVE_ONLY" as const : "NEGATIVE_ONLY" as const;
    const conflict = conflictsAndAmbivalences.some(({ classification, dimensions }) => classification === "SEMANTIC_CONFLICT" && dimensions.includes(dimension)); const evidenceRows = used.filter(({ recordId }) => rows.some(({ evidenceRecordId }) => evidenceRecordId === recordId));
    const evidenceDiversity = new Set(evidenceRows.map(({ eventType }) => eventType)).size; const conceptCoverage = new Set(rows.filter(({ key }) => key.startsWith("concept:")).map(({ key }) => key)).size; const contextCoverage = new Set(rows.flatMap(({ contextHash }) => contextHash ? [contextHash] : [])).size;
    const enoughIndependence = units.length >= verifiedPolicy.sufficiencyStrategy.firstHintsIndependentUnits; const enoughDiversity = evidenceDiversity >= verifiedPolicy.sufficiencyStrategy.minimumEvidenceDiversity;
    const state = selectSufficiencyState({ interpretationCount: rows.length, directionState, semanticConflict: conflict, independenceSufficient: enoughIndependence, diversitySufficient: enoughDiversity, independentUnits: units.length, policy: verifiedPolicy });
    assertSufficiencyState(directionState, conflict, state, `$.domainSufficiency.${dimension}.state`);
    return { dimension, state, independentUnits: units.length, evidenceDiversity, conceptCoverage, contextCoverage, directionState, conflict };
  });
  const conflictedTargetHashes = new Set(conflictsAndAmbivalences.filter(({ classification }) => classification === "SEMANTIC_CONFLICT").flatMap(({ semanticTargets }) => semanticTargets.map(({ targetHash }) => targetHash)));
  const projectionItems = [...grouped.values()].filter((rows) => {
    const first = rows[0]!; const semantics = signalSemantics(first.sourceEventType); const ds = domainSufficiency.find(({ dimension }) => dimension === first.dimension)!;
    return !rows.some(({ semanticTarget: { targetHash } }) => conflictedTargetHashes.has(targetHash)) && rows.every(({ calibrationProjectionEligible, limitations }) => calibrationProjectionEligible && !limitations.includes("RESEARCH_ONLY_NOT_PROJECTABLE") && !limitations.includes("WORLD_ATTRIBUTION_UNCERTAINTY_NON_PROJECTABLE")) && semantics.status === "CONFIGURED" && semantics.decisionProjection !== "NEVER" && !["NOTHING_KNOWN", "INSUFFICIENT_INDEPENDENCE", "INSUFFICIENT_DIVERSITY"].includes(ds.state);
  }).map((rows) => { const positive = rows.some(({ direction }) => direction === "POSITIVE"); const negative = rows.some(({ direction }) => direction === "NEGATIVE"); const ds = domainSufficiency.find(({ dimension }) => dimension === rows[0]!.dimension)!; return { dimension: rows[0]!.dimension, key: rows[0]!.key, direction: positive && negative ? "UNKNOWN" as const : positive ? "POSITIVE" as const : negative ? "NEGATIVE" as const : "UNKNOWN" as const, sufficiency: ds.state, uncertaintyPreserved: true as const }; });
  const withheldConflictIds = conflictsAndAmbivalences.filter(({ classification }) => classification === "SEMANTIC_CONFLICT").map(({ conflictId }) => conflictId).sort();
  const projectionBody = { mode: "CALIBRATION_ONLY" as const, productionAuthorized: false as const, eligibilityAuthority: false as const, rankingAuthority: false as const, policyHash: verifiedPolicy.policyHash, items: projectionItems.sort((a, b) => `${a.dimension}|${a.key}`.localeCompare(`${b.dimension}|${b.key}`)), withheldConflictIds, limitations: ["CALIBRATION_ONLY", "NO_PRODUCTION_POLICY", "NO_RANKING_OR_ELIGIBILITY_AUTHORITY", ...(withheldConflictIds.length > 0 ? ["UNRESOLVED_CONFLICT_TARGETS_WITHHELD"] : [])] };
  const calibrationProjection = CalibrationProjectionSchema.parse({ ...projectionBody, projectionHash: contentHash(projectionBody) });
  const neutralReason = suppressedReason ?? (scenario.evidence.length === 0 ? "NO_EVIDENCE" as const : null);
  const body = { policyId: verifiedPolicy.policyId, policyVersion: verifiedPolicy.policyVersion, policyHash: verifiedPolicy.policyHash, status: neutralReason ? "NEUTRAL" as const : "ACTIVE_CALIBRATION" as const, neutralReason, calibrationBasis: { conceptRegistry: { registryVersion: verifiedPolicy.conceptRegistry.registryVersion, registryHash: verifiedPolicy.conceptRegistry.registryHash }, attributionStrategy: verifiedPolicy.attributionStrategy, independenceStrategy: verifiedPolicy.independenceStrategy, conflictStrategy: verifiedPolicy.conflictStrategy, temporalStrategy: verifiedPolicy.temporalStrategy, explorationStrategy: verifiedPolicy.explorationStrategy, syntheticThresholds: verifiedPolicy.sufficiencyStrategy }, usedEvidenceRecordIds: used.map(({ recordId }) => recordId).sort(), ignoredEvidence: ignored.sort((a, b) => a.recordId.localeCompare(b.recordId)), interpretations: interpretations.sort((a, b) => a.interpretationId.localeCompare(b.interpretationId)), conflictsAndAmbivalences, sufficiency: metrics, domainSufficiency, calibrationProjection };
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

function verifySemanticIntegrity(result: PolicyResult, subjectBindingHash: string | null): void {
  const interpretationIds = new Set<string>();
  for (const interpretation of result.interpretations) {
    if (interpretationIds.has(interpretation.interpretationId)) throw new ContractValidationError("$.interpretations", "duplicate interpretation identity");
    interpretationIds.add(interpretation.interpretationId);
    if (contentHash(withoutHash(interpretation.semanticTarget as unknown as Record<string, unknown>, "targetHash")) !== interpretation.semanticTarget.targetHash) throw new ContractValidationError("$.interpretations.semanticTarget.targetHash", "semantic target hash mismatch");
    if (interpretation.semanticTarget.entityType === "CONCEPT" && interpretation.semanticTarget.registryVersion !== CALIBRATION_CONCEPT_REGISTRY_VERSION) throw new ContractValidationError("$.interpretations.semanticTarget.registryVersion", "concept target registry mismatch");
    if ((interpretation.semanticTarget.contextHash === null) !== (interpretation.semanticTarget.contextScope === "UNSCOPED")) throw new ContractValidationError("$.interpretations.semanticTarget.contextScope", "semantic target context scope mismatch");
  }
  const expectedConflicts = buildConflictsAndAmbivalences(result.interpretations, subjectBindingHash, result.policyHash);
  if (!same(result.conflictsAndAmbivalences, expectedConflicts)) throw new ContractValidationError("$.conflictsAndAmbivalences", "conflict and ambivalence records do not reconstruct from active interpretations");
  for (const conflict of result.conflictsAndAmbivalences) {
    if (contentHash(withoutHash(conflict as unknown as Record<string, unknown>, "conflictHash")) !== conflict.conflictHash) throw new ContractValidationError("$.conflictsAndAmbivalences.conflictHash", "conflict record hash mismatch");
  }
  assertSufficiencyState(result.sufficiency.directionState, result.sufficiency.semanticConflict, result.sufficiency.state, "$.sufficiency.state");
  for (const domain of result.domainSufficiency) assertSufficiencyState(domain.directionState, domain.conflict, domain.state, `$.domainSufficiency.${domain.dimension}.state`);
  const expectedWithheld = result.conflictsAndAmbivalences.filter(({ classification }) => classification === "SEMANTIC_CONFLICT").map(({ conflictId }) => conflictId).sort();
  if (!same(result.calibrationProjection.withheldConflictIds, expectedWithheld)) throw new ContractValidationError("$.calibrationProjection.withheldConflictIds", "projection conflict references are incomplete");
  const conflictedTargets = new Set(result.conflictsAndAmbivalences.filter(({ classification }) => classification === "SEMANTIC_CONFLICT").flatMap(({ semanticTargets }) => semanticTargets.map(({ targetHash }) => targetHash)));
  for (const item of result.calibrationProjection.items) {
    const sources = result.interpretations.filter((row) => row.dimension === item.dimension && row.key === item.key);
    if (sources.some(({ semanticTarget: { targetHash } }) => conflictedTargets.has(targetHash))) throw new ContractValidationError("$.calibrationProjection.items", "unresolved semantic conflict cannot emit a directed projection item");
  }
}

export function verifyCalibrationReport(value: unknown, scenario: unknown, policyTrust: CalibrationPolicyTrustContext, evidenceTrust: CalibrationEvidenceTrustContext): CalibrationReport {
  const parsed = CalibrationReportSchema.parse(value);
  const parsedScenario = parseScenario(scenario);
  if (contentHash(withoutHash(parsed as unknown as Record<string, unknown>, "reportHash")) !== parsed.reportHash) throw new ContractValidationError("$.reportHash", "calibration report hash mismatch");
  for (const result of parsed.results) {
    if (contentHash(withoutHash(result as unknown as Record<string, unknown>, "resultHash")) !== result.resultHash) throw new ContractValidationError("$.results.resultHash", "policy result hash mismatch");
    for (const interpretation of result.interpretations) if (contentHash(withoutHash(interpretation as unknown as Record<string, unknown>, "interpretationHash")) !== interpretation.interpretationHash) throw new ContractValidationError("$.interpretations.interpretationHash", "interpretation hash mismatch");
    if (contentHash(withoutHash(result.calibrationProjection as unknown as Record<string, unknown>, "projectionHash")) !== result.calibrationProjection.projectionHash) throw new ContractValidationError("$.calibrationProjection.projectionHash", "calibration projection hash mismatch");
    verifySemanticIntegrity(result, parsedScenario.subjectBindingHash);
  }
  const rebuilt = runCalibrationScenario(scenario, policyTrust, evidenceTrust);
  if (!same(parsed, rebuilt)) throw new ContractValidationError("$", "calibration report differs from authoritative deterministic replay");
  return parsed;
}

/** Explicitly synthetic convenience only. It cannot create Production authority. */
export function createSyntheticCalibrationTrustContext(evidence: readonly CalibrationEvidence[] = [], acceptedEvidenceAnchors: readonly CalibrationEvidenceTrustAnchor[] = []): CalibrationPolicyTrustContext & CalibrationEvidenceTrustContext {
  const policyAnchors = new Map(CALIBRATION_POLICY_CANDIDATES.map((candidate) => {
    const body = { contractVersion: CONTRACT_VERSIONS.calibrationPolicyTrustAnchor, anchorId: `policy-anchor-${candidate.policyId}`, acceptedPolicyId: candidate.policyId, acceptedPolicyVersion: candidate.policyVersion, acceptedPolicyHash: candidate.policyHash, acceptedRegistryHash: CANONICAL_SIGNAL_SEMANTICS_REGISTRY.registryHash, acceptedConceptRegistryHash: CALIBRATION_CONCEPT_REGISTRY_HASH, issuer: "SYNTHETIC_CALIBRATION_RELEASE_AUTHORITY" as const, environment: "SYNTHETIC_FIXTURE_ONLY" as const, productionAuthorized: false as const };
    return [candidate.policyId, withCalibrationPolicyTrustAnchorHash(body)] as const;
  }));
  const evidenceIds = new Set(evidence.map(({ recordId }) => recordId));
  const evidenceAnchors = new Map(acceptedEvidenceAnchors.map((anchor) => {
    const parsed = CalibrationEvidenceTrustAnchorSchema.parse(anchor);
    if (!evidenceIds.has(parsed.acceptedRecordId)) throw new ContractValidationError("$.acceptedEvidenceAnchors", "orphan evaluation authority anchor");
    return [parsed.acceptedRecordId, parsed] as const;
  }));
  if (evidenceAnchors.size !== evidence.length) {
    if (evidence.length > 0) throw new ContractValidationError("$.acceptedEvidenceAnchors", "every calibration record requires an independently supplied evaluation anchor");
  }
  return { getAcceptedPolicyAnchor: (policyId) => policyAnchors.get(policyId) ?? null, getAcceptedEvidenceAnchor: (recordId) => evidenceAnchors.get(recordId) ?? null };
}
