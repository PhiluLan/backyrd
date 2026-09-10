# World Knowledge Slice 3B recommendation

## Entry criteria

Slice 3B should begin only after Founder/CTO have recorded decisions for the policy areas in `FOUNDER_DECISION_PACK_DE.md`, especially opening-hours eligibility, current-state expiry, accessibility, owner/admin assertion authority, conflict handling, public email and duplicate/merge authority.

If empirical coverage is required before those decisions, an authorized operator should run `scripts/world-knowledge/production-coverage-readonly-v1.sql`, save only its single aggregate JSON result outside source control, and pass it through `normalize-production-coverage.mjs`. The sanitized output may then be reviewed before deciding whether it belongs in a later audit commit. This PR deliberately contains no Production result.

## Recommended bounded scope

Slice 3B should be a persistence and policy-foundation implementation, not a client rollout:

1. Promote only approved policy rows from draft candidates into a new accepted, hash-bound policy release.
2. Add forward-only migrations for registry release metadata, source references, append-only claims, verification processes/executions/records, resolution manifests and identity events.
3. Implement least-privilege RLS, grants and narrow RPCs with explicit positive and negative tests for each actor class.
4. Build a server-only resolver job that consumes the accepted registry and policy versions and writes an immutable resolution manifest plus replaceable projection.
5. Pilot a read-only legacy adapter on synthetic and approved non-Production fixtures; do not bulk migrate legacy rows.
6. Expose no Admin, Owner, Mobile, Web or Decision runtime until the persistence and authority gates pass independently.

## Required proof

- append-only history and supersession cannot be bypassed by direct client writes;
- Owner writes are limited to owned spots and policy-allowed attributes and stay assertions;
- Admin writes stay assertions unless a separate accepted verification process succeeds;
- verification execution authority cannot be self-declared;
- unknown policy, registry, process or identity-event versions fail closed;
- current state without `valid_until` never reaches the current projection;
- public contacts remain in the general World snapshot but not the Decision projection;
- private source references, actor IDs, subscription, payment and advertising never cross the World port;
- duplicate/merge/archive operations preserve claim lineage and require separately accepted authority;
- repository-declared and live-effective grants/RLS are checked separately before any activation.

## Explicitly later

Client authoring, complete taxonomy expansion, capability-to-intent relations, ranking, Recommendation eligibility integration, Production backfill, bulk source verification, final universal TTL values and mobile spot presentation stay outside Slice 3B unless separately authorized.

## Rollout shape after 3B

Prefer a shadow-only read path first: resolve approved synthetic or explicitly allowlisted test spots, compare deterministic snapshots, and emit no user-visible or ranking effect. Runtime activation should be a later, independently reversible decision.
