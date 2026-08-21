# Production N4 read adapter

Sprint 2.1 adds `backyrd_read_n4_for_user_intelligence_v1(spot_ids)`.
It is a service-only, read-only boundary between active canonical N4
evidence and the production User-Intelligence runtime.

For each requested spot it returns only the bounded comparative-learning
input: canonical concept key, positive presence value, signal confidence,
minimal evidence provenance, canonical place type when a global snapshot
has one, and snapshot fingerprint/watermark when present. The adapter
reads active N4 `INTERPRETATION` evidence with confidence at least 0.35.

It does not read legacy spot-intelligence paths, owner entitlement, billing,
subscription state, ranking fields, or raw owner claims. An owner-provided
claim can appear only when it has already become active canonical N4
evidence under the N4 qualification contract.

Missing, stale, malformed, or non-positive N4 concept evidence is returned
as `available = false` with an empty concept list. The runtime therefore
does not invent comparative concept evidence. Experience and eligible direct
semantic evidence remain independently usable.

The adapter has no client grant and cannot mutate N4. It is intentionally
not a materializer, backfill mechanism, or N4 source of truth.
