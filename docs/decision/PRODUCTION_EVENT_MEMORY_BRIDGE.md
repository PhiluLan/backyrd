# Production Event → N2 Memory Bridge

Sprint 1 adds an additive, disabled-by-default bridge from real Product facts to the existing immutable N2 ledger. It does not calculate User Intelligence and does not change any visible Decision result.

`Product source row → transactional outbox → service-only processor → backyrd_ingest_memory_event_v1 → immutable N2 Memory Event`

The outbox is the delivery proof. Each row has a stable source identity, semantic version, state (`PENDING`, `PROCESSING`, `RETRYABLE`, `COMMITTED`, `FAILED`, `INVALID`), attempt count and canonical event hash. The processor claims rows with `FOR UPDATE SKIP LOCKED`, reclaims stale processing rows, retries bounded technical failures, and never replays committed rows.

The bridge is gated by `backyrd_memory_bridge_settings_v1.enabled` and defaults to `false`. A service-only operation enables it only after staging approval. Disabling it prevents new queueing; it does not alter current Product behavior.

Product opens and navigation use the authenticated RPC `backyrd_record_memory_product_action_v1`. It accepts only the actor's own spot and (when supplied) own Decision ID, uses a client UUID as the idempotency identity, and writes a minimal source record. This is deliberately separate from optional analytics: a user who declines analytics must not lose personalization-consented Memory capture.

No source payload includes raw review text, mood labels, photo URLs, tokens, or secrets. Decision/review linkage remains provenance only, never causal proof.

## Smart Review

Only a source review explicitly tagged `smart_review_v1`, with a user-owned `review_photos` binding, emits `verified_visit`. This is the existing qualified Smart Review experience contract. It emits no satisfaction, positive taste, negative taste, or semantic-concept event. Moods and text remain source facts for a later, separately authorized N5.8 runtime.

## Lifecycle

Queueing requires active `personalized_recommendations` consent. On consent withdrawal, pending outbox rows are deleted before they can be ingested; account deletion cascades source rows. The N2 withdrawal trigger continues to erase existing N2 memory. A withdrawn user therefore cannot be resurrected by a retry.

All bridge tables use RLS default deny. Raw source records and outbox rows are service-only; the only client API is the narrow authenticated action RPC.
