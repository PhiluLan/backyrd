# Sprint 2 Validation

Local database validation proves:

- a qualified Smart Review becomes an N2-backed evidence chain;
- explicit positive/negative review text and outcome-qualified moods create bounded direct semantic claims;
- unknown review outcome does not create a mood-only claim;
- direct evidence is deduplicated by journey;
- repeat full rebuilds produce the same snapshot hash;
- change ledger rows exist;
- consent withdrawal erases chains and snapshots;
- authenticated clients cannot run the worker or read raw evidence.

## Acceptance disposition

The direct-semantic path passes its local contract tests. Sprint 2 as a whole remains **FAIL / blocked**: the required N5.7 comparative path and Lab/Product golden parity cannot be honestly asserted while canonical N4 concept evidence is unavailable to the Product runtime. No Decision behavior, N5 projection or N6 path is enabled.
