# Booking backup coverage and isolated logical restore

The previous weekly exporter selected schema `public` and data
`public,auth,storage`. It omitted private Booking capabilities, request journals,
allocation memberships, team invitations and dispatch evidence, as well as other
application schemas. A clean migration build cannot recover those guest facts.
This dependent candidate corrects the actual exporter and exercises a real
export/restore with synthetic data in two independent local Supabase projects.
It has not changed the scheduled Main job or any Production data yet.

## Snapshot v2

The existing Main-only, OIDC, separate-account, private KMS bucket, versioning,
30-day lifecycle and encrypted-upload checks remain unchanged. The weekly database
part delegates to `scripts/ops/export-database-snapshot.sh`, using the workflow's
existing pinned CLI 2.116.0. The helper requires an explicit linked/local target;
local mode additionally requires a disposable fixture and refuses a Production
project reference. It refuses an existing output directory or unexpected CLI.

The helper exports roles, every non-platform application schema and all default
application/Auth/Storage data. There is no application-schema allowlist to forget
when a new private schema is added. CLI platform exclusions remain intentional.
The Supabase migration schema and its data are exported separately because the
CLI excludes that ledger by default. The source catalog supplies the physical private-table inventory. A private
function-only schema is valid; each installed physical table, including an empty
one, needs its own COPY section. The schema must be declared, not merely mentioned
in a public function. Missing expected schema/data sections or migration history
prevent a completed snapshot. The independent Main-compatible exporter is PR #576. Files use mode 0600 in private
directories; a per-file SHA-256 manifest supplements the existing whole-archive
checksum and KMS protection. Dumps, credentials and decryption keys never belong
in Git, reports or browser code.

Provider-schema exclusions also omit app-owned hooks and Storage policies. A
single read-only catalog SELECT (`backup-managed-controls.sql`) therefore captures
the actually installed app Auth triggers, Storage RLS/policies and Realtime table
membership, rather than inferring them from an older canonical file. The tested
candidate has 26 captured rules, including three event-image policies introduced
by a later migration. Disabled object/bucket RLS stops completion for review.
The archive additionally preserves five canonical configuration files as
references. Cron and webhook definitions are **reference-only** and are never
automatically activated by this drill. Provider-managed schemas must first be
bootstrapped by a compatible Supabase runtime; the snapshot does not replace that
bootstrap or export provider secrets/configuration.

PR delivery checks and the scheduled Main workflow run the export-contract tests
before export/AWS configuration. The production outer manifest advances to v2;
Storage-byte export and the existing S3 encryption verification remain in place.
Daily Storage-only runs remain distinct from weekly logical database exports.

Existing v1 archives retain their historical format and are not rewritten. Their
missing private data/managed controls cannot be certified as complete Booking
recovery by the v2 harness; generate and validate a new complete snapshot. No
archive consumer in this repository silently upgrades an old backup.

## Reproducing the isolated drill

Only use fresh disposable projects and synthetic fixtures. Never use Volta guest
data or point the harness at a linked or Production project. The harness refuses
remote DB hosts, the same source/target port, and a restore target that already
has Booking schema, Auth users or Storage buckets/objects. The environment flag
is an operator guard, not permission for a real recovery operation.

1. Build the candidate using `validate-supabase-current.sh`, selecting all 27
   Booking SQL suites and keeping that disposable source for the drill. Use the
   canonical pinned database runtime, not the developer's normal checkout.
2. Start a second empty local Supabase project with unique project id and ports,
   the same provider schema/runtime, seed disabled and no application migrations.
   Do not enable external workers, Edge delivery, outbound webhook targets or
   app intake. Prepare only provider-managed Auth/Storage tables.
3. Set `BACKYRD_BACKUP_EPHEMERAL=1`, `BACKYRD_RESTORE_SOURCE_DB_URL`,
   `BACKYRD_RESTORE_TARGET_DB_URL` and `BACKYRD_RESTORE_ARTIFACTS` to a new protected
   directory outside Git. Run `node scripts/ops/validate-booking-restore.mjs seed`
   once on the empty source booking configuration. It applies the guarded fixture
   and creates namespaced synthetic verified staff, Viewer/Host/Manager roles,
   manual/online reservations, stored guest access and an idempotent manual intent.
   Database passwords use libpq environment fields, not command arguments.
4. Run `node scripts/ops/validate-booking-restore.mjs prepare`.
   It stops this source's local cron jobs, creates genuinely sealed provider
   bytes and records a begun attempt without contacting a provider. Keys remain
   separate from the backup. Do not rerun preparation as a fresh send.
5. Run the same export helper with explicit local mode, the source's workdir and
   the backup CLI 2.116.0; output to `$BACKYRD_RESTORE_ARTIFACTS/database`. The
   source used for this acceptance was quiesced. Separate CLI schema/data/control
   exports are not one global snapshot: coordinate DDL and verify ledger/control
   consistency before treating a real changing-system backup as recoverable.
6. Run `node scripts/ops/validate-booking-restore.mjs restore`. It checks and
   caches all manifest-covered input bytes before executing SQL. Roles are
   restored administratively; app objects are created as `postgres` with provider
   public default grants temporarily revoked. Managed Storage/Auth data is loaded
   with the administrative identity. Restore schema, migration schema, data,
   ledger and captured app-owned managed controls in one transaction with
   replication triggers disabled. Do not run canonical cron/webhook references.
7. Compare source/target row digests, original request result, both structural/ACL
   fingerprints, captured managed controls, stored guest receipt and private
   authorization. The provider-owned `storage.migrations.executed_at` timestamp
   is normalized; its migration id/name/hash remain compared. No application,
   guest, journal, audit, payload or ordinary timestamp is normalized.
8. The local quarantine fixture parks pending/leased/sending messages for manual
   review, clears leases, retains immutable payload/recipient/provider evidence
   and records a system audit per affected reservation. Repeating it adds no
   audit duplicate. Actual SQL claim must return no message. **Keep all apps,
   intake and workers paused**: parking old rows alone does not prevent new
   requests, reconstruct lost post-backup writes or reconcile external delivery.
9. Run all 27 Booking SQL suites and private-scope verification against the
   restored target, then the existing review-media authorization suite. Keep the
   synthetic fixture emails namespaced to avoid collisions with suite fixtures.
   Stop both projects, remove their volumes and delete protected dumps/keys.

`verify-restored` resumes verification of an already committed local restore; it
does not repeat the restore transaction. `capture-controls` only augments an
unchanged recorded local source after checking all row/schema observations; it
cannot replace a source whose rows or schema changed. These diagnostic modes do
not authorize reseeding or overriding failed recovery evidence.

## Verified evidence and remaining boundary

- The actual final restore matched 384 table row digests across application
  schemas, Auth, Storage and migration ledger, both application/private schema
  fingerprints and the captured Auth/Storage/Realtime controls.
- An original manual nonce recovers its original result; stored guest access
  still authorizes its receipt. The in-flight payload has the same digest and
  content under the separately provided key; a different key fails. No provider
  request occurred. Queue claims are blocked after audited quarantine.
- A deliberately corrupted backup file was refused before restoration.
- All 27 Booking SQL suites passed on the restored database, as did the existing
  review-media authorization suite and private-scope comparison (879 facts,
  `1388671eb836983a5270288a01606491fe939fc7de7d38a9d501d842e718e974`).
- Backup/workflow contract tests and the existing delivery-policy tests passed.
  These include orchestration with an isolated CLI stub, unexpected CLI, unsafe
  target/reference, pre-existing output, missing Booking sections, invalid Storage
  protection and restrictive output permissions. Actual export uses CLI 2.116.0;
  source and target provider projects use canonical CLI 2.80.0 / PostgreSQL
  `17.6.1.095`. This does not certify a different Production provider version.

Initial attempts usefully failed on managed Storage write privilege, provider
migration execution timestamps, missing app Auth hook and incomplete canonical
Storage policy coverage. Those are fixed in the recipe, not waived. One SQL-test
attempt collided with generic synthetic staff addresses; the corpus now prefixes
its addresses. Exact row equality was measured before that test-isolation change.

The new helper has not run against Production or S3. A current encrypted cloud
archive has not been downloaded/revalidated, Storage object bytes have not been
restored, RPO/restore time for a real dataset has not been measured, provider/JWT/
SMTP/widget/scheduler secrets are separate, and post-backup writes plus external
mail outcomes still need incident-specific reconciliation. The local queue fixture
is not a Production incident command. A real restore requires a separately
reviewed target, approval, full lifecycle/ACL/media checks and a controlled
reopening decision. No new production activation, app release, real guest message
or practical Aleno-parity claim follows from this local acceptance.
