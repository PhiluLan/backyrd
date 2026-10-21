# Database and media recovery runbook

## Recovery boundary

The Backyrd Supabase project was verified on 2026-09-04 as a Pro project with
daily provider database backups retained for seven days. Point-in-time recovery
is not enabled. A Supabase logical database dump
contains database-resident Auth users and Storage metadata, but not Storage
object bytes, Auth provider/JWT configuration, Edge Functions, project secrets,
or external-provider configuration. Those are separate recovery dependencies.

The verified database RPO is therefore at most 24 hours; do not claim PITR.
Continue taking a protected logical database dump and separate Storage export
before a high-risk Production mutation. Founder/CTO approved the durable AWS S3
contract on 2026-09-05: a private KMS-encrypted bucket in a separate account,
daily Storage export, weekly logical database export, 30-day retention and a
quarterly isolated restore drill owned by Philipp. A database backup alone does
not recover user-media bytes.

The canonical infrastructure contract is
`infrastructure/aws/production-backup.yaml`; the canonical scheduled control is
`.github/workflows/production-backup.yml`. GitHub uses short-lived OIDC
credentials restricted to canonical `main`. Static AWS credentials are not
part of the contract. The workflow must fail before export if account identity,
public-access block, KMS key, versioning or 30-day lifecycle differs.

## Backup

Use the repository-pinned Supabase CLI version. Work from a linked checkout and
an operator machine with full-disk encryption. Never pass credentials on the
command line, write them to the repository, or include them in reports.

1. Create a new timestamped directory outside the repository with mode `0700`.
2. Record project reference, UTC time, Git commit, Production migration tip, and
   CLI version without recording credentials.
3. Export via `scripts/ops/export-database-snapshot.sh` with an explicit linked target and the backup-workflow CLI pin. Snapshot v2 includes all non-platform application/private schemas and data, separate migration history, actually installed app-owned Auth/Storage/Realtime controls, canonical reference configuration and file checksums. A source with private helper functions but no private tables is valid; every installed private table requires a data section. Do not narrow application scope to `public` or omit private journals/capabilities. See [independent backup export](BOOKING_BACKUP_EXPORT.md) and [Booking recovery](BOOKING_BACKUP_RECOVERY.md).
4. Export every Storage bucket recursively with `supabase storage cp --linked`.
5. Record file counts, byte counts, and SHA-256 manifests. Restrict dump,
   manifest, and log files to mode `0600`.
6. Confirm the database dump and Storage object counts match the same bounded
   forensic snapshot. Preserve the snapshot immutably in the approved backup
   destination.

The AWS stack outputs are bound to the GitHub Actions variables
`AWS_BACKUP_ACCOUNT_ID`, `AWS_BACKUP_BUCKET`, `AWS_BACKUP_KMS_KEY_ARN`,
`AWS_BACKUP_REGION` and `AWS_BACKUP_ROLE_ARN`. `SUPABASE_ACCESS_TOKEN` remains a
GitHub secret. Never place their values in Mobile/Web code, Git, reports or
workflow output. Failed scheduled backups create or update the repository issue
`Production backup failed`, owned operationally by Philipp.

The 2026-08-28 Gate-1 drill produced a 49,368,930-byte logical database backup
and a 118-object, 118,472,337-byte Storage export. These temporary local drill
artifacts are not the durable launch backup destination.

## Isolated database restore drill

1. Create a new local Supabase project with a unique project id and ports.
2. Use the current pinned CLI/runtime and PostgreSQL major version 17. A restore
   with CLI 2.98.2 failed because its local Auth schema lacked the Production
   `custom_claims_allowlist` column; CLI 2.116.0 restored successfully.
3. Disable outbound and Product-like services: Edge Functions, webhooks, cron
   targets, Realtime, Auth delivery, email/SMS, push, and external workers.
4. For v2, verify all file checksums first. Restore roles, app schema, migration schema, data, migration ledger and captured managed controls in one transaction with
   `ON_ERROR_STOP=1` and `session_replication_role=replica`, following the
   official Supabase logical-restore order.
5. Before restoring a `pg_dump` schema, temporarily revoke the Supabase-added
   Public-schema default privileges for `anon`, `authenticated`, and
   `service_role` from the creating `postgres` role. The dump's ACL section is
   relative to PostgreSQL standard defaults; leaving provider defaults active
   silently adds privileges that were absent in Production. The schema dump
   restores the Production `postgres` defaults at its end. Verify the effective
   ACL fingerprint after restore.
6. Verify representative snapshot counts, FK integrity, canonical dimensions,
   Accepted Facts, User Intelligence, Decision history, Auth users, Storage
   metadata, policies, functions, and grants.
7. Apply pending Gate-1 migrations to the restored copy first and prove that
   critical row counts and semantic checks remain unchanged.

The Gate-1 restore matched the captured snapshot exactly for 130 Spots, 854
Accepted Facts, 60 N4 dimensions, 1,022 N4 evidence rows, 234 Memory events, 50
User Intelligence snapshots, 651 Decision sessions, 1,110 impressions, 762
actions, 88 Reviews, 1,770 Analytics events, 18 Auth users, and 118 Storage
metadata rows.

On 1 January, April, July and October, the repository creates one tracked
restore-drill task. Restore the latest weekly database export and the latest
daily Storage export into an isolated, non-delivering environment and attach
the invariant/object-manifest evidence to that task. A checksum-only download
is not a restore drill.

## Isolated media restore drill

Create a second isolated local Storage target with the seven canonical buckets.
Upload the exported objects, download them again, and compare normalized
path-plus-SHA-256 manifests. The Gate-1 drill restored and re-read all 118 files
byte-for-byte.

Historical Badge objects are larger than the bucket's current 2 MiB upload
limit, and some historical media MIME types do not satisfy today's allowlist.
For recovery only, temporarily relax size/MIME constraints in the isolated
target, restore and verify the bytes, then restore the exact canonical bucket
configuration before the target can serve traffic. Never relax Production
bucket controls as an unreviewed shortcut.

## Production recovery and failed migrations

Never restore over Production during a drill. During a real incident, freeze
writes, preserve evidence, select the Founder-approved recovery point, restore
into a new isolated project first, validate it, then perform a separately
authorized cutover. Rotate all secrets and review Auth provider, redirect,
webhook, cron, Realtime, Edge Function, and external-provider configuration.

If a Production migration fails, do not repair the ledger reflexively. Capture
the exact error and ledger state, confirm transaction rollback, compare the
applied schema with the expected pre-state, and create a reviewed forward fix.
Escalate any ambiguous partial application, destructive recovery, identity
merge, Product-truth rewrite, or history rewrite to the Founder.

## Independent export coverage correction

The v2 exporter is isolated from the pending Booking feature chain. It preserves the existing approved AWS/Main/OIDC/retention/encryption boundary and includes schema-derived private table inventory, original migration history and actually installed managed controls. The full later-candidate synthetic logical restore is separate evidence in PR #575, not a dependency or proof that a current cloud archive is restorable. Keep cron/webhooks, apps/intake and external workers disabled during recovery until target compatibility and lost/external operations are reconciled. See [export scope and limits](BOOKING_BACKUP_EXPORT.md).

## Booking-dependent recovery candidate

The isolated candidate restore now compares 384 application/Auth/Storage/ledger table digests, both structural/ACL scopes and 26 captured app-owned Auth/Storage/Realtime rules. It verifies stored guest access, original request recovery, external-key-dependent immutable payloads and audited quarantine of restored sends, then runs all 27 Booking SQL suites plus media authorization on the restored target. This is local synthetic logical-restore evidence, not acceptance of an actual cloud archive, Storage bytes, Production dataset/provider version or automatic dispatch resumption. Keep apps/intake/workers closed until post-backup writes and external outcomes are reconciled. Full procedure and limitations: [Booking backup and recovery](BOOKING_BACKUP_RECOVERY.md).
