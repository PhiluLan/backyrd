# World Founder Live authoring release candidate

Status: `NOT_EXECUTED_NO_PRODUCTION_AUTHORITY`.

This runbook prepares, but does not authorize, the nine existing World migrations. It contains no Production command.

1. **Preflight** — generate the source-aware plan and Founder-live evidence twice; require byte-identical output, exactly nine ordered migrations, matching hashes, PostgreSQL 17 compatibility, no Function/Auth deployment, Default OFF and Kill Switch ENGAGED.
2. **Backup** — a future separately authorized operator must create and verify a logical backup before applying any World migration.
3. **Restore rehearsal** — run the existing disposable local rehearsal with `WORLD_WEEK2_BACKUP_RESTORE=true`; require restored World table/Claim counts and all authority tests to match.
4. **Apply in order** — only after a separate exact-sha Production authorization. Stop at the first plan, migration, lock, RLS, grant, function or semantic mismatch.
5. **Verify** — migration ledger, hashes, private-schema exposure, `SECURITY DEFINER` search paths, Reader OFF behavior and UNKNOWN/DISPUTED preservation.
6. **Recovery** — engage the Kill Switch, stop writes and restore the verified backup. Never delete append-only ledgers in place.

The current slice is restricted to `LOCAL_TEST` and `PROD_LIKE_TEST`. Mobile, Decision, ranking, eligibility, Production traffic and real allowlist membership remain outside scope.

## Official Supabase compatibility review

The audit is based on the current official breaking-change feed and security guidance. The migrations are checked for PostgreSQL 17, explicit grants in addition to RLS, protected `auth`/`realtime`/`storage` schemas, empty `search_path` on privileged functions, absence of the removed `logs.all` endpoint and absence of explicit extension-version pinning. Data API exposure is never inferred merely from a table being in `public`.
