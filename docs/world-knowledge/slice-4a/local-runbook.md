# Local Founder runbook

## Start

From the repository root:

```sh
npm install
npx supabase start
npx supabase db reset
npm run world-knowledge:build
npm --workspace web run dev -- --hostname 127.0.0.1 --port 3217
```

The ordinary reset includes historical data operations and can fail on an empty database. The canonical clean-room command is `scripts/ci/validate-supabase-current.sh`; it excludes those certified one-time operations. For interactive authoring, apply the active migrations to a clean local database and then run `supabase/seed.sql`, which enables the local-only authoring flag.

Owner URL: `http://127.0.0.1:3217/owner/world-knowledge`

Admin URL (second process):

```sh
npm --prefix admin-dashboard run dev -- --hostname 127.0.0.1 --port 3218
```

Then open `http://127.0.0.1:3218/world-knowledge`.

## Roles and workflow

- Admin creates and manages the 20–40 cohort spots and can edit all approved keys.
- Owner Basic sees only the stable Basic key set for an owned cohort Spot.
- Owner Pro sees Basic plus approved objective detail keys. Pro changes scope only, never Trust or output.

Create a Spot in the Admin route, optionally bind an existing local test profile as Owner, then work through the nine steps. “Nicht beantwortet” needs no action. Use explicit Unknown or Not Applicable only when that distinction is known. The expert panel shows Claims and the latest Shadow Manifest.

“Datenvorschau aktualisieren” invokes the server-only Shadow Resolver after a user scope check. “Founder World Cohort exportieren” freezes the active cohort’s manifest identities and exclusions. Import accepts only the versioned Founder export contract and replays values through the same authorized RPCs; it never inserts ledger rows directly.

Archiving/removing a cohort member changes membership only. Claims, verification, confirmations and historical manifests remain intact. Reset requires the exact confirmation phrase and archives the local set rather than deleting it.

## Production impact

None until a separately authorized database release and runtime activation. This slice performs no Production query, migration, deployment, client activation, Decision integration, cron, notification, OTA or backfill.
