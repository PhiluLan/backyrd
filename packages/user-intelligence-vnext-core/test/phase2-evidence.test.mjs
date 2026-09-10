import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEvidenceLifecycle, buildEvidenceChains, CANONICAL_EVENT_CATALOG, canonicalJson, contentHash,
  CONTRACT_VERSIONS, deduplicateCanonicalEvents, GRANTED_CONSENT, NO_CONSENT, parseEvidenceEngineState,
  resolveEventTimeWorldEvidence, resolveJourney, SYNTHETIC_EVENTS, SYNTHETIC_SUBJECT_BINDING_HASH,
  SYNTHETIC_USER_A, SYNTHETIC_USER_B, syntheticEvent, updateEvidenceChains, verifyEvidenceChainV2,
  withContextEvidenceHash, withCorrectionResolutionHash, withEventHash, withWorldEvidenceHash,
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
  if (value.journey.resolution === "UNRESOLVED") return resolveJourney({ contractVersion: CONTRACT_VERSIONS.journeyResolution, policyVersion: JOURNEY_POLICY, boundUserId: value.userId, subjectBindingHash: SYNTHETIC_SUBJECT_BINDING_HASH, event: { eventId: value.eventId, occurredAt: value.occurredAt, references: value.references }, links: options.links ?? [] });
  return resolveJourney({
    contractVersion: CONTRACT_VERSIONS.journeyResolution, policyVersion: JOURNEY_POLICY, boundUserId: value.userId,
    subjectBindingHash: SYNTHETIC_SUBJECT_BINDING_HASH, event: { eventId: value.eventId, occurredAt: value.occurredAt, references: value.references },
    links: options.links ?? [{ kind: "EXISTING_JOURNEY", authority: "SERVER_PRODUCT_TRUTH", boundUserId: value.userId, journeyId: value.journey.journeyId, matchedBy: value.references.decisionId ? "DECISION" : "EXPERIENCE", ...(value.references.decisionId ? { decisionId: value.references.decisionId } : {}), ...(value.references.sessionId ? { sessionId: value.references.sessionId } : {}), ...(value.references.spotId ? { spotId: value.references.spotId } : {}), recordHash: contentHash(`journey-link-${value.eventId}`) }],
  });
}

function worldFor(value, suffix = "historical") {
  return withWorldEvidenceHash({ contractVersion: CONTRACT_VERSIONS.worldEvidenceConsumer, bindingId: `world-${value.eventId}-${suffix}`, eventId: value.eventId, eventHash: value.eventHash, spotId: value.references.spotId, worldRegistryVersion: "synthetic-world-registry-v1", worldRegistryHash: contentHash("synthetic-world-registry-v1"), stateKind: "EVENT_TIME_SNAPSHOT", stateHash: contentHash(`world-state-${suffix}`), evidenceAt: value.occurredAt, resolvedAt: value.occurredAt, references: [{ referenceId: "vibe.synthetic-quiet", kind: "CONCEPT", trust: "SUPPORTED", freshness: "CURRENT_AT_EVENT", provenanceSummary: "synthetic-source-summary" }], conflicts: [], unknowns: ["outdoor-status"], exclusions: ["subjective-fit"] });
}

function contextFor(value, source = "USER_EXPLICIT") {
  return withContextEvidenceHash({ contractVersion: CONTRACT_VERSIONS.contextEvidence, bindingId: `context-${value.eventId}-${source}`, eventId: value.eventId, eventHash: value.eventHash, source, contextContractVersion: "synthetic-context-v1", contextHash: contentHash(`context-${source}`), evidenceAt: value.occurredAt, dimensions: source === "UNKNOWN" ? [] : [source === "CAUTIOUSLY_INFERRED" ? "inferred-daypart" : "declared-company"], rawLocationIncluded: false, privateSocialDataIncluded: false, longTermTasteEligible: false, limitations: ["not-long-term-taste"] });
}

function correctionFor(correction, target, correctionSpotId = target.references.spotId ?? null) {
  return withCorrectionResolutionHash({ contractVersion: CONTRACT_VERSIONS.correctionResolution, authority: "SERVER_EVENT_LEDGER", correctionEventId: correction.eventId, targetEventId: target.eventId, boundUserId: correction.userId, targetUserId: target.userId, targetSpotId: target.references.spotId ?? null, correctionSpotId, targetOccurredAt: target.occurredAt, policyVersion: "synthetic-correction-policy-v1" });
}

function input(events, options = {}) {
  return {
    contractVersion: INPUT_VERSION, builderPolicyVersion: POLICY,
    subject: { boundUserId: options.boundUserId ?? SYNTHETIC_USER_A, subjectBindingHash: SYNTHETIC_SUBJECT_BINDING_HASH, authority: "SERVER_AUTHENTICATION", userIdExternallyExposed: false },
    consent: options.consent ?? GRANTED_CONSENT, events,
    journeyResolutions: options.journeyResolutions ?? events.map((value) => resolutionFor(value)),
    worldEvidence: options.worldEvidence ?? [], contextEvidence: options.contextEvidence ?? [], corrections: options.corrections ?? [], lifecycleState: options.lifecycleState ?? "ACTIVE",
  };
}

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
  const probable = resolutionFor(opened, { links: [{ kind: "CORRELATION_ONLY", authority: "SERVER_PRODUCT_TRUTH", boundUserId: SYNTHETIC_USER_A, basis: "SAME_SPOT_ONLY", recordHash: contentHash("same-spot-only") }] });
  assert.equal(probable.status, "PROBABLE_RELATED"); assert.equal(probable.journeyId, null); assert.equal(probable.independenceEligible, false);
  const unresolved = resolutionFor(event(SYNTHETIC_EVENTS.open, { journey: { resolution: "UNRESOLVED", journeyId: null, resolutionPolicyVersion: JOURNEY_POLICY, independenceEligible: false } }));
  assert.equal(unresolved.status, "UNRESOLVED");
  const independentEvent = timed(SYNTHETIC_EVENTS.visit, 2, { eventId: "visit-independent", idempotencyKey: "visit-independent", source: { ...SYNTHETIC_EVENTS.visit.source, sourceRecordId: "visit-independent" }, journey: { resolution: "SERVER_RESOLVED", journeyId: `journey-${contentHash({ subjectBindingHash: SYNTHETIC_SUBJECT_BINDING_HASH, eventId: "visit-independent", policyVersion: JOURNEY_POLICY, records: [contentHash("independent-record")] })}`, resolutionPolicyVersion: JOURNEY_POLICY, independenceEligible: true } });
  const independent = resolutionFor(independentEvent, { links: [{ kind: "INDEPENDENT_EXPERIENCE", authority: "VERIFIED_OUTCOME", boundUserId: SYNTHETIC_USER_A, spotId: independentEvent.references.spotId, recordHash: contentHash("independent-record") }] });
  assert.equal(independent.status, "INDEPENDENT_NEW_JOURNEY"); assert.equal(independent.independenceEligible, true);
  const foreign = resolutionFor(opened, { links: [{ kind: "EXISTING_JOURNEY", authority: "SERVER_PRODUCT_TRUTH", boundUserId: SYNTHETIC_USER_B, journeyId: "foreign-journey", matchedBy: "DECISION", decisionId: opened.references.decisionId, recordHash: contentHash("foreign") }] });
  assert.equal(foreign.status, "CONFLICT");
  const foreignDecision = resolutionFor(opened, { links: [{ kind: "EXISTING_JOURNEY", authority: "SERVER_PRODUCT_TRUTH", boundUserId: SYNTHETIC_USER_A, journeyId: "foreign-decision-journey", matchedBy: "DECISION", decisionId: "foreign-decision", recordHash: contentHash("foreign-decision") }] });
  assert.equal(foreignDecision.status, "CONFLICT"); assert.equal(foreignDecision.reasonCodes.includes("REFERENCE_MISMATCH"), true);
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
  const result = buildEvidenceChains(input([positive, opened, exposure, review, save, navigation, visit, remove], { worldEvidence: [worldFor(visit)], contextEvidence: [contextFor(visit, "USER_EXPLICIT"), contextFor(navigation, "CAUTIOUSLY_INFERRED")] }));
  assert.equal(result.state.chains.length, 1); const chain = result.state.chains[0];
  assert.equal(chain.slots.exposure[0].direction, "NOT_APPLICABLE"); assert.equal(chain.slots.interaction[0].direction, "NOT_APPLICABLE");
  assert.equal(chain.slots.stateChange.length, 2); assert.equal(chain.slots.stateChange.every((item) => item.direction === "NOT_APPLICABLE"), true);
  assert.equal(chain.slots.experience.length, 2); assert.equal(chain.slots.experience.every((item) => item.direction === "NOT_APPLICABLE"), true);
  assert.equal(chain.slots.satisfaction[0].direction, "POSITIVE"); assert.equal(chain.independence.independentExperienceUnits, 1);
  assert.equal("userId" in chain.subject, false); assert.equal(chain.contextEvidence.some((row) => row.source === "CAUTIOUSLY_INFERRED"), true);
  assert.equal(chain.limitations.includes("NO_TASTE_SCORE"), true); assert.equal(chain.limitations.includes("NO_ATTRIBUTION"), true); assert.equal(chain.limitations.includes("CURRENT_CONTEXT_NOT_LONG_TERM_TASTE"), true);
  assert.equal(canonicalJson(result).includes("reviewOrigin"), true); // retained only in the internal canonical ledger, never copied into chain slots
  assert.equal(canonicalJson(chain).includes("reviewOrigin"), false); assert.equal(canonicalJson(chain).includes("factor"), false);
  const negative = timed(SYNTHETIC_EVENTS.negative, 9); assert.equal(buildEvidenceChains(input([negative])).state.chains[0].slots.satisfaction[0].direction, "NEGATIVE");
});

test("review without satisfaction and navigation without visit remain explicit limitations", () => {
  const review = timed(SYNTHETIC_EVENTS.smartReview, 4); const navigation = timed(SYNTHETIC_EVENTS.navigation, 3);
  const chain = buildEvidenceChains(input([review, navigation])).state.chains[0];
  assert.equal(chain.slots.satisfaction.length, 0); assert.equal(chain.slots.experience.length, 1); assert.equal(chain.slots.intent.length, 1);
  assert.equal(chain.limitations.includes("REVIEW_IS_SATISFACTION"), true); assert.equal(chain.limitations.includes("NAVIGATION_IS_VISIT"), true);
});

test("no consent, withdrawal and cold-user paths create no personalizable evidence", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 1);
  const denied = buildEvidenceChains(input([opened], { consent: NO_CONSENT })); assert.equal(denied.state.status, "SUPPRESSED_NO_CONSENT"); assert.deepEqual(denied.state.chains, []); assert.equal(denied.state.subjectBindingHash, null);
  const withdrawn = buildEvidenceChains(input([opened], { lifecycleState: "WITHDRAWN" })); assert.equal(withdrawn.state.status, "WITHDRAWN"); assert.deepEqual(withdrawn.acceptedEvents, []);
  const cold = buildEvidenceChains(input([])); assert.equal(cold.state.status, "ACTIVE"); assert.deepEqual(cold.state.chains, []);
});

test("corrections are append-only, deactivate targets and reject cross-user and cross-spot authority", () => {
  const positive = timed(SYNTHETIC_EVENTS.positive, 2); const correction = timed(SYNTHETIC_EVENTS.correction, 5, { supersedesEventId: positive.eventId, payload: { kind: "CORRECTION", targetEventId: positive.eventId, correction: "RETRACT" } });
  const authority = correctionFor(correction, positive);
  const result = buildEvidenceChains(input([positive, correction], { corrections: [authority] })); const chain = result.state.chains[0];
  assert.equal(chain.slots.satisfaction[0].active, false); assert.equal(chain.slots.correction[0].active, true); assert.equal(chain.corrections.length, 1); assert.equal(result.acceptedEvents.length, 2);
  assert.throws(() => buildEvidenceChains(input([positive, correction], { corrections: [correctionFor(correction, positive, "foreign-spot")] })), /cross-spot/);
  const foreignTarget = event(positive, { userId: SYNTHETIC_USER_B, authority: { ...positive.authority, boundUserId: SYNTHETIC_USER_B }, referenceResolution: { ...positive.referenceResolution, boundUserId: SYNTHETIC_USER_B } });
  assert.throws(() => buildEvidenceChains(input([foreignTarget, correction], { corrections: [correctionFor(correction, foreignTarget)], boundUserId: SYNTHETIC_USER_A })), /identity|cross-user/);
});

test("event-time world evidence is historically stable and provider bindings fail closed", () => {
  const visit = timed(SYNTHETIC_EVENTS.visit, 8); const historical = worldFor(visit, "historical");
  const provider = { providerVersion: "synthetic-provider-v1", resolve: () => historical };
  const request = { contractVersion: CONTRACT_VERSIONS.worldEvidenceConsumer, requestId: "world-request-1", eventId: visit.eventId, eventHash: visit.eventHash, spotId: visit.references.spotId, occurredAt: visit.occurredAt, resolutionPolicyVersion: "synthetic-world-resolution-v1" };
  assert.deepEqual(resolveEventTimeWorldEvidence(provider, request), historical);
  const first = buildEvidenceChains(input([visit], { worldEvidence: [historical] }));
  const currentState = worldFor(visit, "current-changed"); void currentState;
  const replay = buildEvidenceChains(input([visit], { worldEvidence: [historical] })); assert.equal(first.state.chains[0].chainHash, replay.state.chains[0].chainHash);
  const { bindingHash: ignoredHistoricalHash, ...historicalBody } = historical; void ignoredHistoricalHash;
  const future = withWorldEvidenceHash({ ...historicalBody, bindingId: "future-world", evidenceAt: at(9), resolvedAt: at(9) });
  assert.throws(() => buildEvidenceChains(input([visit], { worldEvidence: [future] })), /newer than the event/);
  const conflicting = withWorldEvidenceHash({ ...historicalBody, bindingId: "conflicting-world", conflicts: ["source-conflict"] });
  const conflictChain = buildEvidenceChains(input([visit], { worldEvidence: [conflicting] })).state.chains[0]; assert.equal(conflictChain.worldEvidence.length, 1); assert.equal(conflictChain.uncertainty.reasonCodes.includes("WORLD_EVIDENCE_CONFLICT"), true);
});

test("unresolved journeys cannot create independence and independent repeat visits remain separate", () => {
  const declaration = timed(syntheticEvent({ id: "unresolved-declaration", eventType: "ONBOARDING_DECLARATION", eventClass: "DECLARATION", payload: { kind: "DECLARATION", concept: { contractVersion: "backyrd.user-intelligence.user-concept-reference@1.0", registryVersion: "backyrd.synthetic-user-concepts@1.0", conceptId: "vibe.quiet" }, direction: "POSITIVE" } }), 1);
  const unresolved = buildEvidenceChains(input([declaration])); assert.equal(unresolved.state.chains[0].independence.state, "NOT_ELIGIBLE_UNRESOLVED"); assert.equal(unresolved.state.chains[0].independence.independentExperienceUnits, 0);
  const visit1 = timed(SYNTHETIC_EVENTS.visit, 2, { eventId: "repeat-visit-1", idempotencyKey: "repeat-visit-1", source: { ...SYNTHETIC_EVENTS.visit.source, sourceRecordId: "repeat-visit-1" }, journey: { ...SYNTHETIC_EVENTS.visit.journey, journeyId: "repeat-journey-1" } });
  const visit2 = timed(SYNTHETIC_EVENTS.visit, 7, { eventId: "repeat-visit-2", idempotencyKey: "repeat-visit-2", source: { ...SYNTHETIC_EVENTS.visit.source, sourceRecordId: "repeat-visit-2" }, journey: { ...SYNTHETIC_EVENTS.visit.journey, journeyId: "repeat-journey-2" } });
  const repeated = buildEvidenceChains(input([visit1, visit2])); assert.equal(repeated.state.chains.length, 2); assert.deepEqual(repeated.state.chains.map((chain) => chain.independence.independentExperienceUnits), [1, 1]);
});

test("full rebuild and incremental update are byte-identical under out-of-order and delayed delivery", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 2); const visit = timed(SYNTHETIC_EVENTS.visit, 4); const negative = timed(SYNTHETIC_EVENTS.negative, 6);
  const full = buildEvidenceChains(input([negative, opened, visit]));
  const base = buildEvidenceChains(input([visit, opened]));
  const delta = input([negative]);
  const incremental = updateEvidenceChains(base, delta);
  assert.equal(canonicalJson(incremental.state), canonicalJson(full.state));
  assert.equal(incremental.state.stateHash, full.state.stateHash);
  assert.equal(buildEvidenceChains(input([negative, opened, visit])).state.stateHash, full.state.stateHash);
});

test("inner chain manipulation fails even when the outer chain hash is recomputed", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 2); const result = buildEvidenceChains(input([opened])); const chain = result.state.chains[0];
  const manipulatedBody = { ...chain, slots: { ...chain.slots, interaction: [{ ...chain.slots.interaction[0], semanticClass: "SATISFACTION", direction: "POSITIVE" }] } };
  delete manipulatedBody.chainHash;
  const manipulated = { ...manipulatedBody, chainHash: contentHash(manipulatedBody) };
  assert.throws(() => verifyEvidenceChainV2(manipulated, { events: result.acceptedEvents, journeyResolutions: result.input.journeyResolutions, worldEvidence: [], contextEvidence: [], corrections: [] }), /inner evidence semantics/);
});

test("strict builder boundary rejects commercial and client-authority fields", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 2); const valid = input([opened]);
  assert.throws(() => buildEvidenceChains({ ...valid, ownerTier: "premium" }), /unknown field/);
  assert.throws(() => buildEvidenceChains({ ...valid, payment: { amount: 20 } }), /unknown field/);
  assert.throws(() => buildEvidenceChains({ ...valid, advertising: true }), /unknown field/);
  assert.throws(() => buildEvidenceChains({ ...valid, signalStrength: 1 }), /unknown field/);
});

test("account erasure deletes every personal evidence store and retains only non-personal manifests", () => {
  const opened = timed(SYNTHETIC_EVENTS.open, 2); const state = buildEvidenceChains(input([opened])).state;
  const erased = applyEvidenceLifecycle(state, "ACCOUNT_ERASURE"); assert.equal(erased.status, "COMPLETED"); assert.equal(erased.state.status, "ERASED");
  assert.deepEqual(erased.state.chains, []); assert.deepEqual(erased.state.latestPointers, []); assert.deepEqual(erased.state.caches, []); assert.deepEqual(erased.state.workItems, []); assert.equal(erased.state.subjectBindingHash, null);
  assert.equal(erased.storeResults.filter((row) => row.effect !== "RETAIN_NON_PERSONAL").every((row) => row.effect === "DELETE"), true);
  parseEvidenceEngineState(erased.state);
  const withdrawn = applyEvidenceLifecycle(state, "CONSENT_WITHDRAWAL"); assert.equal(withdrawn.state.status, "WITHDRAWN");
  const reset = applyEvidenceLifecycle(state, "FULL_PERSONALIZATION_RESET"); assert.equal(reset.state.status, "RESET");
});
