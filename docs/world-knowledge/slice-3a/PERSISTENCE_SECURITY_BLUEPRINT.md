# Persistence, Identity and Security Blueprint

This is a relational design for Slice 3B, not a migration.

## Persistence model

| Planned structure | Responsibility / key | Mutability | Writers | Readers / important constraints |
|---|---|---|---|---|
| `world_registry_releases` | registry version PK, content hash, predecessor | immutable | World Governance after accepted approval | registry readers; unique hash/version, no key reuse |
| `world_registry_approval_authorities` | authority ID + version | append-only | security/governance bootstrap | release validator; validity window and allowed change classes |
| `world_registry_approval_records` | approval ID PK, release FK/hash | immutable | accepted approval execution | governance audit; idempotency on release+authority |
| `world_source_policies` | policy version PK/hash, registry FK | immutable | World Governance after Product approval | resolver; Draft and accepted lifecycle must be separate |
| `world_source_references` | source reference UUID PK, spot FK, type, visibility | append-only with lifecycle events | Owner/Admin/Research within field policy | verifier/resolver; private payload separated from public metadata |
| `world_claims` | claim UUID PK, spot UUID, key/version, content hash | immutable append-only | scoped claim APIs only | resolver/audit; supersedes FK, idempotency key, temporal indexes |
| `world_verification_processes` | process ID+version PK/hash | immutable | governance | verifier; exact policy binding |
| `world_verification_execution_authorities` | authority ID+version PK/hash | append-only | security authority | verifier; expiry and narrow process scope |
| `world_verification_records` | record UUID PK/hash, claim FK/hash | immutable | authorized verification execution | resolver/audit; unique process execution idempotency |
| `world_spot_identity_events` | event UUID PK, subject/canonical spot IDs | immutable append-only | identity moderation | all lineage consumers; no claim movement |
| `world_resolution_manifests` | manifest UUID/hash, policy/registry/as-of | immutable | internal resolver | audit/rebuild; unique input-set hash |
| `world_resolution_entries` | manifest+key+scope | immutable | internal resolver | projection builder; conflict alternatives retained |
| `world_current_projection` | spot+key+scope pointer | replaceable cache | internal projector | product readers; points to immutable manifest/entry |
| `world_rebuild_jobs` | job UUID and idempotency key | operational state machine | service operations | operators; retry-safe, bounded partitions |
| `world_review_work_items` | work item UUID, conflict/identity reason | mutable workflow, immutable event audit | moderation | assigned reviewers only |

Source of truth consists of registry/policy releases, sources, claims, verification and identity events. Resolution is derived. Current projection is a cache/pointer. Work items coordinate humans but never become factual evidence by themselves.

Recommended indexes: claims by `(spot_id, attribute_key, observed_at desc)`, active temporal lookup by `(spot_id, attribute_key, valid_from, valid_until)`, source references by `(spot_id, source_type)`, verification by `(claim_id, checked_at desc)`, identity events by both involved spot IDs, projection by `(spot_id, attribute_key, scope)`, and rebuild jobs by status/next-attempt. Volumes are expected to be claim-heavy; partitioning should wait for measurements.

Deletion should remove or restrict private payloads according to legal policy while preserving non-identifying hashes and required audit lineage. Exact retention is unresolved and must not be invented in migration code.

## Spot identity ledger

Use `public.spots.id` UUID as the canonical World subject unless the identity audit before migration finds unrecoverable reuse. External IDs become `(namespace, external_id_hash/reference)` bindings, never primary keys. Slugs and owner IDs are attributes/relationships, not identity.

Events: `CREATED`, `EXTERNAL_REFERENCE_ADDED`, `ALIAS_ADDED`, `DUPLICATE_SUSPECTED`, `DUPLICATE_CONFIRMED`, `MERGE_PROPOSED`, `MERGE_CONFIRMED`, `ARCHIVED`, `RESTORED`, `SPLIT`, `MERGE_REVERSED`, `TOMBSTONED`. A merge adds canonical redirection but preserves both IDs and every historical claim. Reversal appends another event. Historical Decisions keep the original ID plus resolution identity used at that time.

Recommended merge authority: two-step proposal plus independent moderation approval for confirmed duplicates; automated systems may only create candidates. High-risk reversal/split requires Product-approved identity moderation. No Production duplicate is changed in Slice 3A.

## Public contact and email

Website, phone and official social URLs can be public Spot contacts when their source and spot binding are explicit. Existing `spots.email` is ambiguous and must be excluded. Add a future explicit `contact.public_email` only after approval, with separate provenance and a guarantee that owner/account email is never copied into it. Contacts belong in World/presentation, but the Decision projection must continue excluding them from eligibility, ranking, trust and personalization.

## Authority matrix

- Anonymous: public sanitized resolution only.
- Authenticated user: public resolution and user reports; no direct fact mutation.
- Verified Owner: claims for own spot and allowed fields after server-side ownership proof; no verification/conflict/registry authority.
- Admin: scoped assertions, observations and source references; no automatic verification.
- Moderation/Verification: assigned evidence and accepted execution authority only.
- Research/Import: candidate claims in an allow-listed scope; never verification.
- Internal Resolver: ledger/policy read and derived writes only.
- Decision Consumer: policy-authorized sanitized projection only.
- Service Operations: rebuild/job control, not semantic approval.
- World Governance: release after separately accepted Product/CTO approval.

Owner Basic/Pro may alter available authoring actions, never Trust or ranking.

## RLS / ACL / function blueprint

Use a private schema for evidence payloads, resolver internals and privileged functions; expose only deliberately public projections. Every exposed table gets explicit grants plus RLS. `anon` and `authenticated` grants are reviewed separately from policies. `TO authenticated` is always paired with ownership/assignment predicates; user-editable metadata is never authority.

Future privileged functions must use a fixed `search_path`, explicit actor/authority checks, revoked `PUBLIC EXECUTE`, minimal role grants and bounded inputs. Prefer invoker functions. Exposed views require `security_invoker = true` on supported Postgres or must live outside exposed schemas with restricted grants. Service/secret keys remain server-only.

### Slice-3B security acceptance matrix

| Case | Expected |
|---|---|
| anon reads published sanitized projection | allow |
| anon reads claims, private sources or verification records | deny |
| authenticated user inserts a user report through scoped API | allow |
| authenticated user inserts/updates claim table directly | deny |
| Owner claims allowed key for owned spot | allow via server-side checked API |
| Owner claims another spot or changes actor/Trust | deny |
| Owner Pro attempts verification or registry release | deny |
| Admin asserts a fact/source | allow in assigned scope, remains assertion/reference |
| Admin self-issues accepted verification authority | deny |
| Verifier executes unassigned/expired/wrong process | deny |
| Resolver reads private evidence and writes immutable resolution | allow only internal role |
| Decision reads private source or contact | deny; sanitized projection only |
| `user_metadata` claims ownership/admin | deny |
| SECURITY DEFINER is executable by PUBLIC | test failure |
| view lacks invoker safety or restricted grants | test failure |

## Current repository-vs-live truth boundary

Repository inspection confirms declared migrations, not effective live ACL/RLS ownership. Current Supabase documentation (checked 2026-09-10) confirms that grants and RLS are separate, views can bypass underlying RLS by default, service/secret roles bypass RLS, and exposed-schema tables require explicit protection. The 2026 security/default changes reinforce opt-in exposure; Slice 3B must recertify against the then-current docs and the actual target environment before applying a migration.

Official references checked for this blueprint:

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [2026 Data API default-grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [2026 anon OpenAPI exposure change](https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key)
