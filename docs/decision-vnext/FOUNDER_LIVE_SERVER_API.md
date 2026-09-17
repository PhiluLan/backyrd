# Decision vNext Founder Live Server API

Status: **release candidate; evaluation only; not deployed**  
Canonical base: `9c38946462c5698ee1ff6375d996463254dd829e`

## Existing server/runtime audit

| Component | Decision | Reason |
|---|---|---|
| Authenticated Supabase Edge hosting boundary | KEEP / ADAPT LATER | It already provides server-only execution and bearer authentication. This slice does not change it. |
| `decision-north-star-internal` | REPLACE AS ORCHESTRATOR, KEEP AS EVIDENCE | It constructs direct Supabase repositories and belongs to an older runtime; vNext must not inherit those table couplings. |
| `decision-engine-worker` | PROHIBITED FOR THIS API | Queue, research, and shadow work are unrelated and may carry privileged credentials. |
| Decision-v13 RPCs/functions | KEEP UNCHANGED | Active Product behavior is outside scope and remains a fallback/reference only. |
| Week-3 internal dark control plane | EXTEND CONCEPTUALLY | Its fail-closed source/allowlist/kill-switch principles are preserved; its synthetic-only activation contract is not relabeled as Product authority. |
| Phase-3C Founder Lab evaluator | KEEP / ADAPT | It owns the approved evaluation semantics and German Evidence; the API adds server authority and transport around it. |
| Direct spot/User table reads | PROHIBITED | World and User data must enter through their canonical ports. |
| Separate demo HTTP server | DEPRECATE AS PRODUCT PATH | Local HTTP exists only as an E2E wrapper around the canonical handler. |

## Outcome

The API is a stable, authenticated, versioned server boundary for Founder evaluation. It turns a natural-language or corrected structured request into an understandable candidate assessment while preserving the canonical World, User, and Context boundaries. It is not Product ranking and cannot be activated from client input.

The canonical hosting boundary remains the existing authenticated server/Edge layer. This slice deliberately adds no Edge Function, RPC, migration, Auth change, Production adapter, deployment, or client wiring. A future hosting adapter may import `createFounderLiveHttpHandler`; it must not reimplement orchestration or contracts.

## Request and authority

`POST /v1/decision/evaluate` accepts `backyrd.decision-vnext.founder-live-request@1.0`. The strict request contains only:

- client request and idempotency identities;
- ephemeral natural language;
- explicit, runtime-validated Context corrections;
- Alternative and situational Reject state.

Unknown fields fail closed. User identity, authentication binding, server time, authorized location, World cohort, World policy, User Projection policy, engine release, ranking, evidence, rollout mode, and kill switch never come from the request.

The server authenticates first, rate-limits the subject, authorizes location, retrieves a server-selected neutral cohort, reads World snapshots through `WorldKnowledgeReaderPort`, requests only `RelevantUserProjection`, evaluates the canonical Phase-3C Context, and maps the result to a non-technical response. Location mismatch, missing intent, version drift, invalid projection, missing ports, timeout, and kill switch return closed stable errors.

## Stage and port map

| Stage | Owner | Boundary |
|---|---|---|
| Authentication | server host | `FounderLiveAuthPort@1.0` |
| Founder allowlist | server host | `FounderLiveAllowlistPort@1.0`; purpose and environment bound |
| Interpretation | Decision Context | canonical Phase-3C resolver; no authority |
| Location/time authority | server host | `FounderLiveAuthorityPort@1.0` |
| Neutral retrieval | Decision | `FounderLiveCandidateRetrievalPort@1.0`; fixed server cohort |
| World evidence | World | canonical `WorldKnowledgeReaderPort@1.0` only |
| User input | User Intelligence | canonical `DecisionVNextUserProjectionPort@1.0` only |
| Context / hard constraints / candidate evaluation | Decision | canonical Phase-3C contracts and policy |
| Evaluator adapter | Decision | `FounderLiveEvaluatorPort@1.0`; replaceable behind the stable client API |
| Ranking | Decision | `NOT_CONFIGURED`; no weights or ordering claim |
| Explanation | Decision | existing authorized evidence statements only |
| Response mapping | server API | German normal view; expert provenance separately authorized |
| Idempotency | server host | bounded, injected `FounderLiveIdempotencyPort@1.0`; no durable Product persistence in this release |

No World or User contract is copied. Context creates no User event. Alternative and Reject produce no World fact or learning signal.

The evaluator is an explicit versioned port. Candidate evaluation can therefore be replaced or extended server-side without changing the request/response contract or moving domain logic into Mobile. The release accepts only the pinned v1 port; version drift fails closed.

## Dual-run boundary

`executeFounderLiveDualRun` is a non-HTTP evaluation utility for `LOCAL_TEST` and `PROD_LIKE_TEST`. It executes the same request through two separately injected evaluator stacks and emits only a content-addressed technical comparison. It cannot emit Product output, persist a Decision, write Learning, claim ranking quality, or authorize Production. The public endpoint never exposes a dual-run switch.

## Responses

The normal response contains what Backyrd understood, hard conditions, soft wishes, the four evaluation groups plus contextual Reject, human-readable reasons, visible limitations, and `rankingState: NOT_CONFIGURED`. It contains no candidate IDs, reason codes, hashes, policy identifiers, or JSON diagnostics.

Expert provenance is returned only when the authenticated actor has expert access and explicitly asks for it. It binds the execution envelope, candidate IDs, snapshot/evidence hashes, User Projection hash, Context hash, policy, release, and recursive assessment hashes.

## Security, privacy, and limits

- Bearer authentication is delegated to the canonical host; this package never validates or stores credentials.
- Natural language is bounded to 2,000 characters and marked ephemeral. The API core performs no durable write.
- Raw location is absent. Only an authorized city binding enters the envelope.
- The response never contains Raw User events, review text, private social data, owner/payment/advertising fields, or secrets.
- Request size, rate, timeout, candidate count, projection item/byte budgets, idempotency, and kill switch are server controls.
- A request timeout aborts the execution capability. When a pending authority call returns after the deadline, the pipeline fails before retrieval or World/User evaluation rather than continuing in the background.
- No external network call exists in the core. World and User access are injected canonical ports.
- The release is limited to `LOCAL_TEST` and `PROD_LIKE_TEST`; `productionAuthorized:false`, `deploymentAuthorized:false`, and `shadowTraffic:false` are content-addressed.

### Privacy/observability inventory

| Data | Purpose | Persistence in this release | Logs/normal response |
|---|---|---|---|
| Bearer token | Authentication | Never | Never |
| Subject binding | Authority/idempotency | Process-local hash only | Expert provenance only through envelope |
| Natural language | Current Decision | Never durably persisted | Not echoed |
| Authorized city | Scope binding | Envelope in process-local result | Human-readable target city |
| World snapshot hashes | Integrity | No store | Expert only |
| RelevantUserProjection hash | Integrity | No store | Expert only |
| Raw User events/history/reviews | None | Forbidden | Forbidden |
| Candidate reasons | Explain the current result | No store | Human-readable statements |
| Runtime duration | Operations only | Not part of semantic identity | Not emitted by core |

A later host may log status, stable error code, counts, release version, and pseudonymous hashes. It must not log tokens, raw text, raw coordinates, complete projections, private source URLs, or commercial state.

## Operation and rollback

There is no Production operation in this slice. A future deployment must add a reviewed thin host adapter, accepted release/source identity, environment allowlist, rate-limit/idempotency implementations, and explicit Production authority. Rollback is removal/disablement of that adapter; the vNext core does not mutate shared state.

Local deterministic validation:

```bash
npm run decision-vnext:build
node --test packages/decision-vnext-core/test/founder-live-api.test.mjs
node packages/decision-vnext-core/sandbox/evaluate-founder-live-api.mjs
```

The evaluation covers A–D, family outing, bouldering with family, Context flip, Alternative, Reject, and byte-identical replay through the same server orchestrator. The release evidence remains `NOT_EXECUTED_NO_PRODUCTION_AUTHORITY`.

## Deferred Product decisions

Product ranking, weights, calibrated confidence, personalized retrieval, Production cohort/policy, free-text provider, persistence, shadow traffic, client UX, Learning, rollout thresholds, and visible Product release remain unconfigured and unauthorized.
