# Local Founder runbook

## Start

From the repository root:

```sh
npm install
BACKYRD_KEEP_SUPABASE_RUNNING=true \
  BASE_SHA=cd0f598dffd4b9ffc093bc7ec666c15a61522457 \
  BACKYRD_CHANGED_DATABASE_TESTS_FILE=/private/tmp/wk4a-database-tests.txt \
  bash scripts/ci/validate-supabase-current.sh
set -a; source "${TMPDIR:-/tmp}/backyrd-world-authoring-local.env"; set +a
npm --workspace web run dev -- --hostname 127.0.0.1 --port 3217
```

Create the selected-test file once with `printf '%s\n' 'supabase/tests/world_knowledge_slice4a_authoring.sql' > /private/tmp/wk4a-database-tests.txt`. This is the canonical clean-room reset: it excludes certified one-time historical data operations, runs the complete database safety gate, enables authoring only in that disposable local database, seeds three local identities, and leaves the isolated stack running. The owner-only environment file contains local secrets and is never committed. Stop the stack with `npx supabase stop --workdir "$BACKYRD_LOCAL_SUPABASE_WORKDIR" --no-backup` after sourcing that file.

Owner URL: `http://127.0.0.1:3217/owner/world-knowledge`

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
