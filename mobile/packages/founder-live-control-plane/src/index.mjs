const REQUEST_VERSION = "backyrd.decision-vnext.product-request@1.0";
const RESPONSE_VERSION = "backyrd.decision-vnext.product-response@1.0";
const INTERACTION_REQUEST_VERSION = "backyrd.decision-vnext.product-interaction-request@1.0";
const INTERACTION_RESPONSE_VERSION = "backyrd.decision-vnext.product-interaction-response@1.0";
const PRESENTATION_VERSION = "backyrd.decision-vnext.product-presentation@1.0";
const RANKING_VERSION = "backyrd.decision-vnext.product-ranking-policy@1.0";
const LEARNING_PORT_VERSION = "backyrd.user-intelligence.product-decision-learning-port@1.0";
const HASH = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

const requireValue = (condition, reason) => {
  if (!condition) throw new DecisionProductUnavailableError(reason);
};

const exactKeys = (value, keys, reason) => {
  requireValue(value && typeof value === "object" && !Array.isArray(value), reason);
  requireValue(Object.keys(value).sort().join(",") === [...keys].sort().join(","), reason);
};

const stringArray = (value, maximum, reason) => {
  requireValue(Array.isArray(value) && value.length <= maximum && value.every((item) => typeof item === "string" && ID.test(item)), reason);
};

export class DecisionProductUnavailableError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = "DecisionProductUnavailableError";
    this.code = code;
    this.userMessage = "Backyrd kann gerade keine verlässlichen Vorschläge laden. Bitte versuche es später erneut.";
  }
}

export const DECISION_PRODUCT_CONTRACT = Object.freeze({
  request: REQUEST_VERSION,
  response: RESPONSE_VERSION,
  learningPort: LEARNING_PORT_VERSION,
  transportFunction: "decision-v13",
});

export function validateDecisionProductRequest(value) {
  exactKeys(value, ["contractVersion", "requestId", "idempotencyKey", "naturalLanguage", "explicit", "alternativeRequested", "previouslyPresentedCandidateIds", "rejectedCandidateIds"], "decision_request_shape_invalid");
  requireValue(value.contractVersion === REQUEST_VERSION, "decision_request_version_unknown");
  requireValue(ID.test(value.requestId) && ID.test(value.idempotencyKey), "decision_request_identity_invalid");
  requireValue(typeof value.naturalLanguage === "string" && value.naturalLanguage.trim().length > 0 && value.naturalLanguage.length <= 2_000, "decision_natural_language_invalid");
  requireValue(value.explicit && typeof value.explicit === "object" && !Array.isArray(value.explicit), "decision_explicit_invalid");
  const allowedExplicit = new Set(["primaryIntent", "secondaryIntent", "occasion", "moods", "targetCity", "hardConstraints", "softPreferences"]);
  requireValue(Object.keys(value.explicit).every((key) => allowedExplicit.has(key)), "decision_explicit_authority_invalid");
  for (const key of ["primaryIntent", "secondaryIntent", "occasion", "targetCity"]) if (key in value.explicit) requireValue(value.explicit[key] === null || ID.test(value.explicit[key]), `decision_explicit_${key}_invalid`);
  for (const key of ["moods", "hardConstraints", "softPreferences"]) if (key in value.explicit) stringArray(value.explicit[key], key === "moods" ? 12 : 30, `decision_explicit_${key}_invalid`);
  requireValue(typeof value.alternativeRequested === "boolean", "decision_alternative_invalid");
  stringArray(value.previouslyPresentedCandidateIds, 50, "decision_previous_candidates_invalid");
  stringArray(value.rejectedCandidateIds, 50, "decision_rejected_candidates_invalid");
  return value;
}

function validatePresentation(value, spotId) {
  exactKeys(value, ["contractVersion", "spotId", "name", "locality", "categoryLabel", "imageUrl", "sourceHash", "presentationHash"], "decision_presentation_shape_invalid");
  requireValue(value.contractVersion === PRESENTATION_VERSION && value.spotId === spotId, "decision_presentation_binding_invalid");
  requireValue(typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 160, "decision_presentation_name_invalid");
  requireValue(value.locality === null || ID.test(value.locality), "decision_presentation_locality_invalid");
  requireValue(value.categoryLabel === null || typeof value.categoryLabel === "string", "decision_presentation_category_invalid");
  requireValue(value.imageUrl === null || (typeof value.imageUrl === "string" && value.imageUrl.startsWith("https://")), "decision_presentation_image_invalid");
  requireValue(HASH.test(value.sourceHash) && HASH.test(value.presentationHash), "decision_presentation_hash_invalid");
}

function validateCandidate(candidate, seen) {
  exactKeys(candidate, ["spotId", "presentation", "tier", "rank", "coreIntentCoverage", "actualAvailability", "confirmedHardConstraints", "unknownHardConstraints", "failedHardConstraints", "rankVector", "reasons", "limitations", "contextualReject", "candidateHash"], "decision_candidate_shape_invalid");
  requireValue(ID.test(candidate.spotId) && !seen.has(candidate.spotId), "decision_candidate_identity_invalid");
  seen.add(candidate.spotId);
  validatePresentation(candidate.presentation, candidate.spotId);
  requireValue(["ELIGIBLE_CONFIRMED", "UNCONFIRMED_FALLBACK", "NOT_CONFIGURED", "INELIGIBLE"].includes(candidate.tier), "decision_candidate_tier_invalid");
  requireValue(candidate.rank === null || (Number.isInteger(candidate.rank) && candidate.rank >= 1 && candidate.rank <= 1_000), "decision_candidate_rank_invalid");
  requireValue(["CONFIRMED", "UNKNOWN", "NOT_CONFIGURED", "INCOMPATIBLE", "DISPUTED", "NOT_APPLICABLE"].includes(candidate.coreIntentCoverage), "decision_candidate_coverage_invalid");
  requireValue(["open", "closed", "unknown", "not_authorized", "expired", "disputed", "not_requested"].includes(candidate.actualAvailability), "decision_candidate_availability_invalid");
  stringArray(candidate.confirmedHardConstraints, 30, "decision_candidate_constraints_invalid");
  stringArray(candidate.unknownHardConstraints, 30, "decision_candidate_constraints_invalid");
  stringArray(candidate.failedHardConstraints, 30, "decision_candidate_constraints_invalid");
  requireValue(candidate.rankVector && typeof candidate.rankVector === "object" && HASH.test(candidate.rankVector.vectorHash), "decision_candidate_rank_vector_invalid");
  requireValue(Array.isArray(candidate.reasons) && candidate.reasons.length >= 1 && candidate.reasons.length <= 80, "decision_candidate_reasons_invalid");
  for (const reason of candidate.reasons) {
    exactKeys(reason, ["code", "domain", "sourceHash", "statement", "confirmed"], "decision_reason_shape_invalid");
    requireValue(ID.test(reason.code) && ["WORLD", "USER", "CONTEXT", "ELIGIBILITY", "RANKING", "LIMITATION"].includes(reason.domain) && HASH.test(reason.sourceHash) && typeof reason.statement === "string" && reason.statement.length > 0 && typeof reason.confirmed === "boolean", "decision_reason_invalid");
  }
  stringArray(candidate.limitations, 40, "decision_candidate_limitations_invalid");
  requireValue(typeof candidate.contextualReject === "boolean" && HASH.test(candidate.candidateHash), "decision_candidate_integrity_invalid");
}

export function validateDecisionProductResponse(value, request) {
  exactKeys(value, ["contractVersion", "status", "decisionId", "requestHash", "envelopeHash", "rankingPolicyVersion", "rankingPolicyHash", "interpretation", "primaryCandidateId", "candidates", "limitations", "alternative", "reject", "personalization", "learning", "productOutputAuthorized", "legacyEngineUsed", "fallbackUsed", "resultHash"], "decision_response_shape_invalid");
  requireValue(value.contractVersion === RESPONSE_VERSION && value.status === "AVAILABLE", "decision_response_version_or_status_invalid");
  requireValue(ID.test(value.decisionId) && HASH.test(value.requestHash) && HASH.test(value.envelopeHash) && HASH.test(value.resultHash), "decision_response_identity_invalid");
  requireValue(value.rankingPolicyVersion === RANKING_VERSION && HASH.test(value.rankingPolicyHash), "decision_ranking_authority_invalid");
  requireValue(value.interpretation && typeof value.interpretation === "object" && HASH.test(value.interpretation.interpretationHash), "decision_interpretation_invalid");
  requireValue(Array.isArray(value.candidates) && value.candidates.length <= 40, "decision_candidates_invalid");
  const seen = new Set(); value.candidates.forEach((candidate) => validateCandidate(candidate, seen));
  requireValue(value.primaryCandidateId === null || (ID.test(value.primaryCandidateId) && seen.has(value.primaryCandidateId)), "decision_primary_candidate_invalid");
  stringArray(value.limitations, 60, "decision_limitations_invalid");
  exactKeys(value.alternative, ["requested", "selectedCandidateId", "negativeSignalProduced"], "decision_alternative_shape_invalid");
  requireValue(value.alternative.requested === request.alternativeRequested && value.alternative.negativeSignalProduced === false, "decision_alternative_binding_invalid");
  requireValue(value.alternative.selectedCandidateId === null || seen.has(value.alternative.selectedCandidateId), "decision_alternative_candidate_invalid");
  exactKeys(value.reject, ["candidateIds", "contextualOnly", "worldFactProduced"], "decision_reject_shape_invalid");
  requireValue(value.reject.contextualOnly === true && value.reject.worldFactProduced === false, "decision_reject_authority_invalid");
  requireValue(JSON.stringify(value.reject.candidateIds) === JSON.stringify(request.rejectedCandidateIds), "decision_reject_binding_invalid");
  exactKeys(value.personalization, ["state", "neutralReason", "projectionHash"], "decision_personalization_shape_invalid");
  requireValue(["ACTIVE", "NEUTRAL"].includes(value.personalization.state) && HASH.test(value.personalization.projectionHash), "decision_personalization_invalid");
  exactKeys(value.learning, ["mode", "acknowledgement", "eventCount", "rawTextIncluded"], "decision_learning_shape_invalid");
  requireValue(["CONSENT_BOUND_EVENTS", "DISABLED_NEUTRAL"].includes(value.learning.mode) && ["CONSENT_BOUND_IDEMPOTENT", "NOT_APPLICABLE_NEUTRAL"].includes(value.learning.acknowledgement) && Number.isInteger(value.learning.eventCount) && value.learning.eventCount >= 0 && value.learning.eventCount <= 52 && value.learning.rawTextIncluded === false, "decision_learning_invalid");
  requireValue(value.productOutputAuthorized === true && value.legacyEngineUsed === false && value.fallbackUsed === false, "decision_product_authority_invalid");
  return value;
}

export async function executeDecisionProductSingleRoute({ binding, request, invoke }) {
  validateDecisionProductRequest(request);
  requireValue(binding && HASH.test(binding.releaseHash) && HASH.test(binding.bindingHash), "release_binding_invalid");
  requireValue(binding.transportFunction === DECISION_PRODUCT_CONTRACT.transportFunction, "decision_transport_slug_invalid");
  requireValue(binding.requestContract === REQUEST_VERSION && binding.responseContract === RESPONSE_VERSION, "decision_transport_contract_drift");
  let raw;
  try { raw = await invoke(request); }
  catch (error) { throw new DecisionProductUnavailableError("decision_single_route_unavailable", error); }
  return Object.freeze(validateDecisionProductResponse(raw, request));
}

export function validateDecisionProductInteractionRequest(value) {
  exactKeys(value, ["contractVersion", "actionId", "idempotencyKey", "decisionId", "eventType", "candidateId"], "decision_interaction_request_shape_invalid");
  requireValue(value.contractVersion === INTERACTION_REQUEST_VERSION, "decision_interaction_request_version_invalid");
  requireValue(ID.test(value.actionId) && ID.test(value.idempotencyKey) && ID.test(value.decisionId) && ID.test(value.candidateId), "decision_interaction_identity_invalid");
  requireValue(["candidate_impression", "candidate_opened"].includes(value.eventType), "decision_interaction_event_invalid");
  return value;
}

export function validateDecisionProductInteractionResponse(value, request) {
  exactKeys(value, ["contractVersion", "status", "decisionId", "candidateId", "eventType", "legacyWriteUsed", "fallbackUsed"], "decision_interaction_response_shape_invalid");
  requireValue(value.contractVersion === INTERACTION_RESPONSE_VERSION && value.status === "ACKNOWLEDGED", "decision_interaction_response_version_invalid");
  requireValue(value.decisionId === request.decisionId && value.candidateId === request.candidateId && value.eventType === request.eventType, "decision_interaction_response_binding_invalid");
  requireValue(value.legacyWriteUsed === false && value.fallbackUsed === false, "decision_interaction_response_authority_invalid");
  return value;
}

export async function executeDecisionProductInteraction({ binding, request, invoke }) {
  validateDecisionProductInteractionRequest(request);
  requireValue(binding && HASH.test(binding.releaseHash) && HASH.test(binding.bindingHash), "release_binding_invalid");
  requireValue(binding.transportFunction === DECISION_PRODUCT_CONTRACT.transportFunction, "decision_transport_slug_invalid");
  let raw;
  try { raw = await invoke(request); }
  catch (error) { throw new DecisionProductUnavailableError("decision_interaction_unavailable", error); }
  return Object.freeze(validateDecisionProductInteractionResponse(raw, request));
}
