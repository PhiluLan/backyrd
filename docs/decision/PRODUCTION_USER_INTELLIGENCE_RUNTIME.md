# Production User Intelligence Runtime — Sprint 2 status

Sprint 2 adds the additive, disabled-by-default server-side runtime boundary:

`N2 Memory → qualified evidence chain → derived node → immutable change ledger → hashed user-card snapshot`.

It uses the existing `verified_visit` provenance from Sprint 1 to locate a photo-bound `smart_review_v1`. Review qualification is deterministic and evidence-bound. A review without an explicit deterministic sentiment remains `UNKNOWN`; moods without a known positive/negative review outcome create no direct semantic claim. Open, save, route, reservation and visit do not become satisfaction.

The worker is service-only, transactional per work item, idempotent, retryable, consent-aware and disabled by default. Derived rows are isolated with RLS; clients cannot write evidence, affinity, confidence, HIGH status, ledger or snapshots.

## Hard sprint boundary

The current Product path does not yet populate a canonical N4 concept projection for real spots. N5.7 comparative inference needs N4 concept presence and confidence in order to distinguish concept-present from concept-absent outcome histories. Reusing missing/unknown concepts would violate the frozen contract. The runtime therefore retains these cases as UNKNOWN rather than fabricating comparative learning.

Consequently, this change is an implementation scaffold and direct-semantic runtime proof, **not** a complete N5.7/N5.8/N5.8.2/N5.8.4 production port. Lab/Product semantic parity is intentionally not claimed. A production N4 read adapter (not an N4 materializer) or an explicitly authorized scope change is required before Sprint 2 can pass.
