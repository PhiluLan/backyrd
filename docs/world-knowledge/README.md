# World Knowledge Foundation Slice 1

Status: local foundation candidate; no Production storage or consumer is connected.

## Purpose

`@backyrd/world-knowledge-core` expresses what Backyrd knows about a Spot without mixing that knowledge with a user request, ranking, Owner commerce, or UI state. Slice 1 is deliberately small: it proves a deterministic registry, append-only claims, qualitative trust, explicit time semantics, conflict preservation, five conservative derivations, use-case readiness, and a sanitized consumer port.

The package is pure TypeScript and has no database, Supabase, network, authentication, payment, Admin, Owner, mobile, or Decision Engine dependency.

## Flow

```text
versioned registry
        |
append-only claims + evidence metadata
        |
deterministic resolver -------- historical claims remain intact
        |
semantic conflict checks
        |
five bounded derived rules
        |
sanitized WorldKnowledgePort snapshot
        |
future adapter (not implemented) -> Decision vNext
```

The engine boundary receives resolved World facts and capabilities. A Decision Request owns its intent. A future, separately versioned relation registry may connect capabilities to intents; Slice 1 defines only the reader port for that future registry.

## Normative implementation

- Registry and validity policy: `packages/world-knowledge-core/src/registry.ts`
- Claim and value contracts: `packages/world-knowledge-core/src/contracts.ts`
- Resolver and conflict matrix: `packages/world-knowledge-core/src/resolver.ts`
- Derived rule registry: `packages/world-knowledge-core/src/derived.ts`
- Sanitized port and readiness: `packages/world-knowledge-core/src/port.ts`
- Synthetic acceptance world: `packages/world-knowledge-core/src/fixtures.ts`

All object hashes use canonical NFC-normalized JSON, lexicographically sorted object keys, finite normalized numbers, and SHA-256. Arrays with set semantics are normalized by their value parser. Identical inputs, registry identity, rule identity, and `resolvedAt` therefore produce byte-identical canonical outputs and hashes.

## Boundary guarantees

- Missing is absent; it is not `UNKNOWN` and never `FALSE`.
- Resolution, freshness, and trust are separate dimensions.
- Actor type and source type are separate. No Actor ID exists in the engine contract.
- Admin or Owner status does not raise trust.
- A source reference alone does not authorize a trust-dependent readiness result.
- A session provenance identifier is not evidence.
- No numerical confidence exists.
- Historical claims are append-only; correction creates a new claim with `supersedesClaimId`.
- Direct subjective fits are explanation-only and excluded from authorized facts.
- Current State without `validUntil` is excluded.
- Asserted-only opening hours are excluded from eligibility truth.
- Secondary Categories do not exist in the Slice 1 contract.
- The 16th primary category is `OTHER` (`Sonstiges` / `Other`).
- No Production table, migration, policy, RPC, deployment, or Decision consumer changes in this slice.

See the remaining documents in this directory for the normative key, trust, temporal, port, compatibility, ADR, deferred taxonomy, and Slice 2 decisions.
