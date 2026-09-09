# Development Safety & Delivery V1

Status: risk gate active and additively required since 2026-09-09; shipped-baseline and isolated-environment rollout is in progress. This document is the operative contract; older release reports remain historical evidence.

## Purpose

The changed system boundary, not the age of the repository, selects the checks. Git preserves historical approvals. Active CI proves current behavior and fails closed only on a concrete invariant violation.

The open Review Media founder-iPhone incident remains `production_verified:false`. This rollout neither changes that Product code nor treats its partial test states as a successful baseline.

## Candidate identity

`scripts/ci/resolve-change-context.mjs` is the single identity contract:

- PR base: the exact GitHub `pull_request.base.sha`.
- PR head: the exact GitHub `pull_request.head.sha`.
- synthetic checkout: accepted only when its two parents are exactly base and head.
- canonical Main: the named canonical ref; a PR base may be an ancestor and is reported as stale rather than silently rewritten.
- push: head and checkout must be the canonical Main tip.

Two independent PRs therefore retain stable candidate identities. A newer, unrelated Main commit makes the older base visible but does not mutate the already tested head.

## Change classes and blocking proof

| Class | Selected proof | Concrete failure prevented |
| --- | --- | --- |
| Mobile presentation/product | Mobile contracts and lint; TypeScript remains explicitly advisory while inherited debt exists | Broken mobile contracts, navigation/upload regressions, new lint violations |
| Web presentation/product | Web contracts, TypeScript, production build | Broken consumer contracts or an unbuildable Web surface |
| Admin presentation/product | Admin contracts, TypeScript, production build | Broken privileged UI contracts or an unbuildable Admin surface |
| Shared contract | Shared-package TypeScript | Cross-surface contract incompatibility |
| Additive database | Immutable lineage, canonical clean boot, SQL/RLS suite, deployment-plan contracts | Rewritten migrations, unreproducible schema, authorization regression, incomplete release plan |
| Auth/RLS/Storage/privileged server | Additive database proof plus positive and negative authorization behavior | Cross-user access, excessive grants, insecure privileged execution |
| Decision/Mood/Ranking/Taste/Learning/Trust semantics | New deterministic semantic release record plus D2/D3/evaluation gates | Unnoticed protected-semantic drift |
| Decision evaluation only | D2/D3/evaluation gates, no invented Product generation | Corrupt or weakened evaluation machinery |
| Release/evidence/tooling | Candidate and deployment contract tests | Incorrect identity, self-authorizing evidence, incomplete or unsafe deploy calculation |
| Destructive database operation | Merge stops; separate Founder/CTO authorization, impact, backup and recovery are required | Irreversible Production data loss |

Every change also runs repository structure, migration-name, canonical SQL secret and repository-secret checks.

## Required check contract

During staged rollout the existing required checks remain active. After the new gate has passed on canonical Main, Branch Protection can add `Risk-based merge gate` before any old context is removed.

Final required check: `Risk-based merge gate`.

- Prevents: merging a candidate without every check selected by its independently classified risk.
- Applies to: every PR and every canonical Main push.
- PASS signal: immutable candidate resolution succeeded, no prohibited migration mutation/destructive SQL was found, and every selected job returned `success`; irrelevant jobs may be `skipped`.
- Blocking scope: merge. Production deployment has an additional controlled remote dry-run and source-verification boundary.
- Failure owner: the author fixes Product/test failures; Security or Database owner reviews genuine trust-boundary failures; Release Engineering fixes candidate/deployment contract failures.

The aggregator cannot turn a failed selected job green. A missing result, skipped selected job, foreign merge checkout, changed historical migration, destructive migration, leaked secret, or missing Decision release record is a hard failure with a named reason.

The older named contexts stay required only during the staged proof window. They are removed after the replacement has passed representative Mobile, database, authorization, Decision and deployment cases on GitHub; old workflows then become manual historical diagnostics. This preserves continuous protection while eliminating duplicated merge blockers.

## Decision releases

Unrelated UI, Admin, Storage, ordinary database, documentation and release-evidence changes do not create a new Decision generation. Genuine protected-semantic changes require one record under `decision-lab/releases/`; `generate-decision-release.mjs` derives its file list and hash. CI independently derives them again and runs the fixed evaluation list. The record cannot declare its own tests successful.

The V44 trust anchor and V45-V49 records remain immutable research/audit history. The active scope guard is a thin caller of the generic validator; byte patches, line counts, feature names and cumulative additive generations no longer grant permission.

## Database and Production delivery

The risk gate runs the current candidate clean boot only for database/control changes. It keeps migration immutability, ordered replay, Auth/Storage/Realtime/cron/webhook application, semantic schema/ACL fingerprints, core SQL behavior, changed migration tests, negative authorization checks and DB lint. Historic Gate 5/6/7 rollback reconstruction continues to exist in Git but is not on this path.

Production planning starts at the technically shipped Supabase SHA in `delivery/production-state.json`, not at the newest Main commit's parent. Consequently a Product migration followed by evidence commits is still pending. Production credentials exist only in the manually dispatched, protected release context.

## Mobile development isolation

Development, simulator and preview profiles bind explicit EAS `development`/`preview` environments and the dev application identity. Configuration fails if either points at Production Supabase. Production remains bound to the `production` environment and channel. Creating the external Supabase project and EAS variables is a one-time Founder/provider action; repository-side enforcement is already in place.

## Authority and STOP conditions

A Senior Engineer may update deterministic fixtures, generated hashes, forward migrations, tests, workflows and release evidence as routine implementation. Stop for intentional Security/Trust-boundary relaxation, protected Product-semantic change without explicit Product authorization, destructive Production impact, historical migration/ledger rewriting, new credentials/costs, or a materially new architecture outside the assignment.

## Rollout order

1. Add the risk gate without modifying legacy guard inputs.
2. Prove it on a PR and canonical Main.
3. Add it to Branch Protection while old required checks still apply.
4. Retire the legacy required contexts only after the replacement is active.
5. Remove historical one-off rules from active execution and activate shipped-baseline release planning in a separate PR.

This ordering creates no unprotected interval.
