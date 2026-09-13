# Phase 3C Privacy and Observability

## Data inventory

| Data | Purpose | Persistence | Report/UI |
|---|---|---|---|
| German task text | local interpretation | memory only | editor only; absent from result/report |
| Device-location state and city fixture | location comparison | memory only | state/authorized city, never raw coordinates |
| Corrected interpretation | current evaluation | memory only | visible locally and hash-bound |
| RelevantUserProjection | minimized optional context | memory only | hash, active/neutral state and reason only |
| World snapshot | candidate evidence | memory only | spot/snapshot hashes and safe fixture label |
| Result/oracle/report hashes | replay and audit | local stdout/UI | allowed |
| Alternative/reject | current Decision behavior | memory only | flags and scoped candidate IDs; no User write |

Prohibited: real users, raw review/search history, precise coordinates, companion identities, secrets, private URLs, payment, subscription, Owner and advertising data.

## Future shadow-mode guidance

Not implemented. If separately authorized, permitted diagnostic fields should be pseudonymous Decision/session identities, contract/version hashes, counts, reason codes, limitation states and bounded timings. Raw task text, full projections, raw locations, social data and private evidence must not be stored. Retention remains `NOT_CONFIGURED` and requires Privacy/Product approval.

## Observability

The CLI emits deterministic release/report identities and aggregate pass/fail counts. Non-semantic runtime duration may be measured by CI but is excluded from Decision identity. The loopback UI has no telemetry, cookies, storage, external scripts or provider calls.
