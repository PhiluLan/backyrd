# Decision vNext Phase 3A — Existing Context Audit

Canonical base after final rebase: `5ddd15eaf75ceb8448dbf59667c14ffb2ffdac0e`. The implementation began from `219b5cd268c55cf06252cc0a71db387e476428c9`; User Intelligence Phase 3A merged during validation and was adopted without copying its contracts. This audit used repository evidence only. Production was not queried.

The rebase changed one canonical integration assumption: privacy-neutral User projections now use the User-Intelligence-owned neutral subject binding instead of retaining the actor binding. Decision tests were aligned to that privacy boundary; authenticated actor authority remains bound separately in the execution envelope.

## Plain-language finding

The current product sends a useful but narrow set of situation hints—city, free text, moods, audience and category hints—into `decision-v13`. Those values are interpreted inside the same runtime that retrieves and scores spots. They are not a versioned, privacy-minimized statement of “what matters now,” and they do not carry a separate server authority, per-dimension provenance, or rule-wise unknown handling.

Phase 1/2 fixed the most important authority and replay boundaries for the synthetic vNext harness. Its `SituationalContextSnapshot` remains a valid compatibility contract, but it intentionally has only two missing states and a small placeholder shape. Phase 3A therefore extends the architecture additively instead of rewriting that proven path.

## Repository evidence

| Existing path | Observed behavior | Classification | vNext treatment |
|---|---|---|---|
| `mobile/app/(tabs)/decision.tsx` | Calls `decision-v13`; sends city, mood, audience, direction and query-derived hints. | ADAPT | Evidence for a future client adapter only. No wiring in 3A. |
| `web/lib/decision-web-api.ts` | Builds mood/audience/category payload and invokes `decision-v13`. | ADAPT | Keep Product unchanged; later map through an approved request adapter. |
| `mobile/lib/locationContext.ts` | Resolves device coordinates or city centers client-side. | ADAPT | Coordinates must be server-authorized and are reduced to a scope/hash in the snapshot. |
| `create_decision_session_v1` | Accepts city and two mood strings and creates legacy session state. | REPLACE | Insufficient as vNext context authority; untouched in Production. |
| `get_decision_context_v1` | Produces presentation-oriented decision mode, title/body, weekday, time bucket and confidence/fallback. | DEPRECATE | Historical/compatibility evidence, never imported as the Context kernel. |
| `supabase/functions/decision-v13/index.ts` | Context parsing, candidate retrieval, intent heuristics and scoring are closely coupled. | REPLACE | Remains frozen comparator/Production behavior. |
| `supabase/functions/decision-v13/live-index.ts` | Canonicalizes legacy input and open-now hints. | ADAPT | Potential future boundary adapter, not a vNext authority. |
| Phase-2 `context.ts` | Strict client/server location binding, explicit placeholders and deterministic hash. | KEEP | Retained unchanged for Phase-2 replay. |
| Phase-2 `DecisionRequest` | Versioned explicit city/coordinate, intents, moods, social context, occasion, placeholders, hard/soft declarations and shown/rejected IDs. | EXTEND | Remains the client request source; Phase 3A wraps it with typed dimension and constraint declarations rather than copying it. |
| Phase-2 execution/evaluation authority | Binds World, User, Candidate Pool, source and four engines. | KEEP | Phase-3A authority follows the same external-trust-anchor principle. |
| `decision-v13` context-key lookup | Reads `get_decision_context_v1` using a mixed request/context payload before scoring. | REPLACE | The vNext kernel resolves provenance before any candidate/ranking consumer. Production code is untouched. |
| `decision-orchestrator-runtime` Current Moment/ranking input | Carries current request facts and contains conservative budget handling inside the legacy orchestrator. | ADAPT | Useful behavioral evidence only; not a canonical Phase-3A contract or policy source. |
| Decision Lab N3 Current Moment | Deterministic synthetic moment fixtures with authority/confidence checks. | KEEP | Preserved as historical regression/evaluation evidence; it is not imported into the vNext domain contract. |
| Admin reference-location configuration | Operates the active v13 reference locations and default near-radius. | PROHIBITED | Cannot select vNext Context authority or policy in this slice; no Admin change was made. |
| Legacy Decision analytics/context keys | Session/impression/ML records may carry query, mood, audience and model context. | PROHIBITED | Not read by the kernel and never treated as server authority or automatic User learning. |
| Review submission `decisionContext` | Can accompany a review payload. | PROHIBITED | Must not become automatic long-term taste or Context writeback. |

The complete machine-readable classification is `PHASE3A_CONTEXT_COMPATIBILITY_MATRIX.json`.

## Legacy gaps

- Client and server facts are not modeled per dimension.
- `UNKNOWN`, `NOT_CONFIGURED`, `NOT_AVAILABLE` and `DENIED` are not preserved separately.
- Hard and soft semantics are not a typed, policy-bound contract.
- Session history is client-shaped rather than bound to server-authorized state.
- Device coordinates can exist in client memory; the legacy contract does not define snapshot minimization.
- Time buckets are derived without a reusable proof contract.
- Weather has no accepted server provider contract.
- Context hints can be colocated with ranking heuristics, which prevents independent evaluation.
- Legacy user-learning paths are separate operational evidence and must not receive Context automatically.

## Explicit non-actions

No RPC, migration, table, Edge Function, Mobile/Web consumer, `decision-v13` behavior, Production data or Production configuration was changed or invoked.
