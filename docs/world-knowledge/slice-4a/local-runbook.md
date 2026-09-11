# Local Founder runbook

## Legacy Production rehearsal safety labels

The stages below are deliberately separate:

- **PRODUCTION READ ONLY** — minimized export through a pre-authorized libpq read-only service profile.
- **LOCAL WRITE** — transform and import into the local Founder Supabase stack.
- **NO PRODUCTION WRITE** — the import command refuses a non-loopback target.
- **NO DEPLOYMENT** — none of these commands deploy migrations, Functions, Web, Mobile, or OTA.

Never place a database URL, password, token, or service key in a command argument. The export requires an already configured libpq service profile name in `WK_LEGACY_EXPORT_PGSERVICE`. If no authorized profile exists, stop after validating the query and report Production coverage as `UNKNOWN`; do not search for credentials.

### PRODUCTION READ ONLY — inventory and export

Review `scripts/world-knowledge/production-legacy-export-readonly-v1.sql`. It starts an explicit read-only transaction and sets short statement, lock, and idle transaction timeouts. Then run `WK_LEGACY_EXPORT_PGSERVICE=backyrd-production-readonly npm run world-knowledge:legacy:export`. The service name is not a secret; credentials remain in the approved libpq service/passfile configuration.

The mode-0600 result is written below `.local/world-knowledge-import/`, which is gitignored. Validate and transform it with `npm run world-knowledge:legacy:transform`.

### LOCAL WRITE — preview and import

Start/reset the isolated stack below. Provide `WK_LOCAL_SUPABASE_URL`, `WK_LOCAL_SUPABASE_ANON_KEY`, `WK_LOCAL_ADMIN_EMAIL`, and `WK_LOCAL_ADMIN_PASSWORD` through the local environment, never command arguments. Run `npm run world-knowledge:legacy:import-local`. The importer refuses non-loopback Supabase URLs.

It stages approved spots without Claims; Draft/archived/unclear rows stay reported but are not activated. A replay reuses the batch. At `http://127.0.0.1:3218/world-knowledge`, filter “Legacy-Werte prüfen”, compare each prefill, deselect unwanted values, and confirm. Only this Admin action creates `ADMIN_CONFIRMED` Claims. Select 20–40 spots explicitly for the Founder Cohort and export its manifest.

### Reset and sensitive-file disposal

The UI reset archives the local test catalog and retains World history. A full local rebuild uses the database reset below. Move `.local/world-knowledge-import/` to Trash or use an approved secure local disposal workflow after the rehearsal. Stop the local stack with the standard command below. None of these actions affects Production.

## Start

From the repository root:

```sh
npm install
BACKYRD_KEEP_SUPABASE_RUNNING=true \
  BASE_SHA=cd0f598dffd4b9ffc093bc7ec666c15a61522457 \
  BACKYRD_CHANGED_DATABASE_TESTS_FILE=/private/tmp/wk4a-database-tests.txt \
  bash scripts/ci/validate-supabase-current.sh
set -a; source "${TMPDIR:-/tmp}/backyrd-world-authoring-local.env"; set +a
npm --workspace web run dev -- --hostname 127.0.0.1 --port 3219
```

Create the selected-test file once with both Slice-4A suites:

```sh
printf '%s\n' \
  'supabase/tests/world_knowledge_slice4a_authoring.sql' \
  'supabase/tests/world_knowledge_slice4a_legacy_import.sql' \
  > /private/tmp/wk4a-database-tests.txt
```

This is the canonical clean-room reset: it excludes certified one-time historical data operations, runs the complete database safety gate, enables authoring only in that disposable local database, seeds three local identities, and leaves the isolated stack running. The owner-only environment file contains local secrets and is never committed. Stop the stack with `npx supabase stop --workdir "$BACKYRD_LOCAL_SUPABASE_WORKDIR" --no-backup` after sourcing that file.

Owner URL: `http://127.0.0.1:3219/owner/world-knowledge`

Admin URL (second process):

```sh
npm --prefix admin-dashboard run dev -- --hostname 127.0.0.1 --port 3218
```

Then open `http://127.0.0.1:3218/world-knowledge`.

## Roles and workflow

All three local accounts use the password `FounderLocal4A!`:

- Admin: `founder-admin@local.backyrd.test`
- Owner Basic: `owner-basic@local.backyrd.test`
- Owner Pro: `owner-pro@local.backyrd.test`

- Admin creates and manages the 20–40 cohort spots and can edit all approved keys.
- Owner Basic sees only the stable Basic key set for an owned cohort Spot.
- Owner Pro sees Basic plus approved objective detail keys. Pro changes scope only, never Trust or output.

Create a Spot in the Admin route, optionally bind an existing local test profile as Owner, then work through the nine steps. “Nicht beantwortet” needs no action. Use explicit Unknown or Not Applicable only when that distinction is known. The expert panel shows Claims and the latest Shadow Manifest.

“Datenvorschau aktualisieren” invokes the server-only Shadow Resolver after a user scope check. “Founder World Cohort exportieren” freezes the active cohort’s manifest identities and exclusions. Import accepts only the versioned Founder export contract and replays values through the same authorized RPCs; it never inserts ledger rows directly.

Archiving/removing a cohort member changes membership only. Claims, verification, confirmations and historical manifests remain intact. Reset requires the exact confirmation phrase and archives the local set rather than deleting it.

## Production impact

None until a separately authorized database release and runtime activation. This slice performs no Production query, migration, deployment, client activation, Decision integration, cron, notification, OTA or backfill.
