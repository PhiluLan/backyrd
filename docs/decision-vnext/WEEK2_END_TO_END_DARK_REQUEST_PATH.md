# Decision vNext Week 2 — End-to-End Dark Request Path

## Status and scope

This slice is a local, synthetic, read-only integration rehearsal based on canonical Main `f999e2185d9102ea59a2c6e2c0861a4122af359b`. It adds no Production adapter, persistence, Product result, ranking authority, eligibility authority, confidence claim, User learning, client wiring, network call, migration or deployment.

The public runtime is permanently off in this release:

- `DECISION_VNEXT_SHADOW_TRAFFIC=false`
- sampling `0`
- kill switch `ENGAGED`
- execution, persistence, network and Product output authority `false`

The OFF path returns before touching any World or User dependency. Its receipt proves zero World reads, User reads, evaluations, writes, network calls and Product outputs. Supplying `true` cannot activate the path; it returns `ACTIVATION_NOT_AUTHORIZED` with the same zero counters.

## Canonical flow

The local Test-ON harness is isolated outside the public package index:

`server authority → WorldKnowledgeReaderPort → RelevantUserProjection port → Phase-3C Context → neutral Candidate evaluation → technical parity report`

World contracts and semantics are imported from `@backyrd/world-knowledge-core`. User contracts and semantics are imported from `@backyrd/user-intelligence-vnext-core`. The Decision package defines only narrow compatibility interfaces extending those canonical ports. Unknown port, Registry, Policy, source, release, location or hash bindings fail closed.

The adapter binds the request, actor, decision/session, authoritative city, server time, source SHA/tree/artifact, World Registry/Policy/cohort, User projection contract/policy and Phase-3C release/policy. A separate synthetic source-trust record is required; a rehashed authority with a different source identity is rejected.

## Technical metrics, not Product quality

The report contains only technical integrity metrics:

- interpretation and candidate-set parity;
- hard-constraint and Candidate-tier deviations;
- false-confirmation and false-exclusion counts;
- UNKNOWN and fallback counts;
- byte-identical replay.

Targets and Product-quality oracles remain `NOT_CONFIGURED`. The threshold template is explicitly `DECISION_REQUIRED`; no rollout threshold is invented.

## Closed Founder and degradation matrix

The versioned local catalog binds exactly 15 scenarios: Founder A–D, family outing, bouldering, controlled Context flip, alternative, contextual reject, replay, UNKNOWN hard constraint, DISPUTED World fact, NOT_CONFIGURED mapping, closed despite typical daypart and a one-spot cohort. Every oracle is evaluation-only, has no ranking expectation and carries no Product-quality claim.

## Integrity and privacy

- Runtime schemas are strict and reject client-supplied authority, policy, engine or Product-output fields.
- The World Reader is called exactly once per manifest Spot and the minimized User Projection port exactly once per run.
- Phase-3C receives the already validated canonical projection; no duplicate User model or raw-event access exists.
- A recursively rehashed metrics/report manipulation fails deterministic replay.
- Static tests reject persistence, Supabase, network and Product-publisher dependencies in the runtime adapter.
- Fixture capability, authority provisioning and Test-ON execution are not exported from the public package index.

## Local validation

```text
npm run decision-vnext:typecheck
npm run decision-vnext:build
npm run decision-vnext:dark-request:week2
node --test packages/decision-vnext-core/test/dark-request-week2.test.mjs
node scripts/ci/run-decision-ci.mjs --group dark-request-week2
```

The source-aware Production Plan must remain read-only with `executionAuthorized:false`. No pending migration or deploy operation is part of this slice.
