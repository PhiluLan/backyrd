# World Knowledge Slice 3B

Slice 3B turns the accepted Slice 1–3A contracts into an append-only, locally proven persistence and authority foundation. It does not activate a client, Decision runtime, production resolver, backfill, cron, notification, deployment, or OTA path.

## Accepted identities

- Base: current canonical Main used for the final implementation (`219b5cd268c55cf06252cc0a71db387e476428c9` after the required rebase).
- Registry: `backyrd.world-knowledge.registry@1.1`, SHA-256 `e51e78f929d8d11ca149a50eaba250cf484e916ef38f2d447d3c8d881bb203be`.
- Source policy: `backyrd.world-knowledge.source-policy@3b.1`, SHA-256 `029582851b57914ce8f360e27dd7d6697fa6144cdf1febcf38d866290f4da95b`.
- Entitlement policy: `backyrd.world-knowledge.entitlement-policy@3b.1`, SHA-256 `ba8032f09eafc0ac561f0fdab112b457aca84bf69c94c85c4ad34396c7649575`.

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

The resolver accepts only locally synthetic `TEST`/`FIXTURE` spots or explicitly allowlisted non-production spots. It joins claims to accepted per-attribute Source Policy and valid Verification Records. Full and incremental modes share one deterministic implementation and converge on the same manifest/hash for the same inputs. The rebuildable current pointer is not a source of truth.

World snapshots may contain deliberate public contact data. The Decision candidate projection always removes all `contact.*` values and explanation-only descriptions. Subscription, payment, Owner tier, private sources, actor IDs, private payloads, user intents, ranking weights, and subjective fits have no projection path.

## Temporal behavior

- Durable facts remain until an additive correction, revocation/conflict, or explicit validity end.
- Current state requires `valid_until`.
- Regular venue hours, special-date hours, kitchen/service hours, and current/area state use separate keys.
- A confirmation records `confirmed_at` and `confirmation_due_at` without rewriting the fact.
- The three-month confirmation request is operational metadata, not a TTL and not a loss of truth.
- Holiday reminders bind calendar version, country, region, holiday key/date, and an exact seven-day request point. No calendar or sender is activated.

## Identity and legacy

`public.spots.id` remains the World subject identifier. Provider IDs are namespaced references. Duplicate candidates never merge automatically. Merge/split/reversal/archive/restore are append-only identity events; mutating identity events require server-authorized Admin action and an accepted approval reference. No legacy values or Production spots are migrated in this slice.

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
- complete taxonomy, subjective moods, public spot page, and final duplicate authority;
- Legal/CTO retention durations and actor-deletion implementation.
