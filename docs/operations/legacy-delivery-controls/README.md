# Legacy delivery controls inventory

This inventory records controls found active on canonical Main at the start of Development Safety & Delivery V1. It is not an instruction to reproduce them in future releases. Git and the historical reports retain their evidence.

The replacement must be green and required before any active blocker below is retired.

## Historical one-off mechanisms

- `scripts/ci/decision-d2-scope-guard.sh`: exact historical patch bytes, changed-line counts, diff hashes, feature marker files and named release exceptions.
- `scripts/ci/validate-admin-data-additive-candidate.mjs`: V1.4-specific base/head/candidate and file-set rules.
- `scripts/ci/validate-mobile-storage-atomic-candidate.mjs`: V1.5-specific base/head/candidate, pending marker and exact feature file-set rules.
- `scripts/ci/test-decision-d2-web-closure-guard.sh`: historical exact-hash Web closure regression.
- `scripts/ci/validate-supabase-local.sh`: Gate 5/6/7 reconstruction, historical schema/ACL snapshots, fixed object counts, source greps, V1.4/V1.5 candidate resolution and current-fingerprint manual transfer points.
- `scripts/ci/validate-production-lineage.sh`: complete historical Product-lineage reconstruction and equality of current surface trees with shipped trees.
- `docs/operations/PRODUCTION_PRODUCT_LINEAGE.json`: cumulative V44-V49 historical entries used as a present-tense blocker.
- `docs/operations/production-lineage-candidates/ATOMIC_REVIEW_MEDIA_V1_PENDING.json`: feature-specific pending marker wired into the generic Production planner.
- `scripts/deployment/verify-manual-production-release.mjs`: exact Main-tip identity and immediate-parent base selection.
- `.github/workflows/supabase-production.yml`: Production credentials offered to same-repository PR dry-runs and an immediate-parent deployment scope.

## Replacement contracts

- One base/head/checkout/canonical resolver: `scripts/ci/resolve-change-context.mjs`.
- One declarative classifier: `scripts/ci/classify-change.mjs` plus `delivery/change-policy.json`.
- One generic protected-semantic validator and deterministic record generator.
- One risk-selecting merge result: `Risk-based merge gate`.
- One shipped Production baseline with all pending changes computed from shipped baseline to selected canonical candidate.
- Behavior tests for RLS/ACL, migrations, clean boot, secrets and deploy completeness instead of feature-name or line-count exceptions.

Retirement means removal from active merge/deploy execution. Historical files may remain where needed to explain an already executed release, but they do not define a new candidate's permission. The feature-specific database boot and Product-lineage calls were removed from the stable `Canonical database boot` context after the current clean boot passed the complete local candidate. The later workflow/Branch-Protection cutover removes the remaining duplicate contexts after their replacements pass GitHub.

The global `Decision Lab deterministic smoke` job was also removed from the
ordinary Quality workflow after GitHub proved that the required risk gate skipped
Decision for a Mobile/DB-Control candidate while retaining its independently
tested fail-closed semantic path. Its 431 passing domain tests remain invoked by
that selected path; the two removed failures asserted obsolete V1.4.4/V1.4.5
workflow strings rather than Product behavior.
