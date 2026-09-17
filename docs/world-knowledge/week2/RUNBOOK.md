# Week 2 World Basis Runbook

## Safety state

All commands in this runbook are local or source-only. They must not receive Production credentials. The generated release plan always has `executionAuthorized:false`.

## Build the immutable plan

```sh
npm run world-knowledge:week2:plan
```

The command must report exactly nine migrations, no Functions, no Auth deployment, `WORLD_PRODUCT_READ=false`, and an engaged kill switch.

## Validate contracts

```sh
npm run world-knowledge:week2:test
npm run world-knowledge:test
```

The first command covers migration identity, PostgreSQL-17 compatibility, OFF/ON behavior, kill-switch behavior, Registry/Policy/Snapshot tampering, zero OFF-side-effects and deterministic cohort minimization.

## Disposable prod-like rehearsal

```sh
npm run world-knowledge:week2:rehearsal
```

The script creates a temporary Supabase project with a random local port range and refuses the Production project reference. It performs canonical clean boot, 1,000 synthetic Spots, the nine World migrations individually, all six World SQL suites, three rebuild concurrency cases, replay `NO_OP`, a PostgreSQL-17 logical World-ledger backup/restore, and catalog-level RLS/grant/function checks.

The temporary project and backup are removed on exit. Production is never contacted.

## Reader controls

Default and safe state:

```text
WORLD_PRODUCT_READ=false
WORLD_PRODUCT_READ_KILL_SWITCH=ENGAGED
```

Only a local/prod-like test may opt in:

```text
WORLD_PRODUCT_READ=true
WORLD_PRODUCT_READ_KILL_SWITCH=DISENGAGED
WORLD_PRODUCT_READ_ENVIRONMENT=PROD_LIKE_TEST
```

Any missing or unknown value is OFF. Re-engaging the kill switch blocks the loader before a connection can be opened. There is no Production environment value in the accepted contract.

## Recovery

- Require a new explicit release authority and verified full backup before any future Production apply.
- Stop on any migration, plan, Registry, Source Policy, snapshot, RLS, grant, or function hash mismatch.
- Never roll back append-only ledgers with ad-hoc deletes or down migrations.
- Disable product read and engage the kill switch first.
- Restore the pre-apply backup into an isolated environment and verify ledger/snapshot hashes before any separately approved recovery.
- Historical migrations remain immutable; corrections are forward-only.

## Source-aware plan

The repository deployment planner may list the nine pending migrations. That is inventory, not execution authority. It must continue to report no Function deployment, no Auth change, and `executionAuthorized:false`. No `supabase db push`, deploy command, Production query, or remote link is part of this runbook.
