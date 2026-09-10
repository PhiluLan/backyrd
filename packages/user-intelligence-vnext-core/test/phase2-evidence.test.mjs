import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEvidenceLifecycle, buildEvidenceChains, CANONICAL_EVENT_CATALOG, canonicalJson, contentHash,
  CONTRACT_VERSIONS, deduplicateCanonicalEvents, GRANTED_CONSENT, NO_CONSENT, parseEvidenceEngineState,
  resolveEventTimeWorldEvidence, resolveJourney, SYNTHETIC_EVENTS, SYNTHETIC_SUBJECT_BINDING_HASH,
  SYNTHETIC_USER_A, SYNTHETIC_USER_B, syntheticEvent, updateEvidenceChains, verifyEvidenceChainV2, verifyEvidenceEngineState,
  verifyEvidenceLifecycleCompletion, withContextEvidenceHash, withCorrectionResolutionHash, withEventHash, withJourneyAuthorityRecordHash, withWorldEvidenceHash,
} from "../dist/index.js";

const POLICY = "synthetic-phase2-builder-policy-v1";
const JOURNEY_POLICY = "synthetic-phase2-journey-policy-v1";
const INPUT_VERSION = CONTRACT_VERSIONS.evidenceBuilderInput;
const at = (second) => `2026-01-15T12:00:${String(second).padStart(2, "0")}.000Z`;

function event(source, changes = {}) {
  const base = { ...source, ...changes };
  delete base.eventHash;
  return withEventHash(base);
}

function timed(source, second, changes = {}) {
  return event(source, { occurredAt: at(second), observedAt: at(second), ingestedAt: at(second), ...changes });
}

function resolutionFor(value, options = {}) {
  let links = options.links;
  let records = options.records;
  if (!links) {
    if (value.journey.resolution === "UNRESOLVED") { links = []; records = []; }
    else {
      const matchedBy = value.references.decisionId ? "DECISION" : value.references.sessionId ? "SESSION" : "EXPERIENCE";
      const recordBody = { recordId: `journey-record-${value.eventId}`, authority: "SERVER_PRODUCT_TRUTH", policyVersion: JOURNEY_POLICY, boundUserId: value.userId, journeyId: value.journey.journeyId, spotId: value.references.spotId ?? null, decisionId: value.references.decisionId ?? null, sessionId: value.references.sessionId ?? null, experienceEventId: value.references.experienceEventId ?? null, validUntil: "2027-01-01T00:00:00.000Z" };
      const record = withJourneyAuthorityRecordHash(recordBody); records = [record];
      links = [{ kind: "EXISTING_JOURNEY", authority: "SERVER_PRODUCT_TRUTH", recordId: record.recordId, recordHash: record.recordHash, policyVersion: JOURNEY_POLICY, boundUserId: value.userId, journeyId: value.journey.journeyId, matchedBy, ...(record.decisionId ? { decisionId: record.decisionId } : {}), ...(record.sessionId ? { sessionId: record.sessionId } : {}), ...(record.spotId ? { spotId: record.spotId } : {}), ...(record.experienceEventId ? { experienceEventId: record.experienceEventId } : {}) }];
    }
  }
  const registry = new Map((records ?? []).map((record) => [record.recordId, record]));
  const verifier = options.verifier ?? { contextVersion: "synthetic-journey-authority-v1", verifiedAt: "2026-01-15T12:00:00.000Z", acceptedPolicyVersions: [JOURNEY_POLICY], findRecord: (recordId) => registry.get(recordId) ?? null };
  return resolveJourney({ contractVersion: CONTRACT_VERSIONS.journeyResolution, policyVersion: JOURNEY_POLICY, boundUserId: value.userId, subjectBindingHash: SYNTHETIC_SUBJECT_BINDING_HASH, event: { eventId: value.eventId, occurredAt: value.occurredAt, references: value.references }, links }, verifier);
}

function worldFor(value, suffix = "historical") {
  return withWorldEvidenceHash({ contractVersion: CONTRACT_VERSIONS.worldEvidenceConsumer, bindingId: `world-${value.eventId}-${suffix}`, eventId: value.eventId, eventHash: value.eventHash, spotId: value.references.spotId, bindingScope: "EVENT_TIME_WORLD", worldRegistryVersion: "synthetic-world-registry-v1", worldRegistryHash: contentHash("synthetic-world-registry-v1"), stateKind: "EVENT_TIME_SNAPSHOT", stateHash: contentHash(`world-state-${suffix}`), evidenceAt: value.occurredAt, resolvedAt: value.occurredAt, references: [{ referenceId: "vibe.synthetic-quiet", kind: "CONCEPT", trust: "SUPPORTED", freshness: "CURRENT_AT_EVENT", provenanceSummary: "synthetic-source-summary" }], conflicts: [], unknowns: ["outdoor-status"], exclusions: ["subjective-fit"] });
}

function contextFor(value, source = "USER_EXPLICIT") {
  return withContextEvidenceHash({ contractVersion: CONTRACT_VERSIONS.contextEvidence, bindingId: `context-${value.eventId}-${source}`, eventId: value.eventId, eventHash: value.eventHash, bindingScope: "EVENT_TIME_CONTEXT", source, contextContractVersion: "synthetic-context-v1", contextHash: contentHash(`context-${source}`), evidenceAt: value.occurredAt, dimensions: source === "UNKNOWN" ? [] : [source === "CAUTIOUSLY_INFERRED" ? "inferred-daypart" : "declared-company"], rawLocationIncluded: false, privateSocialDataIncluded: false, longTermTasteEligible: false, limitations: ["not-long-term-taste"] });
}

function correctionFor(correction, target, correctionSpotId = target.references.spotId ?? null) {
  return withCorrectionResolutionHash({ contractVersion: CONTRACT_VERSIONS.correctionResolution, recordId: `correction-record-${correction.eventId}`, authority: "SERVER_EVENT_LEDGER", correctionEventId: correction.eventId, targetEventId: target.eventId, boundUserId: correction.userId, targetUserId: target.userId, targetSpotId: target.references.spotId ?? null, correctionSpotId, targetOccurredAt: target.occurredAt, policyVersion: "synthetic-correction-policy-v1", validUntil: "2027-01-01T00:00:00.000Z" });
}

function input(events, options = {}) {
  const suppressed = (options.consent ?? GRANTED_CONSENT).state !== "GRANTED" || (options.lifecycleState ?? "ACTIVE") !== "ACTIVE";
  return {
    contractVersion: INPUT_VERSION, builderPolicyVersion: POLICY,
    subject: { boundUserId: options.boundUserId ?? SYNTHETIC_USER_A, subjectBindingHash: SYNTHETIC_SUBJECT_BINDING_HASH, authority: "SERVER_AUTHENTICATION", userIdExternallyExposed: false },
    consent: options.consent ?? GRANTED_CONSENT, events,
    journeyResolutions: options.journeyResolutions ?? (suppressed ? [] : events.map((value) => resolutionFor(value))),
    worldEvidence: options.worldEvidence ?? [], contextEvidence: options.contextEvidence ?? [], corrections: options.corrections ?? [], lifecycleState: options.lifecycleState ?? "ACTIVE",
  };
}

function authorityFor(value, overrides = {}) {
  const processing = overrides.processing ?? { contextVersion: "synthetic-evidence-authority-v1", subject: value.subject, consent: value.consent, builderPolicyVersion: value.builderPolicyVersion, lifecycleState: value.lifecycleState, retentionClass: "UNRESOLVED_PRIVACY_POLICY", retentionDurationDefined: false, verifiedAt: "2026-01-15T12:00:00.000Z", journeyAuthorityContextVersion: "synthetic-journey-authority-v1", acceptedJourneyPolicyVersions: [JOURNEY_POLICY], correctionAuthority: "SERVER_EVENT_LEDGER", acceptedCorrectionPolicyVersions: ["synthetic-correction-policy-v1"] };
  return {
    getProcessingAuthority: () => processing,
    listJourneyResolutions: () => overrides.journeyResolutions ?? value.journeyResolutions,
    listWorldEvidence: () => overrides.worldEvidence ?? value.worldEvidence,
    listContextEvidence: () => overrides.contextEvidence ?? value.contextEvidence,
    listCorrectionRecords: () => overrides.corrections ?? value.corrections,
  };
}

function build(value, overrides = {}) { return buildEvidenceChains(value, authorityFor(value, overrides)); }

test("the versioned catalog distinguishes every required semantic class and leaves ambiguous product events unconfigured", () => {
  const classes = new Set(Object.values(CANONICAL_EVENT_CATALOG).map((entry) => entry.semanticClass));
  for (const required of ["EXPOSURE", "INTERACTION", "SEARCH", "INTENT", "DECISION", "EXPERIENCE", "SATISFACTION", "STATE_CHANGE", "CORRECTION", "SOCIAL_OBSERVATION"]) assert.equal(classes.has(required), true);
  assert.equal(CANONICAL_EVENT_CATALOG.DWELL_OBSERVED.status, "NOT_CONFIGURED");
  assert.equal(CANONICAL_EVENT_CATALOG.QUICK_SKIP_OBSERVED.forbiddenInterpretations.includes("QUICK_SKIP_IS_DISLIKE"), true);
  assert.equal(CANONICAL_EVENT_CATALOG.SAVE_REMOVED.forbiddenInterpretations.includes("REMOVAL_IS_DISLIKE"), true);
  assert.equal(CANONICAL_EVENT_CATALOG.REVIEW_RECORDED.forbiddenInterpretations.includes("SMART_REVIEW_HAS_DIFFERENT_LEARNING"), true);
  assert.equal(CANONICAL_EVENT_CATALOG.SHARE_RECORDED.status, "NOT_CONFIGURED");
  assert.equal(CANONICAL_EVENT_CATALOG.FOLLOW_RECORDED.forbiddenInterpretations.includes("FOLLOW_IS_TASTE_SIMILARITY"), true);
});

test("journey resolution is deterministic, server-bound and never merges from same spot alone", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 1);
  const same = resolutionFor(opened); assert.equal(same.status, "SAME_JOURNEY"); assert.equal(same.journeyId, opened.journey.journeyId);
  assert.deepEqual(resolutionFor(opened), same);
  const correlationRecord = withJourneyAuthorityRecordHash({ recordId: "correlation-record", authority: "SERVER_PRODUCT_TRUTH", policyVersion: JOURNEY_POLICY, boundUserId: SYNTHETIC_USER_A, journeyId: null, spotId: opened.references.spotId, decisionId: opened.references.decisionId, sessionId: opened.references.sessionId, experienceEventId: null, validUntil: "2027-01-01T00:00:00.000Z" });
  const probable = resolutionFor(opened, { records: [correlationRecord], links: [{ kind: "CORRELATION_ONLY", authority: "SERVER_PRODUCT_TRUTH", recordId: correlationRecord.recordId, recordHash: correlationRecord.recordHash, policyVersion: JOURNEY_POLICY, boundUserId: SYNTHETIC_USER_A, basis: "SAME_SPOT_ONLY", spotId: opened.references.spotId, decisionId: opened.references.decisionId, sessionId: opened.references.sessionId }] });
  assert.equal(probable.status, "PROBABLE_RELATED"); assert.equal(probable.journeyId, null); assert.equal(probable.independenceEligible, false);
  const unresolved = resolutionFor(event(SYNTHETIC_EVENTS.open, { journey: { resolution: "UNRESOLVED", journeyId: null, resolutionPolicyVersion: JOURNEY_POLICY, independenceEligible: false } }));
  assert.equal(unresolved.status, "UNRESOLVED");
  const independentRecord = withJourneyAuthorityRecordHash({ recordId: "independent-record", authority: "VERIFIED_OUTCOME", policyVersion: JOURNEY_POLICY, boundUserId: SYNTHETIC_USER_A, journeyId: null, spotId: opened.references.spotId, decisionId: null, sessionId: null, experienceEventId: "experience-independent", validUntil: "2027-01-01T00:00:00.000Z" });
  const independentEvent = timed(SYNTHETIC_EVENTS.visit, 2, { eventId: "visit-independent", idempotencyKey: "visit-independent", source: { ...SYNTHETIC_EVENTS.visit.source, sourceRecordId: "visit-independent" }, references: { spotId: opened.references.spotId, experienceEventId: "experience-independent" }, journey: { resolution: "SERVER_RESOLVED", journeyId: `journey-${contentHash({ subjectBindingHash: SYNTHETIC_SUBJECT_BINDING_HASH, eventId: "visit-independent", policyVersion: JOURNEY_POLICY, records: [independentRecord.recordHash] })}`, resolutionPolicyVersion: JOURNEY_POLICY, independenceEligible: true } });
  const independent = resolutionFor(independentEvent, { records: [independentRecord], links: [{ kind: "INDEPENDENT_EXPERIENCE", authority: "VERIFIED_OUTCOME", recordId: independentRecord.recordId, recordHash: independentRecord.recordHash, policyVersion: JOURNEY_POLICY, boundUserId: SYNTHETIC_USER_A, spotId: independentEvent.references.spotId, experienceEventId: "experience-independent" }] });
  assert.equal(independent.status, "INDEPENDENT_NEW_JOURNEY"); assert.equal(independent.independenceEligible, true);
  const forged = { kind: "EXISTING_JOURNEY", authority: "SERVER_PRODUCT_TRUTH", recordId: "forged", recordHash: contentHash("forged"), policyVersion: JOURNEY_POLICY, boundUserId: SYNTHETIC_USER_B, journeyId: "foreign-journey", matchedBy: "DECISION", decisionId: opened.references.decisionId };
  assert.throws(() => resolutionFor(opened, { links: [forged], records: [] }), /absent from the injected server verifier/);
});

test("journey authority rejects forged product truth, outcome, policy and bound references", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 1);
  const baseBody = { recordId: "server-record-open", authority: "SERVER_PRODUCT_TRUTH", policyVersion: JOURNEY_POLICY, boundUserId: opened.userId, journeyId: opened.journey.journeyId, spotId: opened.references.spotId, decisionId: opened.references.decisionId, sessionId: opened.references.sessionId, experienceEventId: null, validUntil: "2027-01-01T00:00:00.000Z" };
  const record = withJourneyAuthorityRecordHash(baseBody);
  const link = { kind: "EXISTING_JOURNEY", authority: "SERVER_PRODUCT_TRUTH", recordId: record.recordId, recordHash: record.recordHash, policyVersion: JOURNEY_POLICY, boundUserId: opened.userId, journeyId: opened.journey.journeyId, matchedBy: "DECISION", spotId: opened.references.spotId, decisionId: opened.references.decisionId, sessionId: opened.references.sessionId };
  assert.equal(resolutionFor(opened, { links: [link], records: [record] }).status, "SAME_JOURNEY");
  const forgedHash = contentHash("self-declared-product-truth");
  assert.throws(() => resolutionFor(opened, { links: [{ ...link, recordId: "forged-product", recordHash: forgedHash }], records: [] }), /absent/);
  assert.throws(() => resolutionFor(opened, { links: [{ kind: "INDEPENDENT_EXPERIENCE", authority: "VERIFIED_OUTCOME", recordId: "forged-outcome", recordHash: contentHash("forged-outcome"), policyVersion: JOURNEY_POLICY, boundUserId: opened.userId, spotId: opened.references.spotId, experienceEventId: "forged-experience" }], records: [] }), /absent/);
  for (const changed of [
    { boundUserId: SYNTHETIC_USER_B }, { spotId: "foreign-spot" }, { decisionId: "foreign-decision" }, { sessionId: "foreign-session" }, { experienceEventId: "foreign-experience" },
  ]) {
    const foreign = withJourneyAuthorityRecordHash({ ...baseBody, ...changed });
    assert.throws(() => resolutionFor(opened, { links: [link], records: [foreign] }), /differs from the authoritative|another user/);
  }
  assert.throws(() => resolutionFor(opened, { links: [{ ...link, policyVersion: "unknown-policy" }], records: [record] }), /policy version/);
  assert.throws(() => resolutionFor(opened, { links: [{ ...link, authority: "VERIFIED_OUTCOME" }], records: [record] }), /no union variant matched/);
  const expired = withJourneyAuthorityRecordHash({ ...baseBody, validUntil: "2026-01-01T00:00:00.000Z" });
  assert.throws(() => resolutionFor(opened, { links: [{ ...link, recordHash: expired.recordHash }], records: [expired] }), /expired/);
});

test("dedupe handles event id, retries, offline delivery and review-origin parity without merging real journeys", () => {
  const save = timed(SYNTHETIC_EVENTS.save, 3);
  assert.equal(deduplicateCanonicalEvents([save, save]).events.length, 1);
  const retry = event(save, { eventId: "event-save-retry" });
  assert.equal(deduplicateCanonicalEvents([save, retry]).records[0].reason, "SAME_IDEMPOTENCY_KEY");
  const offlineRetry = event(save, { eventId: "event-save-offline-retry", observedAt: at(5), ingestedAt: at(6), temporalBinding: { ...save.temporalBinding, timeAuthority: "CLIENT_REPORTED_ACCEPTED_OFFLINE" } });
  assert.equal(deduplicateCanonicalEvents([save, offlineRetry]).events.length, 1);
  const standard = timed(SYNTHETIC_EVENTS.standardReview, 7, { source: { ...SYNTHETIC_EVENTS.standardReview.source, sourceRecordId: "review-product-1" } });
  const smart = timed(SYNTHETIC_EVENTS.smartReview, 7, { eventId: "event-smart-review-copy", idempotencyKey: "smart-review-copy", source: { ...SYNTHETIC_EVENTS.smartReview.source, producer: "smart-review", sourceRecordId: "review-product-1" } });
  const reviews = deduplicateCanonicalEvents([standard, smart]); assert.equal(reviews.events.length, 1); assert.equal(reviews.records[0].reason, "SAME_REVIEW_PRODUCT_RECORD");
  const standardSemantics = CANONICAL_EVENT_CATALOG[standard.eventType]; const smartSemantics = CANONICAL_EVENT_CATALOG[smart.eventType]; assert.deepEqual(standardSemantics, smartSemantics);
  const crossJourneyReview = event(smart, { eventId: "review-cross-journey", idempotencyKey: "review-cross-journey", journey: { ...smart.journey, journeyId: "other-review-journey" } });
  assert.throws(() => deduplicateCanonicalEvents([standard, crossJourneyReview]), /cannot authorize multiple journeys/);
  const repeat = event(save, { eventId: "event-save-new-journey", idempotencyKey: "save-new-journey", source: { ...save.source, sourceRecordId: "save-new-journey" }, journey: { ...save.journey, journeyId: "synthetic-journey-2" } });
  assert.equal(deduplicateCanonicalEvents([save, repeat]).events.length, 2);
});

test("builder separates raw events from evidence and preserves neutral, experience and satisfaction semantics", () => {
  const exposure = timed(SYNTHETIC_EVENTS.exposure, 1); const opened = timed(SYNTHETIC_EVENTS.open, 2); const save = timed(SYNTHETIC_EVENTS.save, 3); const remove = timed(SYNTHETIC_EVENTS.remove, 4); const navigation = timed(SYNTHETIC_EVENTS.navigation, 5); const visit = timed(SYNTHETIC_EVENTS.visit, 6); const review = timed(SYNTHETIC_EVENTS.standardReview, 7); const positive = timed(SYNTHETIC_EVENTS.positive, 8);
  const result = build(input([positive, opened, exposure, review, save, navigation, visit, remove], { worldEvidence: [worldFor(visit)], contextEvidence: [contextFor(visit, "USER_EXPLICIT"), contextFor(navigation, "CAUTIOUSLY_INFERRED")] }));
  assert.equal(result.state.chains.length, 1); const chain = result.state.chains[0];
  assert.equal(chain.slots.exposure[0].direction, "NOT_APPLICABLE"); assert.equal(chain.slots.interaction[0].direction, "NOT_APPLICABLE");
  assert.equal(chain.slots.stateChange.length, 2); assert.equal(chain.slots.stateChange.every((item) => item.direction === "NOT_APPLICABLE"), true);
  assert.equal(chain.slots.experience.length, 2); assert.equal(chain.slots.experience.every((item) => item.direction === "NOT_APPLICABLE"), true);
  assert.equal(chain.slots.satisfaction[0].direction, "POSITIVE"); assert.equal(chain.independence.independentExperienceUnits, 1);
  assert.equal("userId" in chain.subject, false); assert.equal(chain.contextEvidence.some((row) => row.source === "CAUTIOUSLY_INFERRED"), true);
  assert.equal(chain.limitations.includes("NO_TASTE_SCORE"), true); assert.equal(chain.limitations.includes("NO_ATTRIBUTION"), true); assert.equal(chain.limitations.includes("CURRENT_CONTEXT_NOT_LONG_TERM_TASTE"), true);
  assert.equal(canonicalJson(result).includes("reviewOrigin"), true); // retained only in the internal canonical ledger, never copied into chain slots
  assert.equal(canonicalJson(chain).includes("reviewOrigin"), false); assert.equal(canonicalJson(chain).includes("factor"), false);
  const negative = timed(SYNTHETIC_EVENTS.negative, 9); assert.equal(build(input([negative])).state.chains[0].slots.satisfaction[0].direction, "NEGATIVE");
});

test("review without satisfaction and navigation without visit remain explicit limitations", () => {
  const review = timed(SYNTHETIC_EVENTS.smartReview, 4); const navigation = timed(SYNTHETIC_EVENTS.navigation, 3);
  const chain = build(input([review, navigation])).state.chains[0];
  assert.equal(chain.slots.satisfaction.length, 0); assert.equal(chain.slots.experience.length, 1); assert.equal(chain.slots.intent.length, 1);
  assert.equal(chain.limitations.includes("REVIEW_IS_SATISFACTION"), true); assert.equal(chain.limitations.includes("NAVIGATION_IS_VISIT"), true);
});

test("no consent, withdrawal and cold-user paths create no personalizable evidence", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 1);
  const denied = build(input([opened], { consent: NO_CONSENT })); assert.equal(denied.state.status, "SUPPRESSED_NO_CONSENT"); assert.deepEqual(denied.state.chains, []); assert.equal(denied.state.subjectBindingHash, null); assert.equal(denied.rebuildMaterial, null); assert.equal(canonicalJson(denied).includes(SYNTHETIC_USER_A), false);
  const withdrawn = build(input([opened], { lifecycleState: "WITHDRAWN" })); assert.equal(withdrawn.state.status, "WITHDRAWN"); assert.deepEqual(withdrawn.acceptedEvents, []); assert.equal(withdrawn.rebuildMaterial, null);
  const cold = build(input([])); assert.equal(cold.state.status, "ACTIVE"); assert.deepEqual(cold.state.chains, []);
});

test("corrections are append-only, deactivate targets and reject cross-user and cross-spot authority", () => {
  const positive = timed(SYNTHETIC_EVENTS.positive, 2); const correction = timed(SYNTHETIC_EVENTS.correction, 5, { journey: { resolution: "UNRESOLVED", journeyId: null, resolutionPolicyVersion: JOURNEY_POLICY, independenceEligible: false }, supersedesEventId: positive.eventId, payload: { kind: "CORRECTION", targetEventId: positive.eventId, correction: "RETRACT" } });
  const authority = correctionFor(correction, positive);
  const result = build(input([positive, correction], { corrections: [authority] })); const chain = result.state.chains[0];
  assert.equal(chain.slots.satisfaction[0].active, false); assert.equal(chain.slots.correction[0].active, true); assert.equal(chain.corrections.length, 1); assert.equal(result.acceptedEvents.length, 2);
  assert.throws(() => build(input([positive, correction], { corrections: [correctionFor(correction, positive, "foreign-spot")] })), /cross-spot/);
  const foreignTarget = event(positive, { userId: SYNTHETIC_USER_B, authority: { ...positive.authority, boundUserId: SYNTHETIC_USER_B }, referenceResolution: { ...positive.referenceResolution, boundUserId: SYNTHETIC_USER_B } });
  assert.throws(() => build(input([foreignTarget, correction], { corrections: [correctionFor(correction, foreignTarget)], boundUserId: SYNTHETIC_USER_A })), /identity|cross-user/);
});

test("correction payload cannot self-declare ledger authority", () => {
  const target = timed(SYNTHETIC_EVENTS.positive, 2); const correction = timed(SYNTHETIC_EVENTS.correction, 5, { journey: { resolution: "UNRESOLVED", journeyId: null, resolutionPolicyVersion: JOURNEY_POLICY, independenceEligible: false }, supersedesEventId: target.eventId, payload: { kind: "CORRECTION", targetEventId: target.eventId, correction: "RETRACT" } });
  const trusted = correctionFor(correction, target); const value = input([target, correction], { corrections: [trusted] });
  assert.throws(() => buildEvidenceChains(value, authorityFor(value, { corrections: [] })), /one-to-one match/);
  const { resolutionRecordHash: trustedHash, ...trustedBody } = trusted; void trustedHash;
  const manipulated = withCorrectionResolutionHash({ ...trustedBody, targetEventId: "invented-target" });
  assert.throws(() => buildEvidenceChains({ ...value, corrections: [manipulated] }, authorityFor(value)), /one-to-one match/);
  const expired = withCorrectionResolutionHash({ ...trustedBody, validUntil: "2026-01-01T00:00:00.000Z" });
  const expiredInput = { ...value, corrections: [expired] };
  assert.throws(() => buildEvidenceChains(expiredInput, authorityFor(expiredInput)), /expired/);
  const wrongPolicyAuthority = authorityFor(value).getProcessingAuthority();
  assert.throws(() => buildEvidenceChains(value, authorityFor(value, { processing: { ...wrongPolicyAuthority, acceptedCorrectionPolicyVersions: ["unknown-correction-policy"] } })), /not accepted/);
  assert.throws(() => buildEvidenceChains({ ...value, corrections: [{ ...trusted, authority: "SERVER_PRODUCT_TRUTH" }] }, authorityFor(value)), /SERVER_EVENT_LEDGER/);
});

test("authority collections reject duplicate, conflicting and orphan bindings before maps can overwrite", () => {
  const visit = timed(SYNTHETIC_EVENTS.visit, 5); const world = worldFor(visit); const context = contextFor(visit); const valid = input([visit], { worldEvidence: [world], contextEvidence: [context] });
  const duplicateWorld = { ...valid, worldEvidence: [world, world] };
  assert.throws(() => buildEvidenceChains(duplicateWorld, authorityFor(duplicateWorld)), /duplicate or conflicting identity/);
  const duplicateContext = { ...valid, contextEvidence: [context, context] };
  assert.throws(() => buildEvidenceChains(duplicateContext, authorityFor(duplicateContext)), /duplicate or conflicting identity/);
  const opened = timed(SYNTHETIC_EVENTS.open, 6); const orphanResolution = resolutionFor(opened);
  assert.throws(() => buildEvidenceChains(valid, authorityFor(valid, { journeyResolutions: [...valid.journeyResolutions, orphanResolution] })), /one-to-one match/);
  const { bindingHash: worldHash, ...worldBody } = world; void worldHash;
  const conflictingWorld = withWorldEvidenceHash({ ...worldBody, bindingId: "world-conflict", stateHash: contentHash("conflicting-world") });
  const conflictingInput = { ...valid, worldEvidence: [world, conflictingWorld] };
  assert.throws(() => buildEvidenceChains(conflictingInput, authorityFor(conflictingInput)), /duplicate or conflicting identity/);
  const wrongJourneyAuthority = authorityFor(valid).getProcessingAuthority();
  assert.throws(() => buildEvidenceChains(valid, authorityFor(valid, { processing: { ...wrongJourneyAuthority, journeyAuthorityContextVersion: "unknown-journey-authority" } })), /not accepted/);
});

test("event-time world evidence is historically stable and provider bindings fail closed", () => {
  const visit = timed(SYNTHETIC_EVENTS.visit, 8); const historical = worldFor(visit, "historical");
  const provider = { providerVersion: "synthetic-provider-v1", resolve: () => historical };
  const request = { contractVersion: CONTRACT_VERSIONS.worldEvidenceConsumer, requestId: "world-request-1", eventId: visit.eventId, eventHash: visit.eventHash, spotId: visit.references.spotId, occurredAt: visit.occurredAt, resolutionPolicyVersion: "synthetic-world-resolution-v1" };
  assert.deepEqual(resolveEventTimeWorldEvidence(provider, request), historical);
  const first = build(input([visit], { worldEvidence: [historical] }));
  const currentState = worldFor(visit, "current-changed"); void currentState;
  const replay = build(input([visit], { worldEvidence: [historical] })); assert.equal(first.state.chains[0].chainHash, replay.state.chains[0].chainHash);
  const { bindingHash: ignoredHistoricalHash, ...historicalBody } = historical; void ignoredHistoricalHash;
  const future = withWorldEvidenceHash({ ...historicalBody, bindingId: "future-world", evidenceAt: at(9), resolvedAt: at(9) });
  assert.throws(() => build(input([visit], { worldEvidence: [future] })), /newer than the event/);
  const conflicting = withWorldEvidenceHash({ ...historicalBody, bindingId: "conflicting-world", conflicts: ["source-conflict"] });
  const conflictChain = build(input([visit], { worldEvidence: [conflicting] })).state.chains[0]; assert.equal(conflictChain.worldEvidence.length, 1); assert.equal(conflictChain.uncertainty.reasonCodes.includes("WORLD_EVIDENCE_CONFLICT"), true);
});

test("unresolved journeys cannot create independence and independent repeat visits remain separate", () => {
  const declaration = timed(syntheticEvent({ id: "unresolved-declaration", eventType: "ONBOARDING_DECLARATION", eventClass: "DECLARATION", payload: { kind: "DECLARATION", concept: { contractVersion: "backyrd.user-intelligence.user-concept-reference@1.0", registryVersion: "backyrd.synthetic-user-concepts@1.0", conceptId: "vibe.quiet" }, direction: "POSITIVE" } }), 1);
  const unresolved = build(input([declaration])); assert.equal(unresolved.state.chains[0].independence.state, "NOT_ELIGIBLE_UNRESOLVED"); assert.equal(unresolved.state.chains[0].independence.independentExperienceUnits, 0);
  const visit1 = timed(SYNTHETIC_EVENTS.visit, 2, { eventId: "repeat-visit-1", idempotencyKey: "repeat-visit-1", source: { ...SYNTHETIC_EVENTS.visit.source, sourceRecordId: "repeat-visit-1" }, journey: { ...SYNTHETIC_EVENTS.visit.journey, journeyId: "repeat-journey-1" } });
  const visit2 = timed(SYNTHETIC_EVENTS.visit, 7, { eventId: "repeat-visit-2", idempotencyKey: "repeat-visit-2", source: { ...SYNTHETIC_EVENTS.visit.source, sourceRecordId: "repeat-visit-2" }, journey: { ...SYNTHETIC_EVENTS.visit.journey, journeyId: "repeat-journey-2" } });
  const repeated = build(input([visit1, visit2])); assert.equal(repeated.state.chains.length, 2); assert.deepEqual(repeated.state.chains.map((chain) => chain.independence.independentExperienceUnits), [1, 1]);
});

test("full rebuild and incremental update are byte-identical under out-of-order and delayed delivery", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 2); const visit = timed(SYNTHETIC_EVENTS.visit, 4); const negative = timed(SYNTHETIC_EVENTS.negative, 6);
  const fullInput = input([negative, opened, visit]); const fullAuthority = authorityFor(fullInput); const full = buildEvidenceChains(fullInput, fullAuthority);
  const baseInput = input([visit, opened]); const base = build(baseInput);
  const delta = input([negative]);
  const incremental = updateEvidenceChains(base, delta, fullAuthority);
  assert.equal(canonicalJson(incremental.state), canonicalJson(full.state));
  assert.equal(incremental.state.stateHash, full.state.stateHash);
  assert.equal(build(fullInput).state.stateHash, full.state.stateHash);
});

test("inner chain manipulation fails even when the outer chain hash is recomputed", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 2); const buildInput = input([opened]); const authority = authorityFor(buildInput); const result = buildEvidenceChains(buildInput, authority); const chain = result.state.chains[0];
  const manipulatedBody = { ...chain, slots: { ...chain.slots, interaction: [{ ...chain.slots.interaction[0], semanticClass: "SATISFACTION", direction: "POSITIVE" }] } };
  delete manipulatedBody.chainHash;
  const manipulated = { ...manipulatedBody, chainHash: contentHash(manipulatedBody) };
  assert.throws(() => verifyEvidenceChainV2(manipulated, { processingAuthority: authority.getProcessingAuthority(), events: result.acceptedEvents, journeyResolutions: buildInput.journeyResolutions, worldEvidence: [], contextEvidence: [], corrections: [] }), /inner evidence semantics/);
});

function rehashStateWithChain(state, changedChain) {
  const pointers = state.latestPointers.map((pointer) => pointer.chainId === changedChain.chainId ? { ...pointer, chainHash: changedChain.chainHash } : pointer);
  const body = { ...state, chains: state.chains.map((chain) => chain.chainId === changedChain.chainId ? changedChain : chain), latestPointers: pointers }; delete body.stateHash;
  return { ...body, stateHash: contentHash(body) };
}

test("recursive state verification rejects consent manipulation after complete rehash", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 2); const material = input([opened]); const authority = authorityFor(material); const result = buildEvidenceChains(material, authority); const chain = result.state.chains[0];
  const chainBody = { ...chain, processingAuthorization: { ...chain.processingAuthorization, consentVersion: "forged-consent-v2" } }; delete chainBody.chainHash;
  const changedChain = { ...chainBody, chainHash: contentHash(chainBody) }; const changedState = rehashStateWithChain(result.state, changedChain);
  assert.throws(() => verifyEvidenceEngineState(changedState, material, authority), /recursive authoritative rebuild/);
  assert.throws(() => verifyEvidenceChainV2(changedChain, { processingAuthority: authority.getProcessingAuthority(), events: result.acceptedEvents, journeyResolutions: material.journeyResolutions, worldEvidence: [], contextEvidence: [], corrections: [] }), /processing authorization/);
});

test("recursive state verification rejects lifecycle, builder, pointers and omitted ledger after complete rehash", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 2); const material = input([opened]); const authority = authorityFor(material); const result = buildEvidenceChains(material, authority); const chain = result.state.chains[0];
  for (const mutation of [
    { lifecycle: { ...chain.lifecycle, retentionClass: "forged-retention" } },
    { builderPolicyVersion: "forged-builder-policy" },
  ]) {
    const chainBody = { ...chain, ...mutation }; delete chainBody.chainHash; const changedChain = { ...chainBody, chainHash: contentHash(chainBody) };
    assert.throws(() => verifyEvidenceEngineState(rehashStateWithChain(result.state, changedChain), material, authority), /recursive authoritative rebuild/);
  }
  for (const mutation of [
    { latestPointers: [{ ...result.state.latestPointers[0], chainHash: contentHash("invented-pointer") }] },
    { ledgerEventHashes: [] },
  ]) {
    const stateBody = { ...result.state, ...mutation }; delete stateBody.stateHash; const changed = { ...stateBody, stateHash: contentHash(stateBody) };
    assert.throws(() => verifyEvidenceEngineState(changed, material, authority), /recursive authoritative rebuild/);
  }
});

test("strict builder boundary rejects commercial and client-authority fields", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 2); const valid = input([opened]);
  assert.throws(() => buildEvidenceChains({ ...valid, ownerTier: "premium" }, authorityFor(valid)), /unknown field/);
  assert.throws(() => buildEvidenceChains({ ...valid, payment: { amount: 20 } }, authorityFor(valid)), /unknown field/);
  assert.throws(() => buildEvidenceChains({ ...valid, advertising: true }, authorityFor(valid)), /unknown field/);
  assert.throws(() => buildEvidenceChains({ ...valid, signalStrength: 1 }, authorityFor(valid)), /unknown field/);
});

test("account erasure deletes every personal evidence store and retains only non-personal manifests", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 2); const result = build(input([opened]));
  const erased = applyEvidenceLifecycle(result, "ACCOUNT_ERASURE"); assert.equal(erased.status, "COMPLETED"); assert.equal(erased.state.status, "ERASED");
  assert.deepEqual(erased.state.chains, []); assert.deepEqual(erased.state.latestPointers, []); assert.deepEqual(erased.state.caches, []); assert.deepEqual(erased.state.workItems, []); assert.equal(erased.state.subjectBindingHash, null);
  assert.equal(erased.storeResults.filter((row) => row.effect !== "RETAIN_NON_PERSONAL").every((row) => row.effect === "DELETE"), true);
  assert.equal(erased.rebuildMaterial, null); assert.deepEqual(erased.acceptedEvents, []); assert.deepEqual(erased.deduplication, []); verifyEvidenceLifecycleCompletion(erased); parseEvidenceEngineState(erased.state);
  assert.throws(() => verifyEvidenceLifecycleCompletion({ ...erased, rebuildMaterial: result.rebuildMaterial }), /retains personal ledger or rebuild material/);
  assert.throws(() => verifyEvidenceLifecycleCompletion({ ...erased, acceptedEvents: result.acceptedEvents }), /retains personal ledger or rebuild material/);
  const withdrawn = applyEvidenceLifecycle(result, "CONSENT_WITHDRAWAL"); assert.equal(withdrawn.state.status, "WITHDRAWN"); assert.equal(withdrawn.rebuildMaterial, null);
  const reset = applyEvidenceLifecycle(result, "FULL_PERSONALIZATION_RESET"); assert.equal(reset.state.status, "RESET"); assert.equal(reset.rebuildMaterial, null);
});
