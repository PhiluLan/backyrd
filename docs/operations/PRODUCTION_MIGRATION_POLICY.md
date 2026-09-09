# Production migration policy

## Invariants

- `supabase/migrations/` is the authoritative Production ledger source.
- A migration recorded in Production is immutable. Never rename, rewrite, delete,
  reorder, or repair it merely to make tools agree.
- Schema evolution must bootstrap deterministically from zero without Production
  data, secrets, network access, or manual state injection.
- New changes are forward migrations created with the Supabase CLI. Breaking or
  destructive work requires an explicit impact review, backup, rollback or
  forward-recovery plan, and Founder authorization where Product truth can change.
- RLS, grants, provenance, audit history, and canonical semantics may not be
  weakened to make a migration pass.

## Historical Production data operations

A migration may be classified as a historical Production data operation only
when it targets an exact, previously audited Production state and necessarily
contains identity, provenance, dependency, or row-count guards. Classification
is recorded in `supabase/historical-data-operations.json` with its immutable
SHA-256 and a later schema-reconciliation migration.

These operations remain in `supabase/migrations/` so the Production ledger stays
complete. The zero-data bootstrap excludes only the manifest entries after
`validate-migrations.sh` proves their bytes are unchanged and their schema
effects are restated by a later forward migration. This is automatic; no human
edits, fixture injection, or migration repair occurs during bootstrap.

Do not use this classification for ordinary backfills. New data changes must be
idempotent, absence-safe, provenance-safe, bounded, observable, and safe when
replayed from zero. Keep one-time cleanup separate from unrelated schema work.

## Review and deployment

Every database pull request must pass:

1. filename and version uniqueness;
2. immutable historical-operation hash validation;
3. clean zero-data bootstrap of the exact candidate and migration-order comparison;
4. canonical Auth hook, Storage, Realtime, cron, webhook, RLS, and grant checks;
5. domain acceptance tests and reviewed DB-lint baseline;
6. changed SQL acceptance evidence for every forward migration; Auth/RLS/Storage
   changes must carry both `backyrd:authorization-positive` and
   `backyrd:authorization-negative` test markers;
7. an automatic hard stop for `DELETE`, `TRUNCATE`, unsafe `DROP`, identity
   rewrites, history rewrites, or unbounded backfills until the separate
   destructive-operation authorization and recovery plan exist.

Before Production application, compute the complete ledger range from
`delivery/production-state.json` to the selected canonical Main candidate,
compare that plan with Production's remote dry run, take and verify a database
plus Storage backup when the change risk requires it,
rehearse the exact forward migration on a restored snapshot, and record the
operator, time, migration, pre/post counts, and outcome. Never use migration
repair as a deployment shortcut. On failure, stop, preserve logs and database
state, determine whether the transaction rolled back, and recover forward from
evidence.

The canonical baseline is a `pg_dump`-style snapshot. PostgreSQL dumps encode
ACL differences from standard defaults, while Supabase local configures broad
`anon`/`authenticated` defaults. CI therefore applies the baseline phase with
those provider defaults neutralized, restores the Supabase defaults, and then
applies forward-authored migrations. The resulting effective Public ACL must
match the current semantic schema and ACL fingerprints. A changed hash is not
itself a security verdict: the
migration diff, risk classification, positive/negative SQL behavior and remote
deployment plan determine whether the change is safe. Historical Gate 5/6/7
reconstruction remains audit evidence and is not a new migration's admission
contract.

## Deterministic database evidence

`delivery/database-baseline.json` anchors the current independently reproduced
schema and ACL. A forward migration adds one generated record under
`delivery/database-releases/`; `generate-database-release.mjs` derives its
migration/test set and byte hashes from the staged candidate and a disposable
clean-boot snapshot. CI then reproduces the snapshot and verifies the record's
chain, exact source bytes and behavior tests. An ACL change additionally requires
both positive and negative authorization tests even if the SQL spelling evades a
path or keyword heuristic. No developer or Founder manually approves a computed
hash.
