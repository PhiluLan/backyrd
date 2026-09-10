# Security, ACL and retention

## ACL matrix

| Operation | anon | authenticated | scoped Owner | Pro Owner | server-authorized Admin | service role |
|---|---:|---:|---:|---:|---:|---:|
| Read private ledgers/evidence | deny | deny | deny | deny | deny | internal only |
| Direct claim/verification write | deny | deny | deny | deny | deny | internal only |
| Basic claim RPC, own spot | deny | deny | allow | allow | n/a | n/a |
| Pro key, own spot | deny | deny | deny | allow | n/a | n/a |
| Admin claim RPC | deny | deny | deny | deny | allow | n/a |
| User report | deny | allow | allow | allow | allow | n/a |
| Shadow rebuild | deny | deny | deny | deny | deny | allowlisted synthetic only |
| Public projection | deny | deny | deny | deny | deny | internal only |

All exposed tables have RLS. Grants are evaluated separately. Private evidence/resolution internals live outside the exposed public schema. Every privileged function has an empty fixed `search_path`; `PUBLIC EXECUTE` is revoked and only the minimum role receives execute. The local SQL suite checks positive and negative authority paths, direct-write denial, private/public leakage, append-only enforcement, and function privileges.

This follows current Supabase guidance that RLS and table privileges are separate controls, that `security_invoker` is required when an exposed view should obey underlying RLS, that Security Definer functions require a fixed search path, and that function execution is otherwise granted to Public by default. Sources: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [API security](https://supabase.com/docs/guides/api/securing-your-api), [custom-claim RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac), [tables/views](https://supabase.com/docs/guides/database/tables), [RLS tester changelog](https://supabase.com/changelog/45233-feature-preview-rls-tester).

## Retention

The runtime contract inventories public non-personal spot facts, factual claim history, actor bindings, private source payloads, user reports, moderation evidence, non-personal audit hashes, work items, and rebuildable caches. Durations remain `null` and the release is `REQUIRES_CTO_LEGAL_ACTIVATION`.

Factual history and non-personal hashes may be retained long-term subject to Legal approval. Actor identity is detachable/pseudonymizable; private payloads, reports, evidence and work items remain purpose-limited. Export, deletion, correction-by-addition, and cache rebuild are explicit capabilities. Final durations and the lawful account-deletion implementation are prerequisites for Production activation.
