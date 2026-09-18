export const FOUNDER_LIVE_EDGE_BOUNDARY_VERSION = "backyrd.decision-vnext.founder-live-edge-boundary@1.0";

const BASE_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
});

const response = (status, code, message, origin = null) => new Response(JSON.stringify({
  contractVersion: "backyrd.decision-vnext.founder-live-edge-error@1.0",
  error: { code, message },
}), {
  status,
  headers: {
    ...BASE_HEADERS,
    ...(origin ? {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, content-type, x-backyrd-expert-view",
      "access-control-allow-methods": "POST, OPTIONS",
      vary: "origin",
    } : {}),
  },
});

const allowedOrigins = (environment) => new Set((environment.BACKYRD_FOUNDER_LIVE_CORS_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => {
    try {
      const url = new URL(value);
      return url.origin === value && (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname)));
    } catch { return false; }
  }));

/**
 * Deployable host boundary for the Founder Live function while Runtime
 * Authority is deliberately absent. It cannot be enabled by an environment
 * flag: every non-preflight request stops before body parsing, Auth, World,
 * User, rate-limit, idempotency, evaluation, persistence or output ports.
 *
 * A later, separately authorised release must replace this inactive host with
 * an externally anchored runtime bootstrap. That activation is intentionally
 * impossible through this module.
 */
export function createInactiveFounderLiveEdgeAdapter(environment = {}) {
  const origins = allowedOrigins(environment);
  return async function handle(request) {
    const origin = request.headers.get("origin");
    const acceptedOrigin = origin && origins.has(origin) ? origin : null;
    if (request.method === "OPTIONS") {
      if (!acceptedOrigin) return response(403, "CORS_ORIGIN_DENIED", "Dieser Ursprung ist nicht freigegeben.");
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": acceptedOrigin,
        "access-control-allow-headers": "authorization, content-type, x-backyrd-expert-view",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-max-age": "600",
        vary: "origin",
      } });
    }
    if (request.method !== "POST") return response(405, "METHOD_NOT_ALLOWED", "Dieser API-Pfad unterstützt nur POST.", acceptedOrigin);
    return response(503, "RUNTIME_AUTHORITY_NOT_AUTHORIZED", "Die Founder-Live-Ausführung ist noch nicht autorisiert.", acceptedOrigin);
  };
}
