# World Knowledge Slice 3A

Status: decision preparation only. No policy in this folder is canonical or production-authorized.

Canonical base: `983cd7b3a3c11dd3e549c256850749b07b52eadf`. Repository profile timestamp: `2026-09-10T16:00:00.000Z`.

## Evidence boundary

No authorized Production connection was available: the environment contained no Production database URL, Supabase access token, API URL/service key, linked project reference or pooler configuration. Production was not queried. The aggregate artifact therefore measures the canonical repository and migration history, not live rows, grants, policies or migration state. The versioned SQL query pack is ready for a later separately authorized read-only run.

## Deliverables

- `repository-coverage.aggregate.json`: sanitized, deterministic repository aggregate.
- `policy-calibration.aggregate.json`: deterministic synthetic comparison of both draft strategies.
- `COVERAGE_AND_MAPPING.md`: coverage, legacy mapping and data-quality findings.
- `POLICY_CALIBRATION.md`: source landscape, policy, verification, freshness and conflict options.
- `PERSISTENCE_SECURITY_BLUEPRINT.md`: relational persistence, identity ledger and RLS/ACL/function design.
- `FOUNDER_DECISION_PACK_DE.md`: decision-ready Founder/CTO choices in plain German.
- `ADR-003-SLICE-3A-DECISION-PREPARATION.md`: architectural decision record.
- `SLICE_3B_RECOMMENDATION.md`: bounded implementation sequence after approval.
- `scripts/world-knowledge/production-coverage-readonly-v1.sql`: aggregate-only, read-only Production query pack.
- `scripts/world-knowledge/normalize-production-coverage.mjs`: fail-closed sanitizer and SHA-256 normalizer.
- `packages/world-knowledge-core/src/calibration.ts`: synthetic draft-policy workbench.

The workbench accepts only policy versions prefixed `draft:world-knowledge-slice-3a:`. Canonical snapshot readers do not accept them unless a test explicitly injects that exact version/hash. This prevents a Draft Candidate from silently becoming Production policy.
