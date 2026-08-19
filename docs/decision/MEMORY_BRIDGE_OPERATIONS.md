# Memory Bridge Operations

The worker is service-only: `backyrd_memory_bridge_process_v1(limit)` processes 1–200 ready rows. A scheduler/server job should call it in bounded batches and alert on `FAILED`, `INVALID`, retry age and source-to-N2 lag via `backyrd_memory_bridge_metrics_v1()`.

Operational states:

- `PENDING`: accepted source waiting for delivery.
- `PROCESSING`: locked by a worker; stale locks are recovered after five minutes.
- `RETRYABLE`: technical delivery failure with bounded exponential backoff.
- `COMMITTED`: N2 returned its immutable event ID/hash; never process again.
- `INVALID`: source/N2 contract conflict; inspect source identity, do not silently repair.
- `FAILED`: retry budget exhausted; manual, source-aware investigation required.

Do not backfill historical production data in this sprint. Enable the feature flag only for staging/synthetic users first. On consent withdrawal or account deletion, do not retry old source rows.
