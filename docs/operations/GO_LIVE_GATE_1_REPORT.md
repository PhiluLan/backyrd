# Go-Live Gate 1 — Production Truth & Database Integrity

Audit date: 2026-08-28  
Production project: `hjgcrrzfjchzqoegcywn`  
Gate branch: `codex/go-live-gate-1`  
Audited base: `93478bcfbcd809d9d349f2e6499026cb469e97bb`  
Production migration tip: `20260828192125_gate1_schema_convergence_v1`

## A. Executive result

**GO-LIVE GATE 1 — FAIL.** The migration history, clean bootstrap, schema/RLS convergence, relational integrity, canonical truth structures, database restore, and media restore were proven. The gate cannot pass because three P1 decisions remain outside an engineer's unilateral authority:

1. two active Product Spots claim the same Google Place identity for Basler Papiermühle;
2. three approved Product Spots have broken authoritative header-image references;
3. the Free-plan project has no proven ongoing, retained, off-provider database-and-media backup strategy.

No real Product history was deleted to obtain this result. The one Production mutation was a forward-only, additive schema convergence migration. Gate 2 must not start.

## B. Gate-1 target

Prove that the canonical repository can build the database from zero, Production matches its immutable migration history, retained data is structurally trustworthy and correctly classified, Product behavior is uncontaminated by fixtures, and database plus media recovery is operationally credible.

## C. Authoritative repository / Production baseline

- Work was isolated from the user's dirty `main` worktree.
- The branch was based on PR #105's repository base (`93478bc`), while deliberately excluding PR #105's two pending Admin migrations.
- Production initially contained 89 migration ledger entries; the repository contained 87 and one locally mis-versioned file.
- Two exact Production-applied migration files were recovered byte-for-byte from Git commit `d07c1c1`; the offering migration was renamed from the incorrect local version `20260827185239` to the Production-applied version `20260827185823` without changing its bytes.
- After the Gate-1 forward migration, local and Production ledgers contain 90 aligned versions and Production reports no pending migrations.

## D. Current-state findings

The database foundation is substantially healthy: 245 public tables were inspected, all physical foreign keys were checked dynamically, RLS is enabled on every public table, canonical truth chains are intact, and the clean database produces the same public schema and ACL fingerprint as Production. Product-visible fixture Spots, Reviews, Moments, and Photos are zero.

The remaining current-state defects are the active external-identity collision, three broken authoritative headers, and absence of a durable ongoing backup arrangement. A pre-existing Decision Lab freeze identity mismatch is also recorded as P2 because it blocks that suite's certification but was not caused by, nor repaired within, the Gate-1 data-foundation scope.

## E. Known migration blocker root cause

The first clean-boot failure was deterministic. `20260826120000_production_decision_fixture_cleanup_v1.sql` asserted that an exact set of 26 fixture rows and five tombstones already existed. A zero-data database correctly had none, so it raised `fixture_cleanup_identity_or_provenance_mismatch`. `20260826210000_final_admin_four_spot_hard_delete_v1.sql` was likewise a Production-only destructive historical operation.

Applied migrations were not rewritten. Their immutable hashes are registered in `supabase/historical-data-operations.json`; clean bootstrap verifies those hashes, omits only those two data operations, and applies a later schema-convergence migration that recreates their durable schema effects without requiring historical rows.

A second bootstrap discrepancy came from Supabase's broad default privileges being active while restoring the pg_dump-style canonical baseline. Bootstrap now temporarily neutralizes those defaults for the baseline and restores them before forward migrations. This yields the canonical ACL exactly and requires zero manual intervention or migration repair.

## F. Migration history / ledger

- Local versions: 90 unique.
- Production versions: 90 unique.
- Missing Production migrations locally: 0.
- Unexplained byte/hash divergence: 0.
- Duplicate versions: 0.
- Unexpected pending migrations: 0.
- Production tip: `20260828192125`.
- PR #105 migrations `20260828170059` and `20260828173349` were neither included nor deployed and must be re-versioned after the Gate-1 tip before revalidation.

## G. Clean boot

`scripts/ci/validate-supabase-local.sh` starts an empty local Supabase database, applies the canonical baseline and forward migrations under their correct privilege context, validates immutable historical-operation hashes, checks the canonical ACL fingerprint, runs DB lint and repository SQL tests, and exits successfully. Manual database edits: 0. Migration repair: no.

## H. Schema drift

The canonicalized public schema plus ACL dump of a fresh database matched a faithful restored Production snapshot after Gate migration with zero unexplained diff. Canonical ACL SHA-256:

`5d7f14d6121e19be533fd0f53c954af94ec11ea40e3f31d8c6ceccae0e3107c5`

Production independently produced the same fingerprint after deployment. Function compatibility, check constraints, RLS policies, grants, indexes, and default privileges were included in comparison.

## I. Migration classification

- Canonical baseline/schema migrations: bootstrap-required.
- Forward schema migrations: bootstrap-required.
- `20260826120000_production_decision_fixture_cleanup_v1`: immutable one-time historical data operation.
- `20260826210000_final_admin_four_spot_hard_delete_v1`: immutable one-time historical data operation.
- `20260828192125_gate1_schema_convergence_v1`: forward-only schema reconciliation and authorization hardening; bootstrap-required and Production-applied.

No applied migration was edited, repaired, or falsely marked complete.

## J. Orphan / reference integrity

All physical foreign-key families across 245 public tables were enumerated and queried: true FK orphans = 0. Semantic audits covered Spot identity, accepted facts and sources, N4, offering/purpose, user intelligence, decisions, social, messaging, safety, analytics, ownership, claims, and media.

**Active Product integrity:** no missing referenced Spots, profiles, sources, dimensions, latest-card pointers, message senders, or invalid social graph shapes were found. The active Papiermühle identity collision is a semantic ambiguity, not an FK orphan.

**Valid historical lineage:** archived Fixture references in analytics, decisions, reviews, moments, safety, media, research, hours, and aggregates remain intentionally attributable. They are excluded from normal Product and learning reads. No historical records were rewritten merely to make tests green.

## K. Test / fixture / tombstone integrity

Production Spot inventory:

| Class | Count | Product-visible | Decision-visible | Learning-consumable | Normal Product metrics |
|---|---:|---:|---:|---:|---:|
| Approved LEGACY Product Spots | 124 | 124 | eligible | eligible where contract permits | yes |
| Archived LEGACY Spot | 1 | 0 | 0 current | 0 current | historical only |
| Archived FIXTURE tombstones | 5 | 0 | 0 | 0 | no |

Retained fixture lineage: Reviews 17, Moments/social posts 8, analytics events 17, decision impressions 8, Spot photos 2, safety content 32, safety media 7, accepted facts 0, memory 0, favorites 0, decision actions 0. Additional fixture-derived historical rows include research/embedding jobs (5/5), intelligence evidence (7), N4 snapshots (3), ML documents (5), hours (7), mood aggregates (13), and review aggregates (13).

Every retained fixture identity is an archived, attributable historical tombstone. Anon Product reads see 124 Spots and zero fixtures. Product-visible fixture Reviews, Moments, and Photos are zero. Normal Admin Product metrics must exclude these rows; raw-history audit views may retain them.

## L. Canonical truth map

| Domain | Source of truth | Derived state | Rebuildability | Status |
|---|---|---|---|---|
| Spot identity | `spots`, external identity fields | public/Admin read models | constrained rebuild | P1 collision |
| Human Spot Intelligence | evidence/source records | intelligence views | from retained evidence | PASS |
| Accepted Facts | accepted-fact ledger + sources | current fact views | from ledger | PASS |
| Sources | provenance/source records | citations/read views | retained inputs required | PASS |
| Offering/Purpose | dedicated fact hierarchy | current read views | from fact ledger | PASS |
| N4 | 60 canonical dimensions + evidence | snapshots/state | from evidence | PASS |
| Gold | explicit Gold state | ranking inputs | contract-controlled | PASS |
| Decision data | sessions/impressions/actions | evaluation summaries | raw history retained | PASS |
| User Intelligence | events/evidence | cards/snapshots/latest pointers | queued deterministic rebuild contract | PASS |
| Profiles | auth-linked profiles | public profile view | auth identity required | PASS |
| Moments/Reviews/Social | attributable user rows | feeds/counts | raw rows retained | PASS |
| Messages | chats/participants/messages | inbox state | raw rows retained | PASS |
| Favorites | user-Spot edges | saved views | raw rows retained | PASS |
| Safety | cases/signals/decisions | moderation state | evidence and human outcome retained | PASS |
| Analytics | append-only raw events | Product metrics | metrics rebuildable from classified raw history | PASS |
| Owner/Claims | roles, claims, ownership | Owner views | audit history retained | PASS |

## M. Accepted fact / provenance integrity

Accepted facts: 854 total; 833 ACTIVE, 20 SUPERSEDED, 1 UNKNOWN status. Duplicate current facts: 0. Active facts missing a source: 0; missing a Spot: 0; invalid scopes: 0; fixture facts: 0; facts accepted before observation: 0. Supersession and provenance chains showed no structural break. The single UNKNOWN value is retained historical state and is not current Product truth.

## N. N4 integrity

Canonical dimensions: exactly 60 and unique. Evidence rows: 1,022 with zero missing dimensions. Snapshots: 85, including three attributable fixture-history snapshots; Gold rows: 60. Missing Spot references: 0. N4 can be rebuilt from retained evidence under its existing contract. Offering/Purpose and Taste remain separate domains; no dimensions were changed.

## O. Offering / Purpose integrity

Active offering facts: 23. Active purpose facts: 23. Invalid enum/tri-state values, hierarchy violations, and broken current read-model rows: 0. Fixture current/Decision reads: 0. Supersession semantics remain intact. Offering/Purpose was not collapsed into N4 or User Taste and its semantics were not changed.

## P. User Intelligence structural integrity

Memory/event evidence rows: 234; duplicate processing hashes: 0; missing profiles: 0; fixture contamination: 0. Snapshot rows: 50; broken latest-card pointers: 0; node-count mismatches: 0. Memory bridge jobs: 217 COMMITTED. User-intelligence jobs: 234 COMMITTED. Required failed/stuck work: 0. This is a structural verdict only, not a judgment of learning quality.

## Q. Decision history integrity

Sessions: 651; impressions: 1,110; actions: 762. Broken references and invalid feedback links: 0. Eight impressions belong to archived Fixture history; fixture actions: 0. Archived/deleted Spot history remains attributable and is not rewritten. Current candidate eligibility excludes fixtures.

## R. Social / user content integrity

Profiles 18; Moments 25; Moment media 20; Moment reactions 6; Moment comments 1; Reviews 88; Review photos 16; Review likes 1; Review comments 1; follows 5; favorites 1; chats 2; participants 4; messages 13. Self/duplicate follows: 0. Invalid chat participant shapes or message senders: 0. Fixture history comprises eight Moments and 17 Reviews and is not Product-visible.

## S. Analytics history

Raw analytics events: 1,770. Unknown entity types: 0; invalid entity references: 0. Seventeen events are attributable fixture history.

**RAW HISTORY IS VALID.** Retention preserves explainability and audits. **NORMAL PRODUCT METRICS MUST NOT COUNT FIXTURE EVENTS.** Gate 1 did not rewrite analytics or change Admin metric semantics.

## T. Queues / jobs

| Queue | Purpose | State | Failed/stuck | Retry/idempotency |
|---|---|---|---:|---|
| Embeddings | Spot embeddings | 130 DONE | 0 | completion-keyed |
| Memory bridge | user evidence ingestion | 217 COMMITTED | 0 | commit/idempotency key |
| User intelligence | card/state processing | 234 COMMITTED | 0 | duplicate hash protected |
| Mood | mood aggregation | 32 DONE | 0 | state-keyed |
| Messages | outbound notifications | 2 SENT, 4 SKIPPED | 0 | terminal state guarded |
| Research | enrichment/review | 1 historical FAILED, 2 READY_REVIEW | 0 unexplained | bounded attempts |
| Safety text | content analysis | 234 SUCCEEDED | 0 | result state guarded |
| Safety image | media analysis | 91 SUCCESS, 11 SKIPPED, 2 historical DEAD_LETTER | 0 unexplained | five-attempt bound |

The research failure is an approved LEGACY record caused by incomplete max-token output after two attempts. The two image dead letters are historical invalid relative URLs after five attempts; corresponding cases were human-decided (`allow`/`shadow`). Exact exception IDs are asserted in the Production sanity tool. Required unexplained failed jobs: 0; stuck jobs: 0.

## U. RLS / authorization structural check

All 245 public tables have RLS enabled. Tables with deny-by-default service internals have no unnecessary client grants. The runtime-settings table was hardened to service-only. Three current-user policies were corrected to use the current-user consent helper instead of a service-only arbitrary-user helper. Direct service-consent policy calls: 0.

Admin identities: 1; Owner identities: 1; the Founder holds both roles, but Owner does not inherit Admin. Claims: two approved, one pending. The one historical approved-claim/ownership mismatch is explained by 57 later owner changes and retained audit lineage. This is structural Gate-1 coverage, not Gate-5 security certification.

## V. Data origin / provenance

Observed critical origins:

- Spots: LEGACY 125 (Product/historical), FIXTURE 5 (archived fixture).
- Reviews: LEGACY 71 (Product/historical), FIXTURE 17 (historical fixture).
- Intelligence evidence: REAL 858 (Product), LEGACY 157 (historical/Product provenance), FIXTURE 7 (historical fixture).
- Suitability: REAL 271, LEGACY 88.

Unknown/invalid critical origins: 0. Origin values were not relabelled.

## W. Duplicate / identity findings

One archived Tierpark duplicate has no user content; the active counterpart is rich and approved. It is an explained historical tombstone and creates no current ambiguity.

One unresolved current Google Place collision does create canonical Product ambiguity:

- `a054f361-3a6d-404d-8e12-373f810fc6fc` — older long-name Basler Papiermühle record; 3 impressions, 6 hours rows, 17 accepted facts, 1 N4 snapshot, no Gold and no user content.
- `01c40cfb-d002-4ad0-9c34-b8f4a598e232` — newer Basler Papiermühle record; 14 impressions, 1 analytics event, 6 hours rows, 5 accepted facts, 1 N4 snapshot, Gold, and no user content.

Both are approved LEGACY Product Spots with the same Google Place ID. No automatic merge/archive was performed because selecting a canonical real entity and reconciling its truth history is a Product decision. Exact-name/address collisions, invalid coordinates, blank names, missing category references, and duplicate usernames/emails/phones: 0.

## X. Media / storage integrity

Storage metadata: 118 objects across badges 7, chat 7, exports 1, profile 8, review 11, social 12, and spot 72. Critical checks: avatars 2/2 present; Moment media 20/20; Review media 14/14; authoritative headers 11/14.

Broken authoritative approved-Spot headers:

- Crescenda — Spot `9afaa613-a268-4e20-a5f3-624c647c0b6f`
- LORA — Spot `92741865-1bfe-4f79-a99b-9304b946d167`
- VITO Gundeli — Spot `4d832365-5900-40d3-8652-b385f324f328`

Optional stale references: one legacy Review object and five gallery objects. They are not authoritative headers and were not mass-deleted. The 118-object export and isolated re-download were byte-for-byte verified; recovery must temporarily accommodate historical badge objects that exceed today's 2 MiB/type policy, then restore the policy exactly.

## Y. Backup

The Supabase project is on the Free plan. Provider backup inventory is empty; daily retained backups and PITR are not available. Gate 1 created a pre-mutation logical database snapshot outside the repository (49,368,930 bytes total) and a complete 118-object Storage export (118,472,337 bytes). These are point-in-time drill artifacts, not a durable scheduled/off-provider strategy. Database dumps do not include Storage bytes, Auth provider configuration/JWT configuration, Edge Function code, or secrets.

Frequency: manual once. Retention: temporary local drill scope. Off-provider durability: unproven.

**BACKUP STRATEGY — NOT_PROVEN.**

## Z. Restore drill

Source: pre-mutation roles/schema/data dumps and complete Storage export. Target: isolated local Supabase environment with no Production webhooks or external side effects. The current pinned Supabase CLI restored roles, schema, Auth rows, public data, and Storage metadata. Counts matched Production, including 18 Auth identities and 118 Storage objects. All 118 media files were uploaded to the isolated target, downloaded again, and byte-verified.

An older CLI failed because its Auth schema lacked `custom_claims_allowlist`; this established the minimum toolchain requirement. Provider/Auth settings, redirect URLs, JWT/provider keys, Edge configuration, and secrets require separate controlled recovery.

- **DATABASE RESTORE — PASS**
- **MEDIA RESTORE — PASS**
- **AUTH/CONFIG RECOVERY — DOCUMENTED**

## AA. Recovery runbook

`docs/operations/DATABASE_AND_MEDIA_RECOVERY_RUNBOOK.md` documents clean bootstrap, immutable migration inspection, drift detection, pre-mutation backup, isolated database and media restore, verification, failed-migration response, forbidden repair actions, configuration dependencies, and escalation.

**RECOVERY RUNBOOK — PASS.**

## AB. Migration policy document

`docs/operations/PRODUCTION_MIGRATION_POLICY.md` makes forward-only history, no repair-for-alignment, clean bootstrap, immutable historical data operations, absence-safe cleanup, fixture rules, destructive review, and recovery expectations durable without oral history.

## AC. CI prevention

The database workflow pins Supabase CLI `2.116.0`. CI validates migration version uniqueness, canonical Production-applied migration presence, immutable historical-operation hashes, repository sanity, zero-data bootstrap, fixture hygiene, RLS/grants, canonical ACL fingerprint, DB lint, and SQL regression tests. It does not duplicate an alternate bootstrap path.

## AD. Production sanity tool

`scripts/ops/validate-production-gate1.sh` runs bounded, read-only checks through `scripts/ops/production-gate1-sanity.sql`. It checks ledger alignment, critical origins/orphans, fixture visibility, queue exceptions, canonical facts/N4/user intelligence, RLS boundaries, and active external-identity collisions. It currently exits non-zero exactly because of the Papiermühle collision.

## AE. Remediations performed

| File/change | Reason | Production impact | Applied/proof |
|---|---|---|---|
| restored `20260826220000` and `20260826221000` | recover exact applied history | none | byte-exact Git evidence |
| version correction to `20260827185823` | align applied identity | none | statement hash matched Production |
| `20260828192125_gate1_schema_convergence_v1.sql` | reconcile schema/ACL/RLS safely | schema only | deployed; post-push dry-run clean |
| `supabase/historical-data-operations.json` | classify immutable one-time data ops | none | hash-enforced in CI |
| CI bootstrap and ACL fingerprint | prevent recurrence | none | full clean boot PASS |
| Production sanity scripts | repeatable drift/integrity signal | read-only | expected P1 failure |
| recovery and migration runbooks | operational reproducibility | none | reviewed executable steps |
| PG17-safe taste-foundation test assertion | avoid backend crash while preserving denial proof | none | full DB suite PASS |

The Gate migration restores the legacy compatibility function with service-only execution, normalizes equivalent checks, recreates fixture-safe Admin views/policy effects, hardens runtime settings and deny-all tables, and corrects current-user consent policies. It changes no Product rows, ranking, or semantic corpus state.

## AF. Production mutations

**PRODUCTION MUTATIONS — 1 schema migration.**

- Applied `20260828192125_gate1_schema_convergence_v1`.
- Data rows inserted/updated/deleted: 0.
- Admin PR #105 migrations deployed: 0.
- Manual database fixes: 0.

## AG. Before / after integrity

| System | Before | After | Difference |
|---|---:|---:|---|
| Production Spots | 130 | 130 | 0 |
| Product-visible Spots | 124 | 124 | 0 |
| Archived fixture tombstones | 5 | 5 | 0 |
| Accepted Facts | 854 | 854 | 0 |
| N4 evidence / dimensions | 1,022 / 60 | 1,022 / 60 | 0 |
| Offering / Purpose active | 23 / 23 | 23 / 23 | 0 |
| User memory/evidence | 234 | 234 | 0 |
| Decision sessions | 651 | 651 | 0 |
| Moments | 25 | 25 | 0 |
| Reviews | 88 | 88 | 0 |
| Analytics | 1,770 | 1,770 | 0 |

Only schema, grants, policies, and compatibility objects changed. Queue state and all Product/history counts were preserved.

## AH. Unrelated truth preservation

The mutation contained no DML. Public schema/ACL converged to the canonical fingerprint; Product row counts and restore hashes remained unchanged. No real Spot intelligence, Gold row, N4 dimension/evidence, Offering/Purpose fact, User Intelligence event/card, Decision record, social content, ownership record, or analytics row was changed. Privacy was strengthened. Decision Engine code, ranking code, Gold semantics, Offering/Purpose semantics, and consumer Product eligibility semantics were not changed.

## AI. Regression results

- Fresh DB bootstrap: PASS.
- Migration uniqueness/presence/hash checks: PASS (90 versions).
- Canonical public schema/ACL: PASS; zero unexplained diff.
- DB lint and repository SQL suite: PASS.
- Production sanity: FAIL exactly on the one active Google Place collision; all preceding checks pass. A restored-snapshot run excluding only that assertion passed.
- Fixture Product visibility and learning exclusion: PASS.
- Human Spot Intelligence, Accepted Facts, Offering/Purpose, N4, User Intelligence, social, analytics, Owner/Admin structural checks: PASS.
- Decision Lab smoke: PASS.
- D2 acceptance framework: scientific/coverage checks PASS, but freeze validation reports `HASH_MISMATCH:engineSourceHash`, `HASH_MISMATCH:freezeManifestHash`, `ENGINE_MUTATION_DETECTED`.
- D2.2 treatment freeze: PASS.
- D3.1 preflight: FAIL on the inherited parent freeze/engine identity mismatch.
- D3-A validation: PASS.
- Full `decision-lab:test`: 316 tests, 314 passed, two failed. Failures 24 and 42 both match the same freeze/engine identity mismatch. This predates and is unrelated to Gate-1 DB changes and was not bypassed.

## AJ. Admin PR #105 handoff

**GATE-1 BASELINE FOR ADMIN — NOT_READY** while Gate 1 remains failed.

When the three P1 blockers are resolved, PR #105 must rebase onto the final Gate-1 commit, re-version its un-applied `20260828170059` and `20260828173349` migrations after tip `20260828192125`, and rerun migration CI, zero-data bootstrap, schema/ACL comparison, Admin authorization, Product-universe fixture exclusions, and the read-only Production sanity suite. It must not use retained fixture history as Product inventory.

## AK. Gate 2 handoff

- Active Product Spots: 124 approved; one archived LEGACY; five archived FIXTURE tombstones.
- Obvious identity blocker: the active Basler Papiermühle Google Place collision.
- Critical media blockers: three missing approved-Spot authoritative headers (Crescenda, LORA, VITO Gundeli).
- Invalid coordinates, blank names, missing category references: 0.
- N4 dimensions: 60; taxonomy/reference integrity and recorded hours references are structurally intact.

These are read-only facts. No corpus improvement was performed.

## AL. Remaining technical debt

**P0:** none.

**P1:**

1. Founder-approved canonical resolution for the two active Papiermühle Spot identities, including explicit lineage migration/retention and archive choice.
2. Founder/content-authorized replacement of the three authoritative header files, or explicit decision to clear/downgrade those references.
3. Durable ongoing backup: authorize a provider plan/retention level and a secure off-provider scheduled Storage export with owner, monitoring, restore cadence, and retention.

**P2:** repair or intentionally re-certify the Decision Lab D2/D3.1 parent freeze after reviewing the engine-source change; do not merely update hashes.

**P3:** review and either restore or retire one stale optional legacy Review object and five optional gallery references.

**DEFERRED_INFRA:** provider/PITR tier, off-provider encrypted destination, scheduled media exporter, key custody, and recurring restore drill.

**LEGITIMATE_HISTORICAL_EXCEPTION:** five archived Fixture Spot tombstones and their enumerated attributable raw history; one archived Tierpark duplicate; one historical research failure; two historical safety-image dead letters.

## AM. Final gate verdicts

```text
GO-LIVE GATE 1 — FAIL

PRODUCTION TRUTH — NOT_TRUSTWORTHY
DATABASE INTEGRITY — FAIL
CANONICAL DATABASE BOOT — PASS
FRESH BOOT MANUAL INTERVENTION — 0
MIGRATION REPAIR REQUIRED — NO

KNOWN FIXTURE CLEANUP BOOT FAILURE — RESOLVED
ROOT CAUSE — two immutable Production-only historical data operations assumed exact pre-existing fixture/Spot rows; zero-data bootstrap now hash-verifies and excludes only those operations, with durable schema effects supplied by a forward migration

REPOSITORY ↔ PRODUCTION MIGRATION LEDGER — ALIGNED
MISSING PRODUCTION MIGRATIONS LOCALLY — 0
UNEXPLAINED MIGRATION HASH DIVERGENCE — 0
DUPLICATE MIGRATION VERSIONS — 0
UNEXPECTED PENDING MIGRATIONS — 0

SCHEMA DRIFT — 0 UNEXPLAINED
CRITICAL FK ORPHANS — 0
CRITICAL SEMANTIC ORPHANS — 1
UNKNOWN CRITICAL DATA_ORIGIN — 0

PRODUCT-VISIBLE TEST/FIXTURE SPOTS — 0
DECISION-VISIBLE TEST/FIXTURE SPOTS — 0
LEARNING-CONSUMABLE TEST/FIXTURE DATA — 0
LEGITIMATE HISTORICAL FIXTURE TOMBSTONES — 5

ACCEPTED FACT INTEGRITY — PASS
PROVENANCE INTEGRITY — PASS
N4 STRUCTURAL INTEGRITY — PASS
N4 DIMENSIONS — 60
OFFERING/PURPOSE INTEGRITY — PASS
USER INTELLIGENCE STRUCTURAL INTEGRITY — PASS
DECISION HISTORY STRUCTURAL INTEGRITY — PASS
SOCIAL DATA STRUCTURAL INTEGRITY — PASS
ANALYTICS HISTORY STRUCTURAL INTEGRITY — PASS

REQUIRED QUEUES HEALTHY — YES
UNEXPLAINED FAILED JOBS — 0
UNEXPLAINED STUCK JOBS — 0

RLS STRUCTURAL INTEGRITY — PASS
ADMIN PRIVILEGE BOUNDARY — PASS
OWNER PRIVILEGE BOUNDARY — PASS

BACKUP STRATEGY — NOT_PROVEN
DATABASE RESTORE — PASS
MEDIA RECOVERY — PASS
RECOVERY RUNBOOK — PASS

CLEAN BOOT CI — PASS
MIGRATION INTEGRITY CI — PASS
PRODUCTION SANITY SUITE — FAIL

REAL PRODUCT HISTORY DELETED — NO
RAW ANALYTICS HISTORY REWRITTEN — NO
USER CARDS GLOBALLY REBUILT — NO
N2 REINTERPRETED — NO
DECISION ENGINE CHANGED — NO
RANKING CHANGED — NO
GOLD SEMANTICS CHANGED — NO
OFFERING/PURPOSE SEMANTICS CHANGED — NO
CONSUMER PRODUCT SEMANTICS CHANGED — NO

PRODUCTION MUTATIONS — 1 additive/authorization schema migration; 0 data rows
MIGRATION REPAIR — NO

GATE-1 P0 REMAINING — 0
GATE-1 P1 REMAINING — 3

ADMIN PR #105 REVALIDATION BASELINE — NOT_READY
READY TO START GO-LIVE GATE 2 — NO
```

## AN. Final north-star questions

- Can a senior engineer clone the canonical repository and build the database from zero without Philipp explaining hidden steps? **YES.**
- Does Production match the canonical migration history? **YES.**
- Do we know why every retained test/fixture identity still exists? **YES.**
- Can test/fixture history affect normal Product behavior? **NO.**
- Are canonical truth systems structurally consistent? **NO**, because the active external Spot identity is ambiguous.
- Can we detect database integrity drift before a future release? **YES.**
- Do we have a proven way to recover the Production database? **YES** for the drilled snapshot; **NO** for an ongoing retained backup source.
- Would the Principal Readiness Engineer trust this data foundation with real external test users? **NO**, not until the three P1 decisions are implemented and revalidated.

Gate 2, corpus improvement, Decision tuning, deep Security Gate 5, and Performance Gate 7 were not started.
