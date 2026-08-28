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
3. clean zero-data bootstrap and migration-order comparison;
4. canonical Auth hook, Storage, Realtime, cron, webhook, RLS, and grant checks;
5. domain acceptance tests and reviewed DB-lint baseline;
6. destructive SQL review for `DELETE`, `TRUNCATE`, unsafe `DROP`, identity
   rewrites, history rewrites, or unbounded backfills.

Before Production application, compare the repository ledger with Production,
list every pending migration, take and verify a database plus Storage backup,
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
match `supabase/canonical/public-acl.sha256`; changing that fingerprint requires
an explicit privilege review.
