# Decision vNext Phase 1 integration closure

Status: Draft-PR foundation only. No Production adapter, traffic, database object, deployment or product recommendation is created.

## Executive architecture

```text
canonical WorldKnowledgeReaderPort -> WorldKnowledgeSnapshot --\
canonical DecisionVNextUserProjectionPort -> RelevantUserProjection ----> server-bound execution
DecisionRequest -> SituationalContextSnapshot ----------------------/          |
                                                                               v
neutral frozen CandidatePool -> central Eligibility -> EligibleCandidate[]
  -> Baseline/Target RankingPort -> Confidence -> Evidence authorization
  -> deterministic Explanation -> versioned DecisionResult
```

World, User and Context are separate authorities. Decision owns neither the World registry nor user-memory semantics. The package imports canonical contracts from `@backyrd/world-knowledge-core` and `@backyrd/user-intelligence-vnext-core`; it contains no copied World snapshot, User projection or competing port definition.

## Component disposition after rebase

| Component | Decision | Reason |
|---|---|---|
| Canonical serializer/hash and schema DSL | KEEP | deterministic, strict and package-local infrastructure |
| Decision request / result / eligible brand | EXTEND | v2 adds cross-domain bindings and fail-closed hashes |
| Local WorldKnowledge model and port from pre-alignment PR | REPLACE | canonical World package is now authoritative |
| Synthetic spot/user generator | EXTEND | now emits canonical World snapshots and canonical neutral User projections |
| Neutral candidate pool / three eligibility rules | EXTEND | retains behavior; binds canonical snapshot evidence and per-rule proof hashes |
| Baseline A/B | EXTEND | same fixture semantics; consumes adapter projections and the same pool |
| Legacy-v13 comparator | KEEP | comparison only; untouched and outside the core |
| Final target ranker, weights and context taxonomies | UNKNOWN / NEEDS PRODUCT DECISION | intentionally `NOT_CONFIGURED` |

## Contract and authority boundaries

`DecisionRequest` is strict and rejects server authority such as user ID, snapshots, manifests, pool, ranking, confidence, evidence and commercial influence. `DecisionExecutionEnvelope` binds the pseudonymous subject, Decision/session identity, canonical time, Context hash, World port/registry/rule/snapshot-set identities, User projection/manifest/subject identities, Candidate Pool hash, engine/policy versions, degradation state and the commercial-influence prohibition. The envelope itself is content-hashed and every mismatch fails closed.

`SituationalContextSnapshot` has three sections: explicit one-decision input, server-bound authority and derived values. Unapproved dimensions use namespaced `UNKNOWN`/`NOT_CONFIGURED` states. It declares `rawLocationPersisted: false` and `writesUserIntelligence: false`; only an independently authorized User observation may later create durable learning.

## World integration

`world-adapter.ts` accepts only a runtime-validated canonical `WorldKnowledgeSnapshot`, validates registry and rule-registry hashes, and retains readiness, conflicts/exclusions, freshness-sensitive open evidence and the snapshot hash. The canonical port already removes explanation-only knowledge, expired current states, asserted-only hours and commercial/non-knowledge context. Decision does not invent Capability-to-Intent relations: `CAPABILITY_INTENT_REGISTRY_NOT_CONFIGURED` remains in readiness and Result limitations. The synthetic intent/mood arrays are an explicitly non-canonical Baseline-B fixture policy.

Payment, owner tier, sponsored, advertising and subscription are absent even from the synthetic engine input. Counterfactual boundary tests attempt to inject each field and require strict rejection by `WorldCandidate`; canonical World tests separately prove that non-knowledge context is stripped before the reader port.

## User integration

`user-adapter.ts` consumes only `DecisionVNextUserProjectionPort` and validates the result against its server request. Raw events, review text, raw location and private social data are forbidden by the canonical projection boundary. Taste, Practical Preferences and Direct Spot Affinity remain separate canonical collections. The projection has no eligibility/ranking authority. No consent, missing snapshot, cold start and kill switch resolve to neutral personalization with explicit reasons; no weight, reducer or sufficiency threshold is introduced.

## Candidate pool, eligibility and ranking

Candidate generation sorts synthetic IDs, freezes one pool and records a stable non-personalized adapter source. All engines receive the same pool hash. Rankers cannot add candidates and accept only the private branded `EligibleCandidate[]` created by central Eligibility.

The only rules are distribution allowed, explicit city and explicit open-now. Each check binds rule/ruleset, evidence, outcome, reason, local unknown policy and proof hash. For `openNow=true`, anything other than authoritatively open fails; unknown is recorded as unknown and handled by the rule's fixture `fail` policy. Missing future Product policy is represented as `NOT_CONFIGURED`, never silent pass.

`RankingPort` is the target boundary. Baseline A and B retain transparent, unapproved fixture weights. Confidence remains uncalibrated and uses structural states; unavailable policy components carry `null/NOT_CONFIGURED`, never a claimed probability.

## Evidence, explanation, manifest and replay

Evidence identifies World/User/Context source domain, source reference/hash, signal, influence, trust/confidence state, limitations and policy version. Reasons can reference only allowed evidence signals. Rendering uses fixed templates and cannot create evidence or claims. World explanation-only material cannot enter because the canonical World port excludes it before adaptation.

The v2 manifest binds Decision contracts, World port/registry/rules, User projection/manifest, Context, generator/pool, eligibility/unknown policy, ranking adapter, fixture weight or `NOT_CONFIGURED`, confidence, evidence, explanation and exploration state. Request, envelope, snapshots, pool, checks, recommendations and result are content-addressed. Complete synthetic inputs replay byte-identically; altered bindings, evidence or manifest fail closed.

## Deterministic degradation matrix

| Condition | Phase-1 behavior |
|---|---|
| missing/invalid World snapshot or registry hash | fail closed before candidacy; no fabricated spot fact |
| World not ready / conflict / expired or unauthorized time fact | preserve readiness/limitation; hard rule cannot silently pass |
| Capability-to-Intent registry missing | Baseline-B fixture only; target policy remains `NOT_CONFIGURED` |
| no consent / missing or cold User projection / kill switch | neutral personalization and explicit limitation |
| incomplete Context | namespaced `UNKNOWN`/`NOT_CONFIGURED`; no long-term User mutation |
| semantic retrieval unavailable | deterministic neutral synthetic pool; Production behavior deferred |
| Legacy comparator unavailable | vNext evaluation continues; Legacy is never presented as vNext |
| ranking/exploration/confidence policy absent | structural limitation, no invented score/probability |

## Sandbox and validation

Smoke uses 24 spots/six users; full profiles use two fixed seeds with 300 canonical synthetic World snapshots and 50 synthetic user identities. It has no Supabase, network, Production credentials/IDs or Production data. Run:

```bash
npm ci
npm run world-knowledge:test
npm run user-intelligence-vnext:test
npm run decision-vnext:typecheck
npm run decision-vnext:test
npm run decision-vnext:smoke
npm run decision-vnext:full
```

## Deferred Product decisions / Phase 2 readiness

Canonical Capability-to-Intent policy, final Context vocabularies, Product unknown policies, target objective/dimensions/weights, exploration, confidence calibration/UI copy, Production candidate sources/budgets, retention windows, real adapters and rollout remain deferred. The first Phase-2 slice should implement a read-only, non-serving integration harness around the canonical ports, compare one target shell against both baselines on the frozen pool, and keep all unresolved policies visible.
