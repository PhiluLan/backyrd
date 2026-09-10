import type { CanonicalUserEvent } from "./contracts.js";
import { CONTRACT_VERSIONS } from "./contracts.js";
import { ContractValidationError } from "./schema.js";

export const SEMANTIC_EVENT_CLASSES = Object.freeze([
  "EXPOSURE", "INTERACTION", "SEARCH", "INTENT", "DECISION", "EXPERIENCE",
  "SATISFACTION", "STATE_CHANGE", "CORRECTION", "SOCIAL_OBSERVATION", "UNKNOWN",
] as const);
export type SemanticEventClass = typeof SEMANTIC_EVENT_CLASSES[number];

export const EVIDENCE_SLOTS = Object.freeze([
  "EXPOSURE", "INTERACTION", "SEARCH", "INTENT", "DECISION", "EXPERIENCE",
  "SATISFACTION", "STATE_CHANGE", "CORRECTION", "SOCIAL_OBSERVATION",
] as const);
export type EvidenceSlot = typeof EVIDENCE_SLOTS[number];

export type CatalogEventType = CanonicalUserEvent["eventType"] |
  "DWELL_OBSERVED" | "PHOTO_VIEWED" | "MAP_OPENED" | "SEARCH_RECORDED" |
  "CATEGORY_NAVIGATED" | "ALTERNATIVE_REQUESTED" | "QUICK_SKIP_OBSERVED" |
  "MOMENT_RECORDED" | "SHARE_RECORDED" | "FOLLOW_RECORDED" | "FRIEND_PROFILE_OPENED";

export interface CanonicalEventCatalogEntry {
  readonly eventType: CatalogEventType;
  readonly status: "CONFIGURED" | "NOT_CONFIGURED";
  readonly semanticClass: SemanticEventClass;
  readonly requiredServerReferences: readonly string[];
  readonly allowedAdditionalReferences: readonly string[];
  readonly sourceAuthorities: readonly CanonicalUserEvent["authority"]["kind"][];
  readonly productStateDependency: "NONE" | "SERVER_PRODUCT_TRUTH" | "VERIFIED_OUTCOME" | "NOT_CONFIGURED";
  readonly journeyRelevance: "REQUIRED" | "OPTIONAL" | "FORBIDDEN" | "NOT_CONFIGURED";
  readonly independenceRelevance: "ELIGIBLE_WHEN_SERVER_RESOLVED" | "NEVER" | "NOT_CONFIGURED";
  readonly evidenceSlots: readonly EvidenceSlot[];
  readonly forbiddenInterpretations: readonly string[];
  readonly consentPurpose: "PERSONALIZED_RECOMMENDATIONS";
  readonly lifecycleClass: string;
  readonly correctionBehavior: "APPEND_ONLY_SUPERSEDABLE" | "APPEND_ONLY_CORRECTION" | "NOT_CONFIGURED";
  readonly deduplicationBehavior: "EVENT_ID_IDEMPOTENCY_AND_SOURCE_RECORD" | "NOT_CONFIGURED";
}

const configured = (
  eventType: CanonicalUserEvent["eventType"], semanticClass: SemanticEventClass,
  values: Omit<CanonicalEventCatalogEntry, "eventType" | "status" | "semanticClass" | "consentPurpose" | "correctionBehavior" | "deduplicationBehavior"> &
    { readonly correctionBehavior?: CanonicalEventCatalogEntry["correctionBehavior"] },
): CanonicalEventCatalogEntry => Object.freeze({
  eventType, status: "CONFIGURED", semanticClass, consentPurpose: "PERSONALIZED_RECOMMENDATIONS",
  correctionBehavior: values.correctionBehavior ?? "APPEND_ONLY_SUPERSEDABLE",
  deduplicationBehavior: "EVENT_ID_IDEMPOTENCY_AND_SOURCE_RECORD", ...values,
});

const unknown = (eventType: CatalogEventType, semanticClass: SemanticEventClass, forbiddenInterpretations: readonly string[]): CanonicalEventCatalogEntry => Object.freeze({
  eventType, status: "NOT_CONFIGURED", semanticClass, requiredServerReferences: [], allowedAdditionalReferences: [], sourceAuthorities: [],
  productStateDependency: "NOT_CONFIGURED", journeyRelevance: "NOT_CONFIGURED", independenceRelevance: "NOT_CONFIGURED", evidenceSlots: [],
  forbiddenInterpretations, consentPurpose: "PERSONALIZED_RECOMMENDATIONS", lifecycleClass: "UNRESOLVED_PRIVACY_POLICY",
  correctionBehavior: "NOT_CONFIGURED", deduplicationBehavior: "NOT_CONFIGURED",
});

export const CANONICAL_EVENT_CATALOG_VERSION = CONTRACT_VERSIONS.canonicalEventCatalog;
export const CANONICAL_EVENT_CATALOG: Readonly<Record<CatalogEventType, CanonicalEventCatalogEntry>> = Object.freeze({
  DECISION_REQUESTED: configured("DECISION_REQUESTED", "DECISION", { requiredServerReferences: ["decisionId"], allowedAdditionalReferences: ["sessionId"], sourceAuthorities: ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], productStateDependency: "SERVER_PRODUCT_TRUTH", journeyRelevance: "OPTIONAL", independenceRelevance: "NEVER", evidenceSlots: ["DECISION"], forbiddenInterpretations: ["CURRENT_CONTEXT_IS_LONG_TERM_TASTE", "DECISION_REQUEST_IS_PREFERENCE"], lifecycleClass: "UNRESOLVED_PRIVACY_POLICY" }),
  CANDIDATE_EXPOSED: configured("CANDIDATE_EXPOSED", "EXPOSURE", { requiredServerReferences: ["decisionId", "spotId", "candidateId"], allowedAdditionalReferences: ["sessionId"], sourceAuthorities: ["CLIENT_OBSERVATION"], productStateDependency: "SERVER_PRODUCT_TRUTH", journeyRelevance: "REQUIRED", independenceRelevance: "NEVER", evidenceSlots: ["EXPOSURE"], forbiddenInterpretations: ["EXPOSURE_IS_INTEREST", "MISSING_ACTION_IS_DISLIKE", "RANK_IS_TASTE"], lifecycleClass: "UNRESOLVED_PRIVACY_POLICY" }),
  SPOT_OPENED: configured("SPOT_OPENED", "INTERACTION", { requiredServerReferences: ["spotId"], allowedAdditionalReferences: ["sessionId", "decisionId", "candidateId"], sourceAuthorities: ["CLIENT_OBSERVATION", "AUTHENTICATED_USER_ACTION"], productStateDependency: "SERVER_PRODUCT_TRUTH", journeyRelevance: "REQUIRED", independenceRelevance: "NEVER", evidenceSlots: ["INTERACTION"], forbiddenInterpretations: ["OPEN_IS_POSITIVE_PREFERENCE", "OPEN_IS_EXPERIENCE", "OPEN_IS_SATISFACTION"], lifecycleClass: "UNRESOLVED_PRIVACY_POLICY" }),
  SAVED: configured("SAVED", "STATE_CHANGE", { requiredServerReferences: ["spotId"], allowedAdditionalReferences: ["sessionId", "decisionId"], sourceAuthorities: ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], productStateDependency: "SERVER_PRODUCT_TRUTH", journeyRelevance: "REQUIRED", independenceRelevance: "NEVER", evidenceSlots: ["STATE_CHANGE"], forbiddenInterpretations: ["SAVE_IS_SATISFACTION", "SAVE_IS_VISIT", "SAVE_IS_CONCEPT_PREFERENCE"], lifecycleClass: "UNRESOLVED_PRIVACY_POLICY" }),
  SAVE_REMOVED: configured("SAVE_REMOVED", "STATE_CHANGE", { requiredServerReferences: ["spotId"], allowedAdditionalReferences: ["sessionId", "decisionId"], sourceAuthorities: ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], productStateDependency: "SERVER_PRODUCT_TRUTH", journeyRelevance: "REQUIRED", independenceRelevance: "NEVER", evidenceSlots: ["STATE_CHANGE"], forbiddenInterpretations: ["REMOVAL_IS_DISLIKE", "REMOVAL_IS_NEGATIVE_SATISFACTION", "REMOVAL_IS_NEGATIVE_TASTE"], lifecycleClass: "UNRESOLVED_PRIVACY_POLICY" }),
  NAVIGATION_INTENT: configured("NAVIGATION_INTENT", "INTENT", { requiredServerReferences: ["spotId"], allowedAdditionalReferences: ["sessionId", "decisionId"], sourceAuthorities: ["CLIENT_OBSERVATION", "AUTHENTICATED_USER_ACTION"], productStateDependency: "SERVER_PRODUCT_TRUTH", journeyRelevance: "REQUIRED", independenceRelevance: "NEVER", evidenceSlots: ["INTENT"], forbiddenInterpretations: ["NAVIGATION_IS_VISIT", "NAVIGATION_IS_SATISFACTION"], lifecycleClass: "UNRESOLVED_PRIVACY_POLICY" }),
  RESERVATION_INTENT: configured("RESERVATION_INTENT", "INTENT", { requiredServerReferences: ["spotId"], allowedAdditionalReferences: ["sessionId", "decisionId"], sourceAuthorities: ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], productStateDependency: "SERVER_PRODUCT_TRUTH", journeyRelevance: "REQUIRED", independenceRelevance: "NEVER", evidenceSlots: ["INTENT"], forbiddenInterpretations: ["RESERVATION_INTENT_IS_VISIT", "RESERVATION_INTENT_IS_SATISFACTION"], lifecycleClass: "UNRESOLVED_PRIVACY_POLICY" }),
  VERIFIED_VISIT: configured("VERIFIED_VISIT", "EXPERIENCE", { requiredServerReferences: ["spotId"], allowedAdditionalReferences: ["sessionId", "decisionId", "experienceEventId"], sourceAuthorities: ["VERIFIED_OUTCOME"], productStateDependency: "VERIFIED_OUTCOME", journeyRelevance: "REQUIRED", independenceRelevance: "ELIGIBLE_WHEN_SERVER_RESOLVED", evidenceSlots: ["EXPERIENCE"], forbiddenInterpretations: ["VISIT_IS_SATISFACTION", "VISIT_IS_POSITIVE_TASTE", "MULTIPLE_FACTS_ARE_MULTIPLE_EXPERIENCES"], lifecycleClass: "UNRESOLVED_PRIVACY_POLICY" }),
  REVIEW_RECORDED: configured("REVIEW_RECORDED", "EXPERIENCE", { requiredServerReferences: ["spotId"], allowedAdditionalReferences: ["sessionId", "decisionId", "experienceEventId"], sourceAuthorities: ["SERVER_VERIFIED_PRODUCT_STATE", "DATABASE_DERIVED_EVENT"], productStateDependency: "SERVER_PRODUCT_TRUTH", journeyRelevance: "REQUIRED", independenceRelevance: "ELIGIBLE_WHEN_SERVER_RESOLVED", evidenceSlots: ["EXPERIENCE"], forbiddenInterpretations: ["REVIEW_IS_SATISFACTION", "SMART_REVIEW_HAS_DIFFERENT_LEARNING", "RAW_REVIEW_TEXT_IS_EVIDENCE_CHAIN_DATA"], lifecycleClass: "UNRESOLVED_PRIVACY_POLICY" }),
  SATISFACTION_RECORDED: configured("SATISFACTION_RECORDED", "SATISFACTION", { requiredServerReferences: [], allowedAdditionalReferences: ["spotId", "experienceEventId"], sourceAuthorities: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"], productStateDependency: "SERVER_PRODUCT_TRUTH", journeyRelevance: "REQUIRED", independenceRelevance: "NEVER", evidenceSlots: ["SATISFACTION"], forbiddenInterpretations: ["SATISFACTION_AUTOMATICALLY_ATTRIBUTES_ALL_WORLD_FACTS", "SATISFACTION_IS_MULTIPLE_EXPERIENCES"], lifecycleClass: "UNRESOLVED_PRIVACY_POLICY" }),
  USER_CORRECTION: configured("USER_CORRECTION", "CORRECTION", { requiredServerReferences: [], allowedAdditionalReferences: [], sourceAuthorities: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"], productStateDependency: "SERVER_PRODUCT_TRUTH", journeyRelevance: "OPTIONAL", independenceRelevance: "NEVER", evidenceSlots: ["CORRECTION"], forbiddenInterpretations: ["CORRECTION_IS_NEGATIVE_TASTE", "CORRECTION_REWRITES_HISTORY"], lifecycleClass: "UNRESOLVED_PRIVACY_POLICY", correctionBehavior: "APPEND_ONLY_CORRECTION" }),
  ONBOARDING_DECLARATION: configured("ONBOARDING_DECLARATION", "STATE_CHANGE", { requiredServerReferences: [], allowedAdditionalReferences: [], sourceAuthorities: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"], productStateDependency: "NONE", journeyRelevance: "FORBIDDEN", independenceRelevance: "NEVER", evidenceSlots: ["STATE_CHANGE"], forbiddenInterpretations: ["DECLARATION_IS_OBSERVED_EXPERIENCE", "DECLARATION_IS_INDEPENDENT_JOURNEY"], lifecycleClass: "UNRESOLVED_PRIVACY_POLICY" }),
  DWELL_OBSERVED: unknown("DWELL_OBSERVED", "INTERACTION", ["DWELL_IS_INTEREST", "DWELL_IS_POSITIVE_PREFERENCE", "DWELL_IS_ATTENTION"]),
  PHOTO_VIEWED: unknown("PHOTO_VIEWED", "INTERACTION", ["PHOTO_VIEW_IS_TASTE", "PHOTO_VIEW_IS_VISIT"]),
  MAP_OPENED: unknown("MAP_OPENED", "INTERACTION", ["MAP_OPEN_IS_NAVIGATION", "MAP_OPEN_IS_VISIT"]),
  SEARCH_RECORDED: unknown("SEARCH_RECORDED", "SEARCH", ["RAW_SEARCH_TEXT_IS_DURABLE_TASTE", "SEARCH_IS_SATISFACTION"]),
  CATEGORY_NAVIGATED: unknown("CATEGORY_NAVIGATED", "SEARCH", ["CATEGORY_NAVIGATION_IS_PREFERENCE"]),
  ALTERNATIVE_REQUESTED: unknown("ALTERNATIVE_REQUESTED", "DECISION", ["ALTERNATIVE_REQUEST_IS_REJECTION", "ALTERNATIVE_REQUEST_IS_DISLIKE"]),
  QUICK_SKIP_OBSERVED: unknown("QUICK_SKIP_OBSERVED", "INTERACTION", ["QUICK_SKIP_IS_DISLIKE", "QUICK_SKIP_IS_NEGATIVE_TASTE"]),
  MOMENT_RECORDED: unknown("MOMENT_RECORDED", "SOCIAL_OBSERVATION", ["MOMENT_IS_REVIEW", "MOMENT_IS_SATISFACTION", "MOMENT_IS_TASTE"]),
  SHARE_RECORDED: unknown("SHARE_RECORDED", "SOCIAL_OBSERVATION", ["SHARE_IS_POSITIVE_PREFERENCE", "SHARE_PROPAGATES_TO_ANOTHER_USER"]),
  FOLLOW_RECORDED: unknown("FOLLOW_RECORDED", "SOCIAL_OBSERVATION", ["FOLLOW_IS_TASTE_SIMILARITY", "FOLLOW_IS_SPOT_PREFERENCE"]),
  FRIEND_PROFILE_OPENED: unknown("FRIEND_PROFILE_OPENED", "SOCIAL_OBSERVATION", ["PROFILE_OPEN_IS_SPOT_TASTE", "RELATIONSHIP_STRENGTH_IS_TASTE_SIMILARITY"]),
});

export function catalogEntry(eventType: string): CanonicalEventCatalogEntry {
  const entry = (CANONICAL_EVENT_CATALOG as Readonly<Record<string, CanonicalEventCatalogEntry>>)[eventType];
  if (!entry) throw new ContractValidationError("$.eventType", "event is absent from the canonical catalog");
  return entry;
}

export function assertConfiguredEventSemantics(event: CanonicalUserEvent): CanonicalEventCatalogEntry {
  const entry = catalogEntry(event.eventType);
  if (entry.status !== "CONFIGURED") throw new ContractValidationError("$.eventType", "event semantics are not configured");
  if (!entry.sourceAuthorities.includes(event.authority.kind)) throw new ContractValidationError("$.authority.kind", "event authority conflicts with the canonical catalog");
  return entry;
}
