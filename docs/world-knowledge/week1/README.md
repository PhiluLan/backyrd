# World Knowledge Week 1

This slice prepares—but does not authorize—the first World Knowledge Production database release.

## Canonical identity

- Canonical base: `4dd76c6149e425f191586e904d21b851fc1995c5`
- Production shipped source: `d63c5ae66aa30aa017cc54c2ed8be47944b84889`
- Shipped migration tip: `20260909073004_close_review_capture_trust_v2`
- Pending migrations: 9
- Migration bundle hash: `8a642e025701cb02a769fcdf7fda4390f955bad08478a2690ae512a6c197d066`
- Source-aware plan hash at base: `9087a926dc678b8c8caf6466c69f71be44ca2153126556451de39a92ea254ed0`
- Production execution: `BLOCKED` (`executionAuthorized:false`)

The executable generator recomputes all identities from immutable source and rejects any additional migration, Edge Function, Auth change, missing hash, changed order, destructive DDL or unsafe `SECURITY DEFINER` boundary.

## Exact order

1. `20260910174419_world_knowledge_slice_3b_foundation.sql`
2. `20260911184459_world_knowledge_slice_4a_authoring.sql`
3. `20260911214533_world_knowledge_slice_4a_legacy_import_rehearsal.sql`
4. `20260912084654_world_knowledge_slice_4a_authoring_product_readiness.sql`
5. `20260912103000_world_knowledge_slice_4a_authoring_reliability.sql`
6. `20260912121000_world_knowledge_slice_4a_taxonomy_candidate_expansion.sql`
7. `20260912165043_world_knowledge_slice_4a_authoring_registry_2.sql`
8. `20260915163631_world_knowledge_slice_4b_contextual_semantics.sql`
9. `20260916061802_world_founder_context_handoff_unknown_canonicalization.sql`

The detailed lock, dependency, rollback and stop-condition classification is emitted by `build-week1-production-release-foundation.mjs`; the operational sequence is in `PRODUCTION_RELEASE_RUNBOOK.md`.

## Isolated rehearsal proof

The nine migrations were applied one by one, in exact order, to a disposable PostgreSQL 17 / Supabase stack seeded with 1,000 synthetic spots. All six World SQL suites and the same-key, cross-key/same-input, and distinct-input/monotone-pointer parallel rebuild cases passed. A second apply was a no-op. The anonymized evidence is in `rehearsal-evidence.json`; the executable rehearsal recreates it without Production access.

The repository's general clean-boot path remains green. Because that path can bootstrap historical release evidence, the dedicated Week 1 rehearsal is the authoritative proof that this exact nine-migration chain was applied and verified.

## Cohort readiness

A deterministic local read-only pass over 412 imported Founder-evaluation spots prepared 30 candidate spots: 8 Eat, 5 Drinks, 5 Coffee/Daytime, 5 Culture/Arts and 7 deliberately `NOT_CONFIGURED`. The detailed candidate file remains mode `0600` under ignored `.local/world-week1/`; only anonymized counts and hashes are committed.

This is a suggestion set only. It created no Claim, Verification, Confirmation, Cohort membership, Projection or Decision input. The coverage matrix demonstrates the current work needed: kitchen hours and age rules are absent across the candidate set, price needs review for 29/30, and Accessibility remains absent for 28/30. These are gaps, not negative facts.

## Boundaries

- No Production query or mutation was performed.
- No migration, deployment, runtime activation or Decision wiring was performed.
- `UNKNOWN`, `NOT_CONFIGURED`, `DISPUTED`, absent and false remain distinct.
- Decision owns future capability-to-intent semantics; User Intelligence is unchanged.
