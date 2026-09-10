import { contentHash } from "./canonical.js";
import {
  CALIBRATION_CONCEPT_REGISTRY_HASH, CALIBRATION_CONCEPT_REGISTRY_VERSION, CalibrationEvidence, CalibrationEventType, CalibrationScenario,
  createSyntheticCalibrationTrustContext, withCalibrationScenarioHash,
} from "./calibration.js";
import { createSyntheticEvidenceEvaluationAnchor, deriveCalibrationEvidenceFromPhase2 } from "./calibration-adapter.js";
import { CanonicalUserEvent, CONTRACT_VERSIONS, withEventHash } from "./contracts.js";
import { buildEvidenceChains, EvidenceAuthorityContext, EvidenceBuildResult, withContextEvidenceHash, withCorrectionResolutionHash, withWorldEvidenceHash } from "./evidence-chain.js";
import { GRANTED_CONSENT, SYNTHETIC_USER_A, syntheticEvent } from "./fixtures.js";

export const PHASE3B_SYNTHETIC_SUBJECT = contentHash("backyrd.phase3b.synthetic.subject");
export const PHASE3B_SYNTHETIC_REGISTRY = CALIBRATION_CONCEPT_REGISTRY_VERSION;
export const PHASE3B_INTERPRETED_AT = "2026-02-01T12:00:00.000Z";

type FixtureSource = { readonly phase2: EvidenceBuildResult; readonly authority: EvidenceAuthorityContext };
const sourceByRecordId = new Map<string, FixtureSource>();

const canonicalSpec = (eventType: CalibrationEventType): Pick<CanonicalUserEvent, "eventType" | "eventClass" | "authority" | "payload"> => {
  const specs: Partial<Record<CalibrationEventType, { eventType: CanonicalUserEvent["eventType"]; eventClass: CanonicalUserEvent["eventClass"]; authorityKind: CanonicalUserEvent["authority"]["kind"]; payload: CanonicalUserEvent["payload"] }>> = {
    SHOWN: { eventType: "CANDIDATE_EXPOSED", eventClass: "EXPOSURE", authorityKind: "CLIENT_OBSERVATION", payload: { kind: "EXPOSURE", candidateCount: 1 } },
    OPENED: { eventType: "SPOT_OPENED", eventClass: "WEAK_INTERACTION", authorityKind: "CLIENT_OBSERVATION", payload: { kind: "INTERACTION", action: "SPOT_OPENED" } },
    SAVED: { eventType: "SAVED", eventClass: "DELIBERATE_INTENT", authorityKind: "SERVER_VERIFIED_PRODUCT_STATE", payload: { kind: "INTENT", action: "SAVED" } },
    SAVE_REMOVED: { eventType: "SAVE_REMOVED", eventClass: "DELIBERATE_INTENT", authorityKind: "SERVER_VERIFIED_PRODUCT_STATE", payload: { kind: "INTENT", action: "SAVE_REMOVED" } },
    NAVIGATION_STARTED: { eventType: "NAVIGATION_INTENT", eventClass: "DELIBERATE_INTENT", authorityKind: "AUTHENTICATED_USER_ACTION", payload: { kind: "INTENT", action: "NAVIGATION" } },
    RESERVATION_INTENT: { eventType: "RESERVATION_INTENT", eventClass: "DELIBERATE_INTENT", authorityKind: "SERVER_VERIFIED_PRODUCT_STATE", payload: { kind: "INTENT", action: "RESERVATION" } },
    VISITED: { eventType: "VERIFIED_VISIT", eventClass: "EXPERIENCE", authorityKind: "VERIFIED_OUTCOME", payload: { kind: "EXPERIENCE", experienceType: "VERIFIED_VISIT", experienceState: "CONFIRMED", satisfaction: "UNKNOWN" } },
    REPEAT_VISIT: { eventType: "VERIFIED_VISIT", eventClass: "EXPERIENCE", authorityKind: "VERIFIED_OUTCOME", payload: { kind: "EXPERIENCE", experienceType: "VERIFIED_VISIT", experienceState: "CONFIRMED", satisfaction: "UNKNOWN" } },
    STANDARD_REVIEW: { eventType: "REVIEW_RECORDED", eventClass: "EXPERIENCE", authorityKind: "SERVER_VERIFIED_PRODUCT_STATE", payload: { kind: "EXPERIENCE", experienceType: "REVIEW", reviewOrigin: "STANDARD_REVIEW", experienceState: "CONFIRMED", satisfaction: "UNKNOWN" } },
    SMART_REVIEW: { eventType: "REVIEW_RECORDED", eventClass: "EXPERIENCE", authorityKind: "SERVER_VERIFIED_PRODUCT_STATE", payload: { kind: "EXPERIENCE", experienceType: "REVIEW", reviewOrigin: "SMART_REVIEW", experienceState: "CONFIRMED", satisfaction: "UNKNOWN" } },
    EXPLICIT_SATISFACTION: { eventType: "SATISFACTION_RECORDED", eventClass: "EXPLICIT_SATISFACTION", authorityKind: "AUTHENTICATED_USER_ACTION", payload: { kind: "SATISFACTION", direction: "POSITIVE", declaration: "EXPLICIT_USER_FEEDBACK" } },
    EXPLICIT_DISSATISFACTION: { eventType: "SATISFACTION_RECORDED", eventClass: "EXPLICIT_SATISFACTION", authorityKind: "AUTHENTICATED_USER_ACTION", payload: { kind: "SATISFACTION", direction: "NEGATIVE", declaration: "EXPLICIT_USER_FEEDBACK" } },
    CORRECTION: { eventType: "USER_CORRECTION", eventClass: "EXPLICIT_CORRECTION", authorityKind: "AUTHENTICATED_USER_ACTION", payload: { kind: "CORRECTION", targetEventId: "placeholder-target", correction: "RETRACT" } },
  };
  const spec = specs[eventType];
  if (!spec) throw new Error(`phase2_semantics_not_configured:${eventType}`);
  const base = syntheticEvent({ id: `template-${eventType.toLowerCase()}`, ...spec });
  return { eventType: base.eventType, eventClass: base.eventClass, authority: base.authority, payload: base.payload };
};

function canonicalEvent(input: Parameters<typeof syntheticCalibrationEvidence>[0], target?: CanonicalUserEvent): CanonicalUserEvent {
  const spec = canonicalSpec(input.eventType);
  const eventId = `phase2-${input.id}`; const journeyId = input.journey === undefined ? `journey-${input.id}` : input.journey;
  const spotId = input.spot === undefined ? "synthetic-spot-a" : input.spot;
  const occurredAt = input.occurredAt ?? "2026-01-20T12:00:00.000Z";
  const references = input.eventType === "CORRECTION" ? {} : {
    ...(spotId ? { spotId } : {}), ...(input.eventType === "SHOWN" ? { decisionId: `decision-${input.id}`, candidateId: `candidate-${input.id}` } : {}),
    ...(["EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION"].includes(input.eventType) ? { experienceEventId: `phase2-experience-${input.id}` } : {}),
  };
  const payload = input.eventType === "CORRECTION" ? { kind: "CORRECTION" as const, targetEventId: target!.eventId, correction: "RETRACT" as const } : spec.payload;
  const authority = { ...spec.authority, boundUserId: SYNTHETIC_USER_A, assertedBy: "phase3b-phase2-fixture" };
  const body: Omit<CanonicalUserEvent, "eventHash"> = {
    contractVersion: CONTRACT_VERSIONS.canonicalUserEvent, eventId, eventType: spec.eventType, eventClass: spec.eventClass,
    occurredAt, observedAt: occurredAt, ingestedAt: occurredAt, userId: SYNTHETIC_USER_A, references,
    journey: journeyId === null ? { resolution: "UNRESOLVED", journeyId: null, resolutionPolicyVersion: "phase3b-synthetic-journey-policy-v1", independenceEligible: false } : { resolution: "SERVER_RESOLVED", journeyId, resolutionPolicyVersion: "phase3b-synthetic-journey-policy-v1", independenceEligible: true },
    referenceResolution: { authority: "SERVER_PRODUCT_TRUTH", boundUserId: SYNTHETIC_USER_A, resolutionRecordHash: contentHash(`phase2-reference-${input.id}`), referencePolicyVersion: "phase3b-synthetic-reference-policy-v1" },
    temporalBinding: { contractVersion: CONTRACT_VERSIONS.temporalValidation, policyVersion: "phase3b-synthetic-temporal-policy-v1", timeAuthority: "SERVER_CLOCK", validatedAt: occurredAt },
    source: { system: "synthetic-fixture", producer: "phase3b-phase2-adapter-fixture", sourceRecordId: `source-${input.id}`, provenance: authority.kind === "CLIENT_OBSERVATION" ? "CLIENT_OBSERVED" : authority.kind === "AUTHENTICATED_USER_ACTION" ? "USER_DECLARED" : authority.kind === "VERIFIED_OUTCOME" ? "SERVER_VERIFIED" : "PRODUCT_STATE" },
    authority, consent: GRANTED_CONSENT, retentionClass: "UNRESOLVED_PRIVACY_POLICY", idempotencyKey: `idempotency-${input.id}`, payload,
    ...(target ? { supersedesEventId: target.eventId } : {}),
  };
  return withEventHash(body);
}

function buildSource(inputs: readonly Parameters<typeof syntheticCalibrationEvidence>[0][], correctionTarget?: CanonicalUserEvent, correctionTargetInput?: Parameters<typeof syntheticCalibrationEvidence>[0]): { source: FixtureSource; events: readonly CanonicalUserEvent[] } {
  const events = inputs.map((input, index) => canonicalEvent(input, index === inputs.length - 1 && input.eventType === "CORRECTION" ? correctionTarget : undefined));
  const qualifiedExperiences = correctionTarget ? [] : inputs.flatMap((input) => {
    if (!["EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION"].includes(input.eventType)) return [];
    const experienceInput = { id: `experience-${input.id}`, eventType: "VISITED" as const, ...(input.journey !== undefined ? { journey: input.journey } : {}), ...(input.spot !== undefined ? { spot: input.spot } : {}), occurredAt: "2026-01-19T12:00:00.000Z" };
    return [canonicalEvent(experienceInput)];
  });
  const allEvents = correctionTarget ? [correctionTarget, ...events] : [...qualifiedExperiences, ...events];
  const resolutions = allEvents.map((event) => {
    const journeyId = event.eventType === "USER_CORRECTION" ? correctionTarget!.journey.journeyId : event.journey.journeyId;
    const core = { contractVersion: CONTRACT_VERSIONS.journeyResolution, policyVersion: "phase3b-synthetic-journey-policy-v1", subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT, eventId: event.eventId, status: journeyId ? "SAME_JOURNEY" as const : "UNRESOLVED" as const, journeyId, independenceEligible: journeyId !== null, reasonCodes: journeyId ? ["MATCHED_SERVER_SESSION" as const] : ["NO_AUTHORITATIVE_LINK" as const], authorityContextVersion: "phase3b-synthetic-journey-authority-v1", authorityProofHashes: [contentHash(`journey-authority-${event.eventId}`)], proofInputHash: contentHash(`journey-proof-input-${event.eventId}`) };
    return { ...core, proofHash: contentHash(core) };
  });
  const worlds = allEvents.flatMap((event) => {
    const input = event.eventId === correctionTarget?.eventId ? correctionTargetInput ?? null : inputs.find(({ id }) => event.eventId === `phase2-${id}`) ?? null;
    if (!input || !event.references.spotId) return [];
    const concepts = input.concepts ?? (["EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION"].includes(input.eventType) ? [{ registryVersion: PHASE3B_SYNTHETIC_REGISTRY, conceptId: "vibe.synthetic-cozy", certainty: "SUPPORTED" as const }] : []);
    if (!concepts.length) return [];
    return [withWorldEvidenceHash({ contractVersion: CONTRACT_VERSIONS.worldEvidenceConsumer, bindingId: `world-${event.eventId}`, eventId: event.eventId, eventHash: event.eventHash, spotId: event.references.spotId, bindingScope: "EVENT_TIME_WORLD", worldRegistryVersion: PHASE3B_SYNTHETIC_REGISTRY, worldRegistryHash: CALIBRATION_CONCEPT_REGISTRY_HASH, stateKind: "EVENT_TIME_SNAPSHOT", stateHash: contentHash(`world-state-${event.eventId}`), evidenceAt: event.occurredAt, resolvedAt: event.occurredAt, references: concepts.map(({ conceptId, certainty }) => ({ referenceId: conceptId, kind: "CONCEPT" as const, trust: certainty === "VERIFIED" ? "VERIFIED" as const : certainty === "SUPPORTED" ? "SUPPORTED" as const : certainty === "CONFLICTING" ? "CONTESTED" as const : "UNKNOWN" as const, freshness: "CURRENT_AT_EVENT" as const, provenanceSummary: "synthetic-phase2-world-provider" })), conflicts: concepts.filter(({ certainty }) => certainty === "CONFLICTING").map(({ conceptId }) => `conflict-${conceptId}`), unknowns: concepts.filter(({ certainty }) => certainty === "UNKNOWN").map(({ conceptId }) => `unknown-${conceptId}`), exclusions: [] })];
  });
  const contexts = allEvents.flatMap((event) => {
    const input = event.eventId === correctionTarget?.eventId ? correctionTargetInput ?? null : inputs.find(({ id }) => event.eventId === `phase2-${id}`) ?? null;
    if (!input?.context) return [];
    return [withContextEvidenceHash({ contractVersion: CONTRACT_VERSIONS.contextEvidence, bindingId: `context-${event.eventId}`, eventId: event.eventId, eventHash: event.eventHash, bindingScope: "EVENT_TIME_CONTEXT", source: input.context.authority === "EXPLICIT_USER" ? "USER_EXPLICIT" : input.context.authority === "SERVER_AUTHORIZED" ? "SERVER_AUTHORIZED" : "CAUTIOUSLY_INFERRED", contextContractVersion: "phase3b-synthetic-context-v1", contextHash: input.context.contextHash, evidenceAt: event.occurredAt, dimensions: input.context.dimensions, rawLocationIncluded: false, privateSocialDataIncluded: false, longTermTasteEligible: false, limitations: ["SYNTHETIC_CONTEXT_ONLY"] })];
  });
  const correctionEvent = allEvents.find(({ eventType }) => eventType === "USER_CORRECTION");
  const corrections = correctionEvent ? [withCorrectionResolutionHash({ contractVersion: CONTRACT_VERSIONS.correctionResolution, recordId: `ledger-${correctionEvent.eventId}`, authority: "SERVER_EVENT_LEDGER", correctionEventId: correctionEvent.eventId, targetEventId: correctionTarget!.eventId, boundUserId: SYNTHETIC_USER_A, targetUserId: SYNTHETIC_USER_A, targetSpotId: correctionTarget!.references.spotId ?? null, correctionSpotId: correctionTarget!.references.spotId ?? null, targetOccurredAt: correctionTarget!.occurredAt, policyVersion: "phase3b-synthetic-correction-policy-v1", validUntil: "2027-01-01T00:00:00.000Z" })] : [];
  const subject = { boundUserId: SYNTHETIC_USER_A, subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT, authority: "SERVER_AUTHENTICATION" as const, userIdExternallyExposed: false as const };
  const input = { contractVersion: CONTRACT_VERSIONS.evidenceBuilderInput, builderPolicyVersion: "phase3b-synthetic-evidence-builder-v1", subject, consent: GRANTED_CONSENT, events: allEvents, journeyResolutions: resolutions, worldEvidence: worlds, contextEvidence: contexts, corrections, lifecycleState: "ACTIVE" as const };
  const processing = { contextVersion: "phase3b-synthetic-processing-v1", subject, consent: GRANTED_CONSENT, builderPolicyVersion: input.builderPolicyVersion, lifecycleState: "ACTIVE" as const, retentionClass: "UNRESOLVED_PRIVACY_POLICY", retentionDurationDefined: false as const, verifiedAt: PHASE3B_INTERPRETED_AT, journeyAuthorityContextVersion: "phase3b-synthetic-journey-authority-v1", acceptedJourneyPolicyVersions: ["phase3b-synthetic-journey-policy-v1"], correctionAuthority: "SERVER_EVENT_LEDGER" as const, acceptedCorrectionPolicyVersions: ["phase3b-synthetic-correction-policy-v1"] };
  const authority: EvidenceAuthorityContext = { getProcessingAuthority: () => processing, listJourneyResolutions: () => resolutions, listWorldEvidence: () => worlds, listContextEvidence: () => contexts, listCorrectionRecords: () => corrections };
  return { source: { phase2: buildEvidenceChains(input, authority), authority }, events };
}

export function syntheticCalibrationEvidence(input: {
  readonly id: string; readonly eventType: CalibrationEventType; readonly journey?: string | null; readonly spot?: string | null;
  readonly concepts?: readonly { readonly registryVersion: string; readonly registryHash?: string; readonly conceptId: string; readonly certainty: CalibrationEvidence["worldConcepts"][number]["certainty"] }[];
  readonly context?: CalibrationEvidence["context"]; readonly occurredAt?: string;
}): CalibrationEvidence {
  if (input.eventType === "CORRECTION") throw new Error("use_syntheticCorrectionPair_for_phase2_ledger_binding");
  const { source, events } = buildSource([input]);
  const evidence = deriveCalibrationEvidenceFromPhase2({ phase2: source.phase2, eventId: events[0]!.eventId, ...(input.eventType === "REPEAT_VISIT" ? { variant: "REPEAT_VISIT" as const } : {}) }, source.authority);
  sourceByRecordId.set(evidence.recordId, source);
  return evidence;
}

export function syntheticCorrectionPair(targetInput: Parameters<typeof syntheticCalibrationEvidence>[0], correctionId: string): readonly [CalibrationEvidence, CalibrationEvidence] {
  const targetEvent = canonicalEvent(targetInput);
  const correctionInput = { id: correctionId, eventType: "CORRECTION" as const, ...(targetInput.journey !== undefined ? { journey: targetInput.journey } : {}), spot: null, occurredAt: "2026-01-21T12:00:00.000Z" };
  const { source, events } = buildSource([correctionInput], targetEvent, targetInput);
  const target = deriveCalibrationEvidenceFromPhase2({ phase2: source.phase2, eventId: targetEvent.eventId }, source.authority);
  const correction = deriveCalibrationEvidenceFromPhase2({ phase2: source.phase2, eventId: events.find(({ eventType }) => eventType === "USER_CORRECTION")!.eventId }, source.authority);
  sourceByRecordId.set(target.recordId, source); sourceByRecordId.set(correction.recordId, source);
  return [target, correction] as const;
}

const context = (name: string): NonNullable<CalibrationEvidence["context"]> => ({ contextHash: contentHash({ context: name }), dimensions: [`company.${name}`], authority: "EXPLICIT_USER" });
const positive = (id: string, journey = `journey-${id}`, spot = "synthetic-spot-a", extra: Partial<Parameters<typeof syntheticCalibrationEvidence>[0]> = {}) => syntheticCalibrationEvidence({ id, eventType: "EXPLICIT_SATISFACTION", journey, spot, ...extra });
const negative = (id: string, journey = `journey-${id}`, spot = "synthetic-spot-a", extra: Partial<Parameters<typeof syntheticCalibrationEvidence>[0]> = {}) => syntheticCalibrationEvidence({ id, eventType: "EXPLICIT_DISSATISFACTION", journey, spot, ...extra });
const scenario = (id: string, evidence: readonly CalibrationEvidence[], options: { lifecycle?: CalibrationScenario["lifecycle"]; killSwitch?: boolean } = {}): CalibrationScenario => {
  const lifecycle = options.lifecycle ?? "ACTIVE";
  const body = { contractVersion: CONTRACT_VERSIONS.calibrationScenario, scenarioId: id, title: id, subjectBindingHash: lifecycle === "ACTIVE" ? PHASE3B_SYNTHETIC_SUBJECT : null, lifecycle, killSwitch: options.killSwitch ?? false, interpretedAt: PHASE3B_INTERPRETED_AT, evidence: lifecycle === "ACTIVE" ? evidence : [] };
  return withCalibrationScenarioHash(body);
};

const sameJourney = "journey-same-three";
const [correctionTarget, correctionRecord] = syntheticCorrectionPair({ id: "correction-target", eventType: "EXPLICIT_SATISFACTION", journey: "journey-correction" }, "correction-record");
const offlineOriginal = positive("offline-original", "journey-offline", "synthetic-spot-offline", { occurredAt: "2025-12-15T12:00:00.000Z" });
const manyOpens = Array.from({ length: 128 }, (_, index) => syntheticCalibrationEvidence({ id: `bulk-open-${index}`, eventType: "OPENED", journey: "journey-bulk", spot: "synthetic-spot-bulk" }));

export const PHASE3B_CALIBRATION_SCENARIOS: readonly CalibrationScenario[] = Object.freeze([
  scenario("01-cold-start-user", []),
  scenario("02-single-save", [syntheticCalibrationEvidence({ id: "single-save", eventType: "SAVED" })]),
  scenario("03-save-and-remove", [syntheticCalibrationEvidence({ id: "save-first", eventType: "SAVED", journey: "journey-save-state" }), syntheticCalibrationEvidence({ id: "save-remove", eventType: "SAVE_REMOVED", journey: "journey-save-state" })]),
  scenario("04-navigation-without-visit", [syntheticCalibrationEvidence({ id: "navigation", eventType: "NAVIGATION_STARTED" })]),
  scenario("05-visit-without-satisfaction", [syntheticCalibrationEvidence({ id: "visit-neutral", eventType: "VISITED" })]),
  scenario("06-review-without-satisfaction", [syntheticCalibrationEvidence({ id: "review-neutral", eventType: "STANDARD_REVIEW" })]),
  scenario("07-standard-versus-smart-review", [syntheticCalibrationEvidence({ id: "review-standard", eventType: "STANDARD_REVIEW", journey: "journey-review-standard" }), syntheticCalibrationEvidence({ id: "review-smart", eventType: "SMART_REVIEW", journey: "journey-review-smart" })]),
  scenario("08-explicit-satisfaction", [positive("positive-one")]),
  scenario("09-explicit-dissatisfaction", [negative("negative-one")]),
  scenario("10-positive-and-negative-parallel", [positive("mixed-positive", "journey-mixed-positive"), negative("mixed-negative", "journey-mixed-negative")]),
  scenario("11-three-events-same-journey", [syntheticCalibrationEvidence({ id: "same-shown", eventType: "SHOWN", journey: sameJourney }), syntheticCalibrationEvidence({ id: "same-opened", eventType: "OPENED", journey: sameJourney }), positive("same-positive", sameJourney)]),
  scenario("12-three-independent-visits", [syntheticCalibrationEvidence({ id: "visit-independent-a", eventType: "VISITED" }), syntheticCalibrationEvidence({ id: "visit-independent-b", eventType: "VISITED" }), syntheticCalibrationEvidence({ id: "visit-independent-c", eventType: "VISITED" })]),
  scenario("13-repeat-same-spot", [syntheticCalibrationEvidence({ id: "repeat-a", eventType: "REPEAT_VISIT", journey: "journey-repeat-a" }), syntheticCalibrationEvidence({ id: "repeat-b", eventType: "REPEAT_VISIT", journey: "journey-repeat-b" }), syntheticCalibrationEvidence({ id: "repeat-c", eventType: "REPEAT_VISIT", journey: "journey-repeat-c" })]),
  scenario("14-many-spots-same-concept", [positive("concept-spot-a", "journey-concept-a", "spot-a"), positive("concept-spot-b", "journey-concept-b", "spot-b"), positive("concept-spot-c", "journey-concept-c", "spot-c")]),
  scenario("15-one-spot-many-concepts", [positive("multi-concept", "journey-multi-concept", "spot-multi", { concepts: [{ registryVersion: PHASE3B_SYNTHETIC_REGISTRY, conceptId: "vibe.synthetic-cozy", certainty: "SUPPORTED" }, { registryVersion: PHASE3B_SYNTHETIC_REGISTRY, conceptId: "environment.synthetic-outdoor", certainty: "VERIFIED" }, { registryVersion: PHASE3B_SYNTHETIC_REGISTRY, conceptId: "place.synthetic-cafe", certainty: "SUPPORTED" }] })]),
  scenario("16-context-flip", [positive("context-friends", "journey-context-friends", "spot-context", { context: context("friends") }), negative("context-alone", "journey-context-alone", "spot-context", { context: context("alone") })]),
  scenario("17-long-term-versus-current-context", [positive("long-term-no-context", "journey-long-term"), negative("current-context", "journey-current-context", "synthetic-spot-a", { context: context("friends") })]),
  scenario("18-practical-versus-concept", [syntheticCalibrationEvidence({ id: "practical-navigation", eventType: "NAVIGATION_STARTED", journey: "journey-practical" }), positive("practical-positive", "journey-practical-positive")]),
  scenario("19-direct-spot-no-concept", [syntheticCalibrationEvidence({ id: "direct-save", eventType: "SAVED", concepts: [] })]),
  scenario("20-aversion-strong-evidence", [negative("aversion-a", "journey-aversion-a"), negative("aversion-b", "journey-aversion-b"), negative("aversion-c", "journey-aversion-c")]),
  scenario("21-missing-evidence", []),
  scenario("22-conflicting-evidence", [positive("conflict-positive", "journey-conflict-positive"), negative("conflict-negative", "journey-conflict-negative")]),
  scenario("23-correction", [correctionTarget, correctionRecord]),
  scenario("24-late-offline-event-and-retry", [offlineOriginal]),
  scenario("25-policy-change-full-rebuild", [positive("policy-rebuild", "journey-policy-rebuild", "synthetic-spot-policy", { context: context("friends") })]),
  scenario("26-exploration-versus-familiarity", [syntheticCalibrationEvidence({ id: "familiar-repeat", eventType: "REPEAT_VISIT", context: context("friends") })]),
  scenario("27-uncertain-world-attribution", [positive("uncertain-world", "journey-uncertain", "synthetic-spot-uncertain", { concepts: [{ registryVersion: PHASE3B_SYNTHETIC_REGISTRY, conceptId: "vibe.synthetic-cozy", certainty: "CONFLICTING" }] })]),
  scenario("28-consent-withdrawal", [], { lifecycle: "WITHDRAWN" }),
  scenario("29-full-reset", [], { lifecycle: "RESET" }),
  scenario("30-account-erasure", [], { lifecycle: "ERASED" }),
  scenario("31-commercial-counterfactual", [positive("commercial-neutral")]),
  scenario("32-large-low-diversity", manyOpens),
  scenario("33-no-consent", [], { lifecycle: "NO_CONSENT" }),
  scenario("34-kill-switch", [], { killSwitch: true }),
]);

export function syntheticTrustForScenario(value: CalibrationScenario) {
  const anchors = value.evidence.map((evidence) => {
    if (!sourceByRecordId.has(evidence.recordId)) throw new Error(`missing_phase2_fixture_source:${evidence.recordId}`);
    return createSyntheticEvidenceEvaluationAnchor(evidence);
  });
  return createSyntheticCalibrationTrustContext(value.evidence, anchors);
}

export function syntheticTrustForEvidence(...evidence: readonly CalibrationEvidence[]) {
  return syntheticTrustForScenario(withCalibrationScenarioHash({ contractVersion: CONTRACT_VERSIONS.calibrationScenario, scenarioId: "synthetic-evidence-trust", title: "synthetic-evidence-trust", subjectBindingHash: PHASE3B_SYNTHETIC_SUBJECT, lifecycle: "ACTIVE", killSwitch: false, interpretedAt: PHASE3B_INTERPRETED_AT, evidence }));
}

export function syntheticPhase2SourceForEvidence(recordId: string): FixtureSource | undefined { return sourceByRecordId.get(recordId); }
