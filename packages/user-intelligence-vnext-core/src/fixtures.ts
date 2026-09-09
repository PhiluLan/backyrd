import { contentHash } from "./canonical.js";
import {
  CanonicalUserEvent, ConsentEnvelope, ConsentEnvelopeSchema, EvidenceChain, RelevantUserProjectionRequest, RelevantUserProjectionRequestSchema, SYNTHETIC_CONCEPT_REGISTRY_VERSION,
  UserIntelligenceManifest, UserIntelligenceSnapshot, withEventHash,
} from "./contracts.js";

export const SYNTHETIC_NOW = "2026-01-15T12:00:00.000Z";
export const SYNTHETIC_USER_A = "synthetic-user-a";
export const SYNTHETIC_USER_B = "synthetic-user-b";
const ZERO_HASH = "0".repeat(64);

export const GRANTED_CONSENT: ConsentEnvelope = Object.freeze(ConsentEnvelopeSchema.parse({
  contractVersion: "backyrd.user-intelligence.consent-envelope@1.0", purpose: "PERSONALIZED_RECOMMENDATIONS", state: "GRANTED",
  consentVersion: "synthetic-consent-v1", policyVersion: "synthetic-policy-v1", uxVersion: "synthetic-ux-v1",
  effectiveAt: SYNTHETIC_NOW, captureContext: "ONBOARDING", allowedProcessing: ["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"], lifecycleEffect: "ALLOW",
}));
export const NO_CONSENT: ConsentEnvelope = Object.freeze(ConsentEnvelopeSchema.parse({ ...GRANTED_CONSENT, state: "UNKNOWN", captureContext: "SYSTEM_UNKNOWN", allowedProcessing: ["EXPORT", "ERASURE"], lifecycleEffect: "DO_NOT_PROCESS" }));

type EventSpec = Pick<CanonicalUserEvent, "eventType" | "eventClass" | "payload"> & { readonly id: string; readonly authorityKind?: CanonicalUserEvent["authority"]["kind"]; readonly consent?: ConsentEnvelope; readonly userId?: string; readonly supersedesEventId?: string };
export function syntheticEvent(spec: EventSpec): CanonicalUserEvent {
  const userId = spec.userId ?? SYNTHETIC_USER_A;
  const body: Omit<CanonicalUserEvent, "eventHash"> = {
    contractVersion: "backyrd.user-intelligence.canonical-user-event@1.0", eventId: spec.id, eventType: spec.eventType, eventClass: spec.eventClass,
    occurredAt: SYNTHETIC_NOW, observedAt: SYNTHETIC_NOW, ingestedAt: SYNTHETIC_NOW, userId,
    references: { sessionId: "synthetic-session-1", decisionId: "synthetic-decision-1", spotId: "synthetic-spot-1" }, journeyId: "synthetic-journey-1",
    source: { system: "synthetic-fixture", producer: "phase1-harness", sourceRecordId: `source-${spec.id}`, provenance: "SERVER_VERIFIED" },
    authority: { contractVersion: "backyrd.user-intelligence.user-event-authority@1.0", kind: spec.authorityKind ?? "SERVER_VERIFIED_PRODUCT_STATE", boundUserId: userId, binding: "SERVER_BOUND", assertedBy: "phase1-harness", sourceTrust: "SERVER_VERIFIED" },
    consent: spec.consent ?? GRANTED_CONSENT, retentionClass: "synthetic-retention-tbd", idempotencyKey: `idempotency-${spec.id}`, payload: spec.payload,
    ...(spec.supersedesEventId ? { supersedesEventId: spec.supersedesEventId } : {}),
  };
  return withEventHash(body);
}

export const SYNTHETIC_EVENTS = Object.freeze({
  exposure: syntheticEvent({ id: "event-exposure", eventType: "CANDIDATE_EXPOSED", eventClass: "EXPOSURE", payload: { kind: "EXPOSURE", candidateCount: 1 } }),
  open: syntheticEvent({ id: "event-open", eventType: "SPOT_OPENED", eventClass: "WEAK_INTERACTION", payload: { kind: "INTERACTION", action: "SPOT_OPENED" } }),
  save: syntheticEvent({ id: "event-save", eventType: "SAVED", eventClass: "DELIBERATE_INTENT", payload: { kind: "INTENT", action: "SAVED" } }),
  remove: syntheticEvent({ id: "event-remove", eventType: "SAVE_REMOVED", eventClass: "DELIBERATE_INTENT", payload: { kind: "INTENT", action: "SAVE_REMOVED" } }),
  navigation: syntheticEvent({ id: "event-navigation", eventType: "NAVIGATION_INTENT", eventClass: "DELIBERATE_INTENT", payload: { kind: "INTENT", action: "NAVIGATION" } }),
  visit: syntheticEvent({ id: "event-visit", eventType: "VERIFIED_VISIT", eventClass: "EXPERIENCE", authorityKind: "VERIFIED_OUTCOME", payload: { kind: "EXPERIENCE", experienceType: "VERIFIED_VISIT", experienceState: "CONFIRMED", satisfaction: "UNKNOWN" } }),
  standardReview: syntheticEvent({ id: "event-standard-review", eventType: "REVIEW_RECORDED", eventClass: "EXPERIENCE", payload: { kind: "EXPERIENCE", experienceType: "REVIEW", reviewOrigin: "STANDARD_REVIEW", experienceState: "CONFIRMED", satisfaction: "UNKNOWN" } }),
  smartReview: syntheticEvent({ id: "event-smart-review", eventType: "REVIEW_RECORDED", eventClass: "EXPERIENCE", payload: { kind: "EXPERIENCE", experienceType: "REVIEW", reviewOrigin: "SMART_REVIEW", experienceState: "CONFIRMED", satisfaction: "UNKNOWN" } }),
  positive: syntheticEvent({ id: "event-positive", eventType: "SATISFACTION_RECORDED", eventClass: "EXPLICIT_SATISFACTION", payload: { kind: "SATISFACTION", direction: "POSITIVE", declaration: "EXPLICIT_USER_FEEDBACK" } }),
  negative: syntheticEvent({ id: "event-negative", eventType: "SATISFACTION_RECORDED", eventClass: "EXPLICIT_SATISFACTION", payload: { kind: "SATISFACTION", direction: "NEGATIVE", declaration: "EXPLICIT_USER_FEEDBACK" } }),
  correction: syntheticEvent({ id: "event-correction", eventType: "USER_CORRECTION", eventClass: "EXPLICIT_CORRECTION", supersedesEventId: "event-positive", payload: { kind: "CORRECTION", targetEventId: "event-positive", correction: "RETRACT" } }),
  currentIntent: syntheticEvent({ id: "event-current-intent", eventType: "DECISION_REQUESTED", eventClass: "REQUEST_CONTEXT", payload: { kind: "DECISION_REQUEST", contextReference: "synthetic-current-context-1" } }),
  noConsentOpen: syntheticEvent({ id: "event-no-consent", eventType: "SPOT_OPENED", eventClass: "WEAK_INTERACTION", consent: NO_CONSENT, payload: { kind: "INTERACTION", action: "SPOT_OPENED" } }),
});

const ref = (event: CanonicalUserEvent) => ({ eventId: event.eventId, eventHash: event.eventHash, occurredAt: event.occurredAt });
const segment = (events: readonly CanonicalUserEvent[], state: "UNKNOWN" | "HYPOTHESIS" | "SUPPORTED" | "CONTRADICTED") => ({ references: events.map(ref), state });
const contradictoryChainBody = {
  contractVersion: "backyrd.user-intelligence.evidence-chain@1.0" as const, chainId: "synthetic-chain-contradictory", userId: SYNTHETIC_USER_A, journeyId: "synthetic-journey-1", spotId: "synthetic-spot-1",
  processingAuthorization: { consentState: "GRANTED" as const, consentVersion: GRANTED_CONSENT.consentVersion, personalizationEvidenceAllowed: true },
  segments: {
    exposure: segment([SYNTHETIC_EVENTS.exposure], "SUPPORTED"), deliberateIntent: segment([SYNTHETIC_EVENTS.save, SYNTHETIC_EVENTS.remove], "CONTRADICTED"),
    experience: segment([SYNTHETIC_EVENTS.visit], "SUPPORTED"), satisfaction: segment([SYNTHETIC_EVENTS.positive, SYNTHETIC_EVENTS.negative], "CONTRADICTED"),
    explicitCorrection: segment([SYNTHETIC_EVENTS.correction], "SUPPORTED"), directSpotRelationship: segment([SYNTHETIC_EVENTS.open, SYNTHETIC_EVENTS.save], "HYPOTHESIS"), practicalBehavior: segment([SYNTHETIC_EVENTS.navigation], "HYPOTHESIS"),
    tasteAttribution: [{ concept: { contractVersion: "backyrd.user-intelligence.user-concept-reference@1.0" as const, registryVersion: SYNTHETIC_CONCEPT_REGISTRY_VERSION, conceptId: "vibe.quiet" }, direction: "POSITIVE" as const, evidence: [ref(SYNTHETIC_EVENTS.positive)], interpretationPolicyRef: "synthetic-attribution-policy-tbd" }, { concept: { contractVersion: "backyrd.user-intelligence.user-concept-reference@1.0" as const, registryVersion: SYNTHETIC_CONCEPT_REGISTRY_VERSION, conceptId: "vibe.quiet" }, direction: "NEGATIVE" as const, evidence: [ref(SYNTHETIC_EVENTS.negative)], interpretationPolicyRef: "synthetic-attribution-policy-tbd" }, { concept: { contractVersion: "backyrd.user-intelligence.user-concept-reference@1.0" as const, registryVersion: SYNTHETIC_CONCEPT_REGISTRY_VERSION, conceptId: "energy.calm" }, direction: "POSITIVE" as const, evidence: [ref(SYNTHETIC_EVENTS.positive)], interpretationPolicyRef: "synthetic-attribution-policy-tbd" }],
  },
  conflicts: [{ conflictId: "synthetic-conflict-1", kind: "POSITIVE_AND_NEGATIVE" as const, evidence: [ref(SYNTHETIC_EVENTS.positive), ref(SYNTHETIC_EVENTS.negative)], resolution: "UNRESOLVED" as const }, { conflictId: "synthetic-conflict-2", kind: "EXPERIENCE_WITH_UNKNOWN_SATISFACTION" as const, evidence: [ref(SYNTHETIC_EVENTS.visit)], resolution: "UNRESOLVED" as const }],
  independence: { journeyUnits: 1 as const, independentExperiences: 1, repeatedSameSpotInteractions: 5, multiConceptSingleExperience: true }, builderPolicyRef: "synthetic-chain-policy-v1",
};
export const CONTRADICTORY_EVIDENCE_CHAIN: EvidenceChain = Object.freeze({ ...contradictoryChainBody, chainHash: contentHash(contradictoryChainBody) });

const manifestBody = {
  contractVersion: "backyrd.user-intelligence.manifest@1.0" as const, manifestId: "synthetic-manifest-1",
  contracts: { event: "backyrd.user-intelligence.canonical-user-event@1.0", evidenceChain: "backyrd.user-intelligence.evidence-chain@1.0", snapshot: "backyrd.user-intelligence.snapshot@1.0", projection: "backyrd.user-intelligence.projection@1.0", transparency: "backyrd.user-intelligence.transparency-view@1.0" },
  reducer: { version: "synthetic-contract-only-reducer-v0", codeHash: contentHash("synthetic-contract-only-reducer-v0") }, registryVersions: [SYNTHETIC_CONCEPT_REGISTRY_VERSION],
  policies: { eventWeight: "UNRESOLVED_PRODUCT_POLICY", sourceReliability: "UNRESOLVED_PRODUCT_POLICY", attribution: "synthetic-attribution-policy-tbd", decay: "UNRESOLVED_PRODUCT_POLICY", maturity: "UNRESOLVED_PRODUCT_POLICY", sufficiency: "synthetic-sufficiency-policy-v0", lifecycle: "backyrd.user-intelligence.lifecycle-manifest@1.0", projection: "synthetic-projection-policy-v0", contextAllowlist: "UNRESOLVED_PRIVACY_POLICY" },
  compatibility: { worldKnowledgeContract: "decision-vnext-world-knowledge-port-v1-proposed", situationalContextContract: "decision-vnext-context-snapshot-v1-proposed", decisionContract: "decision-vnext-execution-envelope-v1-proposed" },
  unresolvedPolicies: ["EVENT_WEIGHTS", "SOURCE_RELIABILITY", "DECAY", "MATURITY", "CONTEXT_ALLOWLIST", "REVIEW_MOOD_EFFECT", "MOMENT_EFFECT", "SAVE_EFFECT"],
};
export const SYNTHETIC_MANIFEST: UserIntelligenceManifest = Object.freeze({ ...manifestBody, manifestHash: contentHash(manifestBody) });

const coldSnapshotWithoutHash: Omit<UserIntelligenceSnapshot, "snapshotHash"> = {
  contractVersion: "backyrd.user-intelligence.snapshot@1.0", snapshotId: "synthetic-snapshot-cold", userId: SYNTHETIC_USER_A,
  sourceWatermark: { sourceLedgerHash: ZERO_HASH }, manifest: { manifestId: SYNTHETIC_MANIFEST.manifestId, manifestHash: SYNTHETIC_MANIFEST.manifestHash },
  tasteNodes: [], practicalPreferences: [], directSpotAffinities: [], contradictions: [], domainSufficiency: [{ domain: "global", sufficiency: { level: "UNKNOWN", policyRef: "synthetic-sufficiency-policy-v0", reasons: ["COLD_START"] } }],
  changeSummary: { created: 0, updated: 0, corrected: 0, suppressed: 0 }, lifecycle: { consentVersion: GRANTED_CONSENT.consentVersion, purpose: "PERSONALIZED_RECOMMENDATIONS", validUntil: null, invalidatedAt: null }, technicalMetadata: { createdAt: SYNTHETIC_NOW },
};
const coldSemanticBody = Object.fromEntries(Object.entries(coldSnapshotWithoutHash).filter(([key]) => key !== "technicalMetadata"));
export const COLD_SNAPSHOT: UserIntelligenceSnapshot = Object.freeze({ ...coldSnapshotWithoutHash, snapshotHash: contentHash(coldSemanticBody) });

export const SYNTHETIC_PROJECTION_REQUEST: RelevantUserProjectionRequest = Object.freeze(RelevantUserProjectionRequestSchema.parse({
  contractVersion: "backyrd.user-intelligence.projection-request@1.0", requestId: "synthetic-projection-request-1",
  actor: { kind: "AUTHENTICATED_USER", userId: SYNTHETIC_USER_A, authenticationContextHash: ZERO_HASH, boundBy: "SERVER" }, decisionId: "synthetic-decision-1",
  snapshot: { snapshotId: COLD_SNAPSHOT.snapshotId, snapshotHash: COLD_SNAPSHOT.snapshotHash },
  context: { contextContractVersion: "synthetic-context-v1", contextHash: ZERO_HASH, placeTypes: ["cafe"], domainKeys: ["solo"], rawLocationIncluded: false, socialDetailsIncluded: false },
  requestedDomains: ["place_type.cafe"], budgets: { maxItems: 8, maxBytes: 4096 }, projectionPolicyVersion: "synthetic-projection-policy-v0", killSwitch: false,
}));
