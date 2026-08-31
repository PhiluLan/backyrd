# Canonical Product Mood V1 — Migration Evidence

Status: release-candidate validation and read-only Production dry-run complete; Production mutation, canary and Founder physical acceptance not performed.

## Before snapshot

Read-only Phase 1 Production baseline on 2026-08-31:

| Measure | Before |
| --- | ---: |
| Reviews | 88 |
| Reviews with 0 / 1 / 2 non-empty Mood slots | 9 / 2 / 77 |
| Non-empty raw Mood slots | 156 |
| Legacy `mood_tokens` | 118 |
| Legacy concepts / clusters / Spot mappings | 16 / 11 / 161 |
| `spot_moods` / `spot_moods_agg` | 54 / 107 |

Observed evidence includes canonical terms (`gemütlich` 17, `urban` 10), known aliases (`lebhaft` 5, `cozy` 4), invalid placeholders (`a` 7, `b` 5, `test` 3), non-Moods (`cocktails` 3) and legitimate terms outside the former fixed vocabulary (`chic`, `trendy`).

## Deterministic classification contract

The migration does not estimate or silently discard values. Every non-empty slot becomes exactly one of:

- `CANONICAL`: canonical-label exact match (`resolution_kind=EXACT`);
- `KNOWN_ALIAS`: approved spelling/language/legacy alias (`ALIAS`);
- `VALID_NEW_CONCEPT`: only after audited Admin `CREATE_CONCEPT` approval;
- `INVALID`: blocked non-Mood, test, abuse/unsafe input or duplicate resolved slot;
- `UNRESOLVED`: preserved candidate pending governance.

Known examples dry-run as: `gemütlich → mood.cozy`, `cozy → mood.cozy`, `lebhaft → mood.lively`, `a/b/test → INVALID`, `cocktails → INVALID`. Unknown expressions remain `UNRESOLVED`.

The read-only Production dry-run on 2026-08-31 produced:

| Measure | Expected after migration |
| --- | ---: |
| Canonical exact / alias slots | 43 / 28 |
| Invalid / unresolved slots | 57 / 28 |
| Duplicate canonical second slots excluded | 1 |
| Current unique-user contributions | 19 |
| Profile Spots / profile rows | 17 / 25 |
| Early / established Profile Spots | 16 / 1 |
| Canonical concepts used by current contributions | 11 |
| Review rows rewritten / deleted | 0 / 0 |

These are pre-mutation expectations and must be rechecked immediately before applying the migration.

## Local reconciliation evidence

- Full migration executed successfully inside a disposable transaction and rolled back.
- Initial registry: 22 canonical concepts, 63 aliases, 6 clusters, 51 known blocked expressions.
- Historical Review columns are read but never updated by reconciliation.
- Rebuild source is only actual resolved Review expression evidence; legacy 161 Spot mappings produce zero community votes.
- Alias duplicates in A/B become one concept vote.
- One user with multiple Reviews contributes only the latest eligible Mood-bearing perception.
- A newer Mood-empty Review preserves the prior current perception.
- Removed Review evidence exits the profile; restoration returns it.
- 3 contributors with two Moods each still produce denominator 3.
- Low samples are `EARLY`; public percentage/count are masked.
- Rebuilding identical source state reproduces identical profile values/rank.

## Verification results

| Gate | Result |
| --- | --- |
| Canonical SQL contract test | PASS |
| Web TypeScript | PASS |
| Mobile TypeScript | PASS |
| Admin TypeScript | PASS |
| Static Mobile/Web/backend drift guard | PASS |
| Focused canonical Mood → Decision regressions | PASS |
| D2.1 v6 / D2.2 / D3.1 re-certification | PASS; new Production bundle identity still pending deployment evidence |
| Full Decision Lab | PASS — 318/318 after canonical adapter binding |
| D2 protected-scope guard | Authorized fixture PASS; one-byte Mood module drift FAIL |
| Canonical clean bootstrap | PASS — immutable historical Production data operations excluded only through the hash-verified canonical bootstrap contract; all Mood SQL, ACL/IDOR, moderation and DB-lint checks passed |
| Generic D3.1 `supabase db reset` | BLOCKED before Mood migration by pre-existing `20260826120000_production_decision_fixture_cleanup_v1.sql` fixture identity/provenance mismatch; not repaired or bypassed |
| Production migration/canary | NOT RUN |
| Founder physical Mobile/Web/Admin acceptance | NOT RUN |
| Security CTO adversarial acceptance | NOT RUN |

## Production ledger preflight

The linked Production ledger contains nine already-applied Spot-Engine migrations under their original Production timestamps, while canonical `main` contains the same migration names under later timestamps. Canonical `main` also contains the newer, unapplied non-Mood migration `20260831044934_fail_closed_operational_revalidation_invalid_fact_v1.sql` before the Mood migration. Consequently, a normal `supabase db push` cannot currently apply **only** Mood V1 without either replaying already-applied non-Mood migrations or changing migration history. Neither migration repair nor historical migration rewriting is authorized by this release.

Production database mutation therefore remains fail-closed until the canonical ledger is reconciled by its owning database workstream. No Production mutation was attempted.

The read-only canary runner is prepared at `scripts/ops/canonical-mood-decision-canary.mjs`. It requires 1–20 explicit Spot IDs and a literal read-only acknowledgement, emits no contributor identity, performs no mutation and fails on low-evidence signals, out-of-range signal values or canonical query drift.

## Required Production canary evidence

Before cutover, record current counts and classification totals, then compare raw literal counts, both legacy aggregates and the canonical profile for representative high-volume, alias-heavy, invalid, one-contributor, zero-Mood, repeat-review and cross-category Spots. Required canary outcomes remain: unsupported mapping 0, duplicate-user amplification 0, invalid contribution 0, Mobile/Web semantic mismatch 0, Review history loss 0. Stop cutover on systematic semantic error; do not patch individual Spots.
