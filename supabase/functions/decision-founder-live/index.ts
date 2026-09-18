// Founder-Live read-only gateway. Deployment and runtime activation are not
// authorized by this source addition; the server control defaults to OFF.
// The canonical production User Projection, durable idempotency and durable
// rate-limit ports do not exist on main yet. This entrypoint is intentionally
// non-activatable until those independently reviewed ports are injected.
Deno.serve(() => Promise.resolve(new Response(JSON.stringify({ contractVersion: "backyrd.decision-vnext.founder-live-error@1.0", error: { code: "CANONICAL_PRODUCTION_PORTS_NOT_CONFIGURED", message: "Die Decision-Auswertung ist derzeit sicher deaktiviert." } }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } })));
