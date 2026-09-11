import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_VERSIONS, FOUNDER_DECISION_RECORD_3C, FOUNDER_DECISION_TRUST_ANCHOR_3C,
  PRODUCT_INTERPRETATION_POLICY_3C, PRODUCT_POLICY_EVENT_TYPES, PRODUCT_POLICY_TRUST_ANCHOR_3C,
  PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C, REQUIRED_LIFECYCLE_STORES, USER_INTELLIGENCE_LIFECYCLE_MANIFEST,
  buildProductPolicyState, canonicalJson, contentHash, createPhase3CRepositoryReleaseTrust,
  createPhase3CSyntheticEvidenceTrust, deriveProductPolicyObservationFromCalibration,
  evaluateProductInterpretationPolicy, parseProductSignalSemanticsRegistry, planLifecycleImpact,
  syntheticCalibrationEvidence, syntheticTrustForEvidence, updateProductPolicyState,
  verifyProductInterpretationPolicy, verifyProductPolicyEvaluation, verifyProductPolicyState,
  withProductPolicyEvidenceAnchorHash, withProductPolicyObservationHash,
} from "../dist/index.js";

const SUBJECT = contentHash("phase3c-subject");
const NOW = "2026-09-11T10:00:00.000Z";
const releaseTrust = createPhase3CRepositoryReleaseTrust();
const authorities = {
  SHOWN: ["CLIENT_OBSERVATION"], OPENED: ["CLIENT_OBSERVATION"], DISMISSED: ["AUTHENTICATED_USER_ACTION"], REJECTED: ["AUTHENTICATED_USER_ACTION"], REJECT_REASON: ["AUTHENTICATED_USER_ACTION"], ALTERNATIVE_REQUESTED: ["AUTHENTICATED_USER_ACTION"],
  SAVED: ["SERVER_VERIFIED_PRODUCT_STATE"], SAVE_REMOVED: ["SERVER_VERIFIED_PRODUCT_STATE"], NAVIGATION_STARTED: ["AUTHENTICATED_USER_ACTION"], RESERVATION_INTENT: ["SERVER_VERIFIED_PRODUCT_STATE"], VISITED: ["VERIFIED_OUTCOME"], STANDARD_REVIEW: ["SERVER_VERIFIED_PRODUCT_STATE"], SMART_REVIEW: ["SERVER_VERIFIED_PRODUCT_STATE"],
  EXPLICIT_SATISFACTION: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"], EXPLICIT_DISSATISFACTION: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"], EXPLICIT_UNDECIDED: ["AUTHENTICATED_USER_ACTION"], REVIEW_MOODS: ["SERVER_VERIFIED_PRODUCT_STATE"], MOMENT_CREATED: ["SERVER_VERIFIED_PRODUCT_STATE", "VERIFIED_OUTCOME"], SEARCH: ["AUTHENTICATED_USER_ACTION", "SERVER_MINIMIZATION_SERVICE"], DWELL: ["CLIENT_OBSERVATION", "SERVER_MINIMIZATION_SERVICE"], QUICK_SKIP: ["AUTHENTICATED_USER_ACTION"], REPEAT_VISIT: ["VERIFIED_OUTCOME"], CORRECTION: ["AUTHENTICATED_USER_ACTION", "SERVER_EVENT_LEDGER"], MOOD_CONTEXT_SELECTED: ["AUTHENTICATED_USER_ACTION"], EXPLORATION_CONTROL_SELECTED: ["AUTHENTICATED_USER_ACTION"], SPOT_NOT_FIT: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"],
};

const fixture = (id, eventType, overrides = {}) => withProductPolicyObservationHash({
  contractVersion: CONTRACT_VERSIONS.productPolicyObservation, recordId: `fixture-${id}`, subjectBindingHash: SUBJECT,
  eventType, occurredAt: NOW, active: true, sourceMode: "SYNTHETIC_FUTURE_EVENT_FIXTURE",
  sourceEvidenceHash: contentHash(`evidence-${id}`), sourceChainHash: contentHash(`chain-${id}`), authorityProofs: authorities[eventType],
  journeyId: `journey-${id}`, independenceEligible: ["VISITED", "REPEAT_VISIT", "SEARCH"].includes(eventType), spotId: "spot-a", decisionId: "decision-a",
  contextHash: ["SEARCH", "QUICK_SKIP", "SPOT_NOT_FIT"].includes(eventType) ? contentHash("context-a") : null,
  contextDimensions: ["SEARCH", "QUICK_SKIP", "SPOT_NOT_FIT"].includes(eventType) ? ["DAY_PHASE"] : [], conceptIds: [], worldAttribution: "NOT_APPLICABLE",
  experienceConfirmed: ["VISITED", "REPEAT_VISIT", "STANDARD_REVIEW", "SMART_REVIEW", "EXPLICIT_SATISFACTION", "EXPLICIT_DISSATISFACTION", "EXPLICIT_UNDECIDED", "REVIEW_MOODS", "MOMENT_CREATED"].includes(eventType),
  explicitOutcome: eventType === "EXPLICIT_SATISFACTION" ? "POSITIVE" : eventType === "EXPLICIT_DISSATISFACTION" ? "NEGATIVE" : eventType === "EXPLICIT_UNDECIDED" ? "UNDECIDED" : "NONE",
  explorationChoice: eventType === "EXPLORATION_CONTROL_SELECTED" ? "EITHER" : null,
  correctionTargetRecordId: null, correctionTargetSourceEvidenceHash: null,
  rawSensitiveDataIncluded: false, ...overrides,
});
const anchor = (row) => withProductPolicyEvidenceAnchorHash({ contractVersion: CONTRACT_VERSIONS.productPolicyEvidenceAnchor, anchorId: `anchor-${row.recordId}`, acceptedRecordId: row.recordId, acceptedRecordHash: row.recordHash, acceptedSourceEvidenceHash: row.sourceEvidenceHash, acceptedSourceChainHash: row.sourceChainHash, subjectBindingHash: row.subjectBindingHash, issuer: "SYNTHETIC_PHASE3C_EVALUATION_AUTHORITY", productionAuthorized: false });
const trust = (rows) => createPhase3CSyntheticEvidenceTrust(rows, rows.map(anchor));
const run = (rows, extra = {}) => evaluateProductInterpretationPolicy({ evaluationId: "phase3c-evaluation", subjectBindingHash: SUBJECT, lifecycle: "ACTIVE", purpose: "POLICY_VALIDATION", observations: rows, ...extra }, releaseTrust, trust(rows));

test("Founder record binds exactly 20 frozen decisions and cannot self-authorize a replacement", () => {
  assert.equal(FOUNDER_DECISION_RECORD_3C.decisions.length, 20);
  assert.deepEqual(FOUNDER_DECISION_RECORD_3C.decisions.map(({ decisionId }) => decisionId), Array.from({ length: 20 }, (_, i) => String(i + 1)));
  assert.equal(FOUNDER_DECISION_RECORD_3C.productionAuthorized, false);
  const forged = structuredClone(PRODUCT_INTERPRETATION_POLICY_3C); forged.founderDecisionRecord.decisionHash = contentHash("replacement");
  const body = { ...forged }; delete body.policyHash; forged.policyHash = contentHash(body);
  assert.throws(() => verifyProductInterpretationPolicy(forged, releaseTrust), /independently accepted|unknown Product|policy/i);
});

test("Product policy and registry are complete, runtime inactive and non-authoritative for ranking", () => {
  const registry = parseProductSignalSemanticsRegistry(PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C);
  assert.equal(registry.entries.length, PRODUCT_POLICY_EVENT_TYPES.length);
  assert.equal(new Set(registry.entries.map(({ eventType }) => eventType)).size, PRODUCT_POLICY_EVENT_TYPES.length);
  assert.equal(verifyProductInterpretationPolicy(PRODUCT_INTERPRETATION_POLICY_3C, releaseTrust).policyHash, PRODUCT_INTERPRETATION_POLICY_3C.policyHash);
  for (const field of ["productionAuthorized", "runtimeActivated", "shadowTrafficAuthorized", "rankingAuthorized", "eligibilityAuthorized"]) assert.equal(PRODUCT_INTERPRETATION_POLICY_3C[field], false);
  assert.equal(PRODUCT_INTERPRETATION_POLICY_3C.familiarityIndependentVisitThreshold, 3);
});

test("Phase 2 adapter is mandatory for existing canonical events and deterministic", () => {
  const phase2 = syntheticCalibrationEvidence({ id: "phase3c-adapter", eventType: "SAVED" });
  const calibrationTrust = syntheticTrustForEvidence(phase2);
  const first = deriveProductPolicyObservationFromCalibration(phase2, phase2.subjectBindingHash, calibrationTrust);
  const replay = deriveProductPolicyObservationFromCalibration(phase2, phase2.subjectBindingHash, calibrationTrust);
  assert.equal(canonicalJson(first), canonicalJson(replay)); assert.equal(first.sourceMode, "PHASE2_VERIFIED_ADAPTER");
  const forged = structuredClone(phase2); forged.chainHash = contentHash("foreign-chain"); const body = { ...forged }; delete body.recordHash; forged.recordHash = contentHash(body);
  assert.throws(() => deriveProductPolicyObservationFromCalibration(forged, phase2.subjectBindingHash, calibrationTrust), /binding|accepted|hash/i);
  assert.throws(() => deriveProductPolicyObservationFromCalibration(phase2, contentHash("foreign-subject"), calibrationTrust), /foreign subject/i);
});

test("explicit outcomes require composite authority and qualified experience", () => {
  const positive = fixture("positive", "EXPLICIT_SATISFACTION"); assert.ok(run([positive]).interpretations.some(({ direction }) => direction === "POSITIVE"));
  for (const authorityProofs of [["AUTHENTICATED_USER_ACTION"], ["SERVER_VERIFIED_PRODUCT_STATE"]]) {
    const invalid = fixture(`missing-${authorityProofs[0]}`, "EXPLICIT_SATISFACTION", { authorityProofs });
    assert.throws(() => run([invalid]), /authority requirement/);
  }
  const undecided = fixture("undecided", "EXPLICIT_UNDECIDED"); assert.equal(run([undecided]).interpretations.length, 0);
});

test("review variants are equal Experience without Satisfaction and moods never enter the model", () => {
  const standard = fixture("standard", "STANDARD_REVIEW"); const smart = fixture("smart", "SMART_REVIEW"); const moods = fixture("moods", "REVIEW_MOODS");
  assert.equal(run([standard]).interpretations.length, 0); assert.equal(run([smart]).interpretations.length, 0); assert.equal(run([moods]).interpretations.length, 0);
  const a = structuredClone(PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.entries.find(({ eventType }) => eventType === "STANDARD_REVIEW"));
  const b = structuredClone(PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C.entries.find(({ eventType }) => eventType === "SMART_REVIEW")); a.eventType = "REVIEW"; b.eventType = "REVIEW"; assert.equal(canonicalJson(a), canonicalJson(b));
});

test("save state, visit familiarity, moment, dwell and alternatives keep their frozen semantics", () => {
  const save = fixture("save", "SAVED"); assert.deepEqual(run([save]).interpretations.map(({ kind }) => kind), ["DIRECT_SPOT_PLANNING"]);
  assert.equal(run([save, fixture("remove", "SAVE_REMOVED", { occurredAt: "2026-09-11T10:01:00.000Z" })]).interpretations.length, 0);
  const visits = [1, 2, 3].map((n) => fixture(`visit-${n}`, "VISITED", { journeyId: `journey-visit-${n}` }));
  assert.equal(run(visits.slice(0, 1)).interpretations.length, 0); assert.equal(run(visits.slice(0, 2)).interpretations.length, 0);
  assert.ok(run(visits).interpretations.some(({ kind, limitations }) => kind === "FAMILIARITY" && limitations.includes("FAMILIARITY_IS_NOT_PREFERENCE")));
  const sameJourney = visits.map((row, i) => fixture(`same-visit-${i}`, "VISITED", { journeyId: "journey-same" })); assert.equal(run(sameJourney).interpretations.length, 0);
  assert.equal(run([fixture("alternative", "ALTERNATIVE_REQUESTED")]).interpretations.length, 0);
  assert.ok(run([fixture("moment", "MOMENT_CREATED")]).interpretations.every(({ direction }) => direction === "UNKNOWN"));
  const dwell = run([fixture("dwell", "DWELL")]); assert.ok(dwell.interpretations.some(({ kind }) => kind === "INTERACTION_ATTENTION")); assert.equal(dwell.evaluationPreview.items.length, 0);
});

test("skip and spot-not-fit remain weak and context-bound without global aversion", () => {
  for (const row of [fixture("skip", "QUICK_SKIP"), fixture("not-fit", "SPOT_NOT_FIT")]) {
    const result = run([row]); const item = result.interpretations[0]; assert.equal(item.direction, "NEGATIVE"); assert.equal(item.maturity, "TRANSITION_NOT_CONFIGURED"); assert.ok(item.targetKey.includes("decision:")); assert.equal(result.evaluationPreview.items.length, 0);
  }
});

test("searched mood and exploration control remain current Decision context, never personality", () => {
  const mood = fixture("mood-context", "MOOD_CONTEXT_SELECTED", { contextHash: contentHash("mood-context"), contextDimensions: ["REQUESTED_MOOD_CONCEPT"], conceptIds: ["mood.cozy"] });
  const exploration = fixture("exploration", "EXPLORATION_CONTROL_SELECTED", { explorationChoice: "NEW" });
  const result = run([mood, exploration]); assert.ok(result.interpretations.some(({ kind, limitations }) => kind === "CURRENT_DECISION_CONTEXT" && limitations.includes("NO_LONG_TERM_TRANSFER"))); assert.ok(result.interpretations.some(({ kind, limitations }) => kind === "EXPLORATION_REQUEST" && limitations.includes("NOT_PERSONALITY")));
});

test("search stores only minimized IDs, stays contextual and has no configured promotion", () => {
  const contextHash = contentHash("morning"); const rows = [1, 2].map((n) => fixture(`search-${n}`, "SEARCH", { journeyId: `journey-search-${n}`, contextHash, contextDimensions: ["DAY_PHASE"], conceptIds: ["vibe.cozy"] }));
  assert.equal(run(rows.slice(0, 1)).interpretations[0].maturity, "FIRST_HINT"); assert.equal(run(rows).interpretations[0].maturity, "TRANSITION_NOT_CONFIGURED");
  assert.equal(run(rows).evaluationPreview.items.length, 0);
  const { recordHash: _hash, ...searchBody } = rows[0]; assert.throws(() => withProductPolicyObservationHash({ ...searchBody, rawSearchText: "private" }), /unknown field/i);
});

test("same journey uses only strongest directed signal while retaining audit observations", () => {
  const weak = fixture("weak", "QUICK_SKIP", { journeyId: "journey-priority" }); const strong = fixture("strong", "EXPLICIT_SATISFACTION", { journeyId: "journey-priority", contextHash: weak.contextHash, contextDimensions: weak.contextDimensions });
  const result = run([weak, strong]); assert.equal(result.auditObservationIds.length, 2); assert.equal(result.interpretations.some(({ evidenceRecordIds }) => evidenceRecordIds.includes(weak.recordId)), false); assert.ok(result.interpretations.some(({ direction }) => direction === "POSITIVE"));
});

test("append-only correction removes only active influence and rejects foreign targets", () => {
  const target = fixture("correction-target", "EXPLICIT_SATISFACTION", { journeyId: "journey-correction", occurredAt: "2026-09-10T10:00:00.000Z" });
  const correction = fixture("correction", "CORRECTION", { journeyId: target.journeyId, spotId: target.spotId, occurredAt: NOW, correctionTargetRecordId: target.recordId, correctionTargetSourceEvidenceHash: target.sourceEvidenceHash });
  const result = run([target, correction]); assert.equal(result.auditObservationIds.length, 2); assert.equal(result.interpretations.length, 0);
  const foreign = fixture("foreign-correction", "CORRECTION", { journeyId: "journey-foreign", occurredAt: NOW, correctionTargetRecordId: target.recordId, correctionTargetSourceEvidenceHash: target.sourceEvidenceHash });
  assert.throws(() => run([target, foreign]), /correction is not canonically bound/);
});

test("concept transfer is fail-closed until a missing threshold is approved", () => {
  const rows = ["a", "b"].map((spot) => fixture(`concept-${spot}`, "EXPLICIT_SATISFACTION", { spotId: `spot-${spot}`, journeyId: `journey-${spot}`, independenceEligible: true, conceptIds: ["vibe.cozy"], worldAttribution: "CERTAIN" }));
  const result = run(rows); const concept = result.interpretations.find(({ kind }) => kind === "LONG_TERM_CONCEPT_TASTE"); assert.equal(concept.maturity, "TRANSITION_NOT_CONFIGURED"); assert.equal(result.evaluationPreview.items.some(({ kind }) => kind === "LONG_TERM_CONCEPT_TASTE"), false);
  assert.equal(run([fixture("world-unknown", "EXPLICIT_SATISFACTION", { conceptIds: ["vibe.cozy"], worldAttribution: "UNKNOWN" })]).interpretations.some(({ kind }) => kind === "LONG_TERM_CONCEPT_TASTE"), false);
});

test("context separation and semantic conflict preserve both directions and withhold conflict", () => {
  const ctxA = contentHash("friends"), ctxB = contentHash("alone");
  const positive = fixture("ctx-positive", "EXPLICIT_SATISFACTION", { contextHash: ctxA, contextDimensions: ["COMPANY_TYPE"] });
  const separated = fixture("ctx-negative", "EXPLICIT_DISSATISFACTION", { contextHash: ctxB, contextDimensions: ["COMPANY_TYPE"] }); assert.equal(run([positive, separated]).conflicts.length, 0);
  const conflict = fixture("conflict-negative", "EXPLICIT_DISSATISFACTION", { contextHash: ctxA, contextDimensions: ["COMPANY_TYPE"] }); const result = run([positive, conflict]);
  assert.equal(result.conflicts.length, 1); assert.equal(result.conflicts[0].resolution, "UNRESOLVED"); assert.equal(result.evaluationPreview.items.some(({ targetKey }) => targetKey === "spot:spot-a"), false); assert.deepEqual(result.evaluationPreview.withheldConflictIds, [result.conflicts[0].conflictId]);
});

test("no consent, withdrawal, reset and erasure are non-personal and production projection is always neutral", () => {
  for (const lifecycle of ["NO_CONSENT", "WITHDRAWN", "RESET", "ERASED"]) {
    const result = evaluateProductInterpretationPolicy({ evaluationId: `neutral-${lifecycle}`, subjectBindingHash: null, lifecycle, purpose: "POLICY_VALIDATION", observations: [] }, releaseTrust, createPhase3CSyntheticEvidenceTrust([], []));
    assert.equal(result.subjectBindingHash, null); assert.deepEqual(result.interpretations, []); assert.deepEqual(result.conflicts, []); assert.equal(result.productionBoundary.containsPersonalModelData, false); assert.deepEqual(result.productionBoundary.items, []);
  }
  assert.throws(() => evaluateProductInterpretationPolicy({ evaluationId: "leak", subjectBindingHash: SUBJECT, lifecycle: "NO_CONSENT", purpose: "POLICY_VALIDATION", observations: [] }, releaseTrust, createPhase3CSyntheticEvidenceTrust([], [])), /cannot retain personal/);
});

test("normal UI hides profile while the purpose-bound legal export can carry required derived records", () => {
  const row = fixture("privacy", "EXPLICIT_SATISFACTION"); const normal = run([row]); const exported = run([row], { purpose: "PRIVACY_EXPORT" });
  assert.equal(normal.legalPrivacyExport.normalProductUiVisible, false); assert.equal(normal.legalPrivacyExport.includesRequiredDerivedData, false);
  assert.equal(exported.legalPrivacyExport.includesRequiredDerivedData, true); assert.ok(exported.legalPrivacyExport.interpretationIds.length > 0);
});

test("recursive verification rejects inner manipulation after complete outer rehash", () => {
  const row = fixture("integrity", "EXPLICIT_SATISFACTION"); const input = { evaluationId: "phase3c-evaluation", subjectBindingHash: SUBJECT, lifecycle: "ACTIVE", purpose: "POLICY_VALIDATION", observations: [row] }; const evidenceTrust = trust([row]);
  const accepted = evaluateProductInterpretationPolicy(input, releaseTrust, evidenceTrust); assert.equal(verifyProductPolicyEvaluation(accepted, input, releaseTrust, evidenceTrust).evaluationHash, accepted.evaluationHash);
  const forged = structuredClone(accepted); forged.interpretations[0].limitations = ["ATTACKER_RELABELED"]; const inner = { ...forged.interpretations[0] }; delete inner.interpretationHash; forged.interpretations[0].interpretationHash = contentHash(inner); const outer = { ...forged }; delete outer.evaluationHash; forged.evaluationHash = contentHash(outer);
  assert.throws(() => verifyProductPolicyEvaluation(forged, input, releaseTrust, evidenceTrust), /authoritative reconstruction/);
});

test("incremental delta and independent full rebuild are byte-identical", () => {
  const first = fixture("incremental-a", "EXPLICIT_SATISFACTION"); const second = fixture("incremental-b", "EXPLICIT_DISSATISFACTION", { journeyId: "journey-incremental-b", contextHash: contentHash("other"), contextDimensions: ["DAY_PHASE"] }); const allTrust = trust([first, second]);
  const initial = buildProductPolicyState({ evaluationId: "incremental", subjectBindingHash: SUBJECT, lifecycle: "ACTIVE", purpose: "POLICY_VALIDATION", observations: [first] }, releaseTrust, allTrust);
  const incremental = updateProductPolicyState(initial, [second], releaseTrust, allTrust); const full = buildProductPolicyState({ evaluationId: "incremental", subjectBindingHash: SUBJECT, lifecycle: "ACTIVE", purpose: "POLICY_VALIDATION", observations: [first, second] }, releaseTrust, allTrust);
  assert.equal(canonicalJson(incremental), canonicalJson(full)); assert.equal(verifyProductPolicyState(full, releaseTrust, allTrust).stateHash, full.stateHash);
});

test("commercial fields have no boundary and lifecycle covers all Phase 3C personal stores", () => {
  const row = fixture("commercial", "SAVED"); const { recordHash: _hash, ...rowBody } = row; for (const field of ["ownerTier", "payment", "advertising", "sponsorship"]) assert.throws(() => withProductPolicyObservationHash({ ...rowBody, [field]: true }), /unknown field/i);
  for (const store of ["product_policy_evaluations_subject_bound", "product_policy_rebuild_material", "privacy_export_material"]) assert.ok(REQUIRED_LIFECYCLE_STORES.includes(store));
  const erasure = planLifecycleImpact("ACCOUNT_ERASURE"); for (const row of USER_INTELLIGENCE_LIFECYCLE_MANIFEST.stores.filter(({ privacyClass }) => privacyClass !== "NON_PERSONAL_TECHNICAL")) assert.equal(erasure.find(({ store }) => store === row.store).effect, "DELETE");
});

test("identical inputs replay byte-identically", () => { const rows = [fixture("replay", "EXPLICIT_SATISFACTION")]; assert.equal(canonicalJson(run(rows)), canonicalJson(run(rows))); });
