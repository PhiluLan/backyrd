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
does not block an unrelated routine PR. A failure automatically opens a
release-blocking incident. Development may continue, but Production remains
blocked until a successful run closes the incident. Production also rejects a
missing or older-than-eight-days recertification.

### SUPPLY_CHAIN

Runs for dependency manifests, lockfiles and GitHub Actions. Direct dependency
changes require the matching lockfile, installs must be reproducible without
package lifecycle scripts, newly introduced high/critical vulnerabilities are
rejected, and every third-party Action is pinned to a full commit SHA.

## Non-negotiable boundaries

- Published migrations are immutable; destructive changes fail closed.
- Exposed database objects require RLS, explicit grants and allow/deny tests.
- Privileged server code, Auth changes and Product routes receive release
  certification.
- Secrets and service-role credentials never enter clients or evidence.
- Decision has one Product route: Decision vNext. No legacy fallback.
- Learning is consent-bound; no consent means neutral projection and no write.
- Missing or skipped required gates fail the final `Risk-based merge gate`.
- Unknown or newly introduced repository paths are `UNKNOWN/HIGH` and block
  classification until the delivery policy assigns an explicit risk class.
- Cross-domain changes receive the set union of every affected gate. No
  "primary domain" may suppress another domain's checks.
- A Production release must consume the exact CI-certified artifact identity;
  rebuilding an unbound artifact at deployment time is forbidden.

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

### Root-cause repair and resume

After a gate has completed its expensive execution successfully, a later
evidence, report, packaging, or presentation failure does not authorize a
second full run. The gate records an input-bound receipt and resumes only the
failed downstream step. A full rerun is required only when an input protected
by that gate changes: source or migration bytes, its tests or harness, toolchain
identity, database image, authorization policy, or another declared semantic
input. Receipt mismatch fails closed.

For every red gate the repair loop is fixed:

1. isolate one root cause;
2. run the smallest reproducing test;
3. run the affected gate from its last valid receipt;
4. let CI run the classifier-selected union once on the final candidate.

Developers must not restart complete Decision, database, four-track, browser,
or repository suites after an evidence-only correction when their input-bound
receipt is still valid. Repeated full loops require a documented invalidated
input, not habit or uncertainty.

This workflow may change only through a Delivery Policy change with positive
and negative classifier tests. A new gate requires an owner, a precise trigger,
a unique invariant, and removal or replacement of overlapping checks.

## Measurement window

The next optimization review happens after 50–100 merged PRs. The evidence set
is median/p95 PR feedback time, duration per gate, failure rate, false-positive
rate, skipped-required-gate incidents and defects found per gate. Gates are
then changed from observed protection value, not from intuition.

## Release identity

Human release control converges on one hierarchical Release Manifest. It binds
source/tree SHAs, World/User/Decision artifacts, migration set, test evidence,
build artifact, runtime policy and Production plan. Component hashes remain
machine-verifiable children; the manifest hash is the single release identity
shown to humans.
