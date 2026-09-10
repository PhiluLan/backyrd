# World Knowledge Slice 3B

Slice 3B turns the accepted Slice 1–3A contracts into an append-only, locally proven persistence and authority foundation. It does not activate a client, Decision runtime, production resolver, backfill, cron, notification, deployment, or OTA path.

## Accepted identities

- Base: current canonical Main used for the final closure (`5ddd15eaf75ceb8448dbf59667c14ffb2ffdac0e` after the required rebase).
- Registry: `backyrd.world-knowledge.registry@1.1`, SHA-256 `e51e78f929d8d11ca149a50eaba250cf484e916ef38f2d447d3c8d881bb203be`.
- Source policy: `backyrd.world-knowledge.source-policy@3b.1`, SHA-256 `029582851b57914ce8f360e27dd7d6697fa6144cdf1febcf38d866290f4da95b`.
- Entitlement policy: `backyrd.world-knowledge.entitlement-policy@3b.1`, SHA-256 `ba8032f09eafc0ac561f0fdab112b457aca84bf69c94c85c4ad34396c7649575`.

The rebase also aligns Decision's synthetic integration harness with Main's privacy-neutral User projection binding. Neutral projections use the canonical unlinkable neutral subject hash; active projections remain bound to the authenticated subject. This is a compatibility correction only and does not activate World Knowledge in Decision runtime.

Registry 1.0 remains immutable and independently valid. Registry 1.1 adds `contact.public_email`, `operation.price_level`, `accessibility.elevator`, and `accessibility.accessible_indoor`. It does not reinterpret `operation.price_range`.

## Authority and trust

Owner and Admin writes enter through narrow `SECURITY DEFINER` functions. Each function re-derives the authenticated actor, ownership/Admin authority, spot, accepted versions, entitlement scope, attribute definition, typed value, validity, and supersession link. No client parameter can set actor identity, authority, source type, trust, verification method, tier, or policy identity.

An accepted write creates, in one transaction:

1. a private source reference;
2. an append-only claim;
3. an append-only verification record bound to the claim hash and server-derived method;
4. when necessary, a content-safety or authority-conflict work item.

`OWNER_CONFIRMED` and `ADMIN_CONFIRMED` are verification methods. `VERIFIED` is the resulting qualitative trust only because the server proved the relevant relationship, entitlement, and payload. A public report creates a review item and never changes a claim.

## Persistence and resolution

The `world_knowledge_private` schema holds registry/policy releases, normalized source and entitlement rules, source references, actor bindings, claims, verification and confirmation records, identity events, review events, immutable resolution manifests, entries, projection pointers, allowlists, and rebuild jobs. Ledger tables reject update and delete. Corrections and confirmations are additive.

The resolver accepts only locally synthetic `TEST`/`FIXTURE` spots or explicitly allowlisted non-production spots. It joins claims to accepted per-attribute Source Policy and valid Verification Records. Full and incremental modes share one deterministic implementation. Input identity (`input_hash`), resolved output identity (`resolution_hash`) and audit-manifest identity (`manifest_hash`) are distinct. The input binds Spot and `as_of`; every in-scope Claim ID/hash and Verification Record ID/hash; Registry version, content hash and release hash; Source Policy release hash plus a deterministic hash of the exact attribute-policy rows; resolver contract/version; and explicit conflict, freshness and shadow/exclusion policy references. Excluded, future or expired claims therefore change input and manifest identity without falsely changing current World truth.

Every rebuild request persists Spot, mode, `as_of`, full input identity, accepted versions, resolver identity and a stable request hash under a transactionally serialized idempotency key. The replay path checks the stored request before reading current ledger state. It validates and returns the original manifest, snapshot, Decision projection and materialized entries even when later Claims or Verifications exist; it never substitutes a newly computed payload or moves the current pointer. Changed stable request properties under the same key fail before projection effects. Manifest validation independently recomputes input, output, manifest and entry hashes and rejects missing, additional or altered entries even if an outer hash was also recomputed.

Manifest creation has a second advisory lock scoped to Spot, accepted Registry/Policy/Resolver identities and the complete semantic input hash. Concurrent requests with different idempotency keys therefore converge on one canonical manifest while retaining two successful audit jobs. Unrelated Spots and different semantic inputs are not globally serialized. The executable two-process harness covers same-key replay, cross-key manifest convergence and different-time pointer ordering.

The synchronous Slice-3B call persists `RUNNING` and `SUCCEEDED` in the successful transaction. Any exception rolls back the new job, partial manifest, entries and pointer together, so it cannot leave a half-visible result. Pre-existing `PENDING`, `RUNNING` or `FAILED` records fail deterministically and are never silently recomputed. Durable failure recording, leases, takeover and background-worker retry remain deferred operational semantics; a failed key is not reusable in this slice.

The rebuildable current pointer is not a source of truth. It advances under a Spot-scoped transaction lock only when `as_of` is newer, or when the same `as_of` has a later bound ledger cutoff. Older rebuilds can produce historical manifests but cannot roll the pointer backwards. Registry, Source Policy or resolver version transitions remain fail-closed until an explicit cross-version ordering policy exists.

World snapshots may contain deliberate public contact data. The Decision candidate projection always removes all `contact.*` values and explanation-only descriptions. Subscription, payment, Owner tier, private sources, actor IDs, private payloads, user intents, ranking weights, and subjective fits have no projection path.

User-report idempotency and audit hashes bind only the opaque Actor Binding ID, Spot, attribute, report body and request identity. They never derive a durable digest from `auth.uid()` or a known account UUID. Account detachment leaves the event and factual history verifiable while removing the Auth link; it remains pseudonymized, not automatically anonymous.

## Temporal behavior

- Durable facts remain until an additive correction, revocation/conflict, or explicit validity end.
- Current state requires `valid_until`.
- Regular venue hours, special-date hours, kitchen/service hours, and current/area state use separate keys.
- A confirmation records `confirmed_at` and `confirmation_due_at` without rewriting the fact.
- The three-month confirmation request is operational metadata, not a TTL and not a loss of truth.
- Holiday reminders bind calendar version, country, region, holiday key/date, and an exact seven-day request point. No calendar or sender is activated.

## Identity and legacy

`public.spots.id` remains the World subject identifier. Provider IDs are namespaced references. Duplicate detection may write only `DUPLICATE_SUSPECTED` or `MERGE_PROPOSED`; both preserve both Spot identities and change no claims. `MERGE_CONFIRMED`, `SPLIT`, `MERGE_REVERSED` and every other identity-changing operation fail with `IDENTITY_OPERATION_AUTHORITY_NOT_CONFIGURED`. A Registry/Slice approval has no identity-operation authority. Final event-specific, direction-bound and single-use Duplicate authority is intentionally deferred. No legacy values or Production spots are migrated in this slice.

The Slice 2 adapter remains conservative: only explicit direct/normalized mappings can emit candidate claims; ambiguous, subjective, missing-provenance, prohibited, and no-target data do not become verified World truth.

## Production truth boundary

The migration is code only until a separately authorized release. The local proof used synthetic transaction-scoped fixtures. It did not query or mutate Production. The public projection table intentionally has no `anon` or `authenticated` grants/policies, and no application consumes it.

## Deferred

- Production rollout/backfill and real traffic;
- Owner/Admin UI and subscription billing;
- final source hierarchy, independent verification processes, conflict priority and TTL durations;
- notification/cron operation and holiday calendars;
- human content-safety operations and SLA commitments;
- Capability→Intent mappings, hard-constraint policy, ranking and Decision runtime integration;
- complete taxonomy, subjective moods, public spot page, and final event-specific duplicate authority;
- Legal/CTO retention durations, anonymization criteria, and operational account-deletion policy.
