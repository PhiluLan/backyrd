# ADR: Decision vNext Phase-1 integration closure

- Status: proposed in Draft PR #268
- Date: 2026-09-10
- Canonical base: `e48ecc461604f4f6ec73f399a39e233f7f5e5559`
- Scope: local/CI synthetic integration; no Production adapter or activation

## Decision

1. World knowledge is consumed only through the canonical `WorldKnowledgeReaderPort` and runtime-validated `WorldKnowledgeSnapshot` from `@backyrd/world-knowledge-core`.
2. User knowledge is consumed only through the canonical `DecisionVNextUserProjectionPort` and `RelevantUserProjection` from `@backyrd/user-intelligence-vnext-core`.
3. The pre-alignment Decision-owned World model and port are deleted. Decision retains only a versioned, content-hashed candidate adapter projection needed by its stages.
4. Situational Context is a new Decision-owned, versioned domain with explicit, server-bound and derived sections. It cannot write User Intelligence.
5. A server execution envelope binds Context, World, User, Candidate Pool, engine/policy versions and a commercial-influence prohibition. Any content/hash/subject mismatch fails closed.
6. Capability-to-Intent, target ranking, exploration and unapproved Context semantics remain `NOT_CONFIGURED`. Baseline-B mappings are synthetic test policy only.
7. Confidence is structural and nullable for unconfigured components. It is not a probability.

## Rationale

Canonical ownership prevents contract drift and stops Decision from inheriting current database tables or raw user-memory internals. A narrow adapter keeps stage inputs stable without duplicating either source domain. Explicit degradation permits deterministic evaluation before Product policies exist.

## Consequences

The synthetic spine can prove authority, isolation, eligibility and replay, but cannot claim Product recommendation quality. A future Production adapter must be independently reviewed for privacy, World readiness, retention, authorization and rollout; this ADR grants no such integration.
