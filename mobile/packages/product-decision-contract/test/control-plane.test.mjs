import assert from "node:assert/strict";
import test from "node:test";
import {
  executeDecisionProductSingleRoute,
  executeDecisionProductInteraction,
  DecisionProductUnavailableError,
  validateDecisionProductRequest,
  validateDecisionProductResponse,
} from "../src/index.mjs";

const hash = (character) => character.repeat(64);
const binding = {
  status: "PRODUCT_SINGLE_ROUTE_BOUND",
  releaseHash: hash("a"), bindingHash: hash("b"), transportFunction: "decision-v13",
  requestContract: "backyrd.decision-vnext.product-request@1.0",
  responseContract: "backyrd.decision-vnext.product-response@1.0",
  executionAuthorized: false,
};
const request = {
  contractVersion: "backyrd.decision-vnext.product-request@1.0",
  requestId: "request-12345678",
  idempotencyKey: "idem-12345678",
  naturalLanguage: "Ruhiges Café in Basel",
  explicit: { primaryIntent: "cafe", moods: ["quiet"], targetCity: "Basel", softPreferences: [] },
  alternativeRequested: false,
  previouslyPresentedCandidateIds: [],
  rejectedCandidateIds: [],
};
const candidate = {
  spotId: "spot-12345678",
  presentation: { contractVersion: "backyrd.decision-vnext.product-presentation@1.0", spotId: "spot-12345678", name: "Café", locality: "Basel", categoryLabel: "Café", imageUrl: null, sourceHash: hash("1"), presentationHash: hash("2") },
  tier: "ELIGIBLE_CONFIRMED", rank: 1, coreIntentCoverage: "CONFIRMED", actualAvailability: "open",
  confirmedHardConstraints: [], unknownHardConstraints: [], failedHardConstraints: [],
  rankVector: { vectorHash: hash("3") },
  reasons: [{ code: "core-intent", domain: "WORLD", sourceHash: hash("4"), statement: "Passt zum gewünschten Café-Moment.", confirmed: true }],
  limitations: [], contextualReject: false, candidateHash: hash("5"),
};
const response = (source = request) => ({
  contractVersion: "backyrd.decision-vnext.product-response@1.0", status: "AVAILABLE",
  decisionId: "decision-12345678", requestHash: hash("6"), envelopeHash: hash("7"),
  rankingPolicyVersion: "backyrd.decision-vnext.product-ranking-policy@1.0", rankingPolicyHash: hash("8"),
  interpretation: { interpretationHash: hash("9"), targetCity: "Basel" },
  primaryCandidateId: candidate.spotId, candidates: [candidate], limitations: ["hours-uncertain"],
  alternative: { requested: source.alternativeRequested, selectedCandidateId: source.alternativeRequested ? candidate.spotId : null, negativeSignalProduced: false },
  reject: { candidateIds: source.rejectedCandidateIds, contextualOnly: true, worldFactProduced: false },
  personalization: { state: "NEUTRAL", neutralReason: "NO_CONSENT", projectionHash: hash("a") },
  learning: { mode: "DISABLED_NEUTRAL", acknowledgement: "NOT_APPLICABLE_NEUTRAL", eventCount: 0, rawTextIncluded: false },
  productOutputAuthorized: true, legacyEngineUsed: false, fallbackUsed: false, resultHash: hash("b"),
});

test("the Build-57 transport accepts only the vNext Product contract", async () => {
  let calls = 0;
  const result = await executeDecisionProductSingleRoute({ binding, request, invoke: async () => { calls += 1; return response(); } });
  assert.equal(calls, 1); assert.equal(result.status, "AVAILABLE"); assert.equal(result.candidates[0].rank, 1);
  await assert.rejects(() => executeDecisionProductSingleRoute({ binding: { ...binding, transportFunction: "decision-vnext" }, request, invoke: async () => response() }), /decision_transport_slug_invalid/);
  await assert.rejects(() => executeDecisionProductSingleRoute({ binding, request, invoke: async () => { throw new Error("offline"); } }), DecisionProductUnavailableError);
});

test("legacy, Founder and evaluation-only responses fail visibly without fallback", () => {
  assert.throws(() => validateDecisionProductResponse({ ok: true, north_star: { active: true }, candidates: [] }, request), /decision_response_shape_invalid/);
  assert.throws(() => validateDecisionProductResponse({ ...response(), contractVersion: "backyrd.decision-vnext.founder-live-response@1.1", status: "EVALUATION_ONLY" }, request), /decision_response_version_or_status_invalid/);
});

test("ranking, presentation, reasons and limitations are strict", () => {
  assert.throws(() => validateDecisionProductResponse({ ...response(), candidates: [{ ...candidate, rank: 0 }] }, request), /decision_candidate_rank_invalid/);
  assert.throws(() => validateDecisionProductResponse({ ...response(), candidates: [{ ...candidate, actualAvailability: "maybe" }] }, request), /decision_candidate_availability_invalid/);
  assert.throws(() => validateDecisionProductResponse({ ...response(), candidates: [{ ...candidate, reasons: [] }] }, request), /decision_candidate_reasons_invalid/);
  assert.throws(() => validateDecisionProductResponse({ ...response(), limitations: [""] }, request), /decision_limitations_invalid/);
});

test("alternative and contextual reject bind to the same Product request", () => {
  const alternative = { ...request, requestId: "request-23456789", idempotencyKey: "idem-23456789", alternativeRequested: true, previouslyPresentedCandidateIds: [candidate.spotId] };
  assert.equal(validateDecisionProductResponse(response(alternative), alternative).alternative.requested, true);
  const rejected = { ...request, requestId: "request-34567890", idempotencyKey: "idem-34567890", rejectedCandidateIds: [candidate.spotId] };
  assert.deepEqual(validateDecisionProductResponse(response(rejected), rejected).reject.candidateIds, [candidate.spotId]);
  assert.throws(() => validateDecisionProductResponse({ ...response(rejected), reject: { candidateIds: [], contextualOnly: true, worldFactProduced: false } }, rejected), /decision_reject_binding_invalid/);
});

test("client authority, fallback and duplicate candidates remain fail-closed", () => {
  assert.throws(() => validateDecisionProductRequest({ ...request, serverAuthority: true }), /decision_request_shape_invalid/);
  assert.throws(() => validateDecisionProductResponse({ ...response(), fallbackUsed: true }, request), /decision_product_authority_invalid/);
  assert.throws(() => validateDecisionProductResponse({ ...response(), candidates: [candidate, candidate] }, request), /decision_candidate_identity_invalid/);
});

test("impression and open interactions use the same sealed transport and reject forged acknowledgements", async () => {
  const interaction = { contractVersion: "backyrd.decision-vnext.product-interaction-request@1.0", actionId: "action-visible", idempotencyKey: "interaction-visible", decisionId: "decision-12345678", eventType: "candidate_impression", candidateId: "spot-12345678" };
  const acknowledged = { contractVersion: "backyrd.decision-vnext.product-interaction-response@1.0", status: "ACKNOWLEDGED", decisionId: interaction.decisionId, candidateId: interaction.candidateId, eventType: interaction.eventType, legacyWriteUsed: false, fallbackUsed: false };
  assert.equal((await executeDecisionProductInteraction({ binding, request: interaction, invoke: async () => acknowledged })).status, "ACKNOWLEDGED");
  await assert.rejects(() => executeDecisionProductInteraction({ binding, request: interaction, invoke: async () => ({ ...acknowledged, candidateId: "spot-forged" }) }), /decision_interaction_response_binding_invalid/);
  await assert.rejects(() => executeDecisionProductInteraction({ binding, request: { ...interaction, serverAuthority: true }, invoke: async () => acknowledged }), /decision_interaction_request_shape_invalid/);
});
