import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEvidenceChains, buildUserModel, buildUserModelDecisionProjection, canonicalJson, contentHash, deduplicateCanonicalEvents,
  CONTRACT_VERSIONS, GRANTED_CONSENT, NO_CONSENT, REQUIRED_LIFECYCLE_STORES, resolveJourney, SYNTHETIC_EVENTS,
  SYNTHETIC_PROJECTION_REQUEST, SYNTHETIC_SUBJECT_BINDING_HASH, SYNTHETIC_USER_A, SYNTHETIC_USER_B,
  planUserModelLifecycle, updateUserModel, verifyUserModelIntegrity, verifyUserModelLifecycleCompletion, verifyUserModelState, withContextEvidenceHash,
  withCorrectionResolutionHash, withEventHash, withInterpretationPolicyHash, withJourneyAuthorityRecordHash, withUserModelAuthorityRecordHash,
  withUserModelAuthorityTrustAnchorHash, withUserModelLifecycleExecutionRecordHash, withUserModelLifecycleTrustAnchorHash, withWorldEvidenceHash,
} from "../dist/index.js";

const BUILDER_POLICY = "synthetic-phase3a-evidence-builder-v1";
const JOURNEY_POLICY = "synthetic-phase3a-journey-v1";
const REGISTRY = "synthetic-phase3a-concepts-v1";
const CONCEPTS = ["vibe.synthetic-quiet", "environment.synthetic-outdoor"];
const NOW = "2026-01-15T12:30:00.000Z";
const at = (second) => `2026-01-15T12:00:${String(second).padStart(2, "0")}.000Z`;

function event(source, id, second, changes = {}) {
  const body = {
    ...source, eventId: id, idempotencyKey: `idempotency-${id}`,
    source: { ...source.source, sourceRecordId: `source-${id}` },
    occurredAt: at(second), observedAt: at(second), ingestedAt: at(second), ...changes,
  };
  delete body.eventHash;
  return withEventHash(body);
}

function resolutionFor(value) {
  if (value.journey.resolution === "UNRESOLVED") {
    return resolveJourney({ contractVersion: CONTRACT_VERSIONS.journeyResolution, policyVersion: JOURNEY_POLICY, boundUserId: value.userId, subjectBindingHash: SYNTHETIC_SUBJECT_BINDING_HASH, event: { eventId: value.eventId, occurredAt: value.occurredAt, references: value.references }, links: [] }, { contextVersion: "synthetic-phase3a-journey-authority-v1", verifiedAt: NOW, acceptedPolicyVersions: [JOURNEY_POLICY], findRecord: () => null });
  }
  const record = withJourneyAuthorityRecordHash({ recordId: `journey-record-${value.eventId}`, authority: "SERVER_PRODUCT_TRUTH", policyVersion: JOURNEY_POLICY, boundUserId: value.userId, journeyId: value.journey.journeyId, spotId: value.references.spotId ?? null, decisionId: value.references.decisionId ?? null, sessionId: value.references.sessionId ?? null, experienceEventId: value.references.experienceEventId ?? null, validUntil: "2027-01-01T00:00:00.000Z" });
  const link = { kind: "EXISTING_JOURNEY", authority: "SERVER_PRODUCT_TRUTH", recordId: record.recordId, recordHash: record.recordHash, policyVersion: JOURNEY_POLICY, boundUserId: value.userId, journeyId: value.journey.journeyId, matchedBy: value.references.decisionId ? "DECISION" : value.references.sessionId ? "SESSION" : "EXPERIENCE", ...(value.references.spotId ? { spotId: value.references.spotId } : {}), ...(value.references.decisionId ? { decisionId: value.references.decisionId } : {}), ...(value.references.sessionId ? { sessionId: value.references.sessionId } : {}), ...(value.references.experienceEventId ? { experienceEventId: value.references.experienceEventId } : {}) };
  return resolveJourney({ contractVersion: CONTRACT_VERSIONS.journeyResolution, policyVersion: JOURNEY_POLICY, boundUserId: value.userId, subjectBindingHash: SYNTHETIC_SUBJECT_BINDING_HASH, event: { eventId: value.eventId, occurredAt: value.occurredAt, references: value.references }, links: [link] }, { contextVersion: "synthetic-phase3a-journey-authority-v1", verifiedAt: NOW, acceptedPolicyVersions: [JOURNEY_POLICY], findRecord: (id) => id === record.recordId ? record : null });
}

function worldFor(value, concepts = CONCEPTS) {
  return withWorldEvidenceHash({ contractVersion: CONTRACT_VERSIONS.worldEvidenceConsumer, bindingId: `world-${value.eventId}`, eventId: value.eventId, eventHash: value.eventHash, spotId: value.references.spotId, bindingScope: "EVENT_TIME_WORLD", worldRegistryVersion: "synthetic-world-registry-v1", worldRegistryHash: contentHash("synthetic-world-registry-v1"), stateKind: "EVENT_TIME_SNAPSHOT", stateHash: contentHash(`world-state-${value.eventId}`), evidenceAt: value.occurredAt, resolvedAt: value.occurredAt, references: concepts.map((referenceId) => ({ referenceId, kind: "CONCEPT", trust: "SUPPORTED", freshness: "CURRENT_AT_EVENT", provenanceSummary: "synthetic-authorized-world" })), conflicts: [], unknowns: [], exclusions: ["subjective-fit"] });
}

function contextFor(value, dimensions = ["company.friends"]) {
  return withContextEvidenceHash({ contractVersion: CONTRACT_VERSIONS.contextEvidence, bindingId: `context-${value.eventId}`, eventId: value.eventId, eventHash: value.eventHash, bindingScope: "EVENT_TIME_CONTEXT", source: "USER_EXPLICIT", contextContractVersion: "synthetic-context-v1", contextHash: contentHash({ eventId: value.eventId, dimensions }), evidenceAt: value.occurredAt, dimensions, rawLocationIncluded: false, privateSocialDataIncluded: false, longTermTasteEligible: false, limitations: ["not-long-term-taste"] });
}

function correctionFor(correction, target) {
  return withCorrectionResolutionHash({ contractVersion: CONTRACT_VERSIONS.correctionResolution, recordId: `correction-${correction.eventId}`, authority: "SERVER_EVENT_LEDGER", correctionEventId: correction.eventId, targetEventId: target.eventId, boundUserId: target.userId, targetUserId: target.userId, targetSpotId: target.references.spotId ?? null, correctionSpotId: null, targetOccurredAt: target.occurredAt, policyVersion: "synthetic-correction-policy-v1", validUntil: "2027-01-01T00:00:00.000Z" });
}

function evidenceInput(events, options = {}) {
  const consent = options.consent ?? GRANTED_CONSENT;
  const lifecycleState = options.lifecycleState ?? "ACTIVE";
  const suppressed = consent.state !== "GRANTED" || lifecycleState !== "ACTIVE";
  return { contractVersion: CONTRACT_VERSIONS.evidenceBuilderInput, builderPolicyVersion: BUILDER_POLICY, subject: { boundUserId: options.userId ?? SYNTHETIC_USER_A, subjectBindingHash: options.subjectBindingHash ?? SYNTHETIC_SUBJECT_BINDING_HASH, authority: "SERVER_AUTHENTICATION", userIdExternallyExposed: false }, consent, events, journeyResolutions: suppressed ? [] : events.map(resolutionFor), worldEvidence: options.worldEvidence ?? [], contextEvidence: options.contextEvidence ?? [], corrections: options.corrections ?? [], lifecycleState };
}

function evidenceAuthority(value) {
  return { getProcessingAuthority: () => ({ contextVersion: "synthetic-phase3a-evidence-authority-v1", subject: value.subject, consent: value.consent, builderPolicyVersion: BUILDER_POLICY, lifecycleState: value.lifecycleState, retentionClass: "UNRESOLVED_PRIVACY_POLICY", retentionDurationDefined: false, verifiedAt: NOW, journeyAuthorityContextVersion: "synthetic-phase3a-journey-authority-v1", acceptedJourneyPolicyVersions: [JOURNEY_POLICY], correctionAuthority: "SERVER_EVENT_LEDGER", acceptedCorrectionPolicyVersions: ["synthetic-correction-policy-v1"] }), listJourneyResolutions: () => value.journeyResolutions, listWorldEvidence: () => value.worldEvidence, listContextEvidence: () => value.contextEvidence, listCorrectionRecords: () => value.corrections };
}

function policy(options = {}) {
  const rules = options.rules ?? [
    { eventType: "SATISFACTION_RECORDED", evidenceSlot: "SATISFACTION", action: "CONCEPT_FROM_WORLD_SATISFACTION", requiredDirection: "ANY", requiresIndependentJourney: true, requiresWorldEvidence: false },
  ];
  const sufficiencyBody = { policyId: options.sufficiencyPolicyId ?? "synthetic-phase3a-sufficiency-v1", authority: "SYNTHETIC_FIXTURE_ONLY", productCalibrated: false, productionAuthorized: false, limitations: ["SYNTHETIC_THRESHOLDS_ONLY", "NOT_PRODUCT_CALIBRATED"], thresholds: { partialIndependentJourneys: 1, sufficientIndependentJourneys: 2 } };
  return withInterpretationPolicyHash({ contractVersion: CONTRACT_VERSIONS.interpretationPolicy, policyId: options.policyId ?? "synthetic-phase3a-policy-id", policyVersion: options.version ?? "synthetic-phase3a-interpretation-v1", authority: "SYNTHETIC_FIXTURE_ONLY", productionAuthorized: false, validFrom: "2026-01-01T00:00:00.000Z", validUntil: options.validUntil ?? "2026-12-31T23:59:59.999Z", rules, allowedContextDimensions: ["company.friends", "daypart.evening"], attributionMode: "WORLD_CONCEPTS_AS_COMPETING_EXPLANATIONS", repetitionMode: "COUNT_INDEPENDENT_JOURNEYS_ONLY", correctionMode: "ACTIVE_EVIDENCE_ONLY_APPEND_HISTORY", recencyWindow: "NOT_CONFIGURED", decay: "NOT_CONFIGURED", retention: "NOT_CONFIGURED", syntheticSufficiency: { ...sufficiencyBody, policyHash: contentHash(sufficiencyBody) } });
}

function command(activePolicy = policy(), changes = {}) {
  return { contractVersion: CONTRACT_VERSIONS.userModelCommand, runId: "synthetic-phase3a-run", source: "SERVER_ORCHESTRATOR", interpretationPolicyVersion: activePolicy.policyVersion, conceptRegistryVersion: REGISTRY, reducerVersion: "synthetic-phase3a-reducer-v1", temporalPolicyVersion: "synthetic-phase3a-temporal-v1", interpretedAt: NOW, ...changes };
}

function modelAuthority(activePolicy, options = {}) {
  const consent = options.consent ?? GRANTED_CONSENT;
  const authority = { contractVersion: CONTRACT_VERSIONS.userModelAuthority, contextVersion: "synthetic-phase3a-model-authority-v1", authority: "SERVER_USER_MODEL_ORCHESTRATOR", subject: { boundUserId: options.userId ?? SYNTHETIC_USER_A, subjectBindingHash: options.subjectBindingHash ?? SYNTHETIC_SUBJECT_BINDING_HASH, boundBy: "SERVER_AUTHENTICATION" }, consent, lifecycleState: options.lifecycleState ?? "ACTIVE", interpretationPolicy: { policyId: activePolicy.policyId, policyVersion: activePolicy.policyVersion, policyHash: activePolicy.policyHash, acceptedAuthority: "SYNTHETIC_FIXTURE_ONLY", productionPolicyConfigured: false }, conceptRegistry: { registryVersion: options.registryVersion ?? REGISTRY, registryHash: contentHash({ registryVersion: options.registryVersion ?? REGISTRY, conceptIds: [...CONCEPTS].sort() }), conceptIds: CONCEPTS, authority: "SERVER_REGISTRY" }, reducer: { reducerVersion: options.reducerVersion ?? "synthetic-phase3a-reducer-v1", codeHash: contentHash(options.reducerCode ?? "synthetic-phase3a-reducer-code-v1"), authority: "SERVER_RELEASE" }, temporalPolicyVersion: options.temporalPolicyVersion ?? "synthetic-phase3a-temporal-v1", projectionPolicyVersion: options.projectionPolicyVersion ?? "synthetic-phase3a-projection-v1", retentionConfigured: false, verifiedAt: NOW };
  const record = withUserModelAuthorityRecordHash({ contractVersion: CONTRACT_VERSIONS.userModelAuthorityRecord, recordId: options.recordId ?? "synthetic-phase3a-authority-record", issuer: "SYNTHETIC_SERVER_AUTHORITY_FIXTURE", authorityContractVersion: CONTRACT_VERSIONS.userModelAuthority, authorityHash: contentHash(authority), subject: { boundUserId: authority.subject.boundUserId, subjectBindingHash: authority.subject.subjectBindingHash }, consentHash: contentHash(consent), lifecycleState: authority.lifecycleState, interpretationPolicy: { policyId: activePolicy.policyId, policyVersion: activePolicy.policyVersion, policyHash: activePolicy.policyHash }, conceptRegistry: { registryVersion: authority.conceptRegistry.registryVersion, registryHash: authority.conceptRegistry.registryHash }, reducer: { reducerVersion: authority.reducer.reducerVersion, codeHash: authority.reducer.codeHash }, temporalPolicyVersion: authority.temporalPolicyVersion, projectionPolicyVersion: authority.projectionPolicyVersion, retentionConfigured: false, validFrom: "2026-01-01T00:00:00.000Z", validUntil: options.recordValidUntil ?? "2026-12-31T23:59:59.999Z", issuedAt: NOW, verifiedAt: NOW });
  const anchor = withUserModelAuthorityTrustAnchorHash({ contractVersion: CONTRACT_VERSIONS.userModelAuthorityTrustAnchor, anchorId: "synthetic-phase3a-model-trust-anchor", acceptedIssuer: "SYNTHETIC_SERVER_AUTHORITY_FIXTURE", acceptedRecordId: record.recordId, acceptedRecordHash: record.recordHash, environment: "SYNTHETIC_FIXTURE_ONLY", productionAuthorized: false, validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2026-12-31T23:59:59.999Z", verifiedAt: NOW });
  const context = { getAuthority: () => authority, getAuthorityRecord: () => record, getInterpretationPolicy: () => activePolicy };
  return Object.assign(context, { authority, record, trustContext: { getAcceptedTrustAnchor: (recordId) => recordId === record.recordId ? anchor : null }, anchor });
}

function build(events, options = {}) {
  const activePolicy = options.policy ?? policy();
  const value = evidenceInput(events, options);
  const evidenceAuth = evidenceAuthority(value);
  const evidence = buildEvidenceChains(value, evidenceAuth);
  const modelAuth = modelAuthority(activePolicy, options);
  return { result: buildUserModel(evidence, command(activePolicy, options.command), evidenceAuth, modelAuth, modelAuth.trustContext), evidence, evidenceAuth, modelAuth, trustContext: modelAuth.trustContext, command: command(activePolicy, options.command), policy: activePolicy };
}

function lifecycleExecution(plan, mutate = (record) => record) {
  const records = plan.requirements.map((requirement) => mutate(withUserModelLifecycleExecutionRecordHash({ contractVersion: CONTRACT_VERSIONS.userModelLifecycleExecution, recordId: `execution-${requirement.store}`, operationId: plan.operationId, action: plan.action, manifestVersion: plan.manifestVersion, manifestHash: plan.manifestHash, subject: plan.subject, store: requirement.store, effect: requirement.effect, executedAt: NOW, executorAuthority: "SYNTHETIC_AUTHORIZED_STORE_EXECUTOR", personalDataRemaining: false })));
  const anchors = new Map(records.map((record) => [record.recordId, withUserModelLifecycleTrustAnchorHash({ contractVersion: CONTRACT_VERSIONS.userModelLifecycleTrustAnchor, anchorId: `anchor-${record.store}`, recordId: record.recordId, recordHash: record.recordHash, acceptedExecutorAuthority: "SYNTHETIC_AUTHORIZED_STORE_EXECUTOR", environment: "SYNTHETIC_FIXTURE_ONLY", productionAuthorized: false, verifiedAt: NOW })]));
  return { records, context: { listExecutionRecords: (operationId) => operationId === plan.operationId ? records : [], getAcceptedTrustAnchor: (recordId) => anchors.get(recordId) ?? null } };
}

function incremental(prior, next, changes = {}) {
  return updateUserModel({ previous: prior.result, previousEvidence: prior.evidence, nextEvidence: next.evidence, previousCommand: prior.command, command: next.command, previousEvidenceAuthority: prior.evidenceAuth, nextEvidenceAuthority: next.evidenceAuth, previousModelContext: prior.modelAuth, previousTrustContext: prior.trustContext, modelContext: next.modelAuth, trustContext: next.trustContext, ...changes });
}

function satisfaction(direction, id, second, journeyId = "synthetic-journey-1") {
  const source = direction === "POSITIVE" ? SYNTHETIC_EVENTS.positive : SYNTHETIC_EVENTS.negative;
  return event(source, id, second, { journey: { ...source.journey, journeyId, resolutionPolicyVersion: JOURNEY_POLICY }, references: { spotId: "synthetic-spot-1", experienceEventId: `experience-${journeyId}` } });
}

test("1 cold user has a hashed but statement-free model", () => {
  const { result } = build([]); assert.equal(result.state.status, "COLD"); assert.equal(result.state.interpretations.length, 0); assert.equal(result.state.snapshot.overallSufficiency.state, "UNMATURE");
});

test("2 no consent yields no persistable personal model input", () => {
  const value = evidenceInput([], { consent: NO_CONSENT }); const evidenceAuth = evidenceAuthority(value); const evidence = buildEvidenceChains(value, evidenceAuth); const p = policy();
  const auth = modelAuthority(p, { consent: NO_CONSENT }); const result = buildUserModel(evidence, command(p), evidenceAuth, auth, auth.trustContext); assert.equal(result.state.status, "SUPPRESSED_NO_CONSENT"); assert.equal(canonicalJson(result).includes(SYNTHETIC_USER_A), false); assert.equal(result.state.rebuildMaterial, null);
});

test("3 withdrawn consent yields no subject, statements or rebuild material", () => {
  const value = evidenceInput([], { lifecycleState: "WITHDRAWN" }); const evidenceAuth = evidenceAuthority(value); const evidence = buildEvidenceChains(value, evidenceAuth); const p = policy();
  const auth = modelAuthority(p, { lifecycleState: "WITHDRAWN" }); const result = buildUserModel(evidence, command(p), evidenceAuth, auth, auth.trustContext); assert.equal(result.state.status, "WITHDRAWN"); assert.equal(result.state.subjectBindingHash, null); assert.deepEqual(result.state.interpretations, []);
});

test("4 kill switch produces the canonical neutral Decision projection", () => {
  const model = build([]).result; const request = { ...SYNTHETIC_PROJECTION_REQUEST, killSwitch: true, snapshot: null };
  const projection = buildUserModelDecisionProjection(request, GRANTED_CONSENT, model, NOW); assert.equal(projection.status, "NEUTRAL"); assert.equal(projection.neutralReason, "KILL_SWITCH"); assert.deepEqual(projection.taste, []); assert.equal(projection.boundaries.rankingAuthority, false);
});

test("5 exposure remains an observation and creates no interpretation", () => {
  const exposure = event(SYNTHETIC_EVENTS.exposure, "p3-exposure", 1, { journey: { ...SYNTHETIC_EVENTS.exposure.journey, resolutionPolicyVersion: JOURNEY_POLICY } }); const state = build([exposure]).result.state;
  assert.equal(state.observations.length, 1); assert.equal(state.interpretations.length, 0);
});

test("6 repeated opens are not likes or strong claims", () => {
  const open1 = event(SYNTHETIC_EVENTS.open, "p3-open-1", 1, { journey: { ...SYNTHETIC_EVENTS.open.journey, resolutionPolicyVersion: JOURNEY_POLICY } }); const open2 = event(SYNTHETIC_EVENTS.open, "p3-open-2", 2, { journey: { ...SYNTHETIC_EVENTS.open.journey, resolutionPolicyVersion: JOURNEY_POLICY } });
  const state = build([open1, open2]).result.state; assert.equal(state.observations.length, 2); assert.equal(state.interpretations.length, 0);
});

test("7 navigation is neither visit nor satisfaction", () => {
  const navigation = event(SYNTHETIC_EVENTS.navigation, "p3-navigation", 2, { journey: { ...SYNTHETIC_EVENTS.navigation.journey, resolutionPolicyVersion: JOURNEY_POLICY } }); const state = build([navigation]).result.state;
  assert.equal(state.observations[0].evidenceSlot, "INTENT"); assert.equal(state.interpretations.length, 0);
});

test("8 verified visit is experience with unknown satisfaction", () => {
  const visit = event(SYNTHETIC_EVENTS.visit, "p3-visit", 3, { references: { spotId: "synthetic-spot-1", experienceEventId: "experience-p3-visit" }, journey: { ...SYNTHETIC_EVENTS.visit.journey, resolutionPolicyVersion: JOURNEY_POLICY } }); const state = build([visit]).result.state;
  assert.equal(state.observations[0].evidenceSlot, "EXPERIENCE"); assert.equal(state.interpretations.length, 0);
});

test("9 explicit positive satisfaction creates only synthetic traceable hypotheses", () => {
  const positive = satisfaction("POSITIVE", "p3-positive", 4); const state = build([positive], { worldEvidence: [worldFor(positive, [CONCEPTS[0]])] }).result.state;
  assert.equal(state.snapshot.dimensions.longTermConceptTaste.length, 1); assert.equal(state.snapshot.dimensions.aversions.length, 0); assert.equal(state.interpretations.every((row) => row.policy.authority === "SYNTHETIC_FIXTURE_ONLY"), true);
});

test("10 explicit negative satisfaction creates a separate aversion", () => {
  const negative = satisfaction("NEGATIVE", "p3-negative", 4); const state = build([negative], { worldEvidence: [worldFor(negative, [CONCEPTS[0]])] }).result.state;
  assert.equal(state.snapshot.dimensions.aversions.length, 1); assert.equal(state.snapshot.dimensions.longTermConceptTaste.length, 0);
});

test("11 Standard and Smart Review have identical learning semantics", () => {
  const standard = event(SYNTHETIC_EVENTS.standardReview, "p3-standard", 4, { journey: { ...SYNTHETIC_EVENTS.standardReview.journey, resolutionPolicyVersion: JOURNEY_POLICY } }); const smart = event(SYNTHETIC_EVENTS.smartReview, "p3-smart", 4, { journey: { ...SYNTHETIC_EVENTS.smartReview.journey, resolutionPolicyVersion: JOURNEY_POLICY } });
  assert.equal(build([standard]).result.state.interpretations.length, build([smart]).result.state.interpretations.length); assert.equal(build([standard]).result.state.interpretations.length, 0);
});

test("12 events in one journey never increase independence", () => {
  const one = satisfaction("POSITIVE", "p3-same-1", 4); const two = satisfaction("POSITIVE", "p3-same-2", 5); const state = build([one, two], { worldEvidence: [worldFor(one, [CONCEPTS[0]]), worldFor(two, [CONCEPTS[0]])] }).result.state;
  assert.equal(state.snapshot.dimensions.longTermConceptTaste[0].sufficiency.independentEvidenceCount, 1); assert.notEqual(state.snapshot.dimensions.longTermConceptTaste[0].sufficiency.state, "SUFFICIENT");
});

test("13 offline retry and duplicate event do not duplicate observations", () => {
  const original = satisfaction("POSITIVE", "p3-retry", 4); const retryBody = { ...original, eventId: "p3-retry-copy", observedAt: at(6), ingestedAt: at(7), temporalBinding: { ...original.temporalBinding, timeAuthority: "CLIENT_REPORTED_ACCEPTED_OFFLINE" } }; delete retryBody.eventHash; const retry = withEventHash(retryBody);
  const deduped = deduplicateCanonicalEvents([original, retry]); assert.equal(deduped.events.length, 1); const state = build(deduped.events, { worldEvidence: [worldFor(original, [CONCEPTS[0]])] }).result.state; assert.equal(state.observations.length, 1);
});

test("14 independent repeated experiences can reach synthetic sufficiency", () => {
  const one = satisfaction("POSITIVE", "p3-independent-1", 4, "journey-independent-1"); const two = satisfaction("POSITIVE", "p3-independent-2", 8, "journey-independent-2"); const state = build([one, two], { worldEvidence: [worldFor(one, [CONCEPTS[0]]), worldFor(two, [CONCEPTS[0]])] }).result.state;
  assert.equal(state.snapshot.dimensions.longTermConceptTaste[0].sufficiency.independentEvidenceCount, 2); assert.equal(state.snapshot.dimensions.longTermConceptTaste[0].sufficiency.state, "SUFFICIENT");
});

test("15 positive and negative concept evidence coexist", () => {
  const positive = satisfaction("POSITIVE", "p3-ambivalent-pos", 4); const negative = satisfaction("NEGATIVE", "p3-ambivalent-neg", 6); const state = build([positive, negative], { worldEvidence: [worldFor(positive, [CONCEPTS[0]]), worldFor(negative, [CONCEPTS[0]])] }).result.state;
  assert.equal(state.snapshot.dimensions.longTermConceptTaste.length, 1); assert.equal(state.snapshot.dimensions.aversions.length, 1); assert.equal(state.snapshot.conflicts.length, 1);
});

test("16 correction preserves observation history and removes active influence", () => {
  const positive = satisfaction("POSITIVE", "p3-corrected-positive", 3); const correctionBase = event(SYNTHETIC_EVENTS.correction, "p3-correction", 9, { journey: { resolution: "UNRESOLVED", journeyId: null, resolutionPolicyVersion: JOURNEY_POLICY, independenceEligible: false }, supersedesEventId: positive.eventId, payload: { kind: "CORRECTION", targetEventId: positive.eventId, correction: "RETRACT" } }); const correction = correctionBase;
  const state = build([positive, correction], { corrections: [correctionFor(correction, positive)], worldEvidence: [worldFor(positive, [CONCEPTS[0]])] }).result.state;
  assert.equal(state.observations.some((row) => row.eventId === positive.eventId && !row.active), true); assert.equal(state.interpretations.length, 0);
});

test("17 direct spot affinity never propagates to concept taste", () => {
  const positive = satisfaction("POSITIVE", "p3-direct", 4); const state = build([positive]).result.state; assert.equal(state.snapshot.dimensions.directSpotAffinities[0].propagatesToConceptTaste, false); assert.equal(state.snapshot.dimensions.longTermConceptTaste.length, 0);
});

test("18 practical preference stays outside taste", () => {
  const navigation = event(SYNTHETIC_EVENTS.navigation, "p3-practical", 2, { journey: { ...SYNTHETIC_EVENTS.navigation.journey, resolutionPolicyVersion: JOURNEY_POLICY } }); const practicalPolicy = policy({ version: "synthetic-practical-policy-v1", rules: [{ eventType: "NAVIGATION_INTENT", evidenceSlot: "INTENT", action: "PRACTICAL_CONTEXT_ONLY", requiredDirection: "NOT_APPLICABLE", requiresIndependentJourney: false, requiresWorldEvidence: false }] }); const state = build([navigation], { policy: practicalPolicy }).result.state;
  assert.equal(state.snapshot.dimensions.practicalPreferences.length, 1); assert.equal(state.snapshot.dimensions.longTermConceptTaste.length, 0);
});

test("19 contextual hypotheses never transfer into long-term taste", () => {
  const positive = satisfaction("POSITIVE", "p3-contextual", 4); const contextualPolicy = policy({ version: "synthetic-contextual-policy-v1", rules: [{ eventType: "SATISFACTION_RECORDED", evidenceSlot: "SATISFACTION", action: "CONTEXTUAL_CONCEPT_FROM_WORLD_SATISFACTION", requiredDirection: "ANY", requiresIndependentJourney: true, requiresWorldEvidence: true }] }); const state = build([positive], { policy: contextualPolicy, worldEvidence: [worldFor(positive, [CONCEPTS[0]])], contextEvidence: [contextFor(positive)] }).result.state;
  assert.equal(state.snapshot.dimensions.contextualTaste.length, 1); assert.equal(state.snapshot.dimensions.longTermConceptTaste.length, 0); assert.equal(state.interpretations.find((row) => row.dimension === "CONTEXTUAL_TASTE").context.transfersToLongTermTaste, false);
});

test("20 multiple concepts share one attribution and independence unit", () => {
  const positive = satisfaction("POSITIVE", "p3-multi-concept", 4); const state = build([positive], { worldEvidence: [worldFor(positive)] }).result.state; const concepts = state.interpretations.filter((row) => row.concept);
  assert.equal(concepts.length, 2); assert.equal(new Set(concepts.map((row) => row.attribution.attributionUnitId)).size, 1); assert.equal(new Set(concepts.flatMap((row) => row.independenceKeys)).size, 1);
});

test("21 unknown concept registry fails closed", () => {
  const p = policy(); const empty = build([]); const auth = modelAuthority(p); assert.throws(() => buildUserModel(empty.evidence, command(p, { conceptRegistryVersion: "unknown-registry" }), empty.evidenceAuth, auth, auth.trustContext), /unauthorized policy, registry/);
});

test("22 unknown interpretation policy fails closed", () => {
  const built = build([]); assert.throws(() => buildUserModel(built.evidence, { ...built.command, interpretationPolicyVersion: "unknown-policy" }, built.evidenceAuth, built.modelAuth, built.trustContext), /unauthorized policy/);
});

test("23 little evidence remains partial under an explicitly synthetic policy", () => {
  const positive = satisfaction("POSITIVE", "p3-partial", 4); const entry = build([positive], { worldEvidence: [worldFor(positive, [CONCEPTS[0]])] }).result.state.snapshot.dimensions.longTermConceptTaste[0]; assert.equal(entry.sufficiency.state, "PARTIAL"); assert.equal(entry.sufficiency.limitations.includes("SYNTHETIC_THRESHOLDS_ONLY"), true);
});

test("24 contradictory evidence remains explicitly unresolved", () => {
  const positive = satisfaction("POSITIVE", "p3-conflict-pos", 4); const negative = satisfaction("NEGATIVE", "p3-conflict-neg", 6); const snapshot = build([positive, negative], { worldEvidence: [worldFor(positive, [CONCEPTS[0]]), worldFor(negative, [CONCEPTS[0]])] }).result.state.snapshot; assert.equal(snapshot.conflicts[0].state, "UNRESOLVED"); assert.equal(snapshot.overallSufficiency.state, "CONFLICTING");
});

test("25 temporally inapplicable policy is rejected", () => {
  const expired = policy({ version: "synthetic-expired-policy", validUntil: "2026-01-10T00:00:00.000Z" }); const value = evidenceInput([]); const evidenceAuth = evidenceAuthority(value); const evidence = buildEvidenceChains(value, evidenceAuth); const auth = modelAuthority(expired); assert.throws(() => buildUserModel(evidence, command(expired), evidenceAuth, auth, auth.trustContext), /not temporally applicable/);
});

test("26 full and incremental reducers are byte-identical", () => {
  const prior = build([]); const positive = satisfaction("POSITIVE", "p3-parity", 4); const built = build([positive], { worldEvidence: [worldFor(positive, [CONCEPTS[0]])] }); const incremental = updateUserModel({ previous: prior.result, previousEvidence: prior.evidence, nextEvidence: built.evidence, previousCommand: prior.command, command: built.command, previousEvidenceAuthority: prior.evidenceAuth, nextEvidenceAuthority: built.evidenceAuth, previousModelContext: prior.modelAuth, previousTrustContext: prior.trustContext, modelContext: built.modelAuth, trustContext: built.trustContext }); assert.equal(canonicalJson(incremental.state), canonicalJson(built.result.state));
});

test("27 inner interpretation manipulation fails after complete outer rehash", () => {
  const positive = satisfaction("POSITIVE", "p3-tamper", 4); const built = build([positive], { worldEvidence: [worldFor(positive, [CONCEPTS[0]])] }); const state = structuredClone(built.result.state); const record = state.interpretations.find((row) => row.concept); const originalInterpretationHash = record.interpretationHash;
  record.statement = "POSSIBLE_AVERSION"; const recordBody = { ...record }; delete recordBody.interpretationHash; record.interpretationHash = contentHash(recordBody);
  state.snapshot.source.interpretationHashes = state.snapshot.source.interpretationHashes.map((hash) => hash === originalInterpretationHash ? record.interpretationHash : hash).sort();
  const snapshotBody = { ...state.snapshot }; delete snapshotBody.snapshotHash; state.snapshot.snapshotHash = contentHash(snapshotBody);
  state.latestSnapshotPointer.snapshotHash = state.snapshot.snapshotHash;
  state.incrementalReducerStateHash = contentHash({ snapshotHash: state.snapshot.snapshotHash, evidenceStateHash: built.evidence.state.stateHash });
  const stateBody = { ...state }; delete stateBody.stateHash; state.stateHash = contentHash(stateBody);
  assert.throws(() => verifyUserModelState(state, built.evidence, built.command, built.evidenceAuth, built.modelAuth, built.trustContext), /authoritative rebuild/);
});

test("28 foreign subject or evidence chain binding is rejected", () => {
  const positive = satisfaction("POSITIVE", "p3-foreign", 4); const built = build([positive]); const auth = modelAuthority(built.policy, { userId: SYNTHETIC_USER_B }); assert.throws(() => buildUserModel(built.evidence, built.command, built.evidenceAuth, auth, auth.trustContext), /foreign evidence/);
});

test("29 commercial fields are rejected and have no model path", () => {
  const built = build([]); for (const field of ["ownerTier", "payment", "advertising", "subscription", "signalStrength", "maturity"]) assert.throws(() => buildUserModel(built.evidence, { ...built.command, [field]: "forged" }, built.evidenceAuth, built.modelAuth, built.trustContext), /unknown field/); assert.equal(built.result.state.manifest.boundaries.commercialInputsAccepted, false);
});

test("30 account erasure deletes every personal model store and rebuild material", () => {
  const plan = planUserModelLifecycle("ACCOUNT_ERASURE", "operation-erasure", SYNTHETIC_USER_A, SYNTHETIC_SUBJECT_BINDING_HASH, NOW); const execution = lifecycleExecution(plan); const completed = verifyUserModelLifecycleCompletion(plan, execution.context, NOW); assert.equal(completed.state.status, "ERASED"); assert.equal(completed.state.rebuildMaterial, null); assert.equal(execution.records.filter((row) => row.store !== "technical_audit_manifests").every((row) => row.effect === "DELETE"), true); assert.throws(() => verifyUserModelLifecycleCompletion(plan, { ...execution.context, listExecutionRecords: () => execution.records.filter((row) => row.store !== "model_rebuild_material") }, NOW), /every canonical lifecycle store/);
});

test("save removal, missing evidence and reviews never become negative preference", () => {
  const removed = event(SYNTHETIC_EVENTS.remove, "p3-remove", 3, { journey: { ...SYNTHETIC_EVENTS.remove.journey, resolutionPolicyVersion: JOURNEY_POLICY } }); const review = event(SYNTHETIC_EVENTS.standardReview, "p3-review-only", 4, { journey: { ...SYNTHETIC_EVENTS.standardReview.journey, resolutionPolicyVersion: JOURNEY_POLICY } }); const state = build([removed, review]).result.state; assert.equal(state.snapshot.dimensions.aversions.length, 0); assert.equal(state.interpretations.length, 0);
});

test("server authority, not a self-hash, chooses policy, registry and reducer", () => {
  const built = build([]); const forged = policy({ version: "synthetic-forged-policy" }); const context = { ...built.modelAuth, getInterpretationPolicy: () => forged }; assert.throws(() => buildUserModel(built.evidence, built.command, built.evidenceAuth, context, built.trustContext), /not bound by server authority/); assert.throws(() => buildUserModel(built.evidence, { ...built.command, reducerVersion: "client-reducer" }, built.evidenceAuth, built.modelAuth, built.trustContext), /unauthorized/);
});

test("phase 3A manifests expose no production policy, ranking or eligibility authority", () => {
  const manifest = build([]).result.state.manifest; assert.equal(manifest.interpretationPolicy.productionPolicyConfigured, false); assert.equal(manifest.boundaries.rankingAuthority, false); assert.equal(manifest.boundaries.eligibilityAuthority, false); assert.equal(manifest.boundaries.worldFactWriteAuthority, false); assert.equal(manifest.retentionConfigured, false);
});

test("alternative synthetic policies are deterministic and visibly different", () => {
  const navigation = event(SYNTHETIC_EVENTS.navigation, "p3-policy-comparison", 2, { journey: { ...SYNTHETIC_EVENTS.navigation.journey, resolutionPolicyVersion: JOURNEY_POLICY } }); const base = build([navigation]); const practicalPolicy = policy({ version: "synthetic-practical-comparison", rules: [{ eventType: "NAVIGATION_INTENT", evidenceSlot: "INTENT", action: "PRACTICAL_CONTEXT_ONLY", requiredDirection: "NOT_APPLICABLE", requiresIndependentJourney: false, requiresWorldEvidence: false }] }); const alternative = build([navigation], { policy: practicalPolicy }); assert.notEqual(base.result.state.stateHash, alternative.result.state.stateHash); assert.deepEqual(build([navigation], { policy: practicalPolicy }).result.state, alternative.result.state);
});

test("weak repeated observations cannot erase explicit negative evidence without policy", () => {
  const negative = satisfaction("NEGATIVE", "p3-strong-negative", 5); const open1 = event(SYNTHETIC_EVENTS.open, "p3-weak-open-1", 1, { journey: { ...SYNTHETIC_EVENTS.open.journey, resolutionPolicyVersion: JOURNEY_POLICY } }); const open2 = event(SYNTHETIC_EVENTS.open, "p3-weak-open-2", 2, { journey: { ...SYNTHETIC_EVENTS.open.journey, resolutionPolicyVersion: JOURNEY_POLICY } });
  const state = build([open1, open2, negative], { worldEvidence: [worldFor(negative, [CONCEPTS[0]])] }).result.state;
  assert.equal(state.snapshot.dimensions.aversions.length, 1); assert.equal(state.snapshot.dimensions.longTermConceptTaste.length, 0);
});

test("closure: a fully consistent forged authority stack fails against the unchanged external trust anchor", () => {
  const accepted = build([]); const forgedPolicy = policy({ policyId: "forged-policy-id", version: "forged-policy-v1" }); const forged = modelAuthority(forgedPolicy, { recordId: "forged-record", registryVersion: "forged-registry", reducerVersion: "forged-reducer", reducerCode: "forged-code", temporalPolicyVersion: "forged-temporal", projectionPolicyVersion: "forged-projection" });
  const forgedCommand = command(forgedPolicy, { conceptRegistryVersion: "forged-registry", reducerVersion: "forged-reducer", temporalPolicyVersion: "forged-temporal" });
  assert.throws(() => buildUserModel(accepted.evidence, forgedCommand, accepted.evidenceAuth, forged, accepted.trustContext), /trust anchor|expected object/i);
});

test("closure: authority record identity, hash, subject, consent, lifecycle and validity fail closed", () => {
  const built = build([]); const cases = [
    { ...built.modelAuth.authority, subject: { ...built.modelAuth.authority.subject, boundUserId: SYNTHETIC_USER_B } },
    { ...built.modelAuth.authority, subject: { ...built.modelAuth.authority.subject, subjectBindingHash: contentHash("foreign-subject") } },
    { ...built.modelAuth.authority, consent: { ...built.modelAuth.authority.consent, consentVersion: "foreign-consent" } },
    { ...built.modelAuth.authority, lifecycleState: "RESET" },
  ];
  for (const authority of cases) assert.throws(() => buildUserModel(built.evidence, built.command, built.evidenceAuth, { ...built.modelAuth, getAuthority: () => authority }, built.trustContext), /accepted record/);
  assert.throws(() => buildUserModel(built.evidence, built.command, built.evidenceAuth, { ...built.modelAuth, getAuthorityRecord: () => ({ ...built.modelAuth.record, recordHash: contentHash("wrong") }) }, built.trustContext), /record hash/);
  const expired = modelAuthority(built.policy, { recordValidUntil: "2026-01-10T00:00:00.000Z" }); assert.throws(() => buildUserModel(built.evidence, built.command, built.evidenceAuth, expired, expired.trustContext), /not temporally valid/);
  assert.throws(() => buildUserModel(built.evidence, built.command, built.evidenceAuth, built.modelAuth, { getAcceptedTrustAnchor: () => null }), /expected object/i);
});

test("closure: policy, registry, reducer, temporal and projection bindings are exact", () => {
  const built = build([]);
  for (const authority of [
    { ...built.modelAuth.authority, interpretationPolicy: { ...built.modelAuth.authority.interpretationPolicy, policyHash: contentHash("foreign-policy") } },
    { ...built.modelAuth.authority, conceptRegistry: { ...built.modelAuth.authority.conceptRegistry, registryHash: contentHash("foreign-registry") } },
    { ...built.modelAuth.authority, reducer: { ...built.modelAuth.authority.reducer, codeHash: contentHash("foreign-reducer") } },
    { ...built.modelAuth.authority, temporalPolicyVersion: "foreign-temporal" },
    { ...built.modelAuth.authority, projectionPolicyVersion: "foreign-projection" },
  ]) assert.throws(() => buildUserModel(built.evidence, built.command, built.evidenceAuth, { ...built.modelAuth, getAuthority: () => authority }, built.trustContext), /accepted record/);
});

test("closure: genuine incremental path matches full rebuild for a non-empty state and one new event", () => {
  const one = satisfaction("POSITIVE", "inc-one", 2, "inc-journey-one"); const two = satisfaction("POSITIVE", "inc-two", 4, "inc-journey-two"); const prior = build([one], { worldEvidence: [worldFor(one, [CONCEPTS[0]])] }); const next = build([one, two], { worldEvidence: [worldFor(one, [CONCEPTS[0]]), worldFor(two, [CONCEPTS[0]])] }); assert.deepEqual(incremental(prior, next).state, next.result.state);
});

test("closure: incremental parity covers multiple journeys, duplicate checkpoint and late evidence", () => {
  const one = satisfaction("POSITIVE", "inc-multi-one", 6, "inc-multi-journey-one"); const two = satisfaction("POSITIVE", "inc-multi-two", 8, "inc-multi-journey-two"); const late = satisfaction("POSITIVE", "inc-late", 2, "inc-multi-journey-one");
  const prior = build([one], { worldEvidence: [worldFor(one, [CONCEPTS[0]])] }); const multi = build([one, two], { worldEvidence: [worldFor(one, [CONCEPTS[0]]), worldFor(two, [CONCEPTS[0]])] }); const delayed = build([late, one], { worldEvidence: [worldFor(late, [CONCEPTS[0]]), worldFor(one, [CONCEPTS[0]])] });
  assert.deepEqual(incremental(prior, multi).state, multi.result.state); assert.deepEqual(incremental(prior, prior).state, prior.result.state); assert.deepEqual(incremental(prior, delayed).state, delayed.result.state);
});

test("closure: incremental parity covers correction and positive-negative delta", () => {
  const positive = satisfaction("POSITIVE", "inc-correct-positive", 2); const correction = event(SYNTHETIC_EVENTS.correction, "inc-correction", 9, { journey: { resolution: "UNRESOLVED", journeyId: null, resolutionPolicyVersion: JOURNEY_POLICY, independenceEligible: false }, supersedesEventId: positive.eventId, payload: { kind: "CORRECTION", targetEventId: positive.eventId, correction: "RETRACT" } });
  const prior = build([positive], { worldEvidence: [worldFor(positive, [CONCEPTS[0]])] }); const corrected = build([positive, correction], { corrections: [correctionFor(correction, positive)], worldEvidence: [worldFor(positive, [CONCEPTS[0]])] }); assert.deepEqual(incremental(prior, corrected).state, corrected.result.state);
  const negative = satisfaction("NEGATIVE", "inc-negative", 7, "inc-negative-journey"); const mixed = build([positive, negative], { worldEvidence: [worldFor(positive, [CONCEPTS[0]]), worldFor(negative, [CONCEPTS[0]])] }); assert.deepEqual(incremental(prior, mixed).state, mixed.result.state);
});

test("closure: incremental parity covers context-bound and direct-spot interpretations", () => {
  const contextualPolicy = policy({ version: "synthetic-context-incremental", rules: [{ eventType: "SATISFACTION_RECORDED", evidenceSlot: "SATISFACTION", action: "CONTEXTUAL_CONCEPT_FROM_WORLD_SATISFACTION", requiredDirection: "ANY", requiresIndependentJourney: true, requiresWorldEvidence: true }] });
  const contextual = satisfaction("POSITIVE", "inc-context", 4); const contextPrior = build([], { policy: contextualPolicy }); const contextNext = build([contextual], { policy: contextualPolicy, worldEvidence: [worldFor(contextual, [CONCEPTS[0]])], contextEvidence: [contextFor(contextual)] }); assert.deepEqual(incremental(contextPrior, contextNext).state, contextNext.result.state);
  const direct = satisfaction("POSITIVE", "inc-direct", 5); const directPrior = build([]); const directNext = build([direct]); assert.deepEqual(incremental(directPrior, directNext).state, directNext.result.state);
});

test("closure: incremental rejects missing or removed history and manipulated previous bindings", () => {
  const one = satisfaction("POSITIVE", "inc-history", 3); const prior = build([one]); const empty = build([]);
  assert.throws(() => incremental(prior, empty), /removed or replaced historical ledger evidence|removed a historical chain/);
  const badEvidence = structuredClone(prior.evidence); badEvidence.state.ledgerEventHashes = []; const evidenceBody = { ...badEvidence.state }; delete evidenceBody.stateHash; badEvidence.state.stateHash = contentHash(evidenceBody); assert.throws(() => incremental(prior, prior, { previousEvidence: badEvidence }), /authoritative rebuild|ledger checkpoint/);
  const badPrevious = structuredClone(prior.result); badPrevious.state.subjectBindingHash = contentHash("tampered-subject"); const stateBody = { ...badPrevious.state }; delete stateBody.stateHash; badPrevious.state.stateHash = contentHash(stateBody); assert.throws(() => incremental(prior, prior, { previous: badPrevious }), /authoritative rebuild/);
  const worldPrior = build([one], { worldEvidence: [worldFor(one, [CONCEPTS[0]])] }); const replacedWorld = build([one], { worldEvidence: [worldFor(one, [CONCEPTS[1]])] }); assert.throws(() => incremental(worldPrior, replacedWorld), /replaced historical/);
});

test("closure: incremental requires full rebuild for policy, registry or reducer changes and rejects foreign user", () => {
  const prior = build([]); const changedPolicy = policy({ policyId: "changed-policy-id", version: "changed-policy-v1" }); const policyNext = build([], { policy: changedPolicy }); assert.throws(() => incremental(prior, policyNext), /requires a full rebuild/);
  const registryNext = build([], { command: { conceptRegistryVersion: "changed-registry" }, registryVersion: "changed-registry" }); assert.throws(() => incremental(prior, registryNext), /requires a full rebuild/);
  const reducerNext = build([], { command: { reducerVersion: "changed-reducer" }, reducerVersion: "changed-reducer", reducerCode: "changed-code" }); assert.throws(() => incremental(prior, reducerNext), /requires a full rebuild/);
  const foreign = build([], { userId: SYNTHETIC_USER_B, subjectBindingHash: contentHash("foreign-user-binding") }); assert.throws(() => incremental(prior, foreign), /foreign evidence|checkpoint|subject/);
});

test("closure: lifecycle plan cannot claim completion or shorten the canonical store set", () => {
  const plan = planUserModelLifecycle("ACCOUNT_ERASURE", "closure-erasure", SYNTHETIC_USER_A, SYNTHETIC_SUBJECT_BINDING_HASH, NOW); assert.equal(plan.status, "PLANNED"); assert.equal(plan.requirements.length, REQUIRED_LIFECYCLE_STORES.length);
  const shortened = { ...plan, requirements: plan.requirements.slice(1) }; const body = { ...shortened }; delete body.planHash; shortened.planHash = contentHash(body); const execution = lifecycleExecution(plan); assert.throws(() => verifyUserModelLifecycleCompletion(shortened, { ...execution.context, listExecutionRecords: () => execution.records.slice(1) }, NOW), /complete canonical manifest/);
});

test("closure: lifecycle completion rejects duplicate, missing, invalidated, foreign and self-declared execution", () => {
  const plan = planUserModelLifecycle("ACCOUNT_ERASURE", "closure-execution", SYNTHETIC_USER_A, SYNTHETIC_SUBJECT_BINDING_HASH, NOW); const valid = lifecycleExecution(plan);
  assert.throws(() => verifyUserModelLifecycleCompletion(plan, { ...valid.context, listExecutionRecords: () => [...valid.records, valid.records[0]] }, NOW), /duplicate identity/);
  assert.throws(() => verifyUserModelLifecycleCompletion(plan, { ...valid.context, listExecutionRecords: () => valid.records.slice(1) }, NOW), /every canonical lifecycle store/);
  for (const change of [{ effect: "INVALIDATE" }, { operationId: "foreign-operation" }, { action: "CONSENT_WITHDRAWAL" }, { subject: { boundUserId: SYNTHETIC_USER_B, subjectBindingHash: SYNTHETIC_SUBJECT_BINDING_HASH } }, { subject: { boundUserId: SYNTHETIC_USER_A, subjectBindingHash: contentHash("foreign") } }]) {
    const forged = lifecycleExecution(plan, (record) => { if (record.store !== "event_ledger") return record; const body = { ...record, ...change }; delete body.recordHash; return withUserModelLifecycleExecutionRecordHash(body); }); assert.throws(() => verifyUserModelLifecycleCompletion(plan, forged.context, NOW), /invalid or missing|Expected one of/);
  }
  const selfDeclared = { ...valid.records[0], executorAuthority: "SELF_DECLARED" }; assert.throws(() => verifyUserModelLifecycleCompletion(plan, { ...valid.context, listExecutionRecords: () => [selfDeclared, ...valid.records.slice(1)] }, NOW), /expected/i);
});

test("closure: lifecycle rejects tampering, unknown manifest, remaining rebuild material and personal audit residue", () => {
  const plan = planUserModelLifecycle("ACCOUNT_ERASURE", "closure-residue", SYNTHETIC_USER_A, SYNTHETIC_SUBJECT_BINDING_HASH, NOW); const valid = lifecycleExecution(plan);
  const tampered = { ...valid.records[0], executedAt: "2026-01-15T13:00:00.000Z" }; assert.throws(() => verifyUserModelLifecycleCompletion(plan, { ...valid.context, listExecutionRecords: () => [tampered, ...valid.records.slice(1)] }, NOW), /record hash/);
  const unknownManifest = { ...plan, manifestHash: contentHash("unknown-manifest") }; assert.throws(() => verifyUserModelLifecycleCompletion(unknownManifest, valid.context, NOW), /expected/i);
  const residue = lifecycleExecution(plan, (record) => { if (record.store !== "model_rebuild_material" && record.store !== "technical_audit_manifests") return record; const body = { ...record, personalDataRemaining: true }; delete body.recordHash; return withUserModelLifecycleExecutionRecordHash(body); }); assert.throws(() => verifyUserModelLifecycleCompletion(plan, residue.context, NOW), /still contains personal data/);
});

test("closure: privacy-neutral projection identity is independent of all personal model state", () => {
  const request = { ...SYNTHETIC_PROJECTION_REQUEST, snapshot: null }; const cold = build([]).result; const positive = satisfaction("POSITIVE", "projection-rich", 4); const rich = build([positive], { worldEvidence: [worldFor(positive, [CONCEPTS[0]])] }).result;
  const fromCold = buildUserModelDecisionProjection(request, NO_CONSENT, cold, NOW); const fromRich = buildUserModelDecisionProjection(request, NO_CONSENT, rich, NOW);
  assert.equal(fromCold.projectionId, fromRich.projectionId); assert.equal(fromCold.projectionHash, fromRich.projectionHash); assert.equal(fromCold.subjectBindingHash, contentHash("backyrd.user-intelligence.neutral-subject-binding@1.0")); assert.equal(canonicalJson(fromRich).includes(rich.state.stateHash), false);
});

test("closure: active request, consent, subject, snapshot and projection policy must agree", () => {
  const built = build([]); const request = { ...SYNTHETIC_PROJECTION_REQUEST, projectionPolicyVersion: "synthetic-phase3a-projection-v1", snapshot: { snapshotId: built.result.state.snapshot.snapshotId, snapshotHash: built.result.state.snapshot.snapshotHash } };
  assert.doesNotThrow(() => buildUserModelDecisionProjection(request, GRANTED_CONSENT, built.result, NOW));
  assert.throws(() => buildUserModelDecisionProjection({ ...request, actor: { ...request.actor, subjectBindingHash: contentHash("foreign") } }, GRANTED_CONSENT, built.result, NOW), /subject binding/);
  assert.throws(() => buildUserModelDecisionProjection(request, { ...GRANTED_CONSENT, consentVersion: "stale-consent" }, built.result, NOW), /stale/);
  assert.throws(() => buildUserModelDecisionProjection({ ...request, snapshot: { ...request.snapshot, snapshotHash: contentHash("stale") } }, GRANTED_CONSENT, built.result, NOW), /stale model snapshot/);
  assert.throws(() => buildUserModelDecisionProjection({ ...request, projectionPolicyVersion: "foreign-projection-policy" }, GRANTED_CONSENT, built.result, NOW), /projection policy/);
});

test("closure: synthetic sufficiency is visibly non-product and cannot activate a projection", () => {
  const one = satisfaction("POSITIVE", "suff-one", 3, "suff-journey-one"); const two = satisfaction("POSITIVE", "suff-two", 5, "suff-journey-two"); const built = build([one, two], { worldEvidence: [worldFor(one, [CONCEPTS[0]]), worldFor(two, [CONCEPTS[0]])] }); const sufficiency = built.result.state.snapshot.overallSufficiency;
  assert.equal(sufficiency.state, "SUFFICIENT"); assert.equal(sufficiency.policy.authority, "SYNTHETIC_FIXTURE_ONLY"); assert.equal(sufficiency.policy.productCalibrated, false); assert.equal(sufficiency.policy.productionAuthorized, false);
  const request = { ...SYNTHETIC_PROJECTION_REQUEST, projectionPolicyVersion: "synthetic-phase3a-projection-v1", snapshot: { snapshotId: built.result.state.snapshot.snapshotId, snapshotHash: built.result.state.snapshot.snapshotHash } }; assert.equal(buildUserModelDecisionProjection(request, GRANTED_CONSENT, built.result, NOW).status, "NEUTRAL");
  const state = structuredClone(built.result.state); state.snapshot.overallSufficiency.policy.authority = "PRODUCT_CALIBRATED"; const snapshotBody = { ...state.snapshot }; delete snapshotBody.snapshotHash; state.snapshot.snapshotHash = contentHash(snapshotBody); state.latestSnapshotPointer.snapshotHash = state.snapshot.snapshotHash; const stateBody = { ...state }; delete stateBody.stateHash; state.stateHash = contentHash(stateBody); assert.throws(() => verifyUserModelState(state, built.evidence, built.command, built.evidenceAuth, built.modelAuth, built.trustContext), /expected/i);
});

test("closure: canonical integrity entry point recursively verifies state, projection and lifecycle completion", () => {
  const built = build([]); const request = { ...SYNTHETIC_PROJECTION_REQUEST, projectionPolicyVersion: "synthetic-phase3a-projection-v1", snapshot: { snapshotId: built.result.state.snapshot.snapshotId, snapshotHash: built.result.state.snapshot.snapshotHash } }; const projection = buildUserModelDecisionProjection(request, GRANTED_CONSENT, built.result, NOW);
  const plan = planUserModelLifecycle("ACCOUNT_ERASURE", "integrity-erasure", SYNTHETIC_USER_A, SYNTHETIC_SUBJECT_BINDING_HASH, NOW); const execution = lifecycleExecution(plan); const completion = verifyUserModelLifecycleCompletion(plan, execution.context, NOW);
  assert.equal(verifyUserModelIntegrity({ state: built.result.state, evidence: built.evidence, command: built.command, evidenceAuthority: built.evidenceAuth, modelContext: built.modelAuth, trustContext: built.trustContext, projection: { value: projection, request, consent: GRANTED_CONSENT, now: NOW }, lifecycle: { value: completion, plan, executionContext: execution.context, completedAt: NOW } }).stateHash, built.result.state.stateHash);
  assert.throws(() => verifyUserModelIntegrity({ state: built.result.state, evidence: built.evidence, command: built.command, evidenceAuthority: built.evidenceAuth, modelContext: built.modelAuth, trustContext: built.trustContext, projection: { value: { ...projection, projectionId: "forged-projection" }, request, consent: GRANTED_CONSENT, now: NOW } }), /authoritative model projection/);
});
