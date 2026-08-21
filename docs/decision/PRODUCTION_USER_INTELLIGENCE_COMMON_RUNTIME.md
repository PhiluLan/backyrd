# Common User Intelligence runtime

`@backyrd/user-intelligence-runtime` is the single server-side entry point
for frozen N5.7, N5.8, N5.8.2 and N5.8.4 semantics. It deliberately exports
the frozen Lab implementations directly: production must execute the same
algorithm, not a SQL approximation.

The production worker boundary remains responsible only for:

1. reading authorized N2 memory and canonical N4 input;
2. serializing it into the frozen canonical event input;
3. invoking the common runtime;
4. atomically persisting its card, ledger, and snapshot.

It must not compute affinity, confidence, eligibility, fusion, or negative
promotion itself. N4 remains read-only and unavailable N4 remains UNKNOWN.

The package is server-only. It has no mobile export or N6 integration. The
shared JS queue runner is now the sole authoritative background learning
path; the former SQL inference/rebuild functions are guarded against
activation. The feature flag remains off by default.
