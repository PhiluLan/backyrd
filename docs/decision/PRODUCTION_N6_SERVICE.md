# Production N6 Service

## Authority

The Sprint-4 deterministic decision remains authoritative and user-visible. N6 is an optional server-side shadow strategy. It receives only the validated Sprint-4 package, frozen eligible candidate IDs, bounded N3/N4/N5 data, and candidate-specific authorized reasons.

The production adapter reuses the frozen N6A/N6A.1/N6A.2 contracts:

- model: `gpt-5.6-sol`
- reasoning: `medium`
- timeout: 120 seconds
- input cap: 12,000 estimated tokens
- output cap: 2,400 tokens
- one technical retry, implemented as a persisted queue retry
- prompt contract: `backyrd-n6a2-ai-decision-buddy-instruction-v1`
- provider-response contract: `backyrd-n6a7-canonical-provider-response-v1`

No model, weight, prompt, N3, N4, N5, retrieval, eligibility, or deterministic ranking semantics changed.

## Execution

1. Sprint 4 completes and persists the deterministic decision.
2. A platform background primitive schedules `enqueueSecuredDecision`; the visible response does not await it.
3. The service-only database function verifies the deterministic trace, identity, sampling, rate, and budget.
4. The runner claims one work item, loads its minimized input, and rechecks consent/user existence.
5. The provider receives a structured N6A.2 request and may rank every frozen candidate exactly once.
6. The strict validator accepts or rejects the complete response.
7. An append-only shadow trace records the outcome and deterministic comparison.

Run one server-side item with:

```sh
node packages/n6-shadow-runtime/src/runner.mjs
```

Required server environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `BACKYRD_N6_OPENAI_API_KEY` (the existing Decision-Lab key is accepted only as a staging compatibility fallback). The database kill switch defaults to off.

## Failure behavior

Provider error, timeout, invalid output, budget skip, rate limit, disabled flag, or lifecycle change never changes the deterministic response. Technical retry is queue-level so every external attempt is budgeted and traced. Semantic rejection is never retried.

## Privacy and commercial boundaries

The provider input excludes raw history, arbitrary review text, user identity, owner/payment data, Trust internals, latent truth, and commercial ranking signals. Service credentials never enter a client. Shadow output creates no impressions, N2 events, Taste evidence, or User Card changes.
