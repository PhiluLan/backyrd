# Database Consolidation v1

## Outcome contract

Database Consolidation v1 restores one database lineage from canonical Git `main` through clean bootstrap to Production. Product semantics are frozen. No historical migration is renamed or rewritten, no migration repair is used, and no Product history is removed.

Authoritative artifacts:

- `supabase/canonical/database-lineage-v1.json` — immutable migration hashes, the read-only Production baseline, and nine certified aliases;
- `docs/operations/DATABASE_OBJECT_INVENTORY_V1.json` — object-level lifecycle classification and evidence;
- `docs/architecture/CANONICAL_DATABASE_MAP.md` — current truth ownership and system map;
- `scripts/ci/application-schema-fingerprint.sql` — catalog-wide structural/security drift fingerprint;
- `scripts/ci/validate-database-lineage.mjs` — immutable lineage and Production-only-version guard.

The older `PRODUCTION_PRODUCT_LINEAGE.json` remains a historical multi-surface go-live snapshot. Its database subsection is not the current database ledger; the dedicated database-lineage manifest is authoritative for Database Consolidation v1 and later migrations.

## Read-only forensic baseline

- Canonical base: `2e306dae01d76db1254e18eed1f3d206dad6044f` (`origin/main`, fetched 2026-08-31).
- Production project: `hjgcrrzfjchzqoegcywn`, PostgreSQL 17.6.
- Main migrations: 113.
- Production ledger migrations: 112.
- Common versions: 103; same-version semantic divergence: 0.
- Production-only versions: 9; all are certified Spot Engine aliases.
- Main-only versions: the nine canonical alias counterparts plus `20260831044934`.
- Production schema dump SHA-256: `dee33b990d392631acad0acfdc9fcc8ece8d84fa94c20d88e8144306bee92b44`.
- Product-scope data dump SHA-256: `5633a9a2a6329e21a5ceadc0bb381de1009eee9eaee9d3cd97b8be90186ac41c`.

All 100 ordinary common versions matched statement content. Two migrations were stored by Supabase as one full-file statement, and `20260829080205` differs only by a later explanatory leading comment already recertified in the historical Product-lineage record. No same-version schema-effect conflict exists.

## Spot Engine alias matrix

Production's nine files were applied through the direct migration-apply path, which registered server-generated application timestamps. Canonical PRs carried different filename timestamps. Production ledger SQL, canonical file bytes, Git origin, current function definitions, ACLs, and resulting schema effects were compared. Seven ledger payloads are byte-identical to canonical files; two omit only the source file's final LF.

| Main version | Production version | Production ledger SHA-256 | Semantic effect | Actual Production state before convergence | Status |
| --- | --- | --- | --- | --- | --- |
| `20260829215500` | `20260829215420` | `e6b4f73c9a46b5248af5bd450b353445629ba3d389d3fa95796e6550d3a89546` | Bounded same-domain UNKNOWN research coverage | Finalize/enqueue definitions and service-only ACL present | Exact certified alias |
| `20260829221500` | `20260829220912` | `d2719a132ddb7b21fd6de31b07a05b7a2d5cc39d5516bbade452551b1bae9fb1` | Population-run-scoped research claim | v2 claim definition and service-only ACL present | Exact certified alias |
| `20260829223000` | `20260829221950` | `248183aef69507617542f14219e1ecf2a1fc8d0b48719bb11e10532e353988b2` | Exclude population jobs from legacy claim | v1 compatibility claim present | Semantic exact; final LF normalization |
| `20260830010000` | `20260829234503` | `3aed2d58777cf21b85959b8fb04e7137eadbca3435b8f4eff53cafb2ee6c8435` | Population tick/configuration scheduling | Tick/config functions and service boundary present | Exact certified alias |
| `20260830082857` | `20260830113718` | `d05449684ed46d715524bf3ffa16902fdff73edcd98ec8458bd4caee136d4c04` | Throughput and bounded four-worker activation | Current definitions present | Semantic exact; final LF normalization |
| `20260830135909` | `20260830145939` | `c78e824358ab1b47e2ae8c91fb7af7340749d50f3c6a8f445b74f398456c25d7` | Provider concurrency bound | Current v2 claim definition present | Exact certified alias |
| `20260830160500` | `20260830160813` | `6cc8f3c3c464564fb6eabf1c4b794d339977aa5b065399f44f856faee50b13ff` | Same-truth population finalization | Current tick-control definition present | Exact certified alias |
| `20260830202410` | `20260830212016` | `128f6c06012d443f5055803975d71f187bdeecb04ba33fffc9ae14a46cda70de` | Operational fact revalidation and audit | Helpers/batch RPC present with service-only boundary | Exact certified alias |
| `20260830204938` | `20260830212025` | `3abe4379c3b8cf4acecb9a4a12e8cff3fa5b1f733cd7f8acd1a8869f811c1fdf` | Fail-closed regular-hours Spot/service scope | Hardened batch definition present | Exact certified alias |

The canonical versions remain the already-merged Git identities. The Production versions are restored as immutable alias files; both sides contain identical SQL and therefore no competing active implementation. Replaying canonical counterparts is DDL-only at apply time: all `INSERT`, `UPDATE`, and cron statements are inside function bodies and are not executed by migration replay.

## Pre-Mood migration

`20260831044934_fail_closed_operational_revalidation_invalid_fact_v1.sql` originated in Spot operational revalidation PR #160 (`5a150cf18ef979549187125c180bdee8b2b5154c`) and is canonical main. Before consolidation, Production had the prior batch function: it rejected service schedules but did not catch deterministic `invalid_parameter_value` validator denials or write `OPERATIONAL_REVALIDATION_VALIDATOR_DENIED` audit outcomes.

The migration is not present under another Production version, is not obsolete, contains no data rewrite, and must be applied. It changes only fail-closed retry/audit handling already accepted by PR #160; Product ranking, Decision, Mood, Taste, Gold, Trust, Social, Auth and Owner semantics are unchanged.

## Object inventory and cleanup proof

The read-only catalog contained 4 Backyrd schemas, 268 tables, 10 views, 0 materialized views, 720 non-extension functions, 164 triggers, 237 policies, 606 indexes, 34 sequences, 12 relevant extensions, and 7,048 table/routine grants. All 256 `public` application tables had RLS enabled.

Object-level classification before cleanup:

- `ACTIVE`: 1,479
- `LEGACY_REQUIRED`: 326
- `DEAD_PROVEN`: 8
- `UNKNOWN`: 242

Unknown objects remain untouched. Compatibility-granted older RPCs and stored historical rows without complete deletion proof are `LEGACY_REQUIRED`, not deletion candidates.

The eight `DEAD_PROVEN` catalog objects are:

- schema `audit` and tables `audit.app_schemas`, `audit.inventory_tables`, `audit.inventory_columns`;
- schema `drizzle`, table `drizzle.__drizzle_migrations`, sequence `drizzle.__drizzle_migrations_id_seq`, and index `drizzle.__drizzle_migrations_pkey`.

`audit` was created only by `scripts/supabase_inventory_and_archive.sql`; its 6/86/648 rows are a stale engineering inventory, not Product audit history. `drizzle` contains one orphan ledger row (`id=1`, hash `023e1333…d770`, created at `1758530467381`) while the repository has no Drizzle runtime/config/dependency. Both schemas have zero runtime references, external catalog dependencies, functions, views, triggers, FKs, publications, cron references, policies, or effective `PUBLIC`/`anon`/`authenticated`/`service_role` schema usage.

Forward migration `20260831203122_database_consolidation_v1_remove_dead_proven.sql` verifies those exact snapshots and fails closed on any changed or unexpected object. All drops use PostgreSQL `RESTRICT`; it removes no Product table or Product history.

## Convergence path

1. Merge the consolidation branch through a reviewed PR into canonical `main`.
2. From that exact main SHA, run a dry-run against Production and verify the pending set is exactly the nine canonical counterparts, pre-Mood `20260831044934`, and cleanup `20260831203122`.
3. Run one documented `supabase db push --include-all`. `--include-all` is required once because the canonical counterparts have timestamps below Production's current tip. This is normal forward application, not migration repair or ledger editing.
4. Verify all 123 Git versions equal the 123 Production ledger versions, Public ACL fingerprint equals canonical, application schema fingerprint equals canonical, `audit`/`drizzle` are absent, all Public tables retain RLS, and protected Product row counts are unchanged.
5. Future releases return to ordinary `supabase db push` with strictly later timestamps.

## Permanent drift guard

The guard locks all 123 consolidation migrations by filename/version/SHA-256, certifies the nine aliases including Production ledger hashes, permits only timestamps later than the consolidation tip, and rejects changes/deletions of migrations already present in a PR's base. Optional remote-ledger mode rejects Production-only versions and can require exact Production/Main equality.

Negative tests prove rejection of:

- changed historical migration bytes;
- missing Production alias;
- a new migration inserted into history;
- Production-only migration truth.

The application schema fingerprint covers schemas, relations/columns, constraints, indexes, views, functions including `SECURITY DEFINER` configuration, triggers, policies, sequences, types/enums, extensions, effective client grants, owners, RLS and default ACLs. The separate Public ACL fingerprint remains an independent security guard.

## Normal database workflow after consolidation

1. Generate one new forward migration with `supabase migration new <name>`; never rename or rewrite an applied migration.
2. Keep the timestamp strictly later than the canonical tip.
3. Run `scripts/ci/validate-database-lineage.mjs` and a clean `scripts/ci/validate-supabase-local.sh` bootstrap.
4. Open a PR. CI checks history immutability, ordering, aliases, negative tests, clean bootstrap, fingerprints, RLS/ACL denials, DB lint, and acceptance suites.
5. Merge to canonical `main` only with green required checks.
6. Deploy from that exact main SHA using ordinary `supabase db push`.
7. Run `scripts/ops/validate-production-gate1.sh` read-only to require exact ledger, schema, ACL, RLS, and cleanup convergence.

Direct `apply_migration`/Management API application from a feature branch is prohibited because it generates server-side identities and can create Production-only truth. Production database deployment is filename-preserving and canonical-main-only.

## Protected data baseline

The faithful Production data rehearsal applied every pending forward file in version order. All 256 Public table row counts were byte-for-byte identical before and after. Representative protected counts were: Spots 447, Reviews 88, Moments (`social_posts`) 25, Decision sessions 656, Analytics events 1,898, Memory events 280, accepted facts 940, governance audit events 399, safety decision events 708, and Owner change events 60.

No real Product data is targeted by any migration in this workstream.
