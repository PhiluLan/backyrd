# Supabase Authority and Security Inventory

Read-only repository audit only; no schema, policy, grant, function or production change.

## Relevant findings

- Core tables enable RLS in migrations, but grants and policies are separate controls and must be reviewed together for every future World table.
- Relevant Gold/Restaurant authoring uses `SECURITY DEFINER` RPCs with explicit actor checks. Some public read RPCs are granted to `anon`/`authenticated`; authorization and returned columns must be audited independently from underlying table RLS.
- Gold authoring uses founder/admin checks, `ADMIN_VERIFIED` source naming and numeric confidence. These cannot establish World `VERIFIED`.
- Owner entitlements are checked server-side in current flows, but ownership/subscription only grants write capability; it cannot elevate trust.
- N4 machine adapters are service-role paths after explicit revokes/grants. They remain separate from World authority.
- Views must not be assumed invoker-safe merely because underlying tables use RLS. Future views require explicit `security_invoker` analysis or restricted exposure.
- Future `SECURITY DEFINER` functions need fixed `search_path`, explicit role checks, revoked default/public execute and least-privilege re-grants.
- JWT `user_metadata` is user-editable and is not an authorization source. Current/future authority must use server-controlled claims/tables/functions.

Official references checked on 2026-09-10: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [tables/views](https://supabase.com/docs/guides/database/tables), [API security](https://supabase.com/docs/guides/api/securing-your-api), [Auth users](https://supabase.com/docs/guides/auth/users), and the [current breaking-change changelog](https://supabase.com/changelog?types=breaking-change). No current changelog item changes this Slice 2 read-only conclusion.

Security work discovered here is deliberately deferred to a separately authorized RLS/ACL/function audit; this PR contains contract/test code only.
