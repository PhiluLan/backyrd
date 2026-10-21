# Canonical Database Map

This map describes how Backyrd's database works today. Migration history explains how the system arrived here; this document identifies current truth ownership, primary writers, and primary readers. The machine-readable object-level inventory is `docs/operations/DATABASE_OBJECT_INVENTORY_V1.json`.

Supabase PostgreSQL owns shared product state and cross-client invariants. `auth` and `storage` are provider-managed schemas. Backyrd-owned application truth lives in `public`; `decision_lab` is an internal, disposable evaluation schema with a current repository writer and no Product client exposure.

| System area | Canonical truth | Primary writers | Primary readers / contracts |
| --- | --- | --- | --- |
| Auth / Identity | `auth.users`, `profiles`, consent/privacy and account lifecycle tables | Supabase Auth hooks; authenticated profile/privacy RPCs; service-only deletion workflow | Mobile/Web profile flows; Owner/Admin authorization helpers |
| Spots | `spots`, `spot_descriptions`, `spot_hours`, `spot_photos`, `spot_taxonomies` | Admin/Owner spot RPCs; bounded ingestion and enrichment services | `spot_effective_content_v1`, public Spot-detail/search RPCs, Mobile/Web discovery |
| Gold / Spot Intelligence | `backyrd_spot_sources_v1`, `backyrd_spot_fact_proposals_v1`, `backyrd_spot_accepted_facts_v1`, intelligence evidence/snapshots, research jobs/passes | service-only research, machine-acceptance and human authoring RPCs | Decision retrieval, Admin readiness/operations, `backyrd_basel_gold_readiness_v1` |
| Offering / Purpose | canonical Offering/Purpose facts, human Spot profiles/archetypes, taxonomy registry | Human Spot editor and reviewed Gold authoring RPCs | Decision retrieval, Spot presentation, `spot_taxonomy_effective_v1`, `taxonomy_catalog_v1` |
| Mood | `spot_mood_concepts`, `spot_moods`, `spot_moods_agg`, retained `_mood_token_merge_map` history | review/mood aggregation paths; Mood V1 only after its separate release | `mood_match`, `spot_moods_agg_reviews_v1`, Decision and discovery surfaces |
| Reviews | `reviews`, `review_photos`, `review_comments`, `review_likes` | authenticated review/comment/like paths plus safety gates | Social/Moment surfaces, Decision evidence, Trust and Admin analytics |
| Moments / Social | `social_posts`, media/follow/friend/message tables | authenticated social RPCs and review-to-Moment triggers | Social feed/profile RPCs, Mobile/Web, safety distribution filters |
| User Intelligence / N2 / Taste | memory events/evidence, Taste evidence/maps, snapshots/latest/ledger/work queues | consent-gated memory bridge and service-only User Intelligence workers | Decision personalization and user-owned Taste/memory read RPCs |
| Decision / N3–N6 | decision sessions/impressions/actions, deterministic/input traces, continuations, candidate evidence, N6 shadow work | canonical Decision RPCs and server-only workers | Decision runtime, Admin diagnostics, learning bridge; `decision_lab` only for isolated evaluation |
| Trust / Integrity | account/distribution trust signals, states, history, overrides, governance audit | deterministic detectors, reviewed Admin interventions, service workers | Decision/social eligibility filters and authorized Admin views |
| Safety | safety cases/content/signals/evaluation/enforcement/appeal tables | safety evaluation workers and human moderation RPCs | distribution gates, Owner notices, Admin case management |
| Owner | Spot claims, ownership changes, Owner intelligence entitlements | Owner claim flows and authorized Admin review RPCs | Owner Web and Admin moderation |
| Admin | Admin authorization, operational views/RPCs, founder control state | authenticated Admin RPCs with explicit authorization | Admin Dashboard only |
| Operations | analytics, rate limits, queues/outboxes, runtime settings, cron-backed controls | server/Edge workers and bounded service-only RPCs | operations checks, workers and Admin diagnostics |

## Truth boundaries

- Hard eligibility, authorization, moderation, integrity, and cross-client write invariants remain in PostgreSQL/RPCs. Client code does not coordinate privileged multi-step writes.
- Gold accepted facts, Decision history, Trust/Safety audit state, Owner history, User Learning history, Reviews, Moments, and real Spots are retained. Database Consolidation v1 does not rewrite or delete them.
- Views are read contracts, not competing stores of truth. Materialized views are not currently used.
- Versioned older RPCs remain compatibility-bound unless an object-level `DEAD_PROVEN` proof exists. An old-looking name is not deletion evidence.
- `_mood_token_merge_map` is `LEGACY_REQUIRED`: its eight historical token mappings have no current runtime consumer, but are retained as product-lineage evidence.
- `audit` inventory tables and the `drizzle` ledger were technical artifacts, not Product/audit history. Their dependency proofs and removal are recorded in the consolidation report.

## Canonical verification

`scripts/ci/application-schema-fingerprint.sql` hashes 10,245 semantic structural and security facts across Backyrd-owned schemas. Physical column-number holes and function line endings are normalized; six exact historical comment-only deltas are certified explicitly. Executable definitions, column contracts and all security facts remain covered. `scripts/ci/public-acl-fingerprint.sql` independently certifies effective Public API grants. Both clean bootstrap and Production must equal the committed fingerprints.

The additional `delivery/database-scopes/booking-private-v1.json` attestation covers the private Booking catalog and permissions, including executable helpers, immutable message guards and operation journals. It is verified by the canonical clean-boot gate without changing the historical default `public`/`decision_lab` fingerprints. It does not hash guest rows or establish restore success. See [private Booking drift](../operations/BOOKING_PRIVATE_DRIFT.md).

The dependent Booking reservation-search candidate adds an authenticated restaurant-scoped read RPC and snapshot capability, without new tables or direct guest-data grants. It reuses current team/Safety authorization and bounded Zurich date ranges. See [reservation search](../operations/BOOKING_RESERVATION_SEARCH.md).

The dependent guest-card candidate adds three RLS-protected private tables for
restaurant/Owner-scoped contact cards, minimal mutation receipts and change
metadata. Authenticated RPCs enforce current team/Safety boundaries; there are
no direct client/service-role table grants. It adds no automatic reservation
identity linkage. See [guest cards](../operations/BOOKING_GUEST_CARDS.md).

The subsequent guest-history candidate adds private `reservation_guests_v1`,
`reservation_guest_requests_v1` and `reservation_guest_events_v1`. These store
explicit, reversible staff associations with independent revisions and minimal
original-operation/change metadata. An actor-bound v3 wrapper retains the
canonical v2 allocator and commits booking plus optional association atomically;
older clients retain their contracts. All direct client/worker table grants are
revoked. Current Owner/team/Safety checks, archive redaction and scoped paginated
reads apply; matching contact values never infer identity. See
[guest cards and reservation history](../operations/BOOKING_GUEST_CARDS.md).
