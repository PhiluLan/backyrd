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

## Sprint 2.1 dependency completion

Sprint 2.1 adds the required canonical, service-only N4 read adapter and
connects active N4 concept evidence to the comparative runtime. The bounded
adapter/golden fixture and the complete existing Sprint-1/2 database suites
are recorded in `SPRINT_2_1_VALIDATION.md`. No Decision behavior, N5
projection, or N6 path is enabled.
