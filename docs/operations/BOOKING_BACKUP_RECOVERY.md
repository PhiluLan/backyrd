# Booking backup coverage and isolated logical restore

The previous weekly exporter selected schema `public` and data
`public,auth,storage`. It omitted private Booking capabilities, request journals,
allocation memberships, team invitations and dispatch evidence, as well as other
application schemas. A clean migration build cannot recover those guest facts.
The independent exporter correction in PR #576 is now merged into Main.
The dependent acceptance harness exercises a real export/restore with synthetic
data in two independent local Supabase projects. This does not certify an
actual scheduled cloud run or change Production data.

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

1. Build the candidate using `validate-supabase-current.sh`, selecting all current
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
   It also creates three populated guest cards through the actual operator-bound
   RPC: corrected, archived and restored, with seven request receipts and seven
   metadata events. Four additional bookings are created through `booking_console_create_v3`: current, corrected, detached and subsequently archived associations. Six original association receipts and six metadata events are populated through the real actor-bound RPCs.
   One pacing policy is created, lowered, saved as a no-op, disabled and re-enabled through the actual Owner/Manager RPC, with five original receipts and four policy audit events. A second synthetic physical table makes post-restore quota rejection independent of table overlap.
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
7. Compare source/target row digests, original request results, both structural/ACL
   fingerprints, captured managed controls, stored guest receipt and private
   authorization. The provider-owned `storage.migrations.executed_at` timestamp
   is normalized; its migration id/name/hash remain compared. No application,
   guest, journal, audit, payload or ordinary timestamp is normalized. The
   rolled-back `verify-restored-guest-cards.sql` probe compares current cards,
   archive membership, metadata history and original actor-bound request replay
   after later correction. Actual Viewer/Host/Manager/outsider/worker/anonymous
   checks, stale revisions, fresh correction/unarchive, revoked Host and new
   Owner fences run against the source and restored target. Actual returned JSON
   must also pass the Web codecs. `verify-restored-guest-history.sql` separately verifies all four association states, original create/correction/detach receipts, actual raw-role denials, stale link/booking revisions, fresh reattachment, Safety/revoked staff and new-Owner fences. All saved public booking facts are compared before/after; no probe mutation is committed. The arrival-policy probe additionally verifies current limits, original request results after later edits/disable, actual quota enforcement and fresh authorized writes. Only its volatile read-observation time is excluded from behavioral equality; SQL checks the real query clock. No stored timestamp is normalized.
8. The local quarantine fixture parks pending/leased/sending messages for manual
   review, clears leases, retains immutable payload/recipient/provider evidence
   and records a system audit per affected reservation. Repeating it adds no
   audit duplicate. Actual SQL claim must return no message. **Keep all apps,
   intake and workers paused**: parking old rows alone does not prevent new
   requests, reconstruct lost post-backup writes or reconcile external delivery.
9. Run all current Booking SQL suites and private-scope verification against the
   restored target, then the existing review-media authorization suite. Keep the
   synthetic fixture emails namespaced to avoid collisions with suite fixtures.
   The harness writes a private `restore-evidence.json` after successful
   comparisons, including actual guest-table row digests, captured-control count,
   backup-manifest hash and the hashes of the executed proof sources. It contains
   no contact values, credentials or payload keys. This report certifies the
   local logical comparison, not subsequent SQL suites unless those also pass.
   Stop both projects, remove their volumes and delete protected dumps/keys.

`verify-restored` resumes verification of an already committed local restore
before quarantine changes its row inventory; it does not repeat the restore
transaction or silently accept the altered inventory of a completed drill.
`capture-controls` only augments an unchanged recorded local source after checking all row/schema observations; it
cannot replace a source whose rows or schema changed. These diagnostic modes do
not authorize reseeding or overriding failed recovery evidence.

## Current arrival-policy and receipt restore acceptance

The migration-217 candidate completed the extended actual two-project drill:
**392** application/Auth/Storage/ledger table digests, both structural/ACL
fingerprints and **26** captured managed Auth/Storage/Realtime controls matched.
The private scope has **1124** facts,
`937a04845c02226bc7367a89cab7923813ff5d9cb54ebab7b3f757d5273fbd62`.
The existing populated cards/associations and their original outcomes remain
verified. The two new arrival tables retain **one current policy row and five
original Owner/Manager-bound request receipts**, with four policy audit events.
The no-op adds its receipt without adding a policy revision or audit change.

`verify-restored-arrival-policy.sql` runs against source and restored target in
rolled-back transactions. The active current policy is revision 4, 30 minutes,
maximum 1; the original create still returns revision 1 and maximum 8. Original
lower/no-op/disable/re-enable responses retain their original revisions and
values. Exact replay/recovery does not duplicate receipts or history. The daily
review retains all seven saved bookings and fourteen summed party places,
including seven windows above the lowered cap. Both current policy and review
pass the actual Web codecs. Changed intent/actor, stale revisions, raw table/RLS,
Viewer/Host/outsider/anonymous/worker, Safety, revoked Manager and Owner-handover
boundaries execute with their actual roles. Resource configuration remains on
handover, while a new Owner cannot recover the former actor's private intent.

The current cap rejects an actual new booking on a genuinely free second table.
An explicit authorized policy increase then permits a new booking and produces
a recoverable policy receipt. A savepoint rolls those fresh proof writes back;
all saved public booking facts remain identical afterwards. No probe mutation
is committed. Only the read response's volatile `observed_at` is omitted from
source/target behavioral equality, after SQL verifies it against each actual
query clock and the Web codec validates it. **Every stored application, guest,
journal and audit timestamp remains compared exactly** in the row digests.

A corrupted data dump was rejected by checksum before restoration. Guest access,
manual intent, separate-key payload decryption/wrong-key denial and idempotent,
audited mail quarantine passed. All **34 Booking SQL suites**, media authorization
and the 1124-fact private scope passed on the restored target. An arrival test's
old generic guest-key hash collided with the real restored synthetic corpus;
the two test keys are now deterministically namespaced. Only the failed and
remaining suites were resumed; no restored row was deleted, guard bypassed or
test skipped. Because a protected SQL test changed, a new normal canonical clean
boot then passed all 34 suites, baseline/concurrency, 20 drift cases, lineage,
schema/ACL and DB lint. Its receipt is
`40c84bb2299206e3d74bb9711b77db0cb0e4b479e15090cf229425521d17b42b`.
All **88** selected backup/export, classifier and delivery-workflow contract cases
passed. No migration or prior release evidence was rewritten.

The kept-source setup completed its database execution with the previous
input-bound receipt, but its optional unrelated Founder demo seeder received
PostgREST schema-cache HTTP 503. That whole setup command exited nonzero and is
not represented as a complete setup success. Its identified live database was
verified directly and used for the real seed/export/restore. The final normal
clean boot above completed successfully without that optional post-step.

The contact-free, executed-source-hashed proof remains privately in
`.local/booking-arrival-policy-logical-restore-evidence.json`. Both owned restore
projects/volumes, dumps, payload keys and generated fixture credentials were
removed. This closes populated **local** arrival-policy/journal restore coverage,
not cloud/PITR/Storage-byte recovery, incident secrets or controlled reopening.
The proof remains bound to canonical CLI 2.80.0 / PostgreSQL 17.6.1.095 and backup
CLI 2.116.0. Newer provider runtimes need separate upgrade/restore acceptance,
including the [official 17.11 extension/index/crypto/operator migration checks](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes);
this drill neither upgrades nor certifies that runtime.

The subsequent [PostgreSQL upgrade investigation](BOOKING_POSTGRES_UPGRADE.md)
passes the existing Booking SQL and concurrency behavior on actual 17.11, but
finds a missing default pg_graphql extension and stops at private-scope
verification. It is not a replacement restore or canonical-runtime certificate.

## Earlier association-history restore acceptance

The candidate at migration 214 has now completed the extended two-project drill.
The source completed the canonical clean boot with all 31 Booking SQL suites,
baseline/concurrency checks, 20 private-drift cases, lineage, schema/ACL and database
lint. The optional local Founder setup also completed in this run. The unchanged
database input receipt is
`9cc0c120e22f38a4e3f2e9be2157411bb957d055cf642f743c5deb04d1f89c25`.

The actual CLI 2.116.0 export and independent provider-bootstrap restore matched
**390** complete table row digests, both fingerprint scopes and **26** managed
Auth/Storage/Realtime controls. The private scope contains **1066** facts with
fingerprint `d35d619430c7fc41c5077d6fcd0cbe87d9a00bbc41ca8adf2cb62a8fd3147348`.
The three card tables still contain 3 cards, 7 receipts and 7 metadata events.
The three association tables contain **4 current link rows, 6 receipts and 6
metadata events**, including an explicitly detached row. No historical contact
text is inferred into an association.

The rolled-back source/target history probe checks original create outcomes after
correction/detachment/archival, original correction and detach receipts, current
association history, Host archive redaction, Manager archived access and Viewer
read-only access. Anonymous/worker/staff raw-table denials execute with their
actual roles. Wrong actors, changed replay intents, stale revisions, Safety,
revoked Host and new-Owner boundaries are exercised. A fresh reattachment and
its recovery succeed without changing any saved public booking facts. Returned
source and restored JSON pass the actual Web history/details/outcome parsers and
are compared exactly. This closes the populated local association-table restore
gap; it does not certify cross-browser restart recovery or a cloud restore.

A corrupted data file was refused by its manifest checksum before restoration;
the original bytes were restored before the successful drill. Original guest
access, manual intent, sealed payload/external-key requirement and audited,
idempotent mail quarantine passed as before. No provider request was made.
All **31** current Booking SQL suites and the existing review-media authorization
suite then passed on the restored target, followed by the 1066-fact private-scope
check. All **88** selected backup/export, classifier and delivery-workflow contract
cases passed. The contact-free evidence report is retained privately as
`.local/booking-guest-history-logical-restore-evidence.json`; its executed-source
hashes bind the new probe, corpus, harness, exporter and actual Web API codecs.
Dumps, payload keys and disposable projects/volumes are removed after validation.

## Earlier contact-card acceptance and remaining boundary

- The preceding contact-card-only restore matched 387 table row digests across
  application schemas, Auth, Storage and migration ledger, both application/private schema
  fingerprints and the captured Auth/Storage/Realtime controls.
- An original manual nonce recovers its original result; stored guest access
  still authorizes its receipt. The in-flight payload has the same digest and
  content under the separately provided key; a different key fails. No provider
  request occurred. Queue claims are blocked after audited quarantine.
- A deliberately corrupted backup file was refused before restoration.
- All 29 Booking SQL suites passed on the restored database, as did the existing
  review-media authorization suite and private-scope comparison (975 facts,
  `81c1001a3c743a478302c0834b8967ee96ef997aaf39a5f3b5c670896364fd78`).
  The three guest-card tables retained exactly three cards, seven request
  receipts and seven change events. The corrected card stayed at revision 1;
  recovery/replay still returned its original revision-0 create result. The
  restored card retained its archive/restore history and revision 2.
- Two newer SQL suites previously asserted a globally empty or fixed-size
  reservation table. They now compare complete before/after reservation facts,
  including unrelated restored reservations. This strengthens the no-mutation
  checks and lets the same suites run on clean and populated databases; no
  reservation is deleted or test bypassed for the restore.
- Backup/workflow contract tests and the existing delivery-policy tests passed.
  These include orchestration with an isolated CLI stub, unexpected CLI, unsafe
  target/reference, pre-existing output, missing Booking sections, invalid Storage
  protection and restrictive output permissions. Actual export uses CLI 2.116.0;
  source and target provider projects use canonical CLI 2.80.0 / PostgreSQL
  `17.6.1.095`. This does not certify a different Production provider version.

The final canonical clean boot with the stronger SQL inventory checks also
passed all 29 Booking suites, baseline/concurrency checks, 20 private-drift cases,
lineage, schema/ACL and database lint. Its new input-bound gate receipt is
`bb4a1575fb7854dbb46bfdbcb46c4f429d7805b13667e7356cab650d2be454fe`.
All 69 backup/export and delivery contract cases passed. No migration was added
and prior release evidence was not rewritten.

The kept-source setup completed its database checks but the optional unrelated
Founder demo seeder then received HTTP 503 while PostgREST loaded its schema
cache. That setup process exited nonzero and is not represented as a fully
successful setup command. The identified source database remained live; its
actual SQL facts, fingerprints and guarded restore corpus were verified directly.
The final normal clean-boot process (without that optional demo seeder) passed.
A preliminary long nonnumeric run id also failed before building the final
source; the final run used the ordinary short numeric CI run-id format. Neither
failure was accepted as a substitute for actual database execution.

Initial attempts usefully failed on managed Storage write privilege, provider
migration execution timestamps, missing app Auth hook and incomplete canonical
Storage policy coverage. Those are fixed in the recipe, not waived. One SQL-test
attempt collided with generic synthetic staff addresses; the corpus now prefixes
its addresses. Exact row equality was measured before that test-isolation change.

The exporter and extended harness have not run against Production or S3 in this
acceptance. A current encrypted cloud
archive has not been downloaded/revalidated, Storage object bytes have not been
restored, RPO/restore time for a real dataset has not been measured, provider/JWT/
SMTP/widget/scheduler secrets are separate, and post-backup writes plus external
mail outcomes still need incident-specific reconciliation. The local queue fixture
is not a Production incident command. A real restore requires a separately
reviewed target, approval, full lifecycle/ACL/media checks and a controlled
reopening decision. No new production activation, app release, real guest message
or practical Aleno-parity claim follows from this local acceptance.
