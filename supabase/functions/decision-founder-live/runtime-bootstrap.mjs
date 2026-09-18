import { founderLiveAllowedOrigins, founderLiveEdgeErrorResponse } from "./runtime-boundary.mjs";

export const FOUNDER_LIVE_RUNTIME_BOOTSTRAP_VERSION = "backyrd.decision-vnext.founder-live-runtime-bootstrap@1.0";

/**
 * Canonical source bootstrap. The accepted Production trust root is
 * deliberately not provisioned by this release. No environment value, header,
 * request body, API key or repository hash can change that state.
 */
export function createFounderLiveRuntimeBootstrapAdapter(environment = {}) {
  const acceptedOrigins = founderLiveAllowedOrigins(environment);
  return async function handle(request) {
    const origin = request.headers.get("origin");
    const acceptedOrigin = origin && acceptedOrigins.has(origin) ? origin : null;
    if (request.method === "OPTIONS") {
      if (!acceptedOrigin) return founderLiveEdgeErrorResponse(403, "CORS_ORIGIN_DENIED", "Dieser Ursprung ist nicht freigegeben.");
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": acceptedOrigin,
        "access-control-allow-headers": "authorization, content-type, x-backyrd-expert-view",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-max-age": "600",
        vary: "origin",
      } });
    }
    if (request.method !== "POST") return founderLiveEdgeErrorResponse(405, "METHOD_NOT_ALLOWED", "Dieser API-Pfad unterstützt nur POST.", acceptedOrigin);
    return founderLiveEdgeErrorResponse(503, "RUNTIME_TRUST_ROOT_NOT_PROVISIONED", "Die Founder-Live-Ausführung ist weiterhin sicher deaktiviert.", acceptedOrigin);
  };
}
