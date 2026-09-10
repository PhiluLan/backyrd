# ADR-002 — Canonical Integration and Evaluation Harness

Status: accepted technical Phase-2 decision; no Product policy approval.

## Decision

Phase 2 adds a server-only `CanonicalIntegrationExecutionEnvelope` and a content-addressed `EvaluationReport`. They compose, rather than copy, the canonical Decision request/context/candidate contracts, `WorldKnowledgeReaderPort`, and `RelevantUserProjection` port.

One neutral pool is materialized through the canonical World reader before central eligibility. A registry then gives the resulting branded `EligibleCandidate[]` to Baseline A, Baseline B, a frozen Legacy fixture comparator and a vNext fixture engine. All four outputs bind the same pool hash.

## Integrity model

- Every source policy is selected by server configuration. Phase 2 accepts exactly the explicitly non-Product synthetic policy.
- World snapshot, registry, rule-registry, source-policy, User projection, Context, pool, engine and policy identities are bound in the envelope.
- The report and each nested manifest, eligibility check/result, fit, confidence, evidence item and engine result are content addressed.
- Recursive validation replays eligibility and all four engines from the bound envelope. Recalculating outer hashes cannot legitimize changed inner semantics.
- Runtime duration is a non-semantic diagnostic. It is deliberately excluded from `reportHash`; changing it cannot change the decision identity.

## Alternatives rejected

Changing the Phase-1 `DecisionResult` to encode multi-engine evaluation would mix a Product-facing decision artifact with an offline comparison artifact. Copying World/User types would create competing contracts. Calling Decision v13 would violate sandbox isolation. Persisting reports would prematurely create a database and retention commitment.

## Consequences

The harness is deterministic, local and CI-safe, but fixture rankings are not Product recommendations. Production adapters, calibrated confidence, Scenario Oracles and shadow persistence require later approval.
