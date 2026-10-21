# Independent backup-export correction

The original weekly exporter selected schema `public` and data
`public,auth,storage`, omitting other application schemas and future private
Booking facts. This correction is based directly on current Main and does not
carry the pending Booking feature migrations. The later candidate's isolated
logical-restore harness remains in PR #575; it is not required by this exporter.

The existing Main-only/OIDC, separate AWS account, private KMS bucket, versioning,
30-day retention and encrypted-upload checks remain unchanged. No Production or
S3 operation has been run to validate this branch.

The workflow-pinned Supabase CLI stays at 2.116.0. The helper requires an explicit
linked/local target, a new private output directory and, for local mode, a guarded
disposable project with no Production reference. All output files use mode 0600.

Weekly database snapshots now include:

- Roles and all non-platform application schemas and default data, including
  private application schemas plus Auth and Storage metadata.
- Separately exported Supabase migration schema/history, which default CLI dumps
  exclude.
- Actually installed app Auth triggers, Storage RLS/policies and Realtime table
  membership, observed through one catalog SELECT. Canonical configuration is
  included only for reference; cron/webhook targets are not enabled.
- A versioned scope manifest and per-file SHA-256 checksums, covered again by the
  existing complete-archive checksum and KMS upload.

The source catalog supplies the list of physical `booking_private` tables. The
current base and recorded Production schema 191 have private helper functions
but no such tables; a legitimate empty table inventory therefore succeeds. For
an installed private table, including an empty one, its explicit COPY section is
mandatory. The inventory is recorded in the snapshot. There is no guessed table
list, and later Booking capabilities/journals do not need to be installed first.
Missing schema, expected private data sections, migration history or Storage RLS
prevents completion. Older v1 archives are unchanged and must not be described as
complete private-Booking recovery; v2 does not retroactively add missing facts.

The contract tests run in PR delivery checks and before the scheduled Main job's
AWS setup. They cover normal orchestration, function-only private schema,
missing expected table data, CLI pin, local/Production-reference guards, output
clobbering, file permissions, missing schema and invalid Storage protection.
Actual CLI 2.116.0 export checks passed on a fresh current-Main local database:
first with no private tables (`bookingTables: []`), then with two synthetic private
tables (one empty, one containing a row), both with RLS enabled. The copied row,
both explicit COPY sections and all 13 checksum entries were verified. All 38
combined backup/workflow tests passed. The canonical Main clean boot passed its
five Booking SQL suites and baseline/race/ACL checks before the temporary fixture
tables were added. Its optional kept-running World Knowledge seeder later hit a
local PostgREST readiness 503; the recorded database gate had already passed, and
the live source was verified by the actual exports.

Scope limits remain explicit: database exports do not contain Storage object
bytes, JWT/provider/SMTP configuration or external environment secrets. Separate
CLI schema/data/control exports are not one global snapshot; coordinate schema
changes and verify ledger/control consistency during real recovery. New intake,
workers and apps must stay closed until lost writes and external effects are
reconciled. This branch does not certify a cloud restore, Production provider
version, real RTO, restaurant operation or practical Aleno parity.
