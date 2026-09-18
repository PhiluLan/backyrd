# Backyrd Delivery Workflow v2

Status: **FROZEN**

Owner: CTO

Applies to every change after the Decision-vNext single-route cutover.

## Objective

Preserve material security boundaries while removing repeated historical
certification from routine development. Each invariant is checked once by the
smallest authoritative gate. Historical evidence is not current Product
authority.

## Task classes

### FAST_PR

The default for isolated code, UI, tests and documentation. Repository and
secret invariants always run; only affected Mobile, Web, Admin, Shared, User,
World or Decision gates are added. Target feedback time: under 12 minutes.

### DATABASE_PR

For migrations, canonical SQL, database tests or the database harness. Runs
migration immutability, canonical clean boot, RLS, grants, and positive and
negative authorization tests. Database work is not automatically a Product
release.

### PRODUCT_RELEASE

For the installed Decision route, Product runtime, privileged Decision
function or release controls. Adds single-route validation, runtime boundary,
contract tests, one browser journey and the real Mobile bundle. It does not
replay Week 1/2/3 or Founder-Lab history.

### PRODUCTION_RELEASE

Manual workflow only. Requires an exact canonical Main SHA, explicit release
confirmation, recovery readiness, source-aware plan, apply, post-deploy smoke
and rollback criteria. A push can never trigger it.

### DEEP_RECERTIFICATION

Weekly and manually runnable. Contains historical Decision Lab, synthetic
worlds/profiles and old Week/Founder evidence. It detects long-range drift but
does not block an unrelated routine PR. A failure must be resolved before the
next Product release.

## Non-negotiable boundaries

- Published migrations are immutable; destructive changes fail closed.
- Exposed database objects require RLS, explicit grants and allow/deny tests.
- Privileged server code, Auth changes and Product routes receive release
  certification.
- Secrets and service-role credentials never enter clients or evidence.
- Decision has one Product route: Decision vNext. No legacy fallback.
- Learning is consent-bound; no consent means neutral projection and no write.
- Missing or skipped required gates fail the final `Risk-based merge gate`.

## Retired from routine PRs

- Phase-2/Phase-3 recursive recertification
- Decision Founder Lab browser suites
- Week-1/2/3 dark-runtime reports and preflights
- Founder-activation and four-track rehearsals
- repeated generation of immutable historical reports
- unrelated Mobile/Web/Admin/Database rebuilds caused by workflow, package,
  documentation or integration-control changes

The tools remain available through Deep Recertification until final archival
review. They are not active Product authority.

## Developer contract

Every task states its class, owned paths, acceptance tests and release impact.
Developers run the affected local fast lane. CI is authoritative for selected
gates. A red gate is fixed at its root; it is never bypassed and does not cause
unrelated domain recertification.

This workflow may change only through a Delivery Policy change with positive
and negative classifier tests. A new gate requires an owner, a precise trigger,
a unique invariant, and removal or replacement of overlapping checks.
