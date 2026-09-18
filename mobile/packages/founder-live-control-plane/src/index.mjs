const REQUEST_VERSION = "backyrd.decision-api.request@1.0";
const RESPONSE_VERSION = "backyrd.decision-api.response@1.0";
const AUTHORITY_VERSION = "backyrd.decision-api.route-authority@1.0";
const STUB_VERSION = "backyrd.decision-api.contract-stub@0.1";
const GATEWAY_VERSION = "backyrd.decision-api.gateway-response@1.0";
const FOUNDER_LIVE_VERSION = "backyrd.decision-vnext.founder-live-response@1.1";
const HASH = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

const requireValue = (condition, reason) => {
  if (!condition) throw new FounderDecisionUnavailableError(reason);
};

const exactKeys = (value, keys, reason) => {
  requireValue(value && typeof value === "object" && !Array.isArray(value), reason);
  requireValue(Object.keys(value).sort().join(",") === [...keys].sort().join(","), reason);
};

export class FounderDecisionUnavailableError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = "FounderDecisionUnavailableError";
    this.code = code;
    this.userMessage = "Backyrd kann gerade keine verlässlichen Vorschläge laden. Bitte versuche es später erneut.";
  }
}

export const FOUNDER_DECISION_CONTRACT = Object.freeze({
  request: REQUEST_VERSION,
  response: RESPONSE_VERSION,
  routeAuthority: AUTHORITY_VERSION,
  localStub: STUB_VERSION,
  gatewayResponse: GATEWAY_VERSION,
});

/**
 * Strict mobile boundary for the Founder-Live endpoint. The endpoint, not the
 * client, chooses the engine. A Founder-Live evaluation can never masquerade
 * as a v13/North-Star response and failures never fall back after selection.
 */
export function validateFounderDecisionGatewayResponse(value) {
  exactKeys(value, ["contractVersion", "route", "requestId", "writebackPerformed", "response"], "gateway_response_shape_invalid");
  requireValue(value.contractVersion === GATEWAY_VERSION, "gateway_response_version_unknown");
  requireValue(ID.test(value.requestId), "gateway_response_request_identity_invalid");
  requireValue(value.writebackPerformed === false, "gateway_response_writeback_forbidden");
  requireValue(["FOUNDER_LIVE_READ_ONLY", "EXISTING_ENGINE"].includes(value.route), "gateway_response_route_invalid");
  if (value.route === "EXISTING_ENGINE") {
    requireValue(value.response === null, "gateway_existing_engine_payload_forbidden");
    return value;
  }
  const response = value.response;
  requireValue(response && typeof response === "object" && !Array.isArray(response), "gateway_founder_live_payload_missing");
  requireValue(response.contractVersion === FOUNDER_LIVE_VERSION && response.status === "EVALUATION_ONLY", "gateway_founder_live_contract_invalid");
  requireValue(response.rankingState === "NOT_CONFIGURED", "gateway_founder_live_ranking_claim_forbidden");
  requireValue(response.reject?.contextualOnly === true && response.reject?.userLearningProduced === false, "gateway_founder_live_learning_forbidden");
  requireValue(Array.isArray(response.candidates) && response.candidates.every((candidate) => candidate && typeof candidate.name === "string" && !Object.hasOwn(candidate, "spotId") && !Object.hasOwn(candidate, "spot_id")), "gateway_founder_live_product_identity_forbidden");
  return value;
}

export async function routeFounderDecisionGateway({ binding, request, invokeGateway, invokeExisting, hash }) {
  const startedAt = Date.now();
  validateFounderDecisionRequest(request);
  requireValue(binding && HASH.test(binding.releaseHash) && HASH.test(binding.bindingHash), "release_binding_invalid");
  requireValue(binding.executionAuthorized === false, "production_execution_authority_forbidden");
  if (!(binding.status === "READY_FOR_FOUNDER_ALLOWLIST" && binding.allCandidatesBound === true && binding.vNextFunction)) {
    const response = await invokeExisting(request);
    requireValue(response && typeof response === "object", "existing_engine_response_invalid");
    return Object.freeze({ route: "EXISTING_ENGINE", response, mixedResults: false, writebackPerformed: false, observability: await observe({ hash, request, binding, response, route: "EXISTING_ENGINE", status: "EXISTING", startedAt }) });
  }
  let gateway;
  try { gateway = validateFounderDecisionGatewayResponse(await invokeGateway(request)); }
  catch (error) { throw new FounderDecisionUnavailableError("founder_live_gateway_unavailable", error); }
  requireValue(gateway.requestId === request.requestId, "gateway_response_request_mismatch");
  if (gateway.route === "EXISTING_ENGINE") {
    const response = await invokeExisting(request);
    requireValue(response && typeof response === "object", "existing_engine_response_invalid");
    return Object.freeze({ route: "EXISTING_ENGINE", response, mixedResults: false, writebackPerformed: false, observability: await observe({ hash, request, binding, response, route: "EXISTING_ENGINE", status: "SERVER_SELECTED_EXISTING", startedAt }) });
  }
  return Object.freeze({ route: "FOUNDER_LIVE_READ_ONLY", response: gateway.response, mixedResults: false, writebackPerformed: false, observability: await observe({ hash, request, binding, response: gateway.response, route: "FOUNDER_LIVE_READ_ONLY", status: "EVALUATION_ONLY", startedAt }) });
}

export function validateFounderDecisionRequest(value) {
  exactKeys(value, ["contractVersion", "requestId", "idempotencyKey", "context", "continuation"], "decision_request_shape_invalid");
  requireValue(value.contractVersion === REQUEST_VERSION, "decision_request_version_unknown");
  requireValue(ID.test(value.requestId) && ID.test(value.idempotencyKey), "decision_request_identity_invalid");
  exactKeys(value.context, ["city", "query", "moods", "audience", "placeTypes"], "decision_context_shape_invalid");
  requireValue(typeof value.context.city === "string" && value.context.city.trim().length > 1, "decision_city_invalid");
  requireValue(typeof value.context.query === "string" && value.context.query.trim().length >= 3, "decision_query_invalid");
  for (const key of ["moods", "audience", "placeTypes"]) requireValue(Array.isArray(value.context[key]) && value.context[key].every((item) => typeof item === "string"), `decision_context_${key}_invalid`);
  requireValue(value.continuation === null || (typeof value.continuation === "object" && ID.test(value.continuation.decisionId) && ID.test(value.continuation.requestId)), "decision_continuation_invalid");
  return value;
}

export function validateRouteAuthority(value, { requestId, releaseHash, bindingHash, now }) {
  exactKeys(value, ["contractVersion", "requestId", "releaseHash", "bindingHash", "route", "allowlisted", "globalKillSwitch", "decisionKillSwitch", "validUntil"], "route_authority_shape_invalid");
  requireValue(value.contractVersion === AUTHORITY_VERSION, "route_authority_version_unknown");
  requireValue(value.requestId === requestId && value.releaseHash === releaseHash && value.bindingHash === bindingHash, "route_authority_binding_mismatch");
  requireValue(["VNEXT", "EXISTING_ENGINE"].includes(value.route), "route_authority_route_invalid");
  requireValue(typeof value.allowlisted === "boolean" && typeof value.globalKillSwitch === "boolean" && typeof value.decisionKillSwitch === "boolean", "route_authority_controls_invalid");
  requireValue(Number.isFinite(Date.parse(value.validUntil)) && Date.parse(now) <= Date.parse(value.validUntil), "route_authority_expired");
  return value;
}

function validateVNextResponse(value, request, binding) {
  requireValue(value && typeof value === "object" && !Array.isArray(value), "decision_response_invalid");
  requireValue(value.contractVersion === RESPONSE_VERSION, "decision_response_version_unknown");
  requireValue(value.requestId === request.requestId && value.idempotencyKey === request.idempotencyKey, "decision_response_identity_mismatch");
  requireValue(value.releaseHash === binding.releaseHash && value.bindingHash === binding.bindingHash, "decision_response_release_drift");
  requireValue(HASH.test(value.resultHash), "decision_response_hash_invalid");
  requireValue(value.writebackPerformed === false, "decision_response_writeback_forbidden");
  requireValue(Array.isArray(value.candidates), "decision_response_candidates_invalid");
  return value;
}

const observe = async ({ hash, request, binding, response, route, status, startedAt }) => Object.freeze({
  requestHash: await hash(request),
  releaseHash: binding.releaseHash,
  resultHash: response ? await hash(response) : null,
  route,
  status,
  latencyMs: Math.max(0, Math.round(Date.now() - startedAt)),
  rawTextRecorded: false,
  personalDataRecorded: false,
});

export async function routeFounderDecision({ binding, request, serverAuthority = null, invokeVNext, invokeExisting, hash, now = new Date().toISOString() }) {
  const startedAt = Date.now();
  validateFounderDecisionRequest(request);
  requireValue(binding && HASH.test(binding.releaseHash) && HASH.test(binding.bindingHash), "release_binding_invalid");
  requireValue(binding.executionAuthorized === false, "production_execution_authority_forbidden");

  let route = "EXISTING_ENGINE";
  let fallbackReason = "CANDIDATES_PENDING";
  if (binding.status === "READY_FOR_FOUNDER_ALLOWLIST" && binding.allCandidatesBound === true && binding.vNextFunction) {
    try {
      const authority = validateRouteAuthority(serverAuthority, { requestId: request.requestId, releaseHash: binding.releaseHash, bindingHash: binding.bindingHash, now });
      const vNextAllowed = authority.route === "VNEXT" && authority.allowlisted && !authority.globalKillSwitch && !authority.decisionKillSwitch;
      route = vNextAllowed ? "VNEXT" : "EXISTING_ENGINE";
      fallbackReason = vNextAllowed ? null : authority.route === "EXISTING_ENGINE" ? "SERVER_SELECTED_EXISTING" : "AUTHORITY_OR_KILL_SWITCH_DENIED";
    } catch {
      route = "EXISTING_ENGINE";
      fallbackReason = "AUTHORITY_INVALID";
    }
  }

  if (route === "VNEXT") {
    try {
      const response = validateVNextResponse(await invokeVNext(request), request, binding);
      return Object.freeze({
        response,
        route,
        fallbackReason: null,
        mixedResults: false,
        writebackPerformed: false,
        observability: await observe({ hash, request, binding, response, route, status: "OK", startedAt }),
      });
    } catch {
      route = "EXISTING_ENGINE";
      fallbackReason = "VNEXT_FAILED_CLOSED";
    }
  }

  try {
    const response = await invokeExisting(request);
    requireValue(response && typeof response === "object", "existing_engine_response_invalid");
    return Object.freeze({
      response,
      route,
      fallbackReason,
      mixedResults: false,
      writebackPerformed: false,
      observability: await observe({ hash, request, binding, response, route, status: "FALLBACK", startedAt }),
    });
  } catch (error) {
    throw new FounderDecisionUnavailableError("both_decision_routes_unavailable", error);
  }
}

export function createContractGeneratedLocalStub({ worldVersion, spots }) {
  requireValue(typeof worldVersion === "string" && worldVersion.length >= 8, "stub_world_version_invalid");
  requireValue(Array.isArray(spots) && spots.length > 0, "stub_spots_missing");
  return async function localStub(request, { executionEnvironment, hash }) {
    validateFounderDecisionRequest(request);
    requireValue(executionEnvironment === "LOCAL_TEST", "stub_non_local_execution_forbidden");
    const candidates = spots.map((spot, index) => ({
      rank: index + 1,
      spotId: spot.id,
      name: spot.name,
      explanation: `Aktualisiert aus World-Version ${worldVersion}.`,
    }));
    return Object.freeze({
      contractVersion: STUB_VERSION,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      worldVersion,
      candidates,
      resultHash: await hash({ worldVersion, candidates }),
      writebackPerformed: false,
      productionCapable: false,
    });
  };
}
