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

Decision vNext continuity is the sole runtime-maintenance exception: after a
manual, exact-release Product activation and a separate postgres-only
authorization bound to that generation and its release, artifact and source-set
hashes, a database scheduler may append short leases for that same generation.
This is **not** an automated activation or deployment. It cannot authorize a
new generation, change an artifact, resurrect an expired lease, or override
Emergency-OFF. Each lease lasts at most 24 hours; missed scheduler runs expire
closed. A new release requires the normal manual Production process and a new
continuity authorization. Founder and CTO approved this policy change on
2026-10-01 for continuous Decision vNext operation.

### PRODUCT_SYSTEM_RECERTIFICATION

Weekly and manually runnable. Revalidates the current Product-v1 Decision,
World and User systems only. Historical phases, Week milestones, Founder Labs
and retired routes are Git history, not executable release authority. A failure
automatically opens a release-blocking incident. Development may continue, but
Production remains blocked until a successful run closes the incident.
Production also rejects a missing or older-than-eight-days recertification.

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

The retired tools are not callable from the root command surface and are not
active Product authority. Git history is their archive.

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

For an incremental pull-request update, the previous head itself is the gate
receipt carrier. Reuse is allowed only when GitHub reports the exact named gate
as successful for that head, Git proves `base -> previous head -> new head`, and
the incremental diff does not select that gate. Repository/security always runs
again. A missing check, cancelled job, untrusted check provider, force-push,
unrelated lineage, unknown path, or newly affected risk class forces the gate
to run. The full PR remains the source of blocked reasons and the incremental
diff can only remove already-proven executions; it can never clear a blocker.

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

### iOS-only artifact certification

The existing manual Product artifact workflow accepts `delivery_target`:
`PRODUCT` (default, unchanged backend/migration recovery gates) or `IOS_OTA`.
Both targets bind the exact canonical Main commit, tested web export, production
Hermes export, complete sealed bytes, historical recovery evidence and runtime
closure tests. No artifact is rebuilt for publication.

`IOS_OTA` records pending migrations exactly as pending; it does not authorize
or apply them. Their separately approved backend release may remain pending while
an independent app update ships. Supabase's two artifact verification steps
require `PRODUCT`, and the production preflight independently rejects iOS-only
artifacts before considering remote observations. iOS publication must verify
`--expected-delivery-target IOS_OTA` in addition to source, mode and manifest hash.
An iOS certificate must never be used as database or Edge Function authority.
Routine Risk Gate certification uses `IOS_OTA` while retaining all Product and
Edge-runtime tests. A backend deployment requires a separate exact-Main manual
`PRODUCT` certification and its unchanged migration-specific approval gates.

### Isolated research migration release (2026-10-24)

Founder authorized the exact current-profile research import migration and its
untested recovery risk, and explicitly requested isolation from four pending
Booking migrations. The source-aware plan binds both the selected and deferred
file hashes. No Auth or Function deployment may join this scope. Preflight and
apply use a disposable migration directory excluding only the four deferred
files; the Git checkout and remote migration history are never rewritten.
Manual exact-Main release, certified Product artifact and Production environment
remain required. A successful encrypted backup less than 24 hours old is checked.

The full shipped baseline must not advance past deferred migrations. After apply,
record the separate verified release receipt under
`supabase.isolatedResearchRelease` in `delivery/production-state.json`, with the
exact migration, source SHA, deployment run and manifest hash. The planner only
excludes that exact research migration; deferred Booking migrations stay visible
and require their own scope approval. Removing the isolated scope later does not
mark Booking as applied. Missing/mismatched receipts fail closed in dry-run.
