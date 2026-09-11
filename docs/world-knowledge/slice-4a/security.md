# Security and Supabase boundary

Reviewed 2026-09-11 against the current official Supabase guidance:

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): exposed data needs RLS; grants and policies are distinct; `user_metadata` is not authorization data.
- [Database Functions](https://supabase.com/docs/guides/database/functions): invoker is preferred; privileged functions need an explicit empty `search_path`, qualified relations, revoked default execution and narrow grants.
- [Tables and Views](https://supabase.com/docs/guides/database/tables): views are definer by default; client-facing views require an intentional invoker boundary.
- [Changelog](https://supabase.com/changelog): no 2026 change reviewed for this slice weakens these constraints.

Slice 4A adds no client-readable ledger table or view. Both new private tables use RLS as defense in depth and deny `PUBLIC`, `anon`, and `authenticated`. Authenticated clients can invoke only the narrow authoring functions; those functions re-check environment, identity, Spot ownership/Admin authority, entitlement, key and value. The server-only cohort export and Shadow Rebuild remain granted only to `service_role`, which exists only in Next.js route handlers marked `server-only`.

The SQL acceptance test inventories every private World table from `pg_catalog` and fails on missing RLS or client DML grants. It also proves forged metadata, foreign ownership, Basic→Pro escalation, direct ledger writes, client rebuild/export, unsafe description publication, and Current State without expiry fail closed.

This is repository and isolated-local proof, not evidence about currently effective live Production grants. No Production connection was made.
