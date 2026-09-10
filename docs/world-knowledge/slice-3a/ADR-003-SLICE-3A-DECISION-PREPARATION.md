# ADR-003: Slice 3A prepares policy decisions without activating policy

- Status: Proposed for Founder/CTO review
- Date: 2026-09-10
- Canonical base: `983cd7b3a3c11dd3e549c256850749b07b52eadf`
- Scope: analysis, deterministic simulation and persistence/security blueprint only

## Context

Slice 2 made registry governance, source assessment and verification authority executable, but intentionally left fact-specific source hierarchies, verification processes, freshness durations and conflict priorities unconfigured. Those choices affect eligibility, owner authority and operational risk. They cannot be inferred from the existence of legacy values or from a user's role.

No authorized Production connection was present for this worktree. Repository migrations and contracts can show declared structures, but not live row coverage, effective grants, policies or schema drift.

## Decision

Slice 3A adds a strictly draft calibration layer and keeps the canonical resolver fail-closed:

1. Policy candidates are marked `DRAFT_CANDIDATE` and use a `draft:world-knowledge-slice-3a:*` namespace.
2. The simulation accepts only an explicitly injected, hash-bound draft policy. Canonical readers continue to reject unknown policy versions.
3. Simulations replay the Slice-2 resolver and sanitized Decision projection; they do not create a second resolver.
4. No source class is independently considered verification. Verification still requires a separately accepted process/execution authority and record.
5. Missing data remains absent; explicit unknown remains distinct; no counterfactual fills values with false.
6. Production coverage is collected only through a bounded, aggregate-only, read-only query pack and a sanitizer. Without authorized access, no empirical claims are made.
7. Persistence and authority structures are a blueprint, not SQL or an activated security model.

## Consequences

Founder and CTO can compare conservative policies against the same synthetic facts and see exact readiness, exclusion and hash changes. The work produces decision evidence without pretending that a simulated choice is approved Product truth.

The implementation cannot answer live Production counts in this slice. It also cannot prove effective Production RLS, grants, function ownership or schema state. Those require an authorized execution of the query pack plus a separately authorized live security audit.

## Rejected alternatives

- **Promote one candidate policy now.** Rejected because the required Product and risk decisions are still open.
- **Reuse numeric legacy confidence.** Rejected because it collapses lineage, verification and freshness into an incompatible score.
- **Treat Owner or Admin role as verification.** Rejected because actor authority and factual verification are separate.
- **Infer Production coverage from migrations.** Rejected because repository declaration is not live-state evidence.
- **Implement persistence immediately.** Rejected because identity/merge authority, public email and policy selections remain unresolved.

## Acceptance boundary

This ADR authorizes only draft contracts, synthetic simulations, aggregate query tooling, documentation and tests. It authorizes no migration, Production query without an existing approved connection, runtime integration, policy activation, deployment or merge.
