# Production Decision Orchestrator

Sprint 4 adds one server-side, feature-flagged deterministic strategy. It consumes the validated Sprint-3 Decision Input Package, never reloads candidates after freeze, orders at most three eligible candidates, validates the Product response, and persists a complete trace before returning success.

The strategy hierarchy is hard eligibility, explicit current intent, current-moment/N4 fit, bounded projected N5 fit, then original v13 retrieval position. The current v13 Product route remains authoritative and unchanged. N6 is absent; deterministic output is the permanent fallback contract.

`backyrd_decision_orchestrator_settings_v1.enabled` defaults to `false`. The executable local/server entry is:

```text
BACKYRD_DECISION_ORCHESTRATOR_ENABLED=true DECISION_ID=<uuid> AUTHENTICATED_USER_ID=<uuid> node scripts/decision/run-deterministic-decision.mjs
```

The service client derives the User Card, projection, N4, eligibility, scores, reasons, and knowledge mode. Clients cannot submit those fields. Trace persistence failure fails the shadow request closed; it never reports a complete deterministic decision without a complete trace.

Opening-hours policy is unchanged: only explicit `openNow=true` excludes `false` and `UNKNOWN`. If no candidate survives, the response contains an honest empty result rather than padding.
