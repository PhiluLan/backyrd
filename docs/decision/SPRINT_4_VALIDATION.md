# Sprint 4 Validation

## Result

PASS on a fresh local Supabase reset. Production remained disabled and visible decision-v13 behavior was unchanged. External decision AI calls: 0.

## Executed proof

- Unit strategy/validator suite: 7/7 passed.
- Sprint-4 SQL/RLS/trace suite: passed.
- Real Product-runtime E2E: passed across cold, known Friends, Date, explicit conflict, broad unknown, Copenhagen, partial/unknown N4, and open-now.
- Cold Decision 1 returned three deterministic spots in `LOW_OR_UNKNOWN`, with no personal reason.
- Open + save produced a zero-node signed User Card: no Satisfaction was invented.
- Positive Smart Review produced evidence-bound positive hypotheses; contrasting Review produced negative hypotheses.
- Decision 2 read the newly persisted Card hash. The projection stayed empty because evidence was not yet durable enough; that is the frozen engine's honest behavior.
- A bounded known-card control produced distinct `PARTIAL` Friends (`vibe.lively`) and Date (`vibe.romantic`) projections.
- Explicit quiet intent suppressed conflicting historical lively knowledge and ranked the quiet candidate first.
- Partial and unknown N4 remained valid; missing concepts were not imputed.
- Explicit open-now with all opening states unknown returned an empty valid result.
- Copenhagen carried no Basel spot identity or local trail.
- Replay returned identical response and trace identities.
- Authenticated clients could neither read private decision traces nor persist/forge them; cross-user orchestration failed.

## Measured local latency

Warm deterministic requests were approximately 16–24 ms total in the synthetic local run; the first cold request was approximately 41 ms. Components recorded include Product-package build, N4/card reads, ranking/reason validation, and trace persistence. These are measurements, not Production SLOs.

## Boundaries

The orchestrator and settings are shadow/internal only and disabled by default. No UI, visible routing, ranking, N3/N4/N5 semantics, N6 integration, model call, deployment, or Production mutation occurred.
