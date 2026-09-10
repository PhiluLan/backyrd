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

All World Knowledge tables are discovered from the PostgreSQL catalogs rather than a manual allowlist. The migration enables RLS and applies grants to every discovered table, including `source_policy_attribute_rules`; a private `security_inventory_v1` view reports schema exposure, RLS, role grants, policies and expected mutation authority. The SQL suite fails if any current or future World table is missing from this inventory or has an unexpected client grant.

Grants and RLS are evaluated separately. Private evidence/resolution internals live outside the exposed public schema. Every privileged function has an empty fixed `search_path` and fully qualified relations. `PUBLIC EXECUTE` is revoked. The shadow rebuild is granted only to the actual PostgreSQL `service_role`; it no longer trusts a caller-set JWT role string. Local tests execute the function as `anon`, `authenticated`, and `service_role`, and prove that internal helpers remain uncallable even to `service_role`.

This follows current Supabase guidance that RLS and table privileges are separate controls, that `security_invoker` is required when an exposed view should obey underlying RLS, that Security Definer functions require a fixed search path, and that function execution is otherwise granted to Public by default. Sources: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [API security](https://supabase.com/docs/guides/api/securing-your-api), [custom-claim RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac), [tables/views](https://supabase.com/docs/guides/database/tables), [RLS tester changelog](https://supabase.com/changelog/45233-feature-preview-rls-tester).

## Actor detachment and privacy language

- **Active binding:** `actor_id` is present and uniquely binds one Auth user plus Actor type. A partial unique index applies only to these non-null bindings.
- **Detached binding:** Auth deletion sets `actor_id` to null, records `detached_at`, and rotates the opaque `actor_pseudonym_id` with cryptographic randomness. Multiple deleted actors of the same type therefore cannot collide.
- **Pseudonymized:** claims and verification history continue to point to the opaque binding ID. This is deliberately described as pseudonymized and may remain personal data when re-identification is reasonably possible.
- **Actually anonymized:** no claim is made in Slice 3B. That status requires a separate legal and technical determination that re-identification is no longer reasonably possible.
- **Still personal:** active bindings, private source payloads, reports, moderation evidence, and detached histories that remain linkable by auxiliary information stay under purpose limitation and retention governance.

The opaque pseudonym is not derived from the former Auth UUID. The database tests delete two same-type actors consecutively, prove distinct rotated identifiers, and prove that all claim, verification and identity-event hashes remain unchanged.

## Verification and confirmation integrity

Owner verification requires the verifier binding to be exactly the claim's active Owner binding and to own the bound Spot at `checked_at`. Admin verification requires the exact claim actor binding and currently active server-side Admin authority. Spot, key, scope, policy, method, execution authority, time, reason codes and full record hash are revalidated on insert. `INDEPENDENT_PROCESS` remains fail-closed until a separate accepted process exists.

Confirmations similarly bind claim ID/hash, actor binding, method, policy, quarterly-request reference, confirmed/due timestamps and idempotency identity. They are append-only operational metadata: missing a future confirmation never changes a durable fact to false and never deletes it.

## Retention

The runtime contract inventories public non-personal spot facts, factual claim history, actor bindings, private source payloads, user reports, moderation evidence, non-personal audit hashes, work items, and rebuildable caches. Durations remain `null` and the release is `REQUIRES_CTO_LEGAL_ACTIVATION`.

Factual history and non-personal hashes may be retained long-term subject to Legal approval. Actor identity is technically detachable and pseudonymized with a rotated opaque identifier; private payloads, reports, evidence and work items remain purpose-limited. Export, deletion, correction-by-addition, and cache rebuild are explicit capabilities. Final durations, anonymization criteria, and the end-to-end lawful account-deletion policy remain prerequisites for Production activation.
