# User Intelligence Worker Operations

The feature flag `backyrd_user_intelligence_runtime_settings_v1.enabled` defaults to false. The worker `backyrd_process_user_intelligence_work_v1(limit)` is service-only and processes only `verified_visit` N2 events. It records `PENDING`, `PROCESSING`, `COMMITTED`, `RETRYABLE` and `FAILED` work state.

Each work item runs qualification, rebuild, node replacement, ledger write and snapshot write in one database transaction. A crash therefore commits none of those derived artifacts. Consent withdrawal deletes queued work, chains, nodes and snapshots; existing N2 consent deletion remains authoritative.

No operational log stores review text, mood labels, or photo URLs. Inspect source identities and hashes only.
